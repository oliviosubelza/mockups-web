// Un click en el mapa, como componente.
//
// Existe porque `useMapEvents` es un hook y solo corre DENTRO de un `MapContainer`: la pantalla que
// necesita el click está afuera, así que hace falta un componente hijo que lo escuche y lo pase para
// arriba. Es el mismo truco que `CapturarMapa` con la instancia del mapa.
//
// SE EXTRAJO de `restricciones/RestrictionMap`, donde vivía como una función privada, cuando la pantalla
// de zonas de distribución necesitó exactamente lo mismo para plantar el marcador de un depósito. Son tres
// líneas, pero tener dos copias significa que un día una escucha `click` y la otra `mousedown`.
import { useMapEvents } from 'react-leaflet'
import type { LatLngTuple } from './geo/polyline'

/**
 * `onPunto` recibe `[lat, lng]` — el orden de Leaflet, no el de GeoJSON. Es a propósito: todo lo que
 * viaja por la UI de este mockup está en ese orden, y la conversión a `[lng, lat]` pasa una sola vez, al
 * armar la geometría que se guarda.
 */
export function MapaClick({ onPunto }: { onPunto: (punto: LatLngTuple) => void }) {
  useMapEvents({ click: ({ latlng }) => onPunto([latlng.lat, latlng.lng]) })
  return null
}
