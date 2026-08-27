// Plan de despacho en construcción (fase 0 del wizard): guarda SOLO ids fuente de verdad
// (camiones seleccionados, canales activos, pedidos fuera de corte seleccionados a mano), en
// memoria por sesión de navegador (sin localStorage — se resetea al refrescar la página). Todos
// los totales/cobertura se derivan con selectores puros contra CAMIONES/PEDIDOS al leer, nunca se
// duplica estado calculado que pueda desincronizarse. Al vivir en un store de Zustand (fuera del
// árbol de React) la selección sobrevive a que DispatchFlow desmonte la vista al cambiar de fase.
import { create } from 'zustand'
import { kgToTons } from './unit-conversion'
import {
  CAMIONES,
  CANAL_IDS,
  CANAL_META,
  DEVOLUCIONES,
  PEDIDOS,
  TRANSFERENCIAS,
  aMinutos,
  ciudadDe,
  distribuidoraIdDe,
  distribuidoraIdDeCamion,
  finVentana,
  mercadoDe,
  pedidoEsSeleccionable,
  zonaDe,
  type Camion,
  type CanalId,
  type CiudadId,
  type MercadoId,
  type Pedido,
  type ZonaId,
} from './mock-data'
import { useDistribucionStore, puntosDeZona } from './distribucion/distribucion-store'
import { puntoEnAnillo } from './map/geo/solapamiento'

// ── Corte de hora (dentro/fuera) ──
// Los pedidos cuya ventana TERMINA a más tardar a la hora de corte de su canal están DENTRO del
// corte; los que cierran después, fuera.
//
// EL CORTE CLASIFICA, YA NO EXCLUYE. Antes fuera de corte significaba "no entra salvo que alguien lo
// tilde", y el resultado práctico era que todos los días había que ir a tildarlos: nadie deja pedidos
// afuera porque cierran tarde, se sale igual y se acomoda el recorrido. Una regla que en la práctica
// siempre se desactiva a mano no es una regla, es un trámite. Ahora entran todos por defecto y el
// corte queda como lo que de verdad es: una ADVERTENCIA de que ese pedido cierra tarde, con su lista
// aparte para poder sacarlo si ese día no da.
//
// `aMinutos` y `finVentana` se movieron a mock-data porque la GENERACIÓN del dataset los necesita
// (garantizar pedidos dentro Y fuera del corte en cada canal). Se re-exportan acá para no cambiarle
// el import a nadie: al revés habría ciclo, porque este store importa mock-data.
export { aMinutos, finVentana }

export const dentroDelCorte = (p: Pedido, corte: string) =>
  aMinutos(finVentana(p.ventana)) <= aMinutos(corte)

/** Regla base del canal: si cierra antes del corte, entra por horario. */
export const entraPorCorte = (p: Pedido) => dentroDelCorte(p, CANAL_META[p.canal].timeOff)

/**
 * ¿El pedido entra al plan POR DEFECTO? (o sea, sin que el usuario haya decidido nada todavía).
 *
 * Lo único que lo deja afuera es no ser seleccionable —bonificación sin stock confirmado—, porque eso
 * NO es una decisión de Logística: lo destraba Ventas. La hora de corte ya no interviene acá; ver la
 * nota de arriba.
 */
export const incluidoPorDefecto = (p: Pedido) => pedidoEsSeleccionable(p)

/**
 * ¿El pedido entra al plan? Gana la decisión EXPLÍCITA del usuario si existe; si no, la regla de
 * corte. Un único predicado para todas las superficies (resumen, tabla de fuera de corte, diálogo
 * por canal), así no puede haber dos definiciones de "incluido" que se contradigan.
 */
export const estaIncluido = (p: Pedido, overrides: OrderOverrides): boolean => {
  if (!pedidoEsSeleccionable(p)) return false
  return overrides[p.id] ?? incluidoPorDefecto(p)
}

/**
 * Decisiones MANUALES del usuario, por id de pedido: `true` = lo mete al plan, `false` = lo saca.
 * Solo se guardan las DESVIACIONES del default — si el usuario vuelve a la decisión que ya tomaba
 * la regla de corte, la entrada se borra. Así "sin overrides" siempre significa "todo por defecto".
 */
export type OrderOverrides = Record<string, boolean>

