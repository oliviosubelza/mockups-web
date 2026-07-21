import { useState, useEffect, useRef } from 'react'
import { storage } from '@/lib/storage/adapter'
import type { PersistedTableState, DensityMode } from './types'

const PREFIX = 'data-table:'
const DEBOUNCE_MS = 400

const DEFAULTS: PersistedTableState = {
  columnOrder: [],
  columnSizing: {},
  columnVisibility: {},
  columnPinning: { left: [], right: [] },
  sorting: [],
  density: 'normal',
  pageSize: 20,
}

export function useTableState(tableId: string, defaultDensity?: DensityMode, defaultPageSize?: number) {
  const defaults: PersistedTableState = {
    ...DEFAULTS,
    density: defaultDensity ?? DEFAULTS.density,
    pageSize: defaultPageSize ?? DEFAULTS.pageSize,
  }

  const [state, setState] = useState<PersistedTableState>(defaults)
  const [isLoaded, setIsLoaded] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestState = useRef(state)
  latestState.current = state

  useEffect(() => {
    storage.get<PersistedTableState>(`${PREFIX}${tableId}`)
      .then((saved) => {
        if (saved) setState({ ...defaults, ...saved })
      })
      .catch(() => {})
      .finally(() => setIsLoaded(true))
  }, [tableId])

  function persist(updates: Partial<PersistedTableState>) {
    setState((prev) => {
      const next = { ...prev, ...updates }
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        storage.set(`${PREFIX}${tableId}`, next).catch(() => {})
      }, DEBOUNCE_MS)
      return next
    })
  }

  function reset() {
    if (timer.current) clearTimeout(timer.current)
    setState(defaults)
    storage.delete(`${PREFIX}${tableId}`).catch(() => {})
  }

  return { state, persist, reset, isLoaded }
}
