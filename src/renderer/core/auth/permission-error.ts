import { i18n } from '@/core/i18n'
import { AppError } from '@/core/http/error'

/**
 * Humaniza los errores 403 de permisos granulares (code `PERMISSION_REQUIRED`).
 *
 * El API devuelve un mensaje técnico en inglés (`Permission "caja:cerrar" required`); acá lo
 * reescribimos UNA sola vez en el cliente HTTP a un texto claro y localizado, usando el TÍTULO
 * humano del catálogo de permisos (ej. `caja:cerrar` → "Cerrar caja").
 *
 * El resolver de títulos se INYECTA desde el bootstrap (loader de plugins) para no acoplar el
 * cliente HTTP al pluginHost (evita un ciclo de imports: host → http/client → ...).
 */

type PermissionTitleResolver = (permission: string) => string | undefined

let titleResolver: PermissionTitleResolver = () => undefined

/** Registra cómo resolver `permission → título humano` (catálogo de plugins). Se llama en bootstrap. */
export function setPermissionTitleResolver(fn: PermissionTitleResolver): void {
  titleResolver = fn
}

/**
 * Si el error es un `PERMISSION_REQUIRED`, devuelve un AppError con mensaje humano y localizado.
 * Para cualquier otro error, lo devuelve sin tocar.
 */
export function humanizePermissionError(error: AppError): AppError {
  if (error.code !== 'PERMISSION_REQUIRED') return error
  const perm = error.permission
  const label = (perm && titleResolver(perm)) || perm
  const message = i18n.t('error.permissionRequired', {
    permission: label,
    defaultValue: 'No tenés permiso para «{{permission}}». Pedíselo a un administrador.',
  })
  return new AppError(message, { status: error.status, code: error.code, permission: perm })
}
