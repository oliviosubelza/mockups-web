import { useMemo, useSyncExternalStore } from 'react'
import { matchRoutes, useLocation } from 'react-router'
import { LocationMirror } from './location-mirror'
import { RouteRegistry } from './route-registry'
import type { RouteConfig } from './types'

/**
 * Ruta ACTIVA (fuente de verdad única) = la que matchea el PATHNAME contra el RouteRegistry.
 *
 * Antes la verdad era el tab enfocado (modelo workbench con keep-alive). En web eso no aplica: hay
 * una sola vista viva a la vez y la URL manda — recargar, compartir un link o usar back/forward
 * tienen que caer en la misma pantalla. El registry sigue siendo el punto de inyección de rutas
 * (`RouteRegistry.register`); lo único que cambió es quién decide cuál está activa.
 *
 * El match lo hace `matchRoutes` de react-router y NO una comparación de strings a mano: rankea por
 * especificidad, así que rutas hermanas con prefijo común (`/caja` vs `/caja/history`) no se
 * iluminan las dos, y soporta params dinámicos (`/planes/:id`) cuando aparezcan.
 *
 * Superficie compartida: la consume el sidebar (resaltado), el shell (qué pinta) y el SDK
 * (`api.navigation`) — misma verdad para interno, externo y agentes.
 */
export interface ActiveRoute {
  readonly routeId: string
  readonly path: string
  readonly title: string
  /**
   * Params dinámicos ya resueltos (`/monitoreo/seguimiento/:ordenId` → `{ ordenId: 'ot4' }`).
   *
   * Viven acá y NO se leen con `useParams()` de react-router porque el shell renderiza la pantalla a
   * mano (`getRouteComponent(activeRoute.routeId)`), fuera de un `<Route element>`. Sin ese contexto
   * `useParams()` devuelve `{}` siempre y la pantalla se queda sin su id. `matchRoutes` ya los
   * calcula acá abajo; antes se descartaban.
   */
  readonly params: Readonly<Record<string, string | undefined>>
}

/** Resolución PURA pathname -> ruta registrada. Testeable en aislamiento, sin router ni DOM. */
export function resolveActiveRoute(pathname: string): ActiveRoute | null {
  // Los nodos sin `path` (encabezados de sección) no son navegables: no entran al match.
  const candidates = RouteRegistry.getAllRoutes()
    .filter((route) => route.path)
    .map((route) => ({ id: route.id, path: route.path }))

  const matches = matchRoutes(candidates, pathname)
  if (!matches || matches.length === 0) return null

  // El último match es el más profundo, o sea el más específico.
  const match = matches[matches.length - 1]
  const matchedId = match.route.id
  const config = matchedId ? RouteRegistry.getRoute(matchedId) : undefined
  if (!config) return null

  return { routeId: config.id, path: config.path, title: config.label, params: match.params }
}

// Cache del snapshot no-React: los consumidores con useSyncExternalStore exigen identidad estable
// mientras el valor no cambie.
let _cache: ActiveRoute | null = null
let _cachedPathname: string | null = null
let _cachedRoutes: RouteConfig[] | null = null

function _recompute(): ActiveRoute | null {
  const pathname = LocationMirror.get()
  // El snapshot del registry entra por IDENTIDAD y no por longitud: desregistrar y registrar la
  // misma cantidad de rutas cambia el match sin cambiar ni el pathname ni el largo.
  const routes = RouteRegistry.getAllRoutes()
  if (pathname !== _cachedPathname || routes !== _cachedRoutes) {
    _cachedPathname = pathname
    _cachedRoutes = routes
    _cache = resolveActiveRoute(pathname)
  }
  return _cache
}

export const ActiveRouteService = {
  /** Ruta que matchea la URL actual, o null si el pathname no corresponde a ninguna registrada. */
  get(): ActiveRoute | null {
    return _recompute()
  },

  /** El `RouteConfig` registrado de la ruta activa (incluye metadata: group, icon, etc.). */
  getRoute(): RouteConfig | undefined {
    const active = _recompute()
    return active ? RouteRegistry.getRoute(active.routeId) : undefined
  },

  /** Notifica en cada navegación y en cada cambio del registry. */
  subscribe(listener: (route: ActiveRoute | null) => void): () => void {
    const emit = () => {
      const prev = _cache
      const next = _recompute()
      if (next !== prev) listener(next)
    }
    const unsubscribeLocation = LocationMirror.subscribe(emit)
    const unsubscribeRoutes = RouteRegistry.subscribe(emit)
    return () => {
      unsubscribeLocation()
      unsubscribeRoutes()
    }
  },
}

/** Identidad del snapshot de rutas: re-resuelve el match si se registran o quitan rutas. */
function useRoutesSnapshot(): RouteConfig[] {
  return useSyncExternalStore(RouteRegistry.subscribe, RouteRegistry.getAllRoutes)
}

/**
 * Hook reactivo: la ruta activa. Lee `useLocation()` directo y no el espejo, para no quedar un
 * frame atrás del render.
 */
export function useActiveRouteValue(): ActiveRoute | null {
  const { pathname } = useLocation()
  const routes = useRoutesSnapshot()
  return useMemo(() => resolveActiveRoute(pathname), [pathname, routes])
}

/**
 * Params dinámicos de la ruta activa. Es el reemplazo de `useParams()` para las pantallas del shell,
 * que se renderizan fuera de un `<Route element>` (ver la nota en `ActiveRoute.params`).
 *
 * Devuelve `{}` cuando no hay ruta activa, así el llamador desestructura sin guardas.
 */
export function useRouteParams(): Readonly<Record<string, string | undefined>> {
  return useActiveRouteValue()?.params ?? {}
}
