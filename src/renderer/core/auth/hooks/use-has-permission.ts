import { useSyncExternalStore } from 'react'
import { permissionsService } from '../permissions-service'

/**
 * Hook reactivo: ¿el usuario activo tiene el permiso `p`? Se re-renderiza cuando cambian los
 * permisos (login/logout, revocación en caliente). Soporta wildcard '*' (ADMIN) vía el service.
 *
 * Expuesto a los plugins como `api.ui.useHasPermission` (el host lo inyecta).
 */
export function useHasPermission(permission: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const d = permissionsService.onDidChange(cb)
      return () => d.dispose()
    },
    () => permissionsService.has(permission),
  )
}
