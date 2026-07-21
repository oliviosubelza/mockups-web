import { useSyncExternalStore } from 'react'
import { enablementService } from './service'

function subscribe(onStoreChange: () => void): () => void {
  const sub = enablementService.onDidChange(onStoreChange)
  return () => sub.dispose()
}

/** Reactivo: ¿el plugin está habilitado? (default true mientras no haya configuración explícita). */
export function useEnabled(pluginId: string): boolean {
  return useSyncExternalStore(subscribe, () => enablementService.isEnabled(pluginId))
}

/**
 * Reactivo: predicado `isEnabled` que se re-evalúa cuando cambia el eje Enabled. Lo usa el
 * sidebar para ocultar rutas de plugins deshabilitados sin re-suscribir uno por uno. El snapshot
 * es la lista deshabilitada serializada (estable mientras no cambie → no fuerza re-render de más).
 */
export function useIsEnabled(): (pluginId: string | undefined) => boolean {
  useSyncExternalStore(subscribe, () => enablementService.listDisabled().join(','))
  return (pluginId) => (pluginId ? enablementService.isEnabled(pluginId) : true)
}
