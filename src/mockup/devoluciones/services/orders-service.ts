import type {
  Client,
  Order,
  OrderBonification,
  OrderIncentives,
  OrderCancelReason,
  OrderLine,
  OrderOrigin,
  OrderPaymentMethod,
  OrderStatus,
} from "../types";
import {
  ORDER_COMPANIES,
  ORDER_WAREHOUSES,
  SEED_CLIENTS,
  SEED_ORDERS,
  SEED_SELLERS,
} from "../data/seed";
import { CHANNELS } from "../data/channels";
import { getProduct } from "../data/products";
import { clientNit } from "../lib/client-billing";
import { toDateKey } from "../lib/frequency";
import {
  discountOf,
  giftUnitsFor,
  iceTotalOf,
  lineMinUnits,
  round2,
  subtotalOf,
} from "../lib/order-math";
import { delay } from "../lib/utils";
import type { Paginated } from "./routes-service";

export interface ListOrdersParams {
  page?: number;
  limit?: number;
  /** Inclusive `YYYY-MM-DD` bounds on the order date. */
  from?: string;
  to?: string;
  /** Matches the client's name only — the rest has its own filter. */
  search?: string;
  company?: string;
  sellerCode?: number | "all";
  status?: OrderStatus | "all";
}

/**
 * In-memory mutable repository standing in for the orders REST resource — same
 * pattern as every other service here.
 */
let ORDERS: Order[] = [...SEED_ORDERS];

/** Companies available in the `Empresa` filter. */
export const orderCompanies = (): string[] => [...ORDER_COMPANIES];

/**
 * The order a visit closed with, or nothing.
 *
 * Resolved against live state rather than the seed, so an order edited in this
 * session is the one the visit history quotes. Orders taken from the back office
 * carry no `visitId` and therefore never match — only field orders belong to a
 * visit.
 */
export function orderForVisit(visitId: number): Order | undefined {
  return ORDERS.find((order) => order.visitId === visitId);
}

/**
 * The same join for a whole list of visits, indexed once.
 *
 * A list screen resolving one order per row with `orderForVisit` would scan the
 * repository per row; this walks it once and lets each row look itself up.
 */
export function ordersByVisitId(): Map<number, Order> {
  const byVisit = new Map<number, Order>();
  for (const order of ORDERS) {
    if (order.visitId != null) byVisit.set(order.visitId, order);
  }
  return byVisit;
}

/**
 * One company's share of an order — the document the ERP actually issues.
 *
 * A seller sells from one catalogue, but the catalogue spans legal entities, so
 * a single order becomes one document per company. The original is kept intact
 * (that is what `listPaged` returns); this is the derived side.
 */
export interface CompanyOrder {
  /** `orderId · company` — the split has no id of its own until the ERP issues one. */
  key: string;
  orderId: number;
  company: string;
  createdAt: string;
  deliveryDate: string;
  clientId: string;
  clientName: string;
  clientOwnerName: string;
  sellerCode: number;
  sellerName: string;
  paymentMethod: OrderPaymentMethod;
  warehouse: string;
  noteNumber: string | null;
  /** Inherited from the parent order: the split does not change how it arrived. */
  origin: OrderOrigin;
  /** Inherited too — splitting by company does not change what was sold. */
  service?: string | null;
  status: OrderStatus;
  /** This company's lines. Empty for orders the ERP already handed over split. */
  lines: OrderLine[];
  subtotal: number;
  discount: number;
  /**
   * The rate behind that amount, inherited from the parent order.
   *
   * Carried because the share's own lines are read with it: a line's `Desct.` is
   * the order's percentage applied to that line, and recomputing a rate from
   * `discount / subtotal` here would drift on the rounding remainder the last
   * company absorbs.
   */
  discountPct: number;
  ice: number;
  netTotal: number;
  /** True when the parent order really did break into more than one document. */
  fromSplit: boolean;
}

