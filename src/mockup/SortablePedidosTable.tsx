// Lista de puntos de entrega del plan sobre el DataTable COMPARTIDO (TanStack)
// Agrupa los pedidos por punto de entrega (delivery_point) para que no se repita el cliente/sucursal
// cuando realiza múltiples pedidos en la misma entrega.
import { useEffect, useMemo, useState } from 'react'
import { ArrowUpDown, Eye, Pencil, RotateCw, Route, Trash2 } from 'lucide-react'
import { arrayMove } from '@dnd-kit/sortable'
import { toast } from 'sonner'
import {
  DataTable,
  defineColumns,
  type BulkAction,
  type ColumnDefConfig,
  type RowAction,
} from '@/components/data-table'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RUTAS, rutaPorPedidoId, type CanalId, type Parada, type Pedido } from './mock-data'
import { PuntoEntregaDialog } from './PuntoEntregaDialog'
import type { BoardState } from './types'

/** Formatea un monto en Bs con separadores es-BO (1.240,50). */
const bs = (n: number) => n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const SIN_RUTA = 'sin'

export interface PuntoEntregaItem {
  id: string
  puntoEntregaId: string
  puntoEntrega: string
  cliente: string
  canal: CanalId
  total: number
  peso: number
  pedidos: Pedido[]
  pedidosIds: string[]
  firstPedidoId: string
}

/** Agrupa los pedidos por punto de entrega (puntoEntregaId) */
function agruparPorPuntoEntrega(pedidos: Pedido[]): PuntoEntregaItem[] {
  const map = new Map<string, PuntoEntregaItem>()
  for (const p of pedidos) {
    const key = p.puntoEntregaId || p.puntoEntrega || p.id
    let group = map.get(key)
    if (!group) {
      group = {
        id: `stop-${key}`,
        puntoEntregaId: p.puntoEntregaId || key,
        puntoEntrega: p.puntoEntrega,
        cliente: p.cliente,
        canal: p.canal,
        total: 0,
        peso: 0,
        pedidos: [],
        pedidosIds: [],
        firstPedidoId: p.id,
      }
      map.set(key, group)
    }
    group.total += p.total
    group.peso += p.peso
    group.pedidos.push(p)
    group.pedidosIds.push(p.id)
  }
  return Array.from(map.values())
}

/** Primera ruta con pedidos (default del select); cae a la primera ruta o "Sin ruta". */
function primeraRutaConPedidos(pedidos: Pedido[], listRutas: { id: string }[] = RUTAS): string {
  if (!listRutas || listRutas.length === 0) return SIN_RUTA
  return (
    listRutas.find((r) =>
      pedidos.some((p) => (p.rutaId ? p.rutaId === r.id : p.camionId ? `r-${p.camionId}` === r.id : false)),
    )?.id ??
    listRutas[0]?.id ??
    SIN_RUTA
  )
}

