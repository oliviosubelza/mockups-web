/*---------------------------------------------------------------------------------------------
 *  Adaptado de Visual Studio Code (microsoft/vscode) — Licencia MIT.
 *  Fuente: src/vs/base/common/lifecycle.ts
 *
 *  Cambios respecto al original:
 *   - Eliminado el sistema de leak-tracking pesado (DisposableTracker, GCBasedDisposableTracker,
 *     computeLeakingDisposables). Se conserva solo el hook opcional `setDisposableTracker`.
 *   - Eliminadas las dependencias de URI/ResourceMap (DisposableResourceMap) y de helpers internos;
 *     `once` e `isIterable` se inlinean acá. Sin imports externos: TS puro.
 *   - API pública preservada para que sea reconocible y compatible.
 *--------------------------------------------------------------------------------------------*/

// #region tracking opcional (no-op por defecto) ------------------------------------------------

/**
 * Hook opcional para detectar disposables filtrados. Por defecto desactivado (null).
 * Útil solo en desarrollo; en producción no agrega overhead.
 */
export interface IDisposableTracker {
	trackDisposable(disposable: IDisposable): void;
	setParent(child: IDisposable, parent: IDisposable | null): void;
	markAsDisposed(disposable: IDisposable): void;
	markAsSingleton(disposable: IDisposable): void;
}

let disposableTracker: IDisposableTracker | null = null;

export function setDisposableTracker(tracker: IDisposableTracker | null): void {
	disposableTracker = tracker;
}

export function trackDisposable<T extends IDisposable>(x: T): T {
	disposableTracker?.trackDisposable(x);
	return x;
}

export function markAsDisposed(disposable: IDisposable): void {
	disposableTracker?.markAsDisposed(disposable);
}

function setParentOfDisposable(child: IDisposable, parent: IDisposable | null): void {
	disposableTracker?.setParent(child, parent);
}

function setParentOfDisposables(children: IDisposable[], parent: IDisposable | null): void {
	if (!disposableTracker) {
		return;
	}
	for (const child of children) {
		disposableTracker.setParent(child, parent);
	}
}

/** Marca un objeto como singleton (no necesita disposal). */
export function markAsSingleton<T extends IDisposable>(singleton: T): T {
	disposableTracker?.markAsSingleton(singleton);
	return singleton;
}

// #endregion

// #region helpers inlineados ------------------------------------------------------------------

function isIterable<T = unknown>(thing: unknown): thing is Iterable<T> {
	return !!thing && typeof thing === 'object' && typeof (thing as Iterable<T>)[Symbol.iterator] === 'function';
}

/** Envuelve una función para que solo se ejecute una vez. */
function once<T extends (...args: never[]) => unknown>(fn: T): T {
	let called = false;
	let result: unknown;
	return function (this: unknown, ...args: never[]) {
		if (called) {
			return result;
		}
		called = true;
		result = fn.apply(this, args);
		return result;
	} as T;
}

// #endregion

/**
 * Un objeto que ejecuta una limpieza cuando se llama a `.dispose()`.
 */
export interface IDisposable {
	dispose(): void;
}

/** Chequea si `thing` es un {@link IDisposable}. */
export function isDisposable<E>(thing: E): thing is E & IDisposable {
	return (
		typeof thing === 'object' &&
		thing !== null &&
		typeof (thing as unknown as IDisposable).dispose === 'function' &&
		(thing as unknown as IDisposable).dispose.length === 0
	);
}

