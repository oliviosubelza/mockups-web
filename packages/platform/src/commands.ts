/*---------------------------------------------------------------------------------------------
 *  Keel — CommandsRegistry (B1, ver .claude/ARCHITECTURE.md §14).
 *  Adaptado de VSCode `platform/commands/common/commands.ts` (MIT — ver NOTICE.md).
 *
 *  Comandos = funciones con id, desacopladas de UI. Menús, keybindings y la paleta solo
 *  referencian ids; cualquier superficie los invoca sin acoplarse al que los implementa.
 *
 *  Diferencias con el original:
 *   - Sin DI (`ServicesAccessor`): los handlers cierran sobre sus servicios (decisión abierta A3).
 *   - Registry y service unificados: `executeCommand` vive en el registry (no hay ICommandService
 *     aparte hasta que exista la capa de servicios).
 *   - Sin singleton exportado: el shell instancia su registry (misma regla que el EventBus).
 *
 *  Re-registrar un id apila: el último handler gana y su dispose() restaura el anterior.
 *  Esto reemplaza el `override()` mutante (que no podía deshacerse) y es lo que permite que un
 *  plugin sobreescriba un comando del core mientras está activo, sin fugas al desactivarse.
 *--------------------------------------------------------------------------------------------*/

import { toDisposable, type IDisposable } from './lifecycle';
import { Emitter, type Event } from './event';

export type ICommandHandler<Args extends unknown[] = unknown[], R = unknown> = (
	...args: Args
) => R | Promise<R>;

export interface ICommand<Args extends unknown[] = unknown[], R = unknown> {
	readonly id: string;
	readonly handler: ICommandHandler<Args, R>;
}

export interface ICommandEvent {
	readonly commandId: string;
	readonly args: readonly unknown[];
}

export interface ICommandsRegistry {
	readonly onDidRegisterCommand: Event<string>;
	readonly onDidUnregisterCommand: Event<string>;
	readonly onWillExecuteCommand: Event<ICommandEvent>;
	readonly onDidExecuteCommand: Event<ICommandEvent>;

	registerCommand<Args extends unknown[]>(id: string, handler: ICommandHandler<Args>): IDisposable;
	registerCommandAlias(oldId: string, newId: string): IDisposable;
	executeCommand<R = unknown>(id: string, ...args: unknown[]): Promise<R | undefined>;
	getCommand(id: string): ICommand | undefined;
	getCommands(): ReadonlyMap<string, ICommand>;
	has(id: string): boolean;
}

export class CommandsRegistry implements ICommandsRegistry, IDisposable {
	/** Stack por id: índice 0 = handler vigente; dispose() de uno intermedio lo saca del stack. */
	private readonly _commands = new Map<string, ICommand[]>();

	private readonly _onDidRegisterCommand = new Emitter<string>();
	readonly onDidRegisterCommand: Event<string> = this._onDidRegisterCommand.event;

	private readonly _onDidUnregisterCommand = new Emitter<string>();
	readonly onDidUnregisterCommand: Event<string> = this._onDidUnregisterCommand.event;

	private readonly _onWillExecuteCommand = new Emitter<ICommandEvent>();
	readonly onWillExecuteCommand: Event<ICommandEvent> = this._onWillExecuteCommand.event;

	private readonly _onDidExecuteCommand = new Emitter<ICommandEvent>();
	readonly onDidExecuteCommand: Event<ICommandEvent> = this._onDidExecuteCommand.event;

	registerCommand<Args extends unknown[]>(id: string, handler: ICommandHandler<Args>): IDisposable {
		if (!id) {
			throw new Error('[CommandsRegistry] invalid command id');
		}

		const command: ICommand = { id, handler: handler as ICommandHandler };
		let stack = this._commands.get(id);
		if (!stack) {
			stack = [];
			this._commands.set(id, stack);
		}
		stack.unshift(command);
		this._onDidRegisterCommand.fire(id);

		return toDisposable(() => {
			const current = this._commands.get(id);
			if (!current) {
				return;
			}
			const idx = current.indexOf(command);
			if (idx >= 0) {
				current.splice(idx, 1);
			}
			if (current.length === 0) {
				this._commands.delete(id);
				this._onDidUnregisterCommand.fire(id);
			}
		});
	}

	registerCommandAlias(oldId: string, newId: string): IDisposable {
		return this.registerCommand(oldId, (...args) => this.executeCommand(newId, ...args));
	}

	async executeCommand<R = unknown>(id: string, ...args: unknown[]): Promise<R | undefined> {
		const command = this.getCommand(id);
		if (!command) {
			console.warn(`[CommandsRegistry] command "${id}" not found`);
			return undefined;
		}
		this._onWillExecuteCommand.fire({ commandId: id, args });
		try {
			return (await command.handler(...args)) as R;
		} finally {
			this._onDidExecuteCommand.fire({ commandId: id, args });
		}
	}

	getCommand(id: string): ICommand | undefined {
		return this._commands.get(id)?.[0];
	}

	getCommands(): ReadonlyMap<string, ICommand> {
		const result = new Map<string, ICommand>();
		for (const id of this._commands.keys()) {
			const command = this.getCommand(id);
			if (command) {
				result.set(id, command);
			}
		}
		return result;
	}

	has(id: string): boolean {
		return this._commands.has(id);
	}

	dispose(): void {
		this._commands.clear();
		this._onDidRegisterCommand.dispose();
		this._onDidUnregisterCommand.dispose();
		this._onWillExecuteCommand.dispose();
		this._onDidExecuteCommand.dispose();
	}
}
