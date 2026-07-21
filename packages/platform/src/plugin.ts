/*---------------------------------------------------------------------------------------------
 *  Keel — Plugin host (§4.3 de ARCHITECTURE.md).
 *  Lifecycle de excalidraw `plugin-manager.ts` + cleanup sobre DisposableStore (A1) en vez de
 *  tracking manual por arrays. Manifest declarativo y activación lazy estilo VSCode.
 *
 *  Modelo:
 *   - `register()` NO ejecuta el plugin: indexa sus activationEvents y empuja sus `contributes`
 *     a los contribution points (la UI puede renderizarlos con el plugin dormido).
 *   - `activateByEvent('onCommand:x')` despierta solo a los plugins suscriptos a ese evento.
 *   - `activate()` crea la API scoped vía `createApi(manifest, store)`: todo lo que el plugin
 *     registra entra al store; `deactivate()` = `store.dispose()`. Sin fugas, una línea.
 *   - Entitlement gate: sin entitlement el plugin se registra (contribuciones visibles/locked)
 *     pero NO se activa.
 *
 *  Aislamiento: Fase 1 = in-process para todos (decisión §11.2, recomendada). La frontera RPC
 *  para plugins externos llega en Fase 2 — este host no cambia: cambia el `createApi`.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, toDisposable, type IDisposable } from './lifecycle';
import { Emitter, type Event } from './event';
import { ContributionRegistry, type IContributionUser } from './contributions';

/** Manifest declarativo (§4.1). El host lee esto SIN ejecutar el código del plugin. */
export interface PluginManifest {
	readonly id: string;
	readonly name: string;
	readonly version: string;
	/** Rango semver de la API del host con la que es compatible (validación C2, Fase 2). */
	readonly engine?: string;
	/** Ids de otros plugins requeridos: se activan antes. */
	readonly dependencies?: readonly string[];
	/** Licencia necesaria. Omitir = gratis/core. */
	readonly entitlement?: string;
	/** Eventos que lo despiertan ('onCommand:x', 'onView:y', 'onRoute:/z', '*'). */
	readonly activationEvents?: readonly string[];
	/** Contribuciones declarativas: cada key es un contribution point. */
	readonly contributes?: Readonly<Record<string, unknown>>;
	/**
	 * Bundles de i18n del plugin: `lang → recursos`. El host los registra en i18next bajo el
	 * namespace = id del plugin AL REGISTRAR (con el plugin dormido), para que sidebar/paleta/tabs
	 * resuelvan títulos lazy y `api.i18n.t(key)` funcione en la vista. Omitir = sin traducción
	 * (los títulos del manifest se muestran tal cual, fallback al texto crudo).
	 */
	readonly locales?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

export interface PluginDefinition<TApi = unknown> {
	readonly manifest: PluginManifest;
	activate?(api: TApi): void | Promise<void>;
	deactivate?(): void | Promise<void>;
}

export type PluginState = 'registered' | 'activating' | 'active' | 'failed';

export interface PluginRecord<TApi = unknown> {
	readonly definition: PluginDefinition<TApi>;
	readonly state: PluginState;
}

export interface PluginHostOptions<TApi> {
	/** Fabrica la API scoped de un plugin. Lo que registre vía esa API debe entrar al `store`. */
	createApi(manifest: PluginManifest, store: DisposableStore): TApi;
	/** Gate de licencia. Default: todo entitled (mock hasta enganchar Subscription en Fase 2). */
	isEntitled?(entitlement: string): boolean;
	/**
	 * Gate de habilitación (eje Enabled, entre Entitled y Active). Default: todo habilitado.
	 * Un plugin deshabilitado (el cliente lo apagó / no está en su preset) NO se activa aunque
	 * tenga entitlement. Invariante: Active ⊆ Enabled ⊆ Entitled.
	 */
	isEnabled?(pluginId: string): boolean;
	/**
	 * Deriva activationEvents implícitos desde el manifest (C1) — p.ej. `onCommand:<id>` por cada
	 * `contributes.commands[].id`. El host es agnóstico al schema de `contributes`; el shell sabe.
	 */
	implicitActivationEvents?(manifest: PluginManifest): readonly string[];
}

export class PluginHost<TApi = unknown> implements IDisposable {
	/** Puntos de contribución alimentados por los manifests registrados. */
	readonly contributions = new ContributionRegistry();

