import type {
  ApprovalPolicy,
  OnRejectBehaviour,
  WorkflowAction,
  WorkflowApprover,
  WorkflowAssignee,
  WorkflowInstance,
  WorkflowInstanceLevel,
  WorkflowLevel,
  WorkflowVersion,
} from "../types";
import { bs } from "./format";
import { employeesForRole } from "./role-directory";

/**
 * The approval engine, as pure functions.
 *
 * It lives apart from the services for the same reason `order-math` does: the
 * seed, the services and the screens all have to agree on who signs what and
 * where a document goes next, and the only way to guarantee that is to have one
 * place that says it. Nothing here knows about React or about storage.
 *
 * The engine is entity-agnostic on purpose — it moves a document through levels
 * and never looks at what the document is. It is handed the one figure the
 * ladder is compared against and never computes it: what that figure *means*
 * (the value of the items nobody rejected) is the entity's business and lives in
 * `return-workflow.ts`.
 */

// ---- The amount ladder -------------------------------------------------------

/** Anything with a position and a lower bound: a template level or a running one. */
interface LadderStep {
  order: number;
  activationMinAmount: number | null;
}

/**
 * Where a level stops deciding, or `null` when nothing follows it.
 *
 * A ceiling is never stored: it *is* the next level's lower bound, and the last
 * level has none because there is no amount too large for the top desk. Deriving
 * it in one place is what makes the ladder contiguous by construction — the
 * builder cannot draw a gap, and the engine cannot read one.
 */
export function ceilingOf(levels: LadderStep[], order: number): number | null {
  const next = [...levels]
    .filter((l) => l.order > order)
    .sort((a, b) => a.order - b.order)[0];
  return next?.activationMinAmount ?? null;
}

/** `Bs 0,00 – Bs 500,00`, or `Bs 2.000,00 y más` for the top of the ladder. */
export function amountBandLabel(
  activationMinAmount: number | null,
  ceiling: number | null,
): string | null {
  if (activationMinAmount === null) return null;
  return ceiling === null
    ? `${bs(activationMinAmount)} y más`
    : `${bs(activationMinAmount)} – ${bs(ceiling)}`;
}

/** Whether this set of levels carries an amount ladder at all. */
export const hasAmountLadder = (levels: LadderStep[]): boolean =>
  levels.some((l) => l.activationMinAmount !== null);

// ---- Reading a version -------------------------------------------------------

/** The version new documents are routed through, or `null` when only drafts exist. */
export const currentVersionOf = (versions: WorkflowVersion[]): WorkflowVersion | null =>
  versions.find((v) => v.isCurrent && v.status === "published") ?? null;

/** The open draft, if someone left work unpublished. */
export const draftVersionOf = (versions: WorkflowVersion[]): WorkflowVersion | null =>
  versions.find((v) => v.status === "draft") ?? null;

/** How many signatures a level needs, whatever policy it uses. */
export function signaturesNeeded(
  policy: ApprovalPolicy,
  requiredApprovals: number,
  approverCount: number,
): number {
  if (policy === "ANY") return 1;
  if (policy === "ALL") return Math.max(1, approverCount);
  return Math.max(1, Math.min(requiredApprovals, approverCount));
}

/** Plain-language summary of a level's policy, for the collapsed builder card. */
export function policyLabel(level: WorkflowLevel): string {
  const count = level.approvers.length;
  if (level.approvalPolicy === "ANY") return "cualquiera decide";
  if (level.approvalPolicy === "ALL") return count === 1 ? "1 firma" : `las ${count} firmas`;
  return `quórum ${level.requiredApprovals} de ${count}`;
}

export const ON_REJECT_LABELS: Record<OnRejectBehaviour, string> = {
  TERMINATE: "Si rechaza → termina",
  RETURN_PREVIOUS: "Si rechaza → vuelve al nivel anterior",
  RETURN_INITIATOR: "Si rechaza → vuelve al vendedor",
};

// ---- Reading a running instance ----------------------------------------------

