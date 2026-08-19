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
// MÁQUINA DE MODOS. Antes todo el estado era un `dibujando: boolean`, y con eso no entraba nada más.
// Ahora son tres papeles distintos y explícitos:
//   · `explorar` → las zonas son el contenido: clickeables, la seleccionada resaltada, acciones en el pie.
//   · `dibujar`  → zona nueva; las demás pasan a contexto gris NO interactivo.
//   · `editar`   → una zona con sus vértices; ídem las demás.
// El modo inicial sale de la RUTA, así que `/zonas/nueva` y `/zonas/:id/editar` siguen funcionando y
// ningún link viejo se rompe.
import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import { toast } from 'sonner'
import { AlertTriangle, Check, ChevronLeft, Crosshair, Magnet, MousePointerClick, PanelLeftClose, PanelLeftOpen, PenLine, Redo2, Save, Undo2 } from 'lucide-react'
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
import { openRoute } from '@/core/routing/open-route'
import { CAPA_POR_DEFECTO, SUBDOMINIOS, TILES } from '../map/tiles'
import { InvalidateOnResize } from '../map/InvalidateOnResize'
import { PolygonDrawLayer } from '../map/PolygonDrawLayer'
import { encuadrar } from '../map/encuadrar'
import { buscarSolapamientos, seSolapan } from '../map/geo/solapamiento'
import type { LatLngTuple } from '../map/geo/polyline'
import { CIUDAD_IDS, CIUDAD_META, cityIdDe, ciudadDeCityId, type CiudadId } from '../mock-data'
import { CIUDAD_CENTRO, latLngAPoligono, poligonoALatLng, useZonesStore, type Zona } from '../zones-store'
import { ZonasLayer } from './ZonasLayer'
import { ZonasListaPanel, type FiltrosZonas } from './ZonasListaPanel'
import { useHistorial } from './historial'

const COLOR_ZONA = '#2563eb'
const INITIAL_ZOOM = 12
/** Ancho del panel de la lista. En px porque la cámara lo necesita como padding. */
const LISTA_PX = 320
const RAIL_PX = 40

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

