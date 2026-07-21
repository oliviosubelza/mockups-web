/*---------------------------------------------------------------------------------------------
 *  Adaptado de Visual Studio Code (microsoft/vscode) — Licencia MIT.
 *  Fuente: src/vs/platform/contextkey/common/contextkey.ts (+ scanner.ts)
 *
 *  Qué es: el motor de expresiones `when` — parsea strings como
 *      "entitled:billing && activeView == 'orders' && !isReadonly"
 *  a un AST y lo evalúa contra un contexto. Es lo que hace condicionales los menús,
 *  keybindings y comandos (gating declarativo, incluido el de entitlements).
 *
 *  Cambios respecto al original:
 *   - Reimplementación COMPACTA del parser (estilo `deserialize` legacy: split por || y &&)
 *     en vez del Scanner/Parser completo de VSCode (~2200 líneas con recuperación de errores,
 *     sugerencias y nls). Mismas semánticas para los operadores soportados.
 *   - Operadores soportados: && || ! == != =~ (regex) > >= < <=, y key "definido" (truthy).
 *     (Omitidos respecto al original: `in` / `not in`. Fáciles de agregar si hacen falta.)
 *   - Se incluye un `ContextKeyService` reactivo liviano (Map + listeners) en vez del servicio
 *     con DI. Solo depende de `./lifecycle` (IDisposable / toDisposable).
 *   - Las claves admiten `[A-Za-z0-9_.\-:]` para soportar formas tipo `entitled:billing`.
 *--------------------------------------------------------------------------------------------*/

import { type IDisposable, toDisposable } from './lifecycle';

export type ContextKeyValue =
	| null
	| undefined
	| boolean
	| number
	| string
	| Array<null | undefined | boolean | number | string>
	| Record<string, null | undefined | boolean | number | string>;

/** Contexto contra el que se evalúa una expresión `when`. */
export interface IContext {
	getValue<T = ContextKeyValue>(key: string): T | undefined;
}

export const enum ContextKeyExprType {
	False = 0,
	True = 1,
	Defined = 2,
	Not = 3,
	Equals = 4,
	NotEquals = 5,
	And = 6,
	Or = 7,
	Regex = 8,
	Greater = 9,
	GreaterEquals = 10,
	Smaller = 11,
	SmallerEquals = 12,
}

export interface IContextKeyExpression {
	readonly type: ContextKeyExprType;
	evaluate(context: IContext): boolean;
	serialize(): string;
	keys(): string[];
	equals(other: ContextKeyExpression): boolean;
}

export type ContextKeyExpression =
	| ContextKeyFalseExpr
	| ContextKeyTrueExpr
	| ContextKeyDefinedExpr
	| ContextKeyNotExpr
	| ContextKeyEqualsExpr
	| ContextKeyNotEqualsExpr
	| ContextKeyRegexExpr
	| ContextKeyGreaterExpr
	| ContextKeyGreaterEqualsExpr
	| ContextKeySmallerExpr
	| ContextKeySmallerEqualsExpr
	| ContextKeyAndExpr
	| ContextKeyOrExpr;

// #region helpers -----------------------------------------------------------------------------

const KEY_RE = /[A-Za-z0-9_.\-:]+/;

/** Convierte el lado derecho de `==` / `!=` a su valor tipado (bool/string). */
function deserializeValue(raw: string): boolean | string {
	const v = raw.trim();
	if (v === 'true') {
		return true;
	}
	if (v === 'false') {
		return false;
	}
	const m = /^'([^']*)'$/.exec(v);
	if (m) {
		return m[1];
	}
	return v;
}

/* eslint-disable eqeqeq */
function looseEquals(a: unknown, b: unknown): boolean {
	// VSCode usa igualdad débil (==) para Equals/NotEquals.
	return (a as never) == (b as never);
}
/* eslint-enable eqeqeq */

