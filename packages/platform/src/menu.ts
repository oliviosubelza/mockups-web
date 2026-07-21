/*---------------------------------------------------------------------------------------------
 *  Keel — MenuRegistry + MenuId (B2, ver .claude/ARCHITECTURE.md §14).
 *  Adaptado de VSCode `platform/actions/common/actions.ts` (MIT — ver NOTICE.md).
 *
 *  Cada superficie de menú del workbench tiene un `MenuId` (sidebar, titlebar, context de tab…).
 *  El core define las superficies; los plugins hacen `appendMenuItem(MenuId.X, { command, when })`
 *  y la superficie se re-renderiza al recibir `onDidChangeMenu`. `group`/`order` resuelven
 *  posición; `when` (contextkey) resuelve visibilidad — incluye gating por entitlement
 *  (`entitled.billing`), que es como el manifest declarativo (§4.1 `contributes.menus`) aterriza
 *  en runtime.
 *
 *  Igual que CommandsRegistry: sin singleton — el shell instancia el suyo.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, toDisposable, type IDisposable } from './lifecycle';
import { Emitter, type Event } from './event';
import type { ContextKeyExpression } from './contextkey';

/** Identificador de una superficie de menú. Una instancia única por id (dedup en `for`). */
export class MenuId {
	private static readonly _instances = new Map<string, MenuId>();

	// Superficies que expone el workbench de keel (agnósticas — cero negocio):
	static readonly CommandPalette = new MenuId('CommandPalette');
	static readonly MenubarFile = new MenuId('MenubarFile');
	static readonly MenubarView = new MenuId('MenubarView');
	static readonly Sidebar = new MenuId('Sidebar');
	static readonly SidebarFooter = new MenuId('SidebarFooter');
	static readonly StatusBar = new MenuId('StatusBar');
	static readonly TabContext = new MenuId('TabContext');
	static readonly TitleBarContext = new MenuId('TitleBarContext');

	/**
	 * Devuelve el MenuId para un identificador, creándolo si no existe.
	 * Para superficies/submenús contribuidos por plugins (`plugin:billing.actions`).
	 */
	static for(identifier: string): MenuId {
		return MenuId._instances.get(identifier) ?? new MenuId(identifier);
	}

	readonly id: string;

	constructor(identifier: string) {
		if (MenuId._instances.has(identifier)) {
			throw new Error(
				`MenuId "${identifier}" ya existe — usá MenuId.for('${identifier}') para obtenerlo.`
			);
		}
		this.id = identifier;
		MenuId._instances.set(identifier, this);
	}
}

/**
 * Representación UI de un comando (el "qué se muestra"; el handler vive en CommandsRegistry).
 * `title` acepta función para labels i18n que se resuelven al render.
 */
export interface ICommandAction {
	readonly id: string;
	readonly title: string | (() => string);
	readonly category?: string | (() => string);
	/** Nombre de icono (lucide u otro set — la UI resuelve). */
	readonly icon?: string;
	/** El comando se muestra deshabilitado si la expresión evalúa false. */
	readonly precondition?: ContextKeyExpression;
	/** Para comandos toggle: estado "activado" según contexto. */
	readonly toggled?: ContextKeyExpression;
	/** Aparece en la paleta de comandos (default true). */
	readonly palette?: boolean;
}

export interface IMenuItem {
	readonly command: ICommandAction;
	/** El item se oculta si la expresión evalúa false. */
	readonly when?: ContextKeyExpression;
	/** Grupo de orden ('navigation' primero por convención; resto alfabético). */
	readonly group?: 'navigation' | (string & {});
	readonly order?: number;
}

export interface ISubmenuItem {
	readonly title: string | (() => string);
	readonly submenu: MenuId;
	readonly icon?: string;
	readonly when?: ContextKeyExpression;
	readonly group?: 'navigation' | (string & {});
	readonly order?: number;
}

