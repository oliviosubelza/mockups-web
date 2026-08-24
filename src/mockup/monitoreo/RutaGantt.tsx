// Ruta PLANIFICADA contra ruta EJECUTADA: un Gantt de una fila por parada.
//
// La primera versión de esta pantalla era un timeline de dos carriles al estilo editor de video
// (CapCut). Era lindo y no se entendía, por tres razones concretas que vale la pena dejar escritas para
// no repetirlas:
//   1. La comparación era ENTRE CARRILES. Para saber si la parada 7 llegó tarde había que encontrarla
//      en el carril de arriba, bajar la vista 60 px y encontrar su par en el de abajo. El ojo pierde el
//      hilo con dos paradas juntas, y con veinte es imposible.
//   2. NO HABÍA LUGAR PARA EL TEXTO. Sobre un eje de tiempo compartido, un bloque de 9 minutos son 15
//      px: no entra ni el nombre del cliente ni la hora, así que había que acercarse para leer
//      cualquier cosa. Una pantalla que obliga a hacer zoom para contestar "¿quién es esta parada?" no
//      contesta nada de un vistazo.
//   3. EL ZOOM ERA OBLIGATORIO, y encima la rueda hacía zoom en vez de desplazar — lo contrario de lo
//      que hace cualquier lista.
//
// Esto usa el patrón que ya existe en todos lados para "plan contra real": el Gantt con línea base.
// Es el de MS Project (baseline vs actual), el de cualquier tablero de puntualidad de trenes y el de
// los productos de flota. Funciona porque:
//   · UNA FILA POR PARADA, y las filas se leen de arriba abajo en el orden de visita — que es como se
//     lee una hoja de ruta;
//   · plan y real están EN LA MISMA FILA, uno arriba del otro. El desvío es la diferencia entre dos
//     barras separadas por 10 px, no por medio carril;
//   · la columna de la izquierda está CONGELADA, así que el número de parada, el cliente, el punto de
//     entrega y las dos horas se leen siempre, a cualquier zoom y sin acercarse a nada;
//   · cada fila tiene su propio carril, así que la VENTANA COMPROMETIDA del cliente por fin se puede
//     dibujar de fondo — en el diseño anterior se superponían todas y había que esconderla.
//
// El zoom quedó como accesorio y con el gesto correcto: la rueda desplaza (es una lista), Ctrl+rueda
// acerca. Es la convención de Figma, de los mapas y de los propios Gantt.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Flag, Maximize2, Warehouse, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { EstadoEntregaBadge } from './EstadoEntregaBadge'
import { ESTADO_ENTREGA } from './monitoreo-estado'
import {
  COLOR_PENDIENTE,
  desvioTexto,
  horaDeEje,
  pasoMenor,
  pasoRegla,
  tierDe,
  TIER_DESVIO,
  TIERS_DESVIO,
  type HitoLineaTiempo,
  type LineaTiempo,
} from './linea-tiempo'

// ── Medidas ──────────────────────────────────────────────────────────────────────────────────
const ANCHO_LABEL = 316
const ALTO_REGLA = 30
const ALTO_FILA = 38
/** La barra del PLAN va arriba y fina; la REAL abajo y gruesa. Es la convención del Gantt con línea base. */
const PLAN_TOP = 8
const PLAN_ALTO = 5
const REAL_TOP = 19
const REAL_ALTO = 11
/** Una barra nunca se dibuja más angosta que esto: 9 minutos a vista general desaparecen. */
const ANCHO_MIN_BARRA = 6
const COLCHON_IZQ = 15
const COLCHON_DER = 30

const PX_MIN = 0.35
const PX_MAX = 26
const SENSIBILIDAD_RUEDA = 0.0022

const acotar = (valor: number, min: number, max: number) => Math.min(Math.max(valor, min), max)

