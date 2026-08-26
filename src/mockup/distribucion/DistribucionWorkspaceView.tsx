// Zonas de DISTRIBUCIÓN: qué distribuidora despacha cada pedido, según dónde cae.
//
// ═══ QUÉ ES Y QUÉ NO ES ═══
//
// Son dos cortes INDEPENDIENTES del mismo territorio, y esta pantalla es el segundo:
//   · `/zonas` (zonas logísticas, `zones`) parte una ciudad para armar rutas → "¿con qué otras paradas
//     viaja este pedido?". Muchas zonas por ciudad, sin dueño.
//   · acá (`distribution_zones`) se parte la ciudad entre DISTRIBUIDORAS → "¿quién lo despacha?". Una
//     zona por distribuidora, y la distribuidora es su dueña.
// Un pedido cae primero en una zona de distribución y después en una de reparto. No tienen por qué
// coincidir, y el editor es el mismo a propósito: el gesto de recortar territorio es idéntico y no hay
// razón para que se aprenda dos veces.
//
// ═══ LA DIFERENCIA DE FONDO CON EL EDITOR DE ZONAS: ACÁ NO SE CREA NADA ═══
//
// En `/zonas` cada fila del listado es una zona que alguien creó, y el botón principal es «Nueva zona».
// Acá las filas YA EXISTEN —son el maestro de distribuidoras— y lo que falta o no es su POLÍGONO. De ahí
// las tres consecuencias que separan esta pantalla de su gemela:
//   1. No hay botón de «nueva» ni campo de nombre: el nombre de la zona es el de su distribuidora, y
//      guardarlo aparte sería tener dos nombres para la misma cosa esperando a divergir.
//   2. Los modos son DOS y no tres (`explorar` / `editar`): «dibujar de cero» y «ajustar vértices» son la
//      misma operación sobre la misma fila, y las distingue `trazando`, no el modo.
//   3. El estado que importa de cada distribuidora es «con zona / sin zona», y es lo primero que se lee
//      en el listado: es lo único que dice si el mapa de la ciudad está terminado o a medias.
//
// ═══ LA CIUDAD ES EL FILTRO SUPERIOR, NO UN CAMPO DEL FORMULARIO ═══
//
// En `/zonas` la ciudad se elige mientras dibujás, porque es un atributo de la zona que estás creando.
// Acá la ciudad es de la DISTRIBUIDORA (`distributors.city_id`, columna que se agregó junto con esta
// tabla), así que no se elige: se filtra por ella para ver con quiénes hay que repartir ese territorio.
// Por eso el selector está siempre visible en la barra de arriba y queda BLOQUEADO mientras se dibuja —
// cambiarlo en medio de un trazo cambiaría de dueño la geometría a mitad de camino.
//
// ═══ LOS BORDES NO SE TOCAN, Y ACÁ LA REGLA PESA MÁS QUE EN ZONAS ═══
//
// Se reusa tal cual la maquinaria de `map/geo/holgura`: imantado que DEJA la separación, panel que la MIDE
// mientras dibujás y `guardar` que la EXIGE. Pero la consecuencia de romperla es peor: dos zonas
// logísticas superpuestas son un pedido que puede viajar en dos camiones —molesto—; dos zonas de
// DISTRIBUCIÓN superpuestas son un pedido que dos distribuidoras creen suyo, y ese conflicto se descubre
// cuando las dos lo despacharon.
//
// El hueco es el problema espejo y NO está resuelto acá: territorio que no cae en ninguna zona es un
// pedido que nadie reclama. La auditoría de bordes encuentra los solapamientos, no los huecos —eso pide
// comparar la unión de los polígonos contra el límite de la ciudad, y no tenemos ese límite—. Lo que sí
// se muestra es la COBERTURA («3 de 4 con zona»), que atrapa el caso frecuente: falta dibujar una.
import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Building2,
  ChevronLeft,
  Crosshair,
  MousePointerClick,
  PanelLeftClose,
  PanelLeftOpen,
  Save,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { CIUDAD_IDS, CIUDAD_META, cityIdDe, type CiudadId } from '../mock-data'
import { CIUDAD_CENTRO, poligonoALatLng } from '../zones-store'
import { MapaClick } from '../map/MapaClick'
import { FiltroPopover } from '../FiltroPopover'
import { ZonasLayer } from '../zonas/ZonasLayer'
import { ZonasHerramientasDock } from '../zonas/ZonasHerramientasDock'
import { PanelAuditoria, PanelValidacionContorno } from '../zonas/ZonasConflictosPanel'
import { useHistorial } from '../zonas/historial'
import { DistribucionAccionesBar } from './DistribucionAccionesBar'
import { DistribucionCapasMapa } from './DistribucionCapasMapa'
import { DistribucionDepositosLayer, type Deposito } from './DistribucionDepositosLayer'
import { DistribucionListaPanel, type DistribuidoraFila } from './DistribucionListaPanel'
import {
  DistribuidoraFormPanel,
  latitudDe,
  longitudDe,
  type DistribuidoraDraft,
} from './DistribuidoraFormPanel'
import { useDistribucionMapaStore } from './distribucion-mapa-store'
import { distribuidorasVivasDeCiudad, useDistribuidorasStore } from './distribuidoras-store'
import {
  puntosDeZona,
  useDistribucionStore,
  zonaDeDistribuidora,
  zonasComoZonaLogistica,
} from './distribucion-store'

/** Verde y no el azul de las zonas logísticas: son dos cortes distintos del mismo mapa, y si se dibujaran
 *  del mismo color una captura de una pantalla sería indistinguible de la otra. */
