import { useState, useMemo, useEffect } from 'react'
import { DataTable, defineColumns, defineFilters, FilterBar } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { OrdenEstadoBadge } from '../estado-badge'
import { cn } from '@/lib/utils' // Asumiendo que tienes esta utilidad estándar
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Card } from '@/components/ui/card'
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
  ORDENES,
  PARADAS,
  PEDIDOS,
  ProductType,
  rutaPorCamionId,
  type EstadoOrden,
  type OrdenDespacho,
} from '../mock-data'
import type { BoardState } from '../types'
import { Truck, MapPin, User, ChevronLeft, ChevronRight, Eye, MoreVertical, BellOff, SquarePen } from 'lucide-react'
import { OrdersMap } from '../OrdersMap'

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
    ORDENES.map((o) => rutaPorCamionId(o.camionId))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => [r.nombre, r]),
  ).values(),
).map((r) => ({ label: r.nombre, value: r.nombre }))

const filterDefs = defineFilters<OrdenFilters>([
  { type: 'select', id: 'estado', label: 'Estado', options: ESTADO_OPCIONES },
  { type: 'select', id: 'ruta', label: 'Ruta', options: RUTA_OPCIONES },
])

// Generamos 15 puntos de entrega de prueba para el mockup
const MOCK_ENTREGAS = Array.from({ length: 15 }).map((_, i) => ({
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
  // Estado para la paginación de la tablita interna de entregas
  const [entregasPage, setEntregasPage] = useState(1)
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
  const ENTREGAS_PER_PAGE = 10

  // Reiniciar la página a 1 cada vez que se abre una nueva orden
  useEffect(() => {
    if (ordenSeleccionada) {
      setEntregasPage(1)
    }
  }, [ordenSeleccionada])

  const columns = useMemo(() => defineColumns<OrdenDespacho>([
    { id: 'codigo', header: 'Orden', accessorKey: 'codigo', size: 110, pin: 'left' },
    { id: 'conductor', header: 'Chofer', accessorKey: 'conductor', size: 180 },
    { id: 'camionId', header: 'Camión', accessorKey: 'camionId', size: 80 },
    {
      id: 'ruta',
      header: 'Ruta',
      size: 160,
      cell: (row) => {
        const ruta = rutaPorCamionId(row.rutaId)
        return (
          <span className="flex items-center gap-2">
            {ruta && <span className="size-2 shrink-0 rounded-full" style={{ background: ruta.color }} />}
            <span className="truncate">{ruta?.nombre ?? '—'}</span>
          </span>
        )
      },
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
      header: 'Opciones', // Lo dejamos vacío para que quede más limpio
      size: 60, // Hacemos la columna un poco más estrecha
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
  ]), [])

  const filtrados = ORDENES.filter(
    (o) =>
      (!filters.estado || o.estado === filters.estado) &&
      (!filters.ruta || rutaPorCamionId(o.camionId)?.nombre === filters.ruta),
  )
  const data = state === 'empty' || state === 'error' ? [] : filtrados

  const rutaSeleccionada = ordenSeleccionada ? rutaPorCamionId(ordenSeleccionada.camionId) : null

  // Cálculos de paginación
  const totalPages = Math.ceil(MOCK_ENTREGAS.length / ENTREGAS_PER_PAGE)
  const paginatedEntregas = MOCK_ENTREGAS.slice(
    (entregasPage - 1) * ENTREGAS_PER_PAGE,
    entregasPage * ENTREGAS_PER_PAGE
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">{data.length}</span> órdenes de
          despacho · una por camión de la corrida seleccionada
        </span>
        <Button size="sm" className="ml-auto">
          Emitir todas
        </Button>
      </div>

      <DataTable
        tableId="mockup-ordenes-despacho"
        columns={columns}
        data={data}
        getRowId={(row) => row.id}
        isLoading={state === 'loading'}
        isError={state === 'error'}
        errorMessage="No pudimos traer las órdenes de despacho desde el servidor."
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

      <Dialog
        open={!!ordenSeleccionada}
        onOpenChange={(open) => {
          if (!open) setOrdenSeleccionada(null)
        }}
      >
        {/* Aumenté el ancho del modal a max-w-4xl para acomodar bien la tabla */}
        <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <div className="flex items-center justify-between pr-6">
              <div>
                <DialogTitle className="text-xl">Orden de Despacho: {ordenSeleccionada?.codigo}</DialogTitle>
                <DialogDescription>
                  Detalles de asignación y ruta generada.
                </DialogDescription>
              </div>
              {ordenSeleccionada && <OrdenEstadoBadge estado={ordenSeleccionada.estado} />}
            </div>
          </DialogHeader>

          {/* Hacemos el contenido scrolleable si la pantalla es pequeña */}
          <div className="flex-1 overflow-y-auto pr-2 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              <Card className="p-4 flex flex-col gap-2 shadow-sm">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <User className="size-4" />
                  <span className="text-sm font-semibold uppercase tracking-wider">Personal Asignado</span>
                </div>
                <div className="text-sm">
                  <span className="font-medium text-foreground">Chofer:</span> {ordenSeleccionada?.conductor}
                </div>
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium">Ayudante:</span> M. Céspedes
                </div>
              </Card>

              <Card className="p-4 flex flex-col gap-2 shadow-sm">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Truck className="size-4" />
                  <span className="text-sm font-semibold uppercase tracking-wider">Vehículo</span>
                </div>
                <div className="text-sm">
                  <span className="font-medium text-foreground">Placa/Camión:</span> {ordenSeleccionada?.camionId}
                </div>
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium">Capacidad:</span> 15,000 kg
                </div>
              </Card>

              <Card className="p-4 flex flex-col gap-2 shadow-sm md:col-span-2 h-[520px]">
                {/* Cabecera del Card (Fija) */}
                <div className="flex items-center justify-between mb-2 shrink-0">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="size-4" />
                    <span className="text-sm font-semibold uppercase tracking-wider">Ruta y Entregas</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {rutaSeleccionada && <span className="size-3 rounded-full shadow-sm" style={{ background: rutaSeleccionada.color }} />}
                    <span className="font-medium">{rutaSeleccionada?.nombre ?? 'Ruta no asignada'}</span>
                  </div>
                </div>

                {/* Contenedor de la Tabla (Se expande para llenar el espacio) */}
                {/* flex-1 hace que tome el espacio sobrante, manteniendo el paginador abajo */}
                <div className="border rounded-md bg-background flex-1 overflow-auto">
                  <table className="w-full text-sm text-left">
                    {/* sticky top-0 mantiene el header visible si alguna vez hay scroll */}
                    <thead className="bg-white border-b sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2 font-medium w-12 text-center">#</th>
                        <th className="px-3 py-2 font-medium">Cliente</th>
                        <th className="px-3 py-2 font-medium hidden sm:table-cell">Dirección</th>
                        <th className="px-3 py-2 font-medium">Horario</th>
                        <th className="px-3 py-2 font-medium text-center">Prioridad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {paginatedEntregas.map((entrega) => (
                        <tr key={entrega.id} className="hover:bg-muted/30 transition-colors h-[41px]">
                          {/* Forzar una altura mínima por fila (h-[41px]) ayuda a la consistencia visual */}
                          <td className="px-3 py-2 text-center font-medium tabular-nums text-muted-foreground">
                            {entrega.secuencia}
                          </td>
                          <td className="px-3 py-2 truncate max-w-[150px] font-medium">
                            {entrega.cliente}
                          </td>
                          <td className="px-3 py-2 truncate max-w-[200px] text-muted-foreground hidden sm:table-cell">
                            {entrega.direccion}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {entrega.ventana}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider",
                              entrega.prioridad === 'Alta'
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                            )}>
                              {entrega.prioridad}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Controles de Paginación (Fijos al fondo) */}
                <div className="flex items-center justify-between mt-2 px-1 shrink-0">
                  <span className="text-xs text-muted-foreground">
                    Mostrando {(entregasPage - 1) * ENTREGAS_PER_PAGE + 1} - {Math.min(entregasPage * ENTREGAS_PER_PAGE, MOCK_ENTREGAS.length)} de {MOCK_ENTREGAS.length} paradas
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      className="h-7 w-7"
                      onClick={() => setEntregasPage(p => Math.max(1, p - 1))}
                      disabled={entregasPage === 1}
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <span className="text-xs font-medium px-2 tabular-nums">
                      {entregasPage} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      className="h-7 w-7"
                      onClick={() => setEntregasPage(p => Math.min(totalPages, p + 1))}
                      disabled={entregasPage === totalPages}
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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