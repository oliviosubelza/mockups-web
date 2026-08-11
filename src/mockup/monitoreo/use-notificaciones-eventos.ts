// Avisos (toasts) de los eventos del viaje.
//
// ── QUÉ SE AVISA, Y SOBRE TODO QUÉ NO ────────────────────────────────────────────────────────
// El stream de esta pantalla trae tres clases de evento (ver `use-seguimiento-vivo`): `tracking`,
// `delivery_started` y `delivery_closed`. Solo dos de las tres merecen un aviso.
//
// `tracking` NO se avisa. En producción llegan ~3 pings por segundo de flota y uno cada 10-15 s por
// camión; un toast por ping es una pantalla inusable. Que el camión se movió ya lo dice el pin.
//
// `en_camino` tampoco. Es un evento por parada ("salió hacia la siguiente"), o sea que DUPLICA el
// volumen de avisos para decir algo que el trazo del mapa ya muestra. Se avisa cuando LLEGA, que es
// cuando alguien puede necesitar hacer algo.
//
// Lo que sí:
//   · llegó al punto            → info     (el chofer apretó "Iniciar entrega")
//   · entregada                 → success  (o warning si cerró fuera de la ventana horaria)
//   · no entregada / devuelta   → error / warning, con el motivo
//   · el camión dejó de reportar y cuando vuelve → warning / info
//   · el viaje se completó      → success con el resumen
//
// ── POR QUÉ CADA AVISO LLEVA ID ESTABLE ──────────────────────────────────────────────────────
// Sonner reemplaza el toast que ya tiene ese id en vez de apilar otro. Eso hace idempotente al aviso:
// da igual si el efecto corre dos veces (StrictMode) o si en modo mockup hay dos tableros simulando el
// mismo viaje — el evento `entrega X cerró como entregado` se muestra UNA vez.
//
// ── POR QUÉ SE SIEMBRA EL ESTADO ANTERIOR EN SILENCIO ────────────────────────────────────────
// El primer pase solo registra en qué estado está cada parada, sin avisar nada. Sin eso, abrir un viaje
// que ya tiene 6 paradas cerradas dispararía 6 toasts de cosas que pasaron hace horas. Un aviso es
// "esto acaba de pasar", no "esto está así".
//
// Y el registro se actualiza SIEMPRE, también con los avisos apagados: si solo se actualizara estando
// encendidos, activarlos a mitad de un viaje descargaría de golpe todo lo que pasó mientras estaban
// apagados.
import { useEffect, useRef } from 'react'
import { notify } from '@/core/notify'
import type { EntregaMonitoreo, ViajeMonitoreo } from './monitoreo-data'
import { ESTADO_ENTREGA, type EstadoEntrega } from './monitoreo-estado'
import { minutosSinSenal, senalVieja as esSenalVieja, type ItemActual } from './tracking-dynamo'

/** Los avisos malos se leen más despacio: hay que entender el motivo, no solo verlo pasar. */
const DURACION_NORMAL = 4000
const DURACION_PROBLEMA = 7000

/** `#4 · Tienda El Trigal` — el prefijo de secuencia ubica la parada en el viaje sin abrir el panel. */
const refParada = (entrega: EntregaMonitoreo) => `#${entrega.secuencia} · ${entrega.cliente}`

