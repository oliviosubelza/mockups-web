import { memo, useState } from 'react'
import type { CSSProperties, FC, MouseEvent } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToHorizontalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import { horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { RouteRegistry } from '@/core/routing/route-registry'
import { useTabStore, useTabsSettingsStore } from '../store/tab-store'
import type { TabInstance } from '../types'
import Tab from './Tab'

interface TabBarProps {
  className?: string
}

const TabBar: FC<TabBarProps> = ({ className }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const allowCloseLastTab = useTabsSettingsStore((s) => s.allowCloseLastTab)
  const setActiveTab = useTabStore((s) => s.setActiveTab)
  const removeTab = useTabStore((s) => s.removeTab)
  const reorderTabs = useTabStore((s) => s.reorderTabs)
  const closeOtherTabs = useTabStore((s) => s.closeOtherTabs)
  const closeAllTabs = useTabStore((s) => s.closeAllTabs)
  const closeTabsToRight = useTabStore((s) => s.closeTabsToRight)
  const pinTab = useTabStore((s) => s.pinTab)
  const unpinTab = useTabStore((s) => s.unpinTab)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const from = tabs.findIndex((t) => t.id === active.id)
      const to = tabs.findIndex((t) => t.id === over.id)
      if (from !== -1 && to !== -1) reorderTabs(from, to)
    }
  }

  const handleTabClick = (tab: TabInstance) => {
    setActiveTab(tab.id)
    navigate(tab.path)
  }

  const handleCloseTab = (e: MouseEvent, tabId: string) => {
    e.stopPropagation()
    const wasActive = useTabStore.getState().activeTabId === tabId
    removeTab(tabId)
    if (wasActive) {
      const { activeTabId: nextId, tabs: nextTabs } = useTabStore.getState()
      if (nextId) {
        const next = nextTabs.find((t) => t.id === nextId)
        if (next) navigate(next.path)
      } else {
        navigate('/')
      }
    }
  }

  if (tabs.length === 0) {
    return (
      <div className={cn('flex items-center h-full px-3', className)}>
        <span className="text-xs text-muted-foreground">{t('tabs.noTabsOpen')}</span>
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToHorizontalAxis, restrictToParentElement]}
    >
      <div
        role="tablist"
        aria-label="Open tabs"
        className={cn('flex items-center bg-background w-full h-full', className)}
      >
        <div className="flex-1 overflow-hidden min-w-0">
          <ScrollArea className="w-max max-w-full">
            <SortableContext items={tabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
              <div className="flex items-center gap-1 px-2 py-1">
                {tabs.map((tab) => (
                  <Tab
                    key={tab.id}
                    tab={tab}
                    isActive={tab.id === activeTabId}
                    isLastTab={tabs.length === 1 && !allowCloseLastTab}
                    onTabClick={handleTabClick}
                    onCloseTab={handleCloseTab}
                    onCloseOthers={closeOtherTabs}
                    onCloseAll={closeAllTabs}
                    onCloseToRight={closeTabsToRight}
                    onPin={pinTab}
                    onUnpin={unpinTab}
                  />
                ))}
              </div>
            </SortableContext>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>

        <div className="flex-shrink-0 px-2 h-full flex items-center" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
          <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
            <DropdownMenuTrigger className="flex items-center justify-center size-7 rounded-md hover:bg-accent transition-colors">
              <ChevronDown className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 max-h-96 overflow-y-auto">
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                {t('tabs.openTabs', { count: tabs.length })}
              </div>
              <DropdownMenuSeparator />
              {tabs.map((tab) => {
                const TabIcon = tab.icon ?? RouteRegistry.getRoute(tab.routeId)?.icon
                return (
                  <DropdownMenuItem
                    key={tab.id}
                    onClick={() => handleTabClick(tab)}
                    className={cn(
                      'flex items-center gap-2 cursor-pointer',
                      tab.id === activeTabId && 'bg-primary/10 text-primary'
                    )}
                  >
                    {TabIcon && <TabIcon className="size-3 flex-shrink-0" />}
                    <span className="flex-1 truncate text-xs">{tab.title}</span>
                    {tab.id === activeTabId && <Check className="size-3 text-primary flex-shrink-0" />}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </DndContext>
  )
}

export default memo(TabBar)
