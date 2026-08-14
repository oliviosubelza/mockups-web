// Modelo puro del planificador unificado (propuesta "quamain"): pedidos → paradas → rutas.
//
// POR QUÉ ESTE ARCHIVO EXISTE.
// La pantalla nueva une lo que hoy son dos pasos (elegir flota/pedidos y después planificar). Si esa
// unión se escribiera dentro del componente, el mapa terminaría siendo dueño de las reglas del plan y
// no habría forma de probarlas ni de moverlas. Acá NO hay React ni Leaflet: entran datos, salen datos.
//
// Todo lo de acá ya existía repartido entre `dispatch-plan-snapshot` (agrupar pedidos en paradas) y
// `PlanningView.optimizar` (repartir por capacidad). Se extrae en funciones puras para que las dos
// pantallas puedan converger después sin copiar y pegar la regla una tercera vez.
import { ordenarPorCercania } from '../map/geo/hilbert'
import { nearestOrder } from '../map/route-optimizer'
import { DEPOSITO, type Camion, type Parada, type Pedido } from '../mock-data'

/** Una ruta del plan = un camión seleccionado. El color es el del camión (ya evita la franja azul). */
export interface RutaPlan {
  id: string
  nombre: string
  color: string
  camion: Camion
}

/** Id de ruta derivado del camión. Mismo formato que usa PlanningView (`r-<camionId>`). */
export const rutaIdDeCamion = (camionId: string) => `r-${camionId}`

/**
 * Dónde cayó cada parada. Se guarda por id de parada y NO dentro de la parada porque las paradas se
 * REDERIVAN de los pedidos en cada cambio de filtro: si la asignación viviera adentro, cambiar un
 * filtro la borraría.
 */
export interface Asignacion {
  rutaId: string | null
  secuencia: number
}

export type Asignaciones = Record<string, Asignacion>

/**
 * Agrupa los pedidos por punto de entrega: varios pedidos del mismo punto son UNA parada (el camión
 * va una vez y descarga todo). Es la misma regla de `construirParadasScope`, pero sin repartir
 * camiones — acá el reparto es una acción explícita del usuario ("Optimizar"), no un efecto.
 */
export function construirParadas(pedidos: Pedido[]): Parada[] {
  const porPunto = new Map<string, Pedido[]>()
  for (const pedido of pedidos) {
    porPunto.set(pedido.puntoEntregaId, [...(porPunto.get(pedido.puntoEntregaId) ?? []), pedido])
  }

  return [...porPunto.entries()].map(([puntoEntregaId, delPunto], i) => {
    const primero = delPunto[0]
    return {
      id: `plan-${puntoEntregaId}`,
      puntoEntregaId,
      puntoEntrega: primero.puntoEntrega,
      cliente: primero.cliente,
      canal: primero.canal,
      pedidos: delPunto,
      pesoTotal: Number(delPunto.reduce((acc, p) => acc + p.peso, 0).toFixed(2)),
      volumenTotal: Number(delPunto.reduce((acc, p) => acc + p.volumen, 0).toFixed(1)),
      ventana: primero.ventana,
      secuencia: i + 1,
      camionId: null,
      camionForzadoId: null,
      lat: primero.lat,
      lng: primero.lng,
    }
  })
}

/** Una ruta por camión seleccionado, en el orden en que el usuario los fue eligiendo. */
export function construirRutas(camiones: Camion[]): RutaPlan[] {
  return camiones.map((camion, i) => ({
    id: rutaIdDeCamion(camion.id),
    nombre: `Ruta ${i + 1}`,
    color: camion.color,
    camion,
  }))
}

/**
 * Reparte las paradas entre las rutas POR PESO, a prorrata de la capacidad de cada camión.
 *
 * Verbatim de la regla de `PlanningView.optimizar`, y por la misma razón: partir la lista en N trozos
 * iguales de paradas ignora que las paradas no pesan lo mismo ni los camiones tienen la misma
 * capacidad — así un camión de 11 t terminaba con 80 t encima. Como `ratio ≤ 1`, el objetivo de cada
 * camión nunca supera su capacidad real.
 *
 * Recorrer la curva de Hilbert en orden mantiene la CONTIGÜIDAD geográfica de cada ruta; el orden
 * fino dentro del grupo lo decide después el vecino-más-cercano desde el depósito.
 */
