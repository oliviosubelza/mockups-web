import { useEffect, useRef, type DependencyList } from 'react'
import { useTabContext } from './use-tab-context'

/**
 * Corre `effect` al montar y CADA VEZ que el tab pasa de oculto a enfocado (re-foco), además de
 * cuando cambian `deps`. Es el equivalente React del `onDidChangeVisibility`/`onDidChangeViewState`
 * de VSCode: con keep-alive (§7) la vista NO se desmonta, así que un `useEffect` normal no vuelve a
 * correr al volver a ella → datos stale. Este sí. Opt-in: la vista decide qué refrescar; el estado
 * en memoria (forms, scroll, carrito) se preserva.
 *
 * El `effect` se invoca por ref (siempre la última closure), así no hace falta meterlo en deps:
 * pasá solo las deps "de datos" (ej. branchId), igual que un useEffect. Si `effect` devuelve una
 * función de cleanup, se respeta (corre al ocultarse o antes del próximo run).
 */
export function useViewFocusEffect(
  effect: () => void | (() => void),
  deps: DependencyList = []
): void {
  const { isActive } = useTabContext()
  const effectRef = useRef(effect)
  effectRef.current = effect

  useEffect(() => {
    if (!isActive) return
    return effectRef.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, ...deps])
}
