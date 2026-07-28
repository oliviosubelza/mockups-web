import { RouteRegistry } from './route-registry'
import { routerRef } from './router-ref'
import { buildStickySearch } from './sticky-search'

/**
 * Navega a una ruta registrada por su ID. Es la forma de navegar imperativamente desde fuera de
 * React (sidebar, comandos, botones de las vistas, SDK): el llamador conoce el id y no el path, así
 * que cambiar una URL no rompe los call sites.
 *
 * Antes esto abría un tab y de paso navegaba. Ya no hay tabs: navega y punto — la URL es la verdad.
 * Dentro de React conviene `useNavigate()` o `<Link>`, que dan el comportamiento nativo del browser
 * (ctrl+click, abrir en pestaña nueva, hover con la URL destino).
 */
export function openRoute(routeId: string): void {
  const route = RouteRegistry.getRoute(routeId)
  if (!route) {
    console.warn(`[routing] openRoute('${routeId}') — no hay ninguna ruta registrada con ese id`)
    return
  }
  // `navigate(path)` descartaría el querystring: los knobs globales de vista se arrastran explícito.
  routerRef.navigate(`${route.path}${buildStickySearch()}`)
}
