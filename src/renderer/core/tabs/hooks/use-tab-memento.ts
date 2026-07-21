import { useEffect, useRef, useState } from 'react'
import { useTabContext } from './use-tab-context'
import { useMementoStore } from '../store/memento-store'

/**
 * useState que sobrevive al desmontaje de la tab (§7): si la vista se desmonta (evicción LRU
 * o keepAlive:false), el último valor se guarda como memento y se restaura al remontar.
 * El valor debe ser serializable. `key` distingue varios mementos dentro de la misma vista.
 *
 *   const [draft, setDraft] = useTabMemento('draft', { name: '' })
 */
export function useTabMemento<T>(key: string, initial: T | (() => T)): [T, (value: T) => void] {
  const { tabId } = useTabContext()
  const [value, setValue] = useState<T>(() => {
    const saved = useMementoStore.getState().get<T>(tabId, key)
    if (saved !== undefined) return saved
    return typeof initial === 'function' ? (initial as () => T)() : initial
  })

  const latest = useRef(value)
  latest.current = value

  useEffect(() => {
    return () => {
      useMementoStore.getState().save(tabId, key, latest.current)
    }
  }, [tabId, key])

  return [value, setValue]
}