/** Hace dispose de el/los valor(es) recibidos. */
export function dispose<T extends IDisposable>(disposable: T): T;
export function dispose<T extends IDisposable>(disposable: T | undefined): T | undefined;
export function dispose<T extends IDisposable, A extends Iterable<T> = Iterable<T>>(disposables: A): A;
export function dispose<T extends IDisposable>(disposables: Array<T>): Array<T>;
export function dispose<T extends IDisposable>(disposables: ReadonlyArray<T>): ReadonlyArray<T>;
export function dispose<T extends IDisposable>(arg: T | Iterable<T> | undefined): unknown {
	if (isIterable(arg)) {
		const errors: unknown[] = [];

		for (const d of arg) {
			if (d) {
				try {
					d.dispose();
				} catch (e) {
					errors.push(e);
				}
			}
		}

		if (errors.length === 1) {
			throw errors[0];
		} else if (errors.length > 1) {
			throw new AggregateError(errors, 'Encountered errors while disposing of store');
		}

		return Array.isArray(arg) ? [] : arg;
	} else if (arg) {
		arg.dispose();
		return arg;
	}
	return undefined;
}

export function disposeIfDisposable<T extends IDisposable | object>(disposables: Array<T>): Array<T> {
	for (const d of disposables) {
		if (isDisposable(d)) {
			d.dispose();
		}
	}
	return [];
}

/** Combina varios disposables en uno solo. */
export function combinedDisposable(...disposables: IDisposable[]): IDisposable {
	const parent = toDisposable(() => dispose(disposables));
	setParentOfDisposables(disposables, parent);
	return parent;
}

class FunctionDisposable implements IDisposable {
	private _isDisposed = false;
	private readonly _fn: () => void;

	constructor(fn: () => void) {
		this._fn = fn;
		trackDisposable(this);
	}

	dispose(): void {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;
		markAsDisposed(this);
		this._fn();
	}
}

/**
 * Convierte una función de limpieza en un {@link IDisposable}.
 * La función queda garantizada de ejecutarse una sola vez.
 */
export function toDisposable(fn: () => void): IDisposable {
	return new FunctionDisposable(fn);
}

/**
 * Gestiona una colección de disposables. Forma preferida de manejar múltiples disposables:
 * más seguro que un `IDisposable[]` (maneja doble registro y registro post-dispose).
 */
export class DisposableStore implements IDisposable {
	static DISABLE_DISPOSED_WARNING = false;

	private readonly _toDispose = new Set<IDisposable>();
	private _isDisposed = false;

	constructor() {
		trackDisposable(this);
	}

	/** Dispone todos los registrados y marca este store como disposed. */
	public dispose(): void {
		if (this._isDisposed) {
			return;
		}
		markAsDisposed(this);
		this._isDisposed = true;
		this.clear();
	}

	public get isDisposed(): boolean {
		return this._isDisposed;
	}

	/** Dispone todos los registrados pero NO marca el store como disposed. */
	public clear(): void {
		if (this._toDispose.size === 0) {
			return;
		}
		try {
			dispose(this._toDispose);
		} finally {
			this._toDispose.clear();
		}
	}

	/** Agrega un nuevo disposable a la colección. */
	public add<T extends IDisposable>(o: T): T {
		if (!o || (o as unknown) === Disposable.None) {
			return o;
		}
		if ((o as unknown as DisposableStore) === this) {
			throw new Error('Cannot register a disposable on itself!');
		}

		setParentOfDisposable(o, this);
		if (this._isDisposed) {
			if (!DisposableStore.DISABLE_DISPOSED_WARNING) {
				console.warn(
					new Error(
						'Trying to add a disposable to a DisposableStore that has already been disposed of. The added object will be leaked!'
					).stack
				);
			}
		} else {
			this._toDispose.add(o);
		}
		return o;
	}

	/** Saca un disposable del store y lo dispone. */
	public delete<T extends IDisposable>(o: T): void {
		if (!o) {
			return;
		}
		if ((o as unknown as DisposableStore) === this) {
			throw new Error('Cannot dispose a disposable on itself!');
		}
		this._toDispose.delete(o);
		o.dispose();
	}

	/** Saca el valor del store pero NO lo dispone. */
	public deleteAndLeak<T extends IDisposable>(o: T): void {
		if (!o) {
			return;
		}
		if (this._toDispose.delete(o)) {
			setParentOfDisposable(o, null);
		}
	}
}

