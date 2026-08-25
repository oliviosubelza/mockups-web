import type { Block, Client, Route, Seller } from "../types";
import { pointInPolygon } from "./geo";
import { isScheduledDay } from "./frequency";

/** Clients a route serves: inside one of its blocks AND in one of its subcanales. */
export function clientsForRoute(route: Route, clients: Client[], blocks: Block[]): Client[] {
  const routeBlocks = blocks.filter((b) => route.blockIds.includes(b.id));
  return clients.filter(
    (c) =>
      route.subcanalIds.includes(c.subcanalId) &&
      routeBlocks.some((b) => pointInPolygon([c.lat, c.lng], b.polygon)),
  );
}

/**
 * Union (deduped) of clients scheduled for `seller` on `date`, across every
 * route assignment whose frequency is scheduled that day.
 */
export function scheduledClientsForSeller(
  seller: Seller,
  date: Date,
  findRoute: (id: string) => Route | undefined,
  clients: Client[],
  blocks: Block[],
): Client[] {
  const seen = new Set<string>();
  const result: Client[] = [];
  for (const assignment of seller.routeAssignments) {
    if (!isScheduledDay(assignment.frequency, date)) continue;
    const route = findRoute(assignment.routeId);
    if (!route) continue;
    for (const client of clientsForRoute(route, clients, blocks)) {
      if (seen.has(client.id)) continue;
      seen.add(client.id);
      result.push(client);
    }
  }
  return result;
}
