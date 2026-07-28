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
import L from 'leaflet'
import { Warehouse } from 'lucide-react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MapContainer, Marker, Tooltip, ZoomControl, useMapEvents } from 'react-leaflet'
import { CANAL_META, DEPOSITO, camionPorId, type Parada } from './mock-data'
import { InvalidateOnResize } from './map/InvalidateOnResize'
import { MapLayersControl } from './map/MapLayersControl'
import { MapToolbar } from './map/MapToolbar'
import { OverlayLayer } from './map/OverlayLayer'
import { SelectionLayer, type MapTool } from './map/SelectionLayer'
import { useOverlayStore } from './map/overlay-store'
import { parseRouteOptimization } from './map/geo/polyline'
import { SAMPLE_ROUTE_OPTIMIZATION } from './map/sample-route'
import { buildSingleRouteOverlay } from './map/route-optimizer'
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

function divIcon(html: string, size: number) {
  // `className: ''` saca el fondo y el borde blancos que Leaflet le pone por defecto al divIcon.
  return L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] })
}

function pinParada(parada: Parada, seleccionado: boolean) {
  const { icon: Icon } = CANAL_META[parada.canal]
  const camion = camionPorId(parada.camionId)
  const color = camion?.color ?? SIN_CAMION

  const html = renderToStaticMarkup(
    <div
      className={`stop-pin ${seleccionado ? 'stop-pin-selected' : ''}`}
      style={{
        width: 30,
        height: 30,
        borderRadius: 999,
        background: color,
        // Seleccionada: anillo azul de marca alrededor del pin (no cambia el color del canal/camión).
        border: seleccionado ? `2px solid ${SELECCION}` : '2px solid #fff',
        boxShadow: seleccionado
          ? `0 0 0 3px ${SELECCION}66, 0 1px 4px rgb(0 0 0 / 0.35)`
          : '0 1px 4px rgb(0 0 0 / 0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
      }}
    >
      <Icon size={15} strokeWidth={2.25} />
    </div>
  )
  return divIcon(html, 30)
}

const pinDeposito = divIcon(
  renderToStaticMarkup(
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
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

/** Convierte la respuesta de ejemplo del optimizador en el overlay del store (trazo + marcadores). */
function overlayDemo() {
  const { paths, markers } = parseRouteOptimization(SAMPLE_ROUTE_OPTIMIZATION)
  return {
    polylines: paths.map((path, i) => ({ id: `demo-${i}`, path, color: SELECCION })),
    markers: markers.map((m, i) => ({ id: `demo-m-${i}`, position: m.position, color: '#0f172a', label: m.label })),
  }
}

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
}: {
  paradas: Parada[]
  onSelectionChange?: (ids: string[]) => void
  /** Habilita el botón de ruta en la toolbar (recién tras Optimizar). */
  routeToolEnabled?: boolean
  /** Muestra el overlay de ruta de EJEMPLO (polilíneas). Controlado desde afuera; no calcula nada. */
  showRoute?: boolean
  onToggleRoute?: () => void
  /** Muestra bajo cada punto el nombre + ventana horaria. Controlado desde la barra de filtros. */
  showDetails?: boolean
  /**
   * Modo UNIFICACIÓN: en vez de la ruta de ejemplo (varias polilíneas), dibuja UNA sola ruta por
   * todas las paradas dadas (depósito → vecino-más-cercano → depósito). Es "unifiqué en un camión".
   */
  singleRoute?: boolean
  /** Color de la ruta única (default: el azul de selección). */
  routeColor?: string
  /** Oculta la toolbar de herramientas (pan/selección/dibujo). Modo solo-lectura (ej. unificación). */
  hideTools?: boolean
}) {
  const [activeTool, setActiveTool] = useState<MapTool>('pan')
  // Parada cuyo detalle está abierto (null = cerrado). Se abre clickeando su pin con la mano activa.
  const [paradaDetalle, setParadaDetalle] = useState<Parada | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [zoom, setZoom] = useState(INITIAL_ZOOM)
  // Etiquetas de detalle: activadas por la tool Y con zoom suficiente (para no solaparse).
  const showLabels = showDetails && zoom >= DETAIL_ZOOM

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

  // Siembra (o limpia) el overlay de ruta según `showRoute` (controlado desde Optimizar). En modo
  // unificación arma UNA ruta por las paradas reales; si no, usa la respuesta de EJEMPLO (varias).
  useEffect(() => {
    if (!showRoute) {
      clearOverlay()
      return
    }
    setOverlay(singleRoute ? buildSingleRouteOverlay(paradas, routeColor) : overlayDemo())
  }, [showRoute, singleRoute, paradas, routeColor, setOverlay, clearOverlay])

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
          return (
            <Marker
              key={parada.id}
              position={[parada.lat, parada.lng]}
              icon={pinParada(parada, selectedSet.has(parada.id))}
              eventHandlers={{
                // Solo con la mano ('pan'): con rect/lazo activos el click es parte del gesto de
                // seleccionar, y abrir un modal ahí interrumpiría la selección a medio hacer.
                click: () => {
                  if (activeTool === 'pan') setParadaDetalle(parada)
                },
              }}
            >
              {/* Con la tool "Ver detalles" activa: etiqueta permanente y chica DEBAJO del pin
                  (nombre + ventana). Si no, el tooltip completo al hover, arriba. */}
              {showLabels ? (
                // `key` distinto fuerza el remount del Tooltip: react-leaflet fija `permanent` al
                // crearlo, no lo re-aplica si solo cambian props → sin key se quedaba en modo hover.
                <Tooltip key="detail" permanent direction="bottom" offset={[0, 13]} className="stop-detail-tip">
                  <span className="block text-center font-mono text-[9px] font-semibold leading-tight">
                    {parada.pedidos[0]?.salesOrder ?? parada.puntoEntregaId}
                  </span>
                  <span className="block text-center text-[9px] leading-tight text-muted-foreground">De: {desde}</span>
                  <span className="block text-center text-[9px] leading-tight text-muted-foreground">A: {hasta}</span>
                </Tooltip>
              ) : (
                <Tooltip key="hover" direction="top" offset={[0, -16]}>
                  <span className="font-medium">{parada.cliente}</span> · {parada.puntoEntregaId}
                  <br />
                  {CANAL_META[parada.canal].label} · {parada.pedidos.length} pedido
                  {parada.pedidos.length !== 1 ? 's' : ''} · {parada.pesoTotal} kg
                </Tooltip>
              )}
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
