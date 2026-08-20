// Snapping (imantado) de un punto contra la geometría de las zonas vecinas.
//
// POR QUÉ EXISTE: dos zonas de reparto que limitan una con la otra tienen que hacerlo de forma
// REPETIBLE. Dibujadas a pulso nunca coinciden — quedan solapadas unos metros o con un hueco de
// cincuenta, y ninguna de las dos cosas se ve al zoom al que se dibuja. El solapamiento no se combate
// validando después: se hace imposible al momento de poner el vértice.
//
// IMANTADO CON HOLGURA (el cambio importante). Antes el imantado pegaba el vértice EXACTAMENTE sobre el
// borde vecino: dos zonas terminaban compartiendo el mismo punto. Hoy la regla es que los contornos no
// se toquen nunca (ver `geo/holgura.ts`), así que el imantado hace un paso más: busca el borde vecino,
// y deja el vértice a `holguraMetros` de él, SIEMPRE hacia afuera de esa vecina.
//
// El gesto no cambia en nada —acercás el mouse al borde y el vértice se acomoda solo— y el resultado
// pasa a cumplir la regla en vez de romperla. Un metro a zoom 12 es 0,07 px: en pantalla el vértice se
// ve pegado al borde igual que antes. La diferencia no es visual, es que ahora el dato es válido.
//
// LA BÚSQUEDA VA EN PÍXELES Y EL EMPUJÓN EN METROS, y cada uno en su unidad por una razón distinta:
//   · buscar en píxeles, porque lo que se mide es la PUNTERÍA del mouse: "a 12 px del borde" es lo que
//     el usuario ve, y un radio en metros imantaría contra todo al alejar y contra nada al acercar;
//   · empujar en metros, porque la holgura es una propiedad del TERRITORIO: tiene que valer un metro
//     mirando de cerca o de lejos, y en grados sería una elipse (un grado de lng mide menos que uno
//     de lat, así que la holgura cambiaría según la orientación del borde).
import L from 'leaflet'
import { M_POR_GRADO_LAT, metrosPorGradoLng } from './holgura'
import { puntoEnAnillo } from './solapamiento'
import type { LatLngTuple } from './polyline'

export type TipoSnap = 'vertice' | 'arista'

export interface Snap {
  /** Dónde queda el vértice: el punto del borde vecino, ya empujado hacia afuera por la holgura. */
  latlng: LatLngTuple
  /** El punto EXACTO del borde vecino al que se imantó, sin la holgura. Es lo que se dibuja de guía. */
  borde: LatLngTuple
  tipo: TipoSnap
  distanciaPx: number
  /** Separación que quedó contra la vecina más cercana, en metros. */
  holguraM: number
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

/** Centro del bounding box del anillo. Solo se usa como dirección de último recurso (ver `empujar`). */
function centro(anillo: LatLngTuple[]): LatLngTuple {
  const lats = anillo.map((p) => p[0])
  const lngs = anillo.map((p) => p[1])
  return [(Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lngs) + Math.max(...lngs)) / 2]
}

/**
 * Corre `desde` una distancia de `metros` en la dirección que va de `origen` a `hacia`.
 *
 * La dirección se normaliza en el espacio MÉTRICO local (la longitud se escala por cos(lat)) y no en
 * grados: si no, la misma dirección en grados empuja más o menos según cuán inclinado esté el borde.
 */
function correr(desde: LatLngTuple, origen: LatLngTuple, hacia: LatLngTuple, metros: number): LatLngTuple | null {
  const kLng = metrosPorGradoLng(desde[0])
  const dy = (hacia[0] - origen[0]) * M_POR_GRADO_LAT
  const dx = (hacia[1] - origen[1]) * kLng
  const largo = Math.hypot(dx, dy)
  if (largo === 0) return null
  return [desde[0] + ((dy / largo) * metros) / M_POR_GRADO_LAT, desde[1] + ((dx / largo) * metros) / kLng]
}

/**
 * Empuja el punto del borde hacia AFUERA de la vecina, hasta dejarlo a `metros` de ella.
 *
 * La dirección natural es "hacia donde está el cursor": el que dibuja se acerca al borde desde el lado
 * en el que quiere su zona, así que su propio mouse dice para qué lado ir. Después se COMPRUEBA, porque
 * dos casos rompen esa intuición: cursor exactamente encima del borde (no hay dirección) y cursor del
 * lado de adentro (pasa al arrastrar un vértice desde el interior de la vecina). Si el candidato cae
 * dentro, se invierte; y si tampoco sirve, se cae a "alejarse del centro de la vecina", que en una zona
 * convexa siempre apunta afuera.
 */
