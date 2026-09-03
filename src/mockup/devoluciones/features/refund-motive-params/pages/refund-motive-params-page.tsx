// La lista de PARÁMETROS DE MOTIVO DE DEVOLUCIÓN.
//
// QUÉ CONTESTA. No «qué motivos hay» —para eso está el catálogo de motivos— sino QUÉ REGLAS ESTÁN
// RIGIENDO HOY y sobre qué. Son dos preguntas de comparación entre filas: cuál venció, cuál abarca
// todo. Por eso es una tabla, y por eso la vigencia tiene columna propia.
//
// VIGENCIA Y ESTADO SON COSAS DISTINTAS, y la tabla las muestra separadas a propósito. Un parámetro
// puede estar ACTIVO y no regir —porque su ventana ya cerró, o todavía no abrió—, y esa es
// exactamente la confusión que una sola columna «Estado» produciría. El sistema viejo muestra
// «Desde», «Hasta» y «Estado» como tres columnas sueltas y deja que el lector haga la cuenta; acá la
// cuenta ya está hecha en la columna «Vigencia».
//
// EL ALCANCE ES UNA COLUMNA Y NO SIETE. Siete columnas de conteos serían siete columnas que nadie
// mira; la celda dice «Aplica a todo» o «2 lotes · 1 marca», que es lo que hay que saber para decidir
// si esta es la fila que se está buscando.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Pencil, Plus, Power, RotateCcw, Trash2 } from 'lucide-react'
import {
  DataTable,
  defineColumns,
  defineFilters,
  FilterBar,
  type RowAction,
} from '@/components/data-table'
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
import { PROCESO_META } from '../../../stores/refund-reasons-store'
import {
  ESTADO_PARAMETRO_LABELS,
  dayKey,
  estaVigente,
  resumenAlcance,
  useRefundMotiveParamsStore,
  type ParametroMotivo,
} from '../../../stores/refund-motive-params-store'

/** `YYYY-MM-DD` en la forma en que se lee una fecha acá. */
const dia = (iso: string): string => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/**
 * Si la fila rige hoy, y por qué no cuando no.
 *
 * Tres estados y no dos: «venció» y «todavía no empieza» son situaciones distintas y se corrigen de
 * maneras distintas —una se prorroga, la otra se espera—.
 */