function toNumber(v: unknown): number {
	if (typeof v === 'number') {
		return v;
	}
	if (typeof v === 'string') {
		return parseFloat(v);
	}
	return NaN;
}

// #endregion

// #region nodos del AST -----------------------------------------------------------------------

export class ContextKeyFalseExpr implements IContextKeyExpression {
	static INSTANCE = new ContextKeyFalseExpr();
	readonly type = ContextKeyExprType.False;
	protected constructor() {}
	evaluate(): boolean {
		return false;
	}
	serialize(): string {
		return 'false';
	}
	keys(): string[] {
		return [];
	}
	equals(other: ContextKeyExpression): boolean {
		return other.type === this.type;
	}
}

export class ContextKeyTrueExpr implements IContextKeyExpression {
	static INSTANCE = new ContextKeyTrueExpr();
	readonly type = ContextKeyExprType.True;
	protected constructor() {}
	evaluate(): boolean {
		return true;
	}
	serialize(): string {
		return 'true';
	}
	keys(): string[] {
		return [];
	}
	equals(other: ContextKeyExpression): boolean {
		return other.type === this.type;
	}
}

export class ContextKeyDefinedExpr implements IContextKeyExpression {
	static create(key: string): ContextKeyExpression {
		return new ContextKeyDefinedExpr(key);
	}
	readonly type = ContextKeyExprType.Defined;
	protected constructor(readonly key: string) {}
	evaluate(context: IContext): boolean {
		return !!context.getValue(this.key);
	}
	serialize(): string {
		return this.key;
	}
	keys(): string[] {
		return [this.key];
	}
	equals(other: ContextKeyExpression): boolean {
		return other.type === this.type && other.key === this.key;
	}
}

export class ContextKeyNotExpr implements IContextKeyExpression {
	static create(key: string): ContextKeyExpression {
		return new ContextKeyNotExpr(key);
	}
	readonly type = ContextKeyExprType.Not;
	protected constructor(readonly key: string) {}
	evaluate(context: IContext): boolean {
		return !context.getValue(this.key);
	}
	serialize(): string {
		return `!${this.key}`;
	}
	keys(): string[] {
		return [this.key];
	}
	equals(other: ContextKeyExpression): boolean {
		return other.type === this.type && other.key === this.key;
	}
}

export class ContextKeyEqualsExpr implements IContextKeyExpression {
	static create(key: string, value: boolean | string): ContextKeyExpression {
		return new ContextKeyEqualsExpr(key, value);
	}
	readonly type = ContextKeyExprType.Equals;
	protected constructor(readonly key: string, readonly value: boolean | string) {}
	evaluate(context: IContext): boolean {
		return looseEquals(context.getValue(this.key), this.value);
	}
	serialize(): string {
		return `${this.key} == '${this.value}'`;
	}
	keys(): string[] {
		return [this.key];
	}
	equals(other: ContextKeyExpression): boolean {
		return other.type === this.type && other.key === this.key && other.value === this.value;
	}
}

export class ContextKeyNotEqualsExpr implements IContextKeyExpression {
	static create(key: string, value: boolean | string): ContextKeyExpression {
		return new ContextKeyNotEqualsExpr(key, value);
	}
	readonly type = ContextKeyExprType.NotEquals;
	protected constructor(readonly key: string, readonly value: boolean | string) {}
	evaluate(context: IContext): boolean {
		return !looseEquals(context.getValue(this.key), this.value);
	}
	serialize(): string {
		return `${this.key} != '${this.value}'`;
	}
	keys(): string[] {
		return [this.key];
	}
	equals(other: ContextKeyExpression): boolean {
		return other.type === this.type && other.key === this.key && other.value === this.value;
	}
}