function empujar(
  borde: LatLngTuple,
  cursor: LatLngTuple,
  anillo: LatLngTuple[],
  metros: number,
): LatLngTuple {
  const candidatos = [
    correr(borde, borde, cursor, metros),
    correr(borde, cursor, borde, metros),
    correr(borde, centro(anillo), borde, metros),
  ]
  for (const c of candidatos) {
    if (c && puntoEnAnillo(c, anillo) === 'fuera') return c
  }
  // Ninguna dirección dio "afuera": el borde es más angosto que la holgura o la geometría es degenerada.
  // Se devuelve el punto del borde sin tocar y la validación lo marca — mejor un conflicto visible que
  // un vértice movido a un lugar que nadie pidió.
  return borde
}

/** Separación real (metros) entre un punto y el borde más cercano de un conjunto de anillos. */
function separacionMinima(punto: LatLngTuple, anillos: LatLngTuple[][]): number {
  const kLng = metrosPorGradoLng(punto[0])
  const aPlano = ([lat, lng]: LatLngTuple) => ({ x: lng * kLng, y: lat * M_POR_GRADO_LAT })
  const p = aPlano(punto)
  let min = Infinity
  for (const anillo of anillos) {
    if (anillo.length < 2) continue
    const pts = anillo.map(aPlano)
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const largo2 = dx * dx + dy * dy
      const t = largo2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / largo2))
      min = Math.min(min, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)))
    }
  }
  return min
}

export interface OpcionesSnap {
  radioPx?: number
  /**
   * Separación a dejar contra el borde imantado. 0 imanta ENCIMA del borde (el comportamiento viejo).
   *
   * Se pide con un poco de sobra respecto del mínimo exigido —lo decide quien llama— porque el vértice
   * hace un viaje de ida y vuelta por la proyección de pantalla y volver justo en el límite haría que
   * la propia validación rechazara lo que el imantado acaba de construir.
   */
  holguraMetros?: number
}

/**
 * Busca el mejor punto al que imantar `cursor` dentro de `radioPx`, contra los `anillos` dados.
 * Devuelve `null` si no hay nada cerca.
 *
 * LOS VÉRTICES GANAN SIEMPRE sobre las aristas, aunque la arista esté más cerca en píxeles. Si no,
 * parado en una esquina la arista que sale de ella siempre mide menos que el vértice mismo y sería
 * imposible acompañar dos zonas por su esquina — que es justo el caso que más se necesita.
 */
export function buscarSnap(
  map: L.Map,
  cursor: L.LatLng,
  anillos: LatLngTuple[][],
  { radioPx = RADIO_SNAP_PX, holguraMetros = 0 }: OpcionesSnap = {},
): Snap | null {
  if (anillos.length === 0) return null
  const p = map.latLngToContainerPoint(cursor)

  // Prefiltro por viewport: proyectar cada vértice cuesta, y las zonas de otra punta de la ciudad no
  // pueden imantar nada. Con muchas zonas el próximo paso sería un índice espacial, pero el corte por
  // pantalla ya saca la mayoría por dos comparaciones de bbox.
  const vista = map.getBounds().pad(0.05)
  const visibles = anillos.filter((anillo) => anillo.length > 1 && L.latLngBounds(anillo).intersects(vista))
  if (visibles.length === 0) return null

  const cursorLL: LatLngTuple = [cursor.lat, cursor.lng]

  /** Arma el resultado: empuja el punto por la holgura y mide qué separación quedó de verdad. */
  const armar = (borde: LatLngTuple, anillo: LatLngTuple[], tipo: TipoSnap, distanciaPx: number): Snap => {
    const latlng = holguraMetros > 0 ? empujar(borde, cursorLL, anillo, holguraMetros) : borde
    return { latlng, borde, tipo, distanciaPx, holguraM: separacionMinima(latlng, visibles) }
  }

  // Pasada 1: vértices.
  let mejorV: { borde: LatLngTuple; anillo: LatLngTuple[]; d: number } | null = null
  for (const anillo of visibles) {
    for (const v of anillo) {
      const d = p.distanceTo(map.latLngToContainerPoint(v))
      if (d <= radioPx && (!mejorV || d < mejorV.d)) mejorV = { borde: v, anillo, d }
    }
  }
  if (mejorV) return armar(mejorV.borde, mejorV.anillo, 'vertice', mejorV.d)

  // Pasada 2: aristas. El anillo se recorre cerrado (el último une con el primero) porque el borde
  // entre la última y la primera posición es un lado como cualquier otro.
  let mejorA: { borde: LatLngTuple; anillo: LatLngTuple[]; d: number } | null = null
  for (const anillo of visibles) {
    const pts = anillo.map((v) => map.latLngToContainerPoint(v))
    for (let i = 0; i < pts.length; i++) {
      const { punto, distancia } = proyectarEnSegmento(p, pts[i], pts[(i + 1) % pts.length])
      if (distancia <= radioPx && (!mejorA || distancia < mejorA.d)) {
        const ll = map.containerPointToLatLng(punto)
        mejorA = { borde: [ll.lat, ll.lng], anillo, d: distancia }
      }
    }
  }
  return mejorA ? armar(mejorA.borde, mejorA.anillo, 'arista', mejorA.d) : null
}
