// Listado del MONITOREO (maestro). Ahora ofrece dos granularidades:
//   · Ordenes  → una fila por orden de transporte en curso.
//   · Pedidos  → una fila por pedido comercial dentro de esas ordenes.
//
// Las dos leen el MISMO stream de flota: cambia el nivel al que se lo proyecta, no el contrato.
import { useMemo, useState } from 'react'
import { AlertTriangle, ChartGantt, MapPin, Package, Radio, Store, Truck, User } from 'lucide-react'
import { DataTable, defineColumns, defineFilters, FilterBar } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { openRoute } from '@/core/routing/open-route'
import { FiltroPopover } from '../FiltroPopover'
import { CanalGlyph } from '../canal-glyph'
import { CANAL_META, type CanalId } from '../mock-data'
import { EstadoEntregaBadge, EstadoViajeBadge } from './EstadoEntregaBadge'
import { Frescura, ProgresoEntregas } from './ProgresoEntregas'
import { Destello, useFilasVivas } from './destello'
import { bs } from './cobro-estilo'
import { pedidosDeFila, useFlotaViva, type FilaMonitoreo, type FilaPedidoMonitoreo } from './use-flota-viva'
import { ViajeDialog } from './ViajeDialog'
import { UMBRAL_SENAL_VIEJA_MIN, minutosSinSenal, type ItemActual } from './tracking-dynamo'
import { duracionTexto, promedioMin } from './monitoreo-data'
import { ESTADO_ENTREGA, type EstadoEntrega, type EstadoViaje } from './monitoreo-estado'

const ESTADO_VIAJE_OPCIONES: { label: string; value: EstadoViaje }[] = [
  { label: 'Sin salir', value: 'pendiente' },
  { label: 'En ruta', value: 'en_ruta' },
  { label: 'Finalizado', value: 'finalizado' },
]

const ESTADO_ENTREGA_OPCIONES: { label: string; value: EstadoEntrega }[] = (
  Object.entries(ESTADO_ENTREGA) as Array<[EstadoEntrega, { label: string }]>
).map(([value, meta]) => ({
  label: meta.label,
  value,
}))

type VistaMonitoreo = 'ordenes' | 'pedidos'

const VISTAS: { id: VistaMonitoreo; label: string; icono: typeof Truck; ayuda: string }[] = [
  {
    id: 'ordenes',
    label: 'Ordenes',
    icono: Truck,
    ayuda: 'Una fila por orden de transporte en curso',
  },
  {
    id: 'pedidos',
    label: 'Pedidos',
    icono: Package,
    ayuda: 'Una fila por pedido comercial dentro de las ordenes despachadas',
  },
]

interface MonitoreoFilters extends Record<string, unknown> {
  texto?: string
  estadoViaje?: EstadoViaje
  estadoEntrega?: EstadoEntrega
}

const filterDefsOrdenes = defineFilters<MonitoreoFilters>([
  { type: 'text', id: 'texto', label: 'Orden o camion' },
  { type: 'select', id: 'estadoViaje', label: 'Estado del viaje', options: ESTADO_VIAJE_OPCIONES },
])

const filterDefsPedidos = defineFilters<MonitoreoFilters>([
  { type: 'text', id: 'texto', label: 'Pedido, cliente o camion' },
  { type: 'select', id: 'estadoViaje', label: 'Estado del viaje', options: ESTADO_VIAJE_OPCIONES },
  { type: 'select', id: 'estadoEntrega', label: 'Estado de la parada', options: ESTADO_ENTREGA_OPCIONES },
])

function IndicadorInline({ label, valor, ayuda }: { label: string; valor: string; ayuda: string }) {
  return (
    <span className="flex items-baseline gap-1.5 text-xs" title={ayuda}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{valor}</span>
    </span>
  )
}

