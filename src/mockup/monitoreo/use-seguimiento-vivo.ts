// Simulación del refresco en vivo del viaje.
//
// ── CONTRATO REAL QUE ESTE HOOK REEMPLAZA ────────────────────────────────────────────────────
// El patrón es SNAPSHOT + DELTAS. Nunca se reenvía la flota entera:
//
// El recurso es la ORDEN aunque la clave del tracking sea el VIAJE: la orden es lo que el planificador
// navega y busca en la tabla, el viaje es lo que físicamente tiene una posición. `transport_order.trip_id`
// ya viene en la fila que trae Postgres, así que el puente entre los dos no cuesta una consulta extra.
//
//   1. SNAPSHOT — al abrir la pantalla, UNA vez:
//        GET /monitoring/orders/{transportOrderId}
//      Devuelve el viaje completo: recorrido, paradas, estados y última posición conocida.
//
//   2. DELTAS — conexión SSE mientras la pantalla está abierta:
//        GET /monitoring/orders/{transportOrderId}/stream        (Accept: text/event-stream)
//      Cada evento trae SOLO lo que cambió, identificado por su id:
//        · tracking          → { tripId, latitude, longitude, trackedAt, battery }
//        · delivery_started  → { deliveryOrderId, arrivedAt }        (botón "Iniciar entrega")
//        · delivery_closed   → { deliveryOrderId, status, deliveredAt, resultCode }  ("Finalizar")
//      El cliente PARCHEA por id contra su estado local. Las entregas que no cambiaron ni se tocan.
//      El vocabulario de eventos NO es el mismo que el del stream de flota: la tabla de las dos
//      granularidades está en `use-flota-viva.ts`, en un solo lugar para que no vuelvan a divergir.
//
//   3. RECONEXIÓN — EventSource reconecta solo, pero durante el corte se pierden eventos. La
//      estrategia elegida es RE-PEDIR EL SNAPSHOT, no reproducir con Last-Event-ID: un monitor
//      necesita el estado de AHORA, no el historial de lo que pasó mientras nadie miraba.
//
// El listado (MonitoreoView) también va por SSE — `GET /monitoring/stream?distributorId={id}`. La
// diferencia con esta pantalla es de GRANULARIDAD, no de mecanismo: el listado AGRUPA los pings de GPS
// en una ventana de ~30 s porque en una tabla un ping solo mueve "última señal", y reenviar 3,3
// eventos/s la haría parpadear para no decir nada nuevo. Los cambios de estado (progreso, incidencias)
// pasan al instante. Esos ~30 s son la ventana de agrupación del servidor, NO un intervalo de polling.
// El detalle no agrupa: acá se quiere el ping a ping para que el pin se mueva.
//
// El listado tiene su propio hook (`use-flota-viva.ts`), con la agrupación de ~30 s ya aplicada.
//
// ── LO QUE ESTE HOOK ESCRIBE, Y POR QUÉ ESO IMPORTA ──────────────────────────────────────────
// El avance NO es mover una tupla `[lat, lng]` en memoria. Cada tick ESCRIBE UN PING con `escribirPing`
// —los dos ítems de `truck_tracking`, igual que `POST /monitoring/tracks`— y la pantalla consume el ítem
// ACTUAL que ese write devuelve. Consecuencias que la forma vieja no tenía:
//   · la TRAZA crece de verdad, así que `queryTraza` devuelve el recorrido real y no una lista vacía;
//   · `trackedAt` y `receivedAt` existen y se separan, que es lo único que distingue "el GPS no fija"
//     de "el celular buferea sin cobertura";
//   · "última señal" se DERIVA del ítem, así que no puede quedar clavada en un número viejo.
//
// Efecto lateral asumido: un viaje que el dataset dejó SIN SEÑAL empieza a reportar en cuanto se abre su
// detalle. Es coherente y no un bug — un evento `tracking` ES evidencia de que el equipo reporta. La
// alternativa (congelar el pin) dejaría la pantalla de seguimiento muerta justo en el caso que más se
// mira.
//
// ── POR QUÉ EL HOOK DEVUELVE LAS ENTREGAS YA MUTADAS ─────────────────────────────────────────
// Para que la vista consuma UNA sola fuente ("el estado actual del viaje") en vez de un snapshot más
// una pila de flags sueltos. El día que exista backend se reemplaza el `setInterval` por el fetch y
// el EventSource, y no se toca ni un componente.
//
// Nota de rendimiento para cuando esto sea real: el merge tiene que ser POR ENTREGA e inmutable
// (`{ ...prev, [id]: {...} }`), conservando la identidad referencial de las que no cambiaron. Si se
// reconstruye la colección entera, cada ping re-renderiza la lista completa.
//
// ── LA POSICIÓN SE INTERPOLA EN EL CLIENTE ───────────────────────────────────────────────────
// La frecuencia del ping (10-15 s en producción) y la fluidez del mapa son problemas distintos: el
// pin se anima acá, no se pide más seguido. Ver la nota de tracking en UltimaVersion.sql — la
// telemetría NO vive en Postgres, vive en DynamoDB.
import { useEffect, useMemo, useState } from 'react'
import type { LatLngTuple } from '../map/geo/polyline'
import {
  MOTIVOS_DEVOLUCION,
  MOTIVOS_FALLO,
  construirCobro,
  construirComprobante,
  horaEntregaPlanificada,
  horaLlegadaPlanificada,
  repartirItems,
  type ComprobanteEntrega,
  type EntregaMonitoreo,
  type ViajeMonitoreo,
} from './monitoreo-data'
import type { EstadoEntrega } from './monitoreo-estado'
import {
  DISTRIBUIDOR_ACTIVO,
  escribirPing,
  snapshotDetalle,
  type ItemActual,
} from './tracking-dynamo'

