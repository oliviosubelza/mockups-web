// Lista de pedidos del plan sobre el DataTable COMPARTIDO (TanStack) — el mismo de todos los
// listados: columnas redimensionables, movibles (drag horizontal del header), ocultables, búsqueda
// y densidad.
//
// Dos MODOS que se prenden con toggles (excluyentes, como el resto del flujo):
//   • "Seleccionar" → aparecen los checks y la barra de acciones masivas (Quitar del plan).
//   • "Reordenar"   → aparece el grip por fila y la SECUENCIA de entrega se cambia por DRAG-AND-DROP
//                     (soporte de filas agregado al DataTable con enableRowReorder/onRowReorder).
//
// Los pedidos se navegan por RUTA con un select arriba (barra de filtros). La columna "#" numera la
// parada 1..N DENTRO de la ruta y lleva el color de la ruta. Mover a otra ruta / Quitar viven en el
// kebab por fila.
import { useEffect, useMemo, useState } from 'react'
import { ArrowUpDown, ListChecks, Route, Trash2 } from 'lucide-react'
import { arrayMove } from '@dnd-kit/sortable'
import {
  DataTable,
  defineColumns,
  type BulkAction,
  type ColumnDefConfig,
  type RowAction,
} from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RUTAS, rutaPorPedidoId, type Pedido, type Ruta as RouteDef } from './mock-data'
import type { BoardState } from './types'

/** Formatea un monto en Bs con separadores es-BO (1.240,50). */
const bs = (n: number) => n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const SIN_RUTA = 'sin'
const rutaGlobalPorPedido = (pedidoId: string) => rutaPorPedidoId(pedidoId)

