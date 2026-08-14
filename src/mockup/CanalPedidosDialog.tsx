// Diálogo por CANAL: los pedidos que ese canal mete a la planificación POR CORTE, uno por fila,
// para poder quitar los que no deban entrar. Se abre clickeando una fila del resumen
// (ver OrderSelectionPanel).
//
// Por qué existe: el resumen agregaba y sumaba por canal, pero no había forma de sacar UN pedido
// puntual. La tabla de "fuera de corte" solo permitía AGREGAR los que la regla dejaba afuera; los
// que entraban por corte no se podían quitar.
//
// Los de FUERA del corte NO se listan acá: ya tienen su propia pestaña ("Seleccionar fuera de
// corte") y tenerlos en los dos lados era el mismo control duplicado. Sí se cuentan en el pie, para
// que los totales cierren contra la fila del resumen.
//
// La decisión se guarda en el store al instante (misma convención que la tabla de fuera de corte:
// no hay Aceptar/Cancelar). Cerrar solo cierra.
import { useState } from 'react'
import { AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { DataTable, defineColumns } from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { cn } from '@/lib/utils'
import {
  CANAL_META,
  itemsPorConfirmar,
  pedidoEsSeleccionable,
  tieneStockPorConfirmar,
  type CanalId,
  type ItemPedido,
  type Pedido,
} from './mock-data'
import { CanalGlyph } from './canal-glyph'
import { entraPorCorte, estaIncluido, incluidoPorDefecto, useDispatchPlanStore } from './dispatch-plan-store'

// Mismos formatos que el resto del paso (convención del proyecto: cada vista declara los suyos).
const fmtMoneda = new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' })
const fmtPeso = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 })

/**
 * Campos donde busca el buscador del diálogo. No dependen de las columnas visibles: se puede buscar
 * por vendedor o punto de entrega aunque no se estén mostrando.
 */
const SEARCH_KEYS = ['salesOrder', 'cliente', 'vendedor', 'puntoEntrega', 'company'] as const

const columns = defineColumns<Pedido>([
  { id: 'salesOrder', header: 'Pedido', accessorKey: 'salesOrder', size: 96, pin: 'left' },
  { id: 'cliente', header: 'Cliente', accessorKey: 'cliente', size: 200 },
  // Sin badge de corte: acá TODAS las filas están dentro del corte (las de fuera se manejan en su
  // propia pestaña), así que marcarlas sería ruido — todas dirían lo mismo.
  {
    id: 'ventana',
    header: 'Entrega',
    accessorKey: 'ventana',
    size: 130,
    cell: (row) => <span className="truncate tabular-nums">{row.ventana}</span>,
  },
  { id: 'vendedor', header: 'Vendedor', accessorKey: 'vendedor', size: 150 },
  {
    id: 'total',
    header: 'Total (Bs)',
    accessorKey: 'total',
    size: 108,
    meta: { align: 'right' },
    cell: (row) => <span className="font-medium tabular-nums">{fmtMoneda.format(row.total)}</span>,
  },
  {
    id: 'peso',
    header: 'Peso',
    accessorKey: 'peso',
    size: 92,
    meta: { align: 'right' },
    cell: (row) => <span className="tabular-nums">{fmtPeso.format(row.peso)} kg</span>,
  },
  // Sin `accessorKey`: el dato no es un campo del pedido sino la cuenta de líneas cortas, y por eso
  // tampoco ordena (TanStack necesita un accessor). El caso se hace visible por otro lado: fondo
  // ámbar en la fila y el filtro "Sin stock confirmado" del toolbar, que aísla justo estos pedidos.
  {
    id: 'stock',
    header: 'Stock',
    size: 118,
    enableSorting: false,
    cell: (row) => {
      const faltan = itemsPorConfirmar(row).length
      if (faltan === 0) {
        return <span className="text-xs text-muted-foreground">Confirmado</span>
      }
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
          <AlertTriangle size={12} className="shrink-0" />
          {faltan} a confirmar
        </span>
      )
    },
  },
])

