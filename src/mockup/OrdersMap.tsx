// Mapa de paradas (Leaflet) — protagonista de la fase de planificación.
// Cada pin responde las dos preguntas de esa pantalla: QUÉ es el punto (el ícono = canal del
// cliente: tienda, mayorista, supermercado, restaurante) y A QUIÉN le tocó (el color = camión que
// le asignó la optimización). Un pin gris = parada todavía sin camión.
// Antes el ícono era el vehículo, lo cual mentía: estos puntos son clientes, no camiones.
//
// Herramientas del mapa (portadas del frontend de logística): selector de capa base, selección
// espacial por rectángulo/lazo y un overlay de ruta (polilínea decodificada). El estado de la
// herramienta y de la selección vive acá como useState — el proyecto de referencia usaba un command
// bus + vrp-store que en keel no existe.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Warehouse } from 'lucide-react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MapContainer, Marker, Tooltip, ZoomControl, useMap, useMapEvents } from 'react-leaflet'
import { CANAL_META, DEPOSITO, RUTAS, camionPorId, type Parada, type Ruta } from './mock-data'
import { divIcon } from './map/div-icon'
import { InvalidateOnResize } from './map/InvalidateOnResize'
import { MapLayersControl } from './map/MapLayersControl'
import { MapToolbar } from './map/MapToolbar'
import { OverlayLayer } from './map/OverlayLayer'
import { SelectionLayer, type MapTool } from './map/SelectionLayer'
import { useOverlayStore } from './map/overlay-store'
import { parseRouteOptimization } from './map/geo/polyline'
import { SAMPLE_ROUTE_OPTIMIZATION } from './map/sample-route'
import { buildRouteOverlay, buildSingleRouteOverlay } from './map/route-optimizer'
import { PuntoEntregaDialog } from './PuntoEntregaDialog'

const SIN_CAMION = '#94a3b8'
const SELECCION = '#2563eb'
const SANTA_CRUZ: [number, number] = [-17.786, -63.17]
const INITIAL_ZOOM = 12
// A partir de este zoom los puntos están lo bastante separados como para mostrar las etiquetas de
// detalle sin que se solapen; por debajo (todo amontonado) se ocultan. Igual al zoom inicial para
// que "Ver detalle" tenga efecto visible ni bien se activa (sin obligar a hacer zoom primero).
const DETAIL_ZOOM = INITIAL_ZOOM

