import React, { useState, useMemo, useEffect } from 'react'
import {
  format,
  parseISO,
  isSameDay,
  isBefore,
  isAfter,
  startOfDay,
  endOfDay,
} from 'date-fns'
import { es } from 'date-fns/locale'
import type { DateRange } from 'react-day-picker'
import {
  Search,
  Truck,
  User,
  Calendar as CalendarIcon,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Filter,
  FileSpreadsheet,
  Banknote,
  Package,
  ArrowRight,
  Hash,
  X,
  Check,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  FileText,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Edit3,
  Eye,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { CierreOrdenTransporte } from '../cierre-logistico-data'

interface OrdenesFinalizadasListViewProps {
  cierres: CierreOrdenTransporte[]
  onSelectCierre?: (cierreId: string) => void
  onRegistrarCierre?: (cierreId: string) => void
  onVerCierre?: (cierreId: string) => void
  onVerCierresConsolidados?: () => void
  onIniciarLiquidacionCobranza?: (cierreId: string) => void
}

type SortField =
  | 'orderCode'
  | 'dateIso'
  | 'driverName'
  | 'truckPlate'
  | 'routeName'
  | 'valorDespacho'
  | 'status'

type SortDirection = 'asc' | 'desc'

export function OrdenesFinalizadasListView({
  cierres,
  onSelectCierre,
  onRegistrarCierre,
  onVerCierre,
  onVerCierresConsolidados,
  onIniciarLiquidacionCobranza,
}: OrdenesFinalizadasListViewProps) {
  // ── ESTADOS DE FILTROS ──
  const [searchTerm, setSearchTerm] = useState('')
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [selectedDriver, setSelectedDriver] = useState<string>('ALL')
  const [selectedTruck, setSelectedTruck] = useState<string>('ALL')
  const [selectedOrderCode, setSelectedOrderCode] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'LIQUIDATED' | 'OBSERVED'>('ALL')

  // ── ESTADOS DE SORTING Y PAGINACIÓN ──
  const [sortField, setSortField] = useState<SortField>('dateIso')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // ── ESTADOS DE POPOVERS ──
  const [datePopoverOpen, setDatePopoverOpen] = useState(false)
  const [driverPopoverOpen, setDriverPopoverOpen] = useState(false)
  const [driverSearchQuery, setDriverSearchQuery] = useState('')
  const [truckPopoverOpen, setTruckPopoverOpen] = useState(false)
  const [truckSearchQuery, setTruckSearchQuery] = useState('')
  const [orderPopoverOpen, setOrderPopoverOpen] = useState(false)
  const [orderSearchQuery, setOrderSearchQuery] = useState('')

  // Reset de página al cambiar filtros
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, dateRange, selectedDriver, selectedTruck, selectedOrderCode, statusFilter, pageSize])

  // Helper para verificar coincidencia con el rango de fechas
  const matchesDateRange = (c: CierreOrdenTransporte, range: DateRange | undefined) => {
    if (!range?.from) return true
    const orderDate = parseISO(c.dateIso)
    if (isBefore(orderDate, startOfDay(range.from))) return false
    if (range.to && isAfter(orderDate, endOfDay(range.to))) return false
    return true
  }

  // ── ETIQUETA DEL RANGO DE FECHAS ──
  const dateRangeLabel = useMemo(() => {
    if (!dateRange?.from) return 'Todas las fechas'
    if (!dateRange.to || isSameDay(dateRange.from, dateRange.to)) {
      return format(dateRange.from, 'dd/MM/yyyy')
    }
    return `${format(dateRange.from, 'dd/MM/yyyy')} - ${format(dateRange.to, 'dd/MM/yyyy')}`
  }, [dateRange])

  // ── LISTAS EN CASCADA PARA SELECTS ──
  const driversList = useMemo(() => {
    const map = new Map<string, { name: string; empresa: string; ci: string }>()
    cierres.forEach((c) => {
      if (!map.has(c.driverName)) {
        map.set(c.driverName, {
          name: c.driverName,
          empresa: c.driverEmpresa,
          ci: c.driverCi,
        })
      }
    })
    return Array.from(map.values())
  }, [cierres])

  const filteredDriversList = useMemo(() => {
    if (!driverSearchQuery.trim()) return driversList
    const q = driverSearchQuery.toLowerCase()
    return driversList.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.empresa.toLowerCase().includes(q) ||
        d.ci.toLowerCase().includes(q)
    )
  }, [driversList, driverSearchQuery])

  const trucksList = useMemo(() => {
    const map = new Map<string, { plate: string; truckType: string; isCold: boolean }>()
    cierres.forEach((c) => {
      if (!map.has(c.truckPlate)) {
        map.set(c.truckPlate, {
          plate: c.truckPlate,
          truckType: c.truckType,
          isCold:
            c.truckType.toLowerCase().includes('frio') ||
            c.truckType.toLowerCase().includes('frío'),
        })
      }
    })
    return Array.from(map.values())
  }, [cierres])

  const filteredTrucksList = useMemo(() => {
    if (!truckSearchQuery.trim()) return trucksList
    const q = truckSearchQuery.toLowerCase()
    return trucksList.filter(
      (t) => t.plate.toLowerCase().includes(q) || t.truckType.toLowerCase().includes(q)
    )
  }, [trucksList, truckSearchQuery])

  const ordersList = useMemo(() => {
    return cierres.map((c) => ({
      id: c.id,
      orderCode: c.orderCode,
      driverName: c.driverName,
      routeName: c.routeName,
    }))
  }, [cierres])

  const filteredOrdersList = useMemo(() => {
    if (!orderSearchQuery.trim()) return ordersList
    const q = orderSearchQuery.toLowerCase()
    return ordersList.filter(
      (o) =>
        o.orderCode.toLowerCase().includes(q) ||
        o.driverName.toLowerCase().includes(q) ||
        o.routeName.toLowerCase().includes(q)
    )
  }, [ordersList, orderSearchQuery])

  // ── FILTRADO MULTICRITERIO ──
  const filteredCierres = useMemo(() => {
    return cierres.filter((c) => {
      // 1. Filtro texto libre
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase()
        const matchCode = c.orderCode.toLowerCase().includes(query)
        const matchDriver =
          c.driverName.toLowerCase().includes(query) ||
          c.driverEmpresa.toLowerCase().includes(query)
        const matchTruck =
          c.truckPlate.toLowerCase().includes(query) ||
          c.truckType.toLowerCase().includes(query)
        const matchRoute = c.routeName.toLowerCase().includes(query)
        if (!matchCode && !matchDriver && !matchTruck && !matchRoute) {
          return false
        }
      }

      // 2. Filtro fecha
      if (!matchesDateRange(c, dateRange)) return false

      // 3. Filtro chofer
      if (selectedDriver !== 'ALL' && c.driverName !== selectedDriver) return false

      // 4. Filtro camión
      if (selectedTruck !== 'ALL' && c.truckPlate !== selectedTruck) return false

      // 5. Filtro orden de transporte
      if (selectedOrderCode !== 'ALL' && c.orderCode !== selectedOrderCode) return false

      // 6. Filtro estado
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'LIQUIDATED' && c.status !== 'LIQUIDATED') return false
        if (statusFilter === 'OBSERVED' && c.status !== 'OBSERVED') return false
        if (statusFilter === 'PENDING' && c.status === 'LIQUIDATED') return false
      }

      return true
    })
  }, [
    cierres,
    searchTerm,
    dateRange,
    selectedDriver,
    selectedTruck,
    selectedOrderCode,
    statusFilter,
  ])

  // ── SORTING ──
  const sortedCierres = useMemo(() => {
    const list = [...filteredCierres]
    list.sort((a, b) => {
      let aVal: any = a[sortField as keyof CierreOrdenTransporte]
      let bVal: any = b[sortField as keyof CierreOrdenTransporte]

      if (sortField === 'valorDespacho') {
        aVal = a.cobranza.resumenFinanciero.valorDespacho || 0
        bVal = b.cobranza.resumenFinanciero.valorDespacho || 0
      }

      if (typeof aVal === 'string') {
        const cmp = aVal.localeCompare(bVal as string)
        return sortDirection === 'asc' ? cmp : -cmp
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [filteredCierres, sortField, sortDirection])

  // ── PAGINACIÓN ──
  const totalItems = sortedCierres.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const paginatedCierres = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedCierres.slice(start, start + pageSize)
  }, [sortedCierres, currentPage, pageSize])

  const startIndex = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const endIndex = Math.min(totalItems, currentPage * pageSize)

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 text-slate-400 opacity-60 group-hover:opacity-100" />
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
    )
  }

  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    Boolean(dateRange?.from) ||
    selectedDriver !== 'ALL' ||
    selectedTruck !== 'ALL' ||
    selectedOrderCode !== 'ALL' ||
    statusFilter !== 'ALL'

  const handleResetFilters = () => {
    setSearchTerm('')
    setDateRange(undefined)
    setSelectedDriver('ALL')
    setSelectedTruck('ALL')
    setSelectedOrderCode('ALL')
    setStatusFilter('ALL')
  }

  return (
    <div className="space-y-3.5">
      {/* ── CABECERA PRINCIPAL: TÍTULO Y BOTÓN MEJORADO A LA DERECHA ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/25">
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base md:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Cierre y Liquidación de Órdenes de Transporte
              </h1>
              <Badge
                variant="outline"
                className="border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300 font-semibold text-xs py-0.5 px-2"
              >
                {totalItems} Órdenes
              </Badge>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Órdenes de transporte finalizadas en ruta listas para registro de liquidación física de almacén y cobranzas
            </p>
          </div>
        </div>
      </div>

      {/* ── PANEL DE BÚSQUEDA Y SELECTS DE FILTRADO EN CASCADA ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-slate-100 dark:border-slate-800/80 pb-2">
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-indigo-600" />
            <h2 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
              Búsqueda y Filtros
            </h2>
          </div>

          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Limpiar filtros</span>
            </button>
          )}
        </div>

        {/* GRILLA DE SELECTS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {/* 1. BUSCADOR LIBRE */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
              Buscar
            </label>
            <div className="relative">
              <Search
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <Input
                placeholder="OT, chofer, placa..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 pl-8 text-xs bg-slate-50 dark:bg-slate-800/60"
              />
            </div>
          </div>

          {/* 2. SELECT CHOFER */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <span>Chofer</span>
              {selectedDriver !== 'ALL' && <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />}
            </label>
            <Popover open={driverPopoverOpen} onOpenChange={setDriverPopoverOpen}>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className={cn(
                      'flex h-8 w-full items-center justify-between gap-1.5 rounded-md border border-slate-200 bg-slate-50/50 px-2.5 text-xs text-slate-800 shadow-xs hover:bg-slate-100 focus-visible:outline-none cursor-pointer text-left dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200',
                      selectedDriver !== 'ALL' &&
                        'border-indigo-500 bg-indigo-50/40 text-indigo-700 font-semibold dark:text-indigo-300'
                    )}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <User size={13} className="shrink-0 text-slate-400" />
                      <span className="truncate">
                        {selectedDriver === 'ALL' ? 'Todos los choferes' : selectedDriver}
                      </span>
                    </div>
                    <ChevronDown size={12} className="opacity-50 shrink-0" />
                  </button>
                }
              />
              <PopoverContent className="w-72 p-0 border-slate-200 dark:border-slate-800" align="start">
                <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                  <Input
                    placeholder="Buscar chofer..."
                    value={driverSearchQuery}
                    onChange={(e) => setDriverSearchQuery(e.target.value)}
                    className="h-7 text-xs bg-slate-50 dark:bg-slate-900"
                  />
                </div>
                <div className="max-h-52 overflow-y-auto p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDriver('ALL')
                      setDriverPopoverOpen(false)
                    }}
                    className={cn(
                      'w-full flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer',
                      selectedDriver === 'ALL' &&
                        'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 font-semibold'
                    )}
                  >
                    <span>Todos los choferes ({driversList.length})</span>
                    {selectedDriver === 'ALL' && <Check size={14} />}
                  </button>
                  {filteredDriversList.map((d) => (
                    <button
                      key={d.name}
                      type="button"
                      onClick={() => {
                        setSelectedDriver(d.name)
                        setDriverPopoverOpen(false)
                      }}
                      className={cn(
                        'w-full flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer',
                        selectedDriver === d.name &&
                          'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 font-semibold'
                      )}
                    >
                      <div>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 block truncate">
                          {d.name}
                        </span>
                        <span className="text-[10px] text-slate-400">{d.empresa} • CI: {d.ci}</span>
                      </div>
                      {selectedDriver === d.name && <Check size={14} className="shrink-0 ml-2" />}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* 3. SELECT CAMIÓN / PLACA */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <span>Placa</span>
              {selectedTruck !== 'ALL' && <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />}
            </label>
            <Popover open={truckPopoverOpen} onOpenChange={setTruckPopoverOpen}>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className={cn(
                      'flex h-8 w-full items-center justify-between gap-1.5 rounded-md border border-slate-200 bg-slate-50/50 px-2.5 text-xs text-slate-800 shadow-xs hover:bg-slate-100 focus-visible:outline-none cursor-pointer text-left dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200',
                      selectedTruck !== 'ALL' &&
                        'border-indigo-500 bg-indigo-50/40 text-indigo-700 font-semibold dark:text-indigo-300'
                    )}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <Truck size={13} className="shrink-0 text-slate-400" />
                      <span className="truncate font-mono font-bold">
                        {selectedTruck === 'ALL' ? 'Todas las placas' : selectedTruck}
                      </span>
                    </div>
                    <ChevronDown size={12} className="opacity-50 shrink-0" />
                  </button>
                }
              />
              <PopoverContent className="w-72 p-0 border-slate-200 dark:border-slate-800" align="start">
                <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                  <Input
                    placeholder="Buscar placa..."
                    value={truckSearchQuery}
                    onChange={(e) => setTruckSearchQuery(e.target.value)}
                    className="h-7 text-xs bg-slate-50 dark:bg-slate-900"
                  />
                </div>
                <div className="max-h-52 overflow-y-auto p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTruck('ALL')
                      setTruckPopoverOpen(false)
                    }}
                    className={cn(
                      'w-full flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer',
                      selectedTruck === 'ALL' &&
                        'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 font-semibold'
                    )}
                  >
                    <span>Todas las placas ({trucksList.length})</span>
                    {selectedTruck === 'ALL' && <Check size={14} />}
                  </button>
                  {filteredTrucksList.map((t) => (
                    <button
                      key={t.plate}
                      type="button"
                      onClick={() => {
                        setSelectedTruck(t.plate)
                        setTruckPopoverOpen(false)
                      }}
                      className={cn(
                        'w-full flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer',
                        selectedTruck === t.plate &&
                          'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 font-semibold'
                      )}
                    >
                      <div>
                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100 block">
                          {t.plate}
                        </span>
                        <span className="text-[10px] text-slate-400">{t.truckType}</span>
                      </div>
                      {selectedTruck === t.plate && <Check size={14} className="shrink-0 ml-2" />}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* 4. SELECT ORDEN DE TRANSPORTE */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <span>N° Despacho / OT</span>
              {selectedOrderCode !== 'ALL' && <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />}
            </label>
            <Popover open={orderPopoverOpen} onOpenChange={setOrderPopoverOpen}>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className={cn(
                      'flex h-8 w-full items-center justify-between gap-1.5 rounded-md border border-slate-200 bg-slate-50/50 px-2.5 text-xs text-slate-800 shadow-xs hover:bg-slate-100 focus-visible:outline-none cursor-pointer text-left dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200',
                      selectedOrderCode !== 'ALL' &&
                        'border-indigo-500 bg-indigo-50/40 text-indigo-700 font-semibold dark:text-indigo-300'
                    )}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <Hash size={13} className="shrink-0 text-slate-400" />
                      <span className="truncate font-mono font-bold">
                        {selectedOrderCode === 'ALL' ? 'Todas las OTs' : selectedOrderCode}
                      </span>
                    </div>
                    <ChevronDown size={12} className="opacity-50 shrink-0" />
                  </button>
                }
              />
              <PopoverContent className="w-80 p-0 border-slate-200 dark:border-slate-800" align="start">
                <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                  <Input
                    placeholder="Buscar por N° OT o ruta..."
                    value={orderSearchQuery}
                    onChange={(e) => setOrderSearchQuery(e.target.value)}
                    className="h-7 text-xs bg-slate-50 dark:bg-slate-900"
                  />
                </div>
                <div className="max-h-52 overflow-y-auto p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedOrderCode('ALL')
                      setOrderPopoverOpen(false)
                    }}
                    className={cn(
                      'w-full flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer',
                      selectedOrderCode === 'ALL' &&
                        'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 font-semibold'
                    )}
                  >
                    <span>Todas las OTs ({ordersList.length})</span>
                    {selectedOrderCode === 'ALL' && <Check size={14} />}
                  </button>
                  {filteredOrdersList.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => {
                        setSelectedOrderCode(o.orderCode)
                        setOrderPopoverOpen(false)
                      }}
                      className={cn(
                        'w-full flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer',
                        selectedOrderCode === o.orderCode &&
                          'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 font-semibold'
                      )}
                    >
                      <div>
                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100 block">
                          {o.orderCode}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {o.driverName} • {o.routeName}
                        </span>
                      </div>
                      {selectedOrderCode === o.orderCode && <Check size={14} className="shrink-0 ml-2" />}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* 5. SELECT FECHA */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <span>Fecha</span>
              {dateRange?.from && <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />}
            </label>
            <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className={cn(
                      'flex h-8 w-full items-center justify-between gap-1.5 rounded-md border border-slate-200 bg-slate-50/50 px-2.5 text-xs text-slate-800 shadow-xs hover:bg-slate-100 focus-visible:outline-none cursor-pointer text-left dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200',
                      dateRange?.from &&
                        'border-indigo-500 bg-indigo-50/40 text-indigo-700 font-semibold dark:text-indigo-300'
                    )}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <CalendarIcon size={13} className="shrink-0 text-slate-400" />
                      <span className="truncate">{dateRangeLabel}</span>
                    </div>
                    <ChevronDown size={12} className="opacity-50 shrink-0" />
                  </button>
                }
              />
              <PopoverContent className="w-auto p-0 border-slate-200 dark:border-slate-800" align="start">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={(r) => setDateRange(r)}
                  defaultMonth={dateRange?.from || new Date(2026, 1)}
                  numberOfMonths={1}
                  locale={es}
                  className="rounded-md"
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* ── TABLA CON ALTURA FIJA, SCROLL INTERNO, SORTING Y PAGINACIÓN ── */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-xs flex flex-col overflow-hidden">
        {/* CONTENEDOR CON ALTURA FIJA ESTRICTA (400px) Y SCROLL */}
        <div
          style={{ height: '400px', maxHeight: '400px', minHeight: '400px' }}
          className="overflow-y-auto overflow-x-auto relative shrink-0"
        >
          <table className="w-full text-left text-xs border-collapse">
            {/* ENCABEZADO STICKY CON SORTING */}
            <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-bold border-b border-slate-200 dark:border-slate-700 select-none shadow-xs">
              <tr>
                {/* 1. N° OT */}
                <th
                  onClick={() => handleSort('orderCode')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition-colors group"
                >
                  <div className="flex items-center gap-1.5">
                    <span>N° Despacho / OT</span>
                    {renderSortIcon('orderCode')}
                  </div>
                </th>

                {/* 2. FECHA */}
                <th
                  onClick={() => handleSort('dateIso')}
                  className="py-3 px-3 cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition-colors group"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Fecha</span>
                    {renderSortIcon('dateIso')}
                  </div>
                </th>

                {/* 3. CHOFER */}
                <th
                  onClick={() => handleSort('driverName')}
                  className="py-3 px-3 cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition-colors group"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Chofer Repartidor</span>
                    {renderSortIcon('driverName')}
                  </div>
                </th>

                {/* 4. PLACA */}
                <th
                  onClick={() => handleSort('truckPlate')}
                  className="py-3 px-3 cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition-colors group"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Placa / Camión</span>
                    {renderSortIcon('truckPlate')}
                  </div>
                </th>

                {/* 5. RUTA */}
                <th
                  onClick={() => handleSort('routeName')}
                  className="py-3 px-3 cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition-colors group"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Ruta de Entrega</span>
                    {renderSortIcon('routeName')}
                  </div>
                </th>

                {/* 6. VALOR DESPACHO */}
                <th
                  onClick={() => handleSort('valorDespacho')}
                  className="py-3 px-3 text-right cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition-colors group"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Valor Despacho</span>
                    {renderSortIcon('valorDespacho')}
                  </div>
                </th>

                {/* 7. ESTADO ALMACÉN */}
                <th className="py-3 px-3 text-center">Cierre Almacén</th>

                {/* 8. ESTADO COBRANZAS */}
                <th className="py-3 px-3 text-center">Cierre Cobranza</th>

                {/* 9. ESTADO GENERAL */}
                <th
                  onClick={() => handleSort('status')}
                  className="py-3 px-3 text-center cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition-colors group"
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>Estado General</span>
                    {renderSortIcon('status')}
                  </div>
                </th>

                {/* 10. ACCIÓN */}
                <th className="py-3 px-4 text-center">Acción</th>
              </tr>
            </thead>

            {/* CUERPO DE TABLA */}
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paginatedCierres.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400 italic">
                    No se encontraron órdenes de transporte que coincidan con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                paginatedCierres.map((c) => {
                  const isLiquidated = c.status === 'LIQUIDATED'
                  const isObserved = c.status === 'OBSERVED'
                  const hasShortage = c.almacen.totales.totalCantidadFaltante > 0

                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-slate-50/90 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      {/* 1. N° DESPACHO */}
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-slate-100">
                        <div className="flex items-center gap-1.5">
                          <Hash className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                          <span>{c.orderCode}</span>
                        </div>
                      </td>

                      {/* 2. FECHA */}
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <CalendarIcon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span>{c.dateFormatted}</span>
                        </div>
                      </td>

                      {/* 3. CHOFER */}
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {c.driverName}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          CI: {c.driverCi} • {c.driverEmpresa}
                        </div>
                      </td>

                      {/* 4. PLACA */}
                      <td className="py-3 px-3 font-mono">
                        <div className="font-bold text-slate-800 dark:text-slate-200">
                          {c.truckPlate}
                        </div>
                        <div className="text-[10px] text-slate-400">{c.truckType}</div>
                      </td>

                      {/* 5. RUTA */}
                      <td className="py-3 px-3 max-w-[200px]">
                        <span
                          className="truncate block font-medium text-slate-700 dark:text-slate-300"
                          title={c.routeName}
                        >
                          {c.routeName}
                        </span>
                      </td>

                      {/* 6. VALOR DESPACHO */}
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        Bs {c.cobranza.resumenFinanciero.valorDespacho.toFixed(2)}
                      </td>

                      {/* 7. ESTADO CIERRE ALMACÉN (CHIP LIMPIO) */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {hasShortage ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                            Faltante ({c.almacen.totales.totalCantidadFaltante})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Cuadrado
                          </span>
                        )}
                      </td>

                      {/* 8. ESTADO CIERRE COBRANZA (CHIP LIMPIO) */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {isLiquidated ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Liquidado
                          </span>
                        ) : isObserved ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            Observado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                            Pendiente
                          </span>
                        )}
                      </td>

                      {/* 9. ESTADO GENERAL (CHIP VISUAL MEJORADO) */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {isLiquidated ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-600 text-white shadow-2xs">
                            <CheckCircle2 className="h-3 w-3" />
                            Liquidado Conforme
                          </span>
                        ) : isObserved ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-600 text-white shadow-2xs">
                            <AlertTriangle className="h-3 w-3" />
                            Observado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-600 text-white shadow-2xs">
                            <Clock className="h-3 w-3" />
                            Pendiente Liquidación
                          </span>
                        )}
                      </td>

                      {/* 10. ACCIÓN: 'Ver Cierre' si está liquidado, 'Registrar Cierre' si está pendiente/observado */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {isLiquidated ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (onVerCierre) {
                                onVerCierre(c.id)
                              } else if (onSelectCierre) {
                                onSelectCierre(c.id)
                              }
                            }}
                            className="h-8 px-3 rounded-xl border-emerald-300 dark:border-emerald-700 bg-emerald-50/70 hover:bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 font-semibold text-xs flex items-center gap-1.5 cursor-pointer mx-auto shadow-2xs transition-colors"
                            title="Ver detalle del cierre liquidado"
                          >
                            <Eye className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>Ver Cierre</span>
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (onRegistrarCierre) {
                                onRegistrarCierre(c.id)
                              } else if (onIniciarLiquidacionCobranza) {
                                onIniciarLiquidacionCobranza(c.id)
                              } else if (onSelectCierre) {
                                onSelectCierre(c.id)
                              }
                            }}
                            className="h-8 px-3 rounded-xl border-indigo-600 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer mx-auto shadow-2xs transition-colors"
                            title="Registrar liquidación física y financiera"
                          >
                            <Edit3 className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                            <span>Registrar Cierre</span>
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── PIE DE TABLA: CONTROLES DE PAGINACIÓN PROFESIONAL ── */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400 shrink-0">
          {/* LADO IZQUIERDO: CONTADOR DE FILAS */}
          <div>
            Mostrando <strong className="text-slate-800 dark:text-slate-200">{startIndex}</strong> a{' '}
            <strong className="text-slate-800 dark:text-slate-200">{endIndex}</strong> de{' '}
            <strong className="text-slate-800 dark:text-slate-200">{totalItems}</strong> órdenes de transporte
          </div>

          {/* CENTRO: SELECTOR DE FILAS POR PÁGINA */}
          <div className="flex items-center gap-2">
            <span className="text-[11px]">Filas por página:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-7 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs px-2 text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>

          {/* LADO DERECHO: BOTONES DE PÁGINA */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(1)}
              className="h-7 w-7 text-xs cursor-pointer disabled:opacity-40"
              title="Primera página"
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="h-7 w-7 text-xs cursor-pointer disabled:opacity-40"
              title="Página anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>

            <span className="px-2 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
              Página {currentPage} de {totalPages}
            </span>

            <Button
              variant="outline"
              size="icon"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="h-7 w-7 text-xs cursor-pointer disabled:opacity-40"
              title="Página siguiente"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(totalPages)}
              className="h-7 w-7 text-xs cursor-pointer disabled:opacity-40"
              title="Última página"
            >
              <ChevronsRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
