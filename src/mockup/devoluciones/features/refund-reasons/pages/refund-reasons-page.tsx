// Dato maestro: MOTIVOS DE DEVOLUCIÓN (`refund_reasons`).
//
// QUÉ CONTESTA ESTA PANTALLA. No «qué motivos hay» —eso es el nombre— sino QUÉ EXIGE CADA UNO. De los
// cuatro requisitos que la fila tenía, `lot_requirement` es el único que quedó como columna, y la
// pregunta que se hace sobre él es de comparación: «¿cuáles piden lote?», «¿en cuáles no aplica?».
// Para eso sirve una tabla, y por eso el catálogo es una tabla y no una lista de tarjetas.
//
// LO QUE SE FUE. `code`, `sort_order`, `due_date_requirement`, `requires_photo` y `requires_notes`
// dejaron de ser columnas de `refund_reasons`, así que dejaron de ser columnas de esta tabla. En su
// lugar entró `description`, que es lo que lee quien no reconoce el motivo por el nombre.
//
// EL ALTA NO ES UN DIÁLOGO, es una pantalla (`/motivos-devolucion/nuevo`). Configurar un motivo es
// decidir con qué palabra va a clasificar el vendedor durante meses: se escribe, se relee y a veces
// se deja a medias para preguntar. Un diálogo eso lo castiga —se cierra con un click afuera, no se
// puede compartir por URL y no sobrevive un F5—. El bandeo sí usa diálogo porque son cinco campos
// sin consecuencias; acá el costo de equivocarse es otro.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Pencil, Plus, Power, RotateCcw, Trash2 } from 'lucide-react'
import { DataTable, defineColumns, defineFilters, FilterBar, type RowAction } from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  REQUISITO_META,
  REQUISITOS,
  useRefundReasonsStore,
  type MotivoDevolucion,
  type RequisitoCampo,
} from '../../../stores/refund-reasons-store'

/** El requisito dicho en el ancho de una celda. Tres estados, tres pesos visuales distintos. */
function RequisitoBadge({ valor }: { valor: RequisitoCampo }) {
  const meta = REQUISITO_META[valor]
  if (valor === 'REQUIRED') {
    return (
      <Badge variant="outline" className="rounded-full border-primary/30 bg-primary/10 font-medium text-primary">
        {meta.corto}
      </Badge>
    )
  }
  if (valor === 'OPTIONAL') {
    return (
      <Badge variant="outline" className="rounded-full border-border bg-muted font-medium text-muted-foreground">
        {meta.corto}
      </Badge>
    )
  }
  // «No aplica» va con borde punteado y no con otro relleno: no es un tercer nivel de exigencia, es
  // la ausencia del campo. El punteado dice «acá no hay caja» sin necesidad de leer la palabra.
  return (
    <Badge
      variant="outline"
      className="rounded-full border-dashed border-border font-medium text-muted-foreground"
    >
      {meta.corto}
    </Badge>
  )
}

interface FiltrosMotivos extends Record<string, unknown> {
  lote?: string
  estado?: string
}

const columns = defineColumns<MotivoDevolucion>([
  {
    id: 'name',
    header: 'Motivo',
    accessorKey: 'name',
    size: 380,
    pin: 'left',
    cell: (row) => (
      <span className={cn('truncate font-medium', !row.isActive && 'text-muted-foreground')}>{row.name}</span>
    ),
  },
  {
    id: 'description',
    // Puede traer hasta 300 caracteres, así que se trunca: la tabla se lee de un barrido y una celda
    // de tres líneas rompe el ritmo de las filas. El texto completo va en el `title` del navegador.
    header: 'Descripción',
    accessorKey: 'description',
    size: 460,
    cell: (row) => (
      <span className="truncate text-xs text-muted-foreground" title={row.description}>
        {row.description}
      </span>
    ),
  },
  {
    id: 'lotRequirement',
    header: 'Lote',
    accessorKey: 'lotRequirement',
    size: 130,
    cell: (row) => <RequisitoBadge valor={row.lotRequirement} />,
  },
  {
    id: 'isActive',
    header: 'Estado',
    accessorKey: 'isActive',
    size: 110,
    cell: (row) =>
      row.isActive ? (
        <Badge variant="outline" className="rounded-full border-primary/30 bg-primary/10 font-medium text-primary">
          Vigente
        </Badge>
      ) : (
        <Badge variant="outline" className="rounded-full border-border bg-muted font-medium text-muted-foreground">
          No se ofrece
        </Badge>
      ),
  },
])

const opcionesRequisito = REQUISITOS.map((r) => ({ label: REQUISITO_META[r].label, value: r }))

