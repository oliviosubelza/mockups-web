import { useCallback, useEffect, useMemo, useReducer } from 'react'
import { isIMenuItem, type IMenuItem, type MenuId } from '@keel/platform'
import { commandsRegistry, menuRegistry } from '@/core/commands/command-registry'
import { contextKeyService } from '@/core/context/context-key-service'
import { i18n, resolveContribLabel } from '@/core/i18n'

/** Item de menú listo para render: label resuelto, `when` ya evaluado (si está acá, es visible). */
export interface ResolvedMenuItem {
  id: string
  label: string
  /** Nombre de ícono lucide (las superficies lo renderizan con <MenuIcon name=…>). */
  icon?: string
  group: string
  order: number
  /** false si el `precondition` del comando no se cumple (visible pero deshabilitado). */
  enabled: boolean
  run: (...args: unknown[]) => Promise<unknown>
}

function resolveLabel(title: string | (() => string)): string {
  return typeof title === 'function' ? title() : title
}

/**
 * Traduce el título de un comando contribuido por un plugin en SU namespace (= prefijo del id, ej.
 * `auth.logout` → namespace `auth`), igual que el command palette. Fallback a la key cruda si no hay
 * traducción (core con título literal, o plugin sin locales) → sin regresión para el core.
 */
function resolveCommandLabel(id: string, title: string | (() => string)): string {
  const raw = resolveLabel(title)
  const namespace = id.split('.')[0] ?? ''
  return resolveContribLabel((key, opts) => i18n.t(key, opts) as string, namespace, raw)
}

function compareItems(a: ResolvedMenuItem, b: ResolvedMenuItem): number {
  if (a.group !== b.group) {
    // 'navigation' primero (convención VSCode); el resto alfabético.
    if (a.group === 'navigation') return -1
    if (b.group === 'navigation') return 1
    return a.group.localeCompare(b.group)
  }
  if (a.order !== b.order) return a.order - b.order
  return a.label.localeCompare(b.label)
}

export function resolveMenuItems(menu: MenuId): ResolvedMenuItem[] {
  return menuRegistry
    .getMenuItems(menu)
    // Submenús (ISubmenuItem) quedan fuera por ahora — ninguna superficie los renderiza aún.
    .filter((item): item is IMenuItem => isIMenuItem(item))
    .filter((item) => contextKeyService.contextMatchesRules(item.when))
    .map((item) => ({
      id: item.command.id,
      label: resolveCommandLabel(item.command.id, item.command.title),
      icon: item.command.icon,
      group: item.group ?? '',
      order: item.order ?? 0,
      enabled: contextKeyService.contextMatchesRules(item.command.precondition),
      run: (...args: unknown[]) => commandsRegistry.executeCommand(item.command.id, ...args),
    }))
    .sort(compareItems)
}

/**
 * Items visibles de una superficie de menú, reactivo a dos fuentes: el MenuRegistry
 * (plugins que aportan/retiran items) y el ContextKeyService (los `when` re-evalúan
 * cuando cambia el contexto). Así es como el punto `contributes.menus` llega a la UI.
 */
export function useMenuItems(menu: MenuId): ResolvedMenuItem[] {
  const [revision, bump] = useReducer((x: number) => x + 1, 0)

  const subscribe = useCallback(() => {
    const menuSub = menuRegistry.onDidChangeMenu((e) => {
      if (e.has(menu)) bump()
    })
    const contextSub = contextKeyService.onDidChangeContext(() => bump())
    // Los labels se traducen por namespace: re-resolver al cambiar el idioma.
    i18n.on('languageChanged', bump)
    return () => {
      menuSub.dispose()
      contextSub.dispose()
      i18n.off('languageChanged', bump)
    }
  }, [menu])

  useEffect(subscribe, [subscribe])

  // revision invalida el memo cuando cambia el registry o el contexto.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => resolveMenuItems(menu), [menu, revision])
}
