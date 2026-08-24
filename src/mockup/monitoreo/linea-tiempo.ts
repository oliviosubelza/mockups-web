// Modelo de la LÍNEA DE TIEMPO de un viaje: el plan contra lo que realmente pasó, parada por parada.
//
// Vive aparte del componente por la misma razón que `monitoreo-estado`: el corte entre "en horario" y
// "tarde" es una regla de NEGOCIO, no una decisión de pintura. Si los umbrales se escribieran dentro
// del JSX, el día que logística diga "10 minutos ya es demora" habría que buscarlos entre los estilos,
// y cualquier otra vista que quiera el mismo semáforo tendría que copiarlos.
//
// El plan NO se guarda en ninguna tabla: se deriva de `salida + secuencia × MIN_POR_PARADA`, que es la
// misma fórmula con la que el dataset fecha sus eventos (ver el bloque "Horario planificado" de
// `monitoreo-data`). Cuando exista la planificación real —una ETA por parada— hay que cambiar SOLO
// `construirLineaTiempo`; el resto de este archivo y todo el componente siguen igual.
import { aMinutos } from '../mock-data'
import {
  atencionMin,
  horaEntregaPlanificada,
  horaLlegadaPlanificada,
  type EntregaMonitoreo,
  type ViajeMonitoreo,
} from './monitoreo-data'
import { ESTADO_ENTREGA, type EstadoEntrega } from './monitoreo-estado'

const MIN_POR_DIA = 24 * 60

/**
 * Tolerancia, en minutos, para considerar que una parada se atendió a la hora planificada.
 *
 * Ocho y no cero: el plan sale de un promedio (25 min por parada), así que exigirle al chofer el minuto
 * exacto pintaría de rojo una operación normal y el semáforo dejaría de significar algo. Es el mismo
 * criterio con el que se mira un colectivo: nadie llama tarde a un bus que pasó 3 minutos después.
 */
export const UMBRAL_EN_HORA = 8

/** A partir de acá ya no es "se atrasó un poco": es un desvío que mueve las paradas siguientes. */
export const UMBRAL_DEMORA = 25

/** Cómo se compara la ejecución contra el plan. Es el eje que colorea la pista ejecutada. */
export type TierDesvio = 'adelantado' | 'en_hora' | 'demora' | 'tarde'

export interface TierDesvioMeta {
  label: string
  /** Etiqueta corta, para la leyenda y los chips angostos. */
  corto: string
  /** Color del bloque en la línea de tiempo. Hex porque se usa en `style` con alfa. */
  color: string
  /** Clases del chip/badge. */
  chip: string
  /** Clases para el número suelto. */
  texto: string
}

/**
 * La paleta del desvío. Es deliberadamente distinta de la del ESTADO de la entrega: son dos preguntas
 * diferentes —"¿llegó?" y "¿llegó a tiempo?"— y mezclarlas en un solo color hace que una parada
 * entregada con 40 minutos de atraso se vea igual de bien que una puntual.
 *
 * El verde de `en_hora` es el mismo `#16a34a` del pin "entregado" a propósito: en la operación, "cerrada
 * y puntual" es el caso bueno y tiene que leerse igual en el mapa y acá.
 */
export const TIER_DESVIO: Record<TierDesvio, TierDesvioMeta> = {
  adelantado: {
    label: 'Adelantado',
    corto: 'Antes',
    color: '#0ea5e9',
    chip: 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400',
    texto: 'text-sky-600 dark:text-sky-400',
  },
  en_hora: {
    label: 'En horario',
    corto: 'En hora',
    color: '#16a34a',
    chip: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    texto: 'text-emerald-600 dark:text-emerald-400',
  },
  demora: {
    label: 'Demora leve',
    corto: 'Demora',
    color: '#f59e0b',
    chip: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
    texto: 'text-amber-600 dark:text-amber-400',
  },
  tarde: {
    label: 'Fuera de horario',
    corto: 'Tarde',
    color: '#dc2626',
    chip: 'border-destructive/30 bg-destructive/10 text-destructive',
    texto: 'text-destructive',
  },
}

