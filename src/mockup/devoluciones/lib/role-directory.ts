import type { Role } from "../types";

/**
 * Local stand-in for the role directory a real deployment would call over the
 * network — see the class diagram this mirrors: `RoleDirectoryClient`.
 *
 * A workflow level names a *role*, never a person (`WorkflowApprover.roleCode`
 * in `types/index.ts`). Resolving that role to the employees who currently hold
 * it is this function's job, called once, at the moment a level actually starts
 * (`startInstance` in `workflow.ts`) — never baked into the template itself, so
 * a person switching roles tomorrow does not have to be found and edited into
 * every level that used to name them.
 *
 * Deliberately **not** sourced from `USERS` in `src/mockup/session-store.ts`, even though
 * that is the login roster and would be the obvious place to read this from. The session
 * store depends on `data/seed.ts` (for `SEED_SELLERS`), and `data/seed.ts` calls into
 * `startInstance` to build the seeded returns — reaching back into the session store from
 * here would close that into an import cycle. A real directory has no such constraint; this
 * roster is the mock absorbing the accident instead of the design. Keep the three codes
 * below in sync with `USERS` by hand.
 */
const ROLE_ROSTER: Record<Role, { code: number; name: string }[]> = {
  supervisor: [{ code: 57, name: "Sergio Peña Montero" }],
  administrador: [{ code: 72, name: "Daniel Durán Melgar" }],
  gerente: [{ code: 94, name: "Rocío Justiniano Áñez" }],
  // Neither role ever signs an approval — see `RETURN_APPROVER_ROLES`.
  vendedor: [],
  vendedor_agencia: [],
};

export function employeesForRole(role: Role): { code: number; name: string }[] {
  return ROLE_ROSTER[role];
}
