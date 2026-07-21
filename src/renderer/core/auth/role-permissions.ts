import type { UserRole } from './types'

// Permisos por rol del shell, agnósticos: '*' = acceso total.
// Los permisos finos por dominio llegan con los plugins, que los declaran y consultan.
export const ROLE_PERMISSIONS: Record<UserRole, readonly string[]> = {
  ADMIN: ['*'],
  USER: [],
}

export function roleHasPermission(role: UserRole, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role]
  return perms.includes('*') || perms.includes(permission)
}
