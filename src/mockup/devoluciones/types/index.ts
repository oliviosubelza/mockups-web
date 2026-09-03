/**
 * Domain types for the Sales Route Management microservice.
 *
 * Relationships:
 *   Channel (Canal de Venta) 1─┬─* Subcanal 1─┬─* Client
 *                              └─* Block (manzano, polygon on the map)
 *   Route *──* Channel / Subcanal (a route serves selected channels & subcanales)
 */

/** Dynamic task forms — their own contract, one import path. */
export * from "./task-form";
// `export *` re-exports without binding locally, and the task/response types here
// need both in scope: a definition is `Field[]`, a response is `AnswerValue[]`.
import type { AnswerValue, Field } from "./task-form";

export type LatLng = [number, number];

/** System roles. The signed-in user's role gates features across the app. */
/**
 * Four approval desks, ordered by how far a devolución has to climb before it
 * needs them: `analista_cx` is the first desk every claim reaches, `gerente_cx`
 * is who signs above them, `gerente_comercial` above that, and `gerente_general`
 * is the top of the ladder — the desk that closes whatever the three below it
 * did not settle.
 *
 * `vendedor_agencia` sells over the counter at the branch. It is a separate role
 * and not a flag on `vendedor` because almost everything the app grants a seller
 * presumes a day in the field — a route, a schedule, a check-in, a phone
 * reporting a position — and none of that exists behind a counter. Sharing the
 * role would mean every one of those screens carrying an exception; the split
 * puts the difference in one place.
 */
export type Role =
  | "analista_cx"
  | "gerente_cx"
  | "gerente_comercial"
  | "gerente_general"
  | "vendedor"
  | "vendedor_agencia"
  | "facturador"
  | "almacen";

/** A signed-in user (mocked). Supervisors carry the sales channel they oversee. */
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Sales channel the user oversees (e.g. a supervisor of "tradicional"). */
  channelName?: string;
  /**
   * Distributor the login belongs to (e.g. "DIST. BENI").
   *
   * It is a property of who is signed in, never a field on a form: a seller
   * registers returns for his own distributor and for no other, so every screen
   * that shows it shows it read-only.
   */
  distributor: string;
  /**
   * Seller the login acts as when it registers an order. In a real app this
   * arrives in the token; here it binds each mock user to a seed seller so the
   * orders they create still answer to the list's `Vendedor` filter.
   */
  sellerCode?: number;
  /**
   * Agency this login works the counter at — a `StockLocation` of kind
   * `agencia`.
   *
   * Only the counter roles carry one, and like `distributor` it is a fact about
   * who is signed in and never a field on a form: the tills a person may open
   * are the ones standing where they work, and a picker offering the other
   * branch's drawers would be offering a mistake.
   */
  agencyId?: string;
  /**
   * Employee the login signs approvals as.
   *
   * Separate from `sellerCode` because they are different identities: one
   * registers documents in the field, the other appears on a workflow level as
   * somebody allowed to sign. A seller has no approver identity at all, which is
   * exactly why this is optional — and why "Mis aprobaciones" is empty for them
   * rather than showing somebody else's queue.
   */
  employeeCode?: number;
}

/** A polygon ring: list of [lat, lng] points. */
export type Polygon = LatLng[];

export type RouteStatus = "active" | "inactive";

/** Canal de Venta — top level commercial channel. */
export interface Channel {
  id: string;
  name: string;
  /** Hex color used consistently across list / form / map. */
  color: string;
  /**
   * Discount, in percent, a client of this channel is sold at over the counter.
   *
   * It lives on the channel for the same reason `color` does: the channel owns
   * it, and the counter reads it here instead of keeping a price table of its
   * own. See `data/channels.ts` for the values and why they rank as they do.
   */
  discountPct: number;
  description?: string;
}

/** Subcanal — belongs to exactly one Channel. */
export interface Subcanal {
  id: string;
  channelId: string;
  name: string;
}

/** Cliente — a point of sale located inside the city grid. */
/** Tipo de Cliente — how the account is registered for invoicing. */
export type ClientType = "NATURAL" | "JURIDICO";

export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  NATURAL: "NATURAL",
  JURIDICO: "JURÍDICO",
};

export interface Client {
  id: string;
  code: string;
  name: string;
  /**
   * Owner account the store hangs from. One owner may hold several stores, so
   * this is what groups them: the account is who buys, the client is where the
   * goods are received.
   */
  ownerCode: string;
  ownerName: string;
  address: string;
  phone: string;
  /**
   * Legal nature of the account, as the ERP registered it. It is not cosmetic:
   * an invoice to a `JURIDICO` needs its NIT, a `NATURAL` may be billed to a
   * person, and no screen in this app gets to change it.
   */
  clientType: ClientType;
  /** Commercial sector the store is listed under (`Sector` in the ERP). */
  sector: string;
  subcanalId: string;
  channelId: string;
  lat: number;
  lng: number;
  /** Average monthly purchase of the client (Bs). */
  ticketPromedio: number;
  /** Single-visit sale generated when the seller visits (Bs). */
  dropSize: number;
}

/**
 * Polígono ("manzano") — a purely geographic area with NO name, channel or
 * color: just an id and its vertices. Its only purpose is to locate/group the
 * clients that fall inside it by position.
 */
export interface Block {
  id: string;
  polygon: Polygon;
  createdAt: string;
}

/**
 * Área de operación de una distribuidora — the territory a distributor sells
 * inside.
 *
 * It is the *coarse* half of the map, and the two halves answer different
 * questions: a distributor area says **who serves this ground**, a manzano says
 * **which clients are grouped together**. One department holds several
 * distributors, and manzanos are drawn on top of their areas — which is why this
 * layer renders underneath and pale, and never competes with what is above it.
 *
 * Unlike a `Block` it is a named commercial entity, so it carries a name, a code
 * and a colour of its own.
 */
export interface Distributor {
  id: string;
  name: string;
  /** Short code the business uses on paperwork (e.g. `DIS-01`). */
  code: string;
  /** Department it operates in (backend: departmentName). */
  departmentName: string;
  /** Identity colour — the single source of truth for this area everywhere. */
  color: string;
  polygon: Polygon;
  createdAt: string;
}