export class ContextKeyRegexExpr implements IContextKeyExpression {
	static create(key: string, regexp: RegExp | null): ContextKeyExpression {
		return new ContextKeyRegexExpr(key, regexp);
	}
	readonly type = ContextKeyExprType.Regex;
	protected constructor(readonly key: string, readonly regexp: RegExp | null) {}
	evaluate(context: IContext): boolean {
		const value = context.getValue<unknown>(this.key);
		return this.regexp ? this.regexp.test(String(value ?? '')) : false;
	}
	serialize(): string {
		const source = this.regexp ? `/${this.regexp.source}/${this.regexp.flags}` : '/invalid/';
		return `${this.key} =~ ${source}`;
	}
	keys(): string[] {
		return [this.key];
	}
	equals(other: ContextKeyExpression): boolean {
		return (
			other.type === this.type &&
			other.key === this.key &&
			String(other.regexp) === String(this.regexp)
		);
	}
}

abstract class ContextKeyCompareExpr implements IContextKeyExpression {
	abstract readonly type: ContextKeyExprType;
	constructor(readonly key: string, readonly value: number, private readonly _op: string) {}
	abstract evaluate(context: IContext): boolean;
	serialize(): string {
		return `${this.key} ${this._op} ${this.value}`;
	}
	keys(): string[] {
		return [this.key];
	}
	equals(other: ContextKeyExpression): boolean {
		return (
			other.type === this.type &&
			(other as ContextKeyCompareExpr).key === this.key &&
			(other as ContextKeyCompareExpr).value === this.value
		);
	}
}

export class ContextKeyGreaterExpr extends ContextKeyCompareExpr {
	static create(key: string, value: number) {
		return new ContextKeyGreaterExpr(key, value);
	}
	readonly type = ContextKeyExprType.Greater;
	private constructor(key: string, value: number) {
		super(key, value, '>');
	}
	evaluate(context: IContext): boolean {
		return toNumber(context.getValue(this.key)) > this.value;
	}
}

export class ContextKeyGreaterEqualsExpr extends ContextKeyCompareExpr {
	static create(key: string, value: number) {
		return new ContextKeyGreaterEqualsExpr(key, value);
	}
	readonly type = ContextKeyExprType.GreaterEquals;
	private constructor(key: string, value: number) {
		super(key, value, '>=');
	}
	evaluate(context: IContext): boolean {
		return toNumber(context.getValue(this.key)) >= this.value;
	}
}

export class ContextKeySmallerExpr extends ContextKeyCompareExpr {
	static create(key: string, value: number) {
		return new ContextKeySmallerExpr(key, value);
	}
	readonly type = ContextKeyExprType.Smaller;
	private constructor(key: string, value: number) {
		super(key, value, '<');
	}
	evaluate(context: IContext): boolean {
		return toNumber(context.getValue(this.key)) < this.value;
	}
}

export class ContextKeySmallerEqualsExpr extends ContextKeyCompareExpr {
	static create(key: string, value: number) {
		return new ContextKeySmallerEqualsExpr(key, value);
	}
	readonly type = ContextKeyExprType.SmallerEquals;
	private constructor(key: string, value: number) {
		super(key, value, '<=');
	}
	evaluate(context: IContext): boolean {
		return toNumber(context.getValue(this.key)) <= this.value;
	}
}

export class ContextKeyAndExpr implements IContextKeyExpression {
	static create(parts: ReadonlyArray<ContextKeyExpression | null | undefined>): ContextKeyExpression {
		const expr = ContextKeyAndExpr._normalize(parts);
		if (expr.length === 0) {
			return ContextKeyTrueExpr.INSTANCE;
		}
		if (expr.length === 1) {
			return expr[0];
		}
		return new ContextKeyAndExpr(expr);
	}

	private static _normalize(
		parts: ReadonlyArray<ContextKeyExpression | null | undefined>
	): ContextKeyExpression[] {
		const result: ContextKeyExpression[] = [];
		for (const p of parts) {
			if (!p) {
				continue;
			}
			if (p.type === ContextKeyExprType.True) {
				continue;
			}
			if (p.type === ContextKeyExprType.False) {
				return [ContextKeyFalseExpr.INSTANCE];
			}
			if (p.type === ContextKeyExprType.And) {
				result.push(...(p as ContextKeyAndExpr).expr);
				continue;
			}
			result.push(p);
		}
		return result;
	}

