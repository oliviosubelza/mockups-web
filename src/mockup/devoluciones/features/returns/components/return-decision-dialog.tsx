import { useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "../../../lib/utils";

interface ReturnDecisionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decision: "aprobado" | "rechazado";
  /** Name of the level being signed — it is what the signature is stamped as. */
  levelName: string;
  /**
   * The level that follows, when approving hands the return on instead of
   * closing it. `null` means this signature ends the flow.
   */
  nextLevelName: string | null;
  /**
   * What rejecting does here, read from the level's own setting. A rejection
   * that hands the return back to the seller and one that kills it are not the
   * same news, and the approver has to know which button they are pressing.
   */
  rejectSendsBack: boolean;
  loading: boolean;
  onConfirm: (comment: string) => void;
}

/** A rejection with no reason is not a decision, it is a dead end for the seller. */
const MIN_REJECTION_COMMENT = 10;

/**
 * Sign a return: approve it or reject it, with the reason attached.
 *
 * A dialog of its own rather than the shared `ConfirmDialog` because a decision
 * carries a comment, and the comment is the part that matters — it is what the
 * seller reads to know what to fix, and what an audit reads to know why.
 *
 * The asymmetry is deliberate: approving may leave the comment empty, rejecting
 * may not. Approving needs no explanation because the return itself is the
 * explanation; rejecting sends someone back to work without telling them what
 * to change, which is the one outcome this screen must not allow.
 */
export function ReturnDecisionDialog({
  open,
  onOpenChange,
  decision,
  levelName,
  nextLevelName,
  rejectSendsBack,
  loading,
  onConfirm,
}: ReturnDecisionDialogProps) {
  const [comment, setComment] = useState("");

  // A comment written for a decision that was dismissed must not reappear on
  // the next one — it would be signed under a different answer.
  useEffect(() => {
    if (open) setComment("");
  }, [open, decision]);

  const rejecting = decision === "rechazado";
  const tooShort = rejecting && comment.trim().length < MIN_REJECTION_COMMENT;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                rejecting
                  ? "bg-destructive/10 text-destructive"
                  : "bg-emerald-500/10 text-emerald-600",
              )}
            >
              {rejecting ? <X className="h-5 w-5" /> : <Check className="h-5 w-5" />}
            </span>
            <div className="space-y-1 text-left">
              <DialogTitle>
                {rejecting ? "Rechazar la devolución" : "Aprobar la devolución"}
              </DialogTitle>
              <DialogDescription>
                {rejecting
                  ? rejectSendsBack
                    ? "La devolución vuelve al vendedor para que la corrija. Solo puede corregirla una vez, y el flujo empieza de nuevo."
                    : "La devolución queda cerrada. Este nivel termina el flujo al rechazar."
                  : nextLevelName
                    ? `La devolución pasa a ${nextLevelName}, que es el siguiente nivel del flujo.`
                    : "Es la última firma del flujo: la devolución queda resuelta y se habilita la reposición."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="decisionComment">
            {rejecting ? "Motivo del rechazo" : "Comentario (opcional)"}
          </Label>
          <textarea
            id="decisionComment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={300}
            rows={3}
            placeholder={
              rejecting
                ? "Qué falta o qué está mal, para que el vendedor sepa qué corregir"
                : "Algo que quieras dejar asentado en el historial"
            }
            className="block w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            Queda firmado en el nivel {levelName}.
            {rejecting && tooShort && " Escribí al menos 10 caracteres."}
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant={rejecting ? "destructive" : "default"}
            disabled={loading || tooShort}
            onClick={() => onConfirm(comment)}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Registrando…
              </>
            ) : rejecting ? (
              <>
                <X className="h-4 w-4" /> Rechazar
              </>
            ) : (
              <>
                <Check className="h-4 w-4" /> Aprobar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
