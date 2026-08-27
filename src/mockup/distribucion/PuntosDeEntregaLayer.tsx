// LOS PUNTOS DE ENTREGA DE UNA DISTRIBUIDORA, mientras se le dibuja el contorno.
//
// ═══ POR QUÉ HACE FALTA ═══
//
// Dibujar un territorio sin ver los clientes es dibujar a ojo. El síntoma es exactamente el que
// aparece al usarlo: se traza un polígono que parece razonable, se guarda, y en el planificador
// faltan pedidos — porque el contorno cortó por el medio de una zona con clientes y no había forma de
// saberlo mientras se trazaba.
//
// Con los puntos a la vista el trabajo cambia de naturaleza: ya no es «recortá un pedazo de ciudad»
// sino «encerrá estos puntos», que es una consigna que se puede cumplir y verificar sola.
//
// ═══ POR QUÉ CÍRCULOS Y NO PINES ═══
//
// Son entre 60 y 70 por distribuidora y son CONTEXTO, no objetos que se tocan: lo que se está editando
// es el polígono. Un pin con su punta y su sombra a ese volumen tapa el mapa y compite con los
// vértices, que sí son lo que hay que agarrar. Un disco de 5 px dice «acá hay un cliente» y se calla.
//
// ═══ DOS COLORES, Y SON LA RESPUESTA A LA PREGUNTA ═══
//
// Dentro del contorno en curso, el color de la zona; afuera, gris. Eso convierte al mapa en el
// verificador: mientras se arrastra un vértice se ve, en vivo, cuántos puntos entran y cuántos quedan
// afuera. Es la misma información que el aviso del planificador, pero en el momento en que sirve para
// hacer algo con ella.
import { CircleMarker, Pane, Tooltip } from 'react-leaflet'
import { puntoEnAnillo } from '../map/geo/solapamiento'
import type { LatLngTuple } from '../map/geo/polyline'

/** Debajo de los depósitos (480) y de los polígonos, pero encima del fondo. */
export const PANE_PUNTOS_ENTREGA = 'distribucion-puntos-entrega'
const Z_PANE = 420

const GRIS = '#94a3b8'

export interface PuntoDeEntrega {
  id: string
  nombre: string
  posicion: LatLngTuple
  /** Cuántos pedidos hay en ese punto. Un punto puede juntar varios. */
  pedidos: number
}

export function PuntosDeEntregaLayer({
  puntos,
  contorno,
  color,
}: {
  puntos: PuntoDeEntrega[]
  /** El contorno EN CURSO. Con menos de 3 vértices todavía no encierra nada y todo se ve gris. */
  contorno: LatLngTuple[]
  color: string
}) {
  const hayContorno = contorno.length >= 3

  return (
    <Pane name={PANE_PUNTOS_ENTREGA} style={{ zIndex: Z_PANE }}>
      {puntos.map((punto) => {
        const dentro = hayContorno && puntoEnAnillo(punto.posicion, contorno) !== 'fuera'
        return (
          <CircleMarker
            key={punto.id}
            center={punto.posicion}
            radius={dentro ? 5 : 4}
            pathOptions={{
              color: '#fff',
              weight: 1,
              fillColor: dentro ? color : GRIS,
              fillOpacity: dentro ? 0.95 : 0.55,
            }}
            // NO INTERACTIVOS: el que dibuja está arrastrando vértices, y un marcador que se come el
            // click convierte cada intento de agarrar un tirador en un click sobre un cliente. El
            // tooltip igual funciona porque Leaflet lo engancha al hover, no al click.
            interactive={false}
          >
            <Tooltip direction="top" offset={[0, -4]} opacity={1}>
              <span className="text-[11px]">
                {punto.nombre}
                {punto.pedidos > 1 && ` · ${punto.pedidos} pedidos`}
              </span>
            </Tooltip>
          </CircleMarker>
        )
      })}
    </Pane>
  )
}
