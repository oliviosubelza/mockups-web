// Lista de planes (dispatch_plan) — la pantalla de entrada del proceso. El flujo de fases no
// empieza en el aire: arranca cuando se crea un plan en BORRADOR y se entra en él.
import { Plus } from 'lucide-react'
import { DataTable, defineColumns, defineFilters, FilterBar } from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { ALMACENES, PLANES, type EstadoPlan, type Plan } from '../mock-data'
import type { BoardState } from '../types'

const ESTADO: Record<EstadoPlan, { label: string; className: string }> = {
  borrador: { label: 'Borrador', className: 'border-border bg-muted text-muted-foreground' },
  optimizado: {
    label: 'Optimizado',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  aprobado: { label: 'Aprobado', className: 'border-primary/30 bg-primary/10 text-primary' },
}

interface PlanFilters extends Record<string, unknown> {
  almacen?: string
  estado?: string
}

const columns = defineColumns<Plan>([
  { id: 'codigo', header: 'Plan', accessorKey: 'codigo', size: 120, pin: 'left' },
  { id: 'fecha', header: 'Fecha', accessorKey: 'fecha', size: 120 },
  { id: 'almacen', header: 'Almacén', accessorKey: 'almacen', size: 190 },
  { id: 'tipo', header: 'Tipo', accessorKey: 'tipo', size: 120 },
  {
    id: 'estado',
    header: 'Estado',
    accessorKey: 'estado',
    size: 140,
    cell: (row) => {
      const estado = ESTADO[row.estado]
      return (
        <Badge variant="outline" className={cn('rounded-full font-medium', estado.className)}>
          {estado.label}
        </Badge>
      )
    },
  },
  {
    id: 'pedidos',
    header: 'Pedidos',
    accessorKey: 'pedidos',
    size: 100,
    meta: { align: 'right' },
    cell: (row) => <span className="tabular-nums">{row.pedidos}</span>,
  },
  {
    id: 'camiones',
    header: 'Camiones',
    accessorKey: 'camiones',
    size: 110,
    meta: { align: 'right' },
    cell: (row) => <span className="tabular-nums">{row.camiones}</span>,
  },
  { id: 'creadoPor', header: 'Creado por', accessorKey: 'creadoPor', size: 140 },
])

const filterDefs = defineFilters<PlanFilters>([
  {
    type: 'select',
    id: 'almacen',
    label: 'Almacén',
    options: ALMACENES.map((a) => ({ label: a, value: a })),
  },
  {
    type: 'select',
    id: 'estado',
    label: 'Estado',
    options: (Object.keys(ESTADO) as EstadoPlan[]).map((e) => ({ label: ESTADO[e].label, value: e })),
  },
])

export function PlansView({ state }: { state: BoardState }) {
  const [filters, setFilters] = useState<Partial<PlanFilters>>({})

  const filtrados = PLANES.filter(
    (p) =>
      (!filters.almacen || p.almacen === filters.almacen) &&
      (!filters.estado || p.estado === filters.estado)
  )
  const data = state === 'empty' || state === 'error' ? [] : filtrados

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          Planes de despacho de los últimos días. Entrá a un borrador para seguir planificando.
        </span>
        <Button className="ml-auto shrink-0">
          <Plus size={14} className="mr-1.5" />
          Nuevo plan
        </Button>
      </div>

      <DataTable
        tableId={`mockup-planes-${state}`}
        columns={columns}
        data={data}
        getRowId={(row) => row.id}
        isLoading={state === 'loading'}
        isError={state === 'error'}
        errorMessage="No pudimos traer los planes de despacho."
        onRetry={() => {}}
        emptyTitle="Sin planes"
        emptyMessage="Todavía no hay planes de despacho para estos filtros."
        emptyAction={{ label: 'Nuevo plan', onClick: () => {} }}
        bodyMinHeight={560}
        searchable
        searchPlaceholder="Buscar por plan o almacén…"
        clientPagination
        defaultPageSize={10}
        onRowClick={() => {}}
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