export function optimizar(paradas: Parada[], rutas: RutaPlan[]): Asignaciones {
  const asignaciones: Asignaciones = {}
  if (paradas.length === 0 || rutas.length === 0) return asignaciones

  const depot: [number, number] = [DEPOSITO.lat, DEPOSITO.lng]
  const porCercania = ordenarPorCercania(paradas, (p) => [p.lat, p.lng])

  const libreKg = rutas.map((r) => (r.camion.capacidadPeso ?? 0) * 1000)
  const capacidadTotalKg = libreKg.reduce((acc, kg) => acc + kg, 0)
  const demandaKg = porCercania.reduce((acc, p) => acc + p.pesoTotal, 0)
  const ratio = capacidadTotalKg > 0 ? Math.min(1, demandaKg / capacidadTotalKg) : 1
  const objetivoKg = libreKg.map((kg) => kg * ratio)

  const grupos = new Map<string, Parada[]>()
  const sinAsignar: Parada[] = []
  let actual = 0

  for (const parada of porCercania) {
    // Primera ruta —desde la actual— donde la parada entra dentro de su objetivo; si ninguna tiene
    // lugar (resto de empaquetado), se reintenta contra la capacidad real.
    let idx = -1
    for (let k = 0; k < rutas.length; k++) {
      const i = (actual + k) % rutas.length
      if (objetivoKg[i] >= parada.pesoTotal) {
        idx = i
        break
      }
    }
    if (idx === -1) {
      for (let k = 0; k < rutas.length; k++) {
        const i = (actual + k) % rutas.length
        if (libreKg[i] >= parada.pesoTotal) {
          idx = i
          break
        }
      }
    }
    // No entra en ninguna: queda SIN ASIGNAR en vez de sobrecargar un camión. El HUD de cobertura ya
    // avisa el déficit; esconder la parada sería tapar el problema.
    if (idx === -1) {
      sinAsignar.push(parada)
      continue
    }

    libreKg[idx] -= parada.pesoTotal
    objetivoKg[idx] -= parada.pesoTotal
    actual = idx
    const rutaId = rutas[idx].id
    grupos.set(rutaId, [...(grupos.get(rutaId) ?? []), parada])
  }

  for (const [rutaId, stops] of grupos) {
    nearestOrder(depot, stops).forEach((parada, i) => {
      asignaciones[parada.id] = { rutaId, secuencia: i + 1 }
    })
  }
  for (const parada of sinAsignar) {
    asignaciones[parada.id] = { rutaId: null, secuencia: 0 }
  }

  return asignaciones
}

const distancia = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1])

const punto = (p: Parada): [number, number] => [p.lat, p.lng]

/**
 * Mete una parada en el recorrido existente, en la posición MÁS BARATA: la que menos kilómetros le
 * agrega al trazo. Es la heurística de inserción más económica, y su gracia acá es que NO toca el orden
 * de las que ya estaban — solo elige dónde meter la nueva.
 */
function insertarMasBarato(orden: Parada[], nueva: Parada): Parada[] {
  const depot: [number, number] = [DEPOSITO.lat, DEPOSITO.lng]
  if (orden.length === 0) return [nueva]

  let mejor = 0
  let mejorCosto = Infinity
  for (let i = 0; i <= orden.length; i++) {
    const antes = i === 0 ? depot : punto(orden[i - 1])
    const despues = i === orden.length ? depot : punto(orden[i])
    // Lo que CUESTA meterla acá: los dos tramos nuevos menos el tramo que se parte al medio.
    const costo = distancia(antes, punto(nueva)) + distancia(punto(nueva), despues) - distancia(antes, despues)
    if (costo < mejorCosto) {
      mejorCosto = costo
      mejor = i
    }
  }
  return [...orden.slice(0, mejor), nueva, ...orden.slice(mejor)]
}