/**
 * Break one order into the documents its companies would issue.
 *
 * The discount was granted over the whole order, so each company carries it in
 * proportion to what it sold — anything else would let the split change what the
 * client owes. The last share absorbs the rounding remainder so the parts always
 * add back up to the original, exactly.
 *
 * An order with no lines is one the ERP already delivered split: it is returned
 * as the single document it already is.
 */
export function splitByCompany(order: Order): CompanyOrder[] {
  const base = {
    orderId: order.id,
    createdAt: order.createdAt,
    deliveryDate: order.deliveryDate,
    clientId: order.clientId,
    clientName: order.clientName,
    clientOwnerName: order.clientOwnerName,
    sellerCode: order.sellerCode,
    sellerName: order.sellerName,
    paymentMethod: order.paymentMethod,
    warehouse: order.warehouse,
    noteNumber: order.noteNumber,
    origin: order.origin,
    service: order.service ?? null,
    status: order.status,
    discountPct: order.discountPct ?? 0,
  };

  const lines = order.lines ?? [];
  if (lines.length === 0) {
    return [
      {
        ...base,
        key: `${order.id}-${order.company ?? ORDER_COMPANIES[0]}`,
        company: order.company ?? ORDER_COMPANIES[0],
        lines: [],
        subtotal: order.subtotal ?? round2(order.netTotal + order.discount),
        discount: order.discount,
        ice: order.ice,
        netTotal: order.netTotal,
        fromSplit: false,
      },
    ];
  }

  const byCompany = new Map<string, OrderLine[]>();
  for (const line of lines) {
    const current = byCompany.get(line.company);
    if (current) current.push(line);
    else byCompany.set(line.company, [line]);
  }

  const companies = [...byCompany.keys()].sort();
  const orderSubtotal = subtotalOf(lines);
  let discountLeft = order.discount;

  return companies.map((company, index) => {
    const companyLines = byCompany.get(company)!;
    const subtotal = subtotalOf(companyLines);
    const last = index === companies.length - 1;
    const discount = last
      ? round2(discountLeft)
      : round2(orderSubtotal === 0 ? 0 : (order.discount * subtotal) / orderSubtotal);
    discountLeft = round2(discountLeft - discount);

    return {
      ...base,
      key: `${order.id}-${company}`,
      company,
      lines: companyLines,
      subtotal,
      discount,
      ice: iceTotalOf(companyLines),
      netTotal: round2(subtotal - discount),
      fromSplit: companies.length > 1,
    };
  });
}

/** A place the client can receive goods at. Clients may have several. */
export interface DeliveryPoint {
  id: string;
  code: string;
  name: string;
  address: string;
  /** Where it actually is, so the point can be checked on a map before agreeing to it. */
  lat: number;
  lng: number;
}

/**
 * Order-time client data: who to invoice, where to deliver, who to ask for.
 *
 * `address`/`phone`/`clientType`/`sector`/`channelName`/`ticketPromedio` are plain fields already on
 * `Client` — exposed here rather than read again from `SEED_CLIENTS` by every screen that wants them,
 * so the return detail view and the order form agree on where a client's data comes from.
 */
export interface OrderClientDetails {
  nit: string;
  razonSocial: string;
  contact: string;
  address: string;
  phone: string;
  clientType: Client["clientType"];
  sector: string;
  /** Resolved against `CHANNELS` — the id alone means nothing on a screen. */
  channelName: string;
  /** Average monthly purchase (Bs.), `Client.ticketPromedio`. */
  ticketPromedio: number;
  deliveryPoints: DeliveryPoint[];
}

/** Address suffixes that make each mock delivery point distinguishable. */
const DELIVERY_SUFFIXES = ["Local principal", "Depósito · Galpón 2", "Sucursal Norte"];

export interface CreateOrderInput {
  clientId: string;
  /** Seller the signed-in user acts as. Comes from the session, not a field. */
  sellerCode: number;
  /** Who actually took the order — the signed-in user's name. */
  sellerName: string;
  paymentMethod: OrderPaymentMethod;
  /** `YYYY-MM-DD`. */
  deliveryDate: string;
  deliveryFrom: string;
  deliveryTo: string;
  deliveryPoint: string;
  contact: string;
  notes: string;
  lines: OrderLine[];
  /** The pricing service's answer, as applied by the user. */
  discountPct: number;
  bonifications: OrderBonification[];
}

