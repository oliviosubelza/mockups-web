// LOS ÍTEMS DE UNA DEVOLUCIÓN — `RefundOrderDetail`, una fila por producto.
//
// UNA SOLA TABLA PARA LAS DOS LECTURAS. Antes eran dos componentes distintos: un `<table>` escrito a
// mano para el aprobador y un DataTable de solo lectura para todos los demás. Mismos datos, mismas
// preguntas, dos implementaciones que se desincronizaban solas — la editable no ordenaba, no
// exportaba y no tenía estado persistido, porque nada de eso venía gratis escribiendo el `<table>`.
//
// Acá hay una sola, sobre el DataTable compartido: `decidiendo` cambia QUÉ columnas se arman, no qué
// componente se monta. Lo que se decide (`approved_quantity`, `item_status`, `reject_reason`) son
// columnas más; el desglose de orígenes y la observación del vendedor viven en la fila expandida,
// que es donde no le roban ancho a lo que se lee en cada fila.
//
// EL CERO NO ES UNA CANTIDAD, ES UN RECHAZO. Escribir 0 en «Aprobar» pasa la fila a `REJECTED` y le
// pide motivo. La base rechaza una aprobación de nada, así que una pantalla que lo aceptara solo
// estaría postergando el error.
import { useMemo } from "react";
import type { ReturnLine } from "../../../types";
import { RETURN_ITEM_REJECT_REASONS, RETURN_LOT_LABELS, RETURN_REASON_LABELS } from "../../../types";
import { lineAmount, lineMinUnits } from "../../../lib/order-math";
import { primarySourceOf } from "../../../lib/return-workflow";
import { DataTable, defineColumns } from "@/components/data-table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "../../../lib/utils";
import { amount, formatDay } from "../../../lib/format";
import { PhotoStack } from "../../../components/common/photo-viewer";
import { ItemSourcesBreakdown } from "./item-sources-breakdown";

/** La respuesta que el aprobador está escribiendo para un producto, antes de confirmarla. */
export interface ItemDraft {
  status: "APPROVED" | "REJECTED";
  /** Unidades mínimas que se están otorgando. Solo tiene sentido con `status` en APPROVED. */
  approvedMinUnits: number;
  rejectReason: string;
}

/**
 * Cuánto del reclamo sobrevivió, como barra.
 *
 * El número solo no se escanea: sobre veintisiete filas nadie lee "12 de 30" veintisiete veces. La
 * barra contesta "cuánto se recortó" de un vistazo y el número queda para quien necesite la cifra.
 */
function CutBar({ granted, claimed }: { granted: number; claimed: number }) {
  const share = claimed === 0 ? 0 : Math.max(0, Math.min(1, granted / claimed));
  return (
    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn(
          "h-full rounded-full transition-all",
          share === 0 ? "bg-destructive" : share < 1 ? "bg-amber-500" : "bg-emerald-500",
        )}
        style={{ width: `${share * 100}%` }}
      />
    </div>
  );
}

const ESTADO_PILL = {
  full: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  partial: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  rejected: "bg-destructive/10 text-destructive",
} as const;

/** El `item_status` resultante de la fila, ya sea el guardado o el que se está escribiendo. */
function pillFor(line: ReturnLine, draft: ItemDraft | undefined) {
  const claimed = lineMinUnits(line);
  const rejected = draft ? draft.status === "REJECTED" : line.itemStatus === "REJECTED";
  const granted = rejected ? 0 : (draft?.approvedMinUnits ?? line.approvedMinUnits ?? claimed);
  if (rejected) return { tone: ESTADO_PILL.rejected, label: "Rechazado", granted: 0, claimed };
  if (granted < claimed)
    return { tone: ESTADO_PILL.partial, label: `Parcial · ${granted} de ${claimed}`, granted, claimed };
  return { tone: ESTADO_PILL.full, label: "Aprobado completo", granted, claimed };
}

/** El lote y su vencimiento, o un guion. Se lee del primer origen: el resto está en la expandida. */
function LoteCell({ line }: { line: ReturnLine }) {
  const source = primarySourceOf(line);
  if (!source?.batchNumber?.trim()) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className="flex min-w-0 items-center gap-1.5 whitespace-nowrap"
      title={source.dueDate ? `Vence ${formatDay(source.dueDate)}` : undefined}
    >
      {source.batch && (
        <span
          title={RETURN_LOT_LABELS[source.batch]}
          className="rounded bg-muted px-1 py-px text-[10px] font-medium text-muted-foreground"
        >
          {source.batch}
        </span>
      )}
      <span className="truncate font-mono tabular-nums">{source.batchNumber}</span>
    </span>
  );
}

