import { toast } from 'sonner'

const NOTIFY_TYPE = { SUCCESS: 'success', ERROR: 'error', WARNING: 'warning', INFO: 'info' } as const
export type NotifyType = (typeof NOTIFY_TYPE)[keyof typeof NOTIFY_TYPE]

export interface NotifyOptions {
  type?: NotifyType
  description?: string
  duration?: number
  /**
   * Id estable del aviso. Sonner REEMPLAZA el toast que ya tenga este id en vez de apilar otro, así que
   * sirve para dos cosas: que el mismo evento no se muestre dos veces (si se dispara de dos lugares o si
   * StrictMode ejecuta el efecto dos veces) y para actualizar un aviso en curso.
   */
  id?: string
  /** Acción del toast (ej. "Ver en el mapa"). Sin esto, un aviso solo se puede leer y descartar. */
  action?: { label: string; onClick: () => void }
}

export function notify(message: string, options: NotifyOptions = {}) {
  const { type = 'info', description, duration, id, action } = options
  const config = { description, duration, id, action }

  switch (type) {
    case 'success': toast.success(message, config); break
    case 'error':   toast.error(message, config);   break
    case 'warning': toast.warning(message, config); break
    default:        toast.info(message, config);    break
  }
}
