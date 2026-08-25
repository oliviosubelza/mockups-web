import type {
  WorkflowDefinition,
  WorkflowTargetCode,
  WorkflowVersion,
} from "../types";
import { SEED_WORKFLOWS, WORKFLOW_TARGET_TYPES } from "../data/workflows-data";
import { currentVersionOf, draftVersionOf } from "../lib/workflow";
import { bs } from "../lib/format";
import { delay, uid } from "../lib/utils";
import type { Paginated } from "./routes-service";

/**
 * In-memory mutable repository standing in for the workflows REST resource —
 * same pattern as every other service here. Replace the method bodies with
 * `fetch` keeping these signatures and nothing above this file changes.
 */
let WORKFLOWS: WorkflowDefinition[] = [...SEED_WORKFLOWS];

export interface ListWorkflowsParams {
  page?: number;
  limit?: number;
  search?: string;
  target?: WorkflowTargetCode | "all";
  status?: "active" | "inactive" | "all";
}

function filterWorkflows({
  search = "",
  target = "all",
  status = "all",
}: ListWorkflowsParams): WorkflowDefinition[] {
  const q = search.trim().toLowerCase();
  return WORKFLOWS.filter((wf) => {
    if (target !== "all" && wf.targetCode !== target) return false;
    if (status === "active" && !wf.isActive) return false;
    if (status === "inactive" && wf.isActive) return false;
    if (q && !wf.name.toLowerCase().includes(q) && !wf.description.toLowerCase().includes(q)) {
      return false;
    }
    return true;
  }).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

/** Deep-enough clone so a stored version and a live builder never share objects. */
function cloneVersion(version: WorkflowVersion, id: string, versionNumber: number): WorkflowVersion {
  return {
    id,
    versionNumber,
    status: "draft",
    isCurrent: false,
    publishedAt: null,
    levels: version.levels.map((level, levelIndex) => ({
      ...level,
      id: `${id}_l${levelIndex + 1}`,
      approvers: level.approvers.map((approver, approverIndex) => ({
        ...approver,
        id: `${id}_l${levelIndex + 1}_a${approverIndex + 1}`,
      })),
    })),
  };
}

/**
 * Why this version cannot be published, or `null` when it can.
 *
 * One function for the rule and its explanation, so the builder disables the
 * action with exactly the sentence the service would refuse it with.
 *
 * The last two checks only apply to devoluciones, because only devoluciones have
 * an amount ladder. They are not cosmetic: a first level that does not start at
 * zero leaves small returns activating no desk at all, and a threshold that does
 * not grow with the level order describes a ladder the engine cannot climb.
 */
export function publishBlockedReason(
  version: WorkflowVersion,
  targetCode: WorkflowTargetCode,
): string | null {
  if (version.status !== "draft") return "Esta versión ya fue publicada.";
  if (version.levels.length === 0) return "Agregá al menos un nivel antes de publicar.";
  const emptyLevel = version.levels.find((l) => l.approvers.length === 0);
  if (emptyLevel) return `El nivel «${emptyLevel.name}» no tiene aprobadores.`;
  const shortQuorum = version.levels.find(
    (l) => l.approvalPolicy === "QUORUM" && l.requiredApprovals > l.approvers.length,
  );
  if (shortQuorum) {
    return `El nivel «${shortQuorum.name}» pide más firmas que aprobadores tiene.`;
  }

  if (targetCode === "RETURN") {
    const ladder = [...version.levels].sort((a, b) => a.order - b.order);
    const missing = ladder.find((l) => l.activationMinAmount === null);
    if (missing) return `Indicá desde qué monto decide el nivel «${missing.name}».`;
    if (ladder[0].activationMinAmount !== 0) {
      return `El primer nivel tiene que decidir desde Bs 0,00: si arranca en ${bs(
        ladder[0].activationMinAmount as number,
      )}, una devolución más chica no activaría ningún nivel.`;
    }
    for (let i = 1; i < ladder.length; i++) {
      const previous = ladder[i - 1].activationMinAmount as number;
      const current = ladder[i].activationMinAmount as number;
      if (current <= previous) {
        return `El nivel «${ladder[i].name}» tiene que decidir desde un monto mayor que «${ladder[i - 1].name}» (${bs(previous)}).`;
      }
    }
  }

  return null;
}

export const workflowsService = {
  /** Server-style paginated + filtered list (as the real API returns it). */
  listPaged: (params: ListWorkflowsParams = {}): Promise<Paginated<WorkflowDefinition>> => {
    const { page = 1, limit = 10 } = params;
    const filtered = filterWorkflows(params);
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const data = filtered.slice((safePage - 1) * limit, safePage * limit);
    return delay({ data, pagination: { page: safePage, limit, totalItems, totalPages } }, 400);
  },

  get: (id: string): Promise<WorkflowDefinition | undefined> =>
    delay(
      WORKFLOWS.find((wf) => wf.id === id),
      300,
    ),

  targetTypes: () => delay(WORKFLOW_TARGET_TYPES, 200),

  /**
   * Create a template and its first draft.
   *
   * There is no workflow without a version — the model cannot express one — so
   * creating always lands the user in the builder with something to configure.
   * `copyFromId` starts that draft from an existing flow, which is how most real
   * templates get written: as a variation of one that already works.
   */
  create: (input: {
    name: string;
    description: string;
    targetCode: WorkflowTargetCode;
    copyFromId?: string;
    actorName: string;
  }): Promise<WorkflowDefinition> => {
    const source = input.copyFromId
      ? WORKFLOWS.find((wf) => wf.id === input.copyFromId)
      : undefined;
    const sourceVersion = source
      ? (currentVersionOf(source.versions) ?? source.versions[0])
      : undefined;

    const id = uid("wf");
    const versionId = `${id}_v1`;
    const version: WorkflowVersion = sourceVersion
      ? cloneVersion(sourceVersion, versionId, 1)
      : { id: versionId, versionNumber: 1, status: "draft", isCurrent: false, publishedAt: null, levels: [] };

    const definition: WorkflowDefinition = {
      id,
      name: input.name.trim(),
      description: input.description.trim(),
      targetCode: input.targetCode,
      isActive: true,
      versions: [version],
      currentVersionId: null,
      updatedAt: new Date().toISOString(),
      updatedByName: input.actorName,
    };

    WORKFLOWS = [definition, ...WORKFLOWS];
    return delay(definition, 600);
  },

  /**
   * Open a new draft from the published version.
   *
   * This is what "editar" means once a workflow is live: the published shape is
   * immutable because instances in flight still point at it, so editing forks it
   * and leaves everything already running untouched.
   */
  createDraft: (definitionId: string, actorName: string): Promise<WorkflowVersion> => {
    const definition = WORKFLOWS.find((wf) => wf.id === definitionId);
    if (!definition) return Promise.reject(new Error("El workflow ya no existe"));

    const existingDraft = draftVersionOf(definition.versions);
    if (existingDraft) return delay(existingDraft, 300);

    const base = currentVersionOf(definition.versions) ?? definition.versions[0];
    const nextNumber = Math.max(...definition.versions.map((v) => v.versionNumber)) + 1;
    const draft = cloneVersion(base, `${definitionId}_v${nextNumber}`, nextNumber);

    const updated: WorkflowDefinition = {
      ...definition,
      versions: [...definition.versions, draft],
      updatedAt: new Date().toISOString(),
      updatedByName: actorName,
    };
    WORKFLOWS = WORKFLOWS.map((wf) => (wf.id === definitionId ? updated : wf));
    return delay(draft, 500);
  },

  /** Overwrite a draft's levels. Published versions refuse the write. */
  saveDraft: (
    definitionId: string,
    versionId: string,
    levels: WorkflowVersion["levels"],
    actorName: string,
  ): Promise<WorkflowVersion> => {
    const definition = WORKFLOWS.find((wf) => wf.id === definitionId);
    if (!definition) return Promise.reject(new Error("El workflow ya no existe"));
    const version = definition.versions.find((v) => v.id === versionId);
    if (!version) return Promise.reject(new Error("La versión ya no existe"));
    if (version.status !== "draft") {
      return Promise.reject(
        new Error("Una versión publicada no se puede modificar. Creá un borrador nuevo."),
      );
    }

    // Positions are the service's to assign: a screen that reorders by drag
    // sends the array in the new order and never has to renumber it itself.
    const renumbered = levels.map((level, index) => ({ ...level, order: index + 1 }));
    const saved: WorkflowVersion = { ...version, levels: renumbered };

    const updated: WorkflowDefinition = {
      ...definition,
      versions: definition.versions.map((v) => (v.id === versionId ? saved : v)),
      updatedAt: new Date().toISOString(),
      updatedByName: actorName,
    };
    WORKFLOWS = WORKFLOWS.map((wf) => (wf.id === definitionId ? updated : wf));
    return delay(saved, 500);
  },

  /**
   * Publish a draft and retire the version it replaces.
   *
   * The old version is archived rather than deleted: instances started under it
   * keep pointing at it, and a trail that cannot resolve the rules a signature
   * was given under is not a trail.
   */
  publish: (definitionId: string, versionId: string, actorName: string): Promise<WorkflowDefinition> => {
    const definition = WORKFLOWS.find((wf) => wf.id === definitionId);
    if (!definition) return Promise.reject(new Error("El workflow ya no existe"));
    const version = definition.versions.find((v) => v.id === versionId);
    if (!version) return Promise.reject(new Error("La versión ya no existe"));
    const blocked = publishBlockedReason(version, definition.targetCode);
    if (blocked) return Promise.reject(new Error(blocked));

    const now = new Date().toISOString();
    const updated: WorkflowDefinition = {
      ...definition,
      currentVersionId: versionId,
      updatedAt: now,
      updatedByName: actorName,
      versions: definition.versions.map((v) => {
        if (v.id === versionId) {
          return { ...v, status: "published" as const, isCurrent: true, publishedAt: now };
        }
        if (v.isCurrent) return { ...v, status: "archived" as const, isCurrent: false };
        return v;
      }),
    };

    WORKFLOWS = WORKFLOWS.map((wf) => (wf.id === definitionId ? updated : wf));
    return delay(updated, 600);
  },

  /** Discard an unpublished draft. */
  discardDraft: (definitionId: string, versionId: string): Promise<WorkflowDefinition> => {
    const definition = WORKFLOWS.find((wf) => wf.id === definitionId);
    if (!definition) return Promise.reject(new Error("El workflow ya no existe"));
    const version = definition.versions.find((v) => v.id === versionId);
    if (!version) return Promise.reject(new Error("La versión ya no existe"));
    if (version.status !== "draft") {
      return Promise.reject(new Error("Solo se puede descartar un borrador."));
    }

    const updated: WorkflowDefinition = {
      ...definition,
      versions: definition.versions.filter((v) => v.id !== versionId),
    };
    WORKFLOWS = WORKFLOWS.map((wf) => (wf.id === definitionId ? updated : wf));
    return delay(updated, 400);
  },

  setActive: (definitionId: string, isActive: boolean): Promise<WorkflowDefinition> => {
    const definition = WORKFLOWS.find((wf) => wf.id === definitionId);
    if (!definition) return Promise.reject(new Error("El workflow ya no existe"));
    const updated = { ...definition, isActive, updatedAt: new Date().toISOString() };
    WORKFLOWS = WORKFLOWS.map((wf) => (wf.id === definitionId ? updated : wf));
    return delay(updated, 400);
  },
};

/** Read-only view of the repository, for services that route through it. */
export const allWorkflows = (): WorkflowDefinition[] => WORKFLOWS;
