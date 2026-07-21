import { useSyncExternalStore } from 'react'
import { useTabStore } from '@/core/tabs'
import { RouteRegistry } from './route-registry'
import type { RouteConfig } from './types'

/**
 * Ruta ACTIVA del workbench (fuente de verdad única). Con tabs keep-alive hay varias vistas
 * montadas a la vez; la "activa" es la del tab enfocado — NO el `pathname` (que es derivado, lo
 * sincroniza `openRoute`/click de tab). Resolver por `routeId` del tab activo da exact-match y
 * elimina la ambigüedad de prefijos entre rutas hermanas (ej. `/caja` vs `/caja/history`).
 *
 * Superficie compartida: la consume el sidebar (resaltado), el SDK (`api.navigation`) y la tool
 * core `workbench.getActiveView` (catálogo MCP) — misma verdad para interno, externo y agentes.
 */
export interface ActiveRoute {
  readonly routeId: string
  readonly path: string
  readonly title: string
}

function snapshot(): ActiveRoute | null {
  const { activeTabId, tabs } = useTabStore.getState()
  const tab = tabs.find((t) => t.id === activeTabId)
  if (!tab) return null
  return { routeId: tab.routeId, path: tab.path, title: tab.title }
}

// Cache del snapshot: useSyncExternalStore exige identidad estable mientras no cambie el valor.
let _cache: ActiveRoute | null = snapshot()

function _recompute(): ActiveRoute | null {
  const next = snapshot()
  const same =
    (_cache === null && next === null) ||
    (_cache !== null &&
      next !== null &&
      _cache.routeId === next.routeId &&
      _cache.path === next.path &&
      _cache.title === next.title)
  if (!same) _cache = next
  return _cache
}

export const ActiveRouteService = {
  /** Ruta del tab enfocado, o null si no hay tabs. */
  get(): ActiveRoute | null {
    return _recompute()
  },

  /** El `RouteConfig` registrado de la ruta activa (incluye metadata: group, icon, etc.). */
  getRoute(): RouteConfig | undefined {
    const active = _recompute()
    return active ? RouteRegistry.getRoute(active.routeId) : undefined
  },

  /** Notifica cada vez que cambia el tab activo (o su routeId/path/title). */
  subscribe(listener: (route: ActiveRoute | null) => void): () => void {
    return useTabStore.subscribe((state, prev) => {
      if (state.activeTabId !== prev.activeTabId || state.tabs !== prev.tabs) {
        const prevCache = _cache
        const next = _recompute()
        if (next !== prevCache) listener(next)
      }
    })
  },
}

function _subscribeForReact(onChange: () => void): () => void {
  return useTabStore.subscribe((state, prev) => {
    if (state.activeTabId !== prev.activeTabId || state.tabs !== prev.tabs) {
      _recompute()
      onChange()
    }
  })
}

/** Hook reactivo: la ruta activa del workbench. */
export function useActiveRouteValue(): ActiveRoute | null {
  return useSyncExternalStore(_subscribeForReact, ActiveRouteService.get)
}
