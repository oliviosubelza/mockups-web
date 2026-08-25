import type { ClientTask, ClientTaskInput, CompletedClientTask, TaskStatus } from "../types";
import { SEED_CLIENT_TASKS, SEED_CLIENT_TASK_COMPLETIONS } from "../data/seed";
import { delay } from "../lib/utils";
import type { Paginated } from "./routes-service";

export interface ListClientTasksParams {
  page?: number;
  limit?: number;
  status?: TaskStatus | "all";
  /** Free-text category. "all" = no filter. Replaced the old `type` enum filter. */
  category?: string;
  search?: string;
}

/**
 * In-memory mutable repository standing in for the client-tasks REST resource.
 * Kept module level so mutations survive navigation within the session.
 */
let CLIENT_TASKS: ClientTask[] = [...SEED_CLIENT_TASKS];
const COMPLETIONS: CompletedClientTask[] = [...SEED_CLIENT_TASK_COMPLETIONS];

/**
 * The catalogue of task categories, as a list of its own.
 *
 * It used to be derived — read off the tasks that happened to carry one — and that
 * is why the field could only ever be free text: a name nobody had typed yet did
 * not exist, so there was nothing to pick from. Now the categories are a thing the
 * business keeps, seeded from the ones the tasks already use, and a new one can be
 * created *before* the first task that belongs to it. That is the whole difference
 * between a text box and a select.
 *
 * Derived counts still come from the tasks, so a category that nothing uses reports
 * zero rather than disappearing.
 */
let TASK_CATEGORIES: string[] = [
  ...new Set(SEED_CLIENT_TASKS.map((task) => task.category).filter((c): c is string => !!c)),
];

/** Same name, ignoring case and padding — "Exhibición " must not become a second one. */
const sameCategory = (a: string, b: string) =>
  a.trim().localeCompare(b.trim(), "es", { sensitivity: "accent" }) === 0;

/** Add a category to the catalogue if it is new. Blank is not a category. */
function registerCategory(name: string | undefined): void {
  const clean = name?.trim();
  if (!clean) return;
  if (TASK_CATEGORIES.some((c) => sameCategory(c, clean))) return;
  TASK_CATEGORIES = [...TASK_CATEGORIES, clean];
}

