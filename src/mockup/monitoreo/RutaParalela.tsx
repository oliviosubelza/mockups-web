// Ruta PLANIFICADA contra ruta EJECUTADA, en dos líneas paralelas.
//
// Es el "parallel timeline" clásico —dos ejes de tiempo apilados con hitos numerados— y es lo que
// logística dibujó a mano. Llegar acá costó tres intentos; las razones de cada descarte quedan escritas
// para no repetirlos:
//
//   1. Timeline estilo editor de video (CapCut). Mismo concepto de dos carriles, pero con todo metido
//      en franjas de 40 px: hitos de 15 px sin lugar para una hora, así que había que hacer zoom para
//      leer cualquier cosa. El concepto estaba bien; la densidad, mal.
//   2. Gantt de una fila por parada. Legible, pero con 23 paradas hay que scrollear vertical y el viaje
//      deja de verse de un vistazo — que es justamente para lo que se abre esta pantalla.
//   3. Parallel timeline CON una diagonal por parada uniendo cada hito con su par. Las diagonales se
//      cruzan cuando el chofer se saltea una parada, y esa X delata el resecuenciamiento… pero veinte
//      diagonales son una maraña y obligan a INTERPRETAR UNA FIGURA en vez de leer un dato.
//
// Lo que quedó:
//   · El desvío va ESCRITO debajo de cada hora, en el color de su tier. Explícito, no interpretable, y
//     no se ensucia con veinte paradas.
//   · Un solo conector, el de la parada seleccionada, y en tres tramos (baja · cruza · baja) para que
//     el tramo horizontal SEA el desvío y se pueda medir contra la regla. Una diagonal mezcla el
//     corrimiento horizontal con la separación vertical entre líneas, que no significa nada.
//   · El resecuenciamiento se ve igual, y mejor: los hitos de abajo van en ORDEN REAL, así que la línea
//     dice ①③② — el mismo ①③② del dibujo a mano— y el anillo ámbar marca cuáles se corrieron.
//
// ZOOM. Alejar tiene fondo: el piso es el zoom con el que el viaje entero ya entra en la caja. Más
// atrás no aparece información nueva —el día ya se ve completo— y lo único que pasa es que el dibujo
// se aleja de una caja que no se achica. Acercar, en cambio, atraviesa tres escalones de densidad:
// círculo con número → círculo sin número → punto de color. A cada escalón se cae lo que ya no se lee
// y sobrevive el COLOR, que es lo que se lee de reojo.
//
// EL NÚMERO SIEMPRE ADENTRO DEL CÍRCULO. Hubo una versión que ponía el símbolo del estado (✓ ✕ ↩) en
// lugar del número cuando la parada estaba cerrada. Se veía bien y rompía la vista: sin número no se
// puede saber QUÉ parada es cada círculo, que es la mitad de lo que esta pantalla existe para mostrar
// ("orden de entrega" fue uno de los tres datos que pidió logística). El estado ya viaja en el COLOR, y
// el símbolo quedó como chapita al costado solo para los casos excepcionales — fallido y devuelto.
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
// De arriba abajo: regla · horas del plan · círculos del plan · LÍNEA PLAN · conector · LÍNEA REAL ·
// círculos ejecutados · horas + desvío. Los números son absolutos y no proporciones porque el eje
// horizontal ya es elástico: si además el alto respirara, dos hitos a distinto zoom dejarían de ser
// comparables.
const ANCHO_GUTTER = 100
const ALTO_REGLA = 30
/** Aire entre la regla y las horas del plan. Sin él las dos filas de horas se leen como una sola. */
const GAP_REGLA = 14
const ALTO_FILA_PLAN = 15
const ALTO_ETIQUETAS_PLAN = ALTO_FILA_PLAN * 2
const GAP_ETIQUETA = 8
const DIAMETRO = 26
const GAP_LINEA = 10
const ALTO_CONECTORES = 58
/** Abajo cada etiqueta lleva hora Y desvío, así que la fila mide el doble. */
const ALTO_FILA_REAL = 30
const ALTO_ETIQUETAS_REAL = ALTO_FILA_REAL * 2