/** Normaliza el delta de la rueda: Firefox reporta en líneas y algunos navegadores en páginas. */
const deltaPx = (evento: WheelEvent) =>
  evento.deltaMode === 1 ? evento.deltaY * 16 : evento.deltaMode === 2 ? evento.deltaY * 400 : evento.deltaY

/**
 * El color de una parada.
 *
 * Una parada FALLIDA o DEVUELTA se pinta con el color de su estado y no con el del desvío: preguntarle
 * la puntualidad a una entrega que no ocurrió es contestar la pregunta equivocada, y un "no entregado"
 * en verde por haber llegado a horario es exactamente la lectura que no queremos.
 */
export const colorDe = (hito: HitoLineaTiempo): string => {
  if (hito.estado === 'fallido' || hito.estado === 'devuelto') return ESTADO_ENTREGA[hito.estado].color
  if (hito.tier === null) return COLOR_PENDIENTE
  return TIER_DESVIO[hito.tier].color
}

export function RutaGantt({
  linea,
  seleccion,
  onSeleccionar,
}: {
  linea: LineaTiempo
  seleccion: number | null
  onSeleccionar: (secuencia: number) => void
}) {
  const t0 = linea.salidaPlanMin - COLCHON_IZQ
  const t1 = linea.finMin + COLCHON_DER
  const span = Math.max(t1 - t0, 1)

  const scrollerRef = useRef<HTMLDivElement>(null)
  const anclaRef = useRef<{ min: number; offset: number } | null>(null)
  const ajustadoRef = useRef(false)
  const pxRef = useRef(2)
  const [px, setPx] = usePxEstado(pxRef)

  const x = useCallback((min: number) => (min - t0) * px, [t0, px])
  const anchoCanvas = Math.max(span * px, 240)
  const paso = pasoRegla(px)
  const menor = pasoMenor(paso)

  const hito = useMemo(
    () => linea.hitos.find((h) => h.secuencia === seleccion) ?? null,
    [linea.hitos, seleccion],
  )

  /** Zoom anclado: el minuto que estaba bajo el cursor sigue bajo el cursor después de acercar. */
  const zoomAnclado = useCallback(
    (destino: number, clienteX?: number) => {
      const el = scrollerRef.current
      if (!el) return
      const caja = el.getBoundingClientRect()
      const visible = el.clientWidth - ANCHO_LABEL
      const offset =
        clienteX === undefined
          ? visible / 2
          : acotar(clienteX - caja.left - ANCHO_LABEL, 0, Math.max(visible, 0))
      anclaRef.current = { min: (el.scrollLeft + offset) / pxRef.current + t0, offset }
      setPx(acotar(destino, PX_MIN, PX_MAX))
    },
    [t0, setPx],
  )

  // El scroll se corrige DESPUÉS del layout: en el handler todavía está el ancho viejo.
  useLayoutEffect(() => {
    const el = scrollerRef.current
    const ancla = anclaRef.current
    if (!el || !ancla) return
    anclaRef.current = null
    el.scrollLeft = (ancla.min - t0) * px - ancla.offset
  }, [px, t0])

  const ajustar = useCallback(() => {
    const el = scrollerRef.current
    if (!el || el.clientWidth === 0) return
    setPx(acotar((el.clientWidth - ANCHO_LABEL - 12) / span, PX_MIN, PX_MAX))
    el.scrollLeft = 0
  }, [span, setPx])

  // El encuadre inicial muestra el viaje ENTERO: el Gantt tiene que ser legible SIN tocar el zoom. El
  // ResizeObserver es porque el diálogo mide 0 hasta que monta el portal.
  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const observador = new ResizeObserver(() => {
      if (ajustadoRef.current || el.clientWidth === 0) return
      ajustadoRef.current = true
      ajustar()
    })
    observador.observe(el)
    return () => observador.disconnect()
  }, [ajustar])

  // Rueda = desplazar, Ctrl+rueda = acercar. Es la convención de Figma, de los mapas y de los Gantt, y
  // es la corrección más importante respecto del diseño anterior: esto es una LISTA de paradas, y una
  // lista que no scrollea con la rueda pelea contra lo que el usuario ya sabe hacer.
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const alRodar = (evento: WheelEvent) => {
      if (!evento.ctrlKey && !evento.metaKey) return
      evento.preventDefault()
      zoomAnclado(pxRef.current * Math.exp(-deltaPx(evento) * SENSIBILIDAD_RUEDA), evento.clientX)
    }
    el.addEventListener('wheel', alRodar, { passive: false })
    return () => el.removeEventListener('wheel', alRodar)
  }, [zoomAnclado])

  // La fila elegida se trae a la vista. Importa sobre todo al volver desde la pestaña Detalle: se elige
  // una parada allá, se cambia de vista y la fila tiene que estar donde el ojo la va a buscar, no
  // catorce filas más abajo.
  const indiceSeleccion = linea.hitos.findIndex((h) => h.secuencia === seleccion)
  useEffect(() => {
    const el = scrollerRef.current
    if (!el || indiceSeleccion < 0) return
    // +1 por la fila de la salida del depósito, que va antes que las paradas.
    const top = ALTO_REGLA + (indiceSeleccion + 1) * ALTO_FILA
    const visibleDesde = el.scrollTop + ALTO_REGLA
    const visibleHasta = el.scrollTop + el.clientHeight
    if (top < visibleDesde || top + ALTO_FILA > visibleHasta) {
      el.scrollTop = top - el.clientHeight / 2
    }
  }, [indiceSeleccion])

  const mover = useCallback(
    (delta: number) => {
      const indice = linea.hitos.findIndex((h) => h.secuencia === seleccion)
      const siguiente = linea.hitos[acotar(indice + delta, 0, linea.hitos.length - 1)]
      if (siguiente) onSeleccionar(siguiente.secuencia)
    },
    [linea.hitos, seleccion, onSeleccionar],
  )

  const ticks = useMemo(() => {
    const marcas: number[] = []
    for (let m = Math.ceil(t0 / menor) * menor; m <= t1; m += menor) marcas.push(m)
    return marcas
  }, [t0, t1, menor])
  const mayores = useMemo(() => ticks.filter((m) => m % paso === 0), [ticks, paso])

  /** Alto de todas las filas juntas: la salida, las paradas y el retorno. */
  const altoFilas = (linea.hitos.length + 2) * ALTO_FILA

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── Barra de herramientas ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-1 w-4 rounded-full bg-muted-foreground/50" />
            Plan
          </span>
          {TIERS_DESVIO.map((tier) => (
            <span key={tier} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="h-2 w-4 rounded-[2px]" style={{ backgroundColor: TIER_DESVIO[tier].color }} />
              {TIER_DESVIO[tier].corto}
            </span>
          ))}
          {linea.fueraDeOrden > 0 && (
            <span
              className="flex items-center gap-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-400"
              title="Paradas visitadas fuera del orden planificado (delivery_orders.executed_sequence)"
            >
              <span className="size-2 rounded-full ring-2 ring-amber-500" />
              {linea.fueraDeOrden} fuera de orden
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-1 hidden text-[11px] text-muted-foreground sm:inline">Ctrl + rueda para acercar</span>
          <Button size="icon-sm" variant="ghost" title="Alejar" onClick={() => zoomAnclado(px / 1.6)}>
            <ZoomOut className="size-4" />
          </Button>
          <Button size="icon-sm" variant="ghost" title="Acercar" onClick={() => zoomAnclado(px * 1.6)}>
            <ZoomIn className="size-4" />
          </Button>
          <Button size="icon-sm" variant="ghost" title="Ajustar el viaje completo" onClick={ajustar}>
            <Maximize2 className="size-4" />
          </Button>
        </div>
      </div>

      {/* ── El Gantt ─────────────────────────────────────────────────────────────────────── */}
      {/* UN SOLO contenedor con scroll en los dos ejes, y la columna de etiquetas pegada con
          `sticky left-0` dentro de cada fila. La alternativa —dos contenedores con el scroll vertical
          sincronizado a mano— es la fuente clásica de filas desalineadas medio píxel. */}
      <div
        ref={scrollerRef}
        className="relative min-h-0 flex-1 overflow-auto outline-none [scrollbar-width:thin]"
        tabIndex={0}
        onKeyDown={(evento) => {
          if (evento.key === 'ArrowDown') {
            evento.preventDefault()
            mover(1)
          } else if (evento.key === 'ArrowUp') {
            evento.preventDefault()
            mover(-1)
          }
        }}
      >
        <div className="relative" style={{ width: ANCHO_LABEL + anchoCanvas }}>
          {/* Regla */}
          <div
            className="sticky top-0 z-30 flex border-b border-border bg-background"
            style={{ height: ALTO_REGLA }}
          >
            <div
              className="sticky left-0 z-10 flex shrink-0 items-center border-r border-border bg-background px-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
              style={{ width: ANCHO_LABEL }}
            >
              Parada
            </div>
            <div className="relative shrink-0" style={{ width: anchoCanvas }}>
              {ticks.map((min) => (
                <div
                  key={min}
                  className={cn('absolute bottom-0 w-px', min % paso === 0 ? 'bg-border' : 'bg-border/60')}
                  style={{ left: x(min), height: min % paso === 0 ? 8 : 4 }}
                />
              ))}
              {mayores.map((min) => (
                <span
                  key={`rot-${min}`}
                  className="absolute top-1.5 whitespace-nowrap text-[10px] font-medium tabular-nums text-muted-foreground"
                  style={{ left: x(min) + 4 }}
                >
                  {horaDeEje(min)}
                </span>
              ))}
            </div>
          </div>

          {/* Grilla vertical y playhead, detrás de las barras y por debajo de la columna congelada. */}
          <div
            className="pointer-events-none absolute z-0"
            style={{ top: ALTO_REGLA, left: ANCHO_LABEL, width: anchoCanvas, height: altoFilas }}
          >
            {mayores.map((min) => (
              <div key={`g-${min}`} className="absolute inset-y-0 w-px bg-border/40" style={{ left: x(min) }} />
            ))}
            {linea.ahoraMin !== null && (
              <div className="absolute inset-y-0 w-px bg-primary/70" style={{ left: x(linea.ahoraMin) }}>
                <span className="absolute -top-0 left-0 -translate-x-1/2 rounded-b-sm bg-primary px-1 py-px text-[9px] font-medium text-primary-foreground">
                  ahora
                </span>
              </div>
            )}
          </div>

          {/* Salida del depósito. Es una fila más y no un adorno del encabezado: la demora de rampa es
              el desvío que más pesa del día porque se arrastra hasta la última parada. */}
          <FilaHito
            icono={Warehouse}
            titulo="Salida del depósito"
            subtitulo="Inicio del viaje"
            planMin={linea.salidaPlanMin}
            realMin={linea.salidaRealMin}
            x={x}
            anchoCanvas={anchoCanvas}
          />

          {linea.hitos.map((h) => (
            <FilaParada
              key={h.secuencia}
              hito={h}
              x={x}
              px={px}
              t0={t0}
              t1={t1}
              ahoraMin={linea.ahoraMin}
              anchoCanvas={anchoCanvas}
              activo={h.secuencia === seleccion}
              onSeleccionar={() => onSeleccionar(h.secuencia)}
            />
          ))}

          <FilaHito
            icono={Flag}
            titulo="Retorno al depósito"
            subtitulo={linea.cierreRealMin === null ? 'Todavía en ruta' : 'Viaje cerrado'}
            planMin={linea.cierrePlanMin}
            realMin={linea.cierreRealMin}
            x={x}
            anchoCanvas={anchoCanvas}
          />
        </div>
      </div>

      {/* ── Parada seleccionada ──────────────────────────────────────────────────────────── */}
      <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-muted/30 px-4 py-1.5 text-xs">
        {hito ? (
          <>
            <span className="font-medium text-foreground">
              #{hito.secuencia} {hito.cliente}
            </span>
            <span className="truncate text-muted-foreground">{hito.puntoEntrega}</span>
            {hito.fueraDeOrden && (
              <span
                className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-px text-[10px] font-medium text-amber-600 dark:text-amber-400"
                title="El chofer la visitó en otro momento del recorrido"
              >
                visitada {hito.secuenciaEjecutada}.ª
              </span>
            )}
            <span className="tabular-nums text-muted-foreground">
              ventana {hito.ventana}
            </span>
            {hito.incidencias > 0 && (
              <span className="flex items-center gap-1 font-medium text-destructive">
                <AlertTriangle className="size-3.5" />
                {hito.incidencias}
              </span>
            )}
            <EstadoEntregaBadge estado={hito.estado} className="ml-auto" />
          </>
        ) : (
          <span className="text-muted-foreground">Elegí una parada.</span>
        )}
      </div>
    </div>
  )
}

