import i18next from 'i18next'
import { useSidebarWidthStore } from '@/core/sidebar/use-sidebar-resize'
import { commandRegistry } from './command-registry'
import { useCommandPaletteStore } from './command-palette-store'

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
}
