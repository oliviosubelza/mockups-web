import { createContext, Fragment, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type Modifier,
} from "@dnd-kit/core";
import { restrictToFirstScrollableAncestor } from "@dnd-kit/modifiers";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Cell,
  type ColumnDef,
  type ColumnPinningState,
  type ColumnSizingState,
  type ExpandedState,
  type Header,
  type Row,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  AlertTriangle,
  AlignJustify,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ExpandChevron,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  Download,
  EyeOff,
  GripVertical,
  Inbox,
  MoreHorizontal,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Rows3,
  Search,
  SlidersHorizontal,
  StretchHorizontal,
  X,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTableState } from "./use-table-state";
import { DENSITY, type ColumnDefConfig, type DataTableProps, type DensityMode, type RowAction } from "./types";

const SPECIAL = new Set(["__select__", "__actions__", "__expand__", "__dragrow__"]);

// Absolute pixels, not `text-xs`/`text-sm`, and that is the whole point: this app scales itself by
// moving the root font-size between 10.75px and 12.25px (`index.css`), so every rem-based step
// shrinks with it while a literal `text-[11px]` does not. With the two mixed, compact (11px) came
// out LARGER than normal (0.75rem ≈ 8.8px) and larger than comfortable (0.875rem ≈ 10.3px) — the
// ladder read upside down. Density is a decision about this table, not about the viewport, so all
// three steps are stated in the same absolute unit and can only be read in order.
//
// Every step also sits BELOW the rem class it replaced would have suggested: these are dense
// operational lists, read as a block, and the row height is what separates the modes.
//
// The ladder is 10 / 11.5 / 13px. Keep the classes and DENSITY_FONT_PX below saying the same thing:
// Tailwind only emits an arbitrary value it can read as a literal, so the number cannot be
// interpolated in and the two records have to be edited together.
const DENSITY_ROW: Record<DensityMode, string> = {
  compact: "h-7 text-[10px]",
  normal: "h-9 text-[11.5px]",
  comfortable: "h-12 text-[13px]",
};

// Column widths follow the type, so a column that just fit its content still just fits it.
//
// 11px is the reference, not compact: every `size` in the app was declared while the table drew its
// rows at 11px, so that is the width those numbers describe. Compact now sets its text below that
// and takes a proportionally narrower column with it.
//
// Applied to the column definitions rather than to the rendered `width`, so TanStack derives pin
// offsets and resize deltas from the same numbers the cells are drawn with.
const DENSITY_FONT_PX: Record<DensityMode, number> = { compact: 10, normal: 11.5, comfortable: 13 };
const SIZED_AT_PX = 11;

const DENSITY_WIDTH: Record<DensityMode, number> = {
  compact: DENSITY_FONT_PX.compact / SIZED_AT_PX,
  normal: DENSITY_FONT_PX.normal / SIZED_AT_PX,
  comfortable: DENSITY_FONT_PX.comfortable / SIZED_AT_PX,
};

const DENSITY_CELL: Record<DensityMode, string> = {
  compact: "px-2 py-0",
  normal: "px-2.5 py-1",
  comfortable: "px-3 py-2",
};

const DENSITY_ICON: Record<DensityMode, typeof Rows3> = {
  compact: Rows3,
  normal: AlignJustify,
  comfortable: StretchHorizontal,
};

const DENSITY_LABEL: Record<DensityMode, string> = {
  compact: "Compacta",
  normal: "Normal",
  comfortable: "Amplia",
};

const PAGE_SIZES = [10, 20, 50, 100];

// Minimum height of the table box (header + body). Without it an empty or errored table collapses
// to the height of its notice and everything below jumps up every time a fetch comes back with no
// rows. With it the box always measures the same.
const DEFAULT_BODY_MIN_HEIGHT = 320;

// Real thead height per density (h-7 / h-9 / h-12 in DraggableHeader) — discounted so the
// empty/error notice takes EXACTLY the rest and the total lands on bodyMinHeight.
// KEEP IN SYNC with DENSITY_ROW and with the <th> classes in DraggableHeader.
const HEADER_HEIGHT: Record<DensityMode, number> = { compact: 28, normal: 36, comfortable: 48 };

function toTanstackCols<T extends object>(defs: ColumnDefConfig<T>[], widthScale: number): ColumnDef<T>[] {
  return defs.map((def) => ({
    id: def.id,
    header: def.header,
    // A column has one value: an explicit key, a function, or nothing to sort by.
    ...(def.accessorKey
      ? { accessorKey: def.accessorKey }
      : def.accessorFn
        ? { accessorFn: def.accessorFn }
        : { accessorFn: () => null }),
    cell: def.cell
      ? ({ row }: { row: Row<T> }) => (def.cell as NonNullable<typeof def.cell>)(row.original, row.index)
      : def.accessorKey
        ? ({ row }: { row: Row<T> }) => String((row.original as Record<string, unknown>)[def.accessorKey!] ?? "")
        : def.accessorFn
          ? ({ row }: { row: Row<T> }) => String(def.accessorFn!(row.original) ?? "")
          : () => null,
    enableSorting: def.enableSorting ?? true,
    enableResizing: def.enableResizing ?? true,
    enableHiding: def.enableHiding ?? true,
    size: Math.round((def.size ?? 150) * widthScale),
    minSize: Math.round((def.minSize ?? 32) * widthScale),
    maxSize: Math.round((def.maxSize ?? 600) * widthScale),
    meta: def.meta,
  }));
}

/**
 * Where each column starts anchored.
 *
 * The actions column is pinned right whether the caller declared it (`pin: "right"` on its own
 * `actions` column) or the table built it from `rowActions`: a menu that scrolls out of reach is a
 * menu the row no longer has. It is a starting point, not a lock — the user can unpin it from the
 * column menu and that choice persists.
 */
function initialPinning<T extends object>(
  defs: ColumnDefConfig<T>[],
  hasRowActions: boolean,
): { left: string[]; right: string[] } {
  return {
    left: defs.filter((d) => d.pin === "left").map((d) => d.id),
    right: [...defs.filter((d) => d.pin === "right").map((d) => d.id), ...(hasRowActions ? ["__actions__"] : [])],
  };
}

/**
 * Whether this column is the OUTER edge of its pinned block — the last one anchored left, the first
 * one anchored right. Only that cell draws the divider: with two columns pinned together, a line on
 * each would read as two separate blocks instead of one that ends here.
 */