	private readonly _plugins = new Map<
		string,
		{
			definition: PluginDefinition<TApi>;
			state: PluginState;
			store: DisposableStore | undefined;
			activation: Promise<void> | undefined;
		}
	>();
	/** activationEvent → ids de plugins suscriptos. */
	private readonly _activationIndex = new Map<string, Set<string>>();
	private readonly _firedEvents = new Set<string>();

	private readonly _onDidRegisterPlugin = new Emitter<string>();
	readonly onDidRegisterPlugin: Event<string> = this._onDidRegisterPlugin.event;

	private readonly _onDidUnregisterPlugin = new Emitter<string>();
	readonly onDidUnregisterPlugin: Event<string> = this._onDidUnregisterPlugin.event;

	private readonly _onDidActivatePlugin = new Emitter<string>();
	readonly onDidActivatePlugin: Event<string> = this._onDidActivatePlugin.event;

	private readonly _onDidDeactivatePlugin = new Emitter<string>();
	readonly onDidDeactivatePlugin: Event<string> = this._onDidDeactivatePlugin.event;

	constructor(private readonly _options: PluginHostOptions<TApi>) {}

	// ── registro ──────────────────────────────────────────────────────────────────────────────

	register(definition: PluginDefinition<TApi>): IDisposable {
		const { manifest } = definition;
		if (this._plugins.has(manifest.id)) {
			throw new Error(`[PluginHost] plugin "${manifest.id}" ya está registrado`);
		}
		this._plugins.set(manifest.id, {
			definition,
			state: 'registered',
			store: undefined,
			activation: undefined,
		});

		// Indexar activationEvents (declarados + implícitos C1).
		const events = [
			...(manifest.activationEvents ?? []),
			...(this._options.implicitActivationEvents?.(manifest) ?? []),
		];
		for (const event of events) {
			let subscribers = this._activationIndex.get(event);
			if (!subscribers) {
				subscribers = new Set();
				this._activationIndex.set(event, subscribers);
			}
			subscribers.add(manifest.id);
		}

		this._pushContributions(manifest.contributes ? Object.keys(manifest.contributes) : []);
		this._onDidRegisterPlugin.fire(manifest.id);

		// Si su evento ya se disparó (registro tardío), despertarlo ahora.
		const pending = events.find((e) => this._firedEvents.has(e));
		if (pending) {
			void this.activate(manifest.id);
		}

		return toDisposable(() => {
			void this._unregister(manifest.id, events);
		});
	}

	private async _unregister(id: string, events: readonly string[]): Promise<void> {
		const record = this._plugins.get(id);
		if (!record) {
			return;
		}
		await this.deactivate(id);
		for (const event of events) {
			this._activationIndex.get(event)?.delete(id);
		}
		const affected = record.definition.manifest.contributes
			? Object.keys(record.definition.manifest.contributes)
			: [];
		this._plugins.delete(id);
		this._pushContributions(affected);
		this._onDidUnregisterPlugin.fire(id);
	}

	/** Re-publica la lista completa de users de los puntos afectados (el punto computa el delta). */
	private _pushContributions(pointNames: readonly string[]): void {
		for (const name of pointNames) {
			const users: IContributionUser<unknown>[] = [];
			for (const { definition } of this._plugins.values()) {
				const value = definition.manifest.contributes?.[name];
				if (value !== undefined) {
					users.push({ pluginId: definition.manifest.id, value });
				}
			}
			this.contributions.getOrDefinePoint(name).acceptUsers(users);
		}
	}

	// ── activación ────────────────────────────────────────────────────────────────────────────

	/** Despierta a los plugins suscriptos al evento. `'*'` se dispara al boot del shell. */
	async activateByEvent(event: string): Promise<void> {
		this._firedEvents.add(event);
		const ids = this._activationIndex.get(event);
		if (!ids) {
			return;
		}
		await Promise.all([...ids].map((id) => this.activate(id)));
	}