export function SortablePedidosTable({
  pedidos,
  state,
  optimized = false,
  onRetry = () => {},
  headerActions,
  readOnly = false,
  rutas,
  selectedRutaId,
  onSelectRuta,
  onReorder,
  onRenameRuta,
  onSelectPoint,
}: {
  pedidos: Pedido[]
  state: BoardState
  optimized?: boolean
  onRetry?: () => void
  headerActions?: React.ReactNode
  readOnly?: boolean
  rutas?: { id: string; nombre: string; color?: string; camionId?: string }[]
  selectedRutaId?: string
  onSelectRuta?: (rutaId: string) => void
  onReorder?: (rutaId: string, orderedItemIds: string[]) => void
  onRenameRuta?: (rutaId: string, nuevoNombre: string) => void
  onSelectPoint?: (item: PuntoEntregaItem) => void
}) {
  const showRoutes = optimized && !readOnly
  const listRutas = rutas || RUTAS
  const puntosEntrega = useMemo(() => agruparPorPuntoEntrega(pedidos), [pedidos])

  const [order, setOrder] = useState<string[]>(() => puntosEntrega.map((p) => p.id))
  const [removedPedidos, setRemovedPedidos] = useState<Set<string>>(new Set())
  const [rutaPorPedido, setRutaPorPedido] = useState<Map<string, string>>(new Map())
  const [localRutaSel, setLocalRutaSel] = useState<string>(() => primeraRutaConPedidos(pedidos, listRutas))
  
  const rutaSel = selectedRutaId !== undefined ? selectedRutaId : localRutaSel
  const changeRutaSel = (v: string) => {
    if (v === 'ALL') {
      setEditMode(false)
    }
    if (onSelectRuta) onSelectRuta(v)
    else setLocalRutaSel(v)
  }

  // Modos: reordenar (drag de filas). Habilitado solo para una ruta específica.
  const [editMode, setEditMode] = useState(false)
  const [detallePunto, setDetallePunto] = useState<PuntoEntregaItem | null>(null)
  // Quitar un punto es DESTRUCTIVO y hasta ahora era un click sin red: el punto desaparecía de la
  // ruta sin preguntar y sin forma de recuperarlo. Acá se guarda la intención hasta que el usuario
  // confirme; `null` = no hay nada pendiente.
  const [quitarPendiente, setQuitarPendiente] = useState<{ pedidoIds: string[]; puntos: number } | null>(null)

  // Estado para el recálculo por lotes (cambios pendientes)
  const [lastAppliedOrder, setLastAppliedOrder] = useState<string[]>(() => puntosEntrega.map((p) => p.id))
  const [hasPendingReorder, setHasPendingReorder] = useState(false)
  const [pendingChangesCount, setPendingChangesCount] = useState(0)

  useEffect(() => {
    const initialIds = puntosEntrega.map((p) => p.id)
    setOrder(initialIds)
    setLastAppliedOrder(initialIds)
    setRemovedPedidos(new Set())
    setRutaPorPedido(new Map())
    setLocalRutaSel(primeraRutaConPedidos(pedidos, listRutas))
    setEditMode(false)
    setHasPendingReorder(false)
    setPendingChangesCount(0)
  }, [puntosEntrega, pedidos, listRutas])

  const byId = useMemo(() => new Map(puntosEntrega.map((p) => [p.id, p])), [puntosEntrega])

  // Ruta efectiva del punto de entrega (según su primer pedido o override)
  const efectivaRutaId = (item: PuntoEntregaItem): string => {
    for (const pid of item.pedidosIds) {
      if (rutaPorPedido.has(pid)) return rutaPorPedido.get(pid)!
    }
    const p0 = item.pedidos[0]
    if (p0?.rutaId) return p0.rutaId
    if (p0?.camionId) return `r-${p0.camionId}`
    return rutaPorPedidoId(item.firstPedidoId)?.id ?? SIN_RUTA
  }

  // Filtrar los puntos que conservan al menos un pedido sin eliminar
  const planPuntos = order
    .map((id) => byId.get(id))
    .filter((item): item is PuntoEntregaItem => {
      if (!item) return false
      return item.pedidosIds.some((pid) => !removedPedidos.has(pid))
    })

  const seqPorPunto = useMemo(() => {
    const seqMap = new Map<string, number>()
    const countMap = new Map<string, number>()
    for (const item of planPuntos) {
      const rid = efectivaRutaId(item)
      const current = (countMap.get(rid) ?? 0) + 1
      countMap.set(rid, current)
      // Si la parada trae secuencia asignada por el optimizador, la usa; si no, usa el contador de la ruta
      const seqVal = item.pedidos[0]?.secuencia ?? current
      seqMap.set(item.id, seqVal)
    }
    return seqMap
  }, [planPuntos, rutaPorPedido])

  const countByRuta = new Map<string, number>()
  for (const item of planPuntos) {
    const rid = efectivaRutaId(item)
    countByRuta.set(rid, (countByRuta.get(rid) ?? 0) + 1)
  }

  const rutaOptions = listRutas.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    color: r.color as string | undefined,
    count: countByRuta.get(r.id) ?? 0,
  }))

  const rutaPuntos = rutaSel === 'ALL' ? planPuntos : planPuntos.filter((item) => efectivaRutaId(item) === rutaSel)
  const data = showRoutes ? rutaPuntos : planPuntos

  function onRowReorder(activeId: string, overId: string) {
    setOrder((prev) => {
      const from = prev.indexOf(activeId)
      const to = prev.indexOf(overId)
      if (from === -1 || to === -1) return prev
      const nextOrder = arrayMove(prev, from, to)

      const currentRutaItems = nextOrder
        .map((id) => byId.get(id))
        .filter((item): item is PuntoEntregaItem => !!item && efectivaRutaId(item) === rutaSel)

      const lastRutaItems = lastAppliedOrder
        .map((id) => byId.get(id))
        .filter((item): item is PuntoEntregaItem => !!item && efectivaRutaId(item) === rutaSel)

      let changed = 0
      currentRutaItems.forEach((item, index) => {
        if (lastRutaItems[index]?.id !== item.id) {
          changed++
        }
      })

      setHasPendingReorder(changed > 0)
      setPendingChangesCount(changed)
      return nextOrder
    })
  }

  function applyReorder() {
    if (!onReorder || rutaSel === 'ALL') return
    const currentPlanPuntos = order
      .map((id) => byId.get(id))
      .filter((item): item is PuntoEntregaItem => !!item && item.pedidosIds.some((pid) => !removedPedidos.has(pid)))

    const newRutaOrder = currentPlanPuntos
      .filter((item) => efectivaRutaId(item) === rutaSel)
      .map((item) => item.id)

    setLastAppliedOrder(order)
    setHasPendingReorder(false)
    setPendingChangesCount(0)
    onReorder(rutaSel, newRutaOrder)
  }

  function discardReorder() {
    setOrder(lastAppliedOrder)
    setHasPendingReorder(false)
    setPendingChangesCount(0)
  }

  function moverARuta(pedidoIds: string[], rutaId: string) {
    setRutaPorPedido((prev) => {
      const next = new Map(prev)
      pedidoIds.forEach((id) => next.set(id, rutaId))
      return next
    })
    if (onReorder) onReorder()
  }

  function quitar(pedidoIds: string[]) {
    setRemovedPedidos((prev) => new Set([...prev, ...pedidoIds]))
    if (onReorder) onReorder()
  }

  /** Devuelve a la ruta los pedidos quitados. Es el "Deshacer" del aviso posterior. */
  function deshacerQuitar(pedidoIds: string[]) {
    setRemovedPedidos((prev) => {
      const next = new Set(prev)
      pedidoIds.forEach((id) => next.delete(id))
      return next
    })
    if (onReorder) onReorder()
  }

  /** Confirma lo pendiente y avisa con opción de deshacer. La confirmación evita el borrado
   *  accidental; el deshacer cubre el caso de confirmar igual y arrepentirse. */
  function confirmarQuitar() {
    if (!quitarPendiente) return
    const { pedidoIds, puntos } = quitarPendiente
    quitar(pedidoIds)
    setQuitarPendiente(null)
    toast.success(
      puntos === 1 ? 'Punto de entrega quitado de la ruta' : `${puntos} puntos de entrega quitados de la ruta`,
      {
        action: { label: 'Deshacer', onClick: () => deshacerQuitar(pedidoIds) },
        duration: 8000,
      },
    )
  }

  function toggleEdit() {
    if (rutaSel === 'ALL') return
    if (editMode && hasPendingReorder) {
      applyReorder()
    }
    setEditMode((v) => !v)
  }

  const columns = useMemo<ColumnDefConfig<PuntoEntregaItem>[]>(
    () =>
      defineColumns<PuntoEntregaItem>([
        {
          id: 'seq',
          header: '#',
          size: 70,
          pin: 'left',
          enableSorting: false,
          enableHiding: false,
          enableResizing: false,
          cell: (row, index) => {
            if (!showRoutes) {
              return <span className="tabular-nums text-muted-foreground text-xs">{index + 1}</span>
            }
            const color = listRutas.find((r) => r.id === efectivaRutaId(row))?.color
            const seqNum = seqPorPunto.get(row.id) ?? row.pedidos[0]?.secuencia ?? (index + 1)
            return (
              <span
                className="inline-flex items-center select-none"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <Badge
                  variant="outline"
                  className="h-5 px-1.5 font-bold tabular-nums text-[11px] rounded-md"
                  style={{
                    borderColor: color ? `${color}60` : undefined,
                    backgroundColor: color ? `${color}15` : undefined,
                    color: color || undefined,
                  }}
                >
                  #{seqNum}
                </Badge>
              </span>
            )
          },
        },
        {
          id: 'cliente',
          header: 'Cliente / Punto de entrega',
          accessorKey: 'cliente',
          size: 240,
          enableSorting: false,
          cell: (row) => (
            <div className="flex flex-col min-w-0 leading-tight py-0.5" title={`${row.cliente} — ${row.puntoEntrega}`}>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="truncate font-medium text-foreground">{row.cliente}</span>
                {row.pedidos.length > 1 && (
                  <Badge variant="secondary" className="h-4 shrink-0 px-1 text-[10px] font-semibold tabular-nums">
                    {row.pedidos.length} pedidos
                  </Badge>
                )}
              </div>
              {row.puntoEntrega && (
                <span className="truncate text-[11px] text-muted-foreground">
                  {row.puntoEntrega}
                </span>
              )}
            </div>
          ),
        },
        {
          id: 'total',
          header: 'Total Bs',
          accessorKey: 'total',
          size: 110,
          enableSorting: false,
          meta: { align: 'right' },
          cell: (row) => <span className="tabular-nums">{bs(row.total)}</span>,
        },
        {
          id: 'peso',
          header: 'Peso total',
          accessorKey: 'peso',
          size: 110,
          enableSorting: false,
          meta: { align: 'right' },
          cell: (row) => <span className="tabular-nums">{row.peso} kg</span>,
        },
      ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rutaPorPedido, showRoutes, listRutas],
  )

  const rowActions = (row: PuntoEntregaItem): RowAction<PuntoEntregaItem>[] => [
    {
      label: 'Ver detalle de pedidos',
      icon: Eye,
      onClick: () => setDetallePunto(row),
    },
    ...(showRoutes
      ? listRutas.filter((r) => r.id !== efectivaRutaId(row)).map((r) => ({
          label: `Mover a ${r.nombre}`,
          icon: Route,
          onClick: () => moverARuta(row.pedidosIds, r.id),
        }))
      : []),
    {
      label: 'Quitar punto de entrega',
      icon: Trash2,
      variant: 'destructive' as const,
      separator: true,
      onClick: () => setQuitarPendiente({ pedidoIds: row.pedidosIds, puntos: 1 }),
    },
  ]

  const bulkActions: BulkAction<PuntoEntregaItem>[] = [
    {
      label: 'Quitar punto de entrega',
      icon: Trash2,
      variant: 'destructive',
      onClick: (rows) =>
        setQuitarPendiente({ pedidoIds: rows.flatMap((r) => r.pedidosIds), puntos: rows.length }),
    },
  ]

  const filterBar = (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between min-w-0">
      {/* Grupo Izquierdo: Selección de Ruta y Renombrado */}
      <div className="flex items-center gap-2 min-w-0 flex-wrap flex-1">
        {showRoutes ? (
          <>
            <span className="text-xs font-medium text-muted-foreground shrink-0">Ruta</span>
            <Select value={rutaSel} onValueChange={(v) => v && changeRutaSel(v)}>
              <SelectTrigger size="sm" className="h-8 w-40 sm:w-48 shrink-0 text-xs">
                <SelectValue>
                  {(value) => {
                    if (value === 'ALL') {
                      return (
                        <span className="flex items-center gap-1.5 min-w-0 truncate">
                          <Route size={12} className="shrink-0 opacity-60" />
                          <span className="truncate">Todas ({planPuntos.length})</span>
                        </span>
                      )
                    }
                    const rt = rutaOptions.find((r) => r.id === value)
                    if (!rt) return null
                    return (
                      <span className="flex items-center gap-1.5 min-w-0 truncate">
                        {rt.color ? (
                          <span className="size-2 shrink-0 rounded-full" style={{ background: rt.color }} />
                        ) : (
                          <Route size={12} className="shrink-0 opacity-60" />
                        )}
                        <span className="truncate font-medium">{rt.nombre}</span>
                        <span className="text-muted-foreground text-[11px] tabular-nums shrink-0">({rt.count})</span>
                      </span>
                    )
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-60 w-auto min-w-[220px]">
                <SelectItem value="ALL">
                  <div className="flex items-center justify-between w-full gap-2 min-w-0 pr-1">
                    <span className="flex items-center gap-2 min-w-0 truncate">
                      <Route size={12} className="shrink-0 opacity-60" />
                      <span className="truncate">Todas las rutas</span>
                    </span>
                    <span className="text-muted-foreground tabular-nums shrink-0 text-[11px] font-medium">
                      ({planPuntos.length})
                    </span>
                  </div>
                </SelectItem>
                {rutaOptions.map((rt) => (
                  <SelectItem key={rt.id} value={rt.id}>
                    <div className="flex items-center justify-between w-full gap-2 min-w-0 pr-1">
                      <span className="flex items-center gap-2 min-w-0 truncate">
                        {rt.color ? (
                          <span className="size-2 shrink-0 rounded-full" style={{ background: rt.color }} />
                        ) : (
                          <Route size={12} className="shrink-0 opacity-60" />
                        )}
                        <span className="truncate font-medium">{rt.nombre}</span>
                      </span>
                      <span className="text-muted-foreground tabular-nums shrink-0 text-[11px] font-medium">
                        ({rt.count})
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {rutaSel !== 'ALL' && onRenameRuta && (
              <div className="flex items-center gap-1.5 min-w-[130px] max-w-[200px] flex-1">
                <Pencil size={12} className="text-muted-foreground shrink-0" />
                <Input
                  value={listRutas.find((r) => r.id === rutaSel)?.nombre ?? ''}
                  onChange={(e) => onRenameRuta(rutaSel, e.target.value)}
                  className="h-8 w-full text-xs bg-background font-medium"
                  placeholder="Nombre de la ruta..."
                />
              </div>
            )}
          </>
        ) : (
          <span className="text-xs font-medium text-muted-foreground shrink-0">
            Puntos de entrega <span className="tabular-nums">({planPuntos.length})</span>
          </span>
        )}
      </div>

      {/* Grupo Derecho: Acciones y Botones */}
      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
        <Button
          variant={editMode ? 'default' : 'outline'}
          size="sm"
          className="h-8 px-2.5 gap-1.5 text-xs"
          onClick={toggleEdit}
          disabled={rutaSel === 'ALL'}
          aria-pressed={editMode}
          title={
            rutaSel === 'ALL'
              ? 'Elegí una ruta específica para reordenar sus paradas'
              : 'Reordenar la secuencia arrastrando las filas'
          }
        >
          <ArrowUpDown size={14} />
          <span>{editMode ? 'Listo' : 'Reordenar'}</span>
        </Button>
        {headerActions && <div className="flex shrink-0 items-center">{headerActions}</div>}
      </div>
    </div>
  )

  const paradaDialogData: Parada | null = detallePunto
    ? {
        id: detallePunto.id,
        puntoEntregaId: detallePunto.puntoEntregaId,
        puntoEntrega: detallePunto.puntoEntrega,
        cliente: detallePunto.cliente,
        canal: detallePunto.canal,
        pedidos: detallePunto.pedidos,
        pesoTotal: detallePunto.peso,
        volumenTotal: detallePunto.pedidos.reduce((acc, p) => acc + p.volumen, 0),
        ventana: detallePunto.pedidos[0]?.ventana ?? '',
        secuencia: 1,
        camionId: null,
        camionForzadoId: null,
        lat: detallePunto.pedidos[0]?.lat ?? 0,
        lng: detallePunto.pedidos[0]?.lng ?? 0,
      }
    : null

  return (
    <div className="relative flex flex-1 flex-col min-h-0">
      <DataTable
        tableId={`mockup-plan-lista-${state}`}
        columns={columns}
        data={data}
        getRowId={(row) => row.id}
        isLoading={state === 'loading'}
        isError={state === 'error'}
        errorMessage="No pudimos armar los puntos de entrega del plan."
        onRetry={onRetry}
        emptyTitle="Sin puntos de entrega"
        emptyMessage={
          showRoutes
            ? 'Esta ruta no tiene puntos de entrega.'
            : 'Todavía no hay puntos de entrega para planificar.'
        }
        fillHeight
        clientPagination
        defaultPageSize={10}
        selectable={false}
        enableRowReorder={editMode}
        onRowReorder={onRowReorder}
        onRowClick={(row) => {
          if (onSelectPoint) onSelectPoint(row)
          else setDetallePunto(row)
        }}
        rowClassName={() => 'cursor-pointer'}
        searchable
        searchPlaceholder="Buscar por cliente o sucursal…"
        searchKeys={['cliente', 'puntoEntrega', 'puntoEntregaId']}
        rowActions={rowActions}
        bulkActions={bulkActions}
        filterBar={filterBar}
      />

      {/* Barra flotante de confirmación para recalcular cambios de reordenamiento */}
      {hasPendingReorder && rutaSel !== 'ALL' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[100] flex max-w-[95%] w-max items-center justify-between gap-3 rounded-full border border-primary/25 bg-popover/95 px-3.5 py-1.5 shadow-xl backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-2 whitespace-nowrap">
          <div className="flex items-center gap-2 text-xs font-medium text-popover-foreground shrink-0 whitespace-nowrap">
            <span className="flex size-5 items-center justify-center rounded-full bg-primary/15 text-primary">
              <ArrowUpDown size={12} />
            </span>
            <span className="whitespace-nowrap">
              <strong className="font-semibold tabular-nums text-primary">{pendingChangesCount}</strong>{' '}
              {pendingChangesCount === 1 ? 'cambio de orden' : 'cambios de orden'}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 rounded-full px-2.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={discardReorder}
            >
              Deshacer
            </Button>
            <Button
              size="sm"
              className="h-7 rounded-full px-3 gap-1.5 text-xs font-medium shadow-sm"
              onClick={applyReorder}
            >
              <RotateCw size={12} />
              Recalcular
            </Button>
          </div>
        </div>
      )}

      {paradaDialogData && (
        <PuntoEntregaDialog parada={paradaDialogData} onClose={() => setDetallePunto(null)} />
      )}

      {/* Confirmación de quitar. Se abre por estado (no por trigger) porque la acción nace en el
          menú de la fila y en la barra de selección, que ya se cerraron para cuando esto aparece.
          El texto dice cuántos PEDIDOS se van junto al punto: un punto de entrega puede agrupar
          varios, y ese es justo el dato que hace dudar antes de confirmar. */}
      <AlertDialog
        open={quitarPendiente !== null}
        onOpenChange={(abierto) => { if (!abierto) setQuitarPendiente(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {quitarPendiente?.puntos === 1
                ? '¿Quitar este punto de entrega?'
                : `¿Quitar ${quitarPendiente?.puntos ?? 0} puntos de entrega?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {quitarPendiente?.pedidoIds.length === 1
                ? 'Su pedido sale de la ruta y no entra a la planificación.'
                : `Sus ${quitarPendiente?.pedidoIds.length ?? 0} pedidos salen de la ruta y no entran a la planificación.`}
              {' '}Vas a poder deshacerlo desde el aviso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmarQuitar}>
              Quitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
