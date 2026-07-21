/*---------------------------------------------------------------------------------------------
 *  Adaptado de Visual Studio Code (microsoft/vscode) — Licencia MIT.
 *  Fuente: src/vs/base/common/event.ts
 *
 *  Qué es: la primitiva de eventos componible y tipada (`Emitter` + `Event`). Un `Emitter<T>`
 *  expone `.event` (un `Event<T>` al que te suscribís y te devuelve un IDisposable) y `.fire(v)`.
 *  El namespace `Event` trae combinadores (once/map/filter/debounce/any/…) para componer eventos.
 *
 *  Cambios respecto al original (~1960 líneas, muy optimizado):
 *   - Reimplementación COMPACTA: listeners en un Set, snapshot al disparar, manejo de errores
 *     por-listener. Se omiten LinkedList, EventDeliveryQueue, EventProfiling, leak-warnings,
 *     AsyncEmitter, EventMultiplexer, integración con observables, etc.
 *   - Se conservan: Emitter, EmitterOptions (callbacks de lazy resource mgmt), y los combinadores
 *     más usados del namespace Event. API/semántica reconocibles.
 *   - Única dependencia: ./lifecycle (IDisposable, DisposableStore, Disposable, toDisposable,
 *     combinedDisposable).
 *--------------------------------------------------------------------------------------------*/

import {
	type IDisposable,
	Disposable,
	DisposableStore,
	toDisposable,
	combinedDisposable,
} from './lifecycle';

function defaultErrorHandler(e: unknown): void {
	console.error(e);
}

/**
 * Un evento al que te podés suscribir. Suscribirse devuelve un {@link IDisposable} que, al
 * disponerse, cancela la suscripción.
 */
export interface Event<T> {
	(listener: (e: T) => unknown, thisArgs?: unknown, disposables?: IDisposable[] | DisposableStore): IDisposable;
}

export interface EmitterOptions {
	/** Se llama justo antes de agregar el PRIMER listener (para adquirir recursos perezosamente). */
	onWillAddFirstListener?: () => void;
	/** Se llama justo después de agregar el primer listener. */
	onDidAddFirstListener?: () => void;
	/** Se llama después de remover el ÚLTIMO listener (para liberar recursos). */
	onDidRemoveLastListener?: () => void;
	/** Manejador de errores cuando un listener tira. Por defecto: console.error. */
	onListenerError?: (e: unknown) => void;
}

type Listener<T> = (e: T) => unknown;

/**
 * Emisor de eventos. Mantené uno privado y exponé solo su `.event` al exterior.
 */
export class Emitter<T> {
	private readonly _options?: EmitterOptions;
	private _listeners?: Set<Listener<T>>;
	private _event?: Event<T>;
	private _disposed = false;

	constructor(options?: EmitterOptions) {
		this._options = options;
	}

	/** El {@link Event} público al que otros se suscriben. */
	get event(): Event<T> {
		if (!this._event) {
			this._event = (listener, thisArgs, disposables) => {
				if (this._disposed) {
					return Disposable.None;
				}

				const callback: Listener<T> = thisArgs ? (e: T) => listener.call(thisArgs, e) : listener;

				if (!this._listeners) {
					this._listeners = new Set();
				}

				const firstListener = this._listeners.size === 0;
				if (firstListener) {
					this._options?.onWillAddFirstListener?.();
				}

				this._listeners.add(callback);

				if (firstListener) {
					this._options?.onDidAddFirstListener?.();
				}

				const result = toDisposable(() => {
					if (this._disposed || !this._listeners) {
						return;
					}
					if (this._listeners.delete(callback) && this._listeners.size === 0) {
						this._options?.onDidRemoveLastListener?.();
					}
				});

				if (disposables instanceof DisposableStore) {
					disposables.add(result);
				} else if (Array.isArray(disposables)) {
					disposables.push(result);
				}

				return result;
			};
		}
		return this._event;
	}

	/** Dispara el evento a todos los listeners actuales (robusto ante add/remove durante el fire). */
	fire(event: T): void {
		if (!this._listeners || this._listeners.size === 0) {
			return;
		}
		// snapshot: un listener puede agregar/quitar otros durante la entrega
		const snapshot = Array.from(this._listeners);
		const onError = this._options?.onListenerError ?? defaultErrorHandler;
		for (const listener of snapshot) {
			try {
				listener(event);
			} catch (e) {
				onError(e);
			}
		}
	}

