// La tercera lectura del viaje: PEDIDOS, con filtro por canal.
//
// Nace del correo de logística, que en dos puntos seguidos pide lo mismo: "una tabla resumen de los
// clientes O PEDIDOS" y "no solo la tabla detalle de clientes, sino también agrupadas por canal o
// vendedor". O sea: el detalle de la orden tiene que poder pivotearse, no solo leerse.
//
// EL CAMINO HASTA EL CONTROL ACTUAL, para no repetirlo:
//   1. Agrupar con encabezados de grupo. Un viaje tiene ~20 paradas y el catálogo son 6 canales: seis
//      títulos sobre dos o tres filas cada uno. Además rompe el orden por columna —dentro del grupo ya
//      no se compara contra el resto— y obliga a sumar los subtotales a ojo.
//   2. Franja de chips, uno por canal, con sus totales. Se leía bien… con seis canales. No sobrevive a
//      VENDEDOR, que es la otra mitad del mismo pedido del correo: son 30 en el maestro y en un viaje
//      largo aparecen veinte. Treinta chips no son un filtro, son otra tabla.
//   3. `FiltroPopover`, el mismo control que ya usan el planificador y la selección de pedidos. Un
//      botón por dimensión, buscador adentro, multi-select. Escala igual con 6 que con 30, y el día
//      que el vendedor exista entra como un segundo botón idéntico al lado.
//
// Lo que la opción 3 se llevaba puesto era el RESUMEN: un popover cerrado no dice dónde está la plata.
// Por eso cada fila del popover lleva su monto (`FiltroOption.hint`): el reparto por canal se ve
// completo antes de elegir.
//
// DÓNDE VIVE CADA COSA. El filtro se dibuja en la barra del DIÁLOGO, junto a los otros dos controles —
// vista y grano—, no acá adentro: son los tres botones con los que se decide qué se está mirando y
// tienen que estar en la misma línea. Por eso este componente no tiene estado propio de filtro; recibe
// las filas ya construidas (`filasDePedidos`) y los canales elegidos. Los totales sí se quedan: son el
// pie de esta tabla, que es lo único que al `DataTable` le falta.
//
// LO QUE NO SE PUEDE MOSTRAR A ESTE GRANO, y por qué:
//   · El ESTADO de entrega es de la PARADA, no del pedido. `delivery_orders` tiene una fila por parada
//     (25.«findDeliveriesByOrder»), así que los pedidos que el camión baja en un mismo local comparten
//     estado por construcción. Se repite en cada fila a propósito: es el dato real.
//   · El COBRO tampoco baja: `delivery_payment_references` cuelga de `delivery_order_sales`, y el pie
//     de la tabla de paradas ya lo suma. Acá van peso y monto, que sí son del pedido.
//
// EL CANAL VIVE EN LA PARADA, no en el pedido. Es `dispatch_delivery_points.sale_channel_id`, y por eso
// filtrar por canal nunca parte una parada al medio: todos los pedidos de un local caen en el mismo
// canal. El vendedor NO tendría esa propiedad — es del pedido.
import { useMemo } from 'react'
import { DataTable, defineColumns } from '@/components/data-table'
import { cn } from '@/lib/utils'
import { CANAL_META, type CanalId } from '../mock-data'
import { CanalGlyph } from '../canal-glyph'
import type { FiltroOption } from '../FiltroPopover'
import { bs } from './cobro-estilo'
import { EstadoEntregaBadge } from './EstadoEntregaBadge'
import { horaDeEje, type HitoLineaTiempo, type LineaTiempo } from './linea-tiempo'

/**
 * Una fila: un pedido, ya resuelto contra la parada que lo bajó.
 *
 * Es PLANA a propósito. El `searchKeys` del DataTable solo alcanza campos de primer nivel, así que el
 * cliente y el punto de entrega tienen que estar acá arriba y no colgando de `hito` — si no, no se
 * puede buscar por ellos.
 */
interface FilaPedido {
  id: string
  salesOrder: string
  documento: string
  secuencia: number
  cliente: string
  puntoEntrega: string
  canal: CanalId
  canalLabel: string
  formaPago: string
  entrega: string
  pesoKg: number
  total: number
  hito: HitoLineaTiempo
}

/**
 * Las filas del grano pedido.
 *
 * Vive afuera del componente porque el FILTRO de canal se dibuja en la barra del diálogo, no acá, y
 * necesita las mismas filas para saber qué canales ofrecer y cuánto pesa cada uno. Derivarlas dos
 * veces sería aceptar que las dos superficies se desincronicen.
 */
export function filasDePedidos(linea: LineaTiempo): FilaPedido[] {
  return linea.hitos.flatMap((hito) =>
    hito.entrega.pedidos.map((pedido) => ({
      id: pedido.id,
      salesOrder: pedido.salesOrder,
      documento: pedido.documento,
      secuencia: hito.secuencia,
      cliente: hito.cliente,
      puntoEntrega: hito.puntoEntrega,
      // El canal se toma de la PARADA y no del pedido: es donde vive en el esquema.
      canal: hito.entrega.canal,
      canalLabel: CANAL_META[hito.entrega.canal].label,
      formaPago: pedido.formaPago,
      entrega: hito.realCierre === null ? '—' : horaDeEje(hito.realCierre),
      pesoKg: pedido.pesoKg,
      total: pedido.total,
      hito,
    })),
  )
}

/**
 * Las opciones del filtro, ordenadas por monto descendente y con el monto escrito al costado.
 *
 * Por monto y no por el orden del catálogo: la pregunta que se le hace a esta lista es dónde está la
 * plata del camión, y un orden alfabético obliga a leer los seis para contestarla. Solo aparecen los
 * canales que ESTE viaje tiene — ofrecer un canal que filtraría a cero es ofrecer un callejón.
 */
