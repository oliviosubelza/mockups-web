import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { RouteRegistry } from '@/core/routing/route-registry'
import { electronTabStorage } from '@/lib/storage/tab-storage'
import { StorageKeys } from '@/lib/storage/keys'
import type { TabInstance } from '../types'
import { useMementoStore } from './memento-store'

export const MAX_OPEN_TABS_OPTIONS = [5, 10, 15, 20, 30] as const

interface TabsSettingsState {
  allowCloseLastTab: boolean
  restoreTabsOnStartup: boolean
  maxOpenTabs: number
  setAllowCloseLastTab: (value: boolean) => void
  setRestoreTabsOnStartup: (value: boolean) => void
  setMaxOpenTabs: (value: number) => void
}

export const useTabsSettingsStore = create<TabsSettingsState>()(
  persist(
    (set) => ({
      allowCloseLastTab: true,
      restoreTabsOnStartup: true,
      maxOpenTabs: 20,
      setAllowCloseLastTab: (value) => set({ allowCloseLastTab: value }),
      setRestoreTabsOnStartup: (value) => set({ restoreTabsOnStartup: value }),
      setMaxOpenTabs: (value) => set({ maxOpenTabs: value }),
    }),
    {
      name: StorageKeys.tabsSettings,
      storage: createJSONStorage(() => electronTabStorage),
    }
  )
)

interface AddTabParams {
  routeId: string
  path: string
  title: string
  icon?: TabInstance['icon']
  metadata?: Record<string, unknown>
}

interface TabState {
  tabs: TabInstance[]
  activeTabId: string | null
  _hasHydrated: boolean

  addTab: (params: AddTabParams) => string
  removeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  updateTab: (tabId: string, updates: Partial<TabInstance>) => void
  closeAllTabs: () => void
  closeOtherTabs: (tabId: string) => void
  closeTabsToRight: (tabId: string) => void
  pinTab: (tabId: string) => void
  unpinTab: (tabId: string) => void
  getTab: (tabId: string) => TabInstance | undefined
  findTabByPath: (path: string) => TabInstance | undefined
  findTabByRouteId: (routeId: string) => TabInstance | undefined
  reorderTabs: (fromIndex: number, toIndex: number) => void
}

