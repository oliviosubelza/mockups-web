// Mercados con polígono — el "backend de mentira" de `GET /planning/markets/map`.
//
// Devuelve el DTO tal cual lo mandaría el endpoint real (ids numéricos, nombres en inglés,
// coordenadas GeoJSON en orden [lng, lat]). Nada de esto se dibuja acá: el adaptador a Leaflet vive en
// `map/mercados/mercado-mapa.ts`. Cuando exista el endpoint de verdad, este archivo se borra completo.
//
// Los mercados NO son nuestra tabla: los expone Ventas (mercado → manzano → cliente). Acá se simulan
// con nombres de mercados reales de Santa Cruz y de las provincias del dataset, y con polígonos
// dibujados alrededor de las mismas anclas geográficas que usan los pedidos (`ANCLAS_ZONA`,
// `LOCALIDADES`) — si no, los polígonos caerían en el campo y ningún pedido quedaría adentro.
import { createRand } from './mock-random'
import { ANCLAS_ZONA } from './mock-pools'
import { CIUDAD_META, type CiudadId } from './mock-data'
import type { GeoJsonPolygon, MarketMapDto } from './services/planning-markets'

/**
 * Semilla PROPIA, no el `rand` compartido de `mock-data`.
 *
 * El dataset de pedidos/camiones se genera consumiendo una única secuencia pseudoaleatoria: si estos
 * polígonos tomaran números de ahí, agregar o quitar un mercado correría toda la secuencia y cambiarían
 * placas, clientes e ids del resto del mockup. Con semilla aparte los dos datasets son independientes y
 * los dos siguen siendo reproducibles.
 */
const rand = createRand(0x4d4b54)

/** Ancla de un mercado: dónde está su centro y cuánto se extiende (en grados). */
interface AnclaMercado {
  nombre: string
  ciudad: CiudadId
  lat: number
  lng: number
  /** Radio aproximado del polígono en grados (~0.010° ≈ 1,1 km). */
  radio: number
}

/**
 * Los mercados del mock. La capital se lleva la mayoría (es donde cae ~80% de los pedidos) y cada
 * provincia tiene uno o dos, así el filtro de Ciudad se nota en el mapa.
 */
const ANCLAS: AnclaMercado[] = [
  // Santa Cruz de la Sierra — apoyados en las anclas de zona de los pedidos.
  { nombre: 'Mercado Los Pozos', ciudad: 'santacruz', ...ANCLAS_ZONA.centro, radio: 0.011 },
  { nombre: 'Mercado La Ramada', ciudad: 'santacruz', lat: -17.7955, lng: -63.1935, radio: 0.01 },
  { nombre: 'Mercado Abasto', ciudad: 'santacruz', ...ANCLAS_ZONA.sur, radio: 0.015 },
  { nombre: 'Mercado Mutualista', ciudad: 'santacruz', lat: -17.7605, lng: -63.2035, radio: 0.013 },
  { nombre: 'Mercado Campesino', ciudad: 'santacruz', ...ANCLAS_ZONA.norte, radio: 0.014 },
  { nombre: 'Mercado Plan 3000', ciudad: 'santacruz', ...ANCLAS_ZONA.este, radio: 0.018 },
  // Provincias — sobre la coordenada de la localidad (ver LOCALIDADES en mock-pools).
  { nombre: 'Mercado Central Montero', ciudad: 'montero', lat: -17.339, lng: -63.253, radio: 0.011 },
  { nombre: 'Mercado Campesino Montero', ciudad: 'montero', lat: -17.3475, lng: -63.2425, radio: 0.008 },
  { nombre: 'Mercado Warnes', ciudad: 'warnes', lat: -17.51, lng: -63.168, radio: 0.009 },
  { nombre: 'Mercado La Guardia', ciudad: 'laguardia', lat: -17.893, lng: -63.32, radio: 0.01 },
  { nombre: 'Mercado Cotoca', ciudad: 'cotoca', lat: -17.746, lng: -63.057, radio: 0.009 },
]

/** Primer `marketId`. Arranca en 10 para que ningún id coincida con el `cityId` y se confundan leyendo. */
const PRIMER_MARKET_ID = 10

/**
 * Anillo exterior cerrado (el último vértice repite al primero, como exige GeoJSON) alrededor del
 * ancla: vértices repartidos en círculo con el ángulo y el radio pateados un poco, que es lo que hace
 * que se lea como una zona de venta y no como un hexágono de manual.
 */
function anilloAlrededor(ancla: AnclaMercado): number[][] {
  const vertices = rand.int(6, 9)
  const anillo: number[][] = []
  for (let i = 0; i < vertices; i++) {
    const angulo = (i / vertices) * Math.PI * 2 + rand.float(-0.18, 0.18, 4)
    const radio = ancla.radio * rand.float(0.68, 1, 3)
    const lat = ancla.lat + Math.sin(angulo) * radio
    const lng = ancla.lng + Math.cos(angulo) * radio
    // [lng, lat] — orden GeoJSON, no el de Leaflet.
    anillo.push([Number(lng.toFixed(4)), Number(lat.toFixed(4))])
  }
  anillo.push([...anillo[0]])
  return anillo
}

/** Dataset completo, generado UNA vez al importar el módulo (igual que el resto del mock). */
const MERCADOS: MarketMapDto[] = ANCLAS.map((ancla, i) => {
  const polygon: GeoJsonPolygon = { type: 'Polygon', coordinates: [anilloAlrededor(ancla)] }
  return {
    marketId: PRIMER_MARKET_ID + i,
    marketName: ancla.nombre,
    cityId: CIUDAD_META[ancla.ciudad].cityId,
    polygon,
  }
})

/** Los mercados de una ciudad. Array vacío si el `cityId` no tiene ninguno — no es un error. */
export function mercadosDeCity(cityId: number): MarketMapDto[] {
  return MERCADOS.filter((m) => m.cityId === cityId)
}
