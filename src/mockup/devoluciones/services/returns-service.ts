import type {
  Return,
  ReturnLine,
  ReturnSettlement,
  ReturnStatus,
  ReturnWorkflowState,
  ReturnableInvoice,
  ReturnableProduct,
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowVersion,
} from "../types";
import { SEED_CLIENTS, SEED_RETURNS } from "../data/seed";
import { PRODUCTS } from "../data/products";
import { toDateKey } from "../lib/frequency";
import { iceTotalOf, lineMinUnits, subtotalOf } from "../lib/order-math";
import { RETURN_INVOICE_WINDOW_DAYS, lineQtyBlockedReason } from "../lib/return-eligibility";
import {
  amountsOf,
  applyItemDecision,
  clearItemDecisions,
  decisionBlockedReason,
  editBlockedReason,
  itemDecisionBlockedReason,
  pendingLevelOf,
  relevantAmountOf,
  reopenLinesBlockedReason,
  sourcesBlockedReason,
  statusOf,
  workflowStateOf,
  type ItemDecisionInput,
} from "../lib/return-workflow";
import {
  approveCurrentLevel,
  commentOn,
  currentVersionOf,
  rejectCurrentLevel,
  startInstance,
} from "../lib/workflow";
import { delay, numId, seededRandom, uid } from "../lib/utils";
import { allWorkflows } from "./workflows-service";
import type { Paginated } from "./routes-service";

export interface ListReturnsParams {
  page?: number;
  limit?: number;
  /** Inclusive `YYYY-MM-DD` bounds on the date the return was registered. */
  from?: string;
  to?: string;
  /** Matches the client's name only — the rest has its own filter. */
  search?: string;
  sellerCode?: number | "all";
  status?: ReturnStatus | "all";
  distributorName?: string | "all";
  workflowState?: ReturnWorkflowState | "all";
  settlement?: ReturnSettlement | "all";
  /**
   * Narrow to returns waiting on this employee's signature.
   *
   * This is what turns the list into "Mis aprobaciones": the same resource and
   * the same filters, seen through the lens of one desk. A separate endpoint
   * would be a second way to ask the same question.
   */
  awaitingEmployeeCode?: number;
}

/**
 * In-memory mutable repository standing in for the returns REST resource — same
 * pattern as every other service here.
 */
let RETURNS: Return[] = [...SEED_RETURNS];

export interface CreateReturnInput {
  clientId: string;
  /** Seller the signed-in user acts as. Comes from the session, not a field. */
  sellerCode: number;
  sellerName: string;
  /**
   * Distributor the note is registered under. Session too, never a form field —
   * a real backend reads it off the token; here it is passed the same way the
   * seller's name is.
   */
  distributorName: string;
  /** `YYYY-MM-DD`. */
  replacementDate: string;
  justification: string;
  lines: ReturnLine[];
}

