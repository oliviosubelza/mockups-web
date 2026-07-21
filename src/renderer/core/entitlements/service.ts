import { Emitter, type Event } from '@keel/platform'
import { contextKeyService } from '@/core/context/context-key-service'

export interface EntitlementsChange {
  readonly granted: readonly string[]
  readonly revoked: readonly string[]
}

/**
 * Estado de entitlements de la sesión (§9 de ARCHITECTURE.md). Fuente: el backend los
 * responde en login/me desde la Subscription del tenant; acá solo se REFLEJAN.
 *
 * Niveles de gating que alimenta:
 *  - Activación: `pluginHost.isEntitled` lee de acá (sin entitlement el plugin no corre).
 *  - Declarativo: cada entitlement publica la context key `entitled.<id>` para los `when`.
 *  - UI locked: las superficies consultan `isEntitled()` / `useEntitled()` para mostrar candado.
 */
export class EntitlementsService {
  private _set = new Set<string>()

  private readonly _onDidChange = new Emitter<EntitlementsChange>()
  readonly onDidChange: Event<EntitlementsChange> = this._onDidChange.event

  isEntitled(entitlement: string): boolean {
    return this._set.has(entitlement)
  }

  list(): readonly string[] {
    return [...this._set]
  }

  /** Reemplaza el set completo (la fuente es siempre la respuesta del backend). */
  replace(entitlements: readonly string[]): void {
    const next = new Set(entitlements)
    const granted = [...next].filter((e) => !this._set.has(e))
    const revoked = [...this._set].filter((e) => !next.has(e))
    if (granted.length === 0 && revoked.length === 0) return

    this._set = next
    for (const e of granted) contextKeyService.setContext(`entitled.${e}`, true)
    for (const e of revoked) contextKeyService.removeContext(`entitled.${e}`)
    this._onDidChange.fire({ granted, revoked })
  }

  /** Sin sesión no hay entitlements (default deny — los plugins gratis no se ven afectados). */
  clear(): void {
    this.replace([])
  }
}

export const entitlementsService = new EntitlementsService()
