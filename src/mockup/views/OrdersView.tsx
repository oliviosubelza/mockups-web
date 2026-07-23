import { useState, useMemo, useEffect, type ReactNode } from 'react'
import { DataTable, defineColumns, defineFilters, FilterBar } from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { OrdenEstadoBadge } from '../estado-badge'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
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
import { Truck, User, ChevronLeft, ChevronRight, MoreVertical, BellOff, SquarePen, type LucideIcon } from 'lucide-react'
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
    ORDENES.map((o) => rutaPorId(o.rutaId))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => [r.nombre, r]),
  ).values(),
).map((r) => ({ label: r.nombre, value: r.nombre }))

const filterDefs = defineFilters<OrdenFilters>([
  { type: 'select', id: 'estado', label: 'Estado', options: ESTADO_OPCIONES },
  { type: 'select', id: 'ruta', label: 'Ruta', options: RUTA_OPCIONES },
])

/** Estilo de un campo de solo-lectura del detalle (misma altura que el input del Combobox). */
const readonlyFieldCls =
  'flex h-9 items-center gap-2 rounded-md border border-input bg-muted/40 px-3 text-sm'

/** Minutos → "3 h 30 min" (o "45 min"). */
const fmtDuracion = (min: number) => {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h} h ${m.toString().padStart(2, '0')} min` : `${m} min`
}

/** Color de la barra de carga según ocupación del camión. */
const cargaColor = (pct: number) =>
  pct >= 90 ? 'bg-destructive' : pct >= 75 ? 'bg-amber-500' : 'bg-primary'

/** Campo etiquetado del detalle: label muted con ícono + el control/valor debajo. */
function InfoField({
  label,
  icon: Icon,
  children,
  className,
}: {
  label: string
  icon: LucideIcon
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-col gap-1.5${className ? ` ${className}` : ''}`}>
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </span>
      {children}
    </div>
  )
}

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
  // Chofer asignado por orden (override local del mockup; arranca vacío y se asigna en el detalle).
  const [choferPorOrden, setChoferPorOrden] = useState<Record<string, string>>({})
  const choferDe = (o: OrdenDespacho) => choferPorOrden[o.id] || o.conductor
  const asignarChofer = (id: string, chofer: string) =>
    setChoferPorOrden((prev) => ({ ...prev, [id]: chofer }))
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

  // Reiniciar la página a 1 cada vez que se abre otra orden.
  useEffect(() => {
    setEntregasPage(1)
  }, [ordenSeleccionada])

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

  // Cálculos de paginación
  const totalPages = Math.max(1, Math.ceil(MOCK_ENTREGAS.length / ENTREGAS_PER_PAGE))
  const paginatedEntregas = MOCK_ENTREGAS.slice(
    (entregasPage - 1) * ENTREGAS_PER_PAGE,
    entregasPage * ENTREGAS_PER_PAGE
  )

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

      <Dialog
        open={!!ordenSeleccionada}
        onOpenChange={(open) => {
          if (!open) setOrdenSeleccionada(null)
        }}
      >
        <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
            <div className="flex items-start gap-3 pr-8">
              <div className="min-w-0 flex-1">
                <DialogTitle className="flex items-center gap-2 text-base">
                  Orden de Transporte
                  <span className="font-mono text-sm text-muted-foreground">{ordenSeleccionada?.codigo}</span>
                </DialogTitle>
                <DialogDescription>Asigná un chofer</DialogDescription>
              </div>
              {ordenSeleccionada && <OrdenEstadoBadge estado={ordenSeleccionada.estado} />}
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {/* Datos de la orden: chofer editable + camión/ruta/salida (read-only). */}
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              <InfoField label="Chofer" icon={User}>
                <Combobox
                  items={CHOFERES}
                  value={ordenSeleccionada ? choferDe(ordenSeleccionada) || null : null}
                  onValueChange={(v) =>
                    ordenSeleccionada && asignarChofer(ordenSeleccionada.id, v ?? '')
                  }
                >
                  <ComboboxInput placeholder="Buscar por nombre o código SAP…" showClear />
                  <ComboboxContent>
                    <ComboboxEmpty>Sin resultados</ComboboxEmpty>
                    <ComboboxList>
                      {(item: string) => (
                        <ComboboxItem key={item} value={item}>
                          {item}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              </InfoField>

              <InfoField label="Camión" icon={Truck}>
                <div className={readonlyFieldCls}>
                  <span className="font-medium text-foreground">{ordenSeleccionada?.camionId}</span>
                  <span className="text-muted-foreground">· 15.000 kg</span>
                  {/* Carga del camión, compacta, junto a la info del camión (mismo dato que la tabla). */}
                  <span className="ml-auto flex shrink-0 items-center gap-1.5">
                    <span className="h-1.5 w-10 overflow-hidden rounded-full bg-muted">
                      <span
                        className={`block h-full rounded-full ${cargaColor(ordenSeleccionada?.cargaPct ?? 0)}`}
                        style={{ width: `${ordenSeleccionada?.cargaPct ?? 0}%` }}
                      />
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {ordenSeleccionada?.cargaPct ?? 0}%
                    </span>
                  </span>
                </div>
              </InfoField>
            </div>

            {/* Paradas de la ruta. */}
            <div className="mt-6">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm font-medium">Paradas</span>
                <span className="text-sm text-muted-foreground tabular-nums">({MOCK_ENTREGAS.length})</span>
              </div>
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="max-h-[300px] overflow-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead className="sticky top-0 z-10 bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="w-10 px-3 py-2 text-center font-medium">#</th>
                        <th className="px-3 py-2 text-left font-medium">Cliente</th>
                        <th className="hidden px-3 py-2 text-left font-medium sm:table-cell">Dirección</th>
                        <th className="px-3 py-2 text-left font-medium">Horario</th>
                        <th className="px-3 py-2 text-center font-medium">Prioridad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedEntregas.map((entrega) => (
                        <tr key={entrega.id} className="border-t border-border transition-colors hover:bg-muted/30">
                          <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">
                            {entrega.secuencia}
                          </td>
                          <td className="max-w-[200px] truncate px-3 py-2 font-medium">{entrega.cliente}</td>
                          <td className="hidden max-w-[220px] truncate px-3 py-2 text-muted-foreground sm:table-cell">
                            {entrega.direccion}
                          </td>
                          <td className="px-3 py-2 tabular-nums">{entrega.ventana}</td>
                          <td className="px-3 py-2 text-center">
                            <Badge variant={entrega.prioridad === 'Alta' ? 'destructive' : 'secondary'}>
                              {entrega.prioridad}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Paginación de paradas. */}
              <div className="mt-2 flex items-center justify-between px-1">
                <span className="text-xs text-muted-foreground">
                  Mostrando {(entregasPage - 1) * ENTREGAS_PER_PAGE + 1}–
                  {Math.min(entregasPage * ENTREGAS_PER_PAGE, MOCK_ENTREGAS.length)} de {MOCK_ENTREGAS.length}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    className="h-7 w-7"
                    onClick={() => setEntregasPage((p) => Math.max(1, p - 1))}
                    disabled={entregasPage === 1}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <span className="px-2 text-xs font-medium tabular-nums">
                    {entregasPage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    className="h-7 w-7"
                    onClick={() => setEntregasPage((p) => Math.min(totalPages, p + 1))}
                    disabled={entregasPage === totalPages}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-border px-5 py-5">
            <DialogClose render={<Button variant="outline">Cancelar</Button>} />
            <Button onClick={() => setOrdenSeleccionada(null)}>Guardar cambios</Button>
          </DialogFooter>
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