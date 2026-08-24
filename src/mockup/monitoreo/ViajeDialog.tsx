// El viaje de UNA orden de transporte, en diálogo, desde el LISTADO de monitoreo.
//
// El pedido de logística fue literal: "no queremos entrar a cada orden para ver cómo va". El detalle con
// mapa contesta DÓNDE está el camión; esto contesta CUÁNTO hay en juego y CUÁNDO pasó cada cosa — dos
// preguntas que hoy costaban dos navegaciones. Por eso es un diálogo sobre el listado y no otra ruta:
// se abre, se compara, se cierra y se sigue barriendo la tabla.
//
// Dos vistas sobre el mismo viaje y una sola selección compartida:
//   · Detalle — la tabla parada por parada con ventana, tiempos, peso y cobros. Va PRIMERA porque es la
//     que contesta la pregunta más frecuente ("¿cuánto le falta cobrar a este camión?") y porque no
//     necesita que el usuario aprenda a leer nada nuevo.
//   · Plan vs ejecutado — el eje, para ver DÓNDE se estiró el viaje.
// La parada elegida en una queda elegida en la otra: son dos vistas del mismo objeto, y perder la
// selección al cambiar de vista obliga a volver a buscar la fila que se estaba mirando.
//
// EN VIVO. Las dos vistas leen `useSeguimientoVivo`, el mismo hook que mueve el detalle con mapa: las
// paradas se cierran solas mientras el diálogo está abierto y los montos se recalculan con ellas. Una
// pantalla de vigilancia que muestra una foto es peor que no mostrar nada, porque no se distingue de
// una que está actualizada. Por eso además hay dos avisos: la frescura de la pantalla en el encabezado
// y el destello en la fila que acaba de cambiar.
import { useMemo, useState } from 'react'
import { ChartGantt, Table2, Truck } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useFilasVivas } from './destello'
import { EstadoViajeBadge } from './EstadoEntregaBadge'
import { RutaParalela } from './RutaParalela'
import { Frescura } from './ProgresoEntregas'
import { TablaViajeMonitoreo } from './TablaViajeMonitoreo'
import { useSeguimientoVivo } from './use-seguimiento-vivo'
import {
  construirLineaTiempo,
  desvioTexto,
  tierDe,
  TIER_DESVIO,
  type LineaTiempo,
} from './linea-tiempo'
import {
  duracionTexto,
  entregasDeViaje,
  resumenEntregas,
  viajePorTripId,
  type EntregaMonitoreo,
  type ViajeMonitoreo,
} from './monitoreo-data'
import type { FilaMonitoreo } from './use-flota-viva'

type Vista = 'tabla' | 'eje'

/**
 * Las dos vistas, en el orden en que se ofrecen.
 *
 * Los rótulos son los de logística, no los nuestros: pidieron "comparación de ruta planificada versus
 * ruta ejecutada", así que el botón dice eso y no "línea de tiempo", que es cómo lo llamamos adentro.
 */
const VISTAS: { id: Vista; label: string; icono: typeof Table2; ayuda: string }[] = [
  {
    id: 'tabla',
    label: 'Detalle',
    icono: Table2,
    ayuda: 'Una fila por parada: horarios, ventana, peso y cobros',
  },
  {
    id: 'eje',
    label: 'Plan vs ejecutado',
    icono: ChartGantt,
    ayuda: 'La ruta planificada contra la ejecutada, sobre un eje de tiempo real',
  },
]

/** Un dato del encabezado: etiqueta chica arriba, número con peso abajo. */
function Metrica({
  label,
  valor,
  clase,
  ayuda,
}: {
  label: string
  valor: string
  clase?: string
  ayuda?: string
}) {
  return (
    <div className="flex flex-col gap-0.5" title={ayuda}>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn('text-sm font-semibold tabular-nums text-foreground', clase)}>{valor}</span>
    </div>
  )
}

/**
 * El selector de vista, en BOTONES y no en pestañas subrayadas.
 *
 * Es lo que pidió logística y coincide con el resto de la app: en una superficie que ya tiene una tabla
 * densa abajo, un subrayado fino compite mal con las líneas de la tabla y cuesta ver cuál está activa.
 * Un botón relleno en el azul primario no admite duda, y de paso el objetivo de click es más grande.
 */
function SelectorVista({ vista, onCambiar }: { vista: Vista; onCambiar: (v: Vista) => void }) {
  return (
    <div role="tablist" aria-label="Vista del viaje" className="flex flex-wrap items-center gap-1.5">
      {VISTAS.map(({ id, label, icono: Icono, ayuda }) => {
        const activo = id === vista
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activo}
            title={ayuda}
            onClick={() => onCambiar(id)}
            className={cn(
              'flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
              activo
                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                : 'border-border bg-background text-foreground hover:bg-muted',
            )}
          >
            <Icono className="size-3.5" />
            {label}
          </button>
        )
      })}
    </div>
  )
}

