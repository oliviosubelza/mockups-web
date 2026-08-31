import React, { useState, useRef, useMemo } from 'react'
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
  Eye,
  Info,
  Maximize2,
  ArrowRight,
  ArrowLeft,
  Edit3,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  CIERRES_ORDENES_TRANSPORTE,
  type CierreOrdenTransporte,
} from '../cierre-logistico-data'
import { CierreCobranzaInPlaceEditor } from '../cierre/CierreCobranzaInPlaceEditor'
import { OrdenesFinalizadasListView } from '../cierre/OrdenesFinalizadasListView'
import { RegistroCierreOTView } from '../cierre/RegistroCierreOTView'
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
  // ── ESTADO DE VISTA PRINCIPAL (LISTA vs REGISTRO vs CONSOLIDADOS) ──
  const [currentViewMode, setCurrentViewMode] = useState<
    'LISTA_ORDENES' | 'REGISTRO_CIERRE' | 'CIERRES_CONSOLIDADOS'
  >('LISTA_ORDENES')

  // ── ESTADO REACTIVO MUTABLE DE CIERRES ──
  const [cierresData, setCierresData] = useState<CierreOrdenTransporte[]>(CIERRES_ORDENES_TRANSPORTE)
  const [isEditingCobranza, setIsEditingCobranza] = useState(false)

  // ── ESTADO DE SELECCIÓN DE CIERRE ACTIVO ──
  const [selectedId, setSelectedId] = useState<string>(CIERRES_ORDENES_TRANSPORTE[0].id)
  const [activeTab, setActiveTab] = useState<'almacen' | 'cobranza' | 'balance'>('almacen')
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showProductModal, setShowProductModal] = useState(false)
  const [showCobranzaModal, setShowCobranzaModal] = useState(false)

  // ── ESTADOS PARA TABLA DE PRODUCTOS EN MODAL (BUSCADOR Y FILTROS RÁPIDOS) ──
  const [productTableSearch, setProductTableSearch] = useState('')
  const [productFilterStatus, setProductFilterStatus] = useState<'ALL' | 'DEV' | 'BON'>('ALL')

  // ── ESTADOS PARA TABLA DE COBRANZAS EN MODAL (BUSCADOR Y FILTROS RÁPIDOS) ──
  const [cobranzaTableSearch, setCobranzaTableSearch] = useState('')
  const [cobranzaFilterStatus, setCobranzaFilterStatus] = useState<
    'ALL' | 'EFECTIVO' | 'TRANSFERENCIA' | 'QR' | 'CREDITO' | 'DEVOLUCION'
  >('ALL')

  const printRef = useRef<HTMLDivElement>(null)

  // Cierre seleccionado activo
  const selectedCierre = useMemo(() => {
    const found = cierresData.find((c) => c.id === selectedId)
    return found || cierresData[0]
  }, [cierresData, selectedId])

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
      toast.success('Cierre de Almacén (.xls) descargado')
    } else if (activeTab === 'cobranza') {
      exportarCierreCobranzasIndividualAExcel(selectedCierre)
      toast.success('Cierre de Cobranzas (.xls) descargado')
    } else {
      exportarCierreLogisticoCompletoAExcel(selectedCierre)
      toast.success('Libro de Cierre Consolidado (.xls - 2 Hojas) descargado')
    }
  }

  const alm = selectedCierre?.almacen
  const cob = selectedCierre?.cobranza

  // Filtrado de productos para la tabla en modal
  const filteredAlmItems = useMemo(() => {
    if (!alm) return []
    return alm.items.filter((it) => {
      if (productFilterStatus === 'DEV' && it.cantidadDevuelto <= 0) return false
      if (productFilterStatus === 'BON' && it.cantidadBonificacion <= 0) return false
      if (productTableSearch.trim()) {
        const q = productTableSearch.toLowerCase()
        return it.producto.toLowerCase().includes(q) || it.codigo.toLowerCase().includes(q)
      }
      return true
    })
  }, [alm, productFilterStatus, productTableSearch])

  // Items con retorno físico para el preview visual en el Tab 1
  const returnedAlmItems = useMemo(() => {
    if (!alm) return []
    return alm.items.filter((it) => it.cantidadDevuelto > 0)
  }, [alm])

  // Listas filtradas para la ventana modal de cobranzas
  const filteredCortesBs = useMemo(() => {
    if (!cob) return []
    if (cobranzaFilterStatus !== 'ALL' && cobranzaFilterStatus !== 'EFECTIVO') return []
    if (!cobranzaTableSearch.trim()) return cob.cortesBs
    const q = cobranzaTableSearch.toLowerCase()
    return cob.cortesBs.filter(
      (c) =>
        c.denominacion.toLowerCase().includes(q) ||
        c.tipo.toLowerCase().includes(q) ||
        c.monto.toString().includes(q)
    )
  }, [cob, cobranzaFilterStatus, cobranzaTableSearch])

  const filteredTransferencias = useMemo(() => {
    if (!cob) return []
    if (cobranzaFilterStatus !== 'ALL' && cobranzaFilterStatus !== 'TRANSFERENCIA') return []
    if (!cobranzaTableSearch.trim()) return cob.transferencias
    const q = cobranzaTableSearch.toLowerCase()
    return cob.transferencias.filter(
      (t) =>
        t.transaccion.toLowerCase().includes(q) ||
        t.banco.toLowerCase().includes(q) ||
        t.clienteNombre.toLowerCase().includes(q) ||
        t.monto.toString().includes(q)
    )
  }, [cob, cobranzaFilterStatus, cobranzaTableSearch])

  const filteredPagosQr = useMemo(() => {
    if (!cob) return []
    if (cobranzaFilterStatus !== 'ALL' && cobranzaFilterStatus !== 'QR') return []
    if (!cobranzaTableSearch.trim()) return cob.pagosQr
    const q = cobranzaTableSearch.toLowerCase()
    return cob.pagosQr.filter(
      (p) =>
        p.transaccion.toLowerCase().includes(q) ||
        p.banco.toLowerCase().includes(q) ||
        p.clienteNombre.toLowerCase().includes(q) ||
        p.monto.toString().includes(q)
    )
  }, [cob, cobranzaFilterStatus, cobranzaTableSearch])

  const filteredCreditos = useMemo(() => {
    if (!cob) return []
    if (cobranzaFilterStatus !== 'ALL' && cobranzaFilterStatus !== 'CREDITO') return []
    if (!cobranzaTableSearch.trim()) return cob.creditos
    const q = cobranzaTableSearch.toLowerCase()
    return cob.creditos.filter(
      (cr) =>
        cr.clienteCodigo.toLowerCase().includes(q) ||
        cr.clienteNombre.toLowerCase().includes(q) ||
        cr.factura.toLowerCase().includes(q) ||
        cr.monto.toString().includes(q)
    )
  }, [cob, cobranzaFilterStatus, cobranzaTableSearch])

  const filteredDevoluciones = useMemo(() => {
    if (!cob) return []
    if (cobranzaFilterStatus !== 'ALL' && cobranzaFilterStatus !== 'DEVOLUCION') return []
    if (!cobranzaTableSearch.trim()) return cob.devolucionesNoCobradas
    const q = cobranzaTableSearch.toLowerCase()
    return cob.devolucionesNoCobradas.filter(
      (d) =>
        d.clienteCodigo.toLowerCase().includes(q) ||
        d.clienteNombre.toLowerCase().includes(q) ||
        d.factura.toLowerCase().includes(q) ||
        (d.motivo && d.motivo.toLowerCase().includes(q)) ||
        d.monto.toString().includes(q)
    )
  }, [cob, cobranzaFilterStatus, cobranzaTableSearch])

  // Total de operaciones no en efectivo para el preview visual del Tab 2
  const totalDigitalOps = useMemo(() => {
    if (!cob) return []
    const ops: Array<{
      tipo: 'Transferencia' | 'Pago QR' | 'Crédito' | 'Retorno'
      comprobante: string
      entidadCliente: string
      monto: number
      badgeClass: string
    }> = []

    cob.transferencias.forEach((t) => {
      ops.push({
        tipo: 'Transferencia',
        comprobante: t.transaccion,
        entidadCliente: `${t.banco} - ${t.clienteNombre}`,
        monto: t.monto,
        badgeClass: 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300'
      })
    })

    cob.pagosQr.forEach((q) => {
      ops.push({
        tipo: 'Pago QR',
        comprobante: q.transaccion,
        entidadCliente: `${q.banco} - ${q.clienteNombre}`,
        monto: q.monto,
        badgeClass: 'border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-900 dark:bg-purple-950 dark:text-purple-300'
      })
    })

    cob.creditos.forEach((cr) => {
      ops.push({
        tipo: 'Crédito',
        comprobante: `Fact: ${cr.factura}`,
        entidadCliente: `${cr.clienteNombre} (${cr.clienteCodigo})`,
        monto: cr.monto,
        badgeClass: 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-300'
      })
    })

    cob.devolucionesNoCobradas.forEach((d) => {
      ops.push({
        tipo: 'Retorno',
        comprobante: `Fact: ${d.factura}`,
        entidadCliente: `${d.clienteNombre} (${d.motivo || 'Devolución'})`,
        monto: d.monto,
        badgeClass: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300'
      })
    })

    return ops
  }, [cob])

  return (
    <>
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* 1. VISTA INTERACTIVA WEB DEL MOCKUP                                    */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {currentViewMode === 'LISTA_ORDENES' ? (
        <div className="print:hidden p-3 md:p-4 lg:p-5 max-w-[1600px] mx-auto min-h-screen">
          <OrdenesFinalizadasListView
            cierres={cierresData}
            onSelectCierre={(id) => {
              setSelectedId(id)
              setCurrentViewMode('REGISTRO_CIERRE')
            }}
            onRegistrarCierre={(id) => {
              setSelectedId(id)
              setCurrentViewMode('REGISTRO_CIERRE')
            }}
            onVerCierre={(id) => {
              setSelectedId(id)
              setIsEditingCobranza(false)
              setCurrentViewMode('CIERRES_CONSOLIDADOS')
            }}
          />
        </div>
      ) : currentViewMode === 'REGISTRO_CIERRE' && selectedCierre ? (
        <div className="print:hidden p-3 md:p-4 lg:p-5 max-w-[1600px] mx-auto min-h-screen">
          <RegistroCierreOTView
            key={selectedCierre.id}
            cierre={selectedCierre}
            onVolver={() => setCurrentViewMode('LISTA_ORDENES')}
            onGuardarCierre={(cierreActualizado) => {
              setCierresData((prev) =>
                prev.map((c) => (c.id === cierreActualizado.id ? cierreActualizado : c))
              )
              setCurrentViewMode('LISTA_ORDENES')
            }}
          />
        </div>
      ) : (
        <div className="print:hidden flex flex-col gap-3.5 p-3 md:p-4 lg:p-5 max-w-[1600px] mx-auto min-h-screen">
          {/* CABECERA PRINCIPAL CON TÍTULOS Y ACCIONES */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  setIsEditingCobranza(false)
                  setCurrentViewMode('LISTA_ORDENES')
                }}
                className="h-9 w-9 rounded-xl border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0 shadow-2xs"
                title="Volver a órdenes"
              >
                <ArrowLeft className="h-4.5 w-4.5" />
              </Button>

              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base md:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
                    Detalle de Cierre OT #{selectedCierre?.orderCode}
                  </h1>
                  <Badge
                    variant="outline"
                    className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 font-semibold text-[11px] py-0 px-2"
                  >
                    {selectedCierre ? selectedCierre.statusLabel : 'Liquidado Conforme'}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Visualización y acta del cierre físico de almacén y conciliación de cobranzas
                </p>
              </div>
            </div>

            {/* BOTONES DINÁMICOS DE IMPRESIÓN Y EXPORTACIÓN SEGÚN PESTAÑA ACTIVA */}
            <div className="flex items-center gap-2 relative">

              <Button
                variant="outline"
                size="default"
                onClick={handlePrint}
                className="cursor-pointer border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 shadow-xs text-xs font-semibold h-9 px-3 rounded-xl"
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
              <div className="flex items-center rounded-xl shadow-xs">
                <Button
                  size="default"
                  onClick={handleExportExcelDirect}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer rounded-r-none rounded-l-xl text-xs font-semibold px-3 h-9 shadow-xs"
                  disabled={!selectedCierre}
                  title={`Exportar a Excel (.xls) datos del tab ${
                    activeTab === 'almacen' ? 'Almacén' : activeTab === 'cobranza' ? 'Cobranzas' : 'Consolidado'
                  }`}
                >
                  <FileSpreadsheet className="mr-1.5 h-4 w-4" />
                  <span>
                    {activeTab === 'almacen' && 'Excel (Almacén)'}
                    {activeTab === 'cobranza' && 'Excel (Cobranzas)'}
                    {activeTab === 'balance' && 'Excel (Consolidado)'}
                  </span>
                </Button>
                <Button
                  size="default"
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer rounded-l-none rounded-r-xl border-l border-emerald-500/60 px-2 h-9 shadow-xs"
                  disabled={!selectedCierre}
                  title="Más formatos y hojas de exportación Excel"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>

            {showExportMenu && selectedCierre && (
              <div
                className="absolute right-0 top-9 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl z-50 dark:border-slate-800 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-100"
                onMouseLeave={() => setShowExportMenu(false)}
              >
                <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Opciones de Exportación Excel
                </div>
                <button
                  onClick={() => {
                    exportarCierreLogisticoCompletoAExcel(selectedCierre)
                    setShowExportMenu(false)
                    toast.success('Libro de Cierre Consolidado descargado exitosamente')
                  }}
                  className={cn(
                    "w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between font-medium cursor-pointer",
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
                    "w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer",
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
                    "w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer",
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

        {/* ── TARJETA COMPACTA DE DATOS OPERATIVOS DEL DESPACHO SELECCIONADO ── */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Despacho Activo:
              </span>
              <span className="text-xs font-bold font-mono text-indigo-700 dark:text-indigo-400">
                {selectedCierre.orderCode}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                • {selectedCierre.routeName}
              </span>
            </div>

                <Badge
                  variant="outline"
                  className={cn(
                    'w-fit text-[11px] font-semibold px-2 py-0',
                    selectedCierre.status === 'LIQUIDATED'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : selectedCierre.status === 'OBSERVED'
                      ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
                      : 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  )}
                >
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Estado: {selectedCierre.statusLabel}
                </Badge>
              </div>

              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
                <div>
                  <span className="text-[10px] font-medium text-slate-400 block">N° Despacho / OT</span>
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100 font-mono">
                    {selectedCierre.orderCode}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-medium text-slate-400 block">Fecha de Salida</span>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                    <CalendarIcon className="h-3 w-3 text-slate-400" />
                    {selectedCierre.dateFormatted}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-medium text-slate-400 block">Chofer Responsable</span>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate block">
                    {selectedCierre.driverName}{' '}
                    <span className="text-[10px] text-blue-600 font-normal">
                      ({selectedCierre.driverEmpresa})
                    </span>
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-medium text-slate-400 block">Placa / Vehículo</span>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 font-mono">
                    {selectedCierre.truckPlate} ({selectedCierre.truckType})
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-medium text-slate-400 block">Usuario</span>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 font-mono">
                    {alm?.usuarioLiquidador}
                  </span>
                </div>
              </div>
            </div>

            {/* ── CONTENIDO PRINCIPAL CON PESTAÑAS (ANCHO CÓMODO SIN DESBORDES) ── */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
              <TabsList className="grid w-full grid-cols-3 max-w-2xl bg-slate-100 dark:bg-slate-800 p-1 rounded-lg h-9">
                <TabsTrigger
                  value="almacen"
                  className="text-xs font-semibold cursor-pointer gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 py-1 px-3 whitespace-nowrap text-slate-700 dark:text-slate-200"
                >
                  <Package className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                  <span>1. Cierre Almacén</span>
                </TabsTrigger>
                <TabsTrigger
                  value="cobranza"
                  className="text-xs font-semibold cursor-pointer gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 py-1 px-3 whitespace-nowrap text-slate-700 dark:text-slate-200"
                >
                  <Banknote className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>2. Cierre Cobranzas</span>
                </TabsTrigger>
                <TabsTrigger
                  value="balance"
                  className="text-xs font-semibold cursor-pointer gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 py-1 px-3 whitespace-nowrap text-slate-700 dark:text-slate-200"
                >
                  <Receipt className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                  <span>3. Balance Consolidado</span>
                </TabsTrigger>
              </TabsList>

              {/* ───────────────────────────────────────────────────────────── */}
              {/* TAB 1: CIERRE LOGÍSTICO ALMACÉN (Compacto y sin Scroll)       */}
              {/* ───────────────────────────────────────────────────────────── */}
              <TabsContent value="almacen" className="mt-2.5 space-y-3">
                {/* BANNER DE RESUMEN DE ALMACÉN (TODO EN BOLIVIANOS - BS) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-2.5 dark:border-blue-950 dark:bg-blue-950/20">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">Total Despacho</span>
                      <Badge variant="outline" className="text-[9px] py-0 px-1 border-blue-200 text-blue-700 bg-blue-100/50 dark:border-blue-950 dark:text-blue-300">Bs (Bolivianos)</Badge>
                    </div>
                    <span className="text-lg md:text-xl font-bold text-slate-900 dark:text-slate-100 font-mono block mt-0.5">
                      {alm.totales.totalCantidadDespacho} <span className="text-[11px] font-normal text-slate-500">unidades</span>
                    </span>
                    <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 block mt-0.5 font-mono">
                      Valor Total: <strong className="text-blue-700 dark:text-blue-300 font-bold">Bs {alm.totales.totalValorDespacho.toFixed(2)}</strong>
                    </span>
                  </div>

                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-2.5 dark:border-emerald-950 dark:bg-emerald-950/20">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Total Facturado</span>
                      <Badge variant="outline" className="text-[9px] py-0 px-1 border-emerald-200 text-emerald-700 bg-emerald-100/50 dark:border-emerald-900 dark:text-emerald-300">Bs (Bolivianos)</Badge>
                    </div>
                    <span className="text-lg md:text-xl font-bold text-emerald-700 dark:text-emerald-300 font-mono block mt-0.5">
                      {alm.totales.totalCantidadFacturado} <span className="text-[11px] font-normal text-slate-500">unidades</span>
                    </span>
                    <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 block mt-0.5 font-mono">
                      Valor Total: <strong className="text-emerald-700 dark:text-emerald-300 font-bold">Bs {alm.totales.totalValorFacturado.toFixed(2)}</strong>
                    </span>
                  </div>

                  <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-2.5 dark:border-purple-950 dark:bg-purple-950/20">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-purple-600 dark:text-purple-400">Bonificaciones</span>
                      <Badge variant="outline" className="text-[9px] py-0 px-1 border-purple-200 text-purple-700 bg-purple-100/50 dark:border-purple-950 dark:text-purple-300">Bs (Bolivianos)</Badge>
                    </div>
                    <span className="text-lg md:text-xl font-bold text-purple-700 dark:text-purple-300 font-mono block mt-0.5">
                      {alm.totales.totalCantidadBonificacion} <span className="text-[11px] font-normal text-slate-500">unidades</span>
                    </span>
                    <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 block mt-0.5 font-mono">
                      Valor Total: <strong className="text-purple-700 dark:text-purple-300 font-bold">Bs {alm.totales.totalValorBonificacion.toFixed(2)}</strong>
                    </span>
                  </div>

                  <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-2.5 dark:border-amber-950 dark:bg-amber-950/20">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">Retorno / Devuelto</span>
                      <Badge variant="outline" className="text-[9px] py-0 px-1 border-amber-200 text-amber-700 bg-amber-100/50 dark:border-amber-900 dark:text-amber-300">Bs (Bolivianos)</Badge>
                    </div>
                    <span className="text-lg md:text-xl font-bold text-amber-700 dark:text-amber-300 font-mono block mt-0.5">
                      {alm.totales.totalCantidadDevuelto} <span className="text-[11px] font-normal text-slate-500">unidades</span>
                    </span>
                    <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 block mt-0.5 font-mono">
                      Valor Total: <strong className="text-amber-700 dark:text-amber-300 font-bold">Bs {alm.totales.totalValorDevuelto.toFixed(2)}</strong>
                    </span>
                  </div>
                </div>

                {/* TARJETA COMPACTA DE CONCILIACIÓN FÍSICA CON BOTÓN ÚNICO 'Ver detalle de productos' */}
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                        <Package className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-xs md:text-sm font-bold text-slate-900 dark:text-slate-100">
                            Conciliación Física de Carga y Retorno en Almacén
                          </h3>
                          <Badge variant="outline" className="text-[9px] font-mono border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300 py-0 px-1">
                            {alm.items.length} SKUs
                          </Badge>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Inventario físico descargado en rampa central ({alm.items.length} productos)
                        </p>
                      </div>
                    </div>

                    {/* BOTÓN ÚNICO 'Ver detalle de productos' */}
                    <Button
                      onClick={() => setShowProductModal(true)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer text-xs font-semibold shadow-xs h-8 px-3 flex items-center gap-1.5 self-start sm:self-auto"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                      <span>Ver detalle de productos</span>
                    </Button>
                  </div>

                  {/* MINI INDICADORES DE CONCILIACIÓN */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                      <span className="text-slate-400 block font-medium text-[10.5px]">Carga Total Despachada</span>
                      <strong className="text-xs font-mono text-slate-900 dark:text-slate-100 block mt-0.5">
                        {alm.totales.totalCantidadDespacho} uds
                      </strong>
                      <span className="text-[10px] text-slate-500 font-mono">Bs {alm.totales.totalValorDespacho.toFixed(2)}</span>
                    </div>

                    <div className="p-2 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40">
                      <span className="text-emerald-600 dark:text-emerald-400 block font-medium text-[10.5px]">Entregado Conforme</span>
                      <strong className="text-xs font-mono text-emerald-700 dark:text-emerald-300 block mt-0.5">
                        {alm.totales.totalFacturadoTotal} uds
                      </strong>
                      <span className="text-[10px] text-emerald-600/80 font-mono">Bs {alm.totales.totalValorFacturado.toFixed(2)}</span>
                    </div>

                    <div className="p-2 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40">
                      <span className="text-amber-600 dark:text-amber-400 block font-medium text-[10.5px]">Mercadería Devuelta</span>
                      <strong className="text-xs font-mono text-amber-700 dark:text-amber-300 block mt-0.5">
                        {alm.totales.totalCantidadDevuelto} uds
                      </strong>
                      <span className="text-[10px] text-amber-600/80 font-mono">Bs {alm.totales.totalValorDevuelto.toFixed(2)}</span>
                    </div>

                    <div className="p-2 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40">
                      <span className="text-indigo-600 dark:text-indigo-400 block font-medium text-[10.5px]">Faltante / Sobrante</span>
                      <strong className="text-xs font-mono text-indigo-700 dark:text-indigo-300 block mt-0.5">
                        0 uds (100% Cuadrado)
                      </strong>
                      <span className="text-[10px] text-indigo-600/80 font-mono">Diferencia: Bs 0.00</span>
                    </div>
                  </div>

                  {/* DETALLE COMPACTO DE PRODUCTOS CON DEVOLUCIÓN */}
                  <div className="space-y-1.5 pt-0.5">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                      <span className="flex items-center gap-1.5 text-[11px]">
                        <RotateCcw className="h-3 w-3 text-amber-600" />
                        Productos con Retorno Físico ({returnedAlmItems.length} SKUs):
                      </span>
                      <button
                        onClick={() => setShowProductModal(true)}
                        className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 text-[11px] font-medium cursor-pointer flex items-center gap-1"
                      >
                        <span>Abrir modal con los {alm.items.length} productos</span>
                        <Maximize2 className="h-3 w-3" />
                      </button>
                    </div>

                    {returnedAlmItems.length > 0 ? (
                      <div className="rounded-lg border border-amber-200/80 bg-amber-50/20 dark:border-amber-950 dark:bg-amber-950/10 overflow-hidden">
                        <table className="w-full border-collapse text-left text-xs">
                          <thead>
                            <tr className="border-b border-amber-100 bg-amber-100/40 text-[10.5px] font-semibold text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                              <th className="py-1 px-2.5">Código</th>
                              <th className="py-1 px-2.5">Descripción del Producto</th>
                              <th className="py-1 px-2.5 text-right">Cant. Despacho</th>
                              <th className="py-1 px-2.5 text-right">Cant. Facturado</th>
                              <th className="py-1 px-2.5 text-right font-bold text-amber-700 dark:text-amber-300">Cant. Devuelto</th>
                              <th className="py-1 px-2.5 text-right font-bold text-amber-700 dark:text-amber-300">Valor Devuelto (Bs)</th>
                              <th className="py-1 px-2.5 text-center">Estado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-amber-100/60 dark:divide-amber-950/30 font-mono text-[11.5px]">
                            {returnedAlmItems.map((it) => (
                              <tr key={it.codigo} className="hover:bg-amber-100/30 transition-colors">
                                <td className="py-1 px-2.5 font-bold text-slate-800 dark:text-slate-200">{it.codigo}</td>
                                <td className="py-1 px-2.5 font-sans font-medium text-slate-900 dark:text-slate-100">{it.producto}</td>
                                <td className="py-1 px-2.5 text-right text-slate-600">{it.cantidadDespacho}</td>
                                <td className="py-1 px-2.5 text-right text-emerald-600 font-semibold">{it.cantidadFacturado}</td>
                                <td className="py-1 px-2.5 text-right font-bold text-amber-700 dark:text-amber-300 bg-amber-100/50 dark:bg-amber-950/30">
                                  {it.cantidadDevuelto} {it.um}
                                </td>
                                <td className="py-1 px-2.5 text-right font-bold text-amber-700 dark:text-amber-300 bg-amber-100/50 dark:bg-amber-950/30">
                                  Bs {it.valorDevuelto.toFixed(2)}
                                </td>
                                <td className="py-1 px-2.5 text-center font-sans">
                                  <Badge variant="outline" className="text-[9px] border-amber-300 bg-amber-50 text-amber-700 py-0 px-1">
                                    Retorno en Rampa
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>Sin devoluciones físicas. El 100% de la carga despachada fue entregada conforme a los clientes.</span>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* ───────────────────────────────────────────────────────────── */}
              {/* TAB 2: CIERRE LOGÍSTICO COBRANZAS (Distribución Ejecutiva)   */}
              {/* ───────────────────────────────────────────────────────────── */}
              <TabsContent value="cobranza" className="mt-2.5 space-y-2.5">
                {isEditingCobranza && selectedCierre ? (
                  <CierreCobranzaInPlaceEditor
                    cierre={selectedCierre}
                    onSave={(updatedCob, newStatus, statusLabel) => {
                      setCierresData((prev) =>
                        prev.map((c) => {
                          if (c.id === selectedCierre.id) {
                            return {
                              ...c,
                              status: newStatus,
                              statusLabel: statusLabel,
                              cobranza: updatedCob,
                            }
                          }
                          return c
                        })
                      )
                      setIsEditingCobranza(false)
                      toast.success(
                        `Liquidación de cobranzas para OT #${selectedCierre.orderCode} guardada exitosamente`
                      )
                    }}
                    onCancel={() => setIsEditingCobranza(false)}
                  />
                ) : (
                  <>
                    {/* 1. TARJETA PRINCIPAL: DISTRIBUCIÓN PORCENTUAL + BOTONES DE ACCIÓN */}
                    <div className="rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900 shadow-xs space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-xs">
                            <Banknote className="h-3.5 w-3.5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                Distribución Porcentual del Medio de Pago
                              </h3>
                              <Badge variant="outline" className="text-[9px] font-mono border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 py-0 px-1">
                                {selectedCierre ? selectedCierre.statusLabel : '100% Cuadrado'}
                              </Badge>
                            </div>
                            <p className="text-[10.5px] text-slate-500 font-mono">
                              Total a Rendir: <strong className="text-slate-800 dark:text-slate-200 font-bold">Bs {cob.resumenCobranzas.totalARendir.toFixed(2)}</strong> • OT: <span className="font-semibold text-slate-700 dark:text-slate-300">{selectedCierre?.orderCode}</span>
                            </p>
                          </div>
                        </div>

                        {/* BOTONES DE ACCIÓN */}
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={() => {
                              setCobranzaFilterStatus('ALL')
                              setShowCobranzaModal(true)
                            }}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer text-xs font-bold shadow-sm shadow-emerald-600/20 h-8 px-3.5 rounded-xl flex items-center gap-1.5 self-start sm:self-auto shrink-0 transition-all hover:scale-[1.02]"
                          >
                            <Maximize2 className="h-3.5 w-3.5" />
                            <span>Ver desglose de cobranzas</span>
                          </Button>
                        </div>
                      </div>

                  {/* Barra de progreso multi-color proporcional */}
                  <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
                    <div
                      style={{ width: '61.3%' }}
                      className="bg-emerald-500 hover:bg-emerald-600 transition-all cursor-pointer"
                      title="Efectivo Físico: 61.3% (Bs 12,481.08)"
                      onClick={() => {
                        setCobranzaFilterStatus('EFECTIVO')
                        setShowCobranzaModal(true)
                      }}
                    />
                    <div
                      style={{ width: '22.1%' }}
                      className="bg-blue-500 hover:bg-blue-600 transition-all cursor-pointer"
                      title="Transferencias Bancarias: 22.1% (Bs 4,500.00)"
                      onClick={() => {
                        setCobranzaFilterStatus('TRANSFERENCIA')
                        setShowCobranzaModal(true)
                      }}
                    />
                    <div
                      style={{ width: '14.7%' }}
                      className="bg-purple-500 hover:bg-purple-600 transition-all cursor-pointer"
                      title="Pagos QR: 14.7% (Bs 3,000.00)"
                      onClick={() => {
                        setCobranzaFilterStatus('QR')
                        setShowCobranzaModal(true)
                      }}
                    />
                    <div
                      style={{ width: '1.9%' }}
                      className="bg-indigo-500 hover:bg-indigo-600 transition-all cursor-pointer"
                      title="Ventas a Crédito: 1.9% (Bs 388.00)"
                      onClick={() => {
                        setCobranzaFilterStatus('CREDITO')
                        setShowCobranzaModal(true)
                      }}
                    />
                  </div>

                  {/* Leyenda interactiva inferior */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-0.5 text-[10.5px]">
                    <div
                      onClick={() => {
                        setCobranzaFilterStatus('EFECTIVO')
                        setShowCobranzaModal(true)
                      }}
                      className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
                    >
                      <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                      <span className="text-slate-600 dark:text-slate-400">Efectivo:</span>
                      <strong className="font-mono font-bold text-slate-800 dark:text-slate-200">61.3%</strong>
                      <span className="text-slate-400 font-mono text-[9.5px]">(Bs 12.4k)</span>
                    </div>

                    <div
                      onClick={() => {
                        setCobranzaFilterStatus('TRANSFERENCIA')
                        setShowCobranzaModal(true)
                      }}
                      className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
                    >
                      <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                      <span className="text-slate-600 dark:text-slate-400">Transferencias:</span>
                      <strong className="font-mono font-bold text-slate-800 dark:text-slate-200">22.1%</strong>
                      <span className="text-slate-400 font-mono text-[9.5px]">(Bs 4.5k)</span>
                    </div>

                    <div
                      onClick={() => {
                        setCobranzaFilterStatus('QR')
                        setShowCobranzaModal(true)
                      }}
                      className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
                    >
                      <span className="h-2 w-2 rounded-full bg-purple-500 shrink-0" />
                      <span className="text-slate-600 dark:text-slate-400">Pagos QR:</span>
                      <strong className="font-mono font-bold text-slate-800 dark:text-slate-200">14.7%</strong>
                      <span className="text-slate-400 font-mono text-[9.5px]">(Bs 3.0k)</span>
                    </div>

                    <div
                      onClick={() => {
                        setCobranzaFilterStatus('CREDITO')
                        setShowCobranzaModal(true)
                      }}
                      className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
                    >
                      <span className="h-2 w-2 rounded-full bg-indigo-500 shrink-0" />
                      <span className="text-slate-600 dark:text-slate-400">Créditos:</span>
                      <strong className="font-mono font-bold text-slate-800 dark:text-slate-200">1.9%</strong>
                      <span className="text-slate-400 font-mono text-[9.5px]">(Bs 388)</span>
                    </div>
                  </div>
                </div>

                {/* 2. BLOQUE SUPERIOR: CUADRE EJECUTIVO DE 3 TARJETAS */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {/* 2.1 Resumen Facturación */}
                  <div className="rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
                    <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                        Resumen Facturación
                      </span>
                      <Badge variant="secondary" className="text-[9px] py-0 px-1 font-mono">Venta Neta</Badge>
                    </div>
                    <div className="mt-1.5 space-y-1 text-xs">
                      <div className="flex justify-between items-center py-0.5 border-b border-slate-50 dark:border-slate-800/50">
                        <span className="font-bold text-slate-900 dark:text-slate-100 text-[11px]">IMPORTE FACTURADO</span>
                        <span className="font-bold font-mono text-[11.5px] text-slate-900 dark:text-slate-100">
                          Bs {cob.resumenFinanciero.importeFacturado.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-slate-600 dark:text-slate-400 text-[11px]">
                        <span>Importe Bonificado:</span>
                        <span className="font-mono">Bs {cob.resumenFinanciero.importeBonificado.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-600 dark:text-slate-400 text-[11px]">
                        <span>Importe Entregado (F+B):</span>
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                          Bs {cob.resumenFinanciero.importeEntregado.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-slate-600 dark:text-slate-400 text-[11px]">
                        <span>Importe Devuelto:</span>
                        <span className="font-mono text-amber-600 font-semibold">
                          Bs {cob.resumenFinanciero.importeDevuelto.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center pt-1 border-t border-slate-200 font-bold text-slate-900 dark:border-slate-700 dark:text-slate-100 text-[11px]">
                        <span>VALOR TOTAL DESPACHO</span>
                        <span className="font-mono text-xs">
                          Bs {cob.resumenFinanciero.valorDespacho.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 2.2 Recaudación en Mano del Chofer */}
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-2.5 dark:border-emerald-900 dark:bg-emerald-950/20 shadow-xs">
                    <div className="flex items-center justify-between pb-1 border-b border-emerald-100 dark:border-emerald-900/50">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                        Recaudación en Mano (Chofer)
                      </span>
                      <Badge className="bg-emerald-600 text-white text-[9px] py-0 px-1 font-mono">Caja Recibida</Badge>
                    </div>
                    <div className="mt-1.5 space-y-1 text-xs">
                      <div className="flex justify-between items-center text-slate-700 dark:text-slate-300 text-[11px]">
                        <span className="flex items-center gap-1"><Coins className="h-3 w-3 text-emerald-600" /> Efectivo Físico:</span>
                        <span className="font-mono font-bold">Bs {cob.resumenCobranzas.efectivo.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-700 dark:text-slate-300 text-[11px]">
                        <span className="flex items-center gap-1"><Landmark className="h-3 w-3 text-blue-600" /> Transferencias:</span>
                        <span className="font-mono font-bold">Bs {cob.resumenCobranzas.transferencia.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-700 dark:text-slate-300 text-[11px]">
                        <span className="flex items-center gap-1"><QrCode className="h-3 w-3 text-purple-600" /> Pagos QR:</span>
                        <span className="font-mono font-bold">Bs {cob.resumenCobranzas.qr.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-700 dark:text-slate-300 text-[11px]">
                        <span className="flex items-center gap-1"><CreditCard className="h-3 w-3 text-slate-400" /> Cheques:</span>
                        <span className="font-mono">Bs {cob.resumenCobranzas.cheque.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center pt-1 border-t border-emerald-300 font-bold text-emerald-900 dark:border-emerald-800 dark:text-emerald-200 text-[11px]">
                        <span>TOTAL RECAUDADO CHOFER</span>
                        <span className="font-mono text-xs text-emerald-700 dark:text-emerald-300">
                          Bs {cob.resumenCobranzas.cobranzaChofer.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 2.3 Conciliación Total */}
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-2.5 dark:border-indigo-900 dark:bg-indigo-950/20 shadow-xs">
                    <div className="flex items-center justify-between pb-1 border-b border-indigo-100 dark:border-indigo-900/50">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-800 dark:text-indigo-300">
                        Conciliación y Rendición Total
                      </span>
                      <Badge className="bg-indigo-600 text-white text-[9px] py-0 px-1 font-mono">100% Cuadrado</Badge>
                    </div>
                    <div className="mt-1.5 space-y-1 text-xs">
                      <div className="flex justify-between items-center text-slate-700 dark:text-slate-300 text-[11px]">
                        <span>Cobranza Chofer en Mano:</span>
                        <span className="font-mono font-semibold">Bs {cob.resumenCobranzas.cobranzaChofer.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-700 dark:text-slate-300 text-[11px]">
                        <span>Ventas a Crédito Autorizadas:</span>
                        <span className="font-mono font-semibold text-purple-700 dark:text-purple-300">
                          Bs {cob.resumenCobranzas.credito.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-slate-700 dark:text-slate-300 text-[11px]">
                        <span>Cobranza Cobrador Posterior:</span>
                        <span className="font-mono">Bs {cob.resumenCobranzas.cobranzaCobrador.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-500 dark:text-slate-400 text-[11px]">
                        <span>Diferencia Neta de Cuadre:</span>
                        <span className="font-mono font-bold text-emerald-600">Bs 0.00 (Exacto)</span>
                      </div>
                      <div className="flex justify-between items-center pt-1 border-t border-indigo-300 font-black text-indigo-950 dark:border-indigo-800 dark:text-indigo-200 text-[11px]">
                        <span>TOTAL RENDIDO VS FACTURADO</span>
                        <span className="font-mono text-xs text-indigo-700 dark:text-indigo-300">
                          Bs {cob.resumenCobranzas.totalARendir.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. TARJETAS DE MEDIOS DE PAGO CON BOTONES DIRECTOS AL MODAL */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {/* Tarjeta 1: Efectivo Físico */}
                  <div className="rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900 shadow-xs flex flex-col justify-between hover:border-emerald-300 transition-colors">
                    <div>
                      <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-1.5">
                          <Coins className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                            Efectivo Físico
                          </span>
                        </div>
                        <Badge variant="outline" className="text-[9px] font-mono text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 py-0 px-1">
                          61.3%
                        </Badge>
                      </div>

                      <div className="mt-1.5">
                        <span className="text-base md:text-lg font-bold text-slate-900 dark:text-slate-100 font-mono block">
                          Bs {cob.resumenCobranzas.efectivo.toFixed(2)}
                        </span>
                        <span className="text-[10.5px] text-slate-500 block mt-0.5">
                          10 cortes arqueados ({cob.cortesBs.reduce((acc, c) => acc + c.cantidad, 0)} piezas)
                        </span>
                        <div className="mt-1.5 text-[10px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 p-1.5 rounded-md space-y-0.5 font-mono">
                          <div className="flex justify-between">
                            <span>Billetes (Bs 200..10):</span>
                            <strong>Bs 12,380.00</strong>
                          </div>
                          <div className="flex justify-between">
                            <span>Monedas (Bs 5..0.2):</span>
                            <strong>Bs 101.08</strong>
                          </div>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setCobranzaFilterStatus('EFECTIVO')
                        setShowCobranzaModal(true)
                      }}
                      className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 flex items-center justify-between gap-1 mt-2 pt-1 border-t border-slate-100 dark:border-slate-800 cursor-pointer"
                    >
                      <span>Ver arqueo de 10 cortes</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Tarjeta 2: Transferencias Bancarias */}
                  <div className="rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900 shadow-xs flex flex-col justify-between hover:border-blue-300 transition-colors">
                    <div>
                      <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-1.5">
                          <Landmark className="h-3.5 w-3.5 text-blue-600" />
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                            Transferencias ACH
                          </span>
                        </div>
                        <Badge variant="outline" className="text-[9px] font-mono text-blue-700 bg-blue-50 dark:bg-blue-950/40 border-blue-200 py-0 px-1">
                          22.1%
                        </Badge>
                      </div>

                      <div className="mt-1.5">
                        <span className="text-base md:text-lg font-bold text-slate-900 dark:text-slate-100 font-mono block">
                          Bs {cob.resumenCobranzas.transferencia.toFixed(2)}
                        </span>
                        <span className="text-[10.5px] text-slate-500 block mt-0.5">
                          {cob.transferencias.length} comprobantes verificados
                        </span>
                        <div className="mt-1.5 text-[10px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 p-1.5 rounded-md space-y-0.5 font-mono">
                          {cob.transferencias.map((t) => (
                            <div key={t.transaccion} className="flex justify-between truncate">
                              <span className="truncate max-w-[90px]">{t.banco}:</span>
                              <strong>Bs {t.monto.toFixed(2)}</strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setCobranzaFilterStatus('TRANSFERENCIA')
                        setShowCobranzaModal(true)
                      }}
                      className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center justify-between gap-1 mt-2 pt-1 border-t border-slate-100 dark:border-slate-800 cursor-pointer"
                    >
                      <span>Ver {cob.transferencias.length} transferencias</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Tarjeta 3: Pagos QR Simple */}
                  <div className="rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900 shadow-xs flex flex-col justify-between hover:border-purple-300 transition-colors">
                    <div>
                      <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-1.5">
                          <QrCode className="h-3.5 w-3.5 text-purple-600" />
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                            Pagos QR Simple
                          </span>
                        </div>
                        <Badge variant="outline" className="text-[9px] font-mono text-purple-700 bg-purple-50 dark:bg-purple-950/40 border-purple-200 py-0 px-1">
                          14.7%
                        </Badge>
                      </div>

                      <div className="mt-1.5">
                        <span className="text-base md:text-lg font-bold text-slate-900 dark:text-slate-100 font-mono block">
                          Bs {cob.resumenCobranzas.qr.toFixed(2)}
                        </span>
                        <span className="text-[10.5px] text-slate-500 block mt-0.5">
                          {cob.pagosQr.length} pagos validados
                        </span>
                        <div className="mt-1.5 text-[10px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 p-1.5 rounded-md space-y-0.5 font-mono">
                          {cob.pagosQr.map((q) => (
                            <div key={q.transaccion} className="flex justify-between truncate">
                              <span className="truncate max-w-[90px]">{q.banco}:</span>
                              <strong>Bs {q.monto.toFixed(2)}</strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setCobranzaFilterStatus('QR')
                        setShowCobranzaModal(true)
                      }}
                      className="text-[11px] font-semibold text-purple-600 hover:text-purple-700 dark:text-purple-400 flex items-center justify-between gap-1 mt-2 pt-1 border-t border-slate-100 dark:border-slate-800 cursor-pointer"
                    >
                      <span>Ver {cob.pagosQr.length} pagos QR</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Tarjeta 4: Ventas a Crédito y Retornos */}
                  <div className="rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900 shadow-xs flex flex-col justify-between hover:border-indigo-300 transition-colors">
                    <div>
                      <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-1.5">
                          <CreditCard className="h-3.5 w-3.5 text-indigo-600" />
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                            Crédito & Retorno
                          </span>
                        </div>
                        <Badge variant="outline" className="text-[9px] font-mono text-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 py-0 px-1">
                          1.9%
                        </Badge>
                      </div>

                      <div className="mt-1.5">
                        <div className="flex items-baseline justify-between">
                          <span className="text-base md:text-lg font-bold text-slate-900 dark:text-slate-100 font-mono">
                            Bs {cob.resumenCobranzas.credito.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-amber-600 font-mono font-medium">
                            + Bs {cob.resumenFinanciero.importeDevuelto.toFixed(2)} ret.
                          </span>
                        </div>
                        <span className="text-[10.5px] text-slate-500 block mt-0.5">
                          {cob.creditos.length} cliente crédito • {cob.devolucionesNoCobradas.length} facturas devueltas
                        </span>
                        <div className="mt-1.5 text-[10px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 p-1.5 rounded-md space-y-0.5 font-mono">
                          <div className="flex justify-between truncate text-indigo-700 dark:text-indigo-300">
                            <span className="truncate max-w-[90px]">Crédito:</span>
                            <strong>Bs {cob.resumenCobranzas.credito.toFixed(2)}</strong>
                          </div>
                          <div className="flex justify-between truncate text-amber-700 dark:text-amber-300">
                            <span className="truncate max-w-[90px]">Devuelto:</span>
                            <strong>Bs {cob.resumenFinanciero.importeDevuelto.toFixed(2)}</strong>
                          </div>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setCobranzaFilterStatus('CREDITO')
                        setShowCobranzaModal(true)
                      }}
                      className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 flex items-center justify-between gap-1 mt-2 pt-1 border-t border-slate-100 dark:border-slate-800 cursor-pointer"
                    >
                      <span>Ver créditos y retornos</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </TabsContent>

              {/* ───────────────────────────────────────────────────────────── */}
              {/* TAB 3: BALANCE CONSOLIDADO (Compacto)                         */}
              {/* ───────────────────────────────────────────────────────────── */}
              <TabsContent value="balance" className="mt-2.5 space-y-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
                    <Sparkles className="h-4 w-4 text-indigo-600" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Matriz de Concordancia Operativa y Financiera (OT: {selectedCierre.orderCode})
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-3">
                    {/* Cuadre Físico */}
                    <div className="space-y-2">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5" /> Cuadre Físico (Almacén)
                      </h4>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-800/40 space-y-1.5 text-xs">
                        <div className="flex justify-between py-0.5 border-b border-slate-200/60 dark:border-slate-700/60">
                          <span>Unidades Despachadas Iniciales:</span>
                          <strong className="font-mono">{alm.totales.totalCantidadDespacho} unidades</strong>
                        </div>
                        <div className="flex justify-between py-0.5 border-b border-slate-200/60 dark:border-slate-700/60">
                          <span>Unidades Entregadas (Facturado + Bono):</span>
                          <strong className="font-mono text-emerald-600">{alm.totales.totalFacturadoTotal} unidades</strong>
                        </div>
                        <div className="flex justify-between py-0.5 border-b border-slate-200/60 dark:border-slate-700/60">
                          <span>Unidades Retornadas a Bodega:</span>
                          <strong className="font-mono text-amber-600">{alm.totales.totalCantidadDevuelto} unidades</strong>
                        </div>
                        <div className="flex justify-between py-1 font-bold bg-white dark:bg-slate-900 px-2 rounded text-xs">
                          <span>Diferencia Física Neta:</span>
                          <strong className="font-mono text-emerald-600">0 unidades (100% Cuadrado)</strong>
                        </div>
                      </div>
                    </div>

                    {/* Cuadre Monetario */}
                    <div className="space-y-2">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                        <Banknote className="h-3.5 w-3.5" /> Cuadre Financiero (Cobranzas)
                      </h4>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-800/40 space-y-1.5 text-xs">
                        <div className="flex justify-between py-0.5 border-b border-slate-200/60 dark:border-slate-700/60">
                          <span>Importe Facturado Oficial:</span>
                          <strong className="font-mono">Bs {cob.resumenFinanciero.importeFacturado.toFixed(2)}</strong>
                        </div>
                        <div className="flex justify-between py-0.5 border-b border-slate-200/60 dark:border-slate-700/60">
                          <span>Cobranza Recaudada en Mano:</span>
                          <strong className="font-mono text-emerald-600">Bs {cob.resumenCobranzas.cobranzaChofer.toFixed(2)}</strong>
                        </div>
                        <div className="flex justify-between py-0.5 border-b border-slate-200/60 dark:border-slate-700/60">
                          <span>Ventas a Crédito Autorizadas:</span>
                          <strong className="font-mono text-indigo-600">Bs {cob.resumenCobranzas.credito.toFixed(2)}</strong>
                        </div>
                        <div className="flex justify-between py-1 font-bold bg-white dark:bg-slate-900 px-2 rounded text-xs">
                          <span>Total Rendido vs Facturado:</span>
                          <strong className="font-mono text-emerald-600">Bs {cob.resumenCobranzas.totalARendir.toFixed(2)} (Cuadre Exacto)</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: TABLA COMPLETA DE CONCILIACIÓN FÍSICA (14 COLUMNAS)             */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {alm && selectedCierre && (
        <Dialog open={showProductModal} onOpenChange={setShowProductModal}>
          <DialogContent className="flex h-[92vh] max-h-[94vh] w-[min(1750px,calc(100vw-2rem))] max-w-none sm:max-w-none flex-col gap-0 overflow-hidden p-0 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl">
            {/* Header del Modal */}
            <DialogHeader className="p-3 pb-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 shrink-0">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pr-8">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs">
                      <Package className="h-3.5 w-3.5" />
                    </div>
                    <DialogTitle className="text-sm md:text-base font-bold text-slate-900 dark:text-slate-100">
                      Conciliación de Carga y Retorno Físico por Producto (14 Columnas)
                    </DialogTitle>
                    <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300 font-semibold font-mono text-[10px] py-0 px-1.5">
                      {alm.items.length} SKUs Registrados
                    </Badge>
                  </div>
                  <DialogDescription className="text-[11px] text-slate-500 mt-0.5 font-mono flex items-center gap-1.5 flex-wrap">
                    <span>Despacho: <strong>{selectedCierre.orderCode}</strong></span>
                    <span>•</span>
                    <span>Chofer: <strong>{selectedCierre.driverName}</strong> ({selectedCierre.driverEmpresa})</span>
                    <span>•</span>
                    <span>Placa: <strong>{selectedCierre.truckPlate}</strong></span>
                    <span>•</span>
                    <span>Ruta: <strong>{selectedCierre.routeName}</strong></span>
                  </DialogDescription>
                </div>

                {/* Resumen KPI rápido en el Header del Modal */}
                <div className="flex items-center gap-1.5 font-mono text-xs">
                  <div className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 text-blue-700 dark:text-blue-300 text-[11px]">
                    <span className="text-[9px] text-blue-500 block uppercase font-sans">Despacho</span>
                    <strong>{alm.totales.totalCantidadDespacho} uds</strong> (Bs {alm.totales.totalValorDespacho.toFixed(2)})
                  </div>
                  <div className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 text-[11px]">
                    <span className="text-[9px] text-emerald-500 block uppercase font-sans">Entregado</span>
                    <strong>{alm.totales.totalFacturadoTotal} uds</strong> (Bs {alm.totales.totalValorFacturado.toFixed(2)})
                  </div>
                  <div className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900 text-amber-700 dark:text-amber-300 text-[11px]">
                    <span className="text-[9px] text-amber-500 block uppercase font-sans">Devuelto</span>
                    <strong>{alm.totales.totalCantidadDevuelto} uds</strong> (Bs {alm.totales.totalValorDevuelto.toFixed(2)})
                  </div>
                </div>
              </div>
            </DialogHeader>

            {/* Barra de Filtros Rápidos y Buscador en el Modal */}
            <div className="p-2 px-3 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="flex items-center bg-slate-200/70 dark:bg-slate-800 p-0.5 rounded-lg text-xs">
                  <button
                    type="button"
                    onClick={() => setProductFilterStatus('ALL')}
                    className={cn(
                      'px-2.5 py-1 rounded-md transition-colors cursor-pointer font-medium text-[11px]',
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
                      'px-2.5 py-1 rounded-md transition-colors cursor-pointer font-medium text-[11px] flex items-center gap-1',
                      productFilterStatus === 'DEV'
                        ? 'bg-amber-500 text-white shadow-xs font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    )}
                  >
                    <span>Con Devolución</span>
                    <span className="text-[9px] bg-amber-600/30 px-1 py-0.2 rounded-full font-bold">
                      {alm.items.filter((i) => i.cantidadDevuelto > 0).length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setProductFilterStatus('BON')}
                    className={cn(
                      'px-2.5 py-1 rounded-md transition-colors cursor-pointer font-medium text-[11px] flex items-center gap-1',
                      productFilterStatus === 'BON'
                        ? 'bg-purple-600 text-white shadow-xs font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    )}
                  >
                    <span>Con Bonif.</span>
                    <span className="text-[9px] bg-purple-700/30 px-1 py-0.2 rounded-full font-bold">
                      {alm.items.filter((i) => i.cantidadBonificacion > 0).length}
                    </span>
                  </button>
                </div>

                <span className="text-[11px] text-slate-500 font-mono hidden md:inline ml-2">
                  Mostrando <strong>{filteredAlmItems.length}</strong> de {alm.items.length} productos registrados
                </span>
              </div>

              {/* Buscador de Producto */}
              <div className="relative w-full sm:w-72">
                <Search
                  size={13}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <Input
                  placeholder="Buscar SKU o descripción..."
                  value={productTableSearch}
                  onChange={(e) => setProductTableSearch(e.target.value)}
                  className="h-8 pl-8 pr-7 text-xs bg-white dark:bg-slate-950 shadow-xs"
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

            {/* Contenedor con Scroll de la Tabla de 14 Columnas Ultra-Amplia y Compacta */}
            <div className="flex-1 overflow-x-auto overflow-y-auto w-full">
              <table className="w-full border-collapse text-left text-xs min-w-[1450px]">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 z-10 shadow-xs">
                  <tr className="border-b border-slate-200 text-[10.5px] font-bold text-slate-700 dark:border-slate-700 dark:text-slate-300 uppercase tracking-tight">
                    <th className="py-2 px-2.5 text-center w-10">N°</th>
                    <th className="py-2 px-2.5 min-w-[95px]">Código SKU</th>
                    <th className="py-2 px-2.5 min-w-[280px]">Descripción del Producto</th>
                    <th className="py-2 px-2.5 text-center min-w-[60px]">U.M.</th>
                    <th className="py-2 px-2.5 text-right min-w-[115px] bg-blue-50/70 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200">Cant. Despacho</th>
                    <th className="py-2 px-2.5 text-right min-w-[115px] bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200">Cant. Facturado</th>
                    <th className="py-2 px-2.5 text-right min-w-[105px] bg-purple-50/70 dark:bg-purple-950/40 text-purple-800 dark:text-purple-200">Cant. Bonif.</th>
                    <th className="py-2 px-2.5 text-right min-w-[125px] font-black bg-slate-200/90 dark:bg-slate-700/90 text-slate-900 dark:text-slate-100">Facturado Total</th>
                    <th className="py-2 px-2.5 text-right min-w-[115px] bg-amber-50/70 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200">Cant. Devuelto</th>
                    <th className="py-2 px-2.5 text-right min-w-[95px]">Cant. Faltante</th>
                    <th className="py-2 px-2.5 text-right min-w-[95px]">Cant. Sobrante</th>
                    <th className="py-2 px-2.5 text-right min-w-[125px] font-semibold text-slate-800 dark:text-slate-200">Valor Despacho</th>
                    <th className="py-2 px-2.5 text-right min-w-[125px] font-semibold text-emerald-700 dark:text-emerald-300">Valor Facturado</th>
                    <th className="py-2 px-2.5 text-right min-w-[115px] font-semibold text-purple-700 dark:text-purple-300">Valor Bonif.</th>
                    <th className="py-2 px-2.5 text-right min-w-[125px] font-bold text-amber-700 dark:text-amber-300">Valor Devuelto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono dark:divide-slate-800 text-[11.5px]">
                  {filteredAlmItems.length === 0 ? (
                    <tr>
                      <td colSpan={15} className="p-8 text-center text-slate-400 font-sans">
                        No se encontraron productos con los filtros especificados.
                      </td>
                    </tr>
                  ) : (
                    filteredAlmItems.map((it, idx) => {
                      const hasDevolucion = it.cantidadDevuelto > 0
                      return (
                        <tr
                          key={it.codigo}
                          className={cn(
                            'hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors',
                            hasDevolucion && 'bg-amber-50/40 dark:bg-amber-950/20'
                          )}
                        >
                          <td className="py-1.5 px-2.5 text-slate-400 text-center">{idx + 1}</td>
                          <td className="py-1.5 px-2.5 font-bold text-slate-700 dark:text-slate-300">{it.codigo}</td>
                          <td className="py-1.5 px-2.5 font-sans font-medium text-slate-900 dark:text-slate-100">{it.producto}</td>
                          <td className="py-1.5 px-2.5 text-center text-slate-500">{it.um}</td>
                          <td className="py-1.5 px-2.5 text-right text-blue-700 dark:text-blue-300 font-medium bg-blue-50/30 dark:bg-blue-950/10">{it.cantidadDespacho}</td>
                          <td className="py-1.5 px-2.5 text-right text-emerald-700 dark:text-emerald-300 font-medium bg-emerald-50/30 dark:bg-emerald-950/10">{it.cantidadFacturado}</td>
                          <td className="py-1.5 px-2.5 text-right text-purple-700 dark:text-purple-300 font-medium bg-purple-50/30 dark:bg-purple-950/10">{it.cantidadBonificacion}</td>
                          <td className="py-1.5 px-2.5 text-right font-bold text-slate-900 dark:text-slate-100 bg-slate-100/60 dark:bg-slate-800/40">{it.facturadoTotal}</td>
                          <td className={cn(
                            'py-1.5 px-2.5 text-right font-bold bg-amber-50/40 dark:bg-amber-950/20',
                            hasDevolucion ? 'text-amber-700 dark:text-amber-300' : 'text-slate-400 font-normal'
                          )}>
                            {it.cantidadDevuelto}
                          </td>
                          <td className="py-1.5 px-2.5 text-right text-slate-400">{it.cantidadFaltante || '-'}</td>
                          <td className="py-1.5 px-2.5 text-right text-slate-400">{it.cantidadSobrante || '-'}</td>
                          <td className="py-1.5 px-2.5 text-right font-semibold text-slate-800 dark:text-slate-200">Bs {it.valorDespacho.toFixed(2)}</td>
                          <td className="py-1.5 px-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">Bs {it.valorFacturado.toFixed(2)}</td>
                          <td className="py-1.5 px-2.5 text-right text-purple-600 dark:text-purple-400">Bs {it.valorBonificacion.toFixed(2)}</td>
                          <td className={cn(
                            'py-1.5 px-2.5 text-right',
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
                    <td colSpan={4} className="py-2 px-2.5 text-center uppercase font-sans tracking-wider text-[11px]">
                      Total General ({alm.items.length} ítems)
                    </td>
                    <td className="py-2 px-2.5 text-right text-blue-700 dark:text-blue-300">{alm.totales.totalCantidadDespacho}</td>
                    <td className="py-2 px-2.5 text-right text-emerald-700 dark:text-emerald-300">{alm.totales.totalCantidadFacturado}</td>
                    <td className="py-2 px-2.5 text-right text-purple-700 dark:text-purple-300">{alm.totales.totalCantidadBonificacion}</td>
                    <td className="py-2 px-2.5 text-right text-slate-900 dark:text-slate-100">{alm.totales.totalFacturadoTotal}</td>
                    <td className="py-2 px-2.5 text-right text-amber-700 dark:text-amber-300">{alm.totales.totalCantidadDevuelto}</td>
                    <td className="py-2 px-2.5 text-right text-slate-400">{alm.totales.totalCantidadFaltante}</td>
                    <td className="py-2 px-2.5 text-right text-slate-400">{alm.totales.totalCantidadSobrante}</td>
                    <td className="py-2 px-2.5 text-right">Bs {alm.totales.totalValorDespacho.toFixed(2)}</td>
                    <td className="py-2 px-2.5 text-right text-emerald-600 dark:text-emerald-400">Bs {alm.totales.totalValorFacturado.toFixed(2)}</td>
                    <td className="py-2 px-2.5 text-right text-purple-600 dark:text-purple-400">Bs {alm.totales.totalValorBonificacion.toFixed(2)}</td>
                    <td className="py-2 px-2.5 text-right text-amber-600 dark:text-amber-400">Bs {alm.totales.totalValorDevuelto.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Footer del Modal */}
            <div className="p-2.5 px-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex justify-between items-center text-xs shrink-0">
              <span className="text-slate-500 font-mono flex items-center gap-1.5 text-[11px]">
                <Info size={13} className="text-indigo-600" />
                Valores en Bolivianos (Bs) • Cantidades físicas en unidades
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowProductModal(false)}
                className="cursor-pointer text-xs font-medium px-3 h-7.5"
              >
                Cerrar Tabla
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: DESGLOSE COMPLETO DE COBRANZAS (ARQUEO, BANCOS, QR, CRÉDITOS)   */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {cob && selectedCierre && (
        <Dialog open={showCobranzaModal} onOpenChange={setShowCobranzaModal}>
          <DialogContent className="flex h-[92vh] max-h-[94vh] w-[min(1750px,calc(100vw-2rem))] max-w-none sm:max-w-none flex-col gap-0 overflow-hidden p-0 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl">
            {/* Header del Modal */}
            <DialogHeader className="p-3 pb-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 shrink-0">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pr-8">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-xs">
                      <Banknote className="h-3.5 w-3.5" />
                    </div>
                    <DialogTitle className="text-sm md:text-base font-bold text-slate-900 dark:text-slate-100">
                      Conciliación Financiera y Desglose Completo de Cobranzas en Caja
                    </DialogTitle>
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 font-semibold font-mono text-[10px] py-0 px-1.5">
                      100% Cuadrado (Bs 0.00 Dif.)
                    </Badge>
                  </div>
                  <DialogDescription className="text-[11px] text-slate-500 mt-0.5 font-mono flex items-center gap-1.5 flex-wrap">
                    <span>Despacho: <strong>{selectedCierre.orderCode}</strong></span>
                    <span>•</span>
                    <span>Chofer: <strong>{selectedCierre.driverName}</strong> ({selectedCierre.driverEmpresa})</span>
                    <span>•</span>
                    <span>Placa: <strong>{selectedCierre.truckPlate}</strong></span>
                    <span>•</span>
                    <span>Ruta: <strong>{selectedCierre.routeName}</strong></span>
                  </DialogDescription>
                </div>

                {/* Resumen KPI rápido en el Header del Modal */}
                <div className="flex items-center gap-1.5 font-mono text-xs">
                  <div className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 text-blue-700 dark:text-blue-300 text-[11px]">
                    <span className="text-[9px] text-blue-500 block uppercase font-sans">Facturado</span>
                    <strong>Bs {cob.resumenFinanciero.importeFacturado.toFixed(2)}</strong>
                  </div>
                  <div className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 text-[11px]">
                    <span className="text-[9px] text-emerald-500 block uppercase font-sans">Recaudado Chofer</span>
                    <strong>Bs {cob.resumenCobranzas.cobranzaChofer.toFixed(2)}</strong>
                  </div>
                  <div className="px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/40 border border-purple-100 dark:border-purple-900 text-purple-700 dark:text-purple-300 text-[11px]">
                    <span className="text-[9px] text-purple-500 block uppercase font-sans">Créditos</span>
                    <strong>Bs {cob.resumenCobranzas.credito.toFixed(2)}</strong>
                  </div>
                  <div className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900 text-amber-700 dark:text-amber-300 text-[11px]">
                    <span className="text-[9px] text-amber-500 block uppercase font-sans">Devolución</span>
                    <strong>Bs {cob.resumenFinanciero.importeDevuelto.toFixed(2)}</strong>
                  </div>
                </div>
              </div>
            </DialogHeader>

            {/* Barra de Filtros Rápidos y Buscador en el Modal */}
            <div className="p-2 px-3 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="flex items-center bg-slate-200/70 dark:bg-slate-800 p-0.5 rounded-lg text-xs">
                  <button
                    type="button"
                    onClick={() => setCobranzaFilterStatus('ALL')}
                    className={cn(
                      'px-2.5 py-1 rounded-md transition-colors cursor-pointer font-medium text-[11px]',
                      cobranzaFilterStatus === 'ALL'
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    )}
                  >
                    Todos los Medios (17)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCobranzaFilterStatus('EFECTIVO')}
                    className={cn(
                      'px-2.5 py-1 rounded-md transition-colors cursor-pointer font-medium text-[11px] flex items-center gap-1',
                      cobranzaFilterStatus === 'EFECTIVO'
                        ? 'bg-emerald-600 text-white shadow-xs font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    )}
                  >
                    <span>Efectivo ({cob.cortesBs.length})</span>
                    <span className="text-[9px] bg-emerald-700/40 px-1 py-0.2 rounded-full font-bold">
                      Bs {cob.resumenCobranzas.efectivo.toFixed(2)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCobranzaFilterStatus('TRANSFERENCIA')}
                    className={cn(
                      'px-2.5 py-1 rounded-md transition-colors cursor-pointer font-medium text-[11px] flex items-center gap-1',
                      cobranzaFilterStatus === 'TRANSFERENCIA'
                        ? 'bg-blue-600 text-white shadow-xs font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    )}
                  >
                    <span>Transferencias ({cob.transferencias.length})</span>
                    <span className="text-[9px] bg-blue-700/40 px-1 py-0.2 rounded-full font-bold">
                      Bs {cob.resumenCobranzas.transferencia.toFixed(2)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCobranzaFilterStatus('QR')}
                    className={cn(
                      'px-2.5 py-1 rounded-md transition-colors cursor-pointer font-medium text-[11px] flex items-center gap-1',
                      cobranzaFilterStatus === 'QR'
                        ? 'bg-purple-600 text-white shadow-xs font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    )}
                  >
                    <span>QR ({cob.pagosQr.length})</span>
                    <span className="text-[9px] bg-purple-700/40 px-1 py-0.2 rounded-full font-bold">
                      Bs {cob.resumenCobranzas.qr.toFixed(2)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCobranzaFilterStatus('CREDITO')}
                    className={cn(
                      'px-2.5 py-1 rounded-md transition-colors cursor-pointer font-medium text-[11px] flex items-center gap-1',
                      cobranzaFilterStatus === 'CREDITO'
                        ? 'bg-indigo-600 text-white shadow-xs font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    )}
                  >
                    <span>Créditos ({cob.creditos.length})</span>
                    <span className="text-[9px] bg-indigo-700/40 px-1 py-0.2 rounded-full font-bold">
                      Bs {cob.resumenCobranzas.credito.toFixed(2)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCobranzaFilterStatus('DEVOLUCION')}
                    className={cn(
                      'px-2.5 py-1 rounded-md transition-colors cursor-pointer font-medium text-[11px] flex items-center gap-1',
                      cobranzaFilterStatus === 'DEVOLUCION'
                        ? 'bg-amber-600 text-white shadow-xs font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    )}
                  >
                    <span>Devoluciones ({cob.devolucionesNoCobradas.length})</span>
                    <span className="text-[9px] bg-amber-700/40 px-1 py-0.2 rounded-full font-bold">
                      Bs {cob.resumenFinanciero.importeDevuelto.toFixed(2)}
                    </span>
                  </button>
                </div>
              </div>

              {/* Buscador de Cobranzas */}
              <div className="relative w-full sm:w-72">
                <Search
                  size={13}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <Input
                  placeholder="Buscar transacción, cliente o banco..."
                  value={cobranzaTableSearch}
                  onChange={(e) => setCobranzaTableSearch(e.target.value)}
                  className="h-8 pl-8 pr-7 text-xs bg-white dark:bg-slate-950 shadow-xs"
                />
                {cobranzaTableSearch && (
                  <button
                    type="button"
                    onClick={() => setCobranzaTableSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Contenedor con Scroll de las Tablas Panorámicas de Cobranza */}
            <div className="flex-1 overflow-x-auto overflow-y-auto p-3 space-y-4">
              {/* SECCIÓN 1: ARQUEO DE EFECTIVO FÍSICO */}
              {(cobranzaFilterStatus === 'ALL' || cobranzaFilterStatus === 'EFECTIVO') && filteredCortesBs.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 shadow-xs space-y-2">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        <Coins className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                          1. Arqueo Detallado de Efectivo Físico en Bóveda
                        </h4>
                        <span className="text-[10.5px] text-slate-500 font-sans">
                          10 cortes de billetes y monedas nacionales (Bs)
                        </span>
                      </div>
                    </div>
                    <Badge variant="outline" className="font-mono text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 text-xs py-0.5 px-2 font-bold">
                      Subtotal Efectivo: Bs {cob.resumenCobranzas.efectivo.toFixed(2)}
                    </Badge>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[10.5px] font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300 uppercase tracking-tight">
                          <th className="py-1.5 px-3">Denominación</th>
                          <th className="py-1.5 px-3 text-center">Tipo de Especie</th>
                          <th className="py-1.5 px-3 text-right">Cantidad (Piezas)</th>
                          <th className="py-1.5 px-3 text-right font-bold text-emerald-700 dark:text-emerald-300">Importe Total (Bs)</th>
                          <th className="py-1.5 px-3 text-center">Estado Verificación</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono dark:divide-slate-800/60 text-[11.5px]">
                        {filteredCortesBs.map((c) => (
                          <tr key={c.denominacion} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-1.5 px-3 font-bold text-slate-900 dark:text-slate-100">{c.denominacion}</td>
                            <td className="py-1.5 px-3 text-center font-sans text-slate-500">{c.tipo}</td>
                            <td className="py-1.5 px-3 text-right font-semibold text-slate-700 dark:text-slate-300">{c.cantidad} uds</td>
                            <td className="py-1.5 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                              Bs {c.monto.toFixed(2)}
                            </td>
                            <td className="py-1.5 px-3 text-center font-sans">
                              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                                <CheckCircle2 className="h-3 w-3" /> Contado y Verificado
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-300 font-mono font-bold text-xs bg-slate-50/80 dark:border-slate-700 dark:bg-slate-800/40 text-slate-900 dark:text-slate-100">
                          <td colSpan={2} className="py-1.5 px-3 uppercase font-sans tracking-wider text-[11px]">
                            Total Efectivo Físico
                          </td>
                          <td className="py-1.5 px-3 text-right font-bold">
                            {filteredCortesBs.reduce((acc, c) => acc + c.cantidad, 0)} piezas
                          </td>
                          <td className="py-1.5 px-3 text-right text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                            Bs {cob.resumenCobranzas.efectivo.toFixed(2)}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* SECCIÓN 2: TRANSFERENCIAS BANCARIAS */}
              {(cobranzaFilterStatus === 'ALL' || cobranzaFilterStatus === 'TRANSFERENCIA') && filteredTransferencias.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 shadow-xs space-y-2">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                        <Landmark className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                          2. Transferencias Bancarias Interbancarias (ACH)
                        </h4>
                        <span className="text-[10.5px] text-slate-500 font-sans">
                          Comprobantes bancarios verificados con extracto oficial
                        </span>
                      </div>
                    </div>
                    <Badge variant="outline" className="font-mono text-blue-700 bg-blue-50 dark:bg-blue-950/40 border-blue-200 text-xs py-0.5 px-2 font-bold">
                      Subtotal Transferencias: Bs {cob.resumenCobranzas.transferencia.toFixed(2)}
                    </Badge>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[10.5px] font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300 uppercase tracking-tight">
                          <th className="py-1.5 px-3">N° Transacción</th>
                          <th className="py-1.5 px-3">Banco Emisor</th>
                          <th className="py-1.5 px-3">Cliente / Razón Social</th>
                          <th className="py-1.5 px-3 text-right font-bold text-blue-700 dark:text-blue-300">Monto Transferido (Bs)</th>
                          <th className="py-1.5 px-3 text-center">Estado Conciliación</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono dark:divide-slate-800/60 text-[11.5px]">
                        {filteredTransferencias.map((t) => (
                          <tr key={t.transaccion} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-1.5 px-3 font-bold text-slate-800 dark:text-slate-200">{t.transaccion}</td>
                            <td className="py-1.5 px-3 font-sans font-medium text-slate-900 dark:text-slate-100">{t.banco}</td>
                            <td className="py-1.5 px-3 font-sans text-slate-700 dark:text-slate-300">{t.clienteNombre}</td>
                            <td className="py-1.5 px-3 text-right font-bold text-blue-600 dark:text-blue-400">
                              Bs {t.monto.toFixed(2)}
                            </td>
                            <td className="py-1.5 px-3 text-center font-sans">
                              <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 font-medium">
                                <CheckCircle2 className="h-3 w-3" /> Acreditado en Cuenta
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* SECCIÓN 3: PAGOS QR RECIBIDOS */}
              {(cobranzaFilterStatus === 'ALL' || cobranzaFilterStatus === 'QR') && filteredPagosQr.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 shadow-xs space-y-2">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                        <QrCode className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                          3. Pagos QR Simple / Interoperables
                        </h4>
                        <span className="text-[10.5px] text-slate-500 font-sans">
                          Cobros inmediatos generados y liquidados por código QR
                        </span>
                      </div>
                    </div>
                    <Badge variant="outline" className="font-mono text-purple-700 bg-purple-50 dark:bg-purple-950/40 border-purple-200 text-xs py-0.5 px-2 font-bold">
                      Subtotal QR: Bs {cob.resumenCobranzas.qr.toFixed(2)}
                    </Badge>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[10.5px] font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300 uppercase tracking-tight">
                          <th className="py-1.5 px-3">N° Transacción QR</th>
                          <th className="py-1.5 px-3">Entidad Bancaria</th>
                          <th className="py-1.5 px-3">Cliente / Razón Social</th>
                          <th className="py-1.5 px-3 text-right font-bold text-purple-700 dark:text-purple-300">Monto Cobrado (Bs)</th>
                          <th className="py-1.5 px-3 text-center">Estado Pasarela</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono dark:divide-slate-800/60 text-[11.5px]">
                        {filteredPagosQr.map((q) => (
                          <tr key={q.transaccion} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-1.5 px-3 font-bold text-slate-800 dark:text-slate-200">{q.transaccion}</td>
                            <td className="py-1.5 px-3 font-sans font-medium text-slate-900 dark:text-slate-100">{q.banco}</td>
                            <td className="py-1.5 px-3 font-sans text-slate-700 dark:text-slate-300">{q.clienteNombre}</td>
                            <td className="py-1.5 px-3 text-right font-bold text-purple-600 dark:text-purple-400">
                              Bs {q.monto.toFixed(2)}
                            </td>
                            <td className="py-1.5 px-3 text-center font-sans">
                              <span className="inline-flex items-center gap-1 text-[10px] text-purple-600 font-medium">
                                <CheckCircle2 className="h-3 w-3" /> Transacción Aprobada
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* SECCIÓN 4: VENTAS A CRÉDITO AUTORIZADAS */}
              {(cobranzaFilterStatus === 'ALL' || cobranzaFilterStatus === 'CREDITO') && filteredCreditos.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 shadow-xs space-y-2">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                        <CreditCard className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                          4. Ventas a Crédito Autorizadas por Créditos y Cobranzas
                        </h4>
                        <span className="text-[10.5px] text-slate-500 font-sans">
                          Cuentas por cobrar comerciales con firma de recepción de factura
                        </span>
                      </div>
                    </div>
                    <Badge variant="outline" className="font-mono text-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 text-xs py-0.5 px-2 font-bold">
                      Subtotal Crédito: Bs {cob.resumenCobranzas.credito.toFixed(2)}
                    </Badge>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[10.5px] font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300 uppercase tracking-tight">
                          <th className="py-1.5 px-3">Código Cliente</th>
                          <th className="py-1.5 px-3">Cliente / Razón Social</th>
                          <th className="py-1.5 px-3 text-center">N° Factura</th>
                          <th className="py-1.5 px-3 text-right font-bold text-indigo-700 dark:text-indigo-300">Importe Crédito (Bs)</th>
                          <th className="py-1.5 px-3 text-center">Estado Autorización</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono dark:divide-slate-800/60 text-[11.5px]">
                        {filteredCreditos.map((cr) => (
                          <tr key={cr.clienteCodigo} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-1.5 px-3 font-bold text-slate-800 dark:text-slate-200">{cr.clienteCodigo}</td>
                            <td className="py-1.5 px-3 font-sans font-medium text-slate-900 dark:text-slate-100">{cr.clienteNombre}</td>
                            <td className="py-1.5 px-3 text-center text-slate-600 dark:text-slate-400">{cr.factura}</td>
                            <td className="py-1.5 px-3 text-right font-bold text-indigo-700 dark:text-indigo-300">
                              Bs {cr.monto.toFixed(2)}
                            </td>
                            <td className="py-1.5 px-3 text-center font-sans">
                              <Badge variant="outline" className="border-indigo-300 bg-indigo-50 text-indigo-700 text-[9.5px] py-0 px-1.5">
                                Crédito Autorizado
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* SECCIÓN 5: FACTURAS NO COBRADAS POR DEVOLUCIÓN TOTAL */}
              {(cobranzaFilterStatus === 'ALL' || cobranzaFilterStatus === 'DEVOLUCION') && filteredDevoluciones.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 shadow-xs space-y-2">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                        <RotateCcw className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                          5. Facturas No Cobradas / Devolución Total de Mercadería
                        </h4>
                        <span className="text-[10.5px] text-slate-500 font-sans">
                          Mercadería que retornó físicamente a rampa y no fue pagada por el cliente
                        </span>
                      </div>
                    </div>
                    <Badge variant="outline" className="font-mono text-amber-700 bg-amber-50 dark:bg-amber-950/40 border-amber-200 text-xs py-0.5 px-2 font-bold">
                      Subtotal No Cobrado: Bs {cob.resumenFinanciero.importeDevuelto.toFixed(2)}
                    </Badge>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[10.5px] font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300 uppercase tracking-tight">
                          <th className="py-1.5 px-3">Código Cliente</th>
                          <th className="py-1.5 px-3">Cliente / Razón Social</th>
                          <th className="py-1.5 px-3 text-center">N° Factura</th>
                          <th className="py-1.5 px-3">Motivo de No Cobro / Retorno</th>
                          <th className="py-1.5 px-3 text-right font-bold text-amber-700 dark:text-amber-300">Monto Devuelto (Bs)</th>
                          <th className="py-1.5 px-3 text-center">Estado Físico</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono dark:divide-slate-800/60 text-[11.5px]">
                        {filteredDevoluciones.map((d) => (
                          <tr key={d.clienteCodigo} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-1.5 px-3 font-bold text-slate-800 dark:text-slate-200">{d.clienteCodigo}</td>
                            <td className="py-1.5 px-3 font-sans font-medium text-slate-900 dark:text-slate-100">{d.clienteNombre}</td>
                            <td className="py-1.5 px-3 text-center text-slate-600 dark:text-slate-400">{d.factura}</td>
                            <td className="py-1.5 px-3 font-sans text-amber-700 dark:text-amber-400 italic">
                              {d.motivo || 'Devolución de mercadería'}
                            </td>
                            <td className="py-1.5 px-3 text-right font-bold text-amber-700 dark:text-amber-300">
                              Bs {d.monto.toFixed(2)}
                            </td>
                            <td className="py-1.5 px-3 text-center font-sans">
                              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 text-[9.5px] py-0 px-1.5">
                                Reingreso a Rampa
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Footer del Modal */}
            <div className="p-2.5 px-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex justify-between items-center text-xs shrink-0">
              <span className="text-slate-500 font-mono flex items-center gap-1.5 text-[11px]">
                <Info size={13} className="text-emerald-600" />
                Valores en Bolivianos (Bs) • Cuadre contable oficial verificado
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCobranzaModal(false)}
                className="cursor-pointer text-xs font-medium px-3 h-7.5"
              >
                Cerrar Detalle
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
