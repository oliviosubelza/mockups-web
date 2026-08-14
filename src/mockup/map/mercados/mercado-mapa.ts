// Adaptador: DTO del endpoint → lo que el mapa necesita. Cero React y cero Leaflet, solo datos.
//
// Existe separado del servicio y del componente de dibujo porque acá pasan las dos cosas que, hechas
// de nuevo en cada pantalla, se hacen mal: invertir el orden de las coordenadas (GeoJSON manda
// [lng, lat] y Leaflet espera [lat, lng]) y elegir el color del mercado. Un solo lugar, una sola vez.
import type { MarketMapDto } from '../../services/planning-markets'
import type { LatLngTuple } from '../geo/polyline'

/**
 * Paleta de mercados: colores SUAVES y con matices bien separados entre sí. Suaves porque los
 * polígonos son fondo — el protagonista del mapa sigue siendo el pedido —, y separados porque dos
 * mercados vecinos con el mismo tono no se distinguen aunque el relleno sea tenue.
 */
export const COLORES_MERCADO = [
  '#60a5fa', // azul
  '#f472b6', // rosa
  '#34d399', // verde
  '#fbbf24', // ámbar
  '#a78bfa', // violeta
  '#fb923c', // naranja
  '#22d3ee', // cian
  '#a3e635', // lima
  '#f87171', // rojo
  '#c084fc', // lila
] as const

/** Un mercado listo para dibujar. */
export interface MercadoMapa {
  /** `marketId` del endpoint. */
  id: number
  nombre: string
  cityId: number
  /** Anillos en orden Leaflet ([lat, lng]): el primero es el contorno, los demás son huecos. */
  anillos: LatLngTuple[][]
  /** Centro APROXIMADO (promedio de los vértices del contorno) — dónde se apoya la etiqueta del nombre. */
  centro: LatLngTuple
  color: string
}

/** GeoJSON `[lng, lat]` → Leaflet `[lat, lng]`. La inversión ocurre SOLO acá. */
const aLatLng = ([lng, lat]: number[]): LatLngTuple => [lat, lng]

/**
 * Centro aproximado de un anillo: promedio de sus vértices.
 *
 * No es el centroide geométrico y no pretende serlo — para apoyar una etiqueta, el promedio de los
 * vértices de un polígono convexo cae dentro y alcanza. El centroide de verdad (fórmula del área con
 * signo) es más código y se rompe distinto con anillos autointersectados; acá no compra nada.
 */
function centroAproximado(anillo: LatLngTuple[]): LatLngTuple {
  // El último vértice repite al primero (GeoJSON cierra el anillo): entra al promedio una sola vez.
  const cerrado =
    anillo.length > 1 && anillo[0][0] === anillo[anillo.length - 1][0] && anillo[0][1] === anillo[anillo.length - 1][1]
  const vertices = cerrado ? anillo.slice(0, -1) : anillo
  if (vertices.length === 0) return [0, 0]
  const suma = vertices.reduce<[number, number]>((acc, [lat, lng]) => [acc[0] + lat, acc[1] + lng], [0, 0])
  return [suma[0] / vertices.length, suma[1] / vertices.length]
}

/**
 * Convierte la respuesta del endpoint en mercados dibujables. El color se asigna por POSICIÓN en la
 * lista y no por `marketId`: con el módulo del id, dos mercados de la misma ciudad cuyos ids difieran
 * en un múltiplo de la paleta salían del mismo color justo cuando importa distinguirlos.
 *
 * Los polígonos vacíos o mal formados (menos de 3 vértices) se descartan en silencio: un mercado sin
 * geometría no es un error de la pantalla, es un dato incompleto de Ventas.
 */
export function aMercadosMapa(data: MarketMapDto[]): MercadoMapa[] {
  const items: (MercadoMapa | null)[] = data.map((dto, i) => {
    const anillos = (dto.polygon?.coordinates ?? [])
      .filter((anillo) => anillo.length >= 3)
      .map((anillo) => anillo.map(aLatLng))
    if (anillos.length === 0) return null
    return {
      id: dto.marketId,
      nombre: dto.marketName,
      cityId: dto.cityId,
      anillos,
      centro: centroAproximado(anillos[0]),
      color: COLORES_MERCADO[i % COLORES_MERCADO.length],
    }
  })
  return items.filter((m): m is MercadoMapa => m !== null)
}

/** Todos los vértices de los mercados, para encuadrar el mapa sobre ellos. */
export function puntosDeMercados(mercados: MercadoMapa[]): LatLngTuple[] {
  return mercados.flatMap((m) => m.anillos.flat())
}
