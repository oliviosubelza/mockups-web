import React, { useState, useRef, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  FileSpreadsheet,
  Printer,
  Search,
  Truck,
  User,
  Calendar as CalendarIcon,
  Building2,
  CheckCircle2,
  Banknote,
  Package,
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  QrCode,
  Landmark,
  Coins,
  ShieldCheck,
  ChevronDown,
  RotateCcw,
  Sparkles,
  Receipt,
  FileCheck,
  UserCheck,
  X,
  Check,
  Filter,
  Snowflake,
  FileText,
  Hash,
  AlertTriangle,
  CalendarDays,
  Download,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  CIERRES_ORDENES_TRANSPORTE,
  type CierreOrdenTransporte,
} from '../cierre-logistico-data'
import {
  exportarCierreAlmacenIndividualAExcel,
  exportarCierreCobranzasIndividualAExcel,
  exportarCierreLogisticoCompletoAExcel,
} from '../utils/excel-export'
import {
  imprimirActaCierreAlmacenPDF,
  imprimirActaCierreCobranzasPDF,
  imprimirActaCierreSegunTab,
} from '../utils/imprimir-cierre-pdf'

export function CierreLogisticoView() {
  // ── ESTADOS DE FILTROS EN CASCADA ──
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedDate, setSelectedDate] = useState<string>('ALL')
  const [selectedDriver, setSelectedDriver] = useState<string>('ALL')
  const [selectedUser, setSelectedUser] = useState<string>('ALL')
  const [selectedTruck, setSelectedTruck] = useState<string>('ALL')
  const [selectedOrderCode, setSelectedOrderCode] = useState<string>('ALL')

  // ── ESTADO DE SELECCIÓN DE CIERRE ACTIVO ──
  const [selectedId, setSelectedId] = useState<string>(CIERRES_ORDENES_TRANSPORTE[0].id)
  const [activeTab, setActiveTab] = useState<'almacen' | 'cobranza' | 'balance'>('almacen')
  const [showExportMenu, setShowExportMenu] = useState(false)

  // ── ESTADOS DE POPOVERS Y BUSCADORES INTERNOS ──
  const [datePopoverOpen, setDatePopoverOpen] = useState(false)

  const [driverPopoverOpen, setDriverPopoverOpen] = useState(false)
  const [driverSearchQuery, setDriverSearchQuery] = useState('')

  const [userPopoverOpen, setUserPopoverOpen] = useState(false)
  const [userSearchQuery, setUserSearchQuery] = useState('')

  const [truckPopoverOpen, setTruckPopoverOpen] = useState(false)
  const [truckSearchQuery, setTruckSearchQuery] = useState('')

  const [orderPopoverOpen, setOrderPopoverOpen] = useState(false)
  const [orderSearchQuery, setOrderSearchQuery] = useState('')

  // ── ESTADOS PARA TABLA DE PRODUCTOS (BUSCADOR Y FILTROS RÁPIDOS) ──
  const [productTableSearch, setProductTableSearch] = useState('')
  const [productFilterStatus, setProductFilterStatus] = useState<'ALL' | 'DEV' | 'BON'>('ALL')

  const printRef = useRef<HTMLDivElement>(null)

  // ── 1. LISTA DE FECHAS DISPONIBLES (Para formateo de etiqueta de fecha) ──
  const datesList = useMemo(() => {
    const map = new Map<string, { dateIso: string; dateFormatted: string; count: number }>()
    CIERRES_ORDENES_TRANSPORTE.forEach((c) => {
      const existing = map.get(c.dateIso)
      if (existing) {
        existing.count += 1
      } else {
        map.set(c.dateIso, {
          dateIso: c.dateIso,
          dateFormatted: c.dateFormatted,
          count: 1,
        })
      }
    })
    return Array.from(map.values()).sort((a, b) => b.dateIso.localeCompare(a.dateIso))
  }, [])

  // ── 2. LISTA DE CHOFERES EN CASCADA (Nivel 2: Filtrado por Fecha elegida) ──
  const driversList = useMemo(() => {
    const pool = CIERRES_ORDENES_TRANSPORTE.filter(
      (c) => selectedDate === 'ALL' || c.dateIso === selectedDate
    )
    const map = new Map<string, { name: string; empresa: string; ci: string; count: number }>()
    pool.forEach((c) => {
      const existing = map.get(c.driverName)
      if (existing) {
        existing.count += 1
      } else {
        map.set(c.driverName, {
          name: c.driverName,
          empresa: c.driverEmpresa,
          ci: c.driverCi,
          count: 1,
        })
      }
    })
    return Array.from(map.values())
  }, [selectedDate])

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

  // ── 3. LISTA DE USUARIOS EN CASCADA (Nivel 3: Filtrado por Fecha + Chofer) ──
  const usersList = useMemo(() => {
    const pool = CIERRES_ORDENES_TRANSPORTE.filter((c) => {
      if (selectedDate !== 'ALL' && c.dateIso !== selectedDate) return false
      if (selectedDriver !== 'ALL' && c.driverName !== selectedDriver) return false
      return true
    })
    const map = new Map<string, { username: string; count: number; cargo: string }>()
    pool.forEach((c) => {
      const user = c.almacen.usuarioLiquidador
      const cargo = c.almacen.firmas.almacen.cargo
      const existing = map.get(user)
      if (existing) {
        existing.count += 1
      } else {
        map.set(user, {
          username: user,
          cargo: cargo || 'Liquidador Almacén',
          count: 1,
        })
      }
    })
    return Array.from(map.values())
  }, [selectedDate, selectedDriver])

  const filteredUsersList = useMemo(() => {
    if (!userSearchQuery.trim()) return usersList
    const q = userSearchQuery.toLowerCase()
    return usersList.filter(
      (u) => u.username.toLowerCase().includes(q) || u.cargo.toLowerCase().includes(q)
    )
  }, [usersList, userSearchQuery])

  // ── 4. LISTA DE CAMIONES EN CASCADA (Nivel 4: Filtrado por Fecha + Chofer + Usuario) ──
  const trucksList = useMemo(() => {
    const pool = CIERRES_ORDENES_TRANSPORTE.filter((c) => {
      if (selectedDate !== 'ALL' && c.dateIso !== selectedDate) return false
      if (selectedDriver !== 'ALL' && c.driverName !== selectedDriver) return false
      if (selectedUser !== 'ALL' && c.almacen.usuarioLiquidador !== selectedUser) return false
      return true
    })
    const map = new Map<string, { plate: string; truckType: string; isCold: boolean; count: number }>()
    pool.forEach((c) => {
      const existing = map.get(c.truckPlate)
      if (existing) {
        existing.count += 1
      } else {
        map.set(c.truckPlate, {
          plate: c.truckPlate,
          truckType: c.truckType,
          isCold: c.truckType.toLowerCase().includes('frio') || c.truckType.toLowerCase().includes('frío'),
          count: 1,
        })
      }
    })
    return Array.from(map.values())
  }, [selectedDate, selectedDriver, selectedUser])

  const filteredTrucksList = useMemo(() => {
    if (!truckSearchQuery.trim()) return trucksList
    const q = truckSearchQuery.toLowerCase()
    return trucksList.filter(
      (t) => t.plate.toLowerCase().includes(q) || t.truckType.toLowerCase().includes(q)
    )
  }, [trucksList, truckSearchQuery])

  // ── 5. LISTA DE DESPACHOS EN CASCADA (Nivel 5: Directamente asociados al Chofer/Fecha/Usuario/Camión) ──
  const ordersList = useMemo(() => {
    const pool = CIERRES_ORDENES_TRANSPORTE.filter((c) => {
      if (selectedDate !== 'ALL' && c.dateIso !== selectedDate) return false
      if (selectedDriver !== 'ALL' && c.driverName !== selectedDriver) return false
      if (selectedUser !== 'ALL' && c.almacen.usuarioLiquidador !== selectedUser) return false
      if (selectedTruck !== 'ALL' && c.truckPlate !== selectedTruck) return false
      return true
    })
    return pool.map((c) => ({
      id: c.id,
      orderCode: c.orderCode,
      driverName: c.driverName,
      dateFormatted: c.dateFormatted,
      statusLabel: c.statusLabel,
      status: c.status,
      routeName: c.routeName,
    }))
  }, [selectedDate, selectedDriver, selectedUser, selectedTruck])

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

  // ── HANDLERS DE SELECCIÓN EN CASCADA ──
  const handleDateChange = (dateIso: string) => {
    setSelectedDate(dateIso)
    setDatePopoverOpen(false)
    if (dateIso !== 'ALL') {
      const validDrivers = CIERRES_ORDENES_TRANSPORTE.filter((c) => c.dateIso === dateIso).map((c) => c.driverName)
      if (selectedDriver !== 'ALL' && !validDrivers.includes(selectedDriver)) {
        setSelectedDriver('ALL')
        setSelectedUser('ALL')
        setSelectedTruck('ALL')
        setSelectedOrderCode('ALL')
      }
    }
  }

  const handleDriverChange = (driverName: string) => {
    setSelectedDriver(driverName)
    setDriverPopoverOpen(false)
    if (driverName !== 'ALL') {
      const pool = CIERRES_ORDENES_TRANSPORTE.filter(
        (c) => (selectedDate === 'ALL' || c.dateIso === selectedDate) && c.driverName === driverName
      )
      const validUsers = pool.map((c) => c.almacen.usuarioLiquidador)
      const validTrucks = pool.map((c) => c.truckPlate)
      const validOrders = pool.map((c) => c.orderCode)

      if (selectedUser !== 'ALL' && !validUsers.includes(selectedUser)) setSelectedUser('ALL')
      if (selectedTruck !== 'ALL' && !validTrucks.includes(selectedTruck)) setSelectedTruck('ALL')
      if (selectedOrderCode !== 'ALL' && !validOrders.includes(selectedOrderCode)) {
        setSelectedOrderCode('ALL')
      }
    }
  }

  const handleUserChange = (user: string) => {
    setSelectedUser(user)
    setUserPopoverOpen(false)
    if (user !== 'ALL') {
      const pool = CIERRES_ORDENES_TRANSPORTE.filter(
        (c) =>
          (selectedDate === 'ALL' || c.dateIso === selectedDate) &&
          (selectedDriver === 'ALL' || c.driverName === selectedDriver) &&
          c.almacen.usuarioLiquidador === user
      )
      const validTrucks = pool.map((c) => c.truckPlate)
      const validOrders = pool.map((c) => c.orderCode)
      if (selectedTruck !== 'ALL' && !validTrucks.includes(selectedTruck)) setSelectedTruck('ALL')
      if (selectedOrderCode !== 'ALL' && !validOrders.includes(selectedOrderCode)) setSelectedOrderCode('ALL')
    }
  }

  const handleTruckChange = (truck: string) => {
    setSelectedTruck(truck)
    setTruckPopoverOpen(false)
    if (truck !== 'ALL') {
      const pool = CIERRES_ORDENES_TRANSPORTE.filter(
        (c) =>
          (selectedDate === 'ALL' || c.dateIso === selectedDate) &&
          (selectedDriver === 'ALL' || c.driverName === selectedDriver) &&
          (selectedUser === 'ALL' || c.almacen.usuarioLiquidador === selectedUser) &&
          c.truckPlate === truck
      )
      const validOrders = pool.map((c) => c.orderCode)
      if (selectedOrderCode !== 'ALL' && !validOrders.includes(selectedOrderCode)) setSelectedOrderCode('ALL')
    }
  }

  const handleOrderChange = (orderCode: string, orderId?: string) => {
    setSelectedOrderCode(orderCode)
    setOrderPopoverOpen(false)
    if (orderId) {
      setSelectedId(orderId)
    } else if (orderCode !== 'ALL') {
      const found = CIERRES_ORDENES_TRANSPORTE.find((c) => c.orderCode === orderCode)
      if (found) setSelectedId(found.id)
    }
  }

  // ── FILTRADO MULTICRITERIO DE CIERRES ──
  const filteredCierres = useMemo(() => {
    return CIERRES_ORDENES_TRANSPORTE.filter((c) => {
      // 1. Filtro de búsqueda libre de texto
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase()
        const matchCode = c.orderCode.toLowerCase().includes(query)
        const matchDriver =
          c.driverName.toLowerCase().includes(query) ||
          c.driverEmpresa.toLowerCase().includes(query)
        const matchTruck =
          c.truckPlate.toLowerCase().includes(query) ||
          c.truckType.toLowerCase().includes(query)
        const matchUser = c.almacen.usuarioLiquidador.toLowerCase().includes(query)
        const matchSupervisor = c.supervisorName.toLowerCase().includes(query)
        const matchRoute = c.routeName.toLowerCase().includes(query)
        const matchProduct = c.almacen.items.some(
          (it) =>
            it.producto.toLowerCase().includes(query) ||
            it.codigo.toLowerCase().includes(query)
        )
        if (
          !matchCode &&
          !matchDriver &&
          !matchTruck &&
          !matchUser &&
          !matchSupervisor &&
          !matchRoute &&
          !matchProduct
        ) {
          return false
        }
      }

      // 2. Filtro de Fecha (puntual)
      if (selectedDate !== 'ALL' && c.dateIso !== selectedDate) {
        return false
      }

      // 3. Filtro de Chofer
      if (selectedDriver !== 'ALL' && c.driverName !== selectedDriver) {
        return false
      }

      // 4. Filtro de Usuario
      if (selectedUser !== 'ALL' && c.almacen.usuarioLiquidador !== selectedUser) {
        return false
      }

      // 5. Filtro de Placa / Camión
      if (selectedTruck !== 'ALL' && c.truckPlate !== selectedTruck) {
        return false
      }

      // 6. Filtro de N° Despacho
      if (selectedOrderCode !== 'ALL' && c.orderCode !== selectedOrderCode) {
        return false
      }

      return true
    })
  }, [
    searchTerm,
    selectedDate,
    selectedDriver,
    selectedUser,
    selectedTruck,
    selectedOrderCode,
  ])

  // Cierre seleccionado activo (garantiza consistencia con la lista filtrada)
  const selectedCierre = useMemo(() => {
    if (filteredCierres.length === 0) return null
    const found = filteredCierres.find((c) => c.id === selectedId)
    return found || filteredCierres[0]
  }, [filteredCierres, selectedId])

  // Total de filtros activos
  const activeFiltersCount = useMemo(() => {
    let count = 0
    if (searchTerm.trim()) count++
    if (selectedDate !== 'ALL') count++
    if (selectedDriver !== 'ALL') count++
    if (selectedUser !== 'ALL') count++
    if (selectedTruck !== 'ALL') count++
    if (selectedOrderCode !== 'ALL') count++
    return count
  }, [
    searchTerm,
    selectedDate,
    selectedDriver,
    selectedUser,
    selectedTruck,
    selectedOrderCode,
  ])

  // Limpiar todos los filtros
  const handleResetFilters = () => {
    setSearchTerm('')
    setSelectedDate('ALL')
    setSelectedDriver('ALL')
    setSelectedUser('ALL')
    setSelectedTruck('ALL')
    setSelectedOrderCode('ALL')
    toast.info('Filtros de búsqueda restablecidos')
  }

  const handlePrint = () => {
    if (!selectedCierre) {
      toast.error('Seleccione un despacho para generar el acta en PDF')
      return
    }
    const tabName =
      activeTab === 'almacen'
        ? 'Almacén'
        : activeTab === 'cobranza'
        ? 'Cobranzas'
        : 'Consolidado'
    toast.info(`Generando Acta de Cierre (${tabName}) en PDF para ${selectedCierre.orderCode}...`)
    imprimirActaCierreSegunTab(selectedCierre, activeTab)
  }

  const handleExportExcelDirect = () => {
    if (!selectedCierre) {
      toast.error('Seleccione un despacho para exportar a Excel')
      return
    }
    if (activeTab === 'almacen') {
      exportarCierreAlmacenIndividualAExcel(selectedCierre)
      toast.success(`Cierre de Almacén (${selectedCierre.orderCode}) exportado a Excel`)
    } else if (activeTab === 'cobranza') {
      exportarCierreCobranzasIndividualAExcel(selectedCierre)
      toast.success(`Cierre de Cobranzas (${selectedCierre.orderCode}) exportado a Excel`)
    } else {
      exportarCierreLogisticoCompletoAExcel(selectedCierre)
      toast.success(`Libro de Cierre Consolidado (${selectedCierre.orderCode}) exportado a Excel`)
    }
  }

  const alm = selectedCierre?.almacen
  const cob = selectedCierre?.cobranza

  // Labels informativos de selección
  const selectedDateObj = datesList.find((d) => d.dateIso === selectedDate)
  const selectedDriverObj = driversList.find((d) => d.name === selectedDriver)
  const selectedUserObj = usersList.find((u) => u.username === selectedUser)
  const selectedTruckObj = trucksList.find((t) => t.plate === selectedTruck)
  const selectedOrderObj = ordersList.find((o) => o.orderCode === selectedOrderCode)

  // Filtrado reactivo de la tabla de productos
  const filteredAlmItems = useMemo(() => {
    if (!alm?.items) return []
    return alm.items.filter((it) => {
      const q = productTableSearch.trim().toLowerCase()
      const matchesSearch =
        !q ||
        it.producto.toLowerCase().includes(q) ||
        it.codigo.toLowerCase().includes(q)
      const matchesFilter =
        productFilterStatus === 'ALL' ||
        (productFilterStatus === 'DEV' && it.cantidadDevuelto > 0) ||
        (productFilterStatus === 'BON' && it.cantidadBonificacion > 0)
      return matchesSearch && matchesFilter
    })
  }, [alm?.items, productTableSearch, productFilterStatus])

  return (
    <>
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* 1. VISTA INTERACTIVA WEB (OCULTA AL IMPRIMIR / DESCARGAR PDF)         */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="print:hidden flex flex-col gap-6 p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto min-h-screen">
        {/* ── CABECERA PRINCIPAL CON TÍTULO Y ACCIONES DE EXPORTACIÓN ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Cierre y Liquidación Logística de OT
              </h1>
              <Badge
                variant="outline"
                className="border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-300"
              >
                1 a 1 con Orden de Transporte
              </Badge>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Liquidación física de carga en almacén y conciliación financiera de cobranzas • Grupo Venado
            </p>
          </div>

          {/* BOTONES DINÁMICOS DE IMPRESIÓN Y EXPORTACIÓN SEGÚN PESTAÑA ACTIVA */}
          <div className="flex items-center gap-2 relative">
            <Button
              variant="outline"
              onClick={handlePrint}
              className="cursor-pointer border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 shadow-xs text-xs font-semibold"
              title={`Descargar documento PDF oficial para el tab ${
                activeTab === 'almacen' ? 'Almacén' : activeTab === 'cobranza' ? 'Cobranzas' : 'Consolidado'
              }`}
            >
              <Download className="mr-1.5 h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <span>
                {activeTab === 'almacen' && 'Descargar PDF (Almacén)'}
                {activeTab === 'cobranza' && 'Descargar PDF (Cobranzas)'}
                {activeTab === 'balance' && 'Descargar PDF (Consolidado)'}
              </span>
            </Button>

            {/* BOTÓN EXCEL SPLIT: CLICK DIRECTO EXPORTA EL TAB ACTUAL, FLECHA ABRE MENÚ CON TODOS */}
            <div className="flex items-center rounded-md shadow-xs">
              <Button
                onClick={handleExportExcelDirect}
                className="bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer rounded-r-none text-xs font-semibold px-3 shadow-xs"
                disabled={!selectedCierre}
                title={`Exportar a Excel (.xls) datos del tab ${
                  activeTab === 'almacen' ? 'Almacén' : activeTab === 'cobranza' ? 'Cobranzas' : 'Consolidado'
                }`}
              >
                <FileSpreadsheet className="mr-1.5 h-4 w-4" />
                <span>
                  {activeTab === 'almacen' && 'Descargar Excel (Almacén)'}
                  {activeTab === 'cobranza' && 'Descargar Excel (Cobranzas)'}
                  {activeTab === 'balance' && 'Descargar Excel (Consolidado)'}
                </span>
              </Button>
              <Button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer rounded-l-none border-l border-emerald-500/60 px-2 shadow-xs"
                disabled={!selectedCierre}
                title="Más formatos y hojas de exportación Excel"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>

            {showExportMenu && selectedCierre && (
              <div
                className="absolute right-0 top-10 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl z-50 dark:border-slate-800 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-100"
                onMouseLeave={() => setShowExportMenu(false)}
              >
                <div className="px-2 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Opciones de Exportación Excel
                </div>
                <button
                  onClick={() => {
                    exportarCierreLogisticoCompletoAExcel(selectedCierre)
                    setShowExportMenu(false)
                    toast.success('Libro de Cierre Consolidado descargado exitosamente')
                  }}
                  className={cn(
                    "w-full text-left px-2.5 py-2 text-xs rounded hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between font-medium cursor-pointer",
                    activeTab === 'balance' && 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 font-bold'
                  )}
                >
                  <span>📊 Libro Completo (2 Hojas)</span>
                  <Badge variant="secondary" className="text-[10px]">
                    2 Hojas
                  </Badge>
                </button>
                <button
                  onClick={() => {
                    exportarCierreAlmacenIndividualAExcel(selectedCierre)
                    setShowExportMenu(false)
                    toast.success('Cierre de Almacén descargado')
                  }}
                  className={cn(
                    "w-full text-left px-2.5 py-2 text-xs rounded hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer",
                    activeTab === 'almacen' && 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 font-bold'
                  )}
                >
                  <Package className="h-3.5 w-3.5 text-blue-600" />
                  <span>Solo Cierre Almacén (Físico)</span>
                </button>
                <button
                  onClick={() => {
                    exportarCierreCobranzasIndividualAExcel(selectedCierre)
                    setShowExportMenu(false)
                    toast.success('Cierre de Cobranzas descargado')
                  }}
                  className={cn(
                    "w-full text-left px-2.5 py-2 text-xs rounded hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer",
                    activeTab === 'cobranza' && 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 font-bold'
                  )}
                >
                  <Banknote className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Solo Cierre Cobranzas (Caja)</span>
                </button>
              </div>
            )}
          </div>
        </div>

      {/* ── PANEL DE FILTROS DE BÚSQUEDA Y SELECCIÓN (IDÉNTICO A IMÁGENES OPERATIVAS) ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 md:p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
        {/* Cabecera del Panel de Filtros */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Filtros de Búsqueda de Cierre Logístico (Ver Cierre)
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            Filtros en cascada: Fecha → Chofer → Usuario → Placa → N° Despacho
          </span>
        </div>

        {/* GRILLA DE LOS 5 CAMPOS DE FILTRADO CON SELECTS Y BUSCADORES EN CASCADA */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* 1. FILTRO: FECHA* (Nivel 1 de Cascada) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <span>Fecha*</span>
              {selectedDate !== 'ALL' && (
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />
              )}
            </label>
            <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className={cn(
                      'flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-xs text-slate-800 shadow-xs hover:bg-slate-100/80 focus-visible:outline-none cursor-pointer text-left dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-800',
                      selectedDate !== 'ALL'
                        ? 'border-indigo-500 bg-indigo-50/40 text-indigo-700 font-semibold dark:border-indigo-500/70 dark:bg-indigo-950/40 dark:text-indigo-300'
                        : 'text-slate-600 dark:text-slate-300'
                    )}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <CalendarIcon size={14} className="shrink-0 text-slate-400" />
                      <span className="truncate">
                        {selectedDateObj ? selectedDateObj.dateFormatted : 'Todas las fechas'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {selectedDate !== 'ALL' && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDateChange('ALL')
                          }}
                          className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                          title="Quitar filtro de fecha"
                        >
                          <X size={13} />
                        </span>
                      )}
                      <ChevronDown size={13} className="opacity-50" />
                    </div>
                  </button>
                }
              />
              <PopoverContent className="w-auto p-0 border-slate-200 dark:border-slate-800" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate !== 'ALL' ? parseISO(selectedDate) : undefined}
                  onSelect={(date) => {
                    if (date) {
                      handleDateChange(format(date, 'yyyy-MM-dd'))
                    } else {
                      handleDateChange('ALL')
                    }
                  }}
                  defaultMonth={selectedDate !== 'ALL' ? parseISO(selectedDate) : new Date(2026, 1)}
                  locale={es}
                  className="rounded-md"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* 2. FILTRO: CHOFER* (Nivel 2 de Cascada) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <span>Chofer*</span>
              {selectedDriver !== 'ALL' && (
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />
              )}
            </label>
            <Popover open={driverPopoverOpen} onOpenChange={setDriverPopoverOpen}>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className={cn(
                      'flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-xs text-slate-800 shadow-xs hover:bg-slate-100/80 focus-visible:outline-none cursor-pointer text-left dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-800',
                      selectedDriver !== 'ALL'
                        ? 'border-indigo-500 bg-indigo-50/40 text-indigo-700 font-semibold dark:border-indigo-500/70 dark:bg-indigo-950/40 dark:text-indigo-300'
                        : 'text-slate-600 dark:text-slate-300'
                    )}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <User size={14} className="shrink-0 text-slate-400" />
                      <span className="truncate">
                        {selectedDriverObj
                          ? `${selectedDriverObj.name} - ${selectedDriverObj.empresa}`
                          : 'Todos los choferes'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {selectedDriver !== 'ALL' && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDriverChange('ALL')
                          }}
                          className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                          title="Quitar filtro de chofer"
                        >
                          <X size={13} />
                        </span>
                      )}
                      <ChevronDown size={13} className="opacity-50" />
                    </div>
                  </button>
                }
              />
              <PopoverContent className="w-80 p-2" align="start">
                <div className="relative mb-2">
                  <Search
                    size={13}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <Input
                    placeholder="Buscar chofer por nombre o empresa..."
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

                <button
                  type="button"
                  onClick={() => handleDriverChange('ALL')}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer',
                    selectedDriver === 'ALL' &&
                      'bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <User size={13} />
                    Todos los choferes
                  </span>
                  {selectedDriver === 'ALL' && <Check size={13} />}
                </button>

                <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                  {filteredDriversList.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-400">
                      No se encontraron choferes disponibles
                    </div>
                  ) : (
                    filteredDriversList.map((d) => {
                      const isSel = selectedDriver === d.name
                      return (
                        <button
                          key={d.name}
                          type="button"
                          onClick={() => handleDriverChange(d.name)}
                          className={cn(
                            'flex w-full items-center justify-between rounded-md p-2 text-xs transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer',
                            isSel &&
                              'bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                          )}
                        >
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                              <span>{d.name}</span>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px] py-0 px-1',
                                  d.empresa === 'IVSA'
                                    ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300'
                                    : 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300'
                                )}
                              >
                                {d.empresa}
                              </Badge>
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              CI: {d.ci} • {d.count} despacho{d.count !== 1 ? 's' : ''}
                            </div>
                          </div>
                          {isSel && (
                            <Check
                              size={14}
                              className="text-indigo-600 dark:text-indigo-400 shrink-0 ml-2"
                            />
                          )}
                        </button>
                      )
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* 3. FILTRO: USUARIO* (Nivel 3 de Cascada) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <span>Usuario*</span>
              {selectedUser !== 'ALL' && (
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />
              )}
            </label>
            <Popover open={userPopoverOpen} onOpenChange={setUserPopoverOpen}>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className={cn(
                      'flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-xs text-slate-800 shadow-xs hover:bg-slate-100/80 focus-visible:outline-none cursor-pointer text-left dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-800',
                      selectedUser !== 'ALL'
                        ? 'border-indigo-500 bg-indigo-50/40 text-indigo-700 font-semibold dark:border-indigo-500/70 dark:bg-indigo-950/40 dark:text-indigo-300'
                        : 'text-slate-600 dark:text-slate-300'
                    )}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <UserCheck size={14} className="shrink-0 text-slate-400" />
                      <span className="truncate font-mono">
                        {selectedUserObj ? selectedUserObj.username : 'Todos los usuarios'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {selectedUser !== 'ALL' && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            handleUserChange('ALL')
                          }}
                          className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                          title="Quitar filtro de usuario"
                        >
                          <X size={13} />
                        </span>
                      )}
                      <ChevronDown size={13} className="opacity-50" />
                    </div>
                  </button>
                }
              />
              <PopoverContent className="w-72 p-2" align="start">
                <div className="relative mb-2">
                  <Search
                    size={13}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <Input
                    placeholder="Buscar usuario..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="h-8 pl-8 pr-7 text-xs bg-slate-50 dark:bg-slate-950"
                    autoFocus
                  />
                  {userSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setUserSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleUserChange('ALL')}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer',
                    selectedUser === 'ALL' &&
                      'bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <UserCheck size={13} />
                    Todos los usuarios
                  </span>
                  {selectedUser === 'ALL' && <Check size={13} />}
                </button>

                <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                  {filteredUsersList.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-400">
                      No hay usuarios para esta selección
                    </div>
                  ) : (
                    filteredUsersList.map((u) => {
                      const isSel = selectedUser === u.username
                      return (
                        <button
                          key={u.username}
                          type="button"
                          onClick={() => handleUserChange(u.username)}
                          className={cn(
                            'flex w-full items-center justify-between rounded-md p-2 text-xs transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer',
                            isSel &&
                              'bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                          )}
                        >
                          <div>
                            <div className="font-mono font-bold text-slate-900 dark:text-slate-100">
                              {u.username}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {u.cargo} • {u.count} cierre{u.count !== 1 ? 's' : ''}
                            </div>
                          </div>
                          {isSel && (
                            <Check
                              size={14}
                              className="text-indigo-600 dark:text-indigo-400 shrink-0 ml-2"
                            />
                          )}
                        </button>
                      )
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* 4. FILTRO: PLACA/CAMIÓN* (Nivel 4 de Cascada) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <span>Placa/Camion*</span>
              {selectedTruck !== 'ALL' && (
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />
              )}
            </label>
            <Popover open={truckPopoverOpen} onOpenChange={setTruckPopoverOpen}>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className={cn(
                      'flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-xs text-slate-800 shadow-xs hover:bg-slate-100/80 focus-visible:outline-none cursor-pointer text-left dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-800',
                      selectedTruck !== 'ALL'
                        ? 'border-indigo-500 bg-indigo-50/40 text-indigo-700 font-semibold dark:border-indigo-500/70 dark:bg-indigo-950/40 dark:text-indigo-300'
                        : 'text-slate-600 dark:text-slate-300'
                    )}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Truck size={14} className="shrink-0 text-slate-400" />
                      <span className="truncate font-mono">
                        {selectedTruckObj
                          ? `${selectedTruckObj.plate} ${selectedTruckObj.truckType}`
                          : 'Todas las placas'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {selectedTruck !== 'ALL' && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            handleTruckChange('ALL')
                          }}
                          className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                          title="Quitar filtro de placa"
                        >
                          <X size={13} />
                        </span>
                      )}
                      <ChevronDown size={13} className="opacity-50" />
                    </div>
                  </button>
                }
              />
              <PopoverContent className="w-80 p-2" align="start">
                <div className="relative mb-2">
                  <Search
                    size={13}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <Input
                    placeholder="Buscar placa o modelo de camión..."
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

                <button
                  type="button"
                  onClick={() => handleTruckChange('ALL')}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer',
                    selectedTruck === 'ALL' &&
                      'bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <Truck size={13} />
                    Todas las placas
                  </span>
                  {selectedTruck === 'ALL' && <Check size={13} />}
                </button>

                <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
                  {filteredTrucksList.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-400">
                      No hay placas para este criterio
                    </div>
                  ) : (
                    filteredTrucksList.map((t) => {
                      const isSel = selectedTruck === t.plate
                      return (
                        <button
                          key={t.plate}
                          type="button"
                          onClick={() => handleTruckChange(t.plate)}
                          className={cn(
                            'flex w-full items-center justify-between rounded-md p-2 text-xs transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer',
                            isSel &&
                              'bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                          )}
                        >
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                                {t.plate}
                              </span>
                              {t.isCold && (
                                <Badge
                                  variant="outline"
                                  className="border-blue-200 bg-blue-50 text-[10px] text-blue-700 py-0 px-1 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300"
                                >
                                  <Snowflake className="h-2.5 w-2.5 mr-0.5 inline" /> Frío
                                </Badge>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {t.truckType} • {t.count} despacho{t.count !== 1 ? 's' : ''}
                            </div>
                          </div>
                          {isSel && (
                            <Check
                              size={14}
                              className="text-indigo-600 dark:text-indigo-400 shrink-0 ml-2"
                            />
                          )}
                        </button>
                      )
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* 5. FILTRO: N° DESPACHO* (Nivel 5 de Cascada - Vinculado al Chofer/Fecha) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <span>N° Despacho*</span>
              {selectedOrderCode !== 'ALL' && (
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />
              )}
            </label>
            <Popover open={orderPopoverOpen} onOpenChange={setOrderPopoverOpen}>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className={cn(
                      'flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-xs text-slate-800 shadow-xs hover:bg-slate-100/80 focus-visible:outline-none cursor-pointer text-left dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-800',
                      selectedOrderCode !== 'ALL'
                        ? 'border-indigo-500 bg-indigo-50/40 text-indigo-700 font-semibold dark:border-indigo-500/70 dark:bg-indigo-950/40 dark:text-indigo-300'
                        : 'text-slate-600 dark:text-slate-300'
                    )}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Hash size={14} className="shrink-0 text-slate-400" />
                      <span className="truncate font-mono font-bold">
                        {selectedOrderObj ? selectedOrderObj.orderCode : 'Todos los despachos'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {selectedOrderCode !== 'ALL' && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOrderChange('ALL')
                          }}
                          className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                          title="Quitar filtro de despacho"
                        >
                          <X size={13} />
                        </span>
                      )}
                      <ChevronDown size={13} className="opacity-50" />
                    </div>
                  </button>
                }
              />
              <PopoverContent className="w-80 p-2" align="start">
                <div className="relative mb-2">
                  <Search
                    size={13}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <Input
                    placeholder="Buscar N° Despacho o ruta..."
                    value={orderSearchQuery}
                    onChange={(e) => setOrderSearchQuery(e.target.value)}
                    className="h-8 pl-8 pr-7 text-xs bg-slate-50 dark:bg-slate-950"
                    autoFocus
                  />
                  {orderSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setOrderSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleOrderChange('ALL')}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer',
                    selectedOrderCode === 'ALL' &&
                      'bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <FileText size={13} />
                    Todos los despachos
                  </span>
                  {selectedOrderCode === 'ALL' && <Check size={13} />}
                </button>

                <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                  {filteredOrdersList.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-400">
                      No hay despachos asociados al chofer/criterio seleccionado
                    </div>
                  ) : (
                    filteredOrdersList.map((o) => {
                      const isSel = selectedOrderCode === o.orderCode
                      return (
                        <button
                          key={o.orderCode}
                          type="button"
                          onClick={() => handleOrderChange(o.orderCode, o.id)}
                          className={cn(
                            'flex w-full items-center justify-between rounded-md p-2 text-xs transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer',
                            isSel &&
                              'bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                          )}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                                {o.orderCode}
                              </span>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px] py-0 px-1',
                                  o.status === 'LIQUIDATED'
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300'
                                    : o.status === 'OBSERVED'
                                    ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300'
                                    : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                )}
                              >
                                {o.statusLabel}
                              </Badge>
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-[220px]">
                              {o.driverName} • {o.routeName}
                            </div>
                          </div>
                          {isSel && (
                            <Check
                              size={14}
                              className="text-indigo-600 dark:text-indigo-400 shrink-0 ml-2"
                            />
                          )}
                        </button>
                      )
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* ── BARRA INFERIOR DE BÚSQUEDA GLOBAL RÁPIDA, CHIPS Y RESETEO ── */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          {/* Buscador de texto libre */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <Input
              placeholder="Buscador rápido: OT, producto, chofer, cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-8 text-xs h-9 bg-slate-50/50 dark:bg-slate-800/50"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Chips de filtros activos y Contador */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className={cn(
                'text-xs py-1 px-2 font-medium',
                filteredCierres.length > 0
                  ? 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300'
              )}
            >
              {filteredCierres.length} cierre{filteredCierres.length !== 1 ? 's' : ''}{' '}
              encontrado{filteredCierres.length !== 1 ? 's' : ''}
            </Badge>

            {activeFiltersCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="h-8 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30 cursor-pointer"
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Limpiar Filtros ({activeFiltersCount})
              </Button>
            )}
          </div>
        </div>

        {/* ── SELECTOR RÁPIDO ENTRE DESPACHOS COINCIDENTES ── */}
        {filteredCierres.length > 1 && (
          <div className="pt-2 flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
              Despachos filtrados:
            </span>
            {filteredCierres.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap border',
                  c.id === selectedCierre?.id
                    ? 'border-indigo-600 bg-indigo-600 text-white shadow-xs font-semibold'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                )}
              >
                <Truck className="h-3.5 w-3.5 opacity-90" />
                <span>OT: {c.orderCode}</span>
                <span className="opacity-75 text-[11px]">({c.driverName.split(' ')[0]})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── SI NO HAY CIERRES QUE COINCIDAN CON LOS FILTROS ── */}
      {!selectedCierre ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900 my-8">
          <AlertTriangle className="mx-auto h-12 w-12 text-amber-500 mb-3" />
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            No se encontraron cierres logísticos con los filtros seleccionados
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Intente ajustar los parámetros de fecha, chofer, usuario, placa o N° de despacho, o limpie los filtros para ver todos los registros disponibles.
          </p>
          <Button
            onClick={handleResetFilters}
            className="mt-5 bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Restablecer todos los filtros
          </Button>
        </div>
      ) : (
        <>
          {/* ── TARJETA DE DATOS OPERATIVOS DEL DESPACHO SELECCIONADO ── */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-slate-200/80 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Despacho Activo:
                </span>
                <span className="text-sm font-bold font-mono text-indigo-700 dark:text-indigo-400">
                  {selectedCierre.orderCode}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  • {selectedCierre.routeName}
                </span>
              </div>

              <Badge
                variant="outline"
                className={cn(
                  'w-fit text-xs font-semibold px-2.5 py-0.5',
                  selectedCierre.status === 'LIQUIDATED'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : selectedCierre.status === 'OBSERVED'
                    ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
                    : 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                )}
              >
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                Estado: {selectedCierre.statusLabel}
              </Badge>
            </div>

            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div>
                <span className="text-[11px] font-medium text-slate-400 block">N° Despacho / OT</span>
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 font-mono">
                  {selectedCierre.orderCode}
                </span>
              </div>
              <div>
                <span className="text-[11px] font-medium text-slate-400 block">Fecha de Salida</span>
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                  <CalendarIcon className="h-3 w-3 text-slate-400" />
                  {selectedCierre.dateFormatted}
                </span>
              </div>
              <div>
                <span className="text-[11px] font-medium text-slate-400 block">Chofer Responsable</span>
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate block">
                  {selectedCierre.driverName}{' '}
                  <span className="text-[10px] text-blue-600 font-normal">
                    ({selectedCierre.driverEmpresa})
                  </span>
                </span>
              </div>
              <div>
                <span className="text-[11px] font-medium text-slate-400 block">Placa / Vehículo</span>
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 font-mono">
                  {selectedCierre.truckPlate} ({selectedCierre.truckType})
                </span>
              </div>
              <div>
                <span className="text-[11px] font-medium text-slate-400 block">Usuario</span>
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 font-mono">
                  {alm?.usuarioLiquidador}
                </span>
              </div>
            </div>
          </div>

          {/* ── CONTENIDO PRINCIPAL CON PESTAÑAS ── */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
            <TabsList className="grid w-full grid-cols-3 max-w-xl bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
              <TabsTrigger
                value="almacen"
                className="text-xs font-medium cursor-pointer gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900"
              >
                <Package className="h-4 w-4 text-blue-600" />
                1. Cierre Almacén (Físico)
              </TabsTrigger>
              <TabsTrigger
                value="cobranza"
                className="text-xs font-medium cursor-pointer gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900"
              >
                <Banknote className="h-4 w-4 text-emerald-600" />
                2. Cierre Cobranzas (Caja)
              </TabsTrigger>
              <TabsTrigger
                value="balance"
                className="text-xs font-medium cursor-pointer gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900"
              >
                <Receipt className="h-4 w-4 text-purple-600" />
                3. Balance Consolidado
              </TabsTrigger>
            </TabsList>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* TAB 1: CIERRE LOGÍSTICO ALMACÉN (image.png)                         */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <TabsContent value="almacen" className="mt-4 space-y-5">
          {/* BANNER DE RESUMEN DE ALMACÉN (TODO EN BOLIVIANOS - BS) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 dark:border-blue-950 dark:bg-blue-950/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Total Despacho</span>
                <Badge variant="outline" className="text-[10px] py-0 px-1 border-blue-200 text-blue-700 bg-blue-100/50 dark:border-blue-950 dark:text-blue-300">Bs (Bolivianos)</Badge>
              </div>
              <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono block mt-1">
                {alm.totales.totalCantidadDespacho} <span className="text-xs font-normal text-slate-500">unidades</span>
              </span>
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300 block mt-1 font-mono">
                Valor Total: <strong className="text-blue-700 dark:text-blue-300 font-bold">Bs {alm.totales.totalValorDespacho.toFixed(2)}</strong>
              </span>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 dark:border-emerald-950 dark:bg-emerald-950/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Total Facturado</span>
                <Badge variant="outline" className="text-[10px] py-0 px-1 border-emerald-200 text-emerald-700 bg-emerald-100/50 dark:border-emerald-900 dark:text-emerald-300">Bs (Bolivianos)</Badge>
              </div>
              <span className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 font-mono block mt-1">
                {alm.totales.totalCantidadFacturado} <span className="text-xs font-normal text-slate-500">unidades</span>
              </span>
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300 block mt-1 font-mono">
                Valor Total: <strong className="text-emerald-700 dark:text-emerald-300 font-bold">Bs {alm.totales.totalValorFacturado.toFixed(2)}</strong>
              </span>
            </div>

            <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-4 dark:border-purple-950 dark:bg-purple-950/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-purple-600 dark:text-purple-400">Bonificaciones</span>
                <Badge variant="outline" className="text-[10px] py-0 px-1 border-purple-200 text-purple-700 bg-purple-100/50 dark:border-purple-900 dark:text-purple-300">Bs (Bolivianos)</Badge>
              </div>
              <span className="text-2xl font-bold text-purple-700 dark:text-purple-300 font-mono block mt-1">
                {alm.totales.totalCantidadBonificacion} <span className="text-xs font-normal text-slate-500">unidades</span>
              </span>
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300 block mt-1 font-mono">
                Valor Total: <strong className="text-purple-700 dark:text-purple-300 font-bold">Bs {alm.totales.totalValorBonificacion.toFixed(2)}</strong>
              </span>
            </div>

            <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4 dark:border-amber-950 dark:bg-amber-950/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Retorno / Devuelto</span>
                <Badge variant="outline" className="text-[10px] py-0 px-1 border-amber-200 text-amber-700 bg-amber-100/50 dark:border-amber-900 dark:text-amber-300">Bs (Bolivianos)</Badge>
              </div>
              <span className="text-2xl font-bold text-amber-700 dark:text-amber-300 font-mono block mt-1">
                {alm.totales.totalCantidadDevuelto} <span className="text-xs font-normal text-slate-500">unidades</span>
              </span>
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300 block mt-1 font-mono">
                Valor Total: <strong className="text-amber-700 dark:text-amber-300 font-bold">Bs {alm.totales.totalValorDevuelto.toFixed(2)}</strong>
              </span>
            </div>
          </div>

          {/* TABLA PRINCIPAL DE ALMACÉN (IDÉNTICA A LA IMAGEN) */}
          {/* TABLA PRINCIPAL DE ALMACÉN CON BUSCADOR Y FILTROS RÁPIDOS */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs dark:border-slate-800 dark:bg-slate-900">
            {/* Header de la tabla con buscador y filtros rápidos */}
            <div className="p-4 border-b border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/40 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-blue-600 shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Conciliación de Carga y Retorno Físico por Producto
                  </h3>
                  <span className="text-xs text-slate-500 font-mono">
                    Mostrando {filteredAlmItems.length} de {alm.items.length} productos registrados
                  </span>
                </div>
              </div>

              {/* Barra de Búsqueda y Filtros Rápidos */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center bg-slate-200/60 dark:bg-slate-800 p-0.5 rounded-lg text-xs">
                  <button
                    type="button"
                    onClick={() => setProductFilterStatus('ALL')}
                    className={cn(
                      'px-2.5 py-1 rounded-md transition-colors cursor-pointer font-medium text-xs',
                      productFilterStatus === 'ALL'
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    )}
                  >
                    Todos ({alm.items.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setProductFilterStatus('DEV')}
                    className={cn(
                      'px-2.5 py-1 rounded-md transition-colors cursor-pointer font-medium text-xs flex items-center gap-1',
                      productFilterStatus === 'DEV'
                        ? 'bg-amber-500 text-white shadow-xs font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    )}
                  >
                    <span>Con Devolución</span>
                    <span className="text-[10px] bg-amber-600/30 px-1 rounded-full">
                      {alm.items.filter((i) => i.cantidadDevuelto > 0).length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setProductFilterStatus('BON')}
                    className={cn(
                      'px-2.5 py-1 rounded-md transition-colors cursor-pointer font-medium text-xs flex items-center gap-1',
                      productFilterStatus === 'BON'
                        ? 'bg-purple-600 text-white shadow-xs font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    )}
                  >
                    <span>Con Bonif.</span>
                    <span className="text-[10px] bg-purple-700/30 px-1 rounded-full">
                      {alm.items.filter((i) => i.cantidadBonificacion > 0).length}
                    </span>
                  </button>
                </div>

                <div className="relative w-56">
                  <Search
                    size={13}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <Input
                    placeholder="Buscar producto o SKU..."
                    value={productTableSearch}
                    onChange={(e) => setProductTableSearch(e.target.value)}
                    className="h-8 pl-8 pr-7 text-xs bg-white dark:bg-slate-950"
                  />
                  {productTableSearch && (
                    <button
                      type="button"
                      onClick={() => setProductTableSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Contenedor de la tabla con scroll suave y header sticky */}
            <div className="overflow-x-auto max-h-[580px] overflow-y-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 z-10 shadow-xs">
                  <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300">
                    <th className="p-2.5">N°</th>
                    <th className="p-2.5">Código</th>
                    <th className="p-2.5 min-w-[240px]">Producto</th>
                    <th className="p-2.5 text-center">U.M.</th>
                    <th className="p-2.5 text-right bg-blue-50/70 dark:bg-blue-950/40">Cant. Despacho</th>
                    <th className="p-2.5 text-right bg-emerald-50/70 dark:bg-emerald-950/40">Cant. Facturado</th>
                    <th className="p-2.5 text-right bg-purple-50/70 dark:bg-purple-950/40">Cant. Bonif.</th>
                    <th className="p-2.5 text-right font-bold bg-slate-200/80 dark:bg-slate-700/80">Facturado Total</th>
                    <th className="p-2.5 text-right bg-amber-50/70 dark:bg-amber-950/40">Cant. Devuelto</th>
                    <th className="p-2.5 text-right">Cant. Faltante</th>
                    <th className="p-2.5 text-right">Cant. Sobrante</th>
                    <th className="p-2.5 text-right font-medium">Valor Despacho</th>
                    <th className="p-2.5 text-right font-medium">Valor Facturado</th>
                    <th className="p-2.5 text-right font-medium">Valor Bonif.</th>
                    <th className="p-2.5 text-right font-medium">Valor Devuelto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono dark:divide-slate-800">
                  {filteredAlmItems.length === 0 ? (
                    <tr>
                      <td colSpan={15} className="p-8 text-center text-slate-400 font-sans">
                        No se encontraron productos que coincidan con los criterios de búsqueda.
                      </td>
                    </tr>
                  ) : (
                    filteredAlmItems.map((it, idx) => {
                      const hasDevolucion = it.cantidadDevuelto > 0
                      return (
                        <tr
                          key={it.codigo}
                          className={cn(
                            'hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors',
                            hasDevolucion && 'bg-amber-50/30 dark:bg-amber-950/10'
                          )}
                        >
                          <td className="p-2.5 text-slate-400 text-center">{idx + 1}</td>
                          <td className="p-2.5 font-bold text-slate-700 dark:text-slate-300">{it.codigo}</td>
                          <td className="p-2.5 font-sans font-medium text-slate-900 dark:text-slate-100">{it.producto}</td>
                          <td className="p-2.5 text-center text-slate-500">{it.um}</td>
                          <td className="p-2.5 text-right text-blue-700 dark:text-blue-300 font-medium bg-blue-50/30 dark:bg-blue-950/10">{it.cantidadDespacho}</td>
                          <td className="p-2.5 text-right text-emerald-700 dark:text-emerald-300 font-medium bg-emerald-50/30 dark:bg-emerald-950/10">{it.cantidadFacturado}</td>
                          <td className="p-2.5 text-right text-purple-700 dark:text-purple-300 font-medium bg-purple-50/30 dark:bg-purple-950/10">{it.cantidadBonificacion}</td>
                          <td className="p-2.5 text-right font-bold text-slate-900 dark:text-slate-100 bg-slate-100/50 dark:bg-slate-800/30">{it.facturadoTotal}</td>
                          <td className={cn(
                            'p-2.5 text-right font-medium bg-amber-50/30 dark:bg-amber-950/10',
                            hasDevolucion ? 'text-amber-700 dark:text-amber-300 font-bold' : 'text-slate-400'
                          )}>
                            {it.cantidadDevuelto}
                          </td>
                          <td className="p-2.5 text-right text-slate-400">{it.cantidadFaltante || '-'}</td>
                          <td className="p-2.5 text-right text-slate-400">{it.cantidadSobrante || '-'}</td>
                          <td className="p-2.5 text-right font-semibold text-slate-700 dark:text-slate-300">Bs {it.valorDespacho.toFixed(2)}</td>
                          <td className="p-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">Bs {it.valorFacturado.toFixed(2)}</td>
                          <td className="p-2.5 text-right text-purple-600 dark:text-purple-400">Bs {it.valorBonificacion.toFixed(2)}</td>
                          <td className={cn(
                            'p-2.5 text-right',
                            hasDevolucion ? 'font-bold text-amber-700 dark:text-amber-400' : 'text-slate-400'
                          )}>
                            Bs {it.valorDevuelto.toFixed(2)}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
                <tfoot className="sticky bottom-0 bg-slate-100 dark:bg-slate-800 z-10 shadow-md">
                  <tr className="border-t-2 border-slate-300 font-mono font-bold text-xs text-slate-900 dark:border-slate-700 dark:text-slate-100">
                    <td colSpan={4} className="p-3 text-center uppercase font-sans tracking-wide">
                      Total General ({alm.items.length} ítems)
                    </td>
                    <td className="p-3 text-right text-blue-700 dark:text-blue-300">{alm.totales.totalCantidadDespacho}</td>
                    <td className="p-3 text-right text-emerald-700 dark:text-emerald-300">{alm.totales.totalCantidadFacturado}</td>
                    <td className="p-3 text-right text-purple-700 dark:text-purple-300">{alm.totales.totalCantidadBonificacion}</td>
                    <td className="p-3 text-right text-slate-900 dark:text-slate-100">{alm.totales.totalFacturadoTotal}</td>
                    <td className="p-3 text-right text-amber-700 dark:text-amber-300">{alm.totales.totalCantidadDevuelto}</td>
                    <td className="p-3 text-right text-slate-400">{alm.totales.totalCantidadFaltante}</td>
                    <td className="p-3 text-right text-slate-400">{alm.totales.totalCantidadSobrante}</td>
                    <td className="p-3 text-right">Bs {alm.totales.totalValorDespacho.toFixed(2)}</td>
                    <td className="p-3 text-right text-emerald-600 dark:text-emerald-400">Bs {alm.totales.totalValorFacturado.toFixed(2)}</td>
                    <td className="p-3 text-right text-purple-600 dark:text-purple-400">Bs {alm.totales.totalValorBonificacion.toFixed(2)}</td>
                    <td className="p-3 text-right text-amber-600 dark:text-amber-400">Bs {alm.totales.totalValorDevuelto.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* CAJAS DE FIRMAS (ALMACÉN Y CHOFER) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
              <div className="flex items-center gap-2 mb-2">
                <UserCheck className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Conformidad Chofer Entrega
                </span>
              </div>
              <div className="h-20 rounded border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center dark:border-slate-800 dark:bg-slate-800/40">
                <span className="text-xs italic text-slate-400 font-serif">
                  Firma Digital Registrada: {alm.firmas.chofer.nombre}
                </span>
              </div>
              <div className="mt-2 text-center text-xs text-slate-500">
                <strong>{alm.firmas.chofer.nombre}</strong> (CI: {alm.firmas.chofer.ci})
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="h-4 w-4 text-blue-600" />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Conformidad Almacén Rampa
                </span>
              </div>
              <div className="h-20 rounded border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center dark:border-slate-800 dark:bg-slate-800/40">
                <span className="text-xs italic text-slate-400 font-serif">
                  Firma Digital: {alm.firmas.almacen.nombre}
                </span>
              </div>
              <div className="mt-2 text-center text-xs text-slate-500">
                <strong>{alm.firmas.almacen.nombre}</strong> ({alm.firmas.almacen.cargo})
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* TAB 2: CIERRE LOGÍSTICO COBRANZAS (cierre_logistico_cobranza1 & 2)   */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <TabsContent value="cobranza" className="mt-4 space-y-6">
          {/* BLOQUE SUPERIOR: CUADRE DE 3 COLUMNAS IDÉNTICO AL SISTEMA */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. Resumen Facturación */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                  Resumen Facturación
                </span>
                <Badge variant="secondary" className="text-[10px]">Venta Neta</Badge>
              </div>
              <div className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-slate-50 dark:border-slate-800/50">
                  <span className="font-bold text-slate-900 dark:text-slate-100">IMPORTE FACTURADO</span>
                  <span className="font-bold font-mono text-sm text-slate-900 dark:text-slate-100">
                    Bs {cob.resumenFinanciero.importeFacturado.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 text-slate-600 dark:text-slate-400">
                  <span>Importe Bonificado</span>
                  <span className="font-mono">Bs {cob.resumenFinanciero.importeBonificado.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center py-1 text-slate-600 dark:text-slate-400">
                  <span>Importe Entregado (F+B)</span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                    Bs {cob.resumenFinanciero.importeEntregado.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 text-slate-600 dark:text-slate-400">
                  <span>Importe Devuelto</span>
                  <span className="font-mono text-rose-600">Bs {cob.resumenFinanciero.importeDevuelto.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center py-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">Valor Despacho Total</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    Bs {cob.resumenFinanciero.valorDespacho.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Recaudación y Medios de Pago */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/20 p-4 dark:border-emerald-950 dark:bg-emerald-950/10 shadow-xs">
              <div className="flex items-center justify-between pb-2 border-b border-emerald-100 dark:border-emerald-900/50">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                  Recaudación y Medios de Pago
                </span>
                <Badge className="bg-emerald-600 text-white text-[10px]">Caja</Badge>
              </div>
              <div className="mt-3 space-y-1.5 text-xs">
                <div className="flex justify-between items-center py-0.5 text-slate-700 dark:text-slate-300">
                  <span className="flex items-center gap-1.5"><Coins className="h-3.5 w-3.5 text-amber-600" /> Efectivo</span>
                  <span className="font-mono font-medium">Bs {cob.resumenCobranzas.efectivo.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center py-0.5 text-slate-700 dark:text-slate-300">
                  <span className="flex items-center gap-1.5"><Landmark className="h-3.5 w-3.5 text-blue-600" /> Transferencia</span>
                  <span className="font-mono font-medium">Bs {cob.resumenCobranzas.transferencia.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center py-0.5 text-slate-700 dark:text-slate-300">
                  <span className="flex items-center gap-1.5"><QrCode className="h-3.5 w-3.5 text-indigo-600" /> Qr</span>
                  <span className="font-mono font-medium">Bs {cob.resumenCobranzas.qr.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center py-0.5 text-slate-700 dark:text-slate-300">
                  <span className="flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5 text-purple-600" /> Cheque</span>
                  <span className="font-mono font-medium">Bs {cob.resumenCobranzas.cheque.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-t border-emerald-200/60 dark:border-emerald-900/60 font-bold bg-emerald-100/60 dark:bg-emerald-950/40 px-2 rounded">
                  <span className="text-emerald-900 dark:text-emerald-200">Cobranza Chofer</span>
                  <span className="font-mono text-emerald-900 dark:text-emerald-200 text-sm">
                    Bs {cob.resumenCobranzas.cobranzaChofer.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-0.5 text-slate-700 dark:text-slate-300 pt-1">
                  <span>Crédito (A Plazo)</span>
                  <span className="font-mono font-medium">Bs {cob.resumenCobranzas.credito.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center py-0.5 text-slate-700 dark:text-slate-300">
                  <span>Cobranza Cobrador</span>
                  <span className="font-mono font-medium">Bs {cob.resumenCobranzas.cobranzaCobrador.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-t-2 border-slate-900 dark:border-slate-100 font-bold text-slate-900 dark:text-slate-100">
                  <span>TOTAL A RENDIR</span>
                  <span className="font-mono text-base text-emerald-700 dark:text-emerald-300">
                    Bs {cob.resumenCobranzas.totalARendir.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* 3. Estadísticas de Pedidos */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                    Estadísticas Pedidos
                  </span>
                  <Badge variant="outline" className="text-[10px]">Ruta</Badge>
                </div>
                <div className="mt-4 space-y-3">
                  <div className="flex justify-between items-center p-2 rounded bg-slate-50 dark:bg-slate-800/40">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Pedidos Despacho</span>
                    <span className="text-base font-bold font-mono text-slate-900 dark:text-slate-100">{cob.pedidos.despacho}</span>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded bg-emerald-50 dark:bg-emerald-950/30">
                    <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Pedidos Facturados</span>
                    <span className="text-base font-bold font-mono text-emerald-700 dark:text-emerald-300">{cob.pedidos.facturado}</span>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded bg-amber-50 dark:bg-amber-950/30">
                    <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">Pedidos Devueltos</span>
                    <span className="text-base font-bold font-mono text-amber-700 dark:text-amber-300">{cob.pedidos.devuelto}</span>
                  </div>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-indigo-50 border border-indigo-100 dark:bg-indigo-950/30 dark:border-indigo-900/40 text-[11px] text-indigo-900 dark:text-indigo-200 mt-4">
                <strong>Efectividad de Entrega:</strong> {((cob.pedidos.facturado / cob.pedidos.despacho) * 100).toFixed(1)}% de pedidos concluidos satisfactoriamente.
              </div>
            </div>
          </div>

          {/* DESGLOSES DETALLADOS POR MEDIO DE PAGO */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* 1. VENTAS A CRÉDITO */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-indigo-600" />
                  <h4 className="text-xs font-bold uppercase text-slate-900 dark:text-slate-100">
                    1. Detalle de Ventas a Crédito (Bs {cob.resumenCobranzas.credito.toFixed(2)})
                  </h4>
                </div>
                <Badge variant="outline" className="text-[10px] text-rose-600 border-rose-200 bg-rose-50 dark:bg-rose-950/30">
                  ESTADO: Credito/Facturado/Entregado
                </Badge>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-[11px] font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800">
                    <th className="p-2">Cliente (Código)</th>
                    <th className="p-2">Razón Social / Factura</th>
                    <th className="p-2 text-right">Monto (Bs)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono dark:divide-slate-800">
                  {cob.creditos.map((c) => (
                    <tr key={c.clienteCodigo}>
                      <td className="p-2 font-bold text-slate-700 dark:text-slate-300">{c.clienteCodigo}</td>
                      <td className="p-2 font-sans text-slate-800 dark:text-slate-200">{c.clienteNombre} ({c.factura})</td>
                      <td className="p-2 text-right font-bold text-slate-900 dark:text-slate-100">Bs {c.monto.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 2. ARQUEO DE EFECTIVO EN BOLIVIANOS */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Coins className="h-4 w-4 text-amber-600" />
                  <h4 className="text-xs font-bold uppercase text-slate-900 dark:text-slate-100">
                    2. Arqueo Físico de Billetes y Monedas (Bs {cob.resumenCobranzas.efectivo.toFixed(2)})
                  </h4>
                </div>
                <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30">
                  ESTADO: Contado/Facturado/Cobrado - Efectivo
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {cob.cortesBs
                  .filter((k) => k.cantidad > 0)
                  .map((k) => (
                    <div key={k.denominacion} className="flex justify-between items-center p-2 rounded bg-slate-50 border border-slate-100 dark:bg-slate-800/50 dark:border-slate-800 text-xs font-mono">
                      <span>{k.denominacion} × <strong>{k.cantidad}</strong></span>
                      <span className="font-bold text-slate-900 dark:text-slate-100">Bs {k.monto.toFixed(2)}</span>
                    </div>
                  ))}
              </div>
            </div>

            {/* 3. TRANSFERENCIAS BANCARIAS */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-blue-600" />
                  <h4 className="text-xs font-bold uppercase text-slate-900 dark:text-slate-100">
                    3. Transferencias Bancarias (Bs {cob.resumenCobranzas.transferencia.toFixed(2)})
                  </h4>
                </div>
                <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-950/30">
                  ESTADO: Contado/Facturado/Cobrado - Transferencia
                </Badge>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-[11px] font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800">
                    <th className="p-2">Transacción</th>
                    <th className="p-2">Banco</th>
                    <th className="p-2">Cliente</th>
                    <th className="p-2 text-right">Monto (Bs)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono dark:divide-slate-800">
                  {cob.transferencias.map((t) => (
                    <tr key={t.transaccion}>
                      <td className="p-2 font-bold text-slate-700 dark:text-slate-300">{t.transaccion}</td>
                      <td className="p-2 text-blue-600 font-semibold">{t.banco}</td>
                      <td className="p-2 font-sans text-slate-800 dark:text-slate-200">{t.clienteNombre} ({t.clienteCodigo})</td>
                      <td className="p-2 text-right font-bold text-slate-900 dark:text-slate-100">Bs {t.monto.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 4. PAGOS QR INTERBANCARIOS */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <QrCode className="h-4 w-4 text-indigo-600" />
                  <h4 className="text-xs font-bold uppercase text-slate-900 dark:text-slate-100">
                    4. Cobros con QR Interbancario (Bs {cob.resumenCobranzas.qr.toFixed(2)})
                  </h4>
                </div>
                <Badge variant="outline" className="text-[10px] text-indigo-600 border-indigo-200 bg-indigo-50 dark:bg-indigo-950/30">
                  ESTADO: Contado/Facturado/Cobrado - QR
                </Badge>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-[11px] font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800">
                    <th className="p-2">Transacción</th>
                    <th className="p-2">Banco</th>
                    <th className="p-2">Cliente</th>
                    <th className="p-2 text-right">Monto (Bs)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono dark:divide-slate-800">
                  {cob.pagosQr.map((q) => (
                    <tr key={q.transaccion}>
                      <td className="p-2 font-bold text-slate-700 dark:text-slate-300">{q.transaccion}</td>
                      <td className="p-2 text-indigo-600 font-semibold">{q.banco}</td>
                      <td className="p-2 font-sans text-slate-800 dark:text-slate-200">{q.clienteNombre} ({q.clienteCodigo})</td>
                      <td className="p-2 text-right font-bold text-slate-900 dark:text-slate-100">Bs {q.monto.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 5. DEVOLUCIONES NO COBRADAS */}
          {cob.devolucionesNoCobradas.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/20 p-4 shadow-xs dark:border-amber-950 dark:bg-amber-950/10">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <RotateCcw className="h-4 w-4 text-amber-600" />
                  <h4 className="text-xs font-bold uppercase text-amber-900 dark:text-amber-200">
                    5. Devoluciones y Rechazos (No Cobrado en Ruta)
                  </h4>
                </div>
                <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300 bg-amber-100/60 dark:bg-amber-950/40">
                  ESTADO: Visitado o Facturado/Sin Entregar - Sin Cobrar
                </Badge>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-amber-200/60 bg-amber-100/40 text-[11px] font-semibold text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                    <th className="p-2">Cliente (Código)</th>
                    <th className="p-2">Factura</th>
                    <th className="p-2">Razón Social y Motivo de Rechazo</th>
                    <th className="p-2 text-right">Monto Devuelto (Bs)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100/60 font-mono dark:divide-amber-900/40">
                  {cob.devolucionesNoCobradas.map((d) => (
                    <tr key={d.clienteCodigo}>
                      <td className="p-2 font-bold text-slate-700 dark:text-slate-300">{d.clienteCodigo}</td>
                      <td className="p-2 text-center text-slate-500">{d.factura}</td>
                      <td className="p-2 font-sans text-slate-800 dark:text-slate-200">
                        <strong>{d.clienteNombre}</strong> {d.motivo && <span className="text-slate-500 italic block text-[11px]">Motivo: {d.motivo}</span>}
                      </td>
                      <td className="p-2 text-right font-bold text-amber-700 dark:text-amber-300">Bs {d.monto.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* FIRMAS DE LOS 4 ROLES EXIGIDOS EN LA LIQUIDACIÓN FINANCIERA */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 text-center dark:border-slate-800 dark:bg-slate-900 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-2">1. Chofer</span>
              <div className="h-16 rounded border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center dark:border-slate-800 dark:bg-slate-800/40 mb-2">
                <span className="text-[11px] italic text-slate-400 font-serif">Firmado OK</span>
              </div>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">{cob.firmas.chofer.nombre}</span>
              <span className="text-[10px] text-slate-400 block">{cob.firmas.chofer.cargo}</span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3.5 text-center dark:border-slate-800 dark:bg-slate-900 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-2">2. Supervisor</span>
              <div className="h-16 rounded border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center dark:border-slate-800 dark:bg-slate-800/40 mb-2">
                <span className="text-[11px] italic text-slate-400 font-serif">Validado OK</span>
              </div>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">{cob.firmas.supervisor.nombre}</span>
              <span className="text-[10px] text-slate-400 block">{cob.firmas.supervisor.cargo}</span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3.5 text-center dark:border-slate-800 dark:bg-slate-900 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-2">3. Cajero</span>
              <div className="h-16 rounded border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center dark:border-slate-800 dark:bg-slate-800/40 mb-2">
                <span className="text-[11px] italic text-slate-400 font-serif">Recibido en Caja</span>
              </div>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">{cob.firmas.cajero.nombre}</span>
              <span className="text-[10px] text-slate-400 block">{cob.firmas.cajero.cargo}</span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3.5 text-center dark:border-slate-800 dark:bg-slate-900 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-2">4. Administrador</span>
              <div className="h-16 rounded border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center dark:border-slate-800 dark:bg-slate-800/40 mb-2">
                <span className="text-[11px] italic text-slate-400 font-serif">Aprobado Liquidación</span>
              </div>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">{cob.firmas.administrador.nombre}</span>
              <span className="text-[10px] text-slate-400 block">{cob.firmas.administrador.cargo}</span>
            </div>
          </div>
        </TabsContent>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* TAB 3: BALANCE CONSOLIDADO                                          */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <TabsContent value="balance" className="mt-4 space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 pb-4 border-b border-slate-100 dark:border-slate-800">
              <Sparkles className="h-5 w-5 text-indigo-600" />
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Matriz de Concordancia Operativa y Financiera (1 a 1 con OT: {selectedCierre.orderCode})
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              {/* Cuadre Físico */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                  <Package className="h-4 w-4" /> Cuadre Físico (Almacén)
                </h4>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-800/40 space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-200/60 dark:border-slate-700/60">
                    <span>Unidades Despachadas Iniciales:</span>
                    <strong className="font-mono">{alm.totales.totalCantidadDespacho} unidades</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60 dark:border-slate-700/60">
                    <span>Unidades Entregadas (Facturado + Bono):</span>
                    <strong className="font-mono text-emerald-600">{alm.totales.totalFacturadoTotal} unidades</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60 dark:border-slate-700/60">
                    <span>Unidades Retornadas a Bodega:</span>
                    <strong className="font-mono text-amber-600">{alm.totales.totalCantidadDevuelto} unidades</strong>
                  </div>
                  <div className="flex justify-between py-1.5 font-bold bg-white dark:bg-slate-900 px-2 rounded">
                    <span>Diferencia Física Neta:</span>
                    <strong className="font-mono text-emerald-600">0 unidades (100% Cuadrado)</strong>
                  </div>
                </div>
              </div>

              {/* Cuadre Monetario */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                  <Banknote className="h-4 w-4" /> Cuadre Financiero (Cobranzas)
                </h4>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-800/40 space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-200/60 dark:border-slate-700/60">
                    <span>Importe Facturado Oficial:</span>
                    <strong className="font-mono">Bs {cob.resumenFinanciero.importeFacturado.toFixed(2)}</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60 dark:border-slate-700/60">
                    <span>Cobranza Recaudada en Mano:</span>
                    <strong className="font-mono text-emerald-600">Bs {cob.resumenCobranzas.cobranzaChofer.toFixed(2)}</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60 dark:border-slate-700/60">
                    <span>Ventas a Crédito Autorizadas:</span>
                    <strong className="font-mono text-indigo-600">Bs {cob.resumenCobranzas.credito.toFixed(2)}</strong>
                  </div>
                  <div className="flex justify-between py-1.5 font-bold bg-white dark:bg-slate-900 px-2 rounded">
                    <span>Total Rendido vs Facturado:</span>
                    <strong className="font-mono text-emerald-600">Bs {cob.resumenCobranzas.totalARendir.toFixed(2)} (Cuadre Exacto)</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </>
  )}
</div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* 2. DOCUMENTO FORMAL PARA IMPRESIÓN / DESCARGA PDF                     */}
      {/* (Solo visible al imprimir o descargar en PDF mediante print media)   */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {selectedCierre && (
        <div className="hidden print:block bg-white text-slate-900 font-sans p-2 text-xs leading-normal">
          {/* Estilos específicos de impresión landscape y saltos de página */}
          <style>{`
            @media print {
              @page {
                size: landscape;
                margin: 6mm 8mm 8mm 8mm;
              }
              /* Ocultar cualquier header, nav, aside, menu, botones o elementos de la interfaz */
              header, nav, aside, [role="presentation"], button, .print\\:hidden, [data-sidebar], .sonner-toast, .fixed {
                display: none !important;
              }
              html, body, #root, #app, main, div[class*="MockupShell"], div[class*="overflow"] {
                background: white !important;
                color: #0f172a !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: visible !important;
                height: auto !important;
                min-height: auto !important;
                max-height: none !important;
                width: 100% !important;
                box-shadow: none !important;
                border: none !important;
              }
              .pdf-table {
                width: 100% !important;
                border-collapse: collapse !important;
                font-size: 8px !important;
              }
              .pdf-table th {
                background-color: #f1f5f9 !important;
                color: #0f172a !important;
                border: 1px solid #cbd5e1 !important;
                padding: 4px 4px !important;
                font-weight: bold !important;
                text-align: center !important;
              }
              .pdf-table td {
                border: 1px solid #cbd5e1 !important;
                padding: 3px 4px !important;
                color: #1e293b !important;
              }
              .pdf-table thead {
                display: table-header-group !important;
              }
              .pdf-table tr {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
              .avoid-break {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
            }
          `}</style>

          {/* ── CABECERA INSTITUCIONAL OFICIAL ── */}
          <div className="border-b-2 border-slate-900 pb-2 mb-3 flex items-start justify-between">
            <div>
              <div className="text-base font-black tracking-tight text-slate-900">
                Distribuidora DISCRUZ
              </div>
            </div>

            <div className="text-center">
              <div className="text-sm font-black uppercase tracking-wider text-slate-900 border border-slate-900 px-4 py-1 bg-slate-100">
                ACTA DE CIERRE
              </div>
            </div>

            <div className="text-right text-[10px] space-y-0.5 font-mono">
              <div>
                <span className="text-slate-500">N° OT / DESPACHO:</span>{' '}
                <strong className="text-sm text-slate-900">{selectedCierre.orderCode}</strong>
              </div>
              <div>
                <span className="text-slate-500">Fecha Emisión:</span>{' '}
                <strong>{selectedCierre.dateFormatted}</strong>
              </div>
              <div>
                <span className="text-slate-500">Estado:</span>{' '}
                <strong className="text-emerald-700 font-bold uppercase">
                  {selectedCierre.statusLabel}
                </strong>
              </div>
            </div>
          </div>

          {/* ── DATOS OPERATIVOS DEL DESPACHO (FICHA TÉCNICA) ── */}
          <div className="border border-slate-300 rounded bg-slate-50/50 p-2 mb-3 text-[10px]">
            <div className="grid grid-cols-4 gap-2">
              <div>
                <span className="text-slate-500 block font-semibold">N° Despacho / OT:</span>
                <strong className="font-mono text-slate-900">{selectedCierre.orderCode}</strong>
              </div>
              <div>
                <span className="text-slate-500 block font-semibold">Fecha de Salida:</span>
                <span className="text-slate-900">{selectedCierre.dateFormatted}</span>
              </div>
              <div>
                <span className="text-slate-500 block font-semibold">Ruta / Zona de Entrega:</span>
                <span className="text-slate-900">{selectedCierre.routeName}</span>
              </div>
              <div>
                <span className="text-slate-500 block font-semibold">Placa / Vehículo:</span>
                <span className="font-mono text-slate-900">
                  {selectedCierre.truckPlate} ({selectedCierre.truckType})
                </span>
              </div>
              <div>
                <span className="text-slate-500 block font-semibold">Chofer Responsable:</span>
                <strong className="text-slate-900">{selectedCierre.driverName}</strong>
              </div>
              <div>
                <span className="text-slate-500 block font-semibold">C.I. Chofer:</span>
                <span className="font-mono text-slate-900">{selectedCierre.driverCi}</span>
              </div>
              <div>
                <span className="text-slate-500 block font-semibold">Empresa:</span>
                <span className="text-slate-900">{selectedCierre.driverEmpresa}</span>
              </div>
              <div>
                <span className="text-slate-500 block font-semibold">Usuario:</span>
                <span className="font-mono text-slate-900">{alm?.usuarioLiquidador}</span>
              </div>
            </div>
          </div>

          {/* ── RESUMEN EJECUTIVO CONSOLIDADO (TODO EN BOLIVIANOS - BS) ── */}
          <div className="grid grid-cols-4 gap-2 mb-3">
            <div className="border border-slate-300 rounded p-1.5 bg-slate-50 text-[10px]">
              <span className="text-slate-500 block uppercase font-bold text-[9px]">1. Total Despacho</span>
              <div className="text-xs font-bold text-slate-900 font-mono">
                {alm?.totales.totalCantidadDespacho} unidades
              </div>
              <div className="text-[10px] text-slate-600 font-mono mt-0.5">
                Valor: <strong>Bs {alm?.totales.totalValorDespacho.toFixed(2)}</strong>
              </div>
            </div>

            <div className="border border-slate-300 rounded p-1.5 bg-slate-50 text-[10px]">
              <span className="text-slate-500 block uppercase font-bold text-[9px]">2. Total Facturado</span>
              <div className="text-xs font-bold text-slate-900 font-mono">
                {alm?.totales.totalCantidadFacturado} unidades
              </div>
              <div className="text-[10px] text-slate-600 font-mono mt-0.5">
                Valor: <strong>Bs {alm?.totales.totalValorFacturado.toFixed(2)}</strong>
              </div>
            </div>

            <div className="border border-slate-300 rounded p-1.5 bg-slate-50 text-[10px]">
              <span className="text-slate-500 block uppercase font-bold text-[9px]">3. Bonificaciones</span>
              <div className="text-xs font-bold text-slate-900 font-mono">
                {alm?.totales.totalCantidadBonificacion} unidades
              </div>
              <div className="text-[10px] text-slate-600 font-mono mt-0.5">
                Valor: <strong>Bs {alm?.totales.totalValorBonificacion.toFixed(2)}</strong>
              </div>
            </div>

            <div className="border border-slate-300 rounded p-1.5 bg-slate-50 text-[10px]">
              <span className="text-slate-500 block uppercase font-bold text-[9px]">4. Retorno / Devolución</span>
              <div className="text-xs font-bold text-slate-900 font-mono">
                {alm?.totales.totalCantidadDevuelto} unidades
              </div>
              <div className="text-[10px] text-slate-600 font-mono mt-0.5">
                Valor: <strong>Bs {alm?.totales.totalValorDevuelto.toFixed(2)}</strong>
              </div>
            </div>
          </div>

          {/* ── TABLA COMPLETA DE PRODUCTOS CONCILIADOS (14 COLUMNAS) ── */}
          <div className="mb-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-800 mb-1 flex items-center justify-between">
              <span>Detalle de Conciliación Física de Carga y Retorno por Producto ({alm?.items.length} ítems):</span>
              <span className="font-mono text-[9px] text-slate-500">Valores monetarios expresados en Bolivianos (Bs)</span>
            </div>

            <table className="pdf-table">
              <thead>
                <tr>
                  <th style={{ width: '25px' }}>N°</th>
                  <th style={{ width: '70px' }}>Código</th>
                  <th style={{ textAlign: 'left', minWidth: '180px' }}>Descripción del Producto</th>
                  <th style={{ width: '35px' }}>U.M.</th>
                  <th style={{ width: '55px', textAlign: 'right' }}>Cant. Desp.</th>
                  <th style={{ width: '55px', textAlign: 'right' }}>Cant. Fact.</th>
                  <th style={{ width: '50px', textAlign: 'right' }}>Cant. Bon.</th>
                  <th style={{ width: '60px', textAlign: 'right', fontWeight: 'bold' }}>Fact. Total</th>
                  <th style={{ width: '55px', textAlign: 'right' }}>Cant. Dev.</th>
                  <th style={{ width: '45px', textAlign: 'right' }}>Falt.</th>
                  <th style={{ width: '45px', textAlign: 'right' }}>Sobr.</th>
                  <th style={{ width: '65px', textAlign: 'right' }}>Valor Desp. (Bs)</th>
                  <th style={{ width: '65px', textAlign: 'right' }}>Valor Fact. (Bs)</th>
                  <th style={{ width: '65px', textAlign: 'right' }}>Valor Dev. (Bs)</th>
                </tr>
              </thead>
              <tbody>
                {alm?.items.map((it, idx) => {
                  const hasDevolucion = it.cantidadDevuelto > 0
                  return (
                    <tr
                      key={it.codigo}
                      style={{
                        backgroundColor: hasDevolucion ? '#fefce8' : idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                      }}
                    >
                      <td style={{ textAlign: 'center', color: '#64748b' }}>{idx + 1}</td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{it.codigo}</td>
                      <td style={{ textAlign: 'left', fontWeight: '500' }}>{it.producto}</td>
                      <td style={{ textAlign: 'center', color: '#64748b' }}>{it.um}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{it.cantidadDespacho}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{it.cantidadFacturado}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{it.cantidadBonificacion}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 'bold' }}>
                        {it.facturadoTotal}
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontFamily: 'monospace',
                          fontWeight: hasDevolucion ? 'bold' : 'normal',
                          color: hasDevolucion ? '#b45309' : 'inherit',
                        }}
                      >
                        {it.cantidadDevuelto}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#94a3b8' }}>
                        {it.cantidadFaltante || '-'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#94a3b8' }}>
                        {it.cantidadSobrante || '-'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                        {it.valorDespacho.toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 'bold' }}>
                        {it.valorFacturado.toFixed(2)}
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontFamily: 'monospace',
                          color: hasDevolucion ? '#b45309' : 'inherit',
                        }}
                      >
                        {it.valorDevuelto.toFixed(2)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: '#e2e8f0', fontWeight: 'bold', fontSize: '8.5px' }}>
                  <td colSpan={4} style={{ textAlign: 'right', padding: '5px' }}>
                    TOTALES GENERALES (BS):
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                    {alm?.totales.totalCantidadDespacho}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                    {alm?.totales.totalCantidadFacturado}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                    {alm?.totales.totalCantidadBonificacion}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: '900' }}>
                    {alm?.totales.totalFacturadoTotal}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                    {alm?.totales.totalCantidadDevuelto}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                    {alm?.totales.totalCantidadFaltante}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                    {alm?.totales.totalCantidadSobrante}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                    Bs {alm?.totales.totalValorDespacho.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                    Bs {alm?.totales.totalValorFacturado.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                    Bs {alm?.totales.totalValorDevuelto.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ── CUADRE DE COBRANZA Y CAJA RESUMIDO ── */}
          <div className="border border-slate-300 rounded p-2 mb-3 bg-slate-50/50 avoid-break">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-800 mb-1">
              Resumen de Recaudación Financiera de Cobranza (Caja en Bolivianos):
            </div>
            <div className="grid grid-cols-6 gap-2 text-[10px]">
              <div>
                <span className="text-slate-500 block">Efectivo:</span>
                <strong className="font-mono">Bs {cob?.resumenCobranzas.efectivo.toFixed(2)}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Transferencia:</span>
                <strong className="font-mono">Bs {cob?.resumenCobranzas.transferencia.toFixed(2)}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Cobro QR:</span>
                <strong className="font-mono">Bs {cob?.resumenCobranzas.qr.toFixed(2)}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Cheques:</span>
                <strong className="font-mono">Bs {cob?.resumenCobranzas.cheque.toFixed(2)}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Ventas a Crédito:</span>
                <strong className="font-mono">Bs {cob?.resumenCobranzas.credito.toFixed(2)}</strong>
              </div>
              <div className="bg-emerald-100 border border-emerald-300 rounded p-1">
                <span className="text-emerald-900 block font-bold text-[9px] uppercase">Total Rendido:</span>
                <strong className="font-mono text-emerald-950 text-xs">
                  Bs {cob?.resumenCobranzas.totalARendir.toFixed(2)}
                </strong>
              </div>
            </div>
          </div>

          {/* ── SECCIÓN DE CONFORMIDAD Y FIRMAS AL FINAL ── */}
          <div className="avoid-break mt-3 pt-2 border-t border-slate-300 space-y-2">
            <p className="text-[9px] text-slate-500 italic text-justify leading-snug">
              <strong>DECLARACIÓN DE CONFORMIDAD:</strong> El Chofer Responsable de Transporte y los encargados
              de Almacén y Liquidación certifican la veracidad de los datos físicos y monetarios expresados en la presente acta.
              Habiéndose verificado físicamente el conteo de unidades devueltas a bodega y el cuadre exacto de la cobranza
              entregada en caja, suscriben el presente documento en señal de plena conformidad y cierre definitivo de la OT.
            </p>

            <div className="grid grid-cols-3 gap-6 pt-6 pb-2 text-[10px]">
              {/* Firma Chofer */}
              <div className="text-center">
                <div className="border-t border-slate-800 pt-1.5 mx-4">
                  <div className="font-bold text-slate-900">{alm?.firmas.chofer.nombre}</div>
                  <div className="text-slate-500 text-[9px]">Chofer de Transporte • CI: {alm?.firmas.chofer.ci}</div>
                  <div className="text-slate-400 text-[9px]">Empresa: {selectedCierre.driverEmpresa}</div>
                  <div className="text-[9px] font-semibold text-slate-700 mt-0.5">
                    [ FIRMA DE CONFORMIDAD CHOFER ]
                  </div>
                </div>
              </div>

              {/* Firma Almacén */}
              <div className="text-center">
                <div className="border-t border-slate-800 pt-1.5 mx-4">
                  <div className="font-bold text-slate-900">{alm?.firmas.almacen.nombre}</div>
                  <div className="text-slate-500 text-[9px]">{alm?.firmas.almacen.cargo}</div>
                  <div className="text-slate-400 text-[9px]">Rampa de Descarga Almacén Central</div>
                  <div className="text-[9px] font-semibold text-slate-700 mt-0.5">
                    [ CONFORMIDAD FÍSICA ALMACÉN ]
                  </div>
                </div>
              </div>

              {/* Firma Caja / Liquidación */}
              <div className="text-center">
                <div className="border-t border-slate-800 pt-1.5 mx-4">
                  <div className="font-bold text-slate-900 font-mono">{alm?.usuarioLiquidador}</div>
                  <div className="text-slate-500 text-[9px]">Responsable de Liquidación y Caja</div>
                  <div className="text-slate-400 text-[9px]">Arqueo: 100% Cuadrado (Sin diferencias)</div>
                  <div className="text-[9px] font-semibold text-slate-700 mt-0.5">
                    [ CONFORMIDAD LIQUIDACIÓN Y CAJA ]
                  </div>
                </div>
              </div>
            </div>

            {/* Pie de página institucional */}
            <div className="border-t border-slate-200 pt-1 flex justify-between items-center text-[8.5px] text-slate-400 font-mono">
              <span>Distribuidora DISCRUZ • Documento de Control Interno y Liquidación Oficial</span>
              <span>Página 1 de 1 • Generado automáticamente el {format(new Date(), 'dd/MM/yyyy HH:mm')}</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