/** Orden de lectura de la leyenda: del que se adelantó al que se atrasó. */
export const TIERS_DESVIO: TierDesvio[] = ['adelantado', 'en_hora', 'demora', 'tarde']

/** El gris de "todavía no pasó". Sale del mismo mapa que el pin, no de un hex suelto. */
export const COLOR_PENDIENTE = ESTADO_ENTREGA.pendiente.color

export const tierDe = (desvio: number): TierDesvio =>
  desvio < -UMBRAL_EN_HORA
    ? 'adelantado'
    : desvio <= UMBRAL_EN_HORA
      ? 'en_hora'
      : desvio <= UMBRAL_DEMORA
        ? 'demora'
        : 'tarde'

/**
 * El desvío en texto, siempre con signo. El signo es el dato: "12 min" no dice nada, "+12 min" sí.
 * El `null` cae en el mismo guion que usa `duracionTexto`, para que "sin dato" se vea igual en toda la
 * pantalla.
 */
export const desvioTexto = (min: number | null): string => {
  if (min === null) return '—'
  if (min === 0) return 'en punto'
  return `${min > 0 ? '+' : '−'}${Math.abs(min)} min`
}

export interface HitoLineaTiempo {
  entrega: EntregaMonitoreo
  /** El orden PLANIFICADO de visita — `route_delivery_points.sequence`. */
  secuencia: number
  /** El orden REAL — `delivery_orders.executed_sequence`. `null` mientras no llegó. */
  secuenciaEjecutada: number | null
  /**
   * Se visitó fuera del orden planificado. Es un desvío de RUTA, no de horario, y por eso viaja aparte
   * del `tier`: una parada saltada y retomada puede cerrar perfectamente en hora y aun así explicar por
   * qué las tres siguientes se corrieron.
   */
  fueraDeOrden: boolean
  cliente: string
  puntoEntrega: string
  estado: EstadoEntrega
  /** Llegada planificada, en minutos del eje del viaje. */
  planLlegada: number
  /** Cierre planificado. La diferencia con `planLlegada` es la descarga presupuestada. */
  planCierre: number
  /** `arrived_at`. `null` mientras el camión no llegó. */
  realLlegada: number | null
  /** `delivered_at`. `null` mientras la parada no cerró. */
  realCierre: number | null
  /** Positivo = llegó tarde. `null` sin llegada real. */
  desvioLlegada: number | null
  /** Positivo = cerró tarde. `null` sin cierre real. */
  desvioCierre: number | null
  /** El semáforo de la parada, derivado del desvío de LLEGADA. `null` mientras no llegó. */
  tier: TierDesvio | null
  /** `delivered_at − arrived_at`. Cuánto estuvo parado en el punto. */
  atencion: number | null
  /** Ventana comprometida con el cliente, en minutos de RELOJ (ver nota en `construirLineaTiempo`). */
  ventanaDesde: number | null
  ventanaHasta: number | null
  ventana: string
  fueraDeVentana: boolean
  incidencias: number
}