/** Ruta — a sales route made up of several manzanos (blocks). */
export interface Route {
  id: string;
  name: string;
  color: string;
  status: RouteStatus;
  /** City / province the route belongs to (backend: cityName / provinceName). */
  cityName?: string;
  provinceName?: string;
  channelIds: string[];
  subcanalIds: string[];
  /** Manzanos (block ids) that compose the route's geographic coverage. */
  blockIds: string[];
  /** Markets assigned to the route (traditional channel only). */
  marketIds?: string[];
  /** Validity window (valid_from / valid_to in the backend). */
  startDate: string;
  endDate: string;
  clientCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Payload used by create / update forms. */
export interface RouteInput {
  name: string;
  color: string;
  status: RouteStatus;
  /** City the route belongs to (backend: cityName). */
  cityName?: string;
  /** Province, derived from the selected city. */
  provinceName?: string;
  channelIds: string[];
  subcanalIds: string[];
  blockIds: string[];
  marketIds?: string[];
}

/**
 * A route as embedded in a macro's list payload — a summary (no blocks). Field
 * names mirror the backend response verbatim (activeFlag / valid_from / valid_to).
 */
export interface MacroRouteRef {
  id: number;
  name: string;
  color: string;
  activeFlag: boolean;
  distributorId: number;
  valid_from: string;
  valid_to: string;
}

/**
 * Macroruta — a named grouping of several routes. The list endpoint returns the
 * macro's routes embedded as summaries (see MacroRouteRef); it has no geometry
 * of its own.
 */
export interface RouteMacro {
  id: number;
  name: string;
  routes: MacroRouteRef[];
}

/** Payload used by create / update macro forms (send the selected route ids). */
export interface RouteMacroInput {
  name: string;
  routeIds: number[];
}

/**
 * Mercado — a named geographic area made up of manzanos (blocks), similar to a
 * Route but without channels/subcanales. Only administrators can draw them.
 */
export interface Market {
  id: string;
  name: string;
  color: string;
  /** Active / inactive — markets are deactivated (not deleted) from the list. */
  status: RouteStatus;
  /** Department the market belongs to (backend: departmentName). */
  departmentName?: string;
  /** City the market belongs to (backend: cityName). */
  cityName?: string;
  provinceName?: string;
  /** Manzanos (block ids) that compose the market's area. */
  blockIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Payload used by create / update market forms. */
export interface MarketInput {
  name: string;
  color: string;
  /** Active / inactive. Defaults to active on create. */
  status?: RouteStatus;
  /** Department (derived; all mock cities are in Santa Cruz). */
  departmentName?: string;
  /** City the market belongs to (backend: cityName). */
  cityName?: string;
  /** Province, derived from the selected city. */
  provinceName?: string;
  blockIds: string[];
}

export type SellerStatus = "ACTIVO" | "INACTIVO";

/** Week positions within a month (1 = first week, 4 = last week). */
export type WeekPosition = 1 | 2 | 3 | 4;

/** Day-of-week codes used for route frequency. */
export type DayCode = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

/** Label maps for UI display. */
export const WEEK_LABELS: Record<WeekPosition, string> = {
  1: "1ra semana",
  2: "2da semana",
  3: "3ra semana",
  4: "4ta semana",
};

export const DAY_LABELS: Record<DayCode, string> = {
  MO: "Lunes",
  TU: "Martes",
  WE: "Miércoles",
  TH: "Jueves",
  FR: "Viernes",
  SA: "Sábado",
  SU: "Domingo",
};

export const ALL_WEEKS: WeekPosition[] = [1, 2, 3, 4];
export const ALL_DAYS: DayCode[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
export const WEEKDAY_DAYS: DayCode[] = ["MO", "TU", "WE", "TH", "FR"];

/** Cadence type of a route visit. */
export type FrequencyType = "SEMANAL" | "QUINCENAL" | "MENSUAL";

export const FREQUENCY_TYPE_LABELS: Record<FrequencyType, string> = {
  SEMANAL: "Semanal",
  QUINCENAL: "Quincenal",
  MENSUAL: "Mensual",
};

export const ALL_FREQUENCY_TYPES: FrequencyType[] = ["SEMANAL", "QUINCENAL", "MENSUAL"];

/**
 * How often a seller visits a specific route:
 *  - SEMANAL:   every week on `days`.
 *  - QUINCENAL: every other week on `days`; the cycle is anchored to `validFrom`.
 *  - MENSUAL:   on the selected `weeks` of the month, on `days`.
 *
 * `weeks` is only meaningful for MENSUAL. `validFrom`/`validTo` are date-only ISO
 * strings (`YYYY-MM-DD`); mapping them to full timestamps is an API concern.
 */
export interface RouteFrequency {
  /** Cadence type. */
  type: FrequencyType;
  /** Which days of the week the visit happens. */
  days: DayCode[];
  /** Which weeks of the month the visit happens (MENSUAL only). */
  weeks: WeekPosition[];
  /** Start of the validity window (YYYY-MM-DD). */
  validFrom: string;
  /** End of the validity window (YYYY-MM-DD). */
  validTo: string;
}

/** One route assignment with its visit frequency. */
export interface SellerRouteAssignment {
  routeId: string;
  frequency: RouteFrequency;
}

/**
 * Seller detail response ("ver vendedor"). Field names mirror the backend
 * payload verbatim (including active_flag / valid_from / longitud / ownerNamer
 * and the stringified `coordinates`) so the real API response drops in as-is.
 */
export interface SellerDetailCustomer {
  customerId: number;
  ownerId: number;
  ownerNamer: string;
  latitude: number;
  longitud: number;
  customerName: string;
  subchannelName: string;
  subchannelId: number;
  assigned: boolean;
}

export interface SellerDetailBlock {
  code: number;
  name: string;
  /** JSON string: `[{'latitude':-20,'longitude':-50}, …]`. */
  coordinates: string;
  customers: SellerDetailCustomer[];
}

export interface SellerDetailRoute {
  id: number;
  name: string;
  color: string;
  active_flag: boolean;
  distributorId: number;
  valid_from: string;
  valid_to: string;
  /** Markets the route covers (traditional channel), for display. */
  markets: { name: string; color: string }[];
  blocks: SellerDetailBlock[];
}

export interface SellerDetail {
  name: string;
  user: string;
  email: string;
  activeFlag: boolean;
  avatar: string;
  assignRoutes: SellerDetailRoute[];
}

/**
 * Vendedor (Seller) — a salesperson, as returned by the sellers API:
 *   { code, name, phone, email, status }
 * `code` is the unique identifier. `phone` may be null. Channels/subcanales are
 * NOT stored directly: they're derived from the routes assigned, which
 * is managed by this app and not part of the list API payload.
 */
export interface Seller {
  /** Unique identifier coming from the sellers API. */
  code: number;
  /** Numeric business-partner code in SAP — the id used by the ERP, not by this app. */
  sapCode: number;
  /** Login the seller uses in the mobile app. */
  username: string;
  name: string;
  email: string;
  phone: string | null;
  status: SellerStatus;
  /**
   * Where the seller sells from: a route in the street, or the agency counter.
   *
   * The discriminator every field-day generator filters by. An `agencia` seller
   * has no route, so no schedule, no visit and no GPS trail — and none of that is
   * derivable from `routeAssignments` being empty, which also happens to a route
   * seller who has simply not been assigned one yet. Those two are the same shape
   * and different facts, so the fact is stored.
   */
  salesMode: "ruta" | "agencia";
  /** App-managed route assignments with frequency (not part of the sellers list API). */
  routeAssignments: SellerRouteAssignment[];
}

/**
 * Where a seller is right now, expressed as the leg they are covering rather
 * than as a coordinate.
 *
 * A single `{ lat, lng }` would only ever be as fresh as the last poll: between
 * two of them the marker would sit frozen and then jump. A leg — the waypoints,
 * how far along them the seller was, how fast, and *when* that was measured — is
 * enough for anybody holding it to work out the position at any later instant.
 * That is what lets the map glide at 700 ms while the API is polled every 10 s,
 * and what keeps the two in agreement: both run the same arithmetic over the
 * same leg (see `lib/seller-track.ts`).
 *
 * Standing still is the degenerate case, not a special one: a single-point path
 * with `speedMps: 0`.
 */
export interface SellerTrack {
  /** Waypoints from the leg's origin to its destination. */
  path: LatLng[];
  /** Cumulative metres at each waypoint; `cumMeters[0]` is always 0. */
  cumMeters: number[];
  /** Metres covered as of `updatedAt` — never the current figure, the measured one. */
  coveredMeters: number;
  /** Ground speed over this leg, in metres per second. 0 while standing still. */
  speedMps: number;
  /** When `coveredMeters` was measured. Everything extrapolates from here. */
  updatedAt: string;
  /** Client the seller is standing at, or null while on the move. */
  atClientId: string | null;
  /** Client this leg is heading to, or null when there is nowhere left to go. */
  destinationClientId: string | null;
}

// ---- Tareas (Tasks) --------------------------------------------------------

/** Active / inactive — tasks are deactivated (not deleted) from the list. */
export type TaskStatus = "active" | "inactive";

/** Whom a task is assigned to. */
export type TaskAssignScope = "all" | "some";

/** Priority of a general task. */
export type TaskPriority = "baja" | "normal" | "alta" | "urgente";

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  baja: "Baja",
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
};

export const ALL_TASK_PRIORITIES: TaskPriority[] = ["baja", "normal", "alta", "urgente"];

// `ClientTaskType` lived here — `foto | texto | checklist | calificacion |
// baja_rotacion` — first as what a per-client task *was*, then as a record of how
// old answers had been captured. It is gone in both roles. A task is a list of typed
// fields, and a response is a list of answers to them (`ClientTask.fields`,
// `CompletedClientTask.answers`), so there is no longer any question this union was
// the answer to: not "what does this task ask", which the fields say in full, and not
// "how was this answered", which the answers say per field.
//
// `GeneralTaskResponseType` below is NOT the same thing and stays: general tasks are
// a separate, older model that still asks exactly one kind of question.

/** Kind of answer a general task expects. */
export type GeneralTaskResponseType =
  | "foto"
  | "texto"
  | "checklist"
  | "calificacion"
  | "toma_precio"
  | "inventario_faltante";

export const GENERAL_TASK_RESPONSE_TYPE_LABELS: Record<GeneralTaskResponseType, string> = {
  foto: "Foto",
  texto: "Texto",
  checklist: "Checklist",
  calificacion: "Calificación",
  toma_precio: "Toma de precio",
  inventario_faltante: "Inventario / faltante",
};

export const ALL_GENERAL_TASK_RESPONSE_TYPES: GeneralTaskResponseType[] = [
  "foto",
  "texto",
  "checklist",
  "calificacion",
  "toma_precio",
  "inventario_faltante",
];

/**
 * Tarea por cliente — a recurring task shown on a client's card during a visit.
 * `checklistItems` is only meaningful when `type === "checklist"`.
 */
/**
 * A task a seller answers at a client.
 *
 * A task has **no type of its own**. "Take a photo", "run a checklist", "survey N
 * slow-moving products" are all the same thing: an ordered list of typed fields. The
 * old `type: ClientTaskType` said otherwise, and every kind of task it did not
 * anticipate needed a new member of that union plus a branch everywhere it was read.
 * Adding a kind of task now adds nothing to this file.
 *
 * `ClientTaskType` still exists, but only where it is a historical fact: the answers
 * already recorded against the old model (see `CompletedClientTask.clientTaskType`).
 * Definitions are fields; recorded evidence keeps the shape it was recorded in.
 */
export interface ClientTask {
  id: number;
  name: string;
  description: string;
  /** The questions it asks, in order. Replaces `type` + `checklistItems`. */
  fields: Field[];
  /** Free-text grouping — "Exhibición", "Relevamiento". Replaces the type filter. */
  category?: string;
  color: string;
  /** Position the task takes in the client's task list. */
  order: number;
  /** Whether answering the task is mandatory. */
  required: boolean;
  status: TaskStatus;
  /** Optional deadline (YYYY-MM-DD). */
  dueDate?: string;
  /** "all" = every client; "some" = only `clientIds`. */
  assignScope: TaskAssignScope;
  /** Target client ids when assignScope === "some". */
  clientIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Payload used by create / update per-client task forms. */
export interface ClientTaskInput {
  name: string;
  description: string;
  fields: Field[];
  category?: string;
  color: string;
  order: number;
  required: boolean;
  status?: TaskStatus;
  dueDate?: string;
  assignScope: TaskAssignScope;
  clientIds: string[];
}

/** A single photo captured while completing a task during a visit. */
export interface VisitTaskPhoto {
  id: number;
  url: string;
}

/** One checklist entry answered while completing a task. */
export interface ChecklistAnswer {
  item: string;
  checked: boolean;
}

// `LowTurnoverEntry` lived here: product, batch, expiry, quantity, photos — the one
// hand-carved shape a "registro de baja rotación" task was allowed to return. It is
// gone because it was never a shape of its own, only a repeatable group of a
// catalogue field, a text field, a date and a number, which any task can now be built
// to ask for. Its answers arrive as `AnswerValue`s carrying `groupRowIndex`.

/**
 * A completed client-task: the answer an employee (seller) recorded for a task
 * during a visit to a customer. `visitTaskId` points at the `ClientTask.id`.
 *
 * **One list of answers, not five slots.** It used to carry `response`,
 * `checkListResponse`, `ratingResponse`, `lowTurnoverResponse` and
 * `visitTaskPhotos`, with exactly one of them filled according to a five-way type
 * the task no longer has. A form that asks for a photo *and* a quantity *and* an
 * expiry date could not be recorded at all — it came back as one of the five and
 * the other questions were dropped on the floor.
 *
 * `answers` is the same shape the phone submits (`TaskResponsePayload.answers`) and
 * the same shape the backend stores one row per (`sale.task_response_answers`, an
 * EAV table with one typed column per kind and a `group_row_id` for repeatable
 * rows). Reading it requires the task's `fields` — see `@/lib/task-answers`.
 */
export interface CompletedClientTask {
  customerId: number;
  customerName: string;
  /** Owner (person) of the customer store. */
  ownerId: number;
  ownerName: string;
  /** Employee (seller) who performed the task. */
  employeeId: number;
  employeeName: string;
  visitId: number;
  visitTaskId: number;
  /** Every field answered, keyed by field code — meaningless without the task's `fields`. */
  answers: AnswerValue[];
}

/**
 * Tarea general — a one-off task assigned to sellers, with a priority and an
 * optional due date. `checklistItems` is only used when responseType === "checklist".
 */
export interface GeneralTask {
  id: number;
  title: string;
  description: string;
  responseType: GeneralTaskResponseType;
  checklistItems: string[];
  priority: TaskPriority;
  color: string;
  /** Optional deadline (YYYY-MM-DD). */
  dueDate?: string;
  status: TaskStatus;
  /** "all" = every seller; "some" = only `sellerCodes`. */
  assignScope: TaskAssignScope;
  /** Target seller codes when assignScope === "some". */
  sellerCodes: number[];
  createdAt: string;
  updatedAt: string;
}

/** Payload used by create / update general task forms. */
export interface GeneralTaskInput {
  title: string;
  description: string;
  responseType: GeneralTaskResponseType;
  checklistItems: string[];
  priority: TaskPriority;
  color: string;
  dueDate?: string;
  status?: TaskStatus;
  assignScope: TaskAssignScope;
  sellerCodes: number[];
}

// ---- Visitas (Visits) -------------------------------------------------------

/** Whether a visit is still open on the client or already closed. */
export type VisitStatus = "en_curso" | "finalizada";

/**
 * Why a visit closed without an order.
 *
 * Mirrors `sale.visit_reasons` rows of category `NO_ORDER`. Every reason here is
 * something the *seller* observed at the door, which is why supply-side
 * unavailability is not one of them: a stock-out is a warehouse fact, it is not
 * reported per visit, and counting it here would put a logistics number inside a
 * field report.
 */
export type ExitReasonCategory =
  | "cliente_cerrado"
  | "sin_interes"
  | "precio_alto"
  | "cliente_con_stock"
  | "otro";

export const EXIT_REASON_CATEGORY_LABELS: Record<ExitReasonCategory, string> = {
  cliente_cerrado: "Cliente cerrado / no atendió",
  sin_interes: "Cliente sin interés",
  precio_alto: "Precio no competitivo",
  cliente_con_stock: "Cliente aún tiene stock",
  otro: "Otro motivo",
};

/** The same reasons said in the width of a chip or a tooltip row. */
export const EXIT_REASON_CATEGORY_SHORT: Record<ExitReasonCategory, string> = {
  cliente_cerrado: "Cerrado",
  sin_interes: "Sin interés",
  precio_alto: "Precio",
  cliente_con_stock: "Con stock",
  otro: "Otro",
};

export const ALL_EXIT_REASON_CATEGORIES: ExitReasonCategory[] = [
  "cliente_cerrado",
  "sin_interes",
  "precio_alto",
  "cliente_con_stock",
  "otro",
];

/** Pedido placed during a visit. Flag-like: amount only, no line items. */
export interface VisitOrder {
  id: number;
  amount: number;
  createdAt: string;
}

/** Devolución registered during a visit. Flag-like: amount only. */
export interface VisitReturn {
  id: number;
  amount: number;
  createdAt: string;
}

/**
 * One ClientTask completed by the seller during a visit.
 *
 * Mirrors `CompletedClientTask` and changed with it: one list of answers instead of
 * five type-shaped slots. It carries the `fields` it was answered against rather
 * than looking them up, because a visit is history — the task may have been edited
 * since, and a response has to keep meaning what it meant when it was submitted.
 * That is the same reason the backend points every answer at a `task_version_id`.
 */
export interface VisitTaskDone {
  clientTaskId: number;
  clientTaskName: string;
  /** The form as it stood when this was answered. */
  fields: Field[];
  completedAt: string;
  answers: AnswerValue[];
}

/**
 * Visita — a seller's single check-in/check-out at one client. Exit rules:
 *  1. No task, no order, no return -> exitReasonCategory + evidencePhotos REQUIRED.
 *  2. Task(s) done, no order       -> exitReasonCategory REQUIRED, evidencePhotos optional.
 *  3. Order placed                 -> no exit reason needed, regardless of tasks done.
 */
export interface Visit {
  id: number;
  sellerCode: number;
  clientId: string;
  routeId: string;
  checkInAt: string;
  checkOutAt: string | null;
  status: VisitStatus;
  tasksDone: VisitTaskDone[];
  order: VisitOrder | null;
  return: VisitReturn | null;
  exitReasonCategory: ExitReasonCategory | null;
  exitReason: string | null;
  evidencePhotos: VisitTaskPhoto[];
}

// ---- Productividad por vendedor ---------------------------------------------

/**
 * What one seller got done inside one hour of the day.
 *
 * Everything is bucketed by the visit's **check-in**, never its check-out: the
 * visit is the atomic unit of work, and splitting one across two hours would
 * credit the order to an hour in which nobody was in the shop.
 *
 * Hours with no activity are omitted from the series — an eight-hour day with
 * three working hours is three buckets, not twenty-four with twenty-one zeros.
 */
export interface ProductivityBucket {
  /** Local hour of the day, 0-23. */
  hour: number;
  clientsServed: number;
  ordersPlaced: number;
  amount: number;
  /**
   * Of `clientsServed`, the ones that closed with an order.
   *
   * The gap between the two is the whole reading of the hour: three clients and
   * one order is not a slow hour, it is two doors that did not convert — and
   * `noOrderReasons` says which two and why. A screen that showed only the
   * counts left the supervisor to guess whose fault the gap was.
   */
  clientsWithOrder: number;
  /** Clients whose visit is still open — the outcome is not decided yet. */
  clientsInProgress: number;
  /** Why the rest closed empty. Only reasons that actually occurred, biggest first. */
  noOrderReasons: NoOrderReasonCount[];
}

/** One reason, and how many clients closed on it. */
export interface NoOrderReasonCount {
  category: ExitReasonCategory;
  clients: number;
}

export interface SellerProductivity {
  sellerCode: number;
  sellerName: string;
  /** Active hours only, ascending. */
  hours: ProductivityBucket[];
  /**
   * The whole day.
   *
   * `clientsServed` here is distinct across the day, so it is **not** the sum of
   * the hourly counts: a client visited at 09:00 and again at 11:00 counts once
   * for the day and once in each of the two hours.
   */
  dayTotals: Omit<ProductivityBucket, "hour">;
  /** The hour in progress. Null when the seller has done nothing in it. */
  currentHour: ProductivityBucket | null;
}

export interface ProductivitySnapshot {
  /** Local day the payload describes, `YYYY-MM-DD`. */
  dateKey: string;
  /** The hour in progress, local, 0-23. */
  currentHour: number;
  sellers: SellerProductivity[];
  /** Fleet totals per hour — what the bar chart reads. */
  fleetHours: ProductivityBucket[];
  fleetTotals: Omit<ProductivityBucket, "hour">;
}

// ---- Pedidos (Orders) -------------------------------------------------------

/** Where the order stands in the dispatch flow. */
export type OrderStatus =
  | "listo_para_despachar"
  | "despachado"
  | "entregado"
  | "pendiente"
  | "anulado";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  listo_para_despachar: "LISTO PARA DESPACHAR",
  despachado: "DESPACHADO",
  entregado: "ENTREGADO",
  pendiente: "PENDIENTE",
  anulado: "ANULADO",
};

export const ALL_ORDER_STATUSES: OrderStatus[] = [
  "listo_para_despachar",
  "despachado",
  "entregado",
  "pendiente",
  "anulado",
];

/**
 * Why an order was voided.
 *
 * A closed list rather than free text, and that is the point: annulling is the
 * one irreversible thing this screen does, and the reasons are what the operation
 * later counts. "El cliente desistió" and "no había stock" are the same sentence
 * to a text field and two different problems to whoever reads the month.
 */
export type OrderCancelReason =
  | "cliente_desistio"
  | "stock_insuficiente"
  | "error_de_carga"
  | "pedido_duplicado"
  | "cliente_con_deuda"
  | "fuera_de_zona";

export const ORDER_CANCEL_REASON_LABELS: Record<OrderCancelReason, string> = {
  cliente_desistio: "El cliente desistió del pedido",
  stock_insuficiente: "Sin stock suficiente para despachar",
  error_de_carga: "Error de carga en el pedido",
  pedido_duplicado: "Pedido duplicado",
  cliente_con_deuda: "Cliente con deuda pendiente",
  fuera_de_zona: "Entrega fuera de zona de reparto",
};

export const ALL_ORDER_CANCEL_REASONS: OrderCancelReason[] = [
  "cliente_desistio",
  "stock_insuficiente",
  "error_de_carga",
  "pedido_duplicado",
  "cliente_con_deuda",
  "fuera_de_zona",
];

/** How the client pays the order. */
export type OrderPaymentMethod = "CONTADO" | "CREDITO";

/**
 * Channel the order came in through — `origin` in the schema, `NOT NULL` with a
 * check constraint, so every order has exactly one of these three.
 */
export type OrderOrigin = "E-COMMERCE" | "WEB" | "MOVIL";

export const ORDER_ORIGIN_LABELS: Record<OrderOrigin, string> = {
  // The storefront has a name of its own, and that name is what the operation
  // says. The enum keeps the generic key because that is what the schema stores.
  "E-COMMERCE": "e-Venado",
  WEB: "Web",
  MOVIL: "Móvil",
};

export const ALL_ORDER_ORIGINS: OrderOrigin[] = ["E-COMMERCE", "WEB", "MOVIL"];

/**
 * How the goods have to travel. Not a label on a product — a constraint on the
 * truck: a refrigerated line and a dry one cannot share a load, so one order can
 * become two dispatches inside the same company.
 */
export type StorageClass = "SECO" | "REFRIGERADO";

export const STORAGE_CLASS_LABELS: Record<StorageClass, string> = {
  SECO: "Secos",
  REFRIGERADO: "Refrigerados",
};

/** Dry first: it is the bulk of the catalogue, and the exception reads better second. */
export const ALL_STORAGE_CLASSES: StorageClass[] = ["SECO", "REFRIGERADO"];

/**
 * One line of an order: a product with *both* quantities at once (cases and
 * loose units). A product ordered by the case and by the unit is one agreement,
 * not two rows.
 *
 * Packaging and prices are copied onto the line on purpose — a line is the
 * record of what was agreed, so a later change in the catalog must not rewrite
 * it.
 */
export interface OrderLine {
  productId: string;
  /** Business code (`Cod`) — an integer, as the ERP prints it. */
  code: number;
  productName: string;
  /**
   * Legal entity that sells this line, frozen when agreed like the price.
   *
   * It is what the order is split by: one order the seller took becomes one
   * document per company, and moving a SKU between companies afterwards must
   * not rewrite an order already placed.
   */
  company: string;
  /**
   * Cold chain or not, frozen onto the line like the company and the price.
   *
   * It divides a company's document a second time: the goods of one order ship in
   * as many loads as it has storage classes, so this is what the per-company
   * reading groups by underneath the company itself.
   */
  storage: StorageClass;
  /** Label of the minimum unit (Botella, Bolsa, Paquete…). */
  unitLabel: string;
  /** Label of the maximum unit (Caja, Bolsón, Fardo…). */
  caseLabel: string;
  /** Minimum units contained in one case. */
  unitsPerCase: number;
  /** Quantity in maximum units (cases). */
  qtyCase: number;
  /** Quantity in minimum units (loose). */
  qtyUnit: number;
  /**
   * The line's single tariff: price per *minimum* unit, frozen when agreed. A
   * case is not priced apart — it is valued as the minimum units it contains,
   * which is what makes `Importe = Precio × Cant. unidades mínimas` hold.
   */
  priceUnit: number;
  /** ICE rate per minimum unit — not the line's total. */
  ice: number;
}

/** Free goods granted to one line. One entry per line that earned any. */
export interface OrderBonification {
  /** Line that earned the gift. */
  productId: string;
  /** Row actually delivered — a family sibling of `productId`, swappable. */
  giftProductId: string;
  giftProductName: string;
  /** Quantity, in minimum units. */
  qty: number;
  unitLabel: string;
}

/**
 * The pricing service's answer for a set of lines. Discounts and bonifications
 * are the business's reply, never a calculation the client makes on its own.
 */
export interface OrderIncentives {
  /** Cumulative discount percentage applied to the subtotal. */
  discountPct: number;
  /** Why that percentage, one phrase per rule that fired. */
  reasons: string[];
  bonifications: OrderBonification[];
}

/**
 * Pedido — an order taken during a visit. Amounts are in Bs.; `netTotal` is
 * what the client owes after `discount` and including `ice`.
 */
export interface Order {
  /** Business code shown in the list (`Código`). */
  id: number;
  /**
   * The order as taken has **no** company, and that is the point: the seller
   * picks from one catalogue and the agreement is stored whole, exactly as it
   * was entered. Dividing it by legal entity is a second, derived record —
   * `CompanyOrder` in the orders service — that points back at this one.
   *
   * The field survives only for orders the ERP handed over already split, which
   * arrive with their company assigned and without a breakdown to re-derive it
   * from.
   */
  company?: string;
  /** When the order was taken, with time. */
  createdAt: string;
  /** Agreed delivery date (`YYYY-MM-DD`). */
  deliveryDate: string;
  clientId: string;
  clientName: string;
  /** Owner of the store, shown in parentheses next to the client name. */
  clientOwnerName: string;
  sellerCode: number;
  sellerName: string;
  discount: number;
  ice: number;
  netTotal: number;
  paymentMethod: OrderPaymentMethod;
  /** Warehouse the order is dispatched from (`Almacén`). */
  warehouse: string;
  /** Delivery note number — empty until the order is documented. */
  noteNumber: string | null;
  /** Channel the order came in through. Never null: every order has one. */
  origin: OrderOrigin;
  /**
   * Value-added service the order was taken for — "Transporte" and the like.
   *
   * Only orders that came through the storefront carry one: a service is sold by
   * e-Venado, never taken on a route, so `service` and `origin: "E-COMMERCE"`
   * always travel together. Null on everything else, which is most of the list.
   */
  service?: string | null;
  status: OrderStatus;
  /**
   * Why it was voided. Only ever set together with `status: "anulado"` — an order
   * that is not annulled has no reason to carry one.
   */
  cancelReason?: OrderCancelReason;
  /** Visit the order was taken in, when it came from the field. */
  visitId: number | null;

