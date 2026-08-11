// Lista de puntos de entrega del plan sobre el DataTable COMPARTIDO (TanStack)
// Agrupa los pedidos por punto de entrega (delivery_point) para que no se repita el cliente/sucursal
// cuando realiza múltiples pedidos en la misma entrega.
import { useEffect, useMemo, useState } from 'react'
import { ArrowUpDown, Eye, ListChecks, Route, Trash2 } from 'lucide-react'
import { arrayMove } from '@dnd-kit/sortable'
import {
  DataTable,
  defineColumns,
  type BulkAction,
  type ColumnDefConfig,
  type RowAction,
} from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
function primeraRutaConPedidos(pedidos: Pedido[], listRutas: { id: string }[]): string {
  return listRutas.find((r) => pedidos.some((p) => (p.camionId ? `r-${p.camionId}` === r.id : false)))?.id ?? listRutas[0]?.id ?? SIN_RUTA
}

export function SortablePedidosTable({
  pedidos,
  state,
  optimized = false,
  onRetry = () => {},
  headerActions,
  readOnly = false,
  rutas,
}: {
  pedidos: Pedido[]
  state: BoardState
  optimized?: boolean
  onRetry?: () => void
  headerActions?: React.ReactNode
  readOnly?: boolean
  rutas?: { id: string; nombre: string; color?: string; camionId?: string }[]
}) {
  const showRoutes = optimized && !readOnly
  const listRutas = rutas || RUTAS
  const puntosEntrega = useMemo(() => agruparPorPuntoEntrega(pedidos), [pedidos])

  const [order, setOrder] = useState<string[]>(() => puntosEntrega.map((p) => p.id))
  const [removedPedidos, setRemovedPedidos] = useState<Set<string>>(new Set())
  const [rutaPorPedido, setRutaPorPedido] = useState<Map<string, string>>(new Map())
  const [rutaSel, setRutaSel] = useState<string>(() => primeraRutaConPedidos(pedidos, listRutas))
  const [selectMode, setSelectMode] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [detallePunto, setDetallePunto] = useState<PuntoEntregaItem | null>(null)

  useEffect(() => {
    setOrder(puntosEntrega.map((p) => p.id))
    setRemovedPedidos(new Set())
    setRutaPorPedido(new Map())
    setRutaSel(primeraRutaConPedidos(pedidos, listRutas))
    setSelectMode(false)
    setEditMode(false)
  }, [puntosEntrega, pedidos, listRutas])

  const byId = useMemo(() => new Map(puntosEntrega.map((p) => [p.id, p])), [puntosEntrega])

  // Ruta efectiva del punto de entrega (según su primer pedido o override)
  const efectivaRutaId = (item: PuntoEntregaItem): string => {
    for (const pid of item.pedidosIds) {
      if (rutaPorPedido.has(pid)) return rutaPorPedido.get(pid)!
    }
    const camionId = item.pedidos[0]?.camionId
    if (camionId) return `r-${camionId}`
    return rutaPorPedidoId(item.firstPedidoId)?.id ?? SIN_RUTA
  }

  // Filtrar los puntos que conservan al menos un pedido sin eliminar
  const planPuntos = order
    .map((id) => byId.get(id))
    .filter((item): item is PuntoEntregaItem => {
      if (!item) return false
      return item.pedidosIds.some((pid) => !removedPedidos.has(pid))
    })

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

  const rutaPuntos = planPuntos.filter((item) => efectivaRutaId(item) === rutaSel)
  const data = showRoutes ? rutaPuntos : planPuntos

  function onRowReorder(activeId: string, overId: string) {
    setOrder((prev) => {
      const from = prev.indexOf(activeId)
      const to = prev.indexOf(overId)
      if (from === -1 || to === -1) return prev
      return arrayMove(prev, from, to)
    })
  }

  function moverARuta(pedidoIds: string[], rutaId: string) {
    setRutaPorPedido((prev) => {
      const next = new Map(prev)
      pedidoIds.forEach((id) => next.set(id, rutaId))
      return next
    })
  }

  function quitar(pedidoIds: string[]) {
    setRemovedPedidos((prev) => new Set([...prev, ...pedidoIds]))
  }

  function toggleSelect() {
    setSelectMode((v) => !v)
    setEditMode(false)
  }
  function toggleEdit() {
    setEditMode((v) => !v)
    setSelectMode(false)
  }

  const columns = useMemo<ColumnDefConfig<PuntoEntregaItem>[]>(
    () =>
      defineColumns<PuntoEntregaItem>([
        {
          id: 'seq',
          header: '#',
          size: 64,
          pin: 'left',
          enableSorting: false,
          enableHiding: false,
          enableResizing: false,
          cell: (row, index) => {
            const color = showRoutes ? listRutas.find((r) => r.id === efectivaRutaId(row))?.color : undefined
            return (
              <span className="inline-flex items-center gap-1.5">
                {color && <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />}
                <span className="tabular-nums text-muted-foreground">{index + 1}</span>
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
      label: 'Quitar del plan',
      icon: Trash2,
      variant: 'destructive' as const,
      separator: true,
      onClick: () => quitar(row.pedidosIds),
    },
  ]

  const bulkActions: BulkAction<PuntoEntregaItem>[] = [
    {
      label: 'Quitar del plan',
      icon: Trash2,
      variant: 'destructive',
      onClick: (rows) => quitar(rows.flatMap((r) => r.pedidosIds)),
    },
  ]

  const filterBar = (
    <div className="flex flex-1 items-center gap-2">
      {showRoutes ? (
        <>
          <span className="text-xs font-medium text-muted-foreground">Ruta</span>
          <Select value={rutaSel} onValueChange={(v) => v && setRutaSel(v)}>
            <SelectTrigger size="sm" className="w-56">
              <SelectValue>
                {(value) => {
                  const rt = rutaOptions.find((r) => r.id === value)
                  if (!rt) return null
                  return (
                    <span className="flex items-center gap-2">
                      {rt.color ? (
                        <span className="size-2 shrink-0 rounded-full" style={{ background: rt.color }} />
                      ) : (
                        <Route size={12} className="shrink-0 opacity-60" />
                      )}
                      {rt.nombre}
                      <span className="text-muted-foreground tabular-nums">({rt.count})</span>
                    </span>
                  )
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {rutaOptions.map((rt) => (
                <SelectItem key={rt.id} value={rt.id}>
                  <span className="flex items-center gap-2">
                    {rt.color ? (
                      <span className="size-2 shrink-0 rounded-full" style={{ background: rt.color }} />
                    ) : (
                      <Route size={12} className="shrink-0 opacity-60" />
                    )}
                    {rt.nombre}
                    <span className="text-muted-foreground tabular-nums">({rt.count})</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      ) : (
        <span className="text-xs font-medium text-muted-foreground">
          Puntos de entrega <span className="tabular-nums">({planPuntos.length})</span>
        </span>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {!readOnly && (
          <Button
            variant={selectMode ? 'default' : 'outline'}
            size="sm"
            className="h-8 gap-1.5"
            onClick={toggleSelect}
            aria-pressed={selectMode}
            title="Seleccionar puntos de entrega"
          >
            <ListChecks size={14} />
            {selectMode ? 'Listo' : 'Seleccionar'}
          </Button>
        )}
        <Button
          variant={editMode ? 'default' : 'outline'}
          size="sm"
          className="h-8 gap-1.5"
          onClick={toggleEdit}
          aria-pressed={editMode}
          title="Reordenar la secuencia arrastrando las filas"
        >
          <ArrowUpDown size={14} />
          {editMode ? 'Listo' : 'Reordenar'}
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
    <>
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
        selectable={!readOnly && selectMode}
        enableRowReorder={editMode}
        onRowReorder={onRowReorder}
        onRowClick={(row) => setDetallePunto(row)}
        rowClassName={() => 'cursor-pointer'}
        searchable
        searchPlaceholder="Buscar por cliente o sucursal…"
        searchKeys={['cliente', 'puntoEntrega', 'puntoEntregaId']}
        rowActions={rowActions}
        bulkActions={bulkActions}
        filterBar={filterBar}
      />

      {paradaDialogData && (
        <PuntoEntregaDialog parada={paradaDialogData} onClose={() => setDetallePunto(null)} />
      )}
    </>
  )
}
