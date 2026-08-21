// Mapa del planificador unificado. Es el FONDO de la pantalla, no una columna: todo lo demás flota
// encima. Por eso acá adentro solo vive lo que es del mapa (pines, trazos, mercados, cámara) y nada
// de lo que es del plan.
//
// Cada punto de entrega es una GOTA que codifica tres cosas sin texto: color (ruta asignada, o canal),
// tamaño (peso de la parada) y número (orden de visita). Gris apagado = todavía sin ruta, que es
// justamente el trabajo pendiente del planificador.
//
// A ZOOM LEJANO la gota pasa a ser un PUNTO (ver `ZOOM_GOTA`): las 53 paradas caben en el radio urbano
// de Santa Cruz y a vista de departamento se pisaban entre sí hasta formar una mancha. La regla es una
// sola y vale para todos los marcadores a la vez, el depósito incluido: lejos, vista de conjunto —
// formas compactas y chicas—; cerca, vista de detalle.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Warehouse } from 'lucide-react'
import type { Polyline as CapaPolyline } from 'leaflet'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { InvalidateOnResize } from '../map/InvalidateOnResize'
import { SUBDOMINIOS, TILES } from '../map/tiles'
import { SelectionLayer } from '../map/SelectionLayer'
import { MercadosLayer } from '../map/mercados/MercadosLayer'
import { ZonasLayer } from '../zonas/ZonasLayer'
import { useZonesStore } from '../zones-store'
import { useCityIdsDelMapa, useMercadosMapa } from '../map/mercados/use-mercados-mapa'
import { encuadrar } from '../map/encuadrar'
import { useRutasPorCalles } from '../map/use-rutas-calles'
import { oscurecer } from '../map/color'
import { reactIcon } from '../map/div-icon'
import { CANAL_META, DEPOSITO, type Parada } from '../mock-data'
import { PlannerHerramientas } from './PlannerHerramientas'
import {
  anchoPin,
  CAJA_SOBRE_GOTA,
  escalaPorZoom,
  PIN_ANCHO_NUMERO,
  PIN_ANCLA_Y,
  PIN_RATIO,
  PUNTO_SOBRE_GOTA,
  rangoPeso,
  trazoDeRuta,
  ZOOM_GOTA,
  ZOOM_NUMERO,
  type RutaPlan,
} from './planner-model'
import { usePlannerStore, type CapaBase } from './planner-store'

const SANTA_CRUZ: [number, number] = [-17.786, -63.17]
const INITIAL_ZOOM = 12
/** Gris de "todavía sin ruta". Deliberadamente apagado: es una parada que reclama una decisión. */
const SIN_RUTA = '#94a3b8'

/**
 * Guionado de los trazos, uno por ruta (ciclado por índice).
 *
 * `null` = línea sólida, y va PRIMERA a propósito: con una sola ruta en el plan, guionarla sería
 * decorar. Los patrones se eligieron para distinguirse a simple vista y no entre sí de a poco: largo,
 * punteado fino, y raya-punto. Están en píxeles de pantalla, así que se ven iguales a cualquier zoom.
 */
const PATRONES_TRAZO: (string | null)[] = [null, '12 7', '2 7', '18 6 3 6', '7 5']
const SELECCION = '#2563eb'

/**
 * Contorno de la gota, con la PUNTA en (13, 33). El path no cambió; lo que cambió es la caja que lo
 * contiene: `-2 -2 30 37` en vez de `0 0 26 34`.
 *
 * POR QUÉ LA CAJA ES MÁS GRANDE QUE LA GOTA. El aro azul de la parada marcada se dibuja por FUERA de
 * la silueta, y en un viewBox justo (`0 0 26 34`, una sola unidad de aire) quedaba recortado contra el
 * borde — un aro cortado en la coronilla se ve peor que no tener aro. 3 unidades de aire arriba y a los
 * costados y 2 abajo es exactamente lo que ese aro necesita; el marcador sin marcar no dibuja nada
 * fuera de la silueta.
 */
const GOTA = 'M13 1C6.37 1 1 6.37 1 13c0 8.6 12 20 12 20s12-11.4 12-20C25 6.37 19.63 1 13 1z'
const VIEWBOX_PIN = '-2 -2 30 37'

/**
 * Punto de entrega: una GOTA sólida de color.
 *
 * POR QUÉ ESTA FORMA Y NO UN CÍRCULO. La gota es el vocabulario universal de "acá hay un lugar" en un
 * mapa, y tiene una ventaja concreta sobre el disco: ancla en la PUNTA, así que señala una coordenada
 * exacta en vez de cubrirla. Con un disco, el punto real quedaba debajo del propio marcador.
 *
 * POR QUÉ NO EL ÍCONO DEL CANAL ADENTRO. Un glifo de 14 px no se distingue a zoom de ciudad —tienda,
 * mayorista y supermercado son cuatro trazos parecidos— y obligaba a que todos los marcadores midieran
 * lo mismo para que entrara. Costaba las dos variables que sí se leen de un vistazo: color y tamaño.
 *
 * El marcador codifica TRES cosas a la vez:
 *   · color  → la ruta asignada, o el canal (lo elige `colorPor` en el menú de Capas).
 *   · tamaño → el peso de la parada, con el ÁREA proporcional (ver `anchoPin`), corregido por el zoom
 *              (ver `escalaPorZoom`) y con la escala cerrada en el p90 para que un pedido atípico no
 *              achate a los demás (ver `rangoPeso`).
 *   · número → el orden de visita, en el hueco blanco, desde `ZOOM_NUMERO` y en TODAS las asignadas.
 *
 * El número NO depende del tamaño del pin, y esa es la corrección importante: antes salía en los
 * marcadores grandes y faltaba en los chicos, o sea que el recorrido se leía en las paradas pesadas y
 * no en las livianas — una mezcla de dos variables que no contesta ninguna pregunta. Ahora es una sola
 * regla, la del zoom: lejos se ve el REPARTO (quién es de quién), cerca se ve el RECORRIDO.
 */