/** The round of the level currently waiting for signatures, or `null` when closed. */
export function currentLevelOf(instance: WorkflowInstance): WorkflowInstanceLevel | null {
  if (instance.currentLevelOrder === null) return null;
  const open = instance.levels.filter(
    (l) => l.order === instance.currentLevelOrder && (l.status === "IN_PROGRESS" || l.status === "PENDING"),
  );
  // Highest attempt: a level handed back and reopened has an older row too.
  return open.sort((a, b) => b.attempt - a.attempt)[0] ?? null;
}

/** Signatures still missing on a level before it can close. */
export const signaturesMissing = (level: WorkflowInstanceLevel): number =>
  Math.max(
    0,
    signaturesNeeded(level.approvalPolicy, level.requiredApprovals, level.assignees.length) -
      level.approvalsReceived,
  );

/** Whether this employee is on the hook for a level and has not answered yet. */
export const awaitsDecisionFrom = (level: WorkflowInstanceLevel, employeeCode: number): boolean =>
  level.assignees.some((a) => a.employeeCode === employeeCode && !a.hasActed);

/** When a level falls due, or `null` when it has no deadline or never started. */
export function slaDeadlineOf(level: WorkflowInstanceLevel): Date | null {
  if (level.slaHours === null || !level.startedAt) return null;
  return new Date(new Date(level.startedAt).getTime() + level.slaHours * 3_600_000);
}

/** Hours until a level is late — negative once it already is. `null` = no deadline. */
export function hoursToDeadline(level: WorkflowInstanceLevel, now = new Date()): number | null {
  const deadline = slaDeadlineOf(level);
  if (!deadline) return null;
  return (deadline.getTime() - now.getTime()) / 3_600_000;
}

export function isOverdue(level: WorkflowInstanceLevel, now = new Date()): boolean {
  const hours = hoursToDeadline(level, now);
  return hours !== null && hours < 0;
}

/**
 * The levels as the progress bar draws them: one entry per position, newest
 * round of each.
 *
 * A level that ran twice must appear once on the bar — the bar answers "where is
 * the document", and the earlier round belongs to the timeline, which is the
 * component that exists to show that history.
 */
export function progressLevelsOf(instance: WorkflowInstance): WorkflowInstanceLevel[] {
  const newest = new Map<number, WorkflowInstanceLevel>();
  for (const level of instance.levels) {
    const held = newest.get(level.order);
    if (!held || level.attempt > held.attempt) newest.set(level.order, level);
  }
  return [...newest.values()].sort((a, b) => a.order - b.order);
}

/**
 * The levels that actually take part in this document's approval.
 *
 * A skipped level is one the ladder left out before anybody looked at it: it has
 * no decision to wait for and never will. Drawing it only to say "no aplica"
 * makes every short flow look like a long one left unfinished, so the reader is
 * shown the desks the document really crosses and nothing else.
 *
 * Presentation only. The engine keeps reading `progressLevelsOf`, because
 * stepping over a skipped level and computing a band ceiling both need the full
 * ladder — hiding a row must never change what the flow does.
 */
export function applicableLevelsOf(instance: WorkflowInstance): WorkflowInstanceLevel[] {
  const shown = progressLevelsOf(instance).filter((l) => l.status !== "SKIPPED");
  // An instance where every level was skipped cannot exist (the first one never
  // is), but an empty bar would be a worse answer than a complete one.
  return shown.length > 0 ? shown : progressLevelsOf(instance);
}

/** One round of an instance, as the timeline groups it. */
export interface WorkflowRound {
  attempt: number;
  actions: WorkflowAction[];
}

/**
 * The trail grouped by round, newest first.
 *
 * Without the grouping a document that was handed back and resubmitted shows
 * level 1 twice in a row and reads as a bug. The round is what explains it.
 */
export function roundsOf(instance: WorkflowInstance): WorkflowRound[] {
  const byAttempt = new Map<number, WorkflowAction[]>();
  for (const action of instance.actions) {
    const bucket = byAttempt.get(action.attempt);
    if (bucket) bucket.push(action);
    else byAttempt.set(action.attempt, [action]);
  }
  return [...byAttempt.entries()]
    .map(([attempt, actions]) => ({
      attempt,
      actions: [...actions].sort((a, b) => (a.at < b.at ? 1 : -1)),
    }))
    .sort((a, b) => b.attempt - a.attempt);
}