  // ---- Only on orders registered from this app -----------------------------
  // The seed's field orders arrive already closed, with their amounts and no
  // breakdown, which is what the ERP hands over. Everything below is what the
  // "nuevo pedido" form collects, so it is optional by nature.

  /** Sum of the lines before the discount. */
  subtotal?: number;
  /** Percentage the pricing service granted, kept beside the amount. */
  discountPct?: number;
  /** Agreed delivery window, `HH:mm`. Always from a preset. */
  deliveryFrom?: string;
  deliveryTo?: string;
  /** Where the goods go — one of the client's delivery points. */
  deliveryPoint?: string;
  /** Who the delivery asks for on arrival. */
  contact?: string;
  notes?: string;
  /** Frozen copies of what was agreed. */
  lines?: OrderLine[];
  bonifications?: OrderBonification[];
}

/**
 * A completed general task — same spirit as CompletedClientTask but for a
 * one-off task with no target customer (GeneralTask isn't client-scoped).
 */
export interface CompletedGeneralTask {
  id: number;
  generalTaskId: number;
  employeeId: number;
  employeeName: string;
  completedAt: string;
  response: string | null;
  checkListResponse: ChecklistAnswer[] | null;
  ratingResponse: number | null;
  photos: VisitTaskPhoto[];
}

// ---- Workflows de aprobación -------------------------------------------------

/**
 * Entity a workflow can approve (`workflow_target_types.code`).
 *
 * The engine is deliberately entity-agnostic — an instance points at its target
 * by a plain id with no foreign key, because the target may live in another
 * microservice. Returns are the only entity with an implementation today;
 * customers exist in the catalogue and have no routing rules of their own.
 */
export type WorkflowTargetCode = "RETURN" | "CUSTOMER";

export interface WorkflowTargetType {
  code: WorkflowTargetCode;
  name: string;
  /** Table the backend records as owning the entity — informative only. */
  tableName: string;
}

export const WORKFLOW_TARGET_LABELS: Record<WorkflowTargetCode, string> = {
  RETURN: "Devolución",
  CUSTOMER: "Cliente",
};

/**
 * Lifecycle of one published shape of a workflow.
 *
 * Versions are immutable once published, and a running instance keeps pointing
 * at the version it started on. That is what makes editing safe: changing a
 * workflow never rewrites the rules a half-signed approval was started under.
 */
export type WorkflowVersionStatus = "draft" | "published" | "archived";

/**
 * How many of a level's approvers have to sign for it to close.
 *
 * `QUORUM` is the only one that reads `requiredApprovals`; `ANY` is always one
 * signature and `ALL` is always every approver, so storing a number for them
 * would be a second place for the same fact to disagree with itself.
 */
export type ApprovalPolicy = "ALL" | "ANY" | "QUORUM";

/**
 * Where a rejection sends the document.
 *
 * This is the setting that decides what the approver's "Rechazar" button means,
 * which is why the builder shows it on the collapsed level card: on one level it
 * kills the return, on the next it hands it back to the seller to fix.
 */
export type OnRejectBehaviour = "TERMINATE" | "RETURN_PREVIOUS" | "RETURN_INITIATOR";

/**
 * How a level names the people who may sign it.
 *
 * Only `EMPLOYEE` can be stored today: the other four resolve through a logical
 * reference to a catalogue of roles, positions, areas and groups that does not
 * exist yet in the model. They are carried here so the UI can show where the
 * system is going without pretending it can already save it.
 */
export type AssigneeType = "EMPLOYEE" | "ROLE" | "POSITION" | "AREA" | "GROUP";

export const ASSIGNEE_TYPE_LABELS: Record<AssigneeType, string> = {
  EMPLOYEE: "Empleado",
  ROLE: "Rol",
  POSITION: "Cargo",
  AREA: "Área",
  GROUP: "Grupo",
};

/**
 * The three assignment kinds with no catalogue behind them yet.
 *
 * `ROLE` used to be in this list too: devoluciones now resolves it against
 * `employeesForRole` (`lib/role-directory.ts`), a local stand-in for the
 * directory a real deployment would call. `POSITION`, `AREA` and `GROUP` still
 * have nothing behind them.
 */
export const UNAVAILABLE_ASSIGNEE_TYPES: AssigneeType[] = ["POSITION", "AREA", "GROUP"];

/** One person, or one role, allowed to sign a level. */
export interface WorkflowApprover {
  id: string;
  assigneeType: AssigneeType;
  /** Set only for `EMPLOYEE`. Matches `Seller.code`, the app's employee id. */
  employeeCode: number | null;
  employeeName: string | null;
  /** Area or department the approver signs for. Display only. */
  employeeArea: string | null;
  /**
   * Set only for `ROLE`. Who actually signs is resolved at the moment the
   * level starts, against `employeesForRole` — this field never names a person.
   */
  roleCode: Role | null;
  /** Logical reference for `POSITION`/`AREA`/`GROUP`. Always null for the rest. */
  assigneeRefId: number | null;
}

/** One step of a workflow version. */
export interface WorkflowLevel {
  id: string;
  /** 1-based position. Reordering rewrites it across the whole version. */
  order: number;
  name: string;
  approvalPolicy: ApprovalPolicy;
  /** Signatures needed to close the level. Only meaningful under `QUORUM`. */
  requiredApprovals: number;
  onReject: OnRejectBehaviour;
  /** Whether the approver may hand the document back without rejecting it. */
  allowReturn: boolean;
  /** Hours from the level starting until it is late. `null` = no deadline. */
  slaHours: number | null;
  /**
   * Amount from which this level takes part, in Bs. `null` when the entity it
   * approves has no amount ladder at all (a `CUSTOMER` has no total).
   *
   * In the database this does **not** live on `workflow_level_definitions`: it is
   * a row of `sale.refund_level_thresholds`, a returns-owned table with a unique
   * foreign key to the level. The engine is money-blind by design, so the ladder
   * had to be owned by the entity that has amounts. The flat field here is only
   * the API projection of that join.
   *
   * Levels store a lower bound and nothing else: a level's ceiling is the next
   * level's `activationMinAmount`, and the last level has none. Deriving it is
   * what makes the ladder contiguous by construction — a gap or an overlap
   * cannot be expressed.
   */
  activationMinAmount: number | null;
  approvers: WorkflowApprover[];
}

/** One immutable shape of a workflow. */
export interface WorkflowVersion {
  id: string;
  versionNumber: number;
  status: WorkflowVersionStatus;
  /** Whether new documents are routed through this version. */
  isCurrent: boolean;
  publishedAt: string | null;
  levels: WorkflowLevel[];
}

/**
 * Devolución/cliente approval template.
 *
 * The definition is the stable identity users name and search by; everything
 * that can actually be configured lives on its versions.
 */
export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  targetCode: WorkflowTargetCode;
  isActive: boolean;
  versions: WorkflowVersion[];
  /** Id of the published version new documents use. `null` while only a draft exists. */
  currentVersionId: string | null;
  updatedAt: string;
  /**
   * Who last touched it.
   *
   * The backend has to resolve this: the audit columns are plain ids with no
   * foreign key to employees, so the frontend cannot join it itself.
   */
  updatedByName: string;
}

/** Where a running approval stands as a whole. */
export type WorkflowInstanceStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "RETURNED";

/** Where one round of one level stands. */
export type WorkflowLevelStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "APPROVED"
  | "REJECTED"
  | "RETURNED"
  | "SKIPPED"
  | "SUPERSEDED";

/**
 * Everything that can be written to an approval's trail.
 *
 * `COMMENT` is not a decision and can be left any number of times; the other
 * kinds are each an approver's single answer for a round.
 */
export type WorkflowActionKind =
  | "APPROVE"
  | "REJECT"
  | "RETURN"
  | "COMMENT"
  | "CANCEL"
  | "REASSIGN"
  | "MIGRATE";

/** An approver resolved onto a running level, and whether they answered yet. */
export interface WorkflowAssignee {
  employeeCode: number;
  employeeName: string;
  hasActed: boolean;
}

/**
 * One round of one level of a running approval.
 *
 * A level that is handed back and re-approved produces a second row with the
 * same `order` and a higher `attempt` rather than overwriting the first — what
 * an approver signed the first time is exactly what an audit comes looking for.
 */
export interface WorkflowInstanceLevel {
  id: string;
  order: number;
  /** Round, from 1. A document sent back and resubmitted starts a new one. */
  attempt: number;
  /** Frozen copy of the level name, so renaming the template never rewrites history. */
  name: string;
  status: WorkflowLevelStatus;
  approvalPolicy: ApprovalPolicy;
  requiredApprovals: number;
  approvalsReceived: number;
  /**
   * Frozen copy of the level's activation threshold, in Bs. `null` when the
   * entity has no amount ladder.
   *
   * Snapshotted like the policy and the SLA: republishing the template with a
   * different ladder tomorrow must not rewrite the band an approver signed
   * under today.
   */
  activationMinAmount: number | null;
  slaHours: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  assignees: WorkflowAssignee[];
}

/** One entry of the append-only trail. Never updated, only added to. */
export interface WorkflowAction {
  id: string;
  action: WorkflowActionKind;
  comment: string | null;
  rejectReason: string | null;
  /** Instance status either side of the action, as the engine recorded it. */
  previousStatus: WorkflowInstanceStatus | null;
  newStatus: WorkflowInstanceStatus | null;
  levelId: string | null;
  levelOrder: number | null;
  levelName: string | null;
  attempt: number;
  byEmployeeCode: number;
  byEmployeeName: string;
  at: string;
  /**
   * Document amount either side of the action, when this action moved it.
   *
   * Only a decision that cut item quantities and a seller's correction can
   * change it, so it is null on every entry that merely signed — and that is
   * exactly what makes the entries where it is set worth reading.
   */
  amountBefore: number | null;
  amountAfter: number | null;
}

/**
 * A workflow actually running over one document.
 *
 * Only one instance is ever open per document. Re-routing does not mutate this
 * one: it closes it as superseded and opens a new one pointing back at it, so
 * the trail keeps both.
 */
export interface WorkflowInstance {
  id: string;
  status: WorkflowInstanceStatus;
  /** Level currently waiting for signatures. `null` once the instance closed. */
  currentLevelOrder: number | null;
  targetCode: WorkflowTargetCode;
  targetId: number;
  definitionId: string;
  /** Frozen name of the template, for a trail that survives a rename. */
  definitionName: string;
  versionId: string;
  versionNumber: number;
  initiatedByName: string;
  /**
   * The document's amount when the instance started.
   *
   * Kept because it is what decided which levels were born active: the ladder is
   * evaluated once at submission, and a trail that cannot say which figure it
   * was evaluated against cannot explain why a level was skipped.
   */
  selectionContext: { amount: number };
  /** Instance this one replaces, when a correction superseded it. */
  supersededInstanceId: string | null;
  startedAt: string;
  finishedAt: string | null;
  levels: WorkflowInstanceLevel[];
  actions: WorkflowAction[];
}

// ---- Devoluciones (Returns) -------------------------------------------------

/**
 * Origin of the returned goods: the two plant codes the business uses, or an
 * import.
 *
 * It is not derivable from the product: the same SKU is bottled at both plants
 * and is also brought in from abroad, so which one came back is information only
 * the person holding the box has. It is what makes the batch traceable, which is
 * the whole point of registering a return.
 *
 * The codes are the ones printed on the packaging — `S`, `L`, `IMPORTADO` — and
 * they are stored as typed, not expanded into plant names the seller would then
 * have to translate back.
 */
export type ReturnLot = "S" | "L" | "IMPORTADO";

export const RETURN_LOT_LABELS: Record<ReturnLot, string> = {
  S: "S",
  L: "L",
  IMPORTADO: "IMPORTADO",
};

export const ALL_RETURN_LOTS: ReturnLot[] = ["S", "L", "IMPORTADO"];

/** One invoice that backs a returnable quantity. */
export interface ReturnableInvoice {
  /** Invoice number as printed on the paper the client keeps. */
  number: string;
  /** `YYYY-MM-DD` it was issued. */
  date: string;
  /** Minimum units of the product sold on that invoice. */
  minUnits: number;
}

/**
 * A product this client actually bought, and how much of it may still come back.
 *
 * This is the answer to the only question that decides whether a product can be
 * added to a return at all: *was this quantity ever sold to him?* Nothing can be
 * returned that was not first invoiced, and nothing can be returned twice — so
 * what is available is what was invoiced less what other returns already claim.
 */
export interface ReturnableProduct {
  productId: string;
  /** Minimum units invoiced to this client inside the window that admits returns. */
  invoicedMinUnits: number;
  /** Minimum units already claimed on this client's other returns. */
  claimedMinUnits: number;
  /** What may still come back: invoiced less claimed, never negative. */
  availableMinUnits: number;
  /** The invoices behind the figure, newest first — the seller's evidence. */
  invoices: ReturnableInvoice[];
}

/**
 * Motivo de devolución — why *this* product is coming back.
 *
 * A closed list and not free text, because it is what the business counts. The
 * return's `justification` explains the case in words; this classifies it, and
 * only a classified reason can be added up across a month to answer "how much
 * are we losing to broken transport". They are two different questions, so both
 * are asked: this one per line, the other once for the whole claim.
 */
export type ReturnReason =
  | "bajo_rendimiento"
  | "cambio_bebidas_vencidas"
  | "cierre_negocio"
  | "contaminacion_fisica"
  | "danos_manejo_cliente"
  | "error_pedido"
  | "error_entrega"
  | "excepcional"
  | "envases_sin_contenido"
  | "fallas_envase"
  | "faltante_caja_cerrada"
  | "fuga_mal_sellado"
  | "menor_contenido_neto"
  | "muestras_laboratorio"
  | "producto_hinchado"
  | "sin_lote_ni_vencimiento"
  | "vigente_buen_estado"
  | "recall"
  | "variacion_sensorial"
  | "vencimiento_baja_rotacion"
  | "vencimiento_corta_vida_util"
  | "vencimiento_sobre_stock";

/**
 * Upper case, because that is how the ERP these screens replace prints them and
 * how the business says them out loud in a claim.
 */
export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  bajo_rendimiento: "BAJO RENDIMIENTO O DESEMPEÑO",
  cambio_bebidas_vencidas: "CAMBIO BEBIDAS VENCIDAS",
  cierre_negocio: "CIERRE DE NEGOCIO",
  contaminacion_fisica: "CONTAMINACIÓN FÍSICA",
  danos_manejo_cliente: "DAÑOS POR MANEJO DEL CLIENTE",
  error_pedido: "DEVOLUCION POR ERROR EN EL PEDIDO",
  error_entrega: "DEVOLUCION POR ERROR EN LA ENTREGA",
  excepcional: "DEVOLUCIÓN EXCEPCIONAL",
  envases_sin_contenido: "ENVASES SIN CONTENIDO",
  fallas_envase: "FALLAS EN ENVASE/EMPAQUE",
  faltante_caja_cerrada: "FALTANTE EN CAJA CERRADA",
  fuga_mal_sellado: "FUGA POR MAL SELLADO",
  menor_contenido_neto: "MENOR CONTENIDO NETO",
  muestras_laboratorio: "MUESTRAS DE LABORATORIO",
  producto_hinchado: "PRODUCTO HINCHADO",
  sin_lote_ni_vencimiento: "PRODUCTO SIN LOTE O SIN FECHA DE VENCIMIENTO",
  vigente_buen_estado: "PRODUCTO VIGENTE Y EN BUEN ESTADO",
  recall: "RECALL",
  variacion_sensorial: "VARIACIÓN SENSORIAL",
  vencimiento_baja_rotacion: "VENCIMIENTO POR BAJA ROTACION",
  vencimiento_corta_vida_util: "VENCIMIENTO POR ENTREGA DE PRODUCTO CON CORTA VIDA UTIL",
  vencimiento_sobre_stock: "VENCIMIENTO POR SOBRE STOCK",
};

