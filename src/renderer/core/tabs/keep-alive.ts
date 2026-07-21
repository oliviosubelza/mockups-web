import { TABS_CONFIG } from './config'

export interface MountableTab {
  id: string
  /** Última activación (el store lo actualiza en setActiveTab) — es el criterio LRU. */
  openedAt: number
  keepAlive: boolean
}

/**
 * Estrategia híbrida del §7: qué tabs quedan MONTADAS (vivas en el DOM, ocultas con CSS).
 *  - La activa siempre.
 *  - Las keep-alive más recientemente usadas hasta el cap LRU; el resto se desmonta
 *    (su estado sobrevive via memento, ver memento-store).
 *  - keepAlive=false nunca retiene: se monta solo mientras está activa.
 */
export function computeMountedTabIds(
  tabs: readonly MountableTab[],
  activeTabId: string | null,
  cap: number = TABS_CONFIG.MAX_MOUNTED_TABS
): Set<string> {
  const mounted = new Set<string>()
  if (activeTabId && tabs.some((t) => t.id === activeTabId)) {
    mounted.add(activeTabId)
  }
  const candidates = tabs
    .filter((t) => t.keepAlive && t.id !== activeTabId)
    .sort((a, b) => b.openedAt - a.openedAt)
  for (const tab of candidates) {
    if (mounted.size >= cap) break
    mounted.add(tab.id)
  }
  return mounted
}