export function ReturnItemsTable({
  lines,
  decidiendo,
  drafts,
  seleccionados,
  onDraftChange,
  onSelectionChange,
}: {
  lines: ReturnLine[];
  /** Con `false` la tabla es la misma, sin las columnas que se escriben. */
  decidiendo: boolean;
  drafts: Map<string, ItemDraft>;
  seleccionados: Set<string>;
  onDraftChange: (productId: string, patch: Partial<ItemDraft>) => void;
  onSelectionChange: (productIds: Set<string>) => void;
}) {
  const columns = useMemo(
    () =>
      defineColumns<ReturnLine>([
        {
          id: "producto",
          header: "Producto",
          accessorKey: "productName",
          size: 250,
          pin: "left",
          cell: (line) => {
            const pill = pillFor(line, drafts.get(line.productId));
            return (
              <div className="min-w-0 py-0.5">
                <div className="truncate font-medium leading-tight">{line.productName}</div>
                <div className="truncate text-[10px] tabular-nums text-muted-foreground">
                  {line.code} · {amount(line.priceUnit)} × {line.unitLabel}
                </div>
                {/* El estado del ítem viaja pegado al nombre y no en columna propia: es el resultado
                    de las otras dos celdas, no un dato independiente que se ordene aparte. */}
                <span
                  className={cn(
                    "mt-1 inline-block rounded px-1.5 py-px text-[10px] font-medium",
                    pill.tone,
                  )}
                >
                  {pill.label}
                </span>
              </div>
            );
          },
        },
        {
          id: "solicitado",
          header: "Solicitado",
          accessorKey: "qtyUnit",
          size: 110,
          meta: { align: "right" },
          cell: (line) => (
            <span className="whitespace-nowrap tabular-nums">
              {lineMinUnits(line)}{" "}
              <span className="text-[10px] lowercase text-muted-foreground">{line.unitLabel}</span>
            </span>
          ),
        },
        // `approved_quantity`. Editable solo cuando te toca decidir; si no, es un número más.
        ...(decidiendo
          ? [
              {
                id: "aprobar" as const,
                header: "Aprobar",
                size: 120,
                enableSorting: false,
                cell: (line: ReturnLine) => {
                  const claimed = lineMinUnits(line);
                  const draft = drafts.get(line.productId);
                  const granted = !draft || draft.status === "REJECTED" ? 0 : draft.approvedMinUnits;
                  return (
                    <div>
                      <Input
                        type="number"
                        min={0}
                        max={claimed}
                        value={granted}
                        // Como en la grilla de pedidos: una celda numérica dentro de una tabla no
                        // ofrece valores recordados. El desplegable tapa las filas de abajo y se
                        // come las flechas del teclado.
                        autoComplete="off"
                        aria-label={`Cantidad aprobada de ${line.productName}`}
                        onChange={(e) => {
                          const raw = Number(e.target.value);
                          const next = Number.isNaN(raw) ? 0 : Math.max(0, Math.min(raw, claimed));
                          onDraftChange(line.productId, {
                            approvedMinUnits: next,
                            status: next === 0 ? "REJECTED" : "APPROVED",
                          });
                        }}
                        className="h-8 text-center tabular-nums"
                      />
                      <CutBar granted={granted} claimed={claimed} />
                    </div>
                  );
                },
              },
            ]
          : [
              {
                id: "aprobado" as const,
                header: "Aprobado",
                accessorKey: "approvedMinUnits" as const,
                size: 110,
                meta: { align: "right" as const },
                cell: (line: ReturnLine) =>
                  line.itemStatus === "PENDING" ? (
                    <span className="text-muted-foreground">pendiente</span>
                  ) : line.itemStatus === "REJECTED" ? (
                    <span className="text-destructive">rechazado</span>
                  ) : (
                    <span className="whitespace-nowrap tabular-nums">
                      {line.approvedMinUnits ?? 0}{" "}
                      <span className="text-[10px] lowercase text-muted-foreground">
                        {line.unitLabel}
                      </span>
                    </span>
                  ),
              },
            ]),
        {
          id: "motivo",
          header: "Motivo",
          accessorKey: "reason",
          size: 180,
          cell: (line) => (
            <span className="inline-flex max-w-full items-center rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-sky-700 dark:text-sky-300">
              <span className="truncate">{RETURN_REASON_LABELS[line.reason]}</span>
            </span>
          ),
        },
        {
          id: "lote",
          header: "Lote",
          size: 140,
          enableSorting: false,
          cell: (line) => <LoteCell line={line} />,
        },
        {
          id: "factura",
          header: "Factura",
          size: 130,
          enableSorting: false,
          cell: (line) => {
            const source = primarySourceOf(line);
            return (
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate font-mono text-[11px] tabular-nums">
                  {source?.invoiceNumber ?? "sin factura"}
                </span>
                {line.sources.length > 1 && (
                  <span className="text-[10px] text-muted-foreground">
                    {line.sources.length} orígenes
                  </span>
                )}
              </span>
            );
          },
        },
        {
          id: "fotos",
          header: "Evidencia",
          size: 90,
          enableSorting: false,
          meta: { align: "center" },
          cell: (line) => <PhotoStack photos={line.photos} />,
        },
        {
          id: "importe",
          header: "Importe",
          size: 120,
          enableSorting: false,
          meta: { align: "right" },
          cell: (line) => {
            const pill = pillFor(line, drafts.get(line.productId));
            const claimedAmount = lineAmount(line);
            const grantedAmount = pill.granted * line.priceUnit;
            return (
              <span className="flex flex-col items-end leading-tight">
                <span className="font-semibold tabular-nums">{amount(grantedAmount)}</span>
                {pill.granted < pill.claimed && (
                  <span className="text-[10px] tabular-nums text-muted-foreground line-through">
                    {amount(claimedAmount)}
                  </span>
                )}
              </span>
            );
          },
        },
      ]),
    [decidiendo, drafts, onDraftChange],
  );

  return (
    <DataTable
      // `tableId` distinto por modo: las columnas no son las mismas, y compartir el id haría que el
      // ancho guardado de «Aprobar» se le aplicara a «Aprobado» y al revés.
      tableId={decidiendo ? "mockup-devolucion-items-decision" : "mockup-devolucion-items"}
      columns={columns}
      data={lines}
      getRowId={(line) => line.productId}
      selectable={decidiendo}
      defaultSelectedIds={[...seleccionados]}
      onSelectionChange={(rows) => onSelectionChange(new Set(rows.map((r) => r.productId)))}
      expandable
      renderExpanded={(line) => {
        const draft = drafts.get(line.productId);
        return (
          <div className="space-y-2">
            <ItemSourcesBreakdown line={line} />

            {line.notes && (
              <p className="rounded-md bg-background px-2 py-1.5 text-[11px]">
                <span className="text-muted-foreground">Observación del vendedor: </span>
                {line.notes}
              </p>
            )}

            {/* `reject_reason`. Se ofrece una lista pero no se fuerza: la columna es texto libre en el
                modelo, y un aprobador que no puede escribir el motivo real termina eligiendo el más
                parecido, que es peor que una frase que nadie puede totalizar. */}
            {decidiendo && draft?.status === "REJECTED" && (
              <div className="space-y-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-destructive">
                  Motivo del rechazo *
                </label>
                <Select
                  value={
                    RETURN_ITEM_REJECT_REASONS.includes(draft.rejectReason)
                      ? draft.rejectReason
                      : "otro"
                  }
                  // El Select de este kit entrega `string | null` (Base UI). `null` es "se limpió",
                  // que acá se lee igual que "otro": todavía sin motivo escrito.
                  onValueChange={(v) =>
                    onDraftChange(line.productId, {
                      rejectReason: v === "otro" || v === null ? "" : v,
                    })
                  }
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Elegí el motivo…">
                      {(value) => (value === "otro" ? "Otro motivo…" : String(value))}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {RETURN_ITEM_REJECT_REASONS.map((reason) => (
                      <SelectItem key={reason} value={reason}>
                        {reason}
                      </SelectItem>
                    ))}
                    <SelectItem value="otro">Otro motivo…</SelectItem>
                  </SelectContent>
                </Select>
                {!RETURN_ITEM_REJECT_REASONS.includes(draft.rejectReason) && (
                  <Input
                    value={draft.rejectReason}
                    onChange={(e) => onDraftChange(line.productId, { rejectReason: e.target.value })}
                    placeholder="Escribí el motivo: es lo que lee el vendedor"
                    maxLength={255}
                    className={cn("h-8", !draft.rejectReason.trim() && "border-destructive/50")}
                  />
                )}
              </div>
            )}

            {/* Ya decidido y guardado: el motivo es un hecho del documento, no un campo. */}
            {!decidiendo && line.itemStatus === "REJECTED" && (
              <p className="rounded-md bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive">
                <span className="font-medium">Rechazado: </span>
                {line.rejectReason ?? "sin motivo registrado"}
                {line.decisionByName && (
                  <span className="text-muted-foreground"> · {line.decisionByName}</span>
                )}
              </p>
            )}
          </div>
        );
      }}
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
