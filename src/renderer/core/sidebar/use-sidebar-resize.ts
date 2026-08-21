import { useCallback, useState } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { persistedStorage } from '@/lib/storage/zustand-storage'
import { StorageKeys } from '@/lib/storage/keys'

export const SIDEBAR_WIDTH_DEFAULT = 260
export const SIDEBAR_WIDTH_MIN = 220
export const SIDEBAR_WIDTH_MAX = 360
export const SIDEBAR_ICON_THRESHOLD = 72

interface SidebarWidthState {
  width: number
  isOpen: boolean
  lastFullWidth: number
  setWidth: (w: number) => void
  setOpen: (open: boolean) => void
  toggle: () => void
  close: () => void
  open: () => void
}

export const useSidebarWidthStore = create<SidebarWidthState>()(
  persist(
    (set, get) => ({
      width: SIDEBAR_WIDTH_DEFAULT,
      isOpen: false,
      lastFullWidth: SIDEBAR_WIDTH_DEFAULT,
      setWidth: (width) => {
        const isExpanding = width >= SIDEBAR_WIDTH_MIN
        set({ width, ...(isExpanding && { lastFullWidth: width }) })
      },
      setOpen: (isOpen) => set({ isOpen }),
      toggle: () => {
        set((s) => ({ isOpen: !s.isOpen }))
      },
      close: () => set({ isOpen: false }),
      open: () => set({ isOpen: true }),
    }),
    {
      name: StorageKeys.sidebar.width,
      storage: createJSONStorage(() => persistedStorage),
      merge: (persistedState, currentState) => {
        const state = persistedState as Partial<SidebarWidthState> | undefined
        if (!state) return currentState
        const width =
          typeof state.width === 'number' && state.width >= SIDEBAR_WIDTH_MIN
            ? state.width
            : SIDEBAR_WIDTH_DEFAULT
        return {
          ...currentState,
          ...state,
          width,
          lastFullWidth: width,
        }
      },
    }
  )
)

export function useSidebarResize() {
  const [isResizing, setIsResizing] = useState(false)
  const setWidth = useSidebarWidthStore((s) => s.setWidth)

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = useSidebarWidthStore.getState().width

      setIsResizing(true)
      document.body.setAttribute('data-resizing', 'true')
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      const onMove = (ev: MouseEvent) => {
        const next = Math.min(
          SIDEBAR_WIDTH_MAX,
          Math.max(SIDEBAR_WIDTH_MIN, startWidth + (ev.clientX - startX))
        )
        setWidth(next)
      }

      const onUp = () => {
        setIsResizing(false)
        document.body.removeAttribute('data-resizing')
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [setWidth]
  )

  return { isResizing, startDrag }
}
