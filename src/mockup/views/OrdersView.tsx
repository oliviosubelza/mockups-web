import { useState, useMemo } from 'react'
import { DataTable, defineColumns, defineFilters, FilterBar } from '@/components/data-table'
import { Button } from '@/components/ui/button'
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
  CAMIONES,
  CanalId,
  CHOFERES,
  ORDENES,
  PARADAS,
  ProductType,
  RUTAS,
  type OrdenDespacho,
  type Ruta,
} from '../mock-data'
import type { BoardState } from '../types'
import { MoreVertical, BellOff, SquarePen, CheckCircle } from 'lucide-react'
import { OrdersMap } from '../OrdersMap'
import { useDispatchPlanSnapshot } from '../dispatch-plan-snapshot'
import { EditarDetalleDialog, type ParadaDetalle } from './EditarDetalleDialog'
import { navigateTo } from '../routes'
import { usePlanesStore } from '../planes-store'
import { useTransportOrdersStore } from '../transport-orders-store'

interface OrdenFilters extends Record<string, unknown> {
  ruta?: string
}

/**
 * Capacidad de un camión en kg (truck.capacity_weight viene en toneladas).
 *
 * Ojo con el dato del mockup: los `camionId` de ORDENES son placeholders SAP ('Truck-SAP1') y NO
 * existen en CAMIONES, que se identifica por placa. Para esos valores no hay capacidad real, así que
 * cae al mismo 15.000 kg que antes estaba hardcodeado en el diálogo. Los camiones ELEGIBLES sí salen
 * de CAMIONES (placas reales con capacidad real), por eso reasignar sí muestra la capacidad correcta.
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
  const updateActivePlanCamion = usePlanesStore((store) => store.updateActivePlanCamion)
  const assignDriver = useTransportOrdersStore((store) => store.assignDriver)
  const reassignTruck = useTransportOrdersStore((store) => store.reassignTruck)

  // Estado para el modal
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<OrdenDespacho | null>(null)
  const [mapMaximized, setMapMaximized] = useState(false)
  const choferDe = (o: OrdenDespacho) => o.conductor
  const camionDe = (o: OrdenDespacho) => o.camionId
  const asignarChofer = (id: string, chofer: string) => {
    if (activePlan) {
      updateActivePlanCamion(id, { chofer })
      setOrdenSeleccionada((current) => current?.id === id ? { ...current, conductor: chofer } : current)
      return
    }
    assignDriver(id, chofer)
    setOrdenSeleccionada((current) => current?.id === id ? { ...current, conductor: chofer } : current)
  }
  const reasignarCamion = (id: string, camionId: string) => {
    if (activePlan) {
      const camion = CAMIONES.find((item) => item.placa === camionId)
      const actual = activePlan.camionesDetalle?.find((item) => item.rutaId === id)
      updateActivePlanCamion(id, {
        camionId: camion?.id ?? actual?.camionId ?? '',
        placa: camionId,
        tipo: camion?.tipo ?? actual?.tipo,
        clase: camion?.clase ?? actual?.clase,
        capacidadKg: camion ? camion.capacidadPeso * 1000 : actual?.capacidadKg,
        capacidadVolM3: camion?.capacidadVolumen ?? actual?.capacidadVolM3,
      })
      setOrdenSeleccionada((current) => current?.id === id ? { ...current, camionId } : current)
      return
    }
    reassignTruck(id, camionId)
    setOrdenSeleccionada((current) => current?.id === id ? { ...current, camionId } : current)
  }

  /**
   * Camiones asignables a la orden abierta: capacidad >= peso de la orden.
   *
   * OJO con el peso: en OrdenDespacho el peso total de la orden es `cargaPct`, que a pesar del nombre
   * guarda KILOS (20393, 23000, …) y la tabla lo renderiza como "… Kg". No se renombra acá porque es
   * un cambio de dataset fuera de alcance.
   *
   * El camión ACTUAL se incluye siempre (acá encima nunca está en CAMIONES: es un 'Truck-SAPn'), si no
   * el Combobox tendría un `value` que no está en `items` y quedaría inconsistente. Orden: capacidad
   * ascendente, así el primero es el que "justo alcanza".
   */
  const camionesElegibles = useMemo(() => {
    if (!ordenSeleccionada) return []
    const pesoKg = ordenSeleccionada.cargaPct
    const actual = camionDe(ordenSeleccionada)
    const placas = CAMIONES.filter((c) => capacidadKgDe(c.placa) >= pesoKg).map((c) => c.placa)
    if (!placas.includes(actual)) placas.push(actual)
    return placas.sort((a, b) => capacidadKgDe(a) - capacidadKgDe(b))
  }, [ordenSeleccionada])
  const [canales, setCanales] = useState<Set<CanalId>>(new Set())
  const [tipos, setTipos] = useState<Set<ProductType>>(new Set())
  const [optimized, setOptimized] = useState(false)
  const [rutas, setRutas] = useState<Set<string>>(new Set())
  const [showRoute, setShowRoute] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
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
          const parada = route.paradas?.find((item) => item.id === paradaId)
            ?? snapshotParadas.find((item) => item.id === paradaId)
            ?? PARADAS.find((item) => item.id === paradaId)
          if (!parada) return []
          return [{
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
          }]
        }),
      ),
    [activePlan, snapshotParadas],
  )
  const ordenesConfirmadas = useMemo<OrdenDespacho[]>(
    () =>
      (activePlan?.camionesDetalle ?? []).map((route, index) => {
        const camion = CAMIONES.find((item) => item.id === route.camionId)
        return {
          id: route.rutaId,
          codigo: String(index + 1),
          camionId: route.placa,
          rutaId: route.rutaId,
          conductor: route.chofer,
          almacen: camion?.almacen ?? '—',
          estado: 'pendiente',
          salida: `${String(6 + Math.floor(index / 4)).padStart(2, '0')}:${['00', '15', '30', '45'][index % 4]}`,
          cargaPct: route.cargaKg,
          duracionMin: 120 + route.paradaIds.length * 12,
        }
      }),
    [activePlan],
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

  // Paradas que pasan los filtros activos (lo que se pinta en el mapa).
  const filtradas = paradas.filter((p) => {
    if (canales.size > 0 && !canales.has(p.canal)) return false
    if (tipos.size > 0 && !p.pedidos.some((ped) => tipos.has(ped.productType))) return false
    if (rutas.size > 0) {
      const ruta = p.rutaId ? rutasPorId.get(p.rutaId) : p.camionId ? rutasPorCamionId.get(p.camionId) : undefined
      if (!ruta || !rutas.has(ruta.id)) return false
    }
    return true
  })

  const paradasDetalle = useMemo<ParadaDetalle[]>(() => {
    if (!ordenSeleccionada) return []
    const ruta = rutasPorId.get(ordenSeleccionada.rutaId)
    if (!ruta) return []
    return paradas
      .filter((parada) =>
        parada.rutaId ? parada.rutaId === ruta.id : parada.camionId === ruta.camionId,
      )
      .map((parada, index) => ({
        id: parada.id,
        secuencia: index + 1,
        cliente: parada.cliente,
        direccion: parada.puntoEntrega,
        prioridad: parada.pedidos.some((pedido) => pedido.priority === 1) ? 'Alta' : 'Normal',
        ventana: parada.ventana,
      }))
  }, [ordenSeleccionada, paradas, rutasPorId])

  const columns = useMemo(() => defineColumns<OrdenDespacho>([
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
    {
      id: 'camionId',
      header: 'Camión',
      accessorKey: 'camionId',
      size: 80,
      // Muestra el camión reasignado para que la edición del detalle se vea en la tabla.
      cell: (row) => <span className="truncate">{camionDe(row)}</span>,
    },
    {
      id: 'ruta',
      header: 'Ruta',
      size: 160,
      cell: (row) => {
        const ruta = rutasPorId.get(row.rutaId)
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
      id: 'acciones',
      header: 'Acciones',
      size: 90,
      cell: (row) => (
        <div className="flex justify-center">
          <DropdownMenu>
            {/* TRIGGER: El botón de los 3 puntitos */}
            <DropdownMenuTrigger
              render={<Button
                variant="ghost"
                size="icon-sm"
                className="h-8 w-8 p-0 mx-auto flex hover:bg-muted focus-visible:ring-1"
              />}
            >
                <MoreVertical className="h-4 w-4 text-muted-foreground" />
                <span className="sr-only">Abrir menú de acciones</span>
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
  ]), [rutasPorId])

  const filtrados = ordenesBase.filter(
    (o) =>
      (!filters.ruta || rutasPorId.get(o.rutaId)?.nombre === filters.ruta),
  )
  const data = state === 'empty' || state === 'error' ? [] : filtrados
  const handleFinish = () => {
    if (activePlanId !== null) updatePlanEstado(activePlanId, 'aprobado')
    navigateTo('planificaciones')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex items-center justify-between shrink-0">
        <h2 className="text-sm font-semibold text-foreground">Rutas generadas</h2>
        <Button size="sm" className="gap-1.5" onClick={handleFinish}>
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
        onRetry={() => { }}
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

      <EditarDetalleDialog
        titulo="Ruta"
        open={!!ordenSeleccionada}
        onOpenChange={(o) => { if (!o) setOrdenSeleccionada(null) }}
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
        // El peso total de la orden es cargaPct: son kilos, no un porcentaje (ver comentario arriba).
        pesoOrdenKg={ordenSeleccionada?.cargaPct}
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
              // Revisión de rutas: la capa de mercados está disponible pero arranca apagada — acá se
              // revisan las rutas, y los polígonos serían ruido hasta que alguien los pida.
              capaMercados="off"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
