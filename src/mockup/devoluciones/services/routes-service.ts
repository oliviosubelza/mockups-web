import type { Route, RouteInput, RouteStatus } from "../types";
import { SEED_ROUTES, SEED_CLIENTS, SEED_BLOCKS } from "../data/seed";
import { pointInPolygon } from "../lib/geo";
import { delay, uid } from "../lib/utils";

/** Mirrors the paginated envelope returned by the real routes endpoint. */
export interface Pagination {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}
export interface Paginated<T> {
  data: T[];
  pagination: Pagination;
}
export interface ListRoutesParams {
  page?: number;
  limit?: number;
  status?: RouteStatus | "all";
  search?: string;
  /** Filter by sale channel (backend query param). "all" = no filter. */
  channel?: string;
}

/**
 * In-memory mutable repository standing in for a REST resource. Kept module
 * level so mutations survive navigation within the session.
 */
let ROUTES: Route[] = [...SEED_ROUTES];

/** Clients of the route's subcanales located inside its manzanos (by position). */
function countClients(blockIds: string[], subcanalIds: string[]) {
  const polys = SEED_BLOCKS.filter((b) => blockIds.includes(b.id));
  return SEED_CLIENTS.filter(
    (c) =>
      subcanalIds.includes(c.subcanalId) &&
      polys.some((b) => pointInPolygon([c.lat, c.lng], b.polygon)),
  ).length;
}

export const routesService = {
  list: (): Promise<Route[]> => delay([...ROUTES], 500),

  /** Server-style paginated + filtered list (as the real API returns it). */
  listPaged: ({
    page = 1,
    limit = 8,
    status = "all",
    search = "",
    channel = "all",
  }: ListRoutesParams = {}): Promise<Paginated<Route>> => {
    const q = search.trim().toLowerCase();
    const filtered = ROUTES.filter(
      (r) =>
        (status === "all" || r.status === status) &&
        (channel === "all" || r.channelIds.includes(channel)) &&
        (!q || r.name.toLowerCase().includes(q)),
    );
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const data = filtered.slice((safePage - 1) * limit, safePage * limit);
    return delay({ data, pagination: { page: safePage, limit, totalItems, totalPages } }, 450);
  },

  get: (id: string): Promise<Route | undefined> =>
    delay(ROUTES.find((r) => r.id === id), 300),

  create: (input: RouteInput): Promise<Route> => {
    const now = new Date().toISOString();
    const oneYear = new Date();
    oneYear.setFullYear(oneYear.getFullYear() + 1);
    const route: Route = {
      id: uid("rt"),
      ...input,
      // Dates are no longer captured in the form; default the validity window.
      startDate: now,
      endDate: oneYear.toISOString(),
      clientCount: countClients(input.blockIds, input.subcanalIds),
      createdAt: now,
      updatedAt: now,
    };
    ROUTES = [route, ...ROUTES];
    return delay(route, 500);
  },

  update: (id: string, input: RouteInput): Promise<Route> => {
    const now = new Date().toISOString();
    let updated: Route | undefined;
    ROUTES = ROUTES.map((r) => {
      if (r.id !== id) return r;
      updated = {
        ...r,
        ...input,
        clientCount: countClients(input.blockIds, input.subcanalIds),
        updatedAt: now,
      };
      return updated;
    });
    if (!updated) return Promise.reject(new Error("Ruta no encontrada"));
    return delay(updated, 500);
  },

  setStatus: (id: string, status: RouteStatus): Promise<Route> => {
    const now = new Date().toISOString();
    let updated: Route | undefined;
    ROUTES = ROUTES.map((r) => (r.id === id ? (updated = { ...r, status, updatedAt: now }) : r));
    if (!updated) return Promise.reject(new Error("Ruta no encontrada"));
    return delay(updated, 300);
  },

  remove: (id: string): Promise<{ id: string }> => {
    ROUTES = ROUTES.filter((r) => r.id !== id);
    return delay({ id }, 400);
  },
};