export interface LineaTiempo {
  /** Salida PLANIFICADA. Es el origen del eje y el cero contra el que se mide todo el viaje. */
  salidaPlanMin: number
  /** Salida REAL — `transport_orders.departure_date`. */
  salidaRealMin: number
  /**
   * Cuánto se demoró la rampa. Es el desvío que más pesa del día porque se arrastra hasta la última
   * parada, y hasta ahora no se veía en ninguna pantalla: la línea de tiempo arrancaba en la salida
   * real, así que el atraso de origen quedaba absorbido en el cero.
   */
  demoraSalidaMin: number
  /** Retorno PLANIFICADO al depósito: un tramo más después de la última parada. */
  cierrePlanMin: number
  /** Retorno REAL — `transport_orders.completed_date`. `null` mientras el viaje no cerró. */
  cierreRealMin: number | null
  /** Última marca del eje: el máximo entre el plan y lo ejecutado. */
  finMin: number
  hitos: HitoLineaTiempo[]
  /** Promedio del desvío de llegada sobre las paradas que ya llegaron. `null` si ninguna llegó. */
  desvioPromedio: number | null
  /** La parada con el peor atraso. Es la que se selecciona sola al abrir el diálogo. */
  peor: HitoLineaTiempo | null
  /** Paradas medidas que entraron en tolerancia (adelantadas incluidas). */
  aTiempo: number
  /** Paradas medidas que se salieron del horario planificado. */
  fueraDeHora: number
  /** Cuántas paradas tienen ya un desvío medible. */
  medidas: number
  /** Paradas que se visitaron fuera del orden planificado. */
  fueraDeOrden: number
  /**
   * El "ahora" del viaje, en el eje. Sale del último hecho registrado y NO del reloj de pared: el
   * dataset es ficticio y arranca a las 08:00, así que un playhead con la hora real caería siempre
   * fuera del eje. `null` en un viaje finalizado — ahí no hay presente que marcar.
   */
  ahoraMin: number | null
}

/**
 * Arma la línea de tiempo de un viaje: dos líneas paralelas, plan y ejecución, más el desvío entre
 * ellas. Es la estructura que dibujó logística a mano.
 *
 * El eje se cuenta DESDE LA SALIDA PLANIFICADA y se desenvuelve la medianoche: `hhmm` envuelve en 24 h,
 * así que un segundo viaje que cierra a las "00:15" tiene menos minutos de reloj que su propia salida
 * y, sin desenvolver, sus paradas se dibujarían a la izquierda del depósito.
 *
 * La VENTANA del cliente queda en minutos de reloj crudos a propósito: es un compromiso con el punto de
 * entrega, no un tramo del viaje, y desenvolverla contra la salida la mandaría un día entero a la
 * derecha cuando la ventana abrió antes de que el camión saliera. El render la recorta al eje.
 */