const Y_ETIQUETAS_PLAN = ALTO_REGLA + GAP_REGLA
const Y_CIRCULOS_PLAN = Y_ETIQUETAS_PLAN + ALTO_ETIQUETAS_PLAN + GAP_ETIQUETA
const Y_LINEA_PLAN = Y_CIRCULOS_PLAN + DIAMETRO + GAP_LINEA
const Y_LINEA_REAL = Y_LINEA_PLAN + ALTO_CONECTORES
const Y_CIRCULOS_REAL = Y_LINEA_REAL + GAP_LINEA
const Y_ETIQUETAS_REAL = Y_CIRCULOS_REAL + DIAMETRO + GAP_ETIQUETA
const ALTO_TOTAL = Y_ETIQUETAS_REAL + ALTO_ETIQUETAS_REAL + 10
/** Lo que se le suma al scroller para que la barra horizontal no se coma la última fila de etiquetas. */
const ALTO_BARRA = 14

/** Ancho que ocupa una hora "HH:MM" a 10 px, más aire. Es lo que decide si dos etiquetas chocan. */
const ANCHO_ETIQUETA = 40
/** Separación mínima entre dos círculos consecutivos para que no se toquen. */
const SEPARACION_CIRCULOS = DIAMETRO + 8

const COLCHON_IZQ = 26
const COLCHON_DER = 40

/**
 * Piso absoluto del zoom. En la práctica casi nunca manda: el piso REAL es "entra todo" (ver
 * `pxMinimo`), y este valor solo aparece cuando todavía no se midió la caja.
 */
const PX_MIN = 0.3
const PX_MAX = 26

/**
 * Los tres tamaños del hito, de más a menos aire disponible.
 *
 * Alejar no puede significar "lo mismo pero ilegible": a cada escalón se cae lo que ya no se lee y
 * sobrevive lo que sí. Primero el número, después la hora, y al final queda el COLOR — que es el dato
 * que se lee de reojo y el único que sigue teniendo sentido a 3 px por hito.
 */
const DIAMETRO_CIRCULO = 15
const DIAMETRO_PUNTO = 9
type Densidad = 'numero' | 'circulo' | 'punto'
const DIAMETRO_DE: Record<Densidad, number> = {
  numero: DIAMETRO,
  circulo: DIAMETRO_CIRCULO,
  punto: DIAMETRO_PUNTO,
}
/**
 * Techo del zoom que el encuadre inicial puede elegir solo.
 *
 * Con muchas paradas juntas, exigir que NINGÚN par se toque puede pedir un zoom absurdo (dos entregas a
 * 3 minutos una de otra pedirían 11 px/min y el viaje entero mediría 20 pantallas). Pasado este techo
 * se acepta que ese par quede apretado y se deja que el usuario acerque a mano.
 */
const PX_AJUSTE_MAX = 6
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

/** El hueco más chico, en minutos, entre dos marcas consecutivas de una lista ya ordenada. */
function huecoMinimo(posiciones: number[]): number {
  let minimo = Infinity
  for (let i = 1; i < posiciones.length; i++) minimo = Math.min(minimo, posiciones[i] - posiciones[i - 1])
  return Number.isFinite(minimo) && minimo > 0 ? minimo : Infinity
}