/** Cada cuánto avanza la simulación. Es el stand-in de la cadencia de eventos del SSE. */
const TICK_MS = 1200
/** Fracción del tramo que avanza por tick: ~11 ticks (13 s) entre parada y parada. */
const PASO = 0.09
/** Ticks que el camión se queda descargando antes de cerrar la parada. */
const TICKS_EN_SITIO = 3
/**
 * Cada cuántos pings el dispositivo pierde un punto de batería. No es realismo por gusto: la batería
 * viaja EN EL PING, así que si no se moviera nunca sería un valor congelado disfrazado de telemetría.
 */
const PINGS_POR_PUNTO_BATERIA = 25

type Overrides = Map<string, Partial<EntregaMonitoreo>>

const interpolar = (a: LatLngTuple, b: LatLngTuple, t: number): LatLngTuple => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
]

/**
 * Cómo cierra una parada. Derivado del id con un hash y NO con `Math.random`: el resultado tiene que
 * ser el mismo cada vez que la simulación pase por esa parada, o un re-render la haría cambiar de
 * "entregado" a "fallido" sola.
 */
function resultadoDe(id: string): EstadoEntrega {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  const r = h % 100
  if (r < 8) return 'fallido'
  if (r < 14) return 'devuelto'
  return 'entregado'
}

const motivoDe = (id: string, estado: EstadoEntrega): string => {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 17 + id.charCodeAt(i)) >>> 0
  if (estado === 'fallido') return MOTIVOS_FALLO[h % MOTIVOS_FALLO.length]
  if (estado === 'devuelto') return MOTIVOS_DEVOLUCION[h % MOTIVOS_DEVOLUCION.length]
  return ''
}

