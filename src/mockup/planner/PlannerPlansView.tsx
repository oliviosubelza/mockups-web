// Listado de planificaciones realizadas en el mapa interactivo.
import { useState } from 'react'
import { MapPin, MoreVertical, Plus, RotateCcw, Route, Trash2 } from 'lucide-react'
import { DataTable, defineColumns, defineFilters, FilterBar } from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { type EstadoPlan, type Plan } from '../mock-data'
import { PLAN_DISTRIBUIDORA_UNICA, usePlanesStore } from '../planes-store'
import { openRoute } from '@/core/routing/open-route'
import type { BoardState } from '../types'

/** ISO (YYYY-MM-DD…) → DD/MM/YYYY para mostrar. */
const fmtFecha = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

const ESTADO: Record<EstadoPlan, { label: string; className: string }> = {
  borrador: { label: 'Borrador', className: 'border-border bg-muted text-muted-foreground' },
  aprobado: { label: 'Aprobado', className: 'border-primary/30 bg-primary/10 text-primary' },
}

const ESTADO_FILTER_OPTIONS: EstadoPlan[] = ['borrador', 'aprobado']

interface PlanFilters extends Record<string, unknown> {
  distribuidora?: string
  estado?: string
  fechaDesde?: string
  fechaHasta?: string
}

export function PlannerPlansView({ state }: { state?: BoardState }) {
  const [filters, setFilters] = useState<Partial<PlanFilters>>({})
  const planes = usePlanesStore((s) => s.planes)
  const clearPlanes = usePlanesStore((s) => s.clearPlanes)
  const removePlan = usePlanesStore((s) => s.removePlan)

  const handleVerRutas = (planId: number) => {
    usePlanesStore.setState({ activePlanId: planId })
    openRoute('rutas-creadas')
  }

  const handleEditarEnMapa = (planId: number) => {
    usePlanesStore.setState({ activePlanId: planId })
    openRoute('planificacion-mapa-editor')
  }

  const handleNueva = () => {
    const nuevo = usePlanesStore.getState().beginPlan()
    usePlanesStore.setState({ activePlanId: nuevo.id })
    openRoute('planificacion-mapa-editor')
  }

  const columns = defineColumns<Plan>([
    {
      id: 'id',
      header: 'Plan',
      accessorKey: 'id',
      size: 90,
      pin: 'left',
      cell: (row) => (
        <span className="tabular-nums font-semibold text-primary">#{row.id}</span>
      ),
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
      size: 130,
      cell: (row) => {
        const estado = ESTADO[row.estado]
        return (
          <Badge variant="outline" className={cn('rounded-full font-medium', estado.className)}>
            {estado.label}
          </Badge>
        )
      },
    },
    { id: 'distribuidora', header: 'Distribuidora', accessorKey: 'distribuidora', size: 180 },
    {
      id: 'pedidos',
      header: 'Pedidos',
      accessorKey: 'pedidos',
      size: 100,
      meta: { align: 'right' },
      cell: (row) => <span className="tabular-nums font-medium">{row.pedidos}</span>,
    },
    {
      id: 'camiones',
      header: 'Rutas / Camiones',
      accessorKey: 'camiones',
      size: 140,
      meta: { align: 'right' },
      cell: (row) => (
        <span className="tabular-nums font-medium">
          {row.camionesDetalle?.length ?? row.camiones} {row.camiones === 1 ? 'ruta' : 'rutas'}
        </span>
      ),
    },
    { id: 'creadoPor', header: 'Creado por', accessorKey: 'creadoPor', size: 150 },
    {
      id: 'acciones',
      header: 'Acciones',
      size: 80,
      cell: (row) => (
        <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="h-8 w-8 p-0 flex hover:bg-muted focus-visible:ring-1"
                />
              }
            >
              <MoreVertical className="h-4 w-4 text-muted-foreground" />
              <span className="sr-only">Abrir opciones del plan</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 shadow-md">
              <DropdownMenuItem
                onClick={() => handleVerRutas(row.id)}
                className="cursor-pointer flex items-center gap-2 font-medium"
              >
                <Route className="h-4 w-4 text-primary" />
                <span>Ver rutas generadas</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => handleEditarEnMapa(row.id)}
                className="cursor-pointer flex items-center gap-2"
              >
                <MapPin className="h-4 w-4" />
                <span>Abrir en mapa</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => removePlan(row.id)}
                className="cursor-pointer flex items-center gap-2 text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                <span>Eliminar plan</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ])

  const filterDefs = defineFilters<PlanFilters>([
    {
      type: 'select',
      id: 'estado',
      label: 'Estado',
      options: ESTADO_FILTER_OPTIONS.map((e) => ({ label: ESTADO[e].label, value: e })),
    },
    {
      type: 'select',
      id: 'distribuidora',
      label: 'Distribuidora',
      options: [{ label: PLAN_DISTRIBUIDORA_UNICA, value: PLAN_DISTRIBUIDORA_UNICA }],
    },
    { type: 'daterange', id: 'fecha', label: 'Fecha', fromKey: 'fechaDesde', toKey: 'fechaHasta' },
  ])

  const filtrados = planes.filter((p) => {
    if (filters.estado && p.estado !== filters.estado) return false
    if (filters.distribuidora && p.distribuidora !== filters.distribuidora) return false
    if (filters.fechaDesde && p.fecha < filters.fechaDesde.slice(0, 10)) return false
    if (filters.fechaHasta && p.fecha > filters.fechaHasta.slice(0, 10)) return false
    return true
  })
  const data = state === 'empty' || state === 'error' ? [] : filtrados

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Planificaciones en mapa</h2>
          <p className="text-xs text-muted-foreground">
            Historial de planes creados en el mapa interactivo. Podés crear una nueva planificación o inspeccionar las rutas generadas.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {planes.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearPlanes}
              title="Reiniciar lista de planificaciones para demostración"
            >
              <RotateCcw size={13} className="mr-1.5" />
              Reiniciar demo
            </Button>
          )}
          <Button size="sm" onClick={handleNueva}>
            <Plus size={14} className="mr-1.5" />
            Nueva planificación
          </Button>
        </div>
      </div>

      <DataTable
        tableId="mockup-planes-mapa"
        columns={columns}
        data={data}
        getRowId={(row) => String(row.id)}
        isLoading={state === 'loading'}
        isError={state === 'error'}
        errorMessage="No pudimos traer las planificaciones."
        onRetry={() => {}}
        emptyTitle="Sin planificaciones"
        emptyMessage="Todavía no hay planificaciones guardadas. Creá una nueva planificación en el mapa."
        emptyAction={{ label: 'Nueva planificación', onClick: handleNueva }}
        bodyMinHeight={560}
        searchable
        searchPlaceholder="Buscar por plan, distribuidora o creador…"
        clientPagination
        defaultPageSize={10}
        onRowClick={(row) => handleVerRutas(row.id)}
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
