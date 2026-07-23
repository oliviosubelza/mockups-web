// Panel derecho del paso combinado (fase 0): qué canales entran en esta corrida + selección
// manual de los pedidos fuera de corte. Los pedidos "dentro" del corte entran solos a la
// planificación (no se listan, son informativos); los de "fuera" son opcionales y se tildan acá.
//
// Nota de modelo: hoy el canal NO existe en la BD (ni en candidate_order ni en delivery_point).
// Este mockup asume `channel_id` en candidate_order y una tabla dispatch_plan_channel para
// persistir la selección; sin eso, este paso no es reproducible ni auditable.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Building2, Globe, MapPin, Store, User, X, type LucideIcon } from 'lucide-react'
import { DataTable, defineColumns, defineFilters, FilterBar } from '@/components/data-table'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import {
  CANAL_META,
  CANAL_RESUMEN,
  CIUDAD_IDS,
  CIUDAD_META,
  EMPRESAS,
  MERCADO_IDS,
  MERCADO_META,
  PAYMENT_TYPES,
  PEDIDOS,
  PRODUCT_TYPES,
  VENDEDORES,
  ZONA_IDS,
  ZONA_META,
  ciudadDe,
  mercadoDe,
  zonaDe,
  type CanalId,
  type CanalResumen,
  type CiudadId,
  type MercadoId,
  type Pedido,
  type ZonaId,
} from './mock-data'
import { CanalGlyph } from './canal-glyph'
import { dentroDelCorte, useDispatchPlanStore } from './dispatch-plan-store'
import type { BoardState } from './types'

const CANAL_IDS = Object.keys(CANAL_META) as CanalId[]

// ── Filtro genérico con contador propio (popover de búsqueda) ──────────────────────────────────
// Reemplaza la fila horizontal de chips: cada dimensión (Canal/Mercado/Zona/Vendedor) es un botón
// con su contador; lo seleccionado se ve y se togglea DENTRO del popover (check a la izquierda).
interface FiltroOption {
  value: string
  label: string
  glyph?: ReactNode
}

