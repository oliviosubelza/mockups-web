import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { ReturnItemSource, ReturnLine, ReturnReason, ReturnableProduct } from "../../../types";
import { ALL_RETURN_LOTS, ALL_RETURN_REASONS, RETURN_LOT_LABELS, RETURN_REASON_LABELS } from "../../../types";
import type { ReturnLot } from "../../../types";
import { PRODUCTS, getProduct } from "../../../data/products";
import { lineFromProduct, lineMinUnits } from "../../../lib/order-math";
import {
  RETURN_INVOICE_WINDOW_DAYS,
  minUnitsOf,
  qtyBlockedReason,
} from "../../../lib/return-eligibility";
import { Button } from "@/components/ui/button";
import { Combobox } from "../../../components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { cn } from "../../../lib/utils";
import { isHidden, rulesFor } from "../lib/return-reason-rules";
import { PhotosDropzone } from "./photo-field";

/**
 * A line being written. The motive starts unanswered — `ReturnLine.reason` is a
 * closed list with no sensible default, and defaulting it would let a seller
 * classify a return by not touching a dropdown.
 */
type DraftLine = Omit<ReturnLine, "reason"> & { reason: ReturnReason | "" };

/** Required-field marker, the same one the rest of the app uses. */
function Req() {
  return <span className="text-destructive"> *</span>;
}


/**
 * A fresh draft for a product, with the catalogue's prices and the invoiced
 * quantity frozen onto it.
 */
function draftFromProduct(productId: string, invoicedMinUnits: number): DraftLine | null {
  const product = getProduct(productId);
  if (!product) return null;
  return {
    ...lineFromProduct(product),
    reason: "",
    invoicedMinUnits,
    sources: [
      {
        id: `src_${productId}_1`,
        invoiceNumber: null,
        invoiceSapDoc: null,
        // `S` is the code most of this catalogue ships under — a default the
        // seller corrects, not a guess the form hides.
        batch: "S",
        batchNumber: "",
        dueDate: null,
        minUnits: 0,
      },
    ],
    notes: "",
    photos: [],
    itemStatus: "PENDING",
    approvedMinUnits: null,
    rejectReason: null,
    decisionByName: null,
    decisionAt: null,
  };
}

/**
 * The single origin this dialog edits.
 *
 * A line can come off several invoices and batches, and the model stores it as
 * a list for exactly that reason — but splitting one is a decision a seller
 * makes rarely, and putting a repeater in front of every product would tax the
 * common case to serve the rare one. The dialog edits origin one; the breakdown
 * editor handles the rest.
 */
const sourceOf = (draft: DraftLine): ReturnItemSource => draft.sources[0];

/** Patch the single origin without the caller having to rebuild the array. */
const patchSource = (draft: DraftLine, patch: Partial<ReturnItemSource>): Partial<DraftLine> => ({
  sources: [{ ...draft.sources[0], ...patch }, ...draft.sources.slice(1)],
});

/**
 * Change the reason, and drop whatever the new one says does not exist.
 *
 * Clearing is the point. A seller who typed a lot number and *then* classified the
 * line as `PRODUCTO SIN LOTE O SIN FECHA DE VENCIMIENTO` would otherwise submit a
 * claim that carries the very number it says is missing — the boxes would be gone from
 * the screen and the value still on the line. What is not asked is not stored.
 */
function withReason(draft: DraftLine, reason: ReturnReason): Partial<DraftLine> {
  const rules = rulesFor(reason);
  const source = sourceOf(draft);
  return {
    reason,
    sources: [
      {
        ...source,
        ...(isHidden(rules.dueDate) ? { dueDate: null } : {}),
        ...(isHidden(rules.lot) ? { batchNumber: "" } : {}),
      },
      ...draft.sources.slice(1),
    ],
  };
}

