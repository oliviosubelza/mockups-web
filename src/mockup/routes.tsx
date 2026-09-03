// Navegación como DATO (mismo patrón que mockup-native/src/navigation): cada destino se declara acá
// con su `path` y su `component`. El AppSidebar real se alimenta del RouteRegistry, así que
// registramos estas rutas ahí (`registerMockRoutes`) y el shell renderiza el `component` de la ruta
// que matchea la URL (ver active-route.ts + Mockup.tsx).
//
// Hay React Router: el `path` es una URL REAL. Cada pantalla es deep-linkeable, sobrevive un F5 y
// entra en el historial del browser (back/forward).
import { useMemo, type ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'
import { BarChart3, Boxes, Building2, ClipboardCheck, ClipboardList, FileClock, Flag, LandPlot, Map as MapIcon, PackageX, Radar, Receipt, Route, ShieldAlert, Tags } from 'lucide-react'
import { RouteRegistry } from '@/core/routing/route-registry'
import { openRoute } from '@/core/routing/open-route'
import type { RouteConfig } from '@/core/routing/types'
// DEPRECADO: el flujo por steps (`DispatchFlow`) ya no se navega. Queda importado solo para el
// fallback de `Mockup.tsx` cuando un tablero se arma con `fase` explícita.
import { PlansView } from './views/PlansView'
import { DeprecatedScreen } from './DeprecatedScreen'
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
import { ZonasWorkspaceView } from './zonas/ZonasWorkspaceView'
import { DistribucionWorkspaceView } from './distribucion/DistribucionWorkspaceView'
import { RestrictionsCatalogView } from './restricciones/RestrictionsCatalogView'
import { RestrictionDetailView } from './restricciones/RestrictionDetailView'
import { RestriccionesWorkspaceView } from './restricciones/RestriccionesWorkspaceView'
import { ActivosLogisticosView } from './views/ActivosLogisticosView'
import { HistorialOrdenesTransporteView } from './views/HistorialOrdenesTransporteView'
import { DetalleOrdenTransporteView } from './views/DetalleOrdenTransporteView'
import { HistorialRevisionesView } from './views/HistorialRevisionesView'
import { MonitoreoEHistorialOTView } from './views/MonitoreoEHistorialOTView'
import { CierreLogisticoView } from './views/CierreLogisticoView'
import {
  DevolucionDetalleScreen,
  DevolucionesListaScreen,
  MotivoDevolucionFormScreen,
  MotivosDevolucionScreen,
} from './devoluciones/rutas'
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
  /**
   * La ruta está retirada: sigue resolviendo (links viejos, favoritos) pero ya no se navega desde
   * la UI y `navigateTo` avisa por consola si algo la sigue llamando. `reemplazo` es el id de la
   * ruta que ocupó su lugar.
   */
  deprecated?: { motivo: string; reemplazo: string }
  /**
   * MÓDULO del sidebar. Las rutas que comparten el mismo `group` se dibujan anidadas bajo una
   * sección colapsable; las que no lo declaran quedan de primer nivel.
   *
   * NO ES JERARQUÍA DE URLS. El path de cada ruta sigue siendo absoluto y el matcher las sigue
   * viendo planas: agrupar es cómo se PRESENTA el menú, así que ningún link ni deep link cambia.
   *
   * El string ES el título de la sección (no hay label aparte), así que dos variantes del mismo
   * nombre son dos secciones distintas. De ahí que salga de una constante y no escrito a mano.
   */
  group?: string
  /** Dibuja un separador antes de esta sección/ítem en el sidebar (no si es el primero). */
  separatorBefore?: boolean
}

/**
 * Módulos del sidebar.
 *
 * Constante y no literales sueltos: el agrupado se hace comparando el string, así que un
 * "Planificacion" sin tilde en una sola ruta abriría una segunda sección con un solo hijo, y la
 * pantalla se vería bien pero mal ordenada. Con la constante eso lo agarra el compilador.
 */
export const MODULOS = {
  planificacion: 'Planificación',
  zonas: 'Zonas',
  devoluciones: 'Devoluciones',
  reportesEHistoriales: 'Reportes e Historiales',
} as const

// ── Pantallas (wrappers de vistas existentes con sus props por defecto) ──────────────────────────
// Las vistas del flujo toman props (`state`, `initialFase`); las rutas necesitan componentes sin
// props, así que se envuelven acá. El botón "Nueva planificación" de la lista entra al flujo.

