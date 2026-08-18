// Listado de ZONAS de reparto — dato maestro (tabla `zones`), mismo patrón que `CamionesView`: una
// tabla con filtros por ciudad/estado y las acciones por fila en un menú (`rowActions`). Crear y
// editar el POLÍGONO no pasa por acá — es un mapa a pantalla completa (`ZonaEditorView`), porque
// dibujar y filtrar una tabla compiten por el mismo espacio y no hay forma linda de mezclarlos.
import { useMemo, useState } from 'react'
import { LandPlot, Pencil, Plus, Power, Trash2 } from 'lucide-react'
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
import { openRoute } from '@/core/routing/open-route'
import { CIUDAD_META, ciudadDeCityId, type CiudadId } from '../mock-data'
import { useZonesStore, type Zona } from '../zones-store'

const fechaTexto = (iso: string) =>
  new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })

const CIUDAD_OPCIONES = Object.entries(CIUDAD_META).map(([id, meta]) => ({ label: meta.label, value: id }))
const ESTADO_OPCIONES = [
  { label: 'Activa', value: 'activa' },
  { label: 'Inactiva', value: 'inactiva' },
]

interface ZonaFilters extends Record<string, unknown> {
  ciudad?: CiudadId
  estado?: 'activa' | 'inactiva'
}

const filterDefs = defineFilters<ZonaFilters>([
  { type: 'select', id: 'ciudad', label: 'Ciudad', options: CIUDAD_OPCIONES },
  { type: 'select', id: 'estado', label: 'Estado', options: ESTADO_OPCIONES },
])

export function ZonasView() {
  const zonas = useZonesStore((s) => s.zonas)
  const setZonaActiva = useZonesStore((s) => s.setZonaActiva)
  const removeZona = useZonesStore((s) => s.removeZona)

  const [filters, setFilters] = useState<Partial<ZonaFilters>>({})
  const [aBorrar, setABorrar] = useState<Zona | null>(null)

  const data = useMemo(() => {
    let list = zonas.filter((z) => !z.deletedAt)
    if (filters.ciudad) list = list.filter((z) => z.cityId === CIUDAD_META[filters.ciudad!].cityId)
    if (filters.estado) list = list.filter((z) => z.isActive === (filters.estado === 'activa'))
    return list
  }, [zonas, filters])

  const columns = useMemo(
    () =>
      defineColumns<Zona>([
        {
          id: 'name',
          header: 'Zona',
          accessorKey: 'name',
          size: 220,
          pin: 'left',
          cell: (row) => (
            <div className="flex min-w-0 items-center gap-2">
              <LandPlot className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">{row.name}</span>
            </div>
          ),
        },
        {
          id: 'ciudad',
          header: 'Ciudad',
          size: 180,
          cell: (row) => {
            const ciudad = ciudadDeCityId(row.cityId)
            return <span>{ciudad ? CIUDAD_META[ciudad].label : `Ciudad #${row.cityId}`}</span>
          },
        },
        {
          id: 'estado',
          header: 'Estado',
          size: 110,
          cell: (row) => (
            <Badge variant={row.isActive ? 'default' : 'outline'} className="rounded-full text-[10px]">
              {row.isActive ? 'Activa' : 'Inactiva'}
            </Badge>
          ),
        },
        {
          id: 'actualizado',
          header: 'Actualizada',
          size: 140,
          meta: { align: 'right' },
          cell: (row) => <span className="tabular-nums text-muted-foreground">{fechaTexto(row.updatedAt)}</span>,
        },
      ]),
    [],
  )

  const rowActions = (row: Zona): RowAction<Zona>[] => [
    {
      label: 'Editar polígono',
      icon: Pencil,
      onClick: () => openRoute('zona-editar', { zonaId: String(row.id) }),
    },
    {
      label: row.isActive ? 'Desactivar' : 'Activar',
      icon: Power,
      onClick: () => {
        setZonaActiva(row.id, !row.isActive)
        toast.success(row.isActive ? `${row.name} desactivada` : `${row.name} activada`)
      },
    },
    {
      label: 'Eliminar',
      icon: Trash2,
      variant: 'destructive',
      separator: true,
      onClick: () => setABorrar(row),
    },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-foreground">Zonas de reparto</h2>
          <p className="text-sm text-muted-foreground">
            Perímetros por ciudad que agrupan puntos de entrega. El polígono se dibuja sobre el mapa.
          </p>
        </div>
        <Button size="sm" onClick={() => openRoute('zona-nueva')}>
          <Plus className="size-3.5" />
          Nueva zona
        </Button>
      </div>

      <DataTable
        tableId="mockup-zonas"
        columns={columns}
        data={data}
        getRowId={(row) => String(row.id)}
        emptyTitle="Sin zonas"
        emptyMessage="Ninguna zona coincide con los filtros."
        fillHeight
        searchable
        searchPlaceholder="Buscar por nombre…"
        clientPagination
        defaultPageSize={12}
        onRowDoubleClick={(row) => openRoute('zona-editar', { zonaId: String(row.id) })}
        rowActions={rowActions}
        filterBar={
          <FilterBar
            defs={filterDefs}
            values={filters}
            onChange={(u) => setFilters((prev) => ({ ...prev, ...u }))}
          />
        }
      />

      <AlertDialog open={aBorrar !== null} onOpenChange={(open) => !open && setABorrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar {aBorrar?.name}</AlertDialogTitle>
            <AlertDialogDescription>
              La zona deja de estar disponible para planificar. No se borra el registro: si algún plan
              ya la usó, sigue viéndose ahí.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!aBorrar) return
                removeZona(aBorrar.id)
                toast.success(`${aBorrar.name} eliminada`)
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