export const clientTasksService = {
  list: (): Promise<ClientTask[]> => delay([...CLIENT_TASKS], 500),

  /** Server-style paginated + filtered list (as the real API returns it). */
  listPaged: ({
    page = 1,
    limit = 8,
    status = "all",
    category = "all",
    search = "",
  }: ListClientTasksParams = {}): Promise<Paginated<ClientTask>> => {
    const q = search.trim().toLowerCase();
    const filtered = CLIENT_TASKS.filter(
      (t) =>
        (status === "all" || t.status === status) &&
        (category === "all" || t.category === category) &&
        (!q ||
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q)),
    );
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const data = filtered.slice((safePage - 1) * limit, safePage * limit);
    return delay({ data, pagination: { page: safePage, limit, totalItems, totalPages } }, 450);
  },

  get: (id: number): Promise<ClientTask | undefined> =>
    delay(CLIENT_TASKS.find((t) => t.id === id), 300),

  /**
   * The catalogue of categories, each with how many tasks use it — what the list
   * filters by and what the task form offers. Its own call rather than derived from
   * a page, so a category whose tasks all sit on page 2 still shows up.
   *
   * Every registered category is listed even at zero: one just created has no tasks
   * yet, and a picker that hid it until somebody used it would be a picker that
   * cannot be used the first time.
   */
  categories: (): Promise<{ name: string; count: number }[]> => {
    const counts = new Map<string, number>();
    for (const name of TASK_CATEGORIES) counts.set(name, 0);
    for (const task of CLIENT_TASKS) {
      if (!task.category) continue;
      counts.set(task.category, (counts.get(task.category) ?? 0) + 1);
    }
    return delay(
      [...counts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => a.name.localeCompare(b.name, "es")),
      200,
    );
  },

  /**
   * Register a new category, or hand back the one that already answers to the name.
   *
   * Idempotent on purpose: two cashiers typing "Exhibición" and "exhibicion " must
   * end up in one category, not two that look identical in a list. The stored
   * spelling is the first one used — later duplicates resolve to it rather than
   * renaming it under whoever typed last.
   */
  createCategory: (name: string): Promise<string> => {
    const clean = name.trim();
    if (!clean) return Promise.reject(new Error("Escribí un nombre para la categoría."));
    if (clean.length > 40) {
      return Promise.reject(new Error("La categoría no puede pasar de 40 caracteres."));
    }
    const existing = TASK_CATEGORIES.find((c) => sameCategory(c, clean));
    if (existing) return delay(existing, 200);
    TASK_CATEGORIES = [...TASK_CATEGORIES, clean];
    return delay(clean, 300);
  },

  /** Every completion (visit response) recorded for a single task. */
  listCompletionsByTask: (taskId: number): Promise<CompletedClientTask[]> =>
    delay(
      COMPLETIONS.filter((c) => c.visitTaskId === taskId),
      450,
    ),

  /** Every completion (visit response) recorded by a single employee (seller). */
  listCompletionsByEmployee: (employeeId: number): Promise<CompletedClientTask[]> =>
    delay(
      COMPLETIONS.filter((c) => c.employeeId === employeeId),
      450,
    ),

  create: (input: ClientTaskInput): Promise<ClientTask> => {
    const now = new Date().toISOString();
    // A task saved under a category nobody registered registers it — a template
    // instantiated from an older definition carries a free-text one, and the
    // catalogue must not end up missing a name that is demonstrably in use.
    registerCategory(input.category);
    const nextId = CLIENT_TASKS.reduce((max, t) => Math.max(max, t.id), 0) + 1;
    const task: ClientTask = {
      id: nextId,
      name: input.name,
      description: input.description,
      fields: input.fields,
      category: input.category,
      color: input.color,
      order: input.order,
      required: input.required,
      status: input.status ?? "active",
      dueDate: input.dueDate || undefined,
      assignScope: input.assignScope,
      clientIds: input.clientIds,
      createdAt: now,
      updatedAt: now,
    };
    CLIENT_TASKS = [task, ...CLIENT_TASKS];
    return delay(task, 500);
  },

  update: (id: number, input: ClientTaskInput): Promise<ClientTask> => {
    const now = new Date().toISOString();
    registerCategory(input.category);
    let updated: ClientTask | undefined;
    CLIENT_TASKS = CLIENT_TASKS.map((t) => {
      if (t.id !== id) return t;
      updated = {
        ...t,
        name: input.name,
        description: input.description,
        fields: input.fields,
        category: input.category,
        color: input.color,
        order: input.order,
        required: input.required,
        status: input.status ?? t.status,
        dueDate: input.dueDate || undefined,
        assignScope: input.assignScope,
        clientIds: input.clientIds,
        updatedAt: now,
      };
      return updated;
    });
    if (!updated) return Promise.reject(new Error("Tarea no encontrada"));
    return delay(updated, 500);
  },

  setStatus: (id: number, status: TaskStatus): Promise<ClientTask> => {
    const now = new Date().toISOString();
    let updated: ClientTask | undefined;
    CLIENT_TASKS = CLIENT_TASKS.map((t) =>
      t.id === id ? (updated = { ...t, status, updatedAt: now }) : t,
    );
    if (!updated) return Promise.reject(new Error("Tarea no encontrada"));
    return delay(updated, 300);
  },

  remove: (id: number): Promise<{ id: number }> => {
    CLIENT_TASKS = CLIENT_TASKS.filter((t) => t.id !== id);
    return delay({ id }, 400);
  },

  /**
   * Assign a set of clients to a task. Forces the task into the "some" scope and
   * merges the ids into the existing target set (deduplicated).
   */
  assignClients: (taskId: number, clientIds: string[]): Promise<ClientTask> => {
    const now = new Date().toISOString();
    let updated: ClientTask | undefined;
    CLIENT_TASKS = CLIENT_TASKS.map((t) => {
      if (t.id !== taskId) return t;
      const merged = [...new Set([...t.clientIds, ...clientIds])];
      updated = { ...t, assignScope: "some", clientIds: merged, updatedAt: now };
      return updated;
    });
    if (!updated) return Promise.reject(new Error("Tarea no encontrada"));
    return delay(updated, 400);
  },

  /** Remove a single client from a task's target set. */
  unassignClient: (taskId: number, clientId: string): Promise<ClientTask> => {
    const now = new Date().toISOString();
    let updated: ClientTask | undefined;
    CLIENT_TASKS = CLIENT_TASKS.map((t) =>
      t.id !== taskId
        ? t
        : (updated = { ...t, clientIds: t.clientIds.filter((id) => id !== clientId), updatedAt: now }),
    );
    if (!updated) return Promise.reject(new Error("Tarea no encontrada"));
    return delay(updated, 300);
  },
};