function SelectorVista({
  vista,
  onCambiar,
}: {
  vista: VistaMonitoreo
  onCambiar: (vista: VistaMonitoreo) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Granularidad del monitoreo"
      className="flex flex-wrap items-center gap-1.5"
    >
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
 * Ultima senal del GPS. Recibe el item crudo y deriva los minutos aca: `now() - trackedAt`.
 */
function UltimaSenal({ tracking }: { tracking: ItemActual | null }) {
  if (!tracking) return <span className="text-xs text-muted-foreground">-</span>
  const minutos = minutosSinSenal(tracking.trackedAt, Date.now())
  const vieja = minutos > UMBRAL_SENAL_VIEJA_MIN
  return (
    <span
      className={cn(
        'flex items-center justify-end gap-1 text-xs tabular-nums',
        vieja ? 'font-medium text-destructive' : 'text-muted-foreground',
      )}
    >
      {vieja ? <AlertTriangle className="size-3" /> : <Radio className="senal-viva size-3 text-primary" />}
      hace {minutos} min
    </span>
  )
}

export function MonitoreoView() {
  const [filters, setFilters] = useState<MonitoreoFilters>({})
  const [vista, setVista] = useState<VistaMonitoreo>('ordenes')
  /**
   * Canal y cliente, SOLO en la vista de pedidos.
   *
   * No entran al `FilterBar` declarativo de al lado porque su `select` es de un valor y sin buscador:
   * los canales son seis pero los clientes son cientos, y elegir uno de una lista sin búsqueda no es
   * un filtro. Van en el mismo `FiltroPopover` que usa el planificador — multi-select y con buscador —
   * y por eso los dos comparten control aunque uno tenga seis opciones y el otro trescientas.
   *
   * Vacío NO filtra: es la convención de narrowing del resto del mockup.
   */
  const [canales, setCanales] = useState<CanalId[]>([])
  const [clientes, setClientes] = useState<string[]>([])

  // Snapshot + SSE de flota. El scope es el `distributorId` del hook: los endpoints del monitor
  // vienen ya acotados por distribuidora y se parchean por id.
  const { filas, actualizadoAt } = useFlotaViva()
  const pedidos = useMemo(() => filas.flatMap(pedidosDeFila), [filas])

  const ordenesVisibles = useMemo(() => {
    const texto = filters.texto?.toString().trim().toLowerCase() ?? ''
    return filas.filter(
      (fila) =>
        (!filters.estadoViaje || fila.estadoViaje === filters.estadoViaje) &&
        (!texto ||
          fila.codigo.toLowerCase().includes(texto) ||
          fila.camion.toLowerCase().includes(texto) ||
          fila.chofer.toLowerCase().includes(texto)),
    )
  }, [filas, filters])

  const pedidosVisibles = useMemo(() => {
    const texto = filters.texto?.toString().trim().toLowerCase() ?? ''
    return pedidos.filter(
      (pedido) =>
        (!filters.estadoViaje || pedido.estadoViaje === filters.estadoViaje) &&
        (!filters.estadoEntrega || pedido.estadoEntrega === filters.estadoEntrega) &&
        (canales.length === 0 || canales.includes(pedido.canal)) &&
        (clientes.length === 0 || clientes.includes(pedido.cliente)) &&
        (!texto ||
          pedido.pedido.toLowerCase().includes(texto) ||
          pedido.ordenCodigo.toLowerCase().includes(texto) ||
          pedido.camion.toLowerCase().includes(texto) ||
          pedido.cliente.toLowerCase().includes(texto) ||
          pedido.puntoEntrega.toLowerCase().includes(texto)),
    )
  }, [filters, pedidos, canales, clientes])

  /**
   * Las opciones de canal y de cliente, con su peso escrito al costado y ordenadas por monto.
   *
   * Salen del universo COMPLETO del día y no de lo que ya quedó filtrado: si se recalcularan contra el
   * resultado, elegir un canal borraría de la lista a los demás y no habría forma de cambiar de opinión
   * sin limpiar el filtro primero.
   *
   * El monto al costado es lo que convierte al desplegable en un resumen: se ve el reparto entero antes
   * de elegir, que es la pregunta que trae a alguien a agrupar por canal o por cliente.
   */
  const opcionesCanal = useMemo(() => {
    const acumulado = new Map<CanalId, { pedidos: number; total: number }>()
    for (const pedido of pedidos) {
      const actual = acumulado.get(pedido.canal) ?? { pedidos: 0, total: 0 }
      actual.pedidos += 1
      actual.total += pedido.total
      acumulado.set(pedido.canal, actual)
    }
    return [...acumulado.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([canal, datos]) => ({
        value: canal,
        label: CANAL_META[canal].label,
        glyph: <CanalGlyph canal={canal} size={13} />,
        hint: `${datos.pedidos} · ${bs(datos.total)}`,
      }))
  }, [pedidos])

  const opcionesCliente = useMemo(() => {
    const acumulado = new Map<string, { pedidos: number; total: number }>()
    for (const pedido of pedidos) {
      const actual = acumulado.get(pedido.cliente) ?? { pedidos: 0, total: 0 }
      actual.pedidos += 1
      actual.total += pedido.total
      acumulado.set(pedido.cliente, actual)
    }
    return [...acumulado.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([cliente, datos]) => ({
        value: cliente,
        label: cliente,
        hint: `${datos.pedidos} · ${bs(datos.total)}`,
      }))
  }, [pedidos])

  const flota = useMemo(
    () => ({
      atencion: promedioMin(ordenesVisibles.map((fila) => fila.resumen.atencionPromedioMin)),
      enRuta: promedioMin(ordenesVisibles.map((fila) => fila.resumen.enRutaMin)),
    }),
    [ordenesVisibles],
  )

  const resumenPedidos = useMemo(
    () => ({
      entregados: pedidosVisibles.filter((pedido) => pedido.estadoEntrega === 'entregado').length,
      problema: pedidosVisibles.filter(
        (pedido) =>
          pedido.estadoEntrega === 'fallido' || pedido.estadoEntrega === 'devuelto' || pedido.incidencias > 0,
      ).length,
      monto: pedidosVisibles.reduce((acc, pedido) => acc + pedido.total, 0),
    }),
    [pedidosVisibles],
  )

  const vivasOrdenes = useFilasVivas(
    filas,
    (fila) => fila.id,
    (fila) =>
      [
        fila.estadoViaje,
        fila.resumen.progresoPct,
        fila.resumen.incidencias,
        fila.tracking?.trackedAt ?? '-',
      ].join('|'),
  )

  // A nivel pedido NO se usa el ping para la barra lateral viva: una sola posicion no deberia encender
  // diez filas hermanas del mismo viaje cada 8 s. El texto de "ultima senal" igual se actualiza.
  const vivasPedidos = useFilasVivas(
    pedidos,
    (pedido) => pedido.id,
    (pedido) => [pedido.estadoViaje, pedido.estadoEntrega, pedido.incidencias].join('|'),
  )

  const abrirOrden = (fila: FilaMonitoreo) => openRoute('monitoreo-detalle', { ordenId: fila.id })
  const abrirPedido = (pedido: FilaPedidoMonitoreo) =>
    openRoute('monitoreo-detalle-pedido', { pedidoId: pedido.id })

  const [viajeAbierto, setViajeAbierto] = useState<FilaMonitoreo | null>(null)

  const columnsOrdenes = useMemo(
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
          header: 'Camion',
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
          cell: (row) => <span className="truncate">{row.chofer}</span>,
        },
        {
          id: 'estadoViaje',
          header: 'Viaje',
          accessorKey: 'estadoViaje',
          size: 120,
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
                <span className="text-xs text-muted-foreground">-</span>
              )}
            </Destello>
          ),
        },
        {
          id: 'senal',
          header: 'Ultima senal',
          size: 130,
          meta: { align: 'right' },
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
          header: 'Atencion prom.',
          size: 120,
          enableSorting: false,
          meta: { align: 'right' },
          cell: (row) => (
            <span
              className="tabular-nums text-muted-foreground"
              title="Promedio de tiempo parado en el punto de entrega"
            >
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
            <span
              className="tabular-nums text-muted-foreground"
              title="Desde la salida del deposito hasta la ultima parada cerrada"
            >
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
              <Button
                size="icon-sm"
                variant="ghost"
                title="Linea de tiempo y detalle del viaje"
                onClick={() => setViajeAbierto(row)}
              >
                <ChartGantt className="size-4" />
                <span className="sr-only">Linea de tiempo y detalle</span>
              </Button>
              <Button size="sm" variant="outline" onClick={() => abrirOrden(row)}>
                <MapPin className="size-3.5" />
                Seguir
              </Button>
            </div>
          ),
        },
      ]),
    [],
  )

  const columnsPedidos = useMemo(
    () =>
      defineColumns<FilaPedidoMonitoreo>([
        {
          id: 'pedido',
          header: 'Pedido',
          accessorKey: 'pedido',
          size: 110,
          pin: 'left',
          cell: (row) => <span className="font-mono text-xs font-medium">{row.pedido}</span>,
        },
        {
          id: 'ordenCodigo',
          header: 'Orden',
          accessorKey: 'ordenCodigo',
          size: 92,
          pin: 'left',
          cell: (row) => <span className="font-mono text-xs text-muted-foreground">{row.ordenCodigo}</span>,
        },
        {
          id: 'cliente',
          header: 'Cliente',
          size: 230,
          cell: (row) => (
            <div
              className="flex min-w-0 flex-col leading-tight py-0.5"
              title={`${row.cliente} - ${row.puntoEntrega}`}
            >
              <span className="truncate font-medium text-foreground">{row.cliente}</span>
              <span className="truncate text-[11px] text-muted-foreground">{row.puntoEntrega}</span>
            </div>
          ),
        },
        {
          // La columna existe PORQUE existe el filtro: acotar por una dimensión que la tabla no
          // muestra deja al usuario sin poder verificar qué le quedó adelante.
          id: 'canal',
          header: 'Canal',
          accessorKey: 'canal',
          size: 140,
          cell: (row) => (
            <span className="flex items-center gap-1.5 text-xs">
              <CanalGlyph canal={row.canal} size={12} />
              <span className="truncate">{CANAL_META[row.canal].label}</span>
            </span>
          ),
        },
        {
          id: 'parada',
          header: 'Parada',
          size: 86,
          cell: (row) => (
            <div className="flex flex-col items-end text-[11px] tabular-nums">
              <span className="font-medium text-foreground">#{row.secuencia}</span>
              <span className="text-muted-foreground">{row.pedidosEnParada} ped.</span>
            </div>
          ),
          meta: { align: 'right' },
        },
        {
          id: 'estadoEntrega',
          header: 'Parada',
          accessorKey: 'estadoEntrega',
          size: 132,
          cell: (row) => <EstadoEntregaBadge estado={row.estadoEntrega} />,
        },
        {
          id: 'estadoViaje',
          header: 'Viaje',
          accessorKey: 'estadoViaje',
          size: 120,
          cell: (row) => <EstadoViajeBadge estado={row.estadoViaje} />,
        },
        {
          id: 'camion',
          header: 'Camion',
          accessorKey: 'camion',
          size: 145,
          cell: (row) => (
            <span className="flex items-center gap-2">
              <Truck className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">{row.camion}</span>
            </span>
          ),
        },
        {
          id: 'formaPago',
          header: 'Pago',
          accessorKey: 'formaPago',
          size: 110,
          cell: (row) => <span className="text-xs text-muted-foreground">{row.formaPago}</span>,
        },
        {
          id: 'pesoKg',
          header: 'Peso kg',
          accessorKey: 'pesoKg',
          size: 90,
          meta: { align: 'right' },
          cell: (row) => <span className="tabular-nums text-muted-foreground">{bs(row.pesoKg)}</span>,
        },
        {
          id: 'total',
          header: 'Monto Bs',
          accessorKey: 'total',
          size: 110,
          meta: { align: 'right' },
          cell: (row) => <span className="tabular-nums font-medium">{bs(row.total)}</span>,
        },
        {
          id: 'incidencias',
          header: 'Incid.',
          accessorKey: 'incidencias',
          size: 80,
          meta: { align: 'right' },
          cell: (row) =>
            row.incidencias > 0 ? (
              <span className="flex items-center justify-end gap-1 font-medium tabular-nums text-destructive">
                <AlertTriangle className="size-3.5" />
                {row.incidencias}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">-</span>
            ),
        },
        {
          id: 'senal',
          header: 'Ultima senal',
          size: 130,
          meta: { align: 'right' },
          cell: (row) => <UltimaSenal tracking={row.tracking} />,
        },
        {
          id: 'acciones',
          header: '',
          size: 190,
          enableSorting: false,
          cell: (row) => (
            <div className="flex items-center justify-end gap-1">
              <Button
                size="icon-sm"
                variant="ghost"
                title="Linea de tiempo y detalle del viaje"
                onClick={() => {
                  const orden = filas.find((fila) => fila.id === row.ordenId)
                  if (orden) setViajeAbierto(orden)
                }}
              >
                <ChartGantt className="size-4" />
                <span className="sr-only">Linea de tiempo y detalle</span>
              </Button>
              <Button size="sm" variant="outline" onClick={() => abrirPedido(row)}>
                <MapPin className="size-3.5" />
                Seguir
              </Button>
            </div>
          ),
        },
      ]),
    [filas],
  )

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">Monitoreo de entregas</h2>
          <Frescura desde={actualizadoAt} />
        </div>

        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm text-muted-foreground">
              {vista === 'ordenes'
                ? 'Ordenes de transporte despachadas. Abri una para ver su recorrido y el avance parada por parada.'
                : 'Pedidos comerciales dentro de ordenes despachadas. Cada fila hereda el estado de la parada que lo transporta.'}
            </p>
            <SelectorVista vista={vista} onCambiar={setVista} />
          </div>

          <div className="flex shrink-0 items-baseline gap-4">
            {vista === 'ordenes' ? (
              <>
                <IndicadorInline
                  label="Atencion prom."
                  valor={duracionTexto(flota.atencion)}
                  ayuda="Promedio de tiempo parado en el punto de entrega, sobre los viajes visibles"
                />
                <IndicadorInline
                  label="En ruta prom."
                  valor={duracionTexto(flota.enRuta)}
                  ayuda="Promedio de tiempo en la calle por viaje, desde la salida del deposito hasta la ultima parada cerrada"
                />
              </>
            ) : (
              <>
                <IndicadorInline
                  label="Entregados"
                  valor={String(resumenPedidos.entregados)}
                  ayuda="Pedidos cuya parada ya quedo entregada dentro del universo visible"
                />
                <IndicadorInline
                  label="Con problema"
                  valor={String(resumenPedidos.problema)}
                  ayuda="Pedidos cuya parada fallo, fue devuelta o registra incidencias"
                />
                <IndicadorInline
                  label="Monto visible"
                  valor={`Bs ${bs(resumenPedidos.monto)}`}
                  ayuda="Suma del monto comercial de los pedidos visibles"
                />
              </>
            )}
          </div>
        </div>
      </div>

      {vista === 'ordenes' ? (
        <DataTable
          tableId="mockup-monitoreo-ordenes"
          columns={columnsOrdenes}
          data={ordenesVisibles}
          getRowId={(row) => row.id}
          rowClassName={(row) => (vivasOrdenes.has(row.id) ? 'fila-viva' : '')}
          onRowDoubleClick={abrirOrden}
          emptyTitle="Sin ordenes en monitoreo"
          emptyMessage="Ninguna orden de transporte coincide con los filtros."
          fillHeight
          filterBar={
            <FilterBar
              defs={filterDefsOrdenes}
              values={filters}
              onChange={(updates) => setFilters((prev) => ({ ...prev, ...updates }))}
            />
          }
        />
      ) : (
        <DataTable
          tableId="mockup-monitoreo-pedidos"
          columns={columnsPedidos}
          data={pedidosVisibles}
          getRowId={(row) => row.id}
          rowClassName={(row) => (vivasPedidos.has(row.id) ? 'fila-viva' : '')}
          onRowDoubleClick={abrirPedido}
          emptyTitle="Sin pedidos en monitoreo"
          emptyMessage="Ningun pedido comercial coincide con los filtros."
          fillHeight
          filterBar={
            <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-2">
              <FilterBar
                defs={filterDefsPedidos}
                values={filters}
                onChange={(updates) => setFilters((prev) => ({ ...prev, ...updates }))}
              />
              {/* Canal y cliente van DESPUÉS de los estados y separados por una línea: los de la
                  izquierda acotan por situación del viaje, estos por a quién se le entrega. Son dos
                  preguntas distintas y mezcladas en una fila se leen como cinco controles sueltos. */}
              <div className="flex flex-wrap items-center gap-1.5 border-l border-border pl-3">
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
                  emptyText="Sin canales en la flota"
                />
                <FiltroPopover
                  label="Cliente"
                  icon={User}
                  options={opcionesCliente}
                  active={clientes}
                  onToggle={(value) =>
                    setClientes((previos) =>
                      previos.includes(value)
                        ? previos.filter((cliente) => cliente !== value)
                        : [...previos, value],
                    )
                  }
                  searchPlaceholder="Buscar cliente…"
                  emptyText="Sin clientes en la flota"
                />
                {(canales.length > 0 || clientes.length > 0) && (
                  <button
                    type="button"
                    title="Quitar los filtros de canal y cliente"
                    onClick={() => {
                      setCanales([])
                      setClientes([])
                    }}
                    className="cursor-pointer px-1 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Quitar
                  </button>
                )}
              </div>
            </div>
          }
        />
      )}

      {viajeAbierto && <ViajeDialog fila={viajeAbierto} onClose={() => setViajeAbierto(null)} />}
    </div>
  )
}
