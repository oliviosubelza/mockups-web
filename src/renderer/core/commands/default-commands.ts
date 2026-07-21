import i18next from 'i18next'
import { useSidebarWidthStore } from '@/core/sidebar/use-sidebar-resize'
import { useTabStore } from '@/core/tabs'
import { commandRegistry } from './command-registry'
import { useCommandPaletteStore } from './command-palette-store'

/** Rota sobre las tabs abiertas; `step` +1 = siguiente, -1 = anterior. */
function cycleTab(step: number): void {
  const { tabs, activeTabId, setActiveTab } = useTabStore.getState()
  if (tabs.length === 0) return

  const current = tabs.findIndex((tab) => tab.id === activeTabId)
  const next = (current + step + tabs.length) % tabs.length
  setActiveTab(tabs[next].id)
}

export function registerDefaultCommands(): void {
  commandRegistry.register(
    'workbench.action.showCommands',
    () => i18next.t('commands.workbench.showCommands'),
    () => useCommandPaletteStore.getState().toggle()
  )

  // El AppSidebar hace override con el toggle de su propio contexto cuando está montado.
  commandRegistry.register(
    'workbench.action.toggleSidebar',
    () => i18next.t('commands.workbench.toggleSidebar'),
    () => useSidebarWidthStore.getState().toggle()
  )

  commandRegistry.register(
    'tabs.action.closeActive',
    () => i18next.t('commands.tabs.closeActive'),
    () => {
      const { activeTabId, removeTab } = useTabStore.getState()
      if (activeTabId) removeTab(activeTabId)
    }
  )

  commandRegistry.register(
    'tabs.action.nextTab',
    () => i18next.t('commands.tabs.nextTab'),
    () => cycleTab(1)
  )

  commandRegistry.register(
    'tabs.action.prevTab',
    () => i18next.t('commands.tabs.prevTab'),
    () => cycleTab(-1)
  )
}
