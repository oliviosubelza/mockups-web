import type { ColumnDefConfig } from "./types";

/** Identity helper: declares columns with type inference over the row. */
export function defineColumns<T extends object>(columns: ColumnDefConfig<T>[]): ColumnDefConfig<T>[] {
  return columns;
}
