// Geometría SOBRE un recorrido ya trazado: partirlo por sus paradas, cortarlo en un punto y ubicar una
// posición a lo largo de él.
//
// POR QUÉ EXISTE. Mientras el recorrido eran segmentos rectos de parada a parada, nada de esto hacía
// falta: el tramo `i` era `[recorrido[i], recorrido[i + 1]]` y la posición del camión salía de
// interpolar entre esos dos puntos. Con la geometría por calles de OSRM eso se rompe entero —el trazo
// pasa a ser una sola tira de cientos de vértices donde las paradas ya no son índices sino puntos que
// caen EN ALGÚN LUGAR de la tira—, y las dos cosas que la pantalla de monitoreo afirma dependen de
// poder recuperar esa correspondencia:
//
//   · el corte "lo recorrido va sólido, lo que falta va punteado" se hace en una PARADA;
//   · el camión se mueve ENTRE dos paradas, y tiene que hacerlo por el mismo asfalto que la línea.
//
// Todo acá es agnóstico al negocio y a Leaflet: entran y salen tuplas [lat, lng].
import type { LatLngTuple } from './polyline'

/**
 * Distancia entre dos puntos en metros aproximados, con la proyección equirectangular más simple: el
 * grado de longitud se acorta por `cos(lat)`.
 *
 * Alcanza y sobra para lo que se usa acá, que es SIEMPRE una comparación o un reparto de proporciones
 * dentro de un recorrido urbano de pocas decenas de kilómetros. Haversine daría el mismo resultado con
 * más trigonometría por vértice, y son cientos de vértices por render.
 */
function metros(a: LatLngTuple, b: LatLngTuple): number {
  const M_POR_GRADO = 111_320
  const dLat = (a[0] - b[0]) * M_POR_GRADO
  const dLng = (a[1] - b[1]) * M_POR_GRADO * Math.cos(((a[0] + b[0]) / 2) * (Math.PI / 180))
  return Math.hypot(dLat, dLng)
}

/**
 * Índice del vértice más cercano a `punto`, buscando SOLO desde `desde` en adelante.
 *
 * La búsqueda acotada no es una optimización, es corrección. Una ruta de reparto se pisa a sí misma
 * todo el tiempo —sale y vuelve por la misma avenida, da la vuelta a la manzana— y con una búsqueda
 * global la última parada podía enganchar en la pasada de IDA, que geométricamente está a diez metros
 * pero en el recorrido está veinte minutos antes. El resultado era un tramo de longitud negativa y el
 * trazo "recorrido" tapando al pendiente.
 *
 * Recorriendo las paradas EN ORDEN y arrancando cada búsqueda donde terminó la anterior, los cortes
 * quedan monótonos por construcción.
 */
function indiceMasCercano(path: LatLngTuple[], punto: LatLngTuple, desde = 0): number {
  let mejor = desde
  let mejorD = Infinity
  for (let i = desde; i < path.length; i++) {
    const d = metros(path[i], punto)
    if (d < mejorD) {
      mejorD = d
      mejor = i
    }
  }
  return mejor
}

/**
 * Parte `path` en un sub-recorrido por cada tramo entre `hitos` consecutivos: con N hitos devuelve
 * N - 1 tramos, y `tramos[i]` es cómo se maneja de `hitos[i]` a `hitos[i + 1]`.
 *
 * Cada tramo EMPIEZA y TERMINA en el hito exacto, no en el vértice de la calle que le quedó más cerca.
 * El motor engancha cada parada al eje de la calle, así que el vértice está a diez o quince metros del
 * portón del cliente; sin esos extremos, entre el fin de un tramo y el inicio del siguiente quedaba un
 * hueco visible al acercarse, y peor, el pin de la parada aparecía separado de su propia línea.
 *
 * Devuelve `null` si el path no alcanza para partirlo: quien llama vuelve a los tramos rectos, que es
 * exactamente lo que se veía antes de que existiera el ruteo.
 */
export function partirPorHitos(path: LatLngTuple[], hitos: LatLngTuple[]): LatLngTuple[][] | null {
  if (path.length < 2 || hitos.length < 2) return null

  // Índice de cada hito sobre el path, en orden y sin volver atrás (ver `indiceMasCercano`).
  const cortes: number[] = [0]
  for (let h = 1; h < hitos.length - 1; h++) {
    cortes.push(indiceMasCercano(path, hitos[h], cortes[cortes.length - 1]))
  }
  cortes.push(path.length - 1)

  const tramos: LatLngTuple[][] = []
  for (let i = 0; i < cortes.length - 1; i++) {
    const medio = path.slice(cortes[i], cortes[i + 1] + 1)
    tramos.push([hitos[i], ...medio, hitos[i + 1]])
  }
  return tramos
}

/**
 * Punto que está a la fracción `t` (0..1) de la LONGITUD de `path`. Es lo que reemplaza al
 * `interpolar(desde, hasta, t)` de la simulación.
 *
 * Por longitud y no por índice de vértice: OSRM devuelve los vértices donde la calle DOBLA, así que
 * están densos en una rotonda y ralísimos en una recta de dos kilómetros. Avanzando "un vértice por
 * tick" el camión salía disparado en las rectas y se quedaba pegado en cada esquina.
 */
export function avanceSobre(path: LatLngTuple[], t: number): LatLngTuple {
  if (path.length === 0) throw new Error('avanceSobre: recorrido vacío')
  if (path.length === 1) return path[0]

  const total = path.reduce((sum, p, i) => (i === 0 ? 0 : sum + metros(path[i - 1], p)), 0)
  const objetivo = Math.max(0, Math.min(1, t)) * total
  if (total === 0) return path[0]

  let acum = 0
  for (let i = 1; i < path.length; i++) {
    const d = metros(path[i - 1], path[i])
    if (acum + d >= objetivo) {
      // Fracción DENTRO del segmento: acá sí interpolar recto es correcto, es un pedazo de una calle.
      const f = d === 0 ? 0 : (objetivo - acum) / d
      return [
        path[i - 1][0] + (path[i][0] - path[i - 1][0]) * f,
        path[i - 1][1] + (path[i][1] - path[i - 1][1]) * f,
      ]
    }
    acum += d
  }
  return path[path.length - 1]
}

/**
 * Parte `path` en el vértice más cercano a `punto`: `[lo que quedó atrás, lo que falta]`, con `punto`
 * como último vértice del primero y primero del segundo — así las dos mitades se tocan y no queda un
 * salto en el quiebre.
 *
 * Se usa para el tramo que el camión está haciendo AHORA, que es el único que hay que cortar en un
 * lugar que no es una parada.
 */
export function cortarEn(path: LatLngTuple[], punto: LatLngTuple): [LatLngTuple[], LatLngTuple[]] {
  if (path.length < 2) return [[...path], [...path]]
  const i = indiceMasCercano(path, punto)
  return [
    [...path.slice(0, i + 1), punto],
    [punto, ...path.slice(i + 1)],
  ]
}

/** Concatena tramos consecutivos en una sola tira, sin repetir el punto que comparten. */
export function unirTramos(tramos: LatLngTuple[][]): LatLngTuple[] {
  return tramos.reduce<LatLngTuple[]>((out, tramo, i) => {
    out.push(...(i === 0 ? tramo : tramo.slice(1)))
    return out
  }, [])
}
