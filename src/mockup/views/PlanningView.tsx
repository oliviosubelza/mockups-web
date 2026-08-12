// Fase 4 — Planificación. Split redimensionable: mapa (dónde caen las paradas + a qué ruta) a la
// izquierda y la lista de paradas (dispatch_plan_order, pedidos del mismo punto unificados) a la
// derecha. Cada panel se puede colapsar (pin/unpin) para ver solo mapa o solo lista.
//
// Arriba del mapa hay filtros (Canal / Tipo Frío·Seco / Ruta) que reducen los puntos mostrados.
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
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
import { useDispatchPlanSnapshot } from '../dispatch-plan-snapshot'
import { OrdersMap } from '../OrdersMap'
import { UnifyMapStats } from '../map/UnifyMapStats'
import { SortablePedidosTable } from '../SortablePedidosTable'
import { usePlanesStore } from '../planes-store'
import { useDispatchPlanStore, selectIncludedOrders, selectSelectedTrucks } from '../dispatch-plan-store'
import { ordenarPorCercania } from '../map/geo/hilbert'
import {
  CAMIONES,
  CANAL_META,
  CANALES,
  PARADAS,
  PRODUCT_TYPES,
  RUTAS,
  tripulacionDeCamion,
  type CanalId,
  type Parada,
  type PlanCamion,
  type ProductType,
} from '../mock-data'
import type { BoardState, PlanningTab } from '../types'

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
  paradasScope,
  scopeLabel,
  singleRoute,
  routeColor,
  readOnly = false,
}: {
  state: BoardState
  // Se mantiene por compatibilidad con el caller (DispatchFlow/Mockup); ya no hay tabs que elegir.
  initialTab?: PlanningTab
  onNext: () => void
  /** Subconjunto de paradas a planificar (ej. las paradas unificadas de un camión). Sin esto, el plan completo. */
  paradasScope?: Parada[]
  /** Etiqueta que reemplaza "Plan" en la cabecera (ej. "Reoptimizando 3421-ABC · 9 paradas"). */
  scopeLabel?: string
  /** Unificación: al optimizar dibuja UNA sola ruta por todas las paradas (no las varias de ejemplo). */
  singleRoute?: boolean
  /** Color de esa ruta única (el del camión unificado). */
  routeColor?: string
  /**
   * Solo-lectura (unificación): no se permite mover nada. Oculta la toolbar de dibujo del mapa, el
   * filtro por Ruta y los toggles/select de rutas de la tabla. El flujo normal no lo pasa.
   */
  readOnly?: boolean
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
  const split = clampNum(splitPx ?? usable * 0.6, MIN_MAP_PX, maxSplit)

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
  const snapshot = useDispatchPlanSnapshot()
  const onMapSelection = (ids: string[]) => {
    setSelStopIds(ids)
    setRutaDestino(null)
    setMoverSelOpen(ids.length > 0)
  }

  // Camiones seleccionados en la fase anterior (o fallback a los primeros 3 camiones activos)
  const selectedTruckIds = useDispatchPlanStore((s) => s.selectedTruckIds)
  const selectedTrucks = useMemo(() => {
    const sel = CAMIONES.filter((c) => selectedTruckIds.includes(c.id))
    return sel.length > 0 ? sel : CAMIONES.filter((c) => c.enRuteo).slice(0, 3)
  }, [selectedTruckIds])

  const [customRutaNombres, setCustomRutaNombres] = useState<Record<string, string>>({})

  // Genera exactamente 1 Ruta por cada camión seleccionado
  const rutasPlan = useMemo(() => {
    const colores = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#db2777', '#0284c7']
    return selectedTrucks.map((camion, i) => {
      const id = `r-${camion.id}`
      const defaultNombre = `Ruta ${i + 1} (${camion.placa})`
      return {
        id,
        nombre: customRutaNombres[id] || defaultNombre,
        camionId: camion.id,
        camion,
        color: colores[i % colores.length],
      }
    })
  }, [selectedTrucks, customRutaNombres])

  const handleRenameRuta = (rutaId: string, nuevoNombre: string) => {
    setCustomRutaNombres((prev) => ({ ...prev, [rutaId]: nuevoNombre }))
  }

  const [assignedParadasState, setAssignedParadasState] = useState<Parada[] | null>(null)

  // Pedidos que quedaron DENTRO del plan en la fase de selección (canal + narrowing + corte +
  // decisiones manuales). El mapa y el optimizador tienen que trabajar sobre ESE universo: el gate
  // de CoverageSummaryBar ya verificó que la capacidad de los camiones seleccionados alcanza para
  // cubrirlo. Repartir `PARADAS` entero (el dataset completo, con los pedidos fuera de corte que el
  // planificador nunca metió al plan) tiraba esa garantía a la basura y producía ocupaciones >100%.
  const includedOrderIds = useDispatchPlanStore(
    useShallow((s) => selectIncludedOrders(s).map((p) => p.id)),
  )

  // Base de datos del planner: el scope unificado si vino, o las paradas del plan.
  // Una parada puede tener pedidos dentro y fuera del plan → se recorta y se recalculan sus
  // totales, para que el peso que ve el optimizador sea el mismo que contó la fase de selección.
  const baseParadas = useMemo(() => {
    if (paradasScope) return paradasScope
    // Sin selección todavía (se entró directo al mapa): se muestra el dataset completo, como antes.
    if (includedOrderIds.length === 0) return PARADAS
    const incluidos = new Set(includedOrderIds)
    return PARADAS.flatMap<Parada>((parada) => {
      const pedidos = parada.pedidos.filter((ped) => incluidos.has(ped.id))
      if (pedidos.length === 0) return []
      return [
        {
          ...parada,
          pedidos,
          pesoTotal: pedidos.reduce((acc, ped) => acc + ped.peso, 0),
          volumenTotal: Number(pedidos.reduce((acc, ped) => acc + ped.volumen, 0).toFixed(1)),
        },
      ]
    })
  }, [paradasScope, includedOrderIds])
  const paradas = state === 'empty' || state === 'error' ? [] : (assignedParadasState ?? baseParadas)
  const pedidos =
    state === 'empty' || state === 'error' ? [] : paradas.flatMap((p) => p.pedidos)

  // Paradas que pasan los filtros activos
  const filtradas = useMemo(
    () =>
      paradas.filter((p) => {
        if (canales.size > 0 && !canales.has(p.canal)) return false
        if (tipos.size > 0 && !p.pedidos.some((ped) => tipos.has(ped.productType))) return false
        if (rutas.size > 0) {
          const rId = p.camionId ? `r-${p.camionId}` : undefined
          if (!rId || !rutas.has(rId)) return false
        }
        return true
      }),
    [canales, paradas, rutas, tipos],
  )

  const hayFiltros = canales.size > 0 || tipos.size > 0 || rutas.size > 0
  const limpiar = () => {
    setCanales(new Set())
    setTipos(new Set())
    setRutas(new Set())
  }

  const selectedRutaId = useMemo(() => {
    if (rutas.size === 1) return Array.from(rutas)[0]
    return 'ALL'
  }, [rutas])

  const handleSelectRuta = (rId: string) => {
    if (!rId || rId === 'ALL') {
      setRutas(new Set())
    } else {
      setRutas(new Set([rId]))
    }
  }

  // Rutas que quedan visibles con los filtros aplicados (leyenda del mapa).
  const rutasVisibles = rutasPlan.filter((r) => filtradas.some((p) => p.camionId === r.camionId))

  const canalOptions = CANALES.map((c) => ({ value: c.value, label: c.label, color: CANAL_META[c.value].color }))
  const tipoOptions = PRODUCT_TYPES.map((t) => ({ value: t, label: t }))
  const rutaOptions = rutasPlan.map((r) => ({ value: r.id, label: r.nombre, color: r.color }))

  // Paradas seleccionadas en el mapa y sus pedidos
  const selectedStops = filtradas.filter((p) => selStopIds.includes(p.id))
  const selectedPedidos = selectedStops.flatMap((p) => p.pedidos)
  const moverSeleccion = () => {
    setMoverSelOpen(false)
  }

  // Optimizar: reparte geográficamente las paradas entre los N camiones seleccionados y genera 1 ruta
  // por camión. El reparto es POR PESO, no por cantidad de paradas: antes se partía la lista en N
  // trozos iguales de paradas, y como las paradas no pesan lo mismo ni los camiones tienen la misma
  // capacidad, un camión de 11 t podía terminar con 80 t encima (729% de ocupación).
  const optimizar = () => {
    if (optimizing || optimized) return
    setOptimizing(true)
    setTimeout(() => {
      const trucks = selectedTrucks
      const porCercania = ordenarPorCercania(baseParadas, (p) => [p.lat, p.lng])
      // Capacidad libre de cada camión, en kg (capacidadPeso viene en toneladas).
      const libreKg = trucks.map((t) => (t.capacidadPeso ?? 0) * 1000)
      // Objetivo por camión: se reparte la demanda A PRORRATA de la capacidad, así todos los camiones
      // seleccionados quedan más o menos con la misma ocupación en vez de llenar los primeros hasta
      // el tope y dejar los últimos vacíos. Como `ratio ≤ 1`, el objetivo nunca supera la capacidad.
      const capTotalKg = libreKg.reduce((acc, kg) => acc + kg, 0)
      const demandaKg = porCercania.reduce((acc, p) => acc + p.pesoTotal, 0)
      const ratio = capTotalKg > 0 ? Math.min(1, demandaKg / capTotalKg) : 1
      const objetivoKg = libreKg.map((kg) => kg * ratio)
      // Se llena un camión hasta su objetivo y recién ahí se pasa al siguiente. Recorrer la curva de
      // Hilbert en orden mantiene la CONTIGÜIDAD geográfica de cada ruta; ir rotando de camión en
      // camión parada por parada daría rutas entrelazadas por todo el mapa.
      let actual = 0

      const asignadas = porCercania.map((parada) => {
        // Primer camión, desde el actual, donde la parada entra dentro de su objetivo; si ninguno
        // tiene lugar (resto de empaquetado), se reintenta contra la capacidad real.
        let idx = -1
        for (let k = 0; k < trucks.length; k++) {
          const i = (actual + k) % trucks.length
          if (objetivoKg[i] >= parada.pesoTotal) {
            idx = i
            break
          }
        }
        if (idx === -1) {
          for (let k = 0; k < trucks.length; k++) {
            const i = (actual + k) % trucks.length
            if (libreKg[i] >= parada.pesoTotal) {
              idx = i
              break
            }
          }
        }
        // No entra en ninguno: queda SIN ASIGNAR en vez de sobrecargar un camión. Con el gate de
        // cobertura del paso 1 esto no debería pasar; si pasa, es un resto de empaquetado y se ve.
        if (idx === -1) {
          return {
            ...parada,
            camionId: null,
            pedidos: parada.pedidos.map((ped) => ({ ...ped, camionId: null })),
          }
        }
        libreKg[idx] -= parada.pesoTotal
        objetivoKg[idx] -= parada.pesoTotal
        actual = idx
        const camion = trucks[idx]
        return {
          ...parada,
          camionId: camion.id,
          pedidos: parada.pedidos.map((ped) => ({ ...ped, camionId: camion.id })),
        }
      })

      setAssignedParadasState(asignadas)
      setOptimizing(false)
      setOptimized(true)
      setShowRoute(true)
    }, 2000)
  }

  // Contenido del panel del mapa: mapa a pantalla completa con una toolbar flotante (filtros +
  // acciones) DENTRO del mapa. `isolate` atrapa los z-index altos de Leaflet (paneles/controles,
  // hasta ~1000) en su propio contexto de apilado; sin esto se filtran al contexto raíz y tapan
  // los popovers de los filtros (portalizados al body con z-50).
  //
  // El panel es una columna: arriba la franja del viaje unificado (cuando corresponde) y debajo el
  // mapa, que se queda con el resto (`flex-1`). La franja NO va dentro del mapa: es información del
  // viaje, no del mapa, así que no tiene por qué taparlo ni pelear con sus controles.
  const mapContent = (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Resumen del viaje unificado (chofer, auxiliar, pedidos, peso). El componente ya se apaga solo
          si no hay unificación en curso, pero el contexto NO se limpia al salir del flujo: sin el gate
          por readOnly, la franja seguiría apareciendo en la planificación normal después de haber
          unificado una vez. readOnly es justo la marca del flujo de unificación (mismo criterio que
          usa el filtro por Ruta más abajo). */}
      {readOnly && <UnifyMapStats />}

      <div className="relative isolate min-h-0 flex-1">
        <OrdersMap
          paradas={filtradas}
          rutas={(rutas.size > 0 ? rutasPlan.filter((r) => rutas.has(r.id)) : rutasPlan) as any}
          routeToolEnabled={optimized}
          showRoute={showRoute}
          onToggleRoute={() => setShowRoute((v) => !v)}
          onSelectionChange={onMapSelection}
          showDetails={showDetails}
          singleRoute={singleRoute}
          routeColor={routeColor}
          hideTools={readOnly}
          // Mercados ENCENDIDOS en la planificación: es la pantalla donde el mercado explica por qué
          // dos pedidos deberían viajar juntos. En la reoptimización (readOnly, un camión ya armado) la
          // capa existe pero arranca apagada: ahí lo que se mira es la ruta, no la geografía de venta.
          capaMercados={readOnly ? 'off' : 'on'}
        />

        {/* Toolbar flotante de filtros + acciones, dentro del mapa (arriba-centro). El padding
            horizontal deja libre el MapToolbar (top-left) y el control de capas (top-right). */}
        <div className="pointer-events-none absolute inset-x-0 top-3 z-[1100] flex justify-center px-14">
          <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-lg border border-border bg-background/95 px-2 py-1.5 shadow-md backdrop-blur">
            <FilterMenu label="Canal" options={canalOptions} selected={canales} onToggle={toggleInSet(setCanales)} />
            <FilterMenu label="Tipo" options={tipoOptions} selected={tipos} onToggle={toggleInSet(setTipos)} />
            {/* El filtro por Ruta recién tiene sentido una vez optimizado (antes no hay rutas). En
                solo-lectura (unificación) es UNA sola ruta → no se ofrece filtrar por ruta. */}
            {optimized && !readOnly && (
              <FilterMenu label="Ruta" options={rutaOptions} selected={rutas} onToggle={toggleInSet(setRutas)} />
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

            <Separator orientation="vertical" className="h-5" />
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={() => setMapMaximized(true)}
              title="Maximizar mapa"
              aria-label="Maximizar mapa"
            >
              <Maximize2 size={14} />
            </Button>
            <UnpinButton label="Mapa" side="left" onClick={unpinMap} />
          </div>
        </div>

        {/* Overlay de "procesando" al Optimizar (z alto para tapar los controles de Leaflet). Cubre
            solo el mapa: la franja del viaje queda afuera porque no es contenido que se re-optimice. */}
        {optimizing && (
          <div className="absolute inset-0 z-[1200] flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-3 shadow-lg">
              <Loader2 size={18} className="animate-spin text-primary" />
              <span className="text-sm font-medium">Optimizando rutas…</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  const listContent = (
    <div className="flex min-h-0 flex-1 flex-col p-3">
      <SortablePedidosTable
        pedidos={pedidos}
        state={state}
        optimized={optimized}
        readOnly={readOnly}
        rutas={rutasPlan}
        selectedRutaId={selectedRutaId}
        onSelectRuta={handleSelectRuta}
        onReorder={() => setOptimized(false)}
        onRenameRuta={handleRenameRuta}
        headerActions={<UnpinButton label="Tabla" side="right" onClick={unpinList} />}
      />
    </div>
  )

  const handleCreateRoutes = () => {
    if (!readOnly && !scopeLabel?.includes('Reoptimizando')) {
      const dispatchState = useDispatchPlanStore.getState()
      const includedOrders = selectIncludedOrders(dispatchState)
      const selectedTrucks = selectSelectedTrucks(dispatchState)

      const camionesDetalle: PlanCamion[] = rutasPlan.map((ruta) => {
        const truck = ruta.camion
        const paradasDeRuta = paradas.filter((p) => p.camionId === truck.id)
        const cargaKg = paradasDeRuta.reduce((sum, p) => sum + p.pesoTotal, 0)
        const cargaVolM3 = paradasDeRuta.reduce((sum, p) => sum + p.volumenTotal, 0)
        const pedidosCount = paradasDeRuta.reduce((sum, p) => sum + p.pedidos.length, 0)
        const capacidadKg = (truck.capacidadPeso ?? 0) * 1000
        const capacidadVolM3 = truck.capacidadVolumen ?? 0
        const ocupacionPct = capacidadKg > 0 ? Math.round((cargaKg / capacidadKg) * 100) : 0
        const tripulacion = tripulacionDeCamion(truck.placa)

        return {
          id: truck.id,
          camionId: truck.id,
          placa: truck.placa,
          tipo: truck.tipo,
          clase: truck.clase,
          capacidadKg,
          capacidadVolM3,
          rutaNombre: ruta.nombre,
          rutaId: ruta.id,
          rutaColor: ruta.color,
          paradaIds: paradasDeRuta.map((p) => p.id),
          orderCount: 1,
          cargaKg,
          cargaVolM3,
          pedidos: pedidosCount,
          // La dupla viaja con el camión: se resuelve por placa contra el dataset, no se inventa.
          chofer: tripulacion.chofer,
          auxiliar: tripulacion.auxiliar,
          ocupacionPct,
        }
      })

      usePlanesStore.getState().addPlan({
        pedidos: includedOrders.length > 0 ? includedOrders.length : paradas.flatMap((p) => p.pedidos).length,
        camiones: selectedTrucks.length > 0 ? selectedTrucks.length : 3,
        estado: 'optimizado',
        camionesDetalle,
      })
    }
    onNext()
  }

  return (
    <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden p-0">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="text-sm font-semibold">{scopeLabel ?? 'Plan'}</span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto gap-1.5"
          onClick={optimizar}
          disabled={optimizing || optimized}
        >
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
        {/* Solo se habilita una vez optimizadas las rutas: sin optimización no hay órdenes que generar. */}
        <Button
          size="sm"
          disabled={!optimized}
          title={optimized ? 'Generar órdenes de transporte' : 'Primero optimizar las rutas'}
          onClick={handleCreateRoutes}
        >
          Crear {(scopeLabel?.includes('Reoptimizando')) ? 'órdenes de Transporte' : 'Rutas '}
        </Button>
      </div>

      {/* Split propio (mapa | tabla) con flex-basis en px + transición CSS → el colapso se DESLIZA
          (técnica del sidebar). El mapa/tabla no se re-montan. El divisor arrastra SOLO con ambos
          abiertos; el panel contraído (riel) se cambia únicamente con Pin/Unpin. */}
      <div ref={wrapRef} className="flex min-h-0 flex-1">
        <div
          className={cn('flex min-h-0 flex-col overflow-hidden', panelTransition)}
          style={{ flexGrow: 0, flexShrink: 0, flexBasis: width ? mapBasis : '60%' }}
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
          style={{ flexGrow: 0, flexShrink: 0, flexBasis: width ? listBasis : '40%' }}
        >
          {listPinned ? listContent : <CollapsedRail title="Tabla" side="right" onPin={pinList} />}
        </div>
      </div>

      {/* Mapa maximizado en un diálogo grande. */}
      <Dialog open={mapMaximized} onOpenChange={setMapMaximized}>
        <DialogContent className="h-[90vh] w-[95vw] max-w-[95vw] overflow-hidden p-0 sm:max-w-[95vw]">
          {/* Misma columna que el panel: franja del viaje arriba, mapa abajo con el resto del alto.
              Maximizar el mapa no debería hacer desaparecer el resumen del viaje. */}
          <div className="flex h-full w-full flex-col overflow-hidden rounded-lg">
            {readOnly && <UnifyMapStats />}
            <div className="relative isolate min-h-0 flex-1">
              <OrdersMap
                paradas={filtradas}
                routeToolEnabled={optimized}
                showRoute={showRoute}
                onToggleRoute={() => setShowRoute((v) => !v)}
                showDetails={showDetails}
                singleRoute={singleRoute}
                routeColor={routeColor}
                hideTools={readOnly}
                capaMercados={readOnly ? 'off' : 'on'}
              />
            </div>
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
                    <td className="px-3 py-1.5">
                      <div className="flex flex-col min-w-0 leading-tight">
                        <span className="font-medium text-foreground">{p.cliente}</span>
                        {p.puntoEntrega && (
                          <span className="text-[11px] text-muted-foreground">{p.puntoEntrega}</span>
                        )}
                      </div>
                    </td>
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
                {rutasPlan.map((ruta) => (
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
