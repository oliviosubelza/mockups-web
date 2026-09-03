import { keepPreviousData, useMutation, useQuery, useQueryClient } from "../lib/query-lite";
import { toast } from "sonner";
import type { Return } from "../types";
import { returnsService, type ListReturnsParams } from "../services/returns-service";
import type { ItemDecisionInput } from "../lib/return-workflow";
import { pendingLevelOf } from "../lib/return-workflow";
import { queryKeys } from "../lib/query-client";

// Solo hay tres cosas que este módulo le pide al servicio: la bandeja, un documento y la DECISIÓN.
//
// Los hooks de alta y corrección (`useCreateReturn`, `useUpdateReturn`, `useReturnableProducts`) se
// fueron con el formulario: la devolución la registra Ventas contra `returnsService.create`, que
// sigue existiendo porque es el contrato que ellos consumen — lo que ya no existe es una pantalla
// nuestra que lo llame.
//
// `useMyApprovals` también se fue: era la misma consulta que la bandeja con `awaitingEmployeeCode`
// fijo. Ahora eso es un filtro visible de la lista y no un hook aparte que hace la misma pregunta.

/** Quién firma. Sale de la sesión, nunca de un campo del formulario. */
export interface ApprovalActor {
  employeeCode: number;
  employeeName: string;
}

/** La bandeja: devoluciones paginadas y filtradas. Conserva la página anterior mientras refetchea. */
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
 * Firmar el nivel en el que está parada la devolución.
 *
 * Las decisiones por ítem viajan CON la firma y no en una llamada aparte: son la misma decisión, y
 * guardarlas por separado dejaría una devolución con las cantidades recortadas por alguien que nunca
 * la aprobó.
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
      // Aprobar pasándola al escritorio siguiente no es la misma noticia que aprobar cerrándola, y
      // el aprobador necesita saber cuál de las dos dio.
      const next = pendingLevelOf(ret);
      toast.success(
        next
          ? `Aprobada, pasa a ${next.name}`
          : ret.approvedTotal !== null && ret.approvedTotal < ret.total
            ? "Devolución aprobada parcialmente"
            : "Devolución aprobada",
        { description: `Código ${ret.id}` },
      );
    },
    onError: (e) => toast.error("No se pudo registrar la decisión", { description: e.message }),
  });
}

/** Rechazar el nivel en el que está. Dónde cae la devolución lo decide el `on_reject` del nivel. */
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
        ret.status === "REVERTIDO" ? "Devuelta al vendedor para corregir" : "Devolución rechazada",
        { description: `Código ${ret.id}` },
      );
    },
    onError: (e) => toast.error("No se pudo registrar la decisión", { description: e.message }),
  });
}

/**
 * Reactivar una devolución rechazada: la misma nota vuelve a subir la escalera.
 *
 * No es la corrección (`update`): el reclamo no cambia, así que no hay pantalla de edición de por
 * medio y el vendedor no interviene. Por eso alcanza con el motivo.
 */
export function useReactivateReturn() {
  const qc = useQueryClient();
  return useMutation<
    Return,
    Error,
    { id: number; actor: ApprovalActor; reason: string; photos: string[] }
  >({
    mutationFn: (input) => returnsService.reactivate(input),
    onSuccess: (ret) => {
      qc.invalidateQueries({ queryKey: queryKeys.returns });
      const next = pendingLevelOf(ret);
      toast.success(next ? `Reactivada, vuelve a ${next.name}` : "Devolución reactivada", {
        description: `Código ${ret.id}`,
      });
    },
    onError: (e) => toast.error("No se pudo reactivar la devolución", { description: e.message }),
  });
}