function pinParada(
  parada: Parada,
  color: string,
  ancho: number,
  marcada: boolean,
  enFoco: boolean,
  /** El zoom ya decidió que se muestran los números; acá solo se hace lugar para el que toca. */
  conNumero: boolean,
) {
  const asignada = parada.rutaId !== null && parada.rutaId !== undefined
  const resaltado = marcada || enFoco
  const cabeNumero = conNumero && asignada && parada.secuencia > 0
  // El resaltado crece: tiene que saltar por encima del resto sin depender solo del color del borde.
  // Y cuando toca mostrar el orden, el marcador sube al piso donde el número se lee: a partir de ese
  // zoom la pregunta es "¿en qué orden los visito?", y responderla vale ceder un poco de la escala de
  // peso en las paradas más livianas.
  const base = cabeNumero ? Math.max(ancho, PIN_ANCHO_NUMERO) : ancho
  const anchoGota = resaltado ? base + 6 : base
  // La CAJA del ícono, no la gota: reserva el aire que necesita el aro de la parada marcada.
  // `anchoGota` sigue siendo el ancho de la silueta, que es lo que codifica el peso.
  const w = Math.round(anchoGota * CAJA_SOBRE_GOTA)
  const h = Math.round(w * PIN_RATIO)
  // Versión oscura del color, solo para el NÚMERO de secuencia sobre el hueco blanco. Se deriva del
  // color en vez de ser un gris fijo para no meter un color ajeno al mapa: el matiz sigue diciendo de
  // quién es el punto, y lo único que cambia es el contraste que un texto de 9 px necesita.
  const oscuro = oscurecer(color, 0.55)
  // Id único del degradado: los marcadores se inyectan como HTML suelto en el DOM del mapa, y un id
  // repetido haría que todos resolvieran contra la primera definición — que desaparece en cuanto ese
  // marcador se desmonta, dejando al resto sin relleno.
  const gid = `g-${parada.id.replace(/[^a-zA-Z0-9_-]/g, '')}`

  return reactIcon(
    <div
      className={`stop-pin ${resaltado ? 'stop-pin-selected' : ''}`}
      style={{
        width: w,
        height: h,
        // La escala del hover y del "pop" tienen que crecer DESDE LA PUNTA. Con el origen al centro
        // —el default de `.stop-pin`— el marcador se despega del lugar que señala mientras se agranda.
        // Y la punta ya no es `bottom`: la caja reserva 2 unidades abajo para el aro de selección.
        transformOrigin: `center ${(PIN_ANCLA_Y * 100).toFixed(1)}%`,
        // LA SOMBRA ES EL BORDE de este marcador, así que no es un adorno: es lo único que lo separa
        // del mapa. `drop-shadow` y no `box-shadow` porque sigue la SILUETA de la gota — un box-shadow
        // dibujaría la sombra de un rectángulo alrededor de algo que no lo es. Corta y pegada (1-2 px)
        // y no una sombra de elevación: a 14 px, una sombra larga se lee como un segundo marcador
        // borroso al lado del primero.
        filter: resaltado
          ? 'drop-shadow(0 2px 3px rgba(0,0,0,0.5))'
          : 'drop-shadow(0 1px 2px rgba(0,0,0,0.45))',
      }}
    >
      <svg width={w} height={h} viewBox={VIEWBOX_PIN} xmlns="http://www.w3.org/2000/svg">
        <defs>
          {/* Brillo arriba y sombra abajo, en blanco y negro translúcidos. Le da volumen sin tener que
              calcular una versión más clara y otra más oscura de cada color de ruta. */}
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
            <stop offset="52%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
          </linearGradient>
        </defs>

        {/* SIN BORDE: la silueta la hace la SOMBRA.
            Este marcador pasó por las dos versiones equivocadas antes de llegar acá. Con borde blanco y
            contorno oscuro por fuera, el blanco quedaba encerrado entre dos colores y se leía como una
            línea brillante alrededor del pin. Dejando solo el contorno oscuro de 2 px, el borde seguía
            pesando más que el marcador: a 14 px, 2 px de contorno son un séptimo del ancho, y el mapa
            se llenaba de anillos.
            Lo que separa el pin del fondo es el `drop-shadow` del div —corto y pegado, como en la capa
            de aeropuertos de Flightradar24—: sigue la silueta, no le agrega grosor y funciona igual
            sobre calles claras que sobre satélite, que es más de lo que hacía cualquiera de los bordes.

            El único trazo que queda es el AZUL de la parada marcada o en foco, y ese no es decoración:
            es el estado de la selección, y tiene que ganarle al resto del mapa. */}
        <path
          d={GOTA}
          fill={color}
          stroke={resaltado ? SELECCION : 'none'}
          strokeWidth={resaltado ? 2.5 : 0}
          strokeLinejoin="round"
        />
        <path d={GOTA} fill={`url(#${gid})`} />

        {/* Hueco blanco, como el marcador de referencia. Es lo que hace que la gota se lea como un pin
            y no como una lágrima de color, y de paso es el fondo del número. Sin aro: a este tamaño un
            aro alrededor de un círculo de 5 px es la misma clase de ruido que el borde exterior. */}
        <circle cx="13" cy="13" r={cabeNumero ? 6.6 : 4.4} fill="#ffffff" />
        {cabeNumero && (
          <text
            x="13"
            y="13"
            // El número va en el tono OSCURO y no en el color plano: sobre blanco, un ámbar o un lima a
            // 9 px es ilegible. Es el mismo color, con el contraste que un texto de ese cuerpo necesita.
            fill={oscuro}
            fontSize="9"
            fontWeight="700"
            fontFamily="system-ui, sans-serif"
            textAnchor="middle"
            dominantBaseline="central"
          >
            {parada.secuencia}
          </text>
        )}
      </svg>
    </div>,
    [w, h],
    // Ancla en la PUNTA de la gota, no en el centro ni en el borde de abajo de la caja: abajo quedan
    // las 2 unidades de aire del aro de selección, y anclar ahí correría todos los marcadores.
    [w / 2, Math.round(h * PIN_ANCLA_Y)],
  )
}

