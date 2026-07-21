/*---------------------------------------------------------------------------------------------
 *  Keel — EventBus híbrido (ver .claude/ARCHITECTURE.md §8).
 *
 *  Combina lo mejor de las dos fuentes:
 *   - Canal TIPADO (estilo pizzaerp): eventos core con tipos estrictos (compile-time safe).
 *   - Canal por TOPIC dinámico (estilo excalidraw): pub/sub por string para plugins, que NO pueden
 *     agregar entradas a un catálogo fijo en compile-time.
 *
 *  Puente: `emit()` espeja el evento tipado al canal de topics con la misma key (string), así un
 *  plugin puede escuchar eventos core vía `onTopic('auth.session.started', …)`. `emitTopic()` NO
 *  espeja hacia el canal tipado (los plugins no falsifican eventos core).
 *
 *  Construido sobre el `Emitter` de ./event. Un Emitter por key/topic, creado perezosamente y
 *  podado cuando se queda sin listeners.
 *--------------------------------------------------------------------------------------------*/

import { type IDisposable } from './lifecycle';
import { Emitter, Event } from './event';

/** Args de `emit`: vacío para eventos sin payload (void/undefined), si no `[payload]`. */
type EmitArgs<P> = [P] extends [void] ? [] : [undefined] extends [P] ? [payload?: P] : [payload: P];

export class EventBus<Events extends Record<string, unknown> = Record<string, unknown>>
	implements IDisposable
{
	private readonly _typed = new Map<keyof Events, Emitter<unknown>>();
	private readonly _topics = new Map<string, Emitter<unknown>>();

	// ── canal tipado (eventos core) ──────────────────────────────────────────────────────────

	private _getTyped<K extends keyof Events>(key: K): Emitter<Events[K]> {
		let emitter = this._typed.get(key);
		if (!emitter) {
			emitter = new Emitter<unknown>({
				onDidRemoveLastListener: () => this._typed.delete(key),
			});
			this._typed.set(key, emitter);
		}
		return emitter as unknown as Emitter<Events[K]>;
	}

	/** Suscribe a un evento tipado. Retorna IDisposable para desuscribir. */
	on<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): IDisposable {
		return this._getTyped(event).event(handler);
	}

	/** Suscribe una sola vez a un evento tipado. */
	once<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): IDisposable {
		return Event.once(this._getTyped(event).event)(handler);
	}

	/** Devuelve el `Event<T>` tipado para componer con los combinadores de `Event`. */
	event<K extends keyof Events>(event: K): Event<Events[K]> {
		return this._getTyped(event).event;
	}

	/** Emite un evento tipado (y lo espeja al canal de topics con la misma key). */
	emit<K extends keyof Events>(event: K, ...args: EmitArgs<Events[K]>): void {
		const payload = args[0] as Events[K];
		this._typed.get(event)?.fire(payload);
		this._topics.get(String(event))?.fire(payload);
	}

	// ── canal por topic (plugins) ────────────────────────────────────────────────────────────

	private _getTopic(topic: string): Emitter<unknown> {
		let emitter = this._topics.get(topic);
		if (!emitter) {
			emitter = new Emitter<unknown>({
				onDidRemoveLastListener: () => this._topics.delete(topic),
			});
			this._topics.set(topic, emitter);
		}
		return emitter;
	}

	/** Suscribe a un topic dinámico (untyped). Para uso de plugins. */
	onTopic(topic: string, handler: (payload: unknown) => void): IDisposable {
		return this._getTopic(topic).event(handler);
	}

	/** Devuelve el `Event<unknown>` de un topic para componer. */
	topic(topic: string): Event<unknown> {
		return this._getTopic(topic).event;
	}

	/** Emite a un topic dinámico. No espeja al canal tipado. */
	emitTopic(topic: string, payload?: unknown): void {
		this._topics.get(topic)?.fire(payload);
	}

	dispose(): void {
		for (const emitter of [...this._typed.values()]) {
			emitter.dispose();
		}
		for (const emitter of [...this._topics.values()]) {
			emitter.dispose();
		}
		this._typed.clear();
		this._topics.clear();
	}
}

/**
 * Catálogo de eventos CORE — agnóstico al negocio. Solo eventos del shell.
 * Los plugins NO extienden esto; usan el canal por topic (namespaced, ej. 'orders.created').
 *
 * Type alias (no interface): una interface que extiende Record<string, unknown> hereda el index
 * signature y cualquier string compila como evento — se pierde la seguridad del catálogo.
 */
export type CoreEvents = {
	'auth.session.started': { userId: string };
	'auth.session.ended': undefined;
	'theme.changed': { theme: 'light' | 'dark' };
	'tab.activated': { tabId: string; routeId: string };
	'tab.closed': { tabId: string };
	'plugin.activated': { pluginId: string };
	'plugin.deactivated': { pluginId: string };
	'context.changed': { keys: readonly string[] };
};

// NOTA: platform NO exporta un singleton. El shell instancia SU bus (extendiendo CoreEvents con
// sus propios eventos de chrome) y los plugins reciben una fachada de esa instancia vía PluginAPI.
// Exportar un singleton acá crearía dos buses y eventos que "no llegan" según de dónde importás.