interface DispatchPlanState {
  selectedTruckIds: string[]
  activeDistribuidoraId: number | null
  activeCanales: CanalId[]
  // Filtros de NARROWING (Ciudad/Distribuidora/Mercado/Zona/Vendedor): a diferencia del canal (obligatorio), si un
  // array queda vacío no filtra — pasan todos los pedidos en esa dimensión. Ciudad es el más amplio.
  activeCiudades: CiudadId[]
  activeDistribuidoras: string[]
  activeMercados: MercadoId[]
  activeZonas: ZonaId[]
  activeVendedores: string[]
  orderOverrides: OrderOverrides
  /**
   * Traslados y devoluciones elegidos en el sub-paso de movimientos.
   *
   * VIVEN ACÁ Y NO EN EL PANEL a propósito. Antes eran un `useState` del componente: se perdían al
   * cambiar de fase, no había forma de saber desde ninguna otra pantalla qué se había elegido, y el
   * propio panel afirmaba "lo seleccionado es lo que se suma a la planificación" cuando en realidad no
   * salía de ese archivo. Con la selección acá, al menos existe una fuente de verdad para consultarla.
   */
  selectedTransferIds: string[]
  /** Devoluciones de los DOS movimientos (entrega y recojo): son subconjuntos disjuntos de DEVOLUCIONES. */
  selectedDevolucionIds: string[]
  setActiveDistribuidoraId: (id: number | null) => void
  toggleTruck: (id: string) => void
  setSelectedTrucks: (ids: string[]) => void
  /**
   * Aplica de UNA vez la selección de filtros (todas las dimensiones). El panel arma un "draft"
   * local mientras el usuario tilda opciones y recién commitea acá al presionar "Buscar", así en la
   * app real habría un solo fetch en vez de uno por cada toggle.
   */
  applySelection: (sel: {
    canales: CanalId[]
    ciudades: CiudadId[]
    distribuidoras?: string[]
    mercados: MercadoId[]
    zonas: ZonaId[]
    vendedores: string[]
  }) => void
  /**
   * Registra la decisión de una tabla con selección: `scopeIds` son TODOS los pedidos que esa tabla
   * mostraba e `includedIds` los que quedaron tildados. Lo de afuera del scope no se toca — así el
   * diálogo de un canal no pisa las decisiones de otro canal.
   */
  setOrdersIncluded: (scopeIds: string[], includedIds: string[]) => void
  /** Vuelve todos los pedidos a la regla de corte (borra las decisiones manuales). */
  resetOrderOverrides: () => void
  /**
   * Registra la selección de UN movimiento. `scopeIds` son todas las filas que ese movimiento mostraba
   * e `includedIds` las que quedaron tildadas. Lo de afuera del scope no se toca — mismo criterio que
   * `setOrdersIncluded`: así elegir recojos no puede pisar lo elegido en devoluciones de entrega.
   */
  setMovimientoSeleccion: (
    tipo: 'transferencia' | 'devolucion',
    scopeIds: string[],
    includedIds: string[],
  ) => void
  reset: () => void
}

const INITIAL_STATE = {
  selectedTruckIds: [] as string[],
  activeDistribuidoraId: 501 as number | null,
  activeCanales: CANAL_IDS as CanalId[],
  activeCiudades: [] as CiudadId[],
  activeDistribuidoras: [] as string[],
  activeMercados: [] as MercadoId[],
  activeZonas: [] as ZonaId[],
  activeVendedores: [] as string[],
  orderOverrides: {} as OrderOverrides,
  selectedTransferIds: [] as string[],
  selectedDevolucionIds: [] as string[],
}