/** Alphabetical by label, which is the order the ERP's own picker offers them in. */
export const ALL_RETURN_REASONS: ReturnReason[] = [
  "bajo_rendimiento",
  "cambio_bebidas_vencidas",
  "cierre_negocio",
  "contaminacion_fisica",
  "danos_manejo_cliente",
  "error_pedido",
  "error_entrega",
  "excepcional",
  "envases_sin_contenido",
  "fallas_envase",
  "faltante_caja_cerrada",
  "fuga_mal_sellado",
  "menor_contenido_neto",
  "muestras_laboratorio",
  "producto_hinchado",
  "sin_lote_ni_vencimiento",
  "vigente_buen_estado",
  "recall",
  "variacion_sensorial",
  "vencimiento_baja_rotacion",
  "vencimiento_corta_vida_util",
  "vencimiento_sobre_stock",
];

/**
 * What a return is, for the business — the logistics/document axis, never the
 * approval axis. Where the paper currently sits inside the ladder is a
 * different question, answered by `ReturnWorkflowState` below; a list column
 * asks both side by side rather than folding "En aprobación · 1 de 2 firmas"
 * into one pill.
 *
 * Derived off the approval running over the return (`statusOf` in
 * `lib/return-workflow.ts`) exactly like the axis it replaces was: two fields
 * saying the same thing in two places is how they end up disagreeing.
 */
