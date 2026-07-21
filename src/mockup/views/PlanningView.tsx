// Fase 4 — Planificación. Split redimensionable: mapa (dónde caen las paradas + a qué ruta) a la
// izquierda y la lista de paradas (dispatch_plan_order, pedidos del mismo punto unificados) a la
// derecha. Cada panel se puede colapsar (pin/unpin) para ver solo mapa o solo lista.
//
// Arriba del mapa hay filtros (Canal / Tipo Frío·Seco / Ruta) que reducen los puntos mostrados.
import { useLayoutEffect, useRef, useState } from 'react'
import {
  Check,
  Eye,
  ListFilter,
  Loader2,
  Maximize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { OrdersMap } from '../OrdersMap'
import { SortablePedidosTable } from '../SortablePedidosTable'
import {
  CANAL_META,
  CANALES,
  PARADAS,
  PEDIDOS,
  PRODUCT_TYPES,
  RUTAS,
  rutaPorCamionId,
  type CanalId,
  type ProductType,
} from '../mock-data'
import type { BoardState, PlanningTab } from '../types'

const CANAL_IDS = Object.keys(CANAL_META) as CanalId[]

/** Monto en Bs con separadores es-BO (igual que la tabla grande). */
const bs = (n: number) => n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Split del panel de planificación (mapa | tabla), en px para que la transición CSS anime bien.
const RAIL_PX = 48 // ancho del panel contraído (deja lugar al botón Pin)
const DIVIDER_PX = 8 // ancho del divisor
const MIN_MAP_PX = 320
const MIN_LIST_PX = 300
const clampNum = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/** Alterna un valor dentro de un Set de estado (patrón multi-select de los filtros). */
function toggleInSet<T>(setter: React.Dispatch<React.SetStateAction<Set<T>>>) {
  return (value: T) =>
    setter((prev) => {
      const next = new Set(prev)
      next.has(value) ? next.delete(value) : next.add(value)
      return next
    })
}

interface FilterOption<T extends string> {
  value: T
  label: string
  color?: string
}

/** Filtro multi-select en popover (no bloquea scroll → no reflowea el mapa). */
function FilterMenu<T extends string>({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string
  options: FilterOption<T>[]
  selected: Set<T>
  onToggle: (value: T) => void
}) {
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          buttonVariants({ variant: selected.size > 0 ? 'default' : 'outline', size: 'sm' }),
          'h-8 gap-1.5',
        )}
      >
        <ListFilter size={13} />
        {label}
        {selected.size > 0 && (
          <span className="flex size-4 items-center justify-center rounded-full bg-background/25 text-[10px] font-semibold">
            {selected.size}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-1.5">
        <div className="flex flex-col gap-0.5">
          {options.map((o) => {
            const on = selected.has(o.value)
            return (
              <button
                key={o.value}
                onClick={() => onToggle(o.value)}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <span
                  className={cn(
                    'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                    on ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background',
                  )}
                >
                  {on && <Check size={11} strokeWidth={3} />}
                </span>
                {o.color && <span className="size-2.5 shrink-0 rounded-full" style={{ background: o.color }} />}
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Botón para CONTRAER un panel — se ubica al nivel de los filtros/select. El ícono es direccional
 * según el lado del panel (mapa=izquierda, tabla=derecha): un panel lateral que se cierra hacia su
 * borde, mucho más claro que la chincheta anterior.
 */
function UnpinButton({
  label,
  side,
  onClick,
  className,
}: {
  label: string
  side: 'left' | 'right'
  onClick: () => void
  className?: string
}) {
  const Icon = side === 'left' ? PanelLeftClose : PanelRightClose
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('size-7 shrink-0', className)}
      onClick={onClick}
      title={`Contraer ${label.toLowerCase()}`}
      aria-label={`Contraer ${label.toLowerCase()}`}
    >
      <Icon size={15} />
    </Button>
  )
}

/** Riel de un panel contraído: llena el panel (que quedó angosto) con el botón para EXPANDIRLO. */
function CollapsedRail({ title, side, onPin }: { title: string; side: 'left' | 'right'; onPin: () => void }) {
  const Icon = side === 'left' ? PanelLeftOpen : PanelRightOpen
  return (
    <div className="flex h-full w-full flex-col items-center gap-2 overflow-hidden bg-muted/30 py-2">
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        onClick={onPin}
        title={`Mostrar ${title.toLowerCase()}`}
        aria-label={`Mostrar ${title.toLowerCase()}`}
      >
        <Icon size={15} />
      </Button>
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground [writing-mode:vertical-rl]">
        {title}
      </span>
    </div>
  )
}

export function PlanningView({
  state,
  onNext,
}: {
  state: BoardState
  // Se mantiene por compatibilidad con el caller (DispatchFlow/Mockup); ya no hay tabs que elegir.
  initialTab?: PlanningTab
  onNext: () => void
}) {
  // Pin/unpin de cada panel. Al contraer (unpin) uno queda un RIEL fijo (~48px) con su botón para
  // volver a expandirlo; el otro se garantiza pineado (nunca ambos contraídos). El split se maneja
  // con `flex-basis` en px + transición CSS (técnica del sidebar) → el colapso se ve DESLIZAR.
  const [mapPinned, setMapPinned] = useState(true)
  const [listPinned, setListPinned] = useState(true)
  const bothPinned = mapPinned && listPinned

  const unpinMap = () => {
    setMapPinned(false)
    setListPinned(true)
  }
  const unpinList = () => {
    setListPinned(false)
    setMapPinned(true)
  }
  const pinMap = () => setMapPinned(true)
  const pinList = () => setListPinned(true)

  // Ancho del contenedor (para calcular los flex-basis en px, que son los que animan bien).
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Posición del divisor (ancho del mapa en px cuando ambos están abiertos) + estado de arrastre.
  const [splitPx, setSplitPx] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)

  const usable = Math.max(0, width - DIVIDER_PX)
  const maxSplit = Math.max(MIN_MAP_PX, usable - MIN_LIST_PX)
  const split = clampNum(splitPx ?? usable * 0.4, MIN_MAP_PX, maxSplit)

  // flex-basis (px) de cada panel según pin/unpin. Suman `usable` → sin huecos; ambos con grow/shrink
  // en 0 para que el basis mande y la transición lo anime.
  let mapBasis: number, listBasis: number
  if (!mapPinned) {
    mapBasis = RAIL_PX
    listBasis = usable - RAIL_PX
  } else if (!listPinned) {
    listBasis = RAIL_PX
    mapBasis = usable - RAIL_PX
  } else {
    mapBasis = split
    listBasis = usable - split
  }

  const onDividerDown = (e: React.PointerEvent) => {
    if (!bothPinned) return
    e.preventDefault()
    setDragging(true)
    const startX = e.clientX
    const startBasis = mapBasis
    const onMove = (ev: PointerEvent) =>
      setSplitPx(clampNum(startBasis + (ev.clientX - startX), MIN_MAP_PX, maxSplit))
    const onUp = () => {
      setDragging(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  const panelTransition = !dragging && 'transition-[flex-basis] duration-300 ease-out'

  // Filtros del mapa (Set vacío = sin filtrar).
  const [canales, setCanales] = useState<Set<CanalId>>(new Set())
  const [tipos, setTipos] = useState<Set<ProductType>>(new Set())
  const [rutas, setRutas] = useState<Set<string>>(new Set())
  // Ver ventanas: etiqueta permanente (nombre + ventana horaria) bajo cada punto del mapa.
  const [showDetails, setShowDetails] = useState(false)
  // Mapa maximizado en un diálogo grande.
  const [mapMaximized, setMapMaximized] = useState(false)

  // Optimización: recién al presionar Optimizar se habilita la tool de ruta en el mapa y se muestran
  // las polilíneas de ejemplo (no se calcula nada).
  const [optimized, setOptimized] = useState(false)
  const [showRoute, setShowRoute] = useState(false)
  // Simulación de "procesando" al Optimizar: unos 2s con feedback visible y recién ahí aparecen las rutas.
  const [optimizing, setOptimizing] = useState(false)

  // Selección en el mapa (rectángulo/lazo): abre un diálogo con lo seleccionado para moverlo a ruta.
  const [selStopIds, setSelStopIds] = useState<string[]>([])
  const [moverSelOpen, setMoverSelOpen] = useState(false)
  const [rutaDestino, setRutaDestino] = useState<string | null>(null)
  const onMapSelection = (ids: string[]) => {
    setSelStopIds(ids)
    setRutaDestino(null)
    setMoverSelOpen(ids.length > 0)
  }

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

  const hayFiltros = canales.size > 0 || tipos.size > 0 || rutas.size > 0
  const limpiar = () => {
    setCanales(new Set())
    setTipos(new Set())
    setRutas(new Set())
  }

  // Rutas que quedan visibles con los filtros aplicados (leyenda del mapa).
  const rutasVisibles = RUTAS.filter((r) => filtradas.some((p) => p.camionId === r.camionId))

  const canalOptions = CANALES.map((c) => ({ value: c.value, label: c.label, color: CANAL_META[c.value].color }))
  const tipoOptions = PRODUCT_TYPES.map((t) => ({ value: t, label: t }))
  const rutaOptions = RUTAS.map((r) => ({ value: r.id, label: r.nombre, color: r.color }))

  // Paradas seleccionadas en el mapa y sus pedidos (la tabla del diálogo lista los pedidos, igual
  // que la tabla grande de la lista).
  const selectedStops = filtradas.filter((p) => selStopIds.includes(p.id))
  const selectedPedidos = selectedStops.flatMap((p) => p.pedidos)
  // Mover la selección a una ruta (mockup: stub — cierra el diálogo, no reasigna el dato del mapa).
  const moverSeleccion = () => {
    setMoverSelOpen(false)
  }

  // Optimizar (mockup): no calcula nada. Simula ~2s de "procesando" y recién ahí habilita la tool de
  // ruta, muestra las polilíneas de ejemplo y separa por rutas la lista.
  const optimizar = () => {
    if (optimizing || optimized) return
    setOptimizing(true)
    setTimeout(() => {
      setOptimizing(false)
      setOptimized(true)
      setShowRoute(true)
    }, 2000)
  }

  // Contenido del panel del mapa: filtros + mapa + leyenda (con el botón Optimizar a la derecha).
  const mapContent = (
    <>
      {/* Filtros de puntos del mapa. */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <span className="text-xs font-medium text-muted-foreground">Filtrar</span>
        <FilterMenu label="Canal" options={canalOptions} selected={canales} onToggle={toggleInSet(setCanales)} />
        <FilterMenu label="Tipo" options={tipoOptions} selected={tipos} onToggle={toggleInSet(setTipos)} />
        {/* El filtro por Ruta recién tiene sentido una vez optimizado (antes no hay rutas). */}
        {optimized && (
          <>
            <Separator orientation="vertical" className="h-5" />
            <FilterMenu label="Ruta" options={rutaOptions} selected={rutas} onToggle={toggleInSet(setRutas)} />
          </>
        )}
        {hayFiltros && (
          <Button variant="ghost" size="sm" className="h-8" onClick={limpiar}>
            Limpiar
          </Button>
        )}

        <Separator orientation="vertical" className="h-5" />
        {/* Ver detalle: etiqueta permanente (nombre + ventana horaria) bajo cada punto. */}
        <Button
          variant={showDetails ? 'default' : 'outline'}
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => setShowDetails((v) => !v)}
          aria-pressed={showDetails}
          title="Ver nombre y ventana horaria sobre los puntos"
        >
          <Eye size={13} /> Ver detalle
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-7 shrink-0"
          onClick={() => setMapMaximized(true)}
          title="Maximizar mapa"
          aria-label="Maximizar mapa"
        >
          <Maximize2 size={14} />
        </Button>
        <UnpinButton label="Mapa" side="left" onClick={unpinMap} />
      </div>

      {/* `isolate` atrapa los z-index altos de Leaflet (paneles/controles, hasta ~1000) en su
          propio contexto de apilado; sin esto se filtran al contexto raíz y tapan los popovers
          de los filtros (portalizados al body con z-50). */}
      <div className="relative isolate min-h-0 flex-1">
        <OrdersMap
          paradas={filtradas}
          routeToolEnabled={optimized}
          showRoute={showRoute}
          onToggleRoute={() => setShowRoute((v) => !v)}
          onSelectionChange={onMapSelection}
          showDetails={showDetails}
        />
        {/* Overlay de "procesando" al Optimizar (z alto para tapar los controles de Leaflet). */}
        {optimizing && (
          <div className="absolute inset-0 z-[1200] flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-3 shadow-lg">
              <Loader2 size={18} className="animate-spin text-primary" />
              <span className="text-sm font-medium">Optimizando rutas…</span>
            </div>
          </div>
        )}
      </div>

      {/* Leyenda de canales + botón Optimizar (alineado a la derecha). */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-4 py-2.5">
        <span className="text-xs font-medium text-muted-foreground">Canal (ícono)</span>
        {CANAL_IDS.map((canal) => {
          const { label, icon: Icon } = CANAL_META[canal]
          return (
            <span key={canal} className="flex items-center gap-1.5 text-xs">
              <span className="flex size-5 items-center justify-center rounded-full bg-muted text-foreground">
                <Icon size={12} />
              </span>
              {label}
            </span>
          )
        })}
        <Button size="sm" className="ml-auto shrink-0 gap-1.5" onClick={optimizar} disabled={optimizing || optimized}>
          {optimizing ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Optimizando…
            </>
          ) : optimized ? (
            'Optimizado'
          ) : (
            'Optimizar'
          )}
        </Button>
      </div>
    </>
  )

  const listContent = (
    <div className="min-h-0 flex-1 overflow-auto p-3">
      <SortablePedidosTable
        pedidos={pedidos}
        state={state}
        optimized={optimized}
        headerActions={<UnpinButton label="Tabla" side="right" onClick={unpinList} />}
      />
    </div>
  )

  return (
    <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden p-0">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2.5">
        <span className="text-sm font-semibold">Plan</span>
        {/* Solo se habilita una vez optimizadas las rutas: sin optimización no hay órdenes que generar. */}
        <Button
          size="sm"
          className="ml-auto"
          disabled={!optimized}
          title={optimized ? 'Generar órdenes de despacho' : 'Primero optimizá las rutas'}
          onClick={onNext}
        >
          Generar órdenes
        </Button>
      </div>

      {/* Split propio (mapa | tabla) con flex-basis en px + transición CSS → el colapso se DESLIZA
          (técnica del sidebar). El mapa/tabla no se re-montan. El divisor arrastra SOLO con ambos
          abiertos; el panel contraído (riel) se cambia únicamente con Pin/Unpin. */}
      <div ref={wrapRef} className="flex min-h-0 flex-1">
        <div
          className={cn('flex min-h-0 flex-col overflow-hidden', panelTransition)}
          style={{ flexGrow: 0, flexShrink: 0, flexBasis: width ? mapBasis : '40%' }}
        >
          {mapPinned ? mapContent : <CollapsedRail title="Mapa" side="left" onPin={pinMap} />}
        </div>

        {/* Divisor: arrastrable solo con ambos paneles abiertos. */}
        <div
          onPointerDown={onDividerDown}
          className={cn(
            'relative flex shrink-0 items-center justify-center bg-border',
            bothPinned ? 'cursor-col-resize' : 'cursor-default',
          )}
          style={{ width: DIVIDER_PX }}
        >
          {bothPinned && <div className="h-6 w-1 rounded-full bg-muted-foreground/40" />}
        </div>

        <div
          className={cn('flex min-h-0 flex-col overflow-hidden', panelTransition)}
          style={{ flexGrow: 0, flexShrink: 0, flexBasis: width ? listBasis : '60%' }}
        >
          {listPinned ? listContent : <CollapsedRail title="Tabla" side="right" onPin={pinList} />}
        </div>
      </div>

      {/* Mapa maximizado en un diálogo grande. */}
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

      {/* Selección del mapa → diálogo con la tabla de lo seleccionado + mover a ruta. */}
      <Dialog open={moverSelOpen} onOpenChange={setMoverSelOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Mover selección a: </DialogTitle>
            {/* <DialogDescription>
              {selectedStops.length} {selectedStops.length === 1 ? 'parada' : 'paradas'} ·{' '}
              {selectedPedidos.length} {selectedPedidos.length === 1 ? 'pedido' : 'pedidos'}.
            </DialogDescription> */}
          </DialogHeader>

          {/* Tabla de lo seleccionado — mismas columnas que la tabla grande de la lista
              (puntos de entrega): Cliente, Total Bs, Peso total. */}
          <div className="max-h-[28rem] overflow-auto rounded-md border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Cliente</th>
                  <th className="px-3 py-2 text-right font-medium">Total Bs</th>
                  <th className="px-3 py-2 text-right font-medium">Peso total</th>
                  {/* Empleado/vendedor — en pausa por ahora:
                  <th className="px-3 py-2 text-left font-medium">Vendedor</th> */}
                </tr>
              </thead>
              <tbody>
                {selectedPedidos.map((p) => (
                  <tr key={p.id} className="border-b last:border-b-0">
                    <td className="px-3 py-1.5 font-medium">{p.cliente}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{bs(p.total)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{p.peso} kg</td>
                    {/* <td className="px-3 py-1.5">{p.vendedor}</td> */}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mover a ruta (select). */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Mover a</span>
            <Select value={rutaDestino ?? ''} onValueChange={(v) => v && setRutaDestino(v)}>
              <SelectTrigger className="h-8 w-56">
                <SelectValue placeholder="Elegí una ruta…" />
              </SelectTrigger>
              <SelectContent>
                {RUTAS.map((ruta) => (
                  <SelectItem key={ruta.id} value={ruta.id}>
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: ruta.color }} />
                      {ruta.nombre}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMoverSelOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={!rutaDestino} onClick={moverSeleccion}>
              Mover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
