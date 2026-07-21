import { useTabStore } from '@/core/tabs'
import type { RouteConfig } from './types'

/**
 * Estado de "qué está activo" para las superficies de navegación (sidebar). La verdad es el
 * TAB enfocado (su `routeId`), no el `pathname`: con keep-alive hay varias vistas montadas y el
 * resaltado debe seguir al tab activo. Resolver por `routeId` da exact-match y evita que rutas
 * hermanas con prefijo común (`/caja` y `/caja/history`) se iluminen las dos a la vez.
 */
export function useActiveRoute() {
  const activeTabId = useTabStore((s) => s.activeTabId)
  const tabs = useTabStore((s) => s.tabs)

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null
  const activeRouteId = activeTab?.routeId ?? null

  const isRouteActive = (route: RouteConfig): boolean => route.id === activeRouteId

  const isChildActive = (route: RouteConfig): boolean =>
    (route.children ?? []).some((child) => child.id === activeRouteId)

  const isRouteOpen = (routeId: string): boolean =>
    tabs.some((t) => t.routeId === routeId)

  const isRouteTabActive = (routeId: string): boolean =>
    activeRouteId === routeId

  return { activeTab, activeTabId, isRouteActive, isChildActive, isRouteOpen, isRouteTabActive }
}