/**
 * El zoom, en estado y en ref a la vez. El ref existe para que el listener nativo de la rueda lea el
 * valor fresco sin tener que volver a suscribirse en cada cambio de zoom — re-suscribir un listener
 * `wheel` en pleno gesto pierde eventos.
 */
function usePxEstado(ref: { current: number }) {
  const [px, setPxInterno] = useState(ref.current)
  const setPx = useCallback(
    (valor: number) => {
      ref.current = valor
      setPxInterno(valor)
    },
    [ref],
  )
  return [px, setPx] as const
}

/** La celda congelada de la izquierda. Es lo que hace que el Gantt se lea sin tocar el zoom. */
function Etiqueta({
  children,
  activo,
  onClick,
}: {
  children: React.ReactNode
  activo?: boolean
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-border px-2',
        onClick && 'cursor-pointer',
        activo ? 'bg-primary/10' : 'bg-background',
      )}
      style={{ width: ANCHO_LABEL }}
    >
      {children}
    </div>
  )
}

/** Las dos horas de la fila, alineadas a la derecha de la etiqueta: plan arriba, real abajo. */
function Horas({ plan, real, desvio }: { plan: number; real: number | null; desvio: number | null }) {
  const meta = desvio === null ? null : TIER_DESVIO[tierDe(desvio)]
  return (
    <div className="shrink-0 text-right leading-tight">
      <div className="text-[10px] tabular-nums text-muted-foreground">{horaDeEje(plan)}</div>
      <div className={cn('text-[11px] font-semibold tabular-nums', meta ? meta.texto : 'text-muted-foreground')}>
        {real === null ? '—' : horaDeEje(real)}
      </div>
    </div>
  )
}

