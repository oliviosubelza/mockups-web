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
  CANAL_META,
  PEDIDOS,
  aMinutos,
  ciudadDe,
  finVentana,
  mercadoDe,
  zonaDe,
  type Camion,
  type CanalId,
  type CiudadId,
  type MercadoId,
  type Pedido,
  type ZonaId,
} from './mock-data'

// ── Corte de hora (dentro/fuera) — regla de negocio preservada VERBATIM desde ChannelsView.tsx ──
// Los pedidos cuya ventana TERMINA a más tardar a la hora de corte de su canal entran directo
// (dentro); los que cierran después quedan fuera del corte (opcionales, requieren selección manual).
//
// `aMinutos` y `finVentana` se movieron a mock-data porque la GENERACIÓN del dataset los necesita
// (garantizar pedidos dentro Y fuera del corte en cada canal). Se re-exportan acá para no cambiarle
// el import a nadie: al revés habría ciclo, porque este store importa mock-data.
export { aMinutos, finVentana }

export const dentroDelCorte = (p: Pedido, corte: string) =>
  aMinutos(finVentana(p.ventana)) <= aMinutos(corte)

/** ¿El pedido entra al plan POR DEFECTO? (o sea, sin que el usuario haya decidido nada todavía). */
export const incluidoPorDefecto = (p: Pedido) => dentroDelCorte(p, CANAL_META[p.canal].timeOff)

/**
 * ¿El pedido entra al plan? Gana la decisión EXPLÍCITA del usuario si existe; si no, la regla de
 * corte. Un único predicado para todas las superficies (resumen, tabla de fuera de corte, diálogo
 * por canal), así no puede haber dos definiciones de "incluido" que se contradigan.
 */
export const estaIncluido = (p: Pedido, overrides: OrderOverrides): boolean =>
  overrides[p.id] ?? incluidoPorDefecto(p)

/**
 * Decisiones MANUALES del usuario, por id de pedido: `true` = lo mete al plan, `false` = lo saca.
 * Solo se guardan las DESVIACIONES del default — si el usuario vuelve a la decisión que ya tomaba
 * la regla de corte, la entrada se borra. Así "sin overrides" siempre significa "todo por defecto".
 */
export type OrderOverrides = Record<string, boolean>

interface DispatchPlanState {
  selectedTruckIds: string[]
  activeCanales: CanalId[]
  // Filtros de NARROWING (Ciudad/Mercado/Zona/Vendedor): a diferencia del canal (obligatorio), si un
  // array queda vacío no filtra — pasan todos los pedidos en esa dimensión. Ciudad es el más amplio.
  activeCiudades: CiudadId[]
  activeMercados: MercadoId[]
  activeZonas: ZonaId[]
  activeVendedores: string[]
  orderOverrides: OrderOverrides
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
  reset: () => void
}

const INITIAL_STATE = {
  selectedTruckIds: [] as string[],
  activeCanales: [] as CanalId[],
  activeCiudades: [] as CiudadId[],
  activeMercados: [] as MercadoId[],
  activeZonas: [] as ZonaId[],
  activeVendedores: [] as string[],
  orderOverrides: {} as OrderOverrides,
}

export const useDispatchPlanStore = create<DispatchPlanState>((set) => ({
  ...INITIAL_STATE,

  toggleTruck: (id) =>
    set((state) => ({
      selectedTruckIds: state.selectedTruckIds.includes(id)
        ? state.selectedTruckIds.filter((t) => t !== id)
        : [...state.selectedTruckIds, id],
    })),

  setSelectedTrucks: (ids) => set({ selectedTruckIds: ids }),

  applySelection: (sel) =>
    set({
      activeCanales: sel.canales,
      activeCiudades: sel.ciudades,
      activeMercados: sel.mercados,
      activeZonas: sel.zonas,
      activeVendedores: sel.vendedores,
    }),

  setOrdersIncluded: (scopeIds, includedIds) =>
    set((state) => {
      const incluidos = new Set(includedIds)
      const next = { ...state.orderOverrides }
      for (const id of scopeIds) {
        const pedido = PEDIDOS.find((p) => p.id === id)
        if (!pedido) continue
        // Solo se persiste la desviación: si la decisión del usuario coincide con lo que ya hacía la
        // regla de corte, se borra el override en vez de guardar una redundancia.
        if (incluidos.has(id) === incluidoPorDefecto(pedido)) delete next[id]
        else next[id] = incluidos.has(id)
      }
      return { orderOverrides: next }
    }),

  resetOrderOverrides: () => set({ orderOverrides: {} }),

  reset: () => set({ ...INITIAL_STATE }),
}))

// ── Selectores puros ─────────────────────────────────────────────────────────────────────────
// Reciben el estado del store y derivan contra CAMIONES/PEDIDOS al momento de leer — nada de lo
// que devuelven se guarda en el store, así nunca puede desincronizarse del dataset.

export const selectSelectedTrucks = (s: DispatchPlanState): Camion[] =>
  CAMIONES.filter((c) => s.selectedTruckIds.includes(c.id))

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
 * Filtros de narrowing (Mercado/Zona/Vendedor): un array vacío NO filtra (pasa todo); si tiene
 * valores, el pedido debe coincidir con alguno. El canal NO va acá porque es obligatorio.
 */
export const matchesNarrowing = (p: Pedido, s: DispatchPlanState): boolean =>
  (s.activeCiudades.length === 0 || s.activeCiudades.includes(ciudadDe(p))) &&
  (s.activeMercados.length === 0 || s.activeMercados.includes(mercadoDe(p))) &&
  (s.activeZonas.length === 0 || s.activeZonas.includes(zonaDe(p))) &&
  (s.activeVendedores.length === 0 || s.activeVendedores.includes(p.vendedor))

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
