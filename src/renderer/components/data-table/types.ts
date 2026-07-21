// Tipos públicos de DataTable: fuente única de verdad en @keel/plugin-sdk (un plugin importa
// de ahí; el workbench los re-exporta para sus componentes internos). Acá queda solo lo INTERNO
// del workbench (estado persistido, que usa tipos de @tanstack/react-table).
import type { ColumnPinningState, ColumnSizingState, SortingState, VisibilityState } from '@tanstack/react-table'
import type { DensityMode } from '@keel/plugin-sdk'

export type {
  DataTableProps,
  ColumnDefConfig,
  RowAction,
  BulkAction,
  ServerPagination,
  DensityMode,
  ColumnMeta,
} from '@keel/plugin-sdk'
export { DENSITY } from '@keel/plugin-sdk'

export interface PersistedTableState {
  columnOrder: string[]
  columnSizing: ColumnSizingState
  columnVisibility: VisibilityState
  columnPinning: ColumnPinningState
  sorting: SortingState
  density: DensityMode
  pageSize: number
}