/**
 * Why this draft cannot enter the detail yet, or `null` when it can.
 *
 * This is the gate. Everything a return line has to carry is checked right here,
 * one product at a time, before it becomes a row — so a line in the table is
 * complete and eligible *by construction* and the table needs no validation of
 * its own.
 *
 * The order is the order a seller fills the dialog in, and the quantity comes
 * first because it is the only check that can fail for a reason the seller
 * cannot fix: the goods were never invoiced to this client.
 */
function draftBlockedReason(
  draft: DraftLine | null,
  returnable: ReturnableProduct | undefined,
): string | null {
  if (!draft) return "Elegí el producto que devuelve el cliente.";

  const qty = qtyBlockedReason(minUnitsOf(draft.qtyCase, draft.qtyUnit, draft.unitsPerCase), returnable);
  if (qty) return qty;

  // From here down the order is the order the fields are read on screen, so the
  // message always points at the next empty control rather than sending the
  // seller back up the dialog. The motivo comes first now because it is what decides
  // whether the two boxes under it are asked for at all.
  if (!draft.reason) return "Elegí el motivo de devolución de este producto.";

  const rules = rulesFor(draft.reason);
  const source = sourceOf(draft);
  // Only what this reason actually needs. A claim of `PRODUCTO SIN LOTE O SIN FECHA DE
  // VENCIMIENTO` refused for having no lot number would be the form refusing the very
  // thing it is being told.
  if (rules.dueDate === "required" && !source.dueDate) {
    return "Indicá la fecha de vencimiento del producto.";
  }
  if (rules.lot === "required" && !source.batchNumber?.trim()) {
    return "Indicá el número de lote impreso en el envase.";
  }
  if (draft.photos.length === 0) return "Adjuntá al menos una foto: la falla y el lote impreso.";
  if (!draft.notes.trim()) return "Escribí la observación: es lo que lee el aprobador.";
  return null;
}

interface ReturnLineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Products already in the detail — one product is one line. */
  takenProductIds: string[];
  /** What the client may send back, by product. `undefined` while it loads. */
  returnable: Map<string, ReturnableProduct> | undefined;
  loadingReturnable: boolean;
  onSubmit: (line: ReturnLine) => void;
}

/**
 * Add one product to a return. Only add — a line is never reopened.
 *
 * The whole point of this dialog is *when* it runs. A product does not land on
 * the table and get filled in afterwards: it is described and checked here, and
 * only a complete, eligible line ever reaches the detail. That is what makes the
 * quantity rule enforceable — "¿se le vendió esta cantidad?" is a question about
 * one product, so it is answered one product at a time, at the moment the seller
 * tries to add it, and not in a summary at the end that says twelve things are
 * wrong without saying which.
 *
 * It is also why there is no edit mode. This gate is going to grow — stock,
 * invoice window, quantity already claimed against other returns — and every one
 * of those checks assumes it is looking at a product arriving, not at one that
 * already counts as accepted. A seller who got a line wrong removes it and adds
 * it again, which runs the gate exactly once.
 *
 * The fields are a plain grid. Controls that all belong to the same product are
 * one question, and drawing a framed card around each said "three things" about
 * something the seller experiences as one. The evidence lost its frame for the
 * same reason: the drop zone is already a surface, and boxing a box only steals
 * room from the photos inside it.
 *
 * The one group that keeps a frame is `Información adicional`, and it earns it by
 * appearing and disappearing as a unit — the motivo decides whether those three
 * fields exist at all, so the frame is what makes that arrival legible as one
 * event instead of two boxes materialising mid-grid.
 *
 * Nothing opens red. An empty field is not a mistake, it is a field nobody has
 * reached yet, and a dialog that greets the seller with six destructive borders
 * teaches him to ignore the colour by the second product. The only red here is
 * `overQty` — a real error, a number that contradicts the invoices — plus the
 * one line at the bottom naming the next thing missing, next to the button it
 * is keeping disabled.
 */
