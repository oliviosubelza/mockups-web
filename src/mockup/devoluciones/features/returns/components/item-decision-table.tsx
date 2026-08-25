import { ChevronDown, ChevronUp } from "lucide-react";
import type { ReturnLine } from "../../../types";
import { RETURN_ITEM_REJECT_REASONS, RETURN_REASON_LABELS } from "../../../types";
import { lineMinUnits } from "../../../lib/order-math";
import { primarySourceOf } from "../../../lib/return-workflow";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "../../../lib/utils";
import { amount, formatDay } from "../../../lib/format";
import { ItemSourcesBreakdown } from "./item-sources-breakdown";

/** One approver's working answer for one product, before it is confirmed. */
export interface ItemDraft {
  status: "APPROVED" | "REJECTED";
  /** Minimum units being granted. Meaningful only while `status` is APPROVED. */
  approvedMinUnits: number;
  rejectReason: string;
}

/**
 * How much of the claim survived, as a bar.
 *
 * The number alone does not scan: over twenty-seven rows nobody reads
 * "12 de 30" twenty-seven times. The bar answers "how much got cut" at a
 * glance and the number stays for whoever needs the exact figure.
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

const STATUS_PILL = {
  full: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  partial: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  rejected: "bg-destructive/10 text-destructive",
} as const;

/**
 * Decide many products without opening a modal for any of them.
 *
 * The row *is* the object: quantity, resulting state, the origin breakdown and
 * the approver's note all live in it. A dialog per product would turn a
 * twenty-seven line return into twenty-seven round trips, which is the single
 * most common way this kind of screen gets abandoned.
 *
 * Typing zero into "aprobar" does not store zero — the row becomes a rejection
 * and asks for a reason. The database refuses an approval of nothing, so a
 * screen that accepted it would only be postponing the error.
 */
