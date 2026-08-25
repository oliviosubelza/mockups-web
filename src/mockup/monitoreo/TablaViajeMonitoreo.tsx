// La segunda lectura del viaje: TABLA, una fila por PARADA. Es lo mismo que muestra el panel izquierdo
// del mapa, pero desplegado —una fila por parada y una columna por dato— en vez de una tarjeta por vez.
//
// Por qué las dos y no una: el eje contesta CUÁNDO y la tabla contesta CUÁNTO. Un carril de tiempo no
// puede llevar montos sin volverse ilegible, y una tabla de montos no deja ver que el viaje se estiró a
// partir de la parada 6. Son dos preguntas distintas sobre el mismo viaje, así que van en dos vistas
// que comparten la selección: la parada que se elige en el eje queda elegida acá, y al revés.
//
// SOBRE EL `DataTable` Y NO A MANO. Era una tabla escrita a mano con `<TableRow>` y un pie pegado
// abajo. Se pasó al componente del sistema para que este grano tenga lo mismo que el de pedidos —orden
// por columna, elegir y reordenar columnas con el estado persistido por `tableId`, densidad, buscador y
// exportar— y para que cambiar de "Cliente" a "Pedido" no cambie también los controles disponibles,
// que era justo lo que hacía sospechar que eran dos pantallas distintas.
//
// LO QUE SE PERDIÓ EN EL CAMBIO, y dónde fue a parar: el `DataTable` no tiene pie de totales. Los
// totales viven ahora en su toolbar, arriba a la derecha, y siguen sumando TODAS las paradas del viaje
// —cerradas o no— porque la pregunta que contestan es "cuánta plata hay en la calle en este camión", y
// una parada pendiente también la tiene.
//
// De dónde sale cada columna:
//   Ventana                → dispatch_delivery_points.delivery_window_start/end
//   Plan                   → derivado (ver `linea-tiempo.ts`)
//   Real / Atención        → delivery_orders.arrived_at / delivered_at
//   Peso                   → dispatch_delivery_points.total_weight_kg
//   A cobrar … Saldo       → DERIVADOS de delivery_order_items (delivered_qty × unit_price_snapshot) y
//                            delivery_payment_references. Ojo: el ESTADO agregado del cobro no tiene
//                            columna en ninguna tabla — lo calcula el frontend. Es el mismo hueco que
//                            marca la pestaña "Cobro" del detalle de la parada.
//   Inc.                   → count(delivery_incidents)
import { useMemo } from 'react'
import { AlertTriangle, PackageCheck } from 'lucide-react'
import { DataTable, defineColumns } from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { bs, ESTADO_COBRO, METODO_PAGO } from './cobro-estilo'
import { EstadoEntregaBadge } from './EstadoEntregaBadge'
import { duracionTexto } from './monitoreo-data'
import type { MetodoPago } from './monitoreo-data'
import { desvioTexto, horaDeEje, TIER_DESVIO, type HitoLineaTiempo, type LineaTiempo } from './linea-tiempo'

/** Celda numérica: alineada a la derecha y con cifras de ancho fijo, para poder comparar en vertical. */
const NUM = 'text-right tabular-nums'

/**
 * Una fila: una parada, con todo lo que la tabla ordena ya PLANO.
 *
 * `HitoLineaTiempo` tiene el cobro anidado en `entrega.cobro`, y `accessorKey` solo alcanza campos de
 * primer nivel: dejarlo anidado significaba que las cuatro columnas de plata no se pudieran ordenar,
 * que es justamente lo que uno quiere hacer con una columna de plata. El `hito` viaja igual, para lo
 * que necesita el objeto entero.
 */
interface FilaParada {
  id: string
  secuencia: number
  cliente: string
  puntoEntrega: string
  ventana: string
  plan: string
  real: string
  desvio: number | null
  atencion: number | null
  pesoKg: number
  pedidos: number
  aCobrar: number
  cobrado: number
  enProceso: number
  saldo: number
  incidencias: number
  metodos: MetodoPago[]
  hito: HitoLineaTiempo
}

