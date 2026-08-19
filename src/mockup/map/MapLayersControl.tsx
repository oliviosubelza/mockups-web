import { LayersControl, TileLayer } from 'react-leaflet'
import { CAPAS_BASE, CAPA_POR_DEFECTO, SUBDOMINIOS, TILES } from './tiles'

// Selector de capa base del mapa de órdenes. Usa el `LayersControl` de Leaflet —y no el menú propio de
// planificación y monitoreo— porque esta pantalla no tiene paneles flotantes tapándole las esquinas.
//
// Las capas y su URL salen de `map/tiles`, igual que en el resto del mockup: antes esta lista tenía dos
// capas con la URL escrita a mano, así que le faltaba la gris y nadie se enteraba hasta compararlas.
// La que arranca marcada es `CAPA_POR_DEFECTO`, la misma de todos los mapas.
export function MapLayersControl() {
  return (
    <LayersControl position="topright">
      {CAPAS_BASE.map(({ valor, label }) => (
        <LayersControl.BaseLayer key={valor} checked={valor === CAPA_POR_DEFECTO} name={label}>
          <TileLayer url={TILES[valor]} subdomains={SUBDOMINIOS[valor]} />
        </LayersControl.BaseLayer>
      ))}
    </LayersControl>
  )
}
