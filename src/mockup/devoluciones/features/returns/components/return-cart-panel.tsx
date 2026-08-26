import { useState } from "react";
import { AlertTriangle, Check, Loader2, PackageX, Plus } from "lucide-react";
import type { ReturnLine } from "../../../types";
import { subtotalOf } from "../../../lib/order-math";
import { useReturnableProducts } from "../../../hooks/use-returns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "../../../lib/utils";
import { bs } from "../../../lib/format";
import { shrinkSources } from "../../../lib/return-workflow";
import { ReturnLinesEditor } from "./return-lines-editor";
import { ReturnLineDialog } from "./return-line-dialog";
import { ReturnReopenEditor } from "./return-reopen-editor";

interface ReturnCartPanelProps {
  lines: ReturnLine[];
  onLinesChange: (lines: ReturnLine[]) => void;
  /**
   * The client the goods come back from. It gates the whole detail: what may be
   * returned is decided by *his* invoices, so there is nothing to add until it
   * is chosen.
   */
  clientId: string;
  /** The return being corrected — its own lines do not count as quantity spent. */
  excludeReturnId?: number;
  /**
   * `"full"` (the default) is the alta screen: add, remove, and every field the
   * eligibility gate checks. `"reopen"` is what a rejected return gets back:
   * no adding, no removing, only reducing a quantity — see `ReturnReopenEditor`
   * for why that is a different component and not a flag on this one's table.
   */
  mode?: "full" | "reopen";
  /** Required when `mode` is `"reopen"`: the ceiling each line's quantity cannot cross. */
  originalLines?: ReturnLine[];
  confirming: boolean;
  /** Text of the confirm button — creating and correcting are not the same act. */
  confirmLabel: string;
  /** Why the header is not answered yet, if it isn't. */
  headerBlockedReason: string | null;
  onConfirm: () => void;
}

/**
 * The return's detail: what is coming back, what it is worth, and the action
 * that submits it.
 *
 * A fixed frame with one scrolling middle — heading and picker on top, lines in
 * the middle, totals pinned at the bottom — so adding the twentieth product
 * never pushes the total off screen. The same frame as the order's cart, on
 * purpose: a seller who registers orders every day should not have to learn a
 * second screen to register a return.
 *
 * What it adds is a gate an order does not need. Products are not dropped onto the
 * table to be filled in later: they go through `ReturnLineDialog`, which checks
 * the quantity against the client's invoices before the line exists. So this
 * panel has almost nothing left to validate — which is the point.
 */
