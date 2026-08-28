// De dónde sale y a dónde vuelve cada camión del plan. Se decide ANTES de repartir.
//
// ═══ POR QUÉ ANTES Y NO DESPUÉS ═══
//
// Esto se podía tocar solo en la tabla de rutas, que aparece con el reparto ya hecho. O sea: primero
// el algoritmo armaba los recorridos suponiendo que cada camión abre y cierra en su propio galpón, y
// recién después se le decía que no. Los recorridos se secuencian DESDE la salida y el último tramo
// cuelga de la llegada, así que corregirla después obliga a reoptimizar para que sirva de algo.
//
// El orden correcto es al revés, y es el orden en el que está la barra: elegir los camiones, decirles
// de dónde cargan y dónde duermen, y recién ahí optimizar contra esos dos puntos.
//
// ═══ POR QUÉ SOLO CON DOS O MÁS CENTROS ═══
//
// Con un centro no hay nada que decidir: sale del único que hay y vuelve al único que hay. El botón
// que lo abre no se dibuja —ver `PlannerHud`—, porque un control cuyas dos listas tienen una sola
// opción es una promesa de que hay una decisión que en realidad no existe.
//
// ═══ POR QUÉ LO DECIDE UNA PERSONA ═══
//
// Hubo una versión que elegía la llegada sola, midiendo desde la última parada. El retorno no es un
// problema de kilómetros: es dónde durmió el camión, qué encargado lo recibe y qué se carga al día
// siguiente. El algoritmo no tiene ninguno de esos datos.
import { ArrowRight, Warehouse } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { distribuidoraIdDeCamion } from '../mock-data'
import { CentroSelect, type OpcionCentro } from './CentroSelect'
import type { RutaPlan } from './planner-model'

/**
 * Cuántas rutas tienen una salida o una llegada PUESTA A MANO (distinta del default).
 *
 * Lo usa el botón de la barra para llevar contador: sin él, la única forma de saber si alguien ya
 * configuró algo es abrir el diálogo, y entonces el estado del plan depende de acordarse.
 */
export function centrosConfigurados(rutas: RutaPlan[]): number {
  return rutas.filter(
    (r) => r.salidaId !== distribuidoraIdDeCamion(r.camion) || r.llegadaId !== r.salidaId,
  ).length
}

export function SalidasDialog({
  abierto,
  rutas,
  centrosSalida,
  centrosLlegada,
  onSalida,
  onLlegada,
  onCerrar,
}: {
  abierto: boolean
  /** Una por camión elegido. Existen desde que se elige la flota: no hace falta haber optimizado. */
  rutas: RutaPlan[]
  centrosSalida: OpcionCentro[]
  centrosLlegada: OpcionCentro[]
  onSalida: (rutaId: string, centroId: number) => void
  onLlegada: (rutaId: string, centroId: number) => void
  onCerrar: () => void
}) {
  const nombreDe = (id: number, lista: OpcionCentro[]) =>
    lista.find((c) => c.id === id)?.nombre ?? `Centro ${id}`

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Warehouse size={16} className="text-muted-foreground" />
            Salidas y llegadas
          </DialogTitle>
          <DialogDescription>
            De qué centro carga cada camión y en cuál termina el día. El reparto se optimiza contra
            estos dos puntos, así que conviene fijarlos antes de optimizar.
          </DialogDescription>
        </DialogHeader>

        {/* Cabecera de columnas: son dos selects seguidos y sin rótulo se leen como uno partido al
            medio. La flecha sola no alcanza para decir cuál es cuál. */}
        <div className="flex items-center gap-2 border-b border-border pb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <span className="w-[132px] shrink-0">Camión</span>
          <span className="min-w-0 flex-1">Sale de</span>
          <span className="w-[11px] shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">Vuelve a</span>
        </div>

        <div className="flex max-h-[50vh] flex-col divide-y divide-border overflow-y-auto">
          {rutas.map((ruta) => {
            const propio = distribuidoraIdDeCamion(ruta.camion)
            const salidaMovida = ruta.salidaId !== propio
            const vuelveEnOtro = ruta.llegadaId !== ruta.salidaId
            return (
              <div key={ruta.id} className="flex items-center gap-2 py-1.5">
                <div className="flex w-[132px] shrink-0 items-center gap-2">
                  {/* El color de la ruta: es el mismo con el que el mapa va a dibujar su trazo. */}
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: ruta.color }}
                    aria-hidden
                  />
                  <span className="truncate font-mono text-[11px] font-medium">
                    {ruta.camion.placa}
                  </span>
                  <span
                    className={cn(
                      'flex size-4 shrink-0 items-center justify-center rounded text-[9px] font-bold',
                      ruta.camion.tipo === 'Frío'
                        ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                        : 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
                    )}
                    title={ruta.camion.tipo}
                    aria-hidden
                  >
                    {ruta.camion.tipo === 'Frío' ? 'F' : 'S'}
                  </span>
                </div>

                <CentroSelect
                  valor={ruta.salidaId}
                  nombre={nombreDe(ruta.salidaId, centrosSalida)}
                  opciones={centrosSalida}
                  onElegir={(id) => onSalida(ruta.id, id)}
                  titulo={`${ruta.camion.placa}: de dónde sale`}
                  destacado={salidaMovida}
                  discreto={false}
                />
                <ArrowRight
                  size={11}
                  className={cn(
                    'shrink-0',
                    vuelveEnOtro ? 'text-foreground' : 'text-muted-foreground/50',
                  )}
                  aria-hidden
                />
                <CentroSelect
                  valor={ruta.llegadaId}
                  nombre={nombreDe(ruta.llegadaId, centrosLlegada)}
                  opciones={centrosLlegada}
                  onElegir={(id) => onLlegada(ruta.id, id)}
                  titulo={`${ruta.camion.placa}: a dónde vuelve`}
                  destacado={vuelveEnOtro}
                  discreto={false}
                />
              </div>
            )
          })}
        </div>

        {/* La consecuencia de mover una SALIDA, escrita donde se mueve. Una ruta solo puede llevar
            paradas del centro del que sale —esa mercadería está en ese galpón—, así que las que ya
            tenía de otro centro se sueltan. Pasa igual, con o sin este renglón; la diferencia es si
            sorprende. */}
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Cambiar de dónde <span className="font-medium text-foreground">sale</span> un camión suelta
          las paradas que ya tenía de otro centro: una ruta solo lleva la mercadería del galpón del
          que carga. Cambiar a dónde{' '}
          <span className="font-medium text-foreground">vuelve</span> no toca el reparto.
        </p>

        <DialogFooter>
          <Button size="sm" className="h-7 px-3 text-xs" onClick={onCerrar}>
            Listo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
