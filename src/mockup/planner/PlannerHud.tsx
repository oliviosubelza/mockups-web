// Acciones del plan: los dos botones que hacen avanzar el plan, dentro de la barra superior.
//
// Quedó reducido a las DOS ACCIONES. La cobertura (peso y volumen contra la
// capacidad elegida) se mudó a `PlannerMetricas`, en la columna izquierda: ahí hay ancho para mostrar
// disponible, necesario y saldo con su barra, que es la comparación completa. Acá esos tres datos
// entraban solo comprimidos a un saldo suelto, con los operandos escondidos en un tooltip.
//
// Lo que queda es lo que TIENE que estar en el centro y siempre a mano: el disparador. Una barra de
// dos botones no compite con el mapa y no cambia de alto ni de ancho según lo que haya abierto.
//
// …más UN dato, que entró después y no rompe la regla anterior: la FECHA del reparto. No es una tercera
// acción, es la etiqueta de las otras dos —contra qué día se optimiza y para qué día se generan las
// rutas—, y desde que el mapa filtra las restricciones por vigencia es también la única explicación de
// por qué una restricción temporal está o no está dibujada. Ver el bloque donde se muestra.
import { CalendarDays, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { momentoDelPlan } from '../restricciones/momento'

const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/**
 * `2026-08-25` → `martes 25 ago`.
 *
 * SE ARMA A MANO Y NO CON `toLocaleDateString`, por lo mismo que `diaSemanaDe` en `vigencia.ts`:
 * `new Date('2026-08-25')` parsea como UTC medianoche, así que en UTC-4 devuelve el día ANTERIOR en
 * hora local. Este texto explica por qué una restricción temporal se ve o no se ve; si dijera
 * "lunes 24" mientras el filtro evalúa el martes, sería peor que no mostrarlo.
 *
 * EL DÍA DE LA SEMANA VA COMPLETO y primero. El número de día no significa nada solo: las
 * restricciones que este HUD explica se cargan por DÍA DE LA SEMANA ("lunes y martes de 7 a 9"), así
 * que "martes" es la palabra que se compara contra la restricción, y "25 ago" es el respaldo.
 */
function fechaLegible(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dia = new Date(y, m - 1, d).getDay()
  return `${DIAS_LARGOS[dia]} ${d} ${MESES[m - 1]}`
}

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
      {/* LA FECHA DEL REPARTO, como texto y pegada a los dos botones que producen el plan.
          Es la deuda que dejó el filtro temporal del mapa: desde que las restricciones
          que no rigen no se dibujan, hay un mapa que cambia según un día que no estaba escrito en
          ninguna parte. Una zona que desaparece sin explicación se lee como un bug del mapa, no como
          una restricción que no aplica. Con la fecha a la vista, las dos preguntas se contestan solas.

          DICE "Reparto:" Y NO LA FECHA PELADA. El que mira la pantalla un lunes y lee "martes 25"
          necesita saber en un golpe de vista que eso es el día del CAMIÓN y no la fecha de hoy ni la de
          creación del plan. La palabra vale más que el ícono.

          NO ES UN CONTROL: no lleva selector, no es editable y no está deshabilitado —simplemente no
          hay nada que tocar—. La fecha de un plan nuevo es SIEMPRE el día siguiente y eso es una regla
          de negocio, no una preferencia: planificar es una actividad de víspera. El razonamiento largo,
          con lo que rompería ofrecer un calendario, está en `fechaDelPlanNuevo` (`planes-store.ts`).
          Darle forma de botón acá invitaría a buscarle el desplegable que no tiene. */}
      <span
        className="mr-0.5 flex shrink-0 items-center gap-1.5 whitespace-nowrap px-1 text-xs text-muted-foreground"
        title="Día operativo del plan: las rutas y las restricciones de circulación se calculan para esta fecha"
      >
        <CalendarDays size={13} className="shrink-0" />
        Reparto:{' '}
        <span className="font-medium text-foreground">{fechaLegible(momentoDelPlan().fecha)}</span>
      </span>
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
