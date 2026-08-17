// Diálogo de los pedidos FUERA DEL CORTE: los que cierran después de la hora de corte de su canal.
//
// ENTRAN POR DEFECTO, igual que el resto (ver `incluidoPorDefecto`). Esta lista NO es un trámite de
// alta: es el lugar donde SACARLOS si ese día el recorrido no llega. Por eso la tabla abre con todo
// tildado y lo que se hace acá es destildar, no tildar.
//
// Es un diálogo con DataTable y no una lista dentro del panel por una razón de ancho: la decisión de
// meter un pedido tardío se toma mirando el vendedor, la ventana horaria, el monto y el peso a la vez.
// En 300 px sobre el mapa eso obliga a truncar hasta que ninguna columna sirve; en un diálogo entra
// todo y encima se puede ordenar, buscar y paginar sin inventar nada.
//
// Complementa a `CanalPedidosDialog`, que es el mismo gesto para los pedidos que SÍ entran por corte.
// La decisión se guarda en el store al instante (misma convención): cerrar solo cierra.
import { AlertTriangle, Clock } from 'lucide-react'
import { DataTable, defineColumns } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CanalGlyph } from '../canal-glyph'
import { CANAL_META, pedidoEsSeleccionable, type Pedido } from '../mock-data'
import { estaIncluido, useDispatchPlanStore } from '../dispatch-plan-store'

const fmtMoneda = new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' })
const fmtPeso = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 })

const columns = defineColumns<Pedido>([
  { id: 'salesOrder', header: 'Pedido', accessorKey: 'salesOrder', size: 96, pin: 'left' },
  {
    id: 'canal',
    header: 'Canal',
    accessorKey: 'canal',
    size: 130,
    cell: (row) => {
      const meta = CANAL_META[row.canal]
      return (
        <span className="flex min-w-0 items-center gap-1.5" title={meta.label}>
          <span className="shrink-0" style={{ color: meta.color }}>
            <CanalGlyph canal={row.canal} size={15} />
          </span>
          <span className="truncate">{meta.label}</span>
        </span>
      )
    },
  },
  { id: 'cliente', header: 'Cliente', accessorKey: 'cliente', size: 190 },
  {
    id: 'ventana',
    header: 'Entrega',
    accessorKey: 'ventana',
    size: 118,
    // La ventana es LA razón por la que el pedido está en esta tabla: cierra después del corte de su
    // canal. Se muestra junto al corte para que la comparación no haya que hacerla de memoria.
    cell: (row) => (
      <span className="flex items-center gap-1 tabular-nums" title={`Corte del canal: ${CANAL_META[row.canal].timeOff}`}>
        <Clock size={11} className="text-amber-600 dark:text-amber-400" />
        {row.ventana}
      </span>
    ),
  },
  { id: 'vendedor', header: 'Vendedor', accessorKey: 'vendedor', size: 150 },
  {
    id: 'total',
    header: 'Total (Bs)',
    accessorKey: 'total',
    size: 110,
    meta: { align: 'right' },
    cell: (row) => <span className="font-medium tabular-nums">{fmtMoneda.format(row.total)}</span>,
  },
  {
    id: 'peso',
    header: 'Peso',
    accessorKey: 'peso',
    size: 92,
    meta: { align: 'right' },
    cell: (row) => <span className="tabular-nums">{fmtPeso.format(row.peso)} kg</span>,
  },
])

export function FueraDeCorteDialog({
  abierto,
  pedidos,
  onClose,
}: {
  abierto: boolean
  /** Los pedidos fuera de corte del universo actual (canales activos + narrowing + filtros). */
  pedidos: Pedido[]
  onClose: () => void
}) {
  const orderOverrides = useDispatchPlanStore((s) => s.orderOverrides)
  const setOrdersIncluded = useDispatchPlanStore((s) => s.setOrdersIncluded)

  const elegidos = pedidos.filter((p) => estaIncluido(p, orderOverrides))
  const pesoElegido = elegidos.reduce((acc, p) => acc + p.peso, 0)

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onClose()}>
      {/* `overflow-hidden` + `flex-col` acotado: es lo que la tabla necesita del contenedor para poder
          encogerse. Ver la nota del DataTable de abajo. */}
      <DialogContent className="flex max-h-[85vh] flex-col gap-3 overflow-hidden sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-500" />
            Pedidos fuera del corte
          </DialogTitle>
          <DialogDescription>
            Cierran después de la hora de corte de su canal: entran igual, pero son los que más
            riesgo tienen de no llegar. Destildá los que este día prefieras dejar afuera.
          </DialogDescription>
        </DialogHeader>

        {/* La tabla es hija DIRECTA de la columna del diálogo. Antes iba envuelta en un `div` con
            `min-h-0 flex-1`, pero ese div era un BLOQUE, no un flex container: el `fillHeight` de la
            tabla se traduce en `min-h-0 flex-1`, y sin un padre flex esas clases no hacen nada. La
            tabla crecía hasta su alto natural y las filas se derramaban fuera del diálogo. */}
        <DataTable
          tableId="planner-fuera-de-corte"
          columns={columns}
          data={pedidos}
          getRowId={(row) => row.id}
          emptyTitle="Nada fuera del corte"
          emptyMessage="Todos los pedidos de los filtros actuales entran dentro del corte."
          fillHeight
          selectable
          // Una bonificación sin stock confirmado no puede entrar al plan por ninguna vía.
          isRowSelectable={pedidoEsSeleccionable}
          defaultSelectedIds={elegidos.map((p) => p.id)}
          onSelectionChange={(rows) =>
            setOrdersIncluded(
              pedidos.map((p) => p.id),
              rows.map((r) => r.id),
            )
          }
          searchable
          searchPlaceholder="Buscar por código, cliente, vendedor…"
          searchKeys={['salesOrder', 'cliente', 'vendedor', 'puntoEntrega', 'company']}
          clientPagination
          defaultPageSize={10}
        />

        <DialogFooter className="items-center gap-3 sm:justify-between">
          {/* El pie cierra los números contra la fila del panel: cuántos se metieron y cuánto pesan. */}
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">{elegidos.length}</span> de{' '}
            <span className="tabular-nums">{pedidos.length}</span> entran ·{' '}
            <span className="tabular-nums">{fmtPeso.format(pesoElegido)} kg</span>
          </span>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
