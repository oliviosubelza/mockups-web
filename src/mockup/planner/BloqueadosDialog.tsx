// Diálogo de los pedidos BLOQUEADOS: les falta stock de una línea de bonificación, así que
// `pedidoEsSeleccionable` los deja afuera del plan por cualquier vía.
//
// MISMA FORMA QUE `FueraDeCorteDialog`, MENOS UNA COSA: no tiene columna de selección. Las dos son la
// misma pregunta —"¿qué pedidos NO están entrando y por qué?"— y merecen la misma tabla, con las
// mismas columnas y el mismo pie; lo único que cambia es que en aquella hay algo que decidir y acá no.
//
// POR QUÉ NO HAY CHECKBOX. La regla no la puede levantar Logística: la destraba Ventas confirmando el
// stock. Poner la columna en gris "para que se vea igual" sería peor que no ponerla — un control
// deshabilitado invita a intentar algo que no existe, que es exactamente el malentendido que esta
// pantalla vino a resolver.
import { Lock } from 'lucide-react'
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
import { CANAL_META, type Pedido } from '../mock-data'

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

export function BloqueadosDialog({
  abierto,
  onOpenChange,
  pedidos,
}: {
  abierto: boolean
  onOpenChange: (v: boolean) => void
  /** Los que `pedidoEsSeleccionable` deja afuera, en el alcance actual de filtros. */
  pedidos: Pedido[]
}) {
  const pesoTotal = pedidos.reduce((acc, p) => acc + p.peso, 0)
  const montoTotal = pedidos.reduce((acc, p) => acc + p.total, 0)

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-3 overflow-hidden sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="size-4 text-rose-600 dark:text-rose-400" />
            Pedidos bloqueados
          </DialogTitle>
          <DialogDescription>
            Ventas todavía no confirmó el stock de una línea de bonificación, así que no entran al
            plan por ninguna vía. Se destraban solos cuando la confirme: acá no hay nada que decidir.
          </DialogDescription>
        </DialogHeader>

        {/* Hija DIRECTA de la columna del diálogo: `fillHeight` se traduce en `min-h-0 flex-1` y sin un
            padre flex esas clases no hacen nada (ver la nota de `FueraDeCorteDialog`). */}
        <DataTable
          tableId="planner-bloqueados"
          columns={columns}
          data={pedidos}
          getRowId={(row) => row.id}
          emptyTitle="Ningún pedido bloqueado"
          emptyMessage="Todos los pedidos de los filtros actuales tienen sus bonificaciones confirmadas."
          fillHeight
          // Sin `selectable`: no hay decisión que tomar acá.
          searchable
          searchPlaceholder="Buscar por código, cliente, vendedor…"
          searchKeys={['salesOrder', 'cliente', 'vendedor', 'puntoEntrega', 'company']}
          clientPagination
          defaultPageSize={10}
        />

        <DialogFooter className="items-center gap-3 sm:justify-between">
          {/* Peso y monto no son decoración: son lo que este bloqueo le está sacando al reparto, y el
              argumento con el que se le va a reclamar la confirmación a Ventas. */}
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">{pedidos.length}</span>{' '}
            pedido{pedidos.length !== 1 ? 's' : ''} fuera del plan ·{' '}
            <span className="tabular-nums">{fmtPeso.format(pesoTotal)} kg</span> ·{' '}
            <span className="tabular-nums">{fmtMoneda.format(montoTotal)}</span>
          </span>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
