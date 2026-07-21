import type { ComponentType, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface TabConfig {
  singleton?: boolean
  closable?: boolean
  /**
   * Keep-alive (§7, patrón retainContextWhenHidden de VSCode): la vista NO se desmonta al
   * cambiar de tab — forms, scroll e inputs se preservan. Default TRUE; poner false para
   * vistas pesadas que conviene reconstruir (su estado puede sobrevivir igual vía memento).
   * Sujeto al cap LRU de TABS_CONFIG.MAX_MOUNTED_TABS.
   */
  keepAlive?: boolean
  /** @deprecated alias histórico de keepAlive */
  keepMounted?: boolean
  maxInstances?: number
}

export interface RouteConfig {
  id: string
  path: string
  label: string
  /** Ícono interno (componente). Las rutas de plugins usan `iconName` (resuelto por nombre). */
  icon?: LucideIcon
  /** Nombre de ícono lucide (PascalCase) declarado por una contribución — render vía MenuIcon. */
  iconName?: string
  element: ReactNode
  component?: ComponentType
  showInSidebar?: boolean
  permissions?: string[]
  roles?: string[]
  order?: number
  group?: string
  /** Solo en nodos de sección sintéticos: ícono del encabezado de grupo (nombre lucide). */
  groupIcon?: string
  /** Dibuja un separador antes de este nodo en el sidebar (no si es el primero). */
  separatorBefore?: boolean
  children?: RouteConfig[]
  tabConfig?: TabConfig
  /**
   * Entitlement del plugin dueño de la ruta (§9). Sin él en la sesión, el item se muestra
   * LOCKED (visible con candado, nivel 1 de gating) y la vista ofrece el CTA de upsell —
   * la activación del plugin igual está gateada por el host (nivel 2).
   */
  entitlement?: string
  /**
   * Plugin dueño de la ruta. Sirve al eje Enabled: si el plugin está DESHABILITADO el sidebar
   * oculta su ruta (a diferencia del locked por entitlement, que sí se muestra). Las rutas
   * internas del shell no tienen dueño → siempre visibles.
   */
  pluginId?: string
}
