import type { ReturnStatus } from "../../../types";
import { RETURN_STATUS_LABELS } from "../../../types";
import { cn } from "../../../lib/utils";

/**
 * One tone per state of the return itself — never per level of the workflow.
 *
 * This badge answers "what is this claim, for the business"; where the paper
 * currently sits is the progress bar's job. Keeping the two apart is what stops
 * a list column from having to say "En aprobación · Créditos · 1 de 2" in a pill.
 *
 * The granted states share the emerald family and differ in weight, because a
 * partial approval is an approval that cost the client money: reading it as a
 * third colour would put it beside "rechazada", which is not where it belongs.
 */
const STATUS_STYLES: Record<ReturnStatus, string> = {
  DRAFT: "border-border bg-muted text-muted-foreground",
  IN_APPROVAL: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  RETURNED: "border-orange-500/40 bg-orange-500/15 text-orange-700 dark:text-orange-400",
  APPROVED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  PARTIALLY_APPROVED: "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  REJECTED: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
  ANNULLED: "border-border bg-muted text-muted-foreground line-through",
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