	get hasListeners(): boolean {
		return !!this._listeners && this._listeners.size > 0;
	}

	dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		if (this._listeners && this._listeners.size > 0) {
			this._listeners.clear();
			this._options?.onDidRemoveLastListener?.();
		}
		this._listeners = undefined;
	}
}

// #region combinadores --------------------------------------------------------------------------

/**
 * Crea un Event derivado que se suscribe perezosamente a la fuente (solo mientras tenga listeners),
 * evitando fugas. `setup` recibe un `fire` y devuelve el IDisposable de la suscripción a la fuente.
 */
function deriveLazily<O>(setup: (fire: (o: O) => void) => IDisposable): Event<O> {
	let subscription: IDisposable | undefined;
	const emitter = new Emitter<O>({
		onWillAddFirstListener() {
			subscription = setup((o) => emitter.fire(o));
		},
		onDidRemoveLastListener() {
			subscription?.dispose();
			subscription = undefined;
		},
	});
	return emitter.event;
}

export namespace Event {
	/** Un evento que nunca dispara. */
	export const None: Event<never> = () => Disposable.None;

	/** Dispara como mucho una vez y luego se auto-desuscribe. */
	export function once<T>(event: Event<T>): Event<T> {
		return (listener, thisArgs = null, disposables?) => {
			let didFire = false;
			let result: IDisposable | undefined = undefined;
			result = event(
				(e) => {
					if (didFire) {
						return;
					} else if (result) {
						result.dispose();
					} else {
						didFire = true;
					}
					return listener.call(thisArgs, e);
				},
				null,
				disposables
			);
			if (didFire) {
				result.dispose();
			}
			return result;
		};
	}

	/** Transforma cada valor del evento. */
	export function map<I, O>(event: Event<I>, map: (i: I) => O): Event<O> {
		return deriveLazily<O>((fire) => event((i) => fire(map(i))));
	}

	/** Ejecuta un efecto secundario por cada valor y reenvía el valor. */
	export function forEach<I>(event: Event<I>, each: (i: I) => void): Event<I> {
		return deriveLazily<I>((fire) =>
			event((i) => {
				each(i);
				fire(i);
			})
		);
	}

	/** Filtra los valores del evento. */
	export function filter<T, U extends T>(event: Event<T>, filter: (e: T) => e is U): Event<U>;
	export function filter<T>(event: Event<T>, filter: (e: T) => boolean): Event<T>;
	export function filter<T>(event: Event<T>, filter: (e: T) => boolean): Event<T> {
		return deriveLazily<T>((fire) =>
			event((e) => {
				if (filter(e)) {
					fire(e);
				}
			})
		);
	}

	/** Convierte cualquier evento en un evento `void` (señal). */
	export function signal<T>(event: Event<T>): Event<void> {
		return map(event, () => undefined);
	}

	/** Combina varios eventos en uno solo. */
	export function any<T>(...events: Event<T>[]): Event<T> {
		return deriveLazily<T>((fire) => combinedDisposable(...events.map((event) => event((e) => fire(e)))));
	}

	/** Solo dispara cuando el valor cambia respecto al anterior (según `equals`). */
	export function latch<T>(event: Event<T>, equals: (a: T, b: T) => boolean = (a, b) => a === b): Event<T> {
		let firstCall = true;
		let cache: T;
		return filter(event, (value) => {
			const shouldEmit = firstCall || !equals(value, cache);
			firstCall = false;
			cache = value;
			return shouldEmit;
		});
	}

