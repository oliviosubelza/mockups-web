/*---------------------------------------------------------------------------------------------
 *  Keel — Contribution points genéricos con delta (§4.2 de ARCHITECTURE.md).
 *  Adaptado del patrón `ExtensionPoint<T>` de VSCode
 *  `workbench/services/extensions/common/extensionsRegistry.ts` (MIT — ver NOTICE.md).
 *
 *  En vez de N registries sueltos, UN mecanismo: cada tipo de aporte declarable en el manifest
 *  (`contributes.commands`, `contributes.menus`, …) es un punto de contribución. El subsistema
 *  del workbench que lo consume hace `setHandler()`; el plugin host empuja los valores de los
 *  manifests con `acceptUsers()`. El handler recibe el DELTA (added/removed) — eso es lo que
 *  permite montar/desmontar plugins en caliente sin re-derivar el mundo entero.
 *
 *  La UI se renderiza desde estos puntos SIN ejecutar el código del plugin: el sidebar muestra
 *  el item de un plugin dormido (o locked sin entitlement).
 *--------------------------------------------------------------------------------------------*/

import { toDisposable, type IDisposable } from './lifecycle';

/** Una contribución de UN plugin a UN punto. `pluginId` identifica al dueño para el cleanup. */
export interface IContributionUser<T> {
	readonly pluginId: string;
	readonly value: T;
}

export interface IContributionDelta<T> {
	readonly added: readonly IContributionUser<T>[];
	readonly removed: readonly IContributionUser<T>[];
}

export type ContributionHandler<T> = (
	users: readonly IContributionUser<T>[],
	delta: IContributionDelta<T>
) => void;

export interface IContributionPoint<T> {
	readonly name: string;
	/** El subsistema consumidor instala su handler. Si ya hay users aceptados, se invoca al toque. */
	setHandler(handler: ContributionHandler<T>): IDisposable;
	/** El plugin host empuja la lista COMPLETA actual; el punto computa el delta. */
	acceptUsers(users: readonly IContributionUser<T>[]): void;
}

/** Diff por identidad de (pluginId, value): lo que no estaba es added, lo que ya no está es removed. */
export function computeDelta<T>(
	previous: readonly IContributionUser<T>[],
	current: readonly IContributionUser<T>[]
): IContributionDelta<T> {
	const added = current.filter(
		(user) => !previous.some((p) => p.pluginId === user.pluginId && p.value === user.value)
	);
	const removed = previous.filter(
		(user) => !current.some((c) => c.pluginId === user.pluginId && c.value === user.value)
	);
	return { added, removed };
}

class ContributionPoint<T> implements IContributionPoint<T> {
	private _handler: ContributionHandler<T> | undefined;
	private _users: readonly IContributionUser<T>[] | undefined;

	constructor(readonly name: string) {}

	setHandler(handler: ContributionHandler<T>): IDisposable {
		if (this._handler) {
			throw new Error(`[ContributionPoint] "${this.name}" ya tiene handler`);
		}
		this._handler = handler;
		if (this._users) {
			// Llegó tarde: entregarle el estado acumulado como delta inicial.
			this._invoke(this._users, { added: this._users, removed: [] });
		}
		return toDisposable(() => {
			this._handler = undefined;
		});
	}

	acceptUsers(users: readonly IContributionUser<T>[]): void {
		const previous = this._users ?? [];
		this._users = users;
		if (this._handler) {
			this._invoke(users, computeDelta(previous, users));
		}
	}

	private _invoke(users: readonly IContributionUser<T>[], delta: IContributionDelta<T>): void {
		if (delta.added.length === 0 && delta.removed.length === 0) {
			return;
		}
		try {
			this._handler!(users, delta);
		} catch (err) {
			console.error(`[ContributionPoint] handler de "${this.name}" tiró:`, err);
		}
	}
}

/**
 * Registro de puntos de contribución. El shell define los suyos al boot
 * (`commands`, `menus`, `routes`, `views`, `tools`, …); el plugin host lo alimenta.
 */
export class ContributionRegistry {
	private readonly _points = new Map<string, ContributionPoint<unknown>>();

	definePoint<T>(name: string): IContributionPoint<T> {
		if (this._points.has(name)) {
			throw new Error(`[ContributionRegistry] el punto "${name}" ya está definido`);
		}
		const point = new ContributionPoint<T>(name);
		this._points.set(name, point as ContributionPoint<unknown>);
		return point;
	}

	getPoint<T>(name: string): IContributionPoint<T> | undefined {
		return this._points.get(name) as IContributionPoint<T> | undefined;
	}

	/** Para el plugin host: acepta users hacia un punto aún no definido (se crea perezoso). */
	getOrDefinePoint<T>(name: string): IContributionPoint<T> {
		return this.getPoint<T>(name) ?? this.definePoint<T>(name);
	}

	get names(): readonly string[] {
		return [...this._points.keys()];
	}
}
