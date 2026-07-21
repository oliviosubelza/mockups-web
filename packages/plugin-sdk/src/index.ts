/*---------------------------------------------------------------------------------------------
 *  @keel/plugin-sdk — superficie pública para autores de plugins (§4.5/4.6 de ARCHITECTURE.md).
 *
 *  Regla de oro: un plugin SOLO importa de este paquete. Nunca de internals del core
 *  (workbench, stores, componentes). Eso es lo que mantiene el core agnóstico y estable.
 *--------------------------------------------------------------------------------------------*/

import type { ComponentType } from 'react';
import type { IDisposable, PluginDefinition, PluginManifest } from '@keel/platform';
import type { PluginUI } from './ui';
import type { ContributionsApi, CapabilitiesApi, ConfigApi } from './capabilities';

export type { IDisposable, PluginManifest, PluginDefinition };

// Superficie declarativa de UI (tipos + helpers define*): un plugin la importa de aquí.
export * from './ui';

// Composición soft entre plugins (contribution points + capability services) + hooks.
export * from './capabilities';

// ── Contribuciones tipadas (las keys conocidas de `contributes`) ─────────────────────────────

export interface CommandContribution {
	readonly id: string;
	readonly title: string;
	readonly category?: string;
	/** Nombre de icono lucide (PascalCase, ej. "Sparkles") — lo usan las superficies de menú. */
	readonly icon?: string;
	/** Aparece en la paleta (default true). */
	readonly palette?: boolean;
}

export interface MenuItemContribution {
	/** Id de un comando contribuido (el item ejecuta esto al click). */
	readonly command: string;
	/** Expresión `when` (contextkey): visibilidad/gating, ej. `"entitled.billing"`. */
	readonly when?: string;
	readonly group?: string;
	readonly order?: number;
}

export interface RouteContribution {
	readonly id: string;
	readonly path: string;
	readonly title: string;
	/**
	 * Id de la vista que renderiza la ruta. El plugin la registra en activate() con
	 * `api.registerView(view, Componente)` — hasta entonces la ruta existe en sidebar/tabs
	 * con el plugin DORMIDO; abrirla dispara `onView:<view>` y lo activa.
	 */
	readonly view: string;
	readonly order?: number;
	readonly showInSidebar?: boolean;
	/** Ícono lucide (PascalCase, ej. "Package") del ítem en el sidebar. Resuelto por nombre. */
	readonly icon?: string;
	/**
	 * Sección del sidebar bajo la que se agrupa esta ruta (colapsable). Varias rutas (de uno
	 * o varios plugins) con el mismo `group` se muestran anidadas bajo un encabezado. Omitir =
	 * ruta de primer nivel. Ej.: un dominio = un grupo ("Ventas", "Caja", "Reportes").
	 */
	readonly group?: string;
	/** Ícono lucide del ENCABEZADO de grupo (basta declararlo en una ruta del grupo). */
	readonly groupIcon?: string;
	/**
	 * Dibuja un separador en el sidebar ANTES de este ítem/sección (no si es el primero).
	 * Útil para apartar visualmente bloques (ej. Reportes debajo de las secciones de operación).
	 * En un grupo, basta declararlo en una de sus rutas.
	 */
	readonly separatorBefore?: boolean;
	readonly tab?: {
		readonly singleton?: boolean;
		readonly closable?: boolean;
		readonly keepAlive?: boolean;
	};
}

export interface ToolContribution {
	/** Id namespaced por plugin ('billing.createInvoice'). */
	readonly id: string;
	/** Descripción para el agente (qué hace, cuándo usarla). */
	readonly description: string;
	/** JSON Schema del input — los agentes MCP lo reciben en tools/list. */
	readonly inputSchema?: Readonly<Record<string, unknown>>;
	/**
	 * Permiso de usuario requerido para ejecutar esta tool (ej. "inventario:ajustar").
	 * Si el usuario activo no tiene el permiso, la ejecución se rechaza ANTES del approval gate.
	 * Omitir = sin restricción de permiso (solo aplica el approval gate de agentes externos).
	 */
	readonly requiredPermission?: string;
}

