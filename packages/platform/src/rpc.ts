/*---------------------------------------------------------------------------------------------
 *  Keel — RPC tipado entre procesos (§5 de ARCHITECTURE.md).
 *  Adaptación compacta de VSCode `proxyIdentifier.ts` + `rpcProtocol.ts` (MIT — ver NOTICE.md):
 *  sin buffers binarios, sin cancellation, JSON plano sobre un canal de mensajes genérico.
 *
 *  Modelo:
 *   - Cada "objeto remoto" tiene un `ProxyIdentifier<T>` (sid estable, ej. 'MainThreadRegistry').
 *   - Un lado hace `set(id, impl)` con la implementación real; el otro `getProxy(id)` y recibe
 *     un Proxy donde CADA método devuelve Promise y los args viajan como JSON (Function → never).
 *   - Convención VSCode: `MainThread*` vive en el renderer, `ExtHost*` en el host aislado.
 *
 *  El transporte es un `IMessagePassingProtocol` mínimo (send/onMessage) — se implementa igual
 *  sobre MessagePort del DOM, MessagePortMain de Electron o un loopback de test.
 *--------------------------------------------------------------------------------------------*/

import { toDisposable, type IDisposable } from './lifecycle';

export interface IMessagePassingProtocol {
	send(message: unknown): void;
	onMessage(handler: (message: unknown) => void): IDisposable;
}

export class ProxyIdentifier<T> {
	declare readonly _proxyBrand: T;
	constructor(public readonly sid: string) {}
}

export function createProxyIdentifier<T>(sid: string): ProxyIdentifier<T> {
	return new ProxyIdentifier<T>(sid);
}

/** Solo lo serializable cruza: métodos → async, funciones en args → never. */
export type Proxied<T> = {
	[K in keyof T]: T[K] extends (...args: infer A) => infer R
		? (...args: { [P in keyof A]: A[P] extends Function ? never : A[P] }) => Promise<Awaited<R>>
		: never;
};

interface RequestMessage {
	type: 'request';
	id: number;
	proxy: string;
	method: string;
	args: readonly unknown[];
}

interface ReplyMessage {
	type: 'reply';
	id: number;
	ok: boolean;
	result?: unknown;
	error?: { message: string; stack?: string };
}

type RPCMessage = RequestMessage | ReplyMessage;

function isRPCMessage(value: unknown): value is RPCMessage {
	const m = value as RPCMessage | null;
	return !!m && typeof m === 'object' && (m.type === 'request' || m.type === 'reply');
}

export interface IRPCProtocol {
	getProxy<T>(identifier: ProxyIdentifier<T>): Proxied<T>;
	set<T, R extends T>(identifier: ProxyIdentifier<T>, instance: R): R;
}

export class RPCProtocol implements IRPCProtocol, IDisposable {
	private readonly _locals = new Map<string, Record<string, unknown>>();
	private readonly _proxies = new Map<string, unknown>();
	private readonly _pending = new Map<
		number,
		{ resolve: (value: unknown) => void; reject: (err: Error) => void }
	>();
	private readonly _listener: IDisposable;
	private _lastId = 0;
	private _disposed = false;

	constructor(private readonly _protocol: IMessagePassingProtocol) {
		this._listener = _protocol.onMessage((message) => {
			if (isRPCMessage(message)) {
				void this._handle(message);
			}
		});
	}

	set<T, R extends T>(identifier: ProxyIdentifier<T>, instance: R): R {
		this._locals.set(identifier.sid, instance as unknown as Record<string, unknown>);
		return instance;
	}

	getProxy<T>(identifier: ProxyIdentifier<T>): Proxied<T> {
		let proxy = this._proxies.get(identifier.sid);
		if (!proxy) {
			proxy = new Proxy(Object.create(null), {
				get: (target: Record<string, unknown>, name: PropertyKey) => {
					if (typeof name !== 'string' || name === 'then') {
						return undefined; // no es un thenable — evita que `await proxy` cuelgue
					}
					if (!target[name]) {
						target[name] = (...args: unknown[]) => this._invoke(identifier.sid, name, args);
					}
					return target[name];
				},
			});
			this._proxies.set(identifier.sid, proxy);
		}
		return proxy as Proxied<T>;
	}

	private _invoke(proxySid: string, method: string, args: unknown[]): Promise<unknown> {
		if (this._disposed) {
			return Promise.reject(new Error('[rpc] protocolo dispuesto'));
		}
		const id = ++this._lastId;
		return new Promise((resolve, reject) => {
			this._pending.set(id, { resolve, reject });
			this._protocol.send({
				type: 'request',
				id,
				proxy: proxySid,
				method,
				args,
			} satisfies RequestMessage);
		});
	}

	private async _handle(message: RPCMessage): Promise<void> {
		if (message.type === 'reply') {
			const pending = this._pending.get(message.id);
			if (!pending) {
				return;
			}
			this._pending.delete(message.id);
			if (message.ok) {
				pending.resolve(message.result);
			} else {
				const err = new Error(message.error?.message ?? '[rpc] error remoto');
				err.stack = message.error?.stack ?? err.stack;
				pending.reject(err);
			}
			return;
		}

		// request
		const reply = (ok: boolean, result?: unknown, error?: Error): void => {
			this._protocol.send({
				type: 'reply',
				id: message.id,
				ok,
				result,
				error: error ? { message: error.message, stack: error.stack } : undefined,
			} satisfies ReplyMessage);
		};

		const instance = this._locals.get(message.proxy);
		if (!instance) {
			reply(false, undefined, new Error(`[rpc] objeto desconocido: "${message.proxy}"`));
			return;
		}
		const fn = instance[message.method];
		if (typeof fn !== 'function') {
			reply(
				false,
				undefined,
				new Error(`[rpc] "${message.proxy}" no tiene el método "${message.method}"`)
			);
			return;
		}
		try {
			const result = await (fn as (...a: unknown[]) => unknown).apply(instance, [...message.args]);
			reply(true, result);
		} catch (err) {
			reply(false, undefined, err instanceof Error ? err : new Error(String(err)));
		}
	}

	dispose(): void {
		this._disposed = true;
		this._listener.dispose();
		for (const pending of this._pending.values()) {
			pending.reject(new Error('[rpc] protocolo dispuesto'));
		}
		this._pending.clear();
		this._locals.clear();
		this._proxies.clear();
	}
}

/** Par de protocolos conectados en memoria — para tests y para hosts in-process. */
export function createLoopbackProtocolPair(): [IMessagePassingProtocol, IMessagePassingProtocol] {
	const handlersA = new Set<(message: unknown) => void>();
	const handlersB = new Set<(message: unknown) => void>();
	const make = (
		mine: Set<(message: unknown) => void>,
		theirs: Set<(message: unknown) => void>
	): IMessagePassingProtocol => ({
		send: (message) => {
			// async como un MessagePort real — preserva el orden FIFO
			queueMicrotask(() => theirs.forEach((handler) => handler(message)));
		},
		onMessage: (handler) => {
			mine.add(handler);
			return toDisposable(() => mine.delete(handler));
		},
	});
	return [make(handlersA, handlersB), make(handlersB, handlersA)];
}
