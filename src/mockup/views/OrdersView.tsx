import { useState, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import { DataTable, defineColumns, defineFilters, FilterBar } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CAMIONES,
  CanalId,
  CANAL_META,
  CHOFERES,
  DEPOSITO,
  ORDENES,
  PARADAS,
  ProductType,
  RUTAS,
  type OrdenDespacho,
  type Parada,
  type Ruta,
} from '../mock-data'
import type { BoardState } from '../types'
import {
  MoreVertical,
  BellOff,
  SquarePen,
  CheckCircle,
  MapPin,
  Route,
  Truck,
  User,
  Clock,
  Warehouse,
  ListOrdered,
  Eye,
  EyeOff,
  X,
  Sparkles,
} from 'lucide-react'
import { OrdersMap } from '../OrdersMap'
import { useDispatchPlanSnapshot } from '../dispatch-plan-snapshot'
import { EditarDetalleDialog, type ParadaDetalle } from './EditarDetalleDialog'
import { navigateTo } from '../routes'
import { usePlanesStore } from '../planes-store'
import { useTransportOrdersStore } from '../transport-orders-store'
import { cn } from '@/lib/utils'

interface OrdenFilters extends Record<string, unknown> {
  ruta?: string
}

/**
 * Capacidad de un camión en kg (truck.capacity_weight viene en toneladas).
 */
const CAPACIDAD_FALLBACK_KG = 15000
const capacidadKgDe = (placa: string) => {
  const camion = CAMIONES.find((c) => c.placa === placa)
  return camion ? camion.capacidadPeso * 1000 : CAPACIDAD_FALLBACK_KG
}