function arrayEquals<T>(a: T[], b: T[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

export const useDispatchPlanStore = create<DispatchPlanState>((set) => ({
  ...INITIAL_STATE,

  setActiveDistribuidoraId: (id) =>
    set((state) => {
      if (state.activeDistribuidoraId === id) return state
      return { activeDistribuidoraId: id }
    }),

  toggleTruck: (id) =>
    set((state) => ({
      selectedTruckIds: state.selectedTruckIds.includes(id)
        ? state.selectedTruckIds.filter((t) => t !== id)
        : [...state.selectedTruckIds, id],
    })),

  setSelectedTrucks: (ids) =>
    set((state) => {
      if (arrayEquals(state.selectedTruckIds, ids)) return state
      return { selectedTruckIds: ids }
    }),

  applySelection: (sel) =>
    set((state) => {
      const dists = sel.distribuidoras ?? state.activeDistribuidoras
      if (
        arrayEquals(state.activeCanales, sel.canales) &&
        arrayEquals(state.activeCiudades, sel.ciudades) &&
        arrayEquals(state.activeDistribuidoras, dists) &&
        arrayEquals(state.activeMercados, sel.mercados) &&
        arrayEquals(state.activeZonas, sel.zonas) &&
        arrayEquals(state.activeVendedores, sel.vendedores)
      ) {
        return state
      }
      return {
        activeCanales: sel.canales,
        activeCiudades: sel.ciudades,
        activeDistribuidoras: dists,
        activeMercados: sel.mercados,
        activeZonas: sel.zonas,
        activeVendedores: sel.vendedores,
      }
    }),

  setOrdersIncluded: (scopeIds, includedIds) =>
    set((state) => {
      const incluidos = new Set(includedIds)
      const next = { ...state.orderOverrides }
      let changed = false
      for (const id of scopeIds) {
        const pedido = PEDIDOS.find((p) => p.id === id)
        if (!pedido) continue
        // Si una bonificación quedó sin stock, el pedido no puede entrar al plan por ninguna vía.
        if (!pedidoEsSeleccionable(pedido)) {
          if (id in next) {
            delete next[id]
            changed = true
          }
          continue
        }
        // Solo se persiste la desviación: si la decisión del usuario coincide con lo que ya hacía la
        // regla de corte, se borra el override en vez de guardar una redundancia.
        const shouldDelete = incluidos.has(id) === incluidoPorDefecto(pedido)
        if (shouldDelete) {
          if (id in next) {
            delete next[id]
            changed = true
          }
          continue
        }

        const nextValue = incluidos.has(id)
        if (next[id] !== nextValue) {
          next[id] = nextValue
          changed = true
        }
      }
      return changed ? { orderOverrides: next } : state
    }),

  resetOrderOverrides: () => set({ orderOverrides: {} }),

  setMovimientoSeleccion: (tipo, scopeIds, includedIds) =>
    set((state) => {
      const actual =
        tipo === 'transferencia' ? state.selectedTransferIds : state.selectedDevolucionIds
      const enScope = new Set(scopeIds)
      // Se conserva lo elegido FUERA del scope y se reemplaza solo lo de adentro: el movimiento activo
      // no puede borrar las decisiones de los otros dos.
      const siguiente = [...actual.filter((id) => !enScope.has(id)), ...includedIds]
      // Comparación por CONJUNTO y no por orden: `siguiente` se rearma poniendo primero lo de afuera
      // del scope, así que un `arrayEquals` posicional marcaría cambio en cada aviso de la tabla y
      // dispararía un re-render infinito.
      if (siguiente.length === actual.length && actual.every((id) => siguiente.includes(id))) {
        return state
      }
      return tipo === 'transferencia'
        ? { selectedTransferIds: siguiente }
        : { selectedDevolucionIds: siguiente }
    }),

  reset: () => set({ ...INITIAL_STATE }),
}))

// ── Selectores puros ─────────────────────────────────────────────────────────────────────────
// Reciben el estado del store y derivan contra CAMIONES/PEDIDOS al momento de leer — nada de lo
// que devuelven se guarda en el store, así nunca puede desincronizarse del dataset.

export const selectAvailableTrucks = (s: DispatchPlanState): Camion[] =>
  CAMIONES.filter(
    (c) =>
      c.estado === 'disponible' &&
      (s.activeDistribuidoraId === null || distribuidoraIdDeCamion(c) === s.activeDistribuidoraId),
  )

export const selectSelectedTrucks = (s: DispatchPlanState): Camion[] =>
  CAMIONES.filter(
    (c) =>
      s.selectedTruckIds.includes(c.id) &&
      (s.activeDistribuidoraId === null || distribuidoraIdDeCamion(c) === s.activeDistribuidoraId),
  )

export interface CapacityTotals {
  pesoTon: number
  volumenM3: number
}

/** Capacidad disponible = suma de los camiones SELECCIONADOS (no de todos los elegibles). */
export const selectAvailableCapacity = (s: DispatchPlanState): CapacityTotals => {
  const trucks = selectSelectedTrucks(s)
  return {
    pesoTon: Number(trucks.reduce((acc, t) => acc + t.capacidadPeso, 0).toFixed(2)),
    volumenM3: Number(trucks.reduce((acc, t) => acc + t.capacidadVolumen, 0).toFixed(1)),
  }
}

/**
 * Resuelve el centro de distribución al que pertenece el pedido.
 * 1. Si existen polígonos trazados en useDistribucionStore para centros de distribución activos,
 *    verifica si las coordenadas GPS [lat, lng] del pedido caen dentro de dicho polígono.
 * 2. Si no cae dentro de ningún polígono, aplica la asignación geográfica/sectorial por defecto.
 */
export const resolveDistribuidoraIdDePedido = (p: Pedido): number => {
  try {
    const zonas = useDistribucionStore.getState().zonas.filter((z) => z.deletedAt === null && z.isActive)
    for (const z of zonas) {
      const pts = puntosDeZona(z)
      if (pts.length >= 3) {
        if (puntoEnAnillo([p.lat, p.lng], pts) !== 'fuera') {
          return z.distributorId
        }
      }
    }
  } catch {
    // Fallback defensivo
  }
  return distribuidoraIdDe(p)
}

/**
 * Filtros de narrowing (Centro de Distribución/Ciudad/Mercado/Zona/Vendedor):
 * Un array vacío NO filtra (pasan todos). El canal es obligatorio.
 */
export const matchesNarrowing = (p: Pedido, s: DispatchPlanState): boolean => {
  const distId = resolveDistribuidoraIdDePedido(p)
  return (
    (s.activeDistribuidoraId === null || distId === s.activeDistribuidoraId) &&
    (s.activeCiudades.length === 0 || s.activeCiudades.includes(ciudadDe(p))) &&
    (s.activeDistribuidoras.length === 0 || s.activeDistribuidoras.includes(String(distId))) &&
    (s.activeMercados.length === 0 || s.activeMercados.includes(mercadoDe(p))) &&
    (s.activeZonas.length === 0 || s.activeZonas.includes(zonaDe(p))) &&
    (s.activeVendedores.length === 0 || s.activeVendedores.includes(p.vendedor))
  )
}

/** Pedidos de los canales activos que pasan el narrowing — el universo sobre el que se decide. */
export const selectScopedOrders = (s: DispatchPlanState): Pedido[] =>
  PEDIDOS.filter((p) => s.activeCanales.includes(p.canal) && matchesNarrowing(p, s))

/**
 * Todo lo que efectivamente entra al plan. Un solo filtro con `estaIncluido`: la regla de corte da
 * el default y el override manual lo pisa. Antes eran dos listas concatenadas (dentro + fuera
 * tildados), lo que no podía representar "saqué a mano un pedido que estaba dentro del corte".
 */
export const selectIncludedOrders = (s: DispatchPlanState): Pedido[] =>
  selectScopedOrders(s).filter((p) => estaIncluido(p, s.orderOverrides))

export interface NeededTotals {
  pesoKg: number
  volumenM3: number
}

export const selectNeededTotals = (s: DispatchPlanState): NeededTotals => {
  const incluidos = selectIncludedOrders(s)
  return {
    pesoKg: Number(incluidos.reduce((acc, p) => acc + p.peso, 0).toFixed(2)),
    volumenM3: Number(incluidos.reduce((acc, p) => acc + p.volumen, 0).toFixed(1)),
  }
}

export interface MovimientoTotals {
  /** Órdenes elegidas (traslados + devoluciones), sumando los tres movimientos. */
  ordenes: number
  items: number
  pesoKg: number
  volumenM3: number
}

/**
 * Lo elegido en el sub-paso de movimientos, sumando los TRES (traslados, devoluciones de entrega y
 * recojos). Es a nivel plan y no del movimiento activo a propósito: la pregunta que importa es cuánto
 * ocupa todo lo que se agregó, no cuánto ocupa la pestaña que estás mirando.
 *
 * NO se suma a `selectNeededTotals`. Eso exigiría decidir si una devolución consume la capacidad de la
 * SALIDA o la del regreso, y esa regla todavía no está definida por el negocio: meterla acá sería
 * inventarla. Mientras tanto el panel compara esto contra la capacidad que SOBRA, que sí es un dato
 * derivable sin suponer nada.
 */
export const selectMovimientoTotals = (s: DispatchPlanState): MovimientoTotals => {
  const transferencias = TRANSFERENCIAS.filter((t) => s.selectedTransferIds.includes(t.id))
  const devoluciones = DEVOLUCIONES.filter((d) => s.selectedDevolucionIds.includes(d.id))
  const filas = [...transferencias, ...devoluciones]
  return {
    ordenes: filas.length,
    items: filas.reduce((acc, f) => acc + f.items, 0),
    pesoKg: Number(filas.reduce((acc, f) => acc + f.peso, 0).toFixed(1)),
    volumenM3: Number(filas.reduce((acc, f) => acc + f.volumen, 0).toFixed(2)),
  }
}

export interface Coverage {
  volumeSurplusM3: number
  weightSurplusTon: number
}

/**
 * Cobertura disponible-vs-necesario en volumen y peso. El peso necesario (kg) se convierte a
 * tonelada UNA sola vez acá antes de restar — nunca se compara kg contra tonelada directamente.
 */
export const selectCoverage = (s: DispatchPlanState): Coverage => {
  const available = selectAvailableCapacity(s)
  const needed = selectNeededTotals(s)
  return {
    volumeSurplusM3: Number((available.volumenM3 - needed.volumenM3).toFixed(1)),
    weightSurplusTon: Number((available.pesoTon - kgToTons(needed.pesoKg)).toFixed(2)),
  }
}
