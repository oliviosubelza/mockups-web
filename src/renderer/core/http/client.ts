import axios from 'axios'
import { AxiosInterceptorManager } from 'sdk-simple-auth'
import { authSDK } from '@/core/auth/sdk'
import { toAppError } from '@/core/http/error'
import { humanizePermissionError } from '@/core/auth/permission-error'
import { i18n } from '@/core/i18n'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '',
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
})

const interceptorManager = new AxiosInterceptorManager(api, {
  getAccessToken: () => authSDK.getValidAccessToken(),
  onSessionInvalid: () => authSDK.logout(),
  onTokenRefresh: async () => { await authSDK.refreshTokens() },
})
interceptorManager.setup()

// Forward current UI language so the backend returns messages in the right locale
api.interceptors.request.use((config) => {
  config.headers['Accept-Language'] = i18n.language ?? 'es'
  return config
})

// Normalize API errors into AppError so callers always get { message, status, code }.
// Permission 403s are rewritten to a friendly, localized message (humanizePermissionError).
api.interceptors.response.use(
  (res) => res,
  (error) => Promise.reject(humanizePermissionError(toAppError(error))),
)