/**
 * Superficie de ventana-completa (overlay) que TAPA todo el chrome del workbench (sidebar, tabs,
 * header) cuando su `when` evalúa verdadero. Pensada para pantallas que piden foco total: login,
 * onboarding bloqueante, setup inicial, "licencia vencida", kiosko. El core no sabe qué es — solo
 * evalúa el `when` (mismas context keys que los menús) y, si matchea, renderiza la vista sola.
 *
 * El plugin sigue durmiendo hasta que la surface se muestra: ahí se dispara `onView:<view>` y se
 * activa lazy (igual que una ruta). Varias surfaces activas a la vez → gana la de mayor `priority`.
 */
export interface SurfaceContribution {
	readonly id: string;
	/** viewId que el plugin registra con `api.registerView` — se renderiza a pantalla completa. */
	readonly view: string;
	/** Expresión `when` (context keys). Verdadero ⇒ esta surface reemplaza el chrome del shell. */
	readonly when: string;
	/** Desempate si varias surfaces matchean a la vez (mayor gana). Default 0. */
	readonly priority?: number;
}

/**
 * Contribución de un permiso granular declarada por un plugin.
 * El workbench ensambla el catálogo en runtime desde todos los plugins instalados.
 */
export interface PermissionContribution {
	/** Id canónico: "resource:action", ej. "venta:ver_costo". */
	readonly id: string;
	/** Etiqueta visible en la UI de la matriz de roles (en español). */
	readonly title: string;
	/** Grupo en la matriz (por defecto = el segmento de recurso antes del ':'). */
	readonly group?: string;
	readonly description?: string;
}

export interface KnownContributions {
	readonly commands?: readonly CommandContribution[];
	/** key = id de superficie de menú ('Sidebar', 'StatusBar', 'CommandPalette', …). */
	readonly menus?: Readonly<Record<string, readonly MenuItemContribution[]>>;
	readonly routes?: readonly RouteContribution[];
	/** Tools para agentes (AI chat interno y MCP externo) — §6 de ARCHITECTURE.md. */
	readonly tools?: readonly ToolContribution[];
	/** Settings declarativos: el workbench arma el form y los persiste; el plugin lee con api.config. */
	readonly configuration?: ConfigurationContribution;
	/** Overlays de ventana-completa que reemplazan el chrome cuando su `when` matchea (ej. login). */
	readonly surfaces?: readonly SurfaceContribution[];
	/**
	 * Permisos granulares que este plugin declara y hace cumplir en su API-module gemelo.
	 * El workbench ensambla el catálogo uniendo los de todos los plugins instalados/habilitados.
	 * Usa `perm:<id>` como context key (ej. `when: "perm:venta:ver_costo"`).
	 */
	readonly permissions?: readonly PermissionContribution[];
}

/** Una propiedad de configuración declarada por un plugin (estilo `contributes.configuration` de VSCode). */
export interface ConfigPropertySchema {
	readonly type: 'boolean' | 'string' | 'number' | 'enum';
	/** Valor por defecto si el usuario no lo cambió. */
	readonly default: boolean | string | number;
	/** Etiqueta visible en Settings. */
	readonly title: string;
	readonly description?: string;
	/** Opciones (solo `type: 'enum'`). */
	readonly enum?: readonly string[];
	/** Etiquetas visibles para cada opción de `enum` (mismo orden). Default = el valor. */
	readonly enumLabels?: readonly string[];
}

/**
 * Bloque `contributes.configuration` del manifest. `title` titula la sección (default = nombre del
 * plugin). `properties` mapea CLAVES NAMESPACEADAS (convención: prefijo con el id del plugin, ej.
 * `inventory.stockRowDoubleClick`) a su schema. El valor se lee con `api.config.get(key)`.
 */
export interface ConfigurationContribution {
	readonly title?: string;
	readonly properties: Readonly<Record<string, ConfigPropertySchema>>;
}

/** Manifest con las contribuciones conocidas tipadas (acepta también puntos custom). */
export interface KeelPluginManifest extends PluginManifest {
	readonly contributes?: KnownContributions & Readonly<Record<string, unknown>>;
}

// ── PluginAPI: lo que recibe activate() ───────────────────────────────────────────────────────

export type PluginEventHandler = (payload: unknown) => void;

/**
 * i18n scoped al plugin. Las keys resuelven en el NAMESPACE del plugin (= su id): el plugin
 * declara `manifest.locales` y luego usa `t('price')` sin prefijar. Si la key falta, devuelve
 * la key tal cual (fallback). Para vistas (componentes React) usar `useT()` — reactivo al cambio
 * de idioma; `t` imperativo sirve fuera de render (handlers de comandos, tools).
 */
