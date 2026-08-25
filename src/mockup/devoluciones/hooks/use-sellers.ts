import { keepPreviousData, useMutation, useQuery, useQueryClient } from "../lib/query-lite";
import { toast } from "sonner";
import type { Seller, SellerRouteAssignment, SellerStatus } from "../types";
import { sellersService, type ListSellersParams } from "../services/sellers-service";
import { clientTasksService } from "../services/client-tasks-service";
import { queryKeys } from "../lib/query-client";

export interface UseSellersPagedParams {
  page: number;
  limit: number;
  status: SellerStatus | "all";
  search: string;
}

/** All sellers (for cross-cutting views like the routes metrics map). */
export function useAllSellers() {
  return useQuery({
    queryKey: queryKeys.sellers,
    queryFn: sellersService.list,
  });
}

/** Paginated + filtered sellers for the list view. Keeps prior page while fetching. */
export function useSellersPaged(params: UseSellersPagedParams) {
  return useQuery({
    queryKey: queryKeys.sellersPaged(params),
    queryFn: () => sellersService.listPaged(params as ListSellersParams),
    placeholderData: keepPreviousData,
  });
}

export function useSeller(code: number | undefined) {
  return useQuery({
    queryKey: queryKeys.seller(code ?? "new"),
    queryFn: () => sellersService.get(code as number),
    enabled: code !== undefined,
  });
}

export function useSellerDetail(code: number | undefined) {
  return useQuery({
    queryKey: queryKeys.sellerDetail(code ?? "new"),
    queryFn: () => sellersService.getDetail(code as number),
    enabled: code !== undefined,
  });
}

/** Tasks completed by a single employee (seller), across customers. */
export function useSellerCompletions(code: number | undefined) {
  return useQuery({
    queryKey: queryKeys.sellerCompletions(code ?? "none"),
    queryFn: () => clientTasksService.listCompletionsByEmployee(code as number),
    enabled: code !== undefined,
  });
}

export function useSetSellerStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ code, status }: { code: number; status: SellerStatus }) =>
      sellersService.setStatus(code, status),
    onSuccess: (seller: Seller) => {
      qc.invalidateQueries({ queryKey: queryKeys.sellers });
      qc.invalidateQueries({ queryKey: queryKeys.seller(seller.code) });
      toast.success(seller.status === "ACTIVO" ? "Vendedor activado" : "Vendedor desactivado", {
        description: seller.name,
      });
    },
    onError: (e: Error) => toast.error("No se pudo cambiar el estado", { description: e.message }),
  });
}

export function useUpdateSellerRoutes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ code, routeAssignments }: { code: number; routeAssignments: SellerRouteAssignment[] }) =>
      sellersService.updateRoutes(code, routeAssignments),
    onSuccess: (seller: Seller) => {
      qc.invalidateQueries({ queryKey: queryKeys.sellers });
      qc.invalidateQueries({ queryKey: queryKeys.seller(seller.code) });
      toast.success("Rutas asignadas", { description: seller.name });
    },
    onError: (e: Error) => toast.error("No se pudo guardar la asignación", { description: e.message }),
  });
}
