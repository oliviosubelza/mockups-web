import axios from 'axios'

/**
 * Error normalizado de la API. Es una subclase REAL de `Error` (no un objeto plano): así los
 * consumidores —incluidos los plugins, que solo ven `unknown` en su catch— pueden hacer
 * `e instanceof Error ? e.message : String(e)` y obtener el mensaje del backend en vez de
 * `"[object Object]"`.
 */
export class AppError extends Error {
  status?: number
  code?: string
  /** Clave del permiso faltante cuando `code === 'PERMISSION_REQUIRED'` (del body del API). */
  permission?: string
  constructor(
    message: string,
    opts?: { status?: number; code?: string; permission?: string },
  ) {
    super(message)
    this.name = 'AppError'
    this.status = opts?.status
    this.code = opts?.code
    this.permission = opts?.permission
  }
}

export function extractApiMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data
    if (typeof data === 'string' && data.length > 0) return data
    if (data?.message) return String(data.message)
    if (data?.error) return String(data.error)
    if (data?.detail) return String(data.detail)
    return error.message
  }
  if (error instanceof Error) return error.message
  // El interceptor del cliente convierte AxiosError → AppError (objeto plano { message, status })
  // antes de que llegue al catch del consumidor — manejar ese caso explícitamente
  const asObj = error as Record<string, unknown>
  if (typeof asObj?.message === 'string' && asObj.message) return asObj.message
  return 'Error desconocido'
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error
  if (axios.isAxiosError(error)) {
    // Body normalizado del API: { message, error: { code, statusCode, details } }
    const body = error.response?.data as
      | { error?: { code?: string; details?: { permission?: string } } }
      | undefined
    return new AppError(extractApiMessage(error), {
      status: error.response?.status,
      code: body?.error?.code ?? error.code,
      permission: body?.error?.details?.permission,
    })
  }
  if (error instanceof Error) {
    return new AppError(error.message)
  }
  return new AppError('Error desconocido')
}