/** Observa el zoom del mapa para gatillar las etiquetas de detalle solo cuando hay lugar. */
function ZoomWatcher({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMapEvents({ zoomend: () => onZoom(map.getZoom()) })
  return null
}

/** Descarta la parada enfocada al hacer clic en cualquier area vacia del mapa. */
function MapClickListener({ onDismiss }: { onDismiss?: () => void }) {
  useMapEvents({
    click: () => onDismiss?.(),
  })
  return null
}

/** Centra y vuela suavemente a nivel calle (zoom 17) al punto de entrega seleccionado. */
function MapCenterer({ target }: { target?: { lat: number; lng: number; t: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (target && target.lat && target.lng) {
      map.flyTo([target.lat, target.lng], 17, {
        duration: 1.2,
        animate: true,
      })
    }
  }, [target, map])
  return null
}

function pinParada(
  parada: Parada,
  seleccionado: boolean,
  rutas?: Ruta[],
  showRoute?: boolean,
  defaultRouteColor?: string,
) {
  const { icon: Icon } = CANAL_META[parada.canal]
  const listRutas = rutas || RUTAS
  const targetRutaId = parada.rutaId || (parada.camionId ? `r-${parada.camionId}` : undefined)
  const ruta = listRutas.find(
    (r) =>
      r.id === targetRutaId ||
      r.camionId === parada.camionId ||
      r.id === parada.rutaId ||
      (targetRutaId && r.id.endsWith(targetRutaId)),
  )
  const camion = camionPorId(parada.camionId)
  const isAssignedAndShown = showRoute && (!!parada.camionId || !!parada.rutaId || parada.secuencia !== undefined)
  const color = isAssignedAndShown ? (ruta?.color ?? camion?.color ?? defaultRouteColor ?? SELECCION) : SIN_CAMION
  const seq = isAssignedAndShown ? parada.secuencia : undefined

  const html = renderToStaticMarkup(
    <div
      className={`stop-pin ${seleccionado ? 'stop-pin-selected' : ''}`}
      style={{
        width: 32,
        height: 32,
        borderRadius: 999,
        background: color,
        border: seleccionado ? '2.5px solid #2563eb' : '2px solid #fff',
        boxShadow: seleccionado
          ? '0 0 0 4px rgba(37, 99, 235, 0.45), 0 3px 8px rgba(0, 0, 0, 0.45)'
          : '0 2px 5px rgb(0 0 0 / 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        position: 'relative',
        transform: seleccionado ? 'scale(1.15)' : 'scale(1)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
      }}
    >
      <Icon size={14} strokeWidth={2.25} />
      {seq !== undefined && (
        <span
          style={{
            position: 'absolute',
            top: -6,
            right: -6,
            minWidth: 18,
            height: 18,
            padding: '0 3px',
            borderRadius: 999,
            background: '#0f172a',
            color: '#ffffff',
            border: '1.5px solid #ffffff',
            fontSize: 10,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
            boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
          }}
        >
          {seq}
        </span>
      )}
    </div>
  )
  return divIcon(html, 32)
}

const pinDeposito = divIcon(
  renderToStaticMarkup(
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
    </div>
  ),
  36
)

export function OrdersMap({
  paradas,
  onSelectionChange,
  routeToolEnabled = false,
  showRoute = false,
  onToggleRoute,
  showDetails = false,
  singleRoute = false,
  routeColor = SELECCION,
  hideTools = false,
  rutas,
  focusedParadaId,
  focusTarget,
  onDismissFocus,
  capaMercados,
}: {
  paradas: Parada[]
  onSelectionChange?: (ids: string[]) => void
  routeToolEnabled?: boolean
  showRoute?: boolean
  onToggleRoute?: () => void
  showDetails?: boolean
  singleRoute?: boolean
  routeColor?: string
  hideTools?: boolean
  rutas?: Ruta[]
  focusedParadaId?: string | null
  focusTarget?: { lat: number; lng: number; id: string; t: number } | null
  onDismissFocus?: () => void
  capaMercados?: string
}) {
  const [activeTool, setActiveTool] = useState<MapTool>('pan')
  const [paradaDetalle, setParadaDetalle] = useState<Parada | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [zoom, setZoom] = useState(INITIAL_ZOOM)
  const showLabels = showDetails && zoom >= DETAIL_ZOOM

  const activeFocusId = focusTarget?.id ?? focusedParadaId

  const activeFocusParada = useMemo(() => {
    if (focusTarget?.lat && focusTarget?.lng) {
      const p = paradas.find(
        (item) =>
          item.id === focusTarget.id ||
          `stop-${item.puntoEntregaId}` === focusTarget.id ||
          item.puntoEntregaId === focusTarget.id,
      )
      if (p) return p
      return { lat: focusTarget.lat, lng: focusTarget.lng }
    }
    if (!focusedParadaId) return null
    return (
      paradas.find(
        (p) =>
          p.id === focusedParadaId ||
          `stop-${p.puntoEntregaId}` === focusedParadaId ||
          p.puntoEntregaId === focusedParadaId,
      ) ?? null
    )
  }, [paradas, focusTarget, focusedParadaId])

  const setOverlay = useOverlayStore((s) => s.setOverlay)
  const clearOverlay = useOverlayStore((s) => s.clearOverlay)

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const handleSelect = useCallback(
    (ids: string[]) => {
      setSelectedIds(ids)
      onSelectionChange?.(ids)
    },
    [onSelectionChange]
  )

  const handleClear = useCallback(() => {
    setSelectedIds([])
    onSelectionChange?.([])
  }, [onSelectionChange])

  useEffect(() => {
    if (!showRoute) {
      clearOverlay()
      return
    }
    const listRutas = rutas || RUTAS
    setOverlay(
      singleRoute
        ? buildSingleRouteOverlay(paradas, routeColor)
        : buildRouteOverlay(
            paradas,
            (pId) => {
              const p = paradas.find((item) => item.id === pId)
              if (!p) return undefined
              return p.rutaId || (p.camionId ? `r-${p.camionId}` : undefined)
            },
            listRutas,
          )
    )
  }, [showRoute, singleRoute, paradas, routeColor, rutas, setOverlay, clearOverlay])

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={SANTA_CRUZ}
        zoom={INITIAL_ZOOM}
        scrollWheelZoom={true}
        attributionControl={false}
        zoomControl={false}
        className="h-full w-full"
      >
        <ZoomControl position="bottomright" />
        <MapLayersControl />
        <InvalidateOnResize />
        <ZoomWatcher onZoom={setZoom} />
        <MapClickListener onDismiss={onDismissFocus} />
        <MapCenterer target={focusTarget ?? (activeFocusParada ? { lat: activeFocusParada.lat, lng: activeFocusParada.lng, t: Date.now() } : null)} />
        <SelectionLayer activeTool={activeTool} paradas={paradas} onSelect={handleSelect} />
        <OverlayLayer />

        {/* De acá sale todo: sin el almacén el mapa no explica de dónde arrancan las rutas. */}
        <Marker position={[DEPOSITO.lat, DEPOSITO.lng]} icon={pinDeposito}>
          <Tooltip direction="top" offset={[0, -18]}>
            <span className="font-medium">{DEPOSITO.nombre}</span> — almacén de salida
          </Tooltip>
        </Marker>

        {paradas.map((parada) => {
          const [desde, hasta] = parada.ventana.split('–').map((s) => s.trim())
          const isFocused =
            activeFocusId === parada.id ||
            activeFocusId === `stop-${parada.puntoEntregaId}` ||
            activeFocusId === parada.puntoEntregaId
          return (
            <Marker
              key={parada.id}
              position={[parada.lat, parada.lng]}
              icon={pinParada(
                parada,
                selectedSet.has(parada.id) || isFocused,
                rutas,
                showRoute,
                singleRoute ? routeColor : undefined,
              )}
              eventHandlers={{
                click: () => {
                  if (activeTool === 'pan') setParadaDetalle(parada)
                },
              }}
            >
              <Tooltip
                key={showLabels ? 'detail' : isFocused ? 'focused' : 'hover'}
                permanent={showLabels || isFocused}
                direction={showLabels ? 'bottom' : 'top'}
                offset={showLabels ? [0, 13] : [0, -16]}
                className={showLabels ? 'stop-detail-tip' : ''}
              >
                {showLabels ? (
                  <>
                    <span className="block text-center font-mono text-[9px] font-semibold leading-tight">
                      {parada.pedidos[0]?.salesOrder ?? parada.puntoEntregaId}
                    </span>
                    <span className="block text-center text-[9px] leading-tight text-muted-foreground">De: {desde}</span>
                    <span className="block text-center text-[9px] leading-tight text-muted-foreground">A: {hasta}</span>
                  </>
                ) : (
                  <div>
                    <span className="font-medium text-foreground font-semibold">{parada.cliente}</span>
                    {parada.puntoEntrega && (
                      <span className="block text-[11px] text-muted-foreground">{parada.puntoEntrega}</span>
                    )}
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {CANAL_META[parada.canal].label} · {parada.pedidos.length} pedido
                      {parada.pedidos.length !== 1 ? 's' : ''} · {parada.pesoTotal} kg
                      {showRoute && parada.secuencia ? ` · Parada #${parada.secuencia}` : ''}
                    </div>
                  </div>
                )}
              </Tooltip>
            </Marker>
          )
        })}
      </MapContainer>

      {/* Hermano del MapContainer (no una capa de Leaflet): sus clics no llegan al mapa, y con
          z-[1000] queda por encima de los tiles y de los controles internos. En modo solo-lectura
          (unificación) no se muestra: no se permite mover/seleccionar nada. */}
      {!hideTools && (
        <MapToolbar
          activeTool={activeTool}
          onToolChange={setActiveTool}
          onClear={handleClear}
          selectedCount={selectedIds.length}
          showRouteTool={routeToolEnabled}
          demoActive={showRoute}
          onToggleDemo={onToggleRoute ?? (() => {})}
        />
      )}

      {/* Detalle del punto de entrega (galería + datos). Hermano del MapContainer, no una capa de
          Leaflet: se portaliza al tablero y no compite con los panes del mapa. */}
      <PuntoEntregaDialog parada={paradaDetalle} onClose={() => setParadaDetalle(null)} />
    </div>
  )
}