/**
 * Punto de entrega a ZOOM LEJANO: un disco, no una gota (ver `ZOOM_GOTA` para el por qué del cambio de
 * forma).
 *
 * Conserva las DOS variables que a ese zoom todavía se leen —color (de quién es el punto) y tamaño
 * (cuánto pesa)— y suelta las dos que no: la punta que señala una coordenada exacta, que no significa
 * nada cuando un píxel son 200 metros, y el número de orden, que a ese cuerpo no se lee (`ZOOM_NUMERO`
 * es 14, así que en modo punto nunca corresponde dibujarlo).
 *
 * Es un div y no un SVG porque un círculo con `border-radius` no necesita un path, y esa diferencia
 * arrastra otra: `box-shadow` respeta el redondeo, así que acá alcanza y no hace falta el `drop-shadow`
 * —bastante más caro— que la gota sí necesita para que la sombra siga su silueta.
 */
function pinPunto(color: string, ancho: number, marcada: boolean, enFoco: boolean) {
  const resaltado = marcada || enFoco
  // Piso de 5 px: por debajo de eso un disco deja de ser un objeto y se lee como suciedad del mapa.
  const diametro = Math.max(5, Math.round(ancho * PUNTO_SOBRE_GOTA))
  // El aro de selección va POR FUERA (`box-sizing: content-box`) y no comiéndose el disco: si creciera
  // hacia adentro, marcar un punto lo haría más chico justo cuando pasa a ser el que estás mirando.
  const aro = resaltado ? 2 : 0
  const total = diametro + aro * 2

  return reactIcon(
    <div
      className={`stop-pin ${resaltado ? 'stop-pin-selected' : ''}`}
      style={{
        width: diametro,
        height: diametro,
        borderRadius: 999,
        background: color,
        // EXPLÍCITO: el reset de Tailwind pone `border-box` en todo, y con eso el aro se comería el
        // disco en vez de rodearlo — exactamente el efecto contrario al que busca.
        boxSizing: 'content-box',
        border: aro ? `${aro}px solid ${SELECCION}` : undefined,
        boxShadow: resaltado ? '0 1px 3px rgba(0,0,0,0.5)' : '0 1px 2px rgba(0,0,0,0.45)',
      }}
    />,
    total,
    // Sin `anchor`: un disco ancla en su CENTRO, que es el default de `divIcon`. La gota es la excepción
    // —ancla en la punta— y por eso es la única que lo pasa explícito.
  )
}

/**
 * El almacén de salida. Sigue el MISMO umbral que las paradas (`ZOOM_GOTA`) y por la misma razón: era
 * un disco de 36 px fijo, así que al alejarse quedaba seis veces más grande que los puntos y se comía
 * el centro de la nube — el objeto que menos se consulta tapando a los 53 que sí. Lejos vale la mitad;
 * de cerca recupera su tamaño, que es cuando de verdad hace falta leer el ícono.
 */
function pinDeposito(comoGota: boolean) {
  const lado = comoGota ? 36 : 22
  return reactIcon(
    <div
      style={{
        width: lado,
        height: lado,
        borderRadius: 999,
        background: '#0f172a',
        border: '2px solid #fff',
        boxSizing: 'border-box',
        boxShadow: '0 2px 6px rgb(0 0 0 / 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
      }}
    >
      <Warehouse size={comoGota ? 18 : 12} strokeWidth={2.25} />
    </div>,
    lado,
  )
}

/**
 * Cámara del mapa. Un solo lugar mueve la vista, y lo hace cuando alguien lo PIDE (`encuadreToken`),
 * nunca como efecto colateral de que cambió una lista: un mapa que se reencuadra solo mientras estás
 * arrastrando es un mapa que te pelea.
 *
 * La excepción es el primer conjunto de paradas: al pasar de "no hay nada" a "hay puntos", encuadrar
 * es lo único razonable — si no, la pantalla abre en un cuadro vacío con los pines fuera de vista.
 */
function Camara({
  paradas,
  foco,
  margenIzq,
  margenDer,
  margenAbajo,
}: {
  paradas: Parada[]
  foco: Parada | null
  margenIzq: number
  margenDer: number
  margenAbajo: number
}) {
  const map = useMap()
  const token = usePlannerStore((s) => s.encuadreToken)
  const objetivo = usePlannerStore((s) => s.encuadreObjetivo)
  const rutaFoco = usePlannerStore((s) => s.rutaFoco)
  const teniaParadas = useRef(false)

  // Márgenes por ref: cambian al abrir/cerrar un panel —y `margenAbajo` además con cada píxel de un
  // arrastre— y no queremos que ESO dispare un vuelo.
  const margenes = useRef({ margenIzq, margenDer, margenAbajo })
  margenes.current = { margenIzq, margenDer, margenAbajo }

  const puntos = useRef<[number, number][]>([])
  puntos.current = paradas.map((p) => [p.lat, p.lng] as [number, number])

  const focoRef = useRef(foco)
  focoRef.current = foco

  // Por ref, como todo lo que lee el efecto: el encuadre es un evento y no puede volar de nuevo solo
  // porque cambió la ruta elegida en el panel.
  const paradasRef = useRef(paradas)
  paradasRef.current = paradas
  const rutaFocoRef = useRef(rutaFoco)
  rutaFocoRef.current = rutaFoco

  useEffect(() => {
    if (!objetivo) return
    // El depósito entra en el encuadre de un recorrido igual que en el del plan: la ruta sale y vuelve
    // de ahí, así que un cuadro que lo deja afuera muestra medio viaje.
    const deRuta = (): [number, number][] =>
      paradasRef.current
        .filter((p) => p.rutaId === rutaFocoRef.current)
        .map((p) => [p.lat, p.lng] as [number, number])
    const destino =
      objetivo === 'foco' && focoRef.current
        ? [[focoRef.current.lat, focoRef.current.lng] as [number, number]]
        : objetivo === 'ruta' && rutaFocoRef.current
          ? [...deRuta(), [DEPOSITO.lat, DEPOSITO.lng] as [number, number]]
          : [...puntos.current, [DEPOSITO.lat, DEPOSITO.lng] as [number, number]]
    encuadrar(map, destino, {
      ...margenes.current,
      zoomMax: objetivo === 'foco' ? 16 : 14,
    })
    // Solo el token: pedir el encuadre es un EVENTO, y volver a dispararlo porque cambió una parada
    // convertiría cada tilde de un filtro en un vuelo de cámara.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    const hayParadas = paradas.length > 0
    if (hayParadas && !teniaParadas.current) {
      encuadrar(map, [...puntos.current, [DEPOSITO.lat, DEPOSITO.lng]], {
        ...margenes.current,
        zoomMax: 14,
      })
    }
    teniaParadas.current = hayParadas
  }, [map, paradas.length])

  return null
}

