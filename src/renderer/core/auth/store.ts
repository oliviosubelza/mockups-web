import { create } from 'zustand'
import { authSDK } from './sdk'
import { api } from '@/core/http/client'
import { eventBus } from '@/core/events/event-bus'
import { contextKeyService } from '@/core/context/context-key-service'
import { entitlementsService } from '@/core/entitlements/service'
import { enablementService } from '@/core/enablement'
import { permissionsService } from './permissions-service'
import type { User, AuthState, UserRole } from './types'

// Context key para los `when` declarativos (menús/keybindings): refleja la sesión.
contextKeyService.setContext('session.isAuthenticated', false)

interface LoginParams {
  username: string
  password: string
  slug?: string
}

interface AuthStore extends AuthState {
  _sync: (user: User | null, isAuthenticated: boolean, isLoading: boolean) => void
  login: (params: LoginParams) => Promise<void>
  logout: () => Promise<void>
  hasPermission: (permission: string) => boolean
  hasRole: (role: UserRole) => boolean
}

export const useAuthStore = create<AuthStore>()((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,

  _sync: (user, isAuthenticated, isLoading) =>
    set({ user, isAuthenticated, isLoading, token: null }),

  login: async ({ username, password, slug }) => {
    set({ isLoading: true })
    await authSDK.login({ username, password, slug })
  },

  logout: async () => {
    try {
      await api.post('/api/v1/auth/logout')
    } catch {
      // Server invalidation failed — proceed with local cleanup anyway
    }
    await authSDK.clearLocalSession()
  },

  hasPermission: (permission) => {
    if (!get().user) return false
    return permissionsService.has(permission)
  },

  hasRole: (role) => get().user?.role === role,
}))

// Sync SDK state → Zustand store + emit auth events + reflejar entitlements (§9):
// el backend los deriva de la Subscription del tenant y los responde en /auth/me.
authSDK.onAuthStateChanged(async (state) => {
  const prev = useAuthStore.getState()

  useAuthStore.getState()._sync(state.user as User | null, state.isAuthenticated, state.loading ?? false)
  contextKeyService.setContext('session.isAuthenticated', state.isAuthenticated)

  if (!prev.isAuthenticated && state.isAuthenticated) {
    try {
      const { data } = await api.get<
        User & { entitlements?: string[]; disabledPlugins?: string[]; recommendedPreset?: string | null; permissions?: string[] }
      >('/api/v1/auth/me')
      useAuthStore.getState()._sync(data, true, false)
      entitlementsService.replace(data.entitlements ?? [])
      // Eje Enabled: hidratar el conjunto deshabilitado per-tenant + el preset recomendado.
      enablementService.hydrate(data.disabledPlugins ?? [], data.recommendedPreset ?? null)
      // Permisos granulares (Stage 2): hidrata el set de permisos efectivos del usuario.
      permissionsService.replace(data.permissions ?? [])
      eventBus.emit('auth.session.started', { userId: data.id })
    } catch {
      eventBus.emit('auth.session.started', { userId: (state.user as User | null)?.id ?? '' })
    }
  }

  if (prev.isAuthenticated && !state.isAuthenticated) {
    entitlementsService.clear()
    enablementService.clear()
    permissionsService.clear()
    eventBus.emit('auth.session.ended')
  }
})
