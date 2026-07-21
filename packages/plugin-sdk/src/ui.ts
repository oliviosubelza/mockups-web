/*---------------------------------------------------------------------------------------------
 *  @keel/plugin-sdk/ui — superficie declarativa de UI para autores de plugins.
 *
 *  Las IMPLEMENTACIONES (DataTable, SchemaForm, FormDialog, FilterBar) viven en el workbench
 *  (apps/desktop) porque dependen del design system. El SDK declara solo los TIPOS + la
 *  interfaz `PluginUI`; el host inyecta los componentes reales en `api.ui`. Los helpers
 *  `define*` son funciones identidad (cero deps) que dan inferencia de tipos y por eso sí
 *  pueden vivir acá en runtime.
 *--------------------------------------------------------------------------------------------*/

import type { ComponentType, ReactElement, ReactNode } from 'react';
import type { FieldValues, Path, DefaultValues } from 'react-hook-form';
import type { ZodType } from 'zod';

// ── SchemaForm: definición declarativa de formularios ────────────────────────────────────────

/** Valor centinela para "sin selección" en campos select nullable. */
export const FORM_NONE = '__none__' as const;

export interface FieldOption {
	label: string;
	value: string;
}

interface BaseFieldDef<T extends FieldValues> {
	id: Path<T>;
	label: string;
	required?: boolean;
	placeholder?: string;
	autoFocus?: boolean;
	hidden?: boolean;
	/** Columnas que ocupa dentro del grid del form (default = cols, full width). */
	span?: number;
	/**
	 * Agrupa el campo bajo un encabezado de sección. Los campos con la misma `section` se
	 * renderizan juntos bajo un título. Si NINGÚN campo declara `section`, el form se ve plano
	 * (un solo grid, sin encabezados) — comportamiento idéntico al previo. El orden de las
	 * secciones es el de primera aparición; los campos sin `section` van en un grupo inicial sin título.
	 */
	section?: string;
	/**
	 * Saca el campo del grid principal de su sección y lo coloca en una COLUMNA LATERAL (~32%) a la
	 * izquierda o derecha; el resto de los campos de la sección ocupan el espacio restante (~68%) en
	 * su propio grid. Pensado para una foto/preview al costado de los datos. Si varios campos declaran
	 * `aside`, se apilan en esa columna. El lado del primer campo `aside` define el de toda la sección.
	 */
	aside?: 'left' | 'right';
}

export interface TextFieldDef<T extends FieldValues> extends BaseFieldDef<T> { type: 'text' }
export interface NumberFieldDef<T extends FieldValues> extends BaseFieldDef<T> {
	type: 'number';
	min?: number;
	step?: number;
}
export interface PasswordFieldDef<T extends FieldValues> extends BaseFieldDef<T> { type: 'password' }
export interface UrlFieldDef<T extends FieldValues> extends BaseFieldDef<T> { type: 'url' }
export interface TimeFieldDef<T extends FieldValues> extends BaseFieldDef<T> { type: 'time' }
export interface TextareaFieldDef<T extends FieldValues> extends BaseFieldDef<T> {
	type: 'textarea';
	rows?: number;
	maxLength?: number;
}
export interface SelectFieldDef<T extends FieldValues> extends BaseFieldDef<T> {
	type: 'select';
	options: FieldOption[];
	loading?: boolean;
	nullable?: boolean;
	nullLabel?: string;
	/**
	 * Hace el select "creatable": muestra una acción inline para crear un valor nuevo de solo-nombre
	 * sin salir del formulario. Recibe el texto tipeado, debe persistirlo (ej. POST) y devolver la
	 * opción creada; el SchemaForm la selecciona al instante. El plugin es responsable de refrescar
	 * su lista de `options` (típicamente agregando la nueva). Ideal para catálogos como categoría/unidad.
	 */
	onCreate?: (label: string) => Promise<FieldOption>;
	/** Texto del botón que abre el alta inline (default: "Crear nuevo"). */
	createLabel?: string;
	/** Placeholder del input de alta inline. */
	createPlaceholder?: string;
}
export interface SwitchFieldDef<T extends FieldValues> extends BaseFieldDef<T> {
	type: 'switch';
	description?: string;
}
/**
 * Campo de imagen. UI-only por ahora: guarda una URL/ruta como string (no sube archivos todavía
 * — la subida real a un storage se difiere). Muestra una previsualización si hay valor y un input
 * de URL debajo. `value` vacío = sin imagen.
 */