/** Primera ruta con pedidos (default del select); cae a la primera ruta o "Sin ruta". */
function primeraRutaConPedidos(
  pedidos: Pedido[],
  routes: RouteDef[],
  getRouteByPedidoId: (pedidoId: string) => RouteDef | undefined,
): string {
  return (
    routes.find((ruta) => pedidos.some((pedido) => getRouteByPedidoId(pedido.id)?.id === ruta.id))?.id ??
    routes[0]?.id ??
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
  routes = RUTAS,
  getRouteByPedidoId = rutaGlobalPorPedido,
}: {
  pedidos: Pedido[]
  state: BoardState
  /**
   * Antes de Optimizar todavía NO hay rutas: se muestra TODA la lista de puntos de entrega en una
   * sola tabla, sin filtrar ni separar por ruta. Recién con `optimized` aparecen las rutas (select
   * para navegarlas, color por ruta y "Mover a ruta").
   */
  optimized?: boolean
  onRetry?: () => void
  /** Acciones a la derecha de la barra de filtros (ej. el botón de contraer el panel). */
  headerActions?: React.ReactNode
  /**
   * Flujo de UNIFICACIÓN: es UNA sola ruta, así que no se separa por rutas ni hay "Mover a ruta" ni
   * "Seleccionar". SÍ se permite REORDENAR la secuencia (cambiar de posición). Solo se listan los
   * puntos de entrega unificados.
   */
  readOnly?: boolean
  /** Rutas visibles del scope actual (fallback: dataset global). */
  routes?: RouteDef[]
  /** Ruta efectiva de cada pedido según el scope actual (fallback: dataset global). */
  getRouteByPedidoId?: (pedidoId: string) => RouteDef | undefined
}) {
  // Con solo-lectura NO se separa por rutas aunque esté optimizado (es una sola ruta unificada).
  const showRoutes = optimized && !readOnly
  const [order, setOrder] = useState<string[]>(() => pedidos.map((p) => p.id))
  const [removed, setRemoved] = useState<Set<string>>(new Set()) // pedidos quitados del plan (mockup)
  const [rutaPorPedido, setRutaPorPedido] = useState<Map<string, string>>(new Map()) // override de "Mover a"
  const [rutaSel, setRutaSel] = useState<string>(() => primeraRutaConPedidos(pedidos, routes, getRouteByPedidoId)) // ruta activa (select)
  // Modos excluyentes (toggles): seleccionar (checks) y reordenar (drag de filas).
  const [selectMode, setSelectMode] = useState(false)
  const [editMode, setEditMode] = useState(false)

  // Cuando cambia el conjunto de pedidos (cambio de estado del board), reseteamos todo lo derivado.
  useEffect(() => {
    setOrder(pedidos.map((p) => p.id))
    setRemoved(new Set())
    setRutaPorPedido(new Map())
    setRutaSel(primeraRutaConPedidos(pedidos, routes, getRouteByPedidoId))
    setSelectMode(false)
    setEditMode(false)
  }, [pedidos, routes, getRouteByPedidoId])

  const byId = useMemo(() => new Map(pedidos.map((p) => [p.id, p])), [pedidos])

  // Ruta EFECTIVA de un pedido: gana el override de "Mover a"; si no, la que asignó la corrida.
  const efectivaRutaId = (id: string): string =>
    rutaPorPedido.get(id) ?? getRouteByPedidoId(id)?.id ?? SIN_RUTA

  // Orden actual del plan (sin los quitados).
  const planPedidos = order
    .map((id) => byId.get(id))
    .filter((p): p is Pedido => !!p && !removed.has(p.id))

  // Conteo por ruta para las opciones del select.
  const countByRuta = new Map<string, number>()
  for (const p of planPedidos) {
    const rid = efectivaRutaId(p.id)
    countByRuta.set(rid, (countByRuta.get(rid) ?? 0) + 1)
  }
  const rutaOptions = routes.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    color: r.color as string | undefined,
    count: countByRuta.get(r.id) ?? 0,
  }))

  // Pedidos de la ruta activa (solo importa una vez optimizado).
  const rutaPedidos = planPedidos.filter((p) => efectivaRutaId(p.id) === rutaSel)

  // Lo que ve la tabla: sin rutas → TODOS los puntos de entrega; con rutas → los de la ruta activa.
  const data = showRoutes ? rutaPedidos : planPedidos

  // ── Acciones ──
  // Reordenar por drag: el DataTable avisa qué fila se soltó sobre cuál; aplicamos el movimiento al
  // orden global (ambas están en la ruta activa, así que el arrayMove refleja la nueva secuencia).
  function onRowReorder(activeId: string, overId: string) {
    setOrder((prev) => {
      const from = prev.indexOf(activeId)
      const to = prev.indexOf(overId)
      if (from === -1 || to === -1) return prev
      return arrayMove(prev, from, to)
    })
  }

  // Mueve pedidos a otra ruta (override local): salen de la ruta activa y aparecen al elegir la destino.
  function moverARuta(ids: string[], rutaId: string) {
    setRutaPorPedido((prev) => {
      const next = new Map(prev)
      ids.forEach((id) => next.set(id, rutaId))
      return next
    })
  }

  function quitar(ids: string[]) {
    setRemoved((prev) => new Set([...prev, ...ids]))
  }

  // Modos excluyentes: prender uno apaga el otro (como en el resto del flujo).
  function toggleSelect() {
    setSelectMode((v) => !v)
    setEditMode(false)
  }
  function toggleEdit() {
    setEditMode((v) => !v)
    setSelectMode(false)
  }

  // ── Columnas del DataTable ──
  const columns = useMemo<ColumnDefConfig<Pedido>[]>(
    () =>
      defineColumns<Pedido>([
        {
          // Secuencia 1..N dentro de la ruta + punto del color de la ruta. Fija a la izquierda,
          // no se oculta ni se ordena (es el orden manual del plan).
          id: 'seq',
          header: '#',
          size: 64,
          pin: 'left',
          enableSorting: false,
          enableHiding: false,
          enableResizing: false,
          cell: (row, index) => {
            // El punto de color de ruta solo tiene sentido una vez optimizado (antes no hay rutas).
            const color = showRoutes ? routes.find((r) => r.id === efectivaRutaId(row.id))?.color : undefined
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
          header: 'Cliente',
          accessorKey: 'cliente',
          size: 200,
          enableSorting: false,
          cell: (row) => <span className="truncate font-medium">{row.cliente}</span>,
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
        // Empleado/vendedor — en pausa por ahora:
        // { id: 'vendedor', header: 'Vendedor', accessorKey: 'vendedor', size: 150, enableSorting: false },
      ]),
    [getRouteByPedidoId, routes, rutaPorPedido, showRoutes],
  )

  // ── Acciones por fila (kebab): mover a ruta (solo optimizado) + quitar. Reordenar es por drag. ──
  const rowActions = (row: Pedido): RowAction<Pedido>[] => [
    ...(showRoutes
      ? routes.filter((r) => r.id !== efectivaRutaId(row.id)).map((r) => ({
          label: `Mover a ${r.nombre}`,
          icon: Route,
          onClick: () => moverARuta([row.id], r.id),
        }))
      : []),
    { label: 'Quitar', icon: Trash2, variant: 'destructive' as const, separator: showRoutes, onClick: () => quitar([row.id]) },
  ]

  // ── Acciones masivas (barra de selección): quitar del plan. ──
  const bulkActions: BulkAction<Pedido>[] = [
    { label: 'Quitar del plan', icon: Trash2, variant: 'destructive', onClick: (rows) => quitar(rows.map((r) => r.id)) },
  ]

  // Select de ruta + toggles (Seleccionar / Reordenar) + acciones del panel — en la barra de filtros.
  const filterBar = (
    <div className="flex flex-1 items-center gap-2">
      {showRoutes ? (
        <>
      <span className="text-xs font-medium text-muted-foreground">Ruta</span>
      <Select value={rutaSel} onValueChange={(v) => v && setRutaSel(v)}>
        <SelectTrigger size="sm" className="w-56">
          {/* Base UI muestra el valor crudo ("r1") si no le damos render explícito. */}
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
          Puntos de entrega <span className="tabular-nums">({planPedidos.length})</span>
        </span>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {/* Solo-lectura (unificación): se oculta "Seleccionar", pero SÍ se permite REORDENAR la
            secuencia de paradas (cambiar de posición arrastrando). */}
        {!readOnly && (
          <Button
            variant={selectMode ? 'default' : 'outline'}
            size="sm"
            className="h-8 gap-1.5"
            onClick={toggleSelect}
            aria-pressed={selectMode}
            title="Seleccionar pedidos"
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

  return (
    <DataTable
      tableId={`mockup-plan-lista-${state}`}
      columns={columns}
      data={data}
      getRowId={(row) => row.id}
      isLoading={state === 'loading'}
      isError={state === 'error'}
      errorMessage="No pudimos armar los pedidos del plan."
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
      searchable
      searchPlaceholder="Buscar por cliente…"
      rowActions={rowActions}
      bulkActions={bulkActions}
      filterBar={filterBar}
    />
  )
}
