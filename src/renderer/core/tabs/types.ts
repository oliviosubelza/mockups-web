import type { LucideIcon } from 'lucide-react'

export interface TabInstance {
  id: string
  routeId: string
  path: string
  title: string
  icon?: LucideIcon
  isPinned: boolean
  isClosable: boolean
  openedAt: number
  metadata?: Record<string, unknown>
}