export interface ImageFieldDef<T extends FieldValues> extends BaseFieldDef<T> {
	type: 'image';
}
/**
 * Campo derivado de SOLO LECTURA: muestra un valor calculado a partir de los valores actuales del
 * form (ej. margen = (precio - costo) / costo). No se registra ni se envía en el submit; el `id`
 * solo identifica el campo en el layout. Se recalcula en vivo a medida que el usuario tipea.
 */
export interface ComputedFieldDef<T extends FieldValues> extends Omit<BaseFieldDef<T>, 'id'> {
	type: 'computed';
	id: string;
	compute: (values: T) => string;
}

export type FieldDef<T extends FieldValues> =
	| TextFieldDef<T>
	| NumberFieldDef<T>
	| PasswordFieldDef<T>
	| UrlFieldDef<T>
	| TimeFieldDef<T>
	| TextareaFieldDef<T>
	| SelectFieldDef<T>
	| SwitchFieldDef<T>
	| ImageFieldDef<T>
	| ComputedFieldDef<T>;

export interface SchemaFormProps<T extends FieldValues> {
	fields: FieldDef<T>[];
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	schema: ZodType<T, any>;
	values?: T;
	defaultValues?: DefaultValues<T>;
	onSubmit: (data: T) => Promise<void>;
	isPending?: boolean;
	submitLabel?: string;
	cancelLabel?: string;
	onCancel?: () => void;
	/**
	 * Reacciona a cambios de un campo para DERIVAR otros (ej. costo+margen→precio, precio→margen).
	 * Se llama tras cada edición con el nombre del campo que cambió, los valores actuales y un `set`
	 * para actualizar otros campos. El SchemaForm evita bucles: las escrituras hechas desde acá no
	 * vuelven a disparar `onFieldChange`. Útil para relaciones de dos vías que un campo `computed`
	 * (solo lectura) no cubre.
	 */
	onFieldChange?: (
		name: Path<T>,
		values: T,
		set: (field: Path<T>, value: number | string | boolean) => void,
	) => void;
	/** Número de columnas del grid (default: 2). */
	cols?: number;
	/**
	 * Cuántas SECCIONES poner por fila (default: 1 = apiladas una sobre otra). Con `2`, dos
	 * secciones se renderizan lado a lado (y envuelven si hay más). Solo aplica cuando hay campos
	 * con `section`; los campos sin sección siempre van full-width arriba.
	 */
	sectionCols?: number;
}

export interface FormDialogProps<T extends FieldValues> extends SchemaFormProps<T> {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

/** Helper identidad: declara campos con inferencia de tipos sobre el modelo del form. */
export function defineFields<T extends FieldValues>(fields: FieldDef<T>[]): FieldDef<T>[] {
	return fields;
}

// ── DataTable: definición declarativa de tablas ──────────────────────────────────────────────

export const DENSITY = { compact: 'compact', normal: 'normal', comfortable: 'comfortable' } as const;
export type DensityMode = (typeof DENSITY)[keyof typeof DENSITY];

export interface ColumnMeta {
	align?: 'left' | 'center' | 'right';
	className?: string;
}

export interface ColumnDefConfig<T> {
	id: string;
	header: string;
	accessorKey?: keyof T & string;
	cell?: (row: T, index: number) => ReactNode;
	enableSorting?: boolean;
	enableResizing?: boolean;
	enableHiding?: boolean;
	size?: number;
	minSize?: number;
	maxSize?: number;
	pin?: 'left' | 'right';
	meta?: ColumnMeta;
}

export interface RowAction<T> {
	label: string;
	icon?: ComponentType<{ size?: number; className?: string }>;
	onClick: (row: T) => void;
	variant?: 'default' | 'destructive';
	disabled?: (row: T) => boolean;
	separator?: boolean;
}

export interface BulkAction<T> {
	label: string;
	icon?: ComponentType<{ size?: number; className?: string }>;
	onClick: (rows: T[]) => void;
	variant?: 'default' | 'destructive';
}

export interface ServerPagination {
	page: number;
	limit: number;
	total: number;
	onPageChange: (page: number) => void;
	onLimitChange?: (limit: number) => void;
	pageSizeOptions?: number[];
}

export interface DataTableProps<T extends object> {
	tableId: string;
	columns: ColumnDefConfig<T>[];
	data: T[];
	getRowId?: (row: T) => string;