function isPinEdge(
  table: { getLeftLeafColumns: () => { id: string }[]; getRightLeafColumns: () => { id: string }[] },
  column: { id: string; getIsPinned: () => false | "left" | "right" },
): boolean {
  const pin = column.getIsPinned();
  if (pin === "left") return table.getLeftLeafColumns().at(-1)?.id === column.id;
  if (pin === "right") return table.getRightLeafColumns()[0]?.id === column.id;
  return false;
}

function exportCSV<T extends object>(defs: ColumnDefConfig<T>[], data: T[], filename: string) {
  // Every column that has a value, however it gets it. A derived column that
  // renders on screen but vanishes from the export is the kind of gap nobody
  // notices until they open the file.
  const cols = defs.filter((d) => d.accessorKey || d.accessorFn);
  const headers = cols.map((d) => d.header);
  const rows = data.map((row) =>
    cols.map((d) => {
      const val = d.accessorKey
        ? (row as Record<string, unknown>)[d.accessorKey]
        : d.accessorFn!(row);
      return `"${String(val ?? "").replace(/"/g, '""')}"`;
    }),
  );
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename || "export"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function DraggableHeader<T extends object>({
  header,
  density,
}: {
  header: Header<T, unknown>;
  density: DensityMode;
}) {
  const col = header.column;
  const isSpecial = SPECIAL.has(col.id);
  const isPinned = col.getIsPinned();
  const meta = col.columnDef.meta as { align?: string } | undefined;
  const align = meta?.align ?? "left";

  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id: col.id,
    disabled: isSpecial,
  });

  const [resizing, setResizing] = useState(false);

  // Own resize handler: TanStack's (`header.getResizeHandler`) binds mousemove/mouseup to the
  // global `document`. Binding to the <th>'s ownerDocument keeps the drag live even when the table
  // is rendered inside another document (portal / secondary window). Uses the table's
  // setColumnSizing with a functional updater, so no stale state.
  const startResize = (e: React.MouseEvent | React.TouchEvent) => {
    const startX = ("touches" in e ? e.touches[0] : e).clientX;
    const startSize = col.getSize();
    const table = header.getContext().table;
    const doc = (e.currentTarget as HTMLElement).ownerDocument;
    const minSize = col.columnDef.minSize ?? 20;
    const maxSize = col.columnDef.maxSize ?? Number.MAX_SAFE_INTEGER;
    setResizing(true);
    const onMove = (ev: MouseEvent | TouchEvent) => {
      const clientX = ("touches" in ev ? ev.touches[0] : ev).clientX;
      const next = Math.min(maxSize, Math.max(minSize, startSize + (clientX - startX)));
      table.setColumnSizing((prev) => ({ ...prev, [col.id]: next }));
    };
    const onEnd = () => {
      setResizing(false);
      doc.removeEventListener("mousemove", onMove);
      doc.removeEventListener("mouseup", onEnd);
      doc.removeEventListener("touchmove", onMove);
      doc.removeEventListener("touchend", onEnd);
    };
    doc.addEventListener("mousemove", onMove);
    doc.addEventListener("mouseup", onEnd);
    doc.addEventListener("touchmove", onMove, { passive: false });
    doc.addEventListener("touchend", onEnd);
    e.preventDefault();
    e.stopPropagation();
  };

  const pinStyle: React.CSSProperties = isPinned
    ? {
        position: "sticky",
        left: isPinned === "left" ? `${col.getStart("left")}px` : undefined,
        right: isPinned === "right" ? `${col.getAfter("right")}px` : undefined,
        zIndex: 3,
      }
    : {};

  const style: React.CSSProperties = {
    width: header.getSize(),
    transform: CSS.Transform.toString(transform ? { ...transform, scaleY: 1 } : null),
    transition: isDragging ? undefined : "transform 150ms ease",
    opacity: isDragging ? 0.85 : 1,
    ...pinStyle,
  };

  return (
    <th
      ref={setNodeRef}
      style={style}
      data-pin={isPinned || undefined}
      data-pin-edge={isPinned ? String(isPinEdge(header.getContext().table, col)) : undefined}
      className={cn(
        // `dt-th` / `dt-th-pin` (index.css) paint the opaque version of `bg-muted/50`: with a
        // sticky header or a pinned column, a translucent one shows the rows travelling under it.
        "group/th dt-th relative select-none border-b border-r last:border-r-0",
        // Same ladder as the body rows — the header is a row, and a second copy of the sizes here is
        // how the two drifted apart in the first place.
        DENSITY_ROW[density],
        isDragging && "dt-th-drag z-10",
        isPinned && "dt-th-pin",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1 px-2 font-medium text-muted-foreground",
          align === "center" && "justify-center",
          align === "right" && "justify-end",
        )}
      >
        {/* Drag handle */}
        {!isSpecial && (
          <button
            {...attributes}
            {...listeners}
            className="-ml-1 shrink-0 cursor-grab p-0.5 opacity-30 hover:opacity-70 active:cursor-grabbing"
            tabIndex={-1}
          >
            <GripVertical size={12} />
          </button>
        )}

        {/* Header label + sort */}
        {!header.isPlaceholder && (
          <span
            className={cn(
              "flex-1 truncate leading-none",
              col.getCanSort() && "cursor-pointer transition-colors hover:text-foreground",
            )}
            onClick={col.getCanSort() ? col.getToggleSortingHandler() : undefined}
          >
            {flexRender(col.columnDef.header, header.getContext())}
          </span>
        )}

        {col.getCanSort() && (
          <span
            className="shrink-0 cursor-pointer text-muted-foreground/60 transition-colors hover:text-foreground"
            onClick={col.getToggleSortingHandler()}
          >
            {col.getIsSorted() === "asc" ? (
              <ArrowUp size={11} />
            ) : col.getIsSorted() === "desc" ? (
              <ArrowDown size={11} />
            ) : (
              <ArrowUpDown size={11} className="opacity-40" />
            )}
          </span>
        )}

        {/* Column options dropdown */}
        {!isSpecial && (
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-accent/80 group-hover/th:opacity-100">
              <ChevronDown size={10} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              {col.getCanSort() && (
                <>
                  <DropdownMenuItem onClick={() => col.toggleSorting(false)}>
                    <ArrowUp size={13} className="mr-2 shrink-0" /> Ordenar A → Z
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => col.toggleSorting(true)}>
                    <ArrowDown size={13} className="mr-2 shrink-0" /> Ordenar Z → A
                  </DropdownMenuItem>
                  {col.getIsSorted() && (
                    <DropdownMenuItem onClick={() => col.clearSorting()}>
                      <ArrowUpDown size={13} className="mr-2 shrink-0" /> Quitar orden
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                </>
              )}
              {isPinned ? (
                <DropdownMenuItem onClick={() => col.pin(false)}>
                  <PinOff size={13} className="mr-2 shrink-0" /> Desanclar
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem onClick={() => col.pin("left")}>
                    <Pin size={13} className="mr-2 shrink-0" /> Anclar izquierda
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => col.pin("right")}>
                    <Pin size={13} className="mr-2 shrink-0" /> Anclar derecha
                  </DropdownMenuItem>
                </>
              )}
              {col.getCanHide() && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => col.toggleVisibility(false)}>
                    <EyeOff size={13} className="mr-2 shrink-0" /> Ocultar columna
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Resize handle */}
      {col.getCanResize() && (
        <div
          onMouseDown={startResize}
          onTouchStart={startResize}
          className={cn(
            "absolute right-0 top-0 h-full w-1 cursor-col-resize touch-none select-none",
            "bg-transparent transition-colors hover:bg-primary/40",
            (col.getIsResizing() || resizing) && "bg-primary",
          )}
        />
      )}
    </th>
  );
}