	readonly type = ContextKeyExprType.And;
	protected constructor(readonly expr: ContextKeyExpression[]) {}
	evaluate(context: IContext): boolean {
		return this.expr.every((e) => e.evaluate(context));
	}
	serialize(): string {
		return this.expr.map((e) => e.serialize()).join(' && ');
	}
	keys(): string[] {
		return this.expr.flatMap((e) => e.keys());
	}
	equals(other: ContextKeyExpression): boolean {
		if (other.type !== this.type) {
			return false;
		}
		const o = other as ContextKeyAndExpr;
		return o.expr.length === this.expr.length && this.expr.every((e, i) => e.equals(o.expr[i]));
	}
}

export class ContextKeyOrExpr implements IContextKeyExpression {
	static create(parts: ReadonlyArray<ContextKeyExpression | null | undefined>): ContextKeyExpression {
		const expr = ContextKeyOrExpr._normalize(parts);
		if (expr.length === 0) {
			return ContextKeyFalseExpr.INSTANCE;
		}
		if (expr.length === 1) {
			return expr[0];
		}
		return new ContextKeyOrExpr(expr);
	}

	private static _normalize(
		parts: ReadonlyArray<ContextKeyExpression | null | undefined>
	): ContextKeyExpression[] {
		const result: ContextKeyExpression[] = [];
		for (const p of parts) {
			if (!p) {
				continue;
			}
			if (p.type === ContextKeyExprType.False) {
				continue;
			}
			if (p.type === ContextKeyExprType.True) {
				return [ContextKeyTrueExpr.INSTANCE];
			}
			if (p.type === ContextKeyExprType.Or) {
				result.push(...(p as ContextKeyOrExpr).expr);
				continue;
			}
			result.push(p);
		}
		return result;
	}

	readonly type = ContextKeyExprType.Or;
	protected constructor(readonly expr: ContextKeyExpression[]) {}
	evaluate(context: IContext): boolean {
		return this.expr.some((e) => e.evaluate(context));
	}
	serialize(): string {
		return this.expr.map((e) => e.serialize()).join(' || ');
	}
	keys(): string[] {
		return this.expr.flatMap((e) => e.keys());
	}
	equals(other: ContextKeyExpression): boolean {
		if (other.type !== this.type) {
			return false;
		}
		const o = other as ContextKeyOrExpr;
		return o.expr.length === this.expr.length && this.expr.every((e, i) => e.equals(o.expr[i]));
	}
}

// #endregion

// #region API pública (builders + parser) -----------------------------------------------------

export abstract class ContextKeyExpr {
	static has(key: string): ContextKeyExpression {
		return ContextKeyDefinedExpr.create(key);
	}
	static equals(key: string, value: boolean | string): ContextKeyExpression {
		return ContextKeyEqualsExpr.create(key, value);
	}
	static notEquals(key: string, value: boolean | string): ContextKeyExpression {
		return ContextKeyNotEqualsExpr.create(key, value);
	}
	static regex(key: string, value: RegExp): ContextKeyExpression {
		return ContextKeyRegexExpr.create(key, value);
	}
	static not(key: string): ContextKeyExpression {
		return ContextKeyNotExpr.create(key);
	}
	static greater(key: string, value: number): ContextKeyExpression {
		return ContextKeyGreaterExpr.create(key, value);
	}
	static greaterEquals(key: string, value: number): ContextKeyExpression {
		return ContextKeyGreaterEqualsExpr.create(key, value);
	}
	static smaller(key: string, value: number): ContextKeyExpression {
		return ContextKeySmallerExpr.create(key, value);
	}
	static smallerEquals(key: string, value: number): ContextKeyExpression {
		return ContextKeySmallerEqualsExpr.create(key, value);
	}
	static and(
		...expr: Array<ContextKeyExpression | null | undefined>
	): ContextKeyExpression {
		return ContextKeyAndExpr.create(expr);
	}
	static or(
		...expr: Array<ContextKeyExpression | null | undefined>
	): ContextKeyExpression {
		return ContextKeyOrExpr.create(expr);
	}
	static true(): ContextKeyExpression {
		return ContextKeyTrueExpr.INSTANCE;
	}
	static false(): ContextKeyExpression {
		return ContextKeyFalseExpr.INSTANCE;
	}

