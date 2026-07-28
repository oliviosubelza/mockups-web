import { useCallback } from 'react'
import { useActiveRouteValue } from './active-route'
import type { RouteConfig } from './types'

/**
 * Estado de "qué está activo" para las superficies de navegación (sidebar). La verdad es la URL:
 * `useActiveRouteValue()` resuelve el pathname contra el RouteRegistry con el matcher de
 * react-router, así que el resaltado es exact-match y rutas hermanas con prefijo común
 * (`/caja` y `/caja/history`) no se iluminan las dos a la vez.
 */
export function useActiveRoute() {
  const activeRoute = useActiveRouteValue()
  const activeRouteId = activeRoute?.routeId ?? null

  const isRouteActive = useCallback(
    (route: RouteConfig): boolean => route.id === activeRouteId,
    [activeRouteId]
  )

  const isChildActive = useCallback(
    (route: RouteConfig): boolean =>
      (route.children ?? []).some((child) => child.id === activeRouteId),
    [activeRouteId]
  )

  return { activeRoute, activeRouteId, isRouteActive, isChildActive }
}
