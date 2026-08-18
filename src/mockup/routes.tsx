// Navegación como DATO (mismo patrón que mockup-native/src/navigation): cada destino se declara acá
// con su `path` y su `component`. El AppSidebar real se alimenta del RouteRegistry, así que
// registramos estas rutas ahí (`registerMockRoutes`) y el shell renderiza el `component` de la ruta
// que matchea la URL (ver active-route.ts + Mockup.tsx).
//
// Hay React Router: el `path` es una URL REAL. Cada pantalla es deep-linkeable, sobrevive un F5 y
// entra en el historial del browser (back/forward).
import { useMemo, type ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ClipboardCheck, ClipboardList, Flag, LandPlot, Map as MapIcon, Radar, Route } from 'lucide-react'
import { RouteRegistry } from '@/core/routing/route-registry'
import { openRoute } from '@/core/routing/open-route'
import type { RouteConfig } from '@/core/routing/types'
import { DispatchFlow } from './DispatchFlow'
import { PlansView } from './views/PlansView'
// Listado de órdenes de transporte: reemplazado por el listado de CAMIONES (ver CamionesView). Se deja
// el import comentado, no borrado, para poder revertir el flujo si hiciera falta.
import { OrdenesTransporteView } from './views/OrdenesTransporteView'
import { CamionesView } from './views/CamionesView'
import { OrdersView } from './views/OrdersView'
import { MonitoreoView } from './monitoreo/MonitoreoView'
import { MonitoreoDetalleView } from './monitoreo/MonitoreoDetalleView'
import { PlanningView } from './views/PlanningView'
import { PlannerView } from './planner/PlannerView'
import { PlannerPlansView } from './planner/PlannerPlansView'
import { ZonasView } from './zonas/ZonasView'
import { ZonaEditorView } from './zonas/ZonaEditorView'
import { CAMIONES, PARADAS } from './mock-data'
import { useUnifyStore } from './unify-store'
import { useDispatchPlanStore } from './dispatch-plan-store'
import { usePlanesStore } from './planes-store'
import { useTransportOrdersStore } from './transport-orders-store'

/**
 * Un destino navegable. Espejo reducido del `RouteInterface` de mockup-native: la ruta se define
 * como dato (id, path, label, icon, component) y el registro/navegación la consumen.
 */
export interface MockRoute {
  /** Id estable: resaltado del sidebar, `openRoute(id)` y lookup del component. */
  id: string
  /** URL real de la pantalla. Es lo que se ve en la barra de direcciones y lo que se puede compartir. */
  path: string
  label: string
  icon?: LucideIcon
  /** Pantalla que el shell renderiza cuando esta ruta es la activa. */
  component: ComponentType
  order?: number
  /** `false` la mantiene navegable (por botón/comando) pero fuera del sidebar. */
  showInSidebar?: boolean
  /**
   * La pantalla se dibuja sin el padding de 16 px del shell. Solo para las que el contenido ES el
   * fondo (mapas a sangre): ahí ese padding es un marco que le roba ancho y alto a lo único que la
   * pantalla muestra.
   */
  fullBleed?: boolean
}

// ── Pantallas (wrappers de vistas existentes con sus props por defecto) ──────────────────────────
// Las vistas del flujo toman props (`state`, `initialFase`); las rutas necesitan componentes sin
// props, así que se envuelven acá. El botón "Nueva planificación" de la lista entra al flujo.