/**
 * Reparte etiquetas en dos filas para que no se pisen.
 *
 * Es el truco de los timelines de presentación: alternar duplica el ancho disponible por etiqueta. Se
 * recorre de izquierda a derecha y cada una va a la primera fila donde entre; si no entra en ninguna se
 * oculta, y la hora queda en el tooltip y en el pie. Ocultar es preferible a dibujar dos horas
 * encimadas, que no se leen ni por separado.
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
  const arrastreRef = useRef<{
    x: number
    scroll: number
    movio: boolean
  } | null>(null)
  const pxRef = useRef(2)
  const [px, setPx] = usePxEstado(pxRef)

  /**
   * El ancho de la caja, medido. Hace falta en el render —no alcanza con leer el ref— porque de él
   * salen el piso del zoom y el ancho del lienzo, y los dos tienen que recalcularse al redimensionar.
   */
  const [anchoCaja, setAnchoCaja] = useState(0)

  /**
   * El zoom más chico que tiene sentido: aquel con el que el viaje entero ya entra en la caja.
   *
   * Alejar más allá de esto no muestra nada nuevo —el día ya se ve completo— y en cambio encoge el
   * dibujo contra una caja que no encoge: se termina leyendo un manchón de 300 px en una pantalla
   * vacía. El piso se mueve con la caja, así que achicar la ventana vuelve a apretar el eje en vez de
   * dejar el zoom viejo colgado.
   */
  const pxMinimo = useMemo(
    () => (anchoCaja > 0 ? Math.max(PX_MIN, (anchoCaja - 16) / span) : PX_MIN),
    [anchoCaja, span],
  )

  const x = useCallback((min: number) => (min - t0) * px, [t0, px])
  /**
   * El lienzo nunca mide menos que la caja.
   *
   * Con `width: auto`, un hijo flex se dimensiona a su contenido: si el lienzo se achicaba, la caja se
   * achicaba con él y el componente entero dejaba de ocupar la pantalla. Y como `span * px` es
   * fraccionario, el `scrollWidth` redondeaba para arriba contra un `clientWidth` redondeado para
   * abajo: 1 px de desborde y una barra de scroll fantasma, con el pulgar ocupando todo el riel.
   * `Math.ceil` mata ese píxel; el `Math.max` mantiene la regla y la grilla llegando hasta el borde.
   */
  const ancho = Math.max(Math.ceil(span * px), anchoCaja)

  const paso = pasoRegla(px)
  const menor = pasoMenor(paso)

  const hito = useMemo(
    () => linea.hitos.find((h) => h.secuencia === seleccion) ?? null,
    [linea.hitos, seleccion],
  )

  /**
   * Las paradas ordenadas por su hora REAL. Es el orden en que se dibujan los hitos de la línea de
   * abajo, y lo que hace que los números queden corridos cuando el chofer se saltea una parada.
   */
  const enOrdenReal = useMemo(
    () =>
      linea.hitos
        .filter((h) => h.realLlegada !== null)
        .sort((a, b) => (a.realLlegada as number) - (b.realLlegada as number)),
    [linea.hitos],
  )

  /** Las marcas de cada línea en minutos, ya ordenadas. De acá salen el reparto y el zoom mínimo. */
  const marcasPlan = useMemo(
    () => [linea.salidaPlanMin, ...linea.hitos.map((h) => h.planLlegada), linea.cierrePlanMin],
    [linea.hitos, linea.salidaPlanMin, linea.cierrePlanMin],
  )
  const marcasReal = useMemo(
    () => [
      linea.salidaRealMin,
      ...enOrdenReal.map((h) => h.realLlegada as number),
      ...(linea.cierreRealMin === null ? [] : [linea.cierreRealMin]),
    ],
    [enOrdenReal, linea.salidaRealMin, linea.cierreRealMin],
  )

  /**
   * El zoom mínimo con el que NINGÚN par de círculos se toca.
   *
   * Es la pieza que prepara la vista para viajes largos: con 22 paradas, ajustar al ancho de la
   * pantalla amontonaría los círculos hasta hacerlos ilegibles. En vez de eso, el encuadre inicial
   * respeta esta separación y deja que el eje se desplace — un viaje grande se recorre, no se aplasta.
   */
  const pxLegible = useMemo(() => {
    const hueco = Math.min(huecoMinimo(marcasPlan), huecoMinimo(marcasReal))
    return acotar(SEPARACION_CIRCULOS / hueco, PX_MIN, PX_AJUSTE_MAX)
  }, [marcasPlan, marcasReal])

  /**
   * En qué escalón de densidad está la vista, según el hueco más apretado del viaje.
   *
   * Se decide con el par MÁS JUNTO y no con el promedio: dos entregas a tres minutos una de otra son
   * las que se pisan, y basta un par pisado para que la línea se lea mal. Que el escalón sea único
   * para toda la línea es a propósito — círculos de dos tamaños en la misma fila se leen como dos
   * categorías de parada, que es exactamente lo que no son.
   */
  const huecoReal = useMemo(
    () => Math.min(huecoMinimo(marcasPlan), huecoMinimo(marcasReal)),
    [marcasPlan, marcasReal],
  )
  const densidad: Densidad =
    huecoReal * px >= DIAMETRO ? 'numero' : huecoReal * px >= DIAMETRO_CIRCULO ? 'circulo' : 'punto'
  /**
   * A escala de punto las etiquetas se apagan salvo la de la parada elegida.
   *
   * `repartirEtiquetas` ya oculta las que se pisan, pero con veinte hitos amontonados sobrevive una de
   * cada cinco y el resultado es peor que ninguna: horas sueltas que no se sabe a qué punto pertenecen.
   * La hora de la que importa sigue estando —abajo en el pie y en el tooltip—, así que no se pierde.
   */
  const soloEtiquetaActiva = densidad === 'punto'
  const filaSi = (fila: 0 | 1 | null, activo: boolean) => (soloEtiquetaActiva && !activo ? null : fila)

  const filasPlan = useMemo(() => repartirEtiquetas(marcasPlan.map(x)), [marcasPlan, x])
  const filasReal = useMemo(() => repartirEtiquetas(marcasReal.map(x)), [marcasReal, x])

  const zoomAnclado = useCallback(
    (destino: number, clienteX?: number) => {
      const el = scrollerRef.current
      if (!el) return
      const caja = el.getBoundingClientRect()
      const offset = clienteX === undefined ? el.clientWidth / 2 : clienteX - caja.left
      anclaRef.current = {
        min: (el.scrollLeft + offset) / pxRef.current + t0,
        offset,
      }
      setPx(acotar(destino, pxMinimo, PX_MAX))
    },
    [t0, pxMinimo, setPx],
  )

  // El scroll se corrige DESPUÉS del layout: en el handler todavía está el ancho viejo.
  useLayoutEffect(() => {
    const el = scrollerRef.current
    const ancla = anclaRef.current
    if (!el || !ancla) return
    anclaRef.current = null
    el.scrollLeft = (ancla.min - t0) * px - ancla.offset
  }, [px, t0])

  /** Comprime el viaje entero en el ancho disponible. Sirve para ver la FORMA del día de un vistazo. */
  const ajustar = useCallback(() => {
    const el = scrollerRef.current
    if (!el || el.clientWidth === 0) return
    setPx(acotar((el.clientWidth - 16) / span, pxMinimo, PX_MAX))
    el.scrollLeft = 0
  }, [span, pxMinimo, setPx])

  /**
   * El encuadre con el que se abre: el MÁXIMO entre "entra todo" y "se lee".
   *
   * Un viaje de 5 paradas entra entero y sobra lugar. Uno de 22 no entra sin amontonar los círculos, y
   * ahí gana la legibilidad: el eje se hace más ancho que la pantalla y se recorre. Un viaje grande se
   * recorre, no se aplasta — para aplastarlo está el botón de ajustar.
   */
  const encuadreInicial = useCallback(() => {
    const el = scrollerRef.current
    if (!el || el.clientWidth === 0) return
    setPx(acotar(Math.max((el.clientWidth - 16) / span, pxLegible), pxMinimo, PX_MAX))
    el.scrollLeft = 0
  }, [span, pxLegible, pxMinimo, setPx])

  // El ResizeObserver es porque el diálogo mide 0 hasta que monta el portal. Además de disparar el
  // encuadre inicial —una sola vez— deja el ancho medido en estado: de ahí sale el piso del zoom, que
  // tiene que seguir a la caja cuando el usuario redimensiona la ventana.
  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const observador = new ResizeObserver(() => {
      if (el.clientWidth === 0) return
      setAnchoCaja(el.clientWidth)
      if (ajustadoRef.current) return
      ajustadoRef.current = true
      encuadreInicial()
    })
    observador.observe(el)
    return () => observador.disconnect()
  }, [encuadreInicial])

  // Si la caja se agranda —o se achica— el piso se mueve y el zoom actual puede quedar por debajo.
  // Subirlo acá es lo que impide que quede un dibujo chiquito flotando en una caja grande.
  useLayoutEffect(() => {
    if (pxRef.current < pxMinimo) setPx(pxMinimo)
  }, [pxMinimo, setPx])

  // Ctrl + rueda acerca. La rueda sola no se toca: secuestrarla sorprende, y ya se corrigió una vez.
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
      if (centro < el.scrollLeft + 70 || centro > el.scrollLeft + el.clientWidth - 70) {
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
              title="Paradas visitadas fuera del orden planificado: en la línea de abajo su número queda corrido"
            >
              <span className="size-2.5 rounded-full ring-2 ring-amber-500" />
              {linea.fueraDeOrden} fuera de orden
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-1 hidden text-[11px] text-muted-foreground lg:inline">
            Ctrl + rueda acerca · botón del medio desplaza
          </span>
          {/* Deshabilitados en los topes: un botón que ya no hace nada y no lo dice se siente roto.
              Alejar toca fondo justo cuando el viaje entero entra — de ahí para atrás no hay nada más
              que ver. */}
          <Button
            size="icon-sm"
            variant="ghost"
            title="Alejar"
            disabled={px <= pxMinimo * 1.001}
            onClick={() => zoomAnclado(px / 1.6)}
          >
            <ZoomOut className="size-4" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            title="Acercar"
            disabled={px >= PX_MAX}
            onClick={() => zoomAnclado(px * 1.6)}
          >
            <ZoomIn className="size-4" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            title="Comprimir el viaje entero en la pantalla"
            onClick={ajustar}
          >
            <Maximize2 className="size-4" />
          </Button>
        </div>
      </div>

      {/* ── Las dos líneas ───────────────────────────────────────────────────────────────── */}
      {/* `items-center`: el bloque mide poco más de 270 px y el diálogo da bastante más. Centrado
          verticalmente queda equilibrado; pegado arriba dejaba media pantalla vacía debajo. */}
      <div
        className="flex min-h-0 flex-1 items-center overflow-hidden outline-none"
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
        {/* Los nombres de las dos líneas van en una columna PROPIA, fuera del scroller. Flotando encima
            del eje se superponían con el primer hito apenas el viaje empezaba cerca del borde. */}
        {/* Mismo alto que el scroller: el contenedor los centra a los dos por separado, así que con
            alturas distintas los rótulos quedarían corridos respecto de sus líneas. */}
        <div
          className="relative shrink-0 border-r border-border"
          style={{ width: ANCHO_GUTTER, height: ALTO_TOTAL + ALTO_BARRA }}
        >
          <span
            className="absolute right-3 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
            style={{ top: Y_LINEA_PLAN }}
          >
            Planificado
          </span>
          <span
            className="absolute right-3 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wide text-foreground"
            style={{ top: Y_LINEA_REAL }}
          >
            Ejecutado
          </span>
        </div>

        {/* `min-w-0 flex-1`: sin esto el scroller se dimensiona a su contenido y, apenas el lienzo mide
            menos que la pantalla, la caja se encoge con él y el componente entero deja de ocupar el
            ancho disponible. */}
        <div
          ref={scrollerRef}
          className="min-w-0 flex-1 cursor-grab overflow-x-auto overflow-y-hidden overscroll-x-contain active:cursor-grabbing [scrollbar-width:thin]"
          style={{ height: ALTO_TOTAL + ALTO_BARRA }}
          onPointerDown={(evento) => {
            // Botón izquierdo o BOTÓN DEL MEDIO. El del medio es el gesto de desplazar de toda la vida
            // en visores y editores; hay que frenarle el `preventDefault` para que Windows no dispare
            // su propio autoscroll encima.
            if (evento.button !== 0 && evento.button !== 1) return
            if (evento.button === 1) evento.preventDefault()
            const el = scrollerRef.current
            if (!el) return
            arrastreRef.current = {
              x: evento.clientX,
              scroll: el.scrollLeft,
              movio: false,
            }
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

            {/* Regla. Deliberadamente tenue y chica: es la ESCALA, no un dato. Las horas que importan
                son las de cada hito, y con los dos juegos del mismo tamaño se leían como una sola
                fila de números sin saber cuál era cuál. */}
            <div className="absolute inset-x-0 top-0 border-b border-border" style={{ height: ALTO_REGLA }}>
              {ticks.map((min) => (
                <div
                  key={min}
                  className={cn('absolute bottom-0 w-px', min % paso === 0 ? 'bg-border' : 'bg-border/60')}
                  style={{ left: x(min), height: min % paso === 0 ? 7 : 4 }}
                />
              ))}
              {mayores.map((min) => (
                <span
                  key={`rot-${min}`}
                  className="absolute top-1.5 whitespace-nowrap text-[9px] tabular-nums text-muted-foreground/70"
                  style={{ left: x(min) + 4 }}
                >
                  {horaDeEje(min)}
                </span>
              ))}
            </div>

            {/* Las dos líneas de tiempo */}
            <div
              className="absolute h-0.5 rounded-full bg-muted-foreground/35"
              style={{
                top: Y_LINEA_PLAN,
                left: x(linea.salidaPlanMin),
                width: Math.max((linea.cierrePlanMin - linea.salidaPlanMin) * px, 2),
              }}
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

            {/* El conector de la parada seleccionada, y solo esa. */}
            <svg
              className="pointer-events-none absolute"
              style={{ top: Y_LINEA_PLAN, left: 0 }}
              width={ancho}
              height={ALTO_CONECTORES}
            >
              {hito && hito.realLlegada !== null && hito.desvioLlegada !== null && (
                <Conector
                  desde={x(hito.planLlegada)}
                  hasta={x(hito.realLlegada)}
                  desvio={hito.desvioLlegada}
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
              altoFila={ALTO_FILA_PLAN}
              hora={horaDeEje(linea.salidaPlanMin)}
              ayuda={`Salida planificada · ${horaDeEje(linea.salidaPlanMin)}`}
            />
            {linea.hitos.map((h, i) => (
              <Hito
                key={h.secuencia}
                centro={x(h.planLlegada)}
                yCirculo={Y_CIRCULOS_PLAN}
                yEtiqueta={Y_ETIQUETAS_PLAN}
                fila={filaSi(filasPlan[i + 1], h.secuencia === seleccion)}
                altoFila={ALTO_FILA_PLAN}
                numero={h.secuencia}
                hora={horaDeEje(h.planLlegada)}
                densidad={densidad}
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
              altoFila={ALTO_FILA_PLAN}
              hora={horaDeEje(linea.cierrePlanMin)}
              ayuda={`Retorno planificado al depósito · ${horaDeEje(linea.cierrePlanMin)}`}
            />

            {/* ── Hitos EJECUTADOS: círculos abajo de la línea, hora + desvío abajo de los círculos ──
                Se dibujan en ORDEN REAL, así que un chofer que se salteó una parada deja los números
                corridos sobre la línea. Es el mismo ①③② del dibujo de logística. */}
            <Extremo
              icono={Warehouse}
              centro={x(linea.salidaRealMin)}
              yCirculo={Y_CIRCULOS_REAL}
              yEtiqueta={Y_ETIQUETAS_REAL}
              fila={filasReal[0]}
              altoFila={ALTO_FILA_REAL}
              hora={horaDeEje(linea.salidaRealMin)}
              desvio={linea.demoraSalidaMin}
              ayuda={`Salida real · ${horaDeEje(linea.salidaRealMin)}`}
              resaltado
            />
            {enOrdenReal.map((h, i) => (
              <Hito
                key={h.secuencia}
                centro={x(h.realLlegada as number)}
                yCirculo={Y_CIRCULOS_REAL}
                yEtiqueta={Y_ETIQUETAS_REAL}
                fila={filaSi(filasReal[i + 1], h.secuencia === seleccion)}
                altoFila={ALTO_FILA_REAL}
                numero={h.secuencia}
                hora={horaDeEje(h.realLlegada as number)}
                desvio={h.desvioLlegada}
                densidad={densidad}
                activo={h.secuencia === seleccion}
                color={colorDe(h)}
                simbolo={ESTADO_ENTREGA[h.estado].simbolo}
                excepcional={h.estado === 'fallido' || h.estado === 'devuelto'}
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
                altoFila={ALTO_FILA_REAL}
                hora={horaDeEje(linea.cierreRealMin)}
                desvio={linea.cierreRealMin - linea.cierrePlanMin}
                ayuda={`Retorno real al depósito · ${horaDeEje(linea.cierreRealMin)}`}
                resaltado
              />
            )}

            {/* Las paradas que todavía no ocurrieron: fantasmas en la posición donde se las espera. El
                hueco vacío haría parecer que no existen. Sin etiqueta: su hora ya está arriba, en el
                plan, y repetirla acá solo agrega números que compiten con los reales. */}
            {linea.hitos
              .filter((h) => h.realLlegada === null)
              .map((h) => (
                <Hito
                  key={`f-${h.secuencia}`}
                  centro={x(h.planLlegada)}
                  yCirculo={Y_CIRCULOS_REAL}
                  yEtiqueta={Y_ETIQUETAS_REAL}
                  fila={null}
                  altoFila={ALTO_FILA_REAL}
                  numero={h.secuencia}
                  hora={horaDeEje(h.planLlegada)}
                  densidad={densidad}
                  activo={h.secuencia === seleccion}
                  color={COLOR_PENDIENTE}
                  fantasma
                  onClick={() => seleccionar(h.secuencia)}
                  ayuda={`Parada ${h.secuencia} · ${h.cliente}\n${h.puntoEntrega}\n${ESTADO_ENTREGA[h.estado].label} — se espera a las ${horaDeEje(h.planLlegada)}`}
                />
              ))}

            {/* Playhead. La chapita va ABAJO: arriba tapaba una hora de la regla. */}
            {linea.ahoraMin !== null && (
              <div
                className="pointer-events-none absolute w-px bg-primary/70"
                style={{ left: x(linea.ahoraMin), top: ALTO_REGLA, bottom: 0 }}
              >
                <span className="absolute bottom-0 left-0 -translate-x-1/2 rounded-t-sm bg-primary px-1 py-px text-[9px] font-medium text-primary-foreground">
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
 * El puente entre el hito planificado y el real de la parada SELECCIONADA. Se dibuja uno solo.
 *
 * Va en tres tramos —baja, cruza, baja— porque así el tramo horizontal ES el desvío: su largo se puede
 * medir contra la regla de arriba. Una diagonal mezcla el corrimiento horizontal con la separación
 * vertical entre las dos líneas, que no significa nada.
 */
function Conector({ desde, hasta, desvio }: { desde: number; hasta: number; desvio: number }) {
  const meta = TIER_DESVIO[tierDe(desvio)]
  const medio = ALTO_CONECTORES / 2
  return (
    <g>
      <path
        d={`M ${desde} 0 L ${desde} ${medio} L ${hasta} ${medio} L ${hasta} ${ALTO_CONECTORES}`}
        fill="none"
        stroke={meta.color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {Math.abs(desvio) > 0 && (
        <text
          x={(desde + hasta) / 2}
          y={medio - 6}
          fill={meta.color}
          fontSize={10}
          fontWeight={700}
          textAnchor="middle"
        >
          {desvioTexto(desvio)}
        </text>
      )}
    </g>
  )
}

/**
 * La hora del hito, en la fila que le tocó del reparto. `null` = no entró y se oculta.
 *
 * Del lado ejecutado lleva además el DESVÍO escrito. Es el reemplazo de la telaraña de conectores:
 * decir "+12 min" en el color del tier es más directo que hacerle medir a alguien el largo de una
 * diagonal, y no se ensucia cuando hay veinte paradas.
 */
function Etiqueta({
  y,
  fila,
  altoFila,
  centro,
  hora,
  desvio,
}: {
  y: number
  fila: 0 | 1 | null
  altoFila: number
  centro: number
  hora: string
  desvio?: number | null
}) {
  if (fila === null) return null
  const meta = desvio === null || desvio === undefined ? null : TIER_DESVIO[tierDe(desvio)]
  return (
    <span
      className="pointer-events-none absolute flex -translate-x-1/2 flex-col items-center whitespace-nowrap leading-tight"
      style={{ left: centro, top: y + fila * altoFila }}
    >
      <span className="text-[10px] font-medium tabular-nums text-foreground">{hora}</span>
      {meta && (
        <span className={cn('text-[9px] font-semibold tabular-nums', meta.texto)}>
          {desvioTexto(desvio as number)}
        </span>
      )}
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
  altoFila,
  hora,
  desvio,
  ayuda,
  resaltado,
}: {
  icono: typeof Warehouse
  centro: number
  yCirculo: number
  yEtiqueta: number
  fila: 0 | 1 | null
  altoFila: number
  hora: string
  desvio?: number | null
  ayuda: string
  resaltado?: boolean
}) {
  return (
    <>
      <span
        className={cn(
          'absolute flex -translate-x-1/2 items-center justify-center rounded-full',
          resaltado ? 'bg-foreground text-background' : 'bg-muted-foreground/25 text-foreground',
        )}
        style={{
          left: centro,
          top: yCirculo,
          width: DIAMETRO,
          height: DIAMETRO,
        }}
        title={ayuda}
      >
        <Icono className="size-3.5" />
      </span>
      <Etiqueta y={yEtiqueta} fila={fila} altoFila={altoFila} centro={centro} hora={hora} desvio={desvio} />
    </>
  )
}

function Hito({
  centro,
  yCirculo,
  yEtiqueta,
  fila,
  altoFila,
  numero,
  hora,
  desvio,
  densidad,
  activo,
  color,
  simbolo,
  excepcional,
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
  altoFila: number
  numero: number
  hora: string
  desvio?: number | null
  densidad: Densidad
  activo: boolean
  /** Sin color, el hito es del plan y va en gris. */
  color?: string
  simbolo?: string | null
  /** Fallido o devuelto: son los únicos que se marcan con el símbolo del estado. */
  excepcional?: boolean
  fueraDeOrden?: boolean
  incidencias?: number
  fantasma?: boolean
  onClick: () => void
  ayuda: string
}) {
  const alto = DIAMETRO_DE[densidad]
  const conNumero = densidad === 'numero'
  // Las chapitas viven pegadas al borde del círculo: a tamaño punto no tienen dónde apoyarse y se
  // convierten en manchas sueltas. El estado excepcional sigue estando en el color y en el pie.
  const conChapitas = densidad !== 'punto'
  // Relleno SÓLIDO con el número en blanco. Los rellenos al 15 % se lavaban contra el fondo —peor en
  // modo oscuro—, así que el semáforo, que es el dato principal de la línea de abajo, había que ir a
  // buscarlo. Un círculo sólido se lee de reojo, que es como se lee un semáforo.
  const relleno = fantasma ? 'transparent' : (color ?? 'var(--color-muted-foreground)')
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        title={ayuda}
        className={cn(
          'absolute flex -translate-x-1/2 cursor-pointer items-center justify-center rounded-full font-bold tabular-nums transition-transform hover:scale-110',
          conNumero ? 'text-[11px]' : 'text-[0px]',
          fantasma && 'border border-dashed',
          activo && 'z-10 scale-125 shadow-md ring-2 ring-foreground ring-offset-2 ring-offset-background',
          // El anillo ámbar marca la parada visitada fuera de orden. Es el círculo que logística dibujó
          // a mano alrededor del ③ y el ②.
          fueraDeOrden && !activo && 'ring-2 ring-amber-500 ring-offset-1 ring-offset-background',
        )}
        style={{
          left: centro,
          top: yCirculo + (DIAMETRO - alto) / 2,
          width: alto,
          height: alto,
          backgroundColor: relleno,
          borderColor: color ?? 'var(--color-muted-foreground)',
          color: fantasma ? (color ?? 'var(--color-muted-foreground)') : '#fff',
        }}
      >
        {conNumero && numero}
      </button>

      {/* Chapita del estado, solo en los casos EXCEPCIONALES (✕ fallido, ↩ devuelto). En las entregadas
          sería ruido: son la mayoría y su color ya lo dice. */}
      {conChapitas && excepcional && simbolo && (
        <span
          className="pointer-events-none absolute flex size-3.5 items-center justify-center rounded-full text-[8px] font-bold text-white ring-1 ring-background"
          style={{
            left: centro + alto / 2 - 6,
            top: yCirculo + (DIAMETRO - alto) / 2 - 3,
            backgroundColor: color,
          }}
        >
          {simbolo}
        </span>
      )}
      {conChapitas && (incidencias ?? 0) > 0 && (
        <AlertTriangle
          className="pointer-events-none absolute size-3 text-destructive"
          style={{
            left: centro - alto / 2 - 5,
            top: yCirculo + (DIAMETRO - alto) / 2 - 3,
          }}
        />
      )}

      <Etiqueta y={yEtiqueta} fila={fila} altoFila={altoFila} centro={centro} hora={hora} desvio={desvio} />
    </>
  )
}
