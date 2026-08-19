// Cartel de ruta deprecada. Una pantalla que se retira no se borra de un día para el otro: primero
// se marca, se corta el acceso desde la UI y se deja este cartel para el que llegue por un link
// viejo o un favorito. El destino de reemplazo es un botón, no una explicación.
import { useEffect } from 'react'
import { ArrowRight, Archive } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { openRoute } from '@/core/routing/open-route'

export function DeprecatedScreen({
  titulo,
  motivo,
  reemplazoRouteId,
  reemplazoLabel,
  /** Manda solo al reemplazo sin mostrar el cartel. Para rutas que ya no tienen nada que enseñar. */
  redirigir = false,
  onAntesDeIr,
}: {
  titulo: string
  motivo: string
  reemplazoRouteId: string
  reemplazoLabel: string
  redirigir?: boolean
  onAntesDeIr?: () => void
}) {
  useEffect(() => {
    if (!redirigir) return
    onAntesDeIr?.()
    openRoute(reemplazoRouteId)
    // `onAntesDeIr` es un closure nuevo en cada render del caller: incluirlo redirige en loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redirigir, reemplazoRouteId])

  const ir = () => {
    onAntesDeIr?.()
    openRoute(reemplazoRouteId)
  }

  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Archive />
        </EmptyMedia>
        <EmptyTitle>{titulo}</EmptyTitle>
        <EmptyDescription>{motivo}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={ir}>
          {reemplazoLabel}
          <ArrowRight size={14} className="ml-1.5" />
        </Button>
      </EmptyContent>
    </Empty>
  )
}