export const useTabStore = create<TabState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,
      _hasHydrated: false,

      addTab: ({ routeId, path, title, icon, metadata }) => {
        const state = get()
        const routeConfig = RouteRegistry.getRoute(routeId)

        if (routeConfig?.tabConfig?.singleton) {
          const existing = state.tabs.find((t) => t.routeId === routeId)
          if (existing) {
            set({ activeTabId: existing.id })
            return existing.id
          }
        }

        if (routeConfig?.tabConfig?.maxInstances) {
          const count = state.tabs.filter((t) => t.routeId === routeId).length
          if (count >= routeConfig.tabConfig.maxInstances) {
            const existing = state.tabs.find((t) => t.routeId === routeId)
            if (existing) {
              set({ activeTabId: existing.id })
              return existing.id
            }
          }
        }

        const duplicate = state.tabs.find((t) => t.path === path)
        if (duplicate) {
          set({ activeTabId: duplicate.id })
          return duplicate.id
        }

        let currentTabs = [...state.tabs]
        const maxTabs = useTabsSettingsStore.getState().maxOpenTabs
        if (currentTabs.length >= maxTabs) {
          const lru = currentTabs
            .filter((t) => !t.isPinned && t.id !== state.activeTabId)
            .sort((a, b) => a.openedAt - b.openedAt)
          if (lru.length > 0) currentTabs = currentTabs.filter((t) => t.id !== lru[0].id)
        }

        const newTab: TabInstance = {
          id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          routeId,
          path,
          title,
          icon,
          isPinned: false,
          isClosable: routeConfig?.tabConfig?.closable !== false,
          openedAt: Date.now(),
          metadata: metadata ?? {},
        }

        set({ tabs: [...currentTabs, newTab], activeTabId: newTab.id })
        return newTab.id
      },

      removeTab: (tabId) => {
        const state = get()
        const tab = state.tabs.find((t) => t.id === tabId)
        if (!tab || tab.isPinned || !tab.isClosable) return

        const { allowCloseLastTab } = useTabsSettingsStore.getState()
        if (state.tabs.length === 1 && !allowCloseLastTab) return

        const tabIndex = state.tabs.findIndex((t) => t.id === tabId)
        const newTabs = state.tabs.filter((t) => t.id !== tabId)

        let newActiveTabId = state.activeTabId
        if (state.activeTabId === tabId) {
          const idx = tabIndex < newTabs.length ? tabIndex : tabIndex - 1
          newActiveTabId = newTabs[idx]?.id ?? null
        }

        set({ tabs: newTabs, activeTabId: newActiveTabId })
        useMementoStore.getState().clearTab(tabId)
      },

      setActiveTab: (tabId) => {
        const state = get()
        if (!state.tabs.find((t) => t.id === tabId)) return
        set({
          activeTabId: tabId,
          tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, openedAt: Date.now() } : t)),
        })
      },

      updateTab: (tabId, updates) => {
        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, ...updates } : t)),
        }))
      },

      closeAllTabs: () => {
        const state = get()
        const pinned = state.tabs.filter((t) => t.isPinned)
        const { allowCloseLastTab } = useTabsSettingsStore.getState()

        if (pinned.length > 0) {
          set({ tabs: pinned, activeTabId: pinned[0].id })
        } else if (allowCloseLastTab) {
          set({ tabs: [], activeTabId: null })
        } else {
          const keep = state.tabs.find((t) => t.id === state.activeTabId) ?? state.tabs[0]
          if (keep) set({ tabs: [keep], activeTabId: keep.id })
        }
        useMementoStore.getState().clearAllExcept(get().tabs.map((t) => t.id))
      },

      closeOtherTabs: (tabId) => {
        const state = get()
        set({
          tabs: state.tabs.filter((t) => t.id === tabId || t.isPinned),
          activeTabId: tabId,
        })
        useMementoStore.getState().clearAllExcept(get().tabs.map((t) => t.id))
      },

      closeTabsToRight: (tabId) => {
        const state = get()
        const idx = state.tabs.findIndex((t) => t.id === tabId)
        if (idx === -1) return
        const keep = state.tabs.filter((t, i) => i <= idx || t.isPinned)
        const newActive = keep.find((t) => t.id === state.activeTabId) ? state.activeTabId : tabId
        set({ tabs: keep, activeTabId: newActive })
        useMementoStore.getState().clearAllExcept(get().tabs.map((t) => t.id))
      },

      pinTab: (tabId) => {
        set((state) => {
          const tabs = [...state.tabs]
          const idx = tabs.findIndex((t) => t.id === tabId)
          if (idx === -1) return state
          const tab = { ...tabs[idx], isPinned: true }
          tabs.splice(idx, 1)
          const lastPinned = tabs.findLastIndex((t) => t.isPinned)
          tabs.splice(lastPinned + 1, 0, tab)
          return { tabs }
        })
      },

      unpinTab: (tabId) => {
        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, isPinned: false } : t)),
        }))
      },

      getTab: (tabId) => get().tabs.find((t) => t.id === tabId),
      findTabByPath: (path) => get().tabs.find((t) => t.path === path),
      findTabByRouteId: (routeId) => get().tabs.find((t) => t.routeId === routeId),

      reorderTabs: (fromIndex, toIndex) => {
        set((state) => {
          const tabs = [...state.tabs]
          const [moved] = tabs.splice(fromIndex, 1)
          tabs.splice(toIndex, 0, moved)
          return { tabs }
        })
      },
    }),
    {
      name: StorageKeys.tabs,
      storage: createJSONStorage(() => electronTabStorage),
      version: 1,
      partialize: (state) => ({
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        tabs: state.tabs.map(({ icon: _icon, ...tab }) => tab),
        activeTabId: state.activeTabId,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('Tab store rehydration error:', error)
          useTabStore.setState({ _hasHydrated: true })
          return
        }
        if (state) {
          state.tabs = state.tabs.map((tab) => ({
            ...tab,
            icon: RouteRegistry.getRoute(tab.routeId)?.icon,
            isClosable: tab.isClosable ?? RouteRegistry.getRoute(tab.routeId)?.tabConfig?.closable !== false,
          }))
          state._hasHydrated = true
        }
      },
    }
  )
)
