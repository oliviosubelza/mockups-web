// Panel de alertas del plan: un botón en la barra superior con el conteo, y la lista en un popover.
//
// POR QUÉ NO ES UNA TARJETA FIJA SOBRE EL MAPA. La columna izquierda ya tiene métricas y el panel del
// dock; una tercera tarjeta permanente le come otro pedazo de mapa a una pantalla cuyo punto es
// justamente ver el mapa. Y las alertas son intermitentes: la mayor parte del tiempo no hay ninguna, y
// un cartel que casi siempre dice "todo bien" ocupa lugar para no informar nada.
//
// LO QUE SÍ ESTÁ SIEMPRE A LA VISTA ES EL CONTEO, y con su color. Eso es lo que hace de alerta: se ve
// sin abrir nada y sin estar mirando el panel correcto. El detalle —qué pasa y cómo se sale— está a un
// click, que es la distancia correcta para algo que se lee una vez y se va a arreglar a otro lado.
import { AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { Alerta } from './planner-alertas'
import type { PanelId } from './planner-store'

export function AlertasPanel({
  alertas,
  onIrA,
}: {
  alertas: Alerta[]
  /** Abre el panel donde se resuelve la alerta. */
  onIrA: (panel: PanelId) => void
}) {
  const criticas = alertas.filter((a) => a.nivel === 'critica').length
  const hay = alertas.length > 0

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'sm' }),
          'h-7 gap-1.5 px-2 text-xs',
          // El color lo manda la PEOR alerta, no la cantidad. Tres avisos menores no suman una
          // crítica, y pintarlos de rojo por ser tres enseñaría a ignorar el rojo.
          criticas > 0 &&
            'bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 dark:text-rose-400',
          criticas === 0 &&
            hay &&
            'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400',
        )}
        title={
          hay
            ? `${alertas.length} aviso(s) sobre este plan`
            : 'Sin avisos: el plan no tiene problemas detectados'
        }
      >
        {hay ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
        {/* «Sin avisos» pierde su texto cuando la franja se angosta —el tilde verde ya dice que no hay
            nada que mirar y el `title` lo escribe— pero el NÚMERO de avisos no se va nunca: un
            triángulo ámbar sin cifra obliga a abrir el popover para saber si es uno o son doce.
            La variante es de CONTENEDOR: quien decide el ancho es la franja de la barra, no la
            pantalla. Ver la nota del `@container` en `PlannerView`. */}
        {hay ? alertas.length : <span className="hidden @min-[780px]:inline">Sin avisos</span>}
      </PopoverTrigger>

      <PopoverContent align="center" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2">
          <p className="text-xs font-semibold">Avisos del plan</p>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {hay
              ? 'Ninguno impide guardar. Son lo que conviene revisar antes.'
              : 'No hay nada que revisar con la selección actual.'}
          </p>
        </div>

        {hay ? (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {alertas.map((alerta) => (
              <li key={alerta.id} className="px-3 py-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    size={13}
                    className={cn(
                      'mt-0.5 shrink-0',
                      alerta.nivel === 'critica'
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-amber-600 dark:text-amber-400',
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'text-xs font-semibold leading-snug',
                        alerta.nivel === 'critica'
                          ? 'text-rose-700 dark:text-rose-300'
                          : 'text-amber-700 dark:text-amber-300',
                      )}
                    >
                      {alerta.titulo}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      {alerta.detalle}
                    </p>

                    {/* Atajo al lugar donde se arregla. Sin esto, cada aviso termina con "andá a
                        Flota" y el usuario tiene que encontrar Flota — leer el problema y poder ir a
                        resolverlo son parte del mismo gesto. */}
                    {alerta.panel && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-1 h-5 gap-0.5 px-1 text-[11px] text-primary hover:text-primary"
                        onClick={() => onIrA(alerta.panel!)}
                      >
                        Ir a {alerta.panel === 'flota' ? 'Flota' : 'Rutas'}
                        <ChevronRight size={11} />
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            Todo en orden por ahora.
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