function VigenciaBadge({ p }: { p: ParametroMotivo }) {
  const hoy = dayKey()
  if (p.status !== 'ENABLE') {
    return (
      <Badge variant="outline" className="rounded-full border-dashed text-muted-foreground">
        No rige
      </Badge>
    )
  }
  if (hoy < p.startDate) {
    return (
      <Badge variant="outline" className="rounded-full border-border bg-muted text-muted-foreground">
        Programado
      </Badge>
    )
  }
  if (hoy > p.endDate) {
    return (
      <Badge variant="outline" className="rounded-full border-border bg-muted text-muted-foreground">
        Vencido
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className="rounded-full border-primary/30 bg-primary/10 font-medium text-primary"
    >
      Vigente
    </Badge>
  )
}

interface FiltrosParametros extends Record<string, unknown> {
  proceso?: string
  vigencia?: string
  estado?: string
}

const columns = defineColumns<ParametroMotivo>([
  {
    id: 'refundReasonName',
    header: 'Motivo',
    accessorKey: 'refundReasonName',
    size: 300,
    pin: 'left',
    cell: (row) => (
      <span className={cn('truncate font-medium', row.status !== 'ENABLE' && 'text-muted-foreground')}>
        {row.refundReasonName}
      </span>
    ),
  },
  {
    id: 'processType',
    header: 'Tipo de proceso',
    accessorKey: 'processType',
    size: 170,
    cell: (row) => <span className="truncate text-xs">{PROCESO_META[row.processType].label}</span>,
  },
  {
    id: 'startDate',
    header: 'Desde',
    accessorKey: 'startDate',
    size: 110,
    cell: (row) => <span className="tabular-nums text-xs">{dia(row.startDate)}</span>,
  },
  {
    id: 'endDate',
    header: 'Hasta',
    accessorKey: 'endDate',
    size: 110,
    cell: (row) => <span className="tabular-nums text-xs">{dia(row.endDate)}</span>,
  },
  {
    id: 'vigencia',
    header: 'Vigencia',
    size: 120,
    enableSorting: false,
    cell: (row) => <VigenciaBadge p={row} />,
  },
  {
    id: 'alcance',
    header: 'Alcance',
    size: 300,
    enableSorting: false,
    cell: (row) => {
      const resumen = resumenAlcance(row)
      return (
        <span
          className={cn(
            'truncate text-xs',
            resumen === 'Aplica a todo' ? 'text-muted-foreground' : 'text-foreground',
          )}
          title={resumen}
        >
          {resumen}
        </span>
      )
    },
  },
  {
    id: 'costCenter',
    header: 'Centro de costo',
    accessorKey: 'costCenter',
    size: 140,
    cell: (row) => (
      <span className="truncate text-xs text-muted-foreground">{row.costCenter || '—'}</span>
    ),
  },
  {
    id: 'createdBy',
    header: 'Registrado por',
    accessorKey: 'createdBy',
    size: 150,
    cell: (row) => <span className="truncate text-xs text-muted-foreground">{row.createdBy}</span>,
  },
  {
    id: 'status',
    header: 'Estado',
    accessorKey: 'status',
    size: 110,
    cell: (row) =>
      row.status === 'ENABLE' ? (
        <Badge
          variant="outline"
          className="rounded-full border-primary/30 bg-primary/10 font-medium text-primary"
        >
          {ESTADO_PARAMETRO_LABELS.ENABLE}
        </Badge>
      ) : (
        <Badge variant="outline" className="rounded-full border-border bg-muted text-muted-foreground">
          {ESTADO_PARAMETRO_LABELS[row.status]}
        </Badge>
      ),
  },
])

const filterDefs = defineFilters<FiltrosParametros>([
  {
    type: 'select',
    id: 'proceso',
    label: 'Tipo de proceso',
    options: (['REGULAR', 'REPLACEMENT', 'SAP'] as const).map((t) => ({
      label: PROCESO_META[t].label,
      value: t,
    })),
  },
  {
    type: 'select',
    id: 'vigencia',
    label: 'Vigencia',
    options: [
      { label: 'Rige hoy', value: 'vigente' },
      { label: 'No rige hoy', value: 'no-vigente' },
    ],
  },
  {
    type: 'select',
    id: 'estado',
    label: 'Estado',
    options: [
      { label: 'Activo', value: 'ENABLE' },
      { label: 'Inactivo', value: 'DISABLED' },
    ],
  },
])

export function RefundMotiveParamsPage() {
  const navigate = useNavigate()
  const parametros = useRefundMotiveParamsStore((s) => s.parametros)
  const setEstado = useRefundMotiveParamsStore((s) => s.setEstado)
  const removeParametro = useRefundMotiveParamsStore((s) => s.removeParametro)
  const restaurarSeed = useRefundMotiveParamsStore((s) => s.restaurarSeed)

  const [filtros, setFiltros] = useState<Partial<FiltrosParametros>>({})
  const [aBorrar, setABorrar] = useState<ParametroMotivo | null>(null)

  /** `DELETED` es la baja lógica, no un filtro más de la pantalla. */
  const vivos = useMemo(() => parametros.filter((p) => p.status !== 'DELETED'), [parametros])

  const filtrados = useMemo(
    () =>
      vivos
        .filter((p) => {
          if (filtros.proceso && p.processType !== filtros.proceso) return false
          if (filtros.estado && p.status !== filtros.estado) return false
          if (filtros.vigencia && estaVigente(p) !== (filtros.vigencia === 'vigente')) return false
          return true
        })
        // Lo que rige hoy va arriba, y dentro de cada grupo lo que vence primero: una lista de reglas
        // se mira para saber qué está pasando ahora, no en qué orden se cargaron.
        .sort((a, b) => {
          const va = estaVigente(a) ? 0 : 1
          const vb = estaVigente(b) ? 0 : 1
          if (va !== vb) return va - vb
          return a.endDate.localeCompare(b.endDate)
        }),
    [vivos, filtros],
  )

  const irAlAlta = () => navigate('/parametros-motivo-devolucion/nuevo')
  const irAEdicion = (p: ParametroMotivo) =>
    navigate(`/parametros-motivo-devolucion/${p.id}/editar`)

  const rowActions = (row: ParametroMotivo): RowAction<ParametroMotivo>[] => [
    { label: 'Editar', icon: Pencil, onClick: irAEdicion },
    {
      label: row.status === 'ENABLE' ? 'Desactivar' : 'Activar',
      icon: Power,
      onClick: (p) => {
        const nuevo = p.status === 'ENABLE' ? 'DISABLED' : 'ENABLE'
        setEstado(p.id, nuevo)
        toast.success(
          nuevo === 'ENABLE'
            ? `El parámetro de «${p.refundReasonName}» vuelve a aplicar`
            : `El parámetro de «${p.refundReasonName}» deja de aplicar`,
        )
      },
    },
    {
      label: 'Eliminar',
      icon: Trash2,
      variant: 'destructive',
      onClick: setABorrar,
      separator: true,
    },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          Desde cuándo, hasta cuándo y sobre qué se puede usar cada motivo. Un parámetro sin filtros
          aplica a todo; con filtros, solo a los clientes, productos, lotes, canales o distribuidoras
          que elija.
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={restaurarSeed}
            title="Volver a los parámetros de ejemplo, para demostración"
          >
            <RotateCcw size={13} className="mr-1.5" />
            Reiniciar demo
          </Button>
          <Button onClick={irAlAlta}>
            <Plus size={14} className="mr-1.5" />
            Nuevo parámetro
          </Button>
        </div>
      </div>

      <DataTable
        tableId="mockup-parametros-motivo-devolucion"
        columns={columns}
        data={filtrados}
        getRowId={(row) => String(row.id)}
        emptyTitle="Sin parámetros"
        emptyMessage="Ningún parámetro coincide con estos filtros."
        emptyAction={{ label: 'Nuevo parámetro', onClick: irAlAlta }}
        bodyMinHeight={560}
        searchable
        searchPlaceholder="Buscar por motivo…"
        clientPagination
        defaultPageSize={25}
        rowActions={rowActions}
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
            <AlertDialogTitle>Eliminar el parámetro de «{aBorrar?.refundReasonName}»</AlertDialogTitle>
            <AlertDialogDescription>
              Sale de la lista pero el registro se conserva: las devoluciones que se aprobaron bajo
              esta ventana siguen explicadas por ella. Si lo que querés es que deje de aplicar sin
              sacarlo de la lista, usá «Desactivar» — eso se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!aBorrar) return
                removeParametro(aBorrar.id)
                toast.success('Parámetro eliminado')
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
