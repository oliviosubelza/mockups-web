import type { AnswerValue, Block, Client, ClientTask, CompletedClientTask, CompletedGeneralTask, DayCode, ExitReasonCategory, Field, FrequencyType, GeneralTask, GeneralTaskResponseType, MacroRouteRef, Market, Order, OrderBonification, OrderLine, OrderOrigin, OrderStatus, Polygon, Return, ReturnItemSource, ReturnLine, ReturnLineSnapshot, ReturnLot, WorkflowInstance, Route, RouteFrequency, RouteMacro, Seller, SellerRouteAssignment, TaskPriority, Visit, VisitOrder, VisitReturn, VisitTaskDone, WeekPosition } from "../types";
import {
  ALL_EXIT_REASON_CATEGORIES,
  ALL_RETURN_REASONS,
  ALL_STORAGE_CLASSES,
  EXIT_REASON_CATEGORY_LABELS,
} from "../types";
import {
  amountsOf,
  applyItemDecision,
  clearItemDecisions,
  relevantAmountOf,
  statusOf,
} from "../lib/return-workflow";
import {
  approveCurrentLevel,
  currentLevelOf,
  currentVersionOf,
  rejectCurrentLevel,
  startInstance,
} from "../lib/workflow";
import { SEED_WORKFLOWS } from "./workflows-data";
import { CITIES, DEPARTMENT_NAME } from "./locations";
import { numId, seededRandom, uid } from "../lib/utils";
import { pointInPolygon } from "../lib/geo";
import { clientsForRoute, scheduledClientsForSeller } from "../lib/route-coverage";
import { matchesCadence } from "../lib/frequency";
import {
  discountOf,
  giftUnitsFor,
  iceTotalOf,
  lineFromProduct,
  lineMinUnits,
  round2,
  subtotalOf,
} from "../lib/order-math";
import { CHANNELS, SUBCANALES, getSubcanalesByChannel } from "./channels";
import { PRODUCTS, getProduct } from "./products";
import { ALL_BLOCKS, BLOCK_GROUPS } from "./blocks-data";
import { RETURN_DISTRIBUTOR_NAMES } from "./distributors-data";
import { fotoDeMercaderia } from "../../mock-fotos";
// The seed answers to the same per-reason rules the form does, so seeded lines are
// lines the form could have produced.
import { isHidden, rulesFor } from "../features/returns/lib/return-reason-rules";

const rand = seededRandom(20260714);
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (min: number, max: number) => min + rand() * (max - min);

const STORE_PREFIX = [
  "Tienda", "Comercial", "Distribuidora", "Minimarket", "Abarrotes",
  "Bodega", "Mercadito", "Super", "Kiosco", "Almacén",
];
const STORE_NAME = [
  "El Progreso", "Doña Rosa", "San Juan", "La Esquina", "El Trébol",
  "Los Andes", "Santa Cruz", "El Buen Precio", "La Familia", "El Sol",
  "Beni", "Mamoré", "El Carmen", "Loma Suárez", "Pompeya",
  "El Chorro", "Las Palmas", "Trinidad", "La Cabaña", "El Puente",
];
const OWNER_FIRST = ["Juan", "María", "Carlos", "Ana", "Luis", "Rosa", "Pedro", "Lucía", "Jorge", "Elena", "Raúl", "Carmen"];
const OWNER_LAST = ["Suárez", "Justiniano", "Rivero", "Vaca", "Áñez", "Moreno", "Roca", "Guzmán", "Melgar", "Ribera"];
const STREETS = ["Av. 6 de Agosto", "Calle La Paz", "Av. Cipriano Barace", "Calle Nicolás Suárez", "Av. Bolívar", "Calle Sucre", "Av. Ganadera", "Calle Vaca Díez"];

function polygonCentroid(poly: Polygon): [number, number] {
  const n = poly.length;
  const s = poly.reduce<[number, number]>((a, [la, ln]) => [a[0] + la, a[1] + ln], [0, 0]);
  return [s[0] / n, s[1] / n];
}

/** Axis-aligned bounding box covering every given polygon. */
function bboxOf(polys: Polygon[]) {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const poly of polys) {
    for (const [la, ln] of poly) {
      minLat = Math.min(minLat, la); maxLat = Math.max(maxLat, la);
      minLng = Math.min(minLng, ln); maxLng = Math.max(maxLng, ln);
    }
  }
  return { minLat, maxLat, minLng, maxLng };
}

/** A random point that actually falls inside the polygon (rejection sampling). */
function randomPointInPolygon(poly: Polygon): [number, number] {
  const { minLat, maxLat, minLng, maxLng } = bboxOf([poly]);
  for (let i = 0; i < 40; i++) {
    const la = between(minLat, maxLat);
    const ln = between(minLng, maxLng);
    if (pointInPolygon([la, ln], poly)) return [la, ln];
  }
  return polygonCentroid(poly);
}

// Weighted channel distribution for clients (TRADICIONAL dominates).
const CHANNEL_WEIGHTS: string[] = [
  ...Array(6).fill("ch_tradicional"),
  ...Array(3).fill("ch_moderno"),
  ...Array(3).fill("ch_limpieza"),
  ...Array(2).fill("ch_ferias"),
  ...Array(2).fill("ch_panaderia"),
];

/** Commercial sectors a store can be listed under, as the ERP spells them. */
const SECTORS = [
  "POMPEYA", "EL CARMEN", "CENTRO", "NORTE", "SUR", "ESTE", "OESTE",
  "VILLA CORINA", "LOS TAJIBOS", "SAN VICENTE", "12 DE OCTUBRE", "LA SIRENA",
];

// ---- Blocks (manzanos): Santa Cruz de la Sierra, Warnes and Cotoca ---------
export const SEED_BLOCKS: Block[] = ALL_BLOCKS;

// ---- Clients: some inside the manzanos, some scattered outside them --------

/** How many of the clients are seeded as a neighbour of another one. */
const NEIGHBOUR_CLIENTS = 50;

/** Metres in one degree of latitude. Constant; longitude needs the cosine below. */
const M_PER_DEG_LAT = 111_320;

/**
 * A point a given number of metres from another, in a random direction.
 *
 * The longitude step is divided by `cos(lat)` because a degree of longitude
 * shrinks towards the poles — at Santa Cruz's latitude it is about 95% of a
 * degree of latitude. Skipping that would stretch every cluster east-west, and
 * "the same block" would come out as an ellipse.
 */
function pointNear(lat: number, lng: number, minM: number, maxM: number): [number, number] {
  const distance = between(minM, maxM);
  const angle = rand() * Math.PI * 2;
  return [
    lat + (distance * Math.cos(angle)) / M_PER_DEG_LAT,
    lng + (distance * Math.sin(angle)) / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180)),
  ];
}

function buildClients(): Client[] {
  const clients: Client[] = [];

  /**
   * Owner accounts. Most stores bring their own owner, but roughly a third are
   * a second or third branch of an account already on the route — which is the
   * case the order form has to handle: pick the owner, then pick which of its
   * stores receives the goods.
   */
  const owners: { code: string; name: string; stores: number }[] = [];
  const nextOwner = () => {
    const reusable = owners.filter((o) => o.stores < 3);
    if (reusable.length > 0 && rand() < 0.35) return pick(reusable);
    const owner = {
      code: `P-${String(2000 + owners.length + 1)}`,
      name: `${pick(OWNER_FIRST)} ${pick(OWNER_LAST)}`,
      stores: 0,
    };
    owners.push(owner);
    return owner;
  };

  /**
   * @param like Copy this client's channel and subcanal instead of rolling new
   *   ones — for a shop seeded as the neighbour of another.
   *
   *   Not cosmetic. A route serves a set of *subcanales* as well as a set of
   *   manzanos (`clientsForRoute`), so a shop can sit in the right block and
   *   still be served by nobody because its subcanal is not on the route. That
   *   is what kept the neighbours off the live map: they were in the block and
   *   invisible anyway. Inheriting is also the honest answer — a block of
   *   traditional corner shops gets another traditional corner shop.
   */
  const push = (lat: number, lng: number, like?: Client) => {
    // Channel / subcanal are properties of the client, not of the block.
    const channelId = like ? like.channelId : pick(CHANNEL_WEIGHTS);
    const subs = getSubcanalesByChannel(channelId);
    const subcanalId = like ? like.subcanalId : subs.length ? pick(subs).id : SUBCANALES[0].id;
    const idx = clients.length + 1;
    const owner = nextOwner();
    owner.stores += 1;
    clients.push({
      id: `cli_${String(idx).padStart(3, "0")}`,
      code: `C-${String(1000 + idx)}`,
      name: `${pick(STORE_PREFIX)} ${pick(STORE_NAME)}`,
      ownerCode: owner.code,
      ownerName: owner.name,
      address: `${pick(STREETS)} #${Math.floor(between(100, 999))}`,
      phone: `+591 ${Math.floor(between(6000000, 7999999))}`,
      // Most street stores are registered as a person; the bigger accounts are
      // companies, which is the split the invoicing box has to show.
      clientType: rand() < 0.72 ? "NATURAL" : "JURIDICO",
      sector: pick(SECTORS),
      subcanalId,
      channelId,
      lat,
      lng,
      ticketPromedio: Math.round(between(800, 6000)),
      dropSize: Math.round(between(60, 700)),
    });
  };

  // Inside: most manzanos host 1-2 clients placed within their polygon.
  for (const block of SEED_BLOCKS) {
    const n = rand() < 0.78 ? (rand() < 0.4 ? 2 : 1) : 0;
    for (let k = 0; k < n; k++) {
      const [la, ln] = randomPointInPolygon(block.polygon);
      push(la, ln);
    }
  }

  // Outside: scattered points that fall in NO manzano, so the map also shows
  // clients that no route currently covers.
  //
  // Scattered per town, never across the union of all three: one bounding box
  // over Santa Cruz, Warnes and Cotoca is mostly farmland, and clients dropped
  // in it would be twenty kilometres from the nearest shop.
  for (const group of BLOCK_GROUPS) {
    const bounds = bboxOf(group.blocks.map((b) => b.polygon));
    const padLat = (bounds.maxLat - bounds.minLat) * 0.06;
    const padLng = (bounds.maxLng - bounds.minLng) * 0.06;
    let added = 0;
    let guard = 0;
    while (added < 8 && guard < 3000) {
      guard += 1;
      const la = between(bounds.minLat - padLat, bounds.maxLat + padLat);
      const ln = between(bounds.minLng - padLng, bounds.maxLng + padLng);
      if (group.blocks.some((b) => pointInPolygon([la, ln], b.polygon))) continue;
      push(la, ln);
      added += 1;
    }
  }

  // Neighbours: 50 more stores, each a few doors from one already placed and
  // inside the same manzano.
  //
  // Two things at once, and the second is why "inside the same manzano" is a
  // requirement rather than a nicety:
  //
  // 1. Real streets do not scatter shops evenly — a busy avenue has four of them
  //    on one block and the next six have none. The seed only knew how to
  //    scatter, so every screen that has to survive density was being tested
  //    against the easiest possible input.
  // 2. A client only reaches the live map by being on a route, and a route is a
  //    set of manzanos. Neighbours dropped merely *near* an anchor mostly landed
  //    on the street outside its block, belonged to no route, and were therefore
  //    invisible on the monitoring map no matter how many of them there were.
  //    Measured before this: routes covered 0–4 clients each and half the
  //    sellers had nothing scheduled at all.
  //
  // The anchors are snapshotted before the loop starts so clusters grow off the
  // original clients rather than off each other — otherwise a run of unlucky
  // picks walks a chain of neighbours-of-neighbours into the next district and
  // stops being a cluster at all.
  const anchored = clients
    .map((client) => ({
      client,
      block: SEED_BLOCKS.find((b) => pointInPolygon([client.lat, client.lng], b.polygon)),
    }))
    .filter((a): a is { client: Client; block: Block } => !!a.block);

  let neighbours = 0;
  while (neighbours < NEIGHBOUR_CLIENTS && anchored.length > 0) {
    const anchor = pick(anchored);
    // 2–4 at a time: one extra shop is a coincidence, a handful is a corner.
    const size = Math.min(NEIGHBOUR_CLIENTS - neighbours, 2 + Math.floor(rand() * 3));
    for (let k = 0; k < size; k++) {
      // A quarter of them land within 10 m — the same building, two units of a
      // gallery, a kiosk on the pavement outside a shop. That is the case worth
      // seeding on purpose: it is the one where two pins genuinely cannot be told
      // apart by zooming, and every map in the app has to answer for it.
      const [lo, hi] = rand() < 0.25 ? [4, 10] : [15, 70];
      // Tries for a spot that is both close to the anchor AND still in its block;
      // a small manzano can refuse every offer, and then the neighbour simply
      // takes a free point in the block. Staying in the block is the part that
      // cannot be given up, since it is what puts the shop on somebody's route.
      let point: [number, number] | null = null;
      for (let attempt = 0; attempt < 12 && !point; attempt++) {
        const candidate = pointNear(anchor.client.lat, anchor.client.lng, lo, hi);
        if (pointInPolygon(candidate, anchor.block.polygon)) point = candidate;
      }
      const [la, ln] = point ?? randomPointInPolygon(anchor.block.polygon);
      push(la, ln, anchor.client);
      neighbours += 1;
    }
  }

  return clients;
}

