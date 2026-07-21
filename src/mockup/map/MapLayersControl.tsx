import { LayersControl, TileLayer } from 'react-leaflet'

// Selector de capa base del mapa: "Calles" (OpenStreetMap, la de siempre) y "Satélite" (Esri World
// Imagery). Reemplaza al <TileLayer> suelto de OrdersMap. "Calles" queda seleccionada por defecto.
export function MapLayersControl() {
  return (
    <LayersControl position="topright">
      <LayersControl.BaseLayer checked name="Calles">
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer name="Satélite">
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
      </LayersControl.BaseLayer>
    </LayersControl>
  )
}
