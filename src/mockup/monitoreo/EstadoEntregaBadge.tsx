// Badges del monitoreo. Leen su estilo de `monitoreo-estado` — el MISMO mapa del que sale el color
// del pin en el mapa. Es lo que hace que la lista y el mapa hablen el mismo idioma: si acá se
// escribieran las clases a mano, a la primera corrección de color las dos pantallas se separan.
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { ESTADO_ENTREGA, ESTADO_VIAJE, type EstadoEntrega, type EstadoViaje } from './monitoreo-estado'

export function EstadoEntregaBadge({ estado, className }: { estado: EstadoEntrega; className?: string }) {
  const meta = ESTADO_ENTREGA[estado]
  return (
    <Badge variant="outline" className={cn('gap-1 rounded-full font-medium', meta.badge, className)}>
      {meta.simbolo && <span aria-hidden>{meta.simbolo}</span>}
      {meta.label}
    </Badge>
  )
}

export function EstadoViajeBadge({ estado }: { estado: EstadoViaje }) {
  const meta = ESTADO_VIAJE[estado]
  return (
    <Badge variant="outline" className={cn('rounded-full font-medium', meta.badge)}>
      {meta.label}
    </Badge>
  )
}
