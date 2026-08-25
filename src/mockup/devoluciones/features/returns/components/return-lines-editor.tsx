import { useMemo } from "react";
import { Package, Trash2 } from "lucide-react";
import type { ReturnLine } from "../../../types";
import { RETURN_LOT_LABELS, RETURN_REASON_LABELS } from "../../../types";
import { lineAmount } from "../../../lib/order-math";
import { primarySourceOf } from "../../../lib/return-workflow";
import { Button } from "@/components/ui/button";
import { DataTable, defineColumns } from "../../../components/data-table";
import { amount, formatDay } from "../../../lib/format";
import { PhotoStack } from "../../../components/common/photo-viewer";

interface ReturnLinesEditorProps {
  lines: ReturnLine[];
  onRemove: (index: number) => void;
}

/**
 * The returned goods — read, not written.
 *
 * Nothing is editable here, and that is the design. A line is built and checked
 * in `ReturnLineDialog` before it ever becomes a row: its quantity was measured
 * against the client's invoices, its motive was chosen, its batch and its photo
 * were attached. So a row on this table is a **complete, eligible claim** by
 * construction, and the table's job is to show it back, not to re-validate it.
 *
 * **A line cannot be corrected — only removed and added again.** That is not a
 * missing feature, it is the consequence of where the rules live. Everything a
 * line has to satisfy is checked on the way in, one product at a time, and the
 * list of those checks is going to grow: stock, invoice window, quantity
 * already claimed, whatever the business adds next. Reopening a finished line
 * would mean re-running all of it against a draft that already counts as
 * accepted — a second door into the same data, and a second chance to walk past
 * a check. Deleting and adding again runs the gate once, the way it was built to
 * be run. So there is one action on the row, and it is the trash.
 *
 * **One row per product, and the row is the whole claim.** It used to take two —
 * a `renderSubRow` carried the observation and the photos — which doubled the
 * height of the list and put a scrollbar in front of the fourth product on a
 * laptop. A return of eight lines that has to be scrolled to be read is a return
 * whose total nobody checks. So the second row's contents moved up into columns,
 * and the columns that were not carrying their width went: the unit price (the
 * line's amount is what anyone reads, and the tariff is the sale's, not a
 * decision made here), the case quantity (returns are counted in minimum units —
 * that is what the eligibility rule speaks in), and the batch's origin, now
 * folded in beside the batch number it belongs to.
 *
 * It is a `DataTable` in `fillHeight` mode, so the body is its own scrollport and
 * the header stays pinned over it. No toolbar: the panel above already owns the
 * controls this list answers to.
 */