export function ZonasWorkspaceView() {
  const { zonaId } = useRouteParams()
  const zonas = useZonesStore((s) => s.zonas)
  const addZona = useZonesStore((s) => s.addZona)
  const updateZona = useZonesStore((s) => s.updateZona)
  const setZonaActiva = useZonesStore((s) => s.setZonaActiva)
  const removeZona = useZonesStore((s) => s.removeZona)

  const mapaRef = useRef<L.Map | null>(null)
  const [mapaListo, setMapaListo] = useState(false)

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
  /** Resaltar en rojo las zonas que se pisan. Apagable: con muchas zonas mal dibujadas el mapa queda
   *  rojo entero y deja de decir nada; encendido se usa como auditoría, no como fondo permanente. */
  const [verSolapes, setVerSolapes] = useState(false)

  // --- estado del formulario de la zona en curso ---
  const [nombre, setNombre] = useState('')
  const [ciudad, setCiudad] = useState<CiudadId>('santacruz')
  const [snap, setSnap] = useState(true)
  const historial = useHistorial<LatLngTuple[]>([])
  const puntos = historial.presente
  /** `true` mientras se agregan vértices con click; `false` = ajustando los existentes. */
  const [trazando, setTrazando] = useState(rutaInicial.current.modo === 'dibujar')

  const editando = modo !== 'explorar'
  const vivas = useMemo(() => zonas.filter((z) => !z.deletedAt), [zonas])

  const visibles = useMemo(() => {
    const texto = filtros.texto.trim().toLowerCase()
    return vivas.filter(
      (z) =>
        (!texto || z.name.toLowerCase().includes(texto)) &&
        (!filtros.ciudad || z.cityId === CIUDAD_META[filtros.ciudad].cityId) &&
        (!filtros.estado || z.isActive === (filtros.estado === 'activa')),
    )
  }, [vivas, filtros])

  /** Las que se dibujan: en `explorar` las filtradas; editando, las de la ciudad de la zona en curso
   *  menos ella misma —el resto es ruido para el que dibuja. */
  const enMapa = useMemo(() => {
    if (!editando) return visibles.filter((z) => z.polygonGeoJson)
    return vivas.filter((z) => z.polygonGeoJson && z.isActive && z.id !== enEdicionId && z.cityId === cityIdDe(ciudad))
  }, [editando, visibles, vivas, enEdicionId, ciudad])

  /** Contra qué se imanta: exactamente lo que se ve de fondo, nunca una zona invisible. */
  const anillosSnap = useMemo(
    () => (editando ? enMapa.map((z) => poligonoALatLng(z.polygonGeoJson)) : []),
    [editando, enMapa],
  )

  /** Pares que se pisan entre las zonas dibujadas. Solo se calcula con el resaltado encendido: es
   *  O(pares · vértices) y no hace falta mientras nadie lo mire. */
  const solapes = useMemo(() => {
    if (!verSolapes || editando) return []
    return buscarSolapamientos(enMapa.map((z) => ({ id: z.id, anillo: poligonoALatLng(z.polygonGeoJson) })))
  }, [verSolapes, editando, enMapa])

  /** Zonas del fondo que el contorno EN CURSO está invadiendo. Se recalcula en cada cuadro del
   *  arrastre a propósito: el aviso tiene que llegar mientras movés el vértice, no al soltarlo. Con las
   *  decenas de vértices por zona que se dibujan a mano el costo es despreciable. */
  const invadidas = useMemo(() => {
    if (!editando || puntos.length < 3) return new Set<number>()
    const chocan = enMapa.filter((z) => seSolapan(puntos, poligonoALatLng(z.polygonGeoJson)))
    return new Set(chocan.map((z) => z.id))
  }, [editando, puntos, enMapa])

  const enConflicto = useMemo(
    () => (editando ? invadidas : new Set(solapes.flat())),
    [editando, invadidas, solapes],
  )

  const margenes = { margenIzq: (listaAbierta ? LISTA_PX : RAIL_PX) + 24, margenDer: 24 }

  const volarA = (pts: LatLngTuple[]) => {
    if (mapaRef.current && pts.length > 0) encuadrar(mapaRef.current, pts, { ...margenes, zoomMax: 15 })
  }

  // --- entradas a cada modo -------------------------------------------------------------------
  const abrirEdicion = (id: number) => {
    const zona = vivas.find((z) => z.id === id)
    if (!zona) return toast.error('Esa zona ya no existe')
    const pts = poligonoALatLng(zona.polygonGeoJson)
    setNombre(zona.name)
    setCiudad(ciudadDeCityId(zona.cityId) ?? 'santacruz')
    historial.reiniciar(pts)
    setEnEdicionId(id)
    setSeleccionadaId(id)
    setTrazando(pts.length === 0)
    setModo('editar')
    volarA(pts)
  }

  const abrirNueva = () => {
    setNombre('')
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
    // Al seleccionar desde el mapa la lista puede estar plegada: abrirla es lo que hace visible el pie
    // de acciones, que si no aparecería escondido detrás del riel.
    setListaAbierta(true)
    const zona = vivas.find((z) => z.id === id)
    if (zona) volarA(poligonoALatLng(zona.polygonGeoJson))
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

  const puedeGuardar = nombre.trim().length > 0 && puntos.length >= 3

  const guardar = () => {
    const polygonGeoJson = latLngAPoligono(puntos)
    if (!polygonGeoJson || !puedeGuardar) return
    const input = { name: nombre.trim(), cityId: cityIdDe(ciudad), polygonGeoJson }
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
          <TileLayer url={TILES[CAPA_POR_DEFECTO]} subdomains={SUBDOMINIOS[CAPA_POR_DEFECTO]} />
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
          />

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
            />
          )}
        </MapContainer>
      </div>

      {/* ── Panel flotante: la lista ─────────────────────────────────────────────────────────── */}
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
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">Zonas de reparto</span>
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
                onEncuadrar={(id) => {
                  const z = vivas.find((x) => x.id === id)
                  if (z) volarA(poligonoALatLng(z.polygonGeoJson))
                }}
                onEditar={abrirEdicion}
                onNueva={abrirNueva}
                onAlternarActiva={(id) => {
                  const z = vivas.find((x) => x.id === id)
                  if (z) setZonaActiva(id, !z.isActive)
                }}
                onEliminar={setABorrar}
                deshabilitado={editando}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Barra flotante superior: cambia entera según el modo ─────────────────────────────── */}
      <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3">
        <div
          className="pointer-events-auto flex h-11 items-center gap-2 rounded-xl border border-border bg-card/95 px-2 shadow-xl backdrop-blur-sm"
          style={{ marginLeft: listaAbierta ? LISTA_PX : RAIL_PX }}
        >
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
              <Button
                variant={verSolapes ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                aria-pressed={verSolapes}
                onClick={() => setVerSolapes((v) => !v)}
              >
                <AlertTriangle size={13} className={verSolapes ? 'text-destructive' : ''} />
                Solapamientos
              </Button>
              <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />
              <span className="pr-1 text-[11px] text-muted-foreground">
                {verSolapes ? (
                  solapes.length === 0 ? (
                    'Ninguna zona se pisa con otra'
                  ) : (
                    <span className="font-medium text-destructive">
                      {solapes.length} par{solapes.length !== 1 ? 'es' : ''} en conflicto
                    </span>
                  )
                ) : (
                  'Click en una zona para seleccionarla'
                )}
              </span>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={salirAExplorar}
              >
                <ChevronLeft size={14} />
                Cancelar
              </Button>
              <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />

              <Select value={ciudad} onValueChange={(v) => setCiudad(v as CiudadId)}>
                <SelectTrigger className="h-7 w-36 shrink-0 text-xs">
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

              <Input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Nombre de la zona"
                maxLength={50}
                className="h-7 w-48 min-w-0 text-xs"
              />

              <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />

              {/* El imantado se apaga entero desde acá y se suspende de a ratos con ALT. Tiene que ser
                  apagable: a veces querés un vértice CERCA del borde y no sobre él. */}
              <Button
                variant={snap ? 'secondary' : 'ghost'}
                size="icon"
                className="size-7 shrink-0"
                title={snap ? 'Imantado activado (ALT lo suspende)' : 'Imantado desactivado'}
                aria-pressed={snap}
                disabled={anillosSnap.length === 0}
                onClick={() => setSnap((v) => !v)}
              >
                <Magnet size={13} className={snap ? '' : 'opacity-40'} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                title="Deshacer (Ctrl+Z)"
                disabled={!historial.puedeDeshacer}
                onClick={historial.deshacer}
              >
                <Undo2 size={13} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                title="Rehacer (Ctrl+Shift+Z)"
                disabled={!historial.puedeRehacer}
                onClick={historial.rehacer}
              >
                <Redo2 size={13} />
              </Button>

              {puntos.length > 0 && !trazando && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs"
                  onClick={() => {
                    historial.confirmar([])
                    setTrazando(true)
                  }}
                >
                  <PenLine size={13} />
                  Redibujar
                </Button>
              )}

              {/* Cerrar tenía TRES formas (click en el primer vértice, doble click, Enter) y ninguna
                  visible: había que descubrir un atajo o acertarle a un punto de 13 px. */}
              {trazando && puntos.length >= 3 && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
                  onClick={() => cerrarPoligono(puntos)}
                >
                  <Check size={13} />
                  Cerrar polígono
                </Button>
              )}

              <Button size="sm" className="h-7 gap-1.5 px-2.5 text-xs" disabled={!puedeGuardar} onClick={guardar}>
                <Save size={13} />
                Guardar
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Pista de abajo ───────────────────────────────────────────────────────────────────── */}
      <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2">
        {/* El aviso de invasión va ARRIBA de la pista y no la reemplaza: la pista dice cómo se usa la
            herramienta y se sigue necesitando justo cuando estás corrigiendo el solapamiento. */}
        {editando && invadidas.size > 0 && (
          <div className="flex items-center gap-2 rounded-full border border-destructive/40 bg-destructive/10 px-3.5 py-1.5 text-xs font-medium text-destructive shadow-xl backdrop-blur-sm">
            <AlertTriangle size={13} className="shrink-0" />
            <span>
              Se pisa con {invadidas.size} zona{invadidas.size !== 1 ? 's' : ''} · encendé el imantado y
              soldá el borde
            </span>
          </div>
        )}
        <div className="flex items-center gap-2 rounded-full border border-border bg-card/95 px-3.5 py-1.5 text-xs text-muted-foreground shadow-xl backdrop-blur-sm">
          <MousePointerClick size={13} className="shrink-0" />
          {!editando ? (
            <span>
              Click en una zona la selecciona · doble click en el listado abre su contorno para editar.
            </span>
          ) : trazando ? (
            <span>
              {puntos.length === 0 ? (
                <>Click en el mapa para empezar el polígono</>
              ) : (
                <>
                  <span className="font-medium tabular-nums text-foreground">{puntos.length}</span> vértice
                  {puntos.length !== 1 ? 's' : ''} · Enter o doble click cierra · Backspace deshace
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
            <span>
              Arrastrá los vértices · click en un tirador punteado inserta uno · click derecho borra ·{' '}
              <kbd className="font-medium text-foreground">Espacio</kbd> mueve el mapa · Ctrl+Z deshace.
            </span>
          )}
        </div>
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
