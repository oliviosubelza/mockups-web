import { useState } from 'react'
import { Eye, Pencil, Plus, Power, RotateCcw, ShieldAlert, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { DataTable, FilterBar, defineColumns, defineFilters, type RowAction } from '@/components/data-table'
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DISTRIBUIDORAS } from '../mock-data'
import { navigateTo } from '../routes'
import {
  RESTRICTION_EFFECT_META,
  RESTRICTION_EFFECTS,
  RESTRICTION_SEVERITIES,
  RESTRICTION_SEVERITY_META,
  RESTRICTION_TYPE_META,
  RESTRICTION_TYPES,
  describeSchedules,
  describeVehicleRules,
  formatAuditDate,
  type PlanningRestriction,
} from './domain'
import { usePlanningRestrictionsStore } from './store'

function distributorName(id: number): string {
  return DISTRIBUIDORAS.find((distributor) => distributor.id === id)?.nombre ?? `Distribuidora ${id}`
}

const columns = defineColumns<PlanningRestriction>([
  {
    id: 'name',
    header: 'Nombre',
    accessorKey: 'name',
    size: 260,
    pin: 'left',
    cell: (row) => <span className="font-medium">{row.name}</span>,
  },
  {
    id: 'distributorId',
    header: 'Distribuidora',
    accessorKey: 'distributorId',
    size: 210,
    cell: (row) => distributorName(row.distributorId),
  },
  {
    id: 'restrictionType',
    header: 'Tipo',
    accessorKey: 'restrictionType',
    size: 170,
    cell: (row) => (
      <Badge variant="outline" className="rounded-full">
        {RESTRICTION_TYPE_META[row.restrictionType].label}
      </Badge>
    ),
  },
  {
    id: 'effect',
    header: 'Efecto',
    accessorKey: 'effect',
    size: 170,
    cell: (row) => RESTRICTION_EFFECT_META[row.effect].label,
  },
  {
    id: 'severity',
    header: 'Severidad',
    accessorKey: 'severity',
    size: 135,
    cell: (row) => (
      <Badge
        variant="outline"
        className={cn(
          'rounded-full',
          row.severity === 'BLOCKING'
            ? 'border-destructive/30 bg-destructive/10 text-destructive'
            : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
        )}
      >
        {RESTRICTION_SEVERITY_META[row.severity].label}
      </Badge>
    ),
  },
  {
    id: 'schedules',
    header: 'Vigencia',
    accessorKey: 'schedules',
    size: 220,
    cell: describeSchedules,
  },
  {
    id: 'vehicleRules',
    header: 'Alcance vehicular',
    accessorKey: 'vehicleRules',
    size: 170,
    cell: describeVehicleRules,
  },
  {
    id: 'isActive',
    header: 'Estado',
    accessorKey: 'isActive',
    size: 110,
    cell: (row) => (
      <Badge
        variant="outline"
        className={cn(
          'rounded-full',
          row.isActive
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
            : 'bg-muted text-muted-foreground',
        )}
      >
        {row.isActive ? 'Activa' : 'Inactiva'}
      </Badge>
    ),
  },
  {
    id: 'updatedAt',
    header: 'Actualización',
    accessorKey: 'updatedAt',
    size: 190,
    cell: (row) => formatAuditDate(row.updatedAt),
  },
])

interface RestrictionFilters extends Record<string, unknown> {
  search?: string
  distributor?: string
  type?: string
  effect?: string
  severity?: string
  state?: string
}

const filterDefs = defineFilters<RestrictionFilters>([
  { type: 'text', id: 'search', label: 'Buscar', placeholder: 'Nombre o descripción…', width: 'w-52' },
  {
    type: 'select',
    id: 'distributor',
    label: 'Distribuidora',
    options: DISTRIBUIDORAS.map((distributor) => ({ label: distributor.nombre, value: String(distributor.id) })),
  },
  {
    type: 'select',
    id: 'type',
    label: 'Tipo',
    options: RESTRICTION_TYPES.map((type) => ({ label: RESTRICTION_TYPE_META[type].label, value: type })),
  },
  {
    type: 'select',
    id: 'effect',
    label: 'Efecto',
    options: RESTRICTION_EFFECTS.map((effect) => ({ label: RESTRICTION_EFFECT_META[effect].label, value: effect })),
  },
  {
    type: 'select',
    id: 'severity',
    label: 'Severidad',
    options: RESTRICTION_SEVERITIES.map((severity) => ({
      label: RESTRICTION_SEVERITY_META[severity].label,
      value: severity,
    })),
  },
  {
    type: 'select',
    id: 'state',
    label: 'Estado',
    options: [
      { label: 'Activa', value: 'active' },
      { label: 'Inactiva', value: 'inactive' },
    ],
  },
])