/** Whether an instance has stopped moving. */
export const isClosed = (instance: WorkflowInstance): boolean =>
  instance.status === "APPROVED" ||
  instance.status === "REJECTED" ||
  instance.status === "CANCELLED";

// ---- Starting an instance ----------------------------------------------------

/**
 * Materialise a running approval from a published version.
 *
 * Every level is copied onto the instance rather than referenced, and so is
 * every approver: a template that is renamed, reordered or republished
 * tomorrow must not rewrite what an approver was shown today. That snapshot is
 * the whole reason instances and definitions are separate tables.
 *
 * `relevantValue` is the figure the ladder is read against — the caller's to
 * compute, never the engine's. A level whose lower bound already sits at or
 * above it is born `SKIPPED`: it was never needed, and a document that visited
 * it would be waiting on a desk with nothing to decide. Versions without a
 * ladder (`activationMinAmount` null throughout) ignore it entirely.
 */
export function startInstance(input: {
  id: string;
  definition: { id: string; name: string };
  version: WorkflowVersion;
  targetCode: WorkflowInstance["targetCode"];
  targetId: number;
  initiatedByName: string;
  amount: number;
  /** Value the ladder is compared against. Omit for entities with no ladder. */
  relevantValue?: number;
  supersededInstanceId?: string | null;
  at?: string;
}): WorkflowInstance {
  const at = input.at ?? new Date().toISOString();
  const ordered = [...input.version.levels].sort((a, b) => a.order - b.order);

  const laddered = hasAmountLadder(ordered) && input.relevantValue !== undefined;
  const relevantValue = input.relevantValue ?? 0;

  /**
   * Whether the ladder leaves this level out of the run.
   *
   * The first level is never skipped even when its own bound would exclude it:
   * a document has to be waiting on somebody, and an instance born with every
   * level skipped is an approval nobody can ever close.
   */
  const skipped = (level: WorkflowLevel, index: number): boolean =>
    laddered &&
    index > 0 &&
    level.activationMinAmount !== null &&
    level.activationMinAmount >= relevantValue;

  const firstActive = ordered.findIndex((level, index) => !skipped(level, index));

  /**
   * Who can act on a level, resolved at the one moment it matters: right when
   * the level is materialised onto the instance, never earlier.
   *
   * `EMPLOYEE` approvers already name the person. `ROLE` approvers do not —
   * `employeesForRole` stands in for the directory a real deployment would call
   * over the network, so a role's membership is read fresh here instead of
   * being copied once into the template and going stale.
   */
  const assigneesOf = (approvers: WorkflowApprover[]): WorkflowAssignee[] =>
    approvers.flatMap((approver): WorkflowAssignee[] => {
      if (approver.assigneeType === "EMPLOYEE") {
        return approver.employeeCode === null
          ? []
          : [{ employeeCode: approver.employeeCode, employeeName: approver.employeeName ?? `Empleado ${approver.employeeCode}`, hasActed: false }];
      }
      if (approver.assigneeType === "ROLE" && approver.roleCode) {
        return employeesForRole(approver.roleCode).map((e) => ({
          employeeCode: e.code,
          employeeName: e.name,
          hasActed: false,
        }));
      }
      return [];
    });

  const levels: WorkflowInstanceLevel[] = ordered.map((level, index) => ({
    id: `${input.id}_l${level.order}_a1`,
    order: level.order,
    attempt: 1,
    name: level.name,
    status: skipped(level, index) ? "SKIPPED" : index === firstActive ? "IN_PROGRESS" : "PENDING",
    approvalPolicy: level.approvalPolicy,
    requiredApprovals: level.requiredApprovals,
    approvalsReceived: 0,
    activationMinAmount: level.activationMinAmount,
    slaHours: level.slaHours,
    startedAt: index === firstActive ? at : null,
    finishedAt: skipped(level, index) ? at : null,
    assignees: assigneesOf(level.approvers),
  }));

  return {
    id: input.id,
    status: "IN_PROGRESS",
    currentLevelOrder: ordered[firstActive]?.order ?? null,
    targetCode: input.targetCode,
    targetId: input.targetId,
    definitionId: input.definition.id,
    definitionName: input.definition.name,
    versionId: input.version.id,
    versionNumber: input.version.versionNumber,
    initiatedByName: input.initiatedByName,
    selectionContext: { amount: input.amount },
    supersededInstanceId: input.supersededInstanceId ?? null,
    startedAt: at,
    finishedAt: null,
    levels,
    actions: [],
  };
}