export function isIMenuItem(item: IMenuItem | ISubmenuItem): item is IMenuItem {
	return (item as IMenuItem).command !== undefined;
}

export function isISubmenuItem(item: IMenuItem | ISubmenuItem): item is ISubmenuItem {
	return (item as ISubmenuItem).submenu !== undefined;
}

export interface IMenuRegistryChangeEvent {
	has(id: MenuId): boolean;
}

export interface IMenuRegistry {
	readonly onDidChangeMenu: Event<IMenuRegistryChangeEvent>;
	addCommand(action: ICommandAction): IDisposable;
	getCommand(id: string): ICommandAction | undefined;
	getCommands(): ReadonlyMap<string, ICommandAction>;
	appendMenuItem(menu: MenuId, item: IMenuItem | ISubmenuItem): IDisposable;
	appendMenuItems(items: Iterable<{ id: MenuId; item: IMenuItem | ISubmenuItem }>): IDisposable;
	getMenuItems(menu: MenuId): Array<IMenuItem | ISubmenuItem>;
}

export class MenuRegistry implements IMenuRegistry, IDisposable {
	private readonly _commands = new Map<string, ICommandAction>();
	private readonly _menuItems = new Map<MenuId, Array<IMenuItem | ISubmenuItem>>();

	private readonly _onDidChangeMenu = new Emitter<IMenuRegistryChangeEvent>();
	readonly onDidChangeMenu: Event<IMenuRegistryChangeEvent> = this._onDidChangeMenu.event;

	/** Publica la representación UI de un comando (lo hace visible en la paleta salvo palette:false). */
	addCommand(action: ICommandAction): IDisposable {
		this._commands.set(action.id, action);
		this._fireChange(MenuId.CommandPalette);
		return toDisposable(() => {
			if (this._commands.delete(action.id)) {
				this._fireChange(MenuId.CommandPalette);
			}
		});
	}

	getCommand(id: string): ICommandAction | undefined {
		return this._commands.get(id);
	}

	getCommands(): ReadonlyMap<string, ICommandAction> {
		return new Map(this._commands);
	}

	appendMenuItem(menu: MenuId, item: IMenuItem | ISubmenuItem): IDisposable {
		let list = this._menuItems.get(menu);
		if (!list) {
			list = [];
			this._menuItems.set(menu, list);
		}
		list.push(item);
		this._fireChange(menu);
		return toDisposable(() => {
			const current = this._menuItems.get(menu);
			if (!current) {
				return;
			}
			const idx = current.indexOf(item);
			if (idx >= 0) {
				current.splice(idx, 1);
				if (current.length === 0) {
					this._menuItems.delete(menu);
				}
				this._fireChange(menu);
			}
		});
	}

	appendMenuItems(items: Iterable<{ id: MenuId; item: IMenuItem | ISubmenuItem }>): IDisposable {
		const store = new DisposableStore();
		for (const { id, item } of items) {
			store.add(this.appendMenuItem(id, item));
		}
		return store;
	}

	/**
	 * Items de una superficie. Para CommandPalette agrega además todo comando publicado con
	 * `addCommand` que no tenga ya un item explícito (patrón VSCode: la paleta lista todo).
	 */
	getMenuItems(menu: MenuId): Array<IMenuItem | ISubmenuItem> {
		const result = [...(this._menuItems.get(menu) ?? [])];
		if (menu === MenuId.CommandPalette) {
			const present = new Set(
				result.filter(isIMenuItem).map((item) => item.command.id)
			);
			for (const action of this._commands.values()) {
				if (action.palette !== false && !present.has(action.id)) {
					result.push({ command: action });
				}
			}
		}
		return result;
	}

	dispose(): void {
		this._commands.clear();
		this._menuItems.clear();
		this._onDidChangeMenu.dispose();
	}

	private _fireChange(menu: MenuId): void {
		this._onDidChangeMenu.fire({ has: (candidate) => candidate === menu });
	}
}