export type ReturnStatus =
  | "ABIERTO"
  | "PROCESANDO"
  | "PROCESADO"
  | "CERRADO"
  | "ANULADA"
  | "DEVOLUCION_DEMORADA"
  | "PROCESO_ELECTRONICO"
  | "DISOCIADO"
  | "REVERTIDO"
  | "EDITADO";

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  ABIERTO: "ABIERTO",
  PROCESANDO: "PROCESANDO",
  PROCESADO: "PROCESADO",
  CERRADO: "CERRADO",
  ANULADA: "ANULADA",
  DEVOLUCION_DEMORADA: "DEVOLUCIÓN DEMORADA",
  PROCESO_ELECTRONICO: "PROCESO ELECTRÓNICO",
  DISOCIADO: "DISOCIADO",
  REVERTIDO: "REVERTIDO",
  EDITADO: "EDITADO",
};

export const ALL_RETURN_STATUSES: ReturnStatus[] = [
  "ABIERTO",
  "PROCESADO",
  "CERRADO",
  "PROCESANDO",
  "ANULADA",
  "DEVOLUCION_DEMORADA",
  "PROCESO_ELECTRONICO",
  "DISOCIADO",
  "REVERTIDO",
  "EDITADO",
];

/**
 * Where the paper sits inside the approval ladder — the workflow axis.
 * `ESPERANDO_LVLn` covers a claim still climbing, keyed by the level it is
 * waiting on; the other three are terminal or hand-back states, whatever level
 * it stopped on.
 */
export type ReturnWorkflowState =
  | "ESPERANDO_LVL1"
  | "ESPERANDO_LVL2"
  | "ESPERANDO_LVL3"
  | "ESPERANDO_LVL4"
  | "RECHAZADA"
  | "APROBADA"
  | "EN_EDICION";

export const RETURN_WORKFLOW_STATE_LABELS: Record<ReturnWorkflowState, string> = {
  ESPERANDO_LVL1: "Esperando aprobación nivel 1",
  ESPERANDO_LVL2: "Esperando aprobación nivel 2",
  ESPERANDO_LVL3: "Esperando aprobación nivel 3",
  ESPERANDO_LVL4: "Esperando aprobación nivel 4",
  RECHAZADA: "Rechazada",
  APROBADA: "Aprobada",
  EN_EDICION: "En edición",
};

export const ALL_RETURN_WORKFLOW_STATES: ReturnWorkflowState[] = [
  "ESPERANDO_LVL1",
  "ESPERANDO_LVL2",
  "ESPERANDO_LVL3",
  "ESPERANDO_LVL4",
  "RECHAZADA",
  "APROBADA",
  "EN_EDICION",
];

/**
 * Cómo se liquida una devolución — «Tipo de devolución» en la lista.
 *
 * Not the same question as `ReturnReason`: that one says why the goods came
 * back, this one says what the client gets in exchange. A claim can be approved
 * for exactly the same reason and settled two different ways depending on
 * whether there is stock to swap, which is why the two cannot share a column.
 *
 * Decided when the claim is settled, so it is `null` while the return is still
 * travelling and on anything rejected or annulled — the legacy list leaves the
 * cell empty for precisely those rows.
 *
 * In the model it is `sale.refund_motives.name`, which today hangs off each item
 * (`refund_order_details.refund_motive_id`) rather than off the header. Kept on
 * the header here because that is the level the decision is actually taken at,
 * and it is what the list has to read; the item-level table is still where the
 * cost centre will come from.
 */
export type ReturnSettlement = "CAMBIO_STOCK" | "NOTA_CREDITO";

export const RETURN_SETTLEMENT_LABELS: Record<ReturnSettlement, string> = {
  CAMBIO_STOCK: "HAY STOCK PARA CAMBIO",
  NOTA_CREDITO: "NOTA CRÉDITO/DÉBITO NO FISCAL",
};

export const ALL_RETURN_SETTLEMENTS: ReturnSettlement[] = ["CAMBIO_STOCK", "NOTA_CREDITO"];

/**
 * Where one product of a return stands.
 *
 * Resolved only at the level flagged as the item-decision level; everywhere else
 * in the flow it stays `PENDING` while approvers judge the claim as a whole.
 */
export type ReturnItemStatus = "PENDING" | "APPROVED" | "REJECTED";

/**
 * The usual grounds for refusing one product.
 *
 * Offered as a list and not forced as one: the column is free text in the
 * model, and an approver who cannot say the actual reason ends up picking the
 * nearest wrong option, which is worse than a sentence nobody can total up.
 * These are the four that repeat; anything else is typed.
 */
export const RETURN_ITEM_REJECT_REASONS: string[] = [
  "Fuera del plazo de reclamo (más de 30 días).",
  "La cantidad supera lo facturado en ese lote.",
  "Sin foto del lote que respalde el reclamo.",
  "El producto no presenta la falla declarada.",
];

export const RETURN_ITEM_STATUS_LABELS: Record<ReturnItemStatus, string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
};

/**
 * One product coming back, with everything the warehouse needs to receive it
 * and the quality team needs to trace it.
 *
 * It extends the order line rather than redefining it so both share the same
 * money identity (`Importe = Precio × Cant. unidades mínimas`) and the same
 * helpers in `lib/order-math`. A return is valued exactly like a sale — it is
 * the same goods travelling the other way.
 */
/**
 * Where part of a returned quantity came from: an invoice, a batch, or both.
 *
 * One product can come back off several invoices and several batches at once —
 * twelve units off one delivery and eighteen off another — so the origin is a
 * list and not a pair of fields on the line. The quantities across the sources
 * have to add up to exactly what the line claims, and that check belongs to the
 * frontend: the database only requires each source to name an invoice or a batch.
 *
 * The invoice is a logical reference to the document in SAP; there is no local
 * invoice table to point a foreign key at.
 */
