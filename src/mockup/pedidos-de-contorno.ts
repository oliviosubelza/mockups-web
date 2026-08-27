// PEDIDOS GENERADOS DENTRO DE UNA ZONA DE DISTRIBUCIÓN.
//
// ═══ QUÉ PROBLEMA RESUELVE ═══
//
// `PEDIDOS` (mock-data) es una constante que se arma al importar el módulo, con coordenadas sacadas de
// un pool de calles reales de Santa Cruz. Eso deja dos huecos que se ven apenas se usa la pantalla de
// zonas de distribución:
//
//   1. TODOS los pedidos son de Santa Cruz. El generador tiene `const ciudad: CiudadId = 'santacruz'`
//      escrito, así que Montero, Warnes y Cotoca aparecen en los filtros y no traen nada.
//   2. Un contorno dibujado HOY no puede tener pedidos adentro, porque el dataset se construyó antes
//      de que ese polígono existiera. Se dibuja una zona, se la elige en el planificador, y el mapa
//      queda vacío — que es exactamente lo contrario de lo que la zona vino a demostrar.
//
// Acá se generan pedidos DENTRO de cada contorno vivo, y con eso las dos cosas se arreglan de una:
// el contorno tiene carga, y la ciudad de la zona (la de su distribuidora) queda poblada.
//
// ═══ DETERMINISTA, O EL MAPA TIEMBLA ═══
//
// La semilla sale del contorno mismo: id de la distribuidora + un hash de sus vértices. Con eso, el
// mismo polígono da SIEMPRE los mismos pedidos —al recargar, al cambiar de pantalla y al volver— y
// mover un vértice los regenera, que es lo correcto: el territorio cambió.
//
// Y el resultado se CACHEA por esa misma clave. Sin caché esto se recalcularía en cada lectura del
// store (`selectScopedOrders` corre en cada render que toca filtros), generando cientos de pedidos por
// cuadro y devolviendo arrays nuevos que a Zustand le parecen estado cambiante.
//
// ═══ CUÁNTOS, Y CUÁNDO NINGUNO ═══
//
// Solo se genera el FALTANTE para llegar a 10, más uno cada 4 km² de superficie, con techo de 40. Un
// contorno que ya tiene diez pedidos reales adentro no recibe ninguno.
//
// Eso último es lo que lo volvió casi inerte, y está bien que así sea: desde que cada distribuidora
// arranca con su contorno sembrado sobre sus propios pedidos, los diez centros del maestro tienen ~66
// adentro. Este módulo quedó para el caso que sigue existiendo —alguien dibuja un contorno nuevo sobre
// una zona que no tiene nada— y para ese caso sigue haciendo exactamente lo que hacía.
import { createRand } from './mock-random'
import {
  CANAL_IDS,
  VENDEDORES,
  ZONA_IDS,
  ciudadDeCityId,
  crearPedidoEn,
  type Pedido,
} from './mock-data'
import { NOMBRES_COMERCIALES } from './mock-pools'
import { areaKm2 } from './map/geo/medidas'
import { puntoEnAnillo } from './map/geo/solapamiento'
import type { LatLngTuple } from './map/geo/polyline'

/** Un contorno vivo, con lo que hace falta para poblarlo. */
export interface ContornoPoblable {
  distributorId: number
  cityId: number
  puntos: LatLngTuple[]
  /**
   * Pedidos REALES que ya caen dentro de este contorno.
   *
   * Es lo que decide cuántos hay que inventar: desde que cada distribuidora tiene contorno sembrado
   * sobre sus propios pedidos (`zonas-distribucion-seed.ts`), casi todos vienen con 66 adentro y no
   * necesitan ninguno. Sin este dato el generador les sumaba 10-40 sintéticos encima, duplicando la
   * carga de un territorio que ya estaba poblado.
   */
  pedidosReales: number
}

const MINIMO = 10
const KM2_POR_PEDIDO = 4
const TECHO = 40

