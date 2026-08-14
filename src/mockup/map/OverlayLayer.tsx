import { Fragment, useEffect } from 'react'
import L from 'leaflet'
import { CircleMarker, Polyline, Popup, useMap } from 'react-leaflet'
import { useOverlayStore } from './overlay-store'

// Dibuja los overlays del `overlay-store` (polilíneas + marcadores) sobre el mapa. Cuando el store
// recibe un overlay nuevo (`fitToken` cambia) encuadra el trazo agregado con fitBounds. Es el puente
// del feature overlay: la UI empuja datos al store y este componente los traduce a capas de Leaflet.
export function OverlayLayer() {
  const map = useMap()
  const polylines = useOverlayStore((s) => s.polylines)
  const markers = useOverlayStore((s) => s.markers)
  const fitToken = useOverlayStore((s) => s.fitToken)

  useEffect(() => {
    const points: L.LatLngExpression[] = [
      ...polylines.flatMap((line) => line.path),
      ...markers.map((marker) => marker.position),
    ]
    if (points.length === 0) return
    map.fitBounds(L.latLngBounds(points).pad(0.2), { maxZoom: 16 })
    // Depende de `fitToken` a propósito: solo re-encuadra cuando llega un overlay nuevo, no en cada
    // render (así el usuario puede alejar/acercar sin que el mapa le pelee el zoom).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToken, map])

  return (
    <>
      {polylines.map((line) => (
        <Fragment key={line.id}>
          <Polyline
            positions={line.path}
            pathOptions={{ color: '#ffffff', weight: 6.5, opacity: 0.95 }}
          />
          <Polyline
            positions={line.path}
            pathOptions={{ color: line.color, weight: 3.5, opacity: 1 }}
          />
        </Fragment>
      ))}

      {markers.map((marker) => (
        <CircleMarker
          key={marker.id}
          center={marker.position}
          radius={5}
          pathOptions={{ color: '#ffffff', weight: 2, fillColor: marker.color, fillOpacity: 1 }}
        >
          {marker.label && <Popup>{marker.label}</Popup>}
        </CircleMarker>
      ))}
    </>
  )
}
