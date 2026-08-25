import { QueryClient } from "./query-lite";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const queryKeys = {
  routes: ["routes"] as const,
  routesPaged: (params: { page: number; limit: number; status: string; search: string }) =>
    ["routes", "paged", params] as const,
  route: (id: string) => ["routes", id] as const,
  routeMacros: ["route-macros"] as const,
  routeMacrosPaged: (params: { page: number; limit: number; search: string }) =>
    ["route-macros", "paged", params] as const,
  routeMacro: (id: number | string) => ["route-macros", id] as const,
  markets: ["markets"] as const,
  market: (id: string) => ["markets", id] as const,
  channels: ["channels"] as const,
  subcanales: ["subcanales"] as const,
  clients: ["clients"] as const,
  clientsBySubcanales: (ids: string[]) => ["clients", "sub", ...ids] as const,
  sellers: ["sellers"] as const,
  sellersPaged: (params: { page: number; limit: number; status: string; search: string }) =>
    ["sellers", "paged", params] as const,
  seller: (code: number | string) => ["sellers", code] as const,
  sellerDetail: (code: number | string) => ["sellers", code, "detail"] as const,
  sellerCompletions: (code: number | string) => ["sellers", code, "completions"] as const,
  clientTasks: ["client-tasks"] as const,
  clientTaskCategories: ["client-tasks", "categories"] as const,
  clientTasksPaged: (params: { page: number; limit: number; status: string; category: string; search: string }) =>
    ["client-tasks", "paged", params] as const,
  clientTask: (id: number | string) => ["client-tasks", id] as const,
  clientTaskCompletions: (taskId: number | string) =>
    ["client-tasks", taskId, "completions"] as const,
  generalTasks: ["general-tasks"] as const,
  generalTasksPaged: (params: { page: number; limit: number; status: string; priority: string; search: string }) =>
    ["general-tasks", "paged", params] as const,
  generalTask: (id: number | string) => ["general-tasks", id] as const,
  /** Prefix, for invalidating every template query at once. */
  taskTemplatesAll: ["task-templates"] as const,
  taskTemplatesPaged: (params: { page: number; limit: number; search: string; category: string }) =>
    ["task-templates", "paged", params] as const,
  taskTemplateCategories: ["task-templates", "categories"] as const,
  taskTemplate: (id: string) => ["task-templates", id] as const,
  monitoringSnapshot: ["monitoring", "snapshot"] as const,
  monitoringLiveMap: ["monitoring", "live-map"] as const,
  visitHistory: (params: Record<string, unknown>) => ["visits", "history", params] as const,
  visitHistorySummary: (params: Record<string, unknown>) =>
    ["visits", "history", "summary", params] as const,
  visit: (id: number | string) => ["visits", id] as const,
  clientVisitTasks: (clientId: string) => ["visits", "client", clientId, "tasks"] as const,
  completedTasks: (params: Record<string, unknown>) =>
    ["visits", "completed-tasks", params] as const,
  completedTaskCategories: ["visits", "completed-tasks", "categories"] as const,
  dayClients: (params: Record<string, unknown>) => ["visits", "day", "clients", params] as const,
  daySellers: (params: Record<string, unknown>) => ["visits", "day", "sellers", params] as const,
  sellerDay: (params: Record<string, unknown>) => ["visits", "day", "seller", params] as const,
  orders: ["orders"] as const,
  ordersPaged: (params: Record<string, unknown>) => ["orders", "paged", params] as const,
  ordersSplitPaged: (params: Record<string, unknown>) =>
    ["orders", "split", params] as const,
  order: (id: number | string) => ["orders", id] as const,
  orderClientDetails: (clientId: string) => ["orders", "client-details", clientId] as const,
  /** Prefix, for invalidating every agency-sale query at once. */
  agencySales: ["agency-sales"] as const,
  agencySalesPaged: (params: Record<string, unknown>) => ["agency-sales", "paged", params] as const,
  agencySale: (id: number | string) => ["agency-sales", id] as const,
  agencySaleCustomerSearch: (query: string) => ["agency-sales", "customers", query] as const,
  /** Exact-document lookup from the invoice block. Its own branch, so a browsed
      search and a "¿quién tiene este número?" never share a cached answer. */
  agencySaleCustomerByDoc: (document: string) =>
    ["agency-sales", "customer-by-doc", document] as const,
  /** Live credit balance of one buyer, keyed `kind:id`. Under the agency prefix
      so a sale that consumes credit invalidates it along with everything else. */
  agencySaleCredit: (customerKey: string) => ["agency-sales", "credit", customerKey] as const,
  agencyEmployees: ["agency-sales", "employees"] as const,
  /**
   * Prefix for everything about the drawer.
   *
   * Its own branch and not a leaf under `agency-sales`, because the two
   * invalidate in one direction only: registering a sale changes what the open
   * session is worth, so the sale mutation invalidates this — but opening a till
   * changes nothing about the sales list.
   */
  tillSessions: ["till-sessions"] as const,
  /** The tills standing at one agency. */
  agencyTills: (agencyId: string) => ["till-sessions", "tills", agencyId] as const,
  /** Which tills of an agency are taken right now. */
  agencyOpenSessions: (agencyId: string) => ["till-sessions", "open", agencyId] as const,
  /** The drawer one seller is answering for, with its running figures. */
  activeTillSession: (sellerCode: number | "none") =>
    ["till-sessions", "active", sellerCode] as const,
  tillSession: (id: string) => ["till-sessions", id] as const,
  returns: ["returns"] as const,
  returnsPaged: (params: Record<string, unknown>) => ["returns", "paged", params] as const,
  return: (id: number | string) => ["returns", id] as const,
  returnableProducts: (clientId: string, excludeReturnId: number | "none") =>
    ["returns", "returnable", clientId, excludeReturnId] as const,
  /** Prefix, for invalidating every transfer query at once. */
  transfers: ["transfers"] as const,
  transfersPaged: (params: Record<string, unknown>) => ["transfers", "paged", params] as const,
  transfer: (id: string) => ["transfers", id] as const,
  /** The places stock can move between. Static in the mock, permissions in production. */
  stockLocations: ["transfers", "locations"] as const,
  /** Prefix, for invalidating every workflow query at once. */
  workflows: ["workflows"] as const,
  workflowsPaged: (params: Record<string, unknown>) => ["workflows", "paged", params] as const,
  workflow: (id: string) => ["workflows", id] as const,
  workflowTargetTypes: ["workflows", "target-types"] as const,
};