function MonitoreoEHistorialScreen() {
  return <MonitoreoEHistorialOTView />
}

function MonitoreoEnVivoScreen() {
  return <MonitoreoEHistorialOTView initialTab="LIVE" />
}

function HistorialOrdenesScreen() {
  return <MonitoreoEHistorialOTView initialTab="HISTORY" />
}

function HistorialRevisionesScreen() {
  return <MonitoreoEHistorialOTView initialTab="AUDIT" />
}

function AnaliticaTurnoScreen() {
  return <MonitoreoEHistorialOTView initialTab="ANALYTICS" />
}

function CierreLogisticoScreen() {
  return <CierreLogisticoView />
}

function PlanificacionesScreen() {
  return (
    <PlansView
      state="default"
      onNew={() => {
        // "Nueva planificación" ya NO entra al flujo por steps (deprecado): abre el editor del mapa,
        // con el mismo arranque que usa `PlannerPlansView.handleNueva` (plan nuevo + activo).
        useDispatchPlanStore.getState().reset()
        const nuevo = usePlanesStore.getState().beginPlan()
        usePlanesStore.setState({ activePlanId: nuevo.id })
        navigateTo('planificacion-mapa-editor')
      }}
    />
  )
}

/**
 * @deprecated Reemplazada por el editor del mapa (`planificacion-mapa-editor`).
 *
 * Era el flujo por steps (camiones y pedidos → planificación → órdenes). Toda la planificación se
 * hace ahora sobre el mapa, así que la ruta queda como cartel: el que llegue por un link viejo ve
 * a dónde se mudó la pantalla en vez de un 404 o, peor, un flujo paralelo que nadie mantiene.
 */
