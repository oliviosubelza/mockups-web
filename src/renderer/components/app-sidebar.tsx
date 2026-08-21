import { Fragment, useEffect, useState } from 'react'
import { ChevronRight, Lock, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { MenuId } from '@keel/platform'
import { cn } from '@/lib/utils'
import { commandRegistry } from '@/core/commands/command-registry'
import { useMenuItems, type ResolvedMenuItem } from '@/core/menus/use-menu-items'
import { MenuIcon } from '@/core/menus/menu-icon'
import { openRoute } from '@/core/routing/open-route'
import { useActiveRoute } from '@/core/routing/use-active-route'
import { useRoutes } from '@/core/routing/route-registry'
import { SIDEBAR_ICON_THRESHOLD, useSidebarWidthStore } from '@/core/sidebar/use-sidebar-resize'
import { useAppearanceStore } from '@/core/appearance/appearance-store'
import { useAuthStore } from '@/core/auth/store'
import { useEntitled } from '@/core/entitlements'
import { useIsEnabled } from '@/core/enablement'
import { resolveContribLabel } from '@/core/i18n'
import type { RouteConfig } from '@/core/routing/types'

type TFn = (key: string, opts?: Record<string, unknown>) => string

/**
 * Label visible de una ruta/sección: la `label` del manifest del plugin resuelta en su namespace
 * i18n (fallback al texto crudo si el plugin no trae locales). Las rutas/secciones del core sin
 * `pluginId` se muestran tal cual.
 */
function routeLabel(t: TFn, route: RouteConfig): string {
  return route.pluginId ? resolveContribLabel(t, route.pluginId, route.label) : route.label
}

/**
 * Arma el árbol del sidebar a partir de rutas planas: las que tienen `group` se anidan bajo un
 * nodo de SECCIÓN sintético (colapsable, no navegable); las demás quedan de primer nivel. Las
 * secciones se ordenan por el menor `order` de sus hijos. Permite que varios plugins de un mismo
 * vertical aporten vistas agrupadas (ej. "Distribuidora").
 */
function buildSidebarTree(routes: RouteConfig[]): RouteConfig[] {
  const groups = new Map<string, RouteConfig[]>()
  const topLevel: RouteConfig[] = []
  for (const r of routes) {
    if (r.group) {
      const arr = groups.get(r.group) ?? []
      arr.push(r)
      groups.set(r.group, arr)
    } else {
      topLevel.push(r)
    }
  }
  const nodes: RouteConfig[] = [...topLevel]
  for (const [group, children] of groups) {
    const sorted = [...children].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    nodes.push({
      id: `group:${group}`,
      path: '',
      label: group,
      // El encabezado de sección hereda el ícono y el separador declarados por sus rutas. Si
      // ninguna ruta declaró groupIcon, cae al ícono de su primera ruta (importa en icon-only,
      // donde la sección se representa SOLO por su ícono con flyout).
      iconName: sorted.find((c) => c.groupIcon)?.groupIcon ?? sorted.find((c) => c.iconName)?.iconName,
      icon: sorted.find((c) => c.icon)?.icon,
      separatorBefore: sorted.some((c) => c.separatorBefore),
      element: null,
      showInSidebar: true,
      order: Math.min(...sorted.map((c) => c.order ?? 0)),
      // El label del grupo (`group` del manifest) se resuelve en el namespace del plugin dueño.
      pluginId: sorted.find((c) => c.pluginId)?.pluginId,
      children: sorted,
    })
  }
  return nodes.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

/** Ícono de una ruta: por nombre lucide (plugins) o componente (rutas internas). */
function RouteIcon({ route, size }: { route: RouteConfig; size: number }) {
  const style = { width: size, height: size }
  if (route.iconName) return <MenuIcon name={route.iconName} style={style} />
  if (route.icon) {
    const Icon = route.icon
    return <Icon style={style} />
  }
  return null
}

/**
 * Glifo de una ruta para el modo icon-only (minimizado): el ícono declarado o, si la ruta no
 * trae ninguno, un monograma con la inicial del label. Sin esto un item sin ícono quedaba
 * INVISIBLE (botón vacío que solo se notaba al hover por el fondo). Mismo recurso que usa
 * IconMenuActionItem para los items de menú sin ícono.
 */
function RouteGlyph({ route, size }: { route: RouteConfig; size: number }) {
  const { t } = useTranslation()
  if (route.iconName || route.icon) return <RouteIcon route={route} size={size} />
  return (
    <span className="text-[11px] font-semibold uppercase leading-none">
      {routeLabel(t, route).charAt(0)}
    </span>
  )
}

function canAccess(route: RouteConfig, userRole: string | undefined): boolean {
  if (route.roles && route.roles.length > 0) {
    if (!userRole || !route.roles.includes(userRole)) return false
  }
  const visibleChildren = (route.children ?? []).filter((c) => c.showInSidebar !== false)
  if (visibleChildren.length > 0) {
    return visibleChildren.some((c) => canAccess(c, userRole))
  }
  return true
}

// ─── Full mode ───────────────────────────────────────────────────────────────

// Label de un item de navegación: ocupa el ancho disponible y, si el nombre no entra, envuelve a
// DOS líneas (line-clamp-2) — independiente de qué adorno (lock/chevron) quede al final. El
// truncado NO depende del `span:last-child`: así el wrap es estable aparezca o no un adorno.
const navLabelClass = 'min-w-0 flex-1 text-left leading-tight break-words line-clamp-2'

// Fondo de las cabeceras de grupo/sección (menú padre) — color de marca, para diferenciarlas de
// los items de navegación. Se aplica por `style` (inline) para que gane sobre los estados
// active/hover del SidebarMenuButton; el texto/íconos lo heredan vía currentColor. Sale del token
// (no de un hex fijo) → sigue al theme claro/oscuro y a cualquier cambio de color primario.
const GROUP_HEADER_BG = 'hsl(var(--primary))'
const GROUP_HEADER_FG = 'hsl(var(--primary-foreground))'

function NavItem({ route }: { route: RouteConfig }) {
  const { t } = useTranslation()
  const { isRouteActive, isChildActive } = useActiveRoute()
  const iconSize = useAppearanceStore((s) => s.sidebarIconSize)
  const userRole = useAuthStore((s) => s.user?.role)
  // Gating declarativo (§9 nivel 1): el item gated se ve LOCKED, no se oculta (upsell).
  const entitled = useEntitled(route.entitlement)

  const hasChildren = (route.children ?? []).length > 0
  const active = isRouteActive(route)
  const childActive = hasChildren && isChildActive(route)
  // Las secciones (grupos) arrancan expandidas para que sus items se vean.
  const [expanded, setExpanded] = useState(hasChildren ? true : childActive)

  useEffect(() => {
    if (childActive) setExpanded(true)
  }, [childActive])

  if (hasChildren) {
    const children = (route.children ?? [])
      .filter((c) => c.showInSidebar !== false && canAccess(c, userRole))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

    return (
      // Separa cada cabecera de dominio del bloque anterior (SidebarMenu usa gap-0 → si no
      // quedan pegadas). `first:mt-0` evita el hueco extra arriba del primer grupo.
      <SidebarMenuItem className="mt-1 first:mt-0">
        <SidebarMenuButton
          isActive={active || childActive}
          onClick={() => setExpanded((v) => !v)}
          className="font-semibold"
          style={{ backgroundColor: GROUP_HEADER_BG, color: GROUP_HEADER_FG }}
        >
          <RouteIcon route={route} size={iconSize} />
          <span className={navLabelClass}>{routeLabel(t, route)}</span>
          <ChevronRight
            style={{ width: 14, height: 14, transform: expanded ? 'rotate(90deg)' : undefined }}
            className="ml-auto shrink-0 transition-transform duration-200"
          />
        </SidebarMenuButton>
        {expanded && (
          <SidebarMenuSub>
            {children.map((child) => (
              <SidebarMenuSubItem key={child.id}>
                <SidebarMenuSubButton
                  isActive={isRouteActive(child)}
                  onClick={() => {
                    openRoute(child.id)
                    useSidebarWidthStore.getState().close()
                  }}
                >
                  <RouteIcon route={child} size={Math.max(12, iconSize - 2)} />
                  <span className={navLabelClass}>{routeLabel(t, child)}</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        )}
      </SidebarMenuItem>
    )
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        onClick={() => {
          openRoute(route.id)
          useSidebarWidthStore.getState().close()
        }}
        className={cn(!entitled && 'opacity-60')}
      >
        <RouteIcon route={route} size={iconSize} />
        <span className={navLabelClass}>{routeLabel(t, route)}</span>
        {!entitled && (
          <Lock className="ml-auto shrink-0 self-center" style={{ width: 12, height: 12 }} />
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

// Item de menú contribuido (punto `menus`, superficie Sidebar) — mismo look que una ruta,
// pero ejecuta un comando en vez de abrir tab. El `when` ya fue evaluado por useMenuItems.
function MenuActionItem({ item }: { item: ResolvedMenuItem }) {
  const iconSize = useAppearanceStore((s) => s.sidebarIconSize)
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        disabled={!item.enabled}
        onClick={() => {
          void item.run()
          useSidebarWidthStore.getState().close()
        }}
      >
        {item.icon && <MenuIcon name={item.icon} style={{ width: iconSize, height: iconSize }} />}
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

// ─── Icon-only mode ───────────────────────────────────────────────────────────

const iconBtnClass = (active: boolean) =>
  cn(
    'flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-colors',
    'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent',
    active && 'bg-sidebar-accent text-sidebar-accent-foreground'
  )

function IconNavItem({ route }: { route: RouteConfig }) {
  const { t } = useTranslation()
  const { isRouteActive, isChildActive } = useActiveRoute()
  const iconSize = useAppearanceStore((s) => s.sidebarIconSize)
  const userRole = useAuthStore((s) => s.user?.role)
  const entitled = useEntitled(route.entitlement)

  const hasChildren = (route.children ?? []).length > 0
  const active = isRouteActive(route)
  const childActive = hasChildren && isChildActive(route)

  if (hasChildren) {
    const children = (route.children ?? [])
      .filter((c) => c.showInSidebar !== false && canAccess(c, userRole))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

    return (
      <HoverCard>
        {/* Menú de navegación: abrir casi al instante (default de Base UI = 600ms, se siente
            pesado). closeDelay corto da margen para cruzar el gap del trigger al popup. */}
        <HoverCardTrigger
          className={iconBtnClass(active || childActive)}
          style={{ backgroundColor: GROUP_HEADER_BG, color: GROUP_HEADER_FG }}
          delay={80}
          closeDelay={150}
        >
          <RouteGlyph route={route} size={iconSize} />
        </HoverCardTrigger>
        <HoverCardContent
          side="right"
          align="start"
          sideOffset={8}
          alignOffset={-4}
          className="w-auto min-w-44 max-w-72 p-1.5"
        >
          <p className="truncate px-2 py-1 text-xs font-medium text-muted-foreground">{routeLabel(t, route)}</p>
          <div className="flex flex-col gap-0.5">
            {children.map((child) => {
              const childIsActive = isRouteActive(child)
              return (
                <button
                  key={child.id}
                  onClick={() => openRoute(child.id)}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                    'hover:bg-accent hover:text-accent-foreground',
                    childIsActive && 'bg-accent text-accent-foreground font-medium'
                  )}
                >
                  <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                    <RouteGlyph route={child} size={14} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-left">{routeLabel(t, child)}</span>
                </button>
              )
            })}
          </div>
        </HoverCardContent>
      </HoverCard>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger
        className={cn(iconBtnClass(active), !entitled && 'opacity-50')}
        onClick={() => openRoute(route.id)}
      >
        <RouteGlyph route={route} size={iconSize} />
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {routeLabel(t, route)}
        {!entitled && ' 🔒'}
      </TooltipContent>
    </Tooltip>
  )
}

function IconMenuActionItem({ item }: { item: ResolvedMenuItem }) {
  const iconSize = useAppearanceStore((s) => s.sidebarIconSize)
  return (
    <Tooltip>
      <TooltipTrigger
        className={cn(iconBtnClass(false), !item.enabled && 'pointer-events-none opacity-40')}
        onClick={() => void item.run()}
      >
        {item.icon ? (
          <MenuIcon name={item.icon} style={{ width: iconSize, height: iconSize }} />
        ) : (
          <span className="text-[10px] font-semibold uppercase">{item.label.charAt(0)}</span>
        )}
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {item.label}
      </TooltipContent>
    </Tooltip>
  )
}

// ─── AppSidebar ───────────────────────────────────────────────────────────────

/**
 * Marca del producto, encima de los items de navegación. En icon-only se reduce al glifo (el
 * nombre no entra en 48px de ancho) para que el sidebar minimizado siga siendo una columna de
 * íconos alineados.
 */
function SidebarBrand({ iconOnly }: { iconOnly: boolean }) {
  if (iconOnly) return null
  return (
    <div className="flex items-center gap-2 px-1 py-1">
      <span className="truncate font-display text-base font-semibold tracking-tight">Logistics</span>
    </div>
  )
}

export function AppSidebar() {
  const { t } = useTranslation()
  const width = useSidebarWidthStore((s) => s.width)
  const toggle = useSidebarWidthStore((s) => s.toggle)
  const userRole = useAuthStore((s) => s.user?.role)
  const iconOnly = width < SIDEBAR_ICON_THRESHOLD

  // Reactivo: las rutas que contribuyen los plugins aparecen/desaparecen con su registro.
  const routes = useRoutes()
  // Eje Enabled: una ruta de un plugin DESHABILITADO se oculta (≠ locked por entitlement, que
  // sí se ve). Reactivo: al togglear el plugin en Settings la ruta aparece/desaparece en caliente.
  const isEnabled = useIsEnabled()
  const navRoutes = routes
    .filter((r) => r.showInSidebar !== false && isEnabled(r.pluginId) && canAccess(r, userRole))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  // Agrupado por secciones colapsables (full) / íconos con flyout (icon-only): misma estructura.
  const treeRoutes = buildSidebarTree(navRoutes)

  // Items del punto `menus` para las superficies del sidebar (when ya evaluado).
  const sidebarItems = useMenuItems(MenuId.Sidebar)
  const footerItems = useMenuItems(MenuId.SidebarFooter)

  useEffect(() => {
    commandRegistry.override('workbench.action.toggleSidebar', toggle)
  }, [toggle])

  return (
    <Sidebar collapsible="none" className="w-full h-full border-0 bg-sidebar">
      <SidebarHeader>
        <SidebarBrand iconOnly={iconOnly} />
      </SidebarHeader>
      <SidebarContent>
        {iconOnly ? (
          <TooltipProvider delay={400}>
            <nav className="flex flex-col items-center gap-0.5 p-1.5 pt-2">
              {treeRoutes.map((route) => (
                <IconNavItem key={route.id} route={route} />
              ))}
              {sidebarItems.map((item) => (
                <IconMenuActionItem key={item.id} item={item} />
              ))}
            </nav>
          </TooltipProvider>
        ) : (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {treeRoutes.map((route, i) => (
                  <Fragment key={route.id}>
                    {route.separatorBefore && i > 0 && (
                      <SidebarSeparator className="my-2.5 !h-0.5 bg-border" />
                    )}
                    <NavItem route={route} />
                  </Fragment>
                ))}
                {sidebarItems.map((item) => (
                  <MenuActionItem key={item.id} item={item} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="p-2 space-y-1">
        {footerItems.map((item) =>
          iconOnly ? (
            <IconMenuActionItem key={item.id} item={item} />
          ) : (
            <Button
              key={item.id}
              variant="ghost"
              size="sm"
              disabled={!item.enabled}
              className="w-full justify-start gap-2 overflow-hidden"
              onClick={() => {
                void item.run()
                useSidebarWidthStore.getState().close()
              }}
            >
              {item.icon && <MenuIcon name={item.icon} size={15} className="shrink-0" />}
              <span className="truncate">{item.label}</span>
            </Button>
          )
        )}
        {iconOnly ? (
          <Tooltip>
            <TooltipTrigger
              className={iconBtnClass(false)}
              onClick={() => {
                commandRegistry.execute('settings.action.open')
                useSidebarWidthStore.getState().close()
              }}
            >
              <Settings size={16} />
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {t('sidebar.settings')}
            </TooltipContent>
          </Tooltip>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 overflow-hidden"
            onClick={() => {
              commandRegistry.execute('settings.action.open')
              useSidebarWidthStore.getState().close()
            }}
          >
            <Settings size={15} className="shrink-0" />
            <span className="truncate">{t('sidebar.settings')}</span>
          </Button>
        )}
      </SidebarFooter>
    </Sidebar>
  )
}