export function construirLineaTiempo(
  viaje: ViajeMonitoreo,
  entregas: EntregaMonitoreo[],
): LineaTiempo {
  const salidaPlanMin = aMinutos(viaje.salidaPlan)
  // Todo el eje se desenvuelve contra la salida PLANIFICADA, que es la más temprana de las dos: si se
  // anclara en la real, un viaje que salió tarde dibujaría su propio plan "antes del origen".
  const eje = (hora: string) => {
    const delta = aMinutos(hora) - salidaPlanMin
    return salidaPlanMin + (delta < 0 ? delta + MIN_POR_DIA : delta)
  }

  const salidaRealMin = eje(viaje.salida)

  const hitos: HitoLineaTiempo[] = [...entregas]
    .sort((a, b) => a.secuencia - b.secuencia)
    .map((entrega) => {
      const planLlegada = eje(horaLlegadaPlanificada(viaje.salidaPlan, entrega.secuencia))
      const planCierre = eje(horaEntregaPlanificada(viaje.salidaPlan, entrega.secuencia))
      const realLlegada = entrega.llegadaAt ? eje(entrega.llegadaAt) : null
      const realCierre = entrega.entregaAt ? eje(entrega.entregaAt) : null
      const desvioLlegada = realLlegada === null ? null : realLlegada - planLlegada
      const [desde, hasta] = entrega.ventana.split('–').map((v) => v.trim())

      return {
        entrega,
        secuencia: entrega.secuencia,
        secuenciaEjecutada: entrega.secuenciaEjecutada,
        fueraDeOrden:
          entrega.secuenciaEjecutada !== null && entrega.secuenciaEjecutada !== entrega.secuencia,
        cliente: entrega.cliente,
        puntoEntrega: entrega.puntoEntrega,
        estado: entrega.estado,
        planLlegada,
        planCierre,
        realLlegada,
        realCierre,
        desvioLlegada,
        desvioCierre: realCierre === null ? null : realCierre - planCierre,
        tier: desvioLlegada === null ? null : tierDe(desvioLlegada),
        atencion: atencionMin(entrega),
        ventanaDesde: desde ? aMinutos(desde) : null,
        ventanaHasta: hasta ? aMinutos(hasta) : null,
        ventana: entrega.ventana,
        fueraDeVentana: entrega.fueraDeVentana,
        incidencias: entrega.incidencias.length,
      }
    })

  const medidos = hitos.filter((h) => h.desvioLlegada !== null)
  const aTiempo = medidos.filter((h) => h.tier === 'en_hora' || h.tier === 'adelantado').length
  const peor = medidos.reduce<HitoLineaTiempo | null>(
    (max, h) => (max === null || (h.desvioLlegada ?? 0) > (max.desvioLlegada ?? 0) ? h : max),
    null,
  )

  // El retorno al depósito: un tramo más después de la última parada. Sale de la misma fórmula que el
  // resto del plan —`secuencia + 1`— y no de una constante propia, para que las dos puntas de la línea
  // planificada estén construidas con la misma regla.
  const cierrePlanMin = eje(horaLlegadaPlanificada(viaje.salidaPlan, hitos.length + 1))
  const cierreRealMin = viaje.cierreAt ? eje(viaje.cierreAt) : null

  // El presente del viaje: el hecho más avanzado que registró el camión. Si todavía no llegó a ninguna
  // parada, el presente es la salida — el camión está en el primer tránsito.
  const ultimoHecho = hitos.reduce<number | null>((max, h) => {
    const marca = h.realCierre ?? h.realLlegada
    if (marca === null) return max
    return max === null || marca > max ? marca : max
  }, null)

  return {
    salidaPlanMin,
    salidaRealMin,
    demoraSalidaMin: salidaRealMin - salidaPlanMin,
    cierrePlanMin,
    cierreRealMin,
    finMin: hitos.reduce(
      (max, h) => Math.max(max, h.planCierre, h.realCierre ?? 0, h.realLlegada ?? 0),
      Math.max(cierrePlanMin, cierreRealMin ?? 0),
    ),
    hitos,
    desvioPromedio:
      medidos.length === 0
        ? null
        : Math.round(medidos.reduce((a, h) => a + (h.desvioLlegada ?? 0), 0) / medidos.length),
    peor: peor && (peor.desvioLlegada ?? 0) > UMBRAL_EN_HORA ? peor : null,
    aTiempo,
    fueraDeHora: medidos.length - aTiempo,
    medidas: medidos.length,
    fueraDeOrden: hitos.filter((h) => h.fueraDeOrden).length,
    ahoraMin: viaje.estado === 'finalizado' ? null : (ultimoHecho ?? salidaRealMin),
  }
}

// ── Escala del eje ───────────────────────────────────────────────────────────────────────────
// La regla se comporta como la de un editor de video: el paso de las marcas se elige por el ANCHO que
// ocupan en pantalla, no por el zoom en abstracto. Así, al alejarse, las marcas no se amontonan —
// simplemente se pasa de 5 en 5 minutos a 15, a 30, a una hora.

const PASOS_REGLA = [5, 10, 15, 30, 60, 120, 240]

/** Separación mínima, en px, entre dos etiquetas de hora para que no se toquen. */
const SEPARACION_MINIMA_PX = 66

export const pasoRegla = (pxPorMin: number): number =>
  PASOS_REGLA.find((paso) => paso * pxPorMin >= SEPARACION_MINIMA_PX) ?? PASOS_REGLA[PASOS_REGLA.length - 1]

/** Marcas menores dentro de cada paso: dividen en 4, 3 o 5 según lo que dé entero. */
export const pasoMenor = (paso: number): number => paso / (paso % 4 === 0 ? 4 : paso % 3 === 0 ? 3 : 5)

/** Minutos del eje → "HH:MM". Envuelve en 24 h, igual que el `hhmm` del dataset. */
export const horaDeEje = (min: number): string => {
  const total = Math.round(min)
  const h = Math.floor(total / 60) % 24
  const m = ((total % 60) + 60) % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
