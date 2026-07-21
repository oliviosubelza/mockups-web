/*---------------------------------------------------------------------------------------------
 *  @keel/plugin-sdk/capabilities — composición SOFT entre plugins (degrada si falta).
 *
 *  Dos mecanismos, ambos resueltos por PRESENCIA en runtime (un plugin dormido/ausente
 *  simplemente no aporta nada; el consumidor degrada sin romperse):
 *
 *   1. Contribution points (`api.contributions`): un plugin dueño define un punto (slot) y
 *      otros le aportan items SOLO si están activos. Ej.: el plugin de productos define
 *      `product.form.fields`; el de categorías le aporta un selector. Sin categorías → sin
 *      selector, el form sigue funcionando. Para UI declarativa (campos, columnas, secciones).
 *
 *   2. Capability services (`api.capabilities`): un plugin PROVEE una implementación con un id
 *      y otros la consumen si está presente. Ej.: `pricing.resolve`, `stock.adjust`. Para lógica.
 *
 *  Diferencia con DEPENDENCIA (hard, `manifest.dependencies`): la dependencia es obligatoria
 *  (sin ella el plugin no activa); la capacidad es opcional (sin ella, se degrada).
 *--------------------------------------------------------------------------------------------*/

import { useSyncExternalStore } from 'react';
import type { IDisposable } from '@keel/platform';

/** Punto de contribución runtime: items que un plugin aporta y otro consume. */
export interface ContributionsApi {
	/** Aporta un item a un punto. Se limpia solo al desactivarse el plugin (DisposableStore). */
	register(pointId: string, item: unknown): IDisposable;
	/** Snapshot de los items de un punto (ref ESTABLE mientras no cambie — apto useSyncExternalStore). */
	get(pointId: string): readonly unknown[];
	/** Notifica cuando cambian los items de un punto. */
	onDidChange(pointId: string, listener: () => void): IDisposable;
}

/** Servicios de capacidad: una implementación por id, presente solo mientras su proveedor vive. */
export interface CapabilitiesApi {
	/** Provee la implementación de una capacidad. Se limpia sola al desactivarse el plugin. */
	provide(id: string, impl: unknown): IDisposable;
	/** La implementación actual, o `undefined` si ningún plugin activo la provee. */
	get(id: string): unknown;
	/** Notifica cuando aparece/desaparece el proveedor de una capacidad. */
	onDidChange(id: string, listener: () => void): IDisposable;
}

/** API de settings del plugin (valores declarados en `contributes.configuration`). */
export interface ConfigApi {
	/** Valor actual de la clave, o el `default` declarado si el usuario no lo cambió. */
	get<T = unknown>(key: string): T;
	/** Fija el valor (lo persiste el workbench). Normalmente lo hace el form de Settings, no el plugin. */
	set(key: string, value: unknown): void;
	/** Notifica cuando cambia el valor de CUALQUIER clave (pasa la clave cambiada). */
	onDidChange(handler: (key: string) => void): IDisposable;
}

/**
 * Hook reactivo: el valor de una clave de configuración. Re-renderiza cuando esa clave cambia
 * (ej. el usuario la editó en Settings). Devuelve el valor actual o el default declarado.
 */
export function useConfig<T = unknown>(config: ConfigApi, key: string): T {
	return useSyncExternalStore(
		(onChange) => {
			const sub = config.onDidChange((changed) => {
				if (changed === key) onChange();
			});
			return () => sub.dispose();
		},
		() => config.get<T>(key),
	);
}

/**
 * Hook reactivo: items aportados a un punto de contribución. Re-renderiza cuando un plugin
 * aporta/retira (incluido al activarse/desactivarse). Vacío si nadie aporta → el consumidor degrada.
 */
export function useContributions<T = unknown>(
	contributions: ContributionsApi,
	pointId: string,
): readonly T[] {
	return useSyncExternalStore(
		(onChange) => {
			const sub = contributions.onDidChange(pointId, onChange);
			return () => sub.dispose();
		},
		() => contributions.get(pointId) as readonly T[],
	);
}

/**
 * Hook reactivo: la implementación de una capacidad, o `undefined` si no hay proveedor activo.
 * Re-renderiza cuando aparece/desaparece (p.ej. al activar el plugin o revocarse su entitlement).
 */
export function useCapability<T = unknown>(
	capabilities: CapabilitiesApi,
	id: string,
): T | undefined {
	return useSyncExternalStore(
		(onChange) => {
			const sub = capabilities.onDidChange(id, onChange);
			return () => sub.dispose();
		},
		() => capabilities.get(id) as T | undefined,
	);
}
