// Snapping (imantado) de un punto contra la geometría de las zonas vecinas.
//
// POR QUÉ EXISTE: dos zonas de reparto que comparten un borde tienen que compartirlo EXACTO. Dibujadas
// a pulso nunca coinciden — quedan solapadas unos metros o con un hueco entre medio, y ninguna de las
// dos cosas se ve al zoom al que se dibuja. El solapamiento no se combate validando después: se hace
// imposible al momento de poner el vértice.
//
// TODO EL CÁLCULO VA EN PÍXELES DE PANTALLA, no en grados. Dos razones y las dos importan:
//   1. Un grado de longitud y uno de latitud no miden lo mismo, así que un radio en grados sería una
//      elipse — se imantaría más fácil en un eje que en el otro.
//   2. "A 12 píxeles del borde" es lo que el usuario ve. Un radio en metros se volvería gigante al
//      alejar el mapa (imantaría contra todo) y microscópico al acercarlo (no imantaría nunca).
// Es el mismo criterio que ya usa el descarte de vértices fantasma del doble click.
import L from 'leaflet'
import type { LatLngTuple } from './polyline'

export type TipoSnap = 'vertice' | 'arista'

export interface Snap {
  /** Dónde quedó el punto imantado. */
  latlng: LatLngTuple
  tipo: TipoSnap
  distanciaPx: number
}

/** Radio por defecto. 12 px es cómodo con el mouse sin imantar cuando no querés. */
export const RADIO_SNAP_PX = 12

/** Proyección de un punto sobre un segmento, en pantalla. `t` se recorta a [0,1] para que el resultado
 *  caiga DENTRO del segmento y no sobre su prolongación infinita. */
function proyectarEnSegmento(p: L.Point, a: L.Point, b: L.Point): { punto: L.Point; distancia: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const largo2 = dx * dx + dy * dy
  // Segmento degenerado (dos vértices en el mismo píxel): no hay dirección sobre la cual proyectar.
  if (largo2 === 0) return { punto: a, distancia: p.distanceTo(a) }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / largo2))
  const punto = L.point(a.x + t * dx, a.y + t * dy)
  return { punto, distancia: p.distanceTo(punto) }
}

/**
 * Busca el mejor punto al que imantar `cursor` dentro de `radioPx`, contra los `anillos` dados.
 * Devuelve `null` si no hay nada cerca.
 *
 * LOS VÉRTICES GANAN SIEMPRE sobre las aristas, aunque la arista esté más cerca en píxeles. Si no,
 * parado en una esquina la arista que sale de ella siempre mide menos que el vértice mismo y sería
 * imposible soldar dos zonas por su esquina — que es justo el caso que más se necesita.
 */
export function buscarSnap(
  map: L.Map,
  cursor: L.LatLng,
  anillos: LatLngTuple[][],
  radioPx: number = RADIO_SNAP_PX,
): Snap | null {
  if (anillos.length === 0) return null
  const p = map.latLngToContainerPoint(cursor)

  // Prefiltro por viewport: proyectar cada vértice cuesta, y las zonas de otra punta de la ciudad no
  // pueden imantar nada. Con muchas zonas el próximo paso sería un índice espacial, pero el corte por
  // pantalla ya saca la mayoría por dos comparaciones de bbox.
  const vista = map.getBounds().pad(0.05)
  const visibles = anillos.filter((anillo) => anillo.length > 1 && L.latLngBounds(anillo).intersects(vista))
  if (visibles.length === 0) return null

  // Pasada 1: vértices.
  let mejorVertice: Snap | null = null
  for (const anillo of visibles) {
    for (const v of anillo) {
      const d = p.distanceTo(map.latLngToContainerPoint(v))
      if (d <= radioPx && (!mejorVertice || d < mejorVertice.distanciaPx)) {
        mejorVertice = { latlng: v, tipo: 'vertice', distanciaPx: d }
      }
    }
  }
  if (mejorVertice) return mejorVertice

  // Pasada 2: aristas. El anillo se recorre cerrado (el último une con el primero) porque el borde
  // entre la última y la primera posición es un lado como cualquier otro.
  let mejorArista: Snap | null = null
  for (const anillo of visibles) {
    const pts = anillo.map((v) => map.latLngToContainerPoint(v))
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      const { punto, distancia } = proyectarEnSegmento(p, a, b)
      if (distancia <= radioPx && (!mejorArista || distancia < mejorArista.distanciaPx)) {
        const ll = map.containerPointToLatLng(punto)
        mejorArista = { latlng: [ll.lat, ll.lng], tipo: 'arista', distanciaPx: distancia }
      }
    }
  }
  return mejorArista
}