function FiltroPopover({
  label,
  icon: Icon,
  options,
  active,
  onToggle,
  searchPlaceholder,
  emptyText,
}: {
  label: string
  icon: LucideIcon
  options: FiltroOption[]
  active: string[]
  onToggle: (value: string) => void
  searchPlaceholder: string
  emptyText: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          buttonVariants({ variant: 'outline', size: 'sm' }),
          'h-7 shrink-0 gap-1.5',
          active.length > 0 && 'border-primary/40'
        )}
      >
        <Icon size={13} />
        {label}
        {active.length > 0 && (
          <span className="flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums">
            {active.length}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
              {emptyText}
            </CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const isActive = active.includes(opt.value)
                return (
                  <CommandItem
                    key={opt.value}
                    value={opt.label}
                    data-checked={isActive}
                    onSelect={() => onToggle(opt.value)}
                    className="gap-2 text-xs"
                  >
                    {opt.glyph}
                    <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// Agregados de un conjunto de pedidos para el diálogo de detalles.
interface Agregado {
  countOrders: number
  countCustomers: number
  total: number
  totalWeight: number
}
const agregar = (items: Pedido[]): Agregado => ({
  countOrders: items.length,
  countCustomers: new Set(items.map((p) => p.cliente)).size,
  total: Number(items.reduce((acc, p) => acc + p.total, 0).toFixed(2)),
  totalWeight: Number(items.reduce((acc, p) => acc + p.peso, 0).toFixed(2)),
})

// Indicador compacto para la fila de resumen: rótulo chico arriba, número debajo. Sin card propia
// (van todos dentro de una misma barra), para ocupar bien el espacio horizontal.
function Kpi({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex flex-col justify-center" title={title}>
      <span className="text-[11px] leading-tight text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold leading-tight tabular-nums">{value}</span>
    </div>
  )
}

/** Rango de fecha (formato del daterange) para MAÑANA: inicio=fin=día siguiente. */
function mananaRange(): { fechaDesde: string; fechaHasta: string } {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { fechaDesde: `${ymd}T00:00:00.000Z`, fechaHasta: `${ymd}T23:59:59.999Z` }
}

// Formatos del resumen del backend: `total` como moneda (Bs) y `totalWeight` en kg.
const fmtMoneda = new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' })
const fmtPeso = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 })

// Filtros del listado de pedidos (contrato `filterOrders`). El canal se elige con las tarjetas.
interface PedidoFilters extends Record<string, unknown> {
  productType?: string
  paymentType?: string
  company?: string
  fechaDesde?: string
  fechaHasta?: string
}

const filterDefs = defineFilters<PedidoFilters>([
  { type: 'daterange', id: 'fecha', label: 'Entrega', fromKey: 'fechaDesde', toKey: 'fechaHasta' },
  {
    type: 'select',
    id: 'productType',
    label: 'Tipo',
    options: PRODUCT_TYPES.map((t) => ({ label: t, value: t })),
  },
  {
    type: 'select',
    id: 'paymentType',
    label: 'Pago',
    options: PAYMENT_TYPES.map((t) => ({ label: t, value: t })),
  },
  {
    type: 'select',
    id: 'company',
    label: 'Sociedad',
    options: EMPRESAS.map((e) => ({ label: e, value: e })),
  },
])

// Columnas por defecto: solo las más importantes para que la tabla no crezca de más.
const columns = defineColumns<Pedido>([
  { id: 'salesOrder', header: 'Pedido', accessorKey: 'salesOrder', size: 90, pin: 'left' },
  {
    id: 'canal',
    header: 'Canal',
    accessorKey: 'canal',
    size: 130,
    cell: (row) => {
      const meta = CANAL_META[row.canal]
      return (
        <span className="flex min-w-0 items-center gap-1.5" title={meta.label}>
          <span className="shrink-0" style={{ color: meta.color }}>
            <CanalGlyph canal={row.canal} size={15} />
          </span>
          <span className="truncate">{meta.label}</span>
        </span>
      )
    },
  },
  { id: 'cliente', header: 'Cliente', accessorKey: 'cliente', size: 200 },
  {
    id: 'total',
    header: 'Total (Bs)',
    accessorKey: 'total',
    size: 96,
    meta: { align: 'right' },
    cell: (row) => <span className="font-medium tabular-nums">{fmtMoneda.format(row.total)}</span>,
  },
  {
    id: 'peso',
    header: 'Peso total',
    accessorKey: 'peso',
    size: 92,
    meta: { align: 'right' },
    cell: (row) => <span className="tabular-nums">{fmtPeso.format(row.peso)} kg</span>,
  },
])

// Fila del resumen POR CANAL (una por canal activo). Se muestra en la vista Resumen usando el
// mismo DataTable que la tabla de fuera de corte, pero acá NO se selecciona: solo se reordenan
// filas (drag) y columnas.
interface CanalResumenRow {
  id: CanalId
  canal: CanalId
  countOrders: number
  countCustomers: number
  total: number
  totalWeight: number
  corte: string
}

const canalResumenColumns = defineColumns<CanalResumenRow>([
  {
    id: 'canal',
    header: 'Canal',
    accessorKey: 'canal',
    size: 150,
    cell: (row) => {
      const meta = CANAL_META[row.canal]
      return (
        <span className="flex min-w-0 items-center gap-1.5" title={meta.label}>
          <span className="shrink-0" style={{ color: meta.color }}>
            <CanalGlyph canal={row.canal} size={15} />
          </span>
          <span className="truncate">{meta.label}</span>
        </span>
      )
    },
  },
  {
    id: 'countOrders',
    header: 'Pedidos',
    accessorKey: 'countOrders',
    size: 90,
    meta: { align: 'right' },
    cell: (row) => <span className="tabular-nums">{row.countOrders}</span>,
  },
  {
    id: 'countCustomers',
    header: 'Clientes',
    accessorKey: 'countCustomers',
    size: 90,
    meta: { align: 'right' },
    cell: (row) => <span className="tabular-nums">{row.countCustomers}</span>,
  },
  {
    id: 'total',
    header: 'Monto (Bs)',
    accessorKey: 'total',
    size: 112,
    meta: { align: 'right' },
    cell: (row) => <span className="font-medium tabular-nums">{fmtMoneda.format(row.total)}</span>,
  },
  {
    id: 'totalWeight',
    header: 'Peso (kg)',
    accessorKey: 'totalWeight',
    size: 100,
    meta: { align: 'right' },
    cell: (row) => <span className="tabular-nums">{fmtPeso.format(row.totalWeight)}</span>,
  },
  {
    id: 'corte',
    header: 'Corte',
    accessorKey: 'corte',
    size: 80,
    meta: { align: 'right' },
    cell: (row) => <span className="tabular-nums">{row.corte}</span>,
  },
])

// Mueve `activeId` a la posición de `overId` dentro de un array (para el drag de filas).
function moveInArray<T>(arr: T[], activeId: T, overId: T): T[] {
  const from = arr.indexOf(activeId)
  const to = arr.indexOf(overId)
  if (from === -1 || to === -1 || from === to) return arr
  const copy = [...arr]
  const [moved] = copy.splice(from, 1)
  copy.splice(to, 0, moved)
  return copy
}

export function OrderSelectionPanel({ state }: { state: BoardState }) {
  const activeCanales = useDispatchPlanStore((s) => s.activeCanales)
  const activeCiudades = useDispatchPlanStore((s) => s.activeCiudades)
  const activeMercados = useDispatchPlanStore((s) => s.activeMercados)
  const activeZonas = useDispatchPlanStore((s) => s.activeZonas)
  const activeVendedores = useDispatchPlanStore((s) => s.activeVendedores)
  const selectedFueraOrderIds = useDispatchPlanStore((s) => s.selectedFueraOrderIds)
  const applySelection = useDispatchPlanStore((s) => s.applySelection)
  const setSelectedFuera = useDispatchPlanStore((s) => s.setSelectedFuera)

  // DRAFT de filtros: lo que el usuario va tildando en los popovers vive acá (local), NO en el
  // store. Un DEBOUNCE (abajo) commitea el draft al store recién ~450ms después del último toggle,
  // así en la app real habría UN solo fetch tras terminar de armar los filtros, no uno por toggle.
  const [draftCiudades, setDraftCiudades] = useState<CiudadId[]>(activeCiudades)
  const [draftCanales, setDraftCanales] = useState<CanalId[]>(activeCanales)
  const [draftMercados, setDraftMercados] = useState<MercadoId[]>(activeMercados)
  const [draftZonas, setDraftZonas] = useState<ZonaId[]>(activeZonas)
  const [draftVendedores, setDraftVendedores] = useState<string[]>(activeVendedores)

  // Toggle genérico de un valor dentro de un array de draft.
  const toggleEn = <T,>(set: (fn: (prev: T[]) => T[]) => void, value: T) =>
    set((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]))

  // Debounce: aplica el draft al store 450ms después del último cambio (equivale al "fetch" único).
  useEffect(() => {
    const t = setTimeout(() => {
      applySelection({
        canales: draftCanales,
        ciudades: draftCiudades,
        mercados: draftMercados,
        zonas: draftZonas,
        vendedores: draftVendedores,
      })
    }, 450)
    return () => clearTimeout(t)
  }, [draftCanales, draftCiudades, draftMercados, draftZonas, draftVendedores, applySelection])

  // El filtro de Entrega arranca por defecto en MAÑANA (inicio=fin=día siguiente).
  const [filters, setFilters] = useState<Partial<PedidoFilters>>(() => mananaRange())
  // Vista del listado: 'resumen' (agregado de todo lo que entra al plan) es lo PRIMERO que se ve;
  // 'tabla' muestra los pedidos fuera de corte, uno por fila, para tildarlos a mano.
  const [viewMode, setViewMode] = useState<'resumen' | 'tabla'>('resumen')
  // Orden de las filas del resumen por canal (drag-and-drop). Arranca en el orden natural de canales.
  const [canalRowOrder, setCanalRowOrder] = useState<CanalId[]>(CANAL_IDS)

  // Ver nota en FleetCapacityPanel: el DataTable arranca su selección interna en `{}` al MONTAR;
  // se ignora ese primer aviso para no pisar `selectedFueraOrderIds` ya guardado en el store.
  const skipFirstSelection = useRef(true)

  // Filtros del DTO aplicados en memoria (el daterange guarda ISO; comparo contra la fecha del pedido).
  const coincideFiltros = (p: Pedido) =>
    (!filters.productType || p.productType === filters.productType) &&
    (!filters.paymentType || p.paymentType === filters.paymentType) &&
    (!filters.company || p.company === filters.company) &&
    (!filters.fechaDesde || p.fechaEntrega >= filters.fechaDesde.slice(0, 10)) &&
    (!filters.fechaHasta || p.fechaEntrega <= filters.fechaHasta.slice(0, 10))

  // Filtros de NARROWING (Ciudad/Mercado/Zona/Vendedor): array vacío no filtra; con valores, coincide.
  const coincideNarrowing = (p: Pedido) =>
    (activeCiudades.length === 0 || activeCiudades.includes(ciudadDe(p))) &&
    (activeMercados.length === 0 || activeMercados.includes(mercadoDe(p))) &&
    (activeZonas.length === 0 || activeZonas.includes(zonaDe(p))) &&
    (activeVendedores.length === 0 || activeVendedores.includes(p.vendedor))

  // Solo se listan los pedidos de canales ACTIVOS que además pasen los filtros de narrowing.
  const canalesActivos = CANAL_IDS.filter((c) => activeCanales.includes(c))
  const pedidos = PEDIDOS.filter(
    (p) => activeCanales.includes(p.canal) && coincideFiltros(p) && coincideNarrowing(p),
  )
  const base = state === 'empty' || state === 'error' ? [] : pedidos
  // Dos grupos por corte de hora, evaluado con el corte (del backend) del canal de cada pedido.
  const fuera = base.filter((p) => !dentroDelCorte(p, CANAL_META[p.canal].timeOff))

  // Conjunto que efectivamente entra al plan: dentro del corte (automático) + fuera tildado a mano,
  // ya filtrado por canal + narrowing. Base de TODOS los agregados del diálogo de detalles.
  const incluidos = pedidos.filter(
    (p) => dentroDelCorte(p, CANAL_META[p.canal].timeOff) || selectedFueraOrderIds.includes(p.id),
  )

  // Agregado global de la vista Resumen: todo lo que entra al plan. Se separa cuántos vienen
  // fuera del corte y cuántos de esos el usuario ya tildó a mano.
  const totalIncluidos = agregar(incluidos)
  const fueraSeleccionados = fuera.filter((p) => selectedFueraOrderIds.includes(p.id))

  // Resumen del card POR CANAL: cuenta lo que efectivamente entra al plan = las órdenes dentro del
  // corte (automáticas) + las de fuera del corte que el usuario tildó en la tabla.
  const resumenPorCanal = (canal: CanalId): CanalResumen => {
    const incluidosCanal = incluidos.filter((p) => p.canal === canal)
    const meta = CANAL_RESUMEN[canal]
    const agg = agregar(incluidosCanal)
    return {
      channelId: meta.channelId,
      channelName: meta.channelName,
      countOrders: agg.countOrders,
      countCustomers: agg.countCustomers,
      total: agg.total,
      totalWeight: agg.totalWeight,
      timeOff: meta.timeOff,
    }
  }

  // Filas del resumen por canal, en el orden elegido por el usuario (drag). Solo canales activos.
  const canalResumenRows: CanalResumenRow[] = canalRowOrder
    .filter((c) => canalesActivos.includes(c))
    .map((canal) => {
      const resumen = resumenPorCanal(canal)
      return {
        id: canal,
        canal,
        countOrders: resumen.countOrders,
        countCustomers: resumen.countCustomers,
        total: resumen.total,
        totalWeight: resumen.totalWeight,
        corte: CANAL_META[canal].timeOff,
      }
    })

  const sinSeleccion = activeCanales.length === 0

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3">
      {/* Fila de filtros: una dimensión por botón, cada uno con su propio contador. ORDEN: Ciudad
          (el filtro SUPERIOR/más amplio) va SIEMPRE primero, después Canal, Mercado, Zona, Vendedor.
          Lo seleccionado se ve y se togglea DENTRO de cada popover; un debounce aplica todo al store
          (no hay botón "Buscar"). El detalle agregado vive en "Ver detalles". Ya NO se muestran los
          chips horizontalmente (ver bloque comentado abajo). */}
      <div className="flex items-center gap-1.5">
        <FiltroPopover
          label="Ciudad"
          icon={Building2}
          active={draftCiudades}
          onToggle={(v) => toggleEn(setDraftCiudades, v as CiudadId)}
          searchPlaceholder="Buscar ciudad…"
          emptyText="Sin ciudades"
          options={CIUDAD_IDS.map((c) => ({ value: c, label: CIUDAD_META[c].label }))}
        />
        <FiltroPopover
          label="Canal"
          icon={Store}
          active={draftCanales}
          onToggle={(v) => toggleEn(setDraftCanales, v as CanalId)}
          searchPlaceholder="Buscar canal…"
          emptyText="Sin canales"
          options={CANAL_IDS.map((c) => ({
            value: c,
            label: CANAL_META[c].label,
            glyph: (
              <span className="shrink-0" style={{ color: CANAL_META[c].color }}>
                <CanalGlyph canal={c} size={14} />
              </span>
            ),
          }))}
        />
        <FiltroPopover
          label="Mercado"
          icon={Globe}
          active={draftMercados}
          onToggle={(v) => toggleEn(setDraftMercados, v as MercadoId)}
          searchPlaceholder="Buscar mercado…"
          emptyText="Sin mercados"
          options={MERCADO_IDS.map((m) => ({ value: m, label: MERCADO_META[m].label }))}
        />
        <FiltroPopover
          label="Zona"
          icon={MapPin}
          active={draftZonas}
          onToggle={(v) => toggleEn(setDraftZonas, v as ZonaId)}
          searchPlaceholder="Buscar zona…"
          emptyText="Sin zonas"
          options={ZONA_IDS.map((z) => ({ value: z, label: ZONA_META[z].label }))}
        />
        <FiltroPopover
          label="Vendedor"
          icon={User}
          active={draftVendedores}
          onToggle={(v) => toggleEn(setDraftVendedores, v)}
          searchPlaceholder="Buscar vendedor…"
          emptyText="Sin vendedores"
          options={VENDEDORES.map((v) => ({ value: v, label: v }))}
        />
      </div>

      {/* DISEÑO ANTERIOR (comentado, no borrado): buscador de canal único + chips horizontales
          removibles. Reemplazado por la fila de filtros de arriba a pedido del rediseño.
      <div className="flex items-center gap-1.5">
        <Popover open={canalPickerOpen} onOpenChange={setCanalPickerOpen}>
          <PopoverTrigger className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0 gap-1.5')}>
            <Plus size={13} />
            Buscar canal…
          </PopoverTrigger>
          ...
        </Popover>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          {sinSeleccion ? (
            <span className="shrink-0 text-xs text-muted-foreground">Ningún canal seleccionado</span>
          ) : (
            canalesActivos.map((canal) => (
              <Badge key={canal} variant="outline" className="shrink-0 gap-1 py-1 pr-1 font-normal">
                <CanalGlyph canal={canal} size={12} />
                {CANAL_META[canal].label}
                <button type="button" onClick={() => toggleCanal(canal)} aria-label={`Quitar ${CANAL_META[canal].label}`}>
                  <X size={11} />
                </button>
              </Badge>
            ))
          )}
        </div>
      </div>
      */}


      {/* Selector de vista: Resumen (agregado de todo lo que entra al plan) vs Tabla (pedidos
          fuera de corte, uno por fila para tildar a mano). */}
      <div className="flex shrink-0 items-center gap-3">
        <div className="inline-flex rounded-md border border-border/60 p-0.5">
          {(['resumen', 'tabla'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={cn(
                'rounded px-3 py-1 text-xs font-medium transition-colors',
                viewMode === mode
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {mode === 'resumen' ? 'Resumen' : 'Seleccionar fuera de corte'}
            </button>
          ))}
        </div>
      </div>

      {viewMode === 'resumen' ? (
        // ── Vista RESUMEN: agregado global + desglose por canal ─────────────────────────────────
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
          {sinSeleccion ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
              <p className="text-sm font-medium">Elegí un canal</p>
              <p className="text-xs text-muted-foreground">
                Seleccioná uno o más canales arriba para ver el resumen.
              </p>
            </div>
          ) : (
            <>
              {/* Todas las métricas en UNA barra compacta, separadas por divisores. La de fuera de
                  corte seleccionados vive acá al lado y se suma con lo tildado en la tabla. */}
              <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 rounded-lg border border-border/60 bg-muted/20 px-4 py-2">
                <Kpi label="Pedidos" value={String(totalIncluidos.countOrders)} />
                <Kpi label="Clientes" value={String(totalIncluidos.countCustomers)} />
                <Kpi label="Monto" value={fmtMoneda.format(totalIncluidos.total)} />
                <Kpi label="Peso" value={`${fmtPeso.format(totalIncluidos.totalWeight)} kg`} />
                <Kpi
                  label="Fuera de corte"
                  value={String(fueraSeleccionados.length)}
                  title="Pedidos fuera de corte seleccionados"
                />
              </div>
              <DataTable
                tableId="mockup-resumen-canal"
                columns={canalResumenColumns}
                data={canalResumenRows}
                getRowId={(row) => row.id}
                emptyTitle="Sin canales"
                emptyMessage="Seleccioná un canal para ver el desglose."
                bodyMinHeight={160}
                // Reordenar filas (drag) y columnas — no hay selección ni búsqueda acá.
                enableRowReorder
                onRowReorder={(activeId, overId) =>
                  setCanalRowOrder((prev) =>
                    moveInArray(prev, activeId as CanalId, overId as CanalId),
                  )
                }
              />
            </>
          )}
        </div>
      ) : (
        // ── Vista TABLA: pedidos fuera de corte, uno por fila ───────────────────────────────────
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <span className="text-xs text-muted-foreground">
            Seleccionar las órdenes que se desea que entren a planificación.
          </span>
          <DataTable
            tableId={`mockup-canales-fuera-${state}`}
            columns={columns}
            data={fuera}
            getRowId={(row) => row.id}
            isLoading={state === 'loading'}
            isError={state === 'error'}
            errorMessage="No pudimos traer los pedidos pendientes."
            onRetry={() => {}}
            emptyTitle={sinSeleccion ? 'Elegí un canal' : 'Nada fuera del corte'}
            emptyMessage={
              sinSeleccion
                ? 'Seleccioná uno o más canales arriba para traer sus pedidos.'
                : 'Todos los pedidos de los canales elegidos entran dentro del corte.'
            }
            fillHeight
            selectable
            // Tinte MUY tenue (color del ícono de ecommerce, opacidad baja) para distinguir esas filas
            // sin gritar. Subir la opacidad (/10, /15) si se quiere más marcado.
            rowClassName={(p) => (p.canal === 'ecommerce' ? 'bg-[#db2777]/5' : '')}
            onSelectionChange={(rows) => {
              if (skipFirstSelection.current) {
                skipFirstSelection.current = false
                return
              }
              setSelectedFuera(rows.map((r) => r.id))
            }}
            searchable
            searchPlaceholder="Buscar por cliente o pedido…"
            clientPagination
            defaultPageSize={8}
            filterBar={
              <FilterBar
                defs={filterDefs}
                values={filters}
                onChange={(u) => setFilters((prev) => ({ ...prev, ...u }))}
              />
            }
          />
        </div>
      )}
    </div>
  )
}
