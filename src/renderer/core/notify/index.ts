import { toast } from 'sonner'

const NOTIFY_TYPE = { SUCCESS: 'success', ERROR: 'error', WARNING: 'warning', INFO: 'info' } as const
export type NotifyType = (typeof NOTIFY_TYPE)[keyof typeof NOTIFY_TYPE]

export interface NotifyOptions {
  type?: NotifyType
  description?: string
  duration?: number
}

export function notify(message: string, options: NotifyOptions = {}) {
  const { type = 'info', description, duration } = options
  const config = { description, duration }

  switch (type) {
    case 'success': toast.success(message, config); break
    case 'error':   toast.error(message, config);   break
    case 'warning': toast.warning(message, config); break
    default:        toast.info(message, config);    break
  }
}
