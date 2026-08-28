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
import { CalendarDays, Loader2, Warehouse } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
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
  centrosDelPlan,
  configurados,
  onSalidas,
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
  /**
   * Cuántos centros trajo el plan. Con UNO, el botón de salidas y llegadas no se dibuja: sale del
   * único que hay y vuelve al único que hay, así que sus dos listas tendrían una sola opción — un
   * control así promete una decisión que no existe.
   */
  centrosDelPlan: number
  /** Cuántas rutas tienen salida o llegada puesta a mano. Es el contador del botón. */
  configurados: number
  onSalidas: () => void
  onOptimizar: () => void
  onGenerar: () => void
}) {
  const puedeOptimizar = camionesElegidos > 0 && paradas > 0 && !optimizando

  /**
   * Por qué NO se puede generar todavía, o `undefined` si se puede. CINCO condiciones, en el orden en
   * que se resuelven:
   *
   *   1. estar OPTIMIZADO — sin reparto no hay rutas que generar;
   *   2. al menos un camión;
   *   3. al menos una parada;
   *   4. NINGUNA parada sin asignar — es el que más frena en la práctica, y no es un capricho: generar
   *      con puntos sueltos produce un plan que deja entregas afuera sin decirlo. Lo típico es una
   *      parada con producto de frío y ningún camión refrigerado con lugar; el panel de avisos dice
   *      cuál es;
   *   5. no haber déficit de capacidad.
   *
   * Se devuelve el MOTIVO y no un booleano por la misma razón de siempre: un botón apagado sin
   * explicación deja al que llegó hasta acá sin saber qué le falta.
   */
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
      {/* PRIMERO EN IRSE cuando falta ancho: es lo único de esta barra que no se clickea.
          `@min-[1180px]` Y NO `2xl`: el que le come 320 px a la franja es el detalle de la parada, no
          el monitor — en una pantalla grande ningún breakpoint de viewport se entera, y la fecha
          seguía ocupando su lugar mientras los botones se apretaban. Ver la nota del `@container` en
          `PlannerView`. El dato sigue en el `title`. */}
      <span
        className="mr-0.5 hidden shrink-0 items-center gap-1.5 whitespace-nowrap px-1 text-xs text-muted-foreground @min-[1180px]:flex"
        title="Día operativo del plan: las rutas y las restricciones de circulación se calculan para esta fecha"
      >
        <CalendarDays size={13} className="shrink-0" />
        Reparto:{' '}
        <span className="font-medium text-foreground">{fechaLegible(momentoDelPlan().fecha)}</span>
      </span>
      {/* ── SALIDAS Y LLEGADAS, ANTES DE OPTIMIZAR ──────────────────────────────────────────────
          Va a la IZQUIERDA de «Optimizar» porque la barra se lee como el flujo: la fecha del reparto,
          de dónde sale cada camión, repartir, generar. Este dato se decide antes por una razón
          concreta y no por prolijidad: los recorridos se secuencian DESDE la salida y el último tramo
          cuelga de la llegada, así que fijarlos después obliga a reoptimizar para que sirvan.

          NO SE DIBUJA CON UN SOLO CENTRO (ver `centrosDelPlan`), que es el caso de la mayoría de los
          planes: la barra no gana un botón inerte por una función que ese plan no tiene. */}
      {centrosDelPlan > 1 && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 px-2.5 text-xs"
          onClick={onSalidas}
          disabled={camionesElegidos === 0}
          title={
            camionesElegidos === 0
              ? 'Elegí al menos un camión'
              : 'De qué centro carga cada camión y en cuál termina el día'
          }
        >
          <Warehouse size={12} />
          {/* El contador NO se va con la etiqueta: es el que dice que alguien ya configuró algo, y
              un depósito sin número no distingue «no lo toqué» de «lo dejé en el default». */}
          <span className="hidden @min-[880px]:inline">Salidas</span>
          {/* El contador es lo que evita tener que ABRIR el diálogo para saber si alguien ya
              configuró algo. Sin él, el estado del plan depende de acordarse. */}
          {configurados > 0 && (
            <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-medium tabular-nums text-primary">
              {configurados}
            </span>
          )}
        </Button>
      )}
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
      {/* ── GENERAR RUTAS, y POR QUÉ NO SE PUEDE ────────────────────────────────────────────────
          El motivo estaba solo en el `title`, y ahí era INALCANZABLE: el `Button` compartido trae
          `disabled:pointer-events-none` en su clase base, así que un botón deshabilitado no recibe
          hover y el navegador nunca muestra su tooltip. O sea que el gate existía, estaba bien
          calculado y explicado, y desde afuera se veía como un botón apagado sin razón.

          Ahora el motivo va en un `Tooltip` cuyo trigger es un `span`: el que escucha el hover es el
          span, no el botón deshabilitado, y por eso sí aparece.

          NO SE DIBUJA AL LADO. Se probó como una línea de texto permanente en la barra y no va: la
          barra es de acciones, y un renglón que explica por qué una de ellas no se puede hacer la
          convierte en un cartel. El que quiere saber qué le falta pasa por encima del botón; el resto
          del tiempo, un botón apagado ya dice bastante. */}
      <Tooltip>
        <TooltipTrigger
          // `render` y no `asChild`: el kit es Base UI. El `span` es el que recibe el hover, que es
          // todo el truco para que un control deshabilitado pueda explicarse.
          render={<span tabIndex={motivoBloqueo ? 0 : -1} />}
        >
          <Button
            size="sm"
            className="h-7 px-2.5 text-xs"
            disabled={motivoBloqueo !== undefined}
            onClick={onGenerar}
          >
            Generar rutas
          </Button>
        </TooltipTrigger>
        {motivoBloqueo && <TooltipContent className="max-w-64">{motivoBloqueo}</TooltipContent>}
      </Tooltip>
    </>
  )
}
