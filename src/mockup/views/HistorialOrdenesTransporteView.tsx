import { useMemo, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import {
  format,
  isSameDay,
  parseISO,
  startOfDay,
  endOfDay,
} from 'date-fns'
import { es } from 'date-fns/locale'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  DollarSign,
  Download,
  Eye,
  FileClock,
  Filter,
  RotateCcw,
  Route,
  Search,
  Truck,
  User,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent } from '@/components/ui/card'
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
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  HISTORIAL_ORDENES_TRANSPORTE,
  type OrdenTransporteHistorial,
} from '../historial-orders-data'
import { exportarHistorialAExcel } from '../utils/excel-export'
import { navigateTo } from '../routes'

type SortField = 'code' | 'date' | 'truck' | 'driver' | 'stops' | 'weight' | 'revenue' | 'status'
type SortOrder = 'asc' | 'desc'

export function HistorialOrdenesTransporteView() {
  // ── ESTADOS DE FILTRO ──
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTruck, setSelectedTruck] = useState('ALL')
  const [selectedDriver, setSelectedDriver] = useState('ALL')
  const [selectedStatus, setSelectedStatus] = useState('ALL')

  // Filtro de Rango de Fechas con shadcn Calendar (DateRange)
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [datePopoverOpen, setDatePopoverOpen] = useState(false)

  // ── ESTADOS DE ORDENACIÓN Y PAGINACIÓN ──
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)

  // Listas únicas para los selectores
  const trucksList = useMemo(() => {
    const map = new Map<string, string>()
    HISTORIAL_ORDENES_TRANSPORTE.forEach((o) => {
      map.set(o.truck.plate, `${o.truck.plate} (${o.truck.code})`)
    })
    return Array.from(map.entries()).map(([plate, label]) => ({ plate, label }))
  }, [])

  const driversList = useMemo(() => {
    const set = new Set<string>()
    HISTORIAL_ORDENES_TRANSPORTE.forEach((o) => set.add(o.driver.name))
    return Array.from(set)
  }, [])

  // Presets rápidos para el calendario
  const applyDatePreset = (preset: 'TODAY' | '7DAYS' | 'MONTH' | 'ALL') => {
    if (preset === 'ALL') {
      setDateRange(undefined)
    } else if (preset === 'TODAY') {
      setDateRange({
        from: new Date(2026, 7, 20),
        to: new Date(2026, 7, 20),
      })
    } else if (preset === '7DAYS') {
      setDateRange({
        from: new Date(2026, 7, 14),
        to: new Date(2026, 7, 20),
      })
    } else if (preset === 'MONTH') {
      setDateRange({
        from: new Date(2026, 7, 1),
        to: new Date(2026, 7, 31),
      })
    }
    setDatePopoverOpen(false)
    setCurrentPage(1)
  }

  // Filtrado reactivo de órdenes
  const filteredOrders = useMemo(() => {
    return HISTORIAL_ORDENES_TRANSPORTE.filter((ot) => {
      // 1. Filtro de texto libre
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase()
        const matchCode = ot.codeFormatted.toLowerCase().includes(query)
        const matchTruck = ot.truck.plate.toLowerCase().includes(query) || ot.truck.code.toLowerCase().includes(query)
        const matchDriver = ot.driver.name.toLowerCase().includes(query)
        const matchCustomer = ot.paradas.some((p) =>
          p.customerName.toLowerCase().includes(query) || p.deliveryNoteNumber.toLowerCase().includes(query)
        )
        if (!matchCode && !matchTruck && !matchDriver && !matchCustomer) {
          return false
        }
      }

      // 2. Filtro de Camión
      if (selectedTruck !== 'ALL' && ot.truck.plate !== selectedTruck) {
        return false
      }

      // 3. Filtro de Chofer
      if (selectedDriver !== 'ALL' && ot.driver.name !== selectedDriver) {
        return false
      }

      // 4. Filtro de Estado
      if (selectedStatus !== 'ALL' && ot.status !== selectedStatus) {
        return false
      }

      // 5. Filtro de Rango de Fechas
      if (dateRange?.from) {
        const otDate = parseISO(ot.dateIso)
        const start = startOfDay(dateRange.from)
        if (otDate < start) return false

        if (dateRange.to) {
          const end = endOfDay(dateRange.to)
          if (otDate > end) return false
        }
      }

      return true
    })
  }, [searchTerm, selectedTruck, selectedDriver, selectedStatus, dateRange])

  // Ordenación reactiva
  const sortedOrders = useMemo(() => {
    const list = [...filteredOrders]
    list.sort((a, b) => {
      let valA: any
      let valB: any

      switch (sortField) {
        case 'code':
          valA = a.code
          valB = b.code
          break
        case 'date':
          valA = a.departureDate
          valB = b.departureDate
          break
        case 'truck':
          valA = a.truck.plate
          valB = b.truck.plate
          break
        case 'driver':
          valA = a.driver.name
          valB = b.driver.name
          break
        case 'stops':
          valA = a.kpis.completedStops
          valB = b.kpis.completedStops
          break
        case 'weight':
          valA = a.assignedWeightKg
          valB = b.assignedWeightKg
          break
        case 'revenue':
          valA = a.kpis.totalCollected
          valB = b.kpis.totalCollected
          break
        case 'status':
          valA = a.status
          valB = b.status
          break
        default:
          valA = a.code
          valB = b.code
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [filteredOrders, sortField, sortOrder])

  // Paginación
  const totalItems = sortedOrders.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)

  const paginatedOrders = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize
    return sortedOrders.slice(start, start + pageSize)
  }, [sortedOrders, safeCurrentPage, pageSize])

  // Toggle de ordenación
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  // KPIs consolidados del resultado filtrado
  const kpisTotales = useMemo(() => {
    const totalOTs = filteredOrders.length
    const totalRecaudado = filteredOrders.reduce((acc, o) => acc + o.kpis.totalCollected, 0)
    const totalKm = filteredOrders.reduce((acc, o) => acc + o.totalKm, 0)
    const totalParadas = filteredOrders.reduce((acc, o) => acc + o.kpis.totalStops, 0)
    const paradasExitosas = filteredOrders.reduce((acc, o) => acc + o.kpis.completedStops, 0)
    const efectividadGlobal = totalParadas > 0 ? ((paradasExitosas / totalParadas) * 100).toFixed(1) : '100'

    return {
      totalOTs,
      totalRecaudado,
      totalKm,
      totalParadas,
      paradasExitosas,
      efectividadGlobal,
    }
  }, [filteredOrders])

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' }).format(n)

  const handleExportExcel = () => {
    exportarHistorialAExcel(filteredOrders, 'Historial_Ordenes_Transporte.csv')
    toast.success(`Exportando ${filteredOrders.length} órdenes de transporte a Excel`, {
      description: 'Archivo CSV/Excel con resumen general y detalle de paradas.',
    })
  }

  const handleResetFilters = () => {
    setSearchTerm('')
    setSelectedTruck('ALL')
    setSelectedDriver('ALL')
    setSelectedStatus('ALL')
    setDateRange(undefined)
    setCurrentPage(1)
  }

  const hasActiveFilters =
    searchTerm !== '' ||
    selectedTruck !== 'ALL' ||
    selectedDriver !== 'ALL' ||
    selectedStatus !== 'ALL' ||
    dateRange !== undefined

  const handleVerDetalle = (ot: OrdenTransporteHistorial) => {
    navigateTo('detalle-orden-transporte', { otId: ot.id })
  }

  // Texto amigable para el botón del calendario
  const dateRangeLabel = useMemo(() => {
    if (!dateRange?.from) return 'Rango de fechas'
    if (!dateRange.to || isSameDay(dateRange.from, dateRange.to)) {
      return format(dateRange.from, 'dd/MM/yyyy')
    }
    return `${format(dateRange.from, 'dd/MM/yyyy')} – ${format(dateRange.to, 'dd/MM/yyyy')}`
  }, [dateRange])

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} className="opacity-40 ml-1" />
    return sortOrder === 'asc' ? (
      <ArrowUp size={12} className="text-primary ml-1 font-bold" />
    ) : (
      <ArrowDown size={12} className="text-primary ml-1 font-bold" />
    )
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-3 px-1 py-0.5 overflow-hidden">
      {/* ── ENCABEZADO: SUBTÍTULO Y ACCIÓN DE DESCARGA (SIN REPETIR TÍTULO H1) ── */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground leading-tight">
          Auditoría de viajes completados, tiempos en cliente, liquidación de cobranzas y evidencias de entrega.
        </p>

        <Button
          onClick={handleExportExcel}
          size="sm"
          className="h-8 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs font-semibold cursor-pointer shrink-0"
        >
          <Download size={14} />
          Descargar Excel
        </Button>
      </div>

      {/* ── TARJETAS KPI DE RESUMEN (RESPONSIVAS, CON AIRE LATERAL) ── */}
      <div className="grid shrink-0 grid-cols-2 gap-3 md:grid-cols-4 w-full">
        <Card className="bg-card shadow-xs border-border/80">
          <CardContent className="p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Órdenes Filtradas</span>
              <FileClock className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-1 text-lg font-bold tracking-tight text-foreground">
              {kpisTotales.totalOTs}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {kpisTotales.paradasExitosas} de {kpisTotales.totalParadas} paradas entregadas
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-xs border-border/80">
          <CardContent className="p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Total Recaudado</span>
              <DollarSign className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="mt-1 text-lg font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {fmtMoney(kpisTotales.totalRecaudado)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Liquidado en efectivo, QR y transferencias
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-xs border-border/80">
          <CardContent className="p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Efectividad de Entrega</span>
              <CheckCircle2 className="h-4 w-4 text-blue-600" />
            </div>
            <div className="mt-1 text-lg font-bold tracking-tight text-blue-600 dark:text-blue-400">
              {kpisTotales.efectividadGlobal}%
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Tasa de éxito en puntos de entrega
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-xs border-border/80">
          <CardContent className="p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Distancia Recorrida</span>
              <Route className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-1 text-lg font-bold tracking-tight text-foreground">
              {kpisTotales.totalKm.toFixed(1)} km
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Kilometraje GPS acumulado en ruta
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── BARRA DE FILTROS COMPACTA (SLIM & INLINE) ── */}
      <div className="shrink-0 rounded-lg border border-border bg-card/60 p-2.5 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* 1. Búsqueda de texto libre */}
          <div className="relative flex-1 min-w-[200px] max-w-[260px]">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setCurrentPage(1)
              }}
              placeholder="Buscar OT, cliente, remisión..."
              className="h-8 pl-8 pr-7 text-xs bg-background"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* 2. Rango de Fechas con shadcn Calendar oficial */}
          <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className={cn(
                    'flex h-8 min-w-[200px] max-w-[260px] items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-xs text-foreground shadow-xs hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer text-left',
                    dateRange?.from ? 'border-primary/40 text-primary font-medium' : 'text-muted-foreground'
                  )}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <CalendarIcon size={13} className="shrink-0 text-muted-foreground" />
                    <span className="truncate">{dateRangeLabel}</span>
                  </div>
                  {dateRange?.from && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation()
                        setDateRange(undefined)
                        setCurrentPage(1)
                      }}
                      className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                      title="Quitar filtro de fecha"
                    >
                      <X size={12} />
                    </span>
                  )}
                </button>
              }
            />
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                defaultMonth={new Date(2026, 7)}
                selected={dateRange}
                onSelect={(range) => {
                  setDateRange(range)
                  if (range?.from) {
                    setCurrentPage(1)
                  }
                }}
                numberOfMonths={1}
                locale={es}
              />
            </PopoverContent>
          </Popover>

          {/* 3. Selector de Camión (Ancho amplio y cómodo) */}
          <Select
            value={selectedTruck}
            onValueChange={(v) => {
              if (v) setSelectedTruck(v)
              setCurrentPage(1)
            }}
          >
            <SelectTrigger size="sm" className="h-8 min-w-[180px] max-w-[220px] text-xs bg-background" aria-label="Camión">
              <div className="flex items-center gap-1.5 truncate">
                <Truck size={13} className="shrink-0 text-muted-foreground" />
                <SelectValue placeholder="Todos los camiones" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los camiones</SelectItem>
              {trucksList.map((t) => (
                <SelectItem key={t.plate} value={t.plate}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 4. Selector de Chofer (Ancho amplio y cómodo) */}
          <Select
            value={selectedDriver}
            onValueChange={(v) => {
              if (v) setSelectedDriver(v)
              setCurrentPage(1)
            }}
          >
            <SelectTrigger size="sm" className="h-8 min-w-[180px] max-w-[220px] text-xs bg-background" aria-label="Chofer">
              <div className="flex items-center gap-1.5 truncate">
                <User size={13} className="shrink-0 text-muted-foreground" />
                <SelectValue placeholder="Todos los choferes" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los choferes</SelectItem>
              {driversList.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 5. Selector de Estado */}
          <Select
            value={selectedStatus}
            onValueChange={(v) => {
              if (v) setSelectedStatus(v)
              setCurrentPage(1)
            }}
          >
            <SelectTrigger size="sm" className="h-8 min-w-[150px] max-w-[180px] text-xs bg-background" aria-label="Estado">
              <SelectValue placeholder="Estado operativo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los estados</SelectItem>
              <SelectItem value="COMPLETED">Completado (100% OK)</SelectItem>
              <SelectItem value="DISCREPANCY">Con discrepancia</SelectItem>
            </SelectContent>
          </Select>

          {/* 6. Botón de reset si hay filtros activos */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetFilters}
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
              title="Limpiar todos los filtros"
            >
              <RotateCcw size={12} />
              Limpiar
            </Button>
          )}
        </div>
      </div>

      {/* ── TABLA PRINCIPAL CON ALTURA FIJA Y SCROLL INTERNO ── */}
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-xs border-border">
        {/* Contenedor de scroll interno para la tabla */}
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted/95 backdrop-blur-xs text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              <tr>
                {/* 1. Orden Transporte */}
                <th
                  onClick={() => handleSort('code')}
                  className="p-3 pl-4 cursor-pointer hover:text-foreground select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>Orden Transporte</span>
                    {renderSortIcon('code')}
                  </div>
                </th>

                {/* 2. Fecha y Horario */}
                <th
                  onClick={() => handleSort('date')}
                  className="p-3 cursor-pointer hover:text-foreground select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>Fecha y Horario</span>
                    {renderSortIcon('date')}
                  </div>
                </th>

                {/* 3. Camión */}
                <th
                  onClick={() => handleSort('truck')}
                  className="p-3 cursor-pointer hover:text-foreground select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>Camión</span>
                    {renderSortIcon('truck')}
                  </div>
                </th>

                {/* 4. Chofer / Ayudante */}
                <th
                  onClick={() => handleSort('driver')}
                  className="p-3 cursor-pointer hover:text-foreground select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>Equipo (Chofer / Ayudante)</span>
                    {renderSortIcon('driver')}
                  </div>
                </th>

                {/* 5. Paradas & Éxito */}
                <th
                  onClick={() => handleSort('stops')}
                  className="p-3 text-center cursor-pointer hover:text-foreground select-none"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Paradas / Éxito</span>
                    {renderSortIcon('stops')}
                  </div>
                </th>

                {/* 6. Carga */}
                <th
                  onClick={() => handleSort('weight')}
                  className="p-3 text-right cursor-pointer hover:text-foreground select-none"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Carga (Kg / M³)</span>
                    {renderSortIcon('weight')}
                  </div>
                </th>

                {/* 7. Total Cobrado */}
                <th
                  onClick={() => handleSort('revenue')}
                  className="p-3 text-right cursor-pointer hover:text-foreground select-none"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Total Cobrado (Bs)</span>
                    {renderSortIcon('revenue')}
                  </div>
                </th>

                {/* 8. Estado */}
                <th
                  onClick={() => handleSort('status')}
                  className="p-3 text-center cursor-pointer hover:text-foreground select-none"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Estado</span>
                    {renderSortIcon('status')}
                  </div>
                </th>

                {/* 9. Acciones */}
                <th className="p-3 pr-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {paginatedOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted-foreground">
                    <p className="text-sm font-semibold">No se encontraron órdenes de transporte</p>
                    <p className="text-xs mt-1">Prueba cambiando o limpiando los filtros aplicados.</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleResetFilters}
                      className="mt-3 text-xs"
                    >
                      Restablecer filtros
                    </Button>
                  </td>
                </tr>
              ) : (
                paginatedOrders.map((ot) => (
                  <tr
                    key={ot.id}
                    onClick={() => handleVerDetalle(ot)}
                    className="hover:bg-muted/40 cursor-pointer transition-colors group"
                  >
                    {/* 1. Código OT */}
                    <td className="p-3 pl-4">
                      <span className="font-bold font-mono text-primary group-hover:underline flex items-center gap-1.5">
                        {ot.codeFormatted}
                      </span>
                      <span className="block text-[10px] text-muted-foreground truncate max-w-[130px]">
                        {ot.distributorName.replace('Distribuidora ', '')}
                      </span>
                    </td>

                    {/* 2. Fecha y Horario */}
                    <td className="p-3">
                      <span className="font-medium text-foreground">{ot.dateFormatted}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {ot.departureDate.split('T')[1].slice(0, 5)} - {ot.completedDate.split('T')[1].slice(0, 5)} ({Math.floor(ot.kpis.totalDurationMinutes / 60)}h)
                      </span>
                    </td>

                    {/* 3. Camión */}
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground">{ot.truck.plate}</span>
                        {ot.truck.isRefrigerated && (
                          <Badge variant="outline" className="h-4 px-1 text-[9px] text-blue-600 border-blue-300">
                            Termo
                          </Badge>
                        )}
                      </div>
                      <span className="block text-[10px] text-muted-foreground">
                        {ot.truck.code} · {ot.truck.truckType}
                      </span>
                    </td>

                    {/* 4. Equipo */}
                    <td className="p-3">
                      <span className="font-medium text-foreground block">{ot.driver.name}</span>
                      <span className="text-[11px] text-muted-foreground block">
                        Ayudante: {ot.helper.name}
                      </span>
                    </td>

                    {/* 5. Paradas & Efectividad */}
                    <td className="p-3 text-center">
                      <span className="font-semibold text-foreground block">
                        {ot.kpis.completedStops} / {ot.kpis.totalStops}
                      </span>
                      <Badge
                        variant={ot.kpis.successRate === 100 ? 'outline' : 'secondary'}
                        className={cn(
                          'h-4 text-[10px] px-1.5 font-bold',
                          ot.kpis.successRate === 100
                            ? 'text-emerald-600 border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/40'
                            : 'text-amber-600 bg-amber-50 dark:bg-amber-950/40'
                        )}
                      >
                        {ot.kpis.successRate}%
                      </Badge>
                    </td>

                    {/* 6. Carga */}
                    <td className="p-3 text-right">
                      <span className="font-medium text-foreground block">
                        {ot.assignedWeightKg.toLocaleString()} kg
                      </span>
                      <span className="text-[11px] text-muted-foreground block">
                        {ot.assignedVolumeM3} m³ · {ot.totalKm} km
                      </span>
                    </td>

                    {/* 7. Recaudación Total */}
                    <td className="p-3 text-right">
                      <span className="font-bold text-foreground block text-sm">
                        {fmtMoney(ot.kpis.totalCollected)}
                      </span>
                    </td>

                    {/* 8. Estado */}
                    <td className="p-3 text-center">
                      <Badge
                        variant={
                          ot.status === 'COMPLETED'
                            ? 'default'
                            : ot.status === 'DISCREPANCY'
                            ? 'destructive'
                            : 'secondary'
                        }
                        className={
                          ot.status === 'COMPLETED'
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white text-[10px]'
                            : 'text-[10px]'
                        }
                      >
                        {ot.statusLabel}
                      </Badge>
                    </td>

                    {/* 9. Acciones */}
                    <td className="p-3 pr-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleVerDetalle(ot)}
                        className="h-7 gap-1 px-2 text-xs font-semibold text-primary hover:text-primary hover:bg-primary/10 cursor-pointer"
                      >
                        <Eye size={13} />
                        Detalle
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── BARRA DE PAGINACIÓN Y CONTROL DE PÁGINAS ── */}
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/40 p-2 px-4 text-xs text-muted-foreground">
          {/* Contador de elementos */}
          <div className="flex items-center gap-2">
            <span>
              Mostrando{' '}
              <b className="text-foreground">
                {totalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1}
              </b>{' '}
              a{' '}
              <b className="text-foreground">
                {Math.min(safeCurrentPage * pageSize, totalItems)}
              </b>{' '}
              de <b className="text-foreground">{totalItems}</b> órdenes
            </span>

            {/* Selector de tamaño de página */}
            <div className="flex items-center gap-1.5 ml-4">
              <span className="text-[11px] text-muted-foreground">Items por página:</span>
              <Select
                value={pageSize.toString()}
                onValueChange={(v) => {
                  if (v) {
                    setPageSize(Number(v))
                    setCurrentPage(1)
                  }
                }}
              >
                <SelectTrigger size="sm" className="h-7 w-16 text-xs bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="15">15</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Botones de paginación */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={safeCurrentPage <= 1}
              onClick={() => setCurrentPage(1)}
              title="Primera página"
            >
              <ChevronsLeft size={13} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={safeCurrentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              title="Página anterior"
            >
              <ChevronLeft size={13} />
            </Button>

            {/* Números de página */}
            <div className="flex items-center gap-1 px-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - safeCurrentPage) <= 1)
                .map((p, idx, arr) => {
                  const prev = arr[idx - 1]
                  return (
                    <div key={p} className="flex items-center">
                      {prev && p - prev > 1 && <span className="px-1 text-muted-foreground">…</span>}
                      <Button
                        variant={safeCurrentPage === p ? 'default' : 'outline'}
                        size="sm"
                        className={cn(
                          'h-7 w-7 p-0 text-xs font-semibold',
                          safeCurrentPage === p ? 'bg-primary text-primary-foreground' : ''
                        )}
                        onClick={() => setCurrentPage(p)}
                      >
                        {p}
                      </Button>
                    </div>
                  )
                })}
            </div>

            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={safeCurrentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              title="Página siguiente"
            >
              <ChevronRight size={13} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={safeCurrentPage >= totalPages}
              onClick={() => setCurrentPage(totalPages)}
              title="Última página"
            >
              <ChevronsRight size={13} />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