/** Minutos → "3 h 30 min" (o "45 min"). */
const fmtDuracion = (min: number) => {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h} h ${m.toString().padStart(2, '0')} min` : `${m} min`
}

export function OrdersView({ state }: { state: BoardState }) {
  const [filters, setFilters] = useState<Partial<OrdenFilters>>({})
  const snapshot = useDispatchPlanSnapshot()
  const activePlanId = usePlanesStore((store) => store.activePlanId)
  const activePlan = usePlanesStore((store) =>
    activePlanId === null ? undefined : store.planes.find((plan) => plan.id === activePlanId),
  )
  const updatePlanEstado = usePlanesStore((store) => store.updatePlanEstado)
  const updateCamionDetalle = usePlanesStore((store) => store.updateCamionDetalle)
  const transportOrders = useTransportOrdersStore((store) => store.orders)
  const assignDriver = useTransportOrdersStore((store) => store.assignDriver)
  const reassignTruck = useTransportOrdersStore((store) => store.reassignTruck)

  // Estado para el modal de edición de chofer/camión
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<OrdenDespacho | null>(null)

  // Estado para el modal de inspección de mapa y secuencia
  const [mapMaximized, setMapMaximized] = useState(false)
  const [mapOrdenSeleccionada, setMapOrdenSeleccionada] = useState<OrdenDespacho | null>(null)
  const [modalRutaId, setModalRutaId] = useState<string>('ALL')
  const [showSequencePanel, setShowSequencePanel] = useState(true)
  const [showRouteTrace, setShowRouteTrace] = useState(true)
  const [showPinDetails, setShowPinDetails] = useState(false)
  const [modalFocusedStopId, setModalFocusedStopId] = useState<string | null>(null)
  const [modalFocusTarget, setModalFocusTarget] = useState<{ lat: number; lng: number; id: string; t: number } | null>(null)

  const choferDe = (o: OrdenDespacho) => o.conductor
  const camionDe = (o: OrdenDespacho) => o.camionId

  const asignarChofer = (id: string, chofer: string) => {
    assignDriver(id, chofer)
    const orden = ordenesBase.find((o) => o.id === id)
    if (activePlanId !== null && orden) {
      updateCamionDetalle(activePlanId, orden.rutaId, { chofer })
    }
    setOrdenSeleccionada((current) => (current?.id === id ? { ...current, conductor: chofer } : current))
    setMapOrdenSeleccionada((current) => (current?.id === id ? { ...current, conductor: chofer } : current))
    toast.success(`Chofer "${chofer}" asignado correctamente`)
  }

  const reasignarCamion = (id: string, camionPlaca: string) => {
    reassignTruck(id, camionPlaca)
    const orden = ordenesBase.find((o) => o.id === id)
    if (activePlanId !== null && orden) {
      updateCamionDetalle(activePlanId, orden.rutaId, { camionPlaca })
    }
    setOrdenSeleccionada((current) => (current?.id === id ? { ...current, camionId: camionPlaca } : current))
    setMapOrdenSeleccionada((current) => (current?.id === id ? { ...current, camionId: camionPlaca } : current))
    toast.success(`Camión "${camionPlaca}" reasignado correctamente`)
  }

  /**
   * Camiones asignables a la orden abierta: capacidad >= peso de la orden.
   */
  const camionesElegibles = useMemo(() => {
    if (!ordenSeleccionada) return []
    const pesoKg = ordenSeleccionada.cargaPct
    const actual = camionDe(ordenSeleccionada)
    const placas = CAMIONES.filter((c) => capacidadKgDe(c.placa) >= pesoKg).map((c) => c.placa)
    if (!placas.includes(actual)) placas.push(actual)
    return placas.sort((a, b) => capacidadKgDe(a) - capacidadKgDe(b))
  }, [ordenSeleccionada])

  const snapshotParadas = snapshot.active ? snapshot.paradas : PARADAS
  const rutasConfirmadas = useMemo<Ruta[]>(
    () =>
      (activePlan?.camionesDetalle ?? []).map((route) => ({
        id: route.rutaId,
        nombre: route.rutaNombre,
        color: route.rutaColor,
        camionId: route.camionId,
      })),
    [activePlan],
  )

  const paradasConfirmadas = useMemo(
    () =>
      (activePlan?.camionesDetalle ?? []).flatMap((route) =>
        route.paradaIds.flatMap((paradaId, index) => {
          const parada =
            route.paradas?.find((item) => item.id === paradaId) ??
            snapshotParadas.find((item) => item.id === paradaId) ??
            PARADAS.find((item) => item.id === paradaId)
          if (!parada) return []
          return [
            {
              ...parada,
              rutaId: route.rutaId,
              camionId: route.camionId,
              secuencia: index + 1,
              pedidos: parada.pedidos.map((pedido) => ({
                ...pedido,
                rutaId: route.rutaId,
                camionId: route.camionId,
                secuencia: index + 1,
              })),
            },
          ]
        }),
      ),
    [activePlan, snapshotParadas],
  )

  const ordenesConfirmadas = useMemo<OrdenDespacho[]>(
    () =>
      (activePlan?.camionesDetalle ?? []).flatMap((route, index) => {
        const operational = transportOrders.find((order) => order.id === `plan-${activePlan?.id}-${route.rutaId}`)
        if (!operational) return []
        const camion = CAMIONES.find((item) => item.id === route.camionId || item.placa === operational.camion)
        return [
          {
            id: operational.id,
            codigo: operational.codigo,
            camionId: operational.camion,
            rutaId: route.rutaId,
            conductor: operational.chofer,
            almacen: camion?.almacen ?? 'Almacén Central',
            estado: operational.estado,
            salida: `${String(6 + Math.floor(index / 4)).padStart(2, '0')}:${['00', '15', '30', '45'][index % 4]}`,
            cargaPct: route.cargaKg,
            duracionMin: 120 + route.paradaIds.length * 12,
          },
        ]
      }),
    [activePlan, transportOrders],
  )

  const paradasBase = activePlan ? paradasConfirmadas : snapshotParadas
  const rutasBase = activePlan ? rutasConfirmadas : snapshot.active ? snapshot.rutas : RUTAS
  const ordenesBase = activePlan ? ordenesConfirmadas : snapshot.active ? snapshot.ordenes : ORDENES
  const paradas = state === 'empty' || state === 'error' ? [] : paradasBase

  const rutasPorCamionId = useMemo(
    () => new Map(rutasBase.map((ruta) => [ruta.camionId, ruta])),
    [rutasBase],
  )
  const rutasPorId = useMemo(() => new Map(rutasBase.map((ruta) => [ruta.id, ruta])), [rutasBase])

  const filterDefs = useMemo(
    () =>
      defineFilters<OrdenFilters>([
        {
          type: 'select',
          id: 'ruta',
          label: 'Ruta',
          options: rutasBase.map((ruta) => ({ label: ruta.nombre, value: ruta.nombre })),
        },
      ]),
    [rutasBase],
  )

  const paradasDetalle = useMemo<ParadaDetalle[]>(() => {
    if (!ordenSeleccionada) return []
    const ruta = rutasPorId.get(ordenSeleccionada.rutaId)
    if (!ruta) return []
    return paradas
      .filter((parada) => (parada.rutaId ? parada.rutaId === ruta.id : parada.camionId === ruta.camionId))
      .map((parada, index) => ({
        id: parada.id,
        secuencia: parada.secuencia ?? index + 1,
        cliente: parada.cliente,
        direccion: parada.puntoEntrega,
        prioridad: parada.pedidos.some((pedido) => pedido.priority === 1) ? 'Alta' : 'Normal',
        ventana: parada.ventana,
      }))
  }, [ordenSeleccionada, paradas, rutasPorId])

  // Abrir modal de mapa con trazado y secuencia
  const abrirMapaDeOrden = useCallback(
    (orden: OrdenDespacho) => {
      setMapOrdenSeleccionada(orden)
      setModalRutaId(orden.rutaId)
      setShowRouteTrace(true)
      setShowSequencePanel(true)
      setModalFocusedStopId(null)
      setModalFocusTarget(null)
      setMapMaximized(true)
    },
    [],
  )

  // Datos para el modal del mapa
  const activeRutaModal = useMemo(() => {
    if (modalRutaId === 'ALL') return null
    return rutasPorId.get(modalRutaId) ?? rutasBase.find((r) => r.id === modalRutaId || r.camionId === modalRutaId) ?? null
  }, [modalRutaId, rutasPorId, rutasBase])

  const paradasDeRutaModal = useMemo<Parada[]>(() => {
    if (modalRutaId === 'ALL') {
      return [...paradas].sort((a, b) => (a.secuencia ?? 0) - (b.secuencia ?? 0))
    }
    return paradas
      .filter((p) => (p.rutaId ? p.rutaId === modalRutaId : p.camionId === activeRutaModal?.camionId))
      .sort((a, b) => (a.secuencia ?? 0) - (b.secuencia ?? 0))
  }, [modalRutaId, paradas, activeRutaModal])

  const ordenModalCorrespondiente = useMemo(() => {
    if (modalRutaId === 'ALL') return null
    return ordenesBase.find((o) => o.rutaId === modalRutaId) ?? mapOrdenSeleccionada
  }, [modalRutaId, ordenesBase, mapOrdenSeleccionada])

  const pesoTotalModal = useMemo(
    () => paradasDeRutaModal.reduce((sum, p) => sum + p.pesoTotal, 0),
    [paradasDeRutaModal],
  )

  const duracionModal = useMemo(
    () => 120 + paradasDeRutaModal.length * 12,
    [paradasDeRutaModal],
  )

  const handleModalRutaChange = (newRutaId: string) => {
    setModalRutaId(newRutaId)
    setModalFocusedStopId(null)
    setModalFocusTarget(null)
    if (newRutaId !== 'ALL') {
      const matchOrden = ordenesBase.find((o) => o.rutaId === newRutaId)
      if (matchOrden) setMapOrdenSeleccionada(matchOrden)
    }
  }

  const columns = useMemo(
    () =>
      defineColumns<OrdenDespacho>([
        {
          id: 'conductor',
          header: 'Chofer',
          accessorKey: 'conductor',
          size: 180,
          cell: (row) => {
            const chofer = choferDe(row)
            return chofer ? (
              <span className="truncate font-medium">{chofer}</span>
            ) : (
              <span className="text-xs text-muted-foreground">Sin asignar</span>
            )
          },
        },
        {
          id: 'camionId',
          header: 'Camión',
          accessorKey: 'camionId',
          size: 90,
          cell: (row) => (
            <span className="font-mono text-xs font-semibold text-foreground truncate">
              {camionDe(row)}
            </span>
          ),
        },
        {
          id: 'ruta',
          header: 'Ruta',
          size: 170,
          cell: (row) => {
            const ruta = rutasPorId.get(row.rutaId)
            return (
              <span className="flex items-center gap-2">
                {ruta && (
                  <span
                    className="size-2.5 shrink-0 rounded-full shadow-xs"
                    style={{ background: ruta.color }}
                  />
                )}
                <span className="truncate font-medium">{ruta?.nombre ?? '—'}</span>
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
            <div className="flex items-center gap-1.5">
              <span className="tabular-nums text-xs font-semibold text-foreground shrink-0">
                {row.cargaPct.toLocaleString('es')} kg
              </span>
            </div>
          ),
        },
        {
          id: 'duracion',
          header: 'Tiempo est.',
          accessorKey: 'duracionMin',
          size: 120,
          cell: (row) => (
            <span className="tabular-nums text-muted-foreground text-xs font-medium">
              {fmtDuracion(row.duracionMin)}
            </span>
          ),
        },
        {
          id: 'acciones',
          header: 'Acciones',
          size: 130,
          cell: (row) => (
            <div className="flex items-center justify-center gap-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="h-8 w-8 text-primary hover:bg-primary/10 hover:text-primary transition-colors"
                        onClick={() => abrirMapaDeOrden(row)}
                      />
                    }
                  >
                    <MapPin className="h-4 w-4" />
                    <span className="sr-only">Ver en mapa</span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Ver trazado y secuencia en mapa</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

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
                  <span className="sr-only">Abrir menú de acciones</span>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="w-52 shadow-md">
                  <DropdownMenuItem
                    onClick={() => abrirMapaDeOrden(row)}
                    className="cursor-pointer flex items-center gap-2 font-medium"
                  >
                    <MapPin className="h-4 w-4 text-primary" />
                    <span>Ver ruta en mapa</span>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => setOrdenSeleccionada(row)}
                    className="cursor-pointer flex items-center gap-2"
                  >
                    <SquarePen className="h-4 w-4" />
                    <span>Editar chofer y camión</span>
                  </DropdownMenuItem>

                  <DropdownMenuItem disabled className="flex items-center gap-2">
                    <BellOff className="h-4 w-4 text-muted-foreground" />
                    <span>Desactivar alertas</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ),
        },
      ]),
    [rutasPorId, abrirMapaDeOrden],
  )

  const filtrados = ordenesBase.filter(
    (o) => !filters.ruta || rutasPorId.get(o.rutaId)?.nombre === filters.ruta,
  )
  const data = state === 'empty' || state === 'error' ? [] : filtrados

  const handleFinish = () => {
    if (activePlanId !== null) {
      updatePlanEstado(activePlanId, 'aprobado')
      toast.success(`Planificación #${activePlanId} aprobada y finalizada con éxito`)
    } else {
      toast.success('Planificación aprobada con éxito')
    }
    navigateTo('planificaciones')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Rutas generadas</h2>
          <p className="text-xs text-muted-foreground">
            Revisá el trazado, la secuencia de entregas y confirmá los choferes y camiones asignados.
          </p>
        </div>
        <Button size="sm" className="gap-1.5 shadow-sm" onClick={handleFinish}>
          <CheckCircle size={14} />
          Finalizar y ver planificaciones
        </Button>
      </div>

      <DataTable
        tableId="mockup-ordenes-despacho"
        columns={columns}
        data={data}
        getRowId={(row) => row.id}
        isLoading={state === 'loading'}
        isError={state === 'error'}
        errorMessage="No pudimos traer las rutas generadas."
        onRetry={() => {}}
        emptyTitle="Ninguna ruta coincide"
        emptyMessage="Probá quitando los filtros para ver más rutas."
        fillHeight
        searchable
        searchPlaceholder="Buscar por chofer, camión o ruta…"
        clientPagination
        defaultPageSize={12}
        exportable
        exportFilename="rutas-generadas"
        filterBar={
          <FilterBar
            defs={filterDefs}
            values={filters}
            onChange={(u) => setFilters((prev) => ({ ...prev, ...u }))}
          />
        }
      />

      {/* Diálogo para editar Chofer y Camión */}
      <EditarDetalleDialog
        titulo="Ruta"
        open={!!ordenSeleccionada}
        onOpenChange={(o) => {
          if (!o) setOrdenSeleccionada(null)
        }}
        codigo={ordenSeleccionada?.codigo}
        estado={ordenSeleccionada?.estado}
        paradas={paradasDetalle}
        choferes={CHOFERES}
        choferValue={ordenSeleccionada ? choferDe(ordenSeleccionada) || null : null}
        onChoferChange={(v) => ordenSeleccionada && asignarChofer(ordenSeleccionada.id, v ?? '')}
        camiones={camionesElegibles}
        camionValue={ordenSeleccionada ? camionDe(ordenSeleccionada) || null : null}
        onCamionChange={(v) => ordenSeleccionada && reasignarCamion(ordenSeleccionada.id, v ?? '')}
        capacidadPorCamion={capacidadKgDe}
        pesoOrdenKg={ordenSeleccionada?.cargaPct}
        onGuardar={() => {
          setOrdenSeleccionada(null)
          toast.success('Cambios guardados en memoria')
        }}
      />

      {/* Modal Inspector de Trazado de Ruta y Secuencia de Entregas */}
      <Dialog open={mapMaximized} onOpenChange={setMapMaximized}>
        <DialogContent className="h-[92vh] w-[96vw] max-w-[96vw] overflow-hidden p-0 sm:max-w-[96vw] flex flex-col gap-0 border-border shadow-2xl">
          {/* Header del Modal */}
          <DialogHeader className="shrink-0 border-b border-border bg-card px-4 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Lado izquierdo: Selector de ruta y badges */}
              <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="size-3 shrink-0 rounded-full shadow-sm"
                    style={{ background: activeRutaModal?.color ?? '#2563eb' }}
                  />
                  <DialogTitle className="text-base font-semibold text-foreground">
                    {activeRutaModal ? activeRutaModal.nombre : 'Todas las rutas'}
                  </DialogTitle>
                </div>

                {ordenModalCorrespondiente && (
                  <Badge variant="outline" className="font-mono text-xs py-0.5 px-2 bg-muted/50">
                    {ordenModalCorrespondiente.codigo}
                  </Badge>
                )}

                {/* Selector para cambiar de ruta dentro del mismo visor */}
                <div className="w-52">
                  <Select value={modalRutaId} onValueChange={(v) => handleModalRutaChange(v ?? 'ALL')}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Ver ruta…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">
                        <span className="font-medium">Todas las rutas ({rutasBase.length})</span>
                      </SelectItem>
                      {rutasBase.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          <div className="flex items-center gap-2">
                            <span className="size-2 shrink-0 rounded-full" style={{ background: r.color }} />
                            <span>{r.nombre}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Centro: Chips de métricas de la ruta */}
              <div className="hidden lg:flex items-center gap-2 text-xs text-muted-foreground">
                {ordenModalCorrespondiente && (
                  <>
                    <div className="flex items-center gap-1 rounded-md bg-muted/60 px-2 py-1 font-medium text-foreground">
                      <Truck size={13} className="text-primary" />
                      <span>{camionDe(ordenModalCorrespondiente)}</span>
                    </div>
                    <div className="flex items-center gap-1 rounded-md bg-muted/60 px-2 py-1 font-medium text-foreground">
                      <User size={13} className="text-primary" />
                      <span>{choferDe(ordenModalCorrespondiente) || 'Sin asignar'}</span>
                    </div>
                  </>
                )}
                <div className="flex items-center gap-1 rounded-md bg-muted/60 px-2 py-1 font-medium text-foreground">
                  <MapPin size={13} className="text-primary" />
                  <span>{paradasDeRutaModal.length} paradas</span>
                </div>
                <div className="flex items-center gap-1 rounded-md bg-muted/60 px-2 py-1 font-medium text-foreground">
                  <span className="font-bold text-foreground">
                    {pesoTotalModal.toLocaleString('es')} kg
                  </span>
                </div>
                <div className="flex items-center gap-1 rounded-md bg-muted/60 px-2 py-1 font-medium text-foreground">
                  <Clock size={13} className="text-primary" />
                  <span>{fmtDuracion(duracionModal)}</span>
                </div>
              </div>

              {/* Lado derecho: Controles de vista */}
              <div className="flex items-center gap-1.5 ml-auto">
                <Button
                  variant={showSequencePanel ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  onClick={() => setShowSequencePanel((v) => !v)}
                  title="Mostrar/Ocultar lista de paradas en secuencia"
                >
                  <ListOrdered size={14} />
                  <span>Secuencia</span>
                </Button>

                <Button
                  variant={showRouteTrace ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  onClick={() => setShowRouteTrace((v) => !v)}
                  title="Mostrar/Ocultar trazado de ruta"
                >
                  <Route size={14} />
                  <span>Trazado</span>
                </Button>

                <Button
                  variant={showPinDetails ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  onClick={() => setShowPinDetails((v) => !v)}
                  title="Mostrar/Ocultar etiquetas en pines"
                >
                  {showPinDetails ? <EyeOff size={14} /> : <Eye size={14} />}
                  <span>Etiquetas</span>
                </Button>
              </div>
            </div>
          </DialogHeader>

          {/* Cuerpo del Modal: Split Panel de Secuencia + Mapa */}
          <div className="relative flex flex-1 min-h-0 overflow-hidden">
            {/* Panel Lateral: Lista Ordenada de Entregas (Secuencia 1..N) */}
            {showSequencePanel && (
              <div className="flex flex-col w-84 shrink-0 border-r border-border bg-card/95 backdrop-blur-xs z-10">
                <div className="p-3 border-b border-border/80 flex items-center justify-between bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Route size={15} className="text-primary" />
                    <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                      Secuencia del Recorrido
                    </span>
                  </div>
                  <Badge variant="secondary" className="text-[11px] font-semibold">
                    {paradasDeRutaModal.length} puntos
                  </Badge>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                  {/* Punto de Partida: Almacén */}
                  <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-muted/40 border border-border/70">
                    <div className="flex flex-col items-center">
                      <div className="size-7 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-sm">
                        <Warehouse size={14} />
                      </div>
                      <div className="w-0.5 h-6 bg-border mt-1" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">{DEPOSITO.nombre}</span>
                        <Badge variant="outline" className="text-[10px] py-0 px-1 font-mono">
                          06:00
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">{DEPOSITO.direccion}</p>
                      <span className="text-[10px] text-primary font-semibold">Punto de partida</span>
                    </div>
                  </div>

                  {/* Paradas en Secuencia 1 a N */}
                  {paradasDeRutaModal.map((parada, idx) => {
                    const isFocused =
                      modalFocusedStopId === parada.id || modalFocusTarget?.id === parada.id
                    const { icon: ChannelIcon, label: channelLabel, color: channelColor } =
                      CANAL_META[parada.canal]
                    const seqNum = parada.secuencia ?? idx + 1
                    const pRuta =
                      rutasPorId.get(parada.rutaId ?? '') ??
                      activeRutaModal ??
                      rutasBase.find((r) => r.camionId === parada.camionId)

                    return (
                      <div
                        key={parada.id}
                        onClick={() => {
                          setModalFocusedStopId(parada.id)
                          setModalFocusTarget({
                            lat: parada.lat,
                            lng: parada.lng,
                            id: parada.id,
                            t: Date.now(),
                          })
                        }}
                        className={cn(
                          'flex items-start gap-2.5 p-2.5 rounded-lg border transition-all cursor-pointer select-none',
                          isFocused
                            ? 'bg-primary/10 border-primary shadow-sm ring-1 ring-primary'
                            : 'bg-background hover:bg-muted/50 border-border/80',
                        )}
                      >
                        <div className="flex flex-col items-center">
                          <div
                            className="size-7 rounded-full flex items-center justify-center shrink-0 font-bold text-xs text-white shadow-sm"
                            style={{ backgroundColor: pRuta?.color ?? '#2563eb' }}
                          >
                            {seqNum}
                          </div>
                          {idx < paradasDeRutaModal.length - 1 && (
                            <div className="w-0.5 h-7 bg-border mt-1" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-bold truncate text-foreground">
                              {parada.cliente}
                            </span>
                            {parada.pedidos.some((p) => p.priority === 1) && (
                              <Badge variant="destructive" className="text-[9px] py-0 px-1 font-semibold">
                                Alta
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {parada.puntoEntrega || parada.cliente}
                          </p>
                          <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1 font-medium">
                              <Clock size={10} />
                              {parada.ventana}
                            </span>
                            <span>·</span>
                            <span className="tabular-nums font-semibold text-foreground">
                              {parada.pesoTotal.toLocaleString('es')} kg
                            </span>
                            <span>·</span>
                            <span
                              className="flex items-center gap-1 font-semibold"
                              style={{ color: channelColor }}
                            >
                              <ChannelIcon size={10} />
                              {channelLabel}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {/* Punto de Retorno: Almacén */}
                  <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-muted/40 border border-border/70">
                    <div className="size-7 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-sm">
                      <Warehouse size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">{DEPOSITO.nombre}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">Retorno</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">Fin de recorrido</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Mapa Principal de Rutas con Trazado y Pines Secuenciales */}
            <div className="relative flex-1 min-w-0 h-full">
              <OrdersMap
                paradas={paradasDeRutaModal}
                routeToolEnabled={true}
                showRoute={showRouteTrace}
                onToggleRoute={() => setShowRouteTrace((v) => !v)}
                showDetails={showPinDetails}
                singleRoute={modalRutaId !== 'ALL'}
                routeColor={activeRutaModal?.color ?? '#2563eb'}
                rutas={rutasBase}
                focusedParadaId={modalFocusedStopId}
                focusTarget={modalFocusTarget}
                onDismissFocus={() => {
                  setModalFocusedStopId(null)
                  setModalFocusTarget(null)
                }}
                capaMercados="off"
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