export interface ReturnItemSource {
  id: string;
  /** Invoice number as printed on the paper the client keeps. */
  invoiceNumber: string | null;
  /** SAP document code behind that invoice. */
  invoiceSapDoc: string | null;
  /** Plant the batch was produced at, or an import. */
  batch: ReturnLot | null;
  /** Batch number as stamped on the packaging. */
  batchNumber: string | null;
  /** The batch's expiry date (`YYYY-MM-DD`) — not the return's. */
  dueDate: string | null;
  /** Minimum units of the line that come from this source. */
  minUnits: number;
}

export interface ReturnLine extends OrderLine {
  /** Why this product is coming back. Classified, not free text. */
  reason: ReturnReason;
  /**
   * Minimum units invoiced to this client that backed the line when it was
   * added — the evidence the quantity was checked against.
   *
   * Frozen onto the line rather than read again later, so an approver looking at
   * the claim next week sees the number the seller was actually shown, not what
   * the history says today.
   */
  invoicedMinUnits: number;
  /**
   * Which invoices and batches the quantity comes off.
   *
   * Always at least one. Their `minUnits` must sum to the line's quantity, and
   * the form is what enforces it.
   */
  sources: ReturnItemSource[];
  /** What is wrong with this product, in the seller's words. */
  notes: string;
  /**
   * The evidence, as URLs — the shape the model stores images in everywhere
   * (`images TEXT[]` on visitas and puntos de entrega), not objects.
   *
   * One list and not a slot per kind. The seller is standing in front of the
   * goods with a phone: what they have is *photos of this product* — the failure
   * from two angles, the batch stamp, the box it came in — and forcing that into
   * "one for the failure, one for the batch" makes them choose which of the two
   * batch shots to throw away. What each photo shows is what the approver's eyes
   * are for; the form's job is to say what has to be in there and let them send
   * it all at once.
   *
   * At least one is required — a claim with no picture is nothing to approve.
   */
  photos: string[];

  /** Where this product stands. Only the item-decision level moves it. */
  itemStatus: ReturnItemStatus;
  /**
   * Minimum units actually granted.
   *
   * `null` while pending *and* when rejected — refusing a product is a state,
   * not a quantity of zero, and the two must not be stored the same way or a
   * rejected line becomes indistinguishable from one approved for nothing.
   * When set it is always greater than zero and never more than was claimed.
   */
  approvedMinUnits: number | null;
  /** Why this product was refused. Required whenever `itemStatus` is REJECTED. */
  rejectReason: string | null;
  /** Who resolved this product, and when. Frozen: the trail is per item too. */
  decisionByName: string | null;
  decisionAt: string | null;
}

/** What `lines` looked like right before a correction reset it, tied to the workflow it decided. */
export interface ReturnLineSnapshot {
  workflowId: string;
  lines: ReturnLine[];
}

/**
 * Devolución — goods a client sends back, pending approval.
 *
 * Money is what decides how far it travels, but the flow itself is configured
 * rather than coded: one workflow serves every devolución, and each of its
 * levels carries the amount it starts deciding from. The claim decides which
 * levels open at all, and every cut a desk makes decides whether the desk above
 * it is still needed. Nothing here knows the names of those desks — that is
 * precisely what moving to a configurable engine bought.
 */
export interface Return {
  /** Business code shown in the list (`Código`). */
  id: number;
  createdAt: string;
  /**
   * Distributor the note belongs to (`refund_orders.distributor_id`).
   *
   * Frozen onto the document and not read off the session: the list is one
   * column wide precisely because somebody above a single distributor reads it,
   * and a row has to keep saying where it was registered even then.
   */
  distributorName: string;
  clientId: string;
  clientName: string;
  clientOwnerName: string;
  sellerCode: number;
  sellerName: string;
  /** When the client expects the goods to be replaced (`YYYY-MM-DD`). */
  replacementDate: string;
  /**
   * Note there is no delivery point here. `sale.refund_orders` does not carry
   * one, and it should not: the goods come back from the client's address, which
   * the client record already knows — asking the seller to pick it off a list
   * was a field that could only be answered one way.
   */
  /** Why the return is being asked for, as a whole. Per-product detail is on each line. */
  justification: string;
  lines: ReturnLine[];
  /** Sum of the lines. A return has no discount: it gives back what was charged. */
  subtotal: number;
  ice: number;
  /** What the return is worth as claimed — the figure the flow is routed by. */
  total: number;
  status: ReturnStatus;
  /** How the claim was settled. `null` until it is. */
  settlement: ReturnSettlement | null;
  /**
   * The approval currently running over this return. `null` while it is a draft.
   *
   * Only ever one: a re-route closes this one as superseded and opens another,
   * it never leaves two open.
   */
  workflow: WorkflowInstance | null;
  /**
   * Approvals this return went through before the current one, newest first.
   *
   * A superseded instance is not history to be tidied away — an approval given
   * over a different set of products is exactly what an audit comes looking for.
   */
  pastWorkflows: WorkflowInstance[];
  /**
   * What each line looked like at the moment a past workflow was superseded,
   * one entry per id in `pastWorkflows`.
   *
   * `WorkflowInstance` is entity-agnostic on purpose (see `lib/workflow.ts`) and
   * cannot carry a `ReturnLine`, so the snapshot lives here instead of on the
   * instance itself. Without it, a correction's `clearItemDecisions` would wipe
   * the only record of what an earlier round actually decided — `lines` always
   * reflects the *current* round, never a past one.
   */
  pastLineSnapshots: ReturnLineSnapshot[];
  /**
   * What was actually granted once items were resolved. `null` until the
   * item-decision level has ruled, which is what lets the summary show
   * "pendiente" honestly instead of guessing.
   */
  approvedTotal: number | null;
  rejectedTotal: number | null;
  /** How many times it has been corrected. Only one edit is ever allowed. */
  editCount: number;
  /**
   * Nota disociada: la devolución de la que salieron estos ítems, cuando esta es una nota
   * disociada — `null` en cualquier otra devolución.
   *
   * Nace cuando el nivel 1 aprueba solo una parte de una devolución: los ítems que dejó afuera
   * se parten en un documento nuevo, con su propio `id`, que queda `EN_EDICION` esperando al
   * vendedor mientras el original sigue subiendo de nivel solo con lo aprobado. El `id` de acá
   * es lo que la nota disociada muestra como «Nota Origen #».
   */
  originReturnId: number | null;
}

// ---------------------------------------------------------------------------
// Venta en agencia — the counter sale
// ---------------------------------------------------------------------------

/**
 * Currencies the counter takes. Bs is the currency the business keeps its books
 * in; US$ is accepted at the till and converted on the spot, never stored as a
 * second total.
 */
export type Currency = "BS" | "USD";

/**
 * Who is standing at the counter. The three are priced differently, which is
 * the whole reason the distinction exists rather than being a note on a sale.
 */
export type SaleCustomerKind = "empleado" | "venado" | "general";

export const SALE_CUSTOMER_KIND_LABELS: Record<SaleCustomerKind, string> = {
  empleado: "Empleado",
  venado: "Cliente Venado",
  general: "Cliente general",
};

/**
 * The kind of identity document an invoice is issued against.
 *
 * `MEDIDOR` is not a mistake: a Bolivian invoice may be issued against the
 * electricity meter number of the address, which is what a buyer who has no
 * document on them gives. The four are a closed set because the tax form is.
 */
export type IdDocType = "NIT" | "CI" | "PASAPORTE" | "MEDIDOR";

export const ID_DOC_TYPE_LABELS: Record<IdDocType, string> = {
  NIT: "NIT",
  CI: "Cédula de Identidad",
  PASAPORTE: "Pasaporte",
  MEDIDOR: "Medidor",
};

export const ALL_ID_DOC_TYPES: IdDocType[] = ["NIT", "CI", "PASAPORTE", "MEDIDOR"];

/** What the billing block starts on when nobody has said otherwise. */
export const DEFAULT_ID_DOC_TYPE: IdDocType = "NIT";

/**
 * What an invoice says when the buyer gave no name and no email.
 *
 * Literals and not empty strings, because they are what gets *printed*: a
 * counter that sells to whoever walks in issues a great many documents to "SIN
 * NOMBRE", and a blank there would read as a field somebody forgot.
 */
export const BILLING_NO_NAME = "SIN NOMBRE";
export const BILLING_NO_EMAIL = "SIN EMAIL";

/**
 * The invoicing identity captured for one sale.
 *
 * Captured **per sale** rather than read off the customer, because the cashier
 * corrects it at the counter: the same walk-in may be billed to their company
 * one day and to themselves the next, and the document already issued must keep
 * saying what it said. The customer only supplies the defaults this starts from.
 */
export interface SaleBilling {
  /** `Nro Doc. Fact.` — required. NIT, CI, passport or meter number. */
  docNumber: string;
  /**
   * `Complemento` — the alphanumeric suffix some Bolivian cédulas carry (`1A`).
   *
   * Blank for most buyers, and blank is a valid answer rather than a missing
   * one: only a fraction of cédulas were issued with a complement, and a NIT
   * never has one. It belongs beside `docNumber` and not on its own line
   * because it is part of the same document — `billingDocumentOf` is what
   * prints the two as the one number the tax form expects.
   */
  complement: string;
  /** Which of those `docNumber` is. Required, defaults to `NIT`. */
  docType: IdDocType;
  /** Who the invoice is made out to. Required; `SIN NOMBRE` when unknown. */
  razonSocial: string;
  /** Where the invoice is sent. Optional; `SIN EMAIL` when unknown. */
  email: string;
}

/**
 * An employee of the distributor, as the counter needs to know them.
 *
 * There is no salary here on purpose: payroll credit is a cap the counter
 * enforces, and the cap is the only figure the till has any business reading.
 *
 * There is no `razonSocial` either: an employee is invoiced under their own
 * name, so it is derived from `name` rather than stored twice — two fields that
 * must always agree are two fields that eventually will not.
 */
export interface Employee {
  /** Mock id, `emp_xxx`. */
  id: string;
  /** Business code the payroll knows them by. */
  employeeCode: number;
  name: string;
  /** Cédula de identidad — what they are billed as when they buy. */
  ci: string;
  /** Department they belong to, for the counter to recognise them by. */
  department: string;
  /** Corporate address the invoice is sent to. */
  email: string;
  /** Ceiling on what they may owe on credit at once (Bs). */
  creditLimitBs: number;
  /** What they already owe against that ceiling (Bs). */
  creditUsedBs: number;
}

/**
 * A walk-in the counter registered because they asked for an invoice.
 *
 * Deliberately thin: this is not a client account, it is the minimum needed to
 * issue a document to somebody who is not on the route and never will be.
 */
export interface WalkInCustomer {
  /** Mock id, `wic_xxx`. */
  id: string;
  /**
   * Counter code the till prints beside the name (`G-0001`).
   *
   * Employees are known by their payroll code and Venado accounts by their ERP
   * code; a walk-in had neither, and the billing block shows every buyer the
   * same way — `código - NOMBRE` — so they were given one.
   */
  code: string;
  /** CI or NIT, whichever they gave. Unique — it is what identifies them. */
  docId: string;
  /** Which document `docId` is. Only a walk-in gets to vary this. */
  docType: IdDocType;
  name: string;
  /** Who their invoice is made out to. `SIN NOMBRE` when they gave none. */
  razonSocial: string;
  /** Where their invoice is sent. `SIN EMAIL` when they gave none. */
  email: string;
  phone?: string;
  createdAt: string;
}

