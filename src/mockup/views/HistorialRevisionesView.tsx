import { useMemo, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { format, isSameDay } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  AlertCircle,
  ArrowUpDown,
  Calendar as CalendarIcon,
  Check,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Copy,
  Download,
  Eye,
  FileCheck2,
  FileClock,
  FileSpreadsheet,
  Filter,
  Flame,
  HelpCircle,
  Info,
  Layers,
  LayoutGrid,
  List,
  PenTool,
  Printer,
  RotateCcw,
  Route,
  Search,
  ShieldAlert,
  ShieldCheck,
  Snowflake,
  Sparkles,
  TrafficCone,
  Truck,
  User,
  X,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  HISTORIAL_REVISIONES_DATA,
  type ItemSesionConteo,
  type OrdenRevisionHistorial,
  type SesionConteoInfo,
} from '../historial-revisiones-data'
import {
  exportarHistorialRevisionesAExcel,
  exportarOrdenRevisionIndividualAExcel,
} from '../utils/excel-export'

type FilterMode = 'ALL' | 'WITH_DISCREPANCIES' | 'SUPERVISOR_REVIEWED' | 'SEMAPHORE_AUDITED' | 'MATCH_ONLY'
type ProductTableFilter = 'ALL' | 'DISCREPANCIES' | 'COLD_CHAIN'
type DetailTab = 'MATRIX' | 'SESSIONS' | 'SETTLEMENT'

