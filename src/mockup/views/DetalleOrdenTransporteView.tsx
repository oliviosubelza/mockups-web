import React, { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  BadgeCheck,
  Building,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsDownUp,
  ChevronsUpDown,
  Clock,
  Copy,
  DollarSign,
  Download,
  Eye,
  FileCheck,
  FileClock,
  FileText,
  Fingerprint,
  Grid,
  HelpCircle,
  Image as ImageIcon,
  Layers,
  LayoutList,
  List,
  MapPin,
  Maximize2,
  Package,
  Phone,
  QrCode,
  RotateCw,
  Route,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Store,
  Truck,
  User,
  UserCheck,
  Wallet,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  HISTORIAL_ORDENES_TRANSPORTE,
  type FotoEvidencia,
  type OrdenTransporteHistorial,
  type ParadaHistorial,
} from '../historial-orders-data'
import { exportarHistorialAExcel } from '../utils/excel-export'
import { navigateTo } from '../routes'

export function DetalleOrdenTransporteView() {
  const { otId } = useParams<{ otId?: string }>()
  const [activeTab, setActiveTab] = useState<'paradas' | 'activos' | 'trazabilidad'>('paradas')

  // Estados de control para la gestión de paradas (de 20 hasta 50 puntos de entrega)
  const [searchParada, setSearchParada] = useState('')
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'DELIVERED' | 'DISCREPANCY'>('TODOS')
  const [selectedStopId, setSelectedStopId] = useState<string>('parada-101')
  const [searchProduct, setSearchProduct] = useState('')
  const [productCategoryFilter, setProductCategoryFilter] = useState('TODOS')
  const [activeStopTab, setActiveStopTab] = useState<'productos' | 'cobranzas' | 'pod'>('productos')

  // Buscar la orden por ID o caer a la primera
  const orden: OrdenTransporteHistorial | undefined = useMemo(() => {
    if (!otId) return HISTORIAL_ORDENES_TRANSPORTE[0]
    return (
      HISTORIAL_ORDENES_TRANSPORTE.find((o) => o.id === otId || o.code.toString() === otId) ??
      HISTORIAL_ORDENES_TRANSPORTE[0]
    )
  }, [otId])

  // Parada activa seleccionada en el panel derecho
  const selectedStop = useMemo(() => {
    if (!orden) return {} as ParadaHistorial
    return orden.paradas.find((p) => p.id === selectedStopId) || orden.paradas[0]
  }, [orden, selectedStopId])

  // Estados de control para productos dentro de la parada activa (para 30 a 40 SKUs)
  type ProductSortField = 'sku' | 'productName' | 'plannedQty' | 'deliveredQty' | 'returnedQty' | 'unitPrice' | 'total'
  type SortDirection = 'asc' | 'desc' | 'none'

  const [productSortField, setProductSortField] = useState<ProductSortField>('sku')
  const [productSortDirection, setProductSortDirection] = useState<SortDirection>('none')
  const [productCurrentPage, setProductCurrentPage] = useState(1)
  const [productPageSize, setProductPageSize] = useState(10)
  const [selectedOrderCode, setSelectedOrderCode] = useState<string>('TODOS')

  // Lista de pedidos de venta consolidados en esta parada
  const stopOrdersList = useMemo(() => {
    if (!selectedStop?.items) return []
    const map = new Map<string, { orderCode: string; orderType: string; itemsCount: number; totalAmount: number }>()
    selectedStop.items.forEach((it) => {
      const code = it.orderCode || selectedStop.deliveryNoteNumber || 'PED-ORIGEN'
      const type = it.orderType || 'Preventa Regular'
      const current = map.get(code) || { orderCode: code, orderType: type, itemsCount: 0, totalAmount: 0 }
      current.itemsCount += 1
      current.totalAmount += it.total
      map.set(code, current)
    })
    return Array.from(map.values())
  }, [selectedStop])

  // Categorías de productos de la parada activa
  const productCategories = useMemo(() => {
    if (!selectedStop?.items) return []
    return Array.from(new Set(selectedStop.items.map((it) => it.category)))
  }, [selectedStop])

  // Filtrado de productos de la parada activa (considerando Pedido de origen, Categoría, Rechazo y Búsqueda)
  const filteredStopProducts = useMemo(() => {
    if (!selectedStop?.items) return []
    return selectedStop.items.filter((it) => {
      // 1. Filtro por Pedido de venta origen
      if (selectedOrderCode !== 'TODOS') {
        const itemOrderCode = it.orderCode || selectedStop.deliveryNoteNumber || 'PED-ORIGEN'
        if (itemOrderCode !== selectedOrderCode) return false
      }
      // 2. Filtro por Rechazo
      if (productCategoryFilter === 'REJECTED' && it.returnedQty === 0) return false
      // 3. Filtro por Categoría
      if (
        productCategoryFilter !== 'TODOS' &&
        productCategoryFilter !== 'REJECTED' &&
        it.category !== productCategoryFilter
      )
        return false
      // 4. Búsqueda por texto
      if (searchProduct.trim()) {
        const q = searchProduct.toLowerCase().trim()
        return (
          it.productName.toLowerCase().includes(q) ||
          it.sku.toLowerCase().includes(q) ||
          it.category.toLowerCase().includes(q) ||
          (it.orderCode && it.orderCode.toLowerCase().includes(q))
        )
      }
      return true
    })
  }, [selectedStop, selectedOrderCode, productCategoryFilter, searchProduct])

  // Ordenamiento de productos (Sorting)
  const sortedStopProducts = useMemo(() => {
    if (productSortDirection === 'none') return filteredStopProducts
    return [...filteredStopProducts].sort((a, b) => {
      const valA = a[productSortField]
      const valB = b[productSortField]

      if (typeof valA === 'string') {
        const res = (valA as string).localeCompare(valB as string)
        return productSortDirection === 'asc' ? res : -res
      } else {
        const res = (valA as number) - (valB as number)
        return productSortDirection === 'asc' ? res : -res
      }
    })
  }, [filteredStopProducts, productSortField, productSortDirection])

  // Paginación de productos
  const totalProductPages = useMemo(() => {
    return Math.max(1, Math.ceil(sortedStopProducts.length / productPageSize))
  }, [sortedStopProducts.length, productPageSize])

  const paginatedStopProducts = useMemo(() => {
    const start = (productCurrentPage - 1) * productPageSize
    return sortedStopProducts.slice(start, start + productPageSize)
  }, [sortedStopProducts, productCurrentPage, productPageSize])

  const productStartIndex = sortedStopProducts.length > 0 ? (productCurrentPage - 1) * productPageSize + 1 : 0
  const productEndIndex = Math.min(sortedStopProducts.length, productCurrentPage * productPageSize)

  const handleProductSort = (field: ProductSortField) => {
    if (productSortField === field) {
      if (productSortDirection === 'none') {
        setProductSortDirection('asc')
      } else if (productSortDirection === 'asc') {
        setProductSortDirection('desc')
      } else {
        setProductSortDirection('none')
      }
    } else {
      setProductSortField(field)
      setProductSortDirection('asc')
    }
    setProductCurrentPage(1)
  }

  const handleProductSearchChange = (val: string) => {
    setSearchProduct(val)
    setProductCurrentPage(1)
  }

  const handleCategoryFilterChange = (cat: string) => {
    setProductCategoryFilter(cat)
    setProductCurrentPage(1)
  }

  // Estados para la galería y carrusel de Evidencias POD
  const [evidenceViewMode, setEvidenceViewMode] = useState<'cards' | 'carousel'>('cards')
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [selectedEvidence, setSelectedEvidence] = useState<FotoEvidencia | null>(null)
  const [isEvidenceModalOpen, setIsEvidenceModalOpen] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [rotationDeg, setRotationDeg] = useState(0)

  // Lista normalizada de fotos de evidencia para la parada seleccionada
  const currentPodPhotos: FotoEvidencia[] = useMemo(() => {
    if (selectedStop?.proofOfDelivery?.photos && selectedStop.proofOfDelivery.photos.length > 0) {
      return selectedStop.proofOfDelivery.photos
    }
    const capTime = selectedStop?.proofOfDelivery?.capturedAt || selectedStop?.deliveredAt || '07:44'
    const rem = selectedStop?.deliveryNoteNumber || 'REM-2026-9041'
    const name = selectedStop?.customerName || 'Cliente'
    const receiver = selectedStop?.proofOfDelivery?.receiverName || 'Encargado de Recepción'
    return [
      {
        id: 'evid-1',
        title: 'Firma Digital de Recepción',
        category: 'FIRMA',
        categoryLabel: 'Firma del Receptor',
        timestamp: capTime,
        coordinates: selectedStop?.proofOfDelivery?.coordinates || '-17.77892, -63.19012',
        deviceInfo: 'Handheld Zebra TC26 · Android 12',
        description: `Firma digital de recepción capturada en pantalla táctil de ${receiver} con validación de hora y geolocalización.`,
      },
      {
        id: 'evid-2',
        title: 'Fotografía de la Entrega',
        category: 'CARGA',
        categoryLabel: 'Fotografía de Entrega',
        timestamp: capTime,
        coordinates: selectedStop?.proofOfDelivery?.coordinates || '-17.77891, -63.19015',
        deviceInfo: 'Cámara trasera 13MP Zebra TC26',
        description: `Fotografía de la mercadería entregada y descargada en ${name} conforme al remito ${rem}.`,
      },
    ]
  }, [selectedStop])

  const handleOpenEvidenceModal = (evid: FotoEvidencia) => {
    setSelectedEvidence(evid)
    setZoomLevel(1)
    setRotationDeg(0)
    setIsEvidenceModalOpen(true)
  }

  const currentEvidenceIndex = useMemo(() => {
    if (!selectedEvidence) return 0
    const idx = currentPodPhotos.findIndex((p) => p.id === selectedEvidence.id)
    return idx >= 0 ? idx : 0
  }, [selectedEvidence, currentPodPhotos])

  const goToPrevEvidence = () => {
    if (currentPodPhotos.length === 0) return
    const prevIdx = (currentEvidenceIndex - 1 + currentPodPhotos.length) % currentPodPhotos.length
    setSelectedEvidence(currentPodPhotos[prevIdx])
    setZoomLevel(1)
    setRotationDeg(0)
  }

  const goToNextEvidence = () => {
    if (currentPodPhotos.length === 0) return
    const nextIdx = (currentEvidenceIndex + 1) % currentPodPhotos.length
    setSelectedEvidence(currentPodPhotos[nextIdx])
    setZoomLevel(1)
    setRotationDeg(0)
  }

  const handleDownloadEvidence = (evid: FotoEvidencia) => {
    toast.success(`Descargando evidencia: ${evid.title} (${evid.categoryLabel})`)
  }

  // Métricas de la parada activa
  const totalStopDeliveredQty = useMemo(
    () => selectedStop?.items?.reduce((acc, it) => acc + it.deliveredQty, 0) || 0,
    [selectedStop]
  )
  const totalStopAmount = useMemo(
    () => selectedStop?.payments?.reduce((acc, pay) => acc + pay.amount, 0) || 0,
    [selectedStop]
  )

  if (!orden) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Orden de transporte no encontrada.</p>
        <Button onClick={() => navigateTo('historial-ordenes-transporte')}>
          Volver al Historial
        </Button>
      </div>
    )
  }

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' }).format(n)

  // Renderizador gráfico realista para las evidencias POD
  const renderEvidenceGraphic = (evid: FotoEvidencia, isLarge: boolean = false) => {
    switch (evid.category) {
      case 'FIRMA':
        return (
          <div
            className={cn(
              'relative w-full h-full flex flex-col items-center justify-center bg-slate-950 text-white rounded-md overflow-hidden select-none border border-border/80 shadow-inner',
              isLarge ? 'min-h-[340px] p-6' : 'min-h-[140px] p-3'
            )}
          >
            {/* Grid de seguridad */}
            <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:16px_16px] opacity-40 pointer-events-none" />
            <div className="absolute top-2 left-2.5 flex items-center gap-1.5 text-[10px] text-emerald-400 font-mono">
              <ShieldCheck size={12} />
              <span>FIRMA DIGITAL VALIDADA</span>
            </div>
            <div className="absolute top-2 right-2.5 text-[9px] text-slate-400 font-mono">
              {evid.timestamp}
            </div>

            {/* Trazo vectorial de firma manuscrita */}
            <svg
              viewBox="0 0 320 120"
              className={cn('w-full max-w-[280px] drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]', isLarge ? 'max-w-[420px] h-36' : 'h-20')}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M 30 75 C 60 15, 90 95, 120 45 C 140 10, 155 85, 175 40 Q 210 20, 240 70 T 295 55 M 65 80 L 260 72 M 220 85 Q 260 100, 290 80" />
            </svg>

            <div className="mt-1 flex flex-col items-center text-center z-10">
              <span className="text-[11px] font-semibold text-slate-200">
                {selectedStop?.proofOfDelivery?.receiverName || 'Receptor Autorizado'}
              </span>
              <span className="text-[9px] font-mono text-slate-400">
                {selectedStop?.proofOfDelivery?.receiverDocument || 'CI Verificado'} · {selectedStop?.proofOfDelivery?.receiverRelationship || 'Recepción'}
              </span>
            </div>

            <div className="absolute bottom-1.5 right-2.5 text-[8px] font-mono text-slate-500">
              HASH: 8f4b1e9c...20a4
            </div>
          </div>
        )

      case 'DOCUMENTO':
        return (
          <div
            className={cn(
              'relative w-full h-full flex flex-col justify-between bg-amber-50/90 dark:bg-slate-900 text-slate-800 dark:text-slate-200 rounded-md overflow-hidden select-none border border-amber-300/60 dark:border-border shadow-inner p-3',
              isLarge ? 'min-h-[340px] p-6' : 'min-h-[140px]'
            )}
          >
            {/* Cabecera de documento simulado */}
            <div className="flex items-center justify-between border-b border-amber-200 dark:border-slate-700 pb-1 text-[10px]">
              <span className="font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-1">
                <FileText size={11} className="text-amber-600" />
                NOTA DE REMISIÓN {selectedStop?.deliveryNoteNumber || 'REM-2026-9041'}
              </span>
              <span className="font-mono text-[9px] text-muted-foreground">{evid.timestamp}</span>
            </div>

            {/* Líneas simuladas de contenido */}
            <div className="space-y-1 my-1.5 opacity-60 text-[9px]">
              <div className="h-1.5 bg-slate-400/40 rounded w-3/4" />
              <div className="h-1.5 bg-slate-400/30 rounded w-1/2" />
              <div className="h-1.5 bg-slate-400/30 rounded w-5/6" />
            </div>

            {/* Sello húmedo circular oficial simulado */}
            <div className="relative my-auto flex items-center justify-center">
              <div className="border-2 border-dashed border-red-600/80 rounded-full px-3 py-1.5 rotate-[-8deg] flex flex-col items-center bg-red-500/10 shadow-xs">
                <span className="text-[8px] font-black text-red-600 tracking-wider">RECIBIDO CONFORME</span>
                <span className="text-[7px] font-bold text-red-700">{selectedStop?.customerName?.slice(0, 24) || 'CLIENTE AUTORIZADO'}</span>
                <span className="text-[6.5px] font-mono text-red-600">21/08/2026 · SELLO OFICIAL</span>
              </div>
            </div>

            {/* Pie de documento */}
            <div className="flex justify-between items-end border-t border-amber-200 dark:border-slate-700 pt-1 text-[8.5px] text-muted-foreground font-mono">
              <span>FIRMA Y SELLO RECEPTOR</span>
              <span className="text-emerald-600 font-semibold flex items-center gap-0.5">
                <BadgeCheck size={10} /> DOC. AUDITADO
              </span>
            </div>
          </div>
        )

      case 'CARGA':
        return (
          <div
            className={cn(
              'relative w-full h-full flex flex-col justify-between bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white rounded-md overflow-hidden select-none border border-border shadow-inner p-3',
              isLarge ? 'min-h-[340px] p-6' : 'min-h-[140px]'
            )}
          >
            {/* Header con Badge de Cámara */}
            <div className="flex items-center justify-between text-[10px]">
              <span className="bg-blue-500/20 text-blue-300 border border-blue-500/40 rounded px-1.5 py-0.5 font-medium flex items-center gap-1">
                <Camera size={10} /> DESCARGA EN ALMACÉN
              </span>
              <span className="font-mono text-[9px] text-slate-400">{evid.timestamp}</span>
            </div>

            {/* Ilustración gráfica de bultos y pallets */}
            <div className="my-auto flex flex-col items-center justify-center gap-1.5 py-2">
              <div className="flex items-center gap-1.5">
                <div className="h-9 w-9 rounded bg-amber-600/30 border border-amber-500/50 flex flex-col items-center justify-center text-[8px] font-bold text-amber-300 shadow-xs">
                  <Package size={14} className="mb-0.5 text-amber-400" />
                  P-01
                </div>
                <div className="h-9 w-9 rounded bg-amber-600/30 border border-amber-500/50 flex flex-col items-center justify-center text-[8px] font-bold text-amber-300 shadow-xs">
                  <Package size={14} className="mb-0.5 text-amber-400" />
                  P-02
                </div>
                <div className="h-9 w-9 rounded bg-emerald-600/30 border border-emerald-500/50 flex flex-col items-center justify-center text-[8px] font-bold text-emerald-300 shadow-xs">
                  <Package size={14} className="mb-0.5 text-emerald-400" />
                  P-03
                </div>
              </div>
              <span className="text-[10px] text-slate-300 font-medium">
                {selectedStop?.items?.length || 20} SKUs entregados sin mermas
              </span>
            </div>

            {/* Watermark GPS */}
            <div className="flex justify-between items-center text-[8px] font-mono text-slate-400 border-t border-slate-700/60 pt-1">
              <span className="flex items-center gap-1">
                <MapPin size={9} className="text-emerald-400" />
                GEO: {evid.coordinates || '-17.77892, -63.19012'}
              </span>
              <span className="text-emerald-400 font-semibold">100% OK</span>
            </div>
          </div>
        )

      case 'FACHADA':
      default:
        return (
          <div
            className={cn(
              'relative w-full h-full flex flex-col justify-between bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 text-white rounded-md overflow-hidden select-none border border-border shadow-inner p-3',
              isLarge ? 'min-h-[340px] p-6' : 'min-h-[140px]'
            )}
          >
            {/* Header con Badge de Fachada */}
            <div className="flex items-center justify-between text-[10px]">
              <span className="bg-purple-500/20 text-purple-300 border border-purple-500/40 rounded px-1.5 py-0.5 font-medium flex items-center gap-1">
                <Store size={10} /> FACHADA Y ARRIBO
              </span>
              <span className="font-mono text-[9px] text-slate-400">{evid.timestamp}</span>
            </div>

            {/* Ilustración de local y camión */}
            <div className="my-auto flex flex-col items-center justify-center gap-1 py-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-purple-600/20 border border-purple-500/40">
                  <Store size={22} className="text-purple-300" />
                </div>
                <div className="p-1.5 rounded-lg bg-blue-600/20 border border-blue-500/40">
                  <Truck size={18} className="text-blue-300" />
                </div>
              </div>
              <span className="text-[10px] text-slate-200 font-bold truncate max-w-[200px]">
                {selectedStop?.customerName}
              </span>
              <span className="text-[8.5px] text-slate-400 font-mono truncate max-w-[220px]">
                {selectedStop?.address}
              </span>
            </div>

            {/* Watermark GPS */}
            <div className="flex justify-between items-center text-[8px] font-mono text-slate-400 border-t border-slate-700/60 pt-1">
              <span className="flex items-center gap-1 text-purple-300">
                <MapPin size={9} /> GPS STAMP
              </span>
              <span className="text-slate-300 font-medium">{selectedStop?.zoneName}</span>
            </div>
          </div>
        )
    }
  }

  // Filtrado reactivo de paradas
  const filteredParadas = useMemo(() => {
    return orden.paradas.filter((p) => {
      // 1. Filtro por estado
      if (statusFilter === 'DELIVERED' && p.status !== 'DELIVERED') return false
      if (statusFilter === 'DISCREPANCY' && p.status === 'DELIVERED') return false

      // 2. Búsqueda por texto libre
      if (searchParada.trim()) {
        const q = searchParada.toLowerCase().trim()
        const matchesClient = p.customerName.toLowerCase().includes(q)
        const matchesCode = p.customerCode.toLowerCase().includes(q)
        const matchesRem = p.deliveryNoteNumber.toLowerCase().includes(q)
        const matchesAddress = p.address.toLowerCase().includes(q)
        const matchesZone = p.zoneName.toLowerCase().includes(q)
        const matchesProduct = p.items.some(
          (it) => it.productName.toLowerCase().includes(q) || it.sku.toLowerCase().includes(q)
        )
        if (!matchesClient && !matchesCode && !matchesRem && !matchesAddress && !matchesZone && !matchesProduct) {
          return false
        }
      }
      return true
    })
  }, [orden, searchParada, statusFilter])

  // Contadores para filtros
  const exitosasCount = useMemo(() => orden.paradas.filter((p) => p.status === 'DELIVERED').length, [orden])
  const discrepanciasCount = useMemo(() => orden.paradas.length - exitosasCount, [orden, exitosasCount])

  // Estados de paginación para el panel de paradas
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // Resetear a página 1 cuando cambia el filtro o búsqueda
  const handleSearchParadaChange = (val: string) => {
    setSearchParada(val)
    setCurrentPage(1)
  }

  const handleStatusFilterChange = (status: 'TODOS' | 'DELIVERED' | 'DISCREPANCY') => {
    setStatusFilter(status)
    setCurrentPage(1)
  }

  // Paginación calculada
  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredParadas.length / pageSize))
  }, [filteredParadas.length, pageSize])

  const paginatedParadas = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredParadas.slice(start, start + pageSize)
  }, [filteredParadas, currentPage, pageSize])

  const startIndex = filteredParadas.length > 0 ? (currentPage - 1) * pageSize + 1 : 0
  const endIndex = Math.min(filteredParadas.length, currentPage * pageSize)

  const goToPrevPage = () => {
    if (currentPage > 1) {
      const prevP = currentPage - 1
      setCurrentPage(prevP)
      const nextSlice = filteredParadas.slice((prevP - 1) * pageSize, prevP * pageSize)
      if (nextSlice.length > 0 && !nextSlice.some((p) => p.id === selectedStopId)) {
        setSelectedStopId(nextSlice[0].id)
      }
    }
  }

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      const nextP = currentPage + 1
      setCurrentPage(nextP)
      const nextSlice = filteredParadas.slice((nextP - 1) * pageSize, nextP * pageSize)
      if (nextSlice.length > 0 && !nextSlice.some((p) => p.id === selectedStopId)) {
        setSelectedStopId(nextSlice[0].id)
      }
    }
  }

  const handleExportSingle = () => {
    exportarHistorialAExcel([orden], `Reporte_OT_${orden.codeFormatted}.csv`)
    toast.success(`Reporte de la ${orden.codeFormatted} exportado a Excel`)
  }

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* ── BARRA SUPERIOR DE ACCIONES Y BREADCRUMB ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateTo('historial-ordenes-transporte')}
            className="gap-2 cursor-pointer"
          >
            <ArrowLeft size={16} />
            Volver al Historial
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">{orden.codeFormatted}</h1>
              <Badge
                variant={
                  orden.status === 'COMPLETED'
                    ? 'default'
                    : orden.status === 'DISCREPANCY'
                    ? 'destructive'
                    : 'secondary'
                }
              >
                {orden.statusLabel}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {orden.distributorName} · Fecha de ejecución: {orden.dateFormatted}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportSingle} className="gap-2">
            <Download size={15} />
            Exportar Detalle a Excel
          </Button>
        </div>
      </div>

      {/* ── TARJETAS DE RESUMEN OPERATIVO Y FINANCIERO ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1. Tripulación y Camión */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
              Flota y Tripulación
            </CardTitle>
            <Truck className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between font-medium">
              <span className="text-muted-foreground">Camión:</span>
              <span className="font-semibold text-sm">{orden.truck.plate} ({orden.truck.code})</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Tipo:</span>
              <span className="flex items-center gap-1">
                {orden.truck.truckType}
                {orden.truck.isRefrigerated && (
                  <Badge variant="outline" className="h-4 px-1 text-[9px] text-blue-600 border-blue-300">
                    Termo
                  </Badge>
                )}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Chofer:</span>
              <span className="font-medium text-foreground">{orden.driver.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Ayudante:</span>
              <span>{orden.helper.name}</span>
            </div>
          </CardContent>
        </Card>

        {/* 2. Tiempos y Recorrido */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
              Tiempos y Recorrido
            </CardTitle>
            <Route className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Salida / Cierre:</span>
              <span className="font-semibold">{orden.departureDate.split('T')[1].slice(0, 5)} - {orden.completedDate.split('T')[1].slice(0, 5)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Duración total:</span>
              <span className="font-semibold">{Math.floor(orden.kpis.totalDurationMinutes / 60)}h {orden.kpis.totalDurationMinutes % 60}m</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">En tránsito vs Atención:</span>
              <span>{orden.kpis.driveDurationMinutes}m / {orden.kpis.serviceDurationMinutes}m</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Distancia total:</span>
              <span className="font-semibold text-primary">{orden.totalKm} km</span>
            </div>
          </CardContent>
        </Card>

        {/* 3. Despacho y Efectividad */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
              Entregas y Carga
            </CardTitle>
            <Package className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Paradas exitosas:</span>
              <span className="font-semibold text-sm">
                {orden.kpis.completedStops} / {orden.kpis.totalStops} ({orden.kpis.successRate}%)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Peso transportado:</span>
              <span className="font-medium">{orden.assignedWeightKg.toLocaleString()} kg</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Volumen cargado:</span>
              <span>{orden.assignedVolumeM3} m³</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Supervisor rampa:</span>
              <span className="truncate">{orden.supervisor.name}</span>
            </div>
          </CardContent>
        </Card>

        {/* 4. Liquidación y Cobranzas */}
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-primary uppercase">
              Liquidación Cobrada
            </CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total recaudado:</span>
              <span className="text-base font-bold text-primary">{fmtMoney(orden.kpis.totalCollected)}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Efectivo:</span>
              <span className="font-medium">{fmtMoney(orden.kpis.collectedCash)}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">QR Simple:</span>
              <span className="font-medium">{fmtMoney(orden.kpis.collectedQr)}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Transferencias:</span>
              <span className="font-medium">{fmtMoney(orden.kpis.collectedTransfer)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── CONTENIDO PRINCIPAL EN PESTAÑAS HORIZONTALES ── */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-border/80 pb-2">
          <TabsList className="h-9 p-1 bg-muted/80 rounded-lg border border-border/60 gap-1 inline-flex w-fit">
            <TabsTrigger
              value="paradas"
              className="gap-2 px-3.5 py-1 text-xs font-semibold rounded-md data-active:bg-background data-active:text-primary data-active:shadow-xs transition-all cursor-pointer"
            >
              <MapPin size={14} className="text-primary" />
              Paradas y Entregas ({orden.paradas.length})
            </TabsTrigger>
            <TabsTrigger
              value="activos"
              className="gap-2 px-3.5 py-1 text-xs font-semibold rounded-md data-active:bg-background data-active:text-primary data-active:shadow-xs transition-all cursor-pointer"
            >
              <Layers size={14} className="text-primary" />
              Bandeo y Activos ({orden.logisticAssets.length})
            </TabsTrigger>
            <TabsTrigger
              value="trazabilidad"
              className="gap-2 px-3.5 py-1 text-xs font-semibold rounded-md data-active:bg-background data-active:text-primary data-active:shadow-xs transition-all cursor-pointer"
            >
              <Clock size={14} className="text-primary" />
              Trazabilidad y Eventos
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── TAB 1: PUNTOS DE ENTREGA (ARQUITECTURA SPLIT-VIEW MAESTRO-DETALLE PARA 20-50 PARADAS Y 30-40 SKUS) ── */}
        <TabsContent value="paradas" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[760px] min-h-[600px]">
            {/* ═══════════════════════════════════════════════════════════════════
                PANEL IZQUIERDO (4/12 = 33%): LISTA DE PUNTOS DE ENTREGA (PAGINADA)
               ═══════════════════════════════════════════════════════════════════ */}
            <Card className="lg:col-span-4 xl:col-span-4 flex flex-col h-full overflow-hidden border shadow-xs bg-card">
              {/* Cabecera del panel izquierdo con buscador y filtros */}
              <div className="p-3 border-b border-border space-y-2.5 bg-muted/30 shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <MapPin size={14} className="text-primary" />
                    Ruta ({filteredParadas.length} paradas)
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {exitosasCount} OK · {discrepanciasCount} alerta
                  </span>
                </div>

                {/* Buscador de paradas */}
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <Input
                    value={searchParada}
                    onChange={(e) => handleSearchParadaChange(e.target.value)}
                    placeholder="Buscar cliente, código, remisión..."
                    className="h-8 pl-8 pr-7 text-xs bg-background"
                  />
                  {searchParada && (
                    <button
                      onClick={() => handleSearchParadaChange('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Filtro chips */}
                <div className="flex items-center gap-1">
                  <Button
                    variant={statusFilter === 'TODOS' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-6 text-[11px] px-2 flex-1 cursor-pointer"
                    onClick={() => handleStatusFilterChange('TODOS')}
                  >
                    Todas ({orden.paradas.length})
                  </Button>
                  <Button
                    variant={statusFilter === 'DELIVERED' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-6 text-[11px] px-2 flex-1 text-emerald-600 font-medium cursor-pointer"
                    onClick={() => handleStatusFilterChange('DELIVERED')}
                  >
                    OK ({exitosasCount})
                  </Button>
                  {discrepanciasCount > 0 && (
                    <Button
                      variant={statusFilter === 'DISCREPANCY' ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-6 text-[11px] px-2 flex-1 text-destructive font-medium cursor-pointer"
                      onClick={() => handleStatusFilterChange('DISCREPANCY')}
                    >
                      Alerta ({discrepanciasCount})
                    </Button>
                  )}
                </div>
              </div>

              {/* Lista paginada de paradas */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {paginatedParadas.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    No se encontraron paradas con los criterios aplicados.
                  </div>
                ) : (
                  paginatedParadas.map((p) => {
                    const isSelected = p.id === selectedStop.id
                    const montoCobrado = p.payments.reduce((acc, pay) => acc + pay.amount, 0)

                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          setSelectedStopId(p.id)
                          setSelectedOrderCode('TODOS')
                          setSearchProduct('')
                          setProductCategoryFilter('TODOS')
                          setProductCurrentPage(1)
                        }}
                        className={cn(
                          'p-2.5 rounded-lg cursor-pointer transition-all border text-xs select-none',
                          isSelected
                            ? 'bg-primary/10 border-primary shadow-xs ring-1 ring-primary/20'
                            : 'bg-background hover:bg-muted/50 border-border/70'
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold shadow-xs',
                                isSelected
                                  ? 'bg-primary text-primary-foreground'
                                  : p.resultCode === 'EXITOSO'
                                  ? 'bg-emerald-600 text-white'
                                  : p.resultCode === 'RECHAZO_PARCIAL'
                                  ? 'bg-amber-600 text-white'
                                  : 'bg-destructive text-white'
                              )}
                            >
                              {p.sequence}
                            </span>
                            <span className="font-semibold text-foreground truncate max-w-[170px]">
                              {p.customerName}
                            </span>
                          </div>
                          <Badge
                            variant={
                              p.resultCode === 'EXITOSO'
                                ? 'default'
                                : p.resultCode === 'RECHAZO_PARCIAL'
                                ? 'secondary'
                                : 'destructive'
                            }
                            className={
                              p.resultCode === 'EXITOSO'
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white h-4 text-[9px] px-1'
                                : 'h-4 text-[9px] px-1'
                            }
                          >
                            {p.resultCode}
                          </Badge>
                        </div>

                        <div className="mt-1 pl-7 flex items-center justify-between text-[11px] text-muted-foreground">
                          <span className="truncate max-w-[130px]">{p.zoneName} · {p.customerCode}</span>
                          <span className="font-bold text-foreground">{fmtMoney(montoCobrado)}</span>
                        </div>

                        <div className="mt-0.5 pl-7 flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>{p.arrivedAt} - {p.deliveredAt} ({p.serviceDuration})</span>
                          <span className="font-mono">{p.deliveryNoteNumber}</span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Footer sticky de Paginación */}
              <div className="p-2.5 border-t border-border bg-muted/40 shrink-0 flex items-center justify-between text-xs text-muted-foreground select-none">
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-muted-foreground">Items por página:</span>
                  <Select
                    value={pageSize.toString()}
                    onValueChange={(v) => {
                      if (v) {
                        setPageSize(Number(v))
                        setCurrentPage(1)
                      }
                    }}
                  >
                    <SelectTrigger size="sm" className="h-6 w-14 px-1.5 text-[11px] bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start" side="top">
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="15">15</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-foreground hidden sm:inline">
                    {filteredParadas.length > 0 ? `${startIndex}-${endIndex} de ${filteredParadas.length}` : '0'}
                  </span>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={currentPage <= 1}
                      onClick={goToPrevPage}
                      className="h-6 w-6 cursor-pointer"
                      title="Página anterior"
                    >
                      <ChevronLeft size={13} />
                    </Button>

                    <span className="px-1 text-[11px] font-semibold text-foreground">
                      {currentPage}/{totalPages}
                    </span>

                    <Button
                      variant="outline"
                      size="icon"
                      disabled={currentPage >= totalPages}
                      onClick={goToNextPage}
                      className="h-6 w-6 cursor-pointer"
                      title="Página siguiente"
                    >
                      <ChevronRight size={13} />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>

            {/* ═══════════════════════════════════════════════════════════════════
                PANEL DERECHO (8/12 = 67%): DETALLE PROFUNDO DEL PUNTO SELECCIONADO
               ═══════════════════════════════════════════════════════════════════ */}
            <Card className="lg:col-span-8 xl:col-span-8 flex flex-col h-full overflow-hidden border shadow-xs bg-card">
              {/* Cabecera del Punto de Entrega Activo */}
              <div className="p-3.5 border-b border-border bg-muted/20 shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground text-sm shadow-xs">
                      #{selectedStop.sequence}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-foreground">
                          {selectedStop.customerName}
                        </h2>
                        <Badge variant="outline" className="font-mono text-xs">
                          {selectedStop.customerCode}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {selectedStop.saleChannel}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {selectedStop.address} · <span className="font-medium text-foreground/80">{selectedStop.zoneName}</span> · Remisión: <b className="font-mono text-foreground">{selectedStop.deliveryNoteNumber}</b>
                      </p>
                    </div>
                  </div>

                  <Badge
                    variant={
                      selectedStop.resultCode === 'EXITOSO'
                        ? 'default'
                        : selectedStop.resultCode === 'RECHAZO_PARCIAL'
                        ? 'secondary'
                        : 'destructive'
                    }
                    className={
                      selectedStop.resultCode === 'EXITOSO'
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-2.5 py-0.5'
                        : 'text-xs px-2.5 py-0.5'
                    }
                  >
                    {selectedStop.resultCode}
                  </Badge>
                </div>

                {/* Mini KPIs de la Parada */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 p-2 rounded-md bg-background border border-border text-xs">
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Tiempo de traslado:</span>
                    <span className="font-semibold text-primary">{selectedStop.travelTimeFromPrevious}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Horario atención:</span>
                    <span className="font-medium">{selectedStop.arrivedAt} - {selectedStop.deliveredAt} ({selectedStop.serviceDuration})</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Productos:</span>
                    <span className="font-semibold">{selectedStop.items.length} SKUs · {totalStopDeliveredQty} uds</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Cobro total:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{fmtMoney(totalStopAmount)}</span>
                  </div>
                </div>

                {/* Incidencia si existe */}
                {selectedStop.incident && (
                  <div className="mt-2.5 flex items-center gap-2 rounded bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-200 border border-amber-500/30">
                    <ShieldAlert size={14} className="text-amber-600 shrink-0" />
                    <span><b>[{selectedStop.incident.code}]:</b> {selectedStop.incident.description}</span>
                  </div>
                )}
              </div>

              {/* Sub-Pestañas internas del punto de entrega + Selector de Pedidos Consolidados */}
              <div className="px-3.5 pt-2 pb-2 border-b border-border bg-card shrink-0 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  <Button
                    variant={activeStopTab === 'productos' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setActiveStopTab('productos')}
                    className="h-7 text-xs gap-1.5 cursor-pointer"
                  >
                    <Package size={13} />
                    Productos ({selectedOrderCode === 'ALL' ? selectedStop.items.length : filteredStopProducts.length} SKUs)
                  </Button>
                  <Button
                    variant={activeStopTab === 'cobranzas' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setActiveStopTab('cobranzas')}
                    className="h-7 text-xs gap-1.5 cursor-pointer"
                  >
                    <DollarSign size={13} />
                    Cobranzas ({selectedStop.payments.length})
                  </Button>
                  <Button
                    variant={activeStopTab === 'pod' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setActiveStopTab('pod')}
                    className="h-7 text-xs gap-1.5 cursor-pointer"
                  >
                    <FileCheck size={13} />
                    Evidencias POD y Receptor
                  </Button>
                </div>

                {/* Selector de Pedidos Consolidados */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground font-medium hidden md:inline">
                    Pedido origen:
                  </span>
                  <Select
                    value={selectedOrderCode}
                    onValueChange={(v) => {
                      if (v) {
                        setSelectedOrderCode(v)
                        setProductCurrentPage(1)
                      }
                    }}
                  >
                    <SelectTrigger size="sm" className="h-7 w-[210px] text-xs bg-background">
                      <SelectValue placeholder="TODOS los pedidos" />
                    </SelectTrigger>
                    <SelectContent align="end" className="w-[340px] p-1.5 shadow-xl border border-border bg-popover z-50">
                      <SelectItem value="TODOS" className="py-2 pl-2.5 pr-8 text-xs rounded-md cursor-pointer">
                        <div className="flex flex-col text-left pr-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground">TODOS los pedidos</span>
                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 font-normal">
                              {selectedStop.items.length} SKUs
                            </Badge>
                          </div>
                          {stopOrdersList.length > 1 && (
                            <span className="text-[10px] text-muted-foreground mt-0.5">
                              Consolidado de {stopOrdersList.length} pedidos de venta
                            </span>
                          )}
                        </div>
                      </SelectItem>
                      {stopOrdersList.map((ord) => (
                        <SelectItem
                          key={ord.orderCode}
                          value={ord.orderCode}
                          className="py-2 pl-2.5 pr-8 text-xs rounded-md cursor-pointer border-t border-border/40 mt-1"
                        >
                          <div className="flex flex-col text-left w-full pr-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold font-mono text-primary text-xs">{ord.orderCode}</span>
                              <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border/60">
                                {ord.itemsCount} SKUs
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-0.5">
                              <span>{ord.orderType}</span>
                              <span className="font-medium text-foreground">{fmtMoney(ord.totalAmount)}</span>
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Contenido scrolleable de la sub-pestaña */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-3 flex flex-col min-h-0">
                {activeStopTab === 'productos' && (
                  <div className="space-y-2.5 flex-1 flex flex-col min-h-0 pb-1">
                    {/* Toolbar de productos (Buscador y filtros) */}
                    <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
                      <div className="relative min-w-[180px] max-w-[260px] flex-1">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <Input
                          value={searchProduct}
                          onChange={(e) => handleProductSearchChange(e.target.value)}
                          placeholder="Buscar SKU, producto, categoría..."
                          className="h-7 pl-7 pr-6 text-xs bg-background"
                        />
                        {searchProduct && (
                          <button
                            onClick={() => handleProductSearchChange('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            <X size={11} />
                          </button>
                        )}
                      </div>

                      {/* Filtro por categorías / Rechazos */}
                      <div className="flex flex-wrap items-center gap-1">
                        <Button
                          variant={productCategoryFilter === 'TODOS' ? 'secondary' : 'outline'}
                          size="sm"
                          className="h-6 text-[10px] px-2 cursor-pointer"
                          onClick={() => handleCategoryFilterChange('TODOS')}
                        >
                          TODOS ({selectedStop.items.length})
                        </Button>
                        {selectedStop.items.some((it) => it.returnedQty > 0) && (
                          <Button
                            variant={productCategoryFilter === 'REJECTED' ? 'destructive' : 'outline'}
                            size="sm"
                            className="h-6 text-[10px] px-2 cursor-pointer"
                            onClick={() => handleCategoryFilterChange('REJECTED')}
                          >
                            Con Rechazo
                          </Button>
                        )}
                        {productCategories.map((cat) => (
                          <Button
                            key={cat}
                            variant={productCategoryFilter === cat ? 'secondary' : 'outline'}
                            size="sm"
                            className="h-6 text-[10px] px-2 cursor-pointer"
                            onClick={() => handleCategoryFilterChange(cat)}
                          >
                            {cat}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Tabla de Altura Fija con Sorting y Paginación (Ajustada al fondo del panel) */}
                    <div className="flex-1 min-h-[440px] flex flex-col rounded-lg border border-border bg-card shadow-xs overflow-hidden">
                      <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-xs text-[11px] font-semibold text-muted-foreground uppercase border-b border-border">
                            <tr>
                              <th
                                onClick={() => handleProductSort('sku')}
                                className="p-2.5 pl-3 cursor-pointer hover:text-foreground transition-colors select-none"
                              >
                                <div className="flex items-center gap-1">
                                  <span>SKU</span>
                                  {productSortField === 'sku' && productSortDirection !== 'none' ? (
                                    productSortDirection === 'asc' ? <ArrowUp size={12} className="text-primary" /> : <ArrowDown size={12} className="text-primary" />
                                  ) : (
                                    <ArrowUpDown size={11} className="opacity-40" />
                                  )}
                                </div>
                              </th>
                              <th
                                onClick={() => handleProductSort('productName')}
                                className="p-2.5 cursor-pointer hover:text-foreground transition-colors select-none"
                              >
                                <div className="flex items-center gap-1">
                                  <span>Producto / Categoría</span>
                                  {productSortField === 'productName' && productSortDirection !== 'none' ? (
                                    productSortDirection === 'asc' ? <ArrowUp size={12} className="text-primary" /> : <ArrowDown size={12} className="text-primary" />
                                  ) : (
                                    <ArrowUpDown size={11} className="opacity-40" />
                                  )}
                                </div>
                              </th>
                              <th
                                onClick={() => handleProductSort('plannedQty')}
                                className="p-2.5 text-center cursor-pointer hover:text-foreground transition-colors select-none"
                              >
                                <div className="flex items-center justify-center gap-1">
                                  <span>Plan</span>
                                  {productSortField === 'plannedQty' && productSortDirection !== 'none' ? (
                                    productSortDirection === 'asc' ? <ArrowUp size={12} className="text-primary" /> : <ArrowDown size={12} className="text-primary" />
                                  ) : (
                                    <ArrowUpDown size={11} className="opacity-40" />
                                  )}
                                </div>
                              </th>
                              <th
                                onClick={() => handleProductSort('deliveredQty')}
                                className="p-2.5 text-center cursor-pointer hover:text-foreground transition-colors select-none"
                              >
                                <div className="flex items-center justify-center gap-1">
                                  <span>Entregado</span>
                                  {productSortField === 'deliveredQty' && productSortDirection !== 'none' ? (
                                    productSortDirection === 'asc' ? <ArrowUp size={12} className="text-primary" /> : <ArrowDown size={12} className="text-primary" />
                                  ) : (
                                    <ArrowUpDown size={11} className="opacity-40" />
                                  )}
                                </div>
                              </th>
                              <th
                                onClick={() => handleProductSort('returnedQty')}
                                className="p-2.5 text-center cursor-pointer hover:text-foreground transition-colors select-none"
                              >
                                <div className="flex items-center justify-center gap-1">
                                  <span>Devuelto</span>
                                  {productSortField === 'returnedQty' && productSortDirection !== 'none' ? (
                                    productSortDirection === 'asc' ? <ArrowUp size={12} className="text-primary" /> : <ArrowDown size={12} className="text-primary" />
                                  ) : (
                                    <ArrowUpDown size={11} className="opacity-40" />
                                  )}
                                </div>
                              </th>
                              <th
                                onClick={() => handleProductSort('unitPrice')}
                                className="p-2.5 text-right cursor-pointer hover:text-foreground transition-colors select-none"
                              >
                                <div className="flex items-center justify-end gap-1">
                                  <span>P. Unit.</span>
                                  {productSortField === 'unitPrice' && productSortDirection !== 'none' ? (
                                    productSortDirection === 'asc' ? <ArrowUp size={12} className="text-primary" /> : <ArrowDown size={12} className="text-primary" />
                                  ) : (
                                    <ArrowUpDown size={11} className="opacity-40" />
                                  )}
                                </div>
                              </th>
                              <th
                                onClick={() => handleProductSort('total')}
                                className="p-2.5 pr-3 text-right cursor-pointer hover:text-foreground transition-colors select-none"
                              >
                                <div className="flex items-center justify-end gap-1">
                                  <span>Subtotal</span>
                                  {productSortField === 'total' && productSortDirection !== 'none' ? (
                                    productSortDirection === 'asc' ? <ArrowUp size={12} className="text-primary" /> : <ArrowDown size={12} className="text-primary" />
                                  ) : (
                                    <ArrowUpDown size={11} className="opacity-40" />
                                  )}
                                </div>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border bg-card">
                            {paginatedStopProducts.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="p-8 text-center text-xs text-muted-foreground">
                                  No se encontraron productos para los criterios aplicados.
                                </td>
                              </tr>
                            ) : (
                              paginatedStopProducts.map((it) => (
                                <tr
                                  key={it.id}
                                  className={cn(
                                    'hover:bg-muted/30 transition-colors',
                                    it.returnedQty > 0 ? 'bg-destructive/5' : ''
                                  )}
                                >
                                  <td className="p-2.5 pl-3">
                                    <span className="font-mono text-[11px] text-muted-foreground font-medium block">
                                      {it.sku}
                                    </span>
                                    {it.orderCode && (
                                      <span
                                        className="inline-block font-mono text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground border border-border/80 mt-0.5"
                                        title={`Pedido: ${it.orderCode} (${it.orderType || 'Regular'})`}
                                      >
                                        {it.orderCode}
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-2.5">
                                    <span className="font-semibold text-foreground block">{it.productName}</span>
                                    <span className="text-[10px] text-muted-foreground">{it.category}</span>
                                    {it.rejectionReason && (
                                      <span className="block text-[10px] font-medium text-destructive mt-0.5">
                                        Motivo rechazo: {it.rejectionReason}
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-2.5 text-center text-muted-foreground font-medium">{it.plannedQty}</td>
                                  <td className="p-2.5 text-center font-bold text-foreground">{it.deliveredQty}</td>
                                  <td className="p-2.5 text-center">
                                    {it.returnedQty > 0 ? (
                                      <Badge variant="destructive" className="h-4 px-1 text-[10px]">
                                        {it.returnedQty}
                                      </Badge>
                                    ) : (
                                      <span className="text-muted-foreground">0</span>
                                    )}
                                  </td>
                                  <td className="p-2.5 text-right text-muted-foreground">{fmtMoney(it.unitPrice)}</td>
                                  <td className="p-2.5 pr-3 text-right font-bold text-foreground">{fmtMoney(it.total)}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Footer sticky de Paginación de Productos */}
                      <div className="p-2.5 border-t border-border bg-muted/40 shrink-0 flex items-center justify-between text-xs text-muted-foreground select-none">
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <span className="text-muted-foreground">Items por página:</span>
                          <Select
                            value={productPageSize.toString()}
                            onValueChange={(v) => {
                              if (v) {
                                setProductPageSize(Number(v))
                                setProductCurrentPage(1)
                              }
                            }}
                          >
                            <SelectTrigger size="sm" className="h-6 w-14 px-1.5 text-[11px] bg-background">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent align="start" side="top">
                              <SelectItem value="10">10</SelectItem>
                              <SelectItem value="15">15</SelectItem>
                              <SelectItem value="20">20</SelectItem>
                              <SelectItem value="25">25</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-medium text-foreground hidden sm:inline">
                            {sortedStopProducts.length > 0
                              ? `${productStartIndex}-${productEndIndex} de ${sortedStopProducts.length} productos`
                              : '0 productos'}
                          </span>

                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              disabled={productCurrentPage <= 1}
                              onClick={() => setProductCurrentPage((p) => Math.max(1, p - 1))}
                              className="h-6 w-6 cursor-pointer"
                              title="Página anterior"
                            >
                              <ChevronLeft size={13} />
                            </Button>

                            <span className="px-1 text-[11px] font-semibold text-foreground">
                              {productCurrentPage}/{totalProductPages}
                            </span>

                            <Button
                              variant="outline"
                              size="icon"
                              disabled={productCurrentPage >= totalProductPages}
                              onClick={() => setProductCurrentPage((p) => Math.min(totalProductPages, p + 1))}
                              className="h-6 w-6 cursor-pointer"
                              title="Página siguiente"
                            >
                              <ChevronRight size={13} />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeStopTab === 'cobranzas' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <span className="text-xs font-bold text-foreground">Comprobantes y Métodos de Cobro</span>
                      <span className="text-sm font-bold text-primary">{fmtMoney(totalStopAmount)}</span>
                    </div>

                    {selectedStop.payments.length === 0 ? (
                      <div className="p-6 text-center text-muted-foreground border rounded-lg">
                        Sin cobros registrados en esta parada (Entrega a crédito o rechazo total).
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {selectedStop.payments.map((pay, idx) => (
                          <div key={idx} className="border rounded-lg p-3 bg-muted/20 space-y-2 text-xs">
                            <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                              <span className="font-semibold flex items-center gap-1.5">
                                {pay.paymentMethod === 'QR' ? (
                                  <QrCode size={14} className="text-primary" />
                                ) : pay.paymentMethod === 'CASH' ? (
                                  <Wallet size={14} className="text-emerald-600" />
                                ) : (
                                  <Building size={14} className="text-blue-600" />
                                )}
                                {pay.paymentMethodLabel}
                              </span>
                              <Badge variant="outline" className="text-[10px] text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40">
                                {pay.status}
                              </Badge>
                            </div>
                            <div className="space-y-1 text-[11px]">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">N° Comprobante / Recibo:</span>
                                <span className="font-mono font-semibold">{pay.referenceNumber}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Factura Asociada:</span>
                                <span className="font-mono">{pay.invoiceId}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Monto Facturado:</span>
                                <span>{fmtMoney(pay.invoiceAmount)}</span>
                              </div>
                              <div className="flex justify-between border-t border-border pt-1 font-bold text-foreground">
                                <span>Monto Cobrado:</span>
                                <span className="text-primary">{fmtMoney(pay.amount)}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeStopTab === 'pod' && (
                  <div className="space-y-3.5 flex-1 flex flex-col min-h-0">
                    {/* Header Card de POD: Receptor, Trazabilidad GPS y Botones Rápidos */}
                    <div className="rounded-lg border border-border bg-card p-3.5 space-y-3 shadow-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
                            <FileCheck size={18} />
                          </div>
                          <div>
                            <h3 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                              Prueba de Entrega Digital (POD)
                              <Badge variant="outline" className="text-[10px] text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 py-0 h-4 border-emerald-500/30 font-semibold">
                                ✓ VALIDADO
                              </Badge>
                            </h3>
                            <p className="text-[11px] text-muted-foreground">
                              {currentPodPhotos.length} evidencias registradas en punto · Remisión <b className="font-mono text-foreground">{selectedStop.deliveryNoteNumber}</b>
                            </p>
                          </div>
                        </div>

                        {/* Selector de modo de vista: Tarjetas vs Carrusel */}
                        <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-md border border-border">
                          <Button
                            variant={evidenceViewMode === 'cards' ? 'default' : 'ghost'}
                            size="sm"
                            className="h-6 px-2 text-[11px] gap-1 cursor-pointer"
                            onClick={() => setEvidenceViewMode('cards')}
                          >
                            <Grid size={12} />
                            Tarjetas
                          </Button>
                          <Button
                            variant={evidenceViewMode === 'carousel' ? 'default' : 'ghost'}
                            size="sm"
                            className="h-6 px-2 text-[11px] gap-1 cursor-pointer"
                            onClick={() => {
                              setEvidenceViewMode('carousel')
                              setCarouselIndex(0)
                            }}
                          >
                            <SlidersHorizontal size={12} />
                            Carrusel
                          </Button>
                        </div>
                      </div>

                      {/* Datos del Receptor y Georreferencia */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
                        <div className="p-2 rounded bg-muted/30 border border-border/60">
                          <span className="text-[10px] text-muted-foreground block">Nombre del Receptor:</span>
                          <span className="font-bold text-foreground text-xs">{selectedStop.proofOfDelivery?.receiverName || 'Mariana Justiniano'}</span>
                        </div>
                        <div className="p-2 rounded bg-muted/30 border border-border/60">
                          <span className="text-[10px] text-muted-foreground block">Documento Identidad (CI):</span>
                          <span className="font-mono font-semibold text-foreground text-xs">{selectedStop.proofOfDelivery?.receiverDocument || 'CI 4598122 SC'}</span>
                        </div>
                        <div className="p-2 rounded bg-muted/30 border border-border/60">
                          <span className="text-[10px] text-muted-foreground block">Cargo / Relación:</span>
                          <span className="font-medium text-foreground text-xs">{selectedStop.proofOfDelivery?.receiverRelationship || 'Encargada de Recepción'}</span>
                        </div>
                        <div className="p-2 rounded bg-muted/30 border border-border/60">
                          <span className="text-[10px] text-muted-foreground block">Geoposición & Precisión:</span>
                          <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold text-[11px] flex items-center gap-1">
                            <MapPin size={11} /> {selectedStop.proofOfDelivery?.gpsAccuracy || '± 3.8m (GPS OK)'}
                          </span>
                        </div>
                      </div>

                      {/* Botones de acción directa para ver cada evidencia (Una sola línea, espacioso y sin saltos) */}
                      <div className="pt-2 border-t border-border/70 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-muted-foreground mr-1 shrink-0">
                          Acceso rápido:
                        </span>
                        <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap scrollbar-none">
                          {currentPodPhotos.map((evid) => (
                            <Button
                              key={evid.id}
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenEvidenceModal(evid)}
                              className="h-7 px-3 text-xs gap-1.5 cursor-pointer bg-background hover:bg-muted whitespace-nowrap shrink-0 font-medium"
                            >
                              {evid.category === 'FIRMA' ? (
                                <Fingerprint size={13} className="text-primary" />
                              ) : evid.category === 'CARGA' ? (
                                <Package size={13} className="text-blue-600" />
                              ) : evid.category === 'DOCUMENTO' ? (
                                <FileText size={13} className="text-amber-600" />
                              ) : (
                                <Store size={13} className="text-purple-600" />
                              )}
                              <span className="whitespace-nowrap">{evid.categoryLabel}</span>
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* MODO 1: Tarjetas de Evidencias en Grid (2 Tarjetas: Firma y Foto de Entrega) */}
                    {evidenceViewMode === 'cards' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-4xl">
                        {currentPodPhotos.map((evid) => (
                          <div
                            key={evid.id}
                            className="group flex flex-col rounded-lg border border-border bg-card overflow-hidden shadow-xs hover:border-primary/50 transition-all"
                          >
                            {/* Visual Frame interactivo */}
                            <div
                              onClick={() => handleOpenEvidenceModal(evid)}
                              className="relative h-44 bg-muted/40 cursor-pointer overflow-hidden group-hover:opacity-95"
                            >
                              {renderEvidenceGraphic(evid, false)}
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="h-7 text-xs gap-1 shadow-md cursor-pointer pointer-events-none"
                                >
                                  <Maximize2 size={12} />
                                  Ampliar
                                </Button>
                              </div>
                            </div>

                            {/* Contenido de la Tarjeta */}
                            <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2.5">
                              <div>
                                <div className="flex items-center justify-between gap-1 mb-1.5">
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      'text-[10px] h-4 px-1.5 font-semibold',
                                      evid.category === 'FIRMA'
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300'
                                        : 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300'
                                    )}
                                  >
                                    {evid.categoryLabel}
                                  </Badge>
                                  <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-0.5">
                                    <Clock size={10} /> {evid.timestamp}
                                  </span>
                                </div>
                                <h4 className="font-bold text-xs text-foreground group-hover:text-primary transition-colors">
                                  {evid.title}
                                </h4>
                                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                                  {evid.description}
                                </p>
                              </div>

                              <div className="pt-2 border-t border-border flex items-center justify-between gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleOpenEvidenceModal(evid)}
                                  className="h-6 flex-1 text-[11px] gap-1 cursor-pointer"
                                >
                                  <Eye size={12} />
                                  Ver detalle
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDownloadEvidence(evid)}
                                  className="h-6 w-6 cursor-pointer text-muted-foreground hover:text-foreground"
                                  title="Descargar"
                                >
                                  <Download size={12} />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* MODO 2: Modo Carrusel Interactivo */}
                    {evidenceViewMode === 'carousel' && (
                      <div className="rounded-lg border border-border bg-card p-4 space-y-3 shadow-xs max-w-4xl">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-foreground">
                              {currentPodPhotos[carouselIndex]?.title}
                            </span>
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-semibold">
                              {currentPodPhotos[carouselIndex]?.categoryLabel}
                            </Badge>
                          </div>
                          <span className="text-xs font-mono text-muted-foreground">
                            {carouselIndex + 1} de {currentPodPhotos.length}
                          </span>
                        </div>

                        {/* Visor grande del carrusel */}
                        <div className="relative rounded-lg overflow-hidden border border-border bg-slate-950 flex items-center justify-center min-h-[360px]">
                          {renderEvidenceGraphic(currentPodPhotos[carouselIndex], true)}

                          {/* Controles flotantes de navegación */}
                          <Button
                            variant="secondary"
                            size="icon"
                            onClick={() =>
                              setCarouselIndex(
                                (prev) => (prev - 1 + currentPodPhotos.length) % currentPodPhotos.length
                              )
                            }
                            className="absolute left-3 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full shadow-lg opacity-80 hover:opacity-100 cursor-pointer"
                            title="Evidencia anterior"
                          >
                            <ChevronLeft size={16} />
                          </Button>
                          <Button
                            variant="secondary"
                            size="icon"
                            onClick={() => setCarouselIndex((prev) => (prev + 1) % currentPodPhotos.length)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full shadow-lg opacity-80 hover:opacity-100 cursor-pointer"
                            title="Evidencia siguiente"
                          >
                            <ChevronRight size={16} />
                          </Button>

                          {/* Botón flotante para ver en modal */}
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleOpenEvidenceModal(currentPodPhotos[carouselIndex])}
                            className="absolute bottom-3 right-3 h-7 text-xs gap-1.5 shadow-lg cursor-pointer bg-background/80 backdrop-blur-xs"
                          >
                            <Maximize2 size={13} />
                            Pantalla completa
                          </Button>
                        </div>

                        {/* Tira de miniaturas selectoras */}
                        <div className="grid grid-cols-2 gap-3 pt-1 max-w-xl mx-auto">
                          {currentPodPhotos.map((evid, idx) => (
                            <button
                              key={evid.id}
                              onClick={() => setCarouselIndex(idx)}
                              className={cn(
                                'h-16 rounded-md border p-1 text-left transition-all cursor-pointer overflow-hidden',
                                carouselIndex === idx
                                  ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                                  : 'border-border bg-muted/20 hover:bg-muted/50'
                              )}
                            >
                              <div className="flex items-center justify-between text-[9px] mb-0.5">
                                <span className="font-semibold truncate">{evid.categoryLabel}</span>
                                <span className="font-mono text-muted-foreground">{evid.timestamp}</span>
                              </div>
                              <p className="text-[10px] text-muted-foreground line-clamp-1">
                                {evid.title}
                              </p>
                            </button>
                          ))}
                        </div>

                        {/* Pie con detalles del slide activo */}
                        <div className="p-2.5 rounded-md bg-muted/30 border border-border/70 text-xs flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11px] text-muted-foreground flex-1">
                            <b>Descripción:</b> {currentPodPhotos[carouselIndex]?.description}
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownloadEvidence(currentPodPhotos[carouselIndex])}
                            className="h-6 text-[11px] gap-1 cursor-pointer shrink-0"
                          >
                            <Download size={11} /> Descargar
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* ── TAB 2: BANDEO Y CONTROL DE ACTIVOS LOGÍSTICOS ── */}
        <TabsContent value="activos" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Control de Activos Logísticos y Bandeo (Salida en Rampa vs Retorno)
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Auditoría de pallets, canastillas plásticas y accesorios de carga asignados al camión {orden.truck.plate}.
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/60 text-[11px] font-semibold text-muted-foreground">
                    <tr>
                      <th className="p-2.5 pl-3">Código</th>
                      <th className="p-2.5">Accesorio / Activo Logístico</th>
                      <th className="p-2.5 text-center">Despachado (Rampa)</th>
                      <th className="p-2.5 text-center">Retornado</th>
                      <th className="p-2.5 text-center">Diferencia</th>
                      <th className="p-2.5">Estado</th>
                      <th className="p-2.5 pr-3">Observaciones / Vale Custodia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {orden.logisticAssets.map((asset, i) => (
                      <tr key={i} className="hover:bg-muted/20">
                        <td className="p-2.5 pl-3 font-mono text-[11px] text-muted-foreground">
                          {asset.assetCode}
                        </td>
                        <td className="p-2.5 font-medium">{asset.assetName}</td>
                        <td className="p-2.5 text-center font-semibold">{asset.dispatchedQty}</td>
                        <td className="p-2.5 text-center font-semibold">{asset.returnedQty}</td>
                        <td className="p-2.5 text-center">
                          {asset.varianceQty !== 0 ? (
                            <Badge variant="destructive" className="text-[10px]">
                              {asset.varianceQty}
                            </Badge>
                          ) : (
                            <span className="text-emerald-600 font-bold">0</span>
                          )}
                        </td>
                        <td className="p-2.5">
                          <Badge
                            variant={asset.status === 'RETURNED_OK' ? 'outline' : 'destructive'}
                            className="text-[10px]"
                          >
                            {asset.status === 'RETURNED_OK' ? 'Retorno Completo' : 'Discrepancia'}
                          </Badge>
                        </td>
                        <td className="p-2.5 pr-3 text-[11px] text-muted-foreground">
                          {asset.notes || 'Liquidado sin novedades en rampa.'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 3: TRAZABILIDAD Y AUDITORÍA DE EVENTOS ── */}
        <TabsContent value="trazabilidad" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Bitácora de Auditoría y Trazabilidad del Despacho
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Línea de tiempo de eventos registrados por la aplicación móvil del chofer y validaciones en plataforma.
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-xs">
                <div className="flex items-start gap-3 border-l-2 border-primary pl-4 pb-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground font-bold">
                    1
                  </div>
                  <div>
                    <span className="font-bold text-foreground">Conteo y Carga en Rampa Finalizada</span>
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      {orden.departureDate.split('T')[1].slice(0, 5)} · Supervisor {orden.supervisor.name}
                    </span>
                    <p className="text-muted-foreground text-[11px]">
                      Conteo físico completado al 100%. Salida autorizada con {orden.assignedWeightKg} kg y {orden.logisticAssets.length} tipos de activos.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 border-l-2 border-primary pl-4 pb-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground font-bold">
                    2
                  </div>
                  <div>
                    <span className="font-bold text-foreground">Salida a Ruta de Distribución</span>
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      {orden.departureDate.split('T')[1].slice(0, 5)} · Chofer {orden.driver.name}
                    </span>
                    <p className="text-muted-foreground text-[11px]">
                      Inicio de viaje GPS con vehículo {orden.truck.plate}.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 border-l-2 border-primary pl-4 pb-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground font-bold">
                    3
                  </div>
                  <div>
                    <span className="font-bold text-foreground">Entregas en Clientes Ejecutadas</span>
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      {orden.paradas[0].arrivedAt} a {orden.paradas[orden.paradas.length - 1].deliveredAt}
                    </span>
                    <p className="text-muted-foreground text-[11px]">
                      {orden.kpis.completedStops} paradas de entrega completadas con registro de firma, foto y cobros.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 border-l-2 border-emerald-600 pl-4">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[10px] text-white font-bold">
                    ✓
                  </div>
                  <div>
                    <span className="font-bold text-emerald-600">Retorno a Base y Liquidación de Ruta</span>
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      {orden.completedDate.split('T')[1].slice(0, 5)} · Odómetro final: {orden.totalKm} km
                    </span>
                    <p className="text-muted-foreground text-[11px]">
                      Arqueo de cobranzas verificado ({fmtMoney(orden.kpis.totalCollected)}). Conteo de retorno de activos validado.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal / Lightbox de Evidencia POD en Alta Resolución (Diseño Panorámico Split-Screen) */}
      <Dialog open={isEvidenceModalOpen} onOpenChange={setIsEvidenceModalOpen}>
        <DialogContent className="sm:max-w-5xl md:max-w-6xl lg:max-w-7xl w-[94vw] max-h-[92vh] p-0 overflow-hidden border border-border shadow-2xl bg-card rounded-2xl flex flex-col">
          {selectedEvidence && (
            <div className="flex flex-col h-full max-h-[92vh]">
              {/* Header Superior del Modal */}
              <div className="p-3.5 px-5 border-b border-border bg-muted/40 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20">
                    {selectedEvidence.category === 'FIRMA' ? (
                      <Fingerprint size={20} />
                    ) : selectedEvidence.category === 'CARGA' ? (
                      <Package size={20} />
                    ) : selectedEvidence.category === 'DOCUMENTO' ? (
                      <FileText size={20} />
                    ) : (
                      <Store size={20} />
                    )}
                  </div>
                  <div>
                    <DialogTitle className="text-sm md:text-base font-bold flex items-center gap-2">
                      {selectedEvidence.title}
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] h-4 px-1.5 font-semibold',
                          selectedEvidence.category === 'FIRMA'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : selectedEvidence.category === 'CARGA'
                            ? 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300'
                            : selectedEvidence.category === 'DOCUMENTO'
                            ? 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300'
                            : 'bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-950/40 dark:text-purple-300'
                        )}
                      >
                        {selectedEvidence.categoryLabel}
                      </Badge>
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground">
                      Parada #{selectedStop.sequence} · {selectedStop.customerName} · Remisión: <b className="font-mono text-foreground">{selectedStop.deliveryNoteNumber}</b>
                    </DialogDescription>
                  </div>
                </div>

                {/* Toolbar de Zoom, Rotación y Reseteo (con mr-10 para no superponerse con el botón X de cerrar) */}
                <div className="flex items-center gap-1.5 bg-background p-1 rounded-lg border border-border mr-10">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 cursor-pointer"
                    onClick={() => setZoomLevel((z) => Math.max(0.75, z - 0.25))}
                    title="Reducir zoom"
                  >
                    <ZoomOut size={14} />
                  </Button>
                  <button
                    onClick={() => {
                      setZoomLevel(1)
                      setRotationDeg(0)
                    }}
                    className="text-[11px] font-mono font-medium px-2 py-0.5 rounded hover:bg-muted cursor-pointer"
                    title="Restablecer vista"
                  >
                    {Math.round(zoomLevel * 100)}%
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 cursor-pointer"
                    onClick={() => setZoomLevel((z) => Math.min(2.5, z + 0.25))}
                    title="Aumentar zoom"
                  >
                    <ZoomIn size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 cursor-pointer"
                    onClick={() => setRotationDeg((r) => (r + 90) % 360)}
                    title="Rotar 90°"
                  >
                    <RotateCw size={14} />
                  </Button>
                </div>
              </div>

              {/* Cuerpo del Modal: Vista Dividida (Viewport Grande + Panel Lateral de Auditoría) */}
              <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
                {/* Panel Izquierdo: Viewport Principal */}
                <div className="flex-1 bg-slate-950 relative flex flex-col items-center justify-center p-6 overflow-hidden min-h-[380px] md:min-h-[500px]">
                  {/* Lienzo con escalado y rotación interactiva */}
                  <div
                    style={{
                      transform: `scale(${zoomLevel}) rotate(${rotationDeg}deg)`,
                      transition: 'transform 0.2s ease',
                    }}
                    className="w-full max-w-2xl flex items-center justify-center"
                  >
                    {renderEvidenceGraphic(selectedEvidence, true)}
                  </div>

                  {/* Flechas flotantes de navegación */}
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={goToPrevEvidence}
                    className="absolute left-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full shadow-2xl opacity-80 hover:opacity-100 hover:scale-105 transition-all cursor-pointer bg-background/90 backdrop-blur-md"
                    title="Evidencia anterior"
                  >
                    <ChevronLeft size={20} />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={goToNextEvidence}
                    className="absolute right-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full shadow-2xl opacity-80 hover:opacity-100 hover:scale-105 transition-all cursor-pointer bg-background/90 backdrop-blur-md"
                    title="Evidencia siguiente"
                  >
                    <ChevronRight size={20} />
                  </Button>

                  {/* Selector horizontal de 2 evidencias (Firma y Fotografía de Entrega) */}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-background/95 backdrop-blur-md p-1.5 rounded-full border border-border shadow-2xl z-20">
                    {currentPodPhotos.map((ev) => (
                      <button
                        key={ev.id}
                        onClick={() => {
                          setSelectedEvidence(ev)
                          setZoomLevel(1)
                          setRotationDeg(0)
                        }}
                        className={cn(
                          'px-4 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap select-none',
                          selectedEvidence.id === ev.id
                            ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/80'
                        )}
                      >
                        {ev.category === 'FIRMA' ? (
                          <Fingerprint size={14} className={selectedEvidence.id === ev.id ? 'text-primary-foreground' : 'text-primary'} />
                        ) : (
                          <Package size={14} className={selectedEvidence.id === ev.id ? 'text-primary-foreground' : 'text-blue-500'} />
                        )}
                        <span className="whitespace-nowrap">{ev.categoryLabel}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Panel Derecho: Expediente POD y Conformidad */}
                <div className="w-full md:w-[360px] lg:w-[390px] bg-card p-5 border-t md:border-t-0 md:border-l border-border flex flex-col justify-between overflow-y-auto space-y-4 shrink-0">
                  <div className="space-y-3.5 text-xs">
                    {/* Header de la ficha */}
                    <div className="flex items-center justify-between border-b border-border pb-2.5">
                      <span className="font-bold text-foreground flex items-center gap-1.5">
                        <CheckCircle2 size={16} className="text-emerald-600" />
                        Conformidad de Entrega
                      </span>
                      <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
                        {selectedEvidence.timestamp}
                      </Badge>
                    </div>

                    {/* Ficha 1: Receptor y Conformidad */}
                    <div className="p-3 rounded-lg bg-muted/30 border border-border/70 space-y-2">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                        Recepción en Cliente
                      </span>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Receptor:</span>
                        <span className="font-bold text-foreground text-right">{selectedStop.proofOfDelivery?.receiverName}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Documento CI:</span>
                        <span className="font-mono font-medium">{selectedStop.proofOfDelivery?.receiverDocument}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Cargo / Rol:</span>
                        <span className="font-medium text-right">{selectedStop.proofOfDelivery?.receiverRelationship}</span>
                      </div>
                    </div>

                    {/* Ficha 2: Georreferenciación en Punto */}
                    <div className="p-3 rounded-lg bg-muted/30 border border-border/70 space-y-2">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                        Geoposición Validada
                      </span>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Coordenadas:</span>
                        <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                          <MapPin size={11} /> {selectedEvidence.coordinates || '-17.77892, -63.19012'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Precisión GPS:</span>
                        <span className="font-medium text-emerald-600">{selectedStop.proofOfDelivery?.gpsAccuracy || '± 3.8m'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Zona de Entrega:</span>
                        <span className="font-medium text-foreground">{selectedStop.zoneName}</span>
                      </div>
                    </div>

                    {/* Ficha 3: Observación Operativa */}
                    <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs space-y-1">
                      <span className="font-bold text-foreground block text-[11px]">Detalle de la evidencia:</span>
                      <p className="text-muted-foreground text-[11px] leading-relaxed">{selectedEvidence.description}</p>
                    </div>
                  </div>

                  {/* Acciones del Modal */}
                  <div className="pt-3 border-t border-border flex flex-col gap-2">
                    <Button
                      onClick={() => handleDownloadEvidence(selectedEvidence)}
                      className="w-full h-8 text-xs gap-1.5 cursor-pointer font-semibold"
                    >
                      <Download size={13} />
                      Descargar Evidencia
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(`Evidencia POD: ${selectedEvidence.title} - ${selectedStop.customerName} - Receptor: ${selectedStop.proofOfDelivery?.receiverName} - Hora: ${selectedEvidence.timestamp}`)
                        toast.success('Resumen de evidencia copiado al portapapeles')
                      }}
                      className="w-full h-8 text-xs gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
                    >
                      <Copy size={12} />
                      Copiar Registro de Auditoría
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
