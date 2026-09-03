import { useMemo } from "react";
import type { ReturnLine } from "../../../types";
import { RETURN_LOT_LABELS, RETURN_REASON_LABELS } from "../../../types";
import { lineAmount, lineMinUnits } from "../../../lib/order-math";
import { primarySourceOf } from "../../../lib/return-workflow";
import { DataTable, defineColumns } from "@/components/data-table";
import { Checkbox } from "@/components/ui/checkbox";
import { amount, formatDay } from "../../../lib/format";
import { ReturnLineActionsCell } from "./return-line-actions";

/** El motivo que se guarda cuando el aprobador destilda un ítem */
const NO_SELECCIONADO = "Ítem no seleccionado por el aprobador.";

/** La respuesta que el aprobador está escribiendo para un producto, antes de confirmarla. */
export interface ItemDraft {
  status: "APPROVED" | "REJECTED";
  approvedMinUnits: number;
  rejectReason: string;
}

/** El lote y su vencimiento, o un guion. */
function LoteCell({ line }: { line: ReturnLine }) {
  const source = primarySourceOf(line);
  if (
    !source?.batchNumber?.trim() ||
    source.batch === "IMPORTADO" ||
    source.batchNumber.toUpperCase().includes("IMPORTADO")
  ) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
      {source.batch && (
        <span title={RETURN_LOT_LABELS[source.batch]} className="text-muted-foreground">
          {source.batch} ·
        </span>
      )}
      <span className="truncate font-mono tabular-nums">{source.batchNumber}</span>
    </span>
  );
}

export function ReturnItemsTable({
  lines,
  clientId,
  decidiendo,
  canSelectItems = false,
  drafts,
  onDraftChange,
  returnCreatedAt,
}: {
  lines: ReturnLine[];
  clientId: string;
  decidiendo: boolean;
  canSelectItems?: boolean;
  drafts: Map<string, ItemDraft>;
  onDraftChange: (productId: string, patch: Partial<ItemDraft>) => void;
  returnCreatedAt?: string;
}) {
  const columns = useMemo(
    () =>
      defineColumns<ReturnLine>([
        // Solo el Nivel 1 (Analista) tiene la columna de selección "Aprobar"
        ...(canSelectItems
          ? [
              {
                id: "aprobar" as const,
                header: "Aprobar",
                size: 60,
                enableSorting: false,
                meta: { align: "center" as const },
                cell: (line: ReturnLine) => {
                  const draft = drafts.get(line.productId);
                  const checked = draft?.status === "APPROVED";
                  return (
                    <Checkbox
                      checked={checked}
                      aria-label={`Aprobar ${line.productName}`}
                      onCheckedChange={(value) => {
                        const next = value === true;
                        onDraftChange(
                          line.productId,
                          next
                            ? { status: "APPROVED", approvedMinUnits: lineMinUnits(line), rejectReason: "" }
                            : { status: "REJECTED", approvedMinUnits: 0, rejectReason: NO_SELECCIONADO },
                        );
                      }}
                    />
                  );
                },
              },
            ]
          : []),
        {
          id: "codigo",
          header: "Código SAP",
          accessorKey: "code",
          size: 85,
          cell: (line) => <span className="font-mono tabular-nums text-muted-foreground text-xs">{line.code}</span>,
        },
        {
          id: "nombre",
          header: "Nombre",
          accessorKey: "productName",
          size: 190,
          pin: "left",
          cell: (line) => (
            <div className="min-w-0 py-0.5">
              <div className="truncate font-medium leading-tight">{line.productName}</div>
              <div className="truncate text-[10px] tabular-nums text-muted-foreground">
                {amount(line.priceUnit)} × {line.unitLabel}
              </div>
            </div>
          ),
        },
        {
          id: "cantidad",
          header: "Cantidad",
          accessorKey: "qtyCase",
          size: 75,
          meta: { align: "right" },
          cell: (line) => <span className="tabular-nums text-xs">{line.qtyCase}</span>,
        },
        {
          id: "unidadMedida",
          header: "Unidad",
          accessorKey: "caseLabel",
          size: 85,
          cell: (line) => <span className="truncate text-xs">{line.caseLabel}</span>,
        },
        {
          id: "cantidadMinima",
          header: "Cant. Mín.",
          size: 80,
          enableSorting: false,
          meta: { align: "right" },
          cell: (line) => <span className="tabular-nums text-xs">{lineMinUnits(line)}</span>,
        },
        {
          id: "unidadMedidaMinima",
          header: "U. Medida",
          size: 90,
          enableSorting: false,
          cell: (line) => <span className="truncate text-xs">{line.unitLabel}</span>,
        },
        {
          id: "total",
          header: "Total (Bs.)",
          size: 95,
          enableSorting: false,
          meta: { align: "right" },
          cell: (line) => (
            <span className="font-semibold tabular-nums text-xs">{amount(lineAmount(line))}</span>
          ),
        },
        {
          id: "motivo",
          header: "Motivo",
          accessorKey: "reason",
          size: 130,
          cell: (line) => (
            <span className="line-clamp-2 whitespace-normal leading-tight text-xs text-muted-foreground">
              {RETURN_REASON_LABELS[line.reason] ?? line.reason}
            </span>
          ),
        },
        {
          id: "observacion",
          header: "Observación",
          accessorKey: "notes",
          size: 130,
          enableSorting: false,
          cell: (line) =>
            line.notes ? (
              <span className="line-clamp-2 whitespace-normal leading-tight text-xs">{line.notes}</span>
            ) : (
              <span className="text-muted-foreground text-xs">—</span>
            ),
        },
        {
          id: "lote",
          header: "Nº Lote",
          size: 100,
          enableSorting: false,
          cell: (line) => <LoteCell line={line} />,
        },
        {
          id: "vencimiento",
          header: "Vencimiento",
          size: 95,
          enableSorting: false,
          cell: (line) => {
            const dueDate = primarySourceOf(line)?.dueDate;
            return dueDate ? (
              <span className="whitespace-nowrap tabular-nums text-xs">{formatDay(dueDate)}</span>
            ) : (
              <span className="text-muted-foreground text-xs">—</span>
            );
          },
        },
        {
          id: "codigoCliente",
          header: "Cliente",
          size: 80,
          enableSorting: false,
          cell: () => <span className="font-mono tabular-nums text-xs">{clientId}</span>,
        },
        {
          id: "actions",
          header: "",
          size: 45,
          minSize: 40,
          enableSorting: false,
          meta: { align: "center" as const },
          cell: (line: ReturnLine) => (
            <ReturnLineActionsCell line={line} returnCreatedAt={returnCreatedAt} mode="almacen" />
          ),
        },
      ]),
    [canSelectItems, drafts, onDraftChange, clientId, returnCreatedAt],
  );

  return (
    <DataTable
      tableId={canSelectItems ? "mockup-devolucion-items-decision" : "mockup-devolucion-items"}
      columns={columns}
      data={lines}
      getRowId={(line) => line.productId}
      bodyMinHeight={0}
      defaultDensity="compact"
      searchable
      searchPlaceholder="Buscar producto…"
      searchKeys={["productName", "code"]}
      exportable
      exportFilename="devolucion-items"
      emptyTitle="Sin productos"
      emptyMessage="Esta devolución no tiene líneas cargadas."
    />
  );
}
