import { create } from 'zustand'

/**
 * Mementos de tabs (§7): cuando el LRU desmonta una tab keep-alive (o una keepAlive:false
 * se desmonta al cambiar), su vista puede serializar estado acá y rehidratarse al volver.
 * Keyed por tabId + key local de la vista. En memoria — al cerrar la tab se descarta;
 * persistirlos al salir engancha con onWillSaveState (B5, storage scopes) más adelante.
 */
interface MementoState {
  mementos: Record<string, Record<string, unknown>>
  save: (tabId: string, key: string, value: unknown) => void
  get: <T>(tabId: string, key: string) => T | undefined
  clearTab: (tabId: string) => void
  clearAllExcept: (tabIds: readonly string[]) => void
}

export const useMementoStore = create<MementoState>()((set, get) => ({
  mementos: {},

  save: (tabId, key, value) =>
    set((state) => ({
      mementos: {
        ...state.mementos,
        [tabId]: { ...state.mementos[tabId], [key]: value },
      },
    })),

  get: <T,>(tabId: string, key: string) => get().mementos[tabId]?.[key] as T | undefined,

  clearTab: (tabId) =>
    set((state) => {
      if (!(tabId in state.mementos)) return state
      const { [tabId]: _gone, ...rest } = state.mementos
      return { mementos: rest }
    }),

  clearAllExcept: (tabIds) =>
    set((state) => ({
      mementos: Object.fromEntries(
        Object.entries(state.mementos).filter(([tabId]) => tabIds.includes(tabId))
      ),
    })),
}))
