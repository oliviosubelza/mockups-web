export const UserRole = {
  ADMIN: 'ADMIN',
  USER: 'USER',
} as const

export type UserRole = (typeof UserRole)[keyof typeof UserRole]

export interface User {
  id: string
  username: string
  role: UserRole
  tenantId: string
  branchId: string | null
  isActive?: boolean
}

export interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
}
