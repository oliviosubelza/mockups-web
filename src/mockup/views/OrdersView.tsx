import { useState, useMemo } from 'react'
import { DataTable, defineColumns, defineFilters, FilterBar } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { OrdenEstadoBadge } from '../estado-badge'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import {
  CanalId,
  CHOFERES,
  ORDENES,
  PARADAS,
  PEDIDOS,
  ProductType,
  rutaPorCamionId,
  rutaPorId,
  type EstadoOrden,
  type OrdenDespacho,
} from '../mock-data'
import type { BoardState } from '../types'
import { MoreVertical, BellOff, SquarePen } from 'lucide-react'
import { OrdersMap } from '../OrdersMap'
import { AsignarChoferDialog, type ParadaDetalle } from './AsignarChoferDialog'

interface OrdenFilters extends Record<string, unknown> {
  estado?: EstadoOrden
  ruta?: string
}

const ESTADO_OPCIONES = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'cargando', label: 'Cargando' },
  { value: 'despachada', label: 'Despachada' },
]

const RUTA_OPCIONES = Array.from(
  new Map(
    ORDENES.map((o) => rutaPorId(o.rutaId))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => [r.nombre, r]),
  ).values(),
).map((r) => ({ label: r.nombre, value: r.nombre }))

const filterDefs = defineFilters<OrdenFilters>([
  { type: 'select', id: 'estado', label: 'Estado', options: ESTADO_OPCIONES },
  { type: 'select', id: 'ruta', label: 'Ruta', options: RUTA_OPCIONES },
])