const COLOR_ZONA = '#059669'
const INITIAL_ZOOM = 12
/** Ancho del panel de la lista. En px porque la cámara lo necesita como padding. */
const LISTA_PX = 320
const RAIL_PX = 40
/** Ancho que tapan los flotantes de la derecha (dock + panel de validación), para la cámara. */
const DERECHA_PX = 272

/**
 * Holgura que deja el IMANTADO, un poco mayor que el mínimo exigido. Mismo número y mismo motivo que en
 * `zonas/ZonasWorkspaceView`: el vértice hace un viaje de ida y vuelta por la proyección de pantalla
 * (grados → píxeles → grados) y volver justo en el límite haría que la validación rechazara lo que el
 * propio imantado acaba de construir.
 */
const HOLGURA_SNAP_M = METROS_HOLGURA + 0.15

const SIN_CONFLICTOS: Evaluacion = { conflictos: [], holguraMinima: null, autoCruce: false }

/**
 * TRES modos, y el tercero es de otra tabla.
 *   · `explorar`      → las zonas y los depósitos son el contenido: se eligen, se miran, se auditan.
 *   · `zona`          → se dibuja o ajusta el POLÍGONO de una distribuidora (`distribution_zones`).
 *   · `distribuidora` → se da de alta o se edita la DISTRIBUIDORA misma (`distributors`): nombre y
 *     ubicación del depósito. Es un CRUD distinto sobre otra tabla, con otro formulario y otro gesto de
 *     mapa (un marcador que se arrastra, no un contorno que se traza), así que es un modo y no una
 *     variante de `zona`.
 */
type Modo = 'explorar' | 'zona' | 'distribuidora'

/** Id del depósito PROVISORIO mientras se crea una distribuidora que todavía no existe en el store.
 *  Negativo a propósito: no puede chocar con un id real (que arrancan en 501). */
const ID_NUEVA = -1

/** Expone el `map` de Leaflet al componente de afuera: la cámara la maneja el workspace, que es quien
 *  sabe cuánto ancho le tapan los flotantes. */
function CapturarMapa({ onMapa }: { onMapa: (m: L.Map) => void }) {
  const map = useMap()
  useEffect(() => {
    onMapa(map)
  }, [map, onMapa])
  return null
}

/** Medidas en vivo del contorno en curso. Mismo lugar y mismo motivo que en zonas: el dock son
 *  instrumentos y el panel de abajo contesta "¿está bien?"; esto contesta "¿cuánto mide?". */
function MedidasHud({ puntos }: { puntos: LatLngTuple[] }) {
  if (puntos.length === 0) return null
  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1 text-[11px] tabular-nums shadow-lg backdrop-blur-sm">
      <span className="text-muted-foreground">
        <span className="font-semibold text-foreground">{puntos.length}</span> vért.
      </span>
      {puntos.length >= 2 && (
        <>
          <span className="h-3 w-px bg-border" aria-hidden />
          <span className="text-muted-foreground">
            perímetro{' '}
            <span className="font-semibold text-foreground">{formatearMetros(perimetroM(puntos))}</span>
          </span>
        </>
      )}
      {puntos.length >= 3 && (
        <>
          <span className="h-3 w-px bg-border" aria-hidden />
          <span className="text-muted-foreground">
            área <span className="font-semibold text-foreground">{formatearArea(areaKm2(puntos))}</span>
          </span>
        </>
      )}
    </div>
  )
}

