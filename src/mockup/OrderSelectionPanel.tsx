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
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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

// Tabla del diálogo de detalles: una fila por valor de la dimensión. `cortColumn` agrega la hora
// de corte (solo tiene sentido para Canal).
interface ResumenRow {
  key: string
  label: string
  glyph?: ReactNode
  corte?: string
  agg: Agregado
}
function ResumenTabla({ rows, cortColumn = false }: { rows: ResumenRow[]; cortColumn?: boolean }) {
  return (
    <div className="mt-2 overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-8 px-2 text-xs">Detalle</TableHead>
            <TableHead className="h-8 px-2 text-right text-xs">Pedidos</TableHead>
            <TableHead className="h-8 px-2 text-right text-xs">Clientes</TableHead>
            <TableHead className="h-8 px-2 text-right text-xs">Monto (Bs)</TableHead>
            <TableHead className="h-8 px-2 text-right text-xs">Peso (kg)</TableHead>
            {cortColumn && <TableHead className="h-8 px-2 text-right text-xs">Corte</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={cortColumn ? 6 : 5}
                className="px-2 py-6 text-center text-xs text-muted-foreground"
              >
                Nada seleccionado en esta dimensión.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell className="px-2 py-1.5 text-xs">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {r.glyph}
                    <span className="truncate">{r.label}</span>
                  </span>
                </TableCell>
                <TableCell className="px-2 py-1.5 text-right text-xs tabular-nums">
                  {r.agg.countOrders}
                </TableCell>
                <TableCell className="px-2 py-1.5 text-right text-xs tabular-nums">
                  {r.agg.countCustomers}
                </TableCell>
                <TableCell className="px-2 py-1.5 text-right text-xs font-medium tabular-nums">
                  {fmtMoneda.format(r.agg.total)}
                </TableCell>
                <TableCell className="px-2 py-1.5 text-right text-xs tabular-nums">
                  {fmtPeso.format(r.agg.totalWeight)}
                </TableCell>
                {cortColumn && (
                  <TableCell className="px-2 py-1.5 text-right text-xs tabular-nums">
                    {r.corte}
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
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
  // Abre/cierra el diálogo con el resumen por dimensión (antes tabla inline).
  const [detallesOpen, setDetallesOpen] = useState(false)

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

  // Total de selecciones (todas las dimensiones) → contador del botón "Ver detalles".
  const totalSeleccionados =
    activeCanales.length +
    activeCiudades.length +
    activeMercados.length +
    activeZonas.length +
    activeVendedores.length

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

  // Valores a mostrar por dimensión en el diálogo: si hay selección, esos; si no, los presentes en
  // el conjunto incluido (así el detalle informa aunque el filtro no esté acotado).
  const presentes = <T,>(sel: T[], all: T[], keyFn: (p: Pedido) => T): T[] =>
    sel.length > 0 ? sel : all.filter((v) => incluidos.some((p) => keyFn(p) === v))

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

        <div className="flex-1" />

        {/* "Ver detalles": resumen por dimensión (pestañas) de lo YA aplicado. Su contador suma las
            selecciones aplicadas (no el draft). */}
        {totalSeleccionados > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 shrink-0 gap-1.5"
            onClick={() => setDetallesOpen(true)}
          >
            Ver detalles
            <span className="flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums">
              {totalSeleccionados}
            </span>
          </Button>
        )}
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

      {/* Resumen por dimensión en un diálogo con pestañas: una fila por valor con lo que entra al
          plan (pedidos/clientes/monto/peso). El canal suma su hora de corte. */}
      <Dialog open={detallesOpen} onOpenChange={setDetallesOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Resumen de la selección</DialogTitle>
          </DialogHeader>
          {/* flex-col forzado: base-ui emite data-orientation (no data-horizontal), así que la
              variante del componente no apila lista+contenido. Lo forzamos acá. */}
          <Tabs defaultValue="ciudad" className="flex-col gap-3">
            <TabsList>
              <TabsTrigger value="ciudad">Ciudad</TabsTrigger>
              <TabsTrigger value="canal">Canal</TabsTrigger>
              <TabsTrigger value="mercado">Mercado</TabsTrigger>
              <TabsTrigger value="zona">Zona</TabsTrigger>
              <TabsTrigger value="vendedor">Vendedor</TabsTrigger>
            </TabsList>

            <TabsContent value="ciudad">
              <ResumenTabla
                rows={presentes<CiudadId>(activeCiudades, CIUDAD_IDS, ciudadDe).map((c) => ({
                  key: c,
                  label: CIUDAD_META[c].label,
                  agg: agregar(incluidos.filter((p) => ciudadDe(p) === c)),
                }))}
              />
            </TabsContent>

            {/* Canal: incluye columna de corte y el glifo del canal. */}
            <TabsContent value="canal">
              <ResumenTabla
                cortColumn
                rows={canalesActivos.map((canal) => {
                  const resumen = resumenPorCanal(canal)
                  return {
                    key: canal,
                    label: CANAL_META[canal].label,
                    glyph: (
                      <span className="shrink-0" style={{ color: CANAL_META[canal].color }}>
                        <CanalGlyph canal={canal} size={14} />
                      </span>
                    ),
                    corte: CANAL_META[canal].timeOff,
                    agg: {
                      countOrders: resumen.countOrders,
                      countCustomers: resumen.countCustomers,
                      total: resumen.total,
                      totalWeight: resumen.totalWeight,
                    },
                  }
                })}
              />
            </TabsContent>

            <TabsContent value="mercado">
              <ResumenTabla
                rows={presentes<MercadoId>(activeMercados, MERCADO_IDS, mercadoDe).map((m) => ({
                  key: m,
                  label: MERCADO_META[m].label,
                  agg: agregar(incluidos.filter((p) => mercadoDe(p) === m)),
                }))}
              />
            </TabsContent>

            <TabsContent value="zona">
              <ResumenTabla
                rows={presentes<ZonaId>(activeZonas, ZONA_IDS, zonaDe).map((z) => ({
                  key: z,
                  label: ZONA_META[z].label,
                  agg: agregar(incluidos.filter((p) => zonaDe(p) === z)),
                }))}
              />
            </TabsContent>

            <TabsContent value="vendedor">
              <ResumenTabla
                rows={presentes<string>(activeVendedores, VENDEDORES, (p) => p.vendedor).map((v) => ({
                  key: v,
                  label: v,
                  agg: agregar(incluidos.filter((p) => p.vendedor === v)),
                }))}
              />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

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
  )
}
