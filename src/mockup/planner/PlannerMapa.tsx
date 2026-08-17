// Mapa del planificador unificado. Es el FONDO de la pantalla, no una columna: todo lo demás flota
// encima. Por eso acá adentro solo vive lo que es del mapa (pines, trazos, mercados, cámara) y nada
// de lo que es del plan.
//
// Cada punto de entrega es una GOTA que codifica tres cosas sin texto: color (ruta asignada, o canal),
// tamaño (peso de la parada) y número (orden de visita). Gris punteado = todavía sin ruta, que es
// justamente el trabajo pendiente del planificador.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Warehouse } from 'lucide-react'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { InvalidateOnResize } from '../map/InvalidateOnResize'
import { SelectionLayer } from '../map/SelectionLayer'
import { MercadosLayer } from '../map/mercados/MercadosLayer'
import { useCityIdsDelMapa, useMercadosMapa } from '../map/mercados/use-mercados-mapa'
import { encuadrar } from '../map/encuadrar'
import { reactIcon } from '../map/div-icon'
import { CANAL_META, DEPOSITO, type Parada } from '../mock-data'
import { PlannerHerramientas } from './PlannerHerramientas'
import {
  anchoPin,
  escalaPorZoom,
  PIN_ANCHO_NUMERO,
  PIN_RATIO,
  rangoPeso,
  trazoDeRuta,
  ZOOM_NUMERO,
  type RutaPlan,
} from './planner-model'
import { usePlannerStore, type CapaBase } from './planner-store'

const SANTA_CRUZ: [number, number] = [-17.786, -63.17]
const INITIAL_ZOOM = 12
/** Gris de "todavía sin ruta". Deliberadamente apagado: es una parada que reclama una decisión. */
const SIN_RUTA = '#94a3b8'
const SELECCION = '#2563eb'

/**
 * Fondos disponibles.
 *
 * `suave` es CARTO Positron: el mismo mapa, desaturado a grises. Es el fondo estándar de cualquier
 * visualización sobre mapa, y por una razón concreta que se ve acá: el OSM de calles pinta las
 * avenidas de amarillo y naranja, que son exactamente dos de los colores que reparte el generador de
 * rutas. Sobre gris, el color vuelve a significar una sola cosa.
 *
 * ATRIBUCIÓN: CARTO no pide clave pero sí crédito («© OpenStreetMap contributors © CARTO»). Esta
 * pantalla monta el mapa con `attributionControl={false}`, igual que el resto del mockup — antes de
 * que esto salga a producción hay que reponer el control o poner el crédito en algún lado.
 */
const TILES: Record<CapaBase, string> = {
  calles: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  // Sin `{r}` (la variante retina): Leaflet solo sustituye ese token con `detectRetina`, y sin él
  // quedaría literal en la URL y las teselas darían 404.
  suave: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
  satelite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
}

/**
 * Contorno de la gota. viewBox 26 × 34, con la PUNTA en (13, 33) — de ahí sale el `iconAnchor`: un pin
 * ancla en su punta, no en su centro, o queda flotando arriba del lugar que señala.
 *
 * El `1` de margen es para que el trazo blanco del borde no quede recortado por el viewBox.
 */
const GOTA = 'M13 1C6.37 1 1 6.37 1 13c0 8.6 12 20 12 20s12-11.4 12-20C25 6.37 19.63 1 13 1z'

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
  const w = resaltado ? base + 6 : base
  const h = Math.round(w * PIN_RATIO)
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
        transformOrigin: 'bottom center',
        // `drop-shadow` y no `box-shadow`: sigue la SILUETA de la gota. Un box-shadow dibujaría la
        // sombra de un rectángulo alrededor de un marcador que no lo es.
        filter: resaltado
          ? 'drop-shadow(0 3px 5px rgba(0,0,0,0.45))'
          : 'drop-shadow(0 2px 3px rgba(0,0,0,0.35))',
      }}
    >
      <svg width={w} height={h} viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg">
        <defs>
          {/* Brillo arriba y sombra abajo, en blanco y negro translúcidos. Le da volumen sin tener que
              calcular una versión más clara y otra más oscura de cada color de ruta. */}
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
            <stop offset="52%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
          </linearGradient>
        </defs>

        <path
          d={GOTA}
          fill={color}
          stroke={resaltado ? SELECCION : '#ffffff'}
          strokeWidth={resaltado ? 2.5 : 1.8}
          // Punteado = sin ruta todavía. Es la misma información que da el gris, dicha por un segundo
          // canal: sobre satélite el gris pierde contraste y el borde se sigue leyendo.
          strokeDasharray={asignada ? undefined : '3 2.5'}
          strokeLinejoin="round"
        />
        <path d={GOTA} fill={`url(#${gid})`} />

        {/* Hueco blanco, como el marcador de referencia. Es lo que hace que la gota se lea como un pin
            y no como una lágrima de color, y de paso es el fondo del número. */}
        <circle cx="13" cy="13" r={cabeNumero ? 6.6 : 4.4} fill="#ffffff" />
        {cabeNumero && (
          <text
            x="13"
            y="13"
            fill={color}
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
    // Ancla en la PUNTA de la gota, no en el centro.
    [w / 2, h],
  )
}

