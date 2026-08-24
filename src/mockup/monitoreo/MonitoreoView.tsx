// Listado del MONITOREO (maestro). Una fila por orden de transporte en curso.
//
// Por qué listado y no cards: es una pantalla de VIGILANCIA — se entra a buscar el camión que va
// tarde o la entrega que falló, no a contemplar. Eso pide densidad, orden por columna y filtro por
// estado. Lo único que se le toma a las cards es la barra de progreso, que da la lectura de "cómo va"
// sin sacrificar densidad.
//
// La columna "Última señal" no es decorativa: sin ella, un camión con el GPS caído se ve igual que un
// camión detenido, y son dos problemas muy distintos.
//
// Las filas ya NO se calculan a nivel de módulo. Venían de un `const FILAS` congelado al importar, así
// que la pantalla de vigilancia no mostraba nada moverse: el progreso, las incidencias y la última señal
// eran una foto. Ahora salen de `useFlotaViva` —snapshot + SSE de flota, con los pings agrupados a ~30 s
// como manda el contrato— y el filtrado se aplica sobre lo que el stream fue parcheando.
import { useMemo, useState } from 'react'
import { AlertTriangle, ChartGantt, MapPin, Radio, Truck } from 'lucide-react'
import { DataTable, defineColumns, defineFilters, FilterBar } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { openRoute } from '@/core/routing/open-route'
import { EstadoViajeBadge } from './EstadoEntregaBadge'
import { Frescura, ProgresoEntregas } from './ProgresoEntregas'
import { Destello, useFilasVivas } from './destello'
import { useFlotaViva, type FilaMonitoreo } from './use-flota-viva'
import { ViajeDialog } from './ViajeDialog'
import { UMBRAL_SENAL_VIEJA_MIN, minutosSinSenal, type ItemActual } from './tracking-dynamo'
import { duracionTexto, promedioMin } from './monitoreo-data'
import type { EstadoViaje } from './monitoreo-estado'

const ESTADO_OPCIONES: { label: string; value: EstadoViaje }[] = [
  { label: 'Sin salir', value: 'pendiente' },
  { label: 'En ruta', value: 'en_ruta' },
  { label: 'Finalizado', value: 'finalizado' },
]

interface MonitoreoFilters extends Record<string, unknown> {
  camion?: string
  estadoViaje?: EstadoViaje
}

const filterDefs = defineFilters<MonitoreoFilters>([
  { type: 'text', id: 'camion', label: 'Camión' },
  { type: 'select', id: 'estadoViaje', label: 'Estado del viaje', options: ESTADO_OPCIONES },
])

/**
 * Un promedio de la flota en el encabezado: etiqueta chica al lado del número.
 *
 * En LÍNEA y no en tarjeta: dos tarjetas de KPI arriba de una tabla de vigilancia le roban alto a lo
 * único que se mira de verdad, que son las filas. El número va con peso y la etiqueta atenuada, así se
 * lee de un vistazo sin ocupar una franja propia.
 */
function PromedioFlota({ label, valor, ayuda }: { label: string; valor: string; ayuda: string }) {
  return (
    <span className="flex items-baseline gap-1.5 text-xs" title={ayuda}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{valor}</span>
    </span>
  )
}

/**
 * Última señal del GPS. Recibe el ÍTEM CRUDO y deriva los minutos acá: `now() - trackedAt`. Antes
 * recibía un `ultimaSenalMin` ya calculado en el dataset, y ese número no envejecía nunca — la tabla
 * decía "hace 3 min" indefinidamente aunque el camión llevara media hora callado.
 *
 * El umbral es la constante compartida de `tracking-dynamo` y no un `> 15` escrito acá: el mapa aplica
 * el mismo corte, y con dos literales sueltos la tabla y el mapa podían discrepar sobre qué camión está
 * caído. La justificación del número vive con la constante.
 */
function UltimaSenal({ tracking }: { tracking: ItemActual | null }) {
  if (!tracking) return <span className="text-xs text-muted-foreground">—</span>
  const minutos = minutosSinSenal(tracking.trackedAt, Date.now())
  const vieja = minutos > UMBRAL_SENAL_VIEJA_MIN
  return (
    <span
      className={cn(
        'flex items-center justify-end gap-1 text-xs tabular-nums',
        vieja ? 'font-medium text-destructive' : 'text-muted-foreground',
      )}
    >
      {/* El ícono LATE mientras la señal está fresca: es el equivalente de tabla a las ondas del
          camión en el mapa. Con señal vieja se queda quieto y cambia de forma — un equipo que dejó
          de reportar no puede verse igual de vivo que uno que reporta. */}
      {vieja ? (
        <AlertTriangle className="size-3" />
      ) : (
        <Radio className="senal-viva size-3 text-primary" />
      )}
      hace {minutos} min
    </span>
  )
}

