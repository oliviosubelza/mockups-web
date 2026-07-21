/*---------------------------------------------------------------------------------------------
 *  Keel — ToolsRegistry (§6 de ARCHITECTURE.md).
 *
 *  Tools = capacidades invocables por AGENTES (el AI chat interno y el bridge MCP externo
 *  comparten esta misma capa — "tool-executor unificado"). Igual que los comandos: ids
 *  desacoplados de quien los implementa; el dispatcher MCP resuelve contra este registry,
 *  así instalar un plugin agrega sus tools al agente sin tocar el core.
 *
 *  Dos planos, como el resto del sistema declarativo:
 *   - Definición (id + description + JSON Schema del input): viene del manifest
 *     (`contributes.tools`) y existe con el plugin DORMIDO — MCP la lista sin activarlo.
 *   - Handler: lo registra el plugin al activarse (o un proxy lazy del shell que lo activa).
 *     Stack por id, igual que CommandsRegistry: el último gana, dispose() restaura.
 *
 *  Sin singleton — el shell instancia el suyo (misma regla que EventBus/registries).
 *--------------------------------------------------------------------------------------------*/

import { toDisposable, type IDisposable } from './lifecycle';
import { Emitter, type Event } from './event';

export interface ToolDefinition {
	/** Id namespaced por plugin ('billing.createInvoice'). */
	readonly id: string;
	/** Descripción para el agente (qué hace, cuándo usarla). */
	readonly description: string;
	/** JSON Schema del input — MCP lo publica en tools/list. */
	readonly inputSchema?: Readonly<Record<string, unknown>>;
	/** Plugin dueño — lo usan el permission gate y el gating por entitlement. */
	readonly pluginId?: string;
	/**
	 * Permiso de usuario requerido (ej. "inventario:ajustar"). Si el usuario activo
	 * no tiene el permiso, el executor rechaza SIN pasar por el approval gate.
	 * Omitir = sin restricción de permiso de usuario.
	 */
	readonly requiredPermission?: string;
}

export type ToolHandler<TInput = unknown, TResult = unknown> = (
	input: TInput
) => TResult | Promise<TResult>;

export interface IToolEvent {
	readonly toolId: string;
	readonly input: unknown;
}

export interface IToolsRegistry {
	/** Cambió el set de definiciones (MCP re-anuncia tools/list_changed con esto). */
	readonly onDidChangeTools: Event<void>;
	readonly onWillExecuteTool: Event<IToolEvent>;
	readonly onDidExecuteTool: Event<IToolEvent>;

	registerTool(definition: ToolDefinition): IDisposable;
	registerToolHandler<TInput>(id: string, handler: ToolHandler<TInput>): IDisposable;
	executeTool<TResult = unknown>(id: string, input: unknown): Promise<TResult>;
	getTool(id: string): ToolDefinition | undefined;
	getTools(): readonly ToolDefinition[];
	hasHandler(id: string): boolean;
}

export class ToolsRegistry implements IToolsRegistry, IDisposable {
	private readonly _definitions = new Map<string, ToolDefinition>();
	/** Stack por id: índice 0 = handler vigente (mismo modelo que CommandsRegistry). */
	private readonly _handlers = new Map<string, Array<{ handler: ToolHandler }>>();

	private readonly _onDidChangeTools = new Emitter<void>();
	readonly onDidChangeTools: Event<void> = this._onDidChangeTools.event;

	private readonly _onWillExecuteTool = new Emitter<IToolEvent>();
	readonly onWillExecuteTool: Event<IToolEvent> = this._onWillExecuteTool.event;

	private readonly _onDidExecuteTool = new Emitter<IToolEvent>();
	readonly onDidExecuteTool: Event<IToolEvent> = this._onDidExecuteTool.event;

	/** Publica la definición (visible para agentes aunque no haya handler aún). */
	registerTool(definition: ToolDefinition): IDisposable {
		if (!definition.id) {
			throw new Error('[ToolsRegistry] invalid tool id');
		}
		if (this._definitions.has(definition.id)) {
			throw new Error(`[ToolsRegistry] tool "${definition.id}" ya está registrada`);
		}
		this._definitions.set(definition.id, definition);
		this._onDidChangeTools.fire();

		return toDisposable(() => {
			if (this._definitions.delete(definition.id)) {
				this._onDidChangeTools.fire();
			}
		});
	}

	registerToolHandler<TInput>(id: string, handler: ToolHandler<TInput>): IDisposable {
		if (!id) {
			throw new Error('[ToolsRegistry] invalid tool id');
		}
		const entry = { handler: handler as ToolHandler };
		let stack = this._handlers.get(id);
		if (!stack) {
			stack = [];
			this._handlers.set(id, stack);
		}
		stack.unshift(entry);

		return toDisposable(() => {
			const current = this._handlers.get(id);
			if (!current) {
				return;
			}
			const idx = current.indexOf(entry);
			if (idx >= 0) {
				current.splice(idx, 1);
			}
			if (current.length === 0) {
				this._handlers.delete(id);
			}
		});
	}

	/**
	 * Ejecuta el handler vigente. A diferencia de los comandos, una tool sin handler es un
	 * ERROR (el agente espera un resultado) — el shell evita esto con el proxy lazy.
	 */
	async executeTool<TResult = unknown>(id: string, input: unknown): Promise<TResult> {
		const entry = this._handlers.get(id)?.[0];
		if (!entry) {
			throw new Error(`[ToolsRegistry] tool "${id}" no tiene handler registrado`);
		}
		this._onWillExecuteTool.fire({ toolId: id, input });
		try {
			return (await entry.handler(input)) as TResult;
		} finally {
			this._onDidExecuteTool.fire({ toolId: id, input });
		}
	}

	getTool(id: string): ToolDefinition | undefined {
		return this._definitions.get(id);
	}

	getTools(): readonly ToolDefinition[] {
		return [...this._definitions.values()];
	}

	/** El handler vigente para un id (para que el proxy lazy detecte si el plugin registró el real). */
	getToolHandler(id: string): ToolHandler | undefined {
		return this._handlers.get(id)?.[0]?.handler;
	}

	hasHandler(id: string): boolean {
		return this._handlers.has(id);
	}

	dispose(): void {
		this._definitions.clear();
		this._handlers.clear();
		this._onDidChangeTools.dispose();
		this._onWillExecuteTool.dispose();
		this._onDidExecuteTool.dispose();
	}
}