function filterReturns({
  from = "",
  to = "",
  search = "",
  sellerCode = "all",
  status = "all",
  distributorName = "all",
  workflowState = "all",
  settlement = "all",
  awaitingEmployeeCode,
}: ListReturnsParams): Return[] {
  const q = search.trim().toLowerCase();
  return RETURNS.filter((ret) => {
    const dateKey = toDateKey(new Date(ret.createdAt));
    if (from && dateKey < from) return false;
    if (to && dateKey > to) return false;
    if (sellerCode !== "all" && ret.sellerCode !== sellerCode) return false;
    if (status !== "all" && ret.status !== status) return false;
    if (distributorName !== "all" && ret.distributorName !== distributorName) return false;
    if (workflowState !== "all" && workflowStateOf(ret) !== workflowState) return false;
    if (settlement !== "all" && ret.settlement !== settlement) return false;
    if (q && !ret.clientName.toLowerCase().includes(q)) return false;
    if (awaitingEmployeeCode !== undefined) {
      // Waiting on this person specifically: assigned to the open level and not
      // having answered it yet. Somebody who already signed a quorum level must
      // drop off their own queue.
      const level = pendingLevelOf(ret);
      if (!level) return false;
      if (!level.assignees.some((a) => a.employeeCode === awaitingEmployeeCode && !a.hasActed)) {
        return false;
      }
    }
    return true;
  }).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/**
 * The template every devolución goes through, or `null` when none is published.
 *
 * There is no bracket to match any more: one flow serves every amount, and the
 * amount decides which of its levels are born active. What is left of routing is
 * this — read the mutable repository (not the frozen seed) so switching a
 * template off actually stops it catching new returns.
 */
function returnRoute(): { definition: WorkflowDefinition; version: WorkflowVersion } | null {
  const definition = allWorkflows().find((wf) => wf.targetCode === "RETURN" && wf.isActive);
  if (!definition) return null;
  const version = currentVersionOf(definition.versions);
  return version ? { definition, version } : null;
}

/** The sentence both `create` and `update` refuse with when nothing is published. */
const NO_TEMPLATE =
  "No hay ningún workflow de devoluciones publicado y activo. Revisá la configuración.";

/** Why these lines cannot be submitted, or `null` when they can. */
function linesBlockedReason(lines: ReturnLine[]): string | null {
  for (const line of lines) {
    const blocked = sourcesBlockedReason(line);
    if (blocked) return `${line.productName}: ${blocked}`;
  }
  return null;
}

// The rules live in `lib/return-workflow` so the seed, the services and the
// screens all read the same copy. Re-exported here because callers reach for
// them alongside the resource they belong to.
export { canDecide, decisionBlockedReason, editBlockedReason, isEditable } from "../lib/return-workflow";

/** The totals of a set of returned lines. A return has no discount. */
export function totalsOf(lines: ReturnLine[]) {
  const subtotal = subtotalOf(lines);
  return { subtotal, ice: iceTotalOf(lines), total: subtotal };
}

/**
 * How a settled return is liquidated, standing in for a decision the backend
 * does not take yet.
 *
 * `sale.refund_motives` is the table this will come from once returns carry a
 * motive per item; until it exists, the value has to come from somewhere, and it
 * is derived from the note's own number so a row keeps the same answer on every
 * read. A swap is the common case — a credit note is what gets issued when there
 * is no stock to give back.
 */
function settlementFor(id: number): ReturnSettlement {
  return seededRandom(id * 31 + 7)() < 0.5 ? "NOTA_CREDITO" : "CAMBIO_STOCK";
}

/** `YYYY-MM-DD`, `days` back from today. */
function dayKeyBack(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * The client's invoice history, as the ERP would answer it.
 *
 * Derived from the client's id rather than stored, exactly as `clientDetails`
 * derives its NIT: the same client always gets the same history, without a
 * hand-written record per store. A real backend replaces the body of this
 * function with one call and everything above it keeps working.
 *
 * Only part of the catalogue appears, and that is the point — a client has
 * bought what he has bought, and the picker that offers products for a return
 * must not offer what he never received.
 */
function invoicedFor(clientId: string): Map<string, ReturnableInvoice[]> {
  const rand = seededRandom(numId(clientId) * 977 + 13);
  const byProduct = new Map<string, ReturnableInvoice[]>();

  for (const product of PRODUCTS) {
    // Roughly a third of the catalogue per client: enough to have something to
    // search through, few enough that "no figura facturado" is a real answer.
    if (rand() > 0.34) continue;
    const invoiceCount = 1 + Math.floor(rand() * 3);
    const invoices: ReturnableInvoice[] = [];
    for (let i = 0; i < invoiceCount; i++) {
      const daysAgo = 1 + Math.floor(rand() * (RETURN_INVOICE_WINDOW_DAYS - 1));
      invoices.push({
        number: `F-${String(100000 + Math.floor(rand() * 899999))}`,
        date: dayKeyBack(daysAgo),
        // In minimum units, the unit every quantity in this app reduces to.
        minUnits: (1 + Math.floor(rand() * 6)) * Math.max(1, product.unitsPerCase),
      });
    }
    invoices.sort((a, b) => (a.date < b.date ? 1 : -1));
    byProduct.set(product.id, invoices);
  }

  /**
   * Backfill: whatever this client's existing returns already claim was, by
   * definition, invoiced to him — the claim would not exist otherwise.
   *
   * It runs last and only fills gaps, so a product the derived history already
   * covers keeps its real invoices. Without it a stored return would stop being
   * correctable the moment the derived history happened not to mention one of its
   * products, and a line the flow already accepted must never become ineligible.
   */
  for (const ret of RETURNS) {
    if (ret.clientId !== clientId) continue;
    for (const line of ret.lines) {
      const backing = Math.max(line.invoicedMinUnits, lineMinUnits(line));
      const invoices = byProduct.get(line.productId);
      if (!invoices) {
        byProduct.set(line.productId, [
          {
            number: `F-${String(200000 + numId(line.productId) + numId(clientId))}`,
            date: ret.createdAt.slice(0, 10),
            minUnits: backing,
          },
        ]);
        continue;
      }
      // Already covered, but possibly for less than the claim: raise the newest
      // invoice to close the gap rather than inventing another one.
      const covered = invoices.reduce((sum, inv) => sum + inv.minUnits, 0);
      if (covered < backing) invoices[0].minUnits += backing - covered;
    }
  }

  return byProduct;
}

/**
 * Minimum units of each product this client's other returns already claim.
 *
 * Rejected returns are not counted: a claim nobody granted has not consumed
 * anything. The return being corrected is excluded for the same reason — its own
 * lines must not count against the quantity it is allowed to ask for.
 */
function claimedFor(clientId: string, excludeReturnId?: number): Map<string, number> {
  const claimed = new Map<string, number>();
  for (const ret of RETURNS) {
    if (ret.clientId !== clientId) continue;
    if (ret.status === "CERRADO" || ret.status === "ANULADA") continue;
    if (excludeReturnId !== undefined && ret.id === excludeReturnId) continue;
    for (const line of ret.lines) {
      claimed.set(line.productId, (claimed.get(line.productId) ?? 0) + lineMinUnits(line));
    }
  }
  return claimed;
}

/**
 * The returnable set for a client, keyed by product.
 *
 * Both the query the form reads and the check `create`/`update` run go through
 * here, so the screen can never accept a quantity the API would refuse.
 */
function returnableMap(clientId: string, excludeReturnId?: number): Map<string, ReturnableProduct> {
  const claimed = claimedFor(clientId, excludeReturnId);
  const map = new Map<string, ReturnableProduct>();

  for (const [productId, invoices] of invoicedFor(clientId)) {
    const invoicedMinUnits = invoices.reduce((sum, inv) => sum + inv.minUnits, 0);
    const claimedMinUnits = claimed.get(productId) ?? 0;
    map.set(productId, {
      productId,
      invoicedMinUnits,
      claimedMinUnits,
      availableMinUnits: Math.max(0, invoicedMinUnits - claimedMinUnits),
      invoices,
    });
  }

  return map;
}

/**
 * Why these lines cannot be stored for this client, or `null` when they can.
 *
 * The API's own copy of the check the form already ran — named by product,
 * because "una cantidad es inválida" over twelve lines is not an error message.
 */
function ineligibleLineReason(
  clientId: string,
  lines: ReturnLine[],
  excludeReturnId?: number,
): string | null {
  const returnable = returnableMap(clientId, excludeReturnId);
  for (const line of lines) {
    const blocked = lineQtyBlockedReason(line, returnable.get(line.productId));
    if (blocked) return `${line.productName}: ${blocked}`;
  }
  return null;
}

/** Deep-enough clone so a stored return and a live form never share objects. */
const cloneLines = (lines: ReturnLine[]): ReturnLine[] =>
  lines.map((line) => ({
    ...line,
    sources: line.sources.map((source) => ({ ...source })),
    photos: [...line.photos],
  }));

export const returnsService = {
  /** Server-style paginated + filtered list (as the real API returns it). */
  listPaged: (params: ListReturnsParams = {}): Promise<Paginated<Return>> => {
    const { page = 1, limit = 10 } = params;
    const filtered = filterReturns(params);
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const data = filtered.slice((safePage - 1) * limit, safePage * limit);
    return delay({ data, pagination: { page: safePage, limit, totalItems, totalPages } }, 400);
  },

  get: (id: number): Promise<Return | undefined> =>
    delay(
      RETURNS.find((r) => r.id === id),
      300,
    ),

  /**
   * What this client is allowed to send back, product by product.
   *
   * One call per client and not one per product on purpose: the form needs the
   * whole set anyway to decide what the picker may offer, and asking again for
   * every quantity typed would put a spinner on a keystroke. The screen reads
   * this once, then every check it runs is instant and local.
   *
   * `excludeReturnId` is the return being corrected — its own lines must not
   * count as quantity already spent.
   */
  returnableProducts: ({
    clientId,
    excludeReturnId,
  }: {
    clientId: string;
    excludeReturnId?: number;
  }): Promise<ReturnableProduct[]> => {
    return delay([...returnableMap(clientId, excludeReturnId).values()], 400);
  },

  /**
   * Register a return. Amounts and the levels it will visit are the server's to
   * decide — the form sends what is coming back, not what it is worth nor who
   * has to sign it.
   */
  create: (input: CreateReturnInput): Promise<Return> => {
    const client = SEED_CLIENTS.find((c) => c.id === input.clientId);
    if (!client) return Promise.reject(new Error("El cliente ya no existe"));
    if (input.lines.length === 0) {
      return Promise.reject(new Error("Agregá al menos un producto a la devolución."));
    }
    // The quantity rule, re-checked here and not trusted from the form: nothing
    // is stored that was never invoiced to this client.
    const ineligible = ineligibleLineReason(client.id, input.lines);
    if (ineligible) return Promise.reject(new Error(ineligible));

    const unbalanced = linesBlockedReason(input.lines);
    if (unbalanced) return Promise.reject(new Error(unbalanced));

    const { subtotal, ice, total } = totalsOf(input.lines);
    const route = returnRoute();
    if (!route) return Promise.reject(new Error(NO_TEMPLATE));

    const id = Math.max(0, ...RETURNS.map((r) => r.id)) + 1;
    const lines = clearItemDecisions(cloneLines(input.lines));
    // The version is snapshotted onto the instance: republishing the template
    // tomorrow must not rewrite the rules this return was submitted under. The
    // claim is what the ladder is read against, so levels above it never open.
    const workflow = startInstance({
      id: uid("wfi"),
      definition: route.definition,
      version: route.version,
      targetCode: "RETURN",
      targetId: id,
      initiatedByName: input.sellerName,
      amount: total,
      relevantValue: total,
    });

    const ret: Return = {
      id,
      createdAt: new Date().toISOString(),
      distributorName: input.distributorName,
      clientId: client.id,
      clientName: client.name,
      clientOwnerName: client.ownerName,
      sellerCode: input.sellerCode,
      sellerName: input.sellerName,
      replacementDate: input.replacementDate,
      justification: input.justification,
      lines,
      subtotal,
      ice,
      total,
      status: "PROCESANDO",
      // Nothing is settled at registration: the goods have not been judged yet.
      settlement: null,
      workflow,
      pastWorkflows: [],
      pastLineSnapshots: [],
      approvedTotal: null,
      rejectedTotal: null,
      editCount: 0,
      originReturnId: null,
    };

    RETURNS = [ret, ...RETURNS];
    return delay(ret, 600);
  },

  /**
   * Correct a return, once.
   *
   * The correction is not a patch on a decided document: it starts the flow
   * over. The amount is recomputed and the ladder is read again — a correction
   * that drops the total under the second level's threshold genuinely activates
   * one desk now where it activated three — and a fresh instance takes over,
   * pointing back at the one it replaces. The old instance is kept rather than
   * rewritten, because what was signed over the previous set of products is
   * precisely what an audit comes looking for.
   */
  update: (id: number, input: CreateReturnInput): Promise<Return> => {
    const current = RETURNS.find((r) => r.id === id);
    if (!current) return Promise.reject(new Error("La devolución ya no existe"));
    const blocked = editBlockedReason(current);
    if (blocked) return Promise.reject(new Error(blocked));
    const client = SEED_CLIENTS.find((c) => c.id === input.clientId);
    if (!client) return Promise.reject(new Error("El cliente ya no existe"));
    if (input.lines.length === 0) {
      return Promise.reject(new Error("Agregá al menos un producto a la devolución."));
    }
    // Excluding this return: its own lines must not count as quantity spent
    // against the quantity it is allowed to claim.
    const ineligible = ineligibleLineReason(client.id, input.lines, id);
    if (ineligible) return Promise.reject(new Error(ineligible));
    const unbalanced = linesBlockedReason(input.lines);
    if (unbalanced) return Promise.reject(new Error(unbalanced));
    // A reopened return is narrower than a new claim: whoever holds the goods
    // can reduce a quantity, never add a product or ask for more than before.
    const reopenBlocked = reopenLinesBlockedReason(current.lines, input.lines);
    if (reopenBlocked) return Promise.reject(new Error(reopenBlocked));

    const { subtotal, ice, total } = totalsOf(input.lines);
    const route = returnRoute();
    if (!route) return Promise.reject(new Error(NO_TEMPLATE));

    const supersededId = current.workflow?.id ?? null;
    const workflow = startInstance({
      id: uid("wfi"),
      definition: route.definition,
      version: route.version,
      targetCode: "RETURN",
      targetId: id,
      initiatedByName: current.sellerName,
      amount: total,
      relevantValue: total,
      supersededInstanceId: supersededId,
    });

    const retired = current.workflow
      ? [{ ...current.workflow, status: "CANCELLED" as const, finishedAt: new Date().toISOString() }]
      : [];
    // What this round actually decided, frozen before `clearItemDecisions` wipes
    // `current.lines` below — otherwise the histórico for this round would show
    // every item as pending the moment it is replaced.
    const retiredSnapshot = current.workflow
      ? [{ workflowId: current.workflow.id, lines: cloneLines(current.lines) }]
      : [];

    const updated: Return = {
      ...current,
      clientId: client.id,
      clientName: client.name,
      clientOwnerName: client.ownerName,
      replacementDate: input.replacementDate,
      justification: input.justification,
      // Every ruling is dropped: they were given over a different set of goods.
      lines: clearItemDecisions(cloneLines(input.lines)),
      subtotal,
      ice,
      total,
      status: "PROCESANDO",
      // A correction sends it back through the desks, so whatever it was going
      // to be settled as is no longer decided.
      settlement: null,
      workflow,
      pastWorkflows: [...retired, ...current.pastWorkflows],
      pastLineSnapshots: [...retiredSnapshot, ...current.pastLineSnapshots],
      approvedTotal: null,
      rejectedTotal: null,
      editCount: current.editCount + 1,
    };

    RETURNS = RETURNS.map((r) => (r.id === id ? updated : r));
    return delay(updated, 600);
  },

  /** Who is signing. Read from the session, never sent as a form field. */
  approve: ({
    id,
    actor,
    comment,
    itemDecisions,
  }: {
    id: number;
    actor: { employeeCode: number; employeeName: string };
    comment: string;
    /**
     * Per-item rulings. Accepted at every level: each desk of the ladder can cut
     * quantities and refuse products, and what it leaves standing is what decides
     * whether the level above it is needed at all.
     */
    itemDecisions?: ItemDecisionInput[];
  }): Promise<Return> => {
    const current = RETURNS.find((r) => r.id === id);
    if (!current) return Promise.reject(new Error("La devolución ya no existe"));
    const blocked = decisionBlockedReason(current, actor.employeeCode);
    if (blocked) return Promise.reject(new Error(blocked));
    const instance = current.workflow;
    if (!instance) return Promise.reject(new Error("La devolución no tiene un flujo en curso"));

    const at = new Date().toISOString();
    const decided = !!itemDecisions && itemDecisions.length > 0;
    let lines = current.lines;

    if (decided) {
      for (const decision of itemDecisions) {
        const line = lines.find((l) => l.productId === decision.productId);
        if (!line) return Promise.reject(new Error("Un ítem de la decisión ya no existe."));
        const invalid = itemDecisionBlockedReason(line, decision);
        if (invalid) return Promise.reject(new Error(invalid));
      }
      lines = lines.map((line) => {
        const decision = itemDecisions.find((d) => d.productId === line.productId);
        return decision ? applyItemDecision(line, decision, actor.employeeName, at) : line;
      });
    }

    // A level cannot close over an undecided product: the figure the ladder is
    // read against would not exist, so nobody could say whether this desk is the
    // last one that needs to see it.
    if (lines.some((line) => line.itemStatus === "PENDING")) {
      return Promise.reject(
        new Error("Resolvé todos los ítems antes de confirmar: es lo que define el monto y el nivel."),
      );
    }

    // A SELECCIÓN PARCIAL — algunos ítems tildados, otros no — no recorta la devolución en el
    // lugar: los excluidos se parten en una nota disociada nueva, que queda EN_EDICIÓN esperando
    // al vendedor, mientras la devolución original sigue subiendo de nivel solo con lo aprobado.
    // Aprobación total o rechazo total (todo tildado, o nada) no dividen nada — siguen el camino
    // de siempre, más abajo.
    const approvedLines = lines.filter((l) => l.itemStatus === "APPROVED");
    const excludedLines = lines.filter((l) => l.itemStatus === "REJECTED");
    const isPartial = decided && approvedLines.length > 0 && excludedLines.length > 0;

    if (isPartial) {
      const keptLines = approvedLines;
      const before = amountsOf(current.lines).approved;
      const outcome = approveCurrentLevel(
        instance,
        actor,
        comment.trim() || null,
        at,
        relevantAmountOf(keptLines),
      );
      const amounts = amountsOf(keptLines);
      const actions = outcome.instance.actions.map((action, index) =>
        index === outcome.instance.actions.length - 1
          ? { ...action, amountBefore: before || current.total, amountAfter: amounts.approved }
          : action,
      );
      const workflow = { ...outcome.instance, actions };
      const keptTotals = totalsOf(keptLines);
      const updated: Return = {
        ...current,
        lines: keptLines,
        ...keptTotals,
        workflow,
        status: statusOf({
          workflow,
          lines: keptLines,
          editCount: current.editCount,
          originReturnId: current.originReturnId,
        }),
        settlement: outcome.finished ? settlementFor(id) : current.settlement,
        approvedTotal: outcome.finished ? amounts.approved : null,
        rejectedTotal: outcome.finished ? amounts.rejected : null,
      };

      // La nota disociada: documento nuevo, con su propio id, apuntando al original por
      // `originReturnId`. Los ítems excluidos vuelven a PENDING — no están "rechazados", están
      // esperando que el vendedor los corrija y reenvíe.
      const disociadaId = Math.max(0, ...RETURNS.map((r) => r.id)) + 1;
      const disociadaLines = clearItemDecisions(cloneLines(excludedLines));
      const disociadaTotals = totalsOf(disociadaLines);
      const route = returnRoute();
      let disociadaWorkflow: WorkflowInstance | null = null;
      if (route) {
        const started = startInstance({
          id: uid("wfi"),
          definition: route.definition,
          version: route.version,
          targetCode: "RETURN",
          targetId: disociadaId,
          initiatedByName: actor.employeeName,
          amount: disociadaTotals.total,
          relevantValue: disociadaTotals.total,
          at,
        });
        disociadaWorkflow = rejectCurrentLevel(
          started,
          actor,
          "RETURN_INITIATOR",
          "Ítems excluidos en la selección de nivel 1",
          `Proviene de la nota #${current.id}${comment.trim() ? ` - ${comment.trim()}` : ""}`,
          at,
        ).instance;
      }
      const disociada: Return = {
        ...current,
        id: disociadaId,
        originReturnId: current.id,
        lines: disociadaLines,
        ...disociadaTotals,
        justification: "",
        workflow: disociadaWorkflow,
        pastWorkflows: [],
        pastLineSnapshots: [],
        approvedTotal: null,
        rejectedTotal: null,
        editCount: 0,
        settlement: null,
        status: statusOf({
          workflow: disociadaWorkflow,
          lines: disociadaLines,
          editCount: 0,
          originReturnId: current.id,
        }),
      };

      RETURNS = [disociada, ...RETURNS.map((r) => (r.id === id ? updated : r))];
      return delay(updated, 500);
    }

    const before = amountsOf(current.lines).approved;
    const outcome = approveCurrentLevel(
      instance,
      actor,
      comment.trim() || null,
      at,
      // Recomputed after this level's rulings: the engine compares it against the
      // level's ceiling and never works it out itself.
      relevantAmountOf(lines),
    );
    const amounts = amountsOf(lines);

    // Only a decision that touched quantities moved the amount, so the trail
    // records it only there — an entry that always carried a figure would say
    // nothing.
    const actions = decided
      ? outcome.instance.actions.map((action, index) =>
          index === outcome.instance.actions.length - 1
            ? { ...action, amountBefore: before || current.total, amountAfter: amounts.approved }
            : action,
        )
      : outcome.instance.actions;

    const workflow = { ...outcome.instance, actions };
    const updated: Return = {
      ...current,
      lines,
      workflow,
      status: statusOf({
        workflow,
        lines,
        editCount: current.editCount,
        originReturnId: current.originReturnId,
      }),
      // The settlement is known the moment the last desk signs and not before,
      // which is why nothing writes it earlier. Derived from the return's own id
      // rather than drawn at random so the row does not change its "Tipo de
      // devolución" between two readings of the same list.
      settlement: outcome.finished ? settlementFor(id) : current.settlement,
      approvedTotal: outcome.finished ? amounts.approved : null,
      rejectedTotal: outcome.finished ? amounts.rejected : null,
    };

    RETURNS = RETURNS.map((r) => (r.id === id ? updated : r));
    return delay(updated, 500);
  },

  /**
   * Refuse the level the return is sitting on.
   *
   * Where it lands is the level's own `onReject` setting and never the caller's
   * choice — that setting exists precisely so one button means different things
   * on different desks.
   */
  reject: ({
    id,
    actor,
    reason,
    comment,
  }: {
    id: number;
    actor: { employeeCode: number; employeeName: string };
    reason: string;
    comment?: string;
  }): Promise<Return> => {
    const current = RETURNS.find((r) => r.id === id);
    if (!current) return Promise.reject(new Error("La devolución ya no existe"));
    const blocked = decisionBlockedReason(current, actor.employeeCode);
    if (blocked) return Promise.reject(new Error(blocked));
    const instance = current.workflow;
    if (!instance) return Promise.reject(new Error("La devolución no tiene un flujo en curso"));
    if (!reason.trim()) {
      return Promise.reject(new Error("Indicá el motivo del rechazo: es lo que el vendedor lee para corregir."));
    }

    const level = pendingLevelOf(current);
    const onReject = levelOnRejectOf(current, level?.order ?? null);
    const outcome = rejectCurrentLevel(
      instance,
      actor,
      onReject,
      reason.trim(),
      comment?.trim() || null,
    );

    const updated: Return = {
      ...current,
      workflow: outcome.instance,
      status: statusOf({
        workflow: outcome.instance,
        lines: current.lines,
        editCount: current.editCount,
        originReturnId: current.originReturnId,
      }),
    };

    RETURNS = RETURNS.map((r) => (r.id === id ? updated : r));
    return delay(updated, 500);
  },

  /** Leave a note without deciding. Unlimited, unlike a signature. */
  comment: ({
    id,
    actor,
    comment,
  }: {
    id: number;
    actor: { employeeCode: number; employeeName: string };
    comment: string;
  }): Promise<Return> => {
    const current = RETURNS.find((r) => r.id === id);
    if (!current) return Promise.reject(new Error("La devolución ya no existe"));
    if (!current.workflow) return Promise.reject(new Error("La devolución no tiene un flujo en curso"));
    if (!comment.trim()) return Promise.reject(new Error("Escribí el comentario."));

    const workflow = commentOn(current.workflow, actor, comment.trim());
    const updated: Return = { ...current, workflow };
    RETURNS = RETURNS.map((r) => (r.id === id ? updated : r));
    return delay(updated, 400);
  },
};

/**
 * The `onReject` the running level was published with.
 *
 * Read off the definition rather than the instance because the instance
 * snapshots the policy and the SLA but not this — and defaulting to `TERMINATE`
 * is the safe reading: a flow whose configuration cannot be resolved must not
 * silently hand a rejected return back as if it were correctable.
 */
function levelOnRejectOf(ret: Return, levelOrder: number | null) {
  if (!ret.workflow || levelOrder === null) return "TERMINATE" as const;
  const definition = allWorkflows().find((wf) => wf.id === ret.workflow?.definitionId);
  const version = definition?.versions.find((v) => v.id === ret.workflow?.versionId);
  return version?.levels.find((l) => l.order === levelOrder)?.onReject ?? ("TERMINATE" as const);
}
