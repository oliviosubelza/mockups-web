import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Role, User } from "../types";
import { OPERATING_DISTRIBUTOR } from "../data/distributors-data";
import { SEED_SELLERS } from "../data/seed";

/** The seller the "vendedor" session acts as, taken from the seed itself. */
const SESSION_SELLER_CODE = 5003;
const SESSION_SELLER = SEED_SELLERS.find((s) => s.code === SESSION_SELLER_CODE);

/** Same rule for the counter seller: a real `salesMode: "agencia"` row of the seed. */
const AGENCY_SESSION_SELLER_CODE = 5101;
const AGENCY_SESSION_SELLER = SEED_SELLERS.find((s) => s.code === AGENCY_SESSION_SELLER_CODE);

/**
 * The branch the counter seller works at — a real `StockLocation` of kind
 * `agencia`, not an invented id.
 *
 * Written as a literal instead of imported from `data/stock-locations` because
 * this store is loaded by the app shell and that module pulls in the whole
 * product catalogue behind it. The id is asserted by the tills seed, which does
 * read the locations: an agency that stopped existing would leave that seller
 * with no tills rather than with tills nobody can find.
 */
const AGENCY_SESSION_AGENCY_ID = "ag_banzer";

/**
 * Mock authentication: one user per role. In a real app the role would come
 * from the login/JWT; here it can be switched from the user menu to preview how
 * each role sees the app.
 *
 * The seller is the one identity that must be a *real* row of the seed and not
 * an invented name: their screens are filtered to their own code, so a made-up
 * name would sign documents nobody in the data ever registered.
 */
export const USERS: User[] = [
  { id: "u_admin", name: "Daniel Durán Melgar", email: "danielduran@grupovenado.com", role: "administrador", distributor: OPERATING_DISTRIBUTOR, sellerCode: 5001, employeeCode: 72 },
  { id: "u_supervisor", name: "Sergio Peña Montero", email: "sergiopena@grupovenado.com", role: "supervisor", channelName: "TRADICIONAL", distributor: OPERATING_DISTRIBUTOR, sellerCode: 5002, employeeCode: 57 },
  { id: "u_gerente", name: "Rocío Justiniano Áñez", email: "rociojustiniano@grupovenado.com", role: "gerente", distributor: OPERATING_DISTRIBUTOR, sellerCode: 5004, employeeCode: 94 },
  // No approver identity on purpose: a seller registers returns and never signs
  // them, so their approval queue is empty rather than borrowed from a role.
  {
    id: "u_vendedor",
    name: SESSION_SELLER?.name ?? "Verónica López",
    email: SESSION_SELLER?.email ?? "veronicalopez@grupovenado.com",
    role: "vendedor",
    distributor: OPERATING_DISTRIBUTOR,
    sellerCode: SESSION_SELLER?.code ?? SESSION_SELLER_CODE,
  },
  // Sells over the counter at the agency: no route, no visits, no GPS — the same
  // pedidos and devoluciones as any seller, and only his own.
  {
    id: "u_vendedor_agencia",
    name: AGENCY_SESSION_SELLER?.name ?? "GABRIELA CUELLAR",
    email: AGENCY_SESSION_SELLER?.email ?? "gabriela.cuellar@grupovenado.com",
    role: "vendedor_agencia",
    distributor: OPERATING_DISTRIBUTOR,
    sellerCode: AGENCY_SESSION_SELLER?.code ?? AGENCY_SESSION_SELLER_CODE,
    // Which counter he stands at. A real login would carry this in the token;
    // here it binds him to one of the agencies traspasos already move stock to,
    // so the tills he is offered are the ones that physically exist where he works.
    agencyId: AGENCY_SESSION_AGENCY_ID,
  },
];

interface SessionState {
  userId: string;
  setUserId: (id: string) => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      userId: USERS[0].id,
      setUserId: (userId) => set({ userId }),
    }),
    { name: "route-mgmt-session" },
  ),
);

/** The currently signed-in user (falls back to the first user). */
export function useCurrentUser(): User {
  const userId = useSessionStore((s) => s.userId);
  return USERS.find((u) => u.id === userId) ?? USERS[0];
}

/** Current role convenience hook. */
export function useRole(): Role {
  return useCurrentUser().role;
}

/** Two-letter initials for an avatar fallback. */
export function initialsOf(name: string) {
  return name.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

/** Human label for a role. */
export const ROLE_LABELS: Record<Role, string> = {
  administrador: "Administrador",
  supervisor: "Supervisor",
  gerente: "Gerente",
  vendedor: "Vendedor",
  vendedor_agencia: "Vendedor de agencia",
};

/** Roles allowed to open the "Gestión de Mercados" section. */
export const MARKETS_VIEW_ROLES: Role[] = ["administrador", "supervisor"];
/** Only administrators can create / draw / edit markets. */
export const MARKETS_EDIT_ROLES: Role[] = ["administrador"];

export const canViewMarkets = (role: Role) => MARKETS_VIEW_ROLES.includes(role);
export const canEditMarkets = (role: Role) => MARKETS_EDIT_ROLES.includes(role);

/** Roles allowed to open the "Monitoreo" (live seller activity) section. */
export const MONITORING_VIEW_ROLES: Role[] = ["administrador", "supervisor"];
export const canViewMonitoring = (role: Role) => MONITORING_VIEW_ROLES.includes(role);

/**
 * Roles allowed to configure approval flows and how documents are routed to
 * them.
 *
 * Deliberately narrower than "who can approve": an approver decides one
 * document, and whoever edits a workflow decides how *every* document will be
 * decided from then on. Those are different powers and only the administrator
 * holds the second one.
 */
export const WORKFLOW_ADMIN_ROLES: Role[] = ["administrador"];
export const canManageWorkflows = (role: Role) => WORKFLOW_ADMIN_ROLES.includes(role);

/**
 * Roles that only ever see the documents they registered themselves.
 *
 * A seller works their own book: pedidos and devoluciones are theirs to file and
 * to follow, and another seller's paperwork is none of their business. Every
 * other role reads the whole operation, which is what makes them supervisors of
 * it.
 *
 * The counter seller is in here for the same reason and not a weaker one: where
 * he registers the order from changes nothing about whose order it is.
 */
export const OWN_DOCUMENTS_ONLY_ROLES: Role[] = ["vendedor", "vendedor_agencia"];
export const seesOwnDocumentsOnly = (role: Role) => OWN_DOCUMENTS_ONLY_ROLES.includes(role);

/**
 * Roles that can stand at an approval desk.
 *
 * Narrower than "who can open devoluciones": a seller registers the claim and
 * follows it, but signing it — at any level — is somebody else's job. The desk
 * itself is still picked by the workflow (`decisionBlockedReason`); this only
 * decides whether the approval surfaces exist for the role at all.
 */
export const RETURN_APPROVER_ROLES: Role[] = ["administrador", "supervisor", "gerente"];
export const canApproveReturns = (role: Role) => RETURN_APPROVER_ROLES.includes(role);
