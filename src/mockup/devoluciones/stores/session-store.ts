// Los PERMISOS del módulo de devoluciones. Quién sos ya no se decide acá: el roster, el store y el
// selector viven en `src/mockup/session-store.ts`, porque el cambio de rol pasó al perfil de la top
// bar y ahí lo ve toda la app, no solo estas pantallas.
//
// Este archivo se queda con lo único que sigue siendo del módulo: qué puede hacer cada rol con una
// devolución. Se re-exporta el store para que las pantallas sigan importando de un solo lugar.
import type { Role } from "../types";

export {
  USERS,
  useSessionStore,
  useCurrentUser,
  useRole,
  initialsOf,
  ROLE_LABELS,
} from "../../session-store";
export type { Role, User } from "../../session-store";

/**
 * Roles que solo ven los documentos que registraron ellos mismos.
 *
 * Un vendedor trabaja su propia cartera: los pedidos y las devoluciones son suyos para registrar y
 * para seguir, y el papeleo de otro vendedor no es asunto suyo. Todo otro rol lee la operación
 * entera, que es lo que lo hace supervisor de ella.
 *
 * El vendedor de mostrador está acá por lo mismo y no por algo más débil: desde dónde registra el
 * pedido no cambia nada sobre de quién es el pedido.
 */
export const OWN_DOCUMENTS_ONLY_ROLES: Role[] = ["vendedor", "vendedor_agencia"];
export const seesOwnDocumentsOnly = (role: Role) => OWN_DOCUMENTS_ONLY_ROLES.includes(role);

/**
 * Roles que pueden pararse en un escritorio de aprobación — el `role_code` que un
 * `RefundApprovalLevel` nombra.
 *
 * Más angosto que "quién puede abrir devoluciones": el vendedor registra el reclamo y lo sigue, pero
 * firmarlo —en cualquier nivel— es trabajo de otro. Qué escritorio concreto le toca a una devolución
 * lo sigue decidiendo el nivel (`decisionBlockedReason`); esto solo decide si las superficies de
 * aprobación existen para el rol.
 */
export const RETURN_APPROVER_ROLES: Role[] = [
  "analista_cx",
  "gerente_cx",
  "gerente_comercial",
  "gerente_general",
];
export const canApproveReturns = (role: Role) => RETURN_APPROVER_ROLES.includes(role);

/**
 * Roles que pueden configurar los niveles de aprobación (`RefundApprovalLevel`) y el techo de monto
 * de cada uno.
 *
 * Deliberadamente más angosto que "quién puede aprobar": un aprobador decide UN documento, y quien
 * edita la escalera decide cómo se van a decidir TODOS de ahí en adelante. Son poderes distintos y
 * el segundo lo tiene solo la gerencia general.
 */
export const WORKFLOW_ADMIN_ROLES: Role[] = ["gerente_general"];
export const canManageWorkflows = (role: Role) => WORKFLOW_ADMIN_ROLES.includes(role);
