import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes with conditional logic (shadcn convention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Simulate a network round-trip so mock services behave like a real API. */
export function delay<T>(value: T, ms = 400): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/** Small deterministic PRNG (mulberry32) so mock data is stable per seed. */
export function seededRandom(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("es-BO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Generate a reasonably unique id for mock entities. */
export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Numeric id from a mock string id like "rt_012" → 12. Used to mirror the real
 * API (which uses numeric ids) from the seed's string-id entities. Falls back to
 * a char-sum when the id has no digits, so it stays deterministic and reversible.
 */
export function numId(id: string): number {
  const digits = id.replace(/\D/g, "");
  return digits ? Number(digits) : Math.abs([...id].reduce((a, c) => a + c.charCodeAt(0), 0));
}
