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
import { AlertTriangle, MapPin, Radio, Truck } from 'lucide-react'
import { DataTable, defineColumns, defineFilters, FilterBar } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { openRoute } from '@/core/routing/open-route'
import { EstadoViajeBadge } from './EstadoEntregaBadge'
import { Frescura, ProgresoEntregas } from './ProgresoEntregas'
import { useFlotaViva, type FilaMonitoreo } from './use-flota-viva'
import { UMBRAL_SENAL_VIEJA_MIN, minutosSinSenal, type ItemActual } from './tracking-dynamo'
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
      {vieja ? <AlertTriangle className="size-3" /> : <Radio className="size-3" />}
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

  // La orden viaja en la URL, no en un store: así el detalle sobrevive un F5 y el link se puede pasar.
  const abrir = (fila: FilaMonitoreo) => openRoute('monitoreo-detalle', { ordenId: fila.id })

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
          cell: (row) => <EstadoViajeBadge estado={row.estadoViaje} />,
        },
        {
          id: 'progreso',
          header: 'Progreso',
          size: 190,
          enableSorting: false,
          cell: (row) => <ProgresoEntregas resumen={row.resumen} />,
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
          cell: (row) =>
            row.resumen.incidencias > 0 ? (
              <span className="flex items-center justify-end gap-1 font-medium tabular-nums text-destructive">
                <AlertTriangle className="size-3.5" />
                {row.resumen.incidencias}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            ),
        },
        {
          id: 'senal',
          header: 'Última señal',
          size: 130,
          meta: { align: 'right' },
          cell: (row) => <UltimaSenal tracking={row.tracking} />,
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
          id: 'acciones',
          header: '',
          size: 130,
          enableSorting: false,
          cell: (row) => (
            <div className="flex items-center justify-end">
              <Button size="sm" variant="outline" onClick={() => abrir(row)}>
                <MapPin className="size-3.5" />
                Seguir
              </Button>
            </div>
          ),
        },
      ]),
    // `abrir` solo usa el router: estable entre renders.
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
        <p className="text-sm text-muted-foreground">
          Órdenes de transporte despachadas. Abrí una para ver su recorrido y el avance parada por parada.
        </p>
      </div>

      <DataTable
        tableId="mockup-monitoreo"
        columns={columns}
        data={data}
        getRowId={(row) => row.id}
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
    </div>
  )
}