export function ViajeDialog({ fila, onClose }: { fila: FilaMonitoreo; onClose: () => void }) {
  // `viajePorTripId`/`entregasDeViaje` regeneran todo el dataset en cada llamada (ver el comentario de
  // `obtenerMonitoreoOperativo`), así que se memorizan por viaje y no por render.
  const viaje = useMemo(() => viajePorTripId(fila.tripId), [fila.tripId])
  const entregas = useMemo(() => entregasDeViaje(fila.tripId), [fila.tripId])

  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto) onClose()
      }}
    >
      {/* Alto FIJO y no solo `max-h`: adentro hay dos superficies que reparten el alto sobrante (el eje
          y la tabla), y sin una altura definida arriba, un `flex-1` no tiene contra qué medirse. */}
      <DialogContent className="flex h-[min(76vh,780px)] w-[min(1280px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        {viaje ? (
          <Cuerpo fila={fila} viaje={viaje} base={entregas} />
        ) : (
          <div className="p-6">
            <DialogTitle>Sin datos del viaje</DialogTitle>
            <DialogDescription className="mt-2">
              La orden {fila.codigo} no tiene un viaje asociado en el dataset de monitoreo.
            </DialogDescription>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Cuerpo({
  fila,
  viaje,
  base,
}: {
  fila: FilaMonitoreo
  viaje: ViajeMonitoreo
  /** Las entregas del dataset, antes de aplicarles el avance en vivo. */
  base: EntregaMonitoreo[]
}) {
  // El MISMO hook que mueve el detalle con mapa. El tercer parámetro —los tramos por calles— no se
  // pasa: sirve para que el pin caiga sobre el asfalto, y acá no hay mapa que dibujar.
  const { entregas, actualizadoAt } = useSeguimientoVivo(viaje, base)

  const linea: LineaTiempo = useMemo(
    () => construirLineaTiempo(viaje, entregas),
    [viaje, entregas],
  )
  const resumen = useMemo(() => resumenEntregas(entregas, viaje.salida), [entregas, viaje.salida])

  /**
   * Qué paradas acaban de cambiar. La FIRMA lleva justo lo que la simulación puede mover: el estado,
   * las dos horas reales y el cobro. Meter la entrega entera haría destellar todo en cada tick —los
   * objetos se reconstruyen igual— y meter menos dejaría cambios sin avisar.
   */
  const vivas = useFilasVivas(
    entregas,
    (e) => e.id,
    (e) => [e.estado, e.llegadaAt ?? '-', e.entregaAt ?? '-', e.cobro.cobrado].join('|'),
  )

  const [vista, setVista] = useState<Vista>('tabla')

  // Arranca en la PEOR parada y no en la primera: en una pantalla de vigilancia, lo primero que hay que
  // ver es el problema. Si el viaje viene sin atrasos, cae en la primera y no hay problema que mostrar.
  const [seleccion, setSeleccion] = useState<number | null>(
    () => (linea.peor ?? linea.hitos[0])?.secuencia ?? null,
  )

  return (
    <>
      <DialogHeader className="gap-2 border-b border-border px-4 pb-3 pt-4">
        <div className="flex flex-wrap items-center gap-2 pr-8">
          <DialogTitle className="font-mono text-sm">{fila.codigo}</DialogTitle>
          <span className="flex items-center gap-1.5 text-sm text-foreground">
            <Truck className="size-3.5 text-muted-foreground" />
            {viaje.camion}
          </span>
          <span className="text-sm text-muted-foreground">· {viaje.chofer}</span>
          <EstadoViajeBadge estado={viaje.estado} />

          {/* Los números del viaje comparten la línea del título. En franja propia se comían el alto de
              la tabla y del eje, que es lo único que se vino a mirar. */}
          <div className="ml-auto flex flex-wrap items-start gap-x-5 gap-y-1">
            <Metrica
              label="Salida"
              valor={
                linea.demoraSalidaMin !== 0
                  ? `${viaje.salida} (${desvioTexto(linea.demoraSalidaMin)})`
                  : viaje.salida
              }
              clase={
                linea.demoraSalidaMin !== 0 ? TIER_DESVIO[tierDe(linea.demoraSalidaMin)].texto : undefined
              }
              ayuda={`Planificada ${viaje.salidaPlan} · real ${viaje.salida}. La demora de rampa se arrastra hasta la última parada.`}
            />
            <Metrica
              label="Puntualidad"
              valor={linea.medidas === 0 ? '—' : `${linea.aTiempo}/${linea.medidas}`}
              ayuda="Paradas atendidas dentro de la tolerancia, sobre las que ya tienen hora real de llegada"
            />
            <Metrica
              label="Desvío prom."
              valor={desvioTexto(linea.desvioPromedio)}
              clase={
                linea.desvioPromedio === null ? undefined : TIER_DESVIO[tierDe(linea.desvioPromedio)].texto
              }
              ayuda="Promedio del corrimiento entre la llegada planificada y la real"
            />
            <Metrica
              label="Progreso"
              valor={`${resumen.progresoPct}%`}
              ayuda={`${resumen.total - resumen.pendientes} de ${resumen.total} paradas cerradas`}
            />
            <Metrica
              label="En ruta"
              valor={duracionTexto(resumen.enRutaMin)}
              ayuda="Desde la salida del depósito hasta la última parada cerrada"
            />
          </div>
        </div>
        <DialogDescription className="sr-only">
          Detalle parada por parada del viaje {fila.codigo} y comparación entre su ruta planificada y la
          ejecutada.
        </DialogDescription>
      </DialogHeader>

      {/* Barra de vista. La frescura va acá y no en el encabezado a propósito: es una propiedad de LO
          QUE SE ESTÁ MIRANDO, y queda pegada a los botones que eligen qué se mira. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-4 py-2">
        <SelectorVista vista={vista} onCambiar={setVista} />
        <Frescura desde={actualizadoAt} />
      </div>

      {vista === 'tabla' ? (
        <TablaViajeMonitoreo
          linea={linea}
          seleccion={seleccion}
          onSeleccionar={setSeleccion}
          vivas={vivas}
        />
      ) : (
        <RutaParalela linea={linea} seleccion={seleccion} onSeleccionar={setSeleccion} />
      )}
    </>
  )
}