export function ReturnCartPanel({
  lines,
  onLinesChange,
  clientId,
  excludeReturnId,
  mode = "full",
  originalLines,
  confirming,
  confirmLabel,
  headerBlockedReason,
  onConfirm,
}: ReturnCartPanelProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const reopening = mode === "reopen";

  // The client's invoice history: asked once here, so every check the dialog
  // runs against it is instant and local.
  const { data: returnable, isFetching: loadingReturnable } = useReturnableProducts(
    clientId || undefined,
    excludeReturnId,
  );

  const openAdd = () => setDialogOpen(true);

  /**
   * A line only ever arrives; it is never rewritten in place.
   *
   * Correcting one would mean re-running the whole gate — invoice window,
   * quantity already claimed, and whatever the business adds to that list next —
   * against a draft that already counts as accepted. Removing it and adding it
   * again runs that gate once, the way it was built to be run.
   */
  const submitLine = (line: ReturnLine) => onLinesChange([...lines, line]);

  const removeLine = (index: number) => onLinesChange(lines.filter((_, i) => i !== index));

  /** Products still on the client's invoices that are not already in the detail. */
  const addableCount = returnable
    ? [...returnable.values()].filter(
        (entry) =>
          entry.availableMinUnits > 0 && !lines.some((line) => line.productId === entry.productId),
      ).length
    : 0;

  /**
   * Why there is nothing to add right now. The invoice history is the gate:
   * without a client there are no invoices, and without invoices there is
   * nothing this client is entitled to send back.
   */
  const addBlockedReason = !clientId
    ? "Elegí el cliente: lo que puede devolver lo deciden sus facturas."
    : !returnable
      ? "Buscando las facturas del cliente…"
      : addableCount === 0
        ? "No quedan productos facturados a este cliente para devolver."
        : null;

  // A return gives back exactly what was charged: no discount enters here.
  const total = subtotalOf(lines);

  // The header comes first: a perfectly filled table cannot be submitted with
  // no client, and saying so is more useful than repeating the last field.
  //
  // Nothing else is checked over the collection. Every line on the table was
  // already validated one by one on its way in, so a second pass here could only
  // ever repeat an answer the seller has already given.
  const blockedReason =
    headerBlockedReason ??
    (lines.length === 0 ? "Agregá al menos un producto para registrar la devolución." : null);
  /**
   * Lines carrying a single photo.
   *
   * A hint and not a rule. Now that the evidence is one list, nothing can tell
   * whether the batch stamp was photographed — but a claim with exactly one
   * picture is almost always the failure alone, and the missing batch shot is
   * the most common reason an approver sends a return back. Worth saying;
   * phrased as a suspicion because that is what it is.
   */
  const thinEvidence = lines.filter((line) => line.photos.length === 1).length;

  return (
    // `gap-0 py-0`: header bar, lines table and totals band are all full-bleed,
    // so the primitive's `py-4`/`gap-4` opened a strip above the header and a
    // seam between every band.
    <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0">
      {/* ---- Cabecera ---- */}
      <div className="flex shrink-0 items-center gap-3 border-b p-2.5">
        <h2 className="flex shrink-0 items-center gap-2 text-sm font-semibold">
          <PackageX className="h-4 w-4 text-muted-foreground" />
          Detalle de la devolución
        </h2>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {lines.length} {lines.length === 1 ? "producto" : "productos"}
        </span>

        {/* The one way in, and only in `"full"` mode. A product is described and
            checked before it becomes a row, so this is a button and not a
            picker: there is nothing to pick until the dialog can tell the
            seller what the invoices allow. Reopening a rejected return adds
            nothing — the set of products is fixed the moment the screen opens. */}
        {!reopening && (
          <div className="ml-auto flex min-w-0 items-center gap-2">
            {addBlockedReason && (
              <p className="truncate text-xs text-muted-foreground">{addBlockedReason}</p>
            )}
            <Tooltip>
              <TooltipTrigger render={<span tabIndex={addBlockedReason ? 0 : -1} className="shrink-0" />}>
                <>
                  <Button
                    type="button"
                    size="sm"
                    className={cn(addBlockedReason && "pointer-events-none")}
                    disabled={!!addBlockedReason}
                    onClick={openAdd}
                  >
                    <Plus className="h-4 w-4" /> Agregar producto
                  </Button>
                </>
              </TooltipTrigger>
              {addBlockedReason && (
                <TooltipContent className="max-w-72">{addBlockedReason}</TooltipContent>
              )}
            </Tooltip>
          </div>
        )}
      </div>

      {/* ---- Líneas: the only thing that scrolls in this panel ----
           The scrollport is the table's own (`fillHeight`), so this wrapper only
           hands it a bounded flex column to grow into. */}
      <div className="flex min-h-0 flex-1 flex-col">
        {reopening ? (
          <ReturnReopenEditor
            lines={lines}
            originalLines={originalLines ?? lines}
            onQtyChange={(productId, qtyUnit) =>
              onLinesChange(
                lines.map((line) =>
                  line.productId === productId
                    ? { ...line, qtyUnit, sources: shrinkSources(line.sources, qtyUnit) }
                    : line,
                ),
              )
            }
          />
        ) : (
          <ReturnLinesEditor lines={lines} onRemove={removeLine} />
        )}
      </div>

      {!reopening && (
        <ReturnLineDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          takenProductIds={lines.map((line) => line.productId)}
          returnable={returnable}
          loadingReturnable={loadingReturnable}
          onSubmit={submitLine}
        />
      )}

      {/* ---- Totales y cierre ---- */}
      <div className="shrink-0 space-y-2 border-t bg-muted/30 px-2.5 py-2">
        {/* Thin evidence does not block the submission — it is the most common
            reason an approver sends the return back, and saying so here is worth
            more than a rule that stops the seller from asking. */}
        {thinEvidence > 0 && lines.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-500">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {thinEvidence === 1
              ? "Un producto tiene una sola foto. Si falta la del lote, el aprobador no puede verificar el número."
              : `${thinEvidence} productos tienen una sola foto. Si falta la del lote, el aprobador no puede verificar el número.`}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
          {/* The same block the order form closes with — caption over amount, in
              the app's colour for money. One result, laid out one way, whichever
              document the seller happens to be writing. */}
          <div className="flex items-stretch rounded-lg border bg-card p-1.5">
            <span className="flex min-w-0 flex-col justify-center whitespace-nowrap rounded-md bg-emerald-500/15 px-3 py-0.5 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
              <span className="text-[10px] font-medium uppercase tracking-wide">
                Total a devolver
              </span>
              <span className="text-base font-bold tabular-nums">{bs(total)}</span>
            </span>
          </div>

          {/* The reason it is blocked belongs on the blocked control. A disabled
              button swallows pointer events, so the tooltip listens on the
              wrapper and the button stops intercepting. */}
          <Tooltip>
            <TooltipTrigger render={<span tabIndex={blockedReason ? 0 : -1} className="shrink-0" />}>
              <>
                <Button
                  type="button"
                  className={cn(blockedReason && "pointer-events-none")}
                  disabled={confirming || !!blockedReason}
                  onClick={onConfirm}
                >
                  {confirming ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Enviando…
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" /> {confirmLabel}
                    </>
                  )}
                </Button>
              </>
            </TooltipTrigger>
            {blockedReason && <TooltipContent className="max-w-72">{blockedReason}</TooltipContent>}
          </Tooltip>
        </div>
      </div>
    </Card>
  );
}