/**
 * The customer as the sale froze them — a snapshot, not a reference.
 *
 * The sale keeps what was true when it was rung up: an employee's credit cap
 * changing next month, or a client moving channel, must not rewrite a document
 * already issued. `docId` is resolved here so every variant answers the same
 * question the same way — the CI for an employee, the derived NIT for a Venado
 * client, whatever the walk-in gave.
 *
 * Every variant also carries the billing defaults the till prefills the invoice
 * block from (`docType`, `razonSocial`, `email`) and the code it is displayed
 * by. They are denormalised on purpose — this is a frozen copy, and a snapshot
 * that has to go and look something up is not a snapshot.
 */
export type SaleCustomer =
  | {
      kind: "empleado";
      id: string;
      name: string;
      /** The employee's CI. */
      docId: string;
      /** Always `CI` for staff — they are billed as people. */
      docType: IdDocType;
      /** The employee's own name: staff are invoiced under it. */
      razonSocial: string;
      email: string;
      employeeCode: number;
      creditLimitBs: number;
      /** `creditLimitBs - creditUsedBs` at the moment the customer was resolved (Bs). */
      creditAvailableBs: number;
    }
  | {
      kind: "venado";
      id: string;
      name: string;
      /** NIT derived from the client's code, the same way the orders screen derives it. */
      docId: string;
      /** Always `NIT` for a Venado account — it is a registered point of sale. */
      docType: IdDocType;
      /** The account's own name. */
      razonSocial: string;
      email: string;
      /** Channel the account belongs to — what decides the discount. */
      channelId: string;
      /** Client code as the ERP prints it (`C-1234`). */
      code: string;
      /** Current-account credit line derived from the account's average ticket (Bs). */
      creditLimitBs: number;
      /** `creditLimitBs` less what is already owed, at the moment of resolution (Bs). */
      creditAvailableBs: number;
    }
  | {
      kind: "general";
      id: string;
      name: string;
      /** CI or NIT, as given at the counter. */
      docId: string;
      /** Whatever they handed over — this is the one kind that varies. */
      docType: IdDocType;
      /** `SIN NOMBRE` when they gave none, which is the common case. */
      razonSocial: string;
      /** `SIN EMAIL` when they gave none. */
      email: string;
      /** Counter code (`G-0001`). */
      code: string;
    };

/** How the sale was paid for. */
/**
 * How money reaches the counter.
 *
 * **There is no payroll tender**, and that is a decision rather than an omission.
 * An employee buying on credit draws on the credit line they already have; that
 * the company later collects it from their salary is true, and it happens
 * somewhere this system does not reach. Modelling it here meant the counter had
 * to ask a cashier which ledger a debt would eventually be chased through — a
 * question about payroll administration, asked of somebody handing over a bag of
 * groceries.
 */
export type TenderMethod = "VALE" | "TARJETA" | "QR" | "EFECTIVO" | "CREDITO";

export const TENDER_METHOD_LABELS: Record<TenderMethod, string> = {
  VALE: "Vale",
  TARJETA: "Tarjeta de Débito/Crédito",
  QR: "Código QR",
  EFECTIVO: "Efectivo",
  // Just "Crédito" now: it is one line per account, whoever the account belongs
  // to. It used to say "cuenta corriente" only because a second credit tender
  // existed to be told apart from.
  CREDITO: "Crédito",
};

export const ALL_TENDER_METHODS: TenderMethod[] = [
  "VALE",
  "TARJETA",
  "QR",
  "EFECTIVO",
  "CREDITO",
];

/**
 * How the counter settles a sale, above the tenders.
 *
 * The distinction the till is actually built on, and it is not a method: **contado**
 * means the money is on the counter now, in whatever mix of vales, card, QR and cash
 * it takes; **crédito** means none of it is, and the whole sale goes on the buyer's
 * account. That is why crédito shows no tenders at all — there is nothing received to
 * describe and no change to give back — and why it was wrong to have it sitting in the
 * same list as `EFECTIVO`, one option among five, as if a cashier chose between "cash"
 * and "don't pay".
 */
export type SettlementMode = "contado" | "credito";

export const SETTLEMENT_MODE_LABELS: Record<SettlementMode, string> = {
  contado: "Al contado",
  credito: "Crédito",
};

export const ALL_SETTLEMENT_MODES: SettlementMode[] = ["contado", "credito"];

/**
 * One tender against a sale. Each method captures a different thing, so they
 * are separate shapes rather than one record of optional fields: a card
 * payment without its reference is not a payment, and asking a cash payment
 * for one would be asking for nothing.
 *
 * Amounts are in the payment's own `currency` where it has one; everything is
 * converted to Bs for the coverage check (`lib/agency-sale-math.ts`).
 */
export type SalePayment =
  | {
      /**
       * A voucher the counter takes instead of money — staff meal vales, promotional
       * vales, vales issued against a previous return.
       *
       * One payment per vale and not one per sale, because each carries its own
       * number, its own beneficiary and its own amount: they are separate pieces of
       * paper, and a total with no numbers behind it cannot be reconciled against the
       * ones in the drawer.
       */
      method: "VALE";
      /** Number printed on the voucher. */
      number: string;
      /** CI of whoever it was issued to. */
      docId: string;
      beneficiary: string;
      /** Face value taken (Bs) — a vale is never in another currency. */
      amount: number;
    }
  | {
      method: "TARJETA";
      /** CI of the cardholder, as the voucher records it. */
      customerDocId: string;
      /** Authorisation / voucher number. */
      reference: string;
      currency: Currency;
      /** Charged amount, in `currency`. */
      amount: number;
    }
  | {
      method: "QR";
      /** Name the transfer arrived under — not necessarily the buyer's. */
      customerName: string;
      /** Transaction id given by the bank. */
      reference: string;
      currency: Currency;
      /** Transferred amount, in `currency`. */
      amount: number;
    }
  | {
      method: "EFECTIVO";
      /** Bolivianos handed over (Bs). */
      receivedBs: number;
      /** US dollars handed over (US$), converted at the official rate. */
      receivedUsd: number;
      /** `receivedBs + receivedUsd × rate` (Bs). Derived, never typed in. */
      totalReceivedBs: number;
      /** Change owed back (Bs). Zero when the money is exact. */
      changeBs: number;
    }
  | {
      /**
       * The buyer's credit line — the one credit tender there is.
       *
       * It used to have a payroll twin, on the grounds that a salary deduction
       * and an invoice chased by collections are different debts. True, and not
       * the counter's problem: what the till has to know is that this account has
       * room for this amount. How the company gets the money back afterwards is
       * settled somewhere else entirely.
       */
      method: "CREDITO";
      /**
       * The account the receivable is booked against — a Venado client, or an
       * employee's own account.
       */
      clientId: string;
      /** That account's code as it is printed (`C-1234`, or the payroll code). */
      clientCode: string;
      /** Charged to the account (Bs) — this tender is never in another currency. */
      amount: number;
    };

/**
 * A counter sale is either good or void. There is no "pendiente": the goods
 * left with the buyer and the money came in before they did, so there is
 * nothing left to wait for.
 */
export type AgencySaleStatus = "completada" | "anulada";

/**
 * Upper case, like every other status label here, because that is how the ERP
 * these screens replace prints them and the counter reads both side by side.
 *
 * `completada` shows as PROCESADA on purpose: the state means the sale went
 * through and was banked, and that is the word the agency already uses for it.
 */
export const AGENCY_SALE_STATUS_LABELS: Record<AgencySaleStatus, string> = {
  completada: "PROCESADA",
  anulada: "ANULADA",
};

export const ALL_AGENCY_SALE_STATUSES: AgencySaleStatus[] = ["completada", "anulada"];

/**
 * Venta en agencia — a sale rung up over the counter at the branch. Amounts are
 * in Bs; `netTotal` is what the buyer paid after `discount`, ICE included.
 */
export interface AgencySale {
  /** Business code shown in the list (`Código`). */
  id: number;
  /** Document number the counter prints (`AG-000123`). */
  saleNumber: string;
  /** When it was rung up, with time. */
  createdAt: string;
  /** Agency seller who rang it up — from the session, never a field. */
  sellerCode: number;
  sellerName: string;
  /** Who bought, frozen as they were at that moment. */
  customer: SaleCustomer;
  /**
   * Who the invoice was made out to, as the cashier captured it.
   *
   * Separate from `customer` because they answer different questions: the
   * customer is who the till sold to and priced for, the billing is who the
   * document was issued to. They usually agree; when a buyer asks for the
   * invoice in their company's name, they do not.
   */
  billing: SaleBilling;
  /** What was sold. Same line as an order's: a sale is an order that ships now. */
  lines: OrderLine[];
  /** Sum of the lines before discount (Bs). */
  subtotal: number;
  /** The rate applied, decided by the customer's kind (percent). */
  discountPct: number;
  /** What that rate amounted to (Bs). */
  discount: number;
  /** ICE contained in the lines (Bs) — informative, already inside the price. */
  ice: number;
  /** `subtotal - discount` (Bs): what was actually charged. */
  netTotal: number;
  /**
   * How it was paid — one tender or several. A sale settled part on a card and
   * the rest in cash is one sale with two payments, never two sales.
   *
   * At most one of them is `EFECTIVO`: two cash lines on one document is a
   * data-entry mistake, not a scenario. Two cards are legitimate and allowed.
   */
  payments: SalePayment[];
  status: AgencySaleStatus;
  /** Why it was voided. Only ever set together with `status: "anulada"`. */
  cancelReason?: string;
  /**
   * The till session this sale was rung up inside, when there was one.
   *
   * Resolved by the service from the seller's open session — never a field on
   * the screen, the same rule `sellerCode` follows. Its absence is meaningful
   * and not a gap: a sale that never crossed a physical counter (web,
   * e-commerce, the mobile app) belongs to no drawer, so no arqueo should ever
   * be asked to account for it.
   */
  tillSessionId?: string;
}

// ---------------------------------------------------------------------------
// Caja de agencia — the drawer at the counter, and who is answering for it
// ---------------------------------------------------------------------------

/**
 * A physical till standing at an agency counter.
 *
 * It has no seller of its own, and that is the model rather than an omission:
 * nobody is assigned a till: whoever arrives takes one that is free, and the
 * counter staff sort that out between themselves. What a till belongs to is a
 * *place* — the `StockLocation` of kind `agencia` it stands in, the same
 * entity a traspaso moves stock to.
 */
export interface AgencyTill {
  id: string;
  /** What is painted on the front of it: `CAJA 1`. */
  code: string;
  name: string;
  /** `StockLocation.id` of the agency it stands in. */
  agencyId: string;
}

/**
 * Open, or counted and closed. There is no third state.
 *
 * A session is not a document that gets approved — it is a stretch of time one
 * person answers for. It is running, or it has been handed in.
 */
export type TillSessionStatus = "abierta" | "cerrada";

export const TILL_SESSION_STATUS_LABELS: Record<TillSessionStatus, string> = {
  abierta: "ABIERTA",
  cerrada: "CERRADA",
};

/**
 * One seller's turn at one till: the unit of responsibility.
 *
 * Everything about accountability hangs off this record. A sale rung up while
 * it is open belongs to it, the cash it should hold is derived from those
 * sales, and closing it freezes what was counted against what was owed.
 *
 * The closing figures are optional because they do not exist until the arqueo
 * happens — and once it does, **all four arrive together**. A session with a
 * declared amount and no difference would be a count nobody finished, which is
 * precisely what `closeSessionBlockedReason` refuses.
 *
 * `agencyId` is copied onto the session rather than looked up through the till.
 * That is deliberate groundwork: the day-close consolidates every session of one
 * agency, and asking it to resolve a till per row to find out where each one
 * stood would make the simplest question in the feature a join.
 */
