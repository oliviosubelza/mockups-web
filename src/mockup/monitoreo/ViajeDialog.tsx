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
import { ChartGantt, Package, Store, Table2, Truck, User } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useFilasVivas } from './destello'
import { EstadoViajeBadge } from './EstadoEntregaBadge'
import { RutaParalela } from './RutaParalela'
import { Frescura } from './ProgresoEntregas'
import { TablaViajeMonitoreo } from './TablaViajeMonitoreo'
import { filasDePedidos, opcionesDeCanal, TablaPedidosViaje } from './TablaPedidosViaje'
import { FiltroPopover } from '../FiltroPopover'
import type { CanalId } from '../mock-data'
import { useSeguimientoVivo } from './use-seguimiento-vivo'
import { construirLineaTiempo, desvioTexto, tierDe, TIER_DESVIO, type LineaTiempo } from './linea-tiempo'
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
 * El GRANO del detalle: una fila por parada, o una fila por pedido.
 *
 * Es el "clientes O PEDIDOS" del correo de logística. La otra mitad del pedido —"agrupadas por Canal o
 * Vendedor"— NO es otro grano: es una dimensión con la que se acota el grano pedido, y por eso vive
 * como filtro dentro de esa tabla y no como un botón más acá. Hubo una versión con "Canal" en esta
 * barra y confundía: prometía una tabla distinta y entregaba la misma tabla con menos filas.
 */
type Grano = 'cliente' | 'pedido'

const GRANOS: { id: Grano; label: string; icono: typeof Table2; ayuda: string }[] = [
  { id: 'cliente', label: 'Cliente', icono: User, ayuda: 'Una fila por parada del viaje' },
  {
    id: 'pedido',
    label: 'Pedido',
    icono: Package,
    // El rótulo dice el GRANO, no las dimensiones: canal y vendedor son filtros de esta misma tabla.
    ayuda: 'Una fila por pedido comercial, con filtro por canal',
  },
]

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

/**
 * El pivote del detalle: "Ver por Cliente · Pedido · Canal · Vendedor".
 *
 * Va en una franja SEPARADA de los botones de vista y con etiqueta propia. Cinco botones seguidos, del
 * mismo tamaño y el mismo color, se leen como una sola barra de cinco opciones excluyentes — y no lo
 * son: "Plan vs ejecutado" cambia la superficie entera, "Canal" solo reordena las filas de una de
 * ellas. La etiqueta y el separador son lo que dice que son dos preguntas distintas.
 */
function SelectorGrano({ grano, onCambiar }: { grano: Grano; onCambiar: (g: Grano) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-l border-border pl-4">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Ver por</span>
      {GRANOS.map(({ id, label, icono: Icono, ayuda }) => {
        const activo = id === grano
        return (
          <button
            key={id}
            type="button"
            aria-pressed={activo}
            title={ayuda}
            onClick={() => onCambiar(id)}
            className={cn(
              'flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
              activo
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-background text-foreground hover:bg-muted',
            )}
          >
            <Icono className="size-3" />
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

  const linea: LineaTiempo = useMemo(() => construirLineaTiempo(viaje, entregas), [viaje, entregas])
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
  const [grano, setGrano] = useState<Grano>('cliente')
  /**
   * El filtro de canal. Vive ACÁ y no dentro de la tabla porque se dibuja en la barra de controles, al
   * lado de la vista y del grano. Efecto secundario bueno de haberlo subido: sobrevive a irse al eje y
   * volver, que es lo que uno espera de un filtro que quedó puesto.
   */
  const [canales, setCanales] = useState<CanalId[]>([])

  const filasPedidos = useMemo(() => filasDePedidos(linea), [linea])
  const opcionesCanal = useMemo(() => opcionesDeCanal(filasPedidos), [filasPedidos])

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
              la tabla y del eje, que es lo único que se vino a mirar.
              QUEDARON TRES DE CINCO. Se cayeron "Desvío prom." —dice lo mismo que Puntualidad, que ya
              está al lado, y el eje lo muestra parada por parada— y "En ruta", que pasó al tooltip de
              Progreso: es contexto, no una alarma. El criterio para las tres que sobreviven es que
              sigan siendo verdad en las cuatro vistas: en Canal la tabla habla de plata y un
              encabezado de cinco métricas de tiempo compite con eso en vez de acompañarlo. */}
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
              label="Progreso"
              valor={`${resumen.progresoPct}%`}
              ayuda={`${resumen.total - resumen.pendientes} de ${resumen.total} paradas cerradas · ${duracionTexto(resumen.enRutaMin)} en ruta`}
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SelectorVista vista={vista} onCambiar={setVista} />
          {/* El pivote solo aparece sobre el DETALLE: el eje tiene un grano propio —la parada— y no se
              puede reagrupar sin dejar de ser una línea de tiempo. Mostrarlo apagado ahí sería ofrecer
              un control que nunca se enciende. */}
          {vista === 'tabla' && <SelectorGrano grano={grano} onCambiar={setGrano} />}
          {/* El filtro se muestra donde ACTÚA. Sobre el grano cliente no hay nada que filtrar —una
              parada agrupa pedidos de un solo canal, así que no cambiaría una fila— y sobre el eje
              directamente no hay tabla. */}
          {vista === 'tabla' && grano === 'pedido' && (
            <div className="flex items-center gap-1.5 border-l border-border pl-4">
              <FiltroPopover
                label="Canal"
                icon={Store}
                options={opcionesCanal}
                active={canales}
                onToggle={(value) =>
                  setCanales((previos) =>
                    previos.includes(value as CanalId)
                      ? previos.filter((canal) => canal !== value)
                      : [...previos, value as CanalId],
                  )
                }
                searchPlaceholder="Buscar canal…"
                emptyText="Sin canales en este viaje"
              />
              {canales.length > 0 && (
                <button
                  type="button"
                  title="Quitar el filtro de canal"
                  onClick={() => setCanales([])}
                  className="cursor-pointer text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                >
                  Quitar
                </button>
              )}
              {/* VENDEDOR entra acá, como un segundo FiltroPopover idéntico, el día que el dato se
                  guarde: hoy se pierde en el INSERT a `candidate_orders`, que no tiene columna. */}
            </div>
          )}
        </div>
        <Frescura desde={actualizadoAt} />
      </div>

      {vista === 'eje' ? (
        <RutaParalela linea={linea} seleccion={seleccion} onSeleccionar={setSeleccion} />
      ) : grano === 'cliente' ? (
        <TablaViajeMonitoreo linea={linea} seleccion={seleccion} onSeleccionar={setSeleccion} vivas={vivas} />
      ) : (
        <TablaPedidosViaje
          filas={filasPedidos}
          canales={canales}
          seleccion={seleccion}
          onSeleccionar={setSeleccion}
          vivas={vivas}
        />
      )}
    </>
  )
}