/**
 * Clase base abstracta para un objeto disposable.
 * Las subclases pueden usar `_register(...)` para registrar disposables que se limpian
 * automáticamente cuando este objeto se dispone.
 */
export abstract class Disposable implements IDisposable {
	/** Un disposable que no hace nada. */
	static readonly None = Object.freeze<IDisposable>({ dispose() {} });

	protected readonly _store = new DisposableStore();

	constructor() {
		trackDisposable(this);
		setParentOfDisposable(this._store, this);
	}

	public dispose(): void {
		markAsDisposed(this);
		this._store.dispose();
	}

	protected _register<T extends IDisposable>(o: T): T {
		if ((o as unknown as Disposable) === this) {
			throw new Error('Cannot register a disposable on itself!');
		}
		return this._store.add(o);
	}
}

/**
 * Gestiona el ciclo de vida de un disposable que puede cambiar.
 * Al cambiar el valor, el anterior se dispone automáticamente.
 */
export class MutableDisposable<T extends IDisposable> implements IDisposable {
	private _value?: T;
	private _isDisposed = false;

	constructor() {
		trackDisposable(this);
	}

	get value(): T | undefined {
		return this._isDisposed ? undefined : this._value;
	}

	set value(value: T | undefined) {
		if (this._isDisposed || value === this._value) {
			return;
		}
		this._value?.dispose();
		if (value) {
			setParentOfDisposable(value, this);
		}
		this._value = value;
	}

	clear(): void {
		this.value = undefined;
	}

	dispose(): void {
		this._isDisposed = true;
		markAsDisposed(this);
		this._value?.dispose();
		this._value = undefined;
	}

	/** Limpia el valor pero NO lo dispone; lo retorna. */
	clearAndLeak(): T | undefined {
		const oldValue = this._value;
		this._value = undefined;
		if (oldValue) {
			setParentOfDisposable(oldValue, null);
		}
		return oldValue;
	}
}

/** Como {@link MutableDisposable} pero el valor siempre debe existir. */
export class MandatoryMutableDisposable<T extends IDisposable> implements IDisposable {
	private readonly _disposable = new MutableDisposable<T>();
	private _isDisposed = false;

	constructor(initialValue: T) {
		this._disposable.value = initialValue;
	}

	get value(): T {
		return this._disposable.value!;
	}

	set value(value: T) {
		if (this._isDisposed || value === this._disposable.value) {
			return;
		}
		this._disposable.value = value;
	}

	dispose() {
		this._isDisposed = true;
		this._disposable.dispose();
	}
}

/** Disposable con conteo de referencias: se dispone cuando el contador llega a 0. */
export class RefCountedDisposable {
	private _counter = 1;

	constructor(private readonly _disposable: IDisposable) {}

	acquire(): this {
		this._counter++;
		return this;
	}

	release(): this {
		if (--this._counter === 0) {
			this._disposable.dispose();
		}
		return this;
	}
}

export interface IReference<T> extends IDisposable {
	readonly object: T;
}

export abstract class ReferenceCollection<T> {
	private readonly references = new Map<string, { readonly object: T; counter: number }>();

	acquire(key: string, ...args: unknown[]): IReference<T> {
		let reference = this.references.get(key);

		if (!reference) {
			reference = { counter: 0, object: this.createReferencedObject(key, ...args) };
			this.references.set(key, reference);
		}

		const { object } = reference;
		const release = once(() => {
			if (--reference!.counter === 0) {
				this.destroyReferencedObject(key, reference!.object);
				this.references.delete(key);
			}
		});

		reference.counter++;

		return { object, dispose: release };
	}

	protected abstract createReferencedObject(key: string, ...args: unknown[]): T;
	protected abstract destroyReferencedObject(key: string, object: T): void;
}

export class ImmortalReference<T> implements IReference<T> {
	constructor(public object: T) {}
	dispose(): void {
		/* noop */
	}
}

