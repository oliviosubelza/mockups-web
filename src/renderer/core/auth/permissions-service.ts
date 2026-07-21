/**
 * PermissionsService — gemelo de EntitlementsService para permisos granulares (Stage 2).
 *
 * Fuente de verdad: el backend los resuelve en /auth/me y /auth/login desde las
 * UserRoleAssignment del usuario para su sede activa. Acá solo se REFLEJAN.
 *
 * Context keys publicadas: `perm:<id>` (ej. `perm:venta:ver_costo`).
 * Las colons son válidas en ContextKeyService (KEY_RE = /[A-Za-z0-9_.\-:]+/).
 *
 * Para ADMIN: `permissions = ['*']` → publica `perm:*` = true (wildcard shortcut).
 * `has(p)` retorna true si el set contiene '*' O literalmente `p`.
 *
 * Ref: spec R-S2-DESKTOP-1, design §5.2.
 */
import { Emitter, type Event } from '@keel/platform'
import { contextKeyService } from '@/core/context/context-key-service'

export interface PermissionsChange {
  readonly granted: readonly string[]
  readonly revoked: readonly string[]
}

export class PermissionsService {
  private _set = new Set<string>()

  private readonly _onDidChange = new Emitter<PermissionsChange>()
  readonly onDidChange: Event<PermissionsChange> = this._onDidChange.event

  /**
   * Comprueba si el usuario activo tiene el permiso `p`.
   * Soporta wildcard '*' (ADMIN) y match exacto.
   */
  has(permission: string): boolean {
    return this._set.has('*') || this._set.has(permission)
  }

  list(): readonly string[] {
    return [...this._set]
  }

  /**
   * Reemplaza el set completo (fuente = respuesta del backend).
   * Publica/elimina las context keys `perm:<id>` reactivamente.
   */
  replace(permissions: readonly string[]): void {
    const next = new Set(permissions)
    const granted = [...next].filter((p) => !this._set.has(p))
    const revoked = [...this._set].filter((p) => !next.has(p))
    if (granted.length === 0 && revoked.length === 0) return

    this._set = next

    // Publish new permissions as context keys: perm:<id>
    for (const p of granted) contextKeyService.setContext(`perm:${p}`, true)
    // Revoke removed permissions
    for (const p of revoked) contextKeyService.removeContext(`perm:${p}`)

    this._onDidChange.fire({ granted, revoked })
  }

  /** Sin sesión no hay permisos (deny-all para checks granulares). */
  clear(): void {
    this.replace([])
  }
}

export const permissionsService = new PermissionsService()