/**
 * Una fila de hito puntual: la salida del depósito y el retorno. No tienen duración —son un instante—
 * así que se dibujan como marcas y no como barras.
 */
function FilaHito({
  icono: Icono,
  titulo,
  subtitulo,
  planMin,
  realMin,
  x,
  anchoCanvas,
}: {
  icono: typeof Warehouse
  titulo: string
  subtitulo: string
  planMin: number
  realMin: number | null
  x: (min: number) => number
  anchoCanvas: number
}) {
  const desvio = realMin === null ? null : realMin - planMin
  return (
    <div className="flex border-b border-border/60 bg-muted/20" style={{ height: ALTO_FILA }}>
      <Etiqueta>
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-background">
          <Icono className="size-3 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-foreground">{titulo}</div>
          <div className="truncate text-[10px] text-muted-foreground">{subtitulo}</div>
        </div>
        <Horas plan={planMin} real={realMin} desvio={desvio} />
      </Etiqueta>

      <div className="relative shrink-0" style={{ width: anchoCanvas }}>
        <Marca izquierda={x(planMin)} top={PLAN_TOP - 1} clase="bg-muted-foreground/60" />
        {realMin !== null && desvio !== null && (
          <>
            <Conector desde={x(planMin)} hasta={x(realMin)} desvio={desvio} />
            <Marca izquierda={x(realMin)} top={REAL_TOP} clase="" color={TIER_DESVIO[tierDe(desvio)].color} />
          </>
        )}
      </div>
    </div>
  )
}

