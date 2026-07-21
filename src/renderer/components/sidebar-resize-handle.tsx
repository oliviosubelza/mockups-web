import { cn } from '@/lib/utils'
import { useSidebarResize } from '@/core/sidebar/use-sidebar-resize'

export function SidebarResizeHandle() {
  const { isResizing, startDrag } = useSidebarResize()

  return (
    <div
      onMouseDown={startDrag}
      className={cn(
        'w-1 shrink-0 cursor-col-resize z-10 transition-colors duration-150',
        'bg-transparent hover:bg-primary/40',
        isResizing && 'bg-primary/50'
      )}
    />
  )
}
