// Transporte en vivo del LISTADO de monitoreo. Es el hueco que faltaba: `MonitoreoView` calculaba sus
// filas UNA vez a nivel de módulo, así que el progreso, las incidencias y la última señal quedaban
// congelados en la pantalla que existe justamente para mirarlos moverse.
//
// ── CONTRATO REAL QUE ESTE HOOK REEMPLAZA ────────────────────────────────────────────────────
//   1. SNAPSHOT — al abrir la pantalla, UNA vez:
//        GET /monitoring/orders?distributorId={id}
//      Postgres trae las órdenes despachadas con sus contadores y su `trip_id`; Dynamo trae la flota
//      entera con UNA sola Query (`PK = FLEET#{distributorId}`); el backend hace el merge por `tripId`.
//      Acá el merge se hace igual, y a mano, para que la costura se vea: `queryFlota` devuelve ítems con
//      `SK = TRIP#{tripId}` y hay que des-componer la clave (`tripIdDeSk`) para cruzarla con la orden.
//
//   2. DELTAS — UNA sola conexión SSE con scope de FLOTA (no 40, una por camión):
//        GET /monitoring/stream?distributorId={id}
//      El stream transporta los eventos de TODOS los camiones y el cliente parchea POR ID.
//
//   3. RECONEXIÓN — se RE-PIDE el snapshot, no se reproduce con `Last-Event-ID`: un monitor necesita el
//      estado de AHORA, no el historial de lo que pasó mientras nadie miraba.
//
// ── LAS DOS GRANULARIDADES, EN UN SOLO LUGAR ─────────────────────────────────────────────────
// Los dos streams llevan vocabularios DISTINTOS, y eso es deliberado, no una inconsistencia: cada
// pantalla necesita otra cosa. Estaba escrito en dos lados y ya había divergido (Secuencia.puml
// documentaba solo `order_progress` / `trip_status` para la flota y omitía el `tracking` agrupado),
// así que la tabla vive acá y los demás archivos apuntan a ella.
//
//   | Stream                        | Eventos                                        | Cadencia            |
//   |-------------------------------|------------------------------------------------|---------------------|
//   | Flota (`/monitoring/stream`)  | `tracking`                                     | AGRUPADO ~30 s      |
//   |                               | `order_progress`, `trip_status`                | al instante         |
//   | Detalle (`/orders/{id}/stream`)| `tracking`                                    | ping por ping       |
//   |                               | `delivery_started`, `delivery_closed`          | al instante         |
//
// POR QUÉ EL LISTADO AGRUPA Y EL DETALLE NO. En la tabla un ping solo mueve "última señal" — un texto
// que cambia de "hace 0 min" a "hace 0 min". Con 40 camiones reportando cada 10-15 s eso son ~3,3
// eventos por segundo, y la tabla entera parpadearía para no decir NADA nuevo. En el detalle es lo
// contrario: cada ping mueve el pin, que es lo único que la pantalla hace.
// Los ~30 s son la VENTANA DE AGRUPACIÓN DEL SERVIDOR, no un intervalo de polling del cliente: el dato
// no se pide más seguido, se entrega junto. Y los cambios de ESTADO no se agrupan nunca — que una
// entrega falle es información nueva y el planificador la tiene que ver cuando pasa.
//
// POR QUÉ `delivery_started` / `delivery_closed` NO están en el stream de flota: la tabla no muestra
// paradas, muestra el CONTADOR de la orden. Reenviar el detalle de cada entrega obligaría al listado a
// mantener las 20 entregas de cada una de las 40 órdenes para recalcular un "7 de 12". `order_progress`
// manda el contador ya resuelto; es el mismo hecho, agregado al nivel que la pantalla muestra.
import { useEffect, useState } from 'react'
import { createRand } from '../mock-random'
import type { LatLngTuple } from '../map/geo/polyline'
import {
  type EntregaMonitoreo,
  obtenerMonitoreoOperativo,
  resumenEntregas,
  tiemposConUnaMas,
  viajePorTripId,
  type ResumenEntregas,
} from './monitoreo-data'
import { useTransportOrdersStore } from '../transport-orders-store'
import type { OrdenTransporte } from '../mock-data'
import type { EstadoViaje } from './monitoreo-estado'
import {
  DISTRIBUIDOR_ACTIVO,
  borrarActual,
  escribirPing,
  queryFlota,
  tripIdDeSk,
  type ItemActual,
} from './tracking-dynamo'

