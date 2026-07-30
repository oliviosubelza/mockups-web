// Orden geográfico por curva de Hilbert.
//
// PROBLEMA QUE RESUELVE: repartir paradas entre camiones ordenándolas por longitud (o por latitud) y
// cortando la lista en trozos iguales le da a cada camión una FRANJA VERTICAL del mapa — angosta en
// longitud pero que abarca todo el rango norte-sur. Con localidades que van de Mineros a El Torno eso
// son ~95 km entre paradas del mismo camión, y el mapa del viaje queda ilegible.
//
// La causa es que un `sort` es unidimensional y la cercanía es bidimensional. Una curva de Hilbert
// recorre la grilla de modo que dos celdas consecutivas en la curva son SIEMPRE vecinas en el plano:
// convierte (lat, lng) en un solo número sin perder la vecindad. Ordenar por ese número y cortar en
// trozos da grupos compactos, que es lo que hace un ruteo real.

/** Bits por eje. 16 → grilla de 65.536 × 65.536, muy por debajo del error de un GPS a esta escala. */
const BITS = 16
const LADO = 1 << BITS

/**
 * Índice de una celda (x, y) sobre la curva de Hilbert de lado `n`.
 * Algoritmo estándar de conversión xy→d: en cada nivel se identifica el cuadrante y se rota el
 * sistema de coordenadas para que la curva del nivel siguiente entre y salga por donde corresponde.
 */
function xy2d(n: number, x: number, y: number): number {
  let d = 0
  for (let s = n >>> 1; s > 0; s >>>= 1) {
    const rx = (x & s) > 0 ? 1 : 0
    const ry = (y & s) > 0 ? 1 : 0
    d += s * s * ((3 * rx) ^ ry)

    // Rotación del cuadrante.
    if (ry === 0) {
      if (rx === 1) {
        x = s - 1 - x
        y = s - 1 - y
      }
      const t = x
      x = y
      y = t
    }
  }
  return d
}

/**
 * Ordena por cercanía geográfica: los elementos quedan agrupados por vecindad, así que cortar el
 * resultado en trozos consecutivos da grupos compactos.
 *
 * Los dos ejes se normalizan con el MISMO divisor (el lado mayor del bounding box) a propósito:
 * normalizando cada eje por su propio rango se deforma la escala y dos puntos separados 500 m en
 * latitud podrían caer más lejos en la grilla que dos separados 5 km en longitud.
 */
export function ordenarPorCercania<T>(items: T[], coord: (item: T) => [number, number]): T[] {
  if (items.length < 2) return [...items]

  const puntos = items.map(coord)
  const lats = puntos.map((p) => p[0])
  const lngs = puntos.map((p) => p[1])
  const minLat = Math.min(...lats)
  const minLng = Math.min(...lngs)
  // `|| 1` cubre el caso degenerado de todos los puntos en la misma coordenada.
  const lado = Math.max(Math.max(...lats) - minLat, Math.max(...lngs) - minLng) || 1

  const celda = (valor: number, min: number) =>
    Math.min(LADO - 1, Math.max(0, Math.floor(((valor - min) / lado) * (LADO - 1))))

  return items
    .map((item, i) => ({
      item,
      d: xy2d(LADO, celda(puntos[i][1], minLng), celda(puntos[i][0], minLat)),
    }))
    .sort((a, b) => a.d - b.d)
    .map((r) => r.item)
}
