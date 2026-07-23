// Lista de planes (dispatch_plan) — la pantalla de entrada del proceso. El flujo de fases no
// empieza en el aire: arranca cuando se crea un plan en BORRADOR y se entra en él.
import { Plus } from 'lucide-react'
import { DataTable, defineColumns, defineFilters, FilterBar } from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { DISTRIBUIDORAS, PLANES, type EstadoPlan, type Plan } from '../mock-data'
import type { BoardState } from '../types'

/** ISO (YYYY-MM-DD…) → DD/MM/YYYY para mostrar. */
const fmtFecha = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

const ESTADO: Record<EstadoPlan, { label: string; className: string }> = {
  borrador: { label: 'Borrador', className: 'border-border bg-muted text-muted-foreground' },
  optimizado: {
    label: 'Optimizado',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  aprobado: { label: 'Aprobado', className: 'border-primary/30 bg-primary/10 text-primary' },
}

interface PlanFilters extends Record<string, unknown> {
  distribuidora?: string
  estado?: string
  /** Rango de plan_date (el filtro daterange emite ISO en estas dos keys). */
  fechaDesde?: string
  fechaHasta?: string
}

const columns = defineColumns<Plan>([
  {
    id: 'id',
    header: 'Plan',
    accessorKey: 'id',
    size: 90,
    pin: 'left',
    cell: (row) => <span className="tabular-nums font-medium">#{row.id}</span>,
  },
  {
    id: 'fecha',
    header: 'Fecha',
    accessorKey: 'fecha',
    size: 120,
    cell: (row) => <span className="tabular-nums">{fmtFecha(row.fecha)}</span>,
  },
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
  { id: 'distribuidora', header: 'Distribuidora', accessorKey: 'distribuidora', size: 200 },
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
  { id: 'creadoPor', header: 'Creado por', accessorKey: 'creadoPor', size: 150 },
])

const filterDefs = defineFilters<PlanFilters>([
  {
    type: 'select',
    id: 'estado',
    label: 'Estado',
    options: (Object.keys(ESTADO) as EstadoPlan[]).map((e) => ({ label: ESTADO[e].label, value: e })),
  },
  {
    type: 'select',
    id: 'distribuidora',
    label: 'Distribuidora',
    options: DISTRIBUIDORAS.map((d) => ({ label: d.nombre, value: d.nombre })),
  },
  { type: 'daterange', id: 'fecha', label: 'Fecha', fromKey: 'fechaDesde', toKey: 'fechaHasta' },
])

export function PlansView({ state, onNew }: { state: BoardState; onNew?: () => void }) {
  const [filters, setFilters] = useState<Partial<PlanFilters>>({})

  const filtrados = PLANES.filter((p) => {
    if (filters.estado && p.estado !== filters.estado) return false
    if (filters.distribuidora && p.distribuidora !== filters.distribuidora) return false
    // El daterange emite ISO con hora; comparo solo la parte fecha (ambas en YYYY-MM-DD ordenan lexicográficamente).
    if (filters.fechaDesde && p.fecha < filters.fechaDesde.slice(0, 10)) return false
    if (filters.fechaHasta && p.fecha > filters.fechaHasta.slice(0, 10)) return false
    return true
  })
  const data = state === 'empty' || state === 'error' ? [] : filtrados

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          Planificaciones de los últimos días. Entrá a un borrador para seguir planificando.
        </span>
        <Button className="ml-auto shrink-0" onClick={onNew}>
          <Plus size={14} className="mr-1.5" />
          Nueva planificación
        </Button>
      </div>

      <DataTable
        tableId={`mockup-planes-${state}`}
        columns={columns}
        data={data}
        getRowId={(row) => String(row.id)}
        isLoading={state === 'loading'}
        isError={state === 'error'}
        errorMessage="No pudimos traer los planes de despacho."
        onRetry={() => {}}
        emptyTitle="Sin planificaciones"
        emptyMessage="Todavía no hay planificaciones para estos filtros."
        emptyAction={{ label: 'Nueva planificación', onClick: () => onNew?.() }}
        bodyMinHeight={560}
        searchable
        searchPlaceholder="Buscar por plan, distribuidora o planificador…"
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
