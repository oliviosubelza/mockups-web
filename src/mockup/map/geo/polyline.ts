// Utilidades geográficas agnósticas al negocio: decodificación de polilíneas y parseo mínimo de una
// respuesta de Google Route Optimization. No dependen del mapa ni de ningún store — cualquier parte
// del mockup puede decodificar una polilínea o interpretar una respuesta del solver.
import { decode } from '@googlemaps/polyline-codec'

/** Par [lat, lng] — el formato que consume Leaflet directamente. */
export type LatLngTuple = [number, number]

export interface GeoMarker {
  position: LatLngTuple
  label?: string
}

/** Resultado normalizado de interpretar una entrada geográfica: trazos + puntos de interés. */
export interface GeoShapes {
  paths: LatLngTuple[][]
  markers: GeoMarker[]
}

/**
 * Decodifica una polilínea codificada (algoritmo de Google) en una secuencia de [lat, lng].
 * `precision` = 5 es el estándar de Google Maps y Route Optimization; usá 6 para OSRM/Valhalla.
 */
export function decodePolyline(encoded: string, precision = 5): LatLngTuple[] {
  return decode(encoded, precision) as LatLngTuple[]
}

/** Extrae la ubicación de un waypoint de Route Optimization (`{ latitude, longitude }`). */
function readArrivalLocation(node: unknown): LatLngTuple | null {
  const loc = (node as { arrivalLocation?: { latitude?: unknown; longitude?: unknown } })
    ?.arrivalLocation
  if (loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
    return [loc.latitude, loc.longitude]
  }
  return null
}

/**
 * Interpreta una respuesta de Google Route Optimization. Tolera formas parciales: toma cada
 * `routes[].routePolyline.points` como un trazo, y cada `shipments[].deliveries/pickups[]` con
 * `arrivalLocation` como un marcador. Los campos ausentes se ignoran silenciosamente.
 */
export function parseRouteOptimization(data: unknown): GeoShapes {
  const paths: LatLngTuple[][] = []
  const markers: GeoMarker[] = []

  const routes = (data as { routes?: unknown[] })?.routes
  if (Array.isArray(routes)) {
    for (const route of routes) {
      const points = (route as { routePolyline?: { points?: unknown } })?.routePolyline?.points
      if (typeof points === 'string' && points.length > 0) {
        paths.push(decodePolyline(points))
      }
    }
  }

  const shipments = (data as { shipments?: unknown[] })?.shipments
  if (Array.isArray(shipments)) {
    shipments.forEach((shipment, i) => {
      const visits = [
        ...(((shipment as { deliveries?: unknown[] })?.deliveries) ?? []),
        ...(((shipment as { pickups?: unknown[] })?.pickups) ?? []),
      ]
      for (const visit of visits) {
        const position = readArrivalLocation(visit)
        if (position) markers.push({ position, label: `Envío ${i + 1}` })
      }
    })
  }

  return { paths, markers }
}

/**
 * Auto-detecta el tipo de entrada y la normaliza a trazos + marcadores:
 *  - texto que empieza con `{` o `[` → JSON de Route Optimization.
 *  - cualquier otro texto → una única polilínea codificada.
 * Lanza si el JSON es inválido o la polilínea no decodifica — el llamador decide cómo notificar.
 */
export function parsePolylineInput(raw: string): GeoShapes {
  const trimmed = raw.trim()
  if (!trimmed) return { paths: [], markers: [] }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseRouteOptimization(JSON.parse(trimmed))
  }
  return { paths: [decodePolyline(trimmed)], markers: [] }
}