export function useNotificacionesEventos({
  viaje,
  entregas,
  tracking,
  /** Interruptor del usuario. Ver `notificaciones-store`. */
  activas,
  /** Qué hacer al tocar "Ver" en un aviso: enfocar esa parada en el mapa. */
  onVerParada,
}: {
  viaje: ViajeMonitoreo | undefined
  entregas: EntregaMonitoreo[]
  tracking: ItemActual | null
  activas: boolean
  onVerParada: (paradaId: string) => void
}): void {
  const tripId = viaje?.tripId ?? null

  // Estado de cada parada en el pase anterior. `null` = todavía no se sembró (o cambió el viaje).
  const previo = useRef<{ tripId: number | null; estados: Map<string, EstadoEntrega> } | null>(null)
  // Última condición de señal avisada, para no repetir el mismo aviso en cada ping.
  const senalPrevia = useRef<boolean | null>(null)
  // El "viaje completado" se avisa una sola vez por viaje.
  const finAvisado = useRef<number | null>(null)

  // `onVerParada` por ref: es un callback que la vista redefine en cada render, y como dependencia del
  // efecto lo haría correr de nuevo constantemente (con el riesgo de re-avisar).
  const verParada = useRef(onVerParada)
  verParada.current = onVerParada

  // ── Cambios de estado de las entregas ──────────────────────────────────────────────────────
  useEffect(() => {
    const actual = new Map(entregas.map((e) => [e.id, e.estado]))
    const anterior = previo.current

    // Viaje nuevo (o primer render): se siembra y no se avisa nada de lo que ya venía pasado.
    if (!anterior || anterior.tripId !== tripId) {
      previo.current = { tripId, estados: actual }
      return
    }
    previo.current = { tripId, estados: actual }
    if (!activas) return

    for (const entrega of entregas) {
      const antes = anterior.estados.get(entrega.id)
      if (antes === undefined || antes === entrega.estado) continue

      const id = `mon:${entrega.id}:${entrega.estado}`
      const ver = { label: 'Ver', onClick: () => verParada.current(entrega.paradaId) }

      switch (entrega.estado) {
        case 'en_sitio':
          notify(`Llegó a ${entrega.cliente}`, {
            type: 'info',
            description: `${refParada(entrega)}${entrega.llegadaAt ? ` · ${entrega.llegadaAt}` : ''}`,
            duration: DURACION_NORMAL,
            id,
            action: ver,
          })
          break

        case 'entregado':
          // Entregada FUERA DE VENTANA no es un éxito limpio: se entregó, pero tarde. Un success verde
          // haría que el caso que hay que revisar se lea igual que el que no.
          notify(entrega.fueraDeVentana ? `Entregada fuera de ventana · ${entrega.cliente}` : `Entregada · ${entrega.cliente}`, {
            type: entrega.fueraDeVentana ? 'warning' : 'success',
            description: [
              refParada(entrega),
              entrega.entregaAt,
              entrega.fueraDeVentana ? `ventana ${entrega.ventana}` : entrega.receptor && `recibió ${entrega.receptor}`,
            ]
              .filter(Boolean)
              .join(' · '),
            duration: entrega.fueraDeVentana ? DURACION_PROBLEMA : DURACION_NORMAL,
            id,
            action: ver,
          })
          break

        case 'fallido':
          notify(`No entregada · ${entrega.cliente}`, {
            type: 'error',
            description: [refParada(entrega), entrega.motivo].filter(Boolean).join(' · '),
            duration: DURACION_PROBLEMA,
            id,
            action: ver,
          })
          break

        case 'devuelto':
          notify(`Devolución · ${entrega.cliente}`, {
            type: 'warning',
            description: [refParada(entrega), entrega.motivo].filter(Boolean).join(' · '),
            duration: DURACION_PROBLEMA,
            id,
            action: ver,
          })
          break

        // 'pendiente' y 'en_camino' no avisan (ver la nota de arriba).
        default:
          break
      }
    }
  }, [entregas, activas, tripId])

  // ── El viaje se completó ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (tripId === null || entregas.length === 0) return
    const cerradas = entregas.filter((e) => ESTADO_ENTREGA[e.estado].cerrada)
    if (cerradas.length < entregas.length) return
    if (finAvisado.current === tripId) return
    finAvisado.current = tripId
    if (!activas) return

    const entregadas = cerradas.filter((e) => e.estado === 'entregado').length
    const problemas = cerradas.length - entregadas
    notify(`Viaje completado · ${viaje?.camion ?? ''}`.trim(), {
      type: 'success',
      description: `${entregadas} entregadas${problemas > 0 ? ` · ${problemas} con problema` : ''}`,
      duration: DURACION_PROBLEMA,
      id: `mon:fin:${tripId}`,
    })
  }, [entregas, activas, tripId, viaje?.camion])

  // ── El equipo dejó de reportar (y cuando vuelve) ───────────────────────────────────────────
  // Se avisa por TRANSICIÓN y no por condición: sin esto, cada ping con señal vieja repetiría el aviso.
  // La transición inversa también se avisa — un "sin señal" sin su "volvió" deja al operador sin saber si
  // el problema sigue abierto.
  //
  // OJO al probarlo en el mockup: la que se ve es la transición "volvió la señal", no la de "se cortó".
  // La simulación pinguea cada 1,2 s, así que un viaje en ruta nunca cruza el umbral de 15 min; lo que sí
  // pasa es abrir un viaje que el dataset dejó sin señal — el primer ping lo trae de vuelta y ahí salta
  // "Señal recuperada". Con SSE real las dos direcciones ocurren solas. No es código muerto: es un caso
  // que el reloj de la simulación no puede producir.
  useEffect(() => {
    if (!tracking) return
    const vieja = esSenalVieja(tracking.trackedAt, Date.now())
    const antes = senalPrevia.current
    senalPrevia.current = vieja
    if (antes === null || antes === vieja) return
    if (!activas) return

    const minutos = minutosSinSenal(tracking.trackedAt, Date.now())
    if (vieja) {
      notify(`Sin señal · ${viaje?.camion ?? 'camión'}`, {
        type: 'warning',
        description: `Hace ${minutos} min · batería ${tracking.battery}%`,
        duration: DURACION_PROBLEMA,
        id: `mon:senal:${tripId}:vieja`,
      })
    } else {
      notify(`Señal recuperada · ${viaje?.camion ?? 'camión'}`, {
        type: 'info',
        duration: DURACION_NORMAL,
        id: `mon:senal:${tripId}:ok`,
      })
    }
  }, [tracking, activas, tripId, viaje?.camion])
}