const filterDefs = defineFilters<FiltrosMotivos>([
  { type: 'select', id: 'lote', label: 'Lote', options: opcionesRequisito },
  {
    type: 'select',
    id: 'estado',
    label: 'Estado',
    options: [
      { label: 'Vigente', value: 'activo' },
      { label: 'No se ofrece', value: 'inactivo' },
    ],
  },
])

export function RefundReasonsPage() {
  const navigate = useNavigate()
  const motivos = useRefundReasonsStore((s) => s.motivos)
  const setMotivoActivo = useRefundReasonsStore((s) => s.setMotivoActivo)
  const removeMotivo = useRefundReasonsStore((s) => s.removeMotivo)
  const restaurarSeed = useRefundReasonsStore((s) => s.restaurarSeed)

  const [filtros, setFiltros] = useState<Partial<FiltrosMotivos>>({})
  const [aBorrar, setABorrar] = useState<MotivoDevolucion | null>(null)

  /** Los borrados no se listan: `deleted_at` es la baja, no un filtro más de la pantalla. */
  const vivos = useMemo(() => motivos.filter((m) => !m.deletedAt), [motivos])

  const filtrados = useMemo(
    () =>
      vivos
        .filter((m) => {
          if (filtros.lote && m.lotRequirement !== filtros.lote) return false
          if (filtros.estado && m.isActive !== (filtros.estado === 'activo')) return false
          return true
        })
        // Ordenado por `id`, o sea por orden de creación: `sort_order` dejó de ser columna, así que
        // el catálogo ya no define en qué orden los ve el vendedor y esta pantalla no puede inventarlo.
        // Los 22 sembrados quedan alfabéticos porque así vienen numerados.
        .sort((a, b) => a.id - b.id),
    [vivos, filtros],
  )

  const irAlAlta = () => navigate('/motivos-devolucion/nuevo')
  const irAEdicion = (motivo: MotivoDevolucion) => navigate(`/motivos-devolucion/${motivo.id}/editar`)

  const rowActions = (row: MotivoDevolucion): RowAction<MotivoDevolucion>[] => [
    { label: 'Editar', icon: Pencil, onClick: irAEdicion },
    {
      label: row.isActive ? 'Dejar de ofrecerlo' : 'Volver a ofrecerlo',
      icon: Power,
      onClick: (m) => {
        setMotivoActivo(m.id, !m.isActive)
        toast.success(
          m.isActive
            ? `«${m.name}» ya no aparece en el selector del vendedor`
            : `«${m.name}» vuelve a estar disponible`,
        )
      },
    },
    { label: 'Eliminar', icon: Trash2, variant: 'destructive', onClick: setABorrar, separator: true },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          Con qué se clasifica cada línea de una devolución. Lo que se define acá es cómo se llama cada
          motivo, qué explica y si el sistema le va a pedir el número de lote al vendedor.
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={restaurarSeed}
            title="Volver al catálogo de ejemplo, para demostración"
          >
            <RotateCcw size={13} className="mr-1.5" />
            Reiniciar demo
          </Button>
          <Button onClick={irAlAlta}>
            <Plus size={14} className="mr-1.5" />
            Nuevo motivo
          </Button>
        </div>
      </div>

      <DataTable
        tableId="mockup-motivos-devolucion"
        columns={columns}
        data={filtrados}
        getRowId={(row) => String(row.id)}
        emptyTitle="Sin motivos"
        emptyMessage="Ningún motivo de devolución coincide con estos filtros."
        emptyAction={{ label: 'Nuevo motivo', onClick: irAlAlta }}
        bodyMinHeight={560}
        searchable
        searchPlaceholder="Buscar por motivo o descripción…"
        clientPagination
        defaultPageSize={25}
        rowActions={rowActions}
        // Mismo gesto que el resto de los catálogos del mockup: el doble click abre la edición, que es
        // lo que se hace el 90% de las veces, sin gastar una columna de botones.
        onRowDoubleClick={irAEdicion}
        filterBar={
          <FilterBar
            defs={filterDefs}
            values={filtros}
            onChange={(u) => setFiltros((prev) => ({ ...prev, ...u }))}
          />
        }
      />

      <AlertDialog open={aBorrar !== null} onOpenChange={(abierto) => !abierto && setABorrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar «{aBorrar?.name}»</AlertDialogTitle>
            <AlertDialogDescription>
              Sale del catálogo pero el registro se conserva: las devoluciones ya registradas con este
              motivo lo siguen apuntando por su identificador ({aBorrar?.id}). Si lo que querés es que
              deje de ofrecerse en el selector del vendedor, usá «Dejar de ofrecerlo» — eso se puede
              deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!aBorrar) return
                removeMotivo(aBorrar.id)
                toast.success(`«${aBorrar.name}» eliminado del catálogo`)
                setABorrar(null)
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
