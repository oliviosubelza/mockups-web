// Zonas de reparto: UNA sola pantalla, mapa a sangre, todo lo demás flotando encima.
//
// QUÉ REEMPLAZA. Antes eran dos pantallas: una tabla (`/zonas`) y un editor a pantalla completa
// (`/zonas/nueva`, `/zonas/:id/editar`). Para tocar una zona había que entrar de a una desde la tabla,
// y nunca se veían dos zonas juntas — así que no había forma de saber si una ya existía, si dejaba un
// hueco o si se montaba sobre su vecina. Acá el mapa está desde el primer segundo y la lista es una
// herramienta sobre él.
//
// DECISIÓN DE LAYOUT — flotar, no empujar (mismo criterio que `PlannerView` y `MonitoreoDetalleView`).
// NO se usa `SplitPane` aunque exista en `layout/`: las dos pantallas para las que se extrajo lo
// abandonaron. Un panel que empuja le come ancho al mapa, y al abrirlo o cerrarlo Leaflet rearma los
// tiles y se pierde la referencia de dónde estabas mirando. En un editor de dibujo es peor: el canvas
// se reencuadraría en medio de un trazo. Se paga con que los paneles TAPAN mapa, y se compensa con dos
// cosas: se pliegan, y la cámara recibe su ancho como padding asimétrico (`encuadrar`).
//
// LOS CUATRO BORDES, UN PAPEL CADA UNO. La versión anterior amontonaba todo en la barra de arriba
// (cancelar, ciudad, nombre, imantado, deshacer, rehacer, redibujar, cerrar, guardar: nueve controles en
// un renglón) y el único aviso de conflicto era una píldora roja que decía "se pisa con 2 zonas" y nada
// más. Ahora cada borde contesta UNA pregunta:
//   · izquierda → ¿QUÉ zonas hay? (`ZonasListaPanel`, plegable). SOLO buscar y elegir.
//   · arriba    → ¿QUÉ estoy haciendo y con qué la confirmo? (nombre, ciudad, guardar)
//   · derecha   → ¿con qué la DIBUJO? (`ZonasHerramientasDock`)
//   · abajo-der → ¿ESTÁ BIEN lo que dibujé? (`ZonasConflictosPanel`)
//   · abajo-centro → ¿QUÉ HAGO con la zona elegida? (`ZonasAccionesBar`) y, sin nada elegido, cómo se
//     usa la herramienta (la pista). Las acciones estaban en el pie del panel izquierdo, o sea a 300 px
//     de la zona sobre la que operaban; acá caen sobre el eje por el que el mouse ya se mueve.
// El criterio es que un dato que cambia en cada cuadro (la holgura) necesita un lugar fijo donde
// mirarlo, y una herramienta que se usa cincuenta veces por zona no puede cambiar de posición según si
// hay o no un botón contextual al lado.
//
// MÁQUINA DE MODOS. Antes todo el estado era un `dibujando: boolean`, y con eso no entraba nada más.
// Ahora son tres papeles distintos y explícitos:
//   · `explorar` → las zonas son el contenido: clickeables, la seleccionada resaltada, acciones en el pie.
//   · `dibujar`  → zona nueva; las demás pasan a contexto gris NO interactivo.
//   · `editar`   → una zona con sus vértices; ídem las demás.
// El modo inicial sale de la RUTA, así que `/zonas/nueva` y `/zonas/:id/editar` siguen funcionando y
// ningún link viejo se rompe.
//
// LA REGLA GEOMÉTRICA: LOS BORDES NO SE TOCAN. Entre dos zonas queda siempre una franja de
// `METROS_HOLGURA` (ver `map/geo/holgura.ts`). Se sostiene en tres lugares a la vez, y hacen falta los
// tres: el imantado DEJA la separación al poner el vértice, el panel de abajo la MIDE mientras dibujás,
// y `guardar` la EXIGE. Solo con lo primero no alcanza —el imantado se puede apagar, o suspender con
// ALT—, y solo con lo último la corrección llegaría cuando ya no te acordás qué vértice movió qué.
//
// …PERO SOLO ENTRE ZONAS DE REPARTO, y este es el eje del que cuelga casi todo lo que sigue. La misma
// pantalla dibuja dos cosas distintas (`TipoZona` en `zones-store`): territorio que alguien atiende y
// franjas donde no se puede circular. La regla de arriba existe porque dos repartidores no pueden
// pelearse un cliente; una restricción no atiende a nadie, así que no tiene con quién pelearse y se
// apila libremente sobre las de reparto y sobre otras restringidas. Un centro histórico cerrado ESTÁ
// adentro de la zona de reparto que lo contiene: ese solape es el dato, no un error.
//
// De ahí que el tipo en curso apague las tres patas de la regla a la vez —el imantado, el panel de
// validación y la parte de `motivoBloqueo` que mira vecinos— en vez de solo la última. Dejar el
// imantado prendido corriéndole el vértice 1,15 m a un borde que se quiere pisar, o el panel midiendo
// una holgura que a nadie le importa, sería peor que bloquear el guardado: estaría empujando a dibujar
// mal. Lo que NO se afloja es la validez del propio contorno (mínimo de vértices, auto-cruce): eso no
// habla de los vecinos, habla de si el polígono es un polígono.
import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import { toast } from 'sonner'
import {
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  Crosshair,
  MousePointerClick,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Save,
  ShieldCheck,
} from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useRouteParams } from '@/core/routing/active-route'
import { SUBDOMINIOS, TILES } from '../map/tiles'
import { InvalidateOnResize } from '../map/InvalidateOnResize'
import { PolygonDrawLayer } from '../map/PolygonDrawLayer'
import { encuadrar } from '../map/encuadrar'
import {
  auditarZonas,
  evaluarContorno,
  formatearMetros,
  METROS_HOLGURA,
  type Evaluacion,
  type ParConflicto,
  type TipoConflicto,
} from '../map/geo/holgura'
import { areaKm2, formatearArea, perimetroM } from '../map/geo/medidas'
import type { LatLngTuple } from '../map/geo/polyline'
import { CIUDAD_IDS, CIUDAD_META, cityIdDe, ciudadDeCityId, type CiudadId } from '../mock-data'
import { describirVigencia, type VentanaVigencia } from '../restricciones/vigencia'
import { VigenciaEditor } from '../restricciones/VigenciaEditor'
import {
  CIUDAD_CENTRO,
  latLngAPoligono,
  poligonoALatLng,
  TIPO_ZONA_META,
  useZonesStore,
  type TipoZona,
  type Zona,
} from '../zones-store'
import { ZonasCapasMapa } from './ZonasCapasMapa'
import { ZonasLayer } from './ZonasLayer'
import { ZonasListaPanel, type FiltrosZonas } from './ZonasListaPanel'
import { ZonasHerramientasDock } from './ZonasHerramientasDock'
import { ZonasAccionesBar } from './ZonasAccionesBar'
import { PanelAuditoria, PanelValidacionContorno } from './ZonasConflictosPanel'
import { useHistorial } from './historial'
import { useZonasMapaStore } from './zonas-mapa-store'