function RowActionsMenu<T extends object>({ row, actions }: { row: T; actions: RowAction<T>[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-accent"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
      >
        <MoreHorizontal size={14} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {actions.map((action, i) => (
          <Fragment key={i}>
            {action.separator && i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem
              disabled={action.disabled?.(row)}
              onClick={(e) => {
                e.stopPropagation();
                action.onClick(row);
              }}
              className={action.variant === "destructive" ? "text-destructive focus:text-destructive" : ""}
            >
              {action.icon && <action.icon size={13} className="mr-2 shrink-0" />}
              {action.label}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function pinnedStyle(col: {
  getIsPinned: () => false | "left" | "right";
  getStart: (s: "left") => number;
  getAfter: (s: "right") => number;
}): React.CSSProperties {
  const pin = col.getIsPinned();
  if (!pin) return {};
  return {
    position: "sticky",
    left: pin === "left" ? `${col.getStart("left")}px` : undefined,
    right: pin === "right" ? `${col.getAfter("right")}px` : undefined,
    zIndex: 1,
  };
}

// Body cell that travels with its header while columns are being reordered. Uses the same
// `useSortable` (by column id) as DraggableHeader; must live inside a per-row SortableContext.
// Pinned/special columns keep their sticky positioning.
function DragAlongCell<T extends object>({
  cell,
  density,
  loading,
}: {
  cell: Cell<T, unknown>;
  density: DensityMode;
  /** Paints the cell as a skeleton (row or cell "loading") instead of its real content. */
  loading?: boolean;
}) {
  const col = cell.column;
  const isSpecial = SPECIAL.has(col.id);
  const pin = col.getIsPinned();
  const cMeta = col.columnDef.meta as { align?: string; className?: string } | undefined;

  const { setNodeRef, transform, isDragging } = useSortable({ id: col.id, disabled: isSpecial });

  const style: React.CSSProperties = pin
    ? { width: col.getSize(), ...pinnedStyle(col) }
    : {
        width: col.getSize(),
        transform: CSS.Transform.toString(transform ? { ...transform, scaleY: 1 } : null),
        transition: isDragging ? undefined : "transform 150ms ease",
        ...(isDragging ? { position: "relative", zIndex: 1 } : {}),
      };

  return (
    <td
      ref={setNodeRef}
      style={style}
      data-pin={pin || undefined}
      data-pin-edge={pin ? String(isPinEdge(cell.getContext().table, col)) : undefined}
      onClick={(e) => {
        if (
          col.id === "__dragrow__" ||
          col.id === "__actions__" ||
          col.id === "seq" ||
          col.id === "__expand__" ||
          col.id === "__select__"
        ) {
          e.stopPropagation();
        }
      }}
      className={cn(
        DENSITY_CELL[density],
        "border-r last:border-r-0",
        // `bg-[inherit]` used to mean "whatever the row has", which for a row whose tint is an
        // alpha (hover, striped, selected) is see-through — the rows underneath travelled across
        // the anchored column. `dt-pin` (index.css) repaints those same tints already composited
        // over the surface, keyed off the row's data attributes.
        pin && "dt-pin",
        // Opaque background while dragging so it does not show through its neighbours.
        isDragging && "bg-background",
        cMeta?.align === "center" && "text-center",
        // Right = numeric convention (prices, quantities, totals) → tabular figures.
        cMeta?.align === "right" && "text-right tabular-nums",
        cMeta?.className,
      )}
    >
      {loading ? <Skeleton className="h-3 w-full" /> : flexRender(cell.column.columnDef.cell, cell.getContext())}
    </td>
  );
}

// ── Row reordering (opt-in) ──
// Row drag and column drag share ONE DndContext (nesting contexts would inject hidden <div>s inside
// <tbody>, which is invalid). The axis is decided by a modifier based on what is being dragged; the
// handlers tell row from column by id. Each row's grip lives in a special cell (__dragrow__) and
// takes its row's listeners through this context.
type RowDragBindings = Pick<ReturnType<typeof useSortable>, "attributes" | "listeners">;
const RowDragContext = createContext<RowDragBindings | null>(null);

function RowDragHandle() {
  const ctx = useContext(RowDragContext);
  if (!ctx) return null;
  return (
    <button
      {...ctx.attributes}
      {...ctx.listeners}
      onClick={(e) => e.stopPropagation()}
      className="cursor-grab p-0.5 opacity-40 hover:opacity-80 active:cursor-grabbing"
      tabIndex={-1}
      aria-label="Reordenar fila"
    >
      <GripVertical size={13} />
    </button>
  );
}

/** Vertically draggable <tr>. Provides its listeners to the grip in the __dragrow__ cell. */
function SortableDataRow({
  rowId,
  className,
  rowAttrs,
  onClick,
  onDoubleClick,
  children,
}: {
  rowId: string;
  className?: string;
  /** `data-*` row state read by the pinned-cell rules in index.css. */
  rowAttrs?: Record<string, string>;
  onClick?: () => void;
  onDoubleClick?: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners } = useSortable({ id: rowId });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform ? { ...transform, scaleX: 1 } : null),
    transition,
    ...(isDragging ? { position: "relative", zIndex: 1 } : {}),
  };
  return (
    <RowDragContext.Provider value={{ attributes, listeners }}>
      <tr
        ref={setNodeRef}
        style={style}
        className={className}
        {...rowAttrs}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        {children}
      </tr>
    </RowDragContext.Provider>
  );
}

export function DataTable<T extends object>({
  tableId,
  columns: columnDefs,
  data,
  getRowId,

  isLoading,
  isRowLoading,
  isCellLoading,
  isError,
  errorTitle = "No se pudieron cargar los datos",
  errorMessage = "Ocurrió un error al traer la información. Probá de nuevo.",
  onRetry,
  emptyTitle = "Sin resultados",
  emptyMessage = "No hay nada que mostrar con los filtros actuales.",
  emptyAction,
  emptySlot,
  bodyMinHeight = DEFAULT_BODY_MIN_HEIGHT,
  fillHeight,

  pagination: serverPagination,
  clientPagination,
  defaultPageSize,
  initialSort,

  selectable,
  onSelectionChange,
  isRowSelectable,
  defaultSelectedIds,

  enableRowReorder,
  onRowReorder,

  rowActions,
  bulkActions,

  onRowClick,
  onRowDoubleClick,
  rowClassName,

  expandable,
  renderExpanded,
  defaultExpandedIds,
  renderSubRow,
  footer,

  searchable,
  searchPlaceholder = "Buscar…",
  defaultSearch = "",
  searchValue,
  onSearchChange,
  searchKeys,

  exportable,
  exportFilename,

  filterBar,
  toolbar,

  defaultDensity,
  stickyHeader,
  striped,
  hideToolbar,
}: DataTableProps<T>) {
  const { state: ts, persist, reset, isLoaded } = useTableState(tableId, {
    ...(defaultDensity ? { density: defaultDensity } : {}),
    ...(defaultPageSize ? { pageSize: defaultPageSize } : {}),
    columnPinning: initialPinning(columnDefs, !!rowActions),
  });

  // Initial selection from `defaultSelectedIds` (lazy initializer: evaluated only on mount, so a new
  // prop does NOT re-seed — remount the table with another `key` for that).
  const [rowSelection, setRowSelection] = useState<RowSelectionState>(() =>
    Object.fromEntries((defaultSelectedIds ?? []).map((id) => [id, true])),
  );
  const [globalFilter, setGlobalFilter] = useState(defaultSearch);
  // With `searchValue` the caller owns the term (and the filtering, usually server-side): the table
  // only draws the box and reports what is typed.
  const searchIsControlled = searchValue !== undefined;
  const searchText = searchIsControlled ? searchValue : globalFilter;
  const changeSearch = (value: string) => {
    if (!searchIsControlled) setGlobalFilter(value);
    onSearchChange?.(value);
  };
  // Same mount-only rule as `defaultSelectedIds`: a lazy initializer, so a new prop does not
  // re-open rows the user has since closed.
  const [expanded, setExpanded] = useState<ExpandedState>(() =>
    Object.fromEntries((defaultExpandedIds ?? []).map((id) => [id, true])),
  );
  // Default sort = initialSort, until the user sorts another column (which is persisted).
  const [sorting, setSorting] = useState<SortingState>(
    initialSort ? [{ id: initialSort.id, desc: initialSort.desc ?? false }] : [],
  );
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>(() => initialPinning(columnDefs, !!rowActions));
  const [density, setDensity] = useState<DensityMode>(defaultDensity ?? "compact");
  const [pageSize, setPageSize] = useState(defaultPageSize ?? 20);
  const [clientPage, setClientPage] = useState(0);

  // Load persisted state after storage resolves
  useEffect(() => {
    if (!isLoaded) return;
    // The user's persisted sort wins; if they never sorted (empty), initialSort is respected.
    if (ts.sorting.length > 0) setSorting(ts.sorting);
    setColumnVisibility(ts.columnVisibility);
    setColumnSizing(ts.columnSizing);
    setColumnOrder(ts.columnOrder);
    setColumnPinning(ts.columnPinning);
    setDensity(ts.density);
    setPageSize(ts.pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  // Persist each state slice on change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (isLoaded) persist({ sorting }); }, [sorting]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (isLoaded) persist({ columnVisibility }); }, [columnVisibility]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (isLoaded) persist({ columnSizing }); }, [columnSizing]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (isLoaded) persist({ columnOrder }); }, [columnOrder]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (isLoaded) persist({ columnPinning }); }, [columnPinning]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (isLoaded) persist({ density }); }, [density]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (isLoaded) persist({ pageSize }); }, [pageSize]);

  // Build column definitions. The special columns below (checkbox, chevron, drag, actions) hold a
  // control, not text, so they keep their fixed width at every density.
  //
  // MEMOISED, and that is load-bearing rather than a micro-optimisation.
  // `toTanstackCols` mints a fresh `cell` arrow per column on every call, and
  // TanStack renders `columnDef.cell` through `flexRender`, which treats a
  // function as a component *type*. Rebuilding these on each render therefore
  // handed React a new type for every cell, and React answers a new type by
  // unmounting the old subtree and mounting a fresh one — so any table whose
  // cell holds a control lost it mid-use: an input being typed into was
  // destroyed after the first keystroke, and the caret fell to `<body>`. Text
  // cells never noticed, which is why this survived so long.
  //
  // A caller that declares its columns inline gets the old behaviour, since
  // `columnDefs` changes identity anyway; one that memoises them now keeps its
  // cells alive.
  const builtCols = useMemo(
    () => toTanstackCols(columnDefs, DENSITY_WIDTH[density]),
    [columnDefs, density],
  );

  const selectCol: ColumnDef<T> = useMemo(() => ({
    id: "__select__",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
        aria-label="Seleccionar todo"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        disabled={!row.getCanSelect()}
        onCheckedChange={(v) => row.toggleSelected(!!v)}
        aria-label="Seleccionar fila"
        onClick={(e) => e.stopPropagation()}
      />
    ),
    enableSorting: false,
    enableResizing: false,
    enableHiding: false,
    size: 40,
    minSize: 40,
    maxSize: 40,
  }), []);

  // `rowActions` is typically an inline arrow, so it is read through a ref: the
  // column must not be rebuilt just because the caller re-rendered.
  const rowActionsRef = useRef(rowActions);
  rowActionsRef.current = rowActions;

  const actionsCol: ColumnDef<T> = useMemo(() => ({
    id: "__actions__",
    header: "",
    cell: ({ row }: { row: Row<T> }) => {
      const actions = rowActionsRef.current;
      return actions ? <RowActionsMenu row={row.original} actions={actions(row.original)} /> : null;
    },
    enableSorting: false,
    enableResizing: false,
    enableHiding: false,
    size: 48,
    minSize: 48,
    maxSize: 48,
  }), []);

  const expandCol: ColumnDef<T> = useMemo(() => ({
    id: "__expand__",
    header: "",
    cell: ({ row }) =>
      row.getCanExpand() ? (
        <button
          className="inline-flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-accent"
          onClick={(e) => {
            e.stopPropagation();
            row.toggleExpanded();
          }}
        >
          <ExpandChevron size={13} className={cn("transition-transform", row.getIsExpanded() && "rotate-90")} />
        </button>
      ) : null,
    enableSorting: false,
    enableResizing: false,
    enableHiding: false,
    size: 40,
    minSize: 40,
    maxSize: 40,
  }), []);

  const dragCol: ColumnDef<T> = useMemo(() => ({
    id: "__dragrow__",
    header: "",
    cell: () => <RowDragHandle />,
    enableSorting: false,
    enableResizing: false,
    enableHiding: false,
    size: 36,
    minSize: 36,
    maxSize: 36,
  }), []);

  const hasRowActions = !!rowActions;
  const allCols: ColumnDef<T>[] = useMemo(
    () => [
      ...(enableRowReorder ? [dragCol] : []),
      ...(selectable ? [selectCol] : []),
      ...(expandable ? [expandCol] : []),
      ...builtCols,
      ...(hasRowActions ? [actionsCol] : []),
    ],
    [
      enableRowReorder,
      selectable,
      expandable,
      hasRowActions,
      builtCols,
      dragCol,
      selectCol,
      expandCol,
      actionsCol,
    ],
  );

  const useServerPagination = !!serverPagination;
  const useClientPagination = !useServerPagination && !!clientPagination;
  const effectiveOrder = columnOrder.length ? columnOrder : allCols.map((c) => c.id!);

  const table = useReactTable<T>({
    data,
    columns: allCols,
    state: {
      sorting,
      columnVisibility,
      columnSizing,
      columnOrder: effectiveOrder,
      columnPinning,
      rowSelection,
      // A controlled search is somebody else's filter: the table holds no term of its own.
      globalFilter: searchIsControlled ? "" : globalFilter,
      expanded,
      ...(useClientPagination ? { pagination: { pageIndex: clientPage, pageSize } } : {}),
    },
    columnResizeMode: "onChange",
    // TanStack resets the page (and the expanded state) every time the IDENTITY of `data` changes.
    // With the default on, a caller rebuilding its array on render was enough to send the table back
    // to page 1: ticking a row on page 3 fires onSelectionChange → the parent re-renders → `data` is
    // a new array → back to page 1 with the selection out of sight.
    //
    // The page is the user's NAVIGATION state: it cannot depend on whether the caller memoizes its
    // array. Auto reset is turned off and the page is reset explicitly where it belongs (search)
    // and clamped when it stops existing.
    autoResetPageIndex: false,
    autoResetExpanded: false,
    // `isRowSelectable` restricts selection row by row (TanStack accepts the function form);
    // without it, behavior is the usual one (every row selectable when `selectable`).
    enableRowSelection: isRowSelectable ? (row) => isRowSelectable(row.original) : !!selectable,
    enableMultiRowSelection: !!selectable,
    getRowId,
    getRowCanExpand: expandable ? () => true : undefined,
    onSortingChange: (u) => setSorting(u instanceof Function ? u(sorting) : u),
    onColumnVisibilityChange: (u) => setColumnVisibility(u instanceof Function ? u(columnVisibility) : u),
    // Direct setter: TanStack passes value-or-updater, same as setState accepts → correct functional
    // updates (key during a live resize, so no stale columnSizing from the closure).
    onColumnSizingChange: setColumnSizing,
    onColumnOrderChange: (u) => setColumnOrder(u instanceof Function ? u(effectiveOrder) : u),
    onColumnPinningChange: (u) => setColumnPinning(u instanceof Function ? u(columnPinning) : u),
    onRowSelectionChange: (u) => setRowSelection(u instanceof Function ? u(rowSelection) : u),
    onGlobalFilterChange: setGlobalFilter,
    // With `searchKeys` the global search looks at the row FIELDS, not the columns. TanStack calls
    // this fn once per filterable column and ORs the results, so `columnId` is ignored and the
    // answer is per row: the first true stops the walk.
    ...(searchKeys?.length
      ? {
          globalFilterFn: (row: Row<T>, _columnId: string, filterValue: unknown) => {
            const needle = String(filterValue ?? "").trim().toLowerCase();
            if (!needle) return true;
            const original = row.original as Record<string, unknown>;
            return searchKeys.some((key) => String(original[key] ?? "").toLowerCase().includes(needle));
          },
        }
      : {}),
    onExpandedChange: (u) => setExpanded(u instanceof Function ? u(expanded) : u),
    ...(useClientPagination
      ? {
          onPaginationChange: (u) => {
            const next = u instanceof Function ? u({ pageIndex: clientPage, pageSize }) : u;
            setClientPage(next.pageIndex);
            setPageSize(next.pageSize);
          },
          getPaginationRowModel: getPaginationRowModel(),
        }
      : {}),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: expandable ? getExpandedRowModel() : undefined,
    manualPagination: useServerPagination,
    ...(useServerPagination ? { rowCount: serverPagination.total } : {}),
  });

  // Searching changes the result set: going back to the first page is what the user expects
  // (staying on page 7 of a 2-page result reads as "it found nothing").
  const firstSearch = useRef(true);
  useEffect(() => {
    if (firstSearch.current) {
      firstSearch.current = false;
      return;
    }
    setClientPage(0);
  }, [globalFilter]);

  // The current page can stop existing because the caller filtered, deleted rows or shrank the
  // dataset. It is clamped to the last valid page instead of jumping to the first: the user loses
  // as little as possible.
  const clientPageCount = useClientPagination ? table.getPageCount() : 0;
  useEffect(() => {
    if (!useClientPagination) return;
    if (clientPageCount === 0) {
      if (clientPage !== 0) setClientPage(0);
      return;
    }
    if (clientPage > clientPageCount - 1) setClientPage(clientPageCount - 1);
  }, [clientPage, clientPageCount, useClientPagination]);

  // REAL selection over `data`: independent of the visible page and of the filtered row model.
  // With pagination/filters, `getSelectedRowModel()` could drop already-selected rows that are not
  // visible and the caller would read them as unticked.
  const rowIdOf = useMemo(
    () => getRowId ?? ((row: T) => String(data.indexOf(row))),
    [getRowId, data],
  );
  const selectedRows = useMemo(() => {
    if (!selectable) return [];
    return data.filter((row) => !!rowSelection[rowIdOf(row)]);
  }, [data, rowIdOf, rowSelection, selectable]);
  const selectionSignature = useMemo(
    () => selectedRows.map((row) => rowIdOf(row)).join("|"),
    [rowIdOf, selectedRows],
  );
  const onSelectionChangeRef = useRef(onSelectionChange);
  const selectedRowsRef = useRef(selectedRows);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  useEffect(() => {
    selectedRowsRef.current = selectedRows;
  }, [selectedRows]);

  // Fire selection callback
  useEffect(() => {
    if (!onSelectionChangeRef.current) return;
    onSelectionChangeRef.current(selectedRowsRef.current);
  }, [selectionSignature]);

  // Keep special columns pinned
  useEffect(() => {
    const left = [
      ...(enableRowReorder ? ["__dragrow__"] : []),
      ...(selectable ? ["__select__"] : []),
      ...(expandable ? ["__expand__"] : []),
      ...(columnPinning.left?.filter((id) => !SPECIAL.has(id)) ?? []),
    ];
    const right = [
      ...(columnPinning.right?.filter((id) => !SPECIAL.has(id)) ?? []),
      ...(rowActions ? ["__actions__"] : []),
    ];
    table.setColumnPinning({ left, right });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectable, expandable, !!rowActions, enableRowReorder]);

  // DnD setup
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const draggableIds = effectiveOrder.filter((id) => !SPECIAL.has(id));

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!active || !over || active.id === over.id) return;
    // Rows reorder on drop (handleDragEnd), not live. Columns reorder live, here.
    if (rowIdSet.has(String(active.id))) return;
    const order = table.getState().columnOrder;
    const oldIdx = order.indexOf(active.id as string);
    const newIdx = order.indexOf(over.id as string);
    if (oldIdx !== -1 && newIdx !== -1) setColumnOrder(arrayMove(order, oldIdx, newIdx));
  }

  function handleDragEnd(event: DragEndEvent) {
    // Columns already moved live. We only report ROW reordering to the consumer.
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    if (rowIdSet.has(String(active.id)) && rowIdSet.has(String(over.id))) {
      onRowReorder?.(String(active.id), String(over.id));
    }
  }

  const hasSelection = selectedRows.length > 0;
  const DensityIcon = DENSITY_ICON[density];
  // What is left for the empty/error notice once the thead is discounted: header + cell = bodyMinHeight.
  const stateCellHeight = Math.max(0, bodyMinHeight - HEADER_HEIGHT[density]);

  const visibleUserCols = table.getAllLeafColumns().filter((c) => !SPECIAL.has(c.id) && c.getCanHide());

  const { rows } = useServerPagination
    ? table.getRowModel()
    : useClientPagination
      ? table.getPaginationRowModel()
      : table.getRowModel();

  // Row reordering: ids of the VISIBLE rows (only those are draggable) + a modifier that locks the
  // drag axis (rows = vertical, columns = horizontal) over a single DndContext.
  const rowIdSet = new Set(rows.map((r) => r.id));
  const axisLockModifier: Modifier = ({ transform, active }) =>
    active && rowIdSet.has(String(active.id)) ? { ...transform, x: 0 } : { ...transform, y: 0 };

  // One data row (with or without drag). Shares className, cells and expanded row between both modes.
  const renderDataRow = (row: Row<T>, rowIdx: number) => {
    const clickable = !!(onRowClick || onRowDoubleClick);
    const striping = !!striped && rowIdx % 2 === 1;
    const className = cn(
      DENSITY_ROW[density],
      "border-b transition-colors",
      clickable && "cursor-pointer hover:bg-accent/50",
      !clickable && "hover:bg-muted/20",
      row.getIsSelected() && "bg-primary/5",
      striping && "bg-muted/20",
      rowClassName?.(row.original),
    );
    // The row states, as data instead of only as classes: the pinned cells repaint these same
    // tints opaque (index.css) and CSS cannot read a Tailwind class the way it reads an attribute.
    const rowAttrs = {
      "data-clickable": String(clickable),
      "data-selected": String(row.getIsSelected()),
      "data-striped": String(striping),
    } as const;
    // Row or cell skeleton: the whole row loads (isRowLoading) or only specific columns
    // (isCellLoading). Either one being true is enough for that cell.
    const rowLoading = isRowLoading?.(row.original) ?? false;
    const subRow = renderSubRow?.(row.original);
    const cells = (
      <SortableContext items={draggableIds} strategy={horizontalListSortingStrategy}>
        {row.getVisibleCells().map((cell) => (
          <DragAlongCell
            key={cell.id}
            cell={cell}
            density={density}
            loading={rowLoading || (isCellLoading?.(row.original, cell.column.id) ?? false)}
          />
        ))}
      </SortableContext>
    );
    return (
      <Fragment key={row.id}>
        {enableRowReorder ? (
          <SortableDataRow
            rowId={row.id}
            className={className}
            rowAttrs={rowAttrs}
            onClick={onRowClick ? () => onRowClick(row.original) : undefined}
            onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row.original) : undefined}
          >
            {cells}
          </SortableDataRow>
        ) : (
          <tr
            className={className}
            {...rowAttrs}
            onClick={() => onRowClick?.(row.original)}
            onDoubleClick={() => onRowDoubleClick?.(row.original)}
          >
            {cells}
          </tr>
        )}

        {/* Expanded content — the toggled kind. */}
        {expandable && row.getIsExpanded() && renderExpanded && (
          <tr className="border-b bg-muted/20">
            <td colSpan={table.getVisibleLeafColumns().length} className="px-4 py-3">
              {renderExpanded(row.original)}
            </td>
          </tr>
        )}

        {/* Permanent sub-row. No padding of its own: the node decides how it looks, because what
            hangs off a row (a gift, a piece of evidence) has to be told apart from the row itself. */}
        {subRow && (
          <tr className="border-b">
            <td colSpan={table.getVisibleLeafColumns().length} className="p-0">
              {subRow}
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  function handleReset() {
    reset();
    setSorting([]);
    setColumnVisibility({});
    setColumnSizing({});
    setColumnOrder([]);
    setColumnPinning(initialPinning(columnDefs, !!rowActions));
    setDensity(defaultDensity ?? "compact");
    setPageSize(defaultPageSize ?? 20);
    changeSearch("");
    setRowSelection({});
    setClientPage(0);
  }

  return (
    // `min-w-0` so the table never widens its parent: a wide grid has to scroll inside its own box,
    // not push the page (toolbar and header buttons would slide off-screen with it).
    <div className={cn("flex min-w-0 flex-col gap-2", fillHeight && "min-h-0 flex-1")}>
      {/* ── Filter bar ── */}
      {filterBar && (
        <div
          className={cn(
            "flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-1.5",
            fillHeight && "shrink-0",
          )}
        >
          <span className="flex shrink-0 items-center gap-1.5 pr-0.5 text-xs font-medium text-muted-foreground/80">
            <SlidersHorizontal size={11} />
            Filtros
          </span>
          <Separator orientation="vertical" className="h-4 shrink-0" />
          {filterBar}
        </div>
      )}

      {/* ── Toolbar ── */}
      {!hideToolbar && (
      <div className={cn("flex flex-wrap items-center gap-2", fillHeight && "shrink-0")}>
        {/* Left: search + selection info + bulk actions */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {searchable && (
            <div className="relative max-w-xs flex-1">
              <Search
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                placeholder={searchPlaceholder}
                value={searchText}
                onChange={(e) => changeSearch(e.target.value)}
                className="h-8 pl-8 text-sm"
              />
              {searchText && (
                <button
                  onClick={() => changeSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )}

          {selectable && hasSelection && (
            <>
              <Badge variant="secondary" className="shrink-0">
                {selectedRows.length} seleccionado{selectedRows.length !== 1 ? "s" : ""}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-muted-foreground"
                onClick={() => table.resetRowSelection()}
              >
                <X size={11} className="mr-1" /> Limpiar
              </Button>
              {bulkActions?.map((action, i) => (
                <Button
                  key={i}
                  size="sm"
                  variant={action.variant === "destructive" ? "destructive" : "outline"}
                  className="h-8 text-xs"
                  onClick={() => action.onClick(selectedRows)}
                >
                  {action.icon && <action.icon size={13} className="mr-1.5" />}
                  {action.label}
                </Button>
              ))}
            </>
          )}
        </div>

        {/* Right: toolbar slot + controls */}
        <div className="flex shrink-0 items-center gap-1">
          {toolbar}
          {toolbar && <Separator orientation="vertical" className="mx-1 h-5" />}

          {/* Column visibility */}
          <DropdownMenu>
            <DropdownMenuTrigger
              title="Columnas"
              className={cn(buttonVariants({ variant: "outline", size: "icon" }), "h-8 w-8")}
            >
              <Columns3 size={14} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 w-48 overflow-y-auto">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs">Columnas</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {visibleUserCols.map((col) => (
                  <DropdownMenuCheckboxItem
                    key={col.id}
                    checked={col.getIsVisible()}
                    onCheckedChange={(v) => col.toggleVisibility(v)}
                    className="text-sm"
                  >
                    {String(col.columnDef.header ?? col.id)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Density */}
          <DropdownMenu>
            <DropdownMenuTrigger
              title="Densidad"
              className={cn(buttonVariants({ variant: "outline", size: "icon" }), "h-8 w-8")}
            >
              <DensityIcon size={14} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs">Densidad</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={density} onValueChange={(v) => setDensity(v as DensityMode)}>
                  {(Object.keys(DENSITY) as DensityMode[]).map((d) => {
                    const Icon = DENSITY_ICON[d];
                    return (
                      <DropdownMenuRadioItem key={d} value={d} className="text-sm">
                        <Icon size={13} className="mr-2 shrink-0" />
                        {DENSITY_LABEL[d]}
                      </DropdownMenuRadioItem>
                    );
                  })}
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Export */}
          {exportable && (
            <Tooltip>
              <TooltipTrigger
                className={cn(buttonVariants({ variant: "outline", size: "icon" }), "h-8 w-8")}
                onClick={() => exportCSV(columnDefs, data, exportFilename || tableId)}
              >
                <Download size={14} />
              </TooltipTrigger>
              <TooltipContent>Exportar CSV</TooltipContent>
            </Tooltip>
          )}

          {/* Reset */}
          <Tooltip>
            <TooltipTrigger
              className={cn(buttonVariants({ variant: "outline", size: "icon" }), "h-8 w-8")}
              onClick={handleReset}
            >
              <RotateCcw size={14} />
            </TooltipTrigger>
            <TooltipContent>Restablecer vista</TooltipContent>
          </Tooltip>
        </div>
      </div>
      )}

      {/* ── Table ── */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[axisLockModifier, restrictToFirstScrollableAncestor]}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className={cn("overflow-hidden rounded-md border", fillHeight && "flex min-h-0 flex-1 flex-col")}>
          <div
            className={cn("overflow-auto", fillHeight && "min-h-0 flex-1")}
            style={fillHeight ? undefined : { minHeight: bodyMinHeight }}
          >
            <table
              className={cn(
                "border-collapse",
                // In fillHeight mode, with NO rows (empty/error) the table takes the whole height of
                // the flex box so the state cell centers and pagination stays at the bottom.
                fillHeight && !isLoading && (isError || rows.length === 0) && "h-full",
              )}
              style={{ width: `max(${table.getTotalSize()}px, 100%)` }}
            >
              <thead className={cn(stickyHeader && "sticky top-0 z-10")}>
                {table.getHeaderGroups().map((hg) => (
                  <SortableContext key={hg.id} items={draggableIds} strategy={horizontalListSortingStrategy}>
                    <tr>
                      {hg.headers.map((header) => (
                        <DraggableHeader key={header.id} header={header} density={density} />
                      ))}
                    </tr>
                  </SortableContext>
                ))}
              </thead>

              <tbody>
                {/* Loading skeleton */}
                {isLoading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className={cn(DENSITY_ROW[density], striped && i % 2 === 1 && "bg-muted/20")}>
                      {table.getVisibleLeafColumns().map((col) => (
                        <td
                          key={col.id}
                          className={cn(DENSITY_CELL[density], "border-b border-r last:border-r-0")}
                        >
                          <Skeleton className="h-3 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))}

                {/* Error state */}
                {!isLoading && isError && (
                  <tr>
                    <td
                      colSpan={table.getVisibleLeafColumns().length}
                      style={{ height: fillHeight ? undefined : stateCellHeight }}
                      className="align-middle"
                    >
                      <Empty className="border-0">
                        <EmptyHeader>
                          <EmptyMedia
                            variant="icon"
                            className="size-10 bg-destructive/10 text-destructive [&_svg:not([class*='size-'])]:size-5"
                          >
                            <AlertTriangle />
                          </EmptyMedia>
                          <EmptyTitle>{errorTitle}</EmptyTitle>
                          <EmptyDescription>{errorMessage}</EmptyDescription>
                        </EmptyHeader>
                        {onRetry && (
                          <EmptyContent>
                            <Button variant="outline" size="sm" onClick={onRetry}>
                              <RotateCcw size={13} className="mr-1.5" />
                              Reintentar
                            </Button>
                          </EmptyContent>
                        )}
                      </Empty>
                    </td>
                  </tr>
                )}

                {/* Empty state */}
                {!isLoading && !isError && rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={table.getVisibleLeafColumns().length}
                      style={{ height: fillHeight ? undefined : stateCellHeight }}
                      className="align-middle"
                    >
                      {emptySlot ?? (
                        <Empty className="border-0">
                          <EmptyHeader>
                            <EmptyMedia variant="icon" className="size-10 [&_svg:not([class*='size-'])]:size-5">
                              <Inbox />
                            </EmptyMedia>
                            <EmptyTitle>{emptyTitle}</EmptyTitle>
                            <EmptyDescription>{emptyMessage}</EmptyDescription>
                          </EmptyHeader>
                          {emptyAction && (
                            <EmptyContent>
                              <Button size="sm" onClick={emptyAction.onClick}>
                                <Plus size={13} className="mr-1.5" />
                                {emptyAction.label}
                              </Button>
                            </EmptyContent>
                          )}
                        </Empty>
                      )}
                    </td>
                  </tr>
                )}

                {/* Data rows — with reorder they live inside a vertical SortableContext (by row id). */}
                {!isLoading &&
                  !isError &&
                  (enableRowReorder ? (
                    <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                      {rows.map((row: Row<T>, rowIdx) => renderDataRow(row, rowIdx))}
                    </SortableContext>
                  ) : (
                    rows.map((row: Row<T>, rowIdx) => renderDataRow(row, rowIdx))
                  ))}
              </tbody>

              {/* Footer — only under real rows. Hanging it below the empty or error notice would
                  read as a second table starting where the first one gave up. */}
              {footer && !isLoading && !isError && rows.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={table.getVisibleLeafColumns().length} className="p-0">
                      {footer}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </DndContext>

      {/* ── Pagination ── */}
      {(useServerPagination || useClientPagination) &&
        (() => {
          const totalFiltered = useClientPagination
            ? table.getFilteredRowModel().rows.length
            : serverPagination!.total;
          const currentPage = useServerPagination
            ? serverPagination!.page - 1
            : table.getState().pagination.pageIndex;
          const effectiveSize = useServerPagination ? serverPagination!.limit : pageSize;
          const totalPages = Math.ceil(totalFiltered / effectiveSize);
          const canPrev = currentPage > 0;
          const canNext = currentPage < totalPages - 1;
          const from = totalFiltered === 0 ? 0 : currentPage * effectiveSize + 1;
          const to = Math.min((currentPage + 1) * effectiveSize, totalFiltered);

          const goFirst = () => (useServerPagination ? serverPagination!.onPageChange(1) : table.firstPage());
          const goPrev = () =>
            useServerPagination ? serverPagination!.onPageChange(currentPage) : table.previousPage();
          const goNext = () =>
            useServerPagination ? serverPagination!.onPageChange(currentPage + 2) : table.nextPage();
          const goLast = () =>
            useServerPagination ? serverPagination!.onPageChange(totalPages) : table.lastPage();

          return (
            <div
              className={cn(
                "flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground",
                fillHeight && "shrink-0",
              )}
            >
              <span>
                {from}–{to} de {totalFiltered}
              </span>
              <div className="flex items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2 text-xs transition-colors hover:bg-accent">
                    {effectiveSize} por página <ChevronDown size={10} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-24">
                    {(serverPagination?.pageSizeOptions ?? PAGE_SIZES).map((size) => (
                      <DropdownMenuItem
                        key={size}
                        onClick={() => {
                          setPageSize(size);
                          serverPagination?.onLimitChange?.(size);
                          setClientPage(0);
                        }}
                        className={cn("text-xs", size === effectiveSize && "font-medium")}
                      >
                        {size} filas
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {(
                  [
                    { icon: ChevronsLeft, label: "Primera", disabled: !canPrev, fn: goFirst },
                    { icon: ChevronLeft, label: "Anterior", disabled: !canPrev, fn: goPrev },
                    { icon: ChevronRight, label: "Siguiente", disabled: !canNext, fn: goNext },
                    { icon: ChevronsRight, label: "Última", disabled: !canNext, fn: goLast },
                  ] as const
                ).map(({ icon: Icon, label, disabled, fn }) => (
                  <Tooltip key={label}>
                    <TooltipTrigger
                      className={cn(buttonVariants({ variant: "outline", size: "icon" }), "h-7 w-7")}
                      disabled={disabled}
                      onClick={fn}
                    >
                      <Icon size={12} />
                    </TooltipTrigger>
                    <TooltipContent>{label}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>
          );
        })()}
    </div>
  );
}