export function ItemDecisionTable({
  lines,
  drafts,
  selected,
  expanded,
  onDraftChange,
  onToggleSelect,
  onToggleSelectAll,
  onToggleExpand,
}: {
  lines: ReturnLine[];
  drafts: Map<string, ItemDraft>;
  selected: Set<string>;
  expanded: Set<string>;
  onDraftChange: (productId: string, patch: Partial<ItemDraft>) => void;
  onToggleSelect: (productId: string) => void;
  onToggleSelectAll: () => void;
  onToggleExpand: (productId: string) => void;
}) {
  const allSelected = lines.length > 0 && selected.size === lines.length;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[52rem] text-xs">
        <thead>
          <tr className="border-b text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="w-9 p-2">
              <Checkbox
                checked={allSelected}
                onCheckedChange={onToggleSelectAll}
                aria-label="Seleccionar todos los productos"
              />
            </th>
            <th className="p-2 text-left font-medium">Producto</th>
            <th className="p-2 text-right font-medium">Solicitado</th>
            <th className="p-2 text-center font-medium">Aprobar</th>
            <th className="p-2 text-left font-medium">Motivo / origen</th>
            <th className="p-2 text-right font-medium">Importe</th>
            <th className="w-9 p-2" />
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const claimed = lineMinUnits(line);
            const draft = drafts.get(line.productId);
            if (!draft) return null;

            const granted = draft.status === "REJECTED" ? 0 : draft.approvedMinUnits;
            const isOpen = expanded.has(line.productId);
            const source = primarySourceOf(line);

            const pill =
              draft.status === "REJECTED"
                ? { tone: STATUS_PILL.rejected, label: "Rechazado" }
                : granted < claimed
                  ? { tone: STATUS_PILL.partial, label: `Parcial · ${granted} de ${claimed}` }
                  : { tone: STATUS_PILL.full, label: "Aprobado completo" };

            return [
              <tr key={line.productId} className="border-b-0 align-top">
                <td className="p-2">
                  <Checkbox
                    checked={selected.has(line.productId)}
                    onCheckedChange={() => onToggleSelect(line.productId)}
                    aria-label={`Seleccionar ${line.productName}`}
                  />
                </td>

                <td className="min-w-[13rem] p-2">
                  <div className="font-medium">{line.productName}</div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    {amount(line.priceUnit)} × {line.unitLabel}
                  </div>
                  <span
                    className={cn(
                      "mt-1 inline-block rounded px-1.5 py-px text-[10px] font-medium",
                      pill.tone,
                    )}
                  >
                    {pill.label}
                  </span>
                </td>

                <td className="whitespace-nowrap p-2 text-right tabular-nums">
                  {claimed}{" "}
                  <span className="text-[10px] capitalize text-muted-foreground">
                    {line.unitLabel}
                  </span>
                </td>

                <td className="w-28 p-2">
                  <Input
                    type="number"
                    min={0}
                    max={claimed}
                    value={granted}
                    // Same rule as the order grid's quantity cells: a numeric cell in
                    // a table offers no remembered values. The dropdown covers the
                    // rows under it and eats the arrow keys.
                    autoComplete="off"
                    aria-label={`Cantidad aprobada de ${line.productName}`}
                    onChange={(e) => {
                      const raw = Number(e.target.value);
                      const next = Number.isNaN(raw) ? 0 : Math.max(0, Math.min(raw, claimed));
                      // Zero is not a quantity here, it is a refusal — the model
                      // stores a rejected item with no quantity at all.
                      onDraftChange(line.productId, {
                        approvedMinUnits: next,
                        status: next === 0 ? "REJECTED" : "APPROVED",
                      });
                    }}
                    className="h-8 text-center tabular-nums"
                  />
                  <CutBar granted={granted} claimed={claimed} />
                </td>

                <td className="min-w-[12rem] p-2">
                  <div>{RETURN_REASON_LABELS[line.reason]}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {source?.invoiceNumber ?? "sin factura"}
                    {source?.batchNumber && ` · ${source.batchNumber}`}
                    {line.sources.length > 1 && ` · ${line.sources.length} orígenes`}
                  </div>
                  {source?.dueDate && (
                    <div className="text-[10px] text-muted-foreground">
                      vence {formatDay(source.dueDate)}
                    </div>
                  )}
                </td>

                <td className="whitespace-nowrap p-2 text-right">
                  <div className="font-semibold tabular-nums">
                    {amount(granted * line.priceUnit)}
                  </div>
                  {granted < claimed && (
                    <div className="text-[10px] text-muted-foreground line-through tabular-nums">
                      {amount(claimed * line.priceUnit)}
                    </div>
                  )}
                </td>

                <td className="p-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={isOpen ? "Ocultar detalle" : "Ver detalle"}
                    onClick={() => onToggleExpand(line.productId)}
                  >
                    {isOpen ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </td>

              </tr>,

              /* The expanded body is a row of its own rather than a modal: it
                 keeps the product in place while its evidence is read. */
              <tr key={`${line.productId}-detail`} className="border-b">
                {isOpen && (
                  <td colSpan={7} className="p-0">
                    <div className="space-y-2 border-t bg-muted/20 px-3 py-2.5">
                      <ItemSourcesBreakdown line={line} />

                      {line.notes && (
                        <p className="rounded-md bg-background px-2 py-1.5 text-[11px]">
                          <span className="text-muted-foreground">Observación del vendedor: </span>
                          {line.notes}
                        </p>
                      )}

                      {draft.status === "REJECTED" && (
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
                            // El Select de este kit entrega `string | null` (Base UI); el original
                            // era Radix y entregaba `string`. `null` es "se limpió", que acá se lee
                            // igual que "otro": sin motivo escrito todavía.
                            onValueChange={(v) =>
                              onDraftChange(line.productId, {
                                rejectReason: v === "otro" || v === null ? "" : v,
                              })
                            }
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="Elegí el motivo…" />
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
                              onChange={(e) =>
                                onDraftChange(line.productId, { rejectReason: e.target.value })
                              }
                              placeholder="Escribí el motivo: es lo que lee el vendedor"
                              maxLength={255}
                              className={cn(
                                "h-8",
                                !draft.rejectReason.trim() && "border-destructive/50",
                              )}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                )}
              </tr>,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