// Semilla propia: qué entrega cierra a continuación no tiene que moverse cuando se toque el dataset.
const rand = createRand(50_505)

/**
 * Cada cuánto reporta cada camión. Es el intervalo documentado, y son ESCRITURAS: el ping entra a la
 * tabla igual que entraría por `POST /monitoring/tracks`.
 */
const PING_MS = 12_000

/**
 * Ventana de agrupación del stream de flota. Los pings se escriben a su cadencia real pero se ENTREGAN
 * a la pantalla agrupados, que es exactamente lo que hace el servidor.
 *
 * **El contrato dice ~30 s; acá van 8 s, y es una decisión de MOCKUP, no un cambio de contrato.** Con
 * 30 s, quien abre la pantalla para ver cómo se comporta se queda medio minuto mirando una tabla
 * quieta y concluye que no funciona. Lo que el mock tiene que probar es el MECANISMO —que el ping
 * llega agrupado y que la fila se parchea sola—, y eso se demuestra igual a 8 s.
 *
 * Es un solo número: subirlo a 30_000 devuelve la cadencia documentada sin tocar nada más.
 */
const COALESCENCIA_MS = 8_000

/**
 * Cada cuánto la simulación cierra una entrega en algún viaje. No pretende ser una cadencia real —
 * depende de 40 choferes— sino garantizar que la pantalla MUESTRE el caso: sin esto, el progreso y las
 * incidencias no se moverían nunca y no habría forma de ver que el parcheo por id funciona.
 */
const EVENTO_ESTADO_MS = 5_000

/** Fracción del tramo que el camión avanza por ping. */
const PASO = 0.06

/** Cada cuántos pings el dispositivo pierde un punto de batería. La batería viaja EN el ping. */
const PINGS_POR_PUNTO_BATERIA = 25

/** Fila del listado: la orden con su viaje y sus conteos ya resueltos. */
export interface FilaMonitoreo {
  /** transport_order.id */
  id: string
  codigo: string
  /** transport_order.trip_id — la clave con la que se cruza el ítem de Dynamo. */
  tripId: number
  camion: string
  chofer: string
  estadoViaje: EstadoViaje
  salida: string
  paradas: number
  /** Las paradas vivas del viaje. El detalle grande las vuelve a pedir por su propio canal. */
  entregas: EntregaMonitoreo[]
  resumen: ResumenEntregas
  /**
   * El ítem ACTUAL crudo de `truck_tracking`. La columna "Última señal" se DERIVA de su `trackedAt`;
   * guardar los minutos ya calculados es lo que hacía que el número no pudiera envejecer.
   */
  tracking: ItemActual | null
}

/** Una fila del monitoreo a nivel pedido comercial (sales order). */
export interface FilaPedidoMonitoreo {
  /** candidate_orders.id / pedido del plan. */
  id: string
  /** sales_order_id — el número con el que Ventas lo conoce. */
  pedido: string
  documento: string
  ordenId: string
  ordenCodigo: string
  tripId: number
  paradaId: string
  secuencia: number
  cliente: string
  puntoEntrega: string
  camion: string
  chofer: string
  estadoViaje: EstadoViaje
  estadoEntrega: EntregaMonitoreo['estado']
  canal: string
  formaPago: string
  pesoKg: number
  volumenM3: number
  total: number
  pedidosEnParada: number
  incidencias: number
  tracking: ItemActual | null
}

const interpolar = (a: LatLngTuple, b: LatLngTuple, t: number): LatLngTuple => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
]

/**
 * El SNAPSHOT: Postgres (las órdenes con sus contadores) + UNA Query a Dynamo (la flota) + merge por
 * `tripId`.
 *
 * El merge se hace con un índice por `tripId` y no buscando en el array por cada orden: es la misma
 * razón por la que el ítem ACTUAL existe — una Query, un recorrido, y no N búsquedas.
 */
