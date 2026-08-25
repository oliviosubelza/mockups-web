import type {
  WorkflowApprover,
  WorkflowDefinition,
  WorkflowLevel,
  WorkflowTargetType,
  WorkflowVersion,
} from "../types";

/**
 * The approval templates, as the backend seeds them.
 *
 * One of them is the flow the database ships with for devoluciones — a single
 * template whose three levels are activated by amount — and the other exists to
 * prove the engine is not returns-only. They are written by hand rather than
 * generated from the PRNG because a workflow is a decision somebody made, not a
 * sample: the thresholds and what each desk does when it refuses are the facts
 * the whole approver experience is built on.
 */

export const WORKFLOW_TARGET_TYPES: WorkflowTargetType[] = [
  { code: "RETURN", name: "Aprobación de devolución", tableName: "sale.refund_orders" },
  { code: "CUSTOMER", name: "Aprobación de cliente", tableName: "sale.customers" },
];

/**
 * People who sign approvals.
 *
 * Kept apart from `SEED_SELLERS` because an approver is not a seller: these are
 * desk roles — supervision, sales management, credit — and the only one who ever
 * overlaps with the field is the supervisor.
 */
export interface ApproverEmployee {
  code: number;
  name: string;
  area: string;
}

export const APPROVER_EMPLOYEES: ApproverEmployee[] = [
  { code: 55, name: "Rocío Áñez Peredo", area: "Supervisión de ventas" },
  { code: 57, name: "Sergio Peña Montero", area: "Supervisión de ventas" },
  { code: 70, name: "Marcelo Áñez Suárez", area: "Jefatura de ventas" },
  { code: 72, name: "Daniel Durán Melgar", area: "Jefatura de ventas" },
  { code: 88, name: "Patricia Vargas Ledezma", area: "Créditos y cobranzas" },
  { code: 89, name: "Luis Fernando Tapia", area: "Créditos y cobranzas" },
  { code: 91, name: "Gabriela Montaño Suárez", area: "Créditos y cobranzas" },
  // Sits on the credit committee as well as running commercial administration,
  // which is what gives the manager role a queue of returns to answer.
  { code: 94, name: "Rocío Justiniano Áñez", area: "Créditos y cobranzas" },
];

export const approverByCode = (code: number): ApproverEmployee | undefined =>
  APPROVER_EMPLOYEES.find((e) => e.code === code);

/** `YYYY-MM-DDTHH:mm:ss.sssZ`, `days` back from now. */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

let approverSeq = 0;

/** An employee approver, the only assignment kind the model can store today. */
function employeeApprover(code: number): WorkflowApprover {
  const employee = approverByCode(code);
  approverSeq += 1;
  return {
    id: `wfa_${approverSeq}`,
    assigneeType: "EMPLOYEE",
    employeeCode: code,
    employeeName: employee?.name ?? `Empleado ${code}`,
    employeeArea: employee?.area ?? null,
    assigneeRefId: null,
  };
}

let levelSeq = 0;

function level(input: Omit<WorkflowLevel, "id" | "approvers"> & { approverCodes: number[] }): WorkflowLevel {
  levelSeq += 1;
  const { approverCodes, ...rest } = input;
  return { ...rest, id: `wfl_${levelSeq}`, approvers: approverCodes.map(employeeApprover) };
}

/**
 * The single devolución flow: three desks, each activated by a band of amounts.
 *
 * The thresholds mirror `sale.refund_level_thresholds` as the database seeds it
 * — 0, 500 and 2.000 — and every level decides items, so a desk that cuts the
 * claim under its own ceiling is the last one to see it. The supervisor is the
 * only one who can hand the document back to the seller; above that a refusal
 * closes it, because a return that keeps bouncing between three desks and the
 * field never gets paid.
 */
const returnLevels = (): WorkflowLevel[] => [
  level({
    order: 1,
    name: "Supervisor",
    approvalPolicy: "ANY",
    requiredApprovals: 1,
    onReject: "RETURN_INITIATOR",
    allowReturn: true,
    slaHours: 24,
    // Zero and not one cent more: the first level has to catch every amount, or
    // a small devolución would activate no desk at all.
    activationMinAmount: 0,
    approverCodes: [55, 57],
  }),
  level({
    order: 2,
    name: "Jefe de Ventas",
    approvalPolicy: "ANY",
    requiredApprovals: 1,
    onReject: "TERMINATE",
    allowReturn: true,
    slaHours: null,
    activationMinAmount: 500,
    approverCodes: [70, 72],
  }),
  level({
    order: 3,
    name: "Gerencia",
    approvalPolicy: "ANY",
    requiredApprovals: 1,
    onReject: "TERMINATE",
    allowReturn: false,
    slaHours: 48,
    activationMinAmount: 2000,
    approverCodes: [88, 94],
  }),
];

/**
 * The customer flow, and the reason `activationMinAmount` is nullable.
 *
 * A cliente has no total, so there is no ladder to read: both levels always run,
 * and the engine falls back to plain sequential advance.
 */
const customerLevels = (): WorkflowLevel[] => [
  level({
    order: 1,
    name: "Supervisor de zona",
    approvalPolicy: "ANY",
    requiredApprovals: 1,
    onReject: "RETURN_INITIATOR",
    allowReturn: true,
    slaHours: 48,
    activationMinAmount: null,
    approverCodes: [55],
  }),
  level({
    order: 2,
    name: "Administración comercial",
    approvalPolicy: "ANY",
    requiredApprovals: 1,
    onReject: "TERMINATE",
    allowReturn: true,
    slaHours: null,
    activationMinAmount: null,
    approverCodes: [94],
  }),
];

function version(input: Omit<WorkflowVersion, "id">, id: string): WorkflowVersion {
  return { ...input, id };
}

export const SEED_WORKFLOWS: WorkflowDefinition[] = [
  {
    id: "wf_001",
    name: "Devolución · tramos por monto",
    description:
      "Niveles activados por monto; cada nivel puede aprobar parcialmente los ítems.",
    targetCode: "RETURN",
    isActive: true,
    currentVersionId: "wfv_001_3",
    updatedAt: daysAgo(2),
    updatedByName: "Rocío Áñez Peredo",
    versions: [
      version(
        {
          versionNumber: 3,
          status: "published",
          isCurrent: true,
          publishedAt: daysAgo(48),
          levels: returnLevels(),
        },
        "wfv_001_3",
      ),
      // Somebody left work unpublished. The list surfaces it precisely so it
      // does not sit here unnoticed for a month.
      version(
        {
          versionNumber: 4,
          status: "draft",
          isCurrent: false,
          publishedAt: null,
          levels: returnLevels(),
        },
        "wfv_001_4",
      ),
    ],
  },
  {
    id: "wf_003",
    name: "Alta de cliente",
    description: "Validación comercial de un cliente nuevo antes de habilitarlo.",
    targetCode: "CUSTOMER",
    isActive: false,
    currentVersionId: "wfv_003_2",
    updatedAt: daysAgo(122),
    updatedByName: "Rocío Áñez Peredo",
    versions: [
      version(
        {
          versionNumber: 2,
          status: "published",
          isCurrent: true,
          publishedAt: daysAgo(122),
          levels: customerLevels(),
        },
        "wfv_003_2",
      ),
    ],
  },
];