const pinDeposito = reactIcon(
  <div
    style={{
      width: 36,
      height: 36,
      borderRadius: 999,
      background: '#0f172a',
      border: '2px solid #fff',
      boxShadow: '0 2px 6px rgb(0 0 0 / 0.4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
    }}
  >
    <Warehouse size={18} strokeWidth={2.25} />
  </div>,
  36,
)

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
}: {
  paradas: Parada[]
  foco: Parada | null
  margenIzq: number
  margenDer: number
}) {
  const map = useMap()
  const token = usePlannerStore((s) => s.encuadreToken)
  const objetivo = usePlannerStore((s) => s.encuadreObjetivo)
  const teniaParadas = useRef(false)

  // Márgenes por ref: cambian al abrir/cerrar un panel, y no queremos que ESO dispare un vuelo.
  const margenes = useRef({ margenIzq, margenDer })
  margenes.current = { margenIzq, margenDer }

  const puntos = useRef<[number, number][]>([])
  puntos.current = paradas.map((p) => [p.lat, p.lng] as [number, number])

  const focoRef = useRef(foco)
  focoRef.current = foco

  useEffect(() => {
    if (!objetivo) return
    const destino =
      objetivo === 'foco' && focoRef.current
        ? [[focoRef.current.lat, focoRef.current.lng] as [number, number]]
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
}: {
  /** Paradas YA proyectadas con su asignación (ver `aplicarAsignaciones`). */
  paradas: Parada[]
  rutas: RutaPlan[]
  /** Ancho que le tapan los paneles flotantes. Lo usa la cámara para no encuadrar debajo de ellos. */
  margenIzq: number
  margenDer: number
}) {
  const capa = usePlannerStore((s) => s.capa)
  const herramienta = usePlannerStore((s) => s.herramienta)
  const verMercados = usePlannerStore((s) => s.verMercados)
  const verEtiquetas = usePlannerStore((s) => s.verEtiquetas)
  const rutasOcultas = usePlannerStore((s) => s.rutasOcultas)
  const optimizado = usePlannerStore((s) => s.optimizado)
  const colorPor = usePlannerStore((s) => s.colorPor)
  const verTrazos = usePlannerStore((s) => s.verTrazos)
  const verDeposito = usePlannerStore((s) => s.verDeposito)
  const seleccion = usePlannerStore((s) => s.seleccion)
  const setSeleccion = usePlannerStore((s) => s.setSeleccion)
  const paradaFoco = usePlannerStore((s) => s.paradaFoco)
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

  const foco = useMemo(() => paradas.find((p) => p.id === paradaFoco) ?? null, [paradaFoco, paradas])
  // Rango de peso del conjunto VISIBLE: la escala compara las paradas del plan entre sí, no contra un
  // máximo absoluto que no significa nada para quien mira esta pantalla.
  const rango = useMemo(() => rangoPeso(visibles), [visibles])
  const escala = escalaPorZoom(zoom)
  const conNumero = zoom >= ZOOM_NUMERO

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
      <TileLayer key={capa} url={TILES[capa]} subdomains={capa === 'suave' ? 'abcd' : 'abc'} />
      <InvalidateOnResize />
      <ZoomWatch onZoom={setZoom} />
      <Camara paradas={paradas} foco={foco} margenIzq={margenIzq} margenDer={margenDer} />

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
      {trazos.map(({ ruta, path }) => (
        <Polyline
          key={ruta.id}
          positions={path}
          pathOptions={{
            color: '#ffffff',
            weight: 4,
            opacity: 0.85,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
      ))}
      {trazos.map(({ ruta, path }) => (
        <Polyline
          key={`color-${ruta.id}`}
          positions={path}
          pathOptions={{
            color: ruta.color,
            weight: 2,
            opacity: 1,
            lineCap: 'round',
            lineJoin: 'round',
            className: 'ruta-trazo',
          }}
        />
      ))}

      {/* De acá sale todo: sin el almacén el mapa no explica de dónde arrancan las rutas. Se puede
          apagar desde Capas porque cae justo en el centro de la ciudad y a veces tapa paradas. */}
      {verDeposito && (
        <Marker position={[DEPOSITO.lat, DEPOSITO.lng]} icon={pinDeposito}>
          <Tooltip direction="top" offset={[0, -20]}>
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
            icon={pinParada(parada, colorDe(parada), ancho, marcada, enFoco, conNumero)}
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
        cargandoMercados={cargandoMercados}
      />
    </MapContainer>
  )
}