/** Crea un DisposableStore, corre `fn` y dispone el store al terminar (aunque tire error). */
export function disposeOnReturn(fn: (store: DisposableStore) => void): void {
	const store = new DisposableStore();
	try {
		fn(store);
	} finally {
		store.dispose();
	}
}

/** Un Map que gestiona el ciclo de vida de sus valores. */
export class DisposableMap<K, V extends IDisposable = IDisposable> implements IDisposable {
	private readonly _store: Map<K, V>;
	private _isDisposed = false;

	constructor(store: Map<K, V> = new Map<K, V>()) {
		this._store = store;
		trackDisposable(this);
	}

	dispose(): void {
		markAsDisposed(this);
		this._isDisposed = true;
		this.clearAndDisposeAll();
	}

	clearAndDisposeAll(): void {
		if (!this._store.size) {
			return;
		}
		try {
			dispose(this._store.values());
		} finally {
			this._store.clear();
		}
	}

	has(key: K): boolean {
		return this._store.has(key);
	}

	get size(): number {
		return this._store.size;
	}

	get(key: K): V | undefined {
		return this._store.get(key);
	}

	set(key: K, value: V, skipDisposeOnOverwrite = false): void {
		if (this._isDisposed) {
			console.warn(
				new Error(
					'Trying to add a disposable to a DisposableMap that has already been disposed of. The added object will be leaked!'
				).stack
			);
		}
		if (!skipDisposeOnOverwrite) {
			this._store.get(key)?.dispose();
		}
		this._store.set(key, value);
		setParentOfDisposable(value, this);
	}

	deleteAndDispose(key: K): void {
		this._store.get(key)?.dispose();
		this._store.delete(key);
	}

	deleteAndLeak(key: K): V | undefined {
		const value = this._store.get(key);
		if (value) {
			setParentOfDisposable(value, null);
		}
		this._store.delete(key);
		return value;
	}

	keys(): IterableIterator<K> {
		return this._store.keys();
	}

	values(): IterableIterator<V> {
		return this._store.values();
	}

	[Symbol.iterator](): IterableIterator<[K, V]> {
		return this._store[Symbol.iterator]();
	}
}

/** Un Set que gestiona el ciclo de vida de sus valores. */
export class DisposableSet<V extends IDisposable = IDisposable> implements IDisposable {
	private readonly _store: Set<V>;
	private _isDisposed = false;

	constructor(store: Set<V> = new Set<V>()) {
		this._store = store;
		trackDisposable(this);
	}

	dispose(): void {
		markAsDisposed(this);
		this._isDisposed = true;
		this.clearAndDisposeAll();
	}

	clearAndDisposeAll(): void {
		if (!this._store.size) {
			return;
		}
		try {
			dispose(this._store.values());
		} finally {
			this._store.clear();
		}
	}

	has(value: V): boolean {
		return this._store.has(value);
	}

	get size(): number {
		return this._store.size;
	}

	add(value: V): void {
		if (this._isDisposed) {
			console.warn(
				new Error(
					'Trying to add a disposable to a DisposableSet that has already been disposed of. The added object will be leaked!'
				).stack
			);
		}
		this._store.add(value);
		setParentOfDisposable(value, this);
	}

	deleteAndDispose(value: V): void {
		if (this._store.delete(value)) {
			value.dispose();
		}
	}

	values(): IterableIterator<V> {
		return this._store.values();
	}

	[Symbol.iterator](): IterableIterator<V> {
		return this._store[Symbol.iterator]();
	}
}

/** Llama a `then` sobre una promesa, salvo que el disposable retornado haya sido disposed. */
export function thenIfNotDisposed<T>(promise: Promise<T>, then: (result: T) => void): IDisposable {
	let disposed = false;
	promise.then((result) => {
		if (disposed) {
			return;
		}
		then(result);
	});
	return toDisposable(() => {
		disposed = true;
	});
}
