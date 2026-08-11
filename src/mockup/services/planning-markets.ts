// Servicio SIMULADO del mapa de mercados.
//
//   GET /planning/markets/map?cityId={cityId}
//
// Es el único módulo del feature que habla "protocolo": declara el contrato de la respuesta (envelope
// `{ data: [...] }`, polígonos GeoJSON con coordenadas en orden [lng, lat]) y devuelve exactamente eso.
// Ni traduce a Leaflet ni sabe dibujar — de eso se encargan `map/mercados/mercado-mapa.ts` (adaptador)
// y `map/mercados/MercadosLayer.tsx` (dibujo). La separación es a propósito: es la que permite cambiar
// el mock por el backend real tocando UN solo archivo.
//
// PARA CONECTAR EL ENDPOINT REAL: reemplazar el cuerpo de `fetchMercadosMapa` por la llamada que está
// comentada abajo y borrar el import de `mock-mercados`. La firma y los tipos no cambian, así que
// ninguna pantalla ni componente se toca.
import { mercadosDeCity } from '../mock-mercados'

/** Path del endpoint. Vive acá para que el mock y la llamada real no puedan discrepar. */
export const MARKETS_MAP_PATH = '/planning/markets/map'

/**
 * Polígono GeoJSON tal como lo manda el backend: `coordinates[anillo][vértice] = [lng, lat]`.
 *
 * El orden **lng, lat** es el del estándar GeoJSON y el INVERSO al de Leaflet. Es el error clásico de
 * este feature (los polígonos aparecen en el océano Índico), y por eso el tipo lo dice acá: la
 * inversión se hace una sola vez, en el adaptador.
 */
export interface GeoJsonPolygon {
  type: 'Polygon'
  coordinates: number[][][]
}

/** Un mercado del mapa, en el formato del endpoint (nombres en inglés, ids numéricos). */
export interface MarketMapDto {
  marketId: number
  marketName: string
  cityId: number
  polygon: GeoJsonPolygon
}

export interface MarketMapResponse {
  data: MarketMapDto[]
}

/** Latencia simulada: suficiente para que el indicador de "Cargando" se vea de verdad. */
const LATENCIA_MS = 450

const errorAbortado = () => new DOMException('Petición cancelada', 'AbortError')

function esperar(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(errorAbortado())
    const timer = setTimeout(resolve, ms)
    // No hace falta desuscribirse: rechazar una promesa ya resuelta es un no-op.
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(errorAbortado())
      },
      { once: true },
    )
  })
}

/**
 * Mercados con polígono de una ciudad. `signal` permite cancelar (lo usa el hook al desmontar o al
 * cambiar de ciudad), igual que lo haría la llamada real.
 */
export async function fetchMercadosMapa(cityId: number, signal?: AbortSignal): Promise<MarketMapResponse> {
  await esperar(LATENCIA_MS, signal)
  return { data: mercadosDeCity(cityId) }

  // ── Endpoint real ────────────────────────────────────────────────────────────────────────────
  // const { data } = await axios.get<MarketMapResponse>(MARKETS_MAP_PATH, {
  //   params: { cityId },
  //   signal,
  // })
  // return data
}
