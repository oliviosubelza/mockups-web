/**
 * Instancias del workbench de los registries de `@keel/platform` (el platform no exporta
 * singletons: cada shell instancia los suyos — ver platform/src/commands.ts).
 *
 * - `commandsRegistry`: id -> handler. Lo consumen el plugin host y los keybindings.
 * - `menuRegistry`:     id -> representación UI (title/icon/category) + items por MenuId.
 * - `commandRegistry`:  fachada del core. Registra handler + representación en un solo paso,
 *                       que es lo que necesitan las features del workbench (settings, tabs).
 */
import {
  CommandsRegistry,
  DisposableStore,
  MenuRegistry,
  type ICommandHandler,
  type IDisposable,
} from '@keel/platform'
import type { CommandEntry } from './types'

export const commandsRegistry = new CommandsRegistry()
export const menuRegistry = new MenuRegistry()

function resolveLabel(title: string | (() => string)): string {
  return typeof title === 'function' ? title() : title
}

/** Overrides vigentes por id: reemplazar exige soltar el anterior (el registry apila). */
const overrides = new Map<string, IDisposable>()

export interface RegisterCommandOptions {
  category?: string | (() => string)
  icon?: string
  /** false = queda fuera de la paleta (sigue siendo invocable por id). */
  palette?: boolean
}

export const commandRegistry = {
  /** Publica el comando: handler ejecutable + entrada visible en paleta/keybindings. */
  register(
    id: string,
    label: () => string,
    handler: ICommandHandler,
    options: RegisterCommandOptions = {}
  ): IDisposable {
    const store = new DisposableStore()
    store.add(
      menuRegistry.addCommand({
        id,
        title: label,
        category: options.category,
        icon: options.icon,
        palette: options.palette,
      })
    )
    store.add(commandsRegistry.registerCommand(id, handler))
    return store
  },

  /**
   * Reemplaza el handler de un id ya registrado, sin tocar su representación UI.
   * Es mutante a propósito: los consumidores (app-sidebar) llaman desde un effect sin
   * cleanup, así que apilar handlers acumularía uno por render. Soltamos el override
   * previo antes de poner el nuevo.
   */
  override(id: string, handler: ICommandHandler): void {
    overrides.get(id)?.dispose()
    overrides.set(id, commandsRegistry.registerCommand(id, handler))
  },

  execute<R = unknown>(id: string, ...args: unknown[]): Promise<R | undefined> {
    return commandsRegistry.executeCommand<R>(id, ...args)
  },

  /** Todos los comandos con representación UI (incluye los que no van a la paleta). */
  getAll(): CommandEntry[] {
    return Array.from(menuRegistry.getCommands().values(), (action) => ({
      id: action.id,
      label: resolveLabel(action.title),
    }))
  },

  getPaletteCommands(): CommandEntry[] {
    return Array.from(menuRegistry.getCommands().values())
      .filter((action) => action.palette !== false)
      .map((action) => ({ id: action.id, label: resolveLabel(action.title) }))
  },
}