const COLOR_ZONA = '#2563eb'
/** El trazo en curso de una restringida va del mismo rojo con el que va a quedar dibujada. No es
 *  decoración: es la única señal de que estás dibujando el otro tipo de zona una vez que el mouse se fue
 *  al mapa y el `<Select>` de arriba quedó a 400 px de donde estás mirando. Con el contorno siempre azul
 *  la restringida recién se delataba al guardar. */
const COLOR_ZONA_RESTRINGIDA = '#dc2626'
const INITIAL_ZOOM = 12
/** Ancho del panel de la lista. En px porque la cámara lo necesita como padding. */
const LISTA_PX = 320
const RAIL_PX = 40
/** Ancho que tapan los flotantes de la derecha (dock + panel de validación), para la cámara. */
const DERECHA_PX = 272

/**
 * Holgura que deja el IMANTADO, un poco mayor que el mínimo exigido.
 *
 * Los 15 cm de sobra no son decorativos: el vértice hace un viaje de ida y vuelta por la proyección de
 * pantalla (grados → píxeles → grados) y volver justo en el límite haría que la validación rechazara lo
 * que el propio imantado acaba de construir. Con 1,15 m el redondeo nunca alcanza para incumplir, y 15 cm
 * de franja extra no cambian ninguna decisión de reparto.
 */
const HOLGURA_SNAP_M = METROS_HOLGURA + 0.15

const SIN_CONFLICTOS: Evaluacion = { conflictos: [], holguraMinima: null, autoCruce: false }

type Modo = 'explorar' | 'dibujar' | 'editar'

/** Expone el `map` de Leaflet al componente de afuera: la cámara la maneja el workspace, que es quien
 *  sabe cuánto ancho le tapan los flotantes. */
function CapturarMapa({ onMapa }: { onMapa: (m: L.Map) => void }) {
  const map = useMap()
  useEffect(() => {
    onMapa(map)
  }, [map, onMapa])
  return null
}

/**
 * MEDIDAS EN VIVO del contorno que se está dibujando o ajustando.
 *
 * Es lo que más se pidió del editor, y por una carencia concreta: se dibujaba a ciegas. El único número
 * en pantalla era la holgura con la vecina —un metro arriba o abajo— y el TAMAÑO de lo que estabas
 * haciendo no se podía saber, porque a ojo depende del zoom: el mismo polígono parece un barrio o medio
 * departamento según cuánto acerques. Se terminaba guardando la zona, mirándola en el listado y volviendo
 * a entrar a corregirla.
 *
 * VA ACÁ, pegado bajo la barra de arriba y centrado, y no en el dock de la derecha ni en el panel de
 * validación de abajo. Tres razones y las tres son de dónde está mirando el que dibuja:
 *   · el dock son INSTRUMENTOS (botones que se aprietan); esto es un resultado que cambia solo.
 *   · el panel de abajo a la derecha contesta "¿está BIEN?" —una pregunta de sí o no, con semáforo—;
 *     esto contesta "¿cuánto MIDE?", que no tiene bien ni mal.
 *   · el centro-arriba es la única franja que queda libre en los dos modos y hereda los mismos paddings
 *     que la barra de arriba, así que nunca pisa ni el listado de la izquierda ni el dock de la derecha
 *     por más que se plieguen o aparezcan.
 *
 * SE MUESTRA DESDE EL PRIMER CLICK, con los campos que ya tengan sentido: un punto no tiene perímetro y
 * dos no encierran área. Aparecer recién con el tercer vértice haría que el chip se materializara en el
 * medio de la pantalla justo cuando ya estás concentrado en el trazo.
 */
function MedidasHud({ puntos }: { puntos: LatLngTuple[] }) {
  if (puntos.length === 0) return null
  // Se recalcula en cada cuadro del arrastre a propósito, igual que la validación de holgura: el número
  // sirve mientras movés el vértice, no cuando lo soltás. Son dos recorridos de decenas de puntos.
  const area = areaKm2(puntos)
  const perimetro = perimetroM(puntos)
  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1 text-[11px] tabular-nums shadow-lg backdrop-blur-sm">
      <span className="text-muted-foreground">
        <span className="font-semibold text-foreground">{puntos.length}</span> vért.
      </span>
      {puntos.length >= 2 && (
        <>
          <span className="h-3 w-px bg-border" aria-hidden />
          {/* El perímetro se formatea con `formatearMetros`, el mismo de la holgura: es la única forma de
              que dos largos de la misma pantalla no se lean con dos criterios distintos de unidad. */}
          <span className="text-muted-foreground">
            perímetro <span className="font-semibold text-foreground">{formatearMetros(perimetro)}</span>
          </span>
        </>
      )}
      {puntos.length >= 3 && (
        <>
          <span className="h-3 w-px bg-border" aria-hidden />
          <span className="text-muted-foreground">
            área <span className="font-semibold text-foreground">{formatearArea(area)}</span>
          </span>
        </>
      )}
    </div>
  )
}