export const SEED_CLIENTS: Client[] = buildClients();

// ---- Routes ----------------------------------------------------------------
const ZONES = [
  "Centro", "Norte", "Sur", "Este", "Oeste", "Pompeya", "El Carmen",
  "Loma Suárez", "San Vicente", "Villa Corina", "12 de Octubre", "Los Tajibos",
  "Cabildo", "La Sirena", "Mangalito", "El Mirador",
];

function countClientsInBlocks(blockIds: string[], subcanalIds: string[]): number {
  const polys = SEED_BLOCKS.filter((b) => blockIds.includes(b.id));
  return SEED_CLIENTS.filter(
    (c) =>
      subcanalIds.includes(c.subcanalId) &&
      polys.some((b) => pointInPolygon([c.lat, c.lng], b.polygon)),
  ).length;
}

const ROUTE_PREFIX = ["ZONA", "RUTA", "SECTOR"];

/** Channels of the clients standing inside these manzanos, most common first. */
function channelsPresentIn(blockIds: string[]): string[] {
  const polys = SEED_BLOCKS.filter((b) => blockIds.includes(b.id));
  const tally = new Map<string, number>();
  for (const c of SEED_CLIENTS) {
    if (!polys.some((b) => pointInPolygon([c.lat, c.lng], b.polygon))) continue;
    tally.set(c.channelId, (tally.get(c.channelId) ?? 0) + 1);
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

function buildRoutes(): Route[] {
  const routes: Route[] = [];
  // Enough routes so the paginated list spans several pages.
  for (let i = 0; i < 60; i++) {
    // A route is composed of several manzanos, and the manzanos come first:
    // its channels are read off the shops standing on them, not rolled.
    const blockIds: string[] = [];
    const blockCount = 3 + Math.floor(rand() * 6); // 3..8
    for (let k = 0; k < blockCount; k++) {
      const b = pick(SEED_BLOCKS);
      if (!blockIds.includes(b.id)) blockIds.push(b.id);
    }

    // The route sells to the shops on the blocks it walks.
    //
    // This used to roll a random channel (plus a 30% second one) and then keep
    // most of its subcanales. Both halves of `clientsForRoute` — manzano AND
    // subcanal — then had to agree by luck, and they mostly did not: a route
    // held 18 shops inside its blocks and served 0 of them. Measured effect,
    // over the whole seed: 88 of the 187 clients belonged to any route at all
    // and the median route covered ONE client. It is now 159, median 8.
    //
    // Reading the channels off the blocks is also the honest direction of the
    // dependency — a zone is drawn around the trade that is already there.
    const present = channelsPresentIn(blockIds);
    // Empty blocks still need a channel: the route carries its colour from one.
    // Otherwise the three best-represented ones — the tail is left to somebody
    // else's route, which is both the honest exception (not every zone sells
    // every channel) and what keeps the route code readable: the code is built
    // out of the channel abbreviations, so "all five" reads as noise.
    const channelIds = present.length === 0 ? [pick(CHANNELS).id] : present.slice(0, 3);
    const channel = CHANNELS.find((c) => c.id === channelIds[0]) ?? CHANNELS[0];
    const subcanalIds = channelIds.flatMap((cid) => getSubcanalesByChannel(cid).map((s) => s.id));
    const zone = ZONES[i % ZONES.length];
    const location = pick(CITIES);
    const created = new Date(2025, Math.floor(rand() * 11), Math.floor(between(1, 27)));
    const startDate = new Date(2025, Math.floor(rand() * 11), Math.floor(between(1, 27)));
    const endDate = new Date(startDate);
    endDate.setFullYear(endDate.getFullYear() + 1);
    routes.push({
      id: `rt_${String(i + 1).padStart(3, "0")}`,
      // Just the editable label — city, channel and id are separate code segments.
      name: `${pick(ROUTE_PREFIX)} ${zone.toUpperCase()}`,
      color: channel.color,
      status: rand() < 0.72 ? "active" : "inactive",
      cityName: location.name,
      provinceName: location.provinceName,
      channelIds,
      subcanalIds,
      blockIds,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      clientCount: countClientsInBlocks(blockIds, subcanalIds),
      createdAt: created.toISOString(),
      updatedAt: created.toISOString(),
    });
  }
  return routes;
}

export const SEED_ROUTES: Route[] = buildRoutes();

// ---- Mercados: geographic areas made of manzanos (no channels) -------------
const MARKET_NAMES = [
  "Mercado Central", "Mercado Los Pozos", "Mercado La Ramada", "Mercado Abasto",
  "Mercado Mutualista", "Mercado Siete Calles", "Mercado Florida", "Mercado Nuevo",
];
const MARKET_COLORS = ["#264bc5", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316"];

function buildMarkets(): Market[] {
  return MARKET_NAMES.map((name, i) => {
    const blockIds: string[] = [];
    const count = 2 + Math.floor(rand() * 5); // 2..6 manzanos
    for (let k = 0; k < count; k++) {
      const b = pick(SEED_BLOCKS);
      if (!blockIds.includes(b.id)) blockIds.push(b.id);
    }
    const created = new Date(2025, Math.floor(rand() * 11), Math.floor(between(1, 27)));
    const location = pick(CITIES);
    return {
      id: `mkt_${String(i + 1).padStart(3, "0")}`,
      name,
      color: MARKET_COLORS[i % MARKET_COLORS.length],
      status: rand() < 0.8 ? "active" : "inactive",
      departmentName: DEPARTMENT_NAME,
      cityName: location.name,
      provinceName: location.provinceName,
      blockIds,
      createdAt: created.toISOString(),
      updatedAt: created.toISOString(),
    };
  });
}

export const SEED_MARKETS: Market[] = buildMarkets();

// ---- Macrorutas ------------------------------------------------------------
const MACRO_ZONES = [
  "Trinidad", "Beni Norte", "Beni Sur", "Centro Histórico", "Periférico",
  "Cercado", "Mamoré", "Ganadera", "Comercial", "Zona Franca",
  "Corredor Este", "Corredor Oeste",
];

/** Map a seed Route into the summary shape embedded in a macro's payload. */
export function toMacroRouteRef(route: Route): MacroRouteRef {
  return {
    id: numId(route.id),
    name: route.name,
    color: route.color,
    activeFlag: route.status === "active",
    distributorId: 9,
    valid_from: route.startDate,
    valid_to: route.endDate,
  };
}

function buildRouteMacros(): RouteMacro[] {
  const macros: RouteMacro[] = [];
  for (let i = 0; i < 28; i++) {
    // Each macro groups 2..6 distinct routes, embedded as summaries.
    const picked: Route[] = [];
    const count = 2 + Math.floor(rand() * 5);
    for (let k = 0; k < count; k++) {
      const r = pick(SEED_ROUTES);
      if (!picked.some((p) => p.id === r.id)) picked.push(r);
    }
    const zone = MACRO_ZONES[i % MACRO_ZONES.length];
    macros.push({
      id: i + 1,
      name: `MACRO ${zone.toUpperCase()}`,
      routes: picked.map(toMacroRouteRef),
    });
  }
  return macros;
}

export const SEED_ROUTE_MACROS: RouteMacro[] = buildRouteMacros();

// ---- Sellers (Vendedores) --------------------------------------------------
const WEEKDAYS: DayCode[] = ["MO", "TU", "WE", "TH", "FR"];
const DAY_ORDER: DayCode[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

function weeklyFrequency(days: DayCode[]): RouteFrequency {
  return {
    // Weekly by default; other cadences are set per assignment in the UI.
    type: "SEMANAL" as FrequencyType,
    days: [...days].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b)),
    weeks: [] as WeekPosition[], // only MENSUAL uses weeks
    // Validity: from 2026-07-14 for one year (matches the seed epoch).
    validFrom: "2026-07-14",
    validTo: "2027-07-14",
  };
}

/**
 * Deals the working week among a seller's routes — one frequency per assignment,
 * every weekday landing on exactly one of them.
 *
 * The days used to be rolled per assignment, independently: 1 to 5 random days
 * each, so a seller could hold three routes and have all of them fall on
 * Wednesday, leaving four empty days. Only 8 of the 22 active sellers had
 * anything scheduled on a given weekday, and the clients of the other 14 never
 * reached the live map at all. A preventa seller works the whole week and splits
 * it between the zones they carry — dealing the days says exactly that, and it
 * is what keeps the monitor showing a fleet on any day it is opened.
 */
function spreadWeekAcross(count: number): RouteFrequency[] {
  const buckets: DayCode[][] = Array.from({ length: count }, () => []);
  // Two passes, each with its own shuffle, so a seller carrying two or three
  // zones works two of them on most days — which is what a preventa day looks
  // like (a couple of dozen stops), and what one pass could not produce: with
  // five days dealt among three routes, exactly one route ran per day and the
  // monitor showed a third of the seller's clients.
  const passes = count > 1 ? 2 : 1;
  for (let p = 0; p < passes; p++) {
    const shuffled = [...WEEKDAYS].sort(() => rand() - 0.5);
    shuffled.forEach((day, i) => {
      const bucket = buckets[(i + p) % count];
      if (!bucket.includes(day)) bucket.push(day);
    });
  }
  // A third of the fleet also works Saturday, on one of its routes.
  if (rand() < 0.33) buckets[Math.floor(rand() * count)].push("SA");
  return buckets.map(weeklyFrequency);
}

function buildSellers(): Seller[] {
  const sellers: Seller[] = [];
  // Usernames are derived from the name, so keep track of the ones already taken
  // and disambiguate with a suffix — same as a real user directory would.
  const usernames = new Set<string>();
  // Routes somebody already carries. A route nobody carries is a zone nobody
  // visits: its shops exist in the clients module and are absent from every
  // operational screen. Picking at random left 25 of the 60 routes in somebody's
  // hands; handing out the free ones first raises that to 43.
  const takenRoutes = new Set<string>();
  for (let i = 0; i < 24; i++) {
    const first = pick(OWNER_FIRST);
    const last = pick(OWNER_LAST);
    const idx = i + 1;
    const baseUsername = `${first[0]}${last}`.toLowerCase().replace(/[^a-z]/g, "");
    let username = baseUsername;
    for (let n = 2; usernames.has(username); n++) username = `${baseUsername}${n}`;
    usernames.add(username);
    // Most sellers carry 1-3 routes; a few start with none (empty state).
    const routeAssignments: SellerRouteAssignment[] = [];
    if (rand() > 0.15) {
      const routeCount = 1 + Math.floor(rand() * 3); // 1..3
      // Keep each seller's routes on disjoint manzanos so the seed never ships a
      // conflict (shared manzano -> shared clients -> double assignment).
      const usedBlocks = new Set<string>();
      let attempts = 0;
      while (routeAssignments.length < routeCount && attempts < 40) {
        attempts++;
        const free = SEED_ROUTES.filter((r) => !takenRoutes.has(r.id));
        const r = pick(free.length ? free : SEED_ROUTES);
        if (routeAssignments.some((a) => a.routeId === r.id)) continue;
        if (r.blockIds.some((b) => usedBlocks.has(b))) continue;
        // Frequencies are dealt once the whole set is known, so the week can be
        // split between the routes instead of rolled route by route.
        routeAssignments.push({ routeId: r.id, frequency: weeklyFrequency(WEEKDAYS) });
        takenRoutes.add(r.id);
        for (const b of r.blockIds) usedBlocks.add(b);
      }
      if (routeAssignments.length > 0) {
        const week = spreadWeekAcross(routeAssignments.length);
        routeAssignments.forEach((a, k) => (a.frequency = week[k]));
      }
    }
    sellers.push({
      code: 5000 + idx,
      // SAP business-partner codes live in their own numbering, unrelated to `code`.
      sapCode: 1000000 + Math.floor(between(100000, 999999)),
      username,
      name: `${first} ${last}`.toUpperCase(),
      email: `${first.toLowerCase()}.${last.toLowerCase()}@grupovenado.com`,
      // The real API returns null for some sellers.
      phone: rand() < 0.85 ? `+591 ${Math.floor(between(6000000, 7999999))}` : null,
      status: rand() < 0.85 ? "ACTIVO" : "INACTIVO",
      // This generator only ever produces route sellers: everything it rolls —
      // the routes, the week split between them — is the field day itself.
      salesMode: "ruta",
      routeAssignments,
    });
  }
  return sellers;
}

/**
 * Vendedores de agencia — they sell over the counter at the branch.
 *
 * Written out by hand rather than rolled, for two reasons. One session identity
 * points at the first of them, and a name that changed with the generator would
 * sign documents nobody in the data registered. And they must not consume the
 * seeded PRNG: a couple of extra draws here would shift every entity built after
 * the sellers, so the whole mock would change to add two rows to one list.
 *
 * Their codes sit in a band of their own (5100+) instead of continuing the
 * generated 5001-5024 run, so growing the fleet can never collide with them.
 */
const AGENCY_SELLERS: Seller[] = [
  {
    code: 5101,
    sapCode: 1743908,
    username: "gcuellar",
    name: "GABRIELA CUELLAR",
    email: "gabriela.cuellar@grupovenado.com",
    phone: "+591 76543210",
    status: "ACTIVO",
    salesMode: "agencia",
    // No assignments, and not because none were dealt: a counter has no route.
    routeAssignments: [],
  },
  {
    code: 5102,
    sapCode: 1751264,
    username: "mterrazas",
    name: "MARCELO TERRAZAS",
    email: "marcelo.terrazas@grupovenado.com",
    phone: "+591 71204488",
    status: "ACTIVO",
    salesMode: "agencia",
    routeAssignments: [],
  },
];

export const SEED_SELLERS: Seller[] = [...buildSellers(), ...AGENCY_SELLERS];

/**
 * The sellers who actually work a field day — the list every generator that
 * presumes one reads instead of `SEED_SELLERS`.
 *
 * Routes, scheduled visits, GPS trails, live positions and productivity buckets
 * all describe somebody out in the street. An agency seller on any of them would
 * be the mock inventing telemetry no counter produces: a marker gliding down an
 * avenue for a person standing at a desk, and a productivity row that can only
 * ever read zero.
 */
export const SEED_FIELD_SELLERS: Seller[] = SEED_SELLERS.filter((s) => s.salesMode === "ruta");

// ---- Tareas por cliente ----------------------------------------------------

/**
 * A seed field, with the boilerplate every one of them repeats filled in.
 *
 * Same idiom as `data/task-templates.ts` — kept local rather than shared because the
 * two files seed different things and a shared helper would only couple them.
 */
const field = (
  partial: Omit<Field, "id" | "isRepeatable" | "validation"> & Partial<Field>,
): Field => ({
  id: uid("fld"),
  isRepeatable: false,
  validation: {},
  ...partial,
});

/** One photo field — what a "foto" task used to be. */
const photoFields = (label: string, help: string): Field[] => [
  field({
    code: "foto",
    label,
    helpText: help,
    inputType: "photo",
    isRequired: true,
    layoutWidth: "full",
    order: 1,
    validation: { maxFiles: 1, accept: ["image/*"] },
  }),
];

/** One free-text field — what a "texto" task used to be. */
const textFields = (label: string): Field[] => [
  field({
    code: "observaciones",
    label,
    inputType: "long_text",
    isRequired: true,
    layoutWidth: "full",
    order: 1,
    validation: { maxLength: 500 },
  }),
];

/**
 * A checklist, as what it always was underneath: one yes/no per line.
 *
 * The old model stored `checklistItems: string[]` and a `type` that told every reader
 * to interpret them. As booleans they need no interpreting — they are ordinary fields,
 * they validate like ordinary fields, and the payload says which line was answered.
 */
const checklistFields = (items: string[]): Field[] =>
  items.map((item, i) =>
    field({
      code: `item_${i + 1}`,
      label: item,
      inputType: "boolean",
      isRequired: false,
      layoutWidth: "half",
      order: i + 1,
    }),
  );

/** A 1–5 rating plus room to say why — what "calificacion" used to be. */
const ratingFields = (label: string): Field[] => [
  field({
    code: "calificacion",
    label,
    inputType: "rating",
    isRequired: true,
    layoutWidth: "full",
    order: 1,
    validation: { min: 1, max: 5 },
  }),
  field({
    code: "comentario",
    label: "Comentario",
    inputType: "long_text",
    isRequired: false,
    layoutWidth: "full",
    order: 2,
    validation: { maxLength: 300 },
  }),
];

/**
 * The repeatable product survey — what "baja_rotacion" used to be.
 *
 * This is the case that justifies the whole migration. Under the old model it was one
 * opaque enum member whose meaning ("a list of products, each with a lot, an expiry, a
 * quantity and a photo") lived in the components that special-cased it. Here the shape
 * is the definition.
 */
const lowTurnoverFields = (): Field[] => [
  field({
    code: "productos",
    label: "Producto relevado",
    inputType: "group",
    isRequired: true,
    isRepeatable: true,
    layoutWidth: "full",
    order: 1,
    validation: { minRows: 1, maxRows: 50 },
    children: [
      field({
        code: "producto",
        label: "Producto",
        inputType: "catalog_select",
        dataSource: "product",
        isRequired: true,
        layoutWidth: "full",
        order: 1,
      }),
      field({
        code: "lote",
        label: "Lote",
        inputType: "catalog_select",
        dataSource: "batch",
        isRequired: true,
        layoutWidth: "half",
        order: 2,
      }),
      field({
        code: "cantidad",
        label: "Cantidad",
        inputType: "number",
        isRequired: true,
        layoutWidth: "half",
        order: 3,
        validation: { min: 1 },
      }),
      field({
        code: "vencimiento",
        label: "Vencimiento",
        inputType: "date",
        isRequired: true,
        layoutWidth: "half",
        order: 4,
      }),
      field({
        code: "foto_producto",
        label: "Foto del producto",
        inputType: "photo",
        isRequired: true,
        layoutWidth: "half",
        order: 5,
        validation: { maxFiles: 1, accept: ["image/*"] },
      }),
    ],
  }),
];

/**
 * Which legacy answer slot a form-shaped task fills in recorded visit evidence.
 *
 * The bridge between the two halves of the migration. Definitions are fields now, but
 * `CompletedClientTask` keeps the shape its answers were recorded in — `response`,
 * `checkListResponse`, `ratingResponse`, `lowTurnoverResponse` — because rewriting
 * history to a shape it was never captured in would be inventing data, not migrating it.
 *
 * So the evidence side asks the definition what it looks like instead of being told.
 * Order matters: a low-turnover survey also contains photos, and a rating task also
 * contains a text field, so the most specific shape has to win.
 */
const ANSWER_NOTES = [
  "Exhibición en orden",
  "Sin novedad",
  "Se dejó material POP",
  "Falta reposición en góndola",
  "Cliente atendido correctamente",
  "Vitrina limpia y surtida",
];

const BATCH_CODES = ["SC", "LP", "CB", "TJ"];

/** An ISO stamp somewhere between a month back and three months out. */
const someDate = (): string =>
  new Date(Date.now() + Math.floor(between(-30, 90)) * 86_400_000).toISOString();

/** One plausible answer for one field, or `undefined` when the field asks nothing. */
function answerFor(field: Field, rowIndex?: number): AnswerValue | undefined {
  const base = { fieldCode: field.code, ...(rowIndex === undefined ? {} : { groupRowIndex: rowIndex }) };

  switch (field.inputType) {
    case "section":
    case "group":
      return undefined;
    case "short_text":
      return { ...base, text: pick(ANSWER_NOTES) };
    case "long_text":
      return { ...base, text: `${pick(ANSWER_NOTES)}. ${pick(ANSWER_NOTES)}.` };
    case "number":
      return { ...base, number: Math.floor(between(field.validation.min ?? 1, field.validation.max ?? 48)) };
    case "decimal":
      return { ...base, number: Math.round(between(1, 400) * 100) / 100 };
    case "rating":
      return { ...base, number: 1 + Math.floor(rand() * (field.validation.max ?? 5)) };
    case "date":
      return { ...base, date: someDate().slice(0, 10) };
    case "datetime":
      return { ...base, date: someDate() };
    case "time":
      return { ...base, date: someDate().slice(11, 16) };
    case "boolean":
      // Weighted, not even: a checklist that came back half false on every visit
      // would read as a broken store rather than as a store being checked.
      return { ...base, boolean: rand() < 0.75 };
    case "dropdown":
    case "single_select": {
      const options = field.options ?? [];
      return options.length ? { ...base, optionValue: pick(options).value } : undefined;
    }
    case "multi_select": {
      const options = field.options ?? [];
      if (!options.length) return undefined;
      const howMany = 1 + Math.floor(rand() * options.length);
      const shuffled = [...options].sort(() => rand() - 0.5).slice(0, howMany);
      return { ...base, optionValues: shuffled.map((o) => o.value) };
    }
    case "catalog_select": {
      const source = field.dataSource ?? "product";
      // A real product id where the catalogue has one, so the screen can print the
      // name instead of an opaque reference. The other sources have no seeded
      // catalogue here, so they carry a code shaped like the one they would.
      const id =
        source === "product"
          ? pick(PRODUCTS).id
          : source === "batch"
            ? `${pick(BATCH_CODES)}-${Math.floor(between(1000, 9999))}`
            : `${source}_${Math.floor(between(1, 40))}`;
      return { ...base, ref: { id, source } };
    }
    case "file":
    case "photo":
      return { ...base, files: [{ url: "url", kind: "photo" }] };
    case "photo_multiple":
      return {
        ...base,
        files: Array.from({ length: 1 + Math.floor(rand() * 3) }, () => ({
          url: "url",
          kind: "photo",
        })),
      };
  }
}

/**
 * A whole form filled in, as a seller would have left it.
 *
 * Walks the *definition* — the same direction `buildPayload` walks when the phone
 * submits a real one — so a task is always answered the questions it actually asks.
 * The previous seed did the opposite: it collapsed the form into one of five legacy
 * kinds and answered that instead, which is why a four-question task came back
 * carrying one answer.
 *
 * Optional fields are sometimes left blank, deliberately. A response where every
 * single box is full is not what a counter of real visits looks like, and the
 * screens that read these have to be legible when a field was skipped.
 */
export function buildTaskAnswers(fields: Field[]): AnswerValue[] {
  const answers: AnswerValue[] = [];

  const answerInto = (field: Field, rowIndex?: number) => {
    if (!field.isRequired && rand() < 0.2) return;
    const answer = answerFor(field, rowIndex);
    if (answer) answers.push(answer);
  };

  for (const field of fields) {
    if (field.inputType === "group") {
      // How many times the group was actually repeated — one product of low
      // rotation, or five. `minRows` is honoured when the definition asks for it.
      const rows = Math.max(field.validation.minRows ?? 1, 1 + Math.floor(rand() * 4));
      for (let row = 0; row < rows; row++) {
        for (const child of field.children ?? []) answerInto(child, row);
      }
      continue;
    }
    answerInto(field);
  }

  return answers;
}

/**
 * The seed tasks, each carrying its own form.
 *
 * `fields` is a thunk rather than a value: every field gets a fresh `uid`, and 22 tasks
 * are built from 10 entries, so a shared array would hand the same field ids to several
 * tasks — which is exactly the collision `instantiateTemplate` exists to avoid.
 */
const CLIENT_TASK_NAMES: {
  name: string;
  description: string;
  category: string;
  fields: () => Field[];
}[] = [
  { name: "Foto de fachada", description: "Toma una foto del frente del local para validar la visita.", category: "Evidencia", fields: () => photoFields("Foto de la fachada", "Que se vea el frente completo.") },
  { name: "Foto de exhibición", description: "Registra cómo quedó la exhibición de productos.", category: "Exhibición", fields: () => photoFields("Foto de la exhibición", "Tomala de frente y con buena luz.") },
  { name: "Observaciones del punto", description: "Anota cualquier comentario relevante del cliente.", category: "Relevamiento", fields: () => textFields("Observaciones") },
  { name: "Checklist de limpieza", description: "Verifica el estado del punto de venta.", category: "Control", fields: () => checklistFields(["Piso limpio", "Góndola ordenada", "Precios visibles"]) },
  { name: "Checklist de material POP", description: "Confirma la presencia del material publicitario.", category: "Exhibición", fields: () => checklistFields(["Material POP colocado", "Cartelería vigente", "Sin material vencido"]) },
  { name: "Calificación de atención", description: "Califica la atención recibida en el punto.", category: "Encuesta", fields: () => ratingFields("¿Cómo fue la atención?") },
  { name: "Foto de heladera", description: "Foto del estado de la heladera de la marca.", category: "Evidencia", fields: () => photoFields("Foto de la heladera", "Que se vea el interior.") },
  { name: "Checklist de vencimientos", description: "Revisa productos próximos a vencer.", category: "Control", fields: () => checklistFields(["Sin productos vencidos", "Stock de seguridad", "Rotación aplicada", "Heladera funcionando"]) },
  { name: "Registro de baja rotación", description: "Registra los productos con poca salida: lote, vencimiento, cantidad y fotos.", category: "Relevamiento", fields: lowTurnoverFields },
  { name: "Control de vencimientos en góndola", description: "Reporta los lotes próximos a vencer que siguen en el punto de venta.", category: "Relevamiento", fields: lowTurnoverFields },
];
const CLIENT_TASK_COLORS = ["#264bc5", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316"];
const CHECKLIST_SAMPLES = [
  "Piso limpio", "Góndola ordenada", "Precios visibles", "Sin productos vencidos",
  "Material POP colocado", "Heladera funcionando", "Stock de seguridad", "Cartelería vigente",
];

function buildChecklistItems(): string[] {
  const count = 2 + Math.floor(rand() * 3); // 2..4 items
  return [...CHECKLIST_SAMPLES].sort(() => rand() - 0.5).slice(0, count);
}

function buildClientTasks(): ClientTask[] {
  const tasks: ClientTask[] = [];
  for (let i = 0; i < 22; i++) {
    const base = CLIENT_TASK_NAMES[i % CLIENT_TASK_NAMES.length];
    const scopeAll = rand() < 0.5;
    const clientIds: string[] = [];
    if (!scopeAll) {
      const count = 1 + Math.floor(rand() * 5); // 1..5 clients
      for (let k = 0; k < count; k++) {
        const c = pick(SEED_CLIENTS);
        if (!clientIds.includes(c.id)) clientIds.push(c.id);
      }
    }
    const created = new Date(2026, Math.floor(rand() * 6), Math.floor(between(1, 27)));
    // Roughly half the tasks carry a deadline a few days/weeks after creation.
    const dueDate =
      rand() < 0.55
        ? new Date(created.getTime() + Math.floor(between(3, 45)) * 86_400_000)
            .toISOString()
            .slice(0, 10)
        : undefined;
    tasks.push({
      id: i + 1,
      name: base.name,
      description: base.description,
      fields: base.fields(),
      category: base.category,
      color: CLIENT_TASK_COLORS[i % CLIENT_TASK_COLORS.length],
      order: i + 1,
      required: rand() < 0.6,
      status: rand() < 0.8 ? "active" : "inactive",
      dueDate,
      assignScope: scopeAll ? "all" : "some",
      clientIds,
      createdAt: created.toISOString(),
      updatedAt: created.toISOString(),
    });
  }
  return tasks;
}

export const SEED_CLIENT_TASKS: ClientTask[] = buildClientTasks();

// ---- Completed client tasks (visit responses) ------------------------------
const COMPLETION_NOTES = [
  "Tarea completada",
  "Realizado sin novedad",
  "Vitrina en orden y surtida",
  "Cliente atendido correctamente",
  "Se dejó material POP",
  "Exhibición actualizada",
];

// `buildLowTurnoverEntries` used to live here, hand-building the one answer shape a
// "baja rotación" task was allowed to have: product, batch, expiry, quantity,
// photos. It is gone because that shape is not a special case any more — it is what
// a repeatable group of a catalogue field, a text field, a date and a number
// produces on its own, and `buildTaskAnswers` gets there by reading the definition
// instead of being told in advance.

function buildClientTaskCompletions(): CompletedClientTask[] {
  const completions: CompletedClientTask[] = [];
  // A per-client task is answered *during a visit* (every completion carries a
  // `visitId`), so only field sellers can have answered one.
  const activeSellers = SEED_FIELD_SELLERS.filter((s) => s.status === "ACTIVO");
  const sellerPool = activeSellers.length ? activeSellers : SEED_FIELD_SELLERS;
  let visitId = 1;

  for (const task of SEED_CLIENT_TASKS) {
    // Only some tasks have been completed so far.
    if (rand() < 0.25) continue;
    const n = 1 + Math.floor(rand() * 4); // 1..4 completions by different employees
    // Prefer the task's targeted clients, else any client.
    const clientPool =
      task.assignScope === "some" && task.clientIds.length
        ? SEED_CLIENTS.filter((c) => task.clientIds.includes(c.id))
        : SEED_CLIENTS;
    const pool = clientPool.length ? clientPool : SEED_CLIENTS;

    for (let k = 0; k < n; k++) {
      const seller = pick(sellerPool);
      const client = pick(pool);
      completions.push({
        customerId: numId(client.id),
        customerName: client.name,
        ownerId: numId(client.id),
        ownerName: client.ownerName,
        employeeId: seller.code,
        employeeName: seller.name,
        visitId: visitId++,
        visitTaskId: task.id,
        // The form as it asks to be answered, not a legacy shape guessed from it.
        answers: buildTaskAnswers(task.fields),
      });
    }
  }
  return completions;
}

export const SEED_CLIENT_TASK_COMPLETIONS: CompletedClientTask[] = buildClientTaskCompletions();

// ---- Tareas generales ------------------------------------------------------
const GENERAL_TASK_ITEMS: { title: string; description: string; responseType: GeneralTaskResponseType }[] = [
  { title: "Relevamiento de precios", description: "Tomar precios de la competencia en la zona asignada.", responseType: "toma_precio" },
  { title: "Censo de clientes nuevos", description: "Registrar comercios nuevos no cargados en el sistema.", responseType: "texto" },
  { title: "Foto de puntos de venta", description: "Enviar fotos de los principales puntos de venta.", responseType: "foto" },
  { title: "Checklist de apertura", description: "Completar el checklist de apertura de ruta.", responseType: "checklist" },
  { title: "Calificación de rutas", description: "Calificar el estado general de la ruta.", responseType: "calificacion" },
  { title: "Reporte de faltantes", description: "Reportar productos faltantes en la zona.", responseType: "inventario_faltante" },
  { title: "Verificación de material POP", description: "Confirmar la colocación de material publicitario.", responseType: "checklist" },
  { title: "Encuesta de satisfacción", description: "Aplicar encuesta breve a clientes clave.", responseType: "texto" },
  { title: "Toma de precios lácteos", description: "Relevar precios de la categoría lácteos.", responseType: "toma_precio" },
  { title: "Foto de quiebres de stock", description: "Fotografiar góndolas con quiebre de stock.", responseType: "foto" },
];
const GENERAL_TASK_COLORS = ["#264bc5", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6", "#0ea5e9", "#ec4899", "#14b8a6"];
const GENERAL_TASK_PRIORITIES: TaskPriority[] = ["baja", "normal", "alta", "urgente"];

function buildGeneralTasks(): GeneralTask[] {
  const tasks: GeneralTask[] = [];
  for (let i = 0; i < 20; i++) {
    const base = GENERAL_TASK_ITEMS[i % GENERAL_TASK_ITEMS.length];
    const scopeAll = rand() < 0.45;
    const sellerCodes: number[] = [];
    if (!scopeAll) {
      const count = 1 + Math.floor(rand() * 4); // 1..4 sellers
      for (let k = 0; k < count; k++) {
        // Field sellers only: every task in the pool above is something done out
        // on a route ("la zona asignada", "apertura de ruta").
        const s = pick(SEED_FIELD_SELLERS);
        if (!sellerCodes.includes(s.code)) sellerCodes.push(s.code);
      }
    }
    const created = new Date(2026, Math.floor(rand() * 6), Math.floor(between(1, 27)));
    // ~60% carry an optional due date a few weeks out.
    const hasDue = rand() < 0.6;
    const due = new Date(created);
    due.setDate(due.getDate() + 7 + Math.floor(rand() * 30));
    tasks.push({
      id: i + 1,
      title: base.title,
      description: base.description,
      responseType: base.responseType,
      checklistItems: base.responseType === "checklist" ? buildChecklistItems() : [],
      priority: GENERAL_TASK_PRIORITIES[Math.floor(rand() * GENERAL_TASK_PRIORITIES.length)],
      color: GENERAL_TASK_COLORS[i % GENERAL_TASK_COLORS.length],
      dueDate: hasDue ? due.toISOString().slice(0, 10) : undefined,
      status: rand() < 0.8 ? "active" : "inactive",
      assignScope: scopeAll ? "all" : "some",
      sellerCodes,
      createdAt: created.toISOString(),
      updatedAt: created.toISOString(),
    });
  }
  return tasks;
}

export const SEED_GENERAL_TASKS: GeneralTask[] = buildGeneralTasks();

// ---- Seller device battery (mock) -------------------------------------------
// Only field sellers have one: the figure comes from the mobile app the seller
// carries on the route, and an agency seller sells from a desk at the branch.
function buildSellerBattery(): Record<number, { batteryPct: number; charging: boolean }> {
  const battery: Record<number, { batteryPct: number; charging: boolean }> = {};
  for (const seller of SEED_FIELD_SELLERS) {
    battery[seller.code] = { batteryPct: Math.round(between(15, 100)), charging: rand() < 0.1 };
  }
  return battery;
}

export const SEED_SELLER_BATTERY: Record<number, { batteryPct: number; charging: boolean }> =
  buildSellerBattery();

// ---- Visits (today's field activity) ----------------------------------------
// Deliberate exception to the seeded-PRNG determinism used everywhere else in
// this file: monitoring is explicitly about *today*, so it reads the real wall
// clock at module-load time to always look freshly "live" on every reload.
const findRouteById = (id: string) => SEED_ROUTES.find((r) => r.id === id);

function tasksForClient(clientId: string): ClientTask[] {
  return SEED_CLIENT_TASKS.filter(
    (t) => t.status === "active" && (t.assignScope === "all" || t.clientIds.includes(clientId)),
  );
}

/** Route (of the seller's assignments) that actually covers this client. */
function routeServing(seller: Seller, client: Client): Route | undefined {
  const match = seller.routeAssignments.find((a) => {
    const route = findRouteById(a.routeId);
    return route && clientsForRoute(route, SEED_CLIENTS, SEED_BLOCKS).some((c) => c.id === client.id);
  });
  return match ? findRouteById(match.routeId) : findRouteById(seller.routeAssignments[0]?.routeId ?? "");
}

let nextVisitId = 1;

function buildOpenVisit(seller: Seller, client: Client, route: Route, checkInAt: Date): Visit {
  return {
    id: nextVisitId++,
    sellerCode: seller.code,
    clientId: client.id,
    routeId: route.id,
    checkInAt: checkInAt.toISOString(),
    checkOutAt: null,
    status: "en_curso",
    tasksDone: [],
    order: null,
    return: null,
    exitReasonCategory: null,
    exitReason: null,
    evidencePhotos: [],
  };
}

/** Weighted visit outcome, matching the exit-rule business logic. */
function pickOutcome(): "order" | "tasks_no_order" | "nothing" {
  const r = rand();
  if (r < 0.55) return "order";
  if (r < 0.85) return "tasks_no_order";
  return "nothing";
}

function buildClosedVisit(
  seller: Seller,
  client: Client,
  route: Route,
  checkInAt: Date,
  durationMin: number,
): Visit {
  const checkOutAt = new Date(checkInAt.getTime() + durationMin * 60_000);
  const outcome = pickOutcome();
  // Shuffled so consecutive low-id tasks (which happen to cluster by type in
  // the seed templates) don't dominate every visit's sample.
  const available = [...tasksForClient(client.id)].sort(() => rand() - 0.5);
  const tasksDone: VisitTaskDone[] =
    outcome === "nothing" || available.length === 0
      ? []
      : available
          .slice(0, 1 + Math.floor(rand() * Math.min(2, available.length)))
          .map((t): VisitTaskDone => ({
            clientTaskId: t.id,
            clientTaskName: t.name,
            // The definition travels with the answer: a visit is history, and the
            // task may be edited tomorrow.
            fields: t.fields,
            completedAt: checkOutAt.toISOString(),
            answers: buildTaskAnswers(t.fields),
          }));

  const order: VisitOrder | null =
    outcome === "order"
      ? { id: nextVisitId, amount: Math.round(between(150, 1800)), createdAt: checkOutAt.toISOString() }
      : null;
  const ret: VisitReturn | null =
    outcome === "order" && rand() < 0.15
      ? { id: nextVisitId, amount: Math.round(between(30, 300)), createdAt: checkOutAt.toISOString() }
      : null;

  const needsReason = outcome !== "order";
  const category: ExitReasonCategory | null = needsReason ? pick(ALL_EXIT_REASON_CATEGORIES) : null;
  // Rule 1 (nothing done): evidence required. Rule 2 (tasks, no order): optional.
  const needsEvidence = outcome === "nothing" || (needsReason && rand() < 0.4);

  return {
    id: nextVisitId++,
    sellerCode: seller.code,
    clientId: client.id,
    routeId: route.id,
    checkInAt: checkInAt.toISOString(),
    checkOutAt: checkOutAt.toISOString(),
    status: "finalizada",
    tasksDone,
    order,
    return: ret,
    exitReasonCategory: category,
    exitReason: category ? EXIT_REASON_CATEGORY_LABELS[category] : null,
    evidencePhotos: needsEvidence
      ? Array.from({ length: 1 + Math.floor(rand() * 2) }, (_, i) => ({ id: i + 1, url: "url" }))
      : [],
  };
}

/** Every client any of the seller's routes covers, regardless of frequency —
 *  the pool an unplanned (not-scheduled-today) visit can be picked from. */
function allCoveredClients(seller: Seller): Client[] {
  const seen = new Set<string>();
  const result: Client[] = [];
  for (const a of seller.routeAssignments) {
    const route = findRouteById(a.routeId);
    if (!route) continue;
    for (const c of clientsForRoute(route, SEED_CLIENTS, SEED_BLOCKS)) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      result.push(c);
    }
  }
  return result;
}

/** How many past days of closed visits the history view can browse. */
const HISTORY_DAYS = 30;

/**
 * `clientsForRoute` is O(clients × blocks); building a month of history calls it
 * once per seller *per day*, so the per-route result is memoized here.
 */
const ROUTE_CLIENTS_CACHE = new Map<string, Client[]>();
function clientsOfRoute(route: Route): Client[] {
  let cached = ROUTE_CLIENTS_CACHE.get(route.id);
  if (!cached) {
    cached = clientsForRoute(route, SEED_CLIENTS, SEED_BLOCKS);
    ROUTE_CLIENTS_CACHE.set(route.id, cached);
  }
  return cached;
}

/**
 * Past visits, so the history view has something to filter by date. One pass per
 * day and seller over the routes whose cadence falls on that day, walking the
 * stops from ~8:00 with travel gaps in between. Sundays are skipped — nobody
 * sells on Sunday. `matchesCadence` (not `isScheduledDay`) because every seeded
 * assignment starts at the seed epoch, which would leave the history empty.
 */
function buildHistoricalVisits(now: Date): Visit[] {
  const visits: Visit[] = [];
  const activeSellers = SEED_FIELD_SELLERS.filter((s) => s.status === "ACTIVO");

  for (let daysAgo = HISTORY_DAYS; daysAgo >= 1; daysAgo--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
    if (day.getDay() === 0) continue;

    for (const seller of activeSellers) {
      // Stops available that day: every client of every route scheduled for it.
      const stops: { client: Client; route: Route }[] = [];
      const seen = new Set<string>();
      for (const assignment of seller.routeAssignments) {
        if (!matchesCadence(assignment.frequency, day)) continue;
        const route = findRouteById(assignment.routeId);
        if (!route) continue;
        for (const client of clientsOfRoute(route)) {
          if (seen.has(client.id)) continue;
          seen.add(client.id);
          stops.push({ client, route });
        }
      }
      if (stops.length === 0) continue;

      const target = Math.min(stops.length, 3 + Math.floor(rand() * 4));
      const visited = new Set<string>();
      // Minutes from midnight — the working day starts between 08:00 and 09:00.
      let cursor = 8 * 60 + Math.floor(between(0, 60));

      for (let i = 0; i < target; i++) {
        const pool = stops.filter((s) => !visited.has(s.client.id));
        if (pool.length === 0) break;
        const { client, route } = pick(pool);
        visited.add(client.id);
        const checkInAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, cursor);
        const durationMin = Math.floor(between(6, 35));
        visits.push(buildClosedVisit(seller, client, route, checkInAt, durationMin));
        cursor += durationMin + Math.floor(between(10, 45));
      }
    }
  }
  return visits;
}

/** What one stop costs the day: the visit itself plus getting to it. */
const STOP_MINUTES = 45;

/** The shortest visit the generator produces — the floor of `between(6, 35)`. */
const MIN_VISIT_MINUTES = 6;

/**
 * Today, spread across the part of the day that has actually elapsed.
 *
 * Two wrong shapes came before this one, and both are worth stating because the
 * fix is not obvious from either.
 *
 * The first scattered every visit at `now - between(90, 360)` minutes: a sliding
 * window anchored to page-load rather than to a working day, so opening the app
 * at 09:00 put half of "today" at 03:00 or on yesterday's date.
 *
 * The second walked a cursor from 08:00 with a fixed step — duration plus travel,
 * about 48 minutes — exactly as the history branch does. That is right for a past
 * day and wrong for this one: **a past day is complete, today is only partly
 * elapsed.** Four stops at a fixed step always land inside 08:00-11:40 whatever
 * the clock says, so an afternoon read showed a busy morning, a four-hour hole,
 * and the open visits sitting alone at the end. Real data does not do that, so it
 * read as broken data.
 *
 * So the stops are laid over the *whole* elapsed window instead: the window is
 * divided into as many slots as the seller has stops, each stop lands somewhere
 * inside its own slot, and the cursor only ever pushes a stop later — never
 * earlier, which is what keeps them in order and non-overlapping. `capacity`
 * covers the other end: early in the morning the window can hold one stop, not
 * four, and a seller cannot make four visits before nine.
 */
function buildVisits(): Visit[] {
  const now = new Date();
  const visits: Visit[] = buildHistoricalVisits(now);
  // Minutes from midnight, so the cursor arithmetic never touches Date objects.
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const atMinute = (minutes: number) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, minutes);

  for (const seller of SEED_FIELD_SELLERS.filter((s) => s.status === "ACTIVO")) {
    if (seller.routeAssignments.length === 0) continue;
    const scheduled = scheduledClientsForSeller(seller, now, findRouteById, SEED_CLIENTS, SEED_BLOCKS);
    const scheduledIds = new Set(scheduled.map((c) => c.id));
    // A client that asked for an unplanned visit today, outside the schedule.
    const unscheduledPool = allCoveredClients(seller).filter((c) => !scheduledIds.has(c.id));
    const wantsUnscheduledVisit =
      unscheduledPool.length > 0 && rand() < (scheduled.length ? 0.3 : 0.55);
    if (scheduled.length === 0 && !wantsUnscheduledVisit) continue;

    const visitedToday = new Set<string>();
    const opensNow = rand() < 0.38;
    // How many stops this seller *would* make on a full day — the seller-to-seller
    // variation, kept as an upper bound rather than as the answer.
    const wantedClosed = Math.floor(rand() * (opensNow ? 3 : 5));
    // The working day starts between 08:00 and 09:00 — same rule as the history.
    const dayStart = 8 * 60 + Math.floor(between(0, 60));
    const elapsed = nowMinutes - dayStart;
    // …and how many the elapsed window can hold. Without this, an app opened at
    // 09:00 crams a full day's round into one hour of overlapping visits.
    const capacity = Math.max(0, Math.floor(elapsed / STOP_MINUTES));
    const closedCount = Math.min(wantedClosed, capacity);

    // Every stop of the walk gets a slot of the window, the open visit included:
    // dividing by the stops rather than stepping by a fixed gap is what makes a
    // three-stop day reach the afternoon instead of finishing before eleven.
    const slots = closedCount + (wantsUnscheduledVisit ? 1 : 0) + (opensNow ? 1 : 0);
    const step = slots > 0 && elapsed > 0 ? elapsed / slots : 0;
    let cursor = dayStart;

    /**
     * Places the stop of slot `index`, or nothing if the day has no room left.
     *
     * Jitter inside the slot keeps twelve sellers from checking in at the same
     * minute; `cursor` keeps a stop from starting before the previous one ended;
     * the duration is clipped to whatever is left before `now`, so a closed
     * visit always closes in the past.
     */
    const stopAt = (index: number): { start: number; durationMin: number } | null => {
      const nominal = dayStart + Math.floor(index * step + between(0, step * 0.5));
      const start = Math.max(cursor, nominal);
      const room = nowMinutes - start;
      if (room < MIN_VISIT_MINUTES) return null;
      const durationMin = Math.min(Math.floor(between(6, 35)), room);
      // Travel to the next door. The slot already does the spreading, so this is
      // only the minimum that keeps two visits from touching.
      cursor = start + durationMin + Math.floor(between(8, 20));
      return { start, durationMin };
    };

    for (let k = 0; k < closedCount; k++) {
      const pool = scheduled.filter((c) => !visitedToday.has(c.id));
      if (pool.length === 0) break;
      const client = pick(pool);
      const stop = stopAt(k);
      if (!stop) break;
      visitedToday.add(client.id);
      const route = routeServing(seller, client);
      if (route) {
        visits.push(buildClosedVisit(seller, client, route, atMinute(stop.start), stop.durationMin));
      }
    }

    if (wantsUnscheduledVisit) {
      const pool = unscheduledPool.filter((c) => !visitedToday.has(c.id));
      if (pool.length) {
        // The detour is one more stop on the same walk, not a visit out of time.
        const stop = stopAt(closedCount);
        if (stop) {
          const client = pick(pool);
          visitedToday.add(client.id);
          const route = routeServing(seller, client);
          if (route) {
            visits.push(
              buildClosedVisit(seller, client, route, atMinute(stop.start), stop.durationMin),
            );
          }
        }
      }
    }

    if (opensNow && cursor <= nowMinutes) {
      const scheduledLeft = scheduled.filter((c) => !visitedToday.has(c.id));
      const pool = scheduledLeft.length ? scheduledLeft : unscheduledPool.filter((c) => !visitedToday.has(c.id));
      if (pool.length) {
        const client = pick(pool);
        const route = routeServing(seller, client);
        if (route) {
          // Up to an hour and a half in, but never before the seller was free:
          // the open visit sits at the end of the walk, not on a second timeline.
          const checkInMinutes = Math.max(cursor, nowMinutes - Math.floor(between(2, 90)));
          visits.push(buildOpenVisit(seller, client, route, atMinute(checkInMinutes)));
        }
      }
    }
  }
  return visits;
}

export const SEED_VISITS: Visit[] = buildVisits();

// ---- Pedidos ---------------------------------------------------------------

/** Legal entities that issue orders — the `Empresa` column / filter. */
export const ORDER_COMPANIES = ["IVSA", "VEMASSA", "FACRULESA"];
/** Dispatch warehouses, in the ERP's own naming. */
export const ORDER_WAREHOUSES = ["S47.V.BN.FACRULESA", "S12.V.SC.CENTRAL", "S23.V.SC.NORTE"];
const WAREHOUSES = ORDER_WAREHOUSES;

/**
 * Windows the client can receive in, offered whole.
 *
 * Whole windows rather than a "from" list and an "until" list: two independent
 * pickers make the user assemble a range, which needs guarding so "hasta" never
 * lands before "desde" and offers combinations the warehouse never runs anyway.
 * One pick here is a complete, always-valid answer.
 */
export const DELIVERY_WINDOWS: { from: string; to: string; label: string }[] = [
  { from: "08:00", to: "10:00", label: "Temprano" },
  { from: "08:00", to: "12:00", label: "Mañana" },
  { from: "10:00", to: "12:00", label: "Media mañana" },
  { from: "12:00", to: "14:00", label: "Mediodía" },
  { from: "14:00", to: "16:00", label: "Media tarde" },
  { from: "14:00", to: "18:00", label: "Tarde" },
  { from: "16:00", to: "18:00", label: "Cierre" },
  { from: "08:00", to: "18:00", label: "Todo el día" },
];
/**
 * Value-added services e-Venado sells alongside the goods. One for now — add to
 * the list as the real catalogue grows.
 */
const ORDER_SERVICES = ["Transporte"];

/** Weighted towards the field app: these orders were all taken during visits. */
const ORDER_ORIGIN_POOL: OrderOrigin[] = [
  ...Array(6).fill("MOVIL"),
  ...Array(2).fill("WEB"),
  "E-COMMERCE",
];
/** Weighted so most orders sit in the state the operation cares about. */
const ORDER_STATUS_POOL: OrderStatus[] = [
  ...Array(5).fill("listo_para_despachar"),
  ...Array(3).fill("despachado"),
  ...Array(2).fill("entregado"),
  "pendiente",
  "anulado",
];

const DELIVERY_CONTACTS = ["Encargado de turno", "El dueño", "Cajera", "Depósito", "Administración"];
const ORDER_NOTES = [
  "",
  "",
  "Entregar por la puerta lateral.",
  "Llamar antes de llegar.",
  "No recibe después de las 12.",
  "Dejar con el encargado.",
];

/**
 * The catalogue in the two nestings an order is read by: company first, and each
 * company's SKUs split by how they have to travel.
 */
const CATALOGUE_BY_COMPANY_AND_STORAGE = ORDER_COMPANIES.map((company) =>
  ALL_STORAGE_CLASSES.map((storage) =>
    PRODUCTS.filter((product) => product.company === company && product.storage === storage),
  ),
);

/**
 * Lines that add up to roughly `target`.
 *
 * The visit already recorded what the sale was worth, and the back office has to
 * agree with it, so the amount is the input and the breakdown is reconstructed
 * around it: products at their real tariff, and the last one carrying whatever is
 * missing to land on the figure. Quantities are split into cases and loose units
 * the way a seller would actually write them.
 *
 * The products are drawn **two or three of dry goods from every company**, because
 * a seller sells from one list that happens to span three legal entities and a real
 * order routinely crosses all of them — picking blindly gave orders of one or two
 * lines that collapsed into a single document, which made the per-company reading a
 * level that never branches.
 *
 * The cold chain is drawn **only about half the time**, and that is deliberate too:
 * a company whose goods all travel dry shows its products with no storage level at
 * all, and if the reader always saw both the shorter shape would never appear. It
 * only ever applies to FACRULESA — the bebidas listas are the whole cold chain and
 * they are its lines — so the other two companies' cold buckets are empty and the
 * slice below simply yields nothing for them.
 */
function buildOrderLines(target: number): OrderLine[] {
  const chosen = CATALOGUE_BY_COMPANY_AND_STORAGE.flatMap(([dry, cold]) => [
    ...[...dry].sort(() => rand() - 0.5).slice(0, 2 + Math.floor(rand() * 2)),
    ...(rand() < 0.45 ? [...cold].sort(() => rand() - 0.5).slice(0, 1 + Math.floor(rand() * 2)) : []),
  ]);

  let spent = 0;
  return chosen.map((product, index) => {
    const last = index === chosen.length - 1;
    const budget = last
      ? Math.max(product.priceUnit, target - spent)
      : (target / chosen.length) * between(0.6, 1.2);
    const minUnits = Math.max(1, Math.round(budget / product.priceUnit));
    // Whole cases first, the remainder loose — an order of 30 bottles reads as
    // "2 cajas y 6 botellas", not as 30 loose ones.
    const qtyCase = Math.floor(minUnits / product.unitsPerCase);
    const qtyUnit = minUnits - qtyCase * product.unitsPerCase;
    spent += minUnits * product.priceUnit;

    return {
      productId: product.id,
      code: product.code,
      company: product.company,
      storage: product.storage,
      productName: product.name,
      unitLabel: product.unitLabel,
      caseLabel: product.caseLabel,
      unitsPerCase: product.unitsPerCase,
      qtyCase,
      qtyUnit,
      priceUnit: product.priceUnit,
      ice: product.ice,
    } satisfies OrderLine;
  });
}

/**
 * Orders are derived from the visits that closed with one, so client, seller,
 * date and amount always agree with the visit history — the same order the
 * seller registered on the field, seen from the back office.
 *
 * Each one carries its breakdown: the lines, the bonifications they earned and
 * the delivery data the form collects. Without them the back office could show
 * an order but never open it, which is the state the edit screen needs.
 */
function buildOrders(): Order[] {
  const clientById = new Map(SEED_CLIENTS.map((c) => [c.id, c] as const));
  const sellerByCode = new Map(SEED_SELLERS.map((s) => [s.code, s] as const));
  let noteSeq = 202659041400;

  return SEED_VISITS.filter((v) => v.order)
    .sort((a, b) => (a.checkInAt < b.checkInAt ? 1 : -1))
    .map((visit) => {
      const client = clientById.get(visit.clientId);
      const seller = sellerByCode.get(visit.sellerCode);
      const order = visit.order!;
      const createdAt = new Date(order.createdAt);
      // Same-day orders taken late are delivered the next day.
      const delivery = new Date(createdAt);
      if (createdAt.getHours() >= 10) delivery.setDate(delivery.getDate() + 1);
      const status = pick(ORDER_STATUS_POOL);
      // Discounts land on roughly two of every three orders.
      const discountPct = rand() < 0.65 ? pick([3, 5, 8]) : 0;
      const lines = buildOrderLines(order.amount);
      // Every amount comes off the lines, exactly as the app computes its own:
      // one place decides what an order is worth.
      const subtotal = subtotalOf(lines);
      const discount = discountOf(subtotal, discountPct);
      const bonifications: OrderBonification[] = lines.flatMap((line) => {
        const qty = giftUnitsFor(lineMinUnits(line));
        return qty === 0
          ? []
          : [
              {
                productId: line.productId,
                giftProductId: line.productId,
                giftProductName: line.productName,
                qty,
                unitLabel: line.unitLabel,
              },
            ];
      });
      const window = pick(DELIVERY_WINDOWS);
      // Resolved before the literal because the service depends on it: a service
      // is sold by the storefront and nowhere else.
      const origin = pick(ORDER_ORIGIN_POOL);

      return {
        id: 11_000_000 + order.id * 7 + Math.floor(rand() * 6),
        company: rand() < 0.75 ? ORDER_COMPANIES[0] : pick(ORDER_COMPANIES),
        createdAt: order.createdAt,
        deliveryDate: delivery.toISOString().slice(0, 10),
        clientId: visit.clientId,
        clientName: client?.name ?? "—",
        clientOwnerName: client?.ownerName ?? "—",
        sellerCode: visit.sellerCode,
        sellerName: seller?.name ?? `Vendedor ${visit.sellerCode}`,
        discount,
        ice: iceTotalOf(lines),
        netTotal: round2(subtotal - discount),
        subtotal,
        discountPct,
        deliveryFrom: window.from,
        deliveryTo: window.to,
        deliveryPoint: `${numId(client?.code ?? "0")} - ${client?.address ?? "—"}`,
        contact: pick(DELIVERY_CONTACTS),
        notes: pick(ORDER_NOTES),
        lines,
        bonifications,
        paymentMethod: rand() < 0.8 ? "CONTADO" : "CREDITO",
        warehouse: rand() < 0.7 ? WAREHOUSES[0] : pick(WAREHOUSES),
        // Orders still pending documentation have no note number yet.
        noteNumber: status === "pendiente" ? null : String(noteSeq++),
        // These come from visits, so the seller's phone is where most of them
        // were taken; the rest arrive through the storefront or the back office.
        origin,
        service: origin === "E-COMMERCE" ? pick(ORDER_SERVICES) : null,
        status,
        visitId: visit.id,
      } satisfies Order;
    });
}

/**
 * A handful of orders taken from the back office minutes ago.
 *
 * They exist so the two-hour edit window is reachable at all: every order
 * derived from a visit is hours or days old, so without these the screen would
 * only ever be able to show the rule refusing. They carry no `visitId` because
 * nobody visited anyone — the web channel is exactly this app.
 */
function buildRecentWebOrders(): Order[] {
  const clients = SEED_CLIENTS.slice(0, 3);
  return clients.map((client, index) => {
    // Spread across the window: one just taken, one halfway, one about to close.
    const minutesAgo = 5 + index * 45;
    const createdAt = new Date(Date.now() - minutesAgo * 60_000);
    const delivery = new Date(createdAt);
    delivery.setDate(delivery.getDate() + 1);

    const lines = buildOrderLines(between(400, 2200));
    const subtotal = subtotalOf(lines);
    const discountPct = index === 0 ? 0 : 5;
    const discount = discountOf(subtotal, discountPct);
    const window = pick(DELIVERY_WINDOWS);

    return {
      id: 11_900_000 + index,
      createdAt: createdAt.toISOString(),
      deliveryDate: delivery.toISOString().slice(0, 10),
      clientId: client.id,
      clientName: client.name,
      clientOwnerName: client.ownerName,
      sellerCode: SEED_SELLERS[index % SEED_SELLERS.length].code,
      sellerName: SEED_SELLERS[index % SEED_SELLERS.length].name,
      discount,
      ice: iceTotalOf(lines),
      netTotal: round2(subtotal - discount),
      paymentMethod: index % 2 === 0 ? "CONTADO" : "CREDITO",
      warehouse: WAREHOUSES[0],
      noteNumber: null,
      origin: "WEB",
      // Back-office orders are goods, not services.
      service: null,
      status: "pendiente",
      visitId: null,
      subtotal,
      discountPct,
      deliveryFrom: window.from,
      deliveryTo: window.to,
      deliveryPoint: `${numId(client.code)} - ${client.address}`,
      contact: pick(DELIVERY_CONTACTS),
      notes: pick(ORDER_NOTES),
      lines,
      bonifications: lines.flatMap((line) => {
        const qty = giftUnitsFor(lineMinUnits(line));
        return qty === 0
          ? []
          : [
              {
                productId: line.productId,
                giftProductId: line.productId,
                giftProductName: line.productName,
                qty,
                unitLabel: line.unitLabel,
              },
            ];
      }),
    } satisfies Order;
  });
}

/**
 * One order built by hand, to be looked at rather than counted.
 *
 * Everything else here is generated, which is what makes the list feel real and
 * also what makes a specific shape impossible to rely on: `buildOrderLines` picks
 * one to four products at random, so nine lines spread three-and-three-and-three
 * across the catalogue's companies — the exact case the per-company reading exists
 * for — comes up essentially never.
 *
 * So this one is fixed: same products, same quantities, same amounts on every
 * reload. Two things about it are deliberate rather than decorative:
 *
 * - It is **days old and `listo_para_despachar`**, so its edit window is shut.
 *   The per-company breakdown is only offered on an order that can no longer
 *   move, and a sample of that breakdown has to qualify for it.
 * - It came through **e-Venado with a service**, which is the one combination the
 *   `Servicio` column has anything to show for.
 *
 * Amounts are never written here — subtotal, ICE and discount all come off the
 * lines through the same helpers the app uses, so this order cannot disagree with
 * its own arithmetic.
 */
function buildMultiCompanyOrder(): Order {
  /**
   * Only FACRULESA carries cold, and that asymmetry is the point: it puts both
   * shapes of the per-company reading on one order. Two companies whose goods all
   * travel dry show their products straight away, and the third divides into two
   * loads first — so a reader sees when the extra level appears and when it does
   * not, without opening a second order to compare.
   */
  const picks = [
    // IVSA — todo seco
    { id: "prd_10010", qtyCase: 4, qtyUnit: 6 }, // Aceite de Oliva Kris 250 ml
    { id: "prd_40501", qtyCase: 2, qtyUnit: 0 }, // Mayonesa Kris Original 380 gr
    { id: "prd_41201", qtyCase: 3, qtyUnit: 12 }, // Kétchup Kris Original 410 gr
    { id: "prd_50101", qtyCase: 2, qtyUnit: 8 }, // Cereal Kris Frutaritos 220 gr
    // VEMASSA — todo seco
    { id: "prd_20101", qtyCase: 5, qtyUnit: 10 }, // Gelatina Kris Frutilla 230 gr
    { id: "prd_21101", qtyCase: 6, qtyUnit: 0 }, // Gelatina Light Kris Frutilla 24 gr
    { id: "prd_70112", qtyCase: 2, qtyUnit: 15 }, // Flan Kris Vainilla 60 gr
    { id: "prd_10060", qtyCase: 4, qtyUnit: 6 }, // Levadura Fleischmann 170 gr
    // FACRULESA — secos
    { id: "prd_30101", qtyCase: 4, qtyUnit: 5 }, // Refresco en Polvo Kris Frutilla
    { id: "prd_30109", qtyCase: 3, qtyUnit: 0 }, // Refresco en Polvo Kris Mocochinchi
    { id: "prd_31111", qtyCase: 5, qtyUnit: 4 }, // Néctar Kris en Polvo Mango
    // FACRULESA — refrigerados
    { id: "prd_80103", qtyCase: 2, qtyUnit: 6 }, // Frussion Naranja 300 ml
    { id: "prd_81122", qtyCase: 3, qtyUnit: 8 }, // Agua Speranza Sin Gas 600 ml
  ];

  const lines: OrderLine[] = picks.map(({ id, qtyCase, qtyUnit }) => ({
    ...lineFromProduct(getProduct(id)!),
    qtyCase,
    qtyUnit,
  }));

  const subtotal = subtotalOf(lines);
  const discountPct = 8;
  const discount = discountOf(subtotal, discountPct);
  const client = SEED_CLIENTS[4];
  const seller = SEED_SELLERS[0];
  const createdAt = new Date();
  createdAt.setDate(createdAt.getDate() - 3);
  createdAt.setHours(9, 20, 0, 0);
  const delivery = new Date(createdAt);
  delivery.setDate(delivery.getDate() + 1);

  return {
    id: 11_950_000,
    createdAt: createdAt.toISOString(),
    deliveryDate: delivery.toISOString().slice(0, 10),
    clientId: client.id,
    clientName: client.name,
    clientOwnerName: client.ownerName,
    sellerCode: seller.code,
    sellerName: seller.name,
    discount,
    ice: iceTotalOf(lines),
    netTotal: round2(subtotal - discount),
    paymentMethod: "CONTADO",
    warehouse: WAREHOUSES[0],
    noteNumber: "202659041999",
    origin: "E-COMMERCE",
    service: "Transporte",
    status: "listo_para_despachar",
    visitId: null,
    subtotal,
    discountPct,
    deliveryFrom: "08:00",
    deliveryTo: "12:00",
    deliveryPoint: `${numId(client.code)} - ${client.address}`,
    contact: DELIVERY_CONTACTS[0],
    notes:
      "Pedido de muestra: quince productos entre las tres empresas, cada una con secos y refrigerados.",
    lines,
    bonifications: lines.flatMap((line) => {
      const qty = giftUnitsFor(lineMinUnits(line));
      return qty === 0
        ? []
        : [
            {
              productId: line.productId,
              giftProductId: line.productId,
              giftProductName: line.productName,
              qty,
              unitLabel: line.unitLabel,
            },
          ];
    }),
  } satisfies Order;
}

// The hand-built one first, so it is the top row of the list instead of something
// to page for.
export const SEED_ORDERS: Order[] = [
  buildMultiCompanyOrder(),
  ...buildRecentWebOrders(),
  ...buildOrders(),
];

// ---- Devoluciones ------------------------------------------------------------

/** What a seller actually writes when a product comes back. */
const RETURN_LINE_NOTES = [
  "Envase golpeado, producto derramado.",
  "Sellado flojo, el cliente lo detectó en góndola.",
  "Producto próximo a vencer, el cliente no lo rota.",
  "Etiqueta despegada, no se lee el lote.",
  "Contenido con grumos, aspecto fuera de norma.",
  "Caja mojada durante el transporte.",
];

/** The reason the whole return exists, above the per-product detail. */
const RETURN_JUSTIFICATIONS = [
  "El cliente reporta la falla el mismo día de la entrega y solicita reposición.",
  "Producto observado en control de calidad del cliente antes de exhibirlo.",
  "Lote con defecto de envasado detectado en góndola por el encargado.",
  "Mercadería dañada durante el transporte, verificada por el vendedor en el punto.",
  "Cliente devuelve por vencimiento próximo acordado en la última visita.",
];

/** Comments the approvers leave, split by what they answered. */
const RETURN_APPROVAL_COMMENTS = [
  "Verificado con el vendedor, corresponde reponer.",
  "Fotos claras, lote coincide con el despacho.",
  "Monto razonable para el historial del cliente.",
];
const RETURN_REJECTION_COMMENTS = [
  "La foto del lote no permite leer el número. Volver a registrar.",
  "El producto está fuera del plazo de reclamo.",
  "Falta respaldo del encargado del punto de entrega.",
];

/** Why a single product gets refused, as the deciding desk writes it on the item. */
const RETURN_ITEM_REJECTIONS = [
  "Fuera del plazo de reclamo (más de 30 días).",
  "La cantidad supera lo facturado en ese lote.",
  "Sin foto del lote que respalde el reclamo.",
  "El producto no presenta la falla declarada.",
];

const RETURN_LOTS: ReturnLot[] = ["S", "L", "IMPORTADO"];

/** `YYYY-MM-DD`, `days` from today. Negative goes back. */
function dayKeyFrom(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Where a returned quantity came from: one invoice and batch, or two.
 *
 * Most lines come off a single delivery, and a seed where every line had two
 * origins would make the multi-source case look like the norm it is not. About
 * a quarter split in two, which is enough for the "2 orígenes" affordance to be
 * reachable without drowning the tables in it.
 */
function buildReturnSources(lineId: string, minUnits: number): ReturnItemSource[] {
  /**
   * One origin. The batch number carries the plant it was stamped at, so it is
   * derived from the batch and never drawn separately — a lot marked "Importado"
   * whose number ends in `-LP` is the kind of detail that makes a mock look
   * wrong to anyone who reads these labels for a living.
   */
  function source(id: string, units: number): ReturnItemSource {
    const batch = pick(RETURN_LOTS);
    return {
      id,
      invoiceNumber: `F-${String(89000 + Math.floor(rand() * 999))}`,
      invoiceSapDoc: `4500${String(100 + Math.floor(rand() * 899))}`,
      batch,
      batchNumber: `L-${2409 + Math.floor(rand() * 4)}-${batch}`,
      // Some already expired, most about to: that spread is what makes the
      // column worth reading at all.
      dueDate: dayKeyFrom(Math.floor(between(-90, 240))),
      minUnits: units,
    };
  }

  const split = minUnits > 6 && rand() < 0.25;
  if (!split) return [source(`${lineId}_s1`, minUnits)];

  // The split has to add up exactly — that is the invariant the form enforces
  // and the seed must not be the one place where it does not hold.
  const first = Math.max(1, Math.floor(minUnits * (0.3 + rand() * 0.4)));
  return [source(`${lineId}_s1`, first), source(`${lineId}_s2`, minUnits - first)];
}

/**
 * Turn priced lines into returned goods: same money identity, plus everything
 * the warehouse needs to receive the box and quality needs to trace the batch.
 *
 * Items start undecided. Whether they get resolved depends on how far the
 * approval got, which is the seed's job below and not this function's.
 */
function buildReturnLines(target: number, returnId: number): ReturnLine[] {
  return buildOrderLines(target).map((line, index) => {
    const lineId = `rl_${returnId}_${index + 1}`;
    const reason = pick(ALL_RETURN_REASONS);
    const rules = rulesFor(reason);
    return {
      ...line,
      reason,
      // What the client had bought: always at least what is coming back, since a
      // stored return is one that already passed the quantity check.
      invoicedMinUnits: lineMinUnits(line) + Math.floor(between(0, 40)),
      // Stripped of whatever this reason says does not exist. A seeded line claiming
      // `PRODUCTO SIN LOTE O SIN FECHA DE VENCIMIENTO` while carrying a lot number is a
      // line the form could never have produced — and the screens that read it would be
      // showing a contradiction nobody could have entered.
      sources: buildReturnSources(lineId, lineMinUnits(line)).map((source) => ({
        ...source,
        ...(isHidden(rules.dueDate) ? { dueDate: null } : {}),
        ...(isHidden(rules.lot) ? { batchNumber: "" } : {}),
      })),
      notes: pick(RETURN_LINE_NOTES),
      // A real, verified photo (`fotoDeMercaderia`, same id Monitoreo uses for incidencias de
      // mercadería) rather than the literal "url" placeholder — so the evidence dialog has
      // something to actually show. Between one and three, because that is what a seller sends: the
      // failure, usually the batch stamp, sometimes a second angle.
      photos: Array.from({ length: 1 + Math.floor(rand() * 3) }, () => fotoDeMercaderia()),
      itemStatus: "PENDING" as const,
      approvedMinUnits: null,
      rejectReason: null,
      decisionByName: null,
      decisionAt: null,
    };
  });
}

/**
 * Rule on every line so the granted total lands inside `budget`, in Bs.
 *
 * Walked in order, each line taking what is left: the first products come
 * through whole, one lands mid-way as a partial cut, and whatever the budget ran
 * out on is refused with a reason. That is the shape a real decision has — and
 * it is the only way to seed a *specific* resulting amount, which is what the
 * ladder's early exit has to be demonstrated with.
 */
function grantWithinBudget(
  lines: ReturnLine[],
  budget: number,
  actorName: string,
  at: string,
): ReturnLine[] {
  let remaining = budget;
  return lines.map((line) => {
    const claimed = lineMinUnits(line);
    const granted = Math.min(claimed, Math.max(0, Math.floor(remaining / line.priceUnit)));
    if (granted <= 0) {
      return applyItemDecision(
        line,
        {
          productId: line.productId,
          status: "REJECTED",
          rejectReason: pick(RETURN_ITEM_REJECTIONS),
        },
        actorName,
        at,
      );
    }
    remaining = round2(remaining - granted * line.priceUnit);
    return applyItemDecision(
      line,
      { productId: line.productId, status: "APPROVED", approvedMinUnits: granted },
      actorName,
      at,
    );
  });
}

/** Approve every line for everything it claims — the uncontested case. */
const grantInFull = (lines: ReturnLine[], actorName: string, at: string): ReturnLine[] =>
  lines.map((line) =>
    applyItemDecision(
      line,
      { productId: line.productId, status: "APPROVED", approvedMinUnits: lineMinUnits(line) },
      actorName,
      at,
    ),
  );

/**
 * Returns spread across the whole flow, on purpose.
 *
 * A queue screen is only worth looking at when it has work in it, so the seed
 * deals returns into every state the model can reach — waiting on each of the
 * three desks, handed back to the seller, rejected, approved in full and
 * approved in part.
 *
 * What it exercises above all is the ladder. There is one template now, and how
 * far a devolución climbs is decided by money twice over: the claim decides
 * which levels are born at all, and every cut decides whether the level that
 * made it is the last one. So the seed picks, per return, the rung it is meant
 * to stop at, and then cuts the items hard enough to actually stop there —
 * some closing at the supervisor because the recorte fell under Bs 500, some at
 * jefatura, some running the ladder to the top.
 *
 * Nothing here encodes the flow itself: the engine is driven with the same
 * functions the running app calls, so the seed cannot drift from the behaviour
 * it is seeding.
 */
/**
 * The mock deals three end states and no others: **en aprobación, aprobada,
 * rechazada**.
 *
 * The engine still knows all seven — `PARTIALLY_APPROVED`, `RETURNED`,
 * `ANNULLED` and `DRAFT` are produced by the running app the moment somebody
 * cuts a quantity or hands a claim back, and nothing about them was removed.
 * What this switches off is the seed *pretending* they already happened, which
 * is a different thing: a demo list where a fifth of the rows read "devuelta"
 * or "aprobación parcial" spends its first minute explaining states nobody
 * asked about yet.
 *
 * Flip it to `false` and the fuller story comes back: recortes that land a
 * claim in partial approval, first-desk rejections that travel back to the
 * seller, and the corrected-and-resubmitted lineage the timeline was built to
 * show. The machinery below is intact and guarded, not deleted — it is the only
 * data that can demonstrate those screens.
 */
const SEED_SIMPLE_RETURN_STATES: boolean = true;

function buildReturns(): Return[] {
  // Eighteen and not sixteen: three bands times three exit rungs is nine
  // combinations, and the list has to be long enough for each of them to appear.
  const clients = SEED_CLIENTS.slice(0, 18);
  // One template, always. Which of its levels run is the amount's business.
  const definition = SEED_WORKFLOWS.find((wf) => wf.targetCode === "RETURN" && wf.isActive);
  const version = definition ? currentVersionOf(definition.versions) : null;
  const ladder = version ? [...version.levels].sort((a, b) => a.order - b.order) : [];

  return clients.map((client, index) => {
    const id = 4_500_000 + index;
    const daysAgo = Math.floor(between(0, 12));
    const createdAt = new Date(Date.now() - daysAgo * 86_400_000 - index * 1_800_000);

    // Claims spread across the three bands so every rung of the ladder is born
    // active on some of the list and skipped on the rest.
    const band = index % 3;
    const target = band === 0 ? between(180, 460) : band === 1 ? between(900, 1800) : between(2500, 6500);
    const lines = buildReturnLines(target, id);
    const subtotal = subtotalOf(lines);
    const total = subtotal;

    const seller = SEED_SELLERS[index % SEED_SELLERS.length];

    const decidedAt = (hoursAfter: number) =>
      new Date(createdAt.getTime() + hoursAfter * 3_600_000).toISOString();

    const base: Omit<
      Return,
      | "status"
      | "settlement"
      | "workflow"
      | "pastWorkflows"
      | "pastLineSnapshots"
      | "approvedTotal"
      | "rejectedTotal"
    > = {
      id,
      createdAt: createdAt.toISOString(),
      distributorName: RETURN_DISTRIBUTOR_NAMES[index % RETURN_DISTRIBUTOR_NAMES.length],
      clientId: client.id,
      clientName: client.name,
      clientOwnerName: client.ownerName,
      sellerCode: seller.code,
      sellerName: seller.name,
      replacementDate: dayKeyFrom(2 + Math.floor(rand() * 8)),
      justification: pick(RETURN_JUSTIFICATIONS),
      lines,
      subtotal,
      ice: iceTotalOf(lines),
      total,
      editCount: 0,
      // Seeded returns are never notas disociadas — the split only happens live, on a partial
      // level-1 approval (`returnsService.approve`).
      originReturnId: null,
    };

    if (!definition || !version || ladder.length === 0) {
      // No published devolución template at all. Impossible with the seeded
      // data, but the seed must not invent a flow the configuration does not have.
      return {
        ...base,
        status: "ABIERTO",
        settlement: null,
        workflow: null,
        pastWorkflows: [],
        pastLineSnapshots: [],
        approvedTotal: null,
        rejectedTotal: null,
      };
    }

    let instance = startInstance({
      id: `wfi_${id}`,
      definition,
      version,
      targetCode: "RETURN",
      targetId: id,
      initiatedByName: seller.name,
      amount: total,
      relevantValue: total,
      at: createdAt.toISOString(),
    });

    /**
     * The rung this devolución is meant to stop at, and what the deciding desk
     * has to grant for it to actually stop there.
     *
     * Derived from the levels the claim actually activated rather than assumed:
     * a return of Bs 300 has one desk and cannot demonstrate an early exit, and
     * pretending otherwise would seed a state the engine cannot produce.
     */
    const activeRungs = ladder.filter(
      (l) => l.activationMinAmount === null || l.order === 1 || l.activationMinAmount < total,
    ).length;
    // Stepped on the row *group* and not on `index`, which already picks the
    // band: reusing it would correlate the two and every large devolución would
    // draw the same rung.
    const exitRung = 1 + (Math.floor(index / 3) % activeRungs);
    const rungFloor = ladder[exitRung - 1].activationMinAmount ?? 0;
    const rungCeiling = exitRung < ladder.length ? ladder[exitRung].activationMinAmount : null;

    // `null` means "grant every item in full", which is what keeps an approved
    // claim out of `PARTIALLY_APPROVED`: the status is derived from the amounts,
    // so the only way to seed a clean "aprobada" is to seed no recorte.
    const budget = SEED_SIMPLE_RETURN_STATES
      ? null
      : exitRung < activeRungs && rungCeiling !== null
        ? // Cut into a lower band on purpose: this is the one that ends early.
          between(rungCeiling * 0.3, rungCeiling * 0.9)
        : rand() < 0.45
          ? // A recorte that stays inside this desk's own band: partial, but not early.
            between(Math.max(rungFloor * 1.05, total * 0.5), total)
          : null;

    /**
     * Rows dealt to the very top of the ladder are walked there, come what may.
     *
     * Left to the draw, the highest desk ends up with nothing about half the
     * time — and a mock where the last level of the flow is never reached cannot
     * show what having a ladder is for. Everything else stays random.
     */
    const climbsWholeLadder = exitRung === ladder.length && activeRungs === ladder.length;

    let decidedLines = lines;
    const roll = rand();
    let elapsed = between(2, 20);

    // Roughly a fifth are left untouched on the first desk, so every queue has
    // work waiting in it rather than a list of already-decided documents.
    let advancing = climbsWholeLadder || roll >= 0.22;

    // Every fifth return tells the full story: handed back, corrected,
    // resubmitted. Offset so it never lands on a row dealt to climb the whole
    // ladder — a document sent back to the seller never gets there, and the top
    // desk would end up with nothing in its queue.
    const handedBackByDesign = index % 5 === 1;

    // Walk the flow forward the way the app would, one signature at a time.
    // Every branch either breaks or consumes a signature, and signatures are
    // finite, so this terminates on its own.
    while (advancing) {
      const level = currentLevelOf(instance);
      if (!level) break;
      const signer = level.assignees.find((a) => !a.hasActed);
      if (!signer) break;

      const actor = { employeeCode: signer.employeeCode, employeeName: signer.employeeName };

      // A rejection on the first desk is what populates the "devuelta" state;
      // the level's own setting decides that it goes back rather than dying.
      //
      // Forced on a fixed slice of the list rather than left to the draw: the
      // second round and the superseded lineage are the whole reason the
      // timeline is built the way it is, and a mock where they surface once in
      // sixteen — or not at all — cannot demonstrate them.
      if (!climbsWholeLadder && (roll < 0.34 || handedBackByDesign) && level.order === 1) {
        instance = rejectCurrentLevel(
          instance,
          actor,
          // `TERMINATE` closes the claim as rechazada; `RETURN_INITIATOR` sends
          // it back to the seller and leaves it "devuelta", which is the state
          // the simple seed does not deal.
          SEED_SIMPLE_RETURN_STATES ? "TERMINATE" : "RETURN_INITIATOR",
          pick(RETURN_REJECTION_COMMENTS),
          null,
          decidedAt(elapsed),
        ).instance;
        break;
      }

      /**
       * Every level decides items, and the first desk to sign is the one that
       * has to resolve all of them: the engine refuses to close a level with a
       * product still undecided, because the amount the next rung is measured
       * against would not exist yet.
       */
      const at = decidedAt(elapsed);
      const resolving = decidedLines.some((line) => line.itemStatus === "PENDING");
      if (resolving) {
        decidedLines =
          budget === null
            ? grantInFull(decidedLines, signer.employeeName, at)
            : grantWithinBudget(decidedLines, budget, signer.employeeName, at);
      }

      const outcome = approveCurrentLevel(
        instance,
        actor,
        rand() < 0.45 ? pick(RETURN_APPROVAL_COMMENTS) : null,
        at,
        relevantAmountOf(decidedLines),
      );
      instance = outcome.instance;

      // Stamp the amount onto the signature that moved it, the way the service
      // does. Only a decision that touched quantities carries a figure, which is
      // exactly what makes those entries the ones the histórico is read for.
      if (resolving) {
        const after = amountsOf(decidedLines).approved;
        instance = {
          ...instance,
          actions: instance.actions.map((action, actionIndex) =>
            actionIndex === instance.actions.length - 1
              ? { ...action, amountBefore: total, amountAfter: after }
              : action,
          ),
        };
      }

      elapsed += between(6, 30);

      // Stop part-way often enough that every desk has a queue to show — but
      // never on a rung below the one this devolución was dealt to reach, or the
      // top of the ladder would be a level nothing ever arrives at.
      if (outcome.finished || (level.order >= exitRung - 1 && rand() < 0.45)) advancing = false;
    }

    /**
     * Some of the returns that were handed back get corrected and resubmitted.
     *
     * Without this the second round would be unreachable in the mock, and the
     * whole point of the timeline — that a document can cross the same desk
     * twice, with a smaller claim that activates fewer levels than the first —
     * would have no data to show. The seller drops the lines they could not back
     * with an invoice, which is what actually happens and what makes the amount
     * move.
     */
    const pastWorkflows: WorkflowInstance[] = [];
    const pastLineSnapshots: ReturnLineSnapshot[] = [];
    let currentLines = decidedLines;
    let currentTotal = total;
    let editCount = 0;

    if (
      instance.status === "RETURNED" &&
      decidedLines.length > 3 &&
      (handedBackByDesign || rand() < 0.6)
    ) {
      const resubmittedAt = decidedAt(elapsed + between(20, 40));
      pastWorkflows.push({ ...instance, status: "CANCELLED", finishedAt: resubmittedAt });
      // What the first round actually decided, frozen before it gets wiped below —
      // otherwise the histórico for round 1 would show every item as pending.
      pastLineSnapshots.push({ workflowId: pastWorkflows[0].id, lines: decidedLines });

      currentLines = clearItemDecisions(decidedLines.slice(0, -2));
      currentTotal = subtotalOf(currentLines);
      editCount = 1;

      // Same template, re-evaluated ladder: a correction that drops the claim
      // under Bs 500 genuinely activates one desk now where it activated three.
      instance = startInstance({
        id: `wfi_${id}_r2`,
        definition,
        version,
        targetCode: "RETURN",
        targetId: id,
        initiatedByName: seller.name,
        amount: currentTotal,
        relevantValue: currentTotal,
        supersededInstanceId: pastWorkflows[0].id,
        at: resubmittedAt,
      });

      // Carry it one desk forward so the second round has a decision in it. The
      // items have to be resolved to close a level, exactly as the service demands.
      const level2 = currentLevelOf(instance);
      const signer2 = level2?.assignees[0];
      if (signer2 && rand() < 0.7) {
        const at2 = decidedAt(elapsed + between(44, 60));
        currentLines = grantInFull(currentLines, signer2.employeeName, at2);
        instance = approveCurrentLevel(
          instance,
          { employeeCode: signer2.employeeCode, employeeName: signer2.employeeName },
          pick(RETURN_APPROVAL_COMMENTS),
          at2,
          relevantAmountOf(currentLines),
        ).instance;
      }
    }

    const settled = instance.status === "APPROVED";
    const amounts = amountsOf(currentLines);

    return {
      ...base,
      lines: currentLines,
      subtotal: subtotalOf(currentLines),
      ice: iceTotalOf(currentLines),
      total: currentTotal,
      editCount,
      status: statusOf({ workflow: instance, lines: currentLines, editCount, originReturnId: null }),
      // How it is settled is only known once it is: a claim still crossing desks
      // has no answer yet, and a rejected one never gets one. The swap is the
      // common case — a credit note is what is issued when there is no stock to
      // give back — so the draw is weighted rather than even.
      settlement: settled ? (rand() < 0.7 ? "CAMBIO_STOCK" : "NOTA_CREDITO") : null,
      workflow: instance,
      pastWorkflows,
      pastLineSnapshots,
      approvedTotal: settled ? amounts.approved : null,
      rejectedTotal: settled ? amounts.rejected : null,
    } satisfies Return;
  });
}

export const SEED_RETURNS: Return[] = buildReturns();

// ---- Completed general tasks -------------------------------------------------
function buildGeneralTaskCompletions(): CompletedGeneralTask[] {
  const completions: CompletedGeneralTask[] = [];
  const activeSellers = SEED_FIELD_SELLERS.filter((s) => s.status === "ACTIVO");
  let id = 1;

  for (const task of SEED_GENERAL_TASKS) {
    if (task.status !== "active" || rand() < 0.4) continue;
    const targets =
      task.assignScope === "some" && task.sellerCodes.length
        ? SEED_FIELD_SELLERS.filter((s) => task.sellerCodes.includes(s.code))
        : activeSellers;
    const pool = targets.length ? targets : activeSellers;
    const n = 1 + Math.floor(rand() * 3);

    for (let k = 0; k < n; k++) {
      const seller = pick(pool);
      // ~40% completed today, the rest spread over the last few days.
      const daysAgo = rand() < 0.4 ? 0 : Math.floor(between(1, 5));
      const completedAt = new Date();
      completedAt.setDate(completedAt.getDate() - daysAgo);
      completions.push({
        id: id++,
        generalTaskId: task.id,
        employeeId: seller.code,
        employeeName: seller.name,
        completedAt: completedAt.toISOString(),
        response:
          task.responseType === "texto" ||
          task.responseType === "toma_precio" ||
          task.responseType === "inventario_faltante"
            ? pick(COMPLETION_NOTES)
            : null,
        checkListResponse:
          task.responseType === "checklist"
            ? task.checklistItems.map((item) => ({ item, checked: rand() < 0.75 }))
            : null,
        ratingResponse: task.responseType === "calificacion" ? 1 + Math.floor(rand() * 5) : null,
        photos:
          task.responseType === "foto"
            ? Array.from({ length: 1 + Math.floor(rand() * 2) }, (_, i) => ({ id: i + 1, url: "url" }))
            : [],
      });
    }
  }
  return completions;
}

export const SEED_COMPLETED_GENERAL_TASKS: CompletedGeneralTask[] = buildGeneralTaskCompletions();
