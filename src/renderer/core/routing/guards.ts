import type { User } from '@/core/auth/types'
import { roleHasPermission } from '@/core/auth/role-permissions'
import type { RouteConfig } from './types'

export function canAccess(route: RouteConfig, user: User | null): boolean {
  const hasRestrictions = route.permissions?.length || route.roles?.length
  if (!hasRestrictions) return true
  if (!user) return false

  if (route.roles?.length && route.roles.includes(user.role)) return true
  if (
    route.permissions?.length &&
    route.permissions.every((p) => roleHasPermission(user.role, p))
  )
    return true

  return false
}

export function filterRoutes(routes: RouteConfig[], user: User | null): RouteConfig[] {
  return routes
    .filter((r) => canAccess(r, user))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
}

export function filterNavRoutes(routes: RouteConfig[], user: User | null): RouteConfig[] {
  return filterRoutes(routes, user).filter((r) => r.showInSidebar !== false)
}
