import type { Return, WorkflowAction } from "../../../types";
import { WorkflowTimeline } from "../../../components/common/workflow-timeline";
import { lineMinUnits } from "../../../lib/order-math";
import { cn } from "../../../lib/utils";

/**
 * The approval trail of a return, with the per-item rulings attached.
 *
 * The engine's trail records that somebody approved and what the total became;
 * *which products* were cut lives on the lines themselves, stamped with who
 * ruled on them. Joining the two here is what turns "aprobó, Bs 2.500 → Bs 900"
 * into an answer to the only question an audit really asks: what exactly did
 * they approve.
 *
 * The rows are attached only to the action that moved the amount, because that
 * is the only action the item decisions belong to — every other signature left
 * the products untouched.
 */
export function ReturnTimeline({ ret }: { ret: Return }) {
  if (!ret.workflow) return null;

  const renderActionDetail = (action: WorkflowAction) => {
    const movedAmount = action.amountBefore !== null && action.amountAfter !== null;
    if (!movedAmount) return null;

    const decided = ret.lines.filter((line) => line.itemStatus !== "PENDING");
    if (decided.length === 0) return null;

    /**
     * Whatever changed comes first.
     *
     * The list is truncated, and a truncation that hides the rejections behind
     * six untouched products answers the opposite of the question being asked.
     * A product approved in full is the expected outcome; the cuts are the news.
     */
    const weight = (line: (typeof decided)[number]) =>
      line.itemStatus === "REJECTED" ? 0 : (line.approvedMinUnits ?? 0) < lineMinUnits(line) ? 1 : 2;
    const ordered = [...decided].sort((a, b) => weight(a) - weight(b));

    const shown = ordered.slice(0, 6);
    const rest = ordered.length - shown.length;

    return (
      <div className="space-y-1 border-t pt-1.5">
        <p className="text-muted-foreground">Ítems afectados</p>
        <ul className="space-y-0.5">
          {shown.map((line) => {
            const claimed = lineMinUnits(line);
            const granted = line.approvedMinUnits ?? 0;
            const rejected = line.itemStatus === "REJECTED";
            const cut = !rejected && granted < claimed;

            return (
              <li key={line.productId} className="flex flex-wrap items-baseline gap-x-2">
                <span className="min-w-0 flex-1 truncate">{line.productName}</span>
                <span
                  className={cn(
                    "tabular-nums",
                    rejected ? "text-destructive" : cut ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
                  )}
                >
                  {rejected ? (
                    <>rechazado: {line.rejectReason ?? "sin motivo"}</>
                  ) : cut ? (
                    <>
                      {claimed} → {granted} {line.unitLabel}
                    </>
                  ) : (
                    // Nothing moved: an arrow from a number to itself reads as a
                    // change that did not happen.
                    <>
                      {granted} {line.unitLabel} · completo
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        {rest > 0 && <p className="text-muted-foreground">… {rest} más</p>}
      </div>
    );
  };

  return (
    <WorkflowTimeline
      instance={ret.workflow}
      pastInstances={ret.pastWorkflows}
      renderActionDetail={renderActionDetail}
    />
  );
}
