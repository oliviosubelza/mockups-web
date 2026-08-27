import { useEffect, useRef } from 'react'
import { CircleMarker, MapContainer, Polygon, Polyline, useMap } from 'react-leaflet'
import { CornerUpLeft, MapPinned, Trash2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { InvalidateOnResize } from '../map/InvalidateOnResize'
import { MapaClick } from '../map/MapaClick'
import { CAPA_POR_DEFECTO } from '../map/tiles'
import { CapaBaseTiles } from '../map/CapaBaseTiles'
import {
  RESTRICTION_TYPE_META,
  SPATIAL_NOT_EVALUATED,
  geometryToLatLng,
  latLngToGeometry,
  type RestrictionGeometry,
  type RestrictionType,
} from './domain'

const CENTER: [number, number] = [-17.783, -63.182]
const DRAW_COLOR = '#dc2626'

function FitGeometry({ points }: { points: [number, number][] }) {
  const map = useMap()
  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current || points.length === 0) return
    if (points.length === 1) map.setView(points[0], 15)
    if (points.length > 1) map.fitBounds(points, { padding: [28, 28], maxZoom: 16 })
    fitted.current = true
  }, [map, points])
  return null
}

export function RestrictionMap({
  restrictionType,
  geometry,
  onChange,
  readOnly = false,
}: {
  restrictionType: RestrictionType
  geometry: RestrictionGeometry
  onChange?: (geometry: RestrictionGeometry) => void
  readOnly?: boolean
}) {
  if (restrictionType === 'PLATE_ROTATION') {
    return (
      <Alert>
        <MapPinned />
        <AlertTitle>Sin geometría</AlertTitle>
        <AlertDescription>
          <code>PLATE_ROTATION</code> se evalúa por horario y reglas vehiculares. No se inventa un punto o polígono en el mapa.
        </AlertDescription>
      </Alert>
    )
  }

  const points = geometryToLatLng(geometry)
  const update = (next: [number, number][]) => onChange?.(latLngToGeometry(restrictionType, next))
  const minimum = restrictionType === 'RESTRICTED_AREA' ? 3 : 2

  return (
    <div className="space-y-3">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Toque o haga clic en el mapa para agregar puntos en orden. GeoJSON se guarda como [lng, lat].
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={points.length === 0}
              onClick={() => update(points.slice(0, -1))}
            >
              <CornerUpLeft size={13} className="mr-1.5" />
              Deshacer
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={points.length === 0}
              onClick={() => update([])}
            >
              <Trash2 size={13} className="mr-1.5" />
              Limpiar
            </Button>
          </div>
        </div>
      )}

      <Card className="relative h-[320px] gap-0 overflow-hidden p-0 sm:h-[390px]">
        <MapContainer
          center={points[0] ?? CENTER}
          zoom={13}
          scrollWheelZoom
          attributionControl={false}
          className="h-full w-full"
        >
          {/* Este mapa no tiene selector de capas: usa la de por defecto, como el resto. Antes
              tenía `calles` fija, así que era el único que salía a todo color. */}
          <CapaBaseTiles capa={CAPA_POR_DEFECTO} />
          <InvalidateOnResize />
          {points.length > 0 && <FitGeometry points={points} />}
          {!readOnly && <MapaClick onPunto={(punto) => update([...points, punto])} />}
          {restrictionType === 'RESTRICTED_AREA' && points.length >= 2 && (
            <Polygon
              positions={points}
              interactive={false}
              pathOptions={{ color: DRAW_COLOR, weight: 3, fillColor: DRAW_COLOR, fillOpacity: 0.16 }}
            />
          )}
          {restrictionType === 'CLOSED_ROAD' && points.length >= 2 && (
            <Polyline
              positions={points}
              interactive={false}
              pathOptions={{ color: DRAW_COLOR, weight: 5, dashArray: '10 7', lineCap: 'round' }}
            />
          )}
          {points.map((point, index) => (
            <CircleMarker
              key={`${point[0]}-${point[1]}-${index}`}
              center={point}
              radius={5}
              interactive={false}
              pathOptions={{ color: '#fff', weight: 2, fillColor: DRAW_COLOR, fillOpacity: 1 }}
            />
          ))}
        </MapContainer>
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-[500] -translate-x-1/2 rounded-full border bg-card/95 px-3 py-1 text-xs shadow backdrop-blur-sm">
          {points.length} punto{points.length === 1 ? '' : 's'} · mínimo {minimum} ·{' '}
          {RESTRICTION_TYPE_META[restrictionType].geometry}
        </div>
      </Card>

      <Alert>
        <MapPinned />
        <AlertTitle>Evaluación espacial: {SPATIAL_NOT_EVALUATED.status}</AlertTitle>
        <AlertDescription>{SPATIAL_NOT_EVALUATED.reason}</AlertDescription>
      </Alert>
    </div>
  )
}