export function HistorialRevisionesView() {
  // ── ESTADOS DE FILTRO PRINCIPAL ──
  const [searchTerm, setSearchTerm] = useState('')
  const [filterMode, setFilterMode] = useState<FilterMode>('ALL')
  const [selectedTruck, setSelectedTruck] = useState('ALL')
  const [selectedDriver, setSelectedDriver] = useState('ALL')
  const [selectedSupervisor, setSelectedSupervisor] = useState('ALL')
  const [selectedRoute, setSelectedRoute] = useState('ALL')
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [datePopoverOpen, setDatePopoverOpen] = useState(false)

  // ── ESTADO DE SELECCIÓN Y VISTA INTERNA ──
  const [selectedOrderId, setSelectedOrderId] = useState<string>(
    HISTORIAL_REVISIONES_DATA[0]?.id || ''
  )
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>('SESSIONS')
  const [productFilter, setProductFilter] = useState<ProductTableFilter>('ALL')
  const [productSearchQuery, setProductSearchQuery] = useState('')
  const [sessionDetailModal, setSessionDetailModal] = useState<SesionConteoInfo | null>(null)
  const [selectedProductForDrawer, setSelectedProductForDrawer] = useState<ItemSesionConteo | null>(null)

  // ── ESTADOS DE VISTA LATERAL (DENSIDAD Y ACORDEÓN POR FECHA) ──
  const [viewDensity, setViewDensity] = useState<'CARDS' | 'COMPACT'>('CARDS')
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({})

  const toggleDateGroup = (dateIso: string) => {
    setExpandedDates((prev) => ({
      ...prev,
      [dateIso]: prev[dateIso] === undefined ? false : !prev[dateIso],
    }))
  }

  // ── ESTADOS PARA COMBOBOXES BUSCABLES ──
  const [truckPopoverOpen, setTruckPopoverOpen] = useState(false)
  const [truckSearchQuery, setTruckSearchQuery] = useState('')
  const [truckTypeFilter, setTruckTypeFilter] = useState<'ALL' | 'COLD' | 'DRY'>('ALL')

  const [driverPopoverOpen, setDriverPopoverOpen] = useState(false)
  const [driverSearchQuery, setDriverSearchQuery] = useState('')

  const [supervisorPopoverOpen, setSupervisorPopoverOpen] = useState(false)
  const [supervisorSearchQuery, setSupervisorSearchQuery] = useState('')

  const [routePopoverOpen, setRoutePopoverOpen] = useState(false)
  const [routeSearchQuery, setRouteSearchQuery] = useState('')

  // Lista enriquecida y deduplicada de camiones
  const trucksList = useMemo(() => {
    const map = new Map<string, { plate: string; code: string; truckType: string; isRefrigerated: boolean; orderCount: number }>()
    HISTORIAL_REVISIONES_DATA.forEach((o) => {
      const existing = map.get(o.truck.plate)
      if (existing) {
        existing.orderCount += 1
      } else {
        map.set(o.truck.plate, {
          plate: o.truck.plate,
          code: o.truck.code,
          truckType: o.truck.truckType,
          isRefrigerated: o.truck.isRefrigerated,
          orderCount: 1,
        })
      }
    })
    return Array.from(map.values())
  }, [])

  // Camiones filtrados por búsqueda predictiva y tab de frío
  const filteredTrucksList = useMemo(() => {
    return trucksList.filter((t) => {
      if (truckTypeFilter === 'COLD' && !t.isRefrigerated) return false
      if (truckTypeFilter === 'DRY' && t.isRefrigerated) return false
      if (!truckSearchQuery.trim()) return true
      const q = truckSearchQuery.toLowerCase()
      return (
        t.plate.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q) ||
        t.truckType.toLowerCase().includes(q)
      )
    })
  }, [trucksList, truckSearchQuery, truckTypeFilter])

  const selectedTruckObj = useMemo(() => {
    return trucksList.find((t) => t.plate === selectedTruck)
  }, [trucksList, selectedTruck])

  // Lista enriquecida y deduplicada de choferes
  const driversList = useMemo(() => {
    const map = new Map<string, { name: string; document: string; phone: string; orderCount: number }>()
    HISTORIAL_REVISIONES_DATA.forEach((o) => {
      const existing = map.get(o.driver.name)
      if (existing) {
        existing.orderCount += 1
      } else {
        map.set(o.driver.name, {
          name: o.driver.name,
          document: o.driver.document,
          phone: o.driver.phone,
          orderCount: 1,
        })
      }
    })
    return Array.from(map.values())
  }, [])

  const filteredDriversList = useMemo(() => {
    if (!driverSearchQuery.trim()) return driversList
    const q = driverSearchQuery.toLowerCase()
    return driversList.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.document.toLowerCase().includes(q) ||
        d.phone.toLowerCase().includes(q)
    )
  }, [driversList, driverSearchQuery])

  const selectedDriverObj = useMemo(() => {
    return driversList.find((d) => d.name === selectedDriver)
  }, [driversList, selectedDriver])

  // Lista enriquecida y deduplicada de supervisores
  const supervisorsList = useMemo(() => {
    const map = new Map<string, { name: string; orderCount: number }>()
    HISTORIAL_REVISIONES_DATA.forEach((o) => {
      const name = o.supervisor?.name || 'Ing. Marco Antonio Vaca'
      const existing = map.get(name)
      if (existing) {
        existing.orderCount += 1
      } else {
        map.set(name, { name, orderCount: 1 })
      }
    })
    return Array.from(map.values())
  }, [])

  const filteredSupervisorsList = useMemo(() => {
    if (!supervisorSearchQuery.trim()) return supervisorsList
    const q = supervisorSearchQuery.toLowerCase()
    return supervisorsList.filter((s) => s.name.toLowerCase().includes(q))
  }, [supervisorsList, supervisorSearchQuery])

  const selectedSupervisorObj = useMemo(() => {
    return supervisorsList.find((s) => s.name === selectedSupervisor)
  }, [supervisorsList, selectedSupervisor])

  // Lista enriquecida y deduplicada de rutas
  const routesList = useMemo(() => {
    const map = new Map<string, { routeName: string; distributorName: string; orderCount: number }>()
    HISTORIAL_REVISIONES_DATA.forEach((o) => {
      const existing = map.get(o.routeName)
      if (existing) {
        existing.orderCount += 1
      } else {
        map.set(o.routeName, {
          routeName: o.routeName,
          distributorName: o.distributorName,
          orderCount: 1,
        })
      }
    })
    return Array.from(map.values())
  }, [])

  const filteredRoutesList = useMemo(() => {
    if (!routeSearchQuery.trim()) return routesList
    const q = routeSearchQuery.toLowerCase()
    return routesList.filter(
      (r) =>
        r.routeName.toLowerCase().includes(q) ||
        r.distributorName.toLowerCase().includes(q)
    )
  }, [routesList, routeSearchQuery])

  const selectedRouteObj = useMemo(() => {
    return routesList.find((r) => r.routeName === selectedRoute)
  }, [routesList, selectedRoute])

  // Texto amigable para el botón del calendario
  const dateRangeLabel = useMemo(() => {
    if (!dateRange?.from) return 'Rango de fechas'
    if (!dateRange.to || isSameDay(dateRange.from, dateRange.to)) {
      return format(dateRange.from, 'dd/MM/yyyy')
    }
    return `${format(dateRange.from, 'dd/MM/yyyy')} – ${format(dateRange.to, 'dd/MM/yyyy')}`
  }, [dateRange])

  const hasActiveFilters =
    searchTerm.trim() !== '' ||
    selectedTruck !== 'ALL' ||
    selectedDriver !== 'ALL' ||
    selectedSupervisor !== 'ALL' ||
    selectedRoute !== 'ALL' ||
    filterMode !== 'ALL' ||
    dateRange !== undefined

  // Filtrado de Órdenes
  const filteredOrders = useMemo(() => {
    return HISTORIAL_REVISIONES_DATA.filter((ot) => {
      // 1. Búsqueda por texto
      if (searchTerm.trim() !== '') {
        const query = searchTerm.toLowerCase()
        const matchesCode = ot.orderCode.toLowerCase().includes(query)
        const matchesDriver = ot.driver.name.toLowerCase().includes(query)
        const matchesTruck = ot.truck.plate.toLowerCase().includes(query) || ot.truck.code.toLowerCase().includes(query)
        const matchesRoute = ot.routeName.toLowerCase().includes(query)
        const matchesDistributor = ot.distributorName.toLowerCase().includes(query)
        const matchesProduct = ot.items.some((it) => it.description.toLowerCase().includes(query))
        if (!matchesCode && !matchesDriver && !matchesTruck && !matchesRoute && !matchesDistributor && !matchesProduct) {
          return false
        }
      }

      // 2. Filtro de camión
      if (selectedTruck !== 'ALL' && ot.truck.plate !== selectedTruck) {
        return false
      }

      // 3. Filtro de chofer
      if (selectedDriver !== 'ALL' && ot.driver.name !== selectedDriver) {
        return false
      }

      // 4. Filtro de supervisor
      if (selectedSupervisor !== 'ALL') {
        const supName = ot.supervisor?.name || 'Ing. Marco Antonio Vaca'
        if (supName !== selectedSupervisor) return false
      }

      // 5. Filtro de ruta
      if (selectedRoute !== 'ALL' && ot.routeName !== selectedRoute) {
        return false
      }

      // 6. Modo de filtro rápido
      if (filterMode === 'WITH_DISCREPANCIES' && !ot.summary.hasDiscrepancies) {
        return false
      }
      if (filterMode === 'SUPERVISOR_REVIEWED' && !ot.summary.supervisorReviewed) {
        return false
      }
      if (filterMode === 'SEMAPHORE_AUDITED' && !ot.summary.semaphoreAudited) {
        return false
      }
      if (filterMode === 'MATCH_ONLY' && ot.summary.hasDiscrepancies) {
        return false
      }

      // 7. Filtro de fecha
      if (dateRange?.from) {
        const orderDate = new Date(ot.departureDate)
        if (dateRange.to) {
          if (orderDate < dateRange.from || orderDate > dateRange.to) return false
        } else {
          if (orderDate.toDateString() !== dateRange.from.toDateString()) return false
        }
      }

      return true
    })
  }, [searchTerm, selectedTruck, selectedDriver, selectedSupervisor, selectedRoute, filterMode, dateRange])

  // Agrupación automática por fecha para gestión ágil de volumen amplio
  const groupedOrdersByDate = useMemo(() => {
    const map = new Map<string, OrdenRevisionHistorial[]>()
    filteredOrders.forEach((order) => {
      const d = order.dateIso || '2026-08-20'
      if (!map.has(d)) {
        map.set(d, [])
      }
      map.get(d)!.push(order)
    })

    const sortedDates = Array.from(map.keys()).sort((a, b) => b.localeCompare(a))
    return sortedDates.map((dateIso) => {
      const orders = map.get(dateIso)!
      const okCount = orders.filter((o) => o.summary.driverStatus === 'MATCH' && !o.summary.hasDiscrepancies).length
      const diffCount = orders.length - okCount
      return {
        dateIso,
        dateFormatted: orders[0]?.dateFormatted || dateIso,
        orders,
        okCount,
        diffCount,
      }
    })
  }, [filteredOrders])

  // Orden seleccionada actualmente
  const selectedOrder = useMemo(() => {
    const found = filteredOrders.find((o) => o.id === selectedOrderId)
    return found || filteredOrders[0] || null
  }, [filteredOrders, selectedOrderId])

  // Filtrado de productos dentro de la orden seleccionada (con filtro y buscador en vivo)
  const filteredProducts = useMemo(() => {
    if (!selectedOrder) return []
    let list = selectedOrder.items

    if (productFilter === 'COLD_CHAIN') {
      list = list.filter((item) => item.isColdChain)
    } else if (productFilter === 'DISCREPANCIES') {
      list = list.filter((item) => {
        const driverDiff = item.driverCount.varianceQty !== 0
        const supDiff = (item.supervisorReview?.varianceQty ?? 0) !== 0
        const semDiff = (item.semaphoreAudit?.varianceQty ?? 0) !== 0
        const officialDiff = item.officialInventory.varianceQty !== 0
        return driverDiff || supDiff || semDiff || officialDiff
      })
    }

    if (productSearchQuery.trim()) {
      const q = productSearchQuery.toLowerCase()
      list = list.filter((item) => item.description.toLowerCase().includes(q))
    }

    return list
  }, [selectedOrder, productFilter, productSearchQuery])

  // Métricas generales calculadas
  const metrics = useMemo(() => {
    const total = HISTORIAL_REVISIONES_DATA.length
    const withDisc = HISTORIAL_REVISIONES_DATA.filter((o) => o.summary.hasDiscrepancies).length
    const withSup = HISTORIAL_REVISIONES_DATA.filter((o) => o.summary.supervisorReviewed).length
    const withSem = HISTORIAL_REVISIONES_DATA.filter((o) => o.summary.semaphoreAudited).length
    const matchRateAvg = Math.round(
      HISTORIAL_REVISIONES_DATA.reduce((acc, o) => acc + (o.summary.driverStatus === 'MATCH' ? 100 : 0), 0) / total
    )

    return {
      total,
      withDisc,
      withSup,
      withSem,
      matchRateAvg,
    }
  }, [])

  const handleExport = () => {
    if (filteredOrders.length === 0) {
      toast.error('No hay órdenes para exportar')
      return
    }
    exportarHistorialRevisionesAExcel(filteredOrders)
    toast.success(`Se exportaron ${filteredOrders.length} órdenes de revisión a Excel`)
  }

  const resetFilters = () => {
    setSearchTerm('')
    setFilterMode('ALL')
    setSelectedTruck('ALL')
    setSelectedDriver('ALL')
    setSelectedSupervisor('ALL')
    setSelectedRoute('ALL')
    setTruckSearchQuery('')
    setDriverSearchQuery('')
    setSupervisorSearchQuery('')
    setRouteSearchQuery('')
    setTruckTypeFilter('ALL')
    setDateRange(undefined)
    setProductFilter('ALL')
    setProductSearchQuery('')
    toast.info('Filtros restablecidos')
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50/70 dark:bg-slate-950">
      {/* ── HEADER SUPERIOR Y BARRA DE FILTROS ── */}
      <div className="border-b border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400">
              <ClipboardCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  Historial de Revisiones y Conteos
                </h1>
                <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-xs font-semibold text-indigo-700 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-300">
                  Auditoría Multi-Sesión
                </Badge>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Trazabilidad por producto de conteo Chofer (<code className="font-mono text-[11px]">DRIVER_INITIAL</code>), Revisión Supervisor (<code className="font-mono text-[11px]">SUPERVISOR_DISCREPANCY</code>) y Auditoría Semáforo (<code className="font-mono text-[11px]">SUPERVISOR_SEMAPHORE</code>).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={resetFilters}
              className="h-9 gap-1.5 text-xs text-slate-600 hover:text-slate-900 dark:text-slate-400"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Limpiar
            </Button>
            <Button
              onClick={handleExport}
              size="sm"
              className="h-9 gap-1.5 bg-emerald-600 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
            >
              <Download className="h-4 w-4" />
              Exportar Matriz Excel
            </Button>
          </div>
        </div>

        {/* ── BARRA DE FILTROS ESTANDARIZADA (INLINE & FLEX-WRAP) ── */}
        <div className="mt-4 shrink-0 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 shadow-xs dark:border-slate-800 dark:bg-slate-800/40">
          <div className="flex flex-wrap items-center gap-2">
            {/* 1. Búsqueda de texto libre */}
            <div className="relative flex-1 min-w-[200px] max-w-[260px]">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por OT, chofer, placa..."
                className="h-8 pl-8 pr-7 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer"
                  title="Limpiar búsqueda"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* 2. Selector de Rango de Fechas interactivo */}
            <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className={cn(
                      'flex h-8 min-w-[210px] max-w-[270px] items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 shadow-xs hover:bg-slate-50 focus-visible:outline-none cursor-pointer text-left dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
                      dateRange?.from
                        ? 'border-indigo-500/50 text-indigo-600 font-medium dark:text-indigo-400'
                        : 'text-slate-500 dark:text-slate-400'
                    )}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <CalendarIcon size={13} className="shrink-0 text-slate-400" />
                      <span className="truncate">{dateRangeLabel}</span>
                    </div>
                    {dateRange?.from && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation()
                          setDateRange(undefined)
                        }}
                        className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer ml-1"
                        title="Quitar filtro de fecha"
                      >
                        <X size={12} />
                      </span>
                    )}
                  </button>
                }
              />
              <PopoverContent className="w-auto p-3" align="start">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2 dark:border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <CalendarIcon size={14} className="text-indigo-600 dark:text-indigo-400" />
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Seleccionar rango de fechas
                    </span>
                  </div>
                  {dateRange?.from && (
                    <button
                      type="button"
                      onClick={() => setDateRange(undefined)}
                      className="text-[11px] text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                    >
                      Limpiar
                    </button>
                  )}
                </div>

                <Calendar
                  mode="range"
                  defaultMonth={dateRange?.from || new Date(2026, 7)}
                  selected={dateRange}
                  onSelect={(range) => {
                    setDateRange(range)
                  }}
                  numberOfMonths={2}
                  locale={es}
                />

                {/* Footer informativo del rango elegido y botón para cerrar */}
                <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-xs dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <span>
                          <strong>{format(dateRange.from, 'dd/MM/yyyy')}</strong> al <strong>{format(dateRange.to, 'dd/MM/yyyy')}</strong>
                        </span>
                      ) : (
                        <span>Inicio: <strong>{format(dateRange.from, 'dd/MM/yyyy')}</strong> (elija fecha fin)</span>
                      )
                    ) : (
                      <span>Haga clic en el día de inicio y luego en el fin</span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    className="h-7 px-3 text-xs bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
                    onClick={() => setDatePopoverOpen(false)}
                  >
                    Listo
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            {/* 3. Selector de Camión (Combobox Buscable con Metadata) */}
            <Popover open={truckPopoverOpen} onOpenChange={setTruckPopoverOpen}>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className={cn(
                      'flex h-8 min-w-[190px] max-w-[250px] items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 shadow-xs hover:bg-slate-50 focus-visible:outline-none cursor-pointer text-left dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
                      selectedTruck !== 'ALL'
                        ? 'border-indigo-500/50 text-indigo-600 font-medium dark:text-indigo-400'
                        : 'text-slate-500 dark:text-slate-400'
                    )}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <Truck size={13} className="shrink-0 text-slate-400" />
                      <span className="truncate">
                        {selectedTruckObj ? `${selectedTruckObj.plate} (${selectedTruckObj.code})` : 'Todos los camiones'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {selectedTruck !== 'ALL' && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedTruck('ALL')
                          }}
                          className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                          title="Quitar filtro de camión"
                        >
                          <X size={12} />
                        </span>
                      )}
                      <ChevronDown size={12} className="opacity-50" />
                    </div>
                  </button>
                }
              />
              <PopoverContent className="w-80 p-2" align="start">
                {/* Buscador interno */}
                <div className="relative mb-2">
                  <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Buscar placa, código, tipo..."
                    value={truckSearchQuery}
                    onChange={(e) => setTruckSearchQuery(e.target.value)}
                    className="h-8 pl-8 pr-7 text-xs bg-slate-50 dark:bg-slate-950"
                    autoFocus
                  />
                  {truckSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setTruckSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Filtros rápidos / Tabs de tipo de camión */}
                <div className="mb-2 flex gap-1 rounded-md bg-slate-100 p-0.5 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setTruckTypeFilter('ALL')}
                    className={cn(
                      'flex-1 rounded py-1 text-[10px] font-medium transition-all cursor-pointer',
                      truckTypeFilter === 'ALL'
                        ? 'bg-white shadow-xs text-slate-900 dark:bg-slate-700 dark:text-slate-100'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                    )}
                  >
                    Todos ({trucksList.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTruckTypeFilter('COLD')}
                    className={cn(
                      'flex-1 rounded py-1 text-[10px] font-medium transition-all cursor-pointer',
                      truckTypeFilter === 'COLD'
                        ? 'bg-white shadow-xs text-blue-700 dark:bg-slate-700 dark:text-blue-300'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                    )}
                  >
                    ❄️ Frío ({trucksList.filter((t) => t.isRefrigerated).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTruckTypeFilter('DRY')}
                    className={cn(
                      'flex-1 rounded py-1 text-[10px] font-medium transition-all cursor-pointer',
                      truckTypeFilter === 'DRY'
                        ? 'bg-white shadow-xs text-slate-900 dark:bg-slate-700 dark:text-slate-100'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                    )}
                  >
                    📦 Seco ({trucksList.filter((t) => !t.isRefrigerated).length})
                  </button>
                </div>

                {/* Opción Todos los camiones */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTruck('ALL')
                    setTruckPopoverOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer',
                    selectedTruck === 'ALL' && 'bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <Truck size={13} />
                    Todos los camiones
                  </span>
                  {selectedTruck === 'ALL' && <Check size={13} />}
                </button>

                <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                {/* Lista de camiones con scroll */}
                <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                  {filteredTrucksList.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      No se encontraron camiones para "{truckSearchQuery}"
                    </div>
                  ) : (
                    filteredTrucksList.map((t) => {
                      const isSel = selectedTruck === t.plate
                      return (
                        <button
                          key={t.plate}
                          type="button"
                          onClick={() => {
                            setSelectedTruck(t.plate)
                            setTruckPopoverOpen(false)
                          }}
                          className={cn(
                            'flex w-full items-center justify-between rounded-md p-2 text-xs transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer',
                            isSel && 'bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                          )}
                        >
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{t.plate}</span>
                              <Badge variant="outline" className="text-[10px] py-0 px-1 font-mono">
                                {t.code}
                              </Badge>
                              {t.isRefrigerated && (
                                <Badge variant="outline" className="border-blue-200 bg-blue-50 text-[10px] text-blue-700 py-0 px-1 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300">
                                  <Snowflake className="h-2.5 w-2.5 mr-0.5 inline" /> Frío
                                </Badge>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {t.truckType} • {t.orderCount} orden{t.orderCount !== 1 ? 'es' : ''}
                            </div>
                          </div>
                          {isSel && <Check size={14} className="text-indigo-600 dark:text-indigo-400 shrink-0 ml-2" />}
                        </button>
                      )
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* 4. Selector de Chofer (Combobox Buscable con CI y Teléfono) */}
            <Popover open={driverPopoverOpen} onOpenChange={setDriverPopoverOpen}>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className={cn(
                      'flex h-8 min-w-[200px] max-w-[260px] items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 shadow-xs hover:bg-slate-50 focus-visible:outline-none cursor-pointer text-left dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
                      selectedDriver !== 'ALL'
                        ? 'border-indigo-500/50 text-indigo-600 font-medium dark:text-indigo-400'
                        : 'text-slate-500 dark:text-slate-400'
                    )}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <User size={13} className="shrink-0 text-slate-400" />
                      <span className="truncate">
                        {selectedDriverObj ? selectedDriverObj.name : 'Todos los choferes'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {selectedDriver !== 'ALL' && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedDriver('ALL')
                          }}
                          className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                          title="Quitar filtro de chofer"
                        >
                          <X size={12} />
                        </span>
                      )}
                      <ChevronDown size={12} className="opacity-50" />
                    </div>
                  </button>
                }
              />
              <PopoverContent className="w-80 p-2" align="start">
                {/* Buscador interno */}
                <div className="relative mb-2">
                  <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Buscar por nombre, CI o teléfono..."
                    value={driverSearchQuery}
                    onChange={(e) => setDriverSearchQuery(e.target.value)}
                    className="h-8 pl-8 pr-7 text-xs bg-slate-50 dark:bg-slate-950"
                    autoFocus
                  />
                  {driverSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setDriverSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Opción Todos los choferes */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDriver('ALL')
                    setDriverPopoverOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer',
                    selectedDriver === 'ALL' && 'bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <User size={13} />
                    Todos los choferes
                  </span>
                  {selectedDriver === 'ALL' && <Check size={13} />}
                </button>

                <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                {/* Lista de choferes con scroll */}
                <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                  {filteredDriversList.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      No se encontraron choferes para "{driverSearchQuery}"
                    </div>
                  ) : (
                    filteredDriversList.map((d) => {
                      const isSel = selectedDriver === d.name
                      return (
                        <button
                          key={d.name}
                          type="button"
                          onClick={() => {
                            setSelectedDriver(d.name)
                            setDriverPopoverOpen(false)
                          }}
                          className={cn(
                            'flex w-full items-center justify-between rounded-md p-2 text-xs transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer',
                            isSel && 'bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                          )}
                        >
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-slate-100">{d.name}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              CI: {d.document} • Tel: {d.phone} • {d.orderCount} orden{d.orderCount !== 1 ? 'es' : ''}
                            </div>
                          </div>
                          {isSel && <Check size={14} className="text-indigo-600 dark:text-indigo-400 shrink-0 ml-2" />}
                        </button>
                      )
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* 5. Selector de Supervisor (Combobox Buscable) */}
            <Popover open={supervisorPopoverOpen} onOpenChange={setSupervisorPopoverOpen}>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className={cn(
                      'flex h-8 min-w-[190px] max-w-[250px] items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 shadow-xs hover:bg-slate-50 focus-visible:outline-none cursor-pointer text-left dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
                      selectedSupervisor !== 'ALL'
                        ? 'border-indigo-500/50 text-indigo-600 font-medium dark:text-indigo-400'
                        : 'text-slate-500 dark:text-slate-400'
                    )}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <ShieldCheck size={13} className="shrink-0 text-slate-400" />
                      <span className="truncate">
                        {selectedSupervisorObj ? selectedSupervisorObj.name : 'Todos los supervisores'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {selectedSupervisor !== 'ALL' && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedSupervisor('ALL')
                          }}
                          className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                          title="Quitar filtro de supervisor"
                        >
                          <X size={12} />
                        </span>
                      )}
                      <ChevronDown size={12} className="opacity-50" />
                    </div>
                  </button>
                }
              />
              <PopoverContent className="w-72 p-2" align="start">
                <div className="relative mb-2">
                  <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Buscar supervisor..."
                    value={supervisorSearchQuery}
                    onChange={(e) => setSupervisorSearchQuery(e.target.value)}
                    className="h-8 pl-8 pr-7 text-xs bg-slate-50 dark:bg-slate-950"
                    autoFocus
                  />
                  {supervisorSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setSupervisorSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedSupervisor('ALL')
                    setSupervisorPopoverOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer',
                    selectedSupervisor === 'ALL' && 'bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck size={13} />
                    Todos los supervisores
                  </span>
                  {selectedSupervisor === 'ALL' && <Check size={13} />}
                </button>

                <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                  {filteredSupervisorsList.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      No se encontraron supervisores para "{supervisorSearchQuery}"
                    </div>
                  ) : (
                    filteredSupervisorsList.map((s) => {
                      const isSel = selectedSupervisor === s.name
                      return (
                        <button
                          key={s.name}
                          type="button"
                          onClick={() => {
                            setSelectedSupervisor(s.name)
                            setSupervisorPopoverOpen(false)
                          }}
                          className={cn(
                            'flex w-full items-center justify-between rounded-md p-2 text-xs transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer',
                            isSel && 'bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                          )}
                        >
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-slate-100">{s.name}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {s.orderCount} orden{s.orderCount !== 1 ? 'es' : ''} auditadas
                            </div>
                          </div>
                          {isSel && <Check size={14} className="text-indigo-600 dark:text-indigo-400 shrink-0 ml-2" />}
                        </button>
                      )
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* 6. Selector de Ruta / Distribuidora (Combobox Buscable) */}
            <Popover open={routePopoverOpen} onOpenChange={setRoutePopoverOpen}>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className={cn(
                      'flex h-8 min-w-[190px] max-w-[250px] items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 shadow-xs hover:bg-slate-50 focus-visible:outline-none cursor-pointer text-left dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
                      selectedRoute !== 'ALL'
                        ? 'border-indigo-500/50 text-indigo-600 font-medium dark:text-indigo-400'
                        : 'text-slate-500 dark:text-slate-400'
                    )}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <Route size={13} className="shrink-0 text-slate-400" />
                      <span className="truncate">
                        {selectedRouteObj ? selectedRouteObj.routeName : 'Todas las rutas'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {selectedRoute !== 'ALL' && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedRoute('ALL')
                          }}
                          className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                          title="Quitar filtro de ruta"
                        >
                          <X size={12} />
                        </span>
                      )}
                      <ChevronDown size={12} className="opacity-50" />
                    </div>
                  </button>
                }
              />
              <PopoverContent className="w-80 p-2" align="start">
                <div className="relative mb-2">
                  <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Buscar ruta o distribuidora..."
                    value={routeSearchQuery}
                    onChange={(e) => setRouteSearchQuery(e.target.value)}
                    className="h-8 pl-8 pr-7 text-xs bg-slate-50 dark:bg-slate-950"
                    autoFocus
                  />
                  {routeSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setRouteSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedRoute('ALL')
                    setRoutePopoverOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer',
                    selectedRoute === 'ALL' && 'bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <Route size={13} />
                    Todas las rutas
                  </span>
                  {selectedRoute === 'ALL' && <Check size={13} />}
                </button>

                <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                  {filteredRoutesList.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      No se encontraron rutas para "{routeSearchQuery}"
                    </div>
                  ) : (
                    filteredRoutesList.map((r) => {
                      const isSel = selectedRoute === r.routeName
                      return (
                        <button
                          key={r.routeName}
                          type="button"
                          onClick={() => {
                            setSelectedRoute(r.routeName)
                            setRoutePopoverOpen(false)
                          }}
                          className={cn(
                            'flex w-full items-center justify-between rounded-md p-2 text-xs transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer',
                            isSel && 'bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                          )}
                        >
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-slate-100">{r.routeName}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {r.distributorName} • {r.orderCount} orden{r.orderCount !== 1 ? 'es' : ''}
                            </div>
                          </div>
                          {isSel && <Check size={14} className="text-indigo-600 dark:text-indigo-400 shrink-0 ml-2" />}
                        </button>
                      )
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* 7. Selector de Estado de Auditoría (Ancho cómodo para ver el texto completo) */}
            <Select
              value={filterMode}
              onValueChange={(v) => {
                if (v) setFilterMode(v as FilterMode)
              }}
            >
              <SelectTrigger size="sm" className="h-8 min-w-[220px] max-w-[290px] text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700" aria-label="Estado Auditoría">
                <div className="flex items-center gap-1.5 truncate">
                  <Filter size={13} className="shrink-0 text-slate-400" />
                  <SelectValue placeholder="Todas las auditorías" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas las auditorías</SelectItem>
                <SelectItem value="WITH_DISCREPANCIES">⚠️ Con descuadre chofer</SelectItem>
                <SelectItem value="SUPERVISOR_REVIEWED">🛡️ Con revisión supervisor</SelectItem>
                <SelectItem value="SEMAPHORE_AUDITED">🚦 Auditadas por semáforo</SelectItem>
                <SelectItem value="MATCH_ONLY">✅ Conformes sin diferencias</SelectItem>
              </SelectContent>
            </Select>

            {/* 6. Botón de Limpiar filtros condicional */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="h-8 gap-1.5 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 cursor-pointer shrink-0"
                title="Limpiar todos los filtros"
              >
                <RotateCcw size={12} />
                Limpiar filtros
              </Button>
            )}
          </div>
        </div>

        {/* Tarjetas resumen de KPIs */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-2.5 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Total Órdenes</div>
              <div className="text-base font-bold text-slate-900 dark:text-slate-100">{metrics.total}</div>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-2.5 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Efectividad Chofer</div>
              <div className="text-base font-bold text-emerald-700 dark:text-emerald-400">{metrics.matchRateAvg}% Conforme</div>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-2.5 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Revisión Supervisor</div>
              <div className="text-base font-bold text-slate-900 dark:text-slate-100">
                {metrics.withSup} <span className="text-[11px] font-normal text-slate-500">({metrics.withDisc} con dif.)</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-2.5 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
              <TrafficCone className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Auditoría Semáforo</div>
              <div className="text-base font-bold text-purple-700 dark:text-purple-400">
                {metrics.withSem} <span className="text-[11px] font-normal text-slate-500">OTs auditadas</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── CUERPO PRINCIPAL (MAESTRO - DETALLE) ── */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-12">
        {/* PANEL IZQUIERDO: LISTADO DE ÓRDENES CON AGRUPADOR POR FECHA Y DENSIDAD (4 de 12 columnas) */}
        <div className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900 lg:col-span-4 overflow-hidden">
          {/* Cabecera del Panel Izquierdo con Selector de Densidad */}
          <div className="flex items-center justify-between border-b border-slate-100 p-2.5 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Órdenes ({filteredOrders.length})
              </span>
              <span className="text-[10px] text-slate-400 font-normal">
                • {groupedOrdersByDate.length} {groupedOrdersByDate.length === 1 ? 'fecha' : 'fechas'}
              </span>
            </div>

            {/* Toggle de Densidad */}
            <div className="flex items-center rounded-lg bg-slate-200/70 p-0.5 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setViewDensity('CARDS')}
                title="Vista de Tarjetas Detalladas"
                className={cn(
                  'flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold transition-all cursor-pointer',
                  viewDensity === 'CARDS'
                    ? 'bg-white shadow-xs text-indigo-600 dark:bg-slate-900 dark:text-indigo-400'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                )}
              >
                <LayoutGrid size={11} />
                <span>Tarjetas</span>
              </button>
              <button
                type="button"
                onClick={() => setViewDensity('COMPACT')}
                title="Modo Compacto de Alta Densidad (34px)"
                className={cn(
                  'flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold transition-all cursor-pointer',
                  viewDensity === 'COMPACT'
                    ? 'bg-white shadow-xs text-indigo-600 dark:bg-slate-900 dark:text-indigo-400'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                )}
              >
                <List size={11} />
                <span>Compacto</span>
              </button>
            </div>
          </div>

          {/* Lista de Grupos por Fecha (Acordeón) */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
            {filteredOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400">
                <FileClock className="mb-2 h-8 w-8 text-slate-300" />
                <p className="text-xs font-medium">No se encontraron órdenes con los filtros aplicados.</p>
              </div>
            ) : (
              groupedOrdersByDate.map((group) => {
                const isExpanded = expandedDates[group.dateIso] !== false

                return (
                  <div key={group.dateIso} className="group/date">
                    {/* Barra de Cabecera de Fecha (Acordeón) */}
                    <button
                      type="button"
                      onClick={() => toggleDateGroup(group.dateIso)}
                      className="w-full flex items-center justify-between px-3 py-1.5 bg-slate-100/70 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer border-y border-slate-200/50 dark:border-slate-700/50"
                    >
                      <div className="flex items-center gap-1.5">
                        <ChevronDown
                          size={13}
                          className={cn(
                            'text-slate-500 transition-transform duration-200',
                            !isExpanded && '-rotate-90'
                          )}
                        />
                        <CalendarIcon size={12} className="text-indigo-600 dark:text-indigo-400" />
                        <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                          {group.dateFormatted}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          ({group.orders.length} OTs)
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                          {group.okCount} OK
                        </span>
                        {group.diffCount > 0 && (
                          <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                            {group.diffCount} Dif
                          </span>
                        )}
                      </div>
                    </button>

                    {/* Contenido del Grupo: Tarjetas o Modo Compacto */}
                    {isExpanded && (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {group.orders.map((ot) => {
                          const isSelected = selectedOrder?.id === ot.id

                          if (viewDensity === 'COMPACT') {
                            return (
                              <div
                                key={ot.id}
                                onClick={() => setSelectedOrderId(ot.id)}
                                className={cn(
                                  'flex items-center justify-between px-3 py-2 text-xs transition-colors cursor-pointer hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30',
                                  isSelected
                                    ? 'bg-indigo-50/80 border-l-4 border-indigo-600 font-medium dark:bg-indigo-950/50 dark:border-indigo-400'
                                    : 'border-l-4 border-transparent'
                                )}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
                                    {ot.orderCode}
                                  </span>
                                  <span className="text-[11px] font-mono text-slate-500">
                                    {ot.truck.plate}
                                  </span>
                                  <span className="text-[11px] text-slate-600 dark:text-slate-300 truncate max-w-[110px]">
                                    {ot.driver.name}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  {/* Puntos de sesión */}
                                  <span
                                    title={ot.summary.driverStatus === 'MATCH' ? 'Chofer: Conforme' : 'Chofer: Descuadre'}
                                    className={cn(
                                      'h-2 w-2 rounded-full',
                                      ot.summary.driverStatus === 'MATCH' ? 'bg-emerald-500' : 'bg-amber-500'
                                    )}
                                  />
                                  <span
                                    title={ot.summary.supervisorReviewed ? `Supervisor: ${ot.summary.supervisorReviewScope}` : 'Supervisor: No requirió'}
                                    className={cn(
                                      'h-2 w-2 rounded-full',
                                      ot.summary.supervisorReviewed ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-700'
                                    )}
                                  />
                                  <span
                                    title={ot.summary.semaphoreAudited ? 'Semáforo: Auditado' : 'Semáforo: No seleccionado'}
                                    className={cn(
                                      'h-2 w-2 rounded-full',
                                      ot.summary.semaphoreAudited ? 'bg-purple-500' : 'bg-slate-200 dark:bg-slate-800'
                                    )}
                                  />

                                  {/* Badge de diferencia */}
                                  <span
                                    className={cn(
                                      'font-mono text-[10px] px-1.5 py-0.5 rounded font-bold ml-1',
                                      ot.summary.totalNetVarianceUnits < 0
                                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                                        : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                    )}
                                  >
                                    {ot.summary.totalNetVarianceUnits === 0 ? '0u' : `${ot.summary.totalNetVarianceUnits}u`}
                                  </span>
                                </div>
                              </div>
                            )
                          }

                          // MODO TARJETAS DETALLADAS
                          return (
                            <div
                              key={ot.id}
                              onClick={() => setSelectedOrderId(ot.id)}
                              className={cn(
                                'group cursor-pointer p-3 transition-all hover:bg-slate-50 dark:hover:bg-slate-800/60',
                                isSelected
                                  ? 'border-l-4 border-indigo-600 bg-indigo-50/40 dark:border-indigo-500 dark:bg-indigo-950/20'
                                  : 'border-l-4 border-transparent'
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
                                      {ot.orderCode}
                                    </span>
                                    <span className="text-[10px] text-slate-400">{ot.routeName.split(' - ')[0]}</span>
                                  </div>
                                  <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                                    <User className="h-3 w-3 text-slate-400" />
                                    <span className="truncate font-medium">{ot.driver.name}</span>
                                  </div>
                                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                                    <span className="flex items-center gap-1">
                                      <Truck className="h-3 w-3 text-slate-400" />
                                      {ot.truck.plate}
                                    </span>
                                    <span>•</span>
                                    <span>{ot.summary.totalProducts} Productos</span>
                                  </div>
                                </div>

                                <ChevronRight
                                  className={cn(
                                    'h-4 w-4 transition-transform text-slate-400 group-hover:translate-x-0.5',
                                    isSelected && 'text-indigo-600 dark:text-indigo-400'
                                  )}
                                />
                              </div>

                              {/* Badges de las 3 Sesiones */}
                              <div className="mt-2 flex flex-wrap items-center gap-1">
                                {ot.summary.driverStatus === 'MATCH' ? (
                                  <span className="inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                                    <CheckCircle2 className="h-2.5 w-2.5" /> Chofer OK
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                                    <AlertCircle className="h-2.5 w-2.5" /> Chofer Dif
                                  </span>
                                )}

                                {ot.summary.supervisorReviewScope === 'FULL' ? (
                                  <span className="inline-flex items-center gap-0.5 rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                                    <ShieldCheck className="h-2.5 w-2.5" /> Sup. Total
                                  </span>
                                ) : ot.summary.supervisorReviewScope === 'PARTIAL' ? (
                                  <span className="inline-flex items-center gap-0.5 rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                                    <ShieldCheck className="h-2.5 w-2.5" /> Sup. Parcial
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                    Sup. No Req.
                                  </span>
                                )}

                                {ot.summary.semaphoreAudited && (
                                  <span className="inline-flex items-center gap-0.5 rounded bg-purple-50 px-1.5 py-0.5 text-[9px] font-medium text-purple-700 dark:bg-purple-950/50 dark:text-purple-300">
                                    <TrafficCone className="h-2.5 w-2.5" /> Semáforo
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* PANEL DERECHO: DETALLE DE AUDITORÍA CON TABS Y MATRIZ FULL-HEIGHT (8 de 12 columnas) */}
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 lg:col-span-8 overflow-hidden">
          {selectedOrder ? (
            <>
              {/* 1. BARRA SUPERIOR COMPACTA DE LA ORDEN SELECCIONADA */}
              <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                        {selectedOrder.orderCode}
                      </span>
                      <Badge variant="outline" className="text-xs font-semibold">
                        {selectedOrder.routeName}
                      </Badge>
                      {selectedOrder.truck.isRefrigerated && (
                        <Badge variant="outline" className="border-blue-200 bg-blue-50 text-[10px] text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300">
                          <Snowflake className="mr-1 h-3 w-3 inline" /> Refrigerado
                        </Badge>
                      )}
                      <span className="text-[11px] text-slate-400">• {selectedOrder.distributorName}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                      <span className="flex items-center gap-1">
                        <User size={12} className="text-slate-400" />
                        <strong>{selectedOrder.driver.name}</strong>
                      </span>
                      <span className="flex items-center gap-1">
                        <Truck size={12} className="text-slate-400" />
                        <strong>{selectedOrder.truck.plate} ({selectedOrder.truck.code})</strong>
                      </span>
                      <span className="flex items-center gap-1">
                        <ShieldCheck size={12} className="text-slate-400" />
                        Sup: <strong>{selectedOrder.supervisor?.name || 'No asignado'}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        exportarOrdenRevisionIndividualAExcel(selectedOrder)
                        toast.success(`Acta de ${selectedOrder.orderCode} descargada en Libro Excel (.xls)`)
                      }}
                      className="h-8 text-xs gap-1.5 cursor-pointer bg-white text-slate-700 hover:bg-slate-50 border-slate-200 shadow-xs dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                      title="Exportar conciliación de esta orden a CSV/Excel"
                    >
                      <FileSpreadsheet size={13} className="text-emerald-600 dark:text-emerald-400" />
                      <span>Exportar Excel OT</span>
                    </Button>

                    <div className="rounded-lg bg-slate-50 px-3 py-1 text-right dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                      <div className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Diferencia Neta</div>
                      <div className={cn('font-mono text-xs font-bold', selectedOrder.summary.totalNetVarianceUnits < 0 ? 'text-rose-600' : 'text-emerald-600')}>
                        {selectedOrder.summary.totalNetVarianceUnits === 0
                          ? '0 Uds (Conforme)'
                          : `${selectedOrder.summary.totalNetVarianceUnits} Uds`}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. BARRA DE TABS DE NAVEGACIÓN */}
              <div className="shrink-0 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-1">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveDetailTab('SESSIONS')}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer',
                      activeDetailTab === 'SESSIONS'
                        ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                        : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                    )}
                  >
                    <Clock size={14} />
                    <span>Línea de Tiempo de Sesiones</span>
                    <Badge variant="secondary" className="text-[10px] py-0 px-1.5 ml-0.5">
                      {selectedOrder.sessions.length}
                    </Badge>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveDetailTab('MATRIX')}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer',
                      activeDetailTab === 'MATRIX'
                        ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                        : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                    )}
                  >
                    <FileSpreadsheet size={14} />
                    <span>Matriz Comparativa de Productos</span>
                    <Badge variant="secondary" className="text-[10px] py-0 px-1.5 ml-0.5">
                      {selectedOrder.items.length}
                    </Badge>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveDetailTab('SETTLEMENT')}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer',
                      activeDetailTab === 'SETTLEMENT'
                        ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                        : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                    )}
                  >
                    <FileCheck2 size={14} />
                    <span>Liquidación y Acta Digital</span>
                  </button>
                </div>
              </div>

              {/* 3. CONTENIDO SEGÚN TAB ACTIVO */}
              {activeDetailTab === 'MATRIX' && (
                <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
                  <div className="mb-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between shrink-0">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                        Matriz Comparativa de Conteos por Producto
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Cruce directo de cantidades: Esperado Inicial vs Conteo Chofer vs Supervisor vs Semáforo vs Carga Final.
                      </p>
                    </div>

                    {/* Buscador y Filtros dentro de la tabla (en una sola fila horizontal limpia) */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Micro-buscador de producto en tiempo real */}
                      <div className="relative w-44 sm:w-56">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <Input
                          placeholder="Buscar producto..."
                          value={productSearchQuery}
                          onChange={(e) => setProductSearchQuery(e.target.value)}
                          className="h-7 pl-8 pr-7 text-xs bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700"
                        />
                        {productSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setProductSearchQuery('')}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                            title="Limpiar búsqueda"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>

                      {/* Selector de tipo */}
                      <Button
                        variant={productFilter === 'ALL' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setProductFilter('ALL')}
                        className="h-7 text-[11px] cursor-pointer"
                      >
                        Todos ({selectedOrder.items.length})
                      </Button>
                      <Button
                        variant={productFilter === 'DISCREPANCIES' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setProductFilter('DISCREPANCIES')}
                        className="h-7 text-[11px] cursor-pointer"
                      >
                        Solo Diferencias
                      </Button>
                      <Button
                        variant={productFilter === 'COLD_CHAIN' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setProductFilter('COLD_CHAIN')}
                        className="h-7 text-[11px] cursor-pointer"
                      >
                        <Snowflake className="mr-1 h-3 w-3" /> Frío
                      </Button>
                    </div>
                  </div>

                  {/* TABLA COMPARATIVA CON SCROLL */}
                  <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead className="sticky top-0 z-10 bg-slate-100 shadow-xs dark:bg-slate-800">
                        <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-700 dark:border-slate-800 dark:text-slate-300">
                          <th className="p-2.5">Producto</th>
                          <th className="p-2.5 text-center">Factor</th>
                          <th className="border-l border-slate-200 p-2.5 text-right dark:border-slate-700">Esperado Inicial</th>
                          <th className="border-l border-slate-200 p-2.5 text-right dark:border-slate-700">1. Conteo Chofer</th>
                          <th className="border-l border-slate-200 p-2.5 text-right dark:border-slate-700">2. Revisión Sup.</th>
                          <th className="border-l border-slate-200 p-2.5 text-right dark:border-slate-700">3. Semáforo</th>
                          <th className="border-l border-slate-200 p-2.5 text-right dark:border-slate-700">Carga Final Oficial</th>
                          <th className="p-2.5 text-center">Estado Oficial</th>
                          <th className="p-2.5 text-center">Detalle</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredProducts.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="p-6 text-center text-slate-400">
                              No hay productos que coincidan con el filtro seleccionado.
                            </td>
                          </tr>
                        ) : (
                          filteredProducts.map((item) => {
                            const driverVariance = item.driverCount.varianceQty
                            const supVariance = item.supervisorReview?.varianceQty ?? 0
                            const semVariance = item.semaphoreAudit?.varianceQty ?? 0
                            const officialVariance = item.officialInventory.varianceQty
                            const hasDiscrepancy = driverVariance !== 0 || supVariance !== 0 || officialVariance !== 0

                            return (
                              <tr
                                key={item.productId}
                                onClick={() => setSelectedProductForDrawer(item)}
                                className={cn(
                                  'cursor-pointer transition-all hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20',
                                  hasDiscrepancy && 'bg-amber-50/20 dark:bg-amber-950/10'
                                )}
                                title="Haga clic para abrir el cronograma y trazabilidad completa de este producto"
                              >
                                {/* Producto (Solo nombre) */}
                                <td className="p-2.5">
                                  <div className="flex items-center gap-2">
                                    {item.isColdChain ? (
                                      <span title="Cadena de Frío">
                                        <Snowflake className="h-4 w-4 text-blue-500 shrink-0" />
                                      </span>
                                    ) : (
                                      <div className="h-4 w-4 shrink-0" />
                                    )}
                                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                                      {item.description}
                                    </div>
                                  </div>
                                </td>

                                {/* Factor */}
                                <td className="p-2.5 text-center text-slate-500 font-mono text-[11px]">
                                  {item.equivalenceBoxUnit} {item.unitName}/cj
                                </td>

                                {/* Cantidad Esperada */}
                                <td className="border-l border-slate-100 p-2.5 text-right font-mono font-medium text-slate-700 dark:border-slate-800 dark:text-slate-300">
                                  {item.expectedQty} {item.unitName}
                                  <span className="block text-[10px] text-slate-400">
                                    ({item.expectedBoxes} cj)
                                  </span>
                                </td>

                                {/* 1. Conteo Chofer */}
                                <td className="border-l border-slate-100 p-2.5 text-right dark:border-slate-800">
                                  <div className="font-mono font-medium text-slate-900 dark:text-slate-100">
                                    {item.driverCount.countedQty} {item.unitName}
                                  </div>
                                  <div className="flex items-center justify-end gap-1 text-[10px]">
                                    <span className="text-slate-400">
                                      ({item.driverCount.countedBoxes} cj + {item.driverCount.countedUnits} u)
                                    </span>
                                    {driverVariance !== 0 ? (
                                      <span className="font-bold text-rose-600">
                                        {driverVariance > 0 ? `+${driverVariance}` : driverVariance}
                                      </span>
                                    ) : (
                                      <span className="text-emerald-600">OK</span>
                                    )}
                                  </div>
                                  {item.driverCount.observation && (
                                    <span className="block text-[10px] italic text-amber-600 dark:text-amber-400 truncate max-w-[140px] ml-auto">
                                      "{item.driverCount.observation}"
                                    </span>
                                  )}
                                </td>

                                {/* 2. Revisión Supervisor */}
                                <td className="border-l border-slate-100 p-2.5 text-right dark:border-slate-800">
                                  {item.supervisorReview?.wasReviewed ? (
                                    <>
                                      <div className="font-mono font-medium text-slate-900 dark:text-slate-100">
                                        {item.supervisorReview.countedQty} {item.unitName}
                                      </div>
                                      <div className="flex items-center justify-end gap-1 text-[10px]">
                                        <span className="text-slate-400">
                                          ({item.supervisorReview.countedBoxes} cj + {item.supervisorReview.countedUnits} u)
                                        </span>
                                        {supVariance !== 0 ? (
                                          <span className="font-bold text-rose-600">
                                            {supVariance > 0 ? `+${supVariance}` : supVariance}
                                          </span>
                                        ) : (
                                          <span className="text-emerald-600">Aprobado</span>
                                        )}
                                      </div>
                                      {item.supervisorReview.observation && (
                                        <span className="block text-[10px] italic text-blue-600 dark:text-blue-400 truncate max-w-[140px] ml-auto">
                                          "{item.supervisorReview.observation}"
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-[11px] text-slate-400 italic">No requerida</span>
                                  )}
                                </td>

                                {/* 3. Auditoría Semáforo */}
                                <td className="border-l border-slate-100 p-2.5 text-right dark:border-slate-800">
                                  {item.semaphoreAudit?.wasAudited ? (
                                    <>
                                      <div className="font-mono font-medium text-slate-900 dark:text-slate-100">
                                        {item.semaphoreAudit.countedQty} {item.unitName}
                                      </div>
                                      <div className="flex items-center justify-end gap-1 text-[10px]">
                                        <span className="text-slate-400">
                                          ({item.semaphoreAudit.countedBoxes} cj + {item.semaphoreAudit.countedUnits} u)
                                        </span>
                                        {semVariance !== 0 ? (
                                          <span className="font-bold text-purple-600">
                                            {semVariance > 0 ? `+${semVariance}` : semVariance}
                                          </span>
                                        ) : (
                                          <span className="text-purple-600">Auditado OK</span>
                                        )}
                                      </div>
                                    </>
                                  ) : (
                                    <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400 dark:bg-slate-800">
                                      SKIPPED (Omitido)
                                    </span>
                                  )}
                                </td>

                                {/* Carga Final Oficial Camión */}
                                <td className="border-l border-slate-100 p-2.5 text-right dark:border-slate-800">
                                  <div className="font-mono font-bold text-slate-900 dark:text-slate-100">
                                    {item.officialInventory.loadedQty} {item.unitName}
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    {officialVariance !== 0 ? (
                                      <span className="font-semibold text-rose-600">
                                        Dif: {officialVariance > 0 ? `+${officialVariance}` : officialVariance}
                                      </span>
                                    ) : (
                                      <span className="text-emerald-600">Sin diferencias</span>
                                    )}
                                  </div>
                                </td>

                                {/* Estado Oficial */}
                                <td className="p-2.5 text-center">
                                  {item.officialInventory.status === 'MATCH' ? (
                                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[10px] font-semibold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
                                      MATCH
                                    </Badge>
                                  ) : item.officialInventory.status === 'APPROVED' ? (
                                    <Badge variant="outline" className="border-blue-200 bg-blue-50 text-[10px] font-semibold text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300">
                                      APPROVED
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="border-rose-200 bg-rose-50 text-[10px] font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                                      {item.officialInventory.status}
                                    </Badge>
                                  )}
                                </td>

                                {/* Botón de Trazabilidad */}
                                <td className="p-2.5 text-center">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setSelectedProductForDrawer(item)
                                    }}
                                    className="h-7 w-7 p-0 text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40 cursor-pointer"
                                    title="Ver cronograma y trazabilidad completa"
                                  >
                                    <Eye size={14} />
                                  </Button>
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 1: LÍNEA DE TIEMPO DE SESIONES (STEPPER CRONOLÓGICO CONECTADO DE 4 HITOS) */}
              {activeDetailTab === 'SESSIONS' && (() => {
                const driverSession = selectedOrder.sessions.find((s) => s.sessionType === 'DRIVER_INITIAL')
                const supSession = selectedOrder.sessions.find((s) => s.sessionType === 'SUPERVISOR_DISCREPANCY')
                const semSession = selectedOrder.sessions.find((s) => s.sessionType === 'SUPERVISOR_SEMAPHORE')

                const isSupRequired = supSession && supSession.status !== 'NOT_REQUIRED'
                const isSemAudited = semSession && semSession.status === 'COMPLETED'
                const totalLoadedQty = selectedOrder.items.reduce((acc, it) => acc + it.officialInventory.loadedQty, 0)
                const totalExpectedQty = selectedOrder.items.reduce((acc, it) => acc + it.expectedQty, 0)

                // Cálculo de tiempos
                const driverDuration = driverSession?.durationMinutes || 18
                const supDuration = isSupRequired ? (supSession?.durationMinutes || 12) : 0
                const semDuration = isSemAudited ? (semSession?.durationMinutes || 7) : 0
                const totalRampTimeMinutes = driverDuration + supDuration + semDuration

                const startTime = driverSession?.startedAt ? driverSession.startedAt.split('T')[1]?.slice(0, 5) : '05:30'
                const endTime = semSession?.completedAt
                  ? semSession.completedAt.split('T')[1]?.slice(0, 5)
                  : supSession?.completedAt
                    ? supSession.completedAt.split('T')[1]?.slice(0, 5)
                    : driverSession?.completedAt?.split('T')[1]?.slice(0, 5) || '06:15'

                return (
                  <div className="flex-1 overflow-y-auto space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                    {/* 1. BARRA SUPERIOR DE LEAD TIME Y RESUMEN DE PROCESO */}
                    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 via-indigo-50/30 to-slate-50 p-3.5 dark:border-slate-800 dark:from-slate-950 dark:via-indigo-950/20 dark:to-slate-950 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs dark:bg-indigo-500">
                          <Clock className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                              Lead Time de Rampa: <span className="font-mono text-indigo-600 dark:text-indigo-400">{totalRampTimeMinutes} min</span>
                            </h3>
                            <Badge variant="outline" className="text-[10px] font-semibold border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
                              ✓ En Tiempo Estándar (&lt; 60 min)
                            </Badge>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            Ciclo iniciado a las <strong className="font-mono text-slate-700 dark:text-slate-300">{startTime} hrs</strong> • Finalizado a las <strong className="font-mono text-slate-700 dark:text-slate-300">{endTime} hrs</strong>
                          </p>
                        </div>
                      </div>

                      {/* Acciones directas hacia otras pestañas */}
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setActiveDetailTab('MATRIX')}
                          className="h-8 gap-1.5 text-xs text-indigo-600 border-indigo-200 hover:bg-indigo-50 dark:border-indigo-900/50 dark:text-indigo-400 dark:hover:bg-indigo-950/30 cursor-pointer"
                        >
                          <FileSpreadsheet size={13} />
                          Ver Matriz de Productos ({selectedOrder.items.length})
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setActiveDetailTab('SETTLEMENT')}
                          className="h-8 gap-1.5 text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <FileCheck2 size={13} />
                          Ver Acta y Firmas
                        </Button>
                      </div>
                    </div>

                    {/* 2. STEPPER CRONOLÓGICO INTERCONECTADO DE 4 HITOS */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          Flujo Secuencial de Auditoría y Despacho
                        </span>
                        <span className="text-[11px] text-slate-400">
                          4 Hitos de Conciliación
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4 relative">
                        {/* ── HITO 1: CONTEO INICIAL CHOFER ── */}
                        <div
                          onClick={() => driverSession && setSessionDetailModal(driverSession)}
                          className={cn(
                            'group relative flex flex-col justify-between rounded-xl border p-4 transition-all cursor-pointer shadow-xs hover:shadow-md',
                            selectedOrder.summary.driverStatus === 'MATCH'
                              ? 'border-emerald-200 bg-emerald-50/20 hover:bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-950/10'
                              : 'border-amber-200 bg-amber-50/30 hover:bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20'
                          )}
                        >
                          <div>
                            {/* Cabecera del Hito */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white',
                                  selectedOrder.summary.driverStatus === 'MATCH' ? 'bg-emerald-600' : 'bg-amber-600'
                                )}>
                                  1
                                </span>
                                <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
                                  Conteo Chofer
                                </span>
                              </div>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px] font-semibold',
                                  selectedOrder.summary.driverStatus === 'MATCH'
                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300'
                                    : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300'
                                )}
                              >
                                {selectedOrder.summary.driverStatus === 'MATCH' ? '✓ 100% MATCH' : '⚠️ DESCUADRE'}
                              </Badge>
                            </div>

                            {/* Horario y Duración */}
                            <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                              <Clock size={11} className="text-slate-400" />
                              <span>{driverSession ? `${driverSession.startedAt.split('T')[1]?.slice(0, 5)} - ${driverSession.completedAt?.split('T')[1]?.slice(0, 5)}` : '05:30 - 05:48'}</span>
                              <span className="font-sans font-semibold text-slate-700 dark:text-slate-300">({driverDuration} min)</span>
                            </div>

                            {/* Ejecutante */}
                            <div className="mt-2 text-xs">
                              <span className="text-[10px] text-slate-400 block">Ejecutado por:</span>
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {selectedOrder.driver.name}
                              </span>
                              <span className="block text-[10px] text-slate-400 font-mono">
                                CI: {selectedOrder.driver.document}
                              </span>
                            </div>

                            {/* Resumen */}
                            <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                              {selectedOrder.summary.driverStatus === 'MATCH' ? (
                                <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                                  ✓ Todos los {selectedOrder.items.length} productos coincidieron con la orden de carga.
                                </p>
                              ) : (
                                <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">
                                  ⚠️ Reportó diferencias físicas ({selectedOrder.summary.totalDiscrepancyProducts} {selectedOrder.summary.totalDiscrepancyProducts === 1 ? 'producto' : 'productos'}).
                                </p>
                              )}
                              {driverSession?.notes && (
                                <p className="mt-1 text-[10px] italic text-slate-500 line-clamp-2">
                                  "{driverSession.notes}"
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between border-t border-slate-200/60 pt-2 text-[11px] text-slate-500 dark:border-slate-700/60">
                            <span className="font-mono text-[10px]">DRIVER_INITIAL</span>
                            <span className="flex items-center gap-1 font-semibold text-indigo-600 group-hover:underline dark:text-indigo-400">
                              <Eye size={12} /> Ver Sesión
                            </span>
                          </div>
                        </div>

                        {/* ── HITO 2: REVISIÓN DE SUPERVISOR ── */}
                        <div
                          onClick={() => supSession && isSupRequired && setSessionDetailModal(supSession)}
                          className={cn(
                            'group relative flex flex-col justify-between rounded-xl border p-4 transition-all shadow-xs',
                            isSupRequired
                              ? 'cursor-pointer border-blue-200 bg-blue-50/20 hover:bg-blue-50/40 hover:shadow-md dark:border-blue-900/50 dark:bg-blue-950/10'
                              : 'border-slate-200 bg-slate-50/50 opacity-75 dark:border-slate-800 dark:bg-slate-950/40 cursor-default'
                          )}
                        >
                          <div>
                            {/* Cabecera del Hito */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white',
                                  isSupRequired ? 'bg-blue-600' : 'bg-slate-400 dark:bg-slate-600'
                                )}>
                                  2
                                </span>
                                <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
                                  Revisión Sup.
                                </span>
                              </div>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px] font-semibold',
                                  isSupRequired
                                    ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300'
                                    : 'border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                                )}
                              >
                                {isSupRequired
                                  ? selectedOrder.summary.supervisorReviewScope === 'FULL'
                                    ? '🛡️ CONTEO TOTAL'
                                    : '🛡️ FOCALIZADO'
                                  : '⚪ NO REQUERIDA'}
                              </Badge>
                            </div>

                            {/* Horario y Duración */}
                            <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                              <Clock size={11} className="text-slate-400" />
                              {isSupRequired ? (
                                <>
                                  <span>{supSession ? `${supSession.startedAt.split('T')[1]?.slice(0, 5)} - ${supSession.completedAt?.split('T')[1]?.slice(0, 5)}` : '05:50 - 06:02'}</span>
                                  <span className="font-sans font-semibold text-slate-700 dark:text-slate-300">({supDuration} min)</span>
                                </>
                              ) : (
                                <span className="italic text-slate-400">Omitida (0 min)</span>
                              )}
                            </div>

                            {/* Responsable */}
                            <div className="mt-2 text-xs">
                              <span className="text-[10px] text-slate-400 block">Supervisor responsable:</span>
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {selectedOrder.supervisor?.name || 'Ing. Marco Antonio Vaca'}
                              </span>
                              <span className="block text-[10px] text-slate-400">
                                Rampa Central • Patio de Carga
                              </span>
                            </div>

                            {/* Resumen */}
                            <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                              {isSupRequired ? (
                                <p className="text-[11px] text-blue-700 dark:text-blue-300">
                                  🛡️ {supSession?.notes || 'Verificó diferencias reportadas y autorizó ajuste oficial de carga.'}
                                </p>
                              ) : (
                                <p className="text-[11px] text-slate-500 italic">
                                  No requirió intervención debido a que el chofer dio 100% de coincidencia inicial.
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between border-t border-slate-200/60 pt-2 text-[11px] text-slate-500 dark:border-slate-700/60">
                            <span className="font-mono text-[10px]">SUPERVISOR_DISC</span>
                            {isSupRequired ? (
                              <span className="flex items-center gap-1 font-semibold text-indigo-600 group-hover:underline dark:text-indigo-400">
                                <Eye size={12} /> Ver Sesión
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[10px]">Sin cambios</span>
                            )}
                          </div>
                        </div>

                        {/* ── HITO 3: AUDITORÍA SEMÁFORO PATIO ── */}
                        <div
                          onClick={() => semSession && isSemAudited && setSessionDetailModal(semSession)}
                          className={cn(
                            'group relative flex flex-col justify-between rounded-xl border p-4 transition-all shadow-xs',
                            isSemAudited
                              ? 'cursor-pointer border-purple-200 bg-purple-50/20 hover:bg-purple-50/40 hover:shadow-md dark:border-purple-900/50 dark:bg-purple-950/10'
                              : 'border-slate-200 bg-slate-50/50 opacity-70 dark:border-slate-800 dark:bg-slate-950/40 cursor-default'
                          )}
                        >
                          <div>
                            {/* Cabecera del Hito */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white',
                                  isSemAudited ? 'bg-purple-600' : 'bg-slate-400 dark:bg-slate-600'
                                )}>
                                  3
                                </span>
                                <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
                                  Semáforo Patio
                                </span>
                              </div>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px] font-semibold',
                                  isSemAudited
                                    ? 'border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-900/50 dark:bg-purple-950/40 dark:text-purple-300'
                                    : 'border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                                )}
                              >
                                {isSemAudited ? '🚦 AUDITADO OK' : '⚪ SKIPPED'}
                              </Badge>
                            </div>

                            {/* Horario y Duración */}
                            <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                              <Clock size={11} className="text-slate-400" />
                              {isSemAudited ? (
                                <>
                                  <span>{semSession ? `${semSession.startedAt.split('T')[1]?.slice(0, 5)} - ${semSession.completedAt?.split('T')[1]?.slice(0, 5)}` : '06:05 - 06:12'}</span>
                                  <span className="font-sans font-semibold text-slate-700 dark:text-slate-300">({semDuration} min)</span>
                                </>
                              ) : (
                                <span className="italic text-slate-400">No seleccionado</span>
                              )}
                            </div>

                            {/* Responsable */}
                            <div className="mt-2 text-xs">
                              <span className="text-[10px] text-slate-400 block">Tipo de Control:</span>
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {isSemAudited ? 'Auditoría Ciega de Calidad' : 'Muestreo Aleatorio General'}
                              </span>
                              <span className="block text-[10px] text-slate-400">
                                Control Sorpresa en Patio
                              </span>
                            </div>

                            {/* Resumen */}
                            <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                              {isSemAudited ? (
                                <p className="text-[11px] text-purple-700 dark:text-purple-300">
                                  🚦 Muestra aleatoria de {semSession?.totalItems || 3} productos auditados a ciegas. 100% de coincidencia física.
                                </p>
                              ) : (
                                <p className="text-[11px] text-slate-500 italic">
                                  Este camión no fue seleccionado en la muestra aleatoria de patio del día.
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between border-t border-slate-200/60 pt-2 text-[11px] text-slate-500 dark:border-slate-700/60">
                            <span className="font-mono text-[10px]">SEMAPHORE_AUDIT</span>
                            {isSemAudited ? (
                              <span className="flex items-center gap-1 font-semibold text-indigo-600 group-hover:underline dark:text-indigo-400">
                                <Eye size={12} /> Ver Sesión
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[10px]">Omitido</span>
                            )}
                          </div>
                        </div>

                        {/* ── HITO 4: CONSOLIDACIÓN Y CIERRE OFICIAL ── */}
                        <div
                          onClick={() => setActiveDetailTab('SETTLEMENT')}
                          className="group relative flex flex-col justify-between rounded-xl border border-emerald-300 bg-gradient-to-b from-emerald-50/50 to-emerald-50/20 p-4 transition-all cursor-pointer shadow-xs hover:shadow-md dark:border-emerald-800 dark:from-emerald-950/30 dark:to-emerald-950/10"
                        >
                          <div>
                            {/* Cabecera del Hito */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-700 text-xs font-bold text-white dark:bg-emerald-600">
                                  4
                                </span>
                                <span className="font-mono text-xs font-bold text-emerald-900 dark:text-emerald-300">
                                  Carga Oficial
                                </span>
                              </div>
                              <Badge
                                variant="outline"
                                className="text-[10px] font-semibold border-emerald-400 bg-emerald-100/70 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
                              >
                                ✓ SELLADO
                              </Badge>
                            </div>

                            {/* Horario y Estado */}
                            <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-400 font-mono">
                              <CheckCircle2 size={11} className="text-emerald-600" />
                              <span>{endTime} hrs (Cierre Rampa)</span>
                            </div>

                            {/* Total Consolidado */}
                            <div className="mt-2 text-xs">
                              <span className="text-[10px] text-slate-500 block">Inventario Oficial en Camión:</span>
                              <span className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                                {totalLoadedQty} unidades
                              </span>
                              <span className="block text-[10px] text-slate-500">
                                {selectedOrder.truck.plate} • {selectedOrder.truck.truckType}
                              </span>
                            </div>

                            {/* Resumen */}
                            <div className="mt-2 text-xs">
                              <p className="text-[11px] text-emerald-800 dark:text-emerald-300 font-medium">
                                ✓ Acta digital firmada por el chofer y visada por supervisor. Camión despachado a ruta.
                              </p>
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between border-t border-emerald-200/80 pt-2 text-[11px] dark:border-emerald-800/80">
                            <span className="font-mono text-[10px] text-emerald-700 dark:text-emerald-400">truck_inventories</span>
                            <span className="flex items-center gap-1 font-semibold text-emerald-800 group-hover:underline dark:text-emerald-300">
                              <FileCheck2 size={12} /> Ver Acta ➔
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 3. RESUMEN DEL BALANCE DE CARGA Y GOBERNANZA */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs dark:border-slate-800 dark:bg-slate-950/40">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">Balance de Unidades</span>
                        <div className="mt-1 flex items-baseline gap-2">
                          <span className="font-mono text-base font-bold text-slate-800 dark:text-slate-200">{totalExpectedQty} uds</span>
                          <span className="text-slate-400 text-[11px]">esperadas ➔</span>
                          <span className="font-mono text-base font-bold text-emerald-700 dark:text-emerald-400">{totalLoadedQty} uds</span>
                          <span className="text-slate-400 text-[11px]">cargadas</span>
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs dark:border-slate-800 dark:bg-slate-950/40">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">Impacto en Bodega</span>
                        <div className="mt-1">
                          <span className={cn(
                            'font-mono text-base font-bold',
                            selectedOrder.summary.totalNetVarianceUnits < 0 ? 'text-rose-600' : 'text-emerald-600'
                          )}>
                            {selectedOrder.summary.totalNetVarianceUnits === 0 ? '0 uds (Sin diferencias)' : `${selectedOrder.summary.totalNetVarianceUnits} uds (Merma autorizada)`}
                          </span>
                          <span className="text-[10px] text-slate-400 block">Aprobado por {selectedOrder.supervisor?.name || 'Supervisor'}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 rounded-lg bg-purple-50/60 p-3 text-xs text-purple-900 dark:bg-purple-950/30 dark:text-purple-300 border border-purple-100 dark:border-purple-900/40">
                        <Info className="h-4 w-4 shrink-0 text-purple-600 dark:text-purple-400" />
                        <p className="text-[10px] leading-relaxed">
                          <strong>Regla Semáforo:</strong> La sesión <code className="font-mono font-bold text-[10px]">SUPERVISOR_SEMAPHORE</code> es un muestreo ciego de auditoría que no altera el inventario oficial ni bloquea el despacho.
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* TAB 3: LIQUIDACIÓN Y ACTA DIGITAL (TARJETAS DE FIRMA Y VISADO) */}
              {activeDetailTab === 'SETTLEMENT' && (
                <div className="flex-1 overflow-y-auto space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                  {/* Cabecera del Acta con Botones de Acción */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <FileCheck2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                          Acta Oficial de Liquidación y Despacho
                        </h3>
                        <Badge variant="outline" className="text-[10px] font-semibold border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
                          ✓ Cierre Conforme
                        </Badge>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Constancia legal de cierre de carga para liquidación de inventario y despacho de rampa.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          exportarOrdenRevisionIndividualAExcel(selectedOrder)
                          toast.success(`Acta de ${selectedOrder.orderCode} descargada en Libro Excel (.xls)`)
                        }}
                        className="h-8 text-xs gap-1.5 cursor-pointer"
                        title="Descargar matriz en formato CSV/Excel"
                      >
                        <FileSpreadsheet size={13} className="text-emerald-600 dark:text-emerald-400" />
                        Exportar Excel
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          toast.info('Generando vista de impresión para PDF...')
                          setTimeout(() => window.print(), 300)
                        }}
                        className="h-8 text-xs gap-1.5 cursor-pointer"
                        title="Descargar o guardar como PDF"
                      >
                        <Download size={13} />
                        Descargar PDF
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          toast.info('Abriendo diálogo de impresión...')
                          window.print()
                        }}
                        className="h-8 text-xs gap-1.5 cursor-pointer"
                        title="Imprimir acta en rampa"
                      >
                        <Printer size={13} />
                        Imprimir
                      </Button>
                    </div>
                  </div>

                  {/* 1. Tarjetas de Balance de Carga */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                      <span className="text-[11px] text-slate-500 block">Total Unidades Planificadas</span>
                      <span className="font-mono text-base font-bold text-slate-900 dark:text-slate-100">
                        {selectedOrder.items.reduce((acc, it) => acc + it.expectedQty, 0)} uds
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">Según pedidos ERP congelados</span>
                    </div>

                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                      <span className="text-[11px] text-emerald-700 dark:text-emerald-300 block">Total Físico en Camión</span>
                      <span className="font-mono text-base font-bold text-emerald-800 dark:text-emerald-200">
                        {selectedOrder.items.reduce((acc, it) => acc + it.officialInventory.loadedQty, 0)} uds
                      </span>
                      <span className="text-[10px] text-emerald-600/80 block mt-0.5">Camión {selectedOrder.truck.plate} ({selectedOrder.truck.code})</span>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                      <span className="text-[11px] text-slate-500 block">Diferencia Neta Autorizada</span>
                      <span className={cn(
                        'font-mono text-base font-bold',
                        selectedOrder.summary.totalNetVarianceUnits < 0 ? 'text-rose-600' : 'text-emerald-600'
                      )}>
                        {selectedOrder.summary.totalNetVarianceUnits === 0 ? '0 uds (Sin faltante)' : `${selectedOrder.summary.totalNetVarianceUnits} uds (Merma)`}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">Impacto consolidado en bodega</span>
                    </div>
                  </div>

                  {/* 2. TARJETAS DE FIRMA DIGITAL Y SELLOS DE AUDITORÍA */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-3">
                      Certificación y Firmas Digitales de Auditoría
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      
                      {/* TARJETA 1: FIRMA DIGITAL CHOFER */}
                      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-950/60 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2 mb-3">
                            <div className="flex items-center gap-1.5">
                              <PenTool size={13} className="text-emerald-600 dark:text-emerald-400" />
                              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                Firma Digital Chofer
                              </span>
                            </div>
                            <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-[10px] text-emerald-700 font-semibold dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
                              ✓ DECLARADO
                            </Badge>
                          </div>

                          {/* Canvas Simulado de Trazo Caligráfico */}
                          <div className="relative rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/80 h-24 flex items-center justify-center overflow-hidden mb-3">
                            <span className="absolute top-1 left-2 text-[9px] text-slate-400 uppercase font-mono tracking-wider">
                              Trazo Caligráfico Digital
                            </span>
                            <svg className="w-44 h-16 text-slate-800 dark:text-slate-200 opacity-90" viewBox="0 0 200 60">
                              <path
                                d="M 15 38 Q 45 12, 70 35 T 120 22 Q 155 52, 175 25 T 195 38 M 35 48 C 65 42, 115 50, 165 44"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            <span className="absolute bottom-1 right-2 text-[9px] text-emerald-600 dark:text-emerald-400 font-mono">
                              Biometría Verificada ✓
                            </span>
                          </div>

                          {/* Metadatos del Chofer */}
                          <div className="space-y-1 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Firmante:</span>
                              <strong className="text-slate-800 dark:text-slate-200">{selectedOrder.driver.name}</strong>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Documento:</span>
                              <span className="font-mono text-slate-600 dark:text-slate-400">{selectedOrder.driver.document}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Hora de Firma:</span>
                              <span className="font-mono text-slate-600 dark:text-slate-400">05:48:12 hrs</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Dispositivo:</span>
                              <span className="text-slate-600 dark:text-slate-400 truncate max-w-[130px]" title="Galaxy Tab Active3 • App v2.4">Tab Active3 (GPS)</span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[9px] text-slate-400">
                          <span>Dispositivo: App Chofer v2.4</span>
                          <span className="text-emerald-600 font-semibold font-mono">Firma Válida ✓</span>
                        </div>
                      </div>

                      {/* TARJETA 2: VISADO Y SELLO OFICIAL SUPERVISOR */}
                      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-950/60 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2 mb-3">
                            <div className="flex items-center gap-1.5">
                              <ShieldCheck size={13} className="text-blue-600 dark:text-blue-400" />
                              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                Sello Oficial Supervisor
                              </span>
                            </div>
                            <Badge variant="outline" className="border-blue-300 bg-blue-50 text-[10px] text-blue-700 font-semibold dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300">
                              🛡️ APROBADO
                            </Badge>
                          </div>

                          {/* Sello Simulado Circular de Rampa */}
                          <div className="relative rounded-lg border border-dashed border-blue-200 bg-blue-50/40 p-3 dark:border-blue-900/40 dark:bg-blue-950/30 h-24 flex items-center justify-center overflow-hidden mb-3">
                            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 border-2 border-blue-600/70 dark:border-blue-400/70 rounded-md px-3 py-1.5 font-bold uppercase tracking-wider text-center rotate-[-3deg]">
                              <ShieldCheck size={18} className="shrink-0 text-blue-600" />
                              <div>
                                <div className="text-[11px] leading-tight">RAMPA AUTORIZADA</div>
                                <div className="text-[8px] font-mono text-blue-600 dark:text-blue-400 font-normal">ESTACIÓN CENTRAL SCZ</div>
                              </div>
                            </div>
                          </div>

                          {/* Metadatos del Supervisor */}
                          <div className="space-y-1 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Supervisor:</span>
                              <strong className="text-slate-800 dark:text-slate-200">{selectedOrder.supervisor?.name || 'Ing. Marco Antonio Vaca'}</strong>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Credencial:</span>
                              <span className="font-mono text-slate-600 dark:text-slate-400">SUP-LOG-SCZ-04</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Dictamen:</span>
                              <span className="text-blue-700 dark:text-blue-300 font-medium">Merma autorizada</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Hora de Visado:</span>
                              <span className="font-mono text-slate-600 dark:text-slate-400">06:18:45 hrs</span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[9px] text-slate-400 font-mono">
                          <span>Token: AUTH-SCZ-9842</span>
                          <span className="text-blue-600 font-semibold">Certificado ✓</span>
                        </div>
                      </div>

                      {/* TARJETA 3: AUDITORÍA SEMÁFORO (SI APLICA) */}
                      <div className={cn(
                        "rounded-xl border p-4 shadow-xs flex flex-col justify-between",
                        selectedOrder.summary.semaphoreAudited
                          ? "border-purple-200 bg-white dark:border-purple-900/50 dark:bg-slate-950/60"
                          : "border-slate-200 bg-slate-50/50 opacity-70 dark:border-slate-800 dark:bg-slate-900/40"
                      )}>
                        <div>
                          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2 mb-3">
                            <div className="flex items-center gap-1.5">
                              <TrafficCone size={13} className={selectedOrder.summary.semaphoreAudited ? "text-purple-600 dark:text-purple-400" : "text-slate-400"} />
                              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                Auditoría Semáforo
                              </span>
                            </div>
                            <Badge variant="outline" className={cn(
                              "text-[10px] font-semibold",
                              selectedOrder.summary.semaphoreAudited
                                ? "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-900/50 dark:bg-purple-950/40 dark:text-purple-300"
                                : "border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800"
                            )}>
                              {selectedOrder.summary.semaphoreAudited ? "🚦 AUDITADO" : "NO SELECCIONADA"}
                            </Badge>
                          </div>

                          {/* Sello de Control Ciego */}
                          <div className="relative rounded-lg border border-dashed border-purple-200 bg-purple-50/30 p-3 dark:border-purple-900/30 dark:bg-purple-950/20 h-24 flex items-center justify-center overflow-hidden mb-3">
                            {selectedOrder.summary.semaphoreAudited ? (
                              <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 border-2 border-purple-600/70 dark:border-purple-400/70 rounded-md px-3 py-1.5 font-bold uppercase tracking-wider text-center rotate-[2deg]">
                                <TrafficCone size={18} className="shrink-0 text-purple-600" />
                                <div>
                                  <div className="text-[11px] leading-tight">CONTROL CIEGO OK</div>
                                  <div className="text-[8px] font-mono text-purple-600 dark:text-purple-400 font-normal">AUDITORÍA SORPRESA</div>
                                </div>
                              </div>
                            ) : (
                              <p className="text-[11px] text-slate-400 text-center italic">
                                Esta OT no entró en la muestra aleatoria del semáforo.
                              </p>
                            )}
                          </div>

                          {/* Metadatos de Semáforo */}
                          <div className="space-y-1 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Auditor Patio:</span>
                              <strong className="text-slate-800 dark:text-slate-200">{selectedOrder.summary.semaphoreAudited ? 'Ing. Roberto Méndez' : '—'}</strong>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Resultado:</span>
                              <span className="text-purple-700 dark:text-purple-300 font-medium">
                                {selectedOrder.summary.semaphoreAudited ? '100% Coincidencia' : 'N/A'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Regla Dominio:</span>
                              <span className="text-slate-600 dark:text-slate-400 text-[11px]">No altera inventario</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Hora Muestreo:</span>
                              <span className="font-mono text-slate-600 dark:text-slate-400">{selectedOrder.summary.semaphoreAudited ? '06:24:10 hrs' : '—'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[9px] text-slate-400 font-mono">
                          <span>Token: {selectedOrder.summary.semaphoreAudited ? 'SEMAPHORE-PASS-4412' : 'N/A'}</span>
                          <span className="text-purple-600 font-semibold">{selectedOrder.summary.semaphoreAudited ? 'Auditado ✓' : '—'}</span>
                        </div>
                      </div>

                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-sm">Selecciona una orden de transporte de la lista para ver su historial de revisiones.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL DE DETALLE DE SESIÓN INDIVIDUAL ── */}
      {sessionDetailModal && (
        <Dialog open={!!sessionDetailModal} onOpenChange={() => setSessionDetailModal(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-bold">
                <ClipboardCheck className="h-5 w-5 text-indigo-600" />
                {sessionDetailModal.sessionTypeLabel}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Sesión ID #{sessionDetailModal.id} • Rol Ejecutor: <code className="font-mono font-semibold">{sessionDetailModal.executorRole}</code>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-400">Responsable:</span>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">{sessionDetailModal.executorName}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Estado de Sesión:</span>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">{sessionDetailModal.statusLabel}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Hora Inicio:</span>
                    <p className="font-mono text-slate-700 dark:text-slate-300">{sessionDetailModal.startedAt.replace('T', ' ')}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Hora Cierre:</span>
                    <p className="font-mono text-slate-700 dark:text-slate-300">{sessionDetailModal.completedAt ? sessionDetailModal.completedAt.replace('T', ' ') : 'N/A'}</p>
                  </div>
                </div>
              </div>

              {sessionDetailModal.notes && (
                <div>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Observaciones Generales:</span>
                  <p className="mt-1 rounded-md border border-slate-200 bg-white p-2 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    {sessionDetailModal.notes}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md border border-slate-200 p-2 dark:border-slate-700">
                  <div className="text-[10px] text-slate-400">Total Productos</div>
                  <div className="text-sm font-bold">{sessionDetailModal.totalItems}</div>
                </div>
                <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-2 dark:border-emerald-800/50 dark:bg-emerald-950/20">
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400">Conformes</div>
                  <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{sessionDetailModal.matchItems}</div>
                </div>
                <div className="rounded-md border border-rose-200 bg-rose-50/50 p-2 dark:border-rose-800/50 dark:bg-rose-950/20">
                  <div className="text-[10px] text-rose-600 dark:text-rose-400">Con Descuadre</div>
                  <div className="text-sm font-bold text-rose-700 dark:text-rose-300">{sessionDetailModal.mismatchItems}</div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── DRAWER DE TRAZABILIDAD Y EVIDENCIAS POR PRODUCTO ── */}
      <Sheet
        open={!!selectedProductForDrawer}
        onOpenChange={(open) => {
          if (!open) setSelectedProductForDrawer(null)
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl overflow-y-auto p-0 flex flex-col gap-0 border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        >
          {selectedProductForDrawer && selectedOrder && (
            <>
              {/* Cabecera del Drawer */}
              <div className="border-b border-slate-200 p-4 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950/50">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[11px] font-normal">
                      {selectedProductForDrawer.category}
                    </Badge>
                    {selectedProductForDrawer.isColdChain && (
                      <Badge variant="outline" className="border-blue-200 bg-blue-50 text-[11px] text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300">
                        <Snowflake className="h-3 w-3 mr-1 inline" /> Cadena de Frío
                      </Badge>
                    )}
                  </div>
                </div>

                <SheetTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {selectedProductForDrawer.description}
                </SheetTitle>

                <SheetDescription className="sr-only">
                  Trazabilidad de conteos multi-sesión del producto {selectedProductForDrawer.description}
                </SheetDescription>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span>OT: <strong className="text-slate-700 dark:text-slate-200">{selectedOrder.orderCode}</strong></span>
                  <span>Factor: <strong className="text-slate-700 dark:text-slate-200">{selectedProductForDrawer.equivalenceBoxUnit} {selectedProductForDrawer.unitName}/caja</strong></span>
                  <span>Fecha: <strong className="text-slate-700 dark:text-slate-200">{selectedOrder.dateFormatted}</strong></span>
                </div>
              </div>

              {/* Contenido del Drawer con scroll */}
              <div className="flex-1 p-4 space-y-5 overflow-y-auto">
                {/* 1. Flujo Resumen Horizontal */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Flujo Resumen de Conciliación
                  </h3>
                  <div className="grid grid-cols-4 gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2 text-center text-xs dark:border-slate-800 dark:bg-slate-950/40">
                    <div className="rounded bg-white p-2 shadow-xs dark:bg-slate-900">
                      <span className="text-[10px] text-slate-400 block font-medium">1. Esperado</span>
                      <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                        {selectedProductForDrawer.expectedQty} u
                      </span>
                    </div>
                    <div className="rounded bg-white p-2 shadow-xs dark:bg-slate-900">
                      <span className="text-[10px] text-slate-400 block font-medium">2. Chofer</span>
                      <span className={cn(
                        "font-mono text-xs font-bold",
                        selectedProductForDrawer.driverCount.varianceQty !== 0 ? "text-rose-600" : "text-emerald-600"
                      )}>
                        {selectedProductForDrawer.driverCount.countedQty} u
                      </span>
                    </div>
                    <div className="rounded bg-white p-2 shadow-xs dark:bg-slate-900">
                      <span className="text-[10px] text-slate-400 block font-medium">3. Supervisor</span>
                      <span className="font-mono text-xs font-bold text-blue-600">
                        {selectedProductForDrawer.supervisorReview?.wasReviewed ? `${selectedProductForDrawer.supervisorReview.countedQty} u` : '—'}
                      </span>
                    </div>
                    <div className="rounded bg-white p-2 shadow-xs dark:bg-slate-900">
                      <span className="text-[10px] text-slate-400 block font-medium">4. Final Camión</span>
                      <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
                        {selectedProductForDrawer.officialInventory.loadedQty} u
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. Timeline Cronológico Detallado Paso a Paso */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                    Cronograma de Auditoría y Trazabilidad por Sesión
                  </h3>

                  <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
                    
                    {/* PASO 1: Foto Base Oficial ERP */}
                    <div className="relative">
                      <div className="absolute -left-6 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        <Layers size={11} />
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                            Foto Base Inicial (Carga Planificada)
                          </span>
                          <span className="text-[11px] font-mono text-slate-400">05:30 hrs</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                          Cantidad solicitada según pedidos y órdenes de despacho congeladas en sistema.
                        </p>
                        <div className="mt-2 inline-flex items-center gap-2 rounded bg-slate-100 px-2 py-1 text-xs font-mono font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                          {selectedProductForDrawer.expectedQty} {selectedProductForDrawer.unitName} ({selectedProductForDrawer.expectedBoxes} cajas de {selectedProductForDrawer.equivalenceBoxUnit} u)
                        </div>
                      </div>
                    </div>

                    {/* PASO 2: Conteo Chofer */}
                    <div className="relative">
                      <div className={cn(
                        "absolute -left-6 top-0 flex h-5 w-5 items-center justify-center rounded-full text-white",
                        selectedProductForDrawer.driverCount.varianceQty !== 0 ? "bg-amber-500" : "bg-emerald-500"
                      )}>
                        <User size={11} />
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                              1. Conteo Inicial Chofer (<code className="font-mono text-[10px]">DRIVER_INITIAL</code>)
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-slate-400">05:42 hrs</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                          <span>Chofer: <strong className="text-slate-800 dark:text-slate-200">{selectedOrder.driver.name}</strong></span>
                          <span>Doc: {selectedOrder.driver.document}</span>
                        </div>

                        <div className="mt-2 flex items-center justify-between rounded bg-slate-50 p-2 text-xs dark:bg-slate-800/60">
                          <div>
                            <span className="text-[10px] text-slate-400 block">Conteo Físico:</span>
                            <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                              {selectedProductForDrawer.driverCount.countedQty} {selectedProductForDrawer.unitName}
                            </span>
                            <span className="text-[10px] text-slate-500 ml-1">
                              ({selectedProductForDrawer.driverCount.countedBoxes} cj + {selectedProductForDrawer.driverCount.countedUnits} u)
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Diferencia:</span>
                            {selectedProductForDrawer.driverCount.varianceQty !== 0 ? (
                              <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-700 font-bold dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                                {selectedProductForDrawer.driverCount.varianceQty > 0 ? `+${selectedProductForDrawer.driverCount.varianceQty}` : selectedProductForDrawer.driverCount.varianceQty} {selectedProductForDrawer.unitName} (Faltante)
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 font-bold dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
                                0 Dif (Conforme)
                              </Badge>
                            )}
                          </div>
                        </div>

                        {selectedProductForDrawer.driverCount.observation && (
                          <div className="mt-2 rounded border border-amber-200 bg-amber-50/70 p-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                            <span className="font-semibold block text-[10px] uppercase text-amber-700 dark:text-amber-400">Observación Chofer:</span>
                            "{selectedProductForDrawer.driverCount.observation}"
                          </div>
                        )}
                      </div>
                    </div>

                    {/* PASO 3: Revisión Supervisor */}
                    <div className="relative">
                      <div className={cn(
                        "absolute -left-6 top-0 flex h-5 w-5 items-center justify-center rounded-full text-white",
                        selectedProductForDrawer.supervisorReview?.wasReviewed ? "bg-blue-600" : "bg-slate-400"
                      )}>
                        <ShieldCheck size={11} />
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                            2. Revisión Supervisor (<code className="font-mono text-[10px]">SUPERVISOR_DISCREPANCY</code>)
                          </span>
                          <span className="text-[11px] font-mono text-slate-400">06:12 hrs</span>
                        </div>

                        {selectedProductForDrawer.supervisorReview?.wasReviewed ? (
                          <>
                            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                              <span>Supervisor: <strong className="text-slate-800 dark:text-slate-200">{selectedOrder.supervisor?.name || 'Ing. Marco Antonio Vaca'}</strong></span>
                              <span>Modalidad: <strong className="text-blue-600">{selectedOrder.summary.supervisorReviewScope === 'FULL' ? 'Total' : 'Parcial'}</strong></span>
                            </div>

                            <div className="mt-2 flex items-center justify-between rounded bg-blue-50/50 p-2 text-xs dark:bg-blue-950/30">
                              <div>
                                <span className="text-[10px] text-slate-400 block">Conteo Validado:</span>
                                <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                                  {selectedProductForDrawer.supervisorReview.countedQty} {selectedProductForDrawer.unitName}
                                </span>
                                <span className="text-[10px] text-slate-500 ml-1">
                                  ({selectedProductForDrawer.supervisorReview.countedBoxes} cj + {selectedProductForDrawer.supervisorReview.countedUnits} u)
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-400 block">Resolución:</span>
                                <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700 font-bold dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300">
                                  MERMA APROBADA
                                </Badge>
                              </div>
                            </div>

                            {selectedProductForDrawer.supervisorReview.observation && (
                              <div className="mt-2 rounded border border-blue-200 bg-blue-50/70 p-2 text-xs text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
                                <span className="font-semibold block text-[10px] uppercase text-blue-700 dark:text-blue-400">Dictamen Supervisor:</span>
                                "{selectedProductForDrawer.supervisorReview.observation}"
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="mt-1 text-xs text-slate-500 italic">
                            No requirió revisión de supervisor debido a que el conteo del chofer fue 100% conforme.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* PASO 4: Auditoría Semáforo */}
                    <div className="relative">
                      <div className={cn(
                        "absolute -left-6 top-0 flex h-5 w-5 items-center justify-center rounded-full text-white",
                        selectedProductForDrawer.semaphoreAudit?.wasAudited ? "bg-purple-600" : "bg-slate-300"
                      )}>
                        <TrafficCone size={11} />
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                            3. Auditoría Semáforo (<code className="font-mono text-[10px]">SUPERVISOR_SEMAPHORE</code>)
                          </span>
                          <span className="text-[11px] font-mono text-slate-400">06:24 hrs</span>
                        </div>

                        {selectedProductForDrawer.semaphoreAudit?.wasAudited ? (
                          <>
                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                              Muestreo ciego de calidad en patio. Conteo verificado: <strong className="font-mono">{selectedProductForDrawer.semaphoreAudit.countedQty} {selectedProductForDrawer.unitName}</strong>.
                            </p>
                            <div className="mt-2 flex items-center justify-between rounded bg-purple-50/50 p-2 text-xs dark:bg-purple-950/30">
                              <span className="text-purple-700 dark:text-purple-300 font-semibold">
                                ✓ Coincidencia con inventario consolidado
                              </span>
                              <Badge variant="outline" className="border-purple-300 bg-purple-50 text-purple-700 text-[10px]">
                                CONTROL CIEGO OK
                              </Badge>
                            </div>
                          </>
                        ) : (
                          <p className="mt-1 text-xs text-slate-400 italic">
                            Este producto no fue seleccionado en la muestra aleatoria del semáforo (<code className="font-mono text-[10px]">SKIPPED</code>).
                          </p>
                        )}
                      </div>
                    </div>

                    {/* PASO 5: Consolidación Oficial en Camión */}
                    <div className="relative">
                      <div className="absolute -left-6 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white">
                        <CheckCircle size={11} />
                      </div>
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 shadow-xs dark:border-emerald-900/50 dark:bg-emerald-950/20">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300">
                            Estado Final Oficial (<code className="font-mono text-[10px]">truck_inventories</code>)
                          </span>
                          <Badge className="bg-emerald-600 text-white text-[10px]">
                            {selectedProductForDrawer.officialInventory.status}
                          </Badge>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-[10px] text-slate-500 block">Carga Final Autorizada:</span>
                            <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                              {selectedProductForDrawer.officialInventory.loadedQty} {selectedProductForDrawer.unitName}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block">Supervisor que Validó:</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {selectedProductForDrawer.officialInventory.verifiedSupervisorName || selectedOrder.supervisor?.name || 'Ing. Marco Antonio Vaca'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>

              </div>

              {/* Footer de Acciones del Drawer */}
              <div className="border-t border-slate-200 p-4 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const text = `RESUMEN DE AUDITORÍA: ${selectedProductForDrawer.description}\nOT: ${selectedOrder.orderCode}\nEsperado: ${selectedProductForDrawer.expectedQty} u\nConteo Chofer: ${selectedProductForDrawer.driverCount.countedQty} u (Dif: ${selectedProductForDrawer.driverCount.varianceQty})\nRevisión Sup: ${selectedProductForDrawer.supervisorReview?.countedQty ?? 'N/A'} u\nFinal Oficial: ${selectedProductForDrawer.officialInventory.loadedQty} u (${selectedProductForDrawer.officialInventory.status})`
                    navigator.clipboard.writeText(text)
                    toast.success('Resumen copiado al portapapeles')
                  }}
                  className="gap-1.5 text-xs cursor-pointer"
                >
                  <Copy size={13} />
                  Copiar Ficha
                </Button>
                <Button
                  size="sm"
                  onClick={() => setSelectedProductForDrawer(null)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-4 cursor-pointer"
                >
                  Cerrar
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
