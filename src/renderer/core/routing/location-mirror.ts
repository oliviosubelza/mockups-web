/**
 * Espejo NO-React del pathname actual.
 *
 * La verdad de "qué se está viendo" es la URL, y en React eso se lee con `useLocation()`. Pero hay
 * consumidores fuera de React —context keys, el SDK, tools de agentes— que necesitan la misma
 * verdad sin estar dentro de un componente. `RouterBridge` mantiene este espejo en sync desde
 * dentro del router.
 *
 * El espejo se actualiza en un effect, así que puede ir UN frame atrás del render. Para todo lo
 * que sí es React, usar `useActiveRouteValue()` (que lee `useLocation()` directo) y no esto.
 */
let _pathname = typeof window !== 'undefined' ? window.location.pathname : '/'
const _listeners = new Set<() => void>()

export const LocationMirror = {
  get(): string {
    return _pathname
  },

  set(pathname: string): void {
    if (pathname === _pathname) return
    _pathname = pathname
    for (const listener of _listeners) listener()
  },

  subscribe(listener: () => void): () => void {
    _listeners.add(listener)
    return () => {
      _listeners.delete(listener)
    }
  },
}