/**
 * Recompone la secuencia de las rutas tocadas después de mover paradas.
 *
 * NO RECALCULA TODO. Antes rehacía cada ruta entera con vecino-más-cercano, y eso tenía un problema que
 * apareció recién con el reordenamiento manual: mover UNA parada a una ruta borraba el orden que
 * alguien había armado a mano en esa ruta. Trabajo del usuario destruido por un efecto colateral.
 *
 * Ahora respeta lo que ya estaba: las paradas con secuencia conservan su orden relativo, y las que
 * llegan (secuencia 0, recién movidas) se insertan en su posición más barata. El resultado es el mismo
 * de antes cuando nadie tocó nada a mano, y preserva la decisión del usuario cuando sí la tocó.
 *
 * `Reoptimizar` sigue rehaciendo todo desde cero — ahí SÍ se pidió explícitamente.
 */
export function resecuenciar(
  paradas: Parada[],
  asignaciones: Asignaciones,
  rutaIds: string[],
): Asignaciones {
  const next = { ...asignaciones }

  for (const rutaId of rutaIds) {
    const stops = paradas.filter((p) => next[p.id]?.rutaId === rutaId)
    const yaOrdenadas = stops
      .filter((p) => (next[p.id]?.secuencia ?? 0) > 0)
      .sort((a, b) => (next[a.id]?.secuencia ?? 0) - (next[b.id]?.secuencia ?? 0))
    const recienLlegadas = stops.filter((p) => (next[p.id]?.secuencia ?? 0) === 0)

    let orden = yaOrdenadas
    for (const parada of recienLlegadas) orden = insertarMasBarato(orden, parada)

    orden.forEach((parada, i) => {
      next[parada.id] = { rutaId, secuencia: i + 1 }
    })
  }

  return next
}

/**
 * Fija el orden de visita de una ruta a mano (arrastrando filas en el panel de Rutas).
 *
 * Existe porque el optimizador no sabe todo: que a un cliente hay que llegarle antes de las 10, que
 * otro no recibe hasta que abre, que conviene dejar el más pesado para el final. Eso lo sabe quien
 * planifica, y hasta ahora no tenía dónde decirlo.
 */
export function reordenarRuta(
  asignaciones: Asignaciones,
  rutaId: string,
  ordenIds: string[],
): Asignaciones {
  const next = { ...asignaciones }
  ordenIds.forEach((id, i) => {
    next[id] = { rutaId, secuencia: i + 1 }
  })
  return next
}

/**
 * Proyecta las asignaciones sobre las paradas. El mapa y los paneles consumen SIEMPRE esta salida, no
 * las paradas crudas: así el pin, el trazo y la lista no pueden discrepar sobre a quién le tocó qué.
 */
export function aplicarAsignaciones(
  paradas: Parada[],
  asignaciones: Asignaciones,
  rutas: RutaPlan[],
): Parada[] {
  const camionDeRuta = new Map(rutas.map((r) => [r.id, r.camion.id]))

  return paradas.map((parada) => {
    const asignada = asignaciones[parada.id]
    const rutaId = asignada?.rutaId ?? null
    // Una asignación a una ruta que ya no existe (el usuario deseleccionó el camión) vuelve a "sin
    // asignar" en vez de dejar la parada apuntando a una ruta fantasma.
    const camionId = rutaId ? (camionDeRuta.get(rutaId) ?? null) : null
    const vigente = camionId !== null
    return {
      ...parada,
      rutaId: vigente ? rutaId : null,
      camionId,
      secuencia: vigente ? asignada.secuencia : 0,
      pedidos: parada.pedidos.map((pedido) => ({
        ...pedido,
        rutaId: vigente ? rutaId : null,
        camionId,
        secuencia: vigente ? asignada.secuencia : undefined,
      })),
    }
  })
}

export interface CargaRuta {
  paradas: Parada[]
  pedidos: number
  pesoKg: number
  volumenM3: number
  /** Ocupación = la restricción que se agote primero (peso o volumen), como en `CapacityBar`. */
  ocupacionPct: number
}

