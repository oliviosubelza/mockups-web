import { keepPreviousData, useMutation, useQuery, useQueryClient } from "../lib/query-lite";
import { toast } from "sonner";
import type { Return } from "../types";
import {
  returnsService,
  type CreateReturnInput,
  type ListReturnsParams,
} from "../services/returns-service";
import type { ItemDecisionInput } from "../lib/return-workflow";
import { pendingLevelOf } from "../lib/return-workflow";
import { applicableLevelsOf } from "../lib/workflow";
import { queryKeys } from "../lib/query-client";

/** Who is signing, taken from the session and never from a form field. */
export interface ApprovalActor {
  employeeCode: number;
  employeeName: string;
}

/** Paginated + filtered returns. Keeps the prior page while refetching. */
export function useReturnsPaged(params: ListReturnsParams) {
  return useQuery({
    queryKey: queryKeys.returnsPaged(params as Record<string, unknown>),
    queryFn: () => returnsService.listPaged(params),
    placeholderData: keepPreviousData,
  });
}

export function useReturn(id: number | undefined) {
  return useQuery({
    queryKey: queryKeys.return(id ?? "none"),
    queryFn: () => returnsService.get(id as number),
    enabled: id != null,
  });
}

/**
 * What the client is allowed to send back, keyed by product.
 *
 * One query per client, cached: the form asks for the invoice history once when
 * the client is chosen and every quantity check afterwards runs against this
 * answer in memory. A map rather than the array the service returns, because the
 * only thing anyone ever does with it is look one product up.
 */
export function useReturnableProducts(clientId: string | undefined, excludeReturnId?: number) {
  return useQuery({
    queryKey: queryKeys.returnableProducts(clientId ?? "none", excludeReturnId ?? "none"),
    queryFn: () =>
      returnsService.returnableProducts({ clientId: clientId as string, excludeReturnId }),
    enabled: !!clientId,
    select: (products) => new Map(products.map((p) => [p.productId, p])),
  });
}

export function useCreateReturn() {
  const qc = useQueryClient();
  return useMutation<Return, Error, CreateReturnInput>({
    mutationFn: (input) => returnsService.create(input),
    onSuccess: (ret) => {
      qc.invalidateQueries({ queryKey: queryKeys.returns });
      // Only the desks this devolución will actually cross, and never the name
      // of the template that decided them: how many people still have to sign is
      // the question; which configuration produced them is not.
      const levels = ret.workflow ? applicableLevelsOf(ret.workflow).length : 0;
      toast.success("Devolución registrada", {
        description: `Código ${ret.id} · ${levels} ${levels === 1 ? "nivel de aprobación" : "niveles de aprobación"}`,
      });
    },
    onError: (e) => toast.error("No se pudo registrar la devolución", { description: e.message }),
  });
}

export function useUpdateReturn() {
  const qc = useQueryClient();
  return useMutation<Return, Error, { id: number; input: CreateReturnInput }>({
    mutationFn: ({ id, input }) => returnsService.update(id, input),
    onSuccess: (ret) => {
      qc.invalidateQueries({ queryKey: queryKeys.returns });
      toast.success("Devolución corregida", {
        description: `Código ${ret.id} · vuelve a empezar el flujo de aprobación`,
      });
    },
    onError: (e) => toast.error("No se pudo corregir la devolución", { description: e.message }),
  });
}

/**
 * Returns waiting on this employee's signature.
 *
 * The same resource and the same filters as the full list, seen through one
 * desk. `employeeCode` is undefined for a seller, and the query simply stays
 * disabled rather than showing somebody else's queue.
 */
export function useMyApprovals(employeeCode: number | undefined, params: ListReturnsParams = {}) {
  const merged = { ...params, awaitingEmployeeCode: employeeCode };
  return useQuery({
    queryKey: queryKeys.returnsPaged(merged as Record<string, unknown>),
    queryFn: () => returnsService.listPaged(merged),
    enabled: employeeCode != null,
    placeholderData: keepPreviousData,
  });
}

/**
 * Sign the level the return is currently on.
 *
 * The item rulings travel with the signature rather than in a call of their own:
 * they are the same decision, and saving them separately would leave a return
 * whose quantities were cut by somebody who never actually approved it.
 */
export function useApproveReturn() {
  const qc = useQueryClient();
  return useMutation<
    Return,
    Error,
    { id: number; actor: ApprovalActor; comment: string; itemDecisions?: ItemDecisionInput[] }
  >({
    mutationFn: (input) => returnsService.approve(input),
    onSuccess: (ret) => {
      qc.invalidateQueries({ queryKey: queryKeys.returns });
      // An approval that hands the return to the next desk is not the same news
      // as one that closes it, and the approver needs to know which they gave.
      const next = pendingLevelOf(ret);
      toast.success(
        next
          ? `Aprobada, pasa a ${next.name}`
          : ret.status === "PARTIALLY_APPROVED"
            ? "Devolución aprobada parcialmente"
            : "Devolución aprobada",
        { description: `Código ${ret.id}` },
      );
    },
    onError: (e) => toast.error("No se pudo registrar la decisión", { description: e.message }),
  });
}

/** Refuse the level the return is on. Where it lands is the level's own setting. */
export function useRejectReturn() {
  const qc = useQueryClient();
  return useMutation<
    Return,
    Error,
    { id: number; actor: ApprovalActor; reason: string; comment?: string }
  >({
    mutationFn: (input) => returnsService.reject(input),
    onSuccess: (ret) => {
      qc.invalidateQueries({ queryKey: queryKeys.returns });
      toast.success(
        ret.status === "RETURNED" ? "Devuelta al vendedor para corregir" : "Devolución rechazada",
        { description: `Código ${ret.id}` },
      );
    },
    onError: (e) => toast.error("No se pudo registrar la decisión", { description: e.message }),
  });
}

/** Leave a note on the trail without deciding anything. */
export function useCommentReturn() {
  const qc = useQueryClient();
  return useMutation<Return, Error, { id: number; actor: ApprovalActor; comment: string }>({
    mutationFn: (input) => returnsService.comment(input),
    onSuccess: (ret) => {
      qc.invalidateQueries({ queryKey: queryKeys.return(ret.id) });
      toast.success("Comentario agregado al histórico");
    },
    onError: (e) => toast.error("No se pudo agregar el comentario", { description: e.message }),
  });
}
