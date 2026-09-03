import { useState } from "react";
import {
  Ban,
  Check,
  ChevronDown,
  ChevronUp,
  CornerUpLeft,
  FilePlus2,
  RotateCcw,
  GitBranch,
  MessageSquare,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { WorkflowAction, WorkflowActionKind, WorkflowInstance } from "../../types";
import { roundsOf } from "../../lib/workflow";
import { Button } from "@/components/ui/button";
import { cn } from "../../lib/utils";
import { bs, formatDateTime, formatTime } from "../../lib/format";
import { PhotoStack } from "./photo-viewer";

/**
 * Everything that happened to an approval, in the order it happened.
 *
 * Grouped by round, and that grouping is the design. A document handed back and
 * resubmitted crosses level 1 twice, and an ungrouped list showing "Supervisor
 * aprobó" twice in a row reads as a bug in the system rather than as the second
 * pass it actually is.
 *
 * Superseded approvals stay below the live one rather than being tidied away.
 * The trail is append-only in the model — the actions table has no update
 * column at all — and a screen that hid the earlier instance would be lying by
 * omission about signatures that were really given.
 */

const ACTION_META: Record<
  WorkflowActionKind | "CREATED",
  { icon: LucideIcon; label: string; tone: string }
> = {
  CREATED: { icon: FilePlus2, label: "Creada", tone: "text-muted-foreground" },
  APPROVE: { icon: Check, label: "Aprobó", tone: "text-emerald-600 dark:text-emerald-400" },
  REJECT: { icon: X, label: "Rechazó", tone: "text-destructive" },
  RETURN: {
    icon: CornerUpLeft,
    label: "Devolvió al vendedor",
    tone: "text-orange-600 dark:text-orange-400",
  },
  // Reactivar no es una decisión de nivel: es el evento que explica por qué un documento cerrado
  // volvió a moverse. Va en ámbar y no en verde justamente para que no se lea como una aprobación.
  REACTIVATE: { icon: RotateCcw, label: "Reactivó", tone: "text-amber-600 dark:text-amber-400" },
  COMMENT: { icon: MessageSquare, label: "Comentó", tone: "text-muted-foreground" },
  CANCEL: { icon: Ban, label: "Anuló", tone: "text-muted-foreground" },
  REASSIGN: { icon: Users, label: "Reasignó", tone: "text-sky-600 dark:text-sky-400" },
  MIGRATE: { icon: GitBranch, label: "Migró de versión", tone: "text-violet-600 dark:text-violet-400" },
};

/** The kinds that are a decision rather than a note. */
const DECISION_KINDS: WorkflowActionKind[] = ["APPROVE", "REJECT", "RETURN", "CANCEL"];

/**
 * The opening event, derived rather than stored.
 *
 * The engine records what people *did*; that the approval started is a property
 * of the instance itself. Synthesising it here keeps the timeline honest — it
 * reads off `startedAt` and the initiator, and invents nothing.
 */
function CreatedEvent({ instance }: { instance: WorkflowInstance }) {
  const meta = ACTION_META.CREATED;
  return (
    <li className="relative pl-6">
      <Dot icon={meta.icon} tone={meta.tone} />
      <div className="pb-3">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium">Enviada a aprobación</span>
          <span className="text-xs text-muted-foreground">
            {formatDateTime(instance.startedAt)} {formatTime(instance.startedAt)}
          </span>
        </div>
        {/* Who sent it and what it was worth. The template, its version and the
            figure the ladder was read against describe how the flow was chosen,
            which is a question about the configuration and not about this
            document's history. */}
        <p className="text-xs text-muted-foreground">
          {instance.initiatedByName} · {bs(instance.selectionContext.amount)}
        </p>
      </div>
    </li>
  );
}

function Dot({ icon: Icon, tone }: { icon: LucideIcon; tone: string }) {
  return (
    <span
      className={cn(
        "absolute left-0 top-0.5 flex h-4 w-4 items-center justify-center rounded-full border bg-background",
        tone,
      )}
    >
      <Icon className="h-2.5 w-2.5" />
    </span>
  );
}

function ActionEvent({
  action,
  detail,
}: {
  action: WorkflowAction;
  detail?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const meta = ACTION_META[action.action];
  const movedAmount = action.amountBefore !== null && action.amountAfter !== null;
  const hasDetail = !!detail || movedAmount || !!action.rejectReason || action.photos.length > 0;

  return (
    <li className="relative pl-6">
      <Dot icon={meta.icon} tone={meta.tone} />
      <div className="pb-3">
        <div className="flex flex-wrap items-baseline gap-x-2">
          {action.levelName && <span className="text-sm font-medium">{action.levelName}</span>}
          <span className={cn("text-sm font-medium", meta.tone)}>{meta.label}</span>
          <span className="text-xs text-muted-foreground">
            {formatDateTime(action.at)} {formatTime(action.at)}
          </span>
          {hasDetail && (
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto h-6 w-6"
              aria-label={open ? "Ocultar detalle del evento" : "Ver detalle del evento"}
              onClick={() => setOpen(!open)}
            >
              {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">{action.byEmployeeName}</p>

        {/* The amount moving is the single most consequential thing that can
            appear here, so it is shown collapsed rather than hidden behind the
            toggle. */}
        {movedAmount && (
          <p className="mt-0.5 text-xs tabular-nums">
            <span className="text-muted-foreground line-through">{bs(action.amountBefore!)}</span>{" "}
            <span className="font-medium">→ {bs(action.amountAfter!)}</span>
          </p>
        )}

        {action.comment && (
          <p className="mt-1 rounded-md bg-muted px-2 py-1 text-xs">«{action.comment}»</p>
        )}

        {open && (
          <div className="mt-1.5 space-y-1.5 rounded-md border bg-muted/30 px-2.5 py-2 text-xs">
            <Field label="Acción" value={meta.label} />
            {action.previousStatus && action.newStatus && (
              <Field
                label="Estado"
                value={`${action.previousStatus} → ${action.newStatus}`}
              />
            )}
            {action.rejectReason && <Field label="Motivo" value={action.rejectReason} />}
            {/* La autorización de una reactivación. Va acá y no colapsada arriba porque es prueba
                que se consulta cuando alguien pregunta quién autorizó, no algo que se lea de paso. */}
            {action.photos.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="w-24 shrink-0 text-muted-foreground">Autorización</span>
                <PhotoStack photos={action.photos} />
              </div>
            )}
            {movedAmount && (
              <Field
                label="Monto"
                value={`${bs(action.amountBefore!)} → ${bs(action.amountAfter!)}`}
              />
            )}
            {detail}
          </div>
        )}
      </div>
    </li>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 tabular-nums">{value}</span>
    </div>
  );
}

function InstanceTrail({
  instance,
  superseded,
  round,
  showRound,
  onlyDecisions,
  renderActionDetail,
}: {
  instance: WorkflowInstance;
  superseded: boolean;
  /** Which pass through the flow this instance is. 1 is the original. */
  round: number;
  /** Only worth naming when there is more than one pass. */
  showRound: boolean;
  onlyDecisions: boolean;
  renderActionDetail?: (action: WorkflowAction, instance: WorkflowInstance) => React.ReactNode;
}) {
  const rounds = roundsOf(instance);

  return (
    <div
      className={cn(
        "space-y-3 rounded-lg border px-3 py-2.5",
        superseded && "border-dashed opacity-90",
      )}
    >
      {/* A heading only when there is something to head: which round this is,
          and whether a correction replaced it. The template and its version name
          the configuration, not this document's history — a single-instance
          block needs no title at all. */}
      {(showRound || superseded) && (
        <div className="flex flex-wrap items-center gap-2">
          {showRound && (
            <span className="rounded bg-primary/10 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-primary">
              Ronda {round}
            </span>
          )}
          {superseded && (
            <span className="rounded bg-muted px-1.5 py-px text-[10px] uppercase tracking-wide text-muted-foreground">
              Reemplazada
            </span>
          )}
        </div>
      )}

      {rounds.length === 0 ? (
        <ol className="relative space-y-0 border-l border-dashed pl-0">
          <CreatedEvent instance={instance} />
        </ol>
      ) : (
        rounds.map((round, index) => {
          const actions = onlyDecisions
            ? round.actions.filter((a) => DECISION_KINDS.includes(a.action))
            : round.actions;
          const isFirstRound = index === rounds.length - 1;

          return (
            <div key={round.attempt} className="space-y-1.5">
              {/* A level re-run inside the same instance — what `attempt`
                  records. Distinct from a resubmission, which opens a new
                  instance and gets its own block above. */}
              {rounds.length > 1 && (
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Intento {round.attempt}
                </p>
              )}
              <ol className="relative ml-1.5 space-y-0 border-l pl-3">
                {actions.map((action) => (
                  <ActionEvent
                    key={action.id}
                    action={action}
                    detail={renderActionDetail?.(action, instance)}
                  />
                ))}
                {isFirstRound && <CreatedEvent instance={instance} />}
              </ol>
            </div>
          );
        })
      )}
    </div>
  );
}

export function WorkflowTimeline({
  instance,
  pastInstances = [],
  renderActionDetail,
}: {
  instance: WorkflowInstance;
  /** Approvals this one replaced, newest first. */
  pastInstances?: WorkflowInstance[];
  /** Extra rows inside an expanded event — the entity's own detail. */
  renderActionDetail?: (action: WorkflowAction, instance: WorkflowInstance) => React.ReactNode;
}) {
  const [onlyDecisions, setOnlyDecisions] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Histórico</h2>
        <div className="ml-auto flex gap-1">
          <Button
            variant={onlyDecisions ? "ghost" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setOnlyDecisions(false)}
          >
            Todo
          </Button>
          <Button
            variant={onlyDecisions ? "outline" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setOnlyDecisions(true)}
          >
            Solo decisiones
          </Button>
        </div>
      </div>

      {/* Newest first, and numbered from the bottom up: the original submission
          is round 1, and each correction that re-opened the flow is the next.
          `pastInstances` arrives newest-first, so the current one is the last. */}
      <InstanceTrail
        instance={instance}
        superseded={false}
        round={pastInstances.length + 1}
        showRound={pastInstances.length > 0}
        onlyDecisions={onlyDecisions}
        renderActionDetail={renderActionDetail}
      />

      {pastInstances.map((past, index) => (
        <InstanceTrail
          key={past.id}
          instance={past}
          superseded
          round={pastInstances.length - index}
          showRound
          onlyDecisions={onlyDecisions}
          renderActionDetail={renderActionDetail}
        />
      ))}
    </div>
  );
}