/**
 * One denomination as it was counted: how many of a given note or coin.
 *
 * The count is stored and not only its total, because the total is the figure
 * that gets disputed and the breakdown is the only thing that settles it. "Faltan
 * Bs 100" is an accusation; "faltan Bs 100 y conté cinco billetes de 20 donde el
 * turno anterior dejó diez" is a fact somebody can check against the drawer.
 *
 * Only denominations that were actually counted travel — a row at zero is not a
 * count, it is a box nobody filled in.
 */
export interface TillCountEntry {
  /** Face value: bolivianos or dollars, per `currency`. */
  value: number;
  currency: Currency;
  /** How many of them are in the drawer. Always a whole number. */
  qty: number;
}

/**
 * Why a difference happened. Mock list — see `data/agency-config.ts` for the rule
 * about invented values.
 *
 * Short and concrete on purpose. A long list gets answered with whatever is on
 * top; a list of six things that actually go wrong at a counter gets answered
 * with the one that happened.
 */
export type TillChargeReason =
  | "vuelto_mal_dado"
  | "cobro_incompleto"
  | "billete_falso"
  | "gasto_no_rendido"
  | "sobrante_sin_origen"
  | "otro";

export const TILL_CHARGE_REASON_LABELS: Record<TillChargeReason, string> = {
  vuelto_mal_dado: "Vuelto mal dado",
  cobro_incompleto: "Cobro incompleto",
  billete_falso: "Billete falso",
  gasto_no_rendido: "Gasto no rendido",
  sobrante_sin_origen: "Sobrante sin origen",
  otro: "Otro",
};

export const ALL_TILL_CHARGE_REASONS: TillChargeReason[] = [
  "vuelto_mal_dado",
  "cobro_incompleto",
  "billete_falso",
  "gasto_no_rendido",
  "sobrante_sin_origen",
  "otro",
];

/**
 * One line of "who answers for this difference".
 *
 * **A list and not a single field**, because a shift is not one mistake. A drawer
 * that is Bs 180 short can be Bs 150 of a note the cashier took as good and Bs 30
 * of change given wrong to a different customer by a colleague covering the
 * counter at lunch — two people, two reasons, two amounts. Forcing that into one
 * name means the whole 180 gets hung on whoever was standing there at closing
 * time, which is how an arqueo stops being evidence and becomes a formality.
 *
 * The account charged is an `Employee`: it is the catalogue the counter already
 * charges payroll credit against, so a shortfall lands where the business
 * already collects from.
 */
export interface TillChargeLine {
  id: string;
  /** `Employee.id` the charge is booked against. */
  accountId: string;
  /** Their code and name, frozen — a document says who it charged, not who they are now. */
  accountCode: number;
  accountName: string;
  /** Amount charged, in `currency`. */
  amount: number;
  currency: Currency;
  /** `amount` in Bs, converted at the arqueo's own rate. Derived, never typed. */
  amountBs: number;
  reason: TillChargeReason;
  /** Free text. The one place the person who was there can say what happened. */
  comment: string;
}

export interface TillSession {
  id: string;
  tillId: string;
  /** Where the till stands, frozen here — see the note above. */
  agencyId: string;
  /** Who opened it and answers for it. From the session, never a field. */
  sellerCode: number;
  sellerName: string;
  openedAt: string;
  /** The float it started with (Bs) — what was in the drawer before selling. */
  openingBs: number;
  status: TillSessionStatus;
  /** ISO instant of the arqueo. Set together with the three figures below. */
  closedAt?: string;
  /** What the drawer should hold (Bs): the float plus the cash actually taken. */
  expectedBs?: number;
  /**
   * What the seller counted, in Bs — **derived from `count`, never typed.**
   *
   * A single box asking for a total is a box that gets the answer the cashier
   * expected rather than the one in the drawer: it is the same arithmetic done in
   * somebody's head, unrecorded, at the end of a shift. Counting denomination by
   * denomination produces this figure as a consequence, and produces evidence
   * along with it.
   */
  declaredBs?: number;
  /** The physical count behind that figure. Only non-zero denominations. */
  count?: TillCountEntry[];
  /** Face value of the dollars counted (US$), before conversion. */
  declaredUsd?: number;
  /**
   * The rate those dollars were converted at, frozen onto the arqueo.
   *
   * Bolivia's rate is pegged and this app reads it from a constant, so today the
   * figure never moves. It is stored anyway: the day it does move, every arqueo
   * closed before it must keep meaning what it meant, and a report that
   * reconverts them at the current rate would rewrite history in the one place
   * that must never be rewritten.
   */
  exchangeRate?: number;
  /**
   * Who answers for the difference, split however it actually happened.
   *
   * Present whenever `differenceBs` is not zero, and the amounts add up to it:
   * every boliviano that did not square is assigned to somebody. Absent — not an
   * empty array — on a drawer that squared, so a later reader never has to
   * wonder whether an empty list meant "nobody" or "not filled in".
   */
  charges?: TillChargeLine[];
  /**
   * `declaredBs - expectedBs` (Bs). Positive is a surplus, negative a shortfall.
   *
   * **Stored, not derived on read.** The expected figure is a function of the
   * sales as they stood at the moment of counting, and a sale voided next week
   * would silently rewrite an arqueo somebody already signed.
   */
  differenceBs?: number;
  /** What the seller had to say — required when the count does not square. */
  notes?: string;
}

// ---------------------------------------------------------------------------
// Traspaso de productos — stock moving between the places that hold it
// ---------------------------------------------------------------------------

/**
 * A place that holds stock: a dispatch warehouse or a branch that sells over the
 * counter.
 *
 * One type for both, and that is the point. A traspaso does not care whether the
 * boxes leave a warehouse or an agency — it cares that they leave somewhere with
 * stock and arrive somewhere else with stock. Splitting them into two types would
 * mean writing the same form twice and then explaining why "almacén → agencia" is
 * a different document from "agencia → agencia". `kind` is there for reading and
 * grouping, never for the rules.
 */
export interface StockLocation {
  id: string;
  /** The ERP's own code, e.g. `S12.V.SC.CENTRAL` — what the paperwork prints. */
  code: string;
  name: string;
  kind: "almacen" | "agencia";
  city: string;
}

export const STOCK_LOCATION_KIND_LABELS: Record<StockLocation["kind"], string> = {
  almacen: "Almacén",
  agencia: "Agencia",
};

/**
 * Where a transfer is in its life, in the ERP's own four states.
 *
 * Two of them are open and differ in how far along they are — `por_revisar` is
 * the movement as written, nobody has looked at it yet; `confirmando` is the one
 * being worked, the warehouse is counting against it. Then `aprobado`, the
 * signature, and `cancelado`, the refusal.
 *
 * The shipping log this used to be (`borrador`/`enviado`/`recibido`) said where
 * the boxes physically were, which is a different question and needs the
 * receiving screen to answer it honestly. Storing it without that screen meant a
 * column full of `enviado` that nothing could ever move.
 */
export type TransferStatus = "por_revisar" | "confirmando" | "aprobado" | "cancelado";

/** Uppercase because that is how the ERP prints them, like `RETURN_STATUS_LABELS`. */
export const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = {
  por_revisar: "POR REVISAR",
  confirmando: "CONFIRMANDO",
  aprobado: "APROBADO",
  cancelado: "CANCELADO",
};

/** Filter order: the open ones first, in the order they happen; the refusal last. */
export const ALL_TRANSFER_STATUSES: TransferStatus[] = [
  "por_revisar",
  "confirmando",
  "aprobado",
  "cancelado",
];

/**
 * One product on a transfer, in the two units the warehouse counts in.
 *
 * Cases and loose units, exactly like an order line, because that is how the
 * goods physically move: nobody hands over 247 sachets, they hand over 12 cases
 * and 7 loose. `units` is the figure every rule uses — stock, totals, the
 * destination's count — and it is derived, never typed.
 *
 * The line is **valued but not charged**. Nobody pays for a traspaso — the goods
 * stay inside the business — but the movement still has to be worth something on
 * paper: it is what the two locations settle between them, what an insurer is
 * told, and what makes "se trasladaron 400 unidades" mean anything. So the price
 * rides along, frozen from the catalogue like an order freezes its own, and no
 * discount is ever applied to it.
 */
export interface TransferLine {
  productId: string;
  /** Business code (`Cod`) — an integer, as the ERP prints it. */
  code: number;
  productName: string;
  /** Label of the minimum unit (Botella, Bolsa, Sobre…). */
  unitLabel: string;
  /** Label of the maximum unit (Caja, Fardo…). */
  caseLabel: string;
  unitsPerCase: number;
  qtyCase: number;
  qtyUnit: number;
  /** Minimum units this line moves: `qtyCase * unitsPerCase + qtyUnit`. */
  units: number;
  /** List price of one minimum unit (Bs), frozen when the product was added. */
  priceUnit: number;
  /** `units * priceUnit` (Bs) — what this line is worth, never what it costs anybody. */
  total: number;
  /**
   * What the origin had when the transfer was sent, in minimum units.
   *
   * Frozen onto the line like an order freezes its price: it is what the person
   * who signed the movement was looking at, and the receiving end needs it to
   * tell "the warehouse sent less than it said" from "the warehouse never had it".
   */
  stockAtOrigin: number;
}

/**
 * What the form sends. The server assigns the number, the date and the status.
 *
 * There is no reason field, and that is a decision: a traspaso is ordinary
 * warehouse traffic, not an exception that owes anybody an explanation. A
 * mandatory dropdown on a movement people make several times a day is a field
 * everybody answers with whatever is on top of the list, which is worse than no
 * field at all — it looks like data. `notes` stays for the transfer that does
 * have something to say.
 */
export interface StockTransferInput {
  /**
   * The day the movement happens, as `YYYY-MM-DD`.
   *
   * Typed, not stamped. Paperwork arrives late — the boxes left on Friday and
   * somebody registers it on Monday — and a form that silently dated everything
   * "now" made the operation lie about when its stock moved. The service still
   * refuses a future date: a traspaso that has not happened is not a document.
   *
   * A date and not a timestamp, because that is all the document carries. See
   * `StockTransfer.date` for what the stored form of this is.
   */
  date: string;
  originId: string;
  destinationId: string;
  /** Free note: transport, who receives it, anything the receiving end needs. */
  notes: string;
  lines: TransferLine[];
}

/** A movement of stock between two locations, as the API stores it. */
export interface StockTransfer extends StockTransferInput {
  id: string;
  /** Document number, e.g. `TR-000123`. */
  transferNumber: string;
  /**
   * ISO instant, at **local midnight** of the day on the input's `date`.
   *
   * Widened from the input's `YYYY-MM-DD` rather than kept as a key, so
   * `formatDateTime` and the date filters read it the way they read every other
   * date in this app. Midnight and not a made-up hour: the document carries a
   * day, and nothing here knows what time the truck left.
   */
  date: string;
  /** Who signed it — the user who registered the movement, never a typed field. */
  requestedBy: string;
  status: TransferStatus;
  /** Minimum units the whole document moves — the sum of its lines. */
  totalUnits: number;
  /** What the whole movement is worth (Bs). Valued, never charged — see `TransferLine`. */
  totalValueBs: number;
}