	// Estado
	isLoading?: boolean;
	isError?: boolean;
	/** Título del estado de error (el `errorMessage` va debajo, como detalle). */
	errorTitle?: string;
	errorMessage?: string;
	/** Con esto el estado de error ofrece un botón de reintento en vez de ser un cartel muerto. */
	onRetry?: () => void;
	/** Título del estado vacío (el `emptyMessage` va debajo, como detalle). */
	emptyTitle?: string;
	emptyMessage?: string;
	/** Acción principal del estado vacío (ej. "Nuevo camión") — el vacío deja de ser un callejón. */
	emptyAction?: { label: string; onClick: () => void };
	emptySlot?: ReactNode;
	/**
	 * Alto mínimo del cuerpo de la tabla, en px (default 320). Sin datos, cargando o en error la
	 * tabla conserva el mismo alto que con filas: el layout no salta ni encoge al vaciarse.
	 */
	bodyMinHeight?: number;
	/**
	 * Modo "fill": en vez de crecer con el contenido (bodyMinHeight en px), la tabla ocupa el alto
	 * disponible de su contenedor flex (flex-1 + min-h-0) y SOLO el cuerpo scrollea — el header
	 * queda sticky y la paginación siempre visible abajo, sin valores estáticos en px. El padre
	 * debe ser un flex-col con alto acotado. Por defecto false (comportamiento clásico con bodyMinHeight).
	 */
	fillHeight?: boolean;

	// Orden inicial (por defecto, hasta que el usuario ordene otra columna — se persiste por tableId).
	// Ej. listados por fecha descendente: `{ id: 'createdAt', desc: true }`; kardex ascendente: `{ id: 'createdAt' }`.
	initialSort?: { id: string; desc?: boolean };

	// Paginación
	pagination?: ServerPagination;
	clientPagination?: boolean;
	defaultPageSize?: number;

	// Selección
	selectable?: boolean;
	onSelectionChange?: (rows: T[]) => void;
	/**
	 * Restringe qué filas se pueden seleccionar (las demás quedan visibles pero con el checkbox
	 * inerte — no se ocultan). Sin definir, el comportamiento es el de siempre: todas las filas
	 * seleccionables cuando `selectable` está activo.
	 */
	isRowSelectable?: (row: T) => boolean;

	// Reordenamiento de FILAS por drag-and-drop (opt-in). El DataTable no reordena los datos por sí
	// mismo: al soltar avisa qué fila se movió sobre cuál y el consumidor actualiza su propio orden.
	enableRowReorder?: boolean;
	onRowReorder?: (activeId: string, overId: string) => void;

	// Acciones por fila
	rowActions?: (row: T) => RowAction<T>[];

	// Acciones masivas
	bulkActions?: BulkAction<T>[];

	// Interacción de fila
	onRowClick?: (row: T) => void;
	/** Doble-click en una fila → típicamente "ver detalle" (ej. inventario: abrir kardex). */
	onRowDoubleClick?: (row: T) => void;
	rowClassName?: (row: T) => string;

	// Expandible
	expandable?: boolean;
	renderExpanded?: (row: T) => ReactNode;

	// Búsqueda
	searchable?: boolean;
	searchPlaceholder?: string;
	defaultSearch?: string;
	onSearchChange?: (value: string) => void;

	// Exportar
	exportable?: boolean;
	exportFilename?: string;

	// Barra de filtros (encima del toolbar)
	filterBar?: ReactNode;

	// Toolbar extra
	toolbar?: ReactNode;

