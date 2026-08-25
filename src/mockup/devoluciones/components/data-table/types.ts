// Public DataTable types. Ported from mockups-web (@keel/plugin-sdk) — this project has no SDK
// package, so the contract lives here as the single source of truth.
import type { ComponentType, ReactNode } from "react";
import type {
  ColumnPinningState,
  ColumnSizingState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table";

export const DENSITY = {
  compact: "compact",
  normal: "normal",
  comfortable: "comfortable",
} as const;
export type DensityMode = (typeof DENSITY)[keyof typeof DENSITY];

export interface ColumnMeta {
  align?: "left" | "center" | "right";
  className?: string;
}

export interface ColumnDefConfig<T> {
  id: string;
  header: string;
  accessorKey?: keyof T & string;
  /**
   * The column's value when it does not live at a key of the row.
   *
   * For columns read out of a nested object or composed from several fields —
   * a sale's `billing.razonSocial`, a name assembled from two columns. What it
   * buys is what `accessorKey` buys: the column sorts, and it appears in the
   * CSV export. Without it a derived column is decoration — it renders, and
   * then silently drops out of the exported file.
   *
   * Ignored when `accessorKey` is set; a column has one value.
   */
  accessorFn?: (row: T) => string | number;
  cell?: (row: T, index: number) => ReactNode;
  enableSorting?: boolean;
  enableResizing?: boolean;
  enableHiding?: boolean;
  size?: number;
  minSize?: number;
  maxSize?: number;
  pin?: "left" | "right";
  meta?: ColumnMeta;
}

export interface RowAction<T> {
  label: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
  onClick: (row: T) => void;
  variant?: "default" | "destructive";
  disabled?: (row: T) => boolean;
  separator?: boolean;
}

export interface BulkAction<T> {
  label: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
  onClick: (rows: T[]) => void;
  variant?: "default" | "destructive";
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

  // State
  isLoading?: boolean;
  isError?: boolean;
  /**
   * ROW skeleton: when true, every cell of that row is painted as a skeleton (same style as the
   * global `isLoading` skeleton, scoped to the row). Marks a row as "saving/updating" without
   * blocking or reloading the rest of the table.
   */
  isRowLoading?: (row: T) => boolean;
  /**
   * CELL skeleton: when true, that single cell (row + column) is painted as a skeleton. Combines
   * with `isRowLoading` (either one being true is enough).
   */
  isCellLoading?: (row: T, columnId: string) => boolean;
  /** Error state title (`errorMessage` goes below, as detail). */
  errorTitle?: string;
  errorMessage?: string;
  /** Turns the error state into a retryable one instead of a dead notice. */
  onRetry?: () => void;
  /** Empty state title (`emptyMessage` goes below, as detail). */
  emptyTitle?: string;
  emptyMessage?: string;
  /** Primary action of the empty state — the empty stops being a dead end. */
  emptyAction?: { label: string; onClick: () => void };
  emptySlot?: ReactNode;
  /**
   * Minimum height of the table body, in px (default 320). Empty, loading or in error the table
   * keeps the same height as with rows: the layout does not jump when the data goes away.
   */
  bodyMinHeight?: number;
  /**
   * "Fill" mode: instead of growing with its content (bodyMinHeight in px), the table takes the
   * available height of its flex container (flex-1 + min-h-0) and ONLY the body scrolls — the
   * header stays sticky and pagination is always visible at the bottom. The parent must be a
   * flex-col with a bounded height.
   */
  fillHeight?: boolean;

  /** Default sort, until the user sorts another column (persisted per tableId). */
  initialSort?: { id: string; desc?: boolean };

  // Pagination
  pagination?: ServerPagination;
  clientPagination?: boolean;
  defaultPageSize?: number;

  // Selection
  selectable?: boolean;
  onSelectionChange?: (rows: T[]) => void;
  /** Restricts which rows can be selected (the rest stay visible with an inert checkbox). */
  isRowSelectable?: (row: T) => boolean;
  /**
   * Rows checked on MOUNT (ids per `getRowId`). It is an initial value, not controlled: changing
   * it later does not re-seed the selection — remount the table (e.g. a different `key`) for that.
   */
  defaultSelectedIds?: string[];

  // Row reordering by drag-and-drop (opt-in). The DataTable does not reorder the data itself: on
  // drop it reports which row moved over which, and the consumer updates its own order.
  enableRowReorder?: boolean;
  onRowReorder?: (activeId: string, overId: string) => void;

  // Row actions
  rowActions?: (row: T) => RowAction<T>[];

  // Bulk actions
  bulkActions?: BulkAction<T>[];

  // Row interaction
  onRowClick?: (row: T) => void;
  onRowDoubleClick?: (row: T) => void;
  rowClassName?: (row: T) => string;

  // Expandable — a chevron column the user opens and closes.
  expandable?: boolean;
  renderExpanded?: (row: T) => ReactNode;
  /**
   * Rows open on MOUNT (ids per `getRowId`). Like `defaultSelectedIds` it is an initial value, not
   * a controlled one: changing it later does not re-seed — remount the table (e.g. a different
   * `key`) for that. Only meaningful together with `expandable`.
   */
  defaultExpandedIds?: string[];

  /**
   * PERMANENT sub-row under a data row: a full-width cell rendered whenever this returns a node,
   * with no chevron column and no open/closed state.
   *
   * Different from `expandable`/`renderExpanded` on purpose. That pair is for detail a reader asks
   * for; this is for detail that belongs to the row and must never be a click away — a bonification
   * hanging off the line that earned it, the evidence an approver decides on. Hiding those behind a
   * toggle makes the cheapest information the hardest to reach.
   *
   * It reacts to the data (unlike `defaultExpandedIds`), so rows added later get their sub-row too.
   * The returned node owns its own styling; the wrapper cell adds no padding.
   */
  renderSubRow?: (row: T) => ReactNode;

  /**
   * Full-width row rendered after the last data row (inside `<tfoot>`): a totals line, or a control
   * that belongs at the end of the list — the order editor puts its "next product" searcher here.
   *
   * Only rendered when there are rows: with nothing loaded, loading or in error, the empty/error
   * notice is the whole story and a footer under it reads as a second table.
   */
  footer?: ReactNode;

  // Search
  searchable?: boolean;
  searchPlaceholder?: string;
  defaultSearch?: string;
  /**
   * CONTROLLED search: the value lives outside the table and every keystroke is reported through
   * `onSearchChange`. With it the table stops filtering rows itself — for a list whose filtering
   * happens server-side, the rows that arrived are already the answer, and filtering them again
   * locally would hide matches that live on another page.
   *
   * Leave it undefined for the local search (the table filters what it holds).
   */
  searchValue?: string;
  /**
   * Row fields the global search looks at. Without this, search only covers the declared COLUMNS
   * whose value is a string or a number (TanStack default), so a field that is not displayed
   * cannot be searched.
   */
  searchKeys?: (keyof T & string)[];
  onSearchChange?: (value: string) => void;

  // Export
  exportable?: boolean;
  exportFilename?: string;

  // Filter bar (above the toolbar)
  filterBar?: ReactNode;

  // Extra toolbar
  toolbar?: ReactNode;

  // Appearance
  defaultDensity?: DensityMode;
  stickyHeader?: boolean;
  striped?: boolean;
  /**
   * Drop the toolbar row (search, columns, density, export, reset).
   *
   * For a table that is the CONTENT of another surface rather than a screen of its own — a document
   * detail, a grid nested in an expanded row, an editor inside a panel that already has its own
   * header. There the view controls belong to the surface around it, and a second row of buttons
   * reads as a second table.
   */
  hideToolbar?: boolean;
}

/**
 * The search box a list page hands down to its table.
 *
 * The term belongs to the page — it is part of the query the service answers — but the *box* belongs
 * in the table's toolbar, beside columns and density, which is where a reader looks for it. A table
 * component that takes these forwards them to `searchable` / `searchValue` / `onSearchChange`.
 */
export interface TableSearchProps {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
}

export interface PersistedTableState {
  columnOrder: string[];
  columnSizing: ColumnSizingState;
  columnVisibility: VisibilityState;
  columnPinning: ColumnPinningState;
  sorting: SortingState;
  density: DensityMode;
  pageSize: number;
}