/**
 * Filters that apply to the order as taken. `company` is deliberately absent:
 * the original has no company, so only the per-company view can filter by one —
 * and it does so after splitting.
 */
function filterOrders({
  from = "",
  to = "",
  search = "",
  sellerCode = "all",
  status = "all",
}: ListOrdersParams): Order[] {
  const q = search.trim().toLowerCase();
  return ORDERS.filter((order) => {
    const dateKey = toDateKey(new Date(order.createdAt));
    if (from && dateKey < from) return false;
    if (to && dateKey > to) return false;
    if (sellerCode !== "all" && order.sellerCode !== sellerCode) return false;
    if (status !== "all" && order.status !== status) return false;
    if (q && !order.clientName.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** How long an order stays open to changes after it was registered. */
export const EDIT_WINDOW_HOURS = 2;

/** Minutes left in that window, or 0 once it has closed. */
export function editWindowLeftMin(order: Order): number {
  const elapsed = Date.now() - new Date(order.createdAt).getTime();
  return Math.max(0, Math.ceil((EDIT_WINDOW_HOURS * 3_600_000 - elapsed) / 60_000));
}

/**
 * Why an order cannot be touched, or `null` when it can.
 *
 * One function for the rule and its explanation, because the two must never
 * disagree: the screen disables the action with exactly the sentence the service
 * would reject it with.
 *
 * The conditions are facts, not permissions. `pendiente` because once dispatched
 * the warehouse is already acting on it. Lines, because orders the ERP hands
 * over arrive as amounts with no breakdown and there is nothing to edit. And the
 * two-hour window, because after that the order has been picked up by the
 * operation and changing it on paper no longer changes anything real.
 */
export function editBlockedReason(order: Order): string | null {
  if (order.status === "anulado") return "El pedido está anulado.";
  if (order.status !== "pendiente") return "Sólo se edita mientras está pendiente.";
  if ((order.lines?.length ?? 0) === 0) return "Este pedido llegó del ERP sin detalle.";
  if (editWindowLeftMin(order) === 0) {
    return `Pasaron más de ${EDIT_WINDOW_HOURS} horas desde que se registró.`;
  }
  return null;
}

export const isEditable = (order: Order): boolean => editBlockedReason(order) === null;

/**
 * Cancelling closes on the same clock as editing: after the window the order is
 * already in the operation's hands, and undoing it there is not this screen's
 * call.
 */
export function cancelBlockedReason(order: Order): string | null {
  if (order.status === "anulado") return "El pedido ya está anulado.";
  if (editWindowLeftMin(order) === 0) {
    return `Pasaron más de ${EDIT_WINDOW_HOURS} horas desde que se registró.`;
  }
  return null;
}

export const isCancellable = (order: Order): boolean => cancelBlockedReason(order) === null;

export const ordersService = {
  /** Server-style paginated + filtered list (as the real API returns it). */
  listPaged: (params: ListOrdersParams = {}): Promise<Paginated<Order>> => {
    const { page = 1, limit = 10 } = params;
    const filtered = filterOrders(params);
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const data = filtered.slice((safePage - 1) * limit, safePage * limit);
    return delay({ data, pagination: { page: safePage, limit, totalItems, totalPages } }, 400);
  },

  /**
   * The same filtered orders, but as the per-company documents the ERP issues.
   *
   * Filtering happens on the parent orders and the split runs afterwards, so a
   * company filter narrows to that company's documents instead of dropping the
   * whole order — which is the entire point of looking at this view.
   */
  listSplitPaged: (params: ListOrdersParams = {}): Promise<Paginated<CompanyOrder>> => {
    const { page = 1, limit = 10, company = "all" } = params;
    const rows = filterOrders({ ...params, company: "all" })
      .flatMap(splitByCompany)
      .filter((row) => company === "all" || row.company === company);

    const totalItems = rows.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const data = rows.slice((safePage - 1) * limit, safePage * limit);
    return delay({ data, pagination: { page: safePage, limit, totalItems, totalPages } }, 400);
  },

  get: (id: number): Promise<Order | undefined> =>
    delay(
      ORDERS.find((o) => o.id === id),
      300,
    ),

  /**
   * Invoicing and delivery data for a client. Derived rather than stored, so
   * the same client always answers the same thing without twenty hand-written
   * records; a real backend owns these fields.
   */
  clientDetails: (clientId: string): Promise<OrderClientDetails | undefined> => {
    const client = SEED_CLIENTS.find((c) => c.id === clientId);
    if (!client) return delay(undefined, 200);
    return delay(
      {
        nit: clientNit(client.code),
        razonSocial: client.name,
        contact: client.ownerName,
        address: client.address,
        phone: client.phone,
        clientType: client.clientType,
        sector: client.sector,
        channelName: CHANNELS.find((c) => c.id === client.channelId)?.name ?? "—",
        ticketPromedio: client.ticketPromedio,
        deliveryPoints: DELIVERY_SUFFIXES.map((suffix, i) => ({
          id: `${client.id}-dp-${i + 1}`,
          code: String(Number(client.code.replace(/\D/g, "") || 0) + i),
          name: client.name,
          address: `${client.address} · ${suffix}`,
          // The first point is the store itself; the others are separate places,
          // so they are nudged a few hundred metres off it rather than stacked on
          // the same pin — a map of three identical dots answers nothing.
          lat: client.lat + i * 0.0035,
          lng: client.lng - i * 0.0028,
        })),
      },
      300,
    );
  },

  /**
   * Value the order: discounts and bonifications for a set of lines.
   *
   * Async on purpose even though the rule could run in the browser. Discounts
   * and bonifications are the business's answer, and building the screen
   * against a promise — with its loading state and its error path — is what
   * keeps the wiring honest for the day the real endpoint lands.
   */
  fetchIncentives: ({
    lines,
    paymentMethod,
  }: {
    lines: OrderLine[];
    paymentMethod: OrderPaymentMethod;
  }): Promise<OrderIncentives> => {
    if (lines.length === 0) {
      return Promise.reject(new Error("Agregá al menos un producto antes de valorizar el pedido."));
    }

    const subtotal = subtotalOf(lines);
    const reasons: string[] = [];
    let discountPct = 0;
    // Cumulative, richest condition first only for reading order — both apply.
    if (paymentMethod === "CONTADO") {
      discountPct += 5;
      reasons.push("Contado 5%");
    }
    if (subtotal >= 500) {
      discountPct += 3;
      reasons.push("Volumen 3%");
    }

    // One entry per line that reached a tier. The gift is the same product by
    // default; which sibling ships is the user's to change afterwards.
    const bonifications: OrderBonification[] = lines.flatMap((line) => {
      const qty = giftUnitsFor(lineMinUnits(line));
      if (qty === 0) return [];
      const product = getProduct(line.productId);
      return [
        {
          productId: line.productId,
          giftProductId: line.productId,
          giftProductName: product?.name ?? line.productName,
          qty,
          unitLabel: line.unitLabel,
        },
      ];
    });

    return delay({ discountPct, reasons, bonifications }, 1100);
  },

  /**
   * Register a new order. The number, the timestamp, every amount and the
   * dispatch data are the server's to assign — the form sends what was agreed,
   * not what it adds up to nor where it ships from.
   */
  create: (input: CreateOrderInput): Promise<Order> => {
    const client = SEED_CLIENTS.find((c) => c.id === input.clientId);
    const seller = SEED_SELLERS.find((s) => s.code === input.sellerCode);
    if (!client) return Promise.reject(new Error("El cliente ya no existe"));

    const subtotal = subtotalOf(input.lines);
    const discount = discountOf(subtotal, input.discountPct);
    // No company here on purpose: the order is stored exactly as it was taken.
    // Splitting it per legal entity is the split view.s job, derived from the
    // lines. The warehouse still stands in for a lookup the form cannot do.
    const order: Order = {
      id: Math.max(0, ...ORDERS.map((o) => o.id)) + 1,
      createdAt: new Date().toISOString(),
      deliveryDate: input.deliveryDate,
      clientId: client.id,
      clientName: client.name,
      clientOwnerName: client.ownerName,
      sellerCode: input.sellerCode,
      sellerName: input.sellerName || (seller?.name ?? `Vendedor ${input.sellerCode}`),
      discount,
      ice: iceTotalOf(input.lines),
      netTotal: round2(subtotal - discount),
      paymentMethod: input.paymentMethod,
      warehouse: ORDER_WAREHOUSES[0],
      // Registered here, not documented yet — the note number comes with the
      // dispatch, same rule the seeded pending orders follow.
      noteNumber: null,
      // Taken from this back office, which is the web channel.
      origin: "WEB",
      status: "pendiente",
      visitId: null,

      subtotal,
      discountPct: input.discountPct,
      deliveryFrom: input.deliveryFrom,
      deliveryTo: input.deliveryTo,
      deliveryPoint: input.deliveryPoint,
      contact: input.contact,
      notes: input.notes,
      // Cloned on the way in: a stored order and a live form must never share
      // the same objects.
      lines: input.lines.map((line) => ({ ...line })),
      bonifications: input.bonifications.map((b) => ({ ...b })),
    };

    ORDERS = [order, ...ORDERS];
    return delay(order, 600);
  },

  /**
   * Rewrite an order that has not moved yet.
   *
   * Only what was agreed can change: the code, when it was taken and the visit
   * it came from are history and stay put. Every amount is recomputed here
   * rather than trusted from the form, exactly as `create` does — the client
   * sends what was agreed, the server says what it costs.
   */
  update: (id: number, input: CreateOrderInput): Promise<Order> => {
    const current = ORDERS.find((o) => o.id === id);
    if (!current) return Promise.reject(new Error("El pedido ya no existe"));
    const blocked = editBlockedReason(current);
    if (blocked) return Promise.reject(new Error(blocked));
    const client = SEED_CLIENTS.find((c) => c.id === input.clientId);
    if (!client) return Promise.reject(new Error("El cliente ya no existe"));

    const subtotal = subtotalOf(input.lines);
    const discount = discountOf(subtotal, input.discountPct);
    const updated: Order = {
      ...current,
      deliveryDate: input.deliveryDate,
      clientId: client.id,
      clientName: client.name,
      clientOwnerName: client.ownerName,
      paymentMethod: input.paymentMethod,
      deliveryFrom: input.deliveryFrom,
      deliveryTo: input.deliveryTo,
      deliveryPoint: input.deliveryPoint,
      contact: input.contact,
      notes: input.notes,
      subtotal,
      discountPct: input.discountPct,
      discount,
      ice: iceTotalOf(input.lines),
      netTotal: round2(subtotal - discount),
      lines: input.lines.map((line) => ({ ...line })),
      bonifications: input.bonifications.map((b) => ({ ...b })),
    };

    ORDERS = ORDERS.map((o) => (o.id === id ? updated : o));
    return delay(updated, 600);
  },

  /** Cancel an order — the list's destructive action, on the same clock as editing. */
  /** Void an order, recording which of the closed reasons was chosen. */
  cancel: (id: number, reason: OrderCancelReason): Promise<Order> => {
    const current = ORDERS.find((o) => o.id === id);
    if (!current) return Promise.reject(new Error("El pedido ya no existe"));
    const blocked = cancelBlockedReason(current);
    if (blocked) return Promise.reject(new Error(blocked));

    let updated: Order | undefined;
    ORDERS = ORDERS.map((o) => {
      if (o.id !== id) return o;
      updated = { ...o, status: "anulado" as OrderStatus, cancelReason: reason };
      return updated;
    });
    if (!updated) return Promise.reject(new Error("No se pudo anular el pedido"));
    return delay(updated, 350);
  },
};
