import { useEffect } from 'react'
import L from 'leaflet'
import { useMap } from 'react-leaflet'
import type { Parada } from '../mock-data'

export type MapTool = 'pan' | 'rect' | 'lasso'

const SELECT_STYLE: L.PolylineOptions = {
  color: '#2563eb',
  weight: 1.5,
  dashArray: '6 4',
  fillColor: '#2563eb',
  fillOpacity: 0.08,
}

/** Ray-casting point-in-polygon sobre lat/lng planas (suficientemente preciso a escala de ciudad). */
function pointInPolygon(point: { lat: number; lng: number }, polygon: L.LatLng[]): boolean {
  const x = point.lng
  const y = point.lat
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng
    const yi = polygon[i].lat
    const xj = polygon[j].lng
    const yj = polygon[j].lat
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

// Selección espacial de paradas por rectángulo o lazo. Solo actúa cuando `activeTool` es 'rect' o
// 'lasso'. En vez de escribir a un store, avisa los ids seleccionados vía `onSelect` (el proyecto de
// referencia usaba un vrp-store; acá el estado de selección vive en OrdersMap como useState).
export function SelectionLayer({
  activeTool,
  paradas,
  onSelect,
}: {
  activeTool: MapTool
  paradas: Parada[]
  onSelect: (ids: string[]) => void
}) {
  const map = useMap()

  useEffect(() => {
    if (activeTool !== 'rect' && activeTool !== 'lasso') return

    const container = map.getContainer()
    const prevCursor = container.style.cursor
    const prevUserSelect = container.style.userSelect
    container.style.cursor = 'crosshair'
    // Corta el drag nativo de texto/tiles mientras se selecciona; si no, arrastrar más allá del borde
    // del mapa dispara un drag del navegador que se come el mouseup y deja la forma huérfana.
    container.style.userSelect = 'none'
    map.dragging.disable()
    map.boxZoom.disable()
    map.doubleClickZoom.disable()

    let shape: L.Rectangle | L.Polygon | null = null
    let startLatLng: L.LatLng | null = null
    let lassoPoints: L.LatLng[] = []
    let drawing = false

    const cleanupShape = () => {
      if (shape) {
        map.removeLayer(shape)
        shape = null
      }
      startLatLng = null
      lassoPoints = []
      drawing = false
      map.off('mousemove', onMove)
    }

    const onMove = (e: L.LeafletMouseEvent) => {
      if (!drawing) return
      if (activeTool === 'rect' && startLatLng && shape) {
        ;(shape as L.Rectangle).setBounds(L.latLngBounds(startLatLng, e.latlng))
      } else if (activeTool === 'lasso' && shape) {
        lassoPoints.push(e.latlng)
        ;(shape as L.Polygon).setLatLngs(lassoPoints)
      }
    }

    const onDown = (e: L.LeafletMouseEvent) => {
      // Sana cualquier forma que haya quedado de un gesto cuyo mouseup nunca llegó (ej. soltado en
      // medio de un drag nativo), así no se acumulan sobre el mapa.
      cleanupShape()
      e.originalEvent?.preventDefault()
      drawing = true
      startLatLng = e.latlng
      if (activeTool === 'rect') {
        shape = L.rectangle(L.latLngBounds(e.latlng, e.latlng), SELECT_STYLE).addTo(map)
      } else {
        lassoPoints = [e.latlng]
        shape = L.polygon(lassoPoints, SELECT_STYLE).addTo(map)
      }
      map.on('mousemove', onMove)
    }

    // Escucha en el document, no en el mapa: soltar el botón fuera del contenedor (ej. sobre el
    // sidebar) igual debe finalizar y limpiar la forma. Las coordenadas de ese evento no sirven acá,
    // así que finalizamos desde la geometría que la forma ya tiene, no desde e.latlng.
    const onUp = () => {
      if (!drawing) return
      let ids: string[] = []

      if (activeTool === 'rect' && shape) {
        const bounds = (shape as L.Rectangle).getBounds()
        ids = paradas.filter((p) => bounds.contains([p.lat, p.lng])).map((p) => p.id)
      } else if (activeTool === 'lasso' && lassoPoints.length >= 3) {
        ids = paradas.filter((p) => pointInPolygon(p, lassoPoints)).map((p) => p.id)
      }

      onSelect(ids)
      cleanupShape()
    }

    map.on('mousedown', onDown)
    document.addEventListener('mouseup', onUp, true)

    return () => {
      map.off('mousedown', onDown)
      document.removeEventListener('mouseup', onUp, true)
      cleanupShape()
      container.style.cursor = prevCursor
      container.style.userSelect = prevUserSelect
      map.dragging.enable()
      map.boxZoom.enable()
      map.doubleClickZoom.enable()
    }
  }, [activeTool, map, paradas, onSelect])

  return null
}
