// Ruta PLANIFICADA contra ruta EJECUTADA, en dos líneas paralelas.
//
// Es el "parallel timeline" clásico —dos ejes de tiempo apilados, hitos numerados y conectores entre
// los pares— y es literalmente lo que logística dibujó a mano. Llegar acá costó dos intentos fallidos
// que vale la pena dejar escritos para no repetirlos:
//
//   1. Timeline estilo editor de video (CapCut). Mismo concepto de dos carriles, pero con TODO metido
//      en dos franjas de 40 px: los hitos eran bloques de 15 px sin lugar para una hora, así que había
//      que hacer zoom para leer cualquier cosa. El concepto estaba bien; la densidad, mal.
//   2. Gantt de una fila por parada. Legible pero equivocado de forma: con 23 paradas hay que scrollear
//      vertical, el viaje deja de verse de un vistazo y, sobre todo, SE PIERDE EL CRUCE — que es el
//      dato que más importa.
//
// EL CRUCE. Cuando el chofer visita la parada 3 antes que la 2, sus conectores se cruzan: el de la 2
// baja hacia la derecha y el de la 3 baja hacia la izquierda. Esa X es la lectura más rápida que hay de
// un resecuenciamiento, y ninguna tabla ni ningún Gantt la pueden mostrar. Es exactamente lo que
// logística encerró a mano con un círculo en su dibujo.
//
// Lo que hace que esta vez SÍ se lea, que es donde falló el intento 1:
//   · TODO EL VIAJE ENTRA SIN SCROLL VERTICAL. Dos líneas y punto, sin importar si son 4 paradas o 23.
//   · LAS HORAS SE VEN SIEMPRE. Van fuera de la línea —arriba en el plan, abajo en lo ejecutado— y
//     alternadas en dos filas, que es el truco de los timelines de presentación: duplica el ancho
//     disponible por etiqueta y deja de haber colisiones a zoom de ajuste.
//   · LA BANDA DEL MEDIO ESTÁ LIMPIA. Solo conectores. Los círculos y las etiquetas quedan del lado de
//     afuera de cada línea, así que las diagonales no cruzan texto.
//   · El zoom quedó de accesorio (Ctrl + rueda), no de requisito.
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

// ── Geometría vertical ───────────────────────────────────────────────────────────────────────
// De arriba abajo: regla · horas del plan · círculos del plan · LÍNEA PLAN · conectores · LÍNEA REAL ·
// círculos de lo ejecutado · horas de lo ejecutado. Los números son absolutos y no proporciones porque
// el eje horizontal ya es elástico: si además el alto respirara, dos hitos a distinto zoom dejarían de
// ser comparables.
const ALTO_REGLA = 26
const ALTO_ETIQUETAS = 28
const ALTO_CIRCULOS = 26
const ALTO_CONECTORES = 54
const Y_ETIQUETAS_PLAN = ALTO_REGLA + 4
const Y_CIRCULOS_PLAN = Y_ETIQUETAS_PLAN + ALTO_ETIQUETAS
const Y_LINEA_PLAN = Y_CIRCULOS_PLAN + ALTO_CIRCULOS + 2
const Y_LINEA_REAL = Y_LINEA_PLAN + ALTO_CONECTORES
const Y_CIRCULOS_REAL = Y_LINEA_REAL + 4
const Y_ETIQUETAS_REAL = Y_CIRCULOS_REAL + ALTO_CIRCULOS
const ALTO_TOTAL = Y_ETIQUETAS_REAL + ALTO_ETIQUETAS + 8

const DIAMETRO = 24
/** Alto de cada una de las dos filas de horas alternadas. */
const ALTO_FILA_ETIQUETA = 13
/** Ancho que ocupa una hora "HH:MM" a 10 px, más aire. Es lo que decide si dos etiquetas chocan. */
const ANCHO_ETIQUETA = 38

const COLCHON_IZQ = 26
const COLCHON_DER = 34

