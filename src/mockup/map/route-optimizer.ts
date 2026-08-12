// "Optimizador" de rutas del mockup — SIN API. Genera un trazado creíble por ruta conectando sus
// paradas reales: parte del depósito y va al vecino más cercano (heurística nearest-neighbor), así
// el recorrido se ve ordenado/óptimo (sin cruces locos) y termina volviendo al depósito. No calcula
// calles reales; son segmentos rectos entre puntos, suficiente para "verse como si funcionara".
import { DEPOSITO, RUTAS, type Parada } from '../mock-data'
import type { LatLngTuple } from './geo/polyline'
import type { OverlayMarker, OverlayPolyline } from './overlay-store'

const dist = (a: LatLngTuple, b: LatLngTuple) => Math.hypot(a[0] - b[0], a[1] - b[1])

/**
 * Ordena las paradas por vecino más cercano arrancando desde `start`.
 * Exportada porque el monitoreo necesita EL MISMO orden de visita que se dibujó al planificar:
 * si cada pantalla reordenara por su cuenta, la secuencia del panel no coincidiría con el trazo.
 */
export function nearestOrder(start: LatLngTuple, stops: Parada[]): Parada[] {
  const rest = [...stops]
  const order: Parada[] = []
  let cur = start
  while (rest.length > 0) {
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < rest.length; i++) {
      const d = dist(cur, [rest[i].lat, rest[i].lng])
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    const [next] = rest.splice(best, 1)
    order.push(next)
    cur = [next.lat, next.lng]
  }
  return order
}

/**
 * Arma el overlay (una polilínea por ruta + marcadores de secuencia) a partir de las paradas y su
 * asignación de ruta actual. Depósito → paradas en orden vecino-más-cercano → depósito.
 */
export function buildRouteOverlay(
  paradas: Parada[],
  rutaIdOf: (paradaId: string) => string | undefined,
  rutas?: { id: string; color: string }[],
): { polylines: OverlayPolyline[]; markers: OverlayMarker[] } {
  const listRutas = rutas || RUTAS
  const depot: LatLngTuple = [DEPOSITO.lat, DEPOSITO.lng]

  const byRuta = new Map<string, Parada[]>()
  for (const p of paradas) {
    const rid = rutaIdOf(p.id)
    if (!rid) continue
    const arr = byRuta.get(rid) ?? []
    arr.push(p)
    byRuta.set(rid, arr)
  }

  const polylines: OverlayPolyline[] = []
  const markers: OverlayMarker[] = []
  for (const [rid, stops] of byRuta) {
    const ruta = listRutas.find((r) => r.id === rid)
    if (!ruta) continue
    const hasSeq = stops.some((s) => s.secuencia !== undefined && s.secuencia !== null)
    const ordered = hasSeq
      ? [...stops].sort((a, b) => (a.secuencia ?? 0) - (b.secuencia ?? 0))
      : nearestOrder(depot, stops)

    // Ruta cerrada: origen (depósito) -> paradas en secuencia -> fin (depósito)
    const path: LatLngTuple[] = [depot, ...ordered.map((s) => [s.lat, s.lng] as LatLngTuple), depot]
    polylines.push({ id: `route-${rid}`, path, color: ruta.color })
    // Badge con el orden de visita de cada parada (secuencia 1..N).
    ordered.forEach((s, i) => {
      const seqNum = s.secuencia ?? (i + 1)
      markers.push({ id: `seq-${rid}-${s.id}`, position: [s.lat, s.lng], color: ruta.color, label: `#${seqNum} · ${s.cliente}` })
    })
  }
  return { polylines, markers }
}

/**
 * Overlay de UNA sola ruta por TODAS las paradas dadas (unificación): depósito → paradas en orden
 * vecino-más-cercano → depósito, en un único trazo del color del camión. Es el caso "unifiqué varias
 * órdenes en un camión": ya no hay 4 rutas, hay 1 con todos sus puntos de entrega.
 */
export function buildSingleRouteOverlay(
  paradas: Parada[],
  color: string,
): { polylines: OverlayPolyline[]; markers: OverlayMarker[] } {
  const depot: LatLngTuple = [DEPOSITO.lat, DEPOSITO.lng]
  const hasSeq = paradas.some((s) => s.secuencia !== undefined && s.secuencia !== null)
  const ordered = hasSeq
    ? [...paradas].sort((a, b) => (a.secuencia ?? 0) - (b.secuencia ?? 0))
    : nearestOrder(depot, paradas)
  const path: LatLngTuple[] = [depot, ...ordered.map((s) => [s.lat, s.lng] as LatLngTuple), depot]
  return {
    polylines: [{ id: 'route-unified', path, color }],
    markers: ordered.map((s, i) => ({
      id: `seq-unified-${s.id}`,
      position: [s.lat, s.lng],
      color,
      label: `#${s.secuencia ?? (i + 1)} · ${s.cliente}`,
    })),
  }
}
