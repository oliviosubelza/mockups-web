// Restricciones de planificación: mapa a sangre, todo lo demás flotando encima. La MISMA pantalla que
// `zonas/ZonasWorkspaceView`, con las diferencias que impone el dato y ninguna más.
//
// ═══ QUÉ REEMPLAZA ═══
//
// `RestrictionEditorView`: un formulario centrado de cuatro `Card` apiladas —identidad, geometría,
// horarios, flota— con el mapa metido dentro de la tercera, 390 px de alto, y el resto del formulario
// scrolleando por arriba y por abajo. No tenía nada que ver con el resto del sistema, y el problema no era
// estético: rompía las dos actividades al mismo tiempo.
//   · No se podía DIBUJAR. Los puntos se agregaban de a uno con click y no se podían mover ni borrar; para
//     corregir el tercero de doce había que apretar "Deshacer" nueve veces. No había imantado, ni undo por
//     historial, ni pan con ESPACIO, ni tiradores de punto medio — todo eso ya existía en `PolygonDrawLayer`
//     y esta pantalla lo ignoraba. Y el mapa no mostraba NI las otras restricciones ni las zonas de reparto,
//     así que se dibujaba a ciegas sobre un fondo de calles: imposible saber si el área ya existía, a qué
//     zona le pegaba o si duplicaba a la de al lado.
//   · No se podía REVISAR. Para mirar los horarios había que scrollear hasta perder de vista lo dibujado, y
//     para volver a la geometría, scrollear de vuelta.
//
// ═══ LOS CINCO BORDES, UN PAPEL CADA UNO (igual que en zonas) ═══
//
//   · izquierda     → explorando: ¿QUÉ restricciones hay? (`RestriccionesListaPanel`)
//                     editando:   ¿QUÉ dice esta? (`RestriccionesReglasPanel` — efecto, horarios, flota)
//   · arriba        → ¿QUÉ estoy haciendo y con qué lo confirmo? (tipo, nombre, guardar)
//   · derecha alta  → ¿con qué la DIBUJO? (`RestriccionesHerramientasDock`)
//   · abajo-der     → ¿ESTÁ BIEN lo que dibujé, y a quién le pega? (`PanelGeometria`) + aspecto del mapa
//   · abajo-centro  → ¿QUÉ HAGO con la elegida? (`RestriccionesAccionesBar`) y, sin nada elegido, la pista
//
// La izquierda es el único borde que cambia de contenido según el modo, y es a propósito: en zonas ese
// panel simplemente se deshabilita mientras se dibuja, y acá había algo mucho mejor que poner ahí que un
// listado apagado. Ver el encabezado de `RestriccionesReglasPanel`.
//
// ═══ LAS TRES DIFERENCIAS DE FONDO CON ZONAS ═══
//
// 1. HAY TRES TIPOS, no uno. Un área es un anillo (`PolygonDrawLayer` de siempre), una vía es un trazo
//    ABIERTO (el mismo componente con `cerrado={false}`) y una restricción por placa NO TIENE GEOMETRÍA. En
//    ese último caso el mapa pasa entero a contexto, el dock desaparece y el trabajo es el panel izquierdo:
//    la pantalla no se rompe, cambia de forma. El tipo vive en la barra de arriba —en el lugar donde zonas
//    pone la ciudad— porque es lo que MANDA sobre el mapa, y queda bloqueado al editar porque el store lo
//    trata como inmutable después del alta (`replaceRestriction`).
//
// 2. NO HAY REGLA DE HOLGURA, y no es una omisión. Entre dos zonas de reparto tiene que quedar un metro
//    (un cliente no puede caer en dos zonas); dos restricciones, en cambio, pueden superponerse sin
//    problema —un área sin tránsito los martes y otra sin entrega de 8 a 12 pueden ser el mismo
//    territorio— y una restricción se dibuja justamente ENCIMA de las zonas a las que afecta. Por eso:
//    el imantado no deja separación (imanta sobre el borde, que es lo que se quiere cuando el área tiene
//    que coincidir con el perímetro de un mercado), no hay auditoría de pares, y la métrica grande del
//    panel de abajo no es la holgura sino cuánto abarca y a qué zonas alcanza.
//
// 3. EL CATÁLOGO SIGUE SIENDO UNA TABLA. En zonas las tres rutas colapsaron en esta pantalla; acá
//    `/restricciones` se queda con su tabla —tiene columnas que un mapa no puede dar (auditoría, vigencia
//    textual, las de tipo placa que no se dibujan) — y el workspace se queda con el alta y la edición. De
//    ahí el botón «Catálogo» de la barra de arriba: es la salida, y sin él esta pantalla sería un pozo.
import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import { toast } from 'sonner'
import {
  ChevronLeft,
  Crosshair,
  MousePointerClick,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Save,
  Table2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
import { formatearMetros, relacionConAnillo } from '../map/geo/holgura'
import { areaKm2, formatearArea, perimetroM } from '../map/geo/medidas'
import { autoSeCruza } from '../map/geo/solapamiento'
import type { LatLngTuple } from '../map/geo/polyline'
import { DISTRIBUIDORAS } from '../mock-data'
import { navigateTo } from '../routes'
import { CIUDAD_CENTRO, poligonoALatLng, useZonesStore } from '../zones-store'
import { ZonasLayer } from '../zonas/ZonasLayer'
import { useHistorial } from '../zonas/historial'
import {
  EFFECTS_BY_TYPE,
  RESTRICTION_TYPES,
  RESTRICTION_TYPE_META,
  emptyRestrictionDraft,
  geometryToLatLng,
  latLngToGeometry,
  restrictionToDraft,
  validateRestrictionDraft,
  type PlanningRestriction,
  type PlanningRestrictionDraft,
  type RestrictionType,
} from './domain'
import { RestriccionesAccionesBar } from './RestriccionesAccionesBar'
import { RestriccionesCapasMapa } from './RestriccionesCapasMapa'
import { RestriccionesHerramientasDock } from './RestriccionesHerramientasDock'
import { RestriccionesLayer, conGeometria } from './RestriccionesLayer'
import { RestriccionesListaPanel, type FiltrosRestricciones } from './RestriccionesListaPanel'
import { RestriccionesReglasPanel } from './RestriccionesReglasPanel'
import { PanelGeometria, type ZonaAlcanzada } from './RestriccionesValidacionPanel'
import { useRestriccionesMapaStore } from './restricciones-mapa-store'
import { usePlanningRestrictionsStore } from './store'

const INITIAL_ZOOM = 12
/** Ancho del panel de la izquierda. En px porque la cámara lo necesita como padding. */
const PANEL_PX = 320
const RAIL_PX = 40
/** Ancho que tapan los flotantes de la derecha (dock + panel de geometría), para la cámara. */
const DERECHA_PX = 272
/** Rojo del sistema para lo bloqueante; es el color con el que se dibuja la geometría en curso. */
const COLOR_DIBUJO = '#dc2626'

type Modo = 'explorar' | 'dibujar' | 'editar'

const nuevoDraft = (): PlanningRestrictionDraft =>
  emptyRestrictionDraft(DISTRIBUIDORAS[0]?.id ?? 0)

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
 * MEDIDAS EN VIVO de la geometría que se está dibujando, pegadas bajo la barra de arriba.
 *
 * Mismo lugar y mismo motivo que en zonas: el dock de la derecha son INSTRUMENTOS (botones que se
 * aprietan) y el panel de abajo contesta "¿está bien?"; esto contesta "¿cuánto mide?", que no tiene bien
 * ni mal. El centro-arriba es además la única franja libre en los dos modos y hereda los paddings de la
 * barra, así que nunca pisa el panel de la izquierda ni el dock de la derecha.
 *
 * LO QUE CAMBIA SEGÚN EL TIPO: un área muestra perímetro y superficie; una vía, solo el largo del trazo
 * —abierto, sin sumar el tramo que uniría el final con el principio, porque ese tramo no se va a guardar—.
 * Mostrarle "área" a una línea daría un número siempre en cero.
 */
function MedidasHud({ puntos, tipo }: { puntos: LatLngTuple[]; tipo: RestrictionType }) {
  if (puntos.length === 0) return null
  const esArea = tipo === 'RESTRICTED_AREA'
  // Se recalcula en cada cuadro del arrastre a propósito: el número sirve mientras movés el punto, no
  // cuando lo soltás. Son dos recorridos de decenas de puntos.
  const largo = perimetroM(puntos, esArea)
  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1 text-[11px] tabular-nums shadow-lg backdrop-blur-sm">
      <span className="text-muted-foreground">
        <span className="font-semibold text-foreground">{puntos.length}</span>{' '}
        {esArea ? 'vért.' : 'pts'}
      </span>
      {puntos.length >= 2 && (
        <>
          <span className="h-3 w-px bg-border" aria-hidden />
          <span className="text-muted-foreground">
            {esArea ? 'perímetro' : 'largo'}{' '}
            <span className="font-semibold text-foreground">{formatearMetros(largo)}</span>
          </span>
        </>
      )}
      {esArea && puntos.length >= 3 && (
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

export function RestriccionesWorkspaceView() {
  const { restrictionId } = useRouteParams()
  const restricciones = usePlanningRestrictionsStore((s) => s.restrictions)
  const createRestriction = usePlanningRestrictionsStore((s) => s.createRestriction)
  const replaceRestriction = usePlanningRestrictionsStore((s) => s.replaceRestriction)
  const setRestrictionActive = usePlanningRestrictionsStore((s) => s.setRestrictionActive)
  const softDeleteRestriction = usePlanningRestrictionsStore((s) => s.softDeleteRestriction)
  const zonas = useZonesStore((s) => s.zonas)

  const mapaRef = useRef<L.Map | null>(null)
  const [mapaListo, setMapaListo] = useState(false)
  /** Fondo del mapa. Del store del aspecto y no de un `useState`: lo elige el menú de la esquina de abajo
   *  a la derecha, que está en otra rama del árbol. Ver `restricciones-mapa-store`. */
  const capa = useRestriccionesMapaStore((s) => s.capa)
  const verZonasLogisticas = useRestriccionesMapaStore((s) => s.verZonasLogisticas)

  // El modo inicial sale de la RUTA, una sola vez: `/restricciones/nueva` entra dibujando y
  // `/restricciones/:id/editar` editando esa restricción. Después el modo lo maneja la pantalla.
  const rutaInicial = useRef<{ modo: Modo; id: number | null }>({
    modo: restrictionId ? 'editar' : window.location.pathname.endsWith('/nueva') ? 'dibujar' : 'explorar',
    id: restrictionId ? Number(restrictionId) : null,
  })

  const [modo, setModo] = useState<Modo>(rutaInicial.current.modo)
  const [enEdicionId, setEnEdicionId] = useState<number | null>(rutaInicial.current.id)
  const [seleccionadaId, setSeleccionadaId] = useState<number | null>(rutaInicial.current.id)
  const [panelAbierto, setPanelAbierto] = useState(true)
  const [filtros, setFiltros] = useState<FiltrosRestricciones>({ texto: '' })
  const [aBorrar, setABorrar] = useState<PlanningRestriction | null>(null)

  // --- estado de la restricción en curso -------------------------------------------------------
  const [draft, setDraft] = useState<PlanningRestrictionDraft>(nuevoDraft)
  const [snap, setSnap] = useState(true)
  const historial = useHistorial<LatLngTuple[]>([])
  const puntos = historial.presente
  /** `true` mientras se agregan puntos con click; `false` = ajustando los existentes. */
  const [trazando, setTrazando] = useState(rutaInicial.current.modo === 'dibujar')

  const editando = modo !== 'explorar'
  const tipo = draft.restrictionType
  const conMapa = tipo !== 'PLATE_ROTATION'
  /** Un área es un anillo; una vía, un trazo abierto. Manda en el dibujo, en el mínimo y en las medidas. */
  const cerrado = tipo === 'RESTRICTED_AREA'
  const minimoPuntos = cerrado ? 3 : 2

  const vivas = useMemo(() => restricciones.filter((r) => r.deletedAt === null), [restricciones])
  const seleccionada = useMemo(
    () => vivas.find((r) => r.id === seleccionadaId) ?? null,
    [vivas, seleccionadaId],
  )

  const visibles = useMemo(() => {
    const texto = filtros.texto.trim().toLowerCase()
    return vivas.filter(
      (r) =>
        (!texto || r.name.toLowerCase().includes(texto)) &&
        (!filtros.tipo || r.restrictionType === filtros.tipo) &&
        (!filtros.estado || r.isActive === (filtros.estado === 'activa')),
    )
  }, [vivas, filtros])

  /**
   * Las que se dibujan: explorando, las filtradas; editando, las de la MISMA distribuidora menos la que se
   * está tocando.
   *
   * El filtro por distribuidora es el equivalente del filtro por ciudad de zonas: las restricciones de
   * otro operador no son un obstáculo para este plan, así que como contexto solo agregan ruido rojo.
   */
  const enMapa = useMemo(() => {
    if (!editando) return visibles
    return vivas.filter((r) => r.id !== enEdicionId && r.distributorId === draft.distributorId)
  }, [editando, visibles, vivas, enEdicionId, draft.distributorId])

  const zonasVivas = useMemo(
    () => zonas.filter((z) => !z.deletedAt && z.polygonGeoJson),
    [zonas],
  )
  const anillosZonas = useMemo(
    () => zonasVivas.map((z) => ({ id: z.id, nombre: z.name, anillo: poligonoALatLng(z.polygonGeoJson) })),
    [zonasVivas],
  )

  /**
   * Contra qué se imanta.
   *
   * Zonas de reparto Y áreas restringidas ajenas, pero NO vías cerradas: `buscarSnap` recorre cada
   * geometría como un anillo CERRADO (une el último punto con el primero), así que una polilínea le
   * ofrecería como arista un tramo que no existe en el terreno y el vértice se pegaría al aire.
   *
   * Sin holgura, a diferencia de zonas: acá imantar es hacer COINCIDIR —el área con el perímetro del
   * mercado, con el borde de la zona a la que le pega—, y dejar un metro de sobra convertiría "esta área
   * es la zona Norte" en "esta área es casi la zona Norte".
   */
  const anillosSnap = useMemo(() => {
    if (!editando || !conMapa) return []
    return [
      ...anillosZonas.map((z) => z.anillo),
      ...enMapa
        .filter((r) => r.restrictionType === 'RESTRICTED_AREA')
        .map((r) => geometryToLatLng(r.geometryGeoJson)),
    ].filter((anillo) => anillo.length >= 3)
  }, [editando, conMapa, anillosZonas, enMapa])

  /** El draft con la geometría dibujada puesta: es lo que se validaría y lo que se guardaría. */
  const draftConGeometria = useMemo<PlanningRestrictionDraft>(
    () => ({ ...draft, geometryGeoJson: latLngToGeometry(tipo, puntos) }),
    [draft, tipo, puntos],
  )

  /**
   * Validación en vivo, con el MISMO validador que usa el store al guardar.
   *
   * No hay reglas propias de la pantalla: un panel con su propio criterio dejaría pasar cosas que después
   * el store rechaza —o marcaría en rojo algo que sí se podía guardar—, y ese desacuerdo no se descubre
   * nunca, porque los dos mensajes se ven razonables por separado.
   */
  const issues = useMemo(
    () => (editando ? validateRestrictionDraft(draftConGeometria) : []),
    [editando, draftConGeometria],
  )

  /** El contorno se cruza consigo mismo. Solo tiene sentido en un anillo: una línea puede cruzarse. */
  const autoCruce = useMemo(
    () => cerrado && puntos.length >= 3 && autoSeCruza(puntos),
    [cerrado, puntos],
  )

  /**
   * A qué zonas de reparto le pega la geometría en curso.
   *
   * `relacionConAnillo` sirve para las dos formas: para un anillo mide solapamiento real, y para un trazo
   * abierto alcanza con que un punto caiga dentro. Solo se calcula con la geometría COMPLETA: con dos
   * puntos de un área el resultado cambiaría en cada click y no significaría nada todavía.
   */
  const zonasAlcanzadas = useMemo<ZonaAlcanzada[]>(() => {
    if (!editando || !conMapa || puntos.length < minimoPuntos) return []
    return anillosZonas.flatMap((zona) => {
      const rel = relacionConAnillo(puntos, cerrado, zona.anillo)
      return rel?.tipo === 'solapa' ? [{ id: zona.id, nombre: zona.nombre }] : []
    })
  }, [editando, conMapa, puntos, minimoPuntos, cerrado, anillosZonas])

  const margenes = {
    margenIzq: (panelAbierto ? PANEL_PX : RAIL_PX) + 24,
    margenDer: editando ? DERECHA_PX : 24,
  }

  const volarA = (pts: LatLngTuple[]) => {
    if (mapaRef.current && pts.length > 0) encuadrar(mapaRef.current, pts, { ...margenes, zoomMax: 15 })
  }
  const volarARestriccion = (id: number) => {
    const r = vivas.find((x) => x.id === id)
    if (r) volarA(geometryToLatLng(r.geometryGeoJson))
  }
  const volarAZona = (id: number) => {
    const z = anillosZonas.find((x) => x.id === id)
    if (z) volarA(z.anillo)
  }

  // --- entradas a cada modo -------------------------------------------------------------------
  const abrirEdicion = (id: number) => {
    const restriccion = vivas.find((r) => r.id === id)
    if (!restriccion) return toast.error('Esa restricción ya no existe')
    const pts = geometryToLatLng(restriccion.geometryGeoJson)
    setDraft(restrictionToDraft(restriccion))
    historial.reiniciar(pts)
    setEnEdicionId(id)
    setSeleccionadaId(id)
    setTrazando(pts.length === 0 && restriccion.geometryGeoJson !== null)
    setPanelAbierto(true)
    setModo('editar')
    volarA(pts)
  }

  const abrirNueva = () => {
    setDraft(nuevoDraft())
    historial.reiniciar([])
    setEnEdicionId(null)
    setSeleccionadaId(null)
    setTrazando(true)
    setPanelAbierto(true)
    setModo('dibujar')
  }

  const salirAExplorar = () => {
    setModo('explorar')
    setEnEdicionId(null)
    setDraft(nuevoDraft())
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
    volarARestriccion(id)
  }

  const encuadrarTodo = () => {
    const pts = conGeometria(enMapa).flatMap((r) => geometryToLatLng(r.geometryGeoJson))
    if (pts.length === 0) return toast.info('No hay restricciones con geometría para encuadrar')
    volarA(pts)
  }

  /**
   * Cambio de tipo. Solo posible creando: el store trata el tipo como inmutable después del alta.
   *
   * BORRA LA GEOMETRÍA, y el historial se reinicia en vez de apilar el borrado: un anillo de ocho vértices
   * y una polilínea de dos puntos no son la misma cosa a medio terminar, así que un Ctrl+Z que devolviera
   * los vértices del área mientras el tipo dice "vía" dejaría la pantalla contradiciéndose.
   */
  const cambiarTipo = (siguiente: RestrictionType) => {
    setDraft((actual) => ({
      ...actual,
      restrictionType: siguiente,
      // El efecto tiene que seguir al tipo: una vía cerrada solo admite «sin tránsito», y dejar puesto
      // el efecto anterior haría que el validador rechazara al guardar algo que la pantalla mostraba bien.
      effect: EFFECTS_BY_TYPE[siguiente][0],
    }))
    historial.reiniciar([])
    setTrazando(siguiente !== 'PLATE_ROTATION')
  }

  const terminarTrazo = (finales: LatLngTuple[]) => {
    historial.confirmar(finales)
    setTrazando(false)
    toast.success(
      cerrado
        ? 'Área cerrada — ajustá los vértices o guardá la restricción'
        : 'Trazo terminado — ajustá los puntos o guardá la restricción',
    )
  }

  /**
   * Por qué NO se puede guardar, en una frase, o `null` si se puede.
   *
   * Se devuelve el MOTIVO y no un booleano por la misma razón que en zonas: un botón deshabilitado sin
   * explicación es el peor resultado posible. El texto va al `title` del botón y al toast del intento, y
   * sale del primer issue del validador —que ya viene ordenado de lo más estructural (identidad, tipo) a
   * lo más fino (una fila de horario)—, así que lo primero que se lee es lo primero que hay que arreglar.
   */
  const motivoBloqueo: string | null = useMemo(() => {
    if (!draft.name.trim()) return 'Ponele un nombre a la restricción'
    // La geometría incompleta se dice con las palabras de la pantalla y no con las del validador: sin
    // ningún punto puesto, el dominio contesta «el área restringida necesita un Polygon GeoJSON», que es
    // correcto y no le dice a nadie que lo que falta es dibujar.
    if (conMapa && puntos.length < minimoPuntos) {
      return cerrado
        ? 'Un área necesita al menos 3 vértices'
        : 'Una vía cerrada necesita al menos 2 puntos'
    }
    if (autoCruce) return 'El contorno se cruza consigo mismo: sus propios bordes se tocan'
    return issues[0]?.message ?? null
  }, [draft.name, conMapa, puntos.length, minimoPuntos, cerrado, autoCruce, issues])

  const guardar = () => {
    if (motivoBloqueo) return toast.error(motivoBloqueo)
    const resultado =
      modo === 'editar' && enEdicionId !== null
        ? replaceRestriction(enEdicionId, draftConGeometria)
        : createRestriction(draftConGeometria)
    // El store revalida y puede rechazar por cosas que la pantalla no mira (ids repetidos de filas hijas,
    // distribuidora inexistente). Se muestra su mensaje y NO se sale del modo: el trabajo sigue ahí.
    if (!resultado.ok) return toast.error(resultado.issues[0]?.message ?? 'No se pudo guardar')
    toast.success(
      modo === 'editar'
        ? `${resultado.restriction.name} actualizada`
        : `${resultado.restriction.name} creada`,
    )
    setSeleccionadaId(resultado.restriction.id)
    salirAExplorar()
  }

  // Ctrl/Cmd+Z y Ctrl/Cmd+Shift+Z. Van acá y no en `PolygonDrawLayer` porque ahí los atajos solo se
  // escuchan mientras se agregan puntos, y deshacer tiene que servir también ajustándolos.
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
          center={CIUDAD_CENTRO.santacruz}
          zoom={INITIAL_ZOOM}
          scrollWheelZoom
          attributionControl={false}
          zoomControl={false}
          className="h-full w-full"
        >
          {/* `key`: sin él, Leaflet reusa la capa y solo le cambia la URL, y las teselas viejas del fondo
              anterior se quedan pintadas hasta que alguien mueve el mapa. Está explicado igual en
              `PlannerMapa`, que fue donde se descubrió. */}
          <TileLayer key={capa} url={TILES[capa]} subdomains={SUBDOMINIOS[capa]} />
          <InvalidateOnResize />
          <CapturarMapa
            onMapa={(m) => {
              mapaRef.current = m
              setMapaListo(true)
            }}
          />

          {/* Las zonas de reparto, SIEMPRE como contexto: son de otro agregado (otra tabla, otra ruta,
              otro CRUD), así que no se seleccionan ni se editan desde acá. Sin etiqueta: competirían con
              los nombres de las restricciones, que son el contenido de esta pantalla. */}
          {verZonasLogisticas && (
            <ZonasLayer
              zonas={zonasVivas}
              papel="contexto"
              seleccionadaId={null}
              onSeleccionar={() => {}}
              interactivo={false}
              mostrarNombres={false}
            />
          )}

          <RestriccionesLayer
            restricciones={enMapa}
            papel={editando ? 'contexto' : 'contenido'}
            seleccionadaId={seleccionadaId}
            onSeleccionar={seleccionar}
          />

          {editando && conMapa && (
            <PolygonDrawLayer
              puntos={puntos}
              activo={trazando}
              cerrado={cerrado}
              onPuntosChange={(pts, transitorio) =>
                transitorio ? historial.reemplazar(pts) : historial.confirmar(pts)
              }
              onFinalizar={terminarTrazo}
              color={COLOR_DIBUJO}
              anillosSnap={anillosSnap}
              snapActivo={snap}
            />
          )}
        </MapContainer>
      </div>

      {/* ── Izquierda: qué restricciones hay / qué dice la que estoy editando ────────────────── */}
      <div
        className="pointer-events-none absolute inset-y-3 left-3 z-10 flex transition-[width] duration-200"
        style={{ width: panelAbierto ? PANEL_PX : RAIL_PX }}
      >
        <div className="pointer-events-auto flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card/95 shadow-xl backdrop-blur-sm">
          <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={() => setPanelAbierto((v) => !v)}
              title={panelAbierto ? 'Plegar el panel' : 'Mostrar el panel'}
            >
              {panelAbierto ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
            </Button>
            {panelAbierto && (
              <>
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                  {editando ? 'Reglas de la restricción' : 'Restricciones'}
                </span>
                {!editando && (
                  <span className="shrink-0 pr-1 text-[11px] tabular-nums text-muted-foreground">
                    {visibles.length}
                  </span>
                )}
              </>
            )}
          </div>

          {panelAbierto &&
            (editando ? (
              <RestriccionesReglasPanel draft={draft} onDraft={setDraft} issues={issues} />
            ) : (
              <div className="min-h-0 flex-1">
                <RestriccionesListaPanel
                  restricciones={visibles}
                  filtros={filtros}
                  onFiltros={setFiltros}
                  seleccionadaId={seleccionadaId}
                  onSeleccionar={seleccionar}
                  onEditar={abrirEdicion}
                />
              </div>
            ))}
        </div>
      </div>

      {/* ── Arriba: qué estoy haciendo y con qué lo confirmo ─────────────────────────────────── */}
      <div
        className="pointer-events-none absolute inset-x-0 top-3 z-10 flex flex-col items-center gap-2 px-3"
        style={{
          paddingLeft: (panelAbierto ? PANEL_PX : RAIL_PX) + 24,
          paddingRight: editando ? 64 : 12,
        }}
      >
        <div className="pointer-events-auto flex h-11 max-w-full items-center gap-2 overflow-hidden rounded-xl border border-border bg-card/95 px-2 shadow-xl backdrop-blur-sm">
          {!editando ? (
            <>
              {/* LA SALIDA. `/restricciones` sigue siendo una tabla —tiene columnas que un mapa no da— y
                  sin este botón el workspace sería un pozo del que solo se sale por el sidebar. */}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => navigateTo('restricciones')}
              >
                <Table2 size={13} />
                Catálogo
              </Button>
              <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />
              <Button size="sm" className="h-7 gap-1.5 px-2.5 text-xs" onClick={abrirNueva}>
                <PenLine size={13} />
                Nueva restricción
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={encuadrarTodo}
              >
                <Crosshair size={13} />
                Encuadrar todo
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

              {/* EL TIPO VA DONDE ZONAS PONE LA CIUDAD, porque cumple el mismo papel: es lo que manda
                  sobre el mapa. Bloqueado al editar —el store lo trata como inmutable después del alta—,
                  con el motivo en el `title` para que el select apagado no sea un misterio. */}
              <Select
                value={tipo}
                onValueChange={(v) => cambiarTipo(v as RestrictionType)}
                disabled={modo === 'editar'}
              >
                <SelectTrigger
                  className="h-7 w-36 shrink-0 text-xs"
                  title={
                    modo === 'editar'
                      ? 'El tipo es inmutable después de crear la restricción'
                      : RESTRICTION_TYPE_META[tipo].description
                  }
                >
                  {/* Base UI muestra el valor crudo sin un render explícito: sin esto el trigger decía
                      «RESTRICTED_AREA». Ver la nota del mismo control en `RestriccionesReglasPanel`. */}
                  <SelectValue>
                    {(valor) =>
                      RESTRICTION_TYPE_META[valor as RestrictionType]?.label ?? String(valor)
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {RESTRICTION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {RESTRICTION_TYPE_META[t].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                value={draft.name}
                onChange={(e) => setDraft((actual) => ({ ...actual, name: e.target.value }))}
                placeholder={modo === 'editar' ? 'Nombre' : 'Nombre de la restricción'}
                maxLength={50}
                className="h-7 w-44 min-w-0 text-xs"
              />

              <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />

              <Button
                size="sm"
                className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
                disabled={motivoBloqueo !== null}
                title={motivoBloqueo ?? 'Guardar la restricción'}
                onClick={guardar}
              >
                <Save size={13} />
                Guardar
              </Button>
            </>
          )}
        </div>

        {/* Las medidas cuelgan de la MISMA columna que la barra, así que heredan sus dos paddings y no hay
            una segunda posición que mantener sincronizada cuando el panel se pliega. */}
        {editando && conMapa && <MedidasHud puntos={puntos} tipo={tipo} />}
      </div>

      {/* ── Derecha alta: con qué la dibujo ──────────────────────────────────────────────────── */}
      {editando && conMapa && (
        <div className="pointer-events-none absolute right-3 top-16 z-10 flex">
          <RestriccionesHerramientasDock
            snap={snap}
            onSnap={() => setSnap((v) => !v)}
            snapDisponible={anillosSnap.length > 0}
            puedeDeshacer={historial.puedeDeshacer}
            onDeshacer={historial.deshacer}
            puedeRehacer={historial.puedeRehacer}
            onRehacer={historial.rehacer}
            trazando={trazando}
            cerrado={cerrado}
            puedeTerminar={puntos.length >= minimoPuntos}
            onTerminar={() => terminarTrazo(puntos)}
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
        {editando && (
          <PanelGeometria
            tipo={tipo}
            puntos={puntos.length}
            areaKm2={areaKm2(puntos)}
            largoM={perimetroM(puntos, false)}
            autoCruce={autoCruce}
            issues={issues}
            zonasAlcanzadas={zonasAlcanzadas}
            onIrAZona={volarAZona}
          />
        )}

        {/* El aspecto del mapa, DEBAJO del panel y siempre presente: es la misma posición relativa que
            ocupa en zonas, en planificación y en monitoreo. Un botón que cambia de lugar según si hay
            panel obligaría a buscarlo cada vez, así que se apilan en columna y el que se va es el de
            arriba. */}
        <div className="pointer-events-auto flex flex-col items-center rounded-xl border border-border bg-card/95 p-1 shadow-xl backdrop-blur-sm">
          <RestriccionesCapasMapa />
        </div>
      </div>

      {/* ── Abajo al centro: qué hago con la elegida, o cómo se usa la herramienta ───────────── */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center"
        style={{
          paddingLeft: (panelAbierto ? PANEL_PX : RAIL_PX) + 24,
          // Abajo a la derecha hay SIEMPRE un botón (el de aspecto), así que sin este padding la barra de
          // acciones de una restricción con nombre largo se le montaría encima en pantallas angostas.
          paddingRight: editando ? DERECHA_PX : 64,
        }}
      >
        {/* La barra de acciones OCUPA el lugar de la pista, no se apila sobre ella: la pista dice "click en
            una restricción la selecciona", que es exactamente lo que acabás de hacer. */}
        {!editando && seleccionada ? (
          <RestriccionesAccionesBar
            restriccion={seleccionada}
            onEditar={() => abrirEdicion(seleccionada.id)}
            onEncuadrar={() => volarARestriccion(seleccionada.id)}
            onAlternarActiva={() => setRestrictionActive(seleccionada.id, !seleccionada.isActive)}
            onEliminar={() => setABorrar(seleccionada)}
            onVerDetalle={() =>
              navigateTo('restriccion-detalle', { restrictionId: String(seleccionada.id) })
            }
            onCerrar={() => setSeleccionadaId(null)}
          />
        ) : (
          <div className="flex max-w-full items-center gap-2 rounded-full border border-border bg-card/95 px-3.5 py-1.5 text-xs text-muted-foreground shadow-xl backdrop-blur-sm">
            <MousePointerClick size={13} className="shrink-0" />
            {!editando ? (
              <span className="truncate">
                Click en una restricción la selecciona · doble click en el listado la abre para editar.
              </span>
            ) : !conMapa ? (
              <span className="truncate">
                La restricción por placa no se dibuja: se define con los horarios y las reglas de flota del
                panel de la izquierda.
              </span>
            ) : trazando ? (
              <span className="truncate">
                {puntos.length === 0 ? (
                  <>Click en el mapa para empezar {cerrado ? 'el área' : 'el trazo de la vía'}</>
                ) : (
                  <>
                    <span className="font-medium tabular-nums text-foreground">{puntos.length}</span>{' '}
                    {cerrado ? 'vértice' : 'punto'}
                    {puntos.length !== 1 ? 's' : ''} · Enter {cerrado ? 'cierra' : 'termina'} · Backspace
                    deshace
                  </>
                )}{' '}
                · <kbd className="font-medium text-foreground">Espacio</kbd> mueve el mapa
                {anillosSnap.length > 0 && snap && (
                  <>
                    {' '}
                    · <kbd className="font-medium text-foreground">Alt</kbd> suspende el imantado
                  </>
                )}
                .
              </span>
            ) : (
              <span className="truncate">
                Arrastrá los puntos · click en un tirador punteado inserta uno · click derecho borra ·{' '}
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
              La restricción sale de los listados pero el registro se conserva, junto con sus horarios y
              reglas: un plan viejo puede seguir apuntando a ella por id.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!aBorrar) return
                softDeleteRestriction(aBorrar.id)
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
