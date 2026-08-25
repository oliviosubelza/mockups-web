import { useEffect, useState } from "react";
import { Check, Info, Loader2, X } from "lucide-react";
import type { Return } from "../../../types";
import { ceilingOf, progressLevelsOf, signaturesMissing } from "../../../lib/workflow";
import { pendingLevelOf } from "../../../lib/return-workflow";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "../../../lib/utils";
import { bs } from "../../../lib/format";

/** A rejection with no reason is not a decision, it is a dead end for the seller. */
const MIN_REJECTION_COMMENT = 10;

/**
 * What this decision is about to do, before it does it.
 *
 * Three questions, in the order an approver asks them: how much money am I
 * approving, does this decision end the flow, and if not, who sees it next.
 *
 * The second one is the whole reason the dialog exists. A recorte is not just a
 * smaller number — once the approved amount no longer exceeds this level's
 * ceiling, this desk's signature is the last one the devolución needs and the
 * levels above it are skipped. That consequence is invisible in the grid, so it
 * is spelled out here, before the decision is taken rather than discovered after.
 */
export function DecisionImpactDialog({
  open,
  onOpenChange,
  ret,
  decision,
  claimed,
  approved,
  counts,
  loading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ret: Return;
  decision: "aprobado" | "rechazado";
  claimed: number;
  approved: number;
  counts: { total: number; approved: number; partial: number; rejected: number };
  loading: boolean;
  onConfirm: (comment: string) => void;
}) {
  const [comment, setComment] = useState("");

  // A comment written for a decision that was dismissed must not reappear on the
  // next one — it would be signed under a different answer.
  useEffect(() => {
    if (open) setComment("");
  }, [open, decision]);

  const rejecting = decision === "rechazado";
  const tooShort = rejecting && comment.trim().length < MIN_REJECTION_COMMENT;

  const level = pendingLevelOf(ret);
  const levels = ret.workflow ? progressLevelsOf(ret.workflow) : [];
  // Only a level still waiting its turn is a real "next": the ones the ladder
  // already skipped sit in between and are never visited.
  const nextLevel = level ? (levels.find((l) => l.order > level.order && l.status === "PENDING") ?? null) : null;
  const missing = level ? signaturesMissing(level) : 0;
  const closesLevel = missing <= 1;

  /**
   * Whether this decision ends the flow here.
   *
   * The same comparison the engine will make when the signature lands, run
   * against the same figure — so the sentence the approver reads is the outcome
   * they get, not an approximation of it.
   */
  const ceiling = level ? ceilingOf(levels, level.order) : null;
  const settlesHere = !rejecting && closesLevel && ceiling !== null && approved <= ceiling;
  const skipped = settlesHere ? levels.filter((l) => level && l.order > level.order && l.status === "PENDING") : [];

  const rejected = claimed - approved;
  const rejectedShare = claimed === 0 ? 0 : Math.round((rejected / claimed) * 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                rejecting ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-600",
              )}
            >
              {rejecting ? <X className="h-5 w-5" /> : <Check className="h-5 w-5" />}
            </span>
            <div className="space-y-0.5 text-left">
              <DialogTitle>
                {rejecting ? "Rechazar la devolución" : "Confirmar decisión"}
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                {level?.name} · nivel {level?.order} de{" "}
                {ret.workflow ? progressLevelsOf(ret.workflow).length : 0}
              </p>
            </div>
          </div>
        </DialogHeader>

        {!rejecting && (
          <>
            <p className="text-sm">
              Estás aprobando{" "}
              <span className="font-semibold">
                {counts.approved} de {counts.total}
              </span>{" "}
              ítems
              {counts.partial > 0 && `, ${counts.partial} con cantidad recortada`}
              {counts.rejected > 0 &&
                ` y rechazando ${counts.rejected}`}
              .
            </p>

            <dl className="space-y-1 rounded-lg border p-3 text-sm">
              <Row label="Monto solicitado" value={bs(claimed)} />
              <Row label="Monto aprobado" value={bs(approved)} strong tone="approved" />
              <Row label="Monto rechazado" value={bs(rejected)} tone="rejected" />
              {rejected > 0 && (
                <p className="border-t pt-1.5 text-xs text-muted-foreground">
                  No se aprueba el {rejectedShare} % de lo solicitado.
                </p>
              )}
            </dl>
          </>
        )}

        <div className="space-y-1.5 rounded-lg bg-muted px-3 py-2.5 text-sm">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Qué pasa después
          </p>

          {rejecting ? (
            <p>
              La devolución se cierra o vuelve al vendedor, según lo que este nivel tenga
              configurado. En cualquier caso deja de esperar tu firma.
            </p>
          ) : !closesLevel ? (
            <p>
              Falta{missing === 1 ? "" : "n"} <span className="font-medium">{missing}</span> firma
              {missing === 1 ? "" : "s"} más para cerrar este nivel. La devolución sigue acá hasta
              que alguien más apruebe.
            </p>
          ) : settlesHere ? (
            <p>
              Con este recorte la devolución{" "}
              <span className="font-medium">cierra en tu nivel</span>: {bs(approved)} no pasa de{" "}
              <span className="tabular-nums">{bs(ceiling as number)}</span>, así que queda{" "}
              <span className="font-medium">
                {approved <= 0
                  ? "rechazada"
                  : approved < claimed
                    ? "parcialmente aprobada"
                    : "aprobada"}
              </span>
              .
            </p>
          ) : nextLevel ? (
            <p>
              Con tu aprobación este nivel se cierra y la devolución{" "}
              <span className="font-medium">sigue a {nextLevel.name}</span>
              {ceiling !== null && (
                <>
                  : {bs(approved)} pasa de{" "}
                  <span className="tabular-nums">{bs(ceiling)}</span>, el tope de tu nivel
                </>
              )}
              .
            </p>
          ) : (
            <p>
              Es la última firma del flujo: la devolución queda{" "}
              <span className="font-medium">
                {approved <= 0
                  ? "rechazada"
                  : approved < claimed
                    ? "parcialmente aprobada"
                    : "aprobada"}
              </span>
              .
            </p>
          )}

          {skipped.length > 0 && (
            <p className="flex items-start gap-1.5 border-t pt-1.5 text-xs text-muted-foreground">
              <Info className="mt-px h-3 w-3 shrink-0" />
              <span>
                {skipped.length === 1 ? "El nivel" : "Los niveles"}{" "}
                {skipped.map((l) => l.name).join(", ")} no{" "}
                {skipped.length === 1 ? "llega a verla" : "llegan a verla"}: el monto no alcanza su
                tramo.
              </span>
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="impactComment">
            {rejecting ? "Motivo del rechazo" : "Observación para el histórico (opcional)"}
          </Label>
          <textarea
            id="impactComment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={300}
            rows={2}
            placeholder={
              rejecting
                ? "Qué falta o qué está mal, para que el vendedor sepa qué corregir"
                : "Algo que quieras dejar asentado"
            }
            className="block w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {rejecting && tooShort && (
            <p className="text-xs text-destructive">Escribí al menos 10 caracteres.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Volver
          </Button>
          <Button
            variant={rejecting ? "destructive" : "default"}
            disabled={loading || tooShort}
            onClick={() => onConfirm(comment)}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Registrando…
              </>
            ) : rejecting ? (
              "Rechazar devolución"
            ) : (
              "Confirmar aprobación"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "approved" | "rejected";
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "tabular-nums",
          strong && "text-base font-semibold",
          tone === "approved" && "text-emerald-700 dark:text-emerald-400",
          tone === "rejected" && "text-destructive",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
