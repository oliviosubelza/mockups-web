import { Emitter, type Event } from '@keel/platform'
import { contextKeyService } from '@/core/context/context-key-service'

export interface EnablementChange {
  readonly enabled: readonly string[]
  readonly disabled: readonly string[]
}

/**
 * Eje Enabled (§composición de plugins): qué plugins tiene PRENDIDOS el cliente, entre Entitled
 * (lo que puede) y Active (runtime lazy). Invariante: Active ⊆ Enabled ⊆ Entitled.
 *
 * Representación OPT-OUT: se guarda el conjunto DESHABILITADO. `isEnabled = !disabled.has(id)`,
 * así un plugin nuevo/desconocido (recién instalado, sobre todo externo) arranca HABILITADO
 * ("install = funciona"). Fuente de verdad: backend per-tenant (`/tenant/plugins`,
 * `disabledPlugins` en /auth/me); acá se refleja e hidrata, y el toggle persiste vía el persister.
 *
 * Alimenta: gate de activación (`pluginHost.isEnabled`) y la context key `enabled.<id>`.
 */
/** Cache local del set deshabilitado: lo deja disponible SINCRÓNICO en el boot, antes de que la
 *  restauración de tabs active plugins — así el gate `isEnabled` ya es correcto y no hay carrera
 *  con la hidratación async de /auth/me (que después confirma/corrige). No reemplaza al backend
 *  (fuente de verdad); es un valor optimista de arranque. */
const CACHE_KEY = 'keel.enablement.disabled'

function loadCache(): Set<string> {
  try {
    const raw = globalThis.localStorage?.getItem(CACHE_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

export class EnablementService {
  // Cargado sincrónicamente del cache local: el gate es correcto desde el primer activate del boot.
  private _disabled = loadCache()
  private _recommendedPreset: string | null = null
  private _universe: () => readonly string[] = () => []
  private _persist: ((disabled: string[]) => void) | undefined

  private readonly _onDidChange = new Emitter<EnablementChange>()
  readonly onDidChange: Event<EnablementChange> = this._onDidChange.event

  // Se dispara al terminar hydrate() (login/me) — el onboarding lo usa para decidir si ofrecerse.
  private readonly _onDidHydrate = new Emitter<void>()
  readonly onDidHydrate: Event<void> = this._onDidHydrate.event

  /** El universo de plugins (ids registrados) — para refrescar las context keys. */
  setUniverseProvider(fn: () => readonly string[]): void {
    this._universe = fn
  }

  /** Persistencia al backend (PUT /tenant/plugins). Solo se llama en cambios del usuario. */
  setPersister(fn: (disabled: string[]) => void): void {
    this._persist = fn
  }

  isEnabled(id: string): boolean {
    return !this._disabled.has(id)
  }

  listDisabled(): readonly string[] {
    return [...this._disabled]
  }

  /** Tipo de negocio sugerido por el plan (lo usa el shell para presets/onboarding, paso 5). */
  get recommendedPreset(): string | null {
    return this._recommendedPreset
  }

  /** Hidrata desde el backend (login/me). No re-persiste. */
  hydrate(disabled: readonly string[], recommendedPreset: string | null = null): void {
    this._recommendedPreset = recommendedPreset
    this._apply(new Set(disabled), false)
    this._onDidHydrate.fire()
  }

  /** Fija el conjunto deshabilitado completo y persiste (lo usa aplicar un preset). */
  applyDisabled(disabled: readonly string[]): void {
    this._apply(new Set(disabled), true)
  }

  enable(id: string): void {
    if (!this._disabled.has(id)) return
    const next = new Set(this._disabled)
    next.delete(id)
    this._apply(next, true)
  }

  disable(id: string): void {
    if (this._disabled.has(id)) return
    const next = new Set(this._disabled)
    next.add(id)
    this._apply(next, true)
  }

  /** Logout: sin sesión, todo habilitado (default). No persiste. */
  clear(): void {
    this._recommendedPreset = null
    this._apply(new Set(), false)
  }

  /** Re-publica las context keys cuando cambia el universo (alta/baja de plugins). */
  refreshKeys(): void {
    for (const id of this._universe()) this._applyKey(id)
  }

  private _applyKey(id: string): void {
    if (this.isEnabled(id)) contextKeyService.setContext(`enabled.${id}`, true)
    else contextKeyService.removeContext(`enabled.${id}`)
  }

  private _apply(next: Set<string>, persist: boolean): void {
    const before = this._disabled
    const enabled = [...before].filter((id) => !next.has(id)) // salieron de disabled → habilitados
    const disabled = [...next].filter((id) => !before.has(id)) // nuevos deshabilitados
    this._disabled = next

    // Cache local SIEMPRE (incluso en hydrate/clear): el boot siguiente arranca correcto.
    try {
      globalThis.localStorage?.setItem(CACHE_KEY, JSON.stringify([...next]))
    } catch {
      /* cache best-effort */
    }

    for (const id of new Set([...this._universe(), ...before, ...next])) this._applyKey(id)

    if (enabled.length || disabled.length) this._onDidChange.fire({ enabled, disabled })
    if (persist) this._persist?.([...next])
  }
}

export const enablementService = new EnablementService()