/** Una marca vertical: un instante sobre el eje. */
function Marca({
  izquierda,
  top,
  clase,
  color,
}: {
  izquierda: number
  top: number
  clase: string
  color?: string
}) {
  return (
    <div
      className={cn('absolute w-0.5 rounded-full', clase)}
      style={{ left: izquierda, top, height: PLAN_ALTO + 6, backgroundColor: color }}
    />
  )
}

/**
 * El puente entre el plan y lo real: su LARGO es el desvío, con la etiqueta al lado. Es el elemento que
 * contesta la pregunta de la pantalla sin que haya que restar dos horas mentalmente.
 */
function Conector({ desde, hasta, desvio }: { desde: number; hasta: number; desvio: number }) {
  const meta = TIER_DESVIO[tierDe(desvio)]
  const izquierda = Math.min(desde, hasta)
  const ancho = Math.abs(hasta - desde)
  if (ancho < 2) return null
  return (
    <div className="absolute" style={{ left: izquierda, width: ancho, top: PLAN_TOP + PLAN_ALTO + 2 }}>
      <div className="h-0.5 rounded-full opacity-70" style={{ backgroundColor: meta.color }} />
      <span
        className={cn(
          'absolute -top-[7px] whitespace-nowrap text-[9px] font-semibold tabular-nums',
          meta.texto,
          desvio > 0 ? 'left-full ml-1' : 'right-full mr-1',
        )}
      >
        {desvioTexto(desvio)}
      </span>
    </div>
  )
}