// ---- Advancing an instance ---------------------------------------------------

/** What a decision did to the instance, so the caller can persist and explain it. */
export interface DecisionOutcome {
  instance: WorkflowInstance;
  /** Level the document landed on, or `null` when the instance closed. */
  nextLevelOrder: number | null;
  /** True when this decision was the one that closed the whole instance. */
  finished: boolean;
}

/**
 * Record one approver's signature on the level a document is sitting on.
 *
 * The level is never taken from the caller: it is read from the instance, so a
 * screen cannot sign level 3 while the document waits on level 1. Whether the
 * signature closes the level is the policy's call, and whether closing the level
 * closes the instance is the ladder's.
 *
 * `relevantValue` is the figure the ladder is read against, recomputed by the
 * caller *after* this level's decision. Once it no longer exceeds the level's
 * ceiling, this desk's word is the last one needed and everything above it is
 * skipped. The flow only ever climbs or stops: a value that drops into a lower
 * band never sends the document back down, because a level that already signed
 * has finished deciding.
 */
export function approveCurrentLevel(
  instance: WorkflowInstance,
  actor: { employeeCode: number; employeeName: string },
  comment: string | null,
  at = new Date().toISOString(),
  relevantValue?: number,
): DecisionOutcome {
  const level = currentLevelOf(instance);
  if (!level) return { instance, nextLevelOrder: null, finished: false };

  const approvalsReceived = level.approvalsReceived + 1;
  const closes =
    approvalsReceived >=
    signaturesNeeded(level.approvalPolicy, level.requiredApprovals, level.assignees.length);

  // Only a level still waiting its turn can be advanced onto. Levels the ladder
  // skipped at birth sit in between and must be stepped over, not woken up.
  const following = progressLevelsOf(instance)
    .filter((l) => l.order > level.order && l.status === "PENDING")
    .sort((a, b) => a.order - b.order)[0];

  // The termination test, and the same formula the builder draws as "hasta".
  const ceiling = ceilingOf(progressLevelsOf(instance), level.order);
  const settledHere =
    closes && relevantValue !== undefined && ceiling !== null && relevantValue <= ceiling;

  const finished = closes && (settledHere || !following);
  const nextLevelOrder = finished ? null : closes ? (following?.order ?? null) : level.order;

  const levels = instance.levels.map((l) => {
    if (l.id === level.id) {
      return {
        ...l,
        approvalsReceived,
        status: closes ? ("APPROVED" as const) : ("IN_PROGRESS" as const),
        finishedAt: closes ? at : l.finishedAt,
        assignees: l.assignees.map((a) =>
          a.employeeCode === actor.employeeCode ? { ...a, hasActed: true } : a,
        ),
      };
    }
    // The amount stopped short of this desk: it was never needed, and saying so
    // is what stops the progress bar reading as an approval left half-done.
    if (settledHere && l.order > level.order && (l.status === "PENDING" || l.status === "IN_PROGRESS")) {
      return { ...l, status: "SKIPPED" as const, finishedAt: at };
    }
    if (closes && !settledHere && following && l.id === following.id) {
      return { ...l, status: "IN_PROGRESS" as const, startedAt: at };
    }
    return l;
  });

  const newStatus: WorkflowInstance["status"] = finished ? "APPROVED" : "IN_PROGRESS";
  const action: WorkflowAction = {
    id: `wfa_${instance.id}_${instance.actions.length + 1}`,
    action: "APPROVE",
    comment,
    rejectReason: null,
    previousStatus: instance.status,
    newStatus,
    levelId: level.id,
    levelOrder: level.order,
    levelName: level.name,
    attempt: level.attempt,
    byEmployeeCode: actor.employeeCode,
    byEmployeeName: actor.employeeName,
    at,
    amountBefore: null,
    amountAfter: null,
  };

  return {
    instance: {
      ...instance,
      status: newStatus,
      currentLevelOrder: nextLevelOrder,
      finishedAt: finished ? at : instance.finishedAt,
      levels,
      actions: [...instance.actions, action],
    },
    nextLevelOrder,
    finished,
  };
}

