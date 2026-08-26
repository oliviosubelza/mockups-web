import type {
  Return,
  ReturnItemSource,
  ReturnItemStatus,
  ReturnLine,
  ReturnStatus,
  WorkflowInstanceLevel,
} from "../types";
import { lineMinUnits, round2 } from "./order-math";
import { awaitsDecisionFrom, currentLevelOf, isClosed } from "./workflow";

/**
 * What a return does with the levels a workflow moves it through.
 *
 * The engine in `workflow.ts` is entity-agnostic and stays that way: it knows
 * about signatures and levels and nothing about money or products. Everything
 * specific to a devolución lives here — how sources have to add up, what a
 * partial approval is worth, and how the document's own status is read off the
 * approval running over it.
 *
 * The rule that governs the whole file: **every** level decides items. A desk
 * can cut quantities and refuse products, and what it leaves standing is what
 * the next rung of the amount ladder is measured against.
 */

/** Only one correction is ever allowed. A second one would re-open signed approvals indefinitely. */
export const MAX_RETURN_EDITS = 1;

// ---- Sources -----------------------------------------------------------------

/** Minimum units accounted for across a line's invoices and batches. */
export const sourcesMinUnits = (sources: ReturnItemSource[]): number =>
  sources.reduce((sum, source) => sum + source.minUnits, 0);

/**
 * Why a line's origins do not account for its quantity, or `null` when they do.
 *
 * The database only asks each source to name an invoice or a batch; that the
 * pieces add up to the whole is the application's to enforce, and this is the
 * one place that does it — the form disables the save with exactly the sentence
 * the service would refuse it with.
 */
export function sourcesBlockedReason(line: ReturnLine): string | null {
  if (line.sources.length === 0) return "Indicá de qué factura o lote proviene.";
  const missingRef = line.sources.some((s) => !s.invoiceNumber && !s.batch);
  if (missingRef) return "Cada origen tiene que indicar una factura o un lote.";
  const claimed = lineMinUnits(line);
  const covered = sourcesMinUnits(line.sources);
  if (covered !== claimed) {
    return `Los orígenes suman ${covered} de ${claimed} unidades.`;
  }
  return null;
}

export const sourcesBalanced = (line: ReturnLine): boolean => sourcesBlockedReason(line) === null;

/**
 * Shrink a line's sources to add up to a smaller claim, in proportion to what
 * each already carried.
 *
 * Reducing `qtyUnit` alone would leave the sources claiming the old, larger
 * quantity — exactly the mismatch `sourcesBlockedReason` exists to catch. This
 * is the one place a reopen edit is allowed to touch `sources`, and only to
 * shrink them: nothing here can move a unit from one invoice to another or
 * invent a source that was not already on the line.
 */
export function shrinkSources(sources: ReturnItemSource[], newQty: number): ReturnItemSource[] {
  const oldQty = sourcesMinUnits(sources);
  if (sources.length <= 1 || oldQty <= 0) {
    return [{ ...sources[0], minUnits: newQty }, ...sources.slice(1).map((s) => ({ ...s, minUnits: 0 }))];
  }
  let remaining = newQty;
  return sources.map((source, index) => {
    if (index === sources.length - 1) return { ...source, minUnits: Math.max(0, remaining) };
    const share = Math.min(remaining, Math.round((source.minUnits / oldQty) * newQty));
    remaining -= share;
    return { ...source, minUnits: share };
  });
}

/**
 * The origin a one-line summary shows.
 *
 * Most returns come off a single invoice and a single batch, and a table that
 * spends three columns saying so for every row is unreadable. Screens show this
 * one and a "N orígenes" affordance when there are more.
 */
export const primarySourceOf = (line: ReturnLine): ReturnItemSource | null => line.sources[0] ?? null;

// ---- Money -------------------------------------------------------------------

/** What a line claims, in Bs. */
export const lineClaimedAmount = (line: ReturnLine): number => round2(lineMinUnits(line) * line.priceUnit);

/**
 * What a line was actually granted, in Bs.
 *
 * Zero for a rejected line and zero while undecided — an amount is only real
 * once somebody has ruled on the quantity behind it.
 */
export const lineApprovedAmount = (line: ReturnLine): number =>
  line.itemStatus === "APPROVED" && line.approvedMinUnits !== null
    ? round2(line.approvedMinUnits * line.priceUnit)
    : 0;

/**
 * The figure the amount ladder is read against, in Bs.
 *
 * What is still *at stake*, which is not the same as what has been granted: a
 * line nobody has ruled on yet counts for everything it claims, because the
 * money is still on the table and the ladder has to size the desk that will
 * decide it. An approved line counts only the quantity actually granted, and a
 * rejected line counts nothing at all.
 *
 * This is the whole reason a cut can end an approval early — the engine is handed
 * this number and compares it against the level's ceiling, and it never computes
 * it, because what "at stake" means is a devolución's business and not a
 * workflow's.
 */
