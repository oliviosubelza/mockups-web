import { useCallback, useState } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { electronTabStorage } from '@/lib/storage/tab-storage'
import { StorageKeys } from '@/lib/storage/keys'

export const SIDEBAR_WIDTH_DEFAULT = 240
export const SIDEBAR_WIDTH_MIN = 48
export const SIDEBAR_WIDTH_MAX = SIDEBAR_WIDTH_DEFAULT
export const SIDEBAR_ICON_THRESHOLD = 72

interface SidebarWidthState {
  width: number
  lastFullWidth: number
  setWidth: (w: number) => void
  toggle: () => void
}

export const useSidebarWidthStore = create<SidebarWidthState>()(
  persist(
    (set, get) => ({
      width: SIDEBAR_WIDTH_DEFAULT,
      lastFullWidth: SIDEBAR_WIDTH_DEFAULT,
      setWidth: (width) => {
        const isExpanding = width >= SIDEBAR_ICON_THRESHOLD
        set({ width, ...(isExpanding && { lastFullWidth: width }) })
      },
      toggle: () => {
        const { width, lastFullWidth } = get()
        if (width >= SIDEBAR_ICON_THRESHOLD) {
          set({ width: SIDEBAR_WIDTH_MIN })
        } else {
          set({ width: lastFullWidth })
        }
      },
    }),
    {
      name: StorageKeys.sidebar.width,
      storage: createJSONStorage(() => electronTabStorage),
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
