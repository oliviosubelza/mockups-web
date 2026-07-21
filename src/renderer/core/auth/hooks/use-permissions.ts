import { useAuthStore } from '../store'
import { ROLE_PERMISSIONS } from '../role-permissions'
import type { UserRole } from '../types'

export function usePermissions() {
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const hasRole = useAuthStore((s) => s.hasRole)
  const user = useAuthStore((s) => s.user)

  const role: UserRole | null = user?.role ?? null
  const permissions: readonly string[] = role ? ROLE_PERMISSIONS[role] : []

  return {
    hasPermission,
    hasRole,
    role,
    permissions,
  }
}
