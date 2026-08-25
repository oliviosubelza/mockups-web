import type {
  Seller,
  SellerDetail,
  SellerDetailRoute,
  SellerRouteAssignment,
  SellerStatus,
} from "../types";
import { SEED_SELLERS, SEED_ROUTES, SEED_BLOCKS, SEED_CLIENTS, SEED_MARKETS } from "../data/seed";
import { getSubcanal } from "../data/channels";
import { pointInPolygon } from "../lib/geo";
import { delay, numId } from "../lib/utils";
import type { Paginated } from "./routes-service";

/** Builds the "ver vendedor" detail payload from seed data for a given seller. */
function buildSellerDetail(seller: Seller): SellerDetail {
  const assignRoutes: SellerDetailRoute[] = seller.routeAssignments
    .map((assignment): SellerDetailRoute | null => {
      const route = SEED_ROUTES.find((r) => r.id === assignment.routeId);
      if (!route) return null;

      const blocks = SEED_BLOCKS.filter((b) => route.blockIds.includes(b.id)).map((block, i) => {
        const customers = SEED_CLIENTS.filter(
          (c) =>
            route.subcanalIds.includes(c.subcanalId) &&
            pointInPolygon([c.lat, c.lng], block.polygon),
        ).map((c) => ({
          customerId: numId(c.id),
          ownerId: numId(c.id) + 3000,
          ownerNamer: c.ownerName,
          latitude: c.lat,
          longitud: c.lng,
          customerName: c.name,
          subchannelName: getSubcanal(c.subcanalId)?.name ?? "",
          subchannelId: numId(c.subcanalId),
          assigned: true,
        }));
        return {
          code: numId(block.id) * 10 + i,
          name: `manzano ${i + 1}`,
          // Backend sends coordinates as a stringified array of {latitude, longitude}.
          coordinates: JSON.stringify(
            block.polygon.map(([latitude, longitude]) => ({ latitude, longitude })),
          ),
          customers,
        };
      });

      const markets = SEED_MARKETS.filter((m) => route.marketIds?.includes(m.id)).map((m) => ({
        name: m.name,
        color: m.color,
      }));

      return {
        id: numId(route.id),
        name: route.name,
        color: route.color,
        active_flag: route.status === "active",
        distributorId: 9,
        valid_from: route.startDate,
        valid_to: route.endDate,
        markets,
        blocks,
      };
    })
    .filter((r): r is SellerDetailRoute => r !== null);

  return {
    name: seller.name,
    user: seller.email.split("@")[0].toUpperCase(),
    email: seller.email,
    activeFlag: seller.status === "ACTIVO",
    avatar: "url",
    assignRoutes,
  };
}

export interface ListSellersParams {
  page?: number;
  limit?: number;
  status?: SellerStatus | "all";
  search?: string;
}

/** In-memory mutable repository, mirrors routesService. */
let SELLERS: Seller[] = [...SEED_SELLERS];

export const sellersService = {
  list: (): Promise<Seller[]> => delay([...SELLERS], 400),

  listPaged: ({
    page = 1,
    limit = 8,
    status = "all",
    search = "",
  }: ListSellersParams = {}): Promise<Paginated<Seller>> => {
    const q = search.trim().toLowerCase();
    const filtered = SELLERS.filter(
      (s) =>
        (status === "all" || s.status === status) &&
        (!q ||
          s.name.toLowerCase().includes(q) ||
          String(s.code).includes(q) ||
          s.email.toLowerCase().includes(q)),
    );
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const data = filtered.slice((safePage - 1) * limit, safePage * limit);
    return delay({ data, pagination: { page: safePage, limit, totalItems, totalPages } }, 450);
  },

  get: (code: number): Promise<Seller | undefined> =>
    delay(SELLERS.find((s) => s.code === code), 300),

  /** Full seller detail ("ver vendedor"): profile + assigned routes with blocks & customers. */
  getDetail: (code: number): Promise<SellerDetail | undefined> => {
    const seller = SELLERS.find((s) => s.code === code);
    return delay(seller ? buildSellerDetail(seller) : undefined, 400);
  },

  /** Persists the seller's full route assignments (replace, not merge). */
  updateRoutes: (code: number, routeAssignments: SellerRouteAssignment[]): Promise<Seller> => {
    let updated: Seller | undefined;
    SELLERS = SELLERS.map((s) => {
      if (s.code !== code) return s;
      updated = { ...s, routeAssignments };
      return updated;
    });
    if (!updated) return Promise.reject(new Error("Vendedor no encontrado"));
    return delay(updated, 500);
  },

  setStatus: (code: number, status: SellerStatus): Promise<Seller> => {
    let updated: Seller | undefined;
    SELLERS = SELLERS.map((s) => (s.code === code ? (updated = { ...s, status }) : s));
    if (!updated) return Promise.reject(new Error("Vendedor no encontrado"));
    return delay(updated, 300);
  },
};