export function ReturnLinesEditor({ lines, onRemove }: ReturnLinesEditorProps) {
  const columns = useMemo(
    () =>
      defineColumns<ReturnLine>([
        {
          id: "code",
          header: "Cod",
          accessorKey: "code",
          size: 58,
          cell: (line) => (
            <span className="font-mono tabular-nums text-muted-foreground">{line.code}</span>
          ),
        },
        {
          id: "productName",
          header: "Producto",
          accessorKey: "productName",
          size: 190,
          cell: (line) => <span className="font-medium leading-tight">{line.productName}</span>,
        },
        {
          // Generic on purpose: the unit names change per product and are printed next to the
          // number they belong to.
          id: "qtyUnit",
          header: "Cantidad",
          accessorKey: "qtyUnit",
          size: 78,
          // Stacked, because the unit qualifies the number rather than sitting
          // beside it: the row reads "10 · bolsas" top to bottom, and the digits
          // stay on their own line where they line up with the rows above.
          cell: (line) => (
            <span className="flex flex-col leading-tight">
              <span className="font-medium tabular-nums">{line.qtyUnit}</span>
              <span className="truncate text-[10px] lowercase text-muted-foreground">
                {line.unitLabel}
              </span>
            </span>
          ),
        },
        {
          id: "reason",
          header: "Motivo",
          accessorKey: "reason",
          size: 140,
          // The classification, tinted as the structural fact it is: it is what the business
          // counts these by.
          cell: (line) => (
            <span className="inline-flex max-w-full items-center rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-sky-700 dark:text-sky-300">
              <span className="truncate">{RETURN_REASON_LABELS[line.reason]}</span>
            </span>
          ),
        },
        {
          // Origin and number in one cell: apart they were two columns saying one thing, and
          // "SC" alone answers nothing anybody asks of this table.
          id: "batch",
          header: "Lote",
          size: 128,
          enableSorting: false,
          cell: (line) => {
            const source = primarySourceOf(line);
            // No printed number, no lot. `batch` is the plant and it always has a
            // value, so testing it was testing nothing — and a reason that carries no
            // lot at all (`PRODUCTO SIN LOTE…`) still showed "SC · —", which reads as a
            // lot from Santa Cruz whose number somebody forgot.
            if (!source?.batchNumber?.trim()) {
              return <span className="text-muted-foreground">—</span>;
            }
            return (
              <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
                {source?.batch && (
                  <span
                    title={RETURN_LOT_LABELS[source.batch]}
                    className="rounded bg-muted px-1 py-px text-[10px] font-medium text-muted-foreground"
                  >
                    {source.batch}
                  </span>
                )}
                <span className="truncate font-mono tabular-nums">
                  {source?.batchNumber || "—"}
                </span>
                {/* A line split across deliveries is the exception, and this is the only hint the
                    table gives that there is more behind it. */}
                {line.sources.length > 1 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{line.sources.length - 1}
                  </span>
                )}
              </span>
            );
          },
        },
        {
          id: "dueDate",
          header: "Vencimiento",
          size: 104,
          enableSorting: false,
          cell: (line) => (
            <span className="whitespace-nowrap tabular-nums text-muted-foreground">
              {primarySourceOf(line)?.dueDate ? formatDay(primarySourceOf(line)!.dueDate!) : "—"}
            </span>
          ),
        },
        {
          // The defect in the seller's own words. It came up from the sub-row, and it is the
          // one cell here that is prose: truncated, with the whole of it on hover.
          id: "notes",
          header: "Observación",
          accessorKey: "notes",
          size: 190,
          cell: (line) => (
            <span className="block truncate text-muted-foreground" title={line.notes}>
              {line.notes || "—"}
            </span>
          ),
        },
        {
          id: "photos",
          header: "Evidencia",
          size: 92,
          enableSorting: false,
          cell: (line) => <PhotoStack photos={line.photos} />,
        },
        {
          id: "importe",
          header: "Importe",
          size: 84,
          meta: { align: "right" },
          cell: (line) => <span className="font-semibold">{amount(lineAmount(line))}</span>,
        },
        {
          id: "actions",
          header: "",
          size: 44,
          enableSorting: false,
          enableResizing: false,
          enableHiding: false,
          pin: "right",
          cell: (line, index) => (
            <div className="flex items-center justify-end">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                // The row opens the line for correction, so this one must not.
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(index);
                }}
                aria-label={`Quitar ${line.productName}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ),
        },
      ]),
    [onRemove],
  );

  // Empty is its own state, not an empty grid: with nothing loaded the columns have nothing to
  // explain, and the panel is asking for a first product rather than showing a list of none.
  if (lines.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 px-4 text-center">
        <Package className="h-7 w-7 text-muted-foreground" />
        <p className="text-sm font-medium">Todavía no hay productos</p>
        <p className="text-xs text-muted-foreground">
          Agregá los productos que el cliente devuelve. Cada uno se valida contra sus facturas.
        </p>
      </div>
    );
  }

  return (
    <DataTable
      tableId="return-lines-editor"
      columns={columns}
      data={lines}
      getRowId={(line) => line.productId}
      hideToolbar
      fillHeight
      stickyHeader
    />
  );
}