export interface PluginI18n {
	/** Traduce una key del namespace del plugin. `params` interpola (`{{name}}`). */
	t(key: string, params?: Readonly<Record<string, unknown>>): string;
	/** Idioma activo del shell ('es' | 'en' | …). */
	readonly language: string;
	/** Notifica cada cambio de idioma del shell. */
	onDidChangeLanguage(handler: (language: string) => void): IDisposable;
	/** Hook para vistas: devuelve un `t` reactivo (re-renderiza al cambiar el idioma). */
	useT(): (key: string, params?: Readonly<Record<string, unknown>>) => string;
}

/** Estado de sesión genérico del shell (§4.5 getAuthState — cero negocio). */
export interface SessionState {
	readonly isAuthenticated: boolean;
	readonly user: { readonly id: string; readonly username: string; readonly role: string } | null;
	/** Permisos efectivos del usuario activo (set de "resource:action", o ['*'] para ADMIN). */
	readonly permissions?: readonly string[];
	/** Comprueba si el usuario activo tiene un permiso (con soporte de wildcard '*'). */
	readonly hasPermission?: (permission: string) => boolean;
}

/** Ruta activa del workbench (la del tab enfocado). `null` si no hay ninguna abierta. */
export interface ActiveRoute {
	readonly routeId: string;
	readonly path: string;
	readonly title: string;
}

/** Opciones de una request HTTP del plugin (solo lo común; el token lo pone el host). */
export interface PluginHttpOptions {
	/** Query params serializados a la URL. */
	readonly params?: Readonly<Record<string, string | number | boolean | undefined>>;
	/** Headers extra (el Authorization lo inyecta el host). */
	readonly headers?: Readonly<Record<string, string>>;
}

/**
 * Cliente HTTP al backend del shell, ya autenticado con la sesión del core.
 * Devuelve el body parseado (T); lanza `{ message, status, code }` en error.
 */
export interface PluginHttpClient {
	get<T = unknown>(url: string, options?: PluginHttpOptions): Promise<T>;
	post<T = unknown>(url: string, body?: unknown, options?: PluginHttpOptions): Promise<T>;
	put<T = unknown>(url: string, body?: unknown, options?: PluginHttpOptions): Promise<T>;
	patch<T = unknown>(url: string, body?: unknown, options?: PluginHttpOptions): Promise<T>;
	delete<T = unknown>(url: string, options?: PluginHttpOptions): Promise<T>;
}

/**
 * API scoped que el host le pasa a `activate(api)`. Agnóstica: cero negocio.
 * Todo registro retorna IDisposable y además queda trackeado por el host —
 * al desactivarse el plugin, TODO lo registrado se limpia solo.
 */
export interface PluginAPI {
	readonly pluginId: string;

	/** Vincula el handler de un comando (la metadata UI va en `contributes.commands`). */
	registerCommand(id: string, handler: (...args: unknown[]) => unknown): IDisposable;
	/** Vincula el handler de una tool (la metadata para el agente va en `contributes.tools`). */
	registerTool(id: string, handler: (input: unknown) => unknown): IDisposable;
	/**
	 * Registra el componente de una vista declarada en `contributes.routes`. Para laziness
	 * real, importala dinámico: `const { View } = await import('./view'); api.registerView(...)`.
	 */
	registerView(id: string, component: ComponentType): IDisposable;
	/** Agrega un item a una superficie de menú en runtime (complemento imperativo del manifest). */
	addMenuItem(menu: string, item: MenuItemContribution): IDisposable;
	executeCommand<R = unknown>(id: string, ...args: unknown[]): Promise<R | undefined>;

	/** Pub/sub por topic (canal dinámico del EventBus). Eventos core: topic = su key tipada. */
	onEvent(topic: string, handler: PluginEventHandler): IDisposable;
	emitEvent(topic: string, payload?: unknown): void;

	notify(message: string, type?: 'info' | 'success' | 'warning' | 'error'): void;

	/** Abre (o enfoca) la tab de una ruta contribuida, por su id de ruta. */
	openRoute(routeId: string): void;