export const relevantAmountOf = (lines: ReturnLine[]): number =>
  round2(
    lines.reduce((sum, line) => {
      if (line.itemStatus === "REJECTED") return sum;
      if (line.itemStatus === "APPROVED") return sum + lineApprovedAmount(line);
      return sum + lineClaimedAmount(line);
    }, 0),
  );

/** The three figures every approval screen is built around. */
export interface ReturnAmounts {
  claimed: number;
  approved: number;
  rejected: number;
  /** Whether any item is still undecided, which is what makes the split provisional. */
  pending: boolean;
}

export function amountsOf(lines: ReturnLine[]): ReturnAmounts {
  const claimed = round2(lines.reduce((sum, line) => sum + lineClaimedAmount(line), 0));
  const approved = round2(lines.reduce((sum, line) => sum + lineApprovedAmount(line), 0));
  return {
    claimed,
    approved,
    rejected: round2(claimed - approved),
    pending: lines.some((line) => line.itemStatus === "PENDING"),
  };
}

/** How the items break down, for the confirmation that explains a decision. */
export function itemCountsOf(lines: ReturnLine[]) {
  let approved = 0;
  let partial = 0;
  let rejected = 0;
  let pending = 0;
  for (const line of lines) {
    if (line.itemStatus === "PENDING") pending += 1;
    else if (line.itemStatus === "REJECTED") rejected += 1;
    else {
      approved += 1;
      if ((line.approvedMinUnits ?? 0) < lineMinUnits(line)) partial += 1;
    }
  }
  return { total: lines.length, approved, partial, rejected, pending };
}

// ---- Status ------------------------------------------------------------------

/**
 * What the return *is*, read off the approval running over it.
 *
 * Derived rather than stored, for the same reason the old flow derived its desk
 * from the status: two fields saying the same thing is how they end up
 * disagreeing. The one judgement call is the difference between `APPROVED` and
 * `PARTIALLY_APPROVED` — a flow that ended with every item granted in full is
 * an approval, and anything less is partial even when nobody rejected a whole
 * product, because the client is getting back less than they claimed.
 */
export function statusOf(ret: Pick<Return, "workflow" | "lines">): ReturnStatus {
  const instance = ret.workflow;
  if (!instance) return "DRAFT";
  if (instance.status === "CANCELLED") return "ANNULLED";
  if (instance.status === "REJECTED") return "REJECTED";
  if (instance.status === "RETURNED") return "RETURNED";
  if (instance.status !== "APPROVED") return "IN_APPROVAL";

  const { approved, claimed } = amountsOf(ret.lines);
  if (approved <= 0) return "REJECTED";
  return approved < claimed ? "PARTIALLY_APPROVED" : "APPROVED";
}

/** Whether the return has stopped moving. */
export const isSettled = (ret: Return): boolean =>
  ret.workflow === null ? false : isClosed(ret.workflow);

// ---- Who can act -------------------------------------------------------------

/** The level the return is waiting on, or `null` when it is not waiting on anyone. */
export const pendingLevelOf = (ret: Return): WorkflowInstanceLevel | null =>
  ret.workflow ? currentLevelOf(ret.workflow) : null;

/**
 * Why this employee cannot decide this return right now, or `null` when they can.
 *
 * The checks run in the order they stop being interesting: a closed return has
 * no desk at all, and only then does it matter whether this particular person
 * sits at the desk it is waiting on and has not already answered.
 */
export function decisionBlockedReason(ret: Return, employeeCode: number): string | null {
  if (!ret.workflow) return "La devolución todavía no fue enviada a aprobación.";
  const level = pendingLevelOf(ret);
  if (!level) {
    const status = statusOf(ret);
    if (status === "RETURNED") return "La devolución volvió al vendedor para corrección.";
    if (status === "REJECTED") return "La devolución ya fue rechazada.";
    if (status === "ANNULLED") return "La devolución fue anulada.";
    return "La devolución ya fue resuelta.";
  }
  const assigned = level.assignees.some((a) => a.employeeCode === employeeCode);
  if (!assigned) return `Esta devolución espera la decisión de ${level.name}.`;
  if (!awaitsDecisionFrom(level, employeeCode)) return "Ya registraste tu decisión en este nivel.";
  return null;
}

export const canDecide = (ret: Return, employeeCode: number): boolean =>
  decisionBlockedReason(ret, employeeCode) === null;

/**
 * Why a return cannot be corrected, or `null` when it can.
 *
 * The edit budget is the business rule — one correction, ever, because every
 * edit re-opens an approval somebody already signed. Being settled is a fact:
 * the goods movement is authorised and rewriting the claim behind it would
 * leave signatures pointing at something that no longer exists.
 */