/** Lo que lleva encima una ruta con la asignación actual. */
export function cargaDeRuta(paradasAsignadas: Parada[], ruta: RutaPlan): CargaRuta {
  const propias = paradasAsignadas
    .filter((p) => p.rutaId === ruta.id)
    .sort((a, b) => a.secuencia - b.secuencia)
  const pesoKg = Number(propias.reduce((acc, p) => acc + p.pesoTotal, 0).toFixed(1))
  const volumenM3 = Number(propias.reduce((acc, p) => acc + p.volumenTotal, 0).toFixed(1))
  const capacidadKg = (ruta.camion.capacidadPeso ?? 0) * 1000
  const capacidadM3 = ruta.camion.capacidadVolumen ?? 0
  const pctPeso = capacidadKg > 0 ? (pesoKg / capacidadKg) * 100 : 0
  const pctVolumen = capacidadM3 > 0 ? (volumenM3 / capacidadM3) * 100 : 0

  return {
    paradas: propias,
    pedidos: propias.reduce((acc, p) => acc + p.pedidos.length, 0),
    pesoKg,
    volumenM3,
    ocupacionPct: Math.round(Math.max(pctPeso, pctVolumen)),
  }
}

/**
 * Ancho mínimo y máximo del marcador (gota), en px.
 *
 * Chicos a propósito: con 59 paradas sobre una ciudad, marcadores de 40 px se tocan entre sí y el mapa
 * se convierte en una mancha. 16 px es el piso donde una gota todavía se distingue de otra a zoom de
 * barrio, y 28 px alcanza para que la diferencia de tamaño se lea sin que el más grande tape a sus
 * vecinos. El número de secuencia solo entra a partir de 22 px (ver `pinParada`).
 */
const PIN_MIN_PX = 16
const PIN_MAX_PX = 28

/** Proporción alto/ancho de la gota. Sale del viewBox del path (26 × 34). */
export const PIN_RATIO = 34 / 26

/**
 * Ancho del marcador según el peso de la parada.
 *
 * La raíz cuadrada NO es un detalle: hace que el ÁREA del marcador —no su ancho— sea proporcional al
 * peso. Escalando el ancho en forma lineal, una parada del doble de peso se dibuja con el CUÁDRUPLE de
 * superficie y el mapa exagera groseramente las diferencias. Es la misma regla de cualquier mapa de
 * burbujas serio.
 *
 * La escala se calcula contra el rango del conjunto VISIBLE y no contra un máximo absoluto: lo que
 * importa es distinguir las paradas entre sí en el plan que se está mirando.
 */
export function anchoPin(peso: number, minPeso: number, maxPeso: number): number {
  if (maxPeso <= minPeso) return Math.round((PIN_MIN_PX + PIN_MAX_PX) / 2)
  const t = Math.sqrt(Math.min(1, Math.max(0, (peso - minPeso) / (maxPeso - minPeso))))
  return Math.round(PIN_MIN_PX + t * (PIN_MAX_PX - PIN_MIN_PX))
}

/** Rango de peso del conjunto, para alimentar `diametroPin`. */
export function rangoPeso(paradas: Parada[]): { min: number; max: number } {
  if (paradas.length === 0) return { min: 0, max: 0 }
  let min = Infinity
  let max = -Infinity
  for (const parada of paradas) {
    if (parada.pesoTotal < min) min = parada.pesoTotal
    if (parada.pesoTotal > max) max = parada.pesoTotal
  }
  return { min, max }
}

/** Trazo de una ruta: depósito → paradas en secuencia → depósito. Sin marcadores extra. */
export function trazoDeRuta(paradasDeRuta: Parada[]): [number, number][] {
  if (paradasDeRuta.length === 0) return []
  const depot: [number, number] = [DEPOSITO.lat, DEPOSITO.lng]
  return [depot, ...paradasDeRuta.map((p) => [p.lat, p.lng] as [number, number]), depot]
}
