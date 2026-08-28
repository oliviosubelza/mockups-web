import type { ReturnStatus } from "../../../types";
import { RETURN_STATUS_LABELS } from "../../../types";
import { cn } from "../../../lib/utils";

/**
 * One tone per state of the return itself — never per level of the workflow.
 *
 * This badge answers "what is this claim, for the business"; where the paper
 * currently sits is the progress bar's (and `Estado Workflow`'s) job. Keeping
 * the two apart is what stops a list column from having to say "En aprobación
 * · Créditos · 1 de 2" in a pill.
 */
const STATUS_STYLES: Record<ReturnStatus, string> = {
  ABIERTO: "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  PROCESANDO: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  PROCESADO: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  CERRADO: "border-border bg-muted text-muted-foreground",
  ANULADA: "border-border bg-muted text-muted-foreground line-through",
  DEVOLUCION_DEMORADA: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
  PROCESO_ELECTRONICO: "border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  DISOCIADO: "border-orange-500/40 bg-orange-500/15 text-orange-700 dark:text-orange-400",
  REVERTIDO: "border-orange-500/40 bg-orange-500/15 text-orange-700 dark:text-orange-400",
  EDITADO: "border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-400",
};

export function ReturnStatusBadge({
  status,
  className,
}: {
  status: ReturnStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-1.5 py-px text-[9px] font-medium leading-4",
        STATUS_STYLES[status],
        className,
      )}
    >
      {RETURN_STATUS_LABELS[status]}
    </span>
  );
}