	/**
	 * Parsea un string `when` a una expresión. Devuelve `undefined` si está vacío.
	 * Gramática: OR de términos separados por `||`; cada término es un AND de factores separados por `&&`.
	 */
	static deserialize(serialized: string | null | undefined): ContextKeyExpression | undefined {
		if (serialized === undefined || serialized === null) {
			return undefined;
		}
		const trimmed = serialized.trim();
		if (trimmed === '') {
			return undefined;
		}
		const orParts = trimmed.split('||');
		return ContextKeyOrExpr.create(orParts.map((p) => ContextKeyExpr._deserializeAnd(p)));
	}

	private static _deserializeAnd(serialized: string): ContextKeyExpression {
		const andParts = serialized.split('&&');
		return ContextKeyAndExpr.create(andParts.map((p) => ContextKeyExpr._deserializeOne(p.trim())));
	}

	private static _deserializeOne(s: string): ContextKeyExpression {
		s = s.trim();

		if (s === 'true') {
			return ContextKeyTrueExpr.INSTANCE;
		}
		if (s === 'false') {
			return ContextKeyFalseExpr.INSTANCE;
		}

		// key =~ /regex/flags
		let m = /^([^=!<>~]+)=~(.*)$/.exec(s);
		if (m) {
			const key = m[1].trim();
			return ContextKeyRegexExpr.create(key, ContextKeyExpr._parseRegex(m[2].trim()));
		}

		// key != value
		m = /^([^=!<>]+)!=(.*)$/.exec(s);
		if (m) {
			return ContextKeyNotEqualsExpr.create(m[1].trim(), deserializeValue(m[2]));
		}

		// key == value
		m = /^([^=!<>]+)==(.*)$/.exec(s);
		if (m) {
			return ContextKeyEqualsExpr.create(m[1].trim(), deserializeValue(m[2]));
		}

		// key >= n  /  key <= n
		m = /^([^=!<>]+)>=(.*)$/.exec(s);
		if (m) {
			return ContextKeyGreaterEqualsExpr.create(m[1].trim(), parseFloat(m[2].trim()));
		}
		m = /^([^=!<>]+)<=(.*)$/.exec(s);
		if (m) {
			return ContextKeySmallerEqualsExpr.create(m[1].trim(), parseFloat(m[2].trim()));
		}

		// key > n  /  key < n
		m = /^([^=!<>]+)>(.*)$/.exec(s);
		if (m) {
			return ContextKeyGreaterExpr.create(m[1].trim(), parseFloat(m[2].trim()));
		}
		m = /^([^=!<>]+)<(.*)$/.exec(s);
		if (m) {
			return ContextKeySmallerExpr.create(m[1].trim(), parseFloat(m[2].trim()));
		}

		// !key
		if (s.startsWith('!')) {
			const key = s.slice(1).trim();
			return ContextKeyNotExpr.create(key);
		}

		// bare key (definido / truthy)
		if (KEY_RE.test(s)) {
			return ContextKeyDefinedExpr.create(s);
		}

		// no parseable → false (no rompe la UI)
		console.warn(`[contextkey] No se pudo parsear la expresión when: "${s}"`);
		return ContextKeyFalseExpr.INSTANCE;
	}

