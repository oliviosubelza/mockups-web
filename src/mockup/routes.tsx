// Navegación del mockup como DATO (mismo patrón que mockup-native/src/navigation): cada destino se
// declara acá con su `component`, y un método (`navigateTo`) lo abre. El AppSidebar real se alimenta
// del RouteRegistry, así que registramos estas rutas ahí (`registerMockRoutes`) y el shell renderiza
// el `component` de la ruta ACTIVA (ver ActiveRouteView en Mockup.tsx). No hay React Router en el
// mockup: `openRoute` solo abre/activa un tab (su navigate interno es no-op sin router).
import { useMemo, type ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ClipboardList, Truck } from 'lucide-react'
import { RouteRegistry } from '@/core/routing/route-registry'
import { openRoute, useTabStore } from '@/core/tabs'
import type { RouteConfig } from '@/core/routing/types'
import { DispatchFlow } from './DispatchFlow'
import { PlansView } from './views/PlansView'
// Listado de órdenes de transporte: reemplazado por el listado de CAMIONES (ver CamionesView). Se deja
// el import comentado, no borrado, para poder revertir el flujo si hiciera falta.
import { OrdenesTransporteView } from './views/OrdenesTransporteView'
import { CamionesView } from './views/CamionesView'
import { PlanningView } from './views/PlanningView'
import { CAMIONES, PARADAS } from './mock-data'
import { useUnifyStore } from './unify-store'

/**
 * Un destino navegable del mockup. Espejo reducido del `RouteInterface` de mockup-native: la ruta se
 * define como dato (id, path, label, icon, component) y el registro/navegación la consumen.
 */
export interface MockRoute {
  /** Id estable: clave del tab, resaltado del sidebar y lookup del component. */
  id: string
  /** Path del tab (dedupe del tab store). No hay router: es identidad, no URL real. */
  path: string
  label: string
  icon?: LucideIcon
  /** Pantalla que el shell renderiza cuando esta ruta es la activa. */
  component: ComponentType
  order?: number
  /** `false` la mantiene navegable (por botón/comando) pero fuera del sidebar. */
  showInSidebar?: boolean
}

// ── Pantallas (wrappers de vistas existentes con sus props por defecto) ──────────────────────────
// Las vistas del flujo toman props (`state`, `initialFase`); las rutas necesitan componentes sin
// props, así que se envuelven acá. El botón "Nueva planificación" de la lista entra al flujo.

function PlanificacionesScreen() {
  return <PlansView state="default" onNew={() => navigateTo('nueva-planificacion')} />
}

function NuevaPlanificacionScreen() {
  // El flujo de steps actual arranca en el paso 0 (Camiones y pedidos).
  return <DispatchFlow state="default" initialFase={0} />
}

// Pantalla del listado de órdenes de transporte: comentada mientras el sidebar lista CAMIONES.
// function OrdenesTransporteScreen() {
//   return <OrdenesTransporteView />
// }

function CamionesScreen() {
  return <CamionesView />
}

function ReoptimizarScreen() {
  // Destino tras unificar (opción B del doc 11): el planificador directo en el MAPA, scopeado a las
  // paradas unificadas del camión. Como es UN camión, todas las paradas se reasignan a él (un solo
  // color) y al optimizar se dibuja UNA sola ruta — ya no las 4 del plan completo.
  const { camion, paradaIds } = useUnifyStore()
  const target = camion ? CAMIONES.find((c) => c.placa === camion) : undefined
  const scope = useMemo(
    () => PARADAS.filter((p) => paradaIds.includes(p.id)).map((p) => ({ ...p, camionId: target?.id ?? p.camionId })),
    [paradaIds, target?.id],
  )
  // Sin contexto (refresh/URL directa) cae al plan completo.
  if (!camion) return <DispatchFlow state="default" initialFase={1} planningTab="mapa" />
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PlanningView
        state="default"
        paradasScope={scope}
        scopeLabel={`Reoptimizando ${camion} · ${scope.length} paradas`}
        singleRoute
        routeColor={target?.color}
        readOnly
        onNext={() => navigateTo('camiones')}
      />
    </div>
  )
}

// ── Rutas ────────────────────────────────────────────────────────────────────────────────────
export const routes: MockRoute[] = [
  {
    id: 'planificaciones',
    path: '/planificaciones',
    label: 'Planificaciones',
    icon: ClipboardList,
    component: PlanificacionesScreen,
    order: 0,
  },
  {
    id: 'camiones',
    path: '/camiones',
    label: 'Camiones',
    icon: Truck,
    component: CamionesScreen,
    order: 1,
  },
  // Listado de órdenes de transporte: reemplazado por 'camiones'. Se deja comentado para revertir.
  {
    id: 'ordenes-transporte',
    path: '/ordenes-transporte',
    label: 'Órdenes de transporte',
    // icon: ClipboardCheck,
    component: OrdenesTransporteView,
    order: 1,
  },
  {
    id: 'nueva-planificacion',
    path: '/planificaciones/nueva',
    label: 'Nueva planificación',
    component: NuevaPlanificacionScreen,
    order: 2,
    // Es una ACCIÓN (se llega por el botón de la lista), no un lugar fijo del sidebar.
    showInSidebar: false,
  },
  {
    id: 'reoptimizar-plan',
    path: '/ordenes-transporte/reoptimizar',
    label: 'Reoptimizar',
    component: ReoptimizarScreen,
    order: 3,
    // Destino de la acción "Unificar": no es un lugar del sidebar.
    showInSidebar: false,
  },
]

/** Ruta por id. */
export function findRoute(id: string): MockRoute | undefined {
  return routes.find((r) => r.id === id)
}

/** Component de la ruta activa (lo usa el shell para pintar el contenido). */
export function getRouteComponent(id: string): ComponentType | undefined {
  return findRoute(id)?.component
}

/** MockRoute → RouteConfig del core (el sidebar y los tabs leen desde el RouteRegistry). */
function toRouteConfig(route: MockRoute): RouteConfig {
  return {
    id: route.id,
    path: route.path,
    label: route.label,
    icon: route.icon,
    element: null,
    order: route.order,
    showInSidebar: route.showInSidebar,
  }
}

/**
 * Registra las rutas en el RouteRegistry y deja abierta la de entrada (Planificaciones). Se limpian
 * los tabs primero para que el mockup arranque siempre igual (el tab store persiste en localStorage).
 */
export function registerMockRoutes(entryId = 'planificaciones'): void {
  RouteRegistry.register(routes.map(toRouteConfig))
  useTabStore.setState({ tabs: [], activeTabId: null })
  navigateTo(entryId)
}

/** Navega a una ruta por id: abre (o reactiva) su tab. Este es "el método" al que se le pasa la ruta. */
export function navigateTo(routeId: string): void {
  openRoute(routeId)
}
