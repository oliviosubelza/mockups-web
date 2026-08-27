// La capa base de un mapa, en UN componente.
//
// Los siete mapas del mockup montaban su tesela con un `<TileLayer url={TILES[capa]} …/>` propio. Con
// el gris de Esri eso dejó de alcanzar: viene partido en fondo y rótulos, y hay que apilar dos capas.
// Repetir ese `if` siete veces es exactamente lo que el encabezado de `tiles.ts` argumenta que no hay
// que hacer, así que la decisión vive acá y las pantallas piden «la capa base» y ya.
import { TileLayer } from 'react-leaflet'
import { SUBDOMINIOS, TILES, TILES_ROTULOS, type CapaBase } from './tiles'

export function CapaBaseTiles({ capa }: { capa: CapaBase }) {
  const rotulos = TILES_ROTULOS[capa]
  return (
    <>
      {/* `key` por capa: sin él Leaflet reusa la instancia y solo le cambia la URL, lo que deja las
          teselas viejas pintadas hasta que llegan las nuevas. */}
      <TileLayer key={capa} url={TILES[capa]} subdomains={SUBDOMINIOS[capa]} />
      {rotulos && (
        <TileLayer
          key={`${capa}-rotulos`}
          url={rotulos}
          subdomains={SUBDOMINIOS[capa]}
          // Encima del fondo pero DEBAJO de todo lo que dibuja la app: los nombres de calle son
          // contexto, no información del plan. `tilePane` es el pane más bajo de Leaflet, así que
          // alcanza con un z mayor dentro de ese mismo pane.
          zIndex={2}
        />
      )}
    </>
  )
}