export function DistribucionWorkspaceView() {
  const zonasStore = useDistribucionStore((s) => s.zonas)
  const guardarZona = useDistribucionStore((s) => s.guardarZona)
  const setZonaActiva = useDistribucionStore((s) => s.setZonaActiva)
  const removeZona = useDistribucionStore((s) => s.removeZona)

  const mapaRef = useRef<L.Map | null>(null)
  /**
   * Aspecto del mapa, de un store PROPIO.
   *
   * Al principio esta pantalla usaba `zonas-mapa-store` tal cual, y el comentario de entonces decía por
   * qué se podía y cuándo habría que partirlo: «el día que aparezca una opción propia». Apareció — acá hay
   * DOS cosas rotulables (el depósito y su polígono) y allá solo una. Ver `distribucion-mapa-store`.
   */
  const capa = useDistribucionMapaStore((s) => s.capa)
  const rotulo = useDistribucionMapaStore((s) => s.rotulo)
  const verNombresZona = useDistribucionMapaStore((s) => s.verNombresZona)
  /** El mapa ya está montado. Sin esto, el encuadre inicial se pierde: el efecto de cámara corre antes de
   *  que `mapaRef` tenga nada y no vuelve a correr solo. */
  const [mapaListo, setMapaListo] = useState(false)

  const [ciudad, setCiudad] = useState<CiudadId>('santacruz')
  const [modo, setModo] = useState<Modo>('explorar')
  /** La DISTRIBUIDORA seleccionada. La selección es de distribuidora y no de zona: una sin polígono
   *  también se puede elegir —es justamente la que hay que dibujar—. */
  const [seleccionadaId, setSeleccionadaId] = useState<number | null>(null)
  const [enEdicionId, setEnEdicionId] = useState<number | null>(null)
  /**
   * Formulario de la distribuidora en curso. `null` = no se está editando ninguna.
   *
   * El draft guarda la latitud y la longitud como TEXTO, no como número, y no es descuido: mientras se
   * tipea, «-17.» es un estado intermedio válido que un input numérico reporta como vacío —y el marcador
   * saltaría al origen en medio de la escritura—. Ver `DistribuidoraFormPanel`.
   */
  const [draft, setDraft] = useState<DistribuidoraDraft | null>(null)
  /** Qué distribuidora edita el formulario. `null` con `draft` puesto = es un ALTA. */
  const [editandoDatosId, setEditandoDatosId] = useState<number | null>(null)
  const [listaAbierta, setListaAbierta] = useState(true)
  const [texto, setTexto] = useState('')
  const [aBorrar, setABorrar] = useState<{ zonaId: number; nombre: string } | null>(null)
  /** Auditoría de lo ya guardado. Apagable: con varias zonas mal dibujadas el mapa queda rojo entero y
   *  deja de decir nada. */
  const [verAuditoria, setVerAuditoria] = useState(false)
  const [snap, setSnap] = useState(true)
  const historial = useHistorial<LatLngTuple[]>([])
  const puntos = historial.presente
  /** `true` mientras se agregan vértices con click; `false` = ajustando los existentes. */
  const [trazando, setTrazando] = useState(false)

  /** Se está dibujando un polígono: es lo que apaga el listado, prende el dock y suelta los clicks. */
  const editando = modo === 'zona'
  const editandoDatos = modo === 'distribuidora'

  // --- datos derivados -------------------------------------------------------------------------
  /**
   * Las distribuidoras VIVAS de la ciudad elegida.
   *
   * Del store y no de la constante de `mock-data`: esa no ve las que se dan de alta en esta pantalla. El
   * filtro por ciudad es lo que hace que al elegir una ciudad se OCULTEN las de las vecinas —Warnes está a
   * 29 km de Santa Cruz y entra en el mismo cuadro de mapa, así que sin filtrar no habría forma de saber
   * cuáles están en juego—.
   */
  const distribuidoras = useDistribuidorasStore((s) => s.distribuidoras)
  const addDistribuidora = useDistribuidorasStore((s) => s.addDistribuidora)
  const updateDistribuidora = useDistribuidorasStore((s) => s.updateDistribuidora)
  const deLaCiudad = useMemo(
    () => distribuidorasVivasDeCiudad(distribuidoras, cityIdDe(ciudad)),
    [distribuidoras, ciudad],
  )
  const nombreDeDistribuidora = (id: number) =>
    deLaCiudad.find((d) => d.id === id)?.name ?? `Distribuidora ${id}`

  /** Las filas del listado: la distribuidora con su zona (si tiene) resuelta. */
  const filas = useMemo<DistribuidoraFila[]>(
    () =>
      deLaCiudad.map((d) => {
        const zona = zonaDeDistribuidora(zonasStore, d.id)
        return {
          id: d.id,
          nombre: d.name,
          puntos: puntosDeZona(zona),
          zonaActiva: zona ? zona.isActive : null,
          activa: d.isActive,
        }
      }),
    [deLaCiudad, zonasStore],
  )

  const visibles = useMemo(() => {
    const busqueda = texto.trim().toLowerCase()
    return busqueda ? filas.filter((f) => f.nombre.toLowerCase().includes(busqueda)) : filas
  }, [filas, texto])

  const conZona = useMemo(() => filas.filter((f) => f.puntos.length >= 3).length, [filas])

  /**
   * La coordenada del formulario, o `null` si todavía no es usable.
   *
   * Es el puente entre las DOS formas de poner la ubicación: el marcador del mapa y los inputs de latitud
   * y longitud escriben el mismo `draft`, y esto lo lee de vuelta. Sin un único origen, los dos campos se
   * contradirían y no habría forma de saber cuál se guarda.
   */
  const posicionDelDraft = useMemo<LatLngTuple | null>(() => {
    if (!draft) return null
    const lat = latitudDe(draft)
    const lng = longitudDe(draft)
    return lat === null || lng === null ? null : [lat, lng]
  }, [draft])

  /**
   * Los depósitos de la ciudad. Es la única referencia física del mapa: sin esto, «recortá el territorio
   * de esta distribuidora» es una consigna sobre un mapa vacío. Ver `DistribucionDepositosLayer`.
   */
  const depositos = useMemo<Deposito[]>(() => {
    const guardados: Deposito[] = deLaCiudad.map((d) => {
      // El que se está editando se dibuja en la posición del DRAFT, no en la guardada: si no, arrastrar el
      // marcador lo devolvería a su lugar viejo en el próximo render y el gesto se vería roto.
      const enDraft =
        editandoDatos && editandoDatosId === d.id ? posicionDelDraft : null
      return {
        distributorId: d.id,
        nombre: editandoDatos && editandoDatosId === d.id && draft?.name.trim() ? draft.name : d.name,
        posicion: enDraft ?? ([d.latitude, d.longitude] as LatLngTuple),
        conZona: zonaDeDistribuidora(zonasStore, d.id) !== undefined,
        activa: d.isActive,
      }
    })
    // ALTA: la distribuidora todavía no existe en el store, así que su depósito no puede salir de ahí. Se
    // agrega uno provisorio para que el marcador se vea y se pueda arrastrar ANTES de guardar — sin esto,
    // "clickeá en el mapa para plantar el marcador" no mostraría ningún marcador.
    if (editandoDatos && editandoDatosId === null && posicionDelDraft) {
      guardados.push({
        distributorId: ID_NUEVA,
        nombre: draft?.name.trim() || 'Distribuidora nueva',
        posicion: posicionDelDraft,
        conZona: false,
        activa: true,
      })
    }
    return guardados
  }, [deLaCiudad, zonasStore, editandoDatos, editandoDatosId, draft, posicionDelDraft])

  const seleccionada = useMemo(
    () => filas.find((f) => f.id === seleccionadaId) ?? null,
    [filas, seleccionadaId],
  )

  /** Cuál de los depósitos se está posicionando: se dibuja ámbar y arrastrable. */
  const posicionandoId = editandoDatos ? (editandoDatosId ?? ID_NUEVA) : null

  /**
   * Las zonas que se dibujan, ya adaptadas al shape que pide `ZonasLayer`.
   *
   * Se filtran por CIUDAD y no por distribuidora: la pregunta del mapa es cómo quedó repartido ESTE
   * territorio, y una zona de otra ciudad no compite por el mismo pedido. Editando, además, se saca la
   * propia — su contorno lo dibuja `PolygonDrawLayer`, y tenerla dos veces la pintaría encima de sí misma.
   */
  const enMapa = useMemo(() => {
    const idsCiudad = new Set(deLaCiudad.map((d) => d.id))
    const vivas = zonasStore.filter(
      (z) => z.deletedAt === null && idsCiudad.has(z.distributorId) && z.distributorId !== enEdicionId,
    )
    return zonasComoZonaLogistica(editando ? vivas.filter((z) => z.isActive) : vivas)
  }, [zonasStore, deLaCiudad, enEdicionId, editando])

  /** Los ids de ZONA visibles, para traducir la selección del mapa a una distribuidora y al revés. */
  const zonaIdDeDistribuidora = (distributorId: number) =>
    zonaDeDistribuidora(zonasStore, distributorId)?.id ?? null
  const distribuidoraDeZonaId = (zonaId: number) =>
    zonasStore.find((z) => z.id === zonaId)?.distributorId ?? null

  /** Anillos contra los que se miden holgura y solapamiento. */
  const vecinos = useMemo(
    () => enMapa.map((z) => ({ id: z.id, anillo: poligonoALatLng(z.polygonGeoJson) })),
    [enMapa],
  )
  const anillosSnap = useMemo(() => (editando ? vecinos.map((v) => v.anillo) : []), [editando, vecinos])

  /** Nombre de una ZONA por su id, para los paneles de conflicto (que hablan en ids de zona). */
  const nombreDeZona = (zonaId: number) => {
    const dueña = distribuidoraDeZonaId(zonaId)
    return dueña === null ? `Zona ${zonaId}` : nombreDeDistribuidora(dueña)
  }

  /**
   * Validación del contorno EN CURSO. Se recalcula en cada cuadro del arrastre a propósito: el aviso tiene
   * que llegar mientras movés el vértice, no al soltarlo. Se evalúa como CERRADO desde el tercer vértice
   * porque es la forma que se guardaría si apretaras Guardar ahora.
   */
  const evaluacion = useMemo(
    () => (editando ? evaluarContorno(puntos, puntos.length >= 3, vecinos) : SIN_CONFLICTOS),
    [editando, puntos, vecinos],
  )

  const auditoria = useMemo(
    () => (verAuditoria && !editando ? auditarZonas(vecinos) : []),
    [verAuditoria, editando, vecinos],
  )

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

  // --- cámara ----------------------------------------------------------------------------------
  const margenes = {
    margenIzq: (listaAbierta ? LISTA_PX : RAIL_PX) + 24,
    margenDer: editando || verAuditoria ? DERECHA_PX : 24,
  }
  const volarA = (pts: LatLngTuple[]) => {
    if (mapaRef.current && pts.length > 0) encuadrar(mapaRef.current, pts, { ...margenes, zoomMax: 15 })
  }
  /**
   * Todo lo que hay que ver de esta ciudad: los polígonos Y los depósitos.
   *
   * Los depósitos van incluidos porque son lo ÚNICO que hay cuando todavía no se dibujó nada, que es
   * justo el estado en que se abre la pantalla. Con solo los polígonos, una ciudad sin zonas caía en el
   * centro genérico y los depósitos podían quedar fuera de cuadro.
   */
  const puntosDeLaCiudad = () => [
    ...enMapa.flatMap((z) => poligonoALatLng(z.polygonGeoJson)),
    ...depositos.map((d) => d.posicion),
  ]
  const volarAZonaId = (zonaId: number) => {
    const zona = zonasStore.find((z) => z.id === zonaId)
    if (zona) volarA(poligonoALatLng(zona.polygonGeoJson))
  }
  /** Encuadra las DOS zonas del par: un conflicto de bordes solo se entiende viendo las dos juntas. */
  const volarAlPar = (par: ParConflicto) => {
    const pts = [par.a, par.b].flatMap((id) => {
      const z = zonasStore.find((x) => x.id === id)
      return z ? poligonoALatLng(z.polygonGeoJson) : []
    })
    volarA(pts)
  }

  /**
   * Al cambiar de ciudad hay que MOVER LA CÁMARA, y en `/zonas` no hace falta.
   *
   * Allá la ciudad se elige dentro del formulario de una zona que estás dibujando: ya sabés dónde estás.
   * Acá la ciudad es la navegación principal —es con qué se elige el territorio a repartir—, y sin esto
   * cambiar a Montero dejaría el mapa mirando Santa Cruz con un listado de distribuidoras que no se ven en
   * ninguna parte. Si la ciudad tiene zonas se encuadran; si no, se va a su centro conocido, que es lo
   * único que hay.
   */
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa) return
    const pts = puntosDeLaCiudad()
    if (pts.length > 0) encuadrar(mapa, pts, { ...margenes, zoomMax: 14 })
    else mapa.setView(CIUDAD_CENTRO[ciudad], INITIAL_ZOOM)
    // Solo cuando cambia la CIUDAD (y una vez al montar): encuadrar en cada cambio de `enMapa` movería el
    // mapa al guardar una zona, justo cuando el que dibuja quiere seguir mirando donde estaba.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ciudad, mapaListo])

  // --- entradas a cada modo -------------------------------------------------------------------
  const abrirEdicion = (distributorId: number) => {
    const fila = filas.find((f) => f.id === distributorId)
    if (!fila) return toast.error('Esa distribuidora no está en esta ciudad')
    historial.reiniciar(fila.puntos)
    setEnEdicionId(distributorId)
    setSeleccionadaId(distributorId)
    setTrazando(fila.puntos.length === 0)
    setModo('zona')
    volarA(fila.puntos)
  }

  /** ALTA de distribuidora: sin coordenada. El marcador aparece con el primer click en el mapa. */
  const abrirAlta = () => {
    setDraft({ name: '', latitud: '', longitud: '' })
    setEditandoDatosId(null)
    setSeleccionadaId(null)
    setModo('distribuidora')
    setListaAbierta(true)
  }

  /** EDICIÓN de los datos de una distribuidora: nombre y ubicación del depósito. */
  const abrirDatos = (distributorId: number) => {
    const distribuidora = deLaCiudad.find((d) => d.id === distributorId)
    if (!distribuidora) return toast.error('Esa distribuidora no está en esta ciudad')
    setDraft({
      name: distribuidora.name,
      // `toFixed(6)` y no el número crudo: el `latitude` guardado puede traer arrastre de coma flotante
      // (`-17.752000000000002`) y eso en un input se lee como un dato sucio. Seis decimales es la
      // precisión de la columna (`NUMERIC(9,6)`), así que no se pierde nada.
      latitud: distribuidora.latitude.toFixed(6),
      longitud: distribuidora.longitude.toFixed(6),
    })
    setEditandoDatosId(distributorId)
    setSeleccionadaId(distributorId)
    setModo('distribuidora')
    setListaAbierta(true)
    volarA([[distribuidora.latitude, distribuidora.longitude]])
  }

  const salirAExplorar = () => {
    setModo('explorar')
    setEnEdicionId(null)
    setDraft(null)
    setEditandoDatosId(null)
    historial.reiniciar([])
    setTrazando(false)
  }

  // --- acciones -------------------------------------------------------------------------------
  const seleccionar = (distributorId: number | null) => {
    setSeleccionadaId(distributorId)
    if (distributorId === null) return
    const zonaId = zonaIdDeDistribuidora(distributorId)
    if (zonaId !== null) volarAZonaId(zonaId)
  }

  const encuadrarTodo = () => {
    const pts = puntosDeLaCiudad()
    if (pts.length === 0) return toast.info('Esta ciudad no tiene distribuidoras asignadas')
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
   * Se devuelve el MOTIVO y no un booleano por la misma razón que en zonas: un botón deshabilitado sin
   * explicación deja al que dibuja sin saber qué le falta. NO hay chequeo de nombre: el nombre es el de la
   * distribuidora y ya existe.
   */
  const motivoBloqueo: string | null = useMemo(() => {
    if (puntos.length < 3) return 'Un polígono necesita al menos 3 vértices'
    if (evaluacion.autoCruce) return 'El contorno se cruza consigo mismo: sus propios bordes se tocan'

    const solapan = evaluacion.conflictos.filter((c) => c.tipo === 'solapa')
    if (solapan.length > 0) {
      // El mensaje nombra a la DISTRIBUIDORA y no a la zona: el conflicto que importa no es geométrico,
      // es que dos distribuidoras creerían suyo el mismo pedido.
      return `Se pisa con la zona de ${solapan.map((c) => nombreDeZona(c.id)).join(', ')}`
    }
    const cerca = evaluacion.conflictos.filter((c) => c.tipo === 'holgura')
    if (cerca.length > 0) {
      const peor = cerca.reduce((a, b) => ((a.metros ?? 0) <= (b.metros ?? 0) ? a : b))
      return `El borde queda a ${formatearMetros(peor.metros ?? 0)} de ${nombreDeZona(peor.id)}: el mínimo es ${formatearMetros(METROS_HOLGURA)}`
    }
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puntos, evaluacion, zonasStore, deLaCiudad])

  const guardar = () => {
    if (motivoBloqueo) return toast.error(motivoBloqueo)
    if (enEdicionId === null) return
    const guardada = guardarZona(enEdicionId, puntos)
    if (!guardada) return toast.error('No se pudo construir el polígono')
    toast.success(`Zona de ${nombreDeDistribuidora(enEdicionId)} guardada`)
    setSeleccionadaId(enEdicionId)
    salirAExplorar()
  }

  /**
   * Por qué no se puede guardar la DISTRIBUIDORA, o `null`.
   *
   * Las coordenadas son obligatorias porque `distributors.latitude` y `longitude` son `NOT NULL` en el
   * esquema — y con razón: el depósito es el ancla desde la que se decide qué territorio le toca. Un
   * nombre repetido en la misma ciudad se rechaza acá y no en el store: es la única validación que
   * necesita el CONTEXTO de la ciudad, y el store no lo tiene.
   */
  const motivoBloqueoDatos: string | null = useMemo(() => {
    if (!draft) return null
    const nombre = draft.name.trim()
    if (!nombre) return 'Ponele un nombre a la distribuidora'
    const repetido = deLaCiudad.some(
      (d) => d.id !== editandoDatosId && d.name.trim().toLowerCase() === nombre.toLowerCase(),
    )
    if (repetido) return `Ya hay una «${nombre}» en ${CIUDAD_META[ciudad].label}`
    if (!posicionDelDraft) return 'Falta la ubicación del depósito: clickeá en el mapa'
    return null
  }, [draft, deLaCiudad, editandoDatosId, ciudad, posicionDelDraft])

  const guardarDatos = () => {
    if (motivoBloqueoDatos) return toast.error(motivoBloqueoDatos)
    if (!draft || !posicionDelDraft) return
    const [latitude, longitude] = posicionDelDraft
    const input = { name: draft.name, cityId: cityIdDe(ciudad), latitude, longitude }
    if (editandoDatosId !== null) {
      updateDistribuidora(editandoDatosId, input)
      toast.success(`${input.name.trim()} actualizada`)
      setSeleccionadaId(editandoDatosId)
    } else {
      const creada = addDistribuidora(input)
      toast.success(`${creada.name} creada — ahora dibujale su zona`)
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
              fondo anterior se quedan pintadas hasta que alguien mueve el mapa. Está explicado igual en
              `PlannerMapa`, que fue donde se descubrió. */}
          <TileLayer key={capa} url={TILES[capa]} subdomains={SUBDOMINIOS[capa]} />
          <InvalidateOnResize />
          <CapturarMapa
            onMapa={(m) => {
              mapaRef.current = m
              setMapaListo(true)
            }}
          />

          {/* Se reusa `ZonasLayer` con las filas adaptadas: es la misma pregunta visual —polígonos de
              territorio, uno seleccionado, algunos en conflicto— y mantener dos capas gemelas sería
              arreglar cada cosa dos veces. Ver `zonasComoZonaLogistica`. */}
          <ZonasLayer
            zonas={enMapa}
            papel={editando ? 'contexto' : 'contenido'}
            seleccionadaId={seleccionadaId === null ? null : zonaIdDeDistribuidora(seleccionadaId)}
            onSeleccionar={(zonaId) =>
              seleccionar(zonaId === null ? null : distribuidoraDeZonaId(zonaId))
            }
            enConflicto={enConflicto}
            // SIN `aspectoEditor`: esa bandera hace que la capa lea `zonas-mapa-store`, que ya no es el
            // store de esta pantalla. El único aspecto que se controla desde acá es la etiqueta, y va por
            // la prop explícita — las opciones de énfasis (relleno sólido, resaltado, vértices al hover)
            // se quedaron en el editor de zonas, donde el objeto de la pantalla ES el contorno.
            mostrarNombres={verNombresZona}
          />

          {/* LOS DEPÓSITOS VAN DESPUÉS DE LOS POLÍGONOS pero su `Pane` los pone arriba de todo: un
              depósito tapado por su propio relleno no sirve de referencia. `interactivo` cuelga del modo
              porque un `Marker` se come el click, y el depósito de la distribuidora que estás dibujando
              está justo en el medio de la zona que querés recortar. */}
          <DistribucionDepositosLayer
            depositos={depositos}
            seleccionadaId={seleccionadaId}
            enEdicionId={enEdicionId}
            posicionandoId={posicionandoId}
            rotulo={rotulo}
            onSeleccionar={seleccionar}
            onMover={([lat, lng]) =>
              setDraft((actual) =>
                actual === null
                  ? actual
                  : { ...actual, latitud: lat.toFixed(6), longitud: lng.toFixed(6) },
              )
            }
            // APAGADOS TAMBIÉN DURANTE EL FORMULARIO, no solo dibujando. La razón es la misma —un `Marker`
            // se come el click— pero acá el que compite es `MapaClick`: si los otros depósitos siguieran
            // interactivos, clickear cerca de uno para mover el marcador ámbar seleccionaría ESE en vez de
            // mover nada. El que se arrastra queda interactivo igual: se lo exceptúa dentro de la capa.
            interactivo={!editando && !editandoDatos}
          />

          {/* EL CLICK DEL MAPA PLANTA O MUEVE EL DEPÓSITO, y solo existe en el modo del formulario. Es la
              otra mitad de «dos formas de poner la ubicación»: acá se elige a ojo sobre el terreno, y en
              los inputs se pega la coordenada exacta. Los dos escriben el mismo `draft`.

              No convive con el dibujo del polígono porque son modos distintos: si estuviera prendido
              mientras se traza, cada vértice movería además el depósito. */}
          {editandoDatos && (
            <MapaClick
              onPunto={([lat, lng]) =>
                setDraft((actual) =>
                  actual === null
                    ? actual
                    : { ...actual, latitud: lat.toFixed(6), longitud: lng.toFixed(6) },
                )
              }
            />
          )}

          {editando && (
            <PolygonDrawLayer
              puntos={puntos}
              activo={trazando}
              onPuntosChange={(pts, transitorio) =>
                transitorio ? historial.reemplazar(pts) : historial.confirmar(pts)
              }
              onFinalizar={cerrarPoligono}
              color={COLOR_ZONA}
              anillosSnap={anillosSnap}
              snapActivo={snap}
              holguraMetros={HOLGURA_SNAP_M}
            />
          )}
        </MapContainer>
      </div>

      {/* ── Izquierda: qué distribuidoras hay en esta ciudad ─────────────────────────────────── */}
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
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                  {editandoDatos
                    ? editandoDatosId === null
                      ? 'Nueva distribuidora'
                      : 'Datos de la distribuidora'
                    : 'Distribuidoras'}
                </span>
                {/* LA COBERTURA, no el total: «3 de 4» dice si falta dibujar alguna, que es la única
                    pregunta que se le hace a esta pantalla de un vistazo. Se esconde con el formulario
                    abierto: ahí el panel habla de UNA distribuidora y un contador del conjunto solo
                    distrae. */}
                {!editandoDatos && (
                  <span
                    className="shrink-0 pr-1 text-[11px] tabular-nums text-muted-foreground"
                    title="Distribuidoras con zona dibujada, sobre el total de la ciudad"
                  >
                    {conZona} de {filas.length}
                  </span>
                )}
              </>
            )}
          </div>

          {/* EL PANEL CAMBIA DE CONTENIDO SEGÚN EL MODO, igual que en `RestriccionesReglasPanel`: el borde
              izquierdo contesta "¿qué hay?" explorando y "¿qué dice esto?" editando. El formulario va acá
              y no en un diálogo porque la mitad del formulario ES el mapa —la ubicación se pone
              clickeando— y un modal taparía justo eso. Ver `DistribuidoraFormPanel`. */}
          {listaAbierta &&
            (editandoDatos && draft !== null ? (
              <DistribuidoraFormPanel
                draft={draft}
                onDraft={setDraft}
                ciudad={CIUDAD_META[ciudad].label}
                esNueva={editandoDatosId === null}
                onEncuadrar={() => posicionDelDraft && volarA([posicionDelDraft])}
              />
            ) : (
              <div className="min-h-0 flex-1">
                <DistribucionListaPanel
                  distribuidoras={visibles}
                  texto={texto}
                  onTexto={setTexto}
                  seleccionadaId={seleccionadaId}
                  onSeleccionar={seleccionar}
                  onEditarZona={abrirEdicion}
                  onNueva={abrirAlta}
                  totalEnCiudad={filas.length}
                />
              </div>
            ))}
        </div>
      </div>

      {/* ── Arriba: en qué ciudad estoy y, editando, con qué confirmo ────────────────────────── */}
      <div
        className="pointer-events-none absolute inset-x-0 top-3 z-10 flex flex-col items-center gap-2 px-3"
        style={{
          paddingLeft: (listaAbierta ? LISTA_PX : RAIL_PX) + 24,
          paddingRight: editando ? 64 : 12,
        }}
      >
        <div className="pointer-events-auto flex h-11 max-w-full items-center gap-2 overflow-hidden rounded-xl border border-border bg-card/95 px-2 shadow-xl backdrop-blur-sm">
          {(editando || editandoDatos) && (
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
            </>
          )}

          {/* LA CIUDAD SIEMPRE VISIBLE: es la navegación principal, no un campo del formulario.

              CON BUSCADOR Y NO UN `Select`, y se reusa `FiltroPopover` —el mismo control que ya filtra en
              planificación y en monitoreo— en su modo `unico`. Un `Select` común obligaba a recorrer la
              lista con la vista para encontrar una ciudad, y con el maestro completo son muchas más que
              cinco. Además su popup salía angosto y corrido hacia arriba; eso se arregló en el componente
              compartido (`ui/select.tsx`), pero acá hacía falta el buscador de todas formas.

              SE OCULTA MIENTRAS SE DIBUJA UNA ZONA: cambiar de ciudad en medio de un trazo le cambiaría el
              dueño a la geometría. Editando los DATOS de una distribuidora también queda fija —la ciudad
              es la que se va a guardar— pero ahí se muestra, porque el formulario la nombra y verla
              confirma dónde va a quedar. */}
          {editando ? (
            <span className="min-w-0 max-w-40 shrink-0 truncate text-xs text-muted-foreground">
              {CIUDAD_META[ciudad].label}
            </span>
          ) : (
            <div className={editandoDatos ? 'pointer-events-none opacity-60' : undefined}>
              <FiltroPopover
                label="Ciudad"
                icon={Building2}
                modo="unico"
                ancho="w-64"
                options={CIUDAD_IDS.map((id) => ({
                  value: id,
                  label: CIUDAD_META[id].label,
                  // EL CONTADOR DE DISTRIBUIDORAS COMO `hint`: es lo que hace que el selector sea también
                  // un resumen. Elegir una ciudad a ciegas y descubrir que no tiene distribuidoras es un
                  // viaje de ida y vuelta que este número evita.
                  hint: distribuidorasVivasDeCiudad(distribuidoras, cityIdDe(id)).length || undefined,
                }))}
                active={[ciudad]}
                onToggle={(valor) => {
                  setCiudad(valor as CiudadId)
                  // La selección se limpia: la distribuidora elegida es de la ciudad anterior y no está
                  // en el listado nuevo. Dejarla puesta mostraría una barra de acciones de algo que ya no
                  // se ve en el mapa.
                  setSeleccionadaId(null)
                }}
                searchPlaceholder="Buscar ciudad…"
                emptyText="Ninguna ciudad con ese nombre."
              />
            </div>
          )}
          {/* TRES RAMAS, UNA POR MODO. Con dos (`!editando ? explorar : zona`) el modo del FORMULARIO caía en
              la de explorar: mostraba «Encuadrar todo» y «Auditar bordes», que no aplican, y sobre todo NO
              mostraba Guardar — así que no había forma de dar de alta una distribuidora. */}
          {editandoDatos ? (
            <>
              <span className="min-w-0 max-w-52 truncate text-xs font-semibold">
                {editandoDatosId === null
                  ? 'Nueva distribuidora'
                  : nombreDeDistribuidora(editandoDatosId)}
              </span>
              <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />
              <Button
                size="sm"
                className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
                disabled={motivoBloqueoDatos !== null}
                title={motivoBloqueoDatos ?? 'Guardar la distribuidora'}
                onClick={guardarDatos}
              >
                <Save size={13} />
                Guardar
              </Button>
            </>
          ) : !editando ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={encuadrarTodo}
              >
                <Crosshair size={13} />
                Encuadrar todo
              </Button>
              <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />
              {/* La auditoría es un MODO de mirar, no una acción: por eso es un toggle. El resultado vive
                  en el panel de abajo a la derecha. */}
              <Button
                variant={verAuditoria ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                aria-pressed={verAuditoria}
                onClick={() => setVerAuditoria((v) => !v)}
                title={`Revisar que ninguna zona de distribución se pise: un pedido en dos zonas es un pedido que dos distribuidoras creen suyo`}
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
              {/* EL NOMBRE ES TEXTO, NO UN INPUT: la zona no tiene nombre propio, es la de esta
                  distribuidora. Un campo editable acá haría creer que se puede renombrar algo. */}
              <span className="min-w-0 max-w-52 truncate text-xs font-semibold">
                {enEdicionId === null ? '' : nombreDeDistribuidora(enEdicionId)}
              </span>

              <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />

              <Button
                size="sm"
                className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
                disabled={motivoBloqueo !== null}
                title={motivoBloqueo ?? 'Guardar la zona de distribución'}
                onClick={guardar}
              >
                <Save size={13} />
                Guardar
              </Button>
            </>
          )}
        </div>

        {editando && <MedidasHud puntos={puntos} />}
      </div>

      {/* ── Derecha alta: con qué la dibujo ──────────────────────────────────────────────────── */}
      {editando && (
        <div className="pointer-events-none absolute right-3 top-16 z-10 flex">
          <ZonasHerramientasDock
            snap={snap}
            onSnap={() => setSnap((v) => !v)}
            snapDisponible={anillosSnap.length > 0}
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
        {editando ? (
          <PanelValidacionContorno
            vertices={puntos.length}
            evaluacion={evaluacion}
            nombreDe={nombreDeZona}
            onIrAZona={volarAZonaId}
          />
        ) : (
          verAuditoria && (
            <PanelAuditoria
              pares={auditoria}
              total={vecinos.length}
              nombreDe={nombreDeZona}
              onIrAlPar={volarAlPar}
            />
          )
        )}

        <div className="pointer-events-auto flex flex-col items-center rounded-xl border border-border bg-card/95 p-1 shadow-xl backdrop-blur-sm">
          <DistribucionCapasMapa />
        </div>
      </div>

      {/* ── Abajo al centro: qué hago con la elegida, o cómo se usa la herramienta ───────────── */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center"
        style={{
          paddingLeft: (listaAbierta ? LISTA_PX : RAIL_PX) + 24,
          paddingRight: editando || verAuditoria ? DERECHA_PX : 64,
        }}
      >
        {!editando && !editandoDatos && seleccionada ? (
          <DistribucionAccionesBar
            nombre={seleccionada.nombre}
            ciudad={CIUDAD_META[ciudad].label}
            puntos={seleccionada.puntos}
            zonaActiva={seleccionada.zonaActiva}
            activa={seleccionada.activa}
            onDibujar={() => abrirEdicion(seleccionada.id)}
            onEditarDatos={() => abrirDatos(seleccionada.id)}
            onEncuadrar={() => {
              const zonaId = zonaIdDeDistribuidora(seleccionada.id)
              if (zonaId !== null) volarAZonaId(zonaId)
            }}
            onAlternarActiva={() => {
              const zona = zonaDeDistribuidora(zonasStore, seleccionada.id)
              if (zona) setZonaActiva(zona.id, !zona.isActive)
            }}
            onEliminar={() => {
              const zona = zonaDeDistribuidora(zonasStore, seleccionada.id)
              if (zona) setABorrar({ zonaId: zona.id, nombre: seleccionada.nombre })
            }}
            onCerrar={() => setSeleccionadaId(null)}
          />
        ) : (
          <div className="flex max-w-full items-center gap-2 rounded-full border border-border bg-card/95 px-3.5 py-1.5 text-xs text-muted-foreground shadow-xl backdrop-blur-sm">
            <MousePointerClick size={13} className="shrink-0" />
            {editandoDatos ? (
              <span className="truncate">
                {posicionDelDraft
                  ? 'Arrastrá el marcador ámbar para ajustar el depósito, o clickeá en otro punto del mapa.'
                  : 'Clickeá en el mapa para plantar el depósito, o escribí la coordenada en el panel.'}
              </span>
            ) : !editando ? (
              <span className="truncate">
                Elegí una distribuidora del listado para dibujar o ajustar su zona · doble click la abre
                directo.
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
            <AlertDialogTitle>Eliminar la zona de «{aBorrar?.nombre}»</AlertDialogTitle>
            <AlertDialogDescription>
              La distribuidora queda SIN zona y se le puede dibujar otra. El registro se conserva: un plan
              viejo puede seguir apuntando a él por id. Ojo: mientras no tenga zona, los pedidos de ese
              territorio no se le asignan por polígono.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!aBorrar) return
                removeZona(aBorrar.zonaId)
                toast.success(`Zona de ${aBorrar.nombre} eliminada`)
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