	// Apariencia
	defaultDensity?: DensityMode;
	stickyHeader?: boolean;
	striped?: boolean;
}

/** Helper identidad: declara columnas con inferencia de tipos sobre la fila. */
export function defineColumns<T extends object>(columns: ColumnDefConfig<T>[]): ColumnDefConfig<T>[] {
	return columns;
}

// ── FilterBar: filtros declarativos por encima de la tabla ───────────────────────────────────

export type FilterTarget = 'params' | 'body';

export interface FilterOption {
	label: string;
	value: string;
}

interface FilterBase {
	label: string;
	target?: FilterTarget;
	placeholder?: string;
}

export type TextFilterDef<TFilters extends Record<string, unknown>> = FilterBase & {
	type: 'text';
	id: keyof TFilters & string;
	/** Clase de ancho Tailwind para el input (default `w-36`). Ej: `'w-64'`, `'w-80'`. */
	width?: string;
};

export type SelectFilterDef<TFilters extends Record<string, unknown>> = FilterBase & {
	type: 'select';
	id: keyof TFilters & string;
	options: FilterOption[];
};

export type AsyncSelectFilterDef<TFilters extends Record<string, unknown>> = FilterBase & {
	type: 'asyncselect';
	id: keyof TFilters & string;
	useOptions: () => { data?: FilterOption[]; isLoading?: boolean };
};

export type BooleanFilterDef<TFilters extends Record<string, unknown>> = FilterBase & {
	type: 'boolean';
	id: keyof TFilters & string;
};

/** Date range controla dos keys de filtro, por eso `id` es un nombre lógico. */
export type DateRangeFilterDef<TFilters extends Record<string, unknown>> = FilterBase & {
	type: 'daterange';
	id: string;
	fromKey: keyof TFilters & string;
	toKey: keyof TFilters & string;
};

export type FilterDef<TFilters extends Record<string, unknown>> =
	| TextFilterDef<TFilters>
	| SelectFilterDef<TFilters>
	| AsyncSelectFilterDef<TFilters>
	| BooleanFilterDef<TFilters>
	| DateRangeFilterDef<TFilters>;

export interface FilterBarProps<TFilters extends Record<string, unknown>> {
	defs: FilterDef<TFilters>[];
	values: Partial<TFilters>;
	onChange: (update: Partial<TFilters>) => void;
}

/** Helper identidad: declara filtros con inferencia sobre el modelo de filtros. */
export function defineFilters<TFilters extends Record<string, unknown>>(
	defs: FilterDef<TFilters>[],
): FilterDef<TFilters>[] {
	return defs;
}

// ── WindowPortal: abrir contenido en una VENTANA nueva (patrón aux-window de VSCode) ──────────

export interface WindowPortalProps {
	/** Título de la ventana del SO. */
	title: string;
	width?: number;
	height?: number;
	/** Se invoca cuando la ventana se cierra (por el usuario o al desmontar). */
	onClose: () => void;
	children: ReactNode;
}

// ── ProductPicker: selector de productos en VENTANA secundaria (patrón kardex) ────────────────

/** Forma mínima de un item que el picker puede listar y agregar. */
export interface ProductPickerItem {
	id: string;
	code: string;
	name: string;
}

export interface ProductPickerProps<T extends ProductPickerItem = ProductPickerItem> {
	/** Controla la apertura de la ventana secundaria. */
	open: boolean;
	/** Se invoca al cerrar la ventana (botón cerrar o desmontaje). */
	onClose: () => void;
	/** Título de la ventana del SO. */
	title?: string;
	/** Productos disponibles para elegir. */
	items: T[];
	/**
	 * Columnas extra a mostrar además de Código y Producto (ej: precio o stock).
	 * Se concatenan después de las dos columnas base.
	 */
	extraColumns?: ColumnDefConfig<T>[];
	/**
	 * Si se define, cada agregado pide un monto editable (precio de venta o costo de compra),
	 * con un valor por defecto derivado del item.
	 */
	amount?: {
		label: string;
		defaultFor?: (item: T) => number;
	};
	/** Etiqueta del botón de agregar de cada fila (default: "Agregar"). */
	addLabel?: string;
	/**
	 * Ids que YA están en el detalle (carrito) del padre — controla el estado seleccionado de cada
	 * fila. El picker no acumula selección propia: refleja el carrito en vivo.
	 */
	selectedIds: string[];
	/**
	 * Alterna ON una fila: agrega el item al detalle EN EL ACTO (cantidad 1 + `amount` por defecto).
	 * La cantidad/precio se editan después en la tabla de detalle de la vista. `amount` es undefined
	 * si no se configuró `amount`. La ventana queda abierta para seguir agregando/quitando.
	 */
	onAdd: (item: T, qty: number, amount: number | undefined) => void;
	/** Alterna OFF una fila: quita el item del detalle EN EL ACTO (sincroniza con la vista principal). */
	onRemove: (itemId: string) => void;
}

// ── LineItemsTable: tabla de DETALLE editable para forms (compra/venta) ───────────────────────

/**
 * Columna de una tabla de líneas de detalle. Puede ser de SOLO LECTURA (`cell`) o EDITABLE
 * (`editable`, una celda numérica enlazada a un campo de la línea). `footer` aporta la fila de
 * totales del pie.
 */
export interface LineItemColumn<T> {
	id: string;
	header: string;
	align?: 'left' | 'center' | 'right';
	/** Ancho sugerido en px. */
	width?: number;
	/**
	 * Celda EDITABLE numérica enlazada a un campo de la línea. Al confirmar (blur/Enter) llama a
	 * `onEditField`. Si `max` devuelve un número, el valor se CLAMPA a ese máximo (validación de
	 * stock en egresos: no se puede cargar por encima del disponible) y la celda avisa en rojo al
	 * intentar excederlo. Para forms que SUMAN stock (compras) no definas `max`: la cantidad es libre.
	 */
	editable?: {
		field: keyof T & string;
		min?: number;
		step?: number;
		max?: (row: T) => number | undefined;
	};
	/** Celda de solo lectura. Ignorada si `editable` está presente. Default: el valor crudo del id. */
	cell?: (row: T, index: number) => ReactNode;
	/** Contenido del pie de la columna (fila de totales). */
	footer?: (rows: T[]) => ReactNode;
}

export interface LineItemsTableProps<T extends object> {
	items: T[];
	getRowId: (row: T) => string;
	columns: LineItemColumn<T>[];
	/**
	 * Edita un campo numérico de una línea. `value` ya viene CLAMPEADO al `max` de la columna si
	 * lo hubiera, así que el consumidor puede aplicarlo tal cual a su estado.
	 */
	onEditField: (rowId: string, field: string, value: number) => void;
	/** Quita la línea. Si se omite, no se muestra la columna de acción. */
	onRemove?: (rowId: string) => void;
	/** Etiqueta del botón quitar (default: "Quitar"). */
	removeLabel?: string;
	/** Contenido secundario debajo de la fila (ej. campos de lote en compras). */
	renderSubRow?: (row: T) => ReactNode;
	/** Antepone una columna "N°" con el número de fila. */
	showRowNumber?: boolean;
	/** Mensaje cuando no hay líneas (default: sin filas → no se renderiza la tabla). */
	emptyMessage?: string;
}

// ── RecordDetail: vista de DETALLE de un documento (venta/compra/…) ───────────────────────────

/** Campo de resumen (label → valor) del encabezado de un detalle. */
export interface RecordDetailField {
	label: string;
	value: ReactNode;
	/** Resalta el valor (ej. total). */
	emphasis?: boolean;
}

/** Acción del encabezado del detalle (ej. Anular, Imprimir). */
export interface RecordDetailAction {
	label: string;
	onClick: () => void;
	variant?: 'default' | 'destructive';
	icon?: ComponentType<{ size?: number; className?: string }>;
	disabled?: boolean;
}

/** Tono del badge de estado. */
export type RecordStatusTone = 'default' | 'success' | 'danger' | 'muted' | 'warning';

export interface RecordDetailProps {
	/** Nº correlativo prominente del documento (ej. 42 → "Nº 42"). */
	number?: string | number;
	/** Etiqueta del documento antes del Nº (ej. "Venta", "Compra"). */
	numberLabel?: string;
	/** Subtítulo bajo el Nº (ej. fecha y hora, cliente). */
	subtitle?: ReactNode;
	/** Badge de estado (ej. Confirmada / Anulada). */
	status?: { label: string; tone?: RecordStatusTone };
	/** Campos de resumen en grid (cliente, método de pago, totales…). */
	fields?: RecordDetailField[];
	/** Acciones del encabezado (arriba a la derecha). */
	actions?: RecordDetailAction[];
	/** Botón "volver" a la izquierda del Nº. */
	onBack?: () => void;
	backLabel?: string;
	/** Estado de carga (muestra un placeholder). */
	isLoading?: boolean;
	/** Mensaje cuando no hay documento seleccionado / no se encontró. */
	emptyMessage?: string;
	/** Contenido principal: típicamente la tabla declarativa de líneas (api.ui.DataTable). */
	children?: ReactNode;
}

// ── SegmentedControl: selector de pocas opciones mutuamente excluyentes ───────────────────────

export interface SegmentedOption<V extends string = string> {
	value: V;
	label: string;
	icon?: ComponentType<{ size?: number; className?: string }>;
}

/**
 * Control segmentado (botones contiguos, una sola opción activa) — alternativa estilizada al
 * `<select>`/checkbox para 2-4 opciones (ej. Contado | Crédito). Controlado por `value`/`onChange`.
 */
export interface SegmentedControlProps<V extends string = string> {
	value: V;
	onChange: (value: V) => void;
	options: SegmentedOption<V>[];
	/** Etiqueta accesible del grupo. */
	ariaLabel?: string;
	size?: 'sm' | 'default';
	disabled?: boolean;
	/** Ocupa todo el ancho disponible (segmentos de igual ancho). */
	fullWidth?: boolean;
}

// ── PluginUI: los componentes que el host inyecta en api.ui ───────────────────────────────────

/**
 * Componentes declarativos que el host expone a los plugins INTERNOS (bundled, comparten el
 * runtime de React del renderer). Los externos del ext-host son lógica-only (§11.7).
 */
/**
 * Diálogo (modal) genérico para contenido ARBITRARIO de solo lectura o paneles (no un form — para
 * eso está FormDialog). Útil para "ver detalles" de una fila: stock por sede, entradas, estadísticas.
 * `maxWidth: 'full'` ocupa ~92vw × 90vh (estilo dashboard de detalle). El contenido scrollea solo.
 */
export interface DialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title?: ReactNode;
	description?: ReactNode;
	maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | 'full';
	children?: ReactNode;
}