function snapshotFlota(distributorId: number, transportOrders: OrdenTransporte[]): FilaMonitoreo[] {
  const porTripId = new Map<number, ItemActual>()
  for (const item of queryFlota(distributorId)) {
    const tripId = tripIdDeSk(item.sk)
    if (tripId !== null) porTripId.set(tripId, item)
  }

  const monitoring = obtenerMonitoreoOperativo(transportOrders)
  const viajesPorId = new Map(monitoring.viajes.map((viaje) => [viaje.tripId, viaje]))
  return monitoring.ordenes.map((orden) => {
    const viaje = viajesPorId.get(orden.tripId)
    return {
      id: orden.id,
      codigo: orden.codigo,
      tripId: orden.tripId,
      camion: orden.camion,
      chofer: orden.chofer,
      estadoViaje: viaje?.estado ?? 'pendiente',
      salida: viaje?.salida ?? '',
      paradas: orden.entregas.length,
      entregas: orden.entregas,
      // La salida del viaje entra en el resumen: sin ella los tiempos (tránsito del primer tramo y
      // total en ruta) no se pueden medir. Un viaje sin ficha en `VIAJES_MONITOREO` los deja en `null`.
      resumen: resumenEntregas(orden.entregas, viaje?.salida),
      tracking: porTripId.get(orden.tripId) ?? null,
    }
  })
}

/**
 * Cierra una entrega más en el contador de la orden. Es el payload de un `order_progress`.
 *
 * Mueve los CONTADORES y los TIEMPOS, porque el evento lleva las dos cosas: `progress` (los ocho
 * contadores) y `times` (atención promedio, tránsito promedio y total en ruta). Los tiempos no pueden
 * quedar afuera: son promedios, y un promedio que no se actualiza cuando entra una muestra queda
 * clavado en el snapshot mientras el resto de la fila avanza — la falla más difícil de ver, porque el
 * número se ve plausible.
 */
type CierreEntrega = 'entregado' | 'fallido' | 'devuelto'

function progresoConUnaMas(resumen: ResumenEntregas): { resumen: ResumenEntregas; cierre: CierreEntrega } {
  if (resumen.pendientes === 0) return { resumen, cierre: 'entregado' }
  // Cuántas paradas ya estaban medidas: es el `n` con el que se dobla el promedio.
  const cerradasAntes = resumen.entregadas + resumen.fallidas + resumen.devueltas
  // Cómo cerró: la mayoría bien, el fallo y la devolución son la excepción — la misma proporción que
  // usa el generador del dataset, para que el listado y el detalle no cuenten historias distintas.
  const suerte = rand.next()
  const entregadas = resumen.entregadas + (suerte < 0.87 ? 1 : 0)
  const fallidas = resumen.fallidas + (suerte >= 0.87 && suerte < 0.95 ? 1 : 0)
  const devueltas = resumen.devueltas + (suerte >= 0.95 ? 1 : 0)
  const cerradas = entregadas + fallidas + devueltas
  const cierre: CierreEntrega = suerte < 0.87 ? 'entregado' : suerte < 0.95 ? 'fallido' : 'devuelto'
  return {
    cierre,
    resumen: {
      ...resumen,
      entregadas,
      fallidas,
      devueltas,
      pendientes: resumen.total - cerradas,
      progresoPct: resumen.total > 0 ? Math.round((cerradas / resumen.total) * 100) : 0,
      // Una parada que falla SIEMPRE deja rastro: si no, el planificador ve un "no entregado" sin
      // explicación y tiene que llamar por teléfono.
      incidencias: resumen.incidencias + (suerte >= 0.87 ? 1 : 0),
      // El sub-DTO `times`: se dobla la muestra de la parada que acaba de cerrar dentro de los promedios.
      ...tiemposConUnaMas(resumen, cerradasAntes),
    },
  }
}

const cerrada = (estado: EntregaMonitoreo['estado']) =>
  estado === 'entregado' || estado === 'fallido' || estado === 'devuelto'

function hhmmAhora(): string {
  const ahora = new Date()
  return `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`
}

/**
 * El stream de flota no trae qué parada cerró, solo el agregado `order_progress`.
 * Para la vista por pedido se adelanta la siguiente pendiente en secuencia: suficiente para ubicar el
 * pedido dentro del viaje sin inventar un segundo stream.
 */