	/**
	 * Agrupa ráfagas de eventos con un debounce. `merge` acumula los valores; dispara `delay` ms
	 * después del último. Con `leading`, también dispara en el primer valor de la ráfaga.
	 */
	export function debounce<T>(event: Event<T>, merge: (last: T | undefined, event: T) => T, delay?: number, leading?: boolean): Event<T>;
	export function debounce<I, O>(event: Event<I>, merge: (last: O | undefined, event: I) => O, delay?: number, leading?: boolean): Event<O>;
	export function debounce<I, O>(
		event: Event<I>,
		merge: (last: O | undefined, event: I) => O,
		delay = 100,
		leading = false
	): Event<O> {
		let output: O | undefined = undefined;
		let handle: ReturnType<typeof setTimeout> | undefined = undefined;
		let firstInBatch = true;
		return deriveLazily<O>((fire) =>
			event((cur) => {
				output = merge(output, cur);
				if (leading && firstInBatch) {
					firstInBatch = false;
					fire(output);
					output = undefined;
				}
				if (handle !== undefined) {
					clearTimeout(handle);
				}
				handle = setTimeout(() => {
					const d = output;
					output = undefined;
					handle = undefined;
					firstInBatch = true;
					if (!leading || d !== undefined) {
						fire(d as O);
					}
				}, delay);
			})
		);
	}

	/** Corre `handler` inmediatamente con `initial` y luego en cada evento. */
	export function runAndSubscribe<T>(event: Event<T>, handler: (e: T) => unknown, initial: T): IDisposable;
	export function runAndSubscribe<T>(event: Event<T>, handler: (e: T | undefined) => unknown): IDisposable;
	export function runAndSubscribe<T>(event: Event<T>, handler: (e: T | undefined) => unknown, initial?: T): IDisposable {
		handler(initial);
		return event((e) => handler(e));
	}

	export interface NodeEventEmitter {
		on(event: string, listener: (...args: unknown[]) => void): unknown;
		removeListener(event: string, listener: (...args: unknown[]) => void): unknown;
	}

	/** Convierte un EventEmitter de Node en un {@link Event}. */
	export function fromNodeEventEmitter<T>(
		emitter: NodeEventEmitter,
		eventName: string,
		map: (...args: unknown[]) => T = (id) => id as T
	): Event<T> {
		const fn = (...args: unknown[]) => result.fire(map(...args));
		const onFirstListenerAdd = () => emitter.on(eventName, fn);
		const onLastListenerRemove = () => emitter.removeListener(eventName, fn);
		const result = new Emitter<T>({
			onWillAddFirstListener: onFirstListenerAdd,
			onDidRemoveLastListener: onLastListenerRemove,
		});
		return result.event;
	}

	export interface DOMEventEmitter {
		addEventListener(event: string | symbol, listener: (...args: unknown[]) => void): void;
		removeEventListener(event: string | symbol, listener: (...args: unknown[]) => void): void;
	}

	/** Convierte un EventTarget del DOM en un {@link Event}. */
	export function fromDOMEventEmitter<T>(
		emitter: DOMEventEmitter,
		eventName: string,
		map: (...args: unknown[]) => T = (id) => id as T
	): Event<T> {
		const fn = (...args: unknown[]) => result.fire(map(...args));
		const onFirstListenerAdd = () => emitter.addEventListener(eventName, fn);
		const onLastListenerRemove = () => emitter.removeEventListener(eventName, fn);
		const result = new Emitter<T>({
			onWillAddFirstListener: onFirstListenerAdd,
			onDidRemoveLastListener: onLastListenerRemove,
		});
		return result.event;
	}

	/** Reenvía los eventos de `from` hacia el emitter `to`. */
	export function forward<T>(from: Event<T>, to: Emitter<T>): IDisposable {
		return from((e) => to.fire(e));
	}
}

// #endregion

/**
 * Un emitter cuya fuente puede cambiarse en runtime. Los suscriptores de `.event` siguen
 * recibiendo eventos aunque cambie el `input`. Útil para "reconectar" eventos.
 */
export class Relay<T> implements IDisposable {
	private readonly emitter = new Emitter<T>({
		onWillAddFirstListener: () => this._subscribe(),
		onDidRemoveLastListener: () => this._unsubscribe(),
	});

	private _input: Event<T> = Event.None;
	private _subscription: IDisposable | undefined;

	readonly event: Event<T> = this.emitter.event;

	private _subscribe(): void {
		this._subscription = this._input((e) => this.emitter.fire(e));
	}

	private _unsubscribe(): void {
		this._subscription?.dispose();
		this._subscription = undefined;
	}

	set input(event: Event<T>) {
		this._input = event;
		if (this.emitter.hasListeners) {
			this._unsubscribe();
			this._subscribe();
		}
	}

	dispose(): void {
		this._unsubscribe();
		this.emitter.dispose();
	}
}
