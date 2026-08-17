// Acciones del plan: los dos botones que hacen avanzar el plan, dentro de la barra superior.
//
// Quedó reducido a las DOS ACCIONES. La cobertura (peso y volumen contra la
// capacidad elegida) se mudó a `PlannerMetricas`, en la columna izquierda: ahí hay ancho para mostrar
// disponible, necesario y saldo con su barra, que es la comparación completa. Acá esos tres datos
// entraban solo comprimidos a un saldo suelto, con los operandos escondidos en un tooltip.
//
// Lo que queda es lo que TIENE que estar en el centro y siempre a mano: el disparador. Una barra de
// dos botones no compite con el mapa y no cambia de alto ni de ancho según lo que haya abierto.
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function PlannerHud({
  camionesElegidos,
  paradas,
  paradasSinAsignar = 0,
  hayDeficit,
  optimizado,
  optimizando,
  onOptimizar,
  onGenerar,
}: {
  /** No se dibujan: alimentan el gate de los botones y los mensajes de por qué están bloqueados. */
  camionesElegidos: number
  paradas: number
  paradasSinAsignar?: number
  /** Lo necesario supera a lo disponible en peso o en volumen. Lo calcula la vista, no esta barra. */
  hayDeficit: boolean
  optimizado: boolean
  optimizando: boolean
  onOptimizar: () => void
  onGenerar: () => void
}) {
  const puedeOptimizar = camionesElegidos > 0 && paradas > 0 && !optimizando

  // El gate es el mismo del flujo actual: sin camión, sin paradas, con paradas sin asignar o con déficit,
  // generar rutas produciría un plan incompleto o inviable. El `title` dice por qué está bloqueado.
  const motivoBloqueo = !optimizado
    ? 'Primero optimizá el reparto'
    : camionesElegidos === 0
      ? 'Elegí al menos un camión'
      : paradas === 0
        ? 'No hay paradas para planificar'
        : paradasSinAsignar > 0
          ? `${paradasSinAsignar} punto${paradasSinAsignar !== 1 ? 's' : ''} de entrega sin asignar a una ruta`
          : hayDeficit
            ? 'Capacidad excedida: la carga supera lo disponible'
            : undefined

  return (
    // Fragmento, NO una tarjeta propia: estos dos botones viven adentro de la barra superior, al lado
    // del selector de panel. Si trajeran su propio borde y su propia sombra, la barra se vería como dos
    // pastillas pegadas en vez de como un solo control.
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1.5 px-2.5 text-xs"
        onClick={onOptimizar}
        disabled={!puedeOptimizar}
        title={
          camionesElegidos === 0
            ? 'Elegí al menos un camión'
            : paradas === 0
              ? 'No hay paradas para repartir'
              : paradasSinAsignar > 0
                ? `Repartir ${paradasSinAsignar} punto${paradasSinAsignar !== 1 ? 's' : ''} de entrega sin asignar`
                : optimizado
                  ? 'Volver a repartir las paradas entre los camiones elegidos'
                  : 'Repartir las paradas entre los camiones elegidos'
        }
      >
        {optimizando ? (
          <>
            <Loader2 size={12} className="animate-spin" />
            Optimizando…
          </>
        ) : optimizado ? (
          'Reoptimizar'
        ) : (
          'Optimizar'
        )}
      </Button>
      <Button
        size="sm"
        className="h-7 px-2.5 text-xs"
        disabled={motivoBloqueo !== undefined}
        title={motivoBloqueo}
        onClick={onGenerar}
      >
        Generar rutas
      </Button>
    </>
  )
}
