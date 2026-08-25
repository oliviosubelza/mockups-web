import { Check, Clock, Coins, Minus, X } from "lucide-react";
import type { WorkflowInstance, WorkflowInstanceLevel } from "../../types";
import {
  amountBandLabel,
  applicableLevelsOf,
  ceilingOf,
  hoursToDeadline,
  isOverdue,
  progressLevelsOf,
  signaturesMissing,
} from "../../lib/workflow";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "../../lib/utils";
import { formatDateTime } from "../../lib/format";

/**
 * Where a document stands in its approval, level by level.
 *
 * Entity-agnostic, like the engine it draws: it counts levels rather than naming
 * desks, so a three-level return and a two-level customer render through the
 * same component. It deliberately says nothing about *what* the document is —
 * that is the status badge's job, and keeping the two apart is what stops either
 * from having to say both.
 *
 * Two sizes, because the same question is asked at two very different densities.
 * In a queue row the reader is scanning twenty documents and needs one glance:
 * how far along, and is it late. On the detail page they are reading one, and
 * every level owes them who is on it and what it is waiting for.
 *
 * Either size draws only the levels that apply to this document
 * (`applicableLevelsOf`). The ones the ladder left out are not part of this
 * approval and never will be — a desk that will never be asked is not progress
 * missing, it is a desk that is not in this flow.
 */

const DOT_STYLES: Record<WorkflowInstanceLevel["status"], string> = {
  APPROVED: "bg-emerald-500",
  REJECTED: "bg-red-500",
  RETURNED: "bg-orange-500",
  IN_PROGRESS: "bg-amber-500 ring-2 ring-amber-500/30",
  PENDING: "bg-muted-foreground/25",
  SKIPPED: "bg-muted-foreground/25",
  SUPERSEDED: "bg-muted-foreground/25",
};

/**
 * The queue-row version: one dot per level and the position, nothing else.
 *
 * A dot track rather than names because in a list the level's identity is not
 * the question — "how much of this is done" is, and three dots answer it without
 * spending a column on words that repeat down every row.
 */
function ProgressDots({ instance }: { instance: WorkflowInstance }) {
  const levels = applicableLevelsOf(instance);
  const current = levels.find((l) => l.status === "IN_PROGRESS");
  const late = current ? isOverdue(current) : false;
  // Position among the desks actually drawn, not the level's own number: with
  // the levels that never applied gone, `order` would count places nobody sees.
  const position = current ? levels.indexOf(current) + 1 : levels.length;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-1">
        {levels.map((level) => (
          <Tooltip key={level.id}>
            {/* `render` y no `asChild`: el kit de este repo es Base UI, no Radix. */}
            <TooltipTrigger
              render={
                <span
                  tabIndex={0}
                  className={cn("h-2 w-2 shrink-0 rounded-full", DOT_STYLES[level.status])}
                />
              }
            />
            <TooltipContent>
              {level.name}
              {level.approvalPolicy !== "ANY" &&
                ` · ${level.approvalsReceived} de ${
                  level.approvalPolicy === "ALL" ? level.assignees.length : level.requiredApprovals
                } firmas`}
            </TooltipContent>
          </Tooltip>
        ))}
      </span>
      <span className={cn("text-[10px] tabular-nums", late ? "text-red-600" : "text-muted-foreground")}>
        {position} de {levels.length}
      </span>
    </span>
  );
}

const LEVEL_STYLES: Record<WorkflowInstanceLevel["status"], string> = {
  APPROVED: "border-emerald-500/40 bg-emerald-500/5",
  REJECTED: "border-red-500/40 bg-red-500/5",
  RETURNED: "border-orange-500/40 bg-orange-500/5",
  IN_PROGRESS: "border-amber-500/50 bg-amber-500/5",
  PENDING: "border-dashed",
  SKIPPED: "border-dashed opacity-60",
  SUPERSEDED: "border-dashed opacity-60",
};