/**
 * Reject, or hand back, the level a document is sitting on.
 *
 * Where it lands is the level's own `onReject` setting and never the caller's
 * choice — the whole reason that setting is configurable is so one button means
 * different things on different desks.
 */
export function rejectCurrentLevel(
  instance: WorkflowInstance,
  actor: { employeeCode: number; employeeName: string },
  onReject: OnRejectBehaviour,
  reason: string,
  comment: string | null,
  at = new Date().toISOString(),
): DecisionOutcome {
  const level = currentLevelOf(instance);
  if (!level) return { instance, nextLevelOrder: null, finished: false };

  const handedBack = onReject !== "TERMINATE";
  const previous = progressLevelsOf(instance)
    .filter((l) => l.order < level.order)
    .sort((a, b) => b.order - a.order)[0];

  const nextLevelOrder =
    onReject === "TERMINATE"
      ? null
      : onReject === "RETURN_PREVIOUS"
        ? (previous?.order ?? null)
        : null;

  const newStatus: WorkflowInstance["status"] = handedBack ? "RETURNED" : "REJECTED";

  const levels = instance.levels.map((l) =>
    l.id === level.id
      ? {
          ...l,
          status: handedBack ? ("RETURNED" as const) : ("REJECTED" as const),
          finishedAt: at,
          assignees: l.assignees.map((a) =>
            a.employeeCode === actor.employeeCode ? { ...a, hasActed: true } : a,
          ),
        }
      : l,
  );

  const action: WorkflowAction = {
    id: `wfa_${instance.id}_${instance.actions.length + 1}`,
    action: handedBack ? "RETURN" : "REJECT",
    comment,
    rejectReason: reason,
    previousStatus: instance.status,
    newStatus,
    levelId: level.id,
    levelOrder: level.order,
    levelName: level.name,
    attempt: level.attempt,
    byEmployeeCode: actor.employeeCode,
    byEmployeeName: actor.employeeName,
    at,
    amountBefore: null,
    amountAfter: null,
  };

  return {
    instance: {
      ...instance,
      status: newStatus,
      currentLevelOrder: nextLevelOrder,
      finishedAt: handedBack ? instance.finishedAt : at,
      levels,
      actions: [...instance.actions, action],
    },
    nextLevelOrder,
    finished: !handedBack,
  };
}

/** Leave a note on an instance without deciding anything. */
export function commentOn(
  instance: WorkflowInstance,
  actor: { employeeCode: number; employeeName: string },
  comment: string,
  at = new Date().toISOString(),
): WorkflowInstance {
  const level = currentLevelOf(instance);
  const action: WorkflowAction = {
    id: `wfa_${instance.id}_${instance.actions.length + 1}`,
    action: "COMMENT",
    comment,
    rejectReason: null,
    previousStatus: instance.status,
    newStatus: instance.status,
    levelId: level?.id ?? null,
    levelOrder: level?.order ?? null,
    levelName: level?.name ?? null,
    attempt: level?.attempt ?? 1,
    byEmployeeCode: actor.employeeCode,
    byEmployeeName: actor.employeeName,
    at,
    amountBefore: null,
    amountAfter: null,
  };
  return { ...instance, actions: [...instance.actions, action] };
}