function FilaParada({
  hito,
  x,
  px,
  t0,
  t1,
  ahoraMin,
  anchoCanvas,
  activo,
  onSeleccionar,
}: {
  hito: HitoLineaTiempo
  x: (min: number) => number
  px: number
  t0: number
  t1: number
  ahoraMin: number | null
  anchoCanvas: number
  activo: boolean
  onSeleccionar: () => void
}) {
  const meta = ESTADO_ENTREGA[hito.estado]
  const color = colorDe(hito)
  const llegoYa = hito.realLlegada !== null
  // Una parada abierta (llegó y no cerró) se estira hasta el presente: la barra CRECE mientras el
  // camión sigue ahí, que es exactamente lo que está pasando.
  const finReal =
    hito.realCierre ?? (llegoYa ? Math.max(ahoraMin ?? hito.realLlegada!, hito.realLlegada!) : null)

  // La ventana del cliente por fin se puede dibujar: cada fila tiene su propio carril, así que ya no
  // se superponen entre sí como pasaba con todas las paradas sobre un eje compartido.
  const ventana =
    hito.ventanaDesde !== null && hito.ventanaHasta !== null && hito.ventanaHasta > t0 && hito.ventanaDesde < t1
      ? { desde: x(Math.max(hito.ventanaDesde, t0)), hasta: x(Math.min(hito.ventanaHasta, t1)) }
      : null

  const ayuda = [
    `Parada ${hito.secuencia} · ${hito.cliente}`,
    hito.puntoEntrega,
    hito.fueraDeOrden ? `Visitada en el puesto ${hito.secuenciaEjecutada} del recorrido` : null,
    `${meta.label}${hito.fueraDeVentana ? ' · fuera de la ventana' : ''}`,
    `Ventana comprometida: ${hito.ventana}`,
    `Plan: ${horaDeEje(hito.planLlegada)}`,
    `Real: ${llegoYa ? horaDeEje(hito.realLlegada as number) : 'sin llegar'}`,
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <div
      className={cn('flex border-b border-border/60', activo && 'bg-primary/[0.04]')}
      style={{ height: ALTO_FILA }}
    >
      <Etiqueta activo={activo} onClick={onSeleccionar}>
        {/* El número es el ORDEN DE ENTREGA. Cuando el ejecutado no coincide con el planificado, el
            anillo ámbar lo señala — es el círculo que logística dibujó a mano alrededor del ③ y el ②. */}
        <span
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold tabular-nums',
            hito.fueraDeOrden && 'ring-2 ring-amber-500 ring-offset-1 ring-offset-background',
          )}
          style={{ backgroundColor: `${color}1f`, borderColor: color, color }}
          title={
            hito.fueraDeOrden
              ? `Planificada ${hito.secuencia}.ª, visitada ${hito.secuenciaEjecutada}.ª`
              : undefined
          }
        >
          {meta.simbolo ?? hito.secuencia}
        </span>
        <div className="min-w-0 flex-1" title={ayuda}>
          <div className="truncate text-xs font-medium text-foreground">{hito.cliente}</div>
          <div className="truncate text-[10px] text-muted-foreground">{hito.puntoEntrega}</div>
        </div>
        <Horas plan={hito.planLlegada} real={hito.realLlegada} desvio={hito.desvioLlegada} />
      </Etiqueta>

      <div className="relative shrink-0" style={{ width: anchoCanvas }} title={ayuda}>
        {ventana && (
          <div
            className={cn(
              'absolute inset-y-1 rounded-sm border-x border-dashed',
              hito.fueraDeVentana
                ? 'border-destructive/40 bg-destructive/[0.07]'
                : 'border-border bg-foreground/[0.04]',
            )}
            style={{ left: ventana.desde, width: Math.max(ventana.hasta - ventana.desde, 2) }}
          />
        )}

        {/* Línea base: el plan. Fina y arriba, como el baseline de un Gantt. */}
        <div
          className="absolute rounded-full bg-muted-foreground/45"
          style={{
            left: x(hito.planLlegada),
            top: PLAN_TOP,
            height: PLAN_ALTO,
            width: Math.max((hito.planCierre - hito.planLlegada) * px, ANCHO_MIN_BARRA),
          }}
        />

        {llegoYa && hito.desvioLlegada !== null && (
          <Conector desde={x(hito.planLlegada)} hasta={x(hito.realLlegada as number)} desvio={hito.desvioLlegada} />
        )}

        {/* La barra real. Su ANCHO es `delivered_at − arrived_at`: cuánto estuvo el camión parado ahí. */}
        {llegoYa ? (
          <button
            type="button"
            onClick={onSeleccionar}
            className={cn(
              'absolute cursor-pointer rounded-[3px] border transition-transform hover:scale-y-110',
              hito.realCierre === null && 'border-dashed',
              activo && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
            )}
            style={{
              left: x(hito.realLlegada as number),
              top: REAL_TOP,
              height: REAL_ALTO,
              width: Math.max(((finReal as number) - (hito.realLlegada as number)) * px, ANCHO_MIN_BARRA),
              backgroundColor: `${color}59`,
              borderColor: color,
            }}
          />
        ) : (
          // Sin llegada todavía: un fantasma en la posición del plan. El hueco vacío haría parecer que
          // la parada no existe; esto dice "falta, y se esperaba acá".
          <div
            className="absolute rounded-[3px] border border-dashed"
            style={{
              left: x(hito.planLlegada),
              top: REAL_TOP,
              height: REAL_ALTO,
              width: Math.max((hito.planCierre - hito.planLlegada) * px, ANCHO_MIN_BARRA),
              borderColor: COLOR_PENDIENTE,
            }}
          />
        )}

        {hito.incidencias > 0 && llegoYa && (
          <AlertTriangle
            className="absolute size-3 text-destructive"
            style={{ left: x(hito.realLlegada as number) - 14, top: REAL_TOP }}
          />
        )}
      </div>
    </div>
  )
}