/** Minutos → "3 h 30 min" (o "45 min"). */
const fmtDuracion = (min: number) => {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h} h ${m.toString().padStart(2, '0')} min` : `${m} min`
}

// Generamos 15 puntos de entrega de prueba para el mockup
const MOCK_ENTREGAS: ParadaDetalle[] = Array.from({ length: 15 }).map((_, i) => ({
  id: `del-${i + 1}`,
  secuencia: i + 1,
  cliente: `Comercializadora ${String.fromCharCode(65 + i)} SRL`,
  direccion: `Av. Radial ${10 + i}, Zona Norte`,
  prioridad: i === 2 || i === 7 ? 'Alta' : 'Normal',
  ventana: '08:00 - 12:00'
}))

export function OrdersView({ state }: { state: BoardState }) {
  const [filters, setFilters] = useState<Partial<OrdenFilters>>({})

  // Estado para el modal
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<OrdenDespacho | null>(null)
  const [mapMaximized, setMapMaximized] = useState(false)
  // Chofer asignado por orden (override local del mockup; arranca vacío y se asigna en el detalle).
  const [choferPorOrden, setChoferPorOrden] = useState<Record<string, string>>({})
  const choferDe = (o: OrdenDespacho) => choferPorOrden[o.id] || o.conductor
  const asignarChofer = (id: string, chofer: string) =>
    setChoferPorOrden((prev) => ({ ...prev, [id]: chofer }))
  const [canales, setCanales] = useState<Set<CanalId>>(new Set())
  const [tipos, setTipos] = useState<Set<ProductType>>(new Set())
  const [optimized, setOptimized] = useState(false)
  const [rutas, setRutas] = useState<Set<string>>(new Set())
  const [showRoute, setShowRoute] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const paradas = state === 'empty' || state === 'error' ? [] : PARADAS
  const pedidos = state === 'empty' || state === 'error' ? [] : PEDIDOS

  // Paradas que pasan los filtros activos (lo que se pinta en el mapa).
  const filtradas = paradas.filter((p) => {
    if (canales.size > 0 && !canales.has(p.canal)) return false
    if (tipos.size > 0 && !p.pedidos.some((ped) => tipos.has(ped.productType))) return false
    if (rutas.size > 0) {
      const ruta = rutaPorCamionId(p.camionId)
      if (!ruta || !rutas.has(ruta.id)) return false
    }
    return true
  })

  const columns = useMemo(() => defineColumns<OrdenDespacho>([
    { id: 'codigo', header: 'Orden', accessorKey: 'codigo', size: 110, pin: 'left' },
    {
      id: 'conductor',
      header: 'Chofer',
      accessorKey: 'conductor',
      size: 180,
      cell: (row) => {
        const chofer = choferDe(row)
        return chofer ? (
          <span className="truncate">{chofer}</span>
        ) : (
          <span className="text-xs text-muted-foreground">Sin asignar</span>
        )
      },
    },
    { id: 'camionId', header: 'Camión', accessorKey: 'camionId', size: 80 },
    {
      id: 'ruta',
      header: 'Ruta',
      size: 160,
      cell: (row) => {
        const ruta = rutaPorId(row.rutaId)
        return (
          <span className="flex items-center gap-2">
            {ruta && <span className="size-2 shrink-0 rounded-full" style={{ background: ruta.color }} />}
            <span className="truncate">{ruta?.nombre ?? '—'}</span>
          </span>
        )
      },
    },
    {
      id: 'carga',
      header: 'Carga est.',
      accessorKey: 'cargaPct',
      size: 140,
      cell: (row) => (
        <div className="flex items-center text-center gap-2">
          {/* <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${cargaColor(row.cargaPct)}`}
              style={{ width: `${row.cargaPct}%` }}
            />
          </div>
          <span className="tabular-nums text-xs text-muted-foreground">{row.cargaPct}%</span> */}
          <span className="tabular-nums text-xs text-muted-foreground shrink-0">{row.cargaPct} Kg</span>
        </div>
      ),
    },
    {
      id: 'duracion',
      header: 'Tiempo est.',
      accessorKey: 'duracionMin',
      size: 120,
      cell: (row) => <span className="tabular-nums text-muted-foreground">{fmtDuracion(row.duracionMin)}</span>,
    },
    {
      id: 'estado',
      header: 'Estado',
      accessorKey: 'estado',
      size: 130,
      cell: (row) => <OrdenEstadoBadge estado={row.estado} />,
    },
    {
      id: 'acciones',
      header: 'Acciones',
      size: 90,
      cell: (row) => (
        <div className="flex justify-center">
          <DropdownMenu>
            {/* TRIGGER: El botón de los 3 puntitos */}
            <DropdownMenuTrigger >
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-8 w-8 p-0 mx-auto flex hover:bg-muted focus-visible:ring-1"
              >
                <MoreVertical className="h-4 w-4 text-muted-foreground" />
                <span className="sr-only">Abrir menú de acciones</span>
              </Button>
            </DropdownMenuTrigger>

            {/* CONTENT: El menú desplegable con animación */}
            <DropdownMenuContent align="end" className="w-48 shadow-md">

              {/* Opción 1: Ver detalle (Abre tu modal) */}
              <DropdownMenuItem
                onClick={() => setOrdenSeleccionada(row)}
                className="cursor-pointer flex items-center gap-2"
              >
                {/* <Eye className="h-4 w-4 text-muted-foreground" /> */}
                <SquarePen />
                <span>Editar detalle</span>
              </DropdownMenuItem>

              {/* Opción 2: Ejemplo extra habilitado */}
              <DropdownMenuItem
                onClick={() => setMapMaximized(true)}
                className="cursor-pointer flex items-center gap-2">
                {/* <Map className="h-4 w-4 text-muted-foreground" /> */}
                <span>Ver en mapa</span>
              </DropdownMenuItem>

              {/* Opción 3: Ejemplo de opción deshabilitada (como el "Check voice mail" de tu imagen) */}
              <DropdownMenuItem disabled className="flex items-center gap-2">
                <BellOff className="h-4 w-4 text-muted-foreground" />
                <span>Desactivar alertas</span>
              </DropdownMenuItem>

            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )
    }
  ]), [choferPorOrden])

  const filtrados = ORDENES.filter(
    (o) =>
      (!filters.estado || o.estado === filters.estado) &&
      (!filters.ruta || rutaPorId(o.rutaId)?.nombre === filters.ruta),
  )
  const data = state === 'empty' || state === 'error' ? [] : filtrados

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <h2 className="text-sm font-semibold text-foreground">Órdenes de Transporte</h2>

      <DataTable
        tableId="mockup-ordenes-despacho"
        columns={columns}
        data={data}
        getRowId={(row) => row.id}
        isLoading={state === 'loading'}
        isError={state === 'error'}
        errorMessage="No pudimos traer las órdenes de transporte desde el servidor."
        onRetry={() => { }}
        emptyTitle="Ninguna orden coincide"
        emptyMessage="Probá quitando el estado o la ruta para ver más órdenes."
        fillHeight
        searchable
        searchPlaceholder="Buscar por orden, empleado o ruta…"
        clientPagination
        defaultPageSize={12}
        exportable
        exportFilename="ordenes-despacho"
        filterBar={
          <FilterBar
            defs={filterDefs}
            values={filters}
            onChange={(u) => setFilters((prev) => ({ ...prev, ...u }))}
          />
        }
      />

      <AsignarChoferDialog
        open={!!ordenSeleccionada}
        onOpenChange={(o) => { if (!o) setOrdenSeleccionada(null) }}
        codigo={ordenSeleccionada?.codigo}
        estado={ordenSeleccionada?.estado}
        camionLabel={ordenSeleccionada?.camionId}
        capacidadKg={15000}
        cargaPct={ordenSeleccionada?.cargaPct}
        paradas={MOCK_ENTREGAS}
        choferes={CHOFERES}
        choferValue={ordenSeleccionada ? choferDe(ordenSeleccionada) || null : null}
        onChoferChange={(v) => ordenSeleccionada && asignarChofer(ordenSeleccionada.id, v ?? '')}
        onGuardar={() => setOrdenSeleccionada(null)}
      />

      <Dialog open={mapMaximized} onOpenChange={setMapMaximized}>
        <DialogContent className="h-[90vh] w-[95vw] max-w-[95vw] overflow-hidden p-0 sm:max-w-[95vw]">
          <div className="isolate h-full w-full overflow-hidden rounded-lg">
            <OrdersMap
              paradas={filtradas}
              routeToolEnabled={optimized}
              showRoute={showRoute}
              onToggleRoute={() => setShowRoute((v) => !v)}
              showDetails={showDetails}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}