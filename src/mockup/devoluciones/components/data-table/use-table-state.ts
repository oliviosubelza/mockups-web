import { useEffect, useRef, useState } from "react";
import type { PersistedTableState } from "./types";

// Per-table layout state (order, sizing, visibility, pinning, sorting, density, page size) lives in
// localStorage: the user arranges a table once and finds it that way on the next visit. The prefix
// is versioned so a change in the defaults can discard stale blobs.
// v2: density defaults to compact everywhere and the actions column starts anchored right. A blob
// written by v1 carries the old density and the old pinning, so it is discarded rather than
// restored — otherwise the new defaults would only reach users who never touched a table.
const PREFIX = "data-table:v2:";
const DEBOUNCE_MS = 400;

const DEFAULTS: PersistedTableState = {
  columnOrder: [],
  columnSizing: {},
  columnVisibility: {},
  columnPinning: { left: [], right: [] },
  sorting: [],
  density: "compact",
  pageSize: 20,
};

function read(key: string): PersistedTableState | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as PersistedTableState) : null;
  } catch {
    return null;
  }
}

/**
 * `overrides` are the table's OWN defaults — what it looks like before the user has arranged
 * anything (its density, its page size, the columns it declares anchored). They are the base a
 * saved blob is merged onto, so a table with nothing stored keeps them: reading them back as the
 * hook's generic defaults is what used to unpin every `pin: "right"` column a fraction of a second
 * after mount.
 */
export function useTableState(tableId: string, overrides?: Partial<PersistedTableState>) {
  const defaults: PersistedTableState = { ...DEFAULTS, ...overrides };

  const [state, setState] = useState<PersistedTableState>(defaults);
  const [isLoaded, setIsLoaded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const saved = read(`${PREFIX}${tableId}`);
    if (saved) setState({ ...defaults, ...saved });
    setIsLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  function persist(updates: Partial<PersistedTableState>) {
    setState((prev) => {
      const next = { ...prev, ...updates };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        try {
          window.localStorage.setItem(`${PREFIX}${tableId}`, JSON.stringify(next));
        } catch {
          /* quota or private mode — the table still works, it just does not remember. */
        }
      }, DEBOUNCE_MS);
      return next;
    });
  }

  function reset() {
    if (timer.current) clearTimeout(timer.current);
    setState(defaults);
    try {
      window.localStorage.removeItem(`${PREFIX}${tableId}`);
    } catch {
      /* ignore */
    }
  }

  return { state, persist, reset, isLoaded };
}
