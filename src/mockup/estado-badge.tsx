import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { EstadoCamion, EstadoOrden } from './mock-data'

// Verde = operativo (usa el color de marca), ámbar = fuera de servicio.
const ESTADO: Record<EstadoCamion, { label: string; className: string }> = {
  disponible: {
    label: 'Disponible',
    className: 'border-primary/30 bg-primary/10 text-primary',
  },
  mantenimiento: {
    label: 'Mantenimiento',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  provincia: {
    label: 'Provincia',
    className: 'border-primary/30 bg-primary/10 text-primary',
  },
  sinchofer: {
    label: 'sinchofer',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
}

export function CamionEstadoBadge({ estado }: { estado: EstadoCamion }) {
  const { label, className } = ESTADO[estado]
  return (
    <Badge variant="outline" className={cn('rounded-full font-medium', className)}>
      {label}
    </Badge>
  )
}

// Estados de una orden de despacho: gris = pendiente, ámbar = cargando, marca = despachada.
const ESTADO_ORDEN: Record<EstadoOrden, { label: string; className: string }> = {
  pendiente: { label: 'Pendiente', className: 'border-border bg-muted text-muted-foreground' },
  cargando: { label: 'Cargando', className: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  despachada: { label: 'Despachada', className: 'border-primary/30 bg-primary/10 text-primary' },
  procesado: { label: 'Procesado', className: 'border-primary/30 bg-primary/10 text-primary' },
}

export function OrdenEstadoBadge({ estado }: { estado: EstadoOrden }) {
  const { label, className } = ESTADO_ORDEN[estado]
  return (
    <Badge variant="outline" className={cn('rounded-full font-medium', className)}>
      {label}
    </Badge>
  )
}
