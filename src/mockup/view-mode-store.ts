import { create } from 'zustand'

/**
 * Modo de vista del proyecto:
 *  - `web`    → una pantalla a viewport completo, como cualquier web.
 *  - `mockup` → los tableros apilados con marco fijo, para capturar a Figma (html.to.design).
 *
 * Vive en localStorage y NO en la URL. Dos razones:
 *  1. Un query param se pierde en cada `navigate()`, así que navegar por el sidebar te devolvía al
 *     otro modo.
 *  2. Es una preferencia de quien mira, no parte de la identidad de la pantalla. La URL identifica
 *     QUÉ se ve; el modo es CÓMO se ve.
 *
 * Se lee localStorage sincrónico en vez de usar `zustand/persist`: ese middleware rehidrata async
 * (el storage de la plataforma es una Promise), y eso pintaría un frame en el modo equivocado.
 */
export type ViewMode = 'web' | 'mockup'

const STORAGE_KEY = 'mockups-web:view-mode'
const DEFAULT_MODE: ViewMode = 'mockup'

function isViewMode(value: unknown): value is ViewMode {
  return value === 'web' || value === 'mockup'
}

function readStored(): ViewMode | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return isViewMode(raw) ? raw : null
  } catch {
    // Storage bloqueado (modo privado): se cae al default en vez de explotar.
    return null
  }
}

function writeStored(mode: ViewMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Sin persistencia el modo igual funciona, solo no sobrevive el reload.
  }
}

interface ViewModeState {
  mode: ViewMode
  setMode: (mode: ViewMode) => void
  toggle: () => void
}

export const useViewModeStore = create<ViewModeState>()((set, get) => ({
  mode: readStored() ?? DEFAULT_MODE,
  setMode: (mode) => {
    writeStored(mode)
    set({ mode })
  },
  toggle: () => get().setMode(get().mode === 'web' ? 'mockup' : 'web'),
}))

/**
 * `?view=web|mockup` es una SEMILLA de un solo uso: fija el modo y se saca de la URL. Sirve para
 * compartir un link que abre directo en un modo, sin que el param quede compitiendo con el store
 * como fuente de verdad (si se quedara, un reload pisaría lo que el usuario eligió con el toggle).
 *
 * Llamar en el entry ANTES de montar el router: toca el history a mano, y una vez montado el router
 * eso lo desincronizaría.
 */
export function seedViewModeFromUrl(): void {
  const params = new URLSearchParams(window.location.search)
  const requested = params.get('view')
  if (!isViewMode(requested)) return

  useViewModeStore.getState().setMode(requested)

  params.delete('view')
  const qs = params.toString()
  window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
}