	private static _parseRegex(pieces: string): RegExp | null {
		const m = /^\/(.*)\/([gimsuy]*)$/.exec(pieces);
		if (!m) {
			return null;
		}
		try {
			return new RegExp(m[1], m[2]);
		} catch {
			return null;
		}
	}
}

/** Valida una lista de clausulas `when`. Devuelve los errores encontrados (vacío = todo ok). */
export function validateWhenClauses(whenClauses: string[]): string[] {
	const errors: string[] = [];
	for (const when of whenClauses) {
		try {
			ContextKeyExpr.deserialize(when);
		} catch (e) {
			errors.push(`"${when}": ${(e as Error).message}`);
		}
	}
	return errors;
}

// #endregion

// #region servicio reactivo liviano -----------------------------------------------------------

export interface IContextKey<T extends ContextKeyValue = ContextKeyValue> {
	set(value: T): void;
	reset(): void;
	get(): T | undefined;
}

export type ContextChangeListener = (changedKeys: ReadonlySet<string>) => void;

/**
 * Servicio de context keys reactivo y liviano. Mantiene un Map de claves→valores y notifica
 * cambios. Las superficies (menús, keybindings) llaman a `contextMatchesRules(expr)` para
 * decidir visibilidad/habilitación.
 */
export class ContextKeyService implements IContext {
	private readonly _values = new Map<string, ContextKeyValue>();
	private readonly _listeners = new Set<ContextChangeListener>();

	getValue<T = ContextKeyValue>(key: string): T | undefined {
		return this._values.get(key) as T | undefined;
	}

	/** Setea (o cambia) el valor de una clave. Notifica si cambió. */
	setContext(key: string, value: ContextKeyValue): void {
		const prev = this._values.get(key);
		if (prev === value && this._values.has(key)) {
			return;
		}
		this._values.set(key, value);
		this._fire(new Set([key]));
	}

	/** Elimina una clave del contexto. */
	removeContext(key: string): void {
		if (this._values.delete(key)) {
			this._fire(new Set([key]));
		}
	}

	/** Crea un handle tipado a una clave (patrón RawContextKey simplificado). */
	createKey<T extends ContextKeyValue>(key: string, defaultValue: T | undefined): IContextKey<T> {
		if (defaultValue !== undefined) {
			this.setContext(key, defaultValue);
		}
		return {
			set: (value: T) => this.setContext(key, value),
			reset: () => {
				if (defaultValue === undefined) {
					this.removeContext(key);
				} else {
					this.setContext(key, defaultValue);
				}
			},
			get: () => this.getValue<T>(key),
		};
	}

	/** Evalúa una expresión `when` contra el contexto actual. `undefined` = siempre true. */
	contextMatchesRules(rules: ContextKeyExpression | undefined): boolean {
		if (!rules) {
			return true;
		}
		return rules.evaluate(this);
	}

	/** Suscribe a cambios de contexto. Retorna un IDisposable para desuscribir. */
	onDidChangeContext(listener: ContextChangeListener): IDisposable {
		this._listeners.add(listener);
		return toDisposable(() => {
			this._listeners.delete(listener);
		});
	}

	/** Aplica varios cambios y emite un solo evento. */
	bulkUpdate(updates: Record<string, ContextKeyValue>): void {
		const changed = new Set<string>();
		for (const [key, value] of Object.entries(updates)) {
			const prev = this._values.get(key);
			if (prev !== value || !this._values.has(key)) {
				this._values.set(key, value);
				changed.add(key);
			}
		}
		if (changed.size > 0) {
			this._fire(changed);
		}
	}

	private _fire(changedKeys: Set<string>): void {
		for (const listener of this._listeners) {
			try {
				listener(changedKeys);
			} catch (e) {
				console.error('[contextkey] Error en listener de cambio de contexto', e);
			}
		}
	}
}

// #endregion
