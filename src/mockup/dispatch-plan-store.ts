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
  ciudadDe,
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
export const aMinutos = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
/** "13:00–17:00" → "17:00" (fin de la ventana de entrega). */
export const finVentana = (ventana: string) => ventana.split('–')[1]?.trim() ?? ventana
export const dentroDelCorte = (p: Pedido, corte: string) =>
  aMinutos(finVentana(p.ventana)) <= aMinutos(corte)

interface DispatchPlanState {
  selectedTruckIds: string[]
  activeCanales: CanalId[]
  // Filtros de NARROWING (Ciudad/Mercado/Zona/Vendedor): a diferencia del canal (obligatorio), si un
  // array queda vacío no filtra — pasan todos los pedidos en esa dimensión. Ciudad es el más amplio.
  activeCiudades: CiudadId[]
  activeMercados: MercadoId[]
  activeZonas: ZonaId[]
  activeVendedores: string[]
  selectedFueraOrderIds: string[]
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
  setSelectedFuera: (ids: string[]) => void
  reset: () => void
}

const INITIAL_STATE = {
  selectedTruckIds: [] as string[],
  activeCanales: [] as CanalId[],
  activeCiudades: [] as CiudadId[],
  activeMercados: [] as MercadoId[],
  activeZonas: [] as ZonaId[],
  activeVendedores: [] as string[],
  selectedFueraOrderIds: [] as string[],
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

  setSelectedFuera: (ids) => set({ selectedFueraOrderIds: ids }),

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

/** Pedidos DENTRO del corte de los canales activos — entran solos, sin selección manual. */
export const selectDentroOrders = (s: DispatchPlanState): Pedido[] =>
  PEDIDOS.filter(
    (p) =>
      s.activeCanales.includes(p.canal) &&
      matchesNarrowing(p, s) &&
      dentroDelCorte(p, CANAL_META[p.canal].timeOff)
  )

/** Pedidos FUERA del corte que el usuario tildó a mano en la tabla. */
export const selectFueraSeleccionados = (s: DispatchPlanState): Pedido[] =>
  PEDIDOS.filter(
    (p) =>
      s.activeCanales.includes(p.canal) &&
      matchesNarrowing(p, s) &&
      !dentroDelCorte(p, CANAL_META[p.canal].timeOff) &&
      s.selectedFueraOrderIds.includes(p.id)
  )

/** Todo lo que efectivamente entra al plan: dentro (automático) + fuera (manual). */
export const selectIncludedOrders = (s: DispatchPlanState): Pedido[] => [
  ...selectDentroOrders(s),
  ...selectFueraSeleccionados(s),
]

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