const LEVEL_LABELS: Record<WorkflowInstanceLevel["status"], string> = {
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
  RETURNED: "Devuelto",
  IN_PROGRESS: "Esperando decisión",
  PENDING: "Aún no le llega",
  SKIPPED: "Omitido",
  SUPERSEDED: "Reemplazado",
};

function LevelIcon({ status }: { status: WorkflowInstanceLevel["status"] }) {
  const shared = "h-3.5 w-3.5 shrink-0";
  if (status === "APPROVED") return <Check className={cn(shared, "text-emerald-600")} />;
  if (status === "REJECTED") return <X className={cn(shared, "text-red-600")} />;
  if (status === "IN_PROGRESS") return <Clock className={cn(shared, "text-amber-600")} />;
  return <Minus className={cn(shared, "text-muted-foreground")} />;
}

/** How late, or how long is left. Only meaningful on the level actually waiting. */
export function SlaNote({ level }: { level: WorkflowInstanceLevel }) {
  const hours = hoursToDeadline(level);
  if (hours === null) return null;
  const late = isOverdue(level);
  const rounded = Math.abs(Math.round(hours));
  return (
    <span className={cn("text-xs", late ? "font-medium text-red-600" : "text-muted-foreground")}>
      {late ? `Vencida hace ${rounded} h` : `Vence en ${rounded} h`}
    </span>
  );
}

function LevelCard({ level, band }: { level: WorkflowInstanceLevel; band: string | null }) {
  const missing = signaturesMissing(level);
  const waiting = level.status === "IN_PROGRESS";

  return (
    // Capped, because the number of desks is now the document's and not the
    // template's: a flow with one level would otherwise stretch that level
    // across the whole page and read as a card with nothing in it.
    <div
      className={cn(
        "min-w-0 flex-1 space-y-1 rounded-lg border px-3 py-2 sm:max-w-sm",
        LEVEL_STYLES[level.status],
      )}
    >
      <div className="flex items-center gap-1.5">
        <LevelIcon status={level.status} />
        <span className="truncate text-sm font-medium">{level.name}</span>
        <span className="ml-auto whitespace-nowrap text-[10px] uppercase tracking-wide text-muted-foreground">
          {LEVEL_LABELS[level.status]}
        </span>
      </div>

      {/* The band this desk answers for. It is what makes the ladder legible on
          a document instead of only in the builder. */}
      {band && (
        <p className="flex items-center gap-1 text-xs text-violet-600 tabular-nums dark:text-violet-400">
          <Coins className="h-3 w-3 shrink-0" />
          {band}
        </p>
      )}

      {/* Quorum progress, and only when it is a quorum: "1 de 1" is noise. */}
      {level.approvalPolicy !== "ANY" && (
        <p className="text-xs text-muted-foreground">
          {level.approvalsReceived} de{" "}
          {level.approvalPolicy === "ALL" ? level.assignees.length : level.requiredApprovals} firmas
          {waiting && missing > 0 && ` · falta${missing === 1 ? "" : "n"} ${missing}`}
        </p>
      )}

      {waiting && <SlaNote level={level} />}

      {level.assignees.length > 0 && (
        <p className="truncate text-xs text-muted-foreground">
          {level.assignees.map((a) => (a.hasActed ? `${a.employeeName} ✓` : a.employeeName)).join(" · ")}
        </p>
      )}

      {level.finishedAt && (
        <p className="text-xs text-muted-foreground">{formatDateTime(level.finishedAt)}</p>
      )}
    </div>
  );
}

export function WorkflowProgress({
  instance,
  size = "md",
}: {
  instance: WorkflowInstance;
  size?: "xs" | "md";
}) {
  if (size === "xs") return <ProgressDots instance={instance} />;

  const levels = applicableLevelsOf(instance);
  // The band each desk answers for is read off the *whole* ladder: hiding the
  // levels above must not turn the last one drawn into "y más".
  const ladder = progressLevelsOf(instance);

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      {levels.map((level) => (
        <LevelCard
          key={level.id}
          level={level}
          band={amountBandLabel(level.activationMinAmount, ceilingOf(ladder, level.order))}
        />
      ))}
    </div>
  );
}
