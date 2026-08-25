import { useQuery } from "../lib/query-lite";
import { clientsService } from "../services/clients-service";
import { queryKeys } from "../lib/query-client";

export function useClients() {
  return useQuery({
    queryKey: queryKeys.clients,
    queryFn: clientsService.list,
  });
}

/** Clients for the given subcanales. Disabled while the selection is empty. */
export function useClientsBySubcanales(subcanalIds: string[]) {
  return useQuery({
    queryKey: queryKeys.clientsBySubcanales(subcanalIds),
    queryFn: () => clientsService.bySubcanales(subcanalIds),
    enabled: subcanalIds.length > 0,
  });
}