export function TablaViajeMonitoreo({
  linea,
  seleccion,
  onSeleccionar,
  vivas,
}: {
  linea: LineaTiempo
  seleccion: number | null
  onSeleccionar: (secuencia: number) => void
  /** Ids de las entregas que acaban de cambiar, para el destello. */
  vivas: Set<string>
}) {
  const filas = useMemo<FilaParada[]>(
    () =>
      linea.hitos.map((hito) => ({
        id: hito.entrega.id,
        secuencia: hito.secuencia,
        cliente: hito.cliente,
        puntoEntrega: hito.puntoEntrega,
        ventana: hito.ventana,
        plan: horaDeEje(hito.planLlegada),
        real: hito.realLlegada === null ? '—' : horaDeEje(hito.realLlegada),
        desvio: hito.desvioLlegada,
        atencion: hito.atencion,
        pesoKg: hito.entrega.pesoKg,
        pedidos: hito.entrega.pedidos.length,
        aCobrar: hito.entrega.cobro.aCobrar,
        cobrado: hito.entrega.cobro.cobrado,
        enProceso: hito.entrega.cobro.enProceso,
        saldo: hito.entrega.cobro.saldo,
        incidencias: hito.incidencias,
        metodos: Array.from(new Set(hito.entrega.cobro.pagos.map((p) => p.metodo))),
        hito,
      })),
    [linea.hitos],
  )

  const totales = useMemo(
    () =>
      filas.reduce(
        (acc, f) => ({
          pesoKg: acc.pesoKg + f.pesoKg,
          aCobrar: acc.aCobrar + f.aCobrar,
          cobrado: acc.cobrado + f.cobrado,
          enProceso: acc.enProceso + f.enProceso,
          saldo: acc.saldo + f.saldo,
        }),
        { pesoKg: 0, aCobrar: 0, cobrado: 0, enProceso: 0, saldo: 0 },
      ),
    [filas],
  )

  const columns = useMemo(
    () =>
      defineColumns<FilaParada>([
        {
          id: 'secuencia',
          header: '#',
          accessorKey: 'secuencia',
          size: 56,
          pin: 'left',
          cell: (row) => (
            <span className="block text-center font-medium tabular-nums text-muted-foreground">
              {row.secuencia}
            </span>
          ),
        },
        {
          id: 'cliente',
          header: 'Cliente',
          accessorKey: 'cliente',
          size: 230,
          pin: 'left',
          cell: (row) => (
            <div
              className="flex min-w-0 flex-col leading-tight"
              title={row.hito.entrega.receptor ? `Recibió: ${row.hito.entrega.receptor}` : undefined}
            >
              <span className="truncate font-medium text-foreground">{row.cliente}</span>
              <span className="truncate text-[11px] text-muted-foreground">{row.puntoEntrega}</span>
            </div>
          ),
        },
        {
          id: 'estado',
          header: 'Estado',
          size: 132,
          enableSorting: false,
          // El motivo va en el título y no en una columna propia: solo existe en las paradas que no se
          // entregaron, y una columna vacía en 18 de 20 filas es ancho robado a las que sí tienen dato.
          cell: (row) => (
            <span title={row.hito.entrega.motivo || undefined}>
              <EstadoEntregaBadge estado={row.hito.estado} />
            </span>
          ),
        },
        {
          id: 'ventana',
          header: 'Ventana',
          accessorKey: 'ventana',
          size: 112,
          cell: (row) => (
            <span
              className={cn(
                'tabular-nums',
                row.hito.fueraDeVentana ? 'font-medium text-destructive' : 'text-muted-foreground',
              )}
              title={row.hito.fueraDeVentana ? 'Se cerró fuera de la ventana comprometida' : undefined}
            >
              {row.ventana}
            </span>
          ),
        },
        {
          id: 'plan',
          header: 'Plan',
          accessorKey: 'plan',
          size: 72,
          cell: (row) => <span className={cn(NUM, 'block text-muted-foreground')}>{row.plan}</span>,
        },
        {
          id: 'real',
          header: 'Real',
          accessorKey: 'real',
          size: 72,
          cell: (row) => (
            <span className={cn(NUM, 'block', row.real === '—' && 'text-muted-foreground')}>{row.real}</span>
          ),
        },
        {
          id: 'desvio',
          header: 'Desvío',
          accessorKey: 'desvio',
          size: 88,
          cell: (row) =>
            row.hito.tier ? (
              <span className={cn(NUM, 'block font-semibold', TIER_DESVIO[row.hito.tier].texto)}>
                {desvioTexto(row.desvio)}
              </span>
            ) : (
              <span className={cn(NUM, 'block text-muted-foreground')}>—</span>
            ),
        },
        {
          id: 'atencion',
          header: 'Atención',
          accessorKey: 'atencion',
          size: 88,
          cell: (row) => (
            <span className={cn(NUM, 'block text-muted-foreground')}>{duracionTexto(row.atencion)}</span>
          ),
        },
        {
          id: 'pesoKg',
          header: 'Peso kg',
          accessorKey: 'pesoKg',
          size: 88,
          cell: (row) => <span className={cn(NUM, 'block')}>{bs(row.pesoKg)}</span>,
        },
        {
          id: 'pedidos',
          header: 'Ped.',
          accessorKey: 'pedidos',
          size: 64,
          cell: (row) => (
            <span
              className={cn(NUM, 'block text-muted-foreground')}
              title={row.hito.entrega.pedidos.map((p) => p.documento).join('\n')}
            >
              {row.pedidos}
            </span>
          ),
        },
        {
          id: 'aCobrar',
          header: 'A cobrar',
          accessorKey: 'aCobrar',
          size: 96,
          cell: (row) => <span className={cn(NUM, 'block')}>{bs(row.aCobrar)}</span>,
        },
        {
          id: 'cobrado',
          header: 'Cobrado',
          accessorKey: 'cobrado',
          size: 96,
          cell: (row) => (
            <span className={cn(NUM, 'block', row.cobrado > 0 && 'text-emerald-600 dark:text-emerald-400')}>
              {bs(row.cobrado)}
            </span>
          ),
        },
        {
          id: 'enProceso',
          header: 'En proceso',
          accessorKey: 'enProceso',
          size: 104,
          cell: (row) => (
            <span className={cn(NUM, 'block', row.enProceso > 0 && 'text-sky-600 dark:text-sky-400')}>
              {bs(row.enProceso)}
            </span>
          ),
        },
        {
          id: 'saldo',
          header: 'Saldo',
          accessorKey: 'saldo',
          size: 96,
          cell: (row) => (
            <span className={cn(NUM, 'block', row.saldo > 0 && 'font-medium text-destructive')}>
              {bs(row.saldo)}
            </span>
          ),
        },
        {
          id: 'cobro',
          header: 'Cobro',
          size: 168,
          enableSorting: false,
          cell: (row) => (
            <div className="flex items-center gap-1.5">
              <Badge
                variant="outline"
                className={cn(
                  'shrink-0 rounded-full font-medium',
                  ESTADO_COBRO[row.hito.entrega.cobro.estado].badge,
                )}
              >
                {ESTADO_COBRO[row.hito.entrega.cobro.estado].label}
              </Badge>
              {/* Los métodos como íconos y no como texto: son hasta cuatro por parada y el nombre
                  completo haría la columna más ancha que la del cliente. */}
              {row.metodos.map((metodo) => {
                const Icono = METODO_PAGO[metodo].icono
                return (
                  <Icono
                    key={metodo}
                    className="size-3.5 shrink-0 text-muted-foreground"
                    aria-label={METODO_PAGO[metodo].label}
                  />
                )
              })}
            </div>
          ),
        },
        {
          id: 'incidencias',
          header: 'Inc.',
          accessorKey: 'incidencias',
          size: 64,
          cell: (row) =>
            row.incidencias > 0 ? (
              <span className={cn(NUM, 'flex items-center justify-end gap-1 font-medium text-destructive')}>
                <AlertTriangle className="size-3.5" />
                {row.incidencias}
              </span>
            ) : row.hito.entrega.comprobante ? (
              <PackageCheck
                className="ml-auto size-3.5 text-muted-foreground"
                aria-label="Con comprobante de entrega"
              />
            ) : (
              <span className={cn(NUM, 'block text-muted-foreground')}>—</span>
            ),
        },
      ]),
    [],
  )

  /**
   * El pie que el `DataTable` no tiene, en su toolbar.
   *
   * Suma TODAS las paradas del viaje y no las que quedaron después de buscar: la pregunta es cuánta
   * plata hay en la calle en este camión, y un total que se mueve al escribir en el buscador contesta
   * otra cosa. La cuenta de paradas de la izquierda es la que dice cuántas filas hay.
   */
  const barraTotales = (
    <span className="mr-1 flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">
        {linea.hitos.length} paradas · {linea.aTiempo} en horario de {linea.medidas} medidas
      </span>
      <span className="tabular-nums text-muted-foreground">{bs(totales.pesoKg)} kg</span>
      <span className="tabular-nums text-muted-foreground">A cobrar {bs(totales.aCobrar)}</span>
      <span className={cn('font-semibold tabular-nums', totales.saldo > 0 && 'text-destructive')}>
        Saldo {bs(totales.saldo)}
      </span>
    </span>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 py-2">
      <DataTable
        toolbar={barraTotales}
        tableId="monitoreo-viaje-paradas"
        columns={columns}
        data={filas}
        getRowId={(row) => row.id}
        fillHeight
        stickyHeader
        searchable
        searchPlaceholder="Buscar cliente o punto de entrega…"
        searchKeys={['cliente', 'puntoEntrega', 'ventana']}
        exportable
        exportFilename="paradas-del-viaje"
        emptyTitle="Sin paradas"
        emptyMessage="Este viaje no tiene paradas cargadas."
        onRowClick={(row) => onSeleccionar(row.secuencia)}
        rowClassName={(row) =>
          cn(
            'cursor-pointer',
            row.secuencia === seleccion && 'bg-primary/5',
            // `fila-viva` es la barra de acento del listado de monitoreo, reusada tal cual: el destello
            // es el canal de VISIÓN PERIFÉRICA —la celda dice qué cambió, esto dice DÓNDE mirar— y
            // tiene que significar lo mismo en las dos pantallas.
            vivas.has(row.id) && 'fila-viva',
          )
        }
      />
    </div>
  )
}
