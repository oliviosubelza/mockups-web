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
export function openRoute(routeId: string, params?: Record<string, string>): void {
  const route = RouteRegistry.getRoute(routeId)
  if (!route) {
    console.warn(`[routing] openRoute('${routeId}') — no hay ninguna ruta registrada con ese id`)
    return
  }

  // Sustitución de los `:param` del path. Va acá y no en cada call site para sostener la promesa del
  // módulo: el llamador conoce el ID de la ruta, nunca su URL. Si un día `/monitoreo/seguimiento/:id`
  // pasa a ser `/seguimiento/:id`, no se toca ni una vista.
  let path = route.path
  for (const [clave, valor] of Object.entries(params ?? {})) {
    path = path.replace(`:${clave}`, encodeURIComponent(valor))
  }

  // Falla ruidosa: un `:param` sin resolver navega a una URL literal con dos puntos que no matchea
  // nada, y la pantalla queda en blanco sin decir por qué.
  const faltante = path.match(/:([A-Za-z0-9_]+)/)
  if (faltante) {
    console.warn(`[routing] openRoute('${routeId}') — falta el parámetro '${faltante[1]}' para ${route.path}`)
    return
  }

  // `navigate(path)` descartaría el querystring: los knobs globales de vista se arrastran explícito.
  routerRef.navigate(`${path}${buildStickySearch()}`)
}
