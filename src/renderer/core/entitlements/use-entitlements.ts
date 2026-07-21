import { useSyncExternalStore } from 'react'
import { entitlementsService } from './service'

function subscribe(onStoreChange: () => void): () => void {
  const sub = entitlementsService.onDidChange(onStoreChange)
  return () => sub.dispose()
}

/** Reactivo: ¿la sesión incluye este entitlement? (undefined/'' = gratis → siempre true). */
export function useEntitled(entitlement: string | undefined): boolean {
  return useSyncExternalStore(subscribe, () =>
    entitlement ? entitlementsService.isEntitled(entitlement) : true
  )
}