function PlanificacionesScreen() {
  return (
    <PlansView
      state="default"
      onNew={() => {
        useDispatchPlanStore.getState().reset()
        usePlanesStore.getState().beginPlan()
        navigateTo('nueva-planificacion')
      }}
    />
  )
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

function RutasCreadasScreen() {
  return <OrdersView state="default" />
}

function PlannerPlansScreen() {
  return <PlannerPlansView />
}

function ReoptimizarScreen() {
  // Destino tras unificar (opción B del doc 11): el planificador directo en el MAPA, scopeado a las
  // paradas unificadas del camión. Como es UN camión, todas las paradas se reasignan a él (un solo
  // color) y al optimizar se dibuja UNA sola ruta — ya no las 4 del plan completo.
  const { camion, camionId, planId, paradaIds, orderIds, planningRouteRefs, chofer, auxiliar } = useUnifyStore()
  const planes = usePlanesStore((store) => store.planes)
  const transportOrders = useTransportOrdersStore((store) => store.orders)
  const finalizeConfirmedTrip = useTransportOrdersStore((store) => store.finalizeConfirmedTrip)
  const target = camion ? CAMIONES.find((c) => c.placa === camion) : undefined
  const operationalStops = useMemo(
    () => transportOrders.flatMap((order) => order.paradas ?? []),
    [transportOrders],
  )
  const plannedStops = useMemo(
    () => planes.flatMap((plan) => (plan.camionesDetalle ?? []).flatMap((route) => route.paradas ?? [])),
    [planes],
  )
  const scope = useMemo(
    () => [...PARADAS, ...plannedStops, ...operationalStops]
      .filter((p) => paradaIds.includes(p.id))
      .map((p) => {
        const camionId = target?.id ?? p.camionId
        const rutaId = camionId ? `r-${camionId}` : p.rutaId
        return {
          ...p,
          camionId,
          rutaId,
          pedidos: p.pedidos.map((pedido) => ({ ...pedido, camionId, rutaId })),
        }
      }),
    [operationalStops, paradaIds, plannedStops, target?.id],
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
        readOnlyActionLabel="Iniciar despacho"
        onReadOnlyConfirm={() =>
          finalizeConfirmedTrip({
            planId,
            camionId: camionId ?? target?.id ?? null,
            camion,
            chofer,
            auxiliar,
            paradaIds,
            paradas: scope,
            orderIds,
            planningRouteRefs,
          })
        }
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
    order: 1,
  },
  {
    id: 'camiones',
    path: '/camiones',
    // No es el dato maestro "Camiones": es la acción de FINALIZAR un camión (botón de la fila →
    // selección de órdenes → reoptimizar). El label nombra la acción, no la entidad.
    // "Finalizar" es el verbo de dominio en toda la vista (botón, título del diálogo,
    // `puedeFinalizar`); "confirmar" queda reservado al OK del modal.
    label: 'Confirmar rutas',
    icon: Flag,
    component: CamionesScreen,
    order: 1,
  },
  // Listado de órdenes de transporte: reemplazado por 'camiones'. Se deja comentado para revertir.
  {
    id: 'ordenes-transporte',
    path: '/ordenes-transporte',
    label: 'Órdenes de transporte',
    icon: ClipboardCheck,
    component: OrdenesTransporteView,
    order: 1,
  },
  {
    id: 'monitoreo',
    path: '/monitoreo',
    label: 'Monitoreo',
    icon: Radar,
    component: MonitoreoView,
    order: 0,
  },
  {
    // Detalle de seguimiento (mapa + paradas). Se llega desde una fila del listado, no del sidebar:
    // sin una orden elegida no hay nada que seguir. Mismo patrón que 'reoptimizar-plan'.
    //
    // La orden va EN LA URL, no en un store. Antes vivía en zustand y un F5 dejaba la pantalla en
    // "No hay ninguna orden en seguimiento": el estado moría con el refresh. Con el id en el path la
    // URL es compartible, el back/forward funciona y recargar reconstruye el contexto solo.
    id: 'monitoreo-detalle',
    path: '/monitoreo/seguimiento/:ordenId',
    label: 'Seguimiento',
    component: MonitoreoDetalleView,
    order: 3,
    showInSidebar: false,
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
    // Lista de planificaciones del mapa interactivo con histórico y botón de nueva planificación.
    id: 'planificacion-mapa',
    path: '/planificaciones/mapa',
    label: 'Planificación mapa',
    icon: MapIcon,
    component: PlannerPlansScreen,
    order: 2,
  },
  {
    // Vista del mapa a pantalla completa para crear / editar una planificación en vivo.
    id: 'planificacion-mapa-editor',
    path: '/planificaciones/mapa/editor',
    label: 'Planificación mapa',
    icon: MapIcon,
    component: PlannerView,
    order: 2,
    fullBleed: true,
    showInSidebar: false,
  },
  {
    // Dato maestro: zonas de reparto por ciudad. Ítem propio en el sidebar — no es una acción de
    // un plan puntual, es un perímetro que muchos planes van a reusar.
    id: 'zonas',
    path: '/zonas',
    label: 'Zonas',
    icon: LandPlot,
    component: ZonasView,
    order: 2,
  },
  {
    // Dibujar el polígono es un mapa a pantalla completa, no un modal: mismo criterio que el
    // editor de planificación. Sin id en la URL → zona nueva.
    id: 'zona-nueva',
    path: '/zonas/nueva',
    label: 'Nueva zona',
    component: ZonaEditorView,
    order: 2,
    fullBleed: true,
    showInSidebar: false,
  },
  {
    id: 'zona-editar',
    path: '/zonas/:zonaId/editar',
    label: 'Editar zona',
    component: ZonaEditorView,
    order: 2,
    fullBleed: true,
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
  {
    id: 'rutas-creadas',
    path: '/planificaciones/rutas-creadas',
    label: 'Rutas creadas',
    icon: Route,
    component: RutasCreadasScreen,
    order: 3,
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

/** Id de la ruta de entrada: a dónde va `/`. */
export const ENTRY_ROUTE_ID = 'planificaciones'

/** Path de la ruta de entrada. Lo usa el entry para reescribir `/` antes de montar el router. */
export const ENTRY_ROUTE_PATH = findRoute(ENTRY_ROUTE_ID)?.path ?? '/'

/**
 * Registra las rutas en el RouteRegistry (punto de inyección: de ahí leen el sidebar y el
 * resolvedor de ruta activa). NO navega: la URL es la fuente de verdad, y forzar un destino acá
 * era justamente lo que rompía el F5 y los deep links.
 */
export function registerMockRoutes(): void {
  RouteRegistry.register(routes.map(toRouteConfig))
}

/** Navega a una ruta por id. Este es "el método" al que se le pasa la ruta. */
export function navigateTo(routeId: string): void {
  openRoute(routeId)
}
