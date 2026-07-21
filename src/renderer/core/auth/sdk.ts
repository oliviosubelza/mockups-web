import { AuthSDK } from 'sdk-simple-auth'
import { i18n } from '@/core/i18n'

const BASE_URL = import.meta.env.VITE_API_URL ?? ''

// Custom httpClient so the SDK sends Accept-Language on every request (including login),
// matching the language selected in the UI. The default SDK client uses bare fetch without headers.
const sdkHttpClient = {
  async post(url: string, data: unknown, options?: { headers?: Record<string, string> }) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': i18n.language ?? 'es',
        ...options?.headers,
      },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: `HTTP ${response.status}` }))
      throw new Error(body.message || `Request failed with status ${response.status}`)
    }
    const text = await response.text()
    return text ? JSON.parse(text) : null
  },

  async get(url: string, options?: { headers?: Record<string, string> }) {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': i18n.language ?? 'es',
        ...options?.headers,
      },
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: `HTTP ${response.status}` }))
      throw new Error(body.message || `Request failed with status ${response.status}`)
    }
    const text = await response.text()
    return text ? JSON.parse(text) : null
  },

  async put(url: string, data: unknown, options?: { headers?: Record<string, string> }) {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': i18n.language ?? 'es',
        ...options?.headers,
      },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: `HTTP ${response.status}` }))
      throw new Error(body.message || `Request failed with status ${response.status}`)
    }
    const text = await response.text()
    return text ? JSON.parse(text) : null
  },

  async delete(url: string, options?: { headers?: Record<string, string> }) {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': i18n.language ?? 'es',
        ...options?.headers,
      },
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: `HTTP ${response.status}` }))
      throw new Error(body.message || `Request failed with status ${response.status}`)
    }
    const text = await response.text()
    return text ? JSON.parse(text) : null
  },
}

export const authSDK = new AuthSDK({
  authServiceUrl: BASE_URL,
  endpoints: {
    login: '/api/v1/auth/login',
    logout: '/api/v1/auth/logout',
    refresh: '/api/v1/auth/refresh',
  },
  httpClient: sdkHttpClient,
  backend: {
    type: 'node-express',
    userSearchPaths: ['data', ''],
    fieldMappings: {
      userId: ['id'],
      name: ['username'],
      email: ['username'],
    },
  },
  storage: { type: 'localStorage' },
  tokenRefresh: { enabled: true, bufferTime: 60 },
})
