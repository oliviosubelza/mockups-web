import { useMemo } from "react";
import { Package } from "lucide-react";
import type { ReturnLine } from "../../../types";
import { RETURN_LOT_LABELS, RETURN_REASON_LABELS } from "../../../types";
import { lineAmount, lineMinUnits } from "../../../lib/order-math";
import { primarySourceOf } from "../../../lib/return-workflow";
import { DataTable, defineColumns } from "../../../components/data-table";
import { amount, formatDay } from "../../../lib/format";
import { PhotoStack } from "../../../components/common/photo-viewer";
import { Input } from "@/components/ui/input";

interface ReturnReopenEditorProps {
  lines: ReturnLine[];
  /** What each line claimed before this edit started — the ceiling `qtyUnit` cannot cross. */
  originalLines: ReturnLine[];
  onQtyChange: (productId: string, qtyUnit: number) => void;
}

/**
 * The one screen where a return's lines get touched in place, and the only
 * thing on it that can move is a quantity going down.
 *
 * `ReturnLinesEditor` documents why a line is otherwise add-or-remove only: the
 * eligibility gate has to run once, at the moment a product arrives. Reopening
 * a rejected return does not run that gate again — nothing new is being
 * claimed, only less of what already passed it — which is exactly why this is
 * a second component and not a mode bolted onto that one. No trash column, no
 * "agregar producto": the set of products is fixed the moment this screen
 * opens, and the quantity is the only field on it.
 */
export function ReturnReopenEditor({ lines, originalLines, onQtyChange }: ReturnReopenEditorProps) {
  const ceilingOf = useMemo(() => {
    const byProduct = new Map(originalLines.map((line) => [line.productId, lineMinUnits(line)]));
    return (productId: string) => byProduct.get(productId) ?? 0;
  }, [originalLines]);

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
          id: "qtyUnit",
          header: "Cantidad",
          accessorKey: "qtyUnit",
          size: 130,
          cell: (line) => {
            const ceiling = ceilingOf(line.productId);
            return (
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={1}
                  max={ceiling}
                  step={1}
                  value={line.qtyUnit}
                  onChange={(e) => {
                    const raw = Math.floor(Number(e.target.value) || 0);
                    onQtyChange(line.productId, Math.min(Math.max(raw, 0), ceiling));
                  }}
                  className="h-7 w-16 text-right tabular-nums"
                />
                <span className="truncate text-[10px] lowercase text-muted-foreground">
                  {line.unitLabel} / {ceiling}
                </span>
              </div>
            );
          },
        },
        {
          id: "reason",
          header: "Motivo",
          accessorKey: "reason",
          size: 140,
          cell: (line) => (
            <span className="inline-flex max-w-full items-center rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-sky-700 dark:text-sky-300">
              <span className="truncate">{RETURN_REASON_LABELS[line.reason]}</span>
            </span>
          ),
        },
        {
          id: "batch",
          header: "Lote",
          size: 128,
          enableSorting: false,
          cell: (line) => {
            const source = primarySourceOf(line);
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
                <span className="truncate font-mono tabular-nums">{source?.batchNumber || "—"}</span>
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
      ]),
    [ceilingOf],
  );

  if (lines.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 px-4 text-center">
        <Package className="h-7 w-7 text-muted-foreground" />
        <p className="text-sm font-medium">No hay productos que editar</p>
      </div>
    );
  }

  return (
    <DataTable
      tableId="return-reopen-editor"
      columns={columns}
      data={lines}
      getRowId={(line) => line.productId}
      hideToolbar
      fillHeight
      stickyHeader
    />
  );
}