export interface SeguimientoVivo {
  /**
   * Último ítem ACTUAL del viaje — el ping crudo, no la posición ya derivada. `null` = el camión no
   * salió o ya volvió, o sea que no hay ítem.
   *
   * La vista deriva lo que muestra: `posicionDe(tracking)` para el pin, `tracking.battery` para la
   * batería y `minutosSinSenal(tracking.trackedAt, ahora)` para "última señal".
   */
  tracking: ItemActual | null
  /**
   * Cuándo llegó la última actualización, en ms. Es la frescura de LA PANTALLA, distinta de la señal de
   * UN camión (`now() - trackedAt`). Sin este dato, una conexión muerta se ve idéntica a una flota
   * detenida: todo quieto y sin ninguna pista de por qué.
   */
  actualizadoAt: number
  /** Paradas ya cerradas. Es el punto de corte del trazo recorrido vs pendiente. */
  cursor: number
  /** Las entregas del viaje con el avance en vivo aplicado. */
  entregas: EntregaMonitoreo[]
}

export function useSeguimientoVivo(
  viaje: ViajeMonitoreo | undefined,
  /** Entregas del viaje en orden de visita: `entregas[i]` es la parada de secuencia `i + 1`. */
  entregas: EntregaMonitoreo[],
): SeguimientoVivo {
  // El SNAPSHOT del detalle sale de la tabla, no de un campo del viaje: es la Query documentada
  // (`PK=TRIP#{tripId}`, `ScanIndexForward=false`, `Limit=1`). Leerlo de la tabla y no de
  // `viaje.tracking` importa porque la tabla es lo que la simulación va escribiendo: al volver a entrar
  // a la pantalla, el camión está donde quedó y no donde se sembró.
  const [avance, setAvance] = useState<{
    tracking: ItemActual | null
    cursor: number
    overrides: Overrides
    actualizadoAt: number
  }>(() => ({
    // Inicializador PEREZOSO: `snapshotDetalle` es una lectura de la tabla y solo hace falta en el
    // primer render. Sin la función, se ejecutaría en cada uno para descartar el resultado.
    tracking: viaje ? snapshotDetalle(DISTRIBUIDOR_ACTIVO, viaje.tripId) : null,
    cursor: viaje?.cursor ?? 0,
    overrides: new Map(),
    actualizadoAt: Date.now(),
  }))

  useEffect(() => {
    const inicial = viaje ? snapshotDetalle(DISTRIBUIDOR_ACTIVO, viaje.tripId) : null
    setAvance({
      tracking: inicial,
      cursor: viaje?.cursor ?? 0,
      overrides: new Map(),
      actualizadoAt: Date.now(),
    })
    if (!viaje || viaje.estado !== 'en_ruta') return

    let cursor = viaje.cursor
    let t = 0.55
    let ticksEnSitio = 0
    let pings = 0
    let battery = inicial?.battery ?? 100
    let tracking: ItemActual | null = inicial
    const overrides: Overrides = new Map()

    /** Estado efectivo de una entrega: lo que ya escribió la simulación, o el del dataset. */
    const vigente = (entrega: EntregaMonitoreo): EntregaMonitoreo => ({ ...entrega, ...overrides.get(entrega.id) })

    /**
     * Un evento `tracking`: escribe el ping (los DOS ítems) y se queda con el ACTUAL que devuelve.
     * `trackedAt` es el reloj del dispositivo AHORA; `receivedAt` lo pone el "servidor" adentro de
     * `escribirPing`, siempre después.
     */
    const pingear = (posicion: LatLngTuple) => {
      pings++
      if (pings % PINGS_POR_PUNTO_BATERIA === 0) battery = Math.max(1, battery - 1)
      tracking = escribirPing({
        tripId: viaje.tripId,
        distributorId: DISTRIBUIDOR_ACTIVO,
        employeeId: viaje.employeeId,
        latitude: posicion[0],
        longitude: posicion[1],
        battery,
        trackedAt: new Date().toISOString(),
      })
      return tracking
    }

    const publicar = (posicion: LatLngTuple | null) =>
      setAvance({
        tracking: posicion ? pingear(posicion) : tracking,
        cursor,
        overrides: new Map(overrides),
        actualizadoAt: Date.now(),
      })

    const id = setInterval(() => {
      const activa = entregas[cursor]
      // Sin más paradas el camión vuelve al depósito: la simulación terminó.
      if (!activa) {
        clearInterval(id)
        return
      }

      // `recorrido` es [depósito, ...paradas, depósito], así que el tramo hacia la parada `cursor`
      // va de `recorrido[cursor]` a `recorrido[cursor + 1]`.
      const desde = viaje.recorrido[cursor]
      const hasta = viaje.recorrido[cursor + 1]
      const actual = vigente(activa)

      // ── En camino ──
      if (ticksEnSitio === 0) {
        t = Math.min(1, t + PASO)

        if (t < 1) {
          // Solo se fuerza el paso a "en camino" desde pendiente: si el dataset ya la dejó en el
          // punto, hacerla retroceder a "en camino" sería mostrar el estado yendo para atrás.
          if (actual.estado === 'pendiente') {
            overrides.set(activa.id, {
              ...overrides.get(activa.id),
              estado: 'en_camino',
              historial: [...actual.historial, { estado: 'en_camino', hora: horaLlegadaPlanificada(viaje.salida, activa.secuencia) }],
            })
          }
          publicar(interpolar(desde, hasta, t))
          return
        }

        // ── Llegó al punto: es el botón "Iniciar entrega" de la app del chofer (arrived_at) ──
        ticksEnSitio = 1
        const llegada = horaLlegadaPlanificada(viaje.salida, activa.secuencia)
        overrides.set(activa.id, {
          ...overrides.get(activa.id),
          estado: 'en_sitio',
          llegadaAt: llegada,
          historial: [...actual.historial, { estado: 'en_sitio', hora: llegada }],
        })
        publicar(hasta)
        return
      }

      // ── Descargando ──
      if (ticksEnSitio < TICKS_EN_SITIO) {
        ticksEnSitio++
        publicar(hasta)
        return
      }

      // ── Cierra la parada: es el botón "Finalizar" (delivered_at + delivery_result_code) ──
      const estado = resultadoDe(activa.id)
      const motivo = motivoDe(activa.id, estado)
      const hora = horaEntregaPlanificada(viaje.salida, activa.secuencia)
      // Mismos constructores que el dataset (`construirComprobante`, `construirCobro`) y no una copia
      // local: una parada cerrada en vivo tiene que quedar indistinguible de las que ya venían cerradas.
      // Con dos implementaciones, la firma, el GPS o el recibo saldrían distintos según CUÁNDO cerró.
      const comprobante: ComprobanteEntrega | null =
        estado === 'entregado'
          ? construirComprobante({
              entregaId: activa.id,
              puntoEntregaId: activa.puntoEntregaId,
              canal: activa.canal,
              lat: activa.lat,
              lng: activa.lng,
              hora,
            })
          : null

      overrides.set(activa.id, {
        ...overrides.get(activa.id),
        estado,
        entregaAt: hora,
        motivo,
        receptor: comprobante?.receptor ?? '',
        comprobante,
        // El cobro se RECALCULA al cerrar: es lo que convierte "pendiente" en "cobrado" en la pestaña.
        cobro: construirCobro(activa.pedidos, activa.items, activa.id, estado, hora),
        // Misma regla que el generador del dataset: la cabecera y la pestaña Pedido no pueden
        // contradecirse.
        items: repartirItems(activa.items, estado),
        historial: [...vigente(activa).historial, { estado, hora, nota: motivo || undefined }],
      })

      cursor++
      ticksEnSitio = 0
      t = 0
      publicar(hasta)
    }, TICK_MS)

    return () => clearInterval(id)
  }, [viaje, entregas])

  const vivas = useMemo(
    () =>
      avance.overrides.size === 0
        ? entregas
        : entregas.map((entrega) => {
            const override = avance.overrides.get(entrega.id)
            return override ? { ...entrega, ...override } : entrega
          }),
    [entregas, avance.overrides],
  )

  return {
    tracking: avance.tracking,
    cursor: avance.cursor,
    actualizadoAt: avance.actualizadoAt,
    entregas: vivas,
  }
}