export function editBlockedReason(ret: Return): string | null {
  const status = statusOf(ret);
  // Only a return a desk actually sent back is reopenable. `IN_APPROVAL` is
  // being decided right now — editing under an approver's feet is not a
  // correction, it is a race — and the rest are already settled one way or the
  // other, which a correction cannot undo.
  if (status !== "RETURNED" && status !== "REJECTED") {
    if (status === "APPROVED" || status === "PARTIALLY_APPROVED") {
      return "La devolución ya fue aprobada.";
    }
    if (status === "ANNULLED") return "La devolución fue anulada.";
    if (status === "IN_APPROVAL") return "La devolución está siendo evaluada: no se puede editar mientras tanto.";
    return "La devolución todavía no fue enviada a aprobación.";
  }
  if (ret.editCount >= MAX_RETURN_EDITS) {
    return "Esta devolución ya fue corregida una vez. Solo se permite una corrección.";
  }
  return null;
}

export const isEditable = (ret: Return): boolean => editBlockedReason(ret) === null;

// ---- Item decisions ----------------------------------------------------------

/** One approver's ruling on one product. */
export interface ItemDecisionInput {
  productId: string;
  status: Exclude<ReturnItemStatus, "PENDING">;
  /** Required when approving; ignored when rejecting. */
  approvedMinUnits?: number;
  rejectReason?: string;
}

/**
 * Why an item ruling cannot be stored, or `null` when it can.
 *
 * Mirrors the constraint the database itself carries: approving means a
 * quantity above zero and no more than was claimed, and rejecting means no
 * quantity at all. A screen that lets someone "approve zero" is a screen that
 * produces rows the database will refuse.
 */
export function itemDecisionBlockedReason(
  line: ReturnLine,
  decision: ItemDecisionInput,
): string | null {
  if (decision.status === "REJECTED") {
    return decision.rejectReason?.trim() ? null : `${line.productName}: falta el motivo del rechazo.`;
  }
  const units = decision.approvedMinUnits ?? 0;
  if (units <= 0) {
    return `${line.productName}: para aprobar, la cantidad tiene que ser mayor a cero. Si no corresponde, rechazalo.`;
  }
  if (units > lineMinUnits(line)) {
    return `${line.productName}: no se puede aprobar más de lo solicitado.`;
  }
  return null;
}

/** Apply one ruling to a line, in the shape the model stores it. */
export function applyItemDecision(
  line: ReturnLine,
  decision: ItemDecisionInput,
  actorName: string,
  at: string,
): ReturnLine {
  if (decision.status === "REJECTED") {
    return {
      ...line,
      itemStatus: "REJECTED",
      // Never zero: a refusal is a state, and storing it as a quantity would
      // make it indistinguishable from an approval for nothing.
      approvedMinUnits: null,
      rejectReason: decision.rejectReason?.trim() ?? null,
      decisionByName: actorName,
      decisionAt: at,
    };
  }
  return {
    ...line,
    itemStatus: "APPROVED",
    approvedMinUnits: decision.approvedMinUnits ?? null,
    rejectReason: null,
    decisionByName: actorName,
    decisionAt: at,
  };
}

/** Reset every ruling — what a correction does before the flow starts over. */
export const clearItemDecisions = (lines: ReturnLine[]): ReturnLine[] =>
  lines.map((line) => ({
    ...line,
    itemStatus: "PENDING" as const,
    approvedMinUnits: null,
    rejectReason: null,
    decisionByName: null,
    decisionAt: null,
  }));

// ---- Reopening a rejected return ----------------------------------------------

/**
 * Why a correction cannot be saved, or `null` when it can.
 *
 * A return only reaches this point already `RETURNED` or `REJECTED`
 * (`editBlockedReason` above refuses every other status), and reopening one is
 * narrower than filing a new claim: whoever is holding the goods can say less
 * came back than was claimed, never that more did, and never that a product
 * stopped coming back at all. Removing the reason a level rejected it, rather
 * than admitting it, is not a correction — it is a new claim wearing the old
 * one's approvals.
 */
export function reopenLinesBlockedReason(previous: ReturnLine[], next: ReturnLine[]): string | null {
  if (next.length !== previous.length) {
    return "No se pueden agregar ni quitar productos al reabrir: solo se puede reducir la cantidad.";
  }
  const byProduct = new Map(previous.map((line) => [line.productId, line]));
  for (const line of next) {
    const before = byProduct.get(line.productId);
    if (!before) {
      return "No se pueden agregar ni quitar productos al reabrir: solo se puede reducir la cantidad.";
    }
    const claimedBefore = lineMinUnits(before);
    const claimedNow = lineMinUnits(line);
    if (claimedNow <= 0) {
      return `${line.productName}: la cantidad tiene que ser mayor a cero. Si ya no corresponde, hay que rechazarlo en la revisión, no borrarlo acá.`;
    }
    if (claimedNow > claimedBefore) {
      return `${line.productName}: no se puede pedir más de lo que ya estaba (${claimedBefore}).`;
    }
  }
  return null;
}