export function RestrictionsCatalogView() {
  const restrictions = usePlanningRestrictionsStore((state) => state.restrictions)
  const setRestrictionActive = usePlanningRestrictionsStore((state) => state.setRestrictionActive)
  const softDeleteRestriction = usePlanningRestrictionsStore((state) => state.softDeleteRestriction)
  const resetDemoRestrictions = usePlanningRestrictionsStore((state) => state.resetDemoRestrictions)
  const [filters, setFilters] = useState<Partial<RestrictionFilters>>({})
  const [pendingDelete, setPendingDelete] = useState<PlanningRestriction | null>(null)

  const visible = restrictions.filter((restriction) => {
    if (restriction.deletedAt !== null) return false
    const search = filters.search?.trim().toLowerCase()
    if (
      search &&
      !restriction.name.toLowerCase().includes(search) &&
      !restriction.description?.toLowerCase().includes(search)
    ) {
      return false
    }
    if (filters.distributor && restriction.distributorId !== Number(filters.distributor)) return false
    if (filters.type && restriction.restrictionType !== filters.type) return false
    if (filters.effect && restriction.effect !== filters.effect) return false
    if (filters.severity && restriction.severity !== filters.severity) return false
    if (filters.state && restriction.isActive !== (filters.state === 'active')) return false
    return true
  })

  const rowActions = (restriction: PlanningRestriction): RowAction<PlanningRestriction>[] => [
    {
      label: 'Ver detalle',
      icon: Eye,
      onClick: (row) => navigateTo('restriccion-detalle', { restrictionId: String(row.id) }),
    },
    {
      label: 'Editar',
      icon: Pencil,
      onClick: (row) => navigateTo('restriccion-editar', { restrictionId: String(row.id) }),
    },
    {
      label: restriction.isActive ? 'Desactivar' : 'Activar',
      icon: Power,
      onClick: (row) => {
        setRestrictionActive(row.id, !row.isActive)
        toast.success(`${row.name} ${row.isActive ? 'desactivada' : 'activada'}`)
      },
    },
    {
      label: 'Eliminar',
      icon: Trash2,
      variant: 'destructive',
      separator: true,
      onClick: setPendingDelete,
    },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-start gap-3">
        <Alert className="min-w-0 flex-1 sm:min-w-[420px]">
          <ShieldAlert />
          <AlertTitle>Datos locales de demostración</AlertTitle>
          <AlertDescription>
            El catálogo persiste en este navegador. No existe backend ni evaluación espacial conectada.
          </AlertDescription>
        </Alert>
        <div className="ml-auto flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={resetDemoRestrictions}>
            <RotateCcw size={13} className="mr-1.5" />
            Reiniciar demo
          </Button>
          <Button onClick={() => navigateTo('restriccion-nueva')}>
            <Plus size={14} className="mr-1.5" />
            Nueva restricción
          </Button>
        </div>
      </div>

      <DataTable
        tableId="mockup-planning-restrictions"
        columns={columns}
        data={visible}
        getRowId={(row) => String(row.id)}
        emptyTitle="Sin restricciones"
        emptyMessage="Ninguna restricción coincide con los filtros elegidos."
        emptyAction={{ label: 'Nueva restricción', onClick: () => navigateTo('restriccion-nueva') }}
        bodyMinHeight={520}
        clientPagination
        defaultPageSize={10}
        initialSort={{ id: 'updatedAt', desc: true }}
        rowActions={rowActions}
        onRowClick={(row) => navigateTo('restriccion-detalle', { restrictionId: String(row.id) })}
        filterBar={
          <FilterBar
            defs={filterDefs}
            values={filters}
            onChange={(update) => setFilters((current) => ({ ...current, ...update }))}
          />
        }
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar «{pendingDelete?.name}»</AlertDialogTitle>
            <AlertDialogDescription>
              La baja es lógica. El agregado y sus filas hijas quedan en el historial local, pero salen del catálogo y del planner.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingDelete) return
                softDeleteRestriction(pendingDelete.id)
                toast.success(`${pendingDelete.name} eliminada`)
                setPendingDelete(null)
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