/**
 * Una línea del pedido en el panel. `confirmado / solicitado` es todo el mensaje.
 *
 * El nombre del producto NO se trunca: en un panel angosto "Aceite girasol 900…" y "Aceite girasol
 * 400…" se leen igual, y el planificador necesita distinguir presentaciones. Prefiere dos renglones
 * antes que puntos suspensivos.
 */
function ItemFila({ item }: { item: ItemPedido }) {
  const corta = item.confirmado < item.solicitado
  return (
    <li className="flex items-start justify-between gap-2 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="min-w-0 flex-1 text-xs leading-snug">{item.producto}</span>
          {item.esBonificacion && (
            <Badge variant="outline" className="rounded-full border-primary/30 bg-primary/10 text-primary">
              Bonificación
            </Badge>
          )}
        </div>
      </div>
      <span
        className={cn(
          'shrink-0 text-xs tabular-nums',
          corta ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
        )}
      >
        {item.confirmado}/{item.solicitado} {item.unidad}
      </span>
    </li>
  )
}

/**
 * Detalle de líneas del pedido clickeado. Se abre a la DERECHA de la tabla y no encima: el usuario
 * está comparando pedidos, así que la lista tiene que seguir visible mientras mira el detalle.
 *
 * Las líneas cortas van PRIMERO y separadas de las confirmadas. Ordenar todo junto obligaría a
 * escanear una lista de 7 productos para encontrar el que falta, que es justo el único que importa.
 */
function StockPanel({ pedido, onClose }: { pedido: Pedido; onClose: () => void }) {
  const faltantes = itemsPorConfirmar(pedido)
  const confirmados = pedido.items.filter((i) => i.confirmado >= i.solicitado)

  return (
    <aside className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-md border bg-muted/20">
      <header className="flex items-start justify-between gap-2 border-b bg-background/60 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">Pedido {pedido.salesOrder}</p>
          <p className="truncate text-[11px] leading-tight text-muted-foreground" title={pedido.cliente}>
            {pedido.cliente}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="-mr-1 size-6 shrink-0"
          onClick={onClose}
          aria-label="Cerrar detalle"
        >
          <X size={14} />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
        {faltantes.length > 0 && (
          <section className="mb-3">
            <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
              <AlertTriangle size={12} className="shrink-0" />
              A confirmar ({faltantes.length})
            </h4>
            <ul className="mt-1 divide-y divide-border/60">
              {faltantes.map((item) => (
                <ItemFila key={item.id} item={item} />
              ))}
            </ul>
          </section>
        )}

        <section>
          <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <CheckCircle2 size={12} className="shrink-0" />
            Con stock ({confirmados.length})
          </h4>
          {confirmados.length > 0 ? (
            <ul className="mt-1 divide-y divide-border/60">
              {confirmados.map((item) => (
                <ItemFila key={item.id} item={item} />
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Ninguna línea de este pedido tiene stock confirmado.
            </p>
          )}
        </section>
      </div>
    </aside>
  )
}

/**
 * Botón-filtro del toolbar: deja SOLO los pedidos con stock por confirmar. Es un filtro y no un
 * agrupamiento porque el DataTable persiste el ordenamiento del usuario por `tableId` y lo aplica
 * sobre todo el array (DataTable.tsx, "El orden persistido del usuario gana"): cualquier agrupación
 * armada desde el orden de los datos queda deshecha en cuanto alguien ordena por una columna. Un
 * filtro convive con el orden en vez de pelearse con él.
 */
function FiltroStockPendiente({
  activo,
  count,
  onToggle,
}: {
  activo: boolean
  count: number
  onToggle: () => void
}) {
  return (
    <Button
      variant={activo ? 'secondary' : 'outline'}
      size="sm"
      onClick={onToggle}
      aria-pressed={activo}
      className={cn(
        'h-8 gap-1.5 text-xs',
        activo &&
          'border-amber-500/40 bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 dark:text-amber-300',
      )}
      title={
        activo ? 'Mostrar todos los pedidos' : 'Ver solo los pedidos con stock sin confirmar'
      }
    >
      <AlertTriangle size={12} className="shrink-0" />
      Sin stock confirmado
      <span className="tabular-nums opacity-70">{count}</span>
      {activo && <X size={11} className="shrink-0 opacity-70" />}
    </Button>
  )
}

/** Métrica compacta del pie del diálogo. */
function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] leading-tight text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold leading-tight tabular-nums">{value}</span>
    </div>
  )
}