function cerrarSiguienteEntrega(
  entregas: EntregaMonitoreo[],
  cierre: CierreEntrega,
): EntregaMonitoreo[] {
  const siguiente = entregas.findIndex((entrega) => !cerrada(entrega.estado))
  if (siguiente < 0) return entregas

  const hora = hhmmAhora()
  return entregas.map((entrega, index) =>
    index !== siguiente
      ? entrega
      : {
          ...entrega,
          estado: cierre,
          llegadaAt: entrega.llegadaAt ?? hora,
          entregaAt: hora,
          motivo:
            cierre === 'fallido'
              ? entrega.motivo || 'No se pudo concretar la entrega.'
              : cierre === 'devuelto'
                ? entrega.motivo || 'La mercadería volvió con el camión.'
                : entrega.motivo,
        },
  )
}

export function pedidosDeFila(fila: FilaMonitoreo): FilaPedidoMonitoreo[] {
  return fila.entregas.flatMap((entrega) =>
    entrega.pedidos.map((pedido) => ({
      id: pedido.id,
      pedido: pedido.salesOrder,
      documento: pedido.documento,
      ordenId: fila.id,
      ordenCodigo: fila.codigo,
      tripId: fila.tripId,
      paradaId: entrega.paradaId,
      secuencia: entrega.secuencia,
      cliente: entrega.cliente,
      puntoEntrega: entrega.puntoEntrega,
      camion: fila.camion,
      chofer: fila.chofer,
      estadoViaje: fila.estadoViaje,
      estadoEntrega: entrega.estado,
      canal: pedido.canal,
      formaPago: pedido.formaPago,
      pesoKg: pedido.pesoKg,
      volumenM3: pedido.volumenM3,
      total: pedido.total,
      pedidosEnParada: entrega.pedidos.length,
      incidencias: entrega.incidencias.length,
      tracking: fila.tracking,
    })),
  )
}

export interface FlotaViva {
  filas: FilaMonitoreo[]
  /**
   * Frescura de LA PANTALLA, en ms. Es el mismo indicador que expone el hook del detalle y NO es lo
   * mismo que "última señal": esa dice "a este camión se le cayó el GPS", esta dice "la conexión se
   * murió y estás mirando datos congelados". Sin la segunda, un stream caído se ve idéntico a una flota
   * detenida.
   */
  actualizadoAt: number
}

/**
 * Snapshot + deltas del listado de flota.
 *
 * El estado es LOCAL y se parchea POR ID: los eventos no reescriben la lista entera. Además de ser lo
 * que el contrato dice, es lo que hace que la tabla no re-renderice 40 filas para mover una — las filas
 * que no cambiaron conservan su identidad referencial.
 */
