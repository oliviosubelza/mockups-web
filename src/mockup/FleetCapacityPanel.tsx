// Panel izquierdo del paso combinado (fase 0): elegibilidad + selección MANUAL de camiones. La
// tabla solo lista camiones 'disponible' (los únicos seleccionables); arriba quedan los chips
// informativos con su conteo. Sin auto-cálculo ni recomendación: el usuario elige a mano.
import { useCallback, useState } from 'react'
import { Truck, Wrench } from 'lucide-react'
import { DataTable, defineColumns, defineFilters, FilterBar } from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { CapacityBar } from './CapacityBar'
import { useDispatchPlanStore } from './dispatch-plan-store'
import { CAMIONES, CLASES_CAMION, type Camion, type EstadoCamion } from './mock-data'
import type { BoardState } from './types'

interface CamionFilters extends Record<string, unknown> {
  tipo?: string
  clase?: string
  almacen?: string
}

const TIPOS = ['Frío', 'Seco']
// Las clases salen de `mock-data` y no de una lista local: si la carrocería se agrega en un lado y
// se filtra en otro, la opción nueva no aparece y parece que no hay unidades de esa clase.
const CLASES = CLASES_CAMION

const columns = defineColumns<Camion>([
  { id: 'placa', header: 'Placa', accessorKey: 'placa', size: 88, pin: 'left' },
  { id: 'tipo', header: 'Tipo', accessorKey: 'tipo', size: 66 },
  { id: 'clase', header: 'Clase', accessorKey: 'clase', size: 78 },
  {
    id: 'peso',
    header: 'Peso',
    size: 68,
    meta: { align: 'right' },
    cell: (row) => (
      <span className="tabular-nums text-muted-foreground">
        <span className="text-foreground">{row.capacidadPeso} t</span>
      </span>
    ),
  },
  {
    id: 'volumen',
    header: 'Volumen',
    size: 78,
    meta: { align: 'right' },
    cell: (row) => (
      <span className="tabular-nums text-muted-foreground">
        <span className="text-foreground">{row.capacidadVolumen} m³</span>
      </span>
    ),
  },
  {
    // La regla del negocio es "se llena por capacidad o por cantidad de pedidos" → la utilización
    // tiene que verse de un vistazo, no calcularse mentalmente restando dos números.
    id: 'utilizacion',
    header: 'Utilización',
    size: 170,
    cell: (row) => (
      <CapacityBar
        peso={row.asignadoPeso}
        pesoMax={row.capacidadPeso}
        volumen={row.asignadoVolumen}
        volumenMax={row.capacidadVolumen}
      />
    ),
  },
])

const filterDefs = defineFilters<CamionFilters>([
  { type: 'select', id: 'tipo', label: 'Tipo', options: TIPOS.map((t) => ({ label: t, value: t })) },
  { type: 'select', id: 'clase', label: 'Clase', options: CLASES.map((c) => ({ label: c, value: c })) },
])

// Estados que se muestran arriba de la tabla. 'provincia' y 'sinchofer' se sacaron a pedido del
// negocio: no aportaban a la decisión de armar el plan. Solo 'disponible' es elegible (y por eso el
// único chip ACTIVO); 'mantenimiento' es informativo, NO interactuable — muestra el conteo pero no
// filtra ni se selecciona.
const ESTADOS: { value: EstadoCamion; label: string; icon: typeof Truck }[] = [
  { value: 'disponible', label: 'Disponibles', icon: Truck },
  { value: 'mantenimiento', label: 'Mantenimiento', icon: Wrench },
]

export function FleetCapacityPanel({ state }: { state: BoardState }) {
  const [filters, setFilters] = useState<Partial<CamionFilters>>({})
  const selectedTruckIds = useDispatchPlanStore((s) => s.selectedTruckIds)
  const setSelectedTrucks = useDispatchPlanStore((s) => s.setSelectedTrucks)
  const getRowId = useCallback((row: Camion) => row.id, [])
  const isRowSelectable = useCallback((row: Camion) => row.estado === 'disponible', [])
  const handleSelectionChange = useCallback(
    (rows: Camion[]) => {
      const nextIds = rows.map((r) => r.id)
      const currentIds = useDispatchPlanStore.getState().selectedTruckIds
      if (
        nextIds.length === currentIds.length &&
        nextIds.every((id, i) => id === currentIds[i])
      ) {
        return
      }
      setSelectedTrucks(nextIds)
    },
    [setSelectedTrucks],
  )

  const countByEstado = (e: EstadoCamion) => CAMIONES.filter((c) => c.estado === e).length

  // La tabla SIEMPRE lista disponibles: son los únicos seleccionables, así que mostrar los otros
  // estados solo agregaría ruido no accionable.
  const filtrados = CAMIONES.filter(
    (c) =>
      c.estado === 'disponible' &&
      (!filters.tipo || c.tipo === filters.tipo) &&
      (!filters.clase || c.clase === filters.clase)
  )
  const data = state === 'empty' || state === 'error' ? [] : filtrados

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3">
      {/* Chips de estado (mismo lenguaje visual que los canales de la derecha). 'Disponibles' es el
          único ACTIVO — resaltado y siempre presente; 'Mantenimiento' es informativo, no clickeable. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {ESTADOS.map(({ value, label, icon: Icon }) => {
          const activo = value === 'disponible'
          return (
            <Badge
              key={value}
              variant="outline"
              title={activo ? 'Únicos camiones seleccionables' : 'Solo informativo — no seleccionable'}
              className={cn(
                'gap-1.5 py-1 font-normal',
                activo
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border/60 bg-muted/30 text-muted-foreground'
              )}
            >
              <Icon size={12} className={activo ? 'text-primary' : undefined} />
              <span className="font-medium">{label}</span>
              <span className="font-semibold tabular-nums">{countByEstado(value)}</span>
            </Badge>
          )
        })}
      </div>

      <DataTable
        tableId={`mockup-camiones-${state}`}
        columns={columns}
        data={data}
        getRowId={getRowId}
        isLoading={state === 'loading'}
        isError={state === 'error'}
        errorMessage="No pudimos traer la flota desde el servidor de logística."
        onRetry={() => {}}
        emptyTitle="Ningún camión coincide"
        emptyMessage="Probá quitando el tipo o la clase para ver más unidades."
        fillHeight
        selectable
        // Solo los camiones 'disponible' entran al plan — el resto queda visible pero inerte.
        isRowSelectable={isRowSelectable}
        defaultSelectedIds={selectedTruckIds}
        onSelectionChange={handleSelectionChange}
        searchable
        searchPlaceholder="Buscar por placa o tipo…"
        clientPagination
        defaultPageSize={8}
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
