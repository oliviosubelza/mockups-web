import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { electronTabStorage } from '@/lib/storage/tab-storage'
import { StorageKeys } from '@/lib/storage/keys'

export const FONT_SIZE = { MIN: 12, MAX: 18, DEFAULT: 14, OPTIONS: [12, 13, 14, 15, 16, 17, 18] } as const
export const SIDEBAR_ICON_SIZE = { MIN: 12, MAX: 20, DEFAULT: 16, OPTIONS: [12, 14, 16, 18, 20] } as const
export const TABBAR_ICON_SIZE = { MIN: 10, MAX: 16, DEFAULT: 12, OPTIONS: [10, 12, 14, 16] } as const

interface AppearanceState {
  fontSize: number
  sidebarIconSize: number
  tabbarIconSize: number
  setFontSize: (v: number) => void
  setSidebarIconSize: (v: number) => void
  setTabbarIconSize: (v: number) => void
}

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      fontSize: FONT_SIZE.DEFAULT,
      sidebarIconSize: SIDEBAR_ICON_SIZE.DEFAULT,
      tabbarIconSize: TABBAR_ICON_SIZE.DEFAULT,
      setFontSize: (fontSize) => set({ fontSize }),
      setSidebarIconSize: (sidebarIconSize) => set({ sidebarIconSize }),
      setTabbarIconSize: (tabbarIconSize) => set({ tabbarIconSize }),
    }),
    {
      name: StorageKeys.appearance,
      storage: createJSONStorage(() => electronTabStorage),
      version: 2,
      migrate: () => ({
        fontSize: FONT_SIZE.DEFAULT,
        sidebarIconSize: SIDEBAR_ICON_SIZE.DEFAULT,
        tabbarIconSize: TABBAR_ICON_SIZE.DEFAULT,
      }),
    }
  )
)