export function ZonasWorkspaceView() {
  const { zonaId } = useRouteParams()
  const zonas = useZonesStore((s) => s.zonas)
  const addZona = useZonesStore((s) => s.addZona)
  const updateZona = useZonesStore((s) => s.updateZona)
  const setZonaActiva = useZonesStore((s) => s.setZonaActiva)
  const removeZona = useZonesStore((s) => s.removeZona)

  const mapaRef = useRef<L.Map | null>(null)
  const [mapaListo, setMapaListo] = useState(false)
  /** Fondo del mapa. Del store del aspecto y no de un `useState`: lo elige el menú de la esquina de
   *  abajo a la derecha, que está en otra rama del árbol. Ver `zonas-mapa-store`. */
  const capa = useZonasMapaStore((s) => s.capa)

  // El modo inicial sale de la ruta. `/zonas/nueva` entra dibujando, `/zonas/:id/editar` editando esa
  // zona, y `/zonas` a explorar. Se calcula UNA vez: después el modo lo maneja la pantalla.
  const rutaInicial = useRef<{ modo: Modo; id: number | null }>({
    modo: zonaId ? 'editar' : window.location.pathname.endsWith('/nueva') ? 'dibujar' : 'explorar',
    id: zonaId ? Number(zonaId) : null,
  })

  const [modo, setModo] = useState<Modo>(rutaInicial.current.modo)
  const [enEdicionId, setEnEdicionId] = useState<number | null>(rutaInicial.current.id)
  const [seleccionadaId, setSeleccionadaId] = useState<number | null>(rutaInicial.current.id)
  const [listaAbierta, setListaAbierta] = useState(true)
  const [filtros, setFiltros] = useState<FiltrosZonas>({ texto: '' })
  const [aBorrar, setABorrar] = useState<Zona | null>(null)
  /** Auditoría de lo ya guardado. Apagable: con muchas zonas mal dibujadas el mapa queda rojo entero y
   *  deja de decir nada; encendida se usa para una revisión, no como fondo permanente. */
  const [verAuditoria, setVerAuditoria] = useState(false)

  // --- estado del formulario de la zona en curso ---
  const [nombre, setNombre] = useState('')
  const [ciudad, setCiudad] = useState<CiudadId>('santacruz')
  /** Tipo de la zona en curso. Solo tiene sentido editando; en `explorar` es un valor dormido que nadie
   *  lee (lo que se pinta ahí sale del `tipo` de cada zona guardada, no de este estado). */
  const [tipo, setTipo] = useState<TipoZona>('reparto')
  /**
   * Vigencia de la zona en curso. Vacío = permanente, que es el default y el caso correcto.
   *
   * Se mantiene aunque el tipo sea `reparto` en vez de vaciarse al cambiar de tipo: el `<Select>` de
   * tipo se puede tocar dos veces sin querer mientras se dibuja, y perder tres franjas cargadas por ese
   * viaje de ida y vuelta sería un castigo por explorar la pantalla. Lo que decide qué se guarda es el
   * `restringida` del momento de guardar, no el estado del campo.
   */
  const [vigencia, setVigencia] = useState<VentanaVigencia[]>([])
  const [snap, setSnap] = useState(true)
  const historial = useHistorial<LatLngTuple[]>([])
  const puntos = historial.presente
  /** `true` mientras se agregan vértices con click; `false` = ajustando los existentes. */
  const [trazando, setTrazando] = useState(rutaInicial.current.modo === 'dibujar')

  const editando = modo !== 'explorar'
  /** El atajo que decide qué reglas corren. Se lee muchas veces, y `tipo === 'restringida'` repetido
   *  ocho veces esconde que todas esas decisiones son LA MISMA. */
  const restringida = editando && tipo === 'restringida'
  const vivas = useMemo(() => zonas.filter((z) => !z.deletedAt), [zonas])
  const seleccionada = useMemo(
    () => vivas.find((z) => z.id === seleccionadaId) ?? null,
    [vivas, seleccionadaId],
  )
  const nombreDe = (id: number) => vivas.find((z) => z.id === id)?.name ?? `Zona ${id}`

  const visibles = useMemo(() => {
    const texto = filtros.texto.trim().toLowerCase()
    return vivas.filter(
      (z) =>
        (!texto || z.name.toLowerCase().includes(texto)) &&
        (!filtros.estado || z.isActive === (filtros.estado === 'activa')) &&
        (!filtros.tipo || z.tipo === filtros.tipo),
    )
  }, [vivas, filtros])

  /** Las que se dibujan: en `explorar` las filtradas; editando, las de la ciudad de la zona en curso
   *  menos ella misma —el resto es ruido para el que dibuja. */
  const enMapa = useMemo(() => {
    if (!editando) return visibles.filter((z) => z.polygonGeoJson)
    return vivas.filter((z) => z.polygonGeoJson && z.isActive && z.id !== enEdicionId && z.cityId === cityIdDe(ciudad))
  }, [editando, visibles, vivas, enEdicionId, ciudad])

  /**
   * Los anillos contra los que se MIDE, una sola vez por cambio: los usan el imantado, la validación
   * del contorno en curso y la auditoría, y reconvertir el GeoJSON en cada cuadro de un arrastre sería
   * trabajo repetido al doble.
   *
   * No es lo mismo que `enMapa` —lo que se DIBUJA—, y separarlos es lo que hace que el tipo funcione:
   *   · dibujando una restringida no hay vecinos, punto. La lista vacía apaga sola el imantado, deja la
   *     evaluación sin conflictos posibles y vacía el panel; no hace falta un `if` por cada consumidor.
   *   · dibujando una de reparto, las restringidas que estén encima quedan afuera. Están en el mapa
   *     como contexto, pero medirle la holgura a la franja que uno viene a pisar produciría un
   *     conflicto insalvable: la única forma de resolverlo sería mover el borde de la zona de reparto
   *     para esquivar la restricción, que es exactamente lo contrario de lo que la restricción dice.
   *   · en `explorar`, la auditoría hereda el mismo filtro y por eso no reporta como error los solapes
   *     que las restringidas tienen por diseño.
   */
  const vecinos = useMemo(() => {
    if (restringida) return []
    return enMapa
      .filter((z) => z.tipo === 'reparto')
      .map((z) => ({ id: z.id, anillo: poligonoALatLng(z.polygonGeoJson) }))
  }, [restringida, enMapa])
  const anillosSnap = useMemo(() => (editando ? vecinos.map((v) => v.anillo) : []), [editando, vecinos])

  /**
   * Validación del contorno EN CURSO. Se recalcula en cada cuadro del arrastre a propósito: el aviso
   * tiene que llegar mientras movés el vértice, no al soltarlo.
   *
   * Se evalúa como CERRADO desde el tercer vértice aunque todavía se esté trazando: es la forma que se
   * guardaría si apretaras Guardar ahora, y validar la otra (el trazo abierto, sin el lado que une el
   * último punto con el primero) daría por buenos contornos que al cerrarse pisan a la vecina.
   *
   * Sigue corriendo para las restringidas aunque no tengan vecinos, y no es al pepe: con la lista vacía
   * `evaluarContorno` no puede devolver conflictos, pero sí el `autoCruce`, que es lo único que se le
   * exige a las dos por igual.
   */
  const evaluacion = useMemo(
    () => (editando ? evaluarContorno(puntos, puntos.length >= 3, vecinos) : SIN_CONFLICTOS),
    [editando, puntos, vecinos],
  )

  /** Auditoría de las zonas guardadas. Solo se calcula encendida: es O(pares · vértices²) y no hace
   *  falta mientras nadie la mire. */
  const auditoria = useMemo(
    () => (verAuditoria && !editando ? auditarZonas(vecinos) : []),
    [verAuditoria, editando, vecinos],
  )

  /** Qué zonas se pintan de conflicto y por qué. Editando son las que invade el contorno en curso; en
   *  explorar, las de cada par de la auditoría. */
  const enConflicto = useMemo(() => {
    const mapa = new Map<number, TipoConflicto>()
    const marcar = (id: number, tipo: TipoConflicto) => {
      // `solapa` gana sobre `holgura`: si una zona tiene los dos problemas, el grave es el que se pinta.
      if (tipo === 'solapa' || !mapa.has(id)) mapa.set(id, tipo)
    }
    if (editando) evaluacion.conflictos.forEach((c) => marcar(c.id, c.tipo))
    else auditoria.forEach((p) => [p.a, p.b].forEach((id) => marcar(id, p.tipo)))
    return mapa
  }, [editando, evaluacion, auditoria])

  const margenes = {
    margenIzq: (listaAbierta ? LISTA_PX : RAIL_PX) + 24,
    margenDer: editando || verAuditoria ? DERECHA_PX : 24,
  }

  const volarA = (pts: LatLngTuple[]) => {
    if (mapaRef.current && pts.length > 0) encuadrar(mapaRef.current, pts, { ...margenes, zoomMax: 15 })
  }
  const volarAZona = (id: number) => {
    const z = vivas.find((x) => x.id === id)
    if (z) volarA(poligonoALatLng(z.polygonGeoJson))
  }
  /** Encuadra las DOS zonas del par: un conflicto de bordes solo se entiende viendo las dos juntas. */
  const volarAlPar = (par: ParConflicto) => {
    const pts = [par.a, par.b].flatMap((id) => {
      const z = vivas.find((x) => x.id === id)
      return z ? poligonoALatLng(z.polygonGeoJson) : []
    })
    volarA(pts)
  }

  // --- entradas a cada modo -------------------------------------------------------------------
  const abrirEdicion = (id: number) => {
    const zona = vivas.find((z) => z.id === id)
    if (!zona) return toast.error('Esa zona ya no existe')
    const pts = poligonoALatLng(zona.polygonGeoJson)
    setNombre(zona.name)
    setCiudad(ciudadDeCityId(zona.cityId) ?? 'santacruz')
    // El tipo se TRAE de la zona y el selector queda deshabilitado (ver la barra de arriba): editar es
    // corregirle el contorno o el nombre a algo que ya existe, no reclasificarlo. El store ignora
    // `input.tipo` en `updateZona` de todos modos, así que dejarlo habilitado sería ofrecer un cambio
    // que se descarta en silencio.
    setTipo(zona.tipo)
    setVigencia(zona.vigencia)
    historial.reiniciar(pts)
    setEnEdicionId(id)
    setSeleccionadaId(id)
    setTrazando(pts.length === 0)
    setModo('editar')
    volarA(pts)
  }

  const abrirNueva = () => {
    setNombre('')
    // Vuelve a `reparto` en cada zona nueva, aunque la anterior haya sido restringida. Arrastrar el
    // último tipo elegido ahorraría un click al que dibuja tres restricciones seguidas, pero le
    // regalaría una zona de tipo equivocado al que dibuja una y después vuelve a lo de siempre — y ese
    // error no se puede deshacer editando (`updateZona` no muda el tipo): hay que borrar y rehacer.
    // El default es el caso dominante: las restringidas son la excepción.
    setTipo('reparto')
    // La vigencia se resetea acá SÍ O SÍ, y es el olvido más caro de esta pantalla: el estado sobrevive
    // a la zona anterior, así que sin esta línea la restricción que se acaba de cerrar le presta sus
    // horarios a la siguiente. Y como el control solo aparece para las restringidas, el que dibuja una
    // de reparto no vería nunca que quedaron ahí —cargados, invisibles y listos para viajar en el input
    // el día que ese estado se lea sin mirar el tipo—.
    setVigencia([])
    historial.reiniciar([])
    setEnEdicionId(null)
    setSeleccionadaId(null)
    setTrazando(true)
    setModo('dibujar')
  }

  const salirAExplorar = () => {
    setModo('explorar')
    setEnEdicionId(null)
    historial.reiniciar([])
    setTrazando(false)
  }

  // Modo inicial desde la ruta, una sola vez. Va en un efecto y no en el `useState` porque `abrirEdicion`
  // necesita el store ya leído y la cámara ya montada para poder encuadrar.
  useEffect(() => {
    if (rutaInicial.current.modo === 'editar' && rutaInicial.current.id !== null) {
      abrirEdicion(rutaInicial.current.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapaListo])

  // --- acciones -------------------------------------------------------------------------------
  const seleccionar = (id: number | null) => {
    setSeleccionadaId(id)
    if (id === null) return
    // Ya NO se despliega el listado al seleccionar. Antes hacía falta porque las acciones vivían en su
    // pie y con el panel plegado quedaban escondidas detrás del riel; ahora salen en la barra de abajo,
    // así que abrir el panel solo le robaría 280 px de mapa a alguien que lo plegó a propósito.
    volarAZona(id)
  }

  const encuadrarTodo = () => {
    const pts = enMapa.flatMap((z) => poligonoALatLng(z.polygonGeoJson))
    if (pts.length === 0) return toast.info('No hay zonas dibujadas para encuadrar')
    volarA(pts)
  }

  const cerrarPoligono = (finales: LatLngTuple[]) => {
    historial.confirmar(finales)
    setTrazando(false)
    toast.success('Polígono cerrado — ajustá los vértices o guardá la zona')
  }

  /**
   * Por qué NO se puede guardar, en una frase, o `null` si se puede.
   *
   * Se devuelve el MOTIVO y no un booleano porque un botón deshabilitado sin explicación es el peor
   * resultado posible: el que dibuja ve que no puede seguir y no tiene forma de saber qué le falta. El
   * texto va al `title` del botón y al toast del intento.
   */
  const motivoBloqueo: string | null = useMemo(() => {
    if (!nombre.trim()) return 'Ponele un nombre a la zona'
    if (puntos.length < 3) return 'Un polígono necesita al menos 3 vértices'
    if (evaluacion.autoCruce) return 'El contorno se cruza consigo mismo: sus propios bordes se tocan'

    // ACÁ SE PARTE EN DOS. Todo lo de arriba pregunta si esto es un polígono; todo lo de abajo pregunta
    // cómo se lleva con los vecinos, y una restringida no tiene esa conversación. El corte explícito
    // sobra técnicamente —sin vecinos, `evaluacion.conflictos` ya viene vacío y las dos ramas de abajo
    // devuelven `null` solas—, y está igual por dos razones: deja dicho que es una decisión y no una
    // consecuencia, y aguanta que mañana `vecinos` deje de venir vacío para las restringidas (por
    // ejemplo si se quisiera medir sin bloquear) sin que eso reviva un bloqueo que no corresponde.
    if (restringida) return null

    const solapan = evaluacion.conflictos.filter((c) => c.tipo === 'solapa')
    if (solapan.length > 0) {
      return `Se pisa con ${solapan.map((c) => nombreDe(c.id)).join(', ')}`
    }
    const cerca = evaluacion.conflictos.filter((c) => c.tipo === 'holgura')
    if (cerca.length > 0) {
      const peor = cerca.reduce((a, b) => ((a.metros ?? 0) <= (b.metros ?? 0) ? a : b))
      return `El borde queda a ${formatearMetros(peor.metros ?? 0)} de ${nombreDe(peor.id)}: el mínimo es ${formatearMetros(METROS_HOLGURA)}`
    }
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nombre, puntos, evaluacion, restringida, vivas])

  const guardar = () => {
    if (motivoBloqueo) return toast.error(motivoBloqueo)
    const polygonGeoJson = latLngAPoligono(puntos)
    if (!polygonGeoJson) return
    // El `tipo` viaja siempre en el input aunque `updateZona` lo descarte: el store es el que manda con
    // esa regla, y armar dos payloads distintos según el modo obligaría a mantener dos formas de lo
    // mismo para expresar algo que ya está dicho una vez y en el lugar correcto.
    // La vigencia viaja vacía si la zona es de reparto, aunque el estado local tenga franjas de una
    // restringida que se estaba dibujando antes: el campo existe en las dos pero solo significa algo en
    // las restringidas (ver `zones-store`), y guardar un horario en un particionamiento del territorio
    // sería dejar un dato que nadie va a mirar hasta el día que alguien lo mire y lo crea.
    const input = {
      name: nombre.trim(),
      tipo,
      vigencia: restringida ? vigencia : [],
      cityId: cityIdDe(ciudad),
      polygonGeoJson,
    }
    if (modo === 'editar' && enEdicionId !== null) {
      updateZona(enEdicionId, input)
      toast.success(`${input.name} actualizada`)
      setSeleccionadaId(enEdicionId)
    } else {
      const creada = addZona(input)
      toast.success(`${input.name} creada`)
      setSeleccionadaId(creada.id)
    }
    salirAExplorar()
  }

  // Ctrl/Cmd+Z y Ctrl/Cmd+Shift+Z. Van acá y no en `PolygonDrawLayer` porque ahí los atajos solo se
  // escuchan mientras se trazan vértices, y deshacer tiene que servir también ajustándolos.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
      e.preventDefault()
      if (e.shiftKey) historial.rehacer()
      else historial.deshacer()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [historial])

  return (
    <Card className="relative h-full min-h-0 gap-0 overflow-hidden rounded-none border-0 p-0">
      <div className="absolute inset-0 isolate">
        <MapContainer
          center={CIUDAD_CENTRO[ciudad]}
          zoom={INITIAL_ZOOM}
          scrollWheelZoom
          attributionControl={false}
          zoomControl={false}
          className="h-full w-full"
        >
          {/* `key`: sin él, Leaflet reusa la capa y solo le cambia la URL, y las teselas viejas del
              fondo anterior se quedan pintadas hasta que alguien mueve el mapa. Remontando, entra
              limpia. Está explicado igual en `PlannerMapa`, que fue donde se descubrió. */}
          <TileLayer key={capa} url={TILES[capa]} subdomains={SUBDOMINIOS[capa]} />
          <InvalidateOnResize />
          <CapturarMapa
            onMapa={(m) => {
              mapaRef.current = m
              setMapaListo(true)
            }}
          />

          <ZonasLayer
            zonas={enMapa}
            papel={editando ? 'contexto' : 'contenido'}
            seleccionadaId={seleccionadaId}
            onSeleccionar={seleccionar}
            enConflicto={enConflicto}
            // Esta pantalla ES la que tiene el menú de aspecto, así que es la única que lo obedece. El
            // planner monta la misma capa sin la bandera y no se entera de nada. Ver `ZonasLayer`.
            aspectoEditor
          />

          {editando && (
            <PolygonDrawLayer
              puntos={puntos}
              activo={trazando}
              onPuntosChange={(pts, transitorio) =>
                transitorio ? historial.reemplazar(pts) : historial.confirmar(pts)
              }
              onFinalizar={cerrarPoligono}
              color={restringida ? COLOR_ZONA_RESTRINGIDA : COLOR_ZONA}
              anillosSnap={anillosSnap}
              snapActivo={snap}
              holguraMetros={HOLGURA_SNAP_M}
            />
          )}
        </MapContainer>
      </div>

      {/* ── Izquierda: qué zonas hay ─────────────────────────────────────────────────────────── */}
      <div
        className="pointer-events-none absolute inset-y-3 left-3 z-10 flex transition-[width] duration-200"
        style={{ width: listaAbierta ? LISTA_PX : RAIL_PX }}
      >
        <div className="pointer-events-auto flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card/95 shadow-xl backdrop-blur-sm">
          <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={() => setListaAbierta((v) => !v)}
              title={listaAbierta ? 'Plegar el listado' : 'Mostrar el listado'}
            >
              {listaAbierta ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
            </Button>
            {listaAbierta && (
              <>
                {/* Ya no dice "Zonas de reparto": el listado tiene los dos tipos y el título sería el
                    nombre de uno de ellos puesto arriba de los dos. Cuál es cuál lo dice el badge de
                    cada fila. */}
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">Zonas</span>
                <span className="shrink-0 pr-1 text-[11px] tabular-nums text-muted-foreground">
                  {visibles.length}
                </span>
              </>
            )}
          </div>

          {listaAbierta && (
            <div className="min-h-0 flex-1">
              <ZonasListaPanel
                zonas={visibles}
                filtros={filtros}
                onFiltros={setFiltros}
                seleccionadaId={seleccionadaId}
                onSeleccionar={seleccionar}
                onEditar={abrirEdicion}
                deshabilitado={editando}
                enConflicto={enConflicto}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Arriba: qué estoy haciendo y con qué lo confirmo ─────────────────────────────────── */}
      <div
        className="pointer-events-none absolute inset-x-0 top-3 z-10 flex flex-col items-center gap-2 px-3"
        style={{
          paddingLeft: (listaAbierta ? LISTA_PX : RAIL_PX) + 24,
          paddingRight: editando ? 64 : 12,
        }}
      >
        <div className="pointer-events-auto flex h-11 max-w-full items-center gap-2 overflow-hidden rounded-xl border border-border bg-card/95 px-2 shadow-xl backdrop-blur-sm">
          {!editando ? (
            <>
              <Button size="sm" className="h-7 gap-1.5 px-2.5 text-xs" onClick={abrirNueva}>
                <PenLine size={13} />
                Nueva zona
              </Button>
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={encuadrarTodo}>
                <Crosshair size={13} />
                Encuadrar todo
              </Button>
              <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />
              {/* La auditoría es un MODO de mirar, no una acción: por eso es un toggle y no un botón que
                  dispara algo. El resultado vive en el panel de abajo a la derecha. */}
              <Button
                variant={verAuditoria ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                aria-pressed={verAuditoria}
                onClick={() => setVerAuditoria((v) => !v)}
                title={`Revisar que ninguna zona se pise y que todas queden a ${formatearMetros(METROS_HOLGURA)} de su vecina`}
              >
                {verAuditoria && auditoria.length > 0 ? (
                  <AlertTriangle size={13} className="text-destructive" />
                ) : (
                  <ShieldCheck size={13} className={verAuditoria ? 'text-emerald-600' : ''} />
                )}
                Auditar bordes
                {verAuditoria && auditoria.length > 0 && (
                  <span className="ml-0.5 rounded bg-destructive/15 px-1 text-[10px] font-semibold tabular-nums text-destructive">
                    {auditoria.length}
                  </span>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={salirAExplorar}
              >
                <ChevronLeft size={14} />
                Cancelar
              </Button>
              <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />

              <Select value={ciudad} onValueChange={(v) => setCiudad(v as CiudadId)}>
                <SelectTrigger className="h-7 w-32 shrink-0 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CIUDAD_IDS.map((id) => (
                    <SelectItem key={id} value={id}>
                      {CIUDAD_META[id].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* El tipo va acá, en la franja de la IDENTIDAD de la zona (ciudad, nombre) y no en el
                  dock de la derecha, aunque cambie cómo se dibuja: el dock son instrumentos que se
                  tocan cincuenta veces por zona, y esto se elige una vez y no se toca nunca más.
                  Además es lo primero que hay que decidir —cambia qué reglas corren—, así que va antes
                  del nombre en el orden de lectura.

                  DESHABILITADO EDITANDO, no escondido: si desapareciera, una zona abierta no diría de
                  qué tipo es, y saber que estás tocando una restringida es justo lo que explica que el
                  imantado esté apagado y que no haya panel de validación. Apagado con el motivo en el
                  `title` es la misma solución que el botón de guardar. */}
              <Select
                value={tipo}
                onValueChange={(v) => setTipo(v as TipoZona)}
                disabled={modo === 'editar'}
              >
                <SelectTrigger
                  className="h-7 w-32 shrink-0 text-xs"
                  title={
                    modo === 'editar'
                      ? 'El tipo se elige al crear la zona y no se puede cambiar después'
                      : 'Reparto: territorio que alguien atiende, no puede pisar a otra zona de reparto. Restringida: franja donde no se circula, se superpone libremente.'
                  }
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TIPO_ZONA_META) as TipoZona[]).map((id) => (
                    <SelectItem key={id} value={id}>
                      {TIPO_ZONA_META[id].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder={modo === 'editar' ? 'Nombre de la zona' : 'Nombre de la zona nueva'}
                maxLength={50}
                className="h-7 w-44 min-w-0 text-xs"
              />

              {/* LA VIGENCIA, SOLO PARA LAS RESTRINGIDAS. No es que esté deshabilitada en las de
                  reparto como el `<Select>` de tipo: no está. La diferencia es deliberada y las dos
                  son correctas por lo mismo —qué información deja cada ausencia—. El tipo apagado
                  sigue DICIENDO de qué tipo es la zona abierta, que es un dato que hace falta; una
                  vigencia apagada en una zona de reparto no diría nada, salvo insinuar que algún día
                  se va a poder poner horario a un territorio, que es justamente lo que no queremos.

                  UN TRIGGER CON EL RESUMEN Y NO LOS CAMPOS EN LA BARRA: la vigencia son hasta cuatro
                  campos por franja y la barra ya tiene ciudad, tipo, nombre y guardar en un renglón de
                  44 px. Lo que se necesita ver siempre es UNA frase —"Permanente", "Lu a Vi ·
                  07:00–19:00"—, que es la respuesta a la pregunta; el resto es para cuando se la va a
                  cambiar. Además la carga de horarios es un momento distinto del de dibujar el
                  contorno, y un popover deja el mapa entero libre en cuanto se cierra. */}
              {restringida && (
                <Popover>
                  <PopoverTrigger
                    className={cn(
                      buttonVariants({ variant: 'outline', size: 'sm' }),
                      'h-7 max-w-52 shrink-0 gap-1.5 px-2 text-xs',
                      // Resaltado solo cuando hay algo cargado: "Permanente" es el default y no merece
                      // llamar la atención, pero una restricción con horario SÍ —es la diferencia entre
                      // una zona que recorta siempre y una que recorta a veces, y en el mapa se ven
                      // igual—.
                      vigencia.length > 0 && 'border-primary/50 bg-primary/5',
                    )}
                    title="Cuándo rige esta restricción"
                  >
                    <CalendarClock size={13} className="shrink-0" />
                    <span className="min-w-0 truncate">{describirVigencia(vigencia)}</span>
                  </PopoverTrigger>
                  {/* 380 px: es el ancho para el que está pensado `VigenciaEditor` —siete chips de día en
                      un renglón y las horas y fechas de a dos—. El default del popover (288) parte los
                      días en dos líneas. */}
                  <PopoverContent align="start" className="w-[380px]">
                    <VigenciaEditor ventanas={vigencia} onChange={setVigencia} />
                  </PopoverContent>
                </Popover>
              )}

              <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />

              {/* El botón se deshabilita CON el motivo puesto en el title: un botón apagado sin
                  explicación deja al que dibuja sin saber qué le falta. El detalle completo (contra
                  quién y por cuánto) está en el panel de validación. */}
              <Button
                size="sm"
                className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
                disabled={motivoBloqueo !== null}
                title={motivoBloqueo ?? 'Guardar la zona'}
                onClick={guardar}
              >
                <Save size={13} />
                Guardar
              </Button>
            </>
          )}
        </div>

        {/* Las medidas cuelgan de la MISMA columna que la barra, así que heredan sus dos paddings —el
            del listado a la izquierda, el del dock a la derecha— y no hay una segunda posición que
            mantener sincronizada cuando el panel se pliega. */}
        {editando && <MedidasHud puntos={puntos} />}
      </div>

      {/* ── Derecha alta: con qué la dibujo ──────────────────────────────────────────────────── */}
      {editando && (
        <div className="pointer-events-none absolute right-3 top-16 z-10 flex">
          <ZonasHerramientasDock
            snap={snap}
            onSnap={() => setSnap((v) => !v)}
            // El imantado se apaga explícitamente para las restringidas, además de quedar sin anillos
            // por `vecinos`. La condición redundante está para que el motivo se pueda NOMBRAR: con
            // solo la lista vacía el botón diría "no hay zonas vecinas en esta ciudad", que es falso
            // —las hay, y se están viendo de fondo— y manda a buscar un problema que no existe.
            snapDisponible={!restringida && anillosSnap.length > 0}
            motivoSinSnap={
              restringida
                ? 'Imantado: solo para zonas de reparto — las restringidas pueden pisarse'
                : undefined
            }
            puedeDeshacer={historial.puedeDeshacer}
            onDeshacer={historial.deshacer}
            puedeRehacer={historial.puedeRehacer}
            onRehacer={historial.rehacer}
            trazando={trazando}
            puedeCerrar={puntos.length >= 3}
            onCerrar={() => cerrarPoligono(puntos)}
            puedeRedibujar={puntos.length > 0}
            onRedibujar={() => {
              historial.confirmar([])
              setTrazando(true)
            }}
            onEncuadrar={() => volarA(puntos)}
          />
        </div>
      )}

      {/* ── Abajo a la derecha: está bien lo que hay ─────────────────────────────────────────── */}
      <div className="pointer-events-none absolute bottom-4 right-3 z-10 flex flex-col items-end gap-2">
        {/* Sin panel para las restringidas. Con `vecinos` vacío el panel no mentiría —diría "sin
            conflictos" y sería cierto—, pero un semáforo permanentemente en verde entrena a no mirarlo,
            y cuando después se vuelve a una zona de reparto ese mismo panel es el único lugar donde se
            lee a cuántos centímetros está el borde. Vale más que no esté que tenerlo diciendo que todo
            está bien porque no hay nada que revisar. */}
        {editando && !restringida ? (
          <PanelValidacionContorno
            vertices={puntos.length}
            evaluacion={evaluacion}
            nombreDe={nombreDe}
            onIrAZona={volarAZona}
          />
        ) : (
          // El `!editando` es nuevo y hace falta: antes esta rama solo se alcanzaba explorando, y ahora
          // también cae acá el caso de estar dibujando una restringida. Sin el guardia aparecería el
          // panel de auditoría —con cero pares, porque `auditoria` no se calcula editando— diciendo que
          // todas las zonas están bien justo mientras estás dibujando una.
          !editando &&
          verAuditoria && (
            <PanelAuditoria
              pares={auditoria}
              // `vecinos` y no `enMapa`: el contador dice cuántas zonas SE AUDITARON, y las
              // restringidas están en el mapa pero fuera de la auditoría. Con `enMapa` el panel diría
              // "7 zonas · todas separadas" habiendo mirado cinco, que es la clase de número que
              // después nadie vuelve a cuestionar.
              total={vecinos.length}
              nombreDe={nombreDe}
              onIrAlPar={volarAlPar}
            />
          )
        )}

        {/* El aspecto del mapa, DEBAJO del panel y siempre presente. Es la esquina que ya contesta "¿cómo
            se ve esto?" —el panel de arriba dice si lo dibujado está bien—, y es la misma posición
            relativa que ocupa el control de capas en planificación y en monitoreo: abajo, contra el borde
            derecho. Un botón que cambia de lugar según si hay panel obligaría a buscarlo cada vez, así que
            se apilan en columna y el que se va es el de arriba. */}
        <div className="pointer-events-auto flex flex-col items-center rounded-xl border border-border bg-card/95 p-1 shadow-xl backdrop-blur-sm">
          <ZonasCapasMapa />
        </div>
      </div>

      {/* ── Abajo al centro: qué hago con la zona elegida, o cómo se usa la herramienta ──────── */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center"
        style={{
          paddingLeft: (listaAbierta ? LISTA_PX : RAIL_PX) + 24,
          // El `64` de la rama corta ya no es un margen de cortesía: abajo a la derecha ahora hay
          // SIEMPRE un botón (el de aspecto del mapa), así que sin esto la barra de acciones de una zona
          // con nombre largo se le montaría encima en pantallas angostas.
          paddingRight: editando || verAuditoria ? DERECHA_PX : 64,
        }}
      >
        {/* La barra de acciones OCUPA el lugar de la pista, no se apila sobre ella: la pista dice
            "click en una zona la selecciona", que es exactamente lo que acabás de hacer. Repetir la
            instrucción que ya cumpliste gasta la única franja libre que queda abajo. */}
        {!editando && seleccionada ? (
          <ZonasAccionesBar
            zona={seleccionada}
            onEditar={() => abrirEdicion(seleccionada.id)}
            onEncuadrar={() => volarAZona(seleccionada.id)}
            onAlternarActiva={() => setZonaActiva(seleccionada.id, !seleccionada.isActive)}
            onEliminar={() => setABorrar(seleccionada)}
            onCerrar={() => setSeleccionadaId(null)}
          />
        ) : (
          <div className="flex max-w-full items-center gap-2 rounded-full border border-border bg-card/95 px-3.5 py-1.5 text-xs text-muted-foreground shadow-xl backdrop-blur-sm">
            <MousePointerClick size={13} className="shrink-0" />
            {!editando ? (
              <span className="truncate">
                Click en una zona la selecciona · doble click en el listado abre su contorno para editar.
              </span>
            ) : trazando ? (
              <span className="truncate">
                {puntos.length === 0 ? (
                  <>Click en el mapa para empezar el polígono</>
                ) : (
                  <>
                    <span className="font-medium tabular-nums text-foreground">{puntos.length}</span> vértice
                    {puntos.length !== 1 ? 's' : ''} · Enter cierra · Backspace deshace
                  </>
                )}{' '}
                · <kbd className="font-medium text-foreground">Espacio</kbd> mueve el mapa
                {anillosSnap.length > 0 && snap && (
                  <>
                    {' '}· <kbd className="font-medium text-foreground">Alt</kbd> suspende el imantado
                  </>
                )}
                .
              </span>
            ) : (
              <span className="truncate">
                Arrastrá los vértices · click en un tirador punteado inserta uno · click derecho borra ·{' '}
                <kbd className="font-medium text-foreground">Espacio</kbd> mueve el mapa.
              </span>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={aBorrar !== null} onOpenChange={(abierto) => !abierto && setABorrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar «{aBorrar?.name}»</AlertDialogTitle>
            <AlertDialogDescription>
              La zona sale de los listados pero el registro se conserva: un plan viejo puede seguir
              apuntando a ella por id.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!aBorrar) return
                removeZona(aBorrar.id)
                if (seleccionadaId === aBorrar.id) setSeleccionadaId(null)
                toast.success(`${aBorrar.name} eliminada`)
                setABorrar(null)
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
