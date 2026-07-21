import { RouteRegistry } from '@/core/routing/route-registry'
import { routerRef } from '@/core/routing/router-ref'
import { useTabStore } from './store/tab-store'

export function openRoute(routeId: string): void {
  const route = RouteRegistry.getRoute(routeId)
  if (!route) return

  const store = useTabStore.getState()
  const tabId = store.addTab({
    routeId: route.id,
    path: route.path,
    title: route.label,
    icon: route.icon,
  })

  store.setActiveTab(tabId)
  routerRef.navigate(route.path)
}