export interface PluginUI {
	DataTable: <T extends object>(props: DataTableProps<T>) => ReactElement | null;
	/** Diálogo modal para contenido arbitrario (detalle/paneles). Para formularios usá FormDialog. */
	Dialog: (props: DialogProps) => ReactElement | null;
	SchemaForm: <T extends FieldValues>(props: SchemaFormProps<T>) => ReactElement | null;
	FormDialog: <T extends FieldValues>(props: FormDialogProps<T>) => ReactElement | null;
	FilterBar: <TFilters extends Record<string, unknown>>(props: FilterBarProps<TFilters>) => ReactElement | null;
	/** Renderiza `children` en una VENTANA del SO nueva (estilos del workbench copiados). */
	WindowPortal: (props: WindowPortalProps) => ReactElement | null;
	/** Selector de productos en VENTANA secundaria (grilla buscable + agregar al carrito). */
	ProductPicker: <T extends ProductPickerItem>(props: ProductPickerProps<T>) => ReactElement | null;
	/**
	 * Tabla de DETALLE editable para forms de compra/venta: celdas numéricas editables
	 * (cantidad, costo/precio) + fila de totales. En egresos, una columna puede clampear al stock
	 * disponible (`editable.max`). Patrón "header inline + tabla de detalle" — ver CONVENTIONS.md.
	 */
	LineItemsTable: <T extends object>(props: LineItemsTableProps<T>) => ReactElement | null;
	/**
	 * Vista de DETALLE de un documento: Nº correlativo prominente arriba, badge de estado, resumen
	 * en grid, acciones (Anular/Imprimir) y `children` para la tabla declarativa de líneas. Patrón
	 * "detalle de documento" — ver CONVENTIONS.md.
	 */
	RecordDetail: (props: RecordDetailProps) => ReactElement | null;
	/**
	 * Control segmentado estilizado (Contado | Crédito, etc.) — alternativa al checkbox/`<select>`
	 * para 2-4 opciones excluyentes.
	 */
	SegmentedControl: <V extends string>(props: SegmentedControlProps<V>) => ReactElement | null;
	/**
	 * Hook: corre `effect` al montar y cada vez que el tab de la vista vuelve a ENFOCARSE
	 * (re-foco). Con keep-alive la vista no se re-monta, así que un `useEffect` normal no
	 * re-fetchea al volver — usá esto para refrescar datos. Equivale al onDidChangeVisibility
	 * de VSCode: opt-in, preserva el estado en memoria. Pasá solo las deps de datos (ej. branchId).
	 */
	useViewFocusEffect: (effect: () => void | (() => void), deps?: ReadonlyArray<unknown>) => void;
	/**
	 * Hook reactivo: ¿el usuario activo tiene el permiso granular `permission`? Se re-renderiza al
	 * cambiar los permisos (login/logout, revocación en caliente). Soporta wildcard '*' (ADMIN).
	 * Usalo para esconder/deshabilitar UI sensible (ej. costo/margen, descuento, acciones de egreso).
	 * El gating de UI es UX; la línea real de defensa es el guard del API (`requirePermission`).
	 */
	useHasPermission: (permission: string) => boolean;
}