function NuevaPlanificacionScreen() {
  return (
    <DeprecatedScreen
      titulo="El flujo por pasos se retiró"
      motivo="La planificación ahora se arma entera sobre el mapa: flota, pedidos y rutas en una sola pantalla."
      reemplazoRouteId="planificacion-mapa-editor"
      reemplazoLabel="Ir al editor del mapa"
      onAntesDeIr={() => {
        useDispatchPlanStore.getState().reset()
        const nuevo = usePlanesStore.getState().beginPlan()
        usePlanesStore.setState({ activePlanId: nuevo.id })
      }}
    />
  )
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
  // Sin contexto (refresh/URL directa) no hay nada que reoptimizar: antes caía al flujo por steps,
  // que quedó deprecado. Ahora vuelve al listado desde donde SE ELIGE el camión a finalizar.
  if (!camion) {
    return (
      <DeprecatedScreen
        titulo="No hay ningún camión en reoptimización"
        motivo="Esta pantalla necesita un camión unificado. Elegí uno desde el listado y usá 'Finalizar'."
        reemplazoRouteId="camiones"
        reemplazoLabel="Ir a Confirmar rutas"
      />
    )
  }
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
    // El `order` de una ruta agrupada es su lugar DENTRO de la sección, y la sección se ordena por
    // el menor `order` de sus hijos. Este 1 es el que le da a "Planificación" el primer lugar
    // después de Monitoreo, que es donde estaba esta pantalla cuando era un ítem suelto.
    order: 1,
    group: MODULOS.planificacion,
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
    // Bajó de 1 a 2 al agruparse Planificación: la sección hereda el `order` 1 de su primer hijo, y
    // con el empate el desempate lo decidía el orden de inserción (las secciones se agregan al
    // final), así que el módulo caía DEBAJO de estos dos ítems sueltos.
    order: 2,
  },
  // Listado de órdenes de transporte: reemplazado por 'camiones'. Se deja comentado para revertir.
  {
    id: 'ordenes-transporte',
    path: '/ordenes-transporte',
    label: 'Órdenes de transporte',
    icon: ClipboardCheck,
    component: OrdenesTransporteView,
    order: 2,
  },
  // ── Devoluciones ────────────────────────────────────────────────────────────────────────────
  // Dos pantallas y no cinco: el ALTA es de Ventas, que la registra contra nuestro servicio. De este
  // lado empieza el workflow, así que lo que hay es una bandeja y la pantalla donde se decide.
  {
    id: 'devoluciones',
    path: '/devoluciones',
    label: 'Devoluciones',
    icon: PackageX,
    component: DevolucionesListaScreen,
    order: 5,
    group: MODULOS.devoluciones,
    separatorBefore: true,
  },
  {
    id: 'devolucion-detalle',
    path: '/devoluciones/:id',
    label: 'Detalle de devolución',
    component: DevolucionDetalleScreen,
    order: 5,
    showInSidebar: false,
  },
  // DATO MAESTRO de devoluciones: el catálogo de MOTIVOS (`refund_reasons`).
  //
  // Va dentro de la sección «Devoluciones» y no junto a los otros datos maestros (Activos logísticos,
  // Zonas) porque el motivo no significa nada fuera de una devolución: quien entra a configurarlo
  // viene de mirar la bandeja, y ahí es donde lo va a buscar.
  {
    id: 'motivos-devolucion',
    path: '/motivos-devolucion',
    label: 'Motivos de devolución',
    icon: Tags,
    component: MotivosDevolucionScreen,
    // 6 y no 5: la sección hereda el MENOR `order` de sus hijos, así que el 5 de «Devoluciones» sigue
    // ubicando el módulo donde estaba y este cae segundo ADENTRO.
    order: 6,
    group: MODULOS.devoluciones,
  },
  {
    // Alta y edición van a la MISMA pantalla, igual que en zonas y restricciones: `/nuevo` entra
    // vacío y `/:id/editar` con la fila cargada. No son ítems del sidebar —se llega por el botón
    // del catálogo—, pero son URLs reales: sobreviven un F5 y se pueden compartir.
    id: 'motivo-devolucion-nuevo',
    path: '/motivos-devolucion/nuevo',
    label: 'Nuevo motivo de devolución',
    component: MotivoDevolucionFormScreen,
    order: 6,
    showInSidebar: false,
  },
  {
    id: 'motivo-devolucion-editar',
    path: '/motivos-devolucion/:id/editar',
    label: 'Editar motivo de devolución',
    component: MotivoDevolucionFormScreen,
    order: 6,
    showInSidebar: false,
  },
  {
    id: 'monitoreo-historial',
    path: '/monitoreo-historial',
    label: 'Monitoreo e Historial de OT',
    icon: Radar,
    component: MonitoreoEHistorialScreen,
    order: 0,
  },
  {
    id: 'cierre-logistico',
    path: '/cierre-logistico',
    label: 'Cierre y Liquidación OT',
    icon: Receipt,
    component: CierreLogisticoScreen,
    order: 0.5,
  },
  {
    id: 'monitoreo',
    path: '/monitoreo',
    label: 'Monitoreo',
    icon: Radar,
    component: MonitoreoEnVivoScreen,
    order: 0,
    showInSidebar: false,
  },
  {
    // Seguimiento arrancando desde un pedido comercial. Resuelve la orden y enfoca la parada que lo
    // contiene, sin inventar una segunda pantalla de detalle.
    id: 'monitoreo-detalle-pedido',
    path: '/monitoreo/seguimiento/pedido/:pedidoId',
    label: 'Seguimiento pedido',
    component: MonitoreoDetalleView,
    order: 3,
    showInSidebar: false,
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
    // DEPRECADA. El flujo por steps se retiró; la ruta sobrevive solo para no romper links viejos.
    id: 'nueva-planificacion',
    path: '/planificaciones/nueva',
    label: 'Nueva planificación (deprecado)',
    component: NuevaPlanificacionScreen,
    order: 2,
    // Es una ACCIÓN (se llega por el botón de la lista), no un lugar fijo del sidebar.
    showInSidebar: false,
    deprecated: {
      motivo: 'El flujo por steps se reemplazó por el editor del mapa.',
      reemplazo: 'planificacion-mapa-editor',
    },
  },
  {
    // Lista de planificaciones del mapa interactivo con histórico y botón de nueva planificación.
    id: 'planificacion-mapa',
    path: '/planificaciones/mapa',
    label: 'Planificación mapa',
    icon: MapIcon,
    component: PlannerPlansScreen,
    order: 2,
    group: MODULOS.planificacion,
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
  // ── Zonas ───────────────────────────────────────────────────────────────────────────────────
  // Tres cortes distintos del MISMO territorio, y por eso van juntos bajo una sección en vez de
  // sueltos: quien viene a dibujar un polígono tiene que elegir primero cuál de los tres está
  // dibujando, y con los ítems sueltos esa elección no se veía —«Restricciones» ni siquiera decía
  // que fuera algo geográfico—.
  //
  //   · Zonas logísticas   (`zones`)              → con qué otras paradas viaja el pedido.
  //   · Zonas de distribución (`distribution_zones`) → qué distribuidora lo despacha.
  //   · Restricciones      (`planning_restrictions`) → por dónde y cuándo NO se puede pasar.
  //
  // Siguen siendo tres pantallas y no pestañas de una: un pedido cae en una zona de cada tipo y no
  // tienen por qué coincidir, así que mezclarlas haría creer que un polígono sirve para las tres.
  //
  // LOS TRES VAN CON `order: 3`. La sección hereda el MENOR `order` de sus hijos, así que ese 3 es
  // el que la ubica entre «Órdenes de transporte» (2) y «Activos logísticos» (4). Entre hermanos
  // empatados manda el orden de este array, que es el de arriba.
  {
    // Dato maestro: zonas de reparto por ciudad. No es una acción de un plan puntual, es un
    // perímetro que muchos planes van a reusar.
    //
    // UNA sola pantalla para las tres rutas de zonas: el mapa es el contenido y el listado flota
    // encima. Antes eran dos —tabla acá, editor a pantalla completa en las otras dos— y para tocar
    // una zona había que entrar de a una desde la tabla, sin ver nunca dos zonas juntas.
    id: 'zonas',
    path: '/zonas',
    // «Zonas logísticas» y no «Zonas» a secas: dentro de una sección llamada «Zonas», un hijo
    // llamado igual que el padre no dice cuál de las tres es. Es además el título que la propia
    // pantalla usa en su panel flotante.
    label: 'Zonas logísticas',
    icon: LandPlot,
    component: ZonasWorkspaceView,
    order: 3,
    fullBleed: true,
    // El separador lo hereda la SECCIÓN (se toma con un `.some()` sobre los hijos), así que la línea
    // sale arriba del encabezado «Zonas» y no entre dos ítems de adentro.
    separatorBefore: true,
    group: MODULOS.zonas,
  },
  {
    // Entra al mismo workspace pero arrancando en modo dibujo. Se conserva como ruta propia para no
    // romper links viejos y para que "nueva zona" sea compartible por URL.
    id: 'zona-nueva',
    path: '/zonas/nueva',
    label: 'Nueva zona',
    component: ZonasWorkspaceView,
    order: 2,
    fullBleed: true,
    showInSidebar: false,
  },
  {
    // Ídem, arrancando en modo edición sobre la zona del path.
    id: 'zona-editar',
    path: '/zonas/:zonaId/editar',
    label: 'Editar zona',
    component: ZonasWorkspaceView,
    order: 2,
    fullBleed: true,
    showInSidebar: false,
  },
  {
    // Dato maestro: la partición de la ciudad entre DISTRIBUIDORAS (`distribution_zones`).
    //
    // Ítem aparte de «Zonas» y no una pestaña dentro, porque son dos cortes independientes del mismo
    // territorio y contestan preguntas distintas: la zona logística dice con qué otras paradas viaja el
    // pedido; la de distribución, quién lo despacha. Un pedido cae en una de cada tipo, y no tienen por
    // qué coincidir. Mezclarlas en una sola pantalla haría creer que un polígono sirve para las dos cosas.
    //
    // Va INMEDIATAMENTE después de Zonas logísticas: comparten editor, y quien entiende una
    // entiende la otra.
    id: 'zonas-distribucion',
    path: '/zonas-distribucion',
    // Antes decía «Centros de distribución», que nombraba el DEPÓSITO y no el polígono. Lo que esta
    // pantalla administra es el territorio que cada distribuidora despacha (`distribution_zones`);
    // el depósito es apenas el ícono desde el que se recorta.
    label: 'Zonas de distribución',
    icon: Building2,
    component: DistribucionWorkspaceView,
    order: 3,
    fullBleed: true,
    group: MODULOS.zonas,
  },
  {
    // Dato maestro independiente de las zonas logísticas: comparte la sección porque también recorta
    // el mapa, pero sus horarios y reglas vehiculares forman un agregado propio y nunca se mezclan
    // con la partición territorial de reparto.
    //
    // El label NO dice «Zonas restringidas» aunque la sección sea «Zonas»: acá adentro también viven
    // las restricciones POR PLACA, que no tienen polígono que dibujar. Llamarlas zona dejaría a esas
    // filas sin nombre en el único lugar donde se las administra.
    id: 'restricciones',
    path: '/restricciones',
    label: 'Restricciones',
    icon: ShieldAlert,
    component: RestrictionsCatalogView,
    order: 3,
    group: MODULOS.zonas,
  },
  {
    // Alta y edición van al MISMO workspace de mapa a sangre, igual que en zonas: `/nueva` entra
    // dibujando y `/:id/editar` entra con la geometría cargada. El catálogo (`/restricciones`) se queda
    // con su tabla, que da columnas que un mapa no puede dar —auditoría, vigencia en texto, y las de
    // tipo placa, que no tienen nada que dibujar—.
    id: 'restriccion-nueva',
    path: '/restricciones/nueva',
    label: 'Nueva restricción',
    component: RestriccionesWorkspaceView,
    order: 3,
    fullBleed: true,
    showInSidebar: false,
  },
  {
    id: 'restriccion-detalle',
    path: '/restricciones/:restrictionId',
    label: 'Detalle de restricción',
    component: RestrictionDetailView,
    order: 3,
    showInSidebar: false,
  },
  {
    // Ídem, arrancando en modo edición sobre la restricción del path.
    id: 'restriccion-editar',
    path: '/restricciones/:restrictionId/editar',
    label: 'Editar restricción',
    component: RestriccionesWorkspaceView,
    order: 3,
    fullBleed: true,
    showInSidebar: false,
  },
  {
    // Dato maestro: catálogo del BANDEO (`logistic_assets`) — pallets, carritos, jabas, refrigeradores.
    // Ítem propio del sidebar y no una pestaña dentro de la planificación: se da de alta una vez y lo
    // usan muchas OTs, igual que Zonas. Que además se vaya a ELEGIR desde la planificación no lo
    // convierte en parte de ella (los camiones también se eligen ahí y son dato maestro aparte).
    //
    // Va después de la sección «Zonas» a propósito: los dos son dato maestro y el sidebar los deja
    // juntos. `order: 4` y ya no 3: la sección hereda el 3 de sus hijos, y con el empate el
    // desempate lo decidía el orden de inserción —los ítems sueltos se agregan ANTES que las
    // secciones—, así que este caía por encima de Zonas. Mismo tropiezo que ya tuvo «Confirmar
    // rutas» cuando se agrupó Planificación.
    id: 'activos-logisticos',
    path: '/activos-logisticos',
    label: 'Activos logísticos',
    icon: Boxes,
    component: ActivosLogisticosView,
    order: 4,
  },
  {
    // Módulo Unificado: Historial de órdenes de transporte (redirecciona a Tab 2 del Hub)
    id: 'historial-ordenes-transporte',
    path: '/reportes/historial-ordenes-transporte',
    label: 'Historial de órdenes de transporte',
    icon: FileClock,
    component: HistorialOrdenesScreen,
    order: 4,
    showInSidebar: false,
  },
  {
    // Módulo Unificado: Historial de revisiones y conteos (redirecciona a Tab 3 del Hub)
    id: 'historial-revisiones',
    path: '/reportes/historial-revisiones',
    label: 'Historial de revisiones',
    icon: ClipboardCheck,
    component: HistorialRevisionesScreen,
    order: 5,
    showInSidebar: false,
  },
  {
    // Módulo Unificado: Analítica y Reportes del Turno (redirecciona a Tab 4 del Hub)
    id: 'analitica-turno',
    path: '/reportes/analitica-turno',
    label: 'Analítica del Turno',
    icon: BarChart3,
    component: AnaliticaTurnoScreen,
    order: 6,
    showInSidebar: false,
  },
  {
    // Detalle de orden de transporte individual (tiempos en parada, productos, cobros, POD)
    id: 'detalle-orden-transporte',
    path: '/reportes/historial-ordenes-transporte/:otId',
    label: 'Detalle de orden de transporte',
    component: DetalleOrdenTransporteView,
    order: 4,
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
    // Sin estas dos, `MockRoute.group` sería un campo que nadie lee: el sidebar arma sus secciones
    // desde el `RouteConfig` del registro, no desde esta lista.
    group: route.group,
    separatorBefore: route.separatorBefore,
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
export function navigateTo(routeId: string, params?: Record<string, string>): void {
  // Una ruta deprecada sigue navegable (links viejos), pero si el que la llama es NUESTRA propia UI
  // es un bug: alguien quedó apuntando a la pantalla retirada. Falla ruidosa en consola.
  const deprecada = findRoute(routeId)?.deprecated
  if (deprecada) {
    console.warn(
      `[routing] navigateTo('${routeId}') apunta a una ruta DEPRECADA. ${deprecada.motivo} Usá '${deprecada.reemplazo}'.`,
    )
  }
  openRoute(routeId, params)
}