/** Hash barato y estable de los vértices. Dos contornos distintos no comparten semilla. */
function semillaDe(contorno: ContornoPoblable): number {
  let h = contorno.distributorId * 2654435761
  for (const [lat, lng] of contorno.puntos) {
    h = (h ^ Math.round(lat * 1e5)) >>> 0
    h = Math.imul(h, 16777619) >>> 0
    h = (h ^ Math.round(lng * 1e5)) >>> 0
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

function bbox(puntos: LatLngTuple[]) {
  let latMin = Infinity
  let latMax = -Infinity
  let lngMin = Infinity
  let lngMax = -Infinity
  for (const [lat, lng] of puntos) {
    if (lat < latMin) latMin = lat
    if (lat > latMax) latMax = lat
    if (lng < lngMin) lngMin = lng
    if (lng > lngMax) lngMax = lng
  }
  return { latMin, latMax, lngMin, lngMax }
}

/**
 * Genera los pedidos de UN contorno.
 *
 * MUESTREO POR RECHAZO sobre la caja del polígono: se sortea un punto en la caja y se descarta si cae
 * afuera. Es lo más simple que da una distribución pareja DENTRO de la forma real —triangular el
 * polígono daría lo mismo con diez veces más código—. El tope de intentos existe porque un contorno
 * muy dentado puede ocupar poco de su propia caja: preferimos devolver menos pedidos que colgar el
 * render.
 */
function generarPara(contorno: ContornoPoblable): Pedido[] {
  const { puntos, distributorId } = contorno
  if (puntos.length < 3) return []

  const ciudad = ciudadDeCityId(contorno.cityId)
  if (!ciudad) return []

  // Solo el FALTANTE. Un contorno que ya tiene su cuota no genera nada.
  const faltante = MINIMO - contorno.pedidosReales
  if (faltante <= 0) return []

  const rand = createRand(semillaDe(contorno))
  // CANAL POR CICLO Y NO POR SORTEO: con `pick` puro, diez pedidos podían caer seis en un canal y
  // ninguno en otro, y el planificador arranca SIN canales elegidos —así que elegir el equivocado
  // dejaba la zona recién dibujada en cero y parecía que el contorno no había hecho nada—. El cycler
  // recorre los cinco antes de repetir, así que cualquier canal que se elija encuentra pedidos.
  const canalDe = rand.cycler(CANAL_IDS)
  // El piso es el faltante; la superficie solo puede subirlo. Un contorno vacío y grande recibe más.
  const cuantos = Math.min(TECHO, faltante + Math.floor(areaKm2(puntos) / KM2_POR_PEDIDO))
  const { latMin, latMax, lngMin, lngMax } = bbox(puntos)

  const out: Pedido[] = []
  let intentos = 0
  const maxIntentos = cuantos * 60

  while (out.length < cuantos && intentos < maxIntentos) {
    intentos++
    const lat = latMin + rand.next() * (latMax - latMin)
    const lng = lngMin + rand.next() * (lngMax - lngMin)
    if (puntoEnAnillo([lat, lng], puntos) === 'fuera') continue

    const n = out.length + 1
    // Ids con prefijo propio: no pueden chocar con los `p1…pN` del dataset base ni entre contornos.
    const id = `zc${distributorId}-${n}`
    out.push(
      crearPedidoEn({
        id,
        salesOrder: `9${distributorId}${String(n).padStart(3, '0')}`,
        puntoEntregaId: `DPZ-${distributorId}-${n}`,
        canal: canalDe(),
        ciudad,
        // El dueño es el del contorno: por eso están acá adentro.
        distribuidoraId: distributorId,
        // La zona LOGÍSTICA es otra partición del mapa y este contorno no la conoce. Se sortea para
        // que el filtro de zona logística siga teniendo algo que filtrar, y se deja anotado que es
        // una etiqueta y no una derivación geométrica.
        zona: rand.pick(ZONA_IDS),
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        cliente: `${rand.pick(NOMBRES_COMERCIALES)} ${rand.int(100, 999)}`,
        vendedor: rand.pick(VENDEDORES),
        rand,
      }),
    )
  }
  return out
}

/** Caché por clave de contorno. Ver el encabezado: sin esto se regenera en cada render. */
const cache = new Map<string, Pedido[]>()

const claveDe = (c: ContornoPoblable) =>
  `${c.distributorId}:${c.cityId}:${c.pedidosReales}:${semillaDe(c)}`

/**
 * Los pedidos de TODOS los contornos vivos, cacheados.
 *
 * El array devuelto se arma de nuevo en cada llamada pero sus elementos vienen del caché, así que es
 * barato. Quien necesite identidad estable (un `useMemo`, un selector de Zustand con `useShallow`) que
 * lo memoice de su lado con la lista de contornos como dependencia.
 */
export function pedidosDeContornos(contornos: ContornoPoblable[]): Pedido[] {
  const out: Pedido[] = []
  const vivas = new Set<string>()
  for (const c of contornos) {
    const clave = claveDe(c)
    vivas.add(clave)
    let pedidos = cache.get(clave)
    if (!pedidos) {
      pedidos = generarPara(c)
      cache.set(clave, pedidos)
    }
    out.push(...pedidos)
  }
  // Se descartan las entradas de contornos que ya no existen (borrados o con la geometría cambiada):
  // sin esto el caché crece con cada arrastre de vértice durante una sesión de dibujo.
  for (const clave of cache.keys()) {
    if (!vivas.has(clave)) cache.delete(clave)
  }
  return out
}
