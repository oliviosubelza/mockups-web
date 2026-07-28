import { ActiveRouteService } from '@/core/routing/active-route'
import { contextKeyService } from './context-key-service'

export { contextKeyService }

/**
 * Context keys básicas del shell, derivadas de la RUTA ACTIVA (o sea, de la URL). Se mantienen en
 * sync por suscripción — cualquier `when` que las use re-evalúa solo.
 *
 * `workbench.openTabCount` desapareció junto con los tabs: en web hay una sola vista a la vez.
 */
export function setupShellContextKeys(): void {
  const sync = () => {
    contextKeyService.bulkUpdate({
      'workbench.activeRouteId': ActiveRouteService.get()?.routeId ?? '',
    })
  }
  sync()
  ActiveRouteService.subscribe(sync)
}