export function CanalPedidosDialog({
  canal,
  pedidos,
  onClose,
}: {
  /** Canal a editar. `null` cierra el diálogo. */
  canal: CanalId | null
  /**
   * TODOS los pedidos del canal ya filtrados por el panel (narrowing + filtros del DTO), sin separar
   * por corte. El diálogo hace el split él mismo: lista solo los de DENTRO del corte, y usa los de
   * fuera únicamente para reconciliar sus totales con la fila del resumen que se clickeó.
   */
  pedidos: Pedido[]
  onClose: () => void
}) {
  const orderOverrides = useDispatchPlanStore((s) => s.orderOverrides)
  const setOrdersIncluded = useDispatchPlanStore((s) => s.setOrdersIncluded)

  // La tabla siembra su selección al MONTAR (`defaultSelectedIds` no es controlado). Este nonce va
  // en su `key`: al restablecer, la tabla se remonta y vuelve a sembrar — sin esto los checkboxes
  // quedarían mostrando la selección vieja aunque el store ya estuviera limpio.
  const [seedNonce, setSeedNonce] = useState(0)
  // Pedido cuyo detalle de líneas está abierto a la derecha. Se guarda el ID y no el objeto para no
  // quedarse con una copia vieja si la lista cambia.
  const [detalleId, setDetalleId] = useState<string | null>(null)
  // Filtro de la lista: deja solo los pedidos con stock por confirmar. Arranca apagado — la lista
  // completa es el default, el filtro es para ir a mirar los pendientes cuando hacen falta.
  const [soloPendientes, setSoloPendientes] = useState(false)

  if (!canal) return null

  const meta = CANAL_META[canal]

  // Solo los de DENTRO del corte: los de fuera ya tienen su propia pestaña ("Seleccionar fuera de
  // corte") y mostrarlos acá duplicaba el mismo control en dos lugares.
  const dentro = pedidos.filter(entraPorCorte)
  // El scope que se manda al store son SOLO los listados: así destildar acá no puede tocar las
  // decisiones tomadas en la pestaña de fuera de corte.
  const scopeIds = dentro.map((p) => p.id)
  const incluidos = dentro.filter((p) => estaIncluido(p, orderOverrides))
  const quitados = dentro.filter((p) => incluidoPorDefecto(p) && !estaIncluido(p, orderOverrides)).length

  const totalMonto = incluidos.reduce((acc, p) => acc + p.total, 0)
  const totalPeso = incluidos.reduce((acc, p) => acc + p.peso, 0)

  // Fuera de corte que el usuario agregó en la otra pestaña. No se listan, pero SÍ se cuentan acá:
  // sin este dato el pie diría "entran 2" mientras la fila del resumen dice 3, y no habría forma de
  // entender la diferencia.
  const fueraAgregados = pedidos.filter(
    (p) => !entraPorCorte(p) && estaIncluido(p, orderOverrides),
  ).length

  // Se resuelve contra la lista: si el pedido dejó de estar (cambió el filtro del panel de atrás),
  // el panel se cierra solo en vez de mostrar un detalle huérfano.
  const detalle = dentro.find((p) => p.id === detalleId) ?? null
  // Cuántos pedidos de los que ENTRAN arrastran líneas sin confirmar. Solo cuenta los incluidos:
  // advertir por un pedido que el usuario ya destildó sería ruido.
  const conStockPendiente = incluidos.filter(tieneStockPorConfirmar).length

  // Cuántos hay para filtrar, tildados o no: el botón informa el tamaño del grupo, no del plan.
  const pendientesTotal = dentro.filter(tieneStockPorConfirmar).length
  // Lo que la tabla realmente muestra. Con el filtro activo las demás filas salen del row model.
  const visibles = soloPendientes ? dentro.filter(tieneStockPorConfirmar) : dentro

  // Restablece la regla base: entran los del corte que además sean seleccionables.
  const restablecer = () => {
    setOrdersIncluded(
      scopeIds,
      dentro.filter(incluidoPorDefecto).map((pedido) => pedido.id),
    )
    setSeedNonce((n) => n + 1)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* Solo se pisa el breakpoint `sm`: el `max-w-[calc(100%-2rem)]` del DialogContent se conserva
          para que en pantallas chicas el diálogo no se salga del viewport. */}
      <DialogContent
        className="flex max-h-[85vh] flex-col gap-3 overflow-hidden sm:max-w-7xl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="shrink-0" style={{ color: meta.color }}>
              <CanalGlyph canal={canal} size={17} />
            </span>
            {meta.label}
          </DialogTitle>
          <DialogDescription>
            Pedidos que entran solos por cerrar antes de las {meta.timeOff}. Destildá los que no
            quieras en esta planificación. Los que quedan fuera del corte se eligen en
            &ldquo;Seleccionar fuera de corte&rdquo;.
          </DialogDescription>
        </DialogHeader>

        {/* `overflow-auto` y no `fillHeight` en la tabla: con 3-4 pedidos la tabla crece con su
            contenido (fillHeight la estiraría vacía hasta el 85vh), y si la lista es larga scrollea
            acá dentro en vez de recortarse contra el alto máximo del diálogo. */}
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          {detalle ? (
            <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
              <ResizablePanel defaultSize={72} minSize={48}>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pr-3">
                  <DataTable
                    // El nonce fuerza el remonte tras "Restablecer" para que la siembra vuelva a correr.
                    key={`${canal}-${seedNonce}`}
                    tableId="mockup-canal-pedidos"
                    columns={columns}
                    data={visibles}
                    getRowId={(row) => row.id}
                    emptyTitle={soloPendientes ? 'Sin stock pendiente' : 'Nada dentro del corte'}
                    emptyMessage={
                      soloPendientes
                        ? 'Todos los pedidos de este canal tienen el stock confirmado.'
                        : 'Todos los pedidos de este canal cierran después del corte: se eligen en “Seleccionar fuera de corte”.'
                    }
                    bodyMinHeight={280}
                    selectable
                    isRowSelectable={pedidoEsSeleccionable}
                    defaultSelectedIds={incluidos.map((p) => p.id)}
                    // El scope son los ids VISIBLES y no todos los de dentro del corte: con el filtro
                    // activo las filas escondidas salen del row model y `onSelectionChange` las reporta
                    // como no tildadas, así que un scope más amplio las daría por quitadas del plan.
                    onSelectionChange={(rows) =>
                      setOrdersIncluded(
                        visibles.map((p) => p.id),
                        rows.map((r) => r.id),
                      )
                    }
                    searchable
                    searchPlaceholder="Buscar por código, cliente, vendedor…"
                    searchKeys={[...SEARCH_KEYS]}
                    clientPagination
                    defaultPageSize={8}
                    // El filtro va en el toolbar de la tabla, al lado del buscador: es otra forma de
                    // acotar la misma lista, no una acción del diálogo.
                    toolbar={
                      pendientesTotal > 0 ? (
                        <FiltroStockPendiente
                          activo={soloPendientes}
                          count={pendientesTotal}
                          onToggle={() => setSoloPendientes((v) => !v)}
                        />
                      ) : undefined
                    }
                    // Click en la fila abre el detalle; el checkbox corta la propagación, así que tildar y
                    // mirar el detalle siguen siendo dos gestos distintos. Re-clickear el mismo cierra.
                    onRowClick={(row) => setDetalleId((id) => (id === row.id ? null : row.id))}
                    rowClassName={(row) =>
                      cn(
                        // Ámbar = stock pendiente. Con el filtro activo no se pinta porque, si todas las
                        // filas son pendientes, la banda deja de distinguir algo útil.
                        !soloPendientes &&
                          tieneStockPorConfirmar(row) &&
                          'bg-amber-500/10 hover:bg-amber-500/15',
                        row.id === detalleId && 'ring-1 ring-inset ring-primary/40',
                      )
                    }
                  />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={28} minSize={20}>
                <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden pl-3">
                  <StockPanel pedido={detalle} onClose={() => setDetalleId(null)} />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <DataTable
                // El nonce fuerza el remonte tras "Restablecer" para que la siembra vuelva a correr.
                key={`${canal}-${seedNonce}`}
                tableId="mockup-canal-pedidos"
                columns={columns}
                data={visibles}
                getRowId={(row) => row.id}
                emptyTitle={soloPendientes ? 'Sin stock pendiente' : 'Nada dentro del corte'}
                emptyMessage={
                  soloPendientes
                    ? 'Todos los pedidos de este canal tienen el stock confirmado.'
                    : 'Todos los pedidos de este canal cierran después del corte: se eligen en “Seleccionar fuera de corte”.'
                }
                bodyMinHeight={280}
                selectable
                isRowSelectable={pedidoEsSeleccionable}
                defaultSelectedIds={incluidos.map((p) => p.id)}
                onSelectionChange={(rows) =>
                  setOrdersIncluded(
                    visibles.map((p) => p.id),
                    rows.map((r) => r.id),
                  )
                }
                searchable
                searchPlaceholder="Buscar por código, cliente, vendedor…"
                searchKeys={[...SEARCH_KEYS]}
                clientPagination
                defaultPageSize={8}
                toolbar={
                  pendientesTotal > 0 ? (
                    <FiltroStockPendiente
                      activo={soloPendientes}
                      count={pendientesTotal}
                      onToggle={() => setSoloPendientes((v) => !v)}
                    />
                  ) : undefined
                }
                onRowClick={(row) => setDetalleId((id) => (id === row.id ? null : row.id))}
                rowClassName={(row) =>
                  cn(
                    !soloPendientes &&
                      tieneStockPorConfirmar(row) &&
                      'bg-amber-500/10 hover:bg-amber-500/15',
                    row.id === detalleId && 'ring-1 ring-inset ring-primary/40',
                  )
                }
              />
            </div>
          )}
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <div className="flex items-center gap-5">
            <Kpi label="Dentro del corte" value={`${incluidos.length} de ${dentro.length}`} />
            <Kpi label="Monto" value={fmtMoneda.format(totalMonto)} />
            <Kpi label="Peso" value={`${fmtPeso.format(totalPeso)} kg`} />
            {quitados > 0 && <Kpi label="Quitados" value={String(quitados)} />}
            {/* No bloquea nada: el pedido entra igual. Es un aviso de que el monto y el peso de
                arriba pueden bajar cuando Ventas confirme. */}
            {conStockPendiente > 0 && (
              <div className="flex flex-col">
                <span className="text-[11px] leading-tight text-muted-foreground">
                  Stock a confirmar
                </span>
                <span className="flex items-center gap-1 text-sm font-semibold leading-tight tabular-nums text-amber-600 dark:text-amber-400">
                  <AlertTriangle size={12} className="shrink-0" />
                  {conStockPendiente} pedido{conStockPendiente === 1 ? '' : 's'}
                </span>
              </div>
            )}
            {/* Reconcilia con la fila del resumen: lo que entra del canal es esto + los de fuera. */}
            {fueraAgregados > 0 && (
              <Kpi label="+ Fuera de corte" value={String(fueraAgregados)} />
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={restablecer}>
              Restablecer
            </Button>
            <Button size="sm" onClick={onClose}>
              Listo
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