export function useFlotaViva(distributorId: number = DISTRIBUIDOR_ACTIVO): FlotaViva {
  const transportOrders = useTransportOrdersStore((state) => state.orders)
  const [estado, setEstado] = useState(() => ({
    filas: snapshotFlota(distributorId, transportOrders),
    actualizadoAt: Date.now(),
  }))

  useEffect(() => {
    // Re-pedir el snapshot es también lo que pasa al RECONECTAR, así que el mismo camino sirve para las
    // dos cosas: montar la pantalla y volver de un corte.
    const filas = snapshotFlota(distributorId, transportOrders)
    setEstado({ filas, actualizadoAt: Date.now() })

    /** Parcheo por id. Devuelve la MISMA fila si el evento no la cambió. */
    const parchear = (id: string, delta: (fila: FilaMonitoreo) => FilaMonitoreo) =>
      setEstado((prev) => ({
        filas: prev.filas.map((fila) => (fila.id === id ? delta(fila) : fila)),
        actualizadoAt: Date.now(),
      }))

    // ── Dónde va cada camión, para poder escribir pings que sigan su ruta ──
    // El recorrido es [depósito, ...paradas, depósito], así que el tramo `i` va de `recorrido[i]` a
    // `recorrido[i + 1]`. Esto NO es estado de la pantalla: es el stand-in del camión real, o sea del
    // lado que escribe. Por eso vive en el closure del efecto y no en `useState`.
    const enRuta = filas
      .filter((fila) => fila.estadoViaje === 'en_ruta')
      .map((fila) => {
        const viaje = viajePorTripId(fila.tripId)
        return {
          fila,
          recorrido: viaje?.recorrido ?? [],
          employeeId: viaje?.employeeId ?? 0,
          tramo: viaje?.cursor ?? 0,
          t: 0.55,
          battery: fila.tracking?.battery ?? 100,
          pings: 0,
          // El viaje cerró: el camión volvió y ya no reporta. Sin esta marca, el bucle de pings seguiría
          // escribiendo posiciones de un viaje finalizado y la ventana de agrupación le devolvería un
          // `tracking` a una fila que la pantalla ya había dado por terminada.
          terminado: false,
        }
      })
      .filter((camion) => camion.recorrido.length > 1)

    /** Último ítem ACTUAL de cada viaje, esperando la ventana de agrupación. */
    const pendientesDeEntregar = new Map<string, ItemActual>()

    // ── Escritura de pings: es el chofer, no la pantalla ──
    const idPing = setInterval(() => {
      for (const camion of enRuta) {
        // Ya volvió al depósito, o el viaje cerró: en los dos casos dejó de reportar.
        if (camion.terminado || camion.tramo >= camion.recorrido.length - 1) continue

        camion.t += PASO
        if (camion.t >= 1) {
          camion.tramo++
          camion.t = 0
        }
        const ultimo = camion.recorrido.length - 1
        const desde = camion.recorrido[Math.min(camion.tramo, ultimo)]
        const hasta = camion.recorrido[Math.min(camion.tramo + 1, ultimo)]
        const posicion = interpolar(desde, hasta, camion.t)

        camion.pings++
        if (camion.pings % PINGS_POR_PUNTO_BATERIA === 0) camion.battery = Math.max(1, camion.battery - 1)

        pendientesDeEntregar.set(
          camion.fila.id,
          escribirPing({
            tripId: camion.fila.tripId,
            distributorId,
            employeeId: camion.employeeId,
            latitude: posicion[0],
            longitude: posicion[1],
            battery: camion.battery,
            trackedAt: new Date().toISOString(),
          }),
        )
      }
    }, PING_MS)

    // ── Entrega AGRUPADA de los eventos `tracking` ──
    // Se vacía el buffer: un evento por camión con su ÚLTIMA posición, no la ráfaga de los pings que
    // hubo en la ventana. Los intermedios no se pierden —quedaron en la traza, que es lo que existe
    // para eso—, simplemente no se le mandan a una tabla que no los muestra.
    const idFlush = setInterval(() => {
      if (pendientesDeEntregar.size === 0) return
      const lote = new Map(pendientesDeEntregar)
      pendientesDeEntregar.clear()
      setEstado((prev) => ({
        filas: prev.filas.map((fila) => {
          const item = lote.get(fila.id)
          return item ? { ...fila, tracking: item } : fila
        }),
        actualizadoAt: Date.now(),
      }))
    }, COALESCENCIA_MS)

    // ── Cambios de ESTADO: pasan al instante, sin agrupar ──
    const idEstado = setInterval(() => {
      const activos = enRuta.filter((camion) => !camion.terminado && camion.fila.resumen.pendientes > 0)
      if (activos.length === 0) return
      const camion = rand.pick(activos)

      // `order_progress`: el contador de la orden avanza. La fila del listado no sabe de entregas
      // individuales, solo de su total cerrado.
      const avance = progresoConUnaMas(camion.fila.resumen)
      const entregas = cerrarSiguienteEntrega(camion.fila.entregas, avance.cierre)
      camion.fila = { ...camion.fila, resumen: avance.resumen, entregas }
      parchear(camion.fila.id, (fila) => ({ ...fila, resumen: avance.resumen, entregas }))

      // `trip_status`: cerró la última parada, el viaje terminó. Y con el viaje termina su presencia en
      // la flota: el ítem ACTUAL sale de la partición `FLEET#{distributorId}` porque ya no hay nada
      // activo que listar. La TRAZA queda hasta que el TTL la limpie a los 30 días.
      if (avance.resumen.pendientes === 0) {
        camion.terminado = true
        borrarActual(distributorId, camion.fila.tripId)
        pendientesDeEntregar.delete(camion.fila.id)
        camion.fila = { ...camion.fila, estadoViaje: 'finalizado', tracking: null }
        parchear(camion.fila.id, (fila) => ({ ...fila, estadoViaje: 'finalizado', tracking: null }))
      }
    }, EVENTO_ESTADO_MS)

    return () => {
      clearInterval(idPing)
      clearInterval(idFlush)
      clearInterval(idEstado)
    }
  }, [distributorId, transportOrders])

  return estado
}