/**
 * Click en el mapa VACÍO limpia lo marcado, y solo en modo `punto`.
 *
 * Solo ahí porque es el único modo donde el click es "seleccionar": en `pan` el click sobre el mapa es
 * un gesto de navegación que nadie asocia con perder una selección que le costó armar.
 */
function LimpiarAlClickear() {
  const herramienta = usePlannerStore((s) => s.herramienta)
  const setSeleccion = usePlannerStore((s) => s.setSeleccion)
  useMapEvents({
    click: () => {
      if (herramienta === 'punto') setSeleccion([])
    },
  })
  return null
}

/**
 * Reporta el zoom hacia afuera para que los marcadores puedan responder a él.
 *
 * Tiene que ser un componente HIJO del mapa: `useMapEvents` necesita el contexto de Leaflet, y el que
 * monta el `MapContainer` está por definición fuera de él. Guarda el valor SOLO cuando cambia, o cada
 * evento de zoom re-renderizaría los 54 marcadores dos veces.
 */
function ZoomWatch({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMapEvents({ zoomend: () => onZoom(map.getZoom()) })
  return null
}

export function PlannerMapa({
  paradas,
  rutas,
  margenIzq,
  margenDer,
  margenAbajo,
}: {
  /** Paradas YA proyectadas con su asignación (ver `aplicarAsignaciones`). */
  paradas: Parada[]
  rutas: RutaPlan[]
  /** Ancho que le tapan los paneles flotantes. Lo usa la cámara para no encuadrar debajo de ellos. */
  margenIzq: number
  margenDer: number
  /** Alto que le tapa la tabla de rutas apoyada al pie, cuando está encendida. */
  margenAbajo: number
}) {
  const capa = usePlannerStore((s) => s.capa)
  const herramienta = usePlannerStore((s) => s.herramienta)
  const verMercados = usePlannerStore((s) => s.verMercados)
  const verZonas = usePlannerStore((s) => s.verZonas)
  const verEtiquetas = usePlannerStore((s) => s.verEtiquetas)
  const rutasOcultas = usePlannerStore((s) => s.rutasOcultas)
  const optimizado = usePlannerStore((s) => s.optimizado)
  const colorPor = usePlannerStore((s) => s.colorPor)
  const verTrazos = usePlannerStore((s) => s.verTrazos)
  const verDeposito = usePlannerStore((s) => s.verDeposito)
  const seleccion = usePlannerStore((s) => s.seleccion)
  const setSeleccion = usePlannerStore((s) => s.setSeleccion)
  const paradaFoco = usePlannerStore((s) => s.paradaFoco)
  const rutaFoco = usePlannerStore((s) => s.rutaFoco)
  const panel = usePlannerStore((s) => s.panel)
  const dockAbierto = usePlannerStore((s) => s.dockAbierto)
  const verRutas = usePlannerStore((s) => s.verRutas)
  const setParadaFoco = usePlannerStore((s) => s.setParadaFoco)
  const abrirMenuParada = usePlannerStore((s) => s.abrirMenuParada)
  const alternarSeleccion = usePlannerStore((s) => s.alternarSeleccion)
  const pedirEncuadre = usePlannerStore((s) => s.pedirEncuadre)

  /**
   * ¿Está sostenida la tecla Shift?
   *
   * Va en un ref y no en estado porque lo consultan dos cosas fuera del ciclo de React: el handler de
   * click de Leaflet y el callback de `SelectionLayer`. Guardarlo en `useState` re-renderizaría el mapa
   * entero —y por lo tanto los ~50 marcadores— cada vez que alguien apoya o suelta la tecla.
   *
   * El `blur` de la ventana lo baja: si el usuario cambia de pestaña con Shift apretado, el `keyup`
   * nunca llega y la bandera quedaría trabada en `true` para siempre.
   */
  const shift = useRef(false)
  useEffect(() => {
    const abajo = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shift.current = true
    }
    const arriba = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shift.current = false
    }
    const soltar = () => {
      shift.current = false
    }
    window.addEventListener('keydown', abajo)
    window.addEventListener('keyup', arriba)
    window.addEventListener('blur', soltar)
    return () => {
      window.removeEventListener('keydown', abajo)
      window.removeEventListener('keyup', arriba)
      window.removeEventListener('blur', soltar)
    }
  }, [])

  const [mercadoSelId, setMercadoSelId] = useState<number | null>(null)
  const [zoom, setZoom] = useState(INITIAL_ZOOM)
  const cityIds = useCityIdsDelMapa(paradas, 'santacruz')

  /**
   * Zonas de reparto de las ciudades del plan.
   *
   * Salen del MISMO `zones-store` que la pantalla de Zonas y no de una copia: son dato maestro, se
   * dibujan una vez y las reusan todos los planes. Así, una zona que se acaba de redibujar allá ya se
   * ve acá sin recargar nada.
   *
   * Se filtran por ciudad y por vigencia: una zona dada de baja sigue nombrada en planes viejos, pero
   * dibujarla hoy diría que el territorio está cubierto cuando no lo está.
   */
  const zonasTodas = useZonesStore((s) => s.zonas)
  const zonas = useMemo(() => {
    if (!verZonas) return []
    const ciudades = new Set(cityIds)
    return zonasTodas.filter(
      (z) => z.isActive && !z.deletedAt && z.polygonGeoJson && ciudades.has(z.cityId),
    )
  }, [cityIds, verZonas, zonasTodas])
  const { mercados, cargando: cargandoMercados } = useMercadosMapa(cityIds, verMercados)

  const colorPorRuta = useMemo(() => new Map(rutas.map((r) => [r.id, r.color])), [rutas])
  const ocultas = useMemo(() => new Set(rutasOcultas), [rutasOcultas])
  const marcadas = useMemo(() => new Set(seleccion), [seleccion])

  /** Color del disco según lo que se eligió codificar. Sin ruta y coloreando por ruta → gris apagado:
   *  "todavía no le tocó a nadie" tiene que verse como falta de dato, no como una categoría más. */
  const colorDe = (parada: Parada) => {
    if (colorPor === 'canal') return CANAL_META[parada.canal].color
    return parada.rutaId ? (colorPorRuta.get(parada.rutaId) ?? SIN_RUTA) : SIN_RUTA
  }

  // Paradas que se dibujan: una ruta oculta se saca del mapa entera (pines y trazo). Es el único
  // filtro que aplica al mapa — los del panel de pedidos filtran el UNIVERSO, no la vista.
  const visibles = useMemo(
    () => paradas.filter((p) => !(p.rutaId && ocultas.has(p.rutaId))),
    [ocultas, paradas],
  )

  const trazos = useMemo(() => {
    if (!optimizado || !verTrazos) return []
    return rutas
      .filter((ruta) => !ocultas.has(ruta.id))
      .map((ruta) => {
        const propias = paradas
          .filter((p) => p.rutaId === ruta.id)
          .sort((a, b) => a.secuencia - b.secuencia)
        return { ruta, path: trazoDeRuta(propias) }
      })
      .filter((t) => t.path.length > 2)
  }, [ocultas, optimizado, paradas, rutas, verTrazos])

  /**
   * El recorrido POR CALLES de cada ruta, cuando ya llegó.
   *
   * `trazos[].path` sigue siendo la secuencia de paradas —depósito, las visitas en orden, depósito— y
   * eso es el PLAN. Lo que el ruteo agrega es cómo se maneja entre esos puntos, y por eso no lo
   * reemplaza en el modelo: si el servidor no contesta, el trazo recto se sigue dibujando y el plan se
   * sigue leyendo igual, solo menos realista. El único que sabe la diferencia es este componente.
   */
  const tramos = useMemo(
    () => trazos.map((t) => ({ id: t.ruta.id, puntos: t.path })),
    [trazos],
  )
  const { porRuta: porCalles, cargando: ruteando } = useRutasPorCalles(tramos, optimizado && verTrazos)

  /**
   * Las rutas que el mapa dibuja AHORA. Una ruta NO SE DIBUJA hasta tener su geometría definitiva, y esa
   * es la corrección de dos reportes que resultaron ser el mismo.
   *
   * Al optimizar se veía aparecer la recta —con su animación de trazado— y un segundo después la misma
   * ruta redibujándose por las calles con una SEGUNDA animación. Dos dibujados encadenados de la misma
   * línea sobre dos formas distintas: eso era la "animación rara". El intento anterior fue atenuar la
   * recta mientras esperaba, y era la respuesta equivocada a la pregunta correcta — el problema no era
   * que la recta se leyera como definitiva, era que no tenía por qué estar ahí.
   *
   * NADA ES MEJOR QUE UNA FORMA INCORRECTA, y acá además no cuesta: el reparto ya se ve en el color de
   * los pines, el spinner de Capas dice que falta algo, y el velo de "Optimizando" tapa el mapa justo
   * durante la espera. Las rutas van apareciendo de a una a medida que se resuelven.
   *
   * `!ruteando` evita el otro extremo: si el ruteo TERMINÓ y esta ruta no está en `porCalles`, es que no
   * se pudo rutear — y ahí la recta sí es lo que hay, y se dibuja.
   *
   * Es UNA definición y no el mismo filtro repetido en las dos pasadas del dibujo: halo y color tienen
   * que trazar exactamente el mismo conjunto, y dos copias del predicado es la forma de que un día no lo
   * hagan.
   */
  const dibujables = useMemo(
    () => trazos.filter(({ ruta }) => porCalles.has(ruta.id) || !ruteando),
    [porCalles, ruteando, trazos],
  )

  /**
   * La ruta PROTAGONISTA del mapa: la que está elegida en el panel de rutas.
   *
   * EL PROBLEMA QUE RESUELVE. Dos rutas que comparten avenida reciben del ruteador la MISMA geometría,
   * así que sus polilíneas son idénticas y la última dibujada tapa a la anterior por completo — no se
   * ve apretada, desaparece. El halo blanco no ayuda contra eso: separa líneas vecinas, no apiladas.
   *
   * La respuesta no es hacer que las siete se lean a la vez (eso es un offset paralelo, otro problema):
   * es que la que estás mirando esté arriba y sola. El panel ya trabaja de a UNA ruta y el mapa no lo
   * acompañaba.
   *
   * SOLO MIENTRAS ALGO QUE HABLA DE RUTAS ESTÁ A LA VISTA: el panel lateral de rutas, o la tabla de
   * rutas generadas del pie. `rutaFoco` se elige solo al entrar, así que sin esta condición el mapa
   * abriría con cinco rutas apagadas por una decisión que el usuario no tomó. Mirando Flota o Pedidos,
   * las rutas valen todas lo mismo.
   */
  const destacada = useMemo(() => {
    const mirandoRutas = (dockAbierto && panel === 'rutas') || verRutas
    if (!mirandoRutas) return null
    // `rutas.some`: `rutaFoco` también puede valer "Sin asignar", que no es una ruta y no se dibuja.
    return rutas.some((r) => r.id === rutaFoco) ? rutaFoco : null
  }, [dockAbierto, panel, rutaFoco, rutas, verRutas])

  /**
   * Las capas de color, por id de ruta. Existen para poder subir la destacada al frente.
   *
   * POR QUÉ NO SE ORDENA EL ARRAY. El z-order del SVG es el orden de inserción, pero reordenar el
   * `.map()` no lo cambia: los `<path>` los crea Leaflet imperativamente dentro de su propio
   * contenedor, así que React reconcilia sus componentes sin mover un solo nodo del SVG. Subir una
   * ruta al frente es pedírselo a Leaflet, y para eso hay que tener la capa a mano.
   */
  const capasColor = useRef(new Map<string, CapaPolyline>())

  /**
   * La destacada va al frente. Es la mitad del arreglo: sin esto, una ruta que comparte avenida con
   * otra dibujada después sigue tapada, solo que ahora la de arriba está atenuada y la deja entrever.
   *
   * Depende también de `dibujables`: cuando una ruta se remonta (pasó de recta a ruteada) su capa es
   * nueva y hay que volver a pedirlo.
   */
  useEffect(() => {
    if (!destacada) return
    capasColor.current.get(destacada)?.bringToFront()
  }, [destacada, dibujables])

  /**
   * Patrón de línea por ruta: el SEGUNDO canal, además del color.
   *
   * Con siete rutas los colores empiezan a parecerse, y dos que se pisan exacto son indistinguibles
   * aunque una esté arriba. Guionadas distinto, la de arriba deja ver la de abajo por los huecos. Y de
   * paso el trazo deja de depender SOLO del color, que es lo que falla con daltonismo.
   *
   * Sale del índice en `rutas` y no de un hash del id: así dos rutas consecutivas —las que más chance
   * tienen de compartir calle, porque el optimizador reparte por cercanía— nunca caen en el mismo
   * patrón. El primero es sólido: el caso de una sola ruta tiene que verse como una línea normal.
   */
  const patrones = useMemo(
    () => new Map(rutas.map((r, i) => [r.id, PATRONES_TRAZO[i % PATRONES_TRAZO.length]])),
    [rutas],
  )

  const foco = useMemo(() => paradas.find((p) => p.id === paradaFoco) ?? null, [paradaFoco, paradas])
  // Rango de peso del conjunto VISIBLE: la escala compara las paradas del plan entre sí, no contra un
  // máximo absoluto que no significa nada para quien mira esta pantalla.
  const rango = useMemo(() => rangoPeso(visibles), [visibles])
  const escala = escalaPorZoom(zoom)
  const conNumero = zoom >= ZOOM_NUMERO
  // Lejos, PUNTOS; cerca, GOTAS. Es un solo umbral y decide la forma de los 53 marcadores a la vez, así
  // que el cambio se lee como que el mapa pasó de vista de conjunto a vista de detalle — no como que
  // algunos marcadores se dibujan distinto que otros.
  const comoGota = zoom >= ZOOM_GOTA

  return (
    <MapContainer
      center={SANTA_CRUZ}
      zoom={INITIAL_ZOOM}
      scrollWheelZoom
      attributionControl={false}
      zoomControl={false}
      className="h-full w-full"
    >
      {/* `key`: sin él, Leaflet reusa la capa y solo le cambia la URL, y las teselas viejas del fondo
          anterior se quedan pintadas hasta que el usuario mueve el mapa. Remontando, entra limpio. */}
      <TileLayer key={capa} url={TILES[capa]} subdomains={SUBDOMINIOS[capa]} />
      <InvalidateOnResize />
      <ZoomWatch onZoom={setZoom} />
      <Camara
        paradas={paradas}
        foco={foco}
        margenIzq={margenIzq}
        margenDer={margenDer}
        margenAbajo={margenAbajo}
      />

      {/* Zonas de reparto, de FONDO y en papel de "contexto": grises, apagadas y sobre todo NO
          interactivas. Ese último punto no es estético — un polígono con `interactive: true` se come
          el click antes de que llegue al marcador de una parada o al mapa, así que con las zonas
          clickeables no se podría elegir un punto que cae dentro de una, que son todos.

          Es la MISMA capa que usa la pantalla de Zonas (`papel="contexto"`, el que ya usa cuando
          estás dibujando): un segundo dibujante de polígonos sería otro lugar donde el color y la
          holgura se despintan de a uno. */}
      {zonas.length > 0 && (
        <ZonasLayer zonas={zonas} papel="contexto" seleccionadaId={null} onSeleccionar={() => {}} />
      )}

      {/* Mercados de fondo: su pane propio (z 350) los deja debajo de trazos y pines, así que prender
          la capa no le quita legibilidad a nada de lo que ya estaba. No responden al click mientras hay
          una herramienta de marcado activa: ahí el click es parte del gesto de seleccionar paradas. */}
      {verMercados && (
        <MercadosLayer
          mercados={mercados}
          seleccionadoId={mercadoSelId}
          onSeleccionar={setMercadoSelId}
          interactivo={herramienta === 'pan'}
          mostrarNombres={!verEtiquetas}
        />
      )}

      {/* `SelectionLayer` ignora todo lo que no sea `rect`/`lasso`, así que pasarle `pan` o `punto` es
          un no-op y el arrastre del mapa sigue vivo.

          Con Shift el área SUMA a lo ya marcado en vez de reemplazarlo. Es el complemento del
          Shift+click: una vez que la tecla significa "sumar", tiene que significar lo mismo para las
          dos formas de marcar, o se vuelve una regla que hay que recordar por herramienta. */}
      <SelectionLayer
        // Se estrecha a mano: `MapTool` del componente compartido no conoce `punto`, y para él esa
        // herramienta se comporta igual que `pan` — no dibuja nada. Ampliar `MapTool` habría metido un
        // caso muerto en el `SelectionLayer` que también usa la planificación actual.
        activeTool={herramienta === 'rect' || herramienta === 'lasso' ? herramienta : 'pan'}
        paradas={visibles}
        onSelect={(ids) =>
          shift.current
            ? setSeleccion([...new Set([...usePlannerStore.getState().seleccion, ...ids])])
            : setSeleccion(ids)
        }
      />
      <LimpiarAlClickear />

      {/* Trazo por ruta: depósito → paradas en secuencia → depósito. Se dibuja con una animación de
          trazado (`.ruta-trazo`) porque "optimizar" es la acción más cara de la pantalla y el resultado
          tiene que VERSE aparecer; si las líneas se materializan de golpe, no queda claro qué cambió. */}
      {/* El halo blanco NO es decorativo: es lo que separa una ruta de otra cuando dos comparten calle,
          y lo que la hace visible sobre el satélite. Va en una capa aparte —TODOS los halos primero,
          después todos los colores— porque si cada ruta dibujara su halo junto a su línea, el halo de
          la última taparía el color de la anterior.

          Delgados: 4 px de halo y 2 de color. Con siete rutas saliendo del mismo depósito, líneas de
          6,5 px se fusionan en una sola mancha y deja de leerse cuántas hay. `round` en punta y unión
          evita las esquinas en pico de los giros cerrados. */}
      {dibujables.map(({ ruta, path }) => {
        const esDestacada = ruta.id === destacada
        const atenuada = destacada !== null && !esDestacada
        return (
          <Polyline
            key={ruta.id}
            positions={porCalles.get(ruta.id) ?? path}
            // El halo va SÓLIDO aunque su línea de color esté guionada: es justamente el fondo blanco
            // continuo el que hace legible el guionado, y una línea de guiones sobre otra de guiones
            // se lee como una sola línea rota.
            pathOptions={{
              color: '#ffffff',
              weight: esDestacada ? 5 : 4,
              opacity: atenuada ? 0.3 : 0.85,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        )
      })}
      {dibujables.map(({ ruta, path }) => {
        const calles = porCalles.get(ruta.id)
        const esDestacada = ruta.id === destacada
        const atenuada = destacada !== null && !esDestacada
        return (
          <Polyline
            // El `key` sigue distinguiendo el trazo RUTEADO del recto aunque ya no se dibujen los dos
            // seguidos: Leaflet reusa la capa si solo cambian sus props y la animación de trazado corre
            // al CREAR el elemento, así que sin remontar una ruta que pasara de recta a ruteada cambiaría
            // de forma sin dibujarse. Hoy solo puede pasar si un ruteo que había fallado se recupera.
            key={`color-${ruta.id}-${calles ? 'calles' : 'recto'}`}
            positions={calles ?? path}
            /**
             * `pathLength="1"` ANTES de la clase que anima, y las dos cosas acá y no en `pathOptions`.
             *
             * La animación de trazado dibuja la línea corriendo un `stroke-dashoffset`, y el dash se
             * mide en la longitud del path — que en el SVG de Leaflet está en PÍXELES DE PANTALLA y por
             * lo tanto crece con el zoom. Con un tope fijo (era 12000) la cola de un recorrido largo
             * quedaba sin dibujar, y con el ruteo por calles eso pasa siempre. Declarando que el path
             * mide 1, el dash se mide en fracciones del recorrido y "todo" es 1 a cualquier zoom.
             *
             * El ORDEN importa y es lo que hace esto seguro: la clase se agrega recién después del
             * atributo. Si el elemento no estuviera, no hay clase, y sin clase la línea se dibuja
             * entera y sólida — mientras que un `dasharray: 1` sin `pathLength` la haría desaparecer.
             */
            ref={(capa) => {
              if (!capa) {
                capasColor.current.delete(ruta.id)
                return
              }
              capasColor.current.set(ruta.id, capa)
              // Una ruta que se monta YA destacada también tiene que quedar arriba: el efecto de más
              // arriba corre antes de que esta capa exista.
              if (ruta.id === destacada) capa.bringToFront()
              const aplicar = () => {
                const el = capa.getElement()
                if (!el) return false
                /**
                 * UNA SOLA VEZ POR ELEMENTO, y esto no es una optimización: es la diferencia entre que
                 * la ruta se dibuje al aparecer y que se redibuje sola cada vez que la pantalla
                 * renderiza.
                 *
                 * El `ref` es una función inline, así que React la reinvoca en CADA render (la llama
                 * con `null` y otra vez con la capa). Mientras la clase se agregaba y nunca se sacaba,
                 * reinvocar era inofensivo: `classList.add` de algo ya presente no hace nada. Desde
                 * que se saca en `animationend`, volver a entrar acá la REPONE y la animación arranca
                 * de nuevo — y con un arrastre que renderiza sesenta veces por segundo, los trazos se
                 * ven recargando sin parar.
                 *
                 * La marca va en el DOM y no en un ref del componente a propósito: lo que no hay que
                 * repetir es la animación de ESTE elemento, y si Leaflet lo reemplaza (cambia el
                 * `key` al pasar de recto a ruteado) el nuevo llega sin marca y se dibuja, que es
                 * justo lo que se quiere.
                 */
                // `getAttribute` y no `dataset`: `getElement()` devuelve `Element`, que no lo tiene
                // tipado —es de `HTMLOrSVGElement`— y castear para leer una marca propia no vale.
                if (el.getAttribute('data-trazado') === '1') return true
                el.setAttribute('data-trazado', '1')
                el.setAttribute('pathLength', '1')
                el.classList.add('ruta-trazo')
                /**
                 * La clase se saca cuando la animación TERMINA, y no es prolijidad: es lo que deja
                 * ver el guionado por ruta.
                 *
                 * `.ruta-trazo` declara `stroke-dasharray: 1` en la hoja de estilos, y una regla de
                 * CSS le gana al ATRIBUTO de presentación que Leaflet escribe para `dashArray`. O
                 * sea: mientras la clase esté puesta, todos los trazos se dibujan con el mismo dash
                 * de la animación y el patrón propio de la ruta no existe. Son dos usos del mismo
                 * `stroke-dasharray` que no pueden convivir, así que van en orden: primero se
                 * dibuja, después se guiona.
                 *
                 * Con `prefers-reduced-motion` no hay animación y `animationend` nunca llega: la
                 * clase queda, y su regla de movimiento reducido pone `stroke-dasharray: none`. El
                 * trazo se ve sólido y sin patrón — que es la degradación correcta (color y realce
                 * siguen ahí), no una línea invisible.
                 */
                el.addEventListener('animationend', () => el.classList.remove('ruta-trazo'), {
                  once: true,
                })
                return true
              }
              // Un reintento en el próximo frame: el `<path>` recién existe cuando Leaflet agrega la
              // capa al mapa, y el orden entre eso y el ref de react-leaflet no está garantizado. Si
              // tampoco está en el segundo intento se abandona, y la línea queda sólida sin animar —
              // que es la degradación correcta, no una línea invisible.
              if (!aplicar()) requestAnimationFrame(aplicar)
            }}
            pathOptions={{
              color: ruta.color,
              // La destacada gana UN píxel y nada más. Dos serían una línea de otra naturaleza; uno,
              // sobre el resto atenuado, alcanza para que se lea como la que estás mirando.
              weight: esDestacada ? 3 : 2,
              // Atenuar y no ocultar: las demás rutas siguen siendo el contexto que dice si este
              // recorrido pisa al de al lado. Apagarlas contestaría otra pregunta.
              opacity: atenuada ? 0.4 : 1,
              dashArray: patrones.get(ruta.id) ?? undefined,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        )
      })}

      {/* De acá sale todo: sin el almacén el mapa no explica de dónde arrancan las rutas. Se puede
          apagar desde Capas porque cae justo en el centro de la ciudad y a veces tapa paradas. */}
      {verDeposito && (
        <Marker position={[DEPOSITO.lat, DEPOSITO.lng]} icon={pinDeposito(comoGota)}>
          {/* El offset sigue al tamaño del ícono: el marcador ancla en su CENTRO, así que la etiqueta
              tiene que subir su radio para no quedar encima. Fijo en -20 dejaba un hueco cuando el
              depósito se achica a zoom lejano. */}
          <Tooltip direction="top" offset={[0, comoGota ? -20 : -13]}>
            <span className="font-medium">{DEPOSITO.nombre}</span> — almacén de salida
          </Tooltip>
        </Marker>
      )}

      {visibles.map((parada) => {
        const [desde, hasta] = parada.ventana.split('–').map((s) => s.trim())
        const marcada = marcadas.has(parada.id)
        const enFoco = paradaFoco === parada.id
        const ancho = Math.round(anchoPin(parada.pesoTotal, rango.min, rango.max) * escala)
        return (
          <Marker
            key={parada.id}
            position={[parada.lat, parada.lng]}
            icon={
              comoGota
                ? pinParada(parada, colorDe(parada), ancho, marcada, enFoco, conNumero)
                : pinPunto(colorDe(parada), ancho, marcada, enFoco)
            }
            /**
             * LOS CHICOS ADELANTE. Sin esto el apilado lo decide la latitud (el default de Leaflet) y
             * una parada liviana puede quedar ÍNTEGRAMENTE tapada detrás de una pesada que la rodea —
             * desaparece del mapa sin que nadie se entere de que está—. Un marcador grande asomando
             * detrás de uno chico se sigue viendo; al revés, no.
             *
             * Lo marcado y lo enfocado va por encima de todo: es lo que se está mirando.
             */
            zIndexOffset={
              marcada || enFoco ? 1000 : Math.round((PIN_ANCHO_NUMERO * 2 - ancho) * 10)
            }
            eventHandlers={{
              // CLICK IZQUIERDO: enfocar y centrar. Nada más. Abrir un diálogo con cada click sobre
              // el mapa era demasiado: el gesto más frecuente de esta pantalla es recorrer paradas, y
              // un modal por parada obliga a cerrarlo para poder seguir mirando.
              click: (e) => {
                // Dibujando un área, el click es parte del gesto: ni foco ni selección.
                if (herramienta === 'rect' || herramienta === 'lasso') return
                // Shift+click marca de a una SIN cambiar de herramienta: se puede estar navegando e ir
                // juntando paradas. En modo `punto` el click pelado hace lo mismo, para quien va a
                // marcar muchas seguidas y no quiere sostener la tecla.
                if (e.originalEvent?.shiftKey || herramienta === 'punto') {
                  alternarSeleccion(parada.id)
                  return
                }
                setParadaFoco(parada.id)
                pedirEncuadre('foco')
              },
              // CLICK DERECHO: el menú con lo que se puede HACER con esta parada — ver su ficha,
              // marcarla, moverla de ruta. Es el lugar convencional para "acciones sobre este objeto",
              // y deja el click izquierdo libre para navegar.
              contextmenu: (e) => {
                if (herramienta === 'rect' || herramienta === 'lasso') return
                // Sin esto sale el menú del navegador encima del nuestro.
                e.originalEvent?.preventDefault()
                // `containerPoint` y no `clientX/clientY`: son píxeles relativos al contenedor del
                // mapa, que es exactamente el sistema de coordenadas donde se dibuja el menú.
                abrirMenuParada({
                  id: parada.id,
                  x: e.containerPoint.x,
                  y: e.containerPoint.y,
                })
              },
            }}
          >
            <Tooltip
              key={verEtiquetas ? 'permanente' : 'hover'}
              permanent={verEtiquetas}
              direction={verEtiquetas ? 'bottom' : 'top'}
              offset={verEtiquetas ? [0, 4] : [0, -6]}
              className={verEtiquetas ? 'stop-detail-tip' : ''}
            >
              {verEtiquetas ? (
                <>
                  <span className="block max-w-28 truncate text-center text-[9px] font-semibold leading-tight">
                    {parada.cliente}
                  </span>
                  <span className="block text-center text-[9px] leading-tight text-muted-foreground">
                    {desde} – {hasta}
                  </span>
                </>
              ) : (
                <div>
                  <span className="font-semibold text-foreground">{parada.cliente}</span>
                  <span className="block text-[11px] text-muted-foreground">{parada.puntoEntrega}</span>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {CANAL_META[parada.canal].label} · {parada.pedidos.length} pedido
                    {parada.pedidos.length !== 1 ? 's' : ''} · {parada.pesoTotal} kg
                  </div>
                </div>
              )}
            </Tooltip>
          </Marker>
        )
      })}

      <PlannerHerramientas
        rutas={rutas}
        onEncuadrar={() => pedirEncuadre('todo')}
        // Un solo indicador para las DOS cosas que el mapa pide por red. Son dos fuentes distintas pero
        // una sola pregunta del usuario —"¿ya está o le falta?"— y dos spinners a 30 px uno del otro
        // obligarían a aprender cuál es cuál para responderla.
        cargandoCapas={cargandoMercados || ruteando}
      />
    </MapContainer>
  )
}