	async activate(id: string, _chain: readonly string[] = []): Promise<void> {
		const record = this._plugins.get(id);
		if (!record) {
			throw new Error(`[PluginHost] plugin "${id}" no está registrado`);
		}
		if (record.state === 'active') {
			return;
		}
		if (record.activation) {
			return record.activation; // activación en curso — esperarla, no duplicarla
		}

		const { manifest } = record.definition;
		if (manifest.entitlement && !(this._options.isEntitled?.(manifest.entitlement) ?? true)) {
			throw new Error(
				`[PluginHost] "${id}" requiere entitlement "${manifest.entitlement}" — no disponible`
			);
		}
		if (!(this._options.isEnabled?.(id) ?? true)) {
			throw new Error(`[PluginHost] "${id}" está deshabilitado`);
		}
		if (_chain.includes(id)) {
			throw new Error(`[PluginHost] dependencia circular: ${[..._chain, id].join(' → ')}`);
		}

		record.state = 'activating';
		record.activation = (async () => {
			// Dependencias primero (patrón excalidraw).
			for (const dep of manifest.dependencies ?? []) {
				if (!this._plugins.has(dep)) {
					throw new Error(`[PluginHost] "${id}" depende de "${dep}", que no está registrado`);
				}
				await this.activate(dep, [..._chain, id]);
			}
			const store = new DisposableStore();
			record.store = store;
			const api = this._options.createApi(manifest, store);
			await record.definition.activate?.(api);
			record.state = 'active';
			this._onDidActivatePlugin.fire(id);
		})();

		try {
			await record.activation;
		} catch (err) {
			record.state = 'failed';
			record.store?.dispose();
			record.store = undefined;
			throw err;
		} finally {
			record.activation = undefined;
		}
	}

	/** Cleanup TOTAL: dispose del store del plugin (todo lo que registró se va con él). */
	async deactivate(id: string): Promise<void> {
		const record = this._plugins.get(id);
		if (!record || (record.state !== 'active' && record.state !== 'failed')) {
			return;
		}
		try {
			await record.definition.deactivate?.();
		} finally {
			record.store?.dispose();
			record.store = undefined;
			record.state = 'registered';
			this._onDidDeactivatePlugin.fire(id);
		}
	}

	// ── consultas ─────────────────────────────────────────────────────────────────────────────

	get(id: string): PluginRecord<TApi> | undefined {
		const record = this._plugins.get(id);
		return record ? { definition: record.definition, state: record.state } : undefined;
	}

	all(): readonly PluginRecord<TApi>[] {
		return [...this._plugins.values()].map(({ definition, state }) => ({ definition, state }));
	}

	isActive(id: string): boolean {
		return this._plugins.get(id)?.state === 'active';
	}

	/** Ids de plugins registrados que declaran a `id` entre sus `dependencies` (dependientes). */
	dependentsOf(id: string): readonly string[] {
		return [...this._plugins.values()]
			.filter((r) => (r.definition.manifest.dependencies ?? []).includes(id))
			.map((r) => r.definition.manifest.id);
	}

	/** Dependientes actualmente activos: los que impiden desactivar/deshabilitar `id`. */
	activeDependentsOf(id: string): readonly string[] {
		return this.dependentsOf(id).filter((dep) => this._plugins.get(dep)?.state === 'active');
	}

	/**
	 * Guard de desactivación (decisión: BLOQUEAR con lista). Consulta pura para el caller de la
	 * acción manual; `deactivate()` sigue siendo de bajo nivel (cascadas internas no bloquean).
	 */
	canDeactivate(id: string): { readonly ok: true } | { readonly ok: false; readonly dependents: readonly string[] } {
		const dependents = this.activeDependentsOf(id);
		return dependents.length ? { ok: false, dependents } : { ok: true };
	}

	/**
	 * Resolución de disponibilidad de las dependencias HARD de `id`: cuáles no están registradas
	 * (`missing`) o están pero sin su entitlement (`unentitled`). `available` = se puede activar.
	 * (El entitlement PROPIO de `id` se reporta aparte por el mecanismo de entitlements.)
	 */
	dependencyStatus(id: string): {
		readonly available: boolean;
		readonly missing: readonly string[];
		readonly unentitled: readonly string[];
	} {
		const deps = this._plugins.get(id)?.definition.manifest.dependencies ?? [];
		const missing: string[] = [];
		const unentitled: string[] = [];
		for (const dep of deps) {
			const record = this._plugins.get(dep);
			if (!record) {
				missing.push(dep);
				continue;
			}
			const ent = record.definition.manifest.entitlement;
			if (ent && !(this._options.isEntitled?.(ent) ?? true)) {
				unentitled.push(dep);
			}
		}
		return { available: missing.length === 0 && unentitled.length === 0, missing, unentitled };
	}

	dispose(): void {
		for (const record of this._plugins.values()) {
			record.store?.dispose();
		}
		this._plugins.clear();
		this._activationIndex.clear();
		this._onDidRegisterPlugin.dispose();
		this._onDidUnregisterPlugin.dispose();
		this._onDidActivatePlugin.dispose();
		this._onDidDeactivatePlugin.dispose();
	}
}