export function opcionesDeCanal(filas: FilaPedido[]): FiltroOption[] {
  const acumulado = new Map<CanalId, { pedidos: number; total: number }>()
  for (const fila of filas) {
    const actual = acumulado.get(fila.canal) ?? { pedidos: 0, total: 0 }
    actual.pedidos += 1
    actual.total += fila.total
    acumulado.set(fila.canal, actual)
  }
  return [...acumulado.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([canal, datos]) => ({
      value: canal,
      label: CANAL_META[canal].label,
      glyph: <CanalGlyph canal={canal} size={13} />,
      hint: `${datos.pedidos} · ${bs(datos.total)}`,
    }))
}

export function TablaPedidosViaje({
  filas,
  canales,
  seleccion,
  onSeleccionar,
  vivas,
}: {
  /** Ya construidas por `filasDePedidos`: las comparte con el filtro de la barra. */
  filas: FilaPedido[]
  /** Canales elegidos en la barra. Vacío NO filtra — la convención de narrowing del resto del mockup. */
  canales: CanalId[]
  seleccion: number | null
  onSeleccionar: (secuencia: number) => void
  vivas: Set<string>
}) {
  const visibles = useMemo(
    () => (canales.length === 0 ? filas : filas.filter((f) => canales.includes(f.canal))),
    [filas, canales],
  )

  const totales = useMemo(
    () => ({
      pesoKg: visibles.reduce((acc, f) => acc + f.pesoKg, 0),
      total: visibles.reduce((acc, f) => acc + f.total, 0),
      paradas: new Set(visibles.map((f) => f.secuencia)).size,
    }),
    [visibles],
  )

  const columns = useMemo(
    () =>
      defineColumns<FilaPedido>([
        { id: 'salesOrder', header: 'Pedido', accessorKey: 'salesOrder', size: 100, pin: 'left' },
        { id: 'documento', header: 'Documento', accessorKey: 'documento', size: 116 },
        { id: 'secuencia', header: '#', accessorKey: 'secuencia', size: 56 },
        {
          id: 'cliente',
          header: 'Cliente',
          accessorKey: 'cliente',
          size: 220,
          cell: (row) => (
            <span className="block truncate" title={row.puntoEntrega}>
              {row.cliente}
            </span>
          ),
        },
        {
          id: 'canal',
          header: 'Canal',
          accessorKey: 'canalLabel',
          size: 150,
          cell: (row) => (
            <span className="flex items-center gap-1.5">
              <CanalGlyph canal={row.canal} size={12} />
              <span className="truncate">{row.canalLabel}</span>
            </span>
          ),
        },
        {
          id: 'estado',
          header: 'Estado',
          size: 132,
          enableSorting: false,
          // El estado es de la PARADA. Se repite en los pedidos que comparten local, y está bien: es
          // lo que el esquema guarda, una fila de `delivery_orders` por parada.
          cell: (row) => <EstadoEntregaBadge estado={row.hito.estado} />,
        },
        { id: 'entrega', header: 'Entrega', accessorKey: 'entrega', size: 90 },
        { id: 'formaPago', header: 'Pago', accessorKey: 'formaPago', size: 116 },
        {
          id: 'pesoKg',
          header: 'Peso kg',
          accessorKey: 'pesoKg',
          size: 96,
          cell: (row) => <span className="tabular-nums">{bs(row.pesoKg)}</span>,
        },
        {
          id: 'total',
          header: 'Monto Bs',
          accessorKey: 'total',
          size: 110,
          cell: (row) => <span className="font-medium tabular-nums">{bs(row.total)}</span>,
        },
      ]),
    [],
  )

  /**
   * Los totales van en el TOOLBAR del DataTable, pegados a la tabla que resumen — el filtro que los
   * mueve está arriba, en la barra del diálogo, junto a los otros controles.
   *
   * Están acá y no arriba porque son el PIE de esta tabla, que es lo único que al `DataTable` le falta.
   * Arriba competirían con la frescura por el mismo rincón y dejarían la barra de controles con dos
   * datos numéricos que no se parecen en nada.
   */
  const totalesBarra = (
    <span className="mr-1 flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">
        {visibles.length === filas.length
          ? `${filas.length} ped.`
          : `${visibles.length} de ${filas.length} ped.`}{' '}
        · {totales.paradas} {totales.paradas === 1 ? 'parada' : 'paradas'}
      </span>
      <span className="tabular-nums text-muted-foreground">{bs(totales.pesoKg)} kg</span>
      <span className="font-semibold tabular-nums">Bs {bs(totales.total)}</span>
    </span>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 py-2">
      <DataTable
        toolbar={totalesBarra}
        tableId="monitoreo-viaje-pedidos"
        columns={columns}
        data={visibles}
        getRowId={(row) => row.id}
        fillHeight
        stickyHeader
        searchable
        searchPlaceholder="Buscar pedido, documento o cliente…"
        searchKeys={['salesOrder', 'documento', 'cliente', 'puntoEntrega', 'canalLabel']}
        exportable
        exportFilename="pedidos-del-viaje"
        emptyTitle="Sin pedidos"
        emptyMessage="Ningún pedido del viaje entra en el filtro."
        onRowClick={(row) => onSeleccionar(row.secuencia)}
        rowClassName={(row) =>
          cn(
            'cursor-pointer',
            row.secuencia === seleccion && 'bg-primary/5',
            // `fila-viva`: el mismo destello que usan el listado y la tabla de paradas.
            vivas.has(row.hito.entrega.id) && 'fila-viva',
          )
        }
      />
    </div>
  )
}