const PX_MIN = 0.3
const PX_MAX = 26
const SENSIBILIDAD_RUEDA = 0.0022

const acotar = (valor: number, min: number, max: number) => Math.min(Math.max(valor, min), max)

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

/**
 * Reparte etiquetas en dos filas para que no se pisen.
 *
 * Es el truco de los timelines de presentación: alternar arriba/abajo duplica el ancho disponible por
 * etiqueta. Se recorre de izquierda a derecha y cada una va a la primera fila donde entre; si no entra
 * en ninguna, se oculta y la hora queda disponible en el tooltip y en el pie. Ocultar es preferible a
 * dibujar dos horas encimadas, que no se leen ni por separado.
 */
function repartirEtiquetas(posiciones: number[]): (0 | 1 | null)[] {
  const finDeFila = [-Infinity, -Infinity]
  return posiciones.map((centro) => {
    const izquierda = centro - ANCHO_ETIQUETA / 2
    for (const fila of [0, 1] as const) {
      if (izquierda >= finDeFila[fila]) {
        finDeFila[fila] = centro + ANCHO_ETIQUETA / 2
        return fila
      }
    }
    return null
  })
}

export function RutaParalela({
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
  const arrastreRef = useRef<{ x: number; scroll: number; movio: boolean } | null>(null)
  const pxRef = useRef(2)
  const [px, setPx] = usePxEstado(pxRef)

  const x = useCallback((min: number) => (min - t0) * px, [t0, px])
  const ancho = Math.max(span * px, 320)

  const paso = pasoRegla(px)
  const menor = pasoMenor(paso)
  /** Con los hitos muy juntos los círculos se pisan; ahí se degradan a puntos y las horas desaparecen. */
  const conCirculos = 25 * px >= DIAMETRO + 2

  const hito = useMemo(
    () => linea.hitos.find((h) => h.secuencia === seleccion) ?? null,
    [linea.hitos, seleccion],
  )

  /**
   * Las paradas ordenadas por su hora REAL. Es el orden en que se dibujan los hitos de la línea de
   * abajo y el que hace que los conectores se crucen cuando el chofer se salteó una parada.
   */
  const enOrdenReal = useMemo(
    () =>
      linea.hitos
        .filter((h) => h.realLlegada !== null)
        .sort((a, b) => (a.realLlegada as number) - (b.realLlegada as number)),
    [linea.hitos],
  )

  const filasPlan = useMemo(
    () => repartirEtiquetas([x(linea.salidaPlanMin), ...linea.hitos.map((h) => x(h.planLlegada)), x(linea.cierrePlanMin)]),
    [linea.hitos, linea.salidaPlanMin, linea.cierrePlanMin, x],
  )
  const filasReal = useMemo(
    () =>
      repartirEtiquetas([
        x(linea.salidaRealMin),
        ...enOrdenReal.map((h) => x(h.realLlegada as number)),
        ...(linea.cierreRealMin === null ? [] : [x(linea.cierreRealMin)]),
      ]),
    [enOrdenReal, linea.salidaRealMin, linea.cierreRealMin, x],
  )

  const zoomAnclado = useCallback(
    (destino: number, clienteX?: number) => {
      const el = scrollerRef.current
      if (!el) return
      const caja = el.getBoundingClientRect()
      const offset = clienteX === undefined ? el.clientWidth / 2 : clienteX - caja.left
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
    setPx(acotar((el.clientWidth - 12) / span, PX_MIN, PX_MAX))
    el.scrollLeft = 0
  }, [span, setPx])

  // El encuadre inicial muestra el viaje ENTERO, que es la premisa de esta vista: se abre y se ve todo.
  // El ResizeObserver es porque el diálogo mide 0 hasta que monta el portal.
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

  // Ctrl + rueda acerca; la rueda sola no se toca. Acá no hay scroll vertical que robar, pero
  // secuestrar la rueda igual sorprende — y es el gesto que ya se corrigió una vez.
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

  const mover = useCallback(
    (delta: number) => {
      const indice = linea.hitos.findIndex((h) => h.secuencia === seleccion)
      const siguiente = linea.hitos[acotar(indice + delta, 0, linea.hitos.length - 1)]
      if (!siguiente) return
      onSeleccionar(siguiente.secuencia)
      const el = scrollerRef.current
      if (!el) return
      const centro = x(siguiente.realLlegada ?? siguiente.planLlegada)
      if (centro < el.scrollLeft + 60 || centro > el.scrollLeft + el.clientWidth - 60) {
        el.scrollLeft = centro - el.clientWidth / 2
      }
    },
    [linea.hitos, seleccion, onSeleccionar, x],
  )

  const ticks = useMemo(() => {
    const marcas: number[] = []
    for (let m = Math.ceil(t0 / menor) * menor; m <= t1; m += menor) marcas.push(m)
    return marcas
  }, [t0, t1, menor])
  const mayores = useMemo(() => ticks.filter((m) => m % paso === 0), [ticks, paso])

  const seleccionar = (secuencia: number) => {
    if (!arrastreRef.current?.movio) onSeleccionar(secuencia)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── Barra de herramientas ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {TIERS_DESVIO.map((tier) => (
            <span key={tier} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: TIER_DESVIO[tier].color }} />
              {TIER_DESVIO[tier].corto}
            </span>
          ))}
          {linea.fueraDeOrden > 0 && (
            <span
              className="flex items-center gap-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-400"
              title="Paradas visitadas fuera del orden planificado. Sus conectores se cruzan."
            >
              <span className="size-2.5 rounded-full ring-2 ring-amber-500" />
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

      {/* ── Las dos líneas ───────────────────────────────────────────────────────────────── */}
      <div
        className="relative min-h-0 flex-1 overflow-hidden outline-none"
        tabIndex={0}
        onKeyDown={(evento) => {
          if (evento.key === 'ArrowRight') {
            evento.preventDefault()
            mover(1)
          } else if (evento.key === 'ArrowLeft') {
            evento.preventDefault()
            mover(-1)
          }
        }}
      >
        {/* Los nombres de las dos líneas van FLOTANDO sobre el scroller y no dentro: así no consumen
            ancho del eje y siguen visibles con el eje desplazado. */}
        <span
          className="pointer-events-none absolute left-3 z-20 rounded bg-background/85 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur-sm"
          style={{ top: Y_LINEA_PLAN - 20 }}
        >
          Planificado
        </span>
        <span
          className="pointer-events-none absolute left-3 z-20 rounded bg-background/85 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground backdrop-blur-sm"
          style={{ top: Y_LINEA_REAL + 6 }}
        >
          Ejecutado
        </span>

        <div
          ref={scrollerRef}
          className="h-full cursor-grab overflow-x-auto overflow-y-auto overscroll-x-contain active:cursor-grabbing [scrollbar-width:thin]"
          onPointerDown={(evento) => {
            if (evento.button !== 0) return
            const el = scrollerRef.current
            if (!el) return
            arrastreRef.current = { x: evento.clientX, scroll: el.scrollLeft, movio: false }
          }}
          onPointerMove={(evento) => {
            const arrastre = arrastreRef.current
            const el = scrollerRef.current
            if (!arrastre || !el) return
            const dx = evento.clientX - arrastre.x
            // Umbral de 4 px: sin él, el temblor de un click sobre un hito contaría como arrastre.
            if (!arrastre.movio && Math.abs(dx) < 4) return
            arrastre.movio = true
            el.scrollLeft = arrastre.scroll - dx
          }}
          onPointerUp={() => {
            // El flag se limpia en el próximo tick: el `click` del hito se dispara después del
            // `pointerup` y necesita saber si vino de un arrastre.
            const arrastre = arrastreRef.current
            if (arrastre?.movio) setTimeout(() => (arrastreRef.current = null), 0)
            else arrastreRef.current = null
          }}
          onPointerLeave={() => {
            arrastreRef.current = null
          }}
        >
          <div className="relative select-none" style={{ width: ancho, height: ALTO_TOTAL }}>
            {/* Grilla vertical, detrás de todo. */}
            {mayores.map((min) => (
              <div
                key={`g-${min}`}
                className="pointer-events-none absolute w-px bg-border/40"
                style={{ left: x(min), top: ALTO_REGLA, bottom: 0 }}
              />
            ))}

            {/* Regla */}
            <div className="absolute inset-x-0 top-0 border-b border-border" style={{ height: ALTO_REGLA }}>
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
                  className="absolute top-1 whitespace-nowrap text-[10px] font-medium tabular-nums text-muted-foreground"
                  style={{ left: x(min) + 4 }}
                >
                  {horaDeEje(min)}
                </span>
              ))}
            </div>

            {/* Las dos líneas de tiempo */}
            <div
              className="absolute h-0.5 rounded-full bg-muted-foreground/35"
              style={{ top: Y_LINEA_PLAN, left: x(linea.salidaPlanMin), width: Math.max((linea.cierrePlanMin - linea.salidaPlanMin) * px, 2) }}
            />
            <div
              className="absolute h-0.5 rounded-full bg-foreground/50"
              style={{
                top: Y_LINEA_REAL,
                left: x(linea.salidaRealMin),
                width: Math.max(
                  ((linea.cierreRealMin ?? linea.ahoraMin ?? linea.salidaRealMin) - linea.salidaRealMin) * px,
                  2,
                ),
              }}
            />

            {/* ── Conectores ──
                En SVG y no en divs porque son DIAGONALES: con divs habría que rotarlas y el largo real
                dejaría de coincidir con el desvío. Y son el elemento central de la vista — cuando dos
                se cruzan, el chofer cambió el orden de visita. */}
            <svg
              className="pointer-events-none absolute"
              style={{ top: Y_LINEA_PLAN, left: 0, width: ancho, height: ALTO_CONECTORES }}
              width={ancho}
              height={ALTO_CONECTORES}
            >
              {linea.demoraSalidaMin !== 0 && (
                <Conector
                  desde={x(linea.salidaPlanMin)}
                  hasta={x(linea.salidaRealMin)}
                  desvio={linea.demoraSalidaMin}
                  activo={false}
                />
              )}
              {linea.hitos.map((h) =>
                h.realLlegada === null || h.desvioLlegada === null ? null : (
                  <Conector
                    key={h.secuencia}
                    desde={x(h.planLlegada)}
                    hasta={x(h.realLlegada)}
                    desvio={h.desvioLlegada}
                    activo={h.secuencia === seleccion}
                  />
                ),
              )}
              {linea.cierreRealMin !== null && (
                <Conector
                  desde={x(linea.cierrePlanMin)}
                  hasta={x(linea.cierreRealMin)}
                  desvio={linea.cierreRealMin - linea.cierrePlanMin}
                  activo={false}
                />
              )}
            </svg>

            {/* ── Hitos del PLAN: círculos arriba de la línea, horas arriba de los círculos ── */}
            <Extremo
              icono={Warehouse}
              centro={x(linea.salidaPlanMin)}
              yCirculo={Y_CIRCULOS_PLAN}
              yEtiqueta={Y_ETIQUETAS_PLAN}
              fila={filasPlan[0]}
              hora={horaDeEje(linea.salidaPlanMin)}
              ayuda={`Salida planificada · ${horaDeEje(linea.salidaPlanMin)}`}
            />
            {linea.hitos.map((h, i) => (
              <Hito
                key={h.secuencia}
                centro={x(h.planLlegada)}
                yCirculo={Y_CIRCULOS_PLAN}
                yEtiqueta={Y_ETIQUETAS_PLAN}
                fila={filasPlan[i + 1]}
                numero={h.secuencia}
                hora={horaDeEje(h.planLlegada)}
                conCirculo={conCirculos}
                activo={h.secuencia === seleccion}
                onClick={() => seleccionar(h.secuencia)}
                ayuda={`Parada ${h.secuencia} · ${h.cliente}\n${h.puntoEntrega}\nLlegada planificada: ${horaDeEje(h.planLlegada)}`}
              />
            ))}
            <Extremo
              icono={Flag}
              centro={x(linea.cierrePlanMin)}
              yCirculo={Y_CIRCULOS_PLAN}
              yEtiqueta={Y_ETIQUETAS_PLAN}
              fila={filasPlan[filasPlan.length - 1]}
              hora={horaDeEje(linea.cierrePlanMin)}
              ayuda={`Retorno planificado al depósito · ${horaDeEje(linea.cierrePlanMin)}`}
            />

            {/* ── Hitos EJECUTADOS: círculos abajo de la línea, horas abajo de los círculos ──
                Se dibujan en ORDEN REAL, así que un chofer que se salteó una parada deja los números
                desordenados sobre la línea. Es el mismo ①③② del dibujo de logística. */}
            <Extremo
              icono={Warehouse}
              centro={x(linea.salidaRealMin)}
              yCirculo={Y_CIRCULOS_REAL}
              yEtiqueta={Y_ETIQUETAS_REAL}
              fila={filasReal[0]}
              hora={horaDeEje(linea.salidaRealMin)}
              ayuda={`Salida real · ${horaDeEje(linea.salidaRealMin)}`}
              resaltado
            />
            {enOrdenReal.map((h, i) => (
              <Hito
                key={h.secuencia}
                centro={x(h.realLlegada as number)}
                yCirculo={Y_CIRCULOS_REAL}
                yEtiqueta={Y_ETIQUETAS_REAL}
                fila={filasReal[i + 1]}
                numero={h.secuencia}
                hora={horaDeEje(h.realLlegada as number)}
                conCirculo={conCirculos}
                activo={h.secuencia === seleccion}
                color={colorDe(h)}
                simbolo={ESTADO_ENTREGA[h.estado].simbolo}
                fueraDeOrden={h.fueraDeOrden}
                incidencias={h.incidencias}
                onClick={() => seleccionar(h.secuencia)}
                ayuda={[
                  `Parada ${h.secuencia} · ${h.cliente}`,
                  h.puntoEntrega,
                  h.fueraDeOrden ? `Visitada ${h.secuenciaEjecutada}.ª en vez de ${h.secuencia}.ª` : null,
                  `${ESTADO_ENTREGA[h.estado].label}${h.fueraDeVentana ? ' · fuera de la ventana' : ''}`,
                  `Ventana: ${h.ventana}`,
                  `Plan ${horaDeEje(h.planLlegada)} → real ${horaDeEje(h.realLlegada as number)} (${desvioTexto(h.desvioLlegada)})`,
                ]
                  .filter(Boolean)
                  .join('\n')}
              />
            ))}
            {linea.cierreRealMin !== null && (
              <Extremo
                icono={Flag}
                centro={x(linea.cierreRealMin)}
                yCirculo={Y_CIRCULOS_REAL}
                yEtiqueta={Y_ETIQUETAS_REAL}
                fila={filasReal[filasReal.length - 1]}
                hora={horaDeEje(linea.cierreRealMin)}
                ayuda={`Retorno real al depósito · ${horaDeEje(linea.cierreRealMin)}`}
                resaltado
              />
            )}

            {/* Las paradas que todavía no ocurrieron: fantasmas grises sobre la línea real, en la
                posición donde se las espera. El hueco vacío haría parecer que no existen. */}
            {linea.hitos
              .filter((h) => h.realLlegada === null)
              .map((h) => (
                <Hito
                  key={`f-${h.secuencia}`}
                  centro={x(h.planLlegada)}
                  yCirculo={Y_CIRCULOS_REAL}
                  yEtiqueta={Y_ETIQUETAS_REAL}
                  fila={null}
                  numero={h.secuencia}
                  hora={horaDeEje(h.planLlegada)}
                  conCirculo={conCirculos}
                  activo={h.secuencia === seleccion}
                  color={COLOR_PENDIENTE}
                  fantasma
                  onClick={() => seleccionar(h.secuencia)}
                  ayuda={`Parada ${h.secuencia} · ${h.cliente}\n${h.puntoEntrega}\n${ESTADO_ENTREGA[h.estado].label} — se espera a las ${horaDeEje(h.planLlegada)}`}
                />
              ))}

            {/* Playhead */}
            {linea.ahoraMin !== null && (
              <div
                className="pointer-events-none absolute w-px bg-primary/70"
                style={{ left: x(linea.ahoraMin), top: ALTO_REGLA, bottom: 0 }}
              >
                <span className="absolute top-0 left-0 -translate-x-1/2 rounded-b-sm bg-primary px-1 py-px text-[9px] font-medium text-primary-foreground">
                  ahora
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Parada seleccionada ──────────────────────────────────────────────────────────── */}
      {/* El nombre del cliente y el punto de entrega no entran sobre la línea a ningún zoom razonable,
          así que viven acá y en el tooltip. La línea lleva lo que sí se lee a escala: número y hora. */}
      <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-muted/30 px-4 py-1.5 text-xs">
        {hito ? (
          <>
            <span className="font-medium text-foreground">
              #{hito.secuencia} {hito.cliente}
            </span>
            <span className="truncate text-muted-foreground">{hito.puntoEntrega}</span>
            {hito.fueraDeOrden && (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-px text-[10px] font-medium text-amber-600 dark:text-amber-400">
                visitada {hito.secuenciaEjecutada}.ª
              </span>
            )}
            <span className="tabular-nums text-muted-foreground">
              plan {horaDeEje(hito.planLlegada)} → real{' '}
              {hito.realLlegada === null ? '—' : horaDeEje(hito.realLlegada)}
            </span>
            {hito.tier && (
              <span className={cn('font-semibold tabular-nums', TIER_DESVIO[hito.tier].texto)}>
                {desvioTexto(hito.desvioLlegada)}
              </span>
            )}
            <span className="tabular-nums text-muted-foreground">ventana {hito.ventana}</span>
            {hito.incidencias > 0 && (
              <span className="flex items-center gap-1 font-medium text-destructive">
                <AlertTriangle className="size-3.5" />
                {hito.incidencias}
              </span>
            )}
            <EstadoEntregaBadge estado={hito.estado} className="ml-auto" />
          </>
        ) : (
          <span className="text-muted-foreground">Elegí una parada en cualquiera de las dos líneas.</span>
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

/**
 * Una diagonal entre el hito planificado y el real. Coordenadas relativas a la banda del medio, que
 * empieza en la línea del plan (y = 0) y termina en la de lo ejecutado.
 */
function Conector({
  desde,
  hasta,
  desvio,
  activo,
}: {
  desde: number
  hasta: number
  desvio: number
  activo: boolean
}) {
  const meta = TIER_DESVIO[tierDe(desvio)]
  return (
    <g opacity={activo ? 1 : 0.55}>
      <line
        x1={desde}
        y1={0}
        x2={hasta}
        y2={ALTO_CONECTORES}
        stroke={meta.color}
        strokeWidth={activo ? 2.5 : 1.5}
        strokeLinecap="round"
      />
      {/* La etiqueta del desvío solo en el hito activo: dibujar las veinte convierte la banda en ruido
          y tapa justamente los cruces, que son lo que hay que ver. */}
      {activo && Math.abs(desvio) > 0 && (
        <text
          x={(desde + hasta) / 2 + 6}
          y={ALTO_CONECTORES / 2 + 3}
          fill={meta.color}
          fontSize={10}
          fontWeight={600}
        >
          {desvioTexto(desvio)}
        </text>
      )}
    </g>
  )
}

/** La hora debajo (o encima) del círculo, en la fila que le tocó del reparto. `null` = no entró. */
function Etiqueta({ y, fila, centro, hora }: { y: number; fila: 0 | 1 | null; centro: number; hora: string }) {
  if (fila === null) return null
  return (
    <span
      className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap text-[10px] tabular-nums text-muted-foreground"
      style={{ left: centro, top: y + fila * ALTO_FILA_ETIQUETA }}
    >
      {hora}
    </span>
  )
}

/** La salida del depósito y el retorno: un ícono en vez de un número. */
function Extremo({
  icono: Icono,
  centro,
  yCirculo,
  yEtiqueta,
  fila,
  hora,
  ayuda,
  resaltado,
}: {
  icono: typeof Warehouse
  centro: number
  yCirculo: number
  yEtiqueta: number
  fila: 0 | 1 | null
  hora: string
  ayuda: string
  resaltado?: boolean
}) {
  return (
    <>
      <span
        className={cn(
          'absolute flex -translate-x-1/2 items-center justify-center rounded-full border',
          resaltado ? 'border-foreground/50 bg-background' : 'border-border bg-background',
        )}
        style={{ left: centro, top: yCirculo, width: DIAMETRO, height: DIAMETRO }}
        title={ayuda}
      >
        <Icono className="size-3 text-muted-foreground" />
      </span>
      <Etiqueta y={yEtiqueta} fila={fila} centro={centro} hora={hora} />
    </>
  )
}

function Hito({
  centro,
  yCirculo,
  yEtiqueta,
  fila,
  numero,
  hora,
  conCirculo,
  activo,
  color,
  simbolo,
  fueraDeOrden,
  incidencias,
  fantasma,
  onClick,
  ayuda,
}: {
  centro: number
  yCirculo: number
  yEtiqueta: number
  fila: 0 | 1 | null
  numero: number
  hora: string
  conCirculo: boolean
  activo: boolean
  /** Sin color, el hito es del plan y va en gris. */
  color?: string
  simbolo?: string | null
  fueraDeOrden?: boolean
  incidencias?: number
  fantasma?: boolean
  onClick: () => void
  ayuda: string
}) {
  const alto = conCirculo ? DIAMETRO : 10
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        title={ayuda}
        className={cn(
          'absolute flex -translate-x-1/2 cursor-pointer items-center justify-center rounded-full border font-bold tabular-nums transition-transform hover:scale-110',
          conCirculo ? 'text-[10px]' : 'text-[0px]',
          fantasma && 'border-dashed',
          activo && 'z-10 scale-125 shadow-md',
          // El anillo ámbar marca la parada visitada fuera de orden. Es el círculo que logística dibujó
          // a mano alrededor del ③ y el ②, y el mismo dato que hace que su conector se cruce.
          fueraDeOrden && 'ring-2 ring-amber-500 ring-offset-1 ring-offset-background',
        )}
        style={{
          left: centro,
          top: yCirculo + (DIAMETRO - alto) / 2,
          width: alto,
          height: alto,
          backgroundColor: color ? (fantasma ? 'transparent' : `${color}26`) : 'var(--color-background)',
          borderColor: color ?? 'var(--color-muted-foreground)',
          color: color ?? 'var(--color-muted-foreground)',
        }}
      >
        {conCirculo && (simbolo ?? numero)}
      </button>
      {/* La incidencia se marca sobre el hito y no en el pie: es la razón por la que alguien va a hacer
          click, así que tiene que verse antes del click. */}
      {conCirculo && (incidencias ?? 0) > 0 && (
        <AlertTriangle
          className="pointer-events-none absolute size-3 text-destructive"
          style={{ left: centro + DIAMETRO / 2 - 4, top: yCirculo - 4 }}
        />
      )}
      <Etiqueta y={yEtiqueta} fila={fila} centro={centro} hora={hora} />
    </>
  )
}
