import { useSyncExternalStore } from 'react'
import type { RouteConfig } from './types'

/**
 * Registry de rutas REACTIVO: el shell registra las suyas al boot (config/routes) y los
 * plugins agregan/quitan las propias vía el contribution point `routes` — el sidebar y
 * cualquier superficie suscripta se re-renderizan con el delta (useRoutes).
 */
const _registry = new Map<string, RouteConfig>()
const _topLevelIds = new Set<string>()
const _listeners = new Set<() => void>()

let _allSnapshot: RouteConfig[] = []
let _topSnapshot: RouteConfig[] = []

function _rebuild(): void {
  _allSnapshot = Array.from(_registry.values())
  _topSnapshot = Array.from(_topLevelIds)
    .map((id) => _registry.get(id))
    .filter((r): r is RouteConfig => r !== undefined)
  for (const listener of _listeners) listener()
}

function _registerTree(routes: RouteConfig[], isTopLevel: boolean): void {
  for (const route of routes) {
    _registry.set(route.id, route)
    if (isTopLevel) _topLevelIds.add(route.id)
    if (route.children) _registerTree(route.children, false)
  }
}

function _unregisterTree(route: RouteConfig | undefined): void {
  if (!route) return
  _registry.delete(route.id)
  _topLevelIds.delete(route.id)
  for (const child of route.children ?? []) _unregisterTree(child)
}

export const RouteRegistry = {
  register(routes: RouteConfig[]): void {
    _registerTree(routes, true)
    _rebuild()
  },

  unregister(ids: string[]): void {
    for (const id of ids) _unregisterTree(_registry.get(id))
    _rebuild()
  },

  getRoute(id: string): RouteConfig | undefined {
    return _registry.get(id)
  },

  getAllRoutes(): RouteConfig[] {
    return _allSnapshot
  },

  /** Solo raíces (para sidebar/empty-state); los children se navegan por anidamiento. */
  getTopLevelRoutes(): RouteConfig[] {
    return _topSnapshot
  },

  subscribe(listener: () => void): () => void {
    _listeners.add(listener)
    return () => _listeners.delete(listener)
  },
}

/** Rutas top-level, reactivas a registro/desregistro de plugins. */
export function useRoutes(): RouteConfig[] {
  return useSyncExternalStore(RouteRegistry.subscribe, RouteRegistry.getTopLevelRoutes)
}
