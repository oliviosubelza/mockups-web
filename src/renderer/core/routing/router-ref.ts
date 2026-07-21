import type { NavigateFunction } from 'react-router'

let _navigate: NavigateFunction | null = null

export const routerRef = {
  set(fn: NavigateFunction) { _navigate = fn },
  navigate(to: string) { _navigate?.(to) },
}
