import { keepPreviousData, useMutation, useQuery, useQueryClient } from "../lib/query-lite";
import { toast } from "sonner";
import type {
  Order,
  OrderCancelReason,
  OrderIncentives,
  OrderLine,
  OrderPaymentMethod,
} from "../types";
import {
  ordersService,
  type CreateOrderInput,
  type ListOrdersParams,
} from "../services/orders-service";
import { queryKeys } from "../lib/query-client";

/** Paginated + filtered orders. Keeps the prior page while refetching. */
export function useOrdersPaged(params: ListOrdersParams) {
  return useQuery({
    queryKey: queryKeys.ordersPaged(params as Record<string, unknown>),
    queryFn: () => ordersService.listPaged(params),
    placeholderData: keepPreviousData,
  });
}

/** The same orders, split into the document each company issues. */
export function useSplitOrdersPaged(params: ListOrdersParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.ordersSplitPaged(params as Record<string, unknown>),
    queryFn: () => ordersService.listSplitPaged(params),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useOrder(id: number | undefined) {
  return useQuery({
    queryKey: queryKeys.order(id ?? "none"),
    queryFn: () => ordersService.get(id as number),
    enabled: id != null,
  });
}

/** Invoicing and delivery data for the client chosen in the order form. */
export function useOrderClientDetails(clientId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.orderClientDetails(clientId ?? "none"),
    queryFn: () => ordersService.clientDetails(clientId as string),
    enabled: !!clientId,
  });
}

/**
 * Value the order. A mutation and not a query on purpose: it runs when the
 * user asks for it, and its answer is held by the form until the lines change.
 */
export function useApplyIncentives() {
  return useMutation<
    OrderIncentives,
    Error,
    { lines: OrderLine[]; paymentMethod: OrderPaymentMethod }
  >({
    mutationFn: (params) => ordersService.fetchIncentives(params),
    onError: (e) =>
      toast.error("No se pudieron obtener los descuentos", { description: e.message }),
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation<Order, Error, CreateOrderInput>({
    mutationFn: (input) => ordersService.create(input),
    onSuccess: (order) => {
      qc.invalidateQueries({ queryKey: queryKeys.orders });
      toast.success("Pedido registrado", {
        description: `Código ${order.id} · ${order.clientName}`,
      });
    },
    onError: (e) => toast.error("No se pudo registrar el pedido", { description: e.message }),
  });
}

export function useUpdateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: CreateOrderInput }) =>
      ordersService.update(id, input),
    onSuccess: (order) => {
      qc.invalidateQueries({ queryKey: queryKeys.orders });
      toast.success("Pedido actualizado", { description: `Código ${order.id}` });
    },
    onError: (e: Error) => toast.error("No se pudo actualizar el pedido", { description: e.message }),
  });
}

export function useCancelOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: OrderCancelReason }) =>
      ordersService.cancel(id, reason),
    onSuccess: (order) => {
      qc.invalidateQueries({ queryKey: queryKeys.orders });
      toast.success("Pedido anulado", { description: `Código ${order.id}` });
    },
    onError: (e: Error) => toast.error("No se pudo anular el pedido", { description: e.message }),
  });
}