	/**
	 * Conciencia de navegación del workbench: qué ruta está ACTIVA (la del tab enfocado, no el
	 * pathname). Misma verdad que consume el sidebar y la tool `workbench.getActiveView` (agentes).
	 * Útil para que un plugin reaccione a la vista en foco (refetch, breadcrumbs, telemetría).
	 */
	readonly navigation: {
		/** Abre (o enfoca) la tab de una ruta por su id. Alias de `openRoute`. */
		openRoute(routeId: string): void;
		/** Ruta activa actual, o `null` si no hay tabs abiertas. */
		getActiveRoute(): ActiveRoute | null;
		/** Notifica cada vez que cambia la ruta activa (cambio de tab enfocado). */
		onDidChangeActiveRoute(handler: (route: ActiveRoute | null) => void): IDisposable;
	};

	/**
	 * Settings del plugin (declarados en `contributes.configuration`). El workbench los renderiza
	 * en Settings y los persiste (local, por dispositivo); el plugin solo lee/observa. `get`
	 * devuelve el valor actual o el `default` declarado. Reactivo en vistas con `useConfig`.
	 */
	readonly config: ConfigApi;

	/**
	 * Traducción scoped al plugin (namespace = id del plugin). El plugin declara `manifest.locales`
	 * y traduce con `api.i18n.t(key)` / `api.i18n.useT()` (vistas). El host registra los bundles.
	 */
	readonly i18n: PluginI18n;

	/**
	 * Componentes declarativos del workbench (tablas, formularios, filtros) inyectados por el
	 * host. Mantienen el design system en un solo lugar; el plugin solo declara columns/fields/
	 * filters (con los helpers define* del SDK) y renderiza. Disponible para plugins internos.
	 */
	readonly ui: PluginUI;

	/**
	 * Contribution points runtime (composición soft): este plugin aporta items a un punto que
	 * otro plugin consume, o consume los aportados por otros. Lo registrado se limpia al
	 * desactivarse. Consumir con el hook `useContributions(api.contributions, pointId)`.
	 */
	readonly contributions: ContributionsApi;

	/**
	 * Servicios de capacidad (composición soft): este plugin provee/consume una implementación
	 * por id, presente solo mientras su proveedor está activo. Consumir con el hook
	 * `useCapability(api.capabilities, id)` (degrada a `undefined` si no hay proveedor).
	 */
	readonly capabilities: CapabilitiesApi;

	/**
	 * Cliente HTTP al backend del shell. Ya lleva el token de la sesión (y refresh
	 * automático) y normaliza errores. Devuelve el body parseado; lanza en error.
	 * El gemelo del plugin es un módulo de dominio (api-module) que expone su negocio acá.
	 */
	readonly http: PluginHttpClient;

	/**
	 * Sesión genérica del shell. El backend concreto lo configura el host; el plugin solo
	 * dispara login/logout y observa el estado. Los entitlements derivados de la sesión los
	 * aplica el host (gate de activación + context keys `entitled.<id>`).
	 */
	readonly session: {
		login(credentials: { username: string; password: string; slug?: string }): Promise<void>;
		logout(): Promise<void>;
		get(): SessionState;
		onDidChange(handler: (state: SessionState) => void): IDisposable;
	};

	/**
	 * Políticas del workbench que un plugin puede dirigir programáticamente (composición vendible:
	 * el producto = su set de plugins decide el comportamiento, no solo un ajuste manual del usuario).
	 */
	readonly workbench: {
		/**
		 * Marca/desmarca que ESTE plugin exige autenticación. El valor efectivo de la política es el
		 * OR de lo que pida cualquier plugin + el ajuste del usuario (Settings → Workbench): si al
		 * menos una fuente lo exige y no hay sesión, el shell muestra el gate de login a pantalla
		 * completa. El requerimiento del plugin es runtime y se limpia solo al desactivarse (un
		 * plugin removido nunca deja la app trabada). Llamalo típicamente en `activate()`.
		 */
		setAuthRequired(required: boolean): void;
	};
}

// ── definePlugin ──────────────────────────────────────────────────────────────────────────────

export interface KeelPluginDefinition extends PluginDefinition<PluginAPI> {
	readonly manifest: KeelPluginManifest;
}

/** Helper de identidad con tipos: valida la forma del plugin en compile-time. */
export function definePlugin(definition: KeelPluginDefinition): KeelPluginDefinition {
	return definition;
}
