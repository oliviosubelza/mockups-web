import { useTabStore } from '@/core/tabs/store/tab-store'
import { contextKeyService } from './context-key-service'

export { contextKeyService }

/**
 * Context keys básicas del workbench, derivadas del estado de tabs. Se mantienen en sync
 * por suscripción al store — cualquier `when` que las use re-evalúa solo.
 */
export function setupShellContextKeys(): void {
  const sync = () => {
    const { tabs, activeTabId } = useTabStore.getState()
    const active = tabs.find((t) => t.id === activeTabId)
    contextKeyService.bulkUpdate({
      'workbench.activeRouteId': active?.routeId ?? '',
      'workbench.openTabCount': tabs.length,
    })
  }
  sync()
  useTabStore.subscribe(sync)
}