export function MonitoreoView() {
  const [filters, setFilters] = useState<MonitoreoFilters>({})

  // Snapshot + SSE de flota. El scope es el `distributorId` del hook: los cuatro endpoints web están
  // acotados por él y la PK del ítem ACTUAL es `FLEET#{distributorId}`.
  const { filas, actualizadoAt } = useFlotaViva()

  // Los filtros se aplican sobre el estado VIVO, no sobre el dataset: una fila que el stream acaba de
  // pasar a "finalizado" tiene que salir del filtro "En ruta" sin recargar nada.
  const data = useMemo(
    () =>
      filas.filter(
        (f) =>
          (!filters.camion || f.camion.toLowerCase().includes(filters.camion.toLowerCase())) &&
          (!filters.estadoViaje || f.estadoViaje === filters.estadoViaje),
      ),
    [filas, filters],
  )

  /**
   * Los promedios de LA FLOTA, sobre las filas VISIBLES y no sobre el dataset: si el usuario filtró
   * "En ruta", el número tiene que hablar de los camiones que está mirando. Un promedio que ignora el
   * filtro contradice la tabla que tiene justo debajo.
   *
   * Es el promedio de los promedios de cada viaje y NO el de todas las paradas juntas. La diferencia
   * importa: por paradas, un viaje de 20 pesa diez veces más que uno de 2 y el número termina
   * describiendo al camión más cargado en vez de a la flota. Acá cada viaje cuenta uno, que es lo que
   * se pregunta cuando se mira una operación completa.
   */
  const flota = useMemo(
    () => ({
      atencion: promedioMin(data.map((f) => f.resumen.atencionPromedioMin)),
      enRuta: promedioMin(data.map((f) => f.resumen.enRutaMin)),
    }),
    [data],
  )

  /**
   * Qué filas acaban de cambiar. La FIRMA es lo que decide si hubo cambio, y por eso lleva justo los
   * cuatro datos que el stream puede mover: estado del viaje, progreso, incidencias y el último ping.
   * Meter el objeto entero haría destellar todo en cada tick —los objetos se reconstruyen igual—, y
   * meter menos dejaría cambios sin avisar.
   */
  const vivas = useFilasVivas(
    filas,
    (f) => f.id,
    (f) =>
      [f.estadoViaje, f.resumen.progresoPct, f.resumen.incidencias, f.tracking?.trackedAt ?? '-'].join('|'),
  )

  // La orden viaja en la URL, no en un store: así el detalle sobrevive un F5 y el link se puede pasar.
  const abrir = (fila: FilaMonitoreo) => openRoute('monitoreo-detalle', { ordenId: fila.id })

  /**
   * El resumen del viaje, en cambio, NO viaja en la URL: es una consulta de paso sobre la fila que se
   * está mirando —"¿este camión viene en hora?", "¿cuánto le queda por cobrar?"— y sacar al usuario del
   * listado para contestarla es justo lo que logística pidió evitar. Al cerrar el diálogo la tabla
   * sigue donde estaba, con su scroll y sus filtros.
   */
  const [viajeAbierto, setViajeAbierto] = useState<FilaMonitoreo | null>(null)

  const columns = useMemo(
    () =>
      defineColumns<FilaMonitoreo>([
        {
          id: 'codigo',
          header: 'Orden',
          accessorKey: 'codigo',
          size: 110,
          pin: 'left',
          cell: (row) => <span className="font-mono text-xs font-medium">{row.codigo}</span>,
        },
        {
          id: 'camion',
          header: 'Camión',
          accessorKey: 'camion',
          size: 150,
          pin: 'left',
          cell: (row) => (
            <span className="flex items-center gap-2">
              <Truck className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">{row.camion}</span>
            </span>
          ),
        },
        {
          id: 'chofer',
          header: 'Chofer',
          accessorKey: 'chofer',
          size: 170,
          // Sin caso "sin asignar": el dataset de monitoreo solo incluye órdenes despachadas, y un
          // viaje sin chofer no pudo salir del almacén (ver `construir` en monitoreo-data).
          cell: (row) => <span className="truncate">{row.chofer}</span>,
        },
        {
          id: 'estadoViaje',
          header: 'Viaje',
          accessorKey: 'estadoViaje',
          size: 120,
          // Cambia con el evento `transport_status`: el camión salió o volvió.
          cell: (row) => (
            <Destello firma={row.estadoViaje}>
              <EstadoViajeBadge estado={row.estadoViaje} />
            </Destello>
          ),
        },
        {
          id: 'progreso',
          header: 'Progreso',
          size: 190,
          enableSorting: false,
          // Cambia con `order_progress`: una entrega cerró. Es el dato que más se mira de la fila.
          cell: (row) => (
            <Destello firma={row.resumen.progresoPct}>
              <ProgresoEntregas resumen={row.resumen} />
            </Destello>
          ),
        },
        {
          id: 'paradas',
          header: 'Paradas',
          accessorKey: 'paradas',
          size: 90,
          meta: { align: 'right' },
          cell: (row) => <span className="tabular-nums text-muted-foreground">{row.paradas}</span>,
        },
        {
          id: 'incidencias',
          header: 'Incid.',
          size: 90,
          meta: { align: 'right' },
          cell: (row) => (
            <Destello firma={row.resumen.incidencias} className="justify-end">
              {row.resumen.incidencias > 0 ? (
                <span className="flex items-center justify-end gap-1 font-medium tabular-nums text-destructive">
                  <AlertTriangle className="size-3.5" />
                  {row.resumen.incidencias}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </Destello>
          ),
        },
        {
          id: 'senal',
          header: 'Última señal',
          size: 130,
          meta: { align: 'right' },
          // Destella con cada ping que entra (agrupado por el stream de flota).
          cell: (row) => (
            <Destello firma={row.tracking?.trackedAt ?? '-'} className="justify-end">
              <UltimaSenal tracking={row.tracking} />
            </Destello>
          ),
        },
        {
          id: 'salida',
          header: 'Salida',
          accessorKey: 'salida',
          size: 90,
          meta: { align: 'right' },
          cell: (row) => <span className="tabular-nums text-muted-foreground">{row.salida}</span>,
        },
        {
          id: 'atencion',
          header: 'Atención prom.',
          size: 120,
          enableSorting: false,
          meta: { align: 'right' },
          // Ordenar por esta columna se deshabilitó a propósito: el promedio de un viaje con 2 paradas
          // cerradas y el de uno con 18 no son comparables, y un sort los pondría uno al lado del otro
          // como si lo fueran. Para comparar desempeño está el promedio de la flota del encabezado.
          cell: (row) => (
            <span className="tabular-nums text-muted-foreground" title="Promedio de tiempo parado en el punto de entrega">
              {duracionTexto(row.resumen.atencionPromedioMin)}
            </span>
          ),
        },
        {
          id: 'enRuta',
          header: 'En ruta',
          size: 100,
          enableSorting: false,
          meta: { align: 'right' },
          cell: (row) => (
            <span className="tabular-nums text-muted-foreground" title="Desde la salida del depósito hasta la última parada cerrada">
              {duracionTexto(row.resumen.enRutaMin)}
            </span>
          ),
        },
        {
          id: 'acciones',
          header: '',
          size: 190,
          enableSorting: false,
          cell: (row) => (
            <div className="flex items-center justify-end gap-1">
              {/* El resumen primero como ícono y el "Seguir" con texto: son dos verbos distintos
                  —comparar contra el plan y mirar dónde está— y el que saca de la pantalla es el
                  segundo, así que es el que lleva la etiqueta. */}
              <Button
                size="icon-sm"
                variant="ghost"
                title="Línea de tiempo y detalle del viaje"
                onClick={() => setViajeAbierto(row)}
              >
                <ChartGantt className="size-4" />
                <span className="sr-only">Línea de tiempo y detalle</span>
              </Button>
              <Button size="sm" variant="outline" onClick={() => abrir(row)}>
                <MapPin className="size-3.5" />
                Seguir
              </Button>
            </div>
          ),
        },
      ]),
    // `abrir` solo usa el router y `setViajeAbierto` es el setter de useState: ambos estables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return (
    // `h-full`: el contenedor del shell es un bloque, así que `flex-1` no estiraría (ver nota en
    // MonitoreoDetalleView). Con alto real, el `fillHeight` de la tabla puede repartirlo.
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">Monitoreo de entregas</h2>
          {/* Frescura de LA PANTALLA, el mismo indicador que el detalle. En una pantalla que se deja
              abierta es obligatorio: sin él, un stream caído se ve idéntico a una flota detenida. */}
          <Frescura desde={actualizadoAt} />
        </div>
        {/* Los promedios comparten la línea del subtítulo en vez de tener franja propia: en una tabla
            de vigilancia el alto es del contenido, y estos dos números son contexto, no el tema. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-sm text-muted-foreground">
            Órdenes de transporte despachadas. Abrí una para ver su recorrido y el avance parada por parada.
          </p>
          <div className="flex shrink-0 items-baseline gap-4">
            <PromedioFlota
              label="Atención prom."
              valor={duracionTexto(flota.atencion)}
              ayuda="Promedio de tiempo parado en el punto de entrega, sobre los viajes visibles"
            />
            <PromedioFlota
              label="En ruta prom."
              valor={duracionTexto(flota.enRuta)}
              ayuda="Promedio de tiempo en la calle por viaje, desde la salida del depósito hasta la última parada cerrada"
            />
          </div>
        </div>
      </div>

      <DataTable
        tableId="mockup-monitoreo"
        columns={columns}
        data={data}
        getRowId={(row) => row.id}
        // Barra de acento a la izquierda de la fila que cambió. Es el canal de VISIÓN PERIFÉRICA: la
        // celda dice qué cambió, esto dice DÓNDE mirar.
        rowClassName={(row) => (vivas.has(row.id) ? 'fila-viva' : '')}
        onRowDoubleClick={abrir}
        emptyTitle="Sin órdenes en monitoreo"
        emptyMessage="Ninguna orden de transporte coincide con los filtros."
        fillHeight
        filterBar={
          <FilterBar
            defs={filterDefs}
            values={filters}
            onChange={(u) => setFilters((prev) => ({ ...prev, ...u }))}
          />
        }
      />

      {viajeAbierto && <ViajeDialog fila={viajeAbierto} onClose={() => setViajeAbierto(null)} />}
    </div>
  )
}