export function ReturnLineDialog({
  open,
  onOpenChange,
  takenProductIds,
  returnable,
  loadingReturnable,
  onSubmit,
}: ReturnLineDialogProps) {
  const [draft, setDraft] = useState<DraftLine | null>(null);

  // Every opening starts from an empty sheet. Keyed on `open` so a reopened
  // dialog never shows the last product the seller added.
  useEffect(() => {
    if (open) setDraft(null);
  }, [open]);

  /**
   * Only what this client actually bought and still has quantity left on, minus
   * what is already in the detail. The picker is the first half of the rule:
   * what was never invoiced is not offered at all.
   */
  const options = useMemo(() => {
    if (!returnable) return [];
    const taken = new Set(takenProductIds);
    return PRODUCTS.filter((p) => {
      if (taken.has(p.id)) return false;
      const entry = returnable.get(p.id);
      return !!entry && entry.availableMinUnits > 0;
    }).map((p) => ({
      value: p.id,
      // No price here, on purpose. Choosing *which* product came back is not a
      // commercial decision — the tariff is the one the sale already fixed, the
      // seller cannot change it, and nothing about it helps him find the SKU he
      // is holding. It is priced the moment it is chosen, right below, and again
      // on the line: this is the one place where it would only be noise.
      label: `${p.code} · ${p.name}`,
    }));
  }, [returnable, takenProductIds]);

  const entry = draft ? returnable?.get(draft.productId) : undefined;
  const requested = draft ? minUnitsOf(draft.qtyCase, draft.qtyUnit, draft.unitsPerCase) : 0;
  const overQty = !!entry && requested > entry.availableMinUnits;
  const blockedReason = draftBlockedReason(draft, entry);
  /** The origin being edited, or `null` while no product has been chosen. */
  const source = draft ? sourceOf(draft) : null;
  // What this reason asks for. Read once here so the fields, their asterisks and the
  // note below them can never disagree about it.
  const rules = rulesFor(draft?.reason ?? "");
  /** Nothing below the picker can be answered until there is a product. */
  const noProduct = !draft;

  const patch = (changes: Partial<DraftLine>) =>
    setDraft((current) => (current ? { ...current, ...changes } : current));

  /** Quantities are whole and never negative; anything else reads as zero. */
  const setQty = (field: "qtyCase" | "qtyUnit", raw: string) =>
    patch({ [field]: Math.max(0, Math.floor(Number(raw) || 0)) } as Partial<DraftLine>);

  const pickProduct = (productId: string) => {
    const invoiced = returnable?.get(productId)?.invoicedMinUnits ?? 0;
    setDraft(draftFromProduct(productId, invoiced));
  };

  const submit = () => {
    if (!draft || blockedReason) return;
    // The cast is safe exactly because the gate above rejects an empty motive.
    // The origins have to account for exactly what the line claims. With a
    // single origin that is bookkeeping the seller should never be asked to do,
    // so the dialog does it on the way out.
    const line: ReturnLine = { ...draft, reason: draft.reason as ReturnReason };
    onSubmit({ ...line, sources: [{ ...sourceOf(draft), minUnits: lineMinUnits(line) }] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Tall on a laptop with the browser chrome eating the fold: the dialog
          scrolls inside itself rather than pushing the confirm button off. */}
      <DialogContent className="max-h-[92vh] max-w-3xl gap-3 overflow-y-auto p-4">
        <DialogHeader className="space-y-0.5">
          <DialogTitle className="text-base">Agregar producto a la devolución</DialogTitle>
          <DialogDescription className="text-xs">
            Se valida contra las facturas del cliente: solo puede devolver lo que se le vendió en
            los últimos {RETURN_INVOICE_WINDOW_DAYS} días.
          </DialogDescription>
        </DialogHeader>

        {/* The product and how much of it come back are the same sentence, so they
            share a row: the picker takes the two thirds it needs to show `código ·
            nombre`, the quantity takes the last third.

            The grid is always on screen, even with no product chosen. A dialog
            that shows one field and then grows six more the moment you answer it
            hides its own size: the seller cannot tell what is being asked until
            he is already committed. Everything is disabled until there is a
            product, which says the same thing — "first this" — without moving
            anything. */}
        <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="returnLineProduct">
              Producto<Req />
            </Label>
            <Combobox
              id="returnLineProduct"
              options={options}
              value={draft?.productId ?? ""}
              onChange={pickProduct}
              placeholder={loadingReturnable ? "Buscando facturas del cliente…" : "Buscá por código o nombre…"}
              searchPlaceholder="Código o nombre…"
              emptyText="Este cliente no tiene productos facturados disponibles para devolver."
              disabled={loadingReturnable || !returnable}
            />
          </div>

          {/* Quantity and unit are one answer, so they are one control: "3" means
              nothing until the cell beside it says *bolsas*.

              The unit lives inside the field's border rather than in a caption
              under it. It is the catalogue's answer about this SKU — the seller
              never picks it — and a line of helper text below would read as one
              more thing to fill in, while the joined cell reads as part of the
              number it qualifies. */}
          <div className="space-y-1.5">
            <Label htmlFor="returnLineQtyUnit">
              Cantidad<Req />
            </Label>
            <div
              className={cn(
                "flex h-9 items-stretch overflow-hidden rounded-md border border-input shadow-xs transition-colors focus-within:ring-2 focus-within:ring-ring",
                overQty && "border-destructive",
                noProduct && "opacity-50",
              )}
            >
              <Input
                id="returnLineQtyUnit"
                type="number"
                min={0}
                step={1}
                value={draft?.qtyUnit ?? ""}
                onChange={(e) => setQty("qtyUnit", e.target.value)}
                disabled={noProduct}
                // The border, the ring and the disabled dimming all belong to the
                // wrapper now, so the input drops its own.
                className="h-full min-w-0 border-0 text-right tabular-nums shadow-none focus-visible:ring-0 disabled:opacity-100"
              />
              <span className="flex shrink-0 items-center truncate border-l bg-muted/50 px-2.5 text-xs text-muted-foreground">
                {draft ? draft.unitLabel : "—"}
              </span>
            </div>
          </div>

          {/* The motivo comes above the package data, and that is not cosmetic: it is
              what decides whether the lot and the expiry are asked for at all. Leaving
              it below meant the seller filled two boxes and then chose a reason that
              says those boxes do not exist.

              What it changes is the group underneath, which appears and disappears
              on its own — so nothing here announces in advance that "se solicitará
              información adicional". The fields are the announcement. */}
          <div className="col-span-2 space-y-1.5">
            <Label>
              Motivo de devolución<Req />
            </Label>
            <Select
              value={draft?.reason ?? ""}
              onValueChange={(v) => draft && patch(withReason(draft, v as ReturnReason))}
              disabled={noProduct}
            >
              <SelectTrigger aria-label="Motivo de devolución">
                <SelectValue placeholder="Elegí el motivo" />
              </SelectTrigger>
              <SelectContent>
                {ALL_RETURN_REASONS.map((reason) => (
                  <SelectItem key={reason} value={reason} className="text-xs">
                    {RETURN_REASON_LABELS[reason]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ---- Información adicional: lo que pide el motivo ----

            What the motivo asks for is a group and not three loose fields at the
            bottom of the same grid: it comes and goes as a block, so it is drawn
            as a block. The containment is said with surface — a recessed
            `bg-muted/40` holding `bg-background` children — and not with a hue,
            because these three are not a different *kind* of data from the ones
            above, only a dependent level of it. */}
        {(!isHidden(rules.dueDate) || !isHidden(rules.lot)) && (
          <div className="space-y-2 rounded-lg border bg-muted/40 p-2.5">
            <p className="text-xs font-medium">
              Información adicional{" "}
              <span className="font-normal text-muted-foreground">(según el motivo)</span>
            </p>

            <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
              {!isHidden(rules.dueDate) && (
                <div className="space-y-1.5">
                  <Label htmlFor="returnLineExpiry">
                    Fecha de vencimiento
                    {rules.dueDate === "required" && <Req />}
                  </Label>
                  <Input
                    id="returnLineExpiry"
                    type="date"
                    value={source?.dueDate ?? ""}
                    onChange={(e) =>
                      draft && patch(patchSource(draft, { dueDate: e.target.value || null }))
                    }
                    disabled={noProduct}
                    className="bg-background"
                  />
                </div>
              )}

              {!isHidden(rules.lot) && (
                <>
                  <div className="space-y-1.5">
                    <Label>
                      Lote
                      {rules.lot === "required" && <Req />}
                    </Label>
                    <Select
                      value={source?.batch ?? "S"}
                      onValueChange={(v) =>
                        draft && patch(patchSource(draft, { batch: v as ReturnLot }))
                      }
                      disabled={noProduct}
                    >
                      <SelectTrigger aria-label="Lote" className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_RETURN_LOTS.map((lot) => (
                          <SelectItem key={lot} value={lot} className="text-xs">
                            {RETURN_LOT_LABELS[lot]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="returnLineLotNumber">
                      Número de lote
                      {rules.lot === "required" && <Req />}
                    </Label>
                    <Input
                      id="returnLineLotNumber"
                      value={source?.batchNumber ?? ""}
                      onChange={(e) =>
                        draft && patch(patchSource(draft, { batchNumber: e.target.value }))
                      }
                      placeholder="L-0000"
                      maxLength={20}
                      disabled={noProduct}
                      className="bg-background"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Said once, where the missing boxes were. Without it the seller is looking at
            a dialog that lost two fields and has no way to know that was the point. */}
        {(isHidden(rules.lot) || isHidden(rules.dueDate)) && (
          <p className="rounded-md border border-dashed px-2.5 py-2 text-xs leading-snug text-muted-foreground">
            Este motivo no lleva lote ni vencimiento: es lo que se está reclamando, así que
            no se piden.
          </p>
        )}

        {/* Evidence and observation are the same act — what the seller saw,
            shown and then said — so they run as two plain fields and not as a
            framed box. The frame used to be there to carry an instruction; the
            drop zone says it itself now. */}
        <div className="space-y-1.5">
          <Label>
            Imágenes de evidencia<Req />
          </Label>
          <PhotosDropzone
            photos={draft?.photos ?? []}
            onChange={(photos) => patch({ photos })}
            disabled={noProduct}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="returnLineNotes">
            Observación<Req />
          </Label>
          {/* A textarea and not an input: this is the sentence the approver
              reads before deciding, and a single scrolling line hides the half
              the seller wrote.

              The counter sits inside the box, in the corner the text runs
              towards. Above the field it was a second thing on the label line,
              competing with the label; in here it is the field measuring itself
              — which is why the padding at the bottom leaves it room instead of
              letting the last line run under it. */}
          <div className="relative">
            <textarea
              id="returnLineNotes"
              rows={3}
              maxLength={160}
              value={draft?.notes ?? ""}
              onChange={(e) => patch({ notes: e.target.value })}
              placeholder="Qué le pasa a este producto"
              disabled={noProduct}
              className="block w-full resize-none rounded-md border border-input bg-transparent px-3 pb-6 pt-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
            <span className="pointer-events-none absolute bottom-2 right-3 font-mono text-[11px] tabular-nums text-muted-foreground">
              {draft?.notes.length ?? 0}/160
            </span>
          </div>
        </div>

        {/* ---- Cierre: la razón del bloqueo va donde está el bloqueo ---- */}
        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <p
            className={cn(
              "min-w-0 flex-1 text-xs",
              blockedReason ? "font-medium text-destructive" : "text-muted-foreground",
            )}
          >
            {blockedReason ?? "Listo para agregar al detalle."}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={submit} disabled={!!blockedReason}>
              <Plus className="h-4 w-4" /> Agregar al detalle
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
