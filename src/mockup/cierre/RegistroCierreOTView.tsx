import React, { useState, useMemo, useEffect } from 'react'
import {
  ArrowLeft,
  Truck,
  User,
  Calendar as CalendarIcon,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Banknote,
  Package,
  FileSpreadsheet,
  Save,
  Check,
  RotateCcw,
  Sparkles,
  Plus,
  Minus,
  Trash2,
  HelpCircle,
  Building2,
  Receipt,
  FileCheck,
  UserCheck,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  Calculator,
  Search,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Landmark,
  QrCode,
  CreditCard,
  Coins,
  Eye,
  ArrowRight,
  FileText,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  type CierreOrdenTransporte,
  type CierreAlmacenItem,
  type CorteMonedaItem,
  type DepositoEfectivoItem,
  type TransferenciaItem,
  type PagoQrItem,
  type ChequeItem,
  type FacturaEfectivoItem,
  generarFacturasEfectivoParaMonto,
} from '../cierre-logistico-data'

interface RegistroCierreOTViewProps {
  cierre: CierreOrdenTransporte
  onVolver: () => void
  onGuardarCierre: (cierreActualizado: CierreOrdenTransporte) => void
}

type ProductSortField =
  | 'codigo'
  | 'producto'
  | 'um'
  | 'cantidadDespacho'
  | 'cantidadBonificacion'
  | 'cantidadDevuelto'
  | 'cantidadFaltante'
  | 'facturadoTotal'
  | 'valorFacturado'

type ProductQuickFilter = 'ALL' | 'DEVUELTOS' | 'FALTANTES' | 'ENTREGADOS'

const DENOMINACIONES_BASE_BS: Array<{
  denominacion: string
  valorUnitario: number
  tipo: 'BILLETE' | 'MONEDA'
}> = [
  { denominacion: '200 Bs', valorUnitario: 200, tipo: 'BILLETE' },
  { denominacion: '100 Bs', valorUnitario: 100, tipo: 'BILLETE' },
  { denominacion: '50 Bs', valorUnitario: 50, tipo: 'BILLETE' },
  { denominacion: '20 Bs', valorUnitario: 20, tipo: 'BILLETE' },
  { denominacion: '10 Bs', valorUnitario: 10, tipo: 'BILLETE' },
  { denominacion: '5 Bs', valorUnitario: 5, tipo: 'MONEDA' },
  { denominacion: '2 Bs', valorUnitario: 2, tipo: 'MONEDA' },
  { denominacion: '1 Bs', valorUnitario: 1, tipo: 'MONEDA' },
  { denominacion: '0.50 Bs', valorUnitario: 0.5, tipo: 'MONEDA' },
  { denominacion: '0.20 Bs', valorUnitario: 0.2, tipo: 'MONEDA' },
  { denominacion: '0.10 Bs', valorUnitario: 0.1, tipo: 'MONEDA' },
]

function getInitialAlmacenItems(cierre: CierreOrdenTransporte): CierreAlmacenItem[] {
  return cierre.almacen.items.map((item) => {
    const unitPrice = item.cantidadDespacho > 0 ? item.valorDespacho / item.cantidadDespacho : 0
    const cantFact = Math.max(0, item.cantidadDespacho - item.cantidadBonificacion)
    return {
      ...item,
      cantidadDevuelto: 0,
      cantidadFaltante: 0,
      cantidadSobrante: 0,
      cantidadFacturado: cantFact,
      facturadoTotal: item.cantidadDespacho,
      valorFacturado: cantFact * unitPrice,
      valorDevuelto: 0,
    }
  })
}

function getInitialCortes(): CorteMonedaItem[] {
  return DENOMINACIONES_BASE_BS.map((d) => ({
    denominacion: d.denominacion,
    valorUnitario: d.valorUnitario,
    tipo: d.tipo,
    cantidad: 0,
    monto: 0,
  }))
}

function calcularCortesParaMonto(montoTotal: number): CorteMonedaItem[] {
  let rem = Math.max(0, Math.round(montoTotal * 100) / 100)
  return DENOMINACIONES_BASE_BS.map((d) => {
    let cant = 0
    if (rem >= d.valorUnitario) {
      cant = Math.floor(rem / d.valorUnitario)
      rem = Math.round((rem - cant * d.valorUnitario) * 100) / 100
    }
    return {
      denominacion: d.denominacion,
      valorUnitario: d.valorUnitario,
      tipo: d.tipo,
      cantidad: cant,
      monto: parseFloat((cant * d.valorUnitario).toFixed(2)),
    }
  })
}

export function RegistroCierreOTView({
  cierre,
  onVolver,
  onGuardarCierre,
}: RegistroCierreOTViewProps) {
  const [activeTab, setActiveTab] = useState<'almacen' | 'cobranza'>('almacen')

  // ══════════════════════════════════════════════════════════════════════════
  // ESTADO TAB 1: CIERRE DE ALMACÉN (FÍSICO - INICIA EN 0 DEVOLUCIONES Y FALTANTES)
  // ══════════════════════════════════════════════════════════════════════════
  const [almacenItems, setAlmacenItems] = useState<CierreAlmacenItem[]>(() =>
    getInitialAlmacenItems(cierre)
  )
  const [searchProductQuery, setSearchProductQuery] = useState('')
  const [productQuickFilter, setProductQuickFilter] = useState<ProductQuickFilter>('ALL')
  const [productSortField, setProductSortField] = useState<ProductSortField>('codigo')
  const [productSortDirection, setProductSortDirection] = useState<'asc' | 'desc'>('asc')
  const [productCurrentPage, setProductCurrentPage] = useState(1)
  const [productPageSize, setProductPageSize] = useState(10)

  // Reset de página al cambiar filtros
  useEffect(() => {
    setProductCurrentPage(1)
  }, [searchProductQuery, productQuickFilter, productPageSize])

  // Modificar cantidad devuelta de un ítem
  const handleUpdateDevuelto = (codigo: string, nuevaCantidad: number) => {
    setAlmacenItems((prev) =>
      prev.map((item) => {
        if (item.codigo !== codigo) return item
        const maxDevuelto = Math.max(0, item.cantidadDespacho - (item.cantidadFaltante || 0))
        const devuelto = Math.max(0, Math.min(nuevaCantidad, maxDevuelto))
        const unitPrice =
          item.cantidadDespacho > 0 ? item.valorDespacho / item.cantidadDespacho : 0
        const cantFact = Math.max(
          0,
          item.cantidadDespacho - item.cantidadBonificacion - devuelto - (item.cantidadFaltante || 0)
        )
        return {
          ...item,
          cantidadDevuelto: devuelto,
          cantidadFacturado: cantFact,
          facturadoTotal: cantFact + item.cantidadBonificacion,
          valorFacturado: cantFact * unitPrice,
          valorDevuelto: devuelto * unitPrice,
        }
      })
    )
  }

  // Modificar cantidad faltante de un ítem
  const handleUpdateFaltante = (codigo: string, nuevaCantidad: number) => {
    setAlmacenItems((prev) =>
      prev.map((item) => {
        if (item.codigo !== codigo) return item
        const maxFaltante = Math.max(0, item.cantidadDespacho - (item.cantidadDevuelto || 0))
        const faltante = Math.max(0, Math.min(nuevaCantidad, maxFaltante))
        const unitPrice =
          item.cantidadDespacho > 0 ? item.valorDespacho / item.cantidadDespacho : 0
        const cantFact = Math.max(
          0,
          item.cantidadDespacho - item.cantidadBonificacion - (item.cantidadDevuelto || 0) - faltante
        )
        return {
          ...item,
          cantidadFaltante: faltante,
          cantidadFacturado: cantFact,
          facturadoTotal: cantFact + item.cantidadBonificacion,
          valorFacturado: cantFact * unitPrice,
        }
      })
    )
  }

  // Totales calculados de Almacén
  const totalesAlmacen = useMemo(() => {
    return almacenItems.reduce(
      (acc, item) => ({
        totalCantidadDespacho: acc.totalCantidadDespacho + item.cantidadDespacho,
        totalCantidadFacturado: acc.totalCantidadFacturado + item.cantidadFacturado,
        totalCantidadBonificacion: acc.totalCantidadBonificacion + item.cantidadBonificacion,
        totalFacturadoTotal: acc.totalFacturadoTotal + item.facturadoTotal,
        totalCantidadDevuelto: acc.totalCantidadDevuelto + item.cantidadDevuelto,
        totalCantidadFaltante: acc.totalCantidadFaltante + item.cantidadFaltante,
        totalCantidadSobrante: acc.totalCantidadSobrante + item.cantidadSobrante,
        totalValorDespacho: acc.totalValorDespacho + item.valorDespacho,
        totalValorFacturado: acc.totalValorFacturado + item.valorFacturado,
        totalValorBonificacion: acc.totalValorBonificacion + item.valorBonificacion,
        totalValorDevuelto: acc.totalValorDevuelto + item.valorDevuelto,
      }),
      {
        totalCantidadDespacho: 0,
        totalCantidadFacturado: 0,
        totalCantidadBonificacion: 0,
        totalFacturadoTotal: 0,
        totalCantidadDevuelto: 0,
        totalCantidadFaltante: 0,
        totalCantidadSobrante: 0,
        totalValorDespacho: 0,
        totalValorFacturado: 0,
        totalValorBonificacion: 0,
        totalValorDevuelto: 0,
      }
    )
  }, [almacenItems])

  // Conteos para los tabs rápidos de productos
  const countDevueltos = useMemo(
    () => almacenItems.filter((i) => i.cantidadDevuelto > 0).length,
    [almacenItems]
  )
  const countFaltantes = useMemo(
    () => almacenItems.filter((i) => i.cantidadFaltante > 0).length,
    [almacenItems]
  )
  const countEntregados = useMemo(
    () => almacenItems.filter((i) => i.cantidadDevuelto === 0 && i.cantidadFaltante === 0).length,
    [almacenItems]
  )

  // Filtrado de productos
  const filteredProducts = useMemo(() => {
    return almacenItems.filter((it) => {
      // 1. Buscador
      if (searchProductQuery.trim()) {
        const q = searchProductQuery.toLowerCase()
        const matchCode = it.codigo.toLowerCase().includes(q)
        const matchName = it.producto.toLowerCase().includes(q)
        const matchUm = it.um.toLowerCase().includes(q)
        if (!matchCode && !matchName && !matchUm) return false
      }

      // 2. Filtro rápido
      if (productQuickFilter === 'DEVUELTOS' && it.cantidadDevuelto === 0) return false
      if (productQuickFilter === 'FALTANTES' && it.cantidadFaltante === 0) return false
      if (
        productQuickFilter === 'ENTREGADOS' &&
        (it.cantidadDevuelto > 0 || it.cantidadFaltante > 0)
      ) {
        return false
      }

      return true
    })
  }, [almacenItems, searchProductQuery, productQuickFilter])

  // Sorting de productos
  const sortedProducts = useMemo(() => {
    const list = [...filteredProducts]
    list.sort((a, b) => {
      const aVal = a[productSortField]
      const bVal = b[productSortField]

      if (typeof aVal === 'string') {
        const cmp = aVal.localeCompare(bVal as string)
        return productSortDirection === 'asc' ? cmp : -cmp
      }

      if (aVal < bVal) return productSortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return productSortDirection === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [filteredProducts, productSortField, productSortDirection])

  // Paginación de productos
  const totalProductItems = sortedProducts.length
  const totalProductPages =
    productPageSize === 0 ? 1 : Math.max(1, Math.ceil(totalProductItems / productPageSize))
  const paginatedProducts = useMemo(() => {
    if (productPageSize === 0) return sortedProducts
    const start = (productCurrentPage - 1) * productPageSize
    return sortedProducts.slice(start, start + productPageSize)
  }, [sortedProducts, productCurrentPage, productPageSize])

  const productStartIndex =
    totalProductItems === 0
      ? 0
      : productPageSize === 0
      ? 1
      : (productCurrentPage - 1) * productPageSize + 1
  const productEndIndex =
    productPageSize === 0
      ? totalProductItems
      : Math.min(totalProductItems, productCurrentPage * productPageSize)

  const handleProductSort = (field: ProductSortField) => {
    if (productSortField === field) {
      setProductSortDirection(productSortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setProductSortField(field)
      setProductSortDirection('asc')
    }
  }

  const renderProductSortIcon = (field: ProductSortField) => {
    if (productSortField !== field) {
      return <ArrowUpDown className="h-3 w-3 text-slate-400 opacity-60 group-hover:opacity-100" />
    }
    return productSortDirection === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ESTADO TAB 2: CIERRE DE COBRANZAS (DATOS REGISTRADOS DESDE APP MÓVIL)
  // ══════════════════════════════════════════════════════════════════════════
  const [cortes, setCortes] = useState<CorteMonedaItem[]>(() =>
    JSON.parse(JSON.stringify(cierre.cobranza.cortesBs || []))
  )
  const [depositos, setDepositos] = useState<DepositoEfectivoItem[]>(() =>
    JSON.parse(JSON.stringify(cierre.cobranza.depositosEfectivo || []))
  )
  const [transferencias, setTransferencias] = useState<TransferenciaItem[]>(() =>
    JSON.parse(JSON.stringify(cierre.cobranza.transferencias || []))
  )
  const [pagosQr, setPagosQr] = useState<PagoQrItem[]>(() =>
    JSON.parse(JSON.stringify(cierre.cobranza.pagosQr || []))
  )
  const [cheques, setCheques] = useState<ChequeItem[]>(() =>
    JSON.parse(JSON.stringify(cierre.cobranza.cheques || []))
  )
  const [observacionesCobranza, setObservacionesCobranza] = useState(
    cierre.cobranza.observaciones || ''
  )

  // Sincronizar datos al cambiar de orden seleccionada
  useEffect(() => {
    setAlmacenItems(getInitialAlmacenItems(cierre))
    setCortes(JSON.parse(JSON.stringify(cierre.cobranza.cortesBs || [])))
    setDepositos(JSON.parse(JSON.stringify(cierre.cobranza.depositosEfectivo || [])))
    setTransferencias(JSON.parse(JSON.stringify(cierre.cobranza.transferencias || [])))
    setPagosQr(JSON.parse(JSON.stringify(cierre.cobranza.pagosQr || [])))
    setCheques(JSON.parse(JSON.stringify(cierre.cobranza.cheques || [])))
    setObservacionesCobranza(cierre.cobranza.observaciones || '')
  }, [cierre.id])

  // ══════════════════════════════════════════════════════════════════════════
  // CÁLCULOS FINANCIEROS Y MATRIZ DE CUADRE EN TIEMPO REAL
  // ══════════════════════════════════════════════════════════════════════════
  const totalEfectivoCortes = useMemo(() => {
    return cortes.reduce((acc, c) => acc + c.monto, 0)
  }, [cortes])

  const totalBilletes = useMemo(() => {
    return cortes.filter((c) => c.tipo === 'BILLETE').reduce((acc, c) => acc + c.monto, 0)
  }, [cortes])

  const totalMonedas = useMemo(() => {
    return cortes.filter((c) => c.tipo === 'MONEDA').reduce((acc, c) => acc + c.monto, 0)
  }, [cortes])

  const totalDepositos = useMemo(() => {
    return depositos.reduce((acc, d) => acc + d.monto, 0)
  }, [depositos])

  const totalTransferencias = useMemo(() => {
    return transferencias.reduce((acc, t) => acc + t.monto, 0)
  }, [transferencias])

  const totalQr = useMemo(() => {
    return pagosQr.reduce((acc, q) => acc + q.monto, 0)
  }, [pagosQr])

  const totalCheques = useMemo(() => {
    return cheques.reduce((acc, c) => acc + c.monto, 0)
  }, [cheques])

  const totalCreditos = useMemo(() => {
    return (cierre.cobranza.creditos || []).reduce((acc, c) => acc + c.monto, 0)
  }, [cierre])

  // Total 3 Medios Digitales / Bancarios (Transferencias + QR + Cheques)
  const totalDigitalesBancarios = totalTransferencias + totalQr + totalCheques

  // Total Cobranza Chofer = Efectivo (Cortes) + Transferencias + QR + Cheques (Los 4 Medios de Cobranza)
  const totalCobranzaChofer = totalEfectivoCortes + totalDigitalesBancarios

  // Total a Rendir = Cobranza Chofer + Créditos
  const totalARendir = totalCobranzaChofer + totalCreditos

  // Facturado Esperado sincronizado con el Almacén
  const importeFacturadoEsperado = totalesAlmacen.totalValorFacturado

  // Diferencia de cuadre
  const diferenciaCuadre = totalARendir - importeFacturadoEsperado
  const isCuadradoCobranza = Math.abs(diferenciaCuadre) < 0.01
  const isFaltanteCobranza = diferenciaCuadre < -0.01
  const isSobranteCobranza = diferenciaCuadre > 0.01

  // Estado Físico Almacén
  const totalFaltanteFisico = totalesAlmacen.totalCantidadFaltante
  const isCuadradoAlmacen = totalFaltanteFisico === 0

  // ══════════════════════════════════════════════════════════════════════════
  // ESTADOS Y FILTROS: MODAL DE DETALLE DE MEDIOS DE PAGO Y FACTURAS
  // ══════════════════════════════════════════════════════════════════════════
  const [showDetalleModal, setShowDetalleModal] = useState(false)
  const [detalleMetodoActivo, setDetalleMetodoActivo] = useState<
    'ALL' | 'EFECTIVO' | 'TRANSFERENCIA' | 'QR' | 'CHEQUE'
  >('ALL')
  const [detalleSearchQuery, setDetalleSearchQuery] = useState('')
  const [efectivoSubTab, setEfectivoSubTab] = useState<'FACTURAS' | 'ARQUEO'>('FACTURAS')

  // Generación reactiva de facturas pagadas en efectivo según el monto arqueado
  const facturasEfectivo = useMemo(() => {
    return generarFacturasEfectivoParaMonto(cierre.orderCode, totalEfectivoCortes)
  }, [cierre.orderCode, totalEfectivoCortes])

  const handleAbrirDetalleModal = (
    metodo: 'ALL' | 'EFECTIVO' | 'TRANSFERENCIA' | 'QR' | 'CHEQUE'
  ) => {
    setDetalleMetodoActivo(metodo)
    setDetalleSearchQuery('')
    setEfectivoSubTab('FACTURAS')
    setShowDetalleModal(true)
  }

  // Filtrado de Transferencias
  const filteredTransferencias = useMemo(() => {
    if (!detalleSearchQuery.trim()) return transferencias
    const q = detalleSearchQuery.toLowerCase()
    return transferencias.filter(
      (t) =>
        t.transaccion.toLowerCase().includes(q) ||
        t.banco.toLowerCase().includes(q) ||
        t.clienteNombre.toLowerCase().includes(q) ||
        t.clienteCodigo.toLowerCase().includes(q) ||
        (t.factura && t.factura.toLowerCase().includes(q))
    )
  }, [transferencias, detalleSearchQuery])

  // Filtrado de Pagos QR
  const filteredPagosQr = useMemo(() => {
    if (!detalleSearchQuery.trim()) return pagosQr
    const q = detalleSearchQuery.toLowerCase()
    return pagosQr.filter(
      (qItem) =>
        qItem.transaccion.toLowerCase().includes(q) ||
        qItem.banco.toLowerCase().includes(q) ||
        qItem.clienteNombre.toLowerCase().includes(q) ||
        qItem.clienteCodigo.toLowerCase().includes(q) ||
        (qItem.factura && qItem.factura.toLowerCase().includes(q))
    )
  }, [pagosQr, detalleSearchQuery])

  // Filtrado de Cheques
  const filteredCheques = useMemo(() => {
    if (!detalleSearchQuery.trim()) return cheques
    const q = detalleSearchQuery.toLowerCase()
    return cheques.filter(
      (c) =>
        c.nroCheque.toLowerCase().includes(q) ||
        c.banco.toLowerCase().includes(q) ||
        c.clienteNombre.toLowerCase().includes(q) ||
        c.clienteCodigo.toLowerCase().includes(q) ||
        (c.factura && c.factura.toLowerCase().includes(q))
    )
  }, [cheques, detalleSearchQuery])

  // Filtrado de Facturas Efectivo
  const filteredFacturasEfectivo = useMemo(() => {
    if (!detalleSearchQuery.trim()) return facturasEfectivo
    const q = detalleSearchQuery.toLowerCase()
    return facturasEfectivo.filter(
      (f) =>
        f.factura.toLowerCase().includes(q) ||
        f.reciboChofer.toLowerCase().includes(q) ||
        f.clienteNombre.toLowerCase().includes(q) ||
        f.clienteCodigo.toLowerCase().includes(q)
    )
  }, [facturasEfectivo, detalleSearchQuery])

  // Lista consolidada de todas las facturas y operaciones para la pestaña "Todos los Medios"
  const todasLasFacturas = useMemo(() => {
    const list: Array<{
      id: string
      tipo: 'EFECTIVO' | 'TRANSFERENCIA' | 'QR' | 'CHEQUE'
      tipoLabel: string
      factura: string
      referencia: string
      entidad: string
      clienteCodigo: string
      clienteNombre: string
      monto: number
      hora: string
      estado: string
    }> = []

    // 1. Efectivo
    facturasEfectivo.forEach((f, idx) => {
      list.push({
        id: `ef-${idx}-${f.factura}`,
        tipo: 'EFECTIVO',
        tipoLabel: 'Efectivo',
        factura: f.factura,
        referencia: f.reciboChofer,
        entidad: 'Caja Recaudadora',
        clienteCodigo: f.clienteCodigo,
        clienteNombre: f.clienteNombre,
        monto: f.monto,
        hora: f.hora,
        estado: f.estado,
      })
    })

    // 2. Transferencias ACH
    transferencias.forEach((t, idx) => {
      list.push({
        id: `tr-${idx}-${t.transaccion}`,
        tipo: 'TRANSFERENCIA',
        tipoLabel: 'Transferencia ACH',
        factura: t.factura || `FAC-${cierre.orderCode.slice(-4)}-TR${idx + 1}`,
        referencia: t.transaccion,
        entidad: t.banco,
        clienteCodigo: t.clienteCodigo,
        clienteNombre: t.clienteNombre,
        monto: t.monto,
        hora: t.fechaHora || '10:30 AM',
        estado: t.estado || 'Conciliado con Extracto',
      })
    })

    // 3. Pagos QR Simple
    pagosQr.forEach((qItem, idx) => {
      list.push({
        id: `qr-${idx}-${qItem.transaccion}`,
        tipo: 'QR',
        tipoLabel: 'Pago QR Simple',
        factura: qItem.factura || `FAC-${cierre.orderCode.slice(-4)}-QR${idx + 1}`,
        referencia: qItem.transaccion,
        entidad: qItem.banco,
        clienteCodigo: qItem.clienteCodigo,
        clienteNombre: qItem.clienteNombre,
        monto: qItem.monto,
        hora: qItem.fechaHora || '11:15 AM',
        estado: qItem.estado || 'Validado en Pasarela',
      })
    })

    // 4. Cheques Bancarios
    cheques.forEach((c, idx) => {
      list.push({
        id: `ch-${idx}-${c.nroCheque}`,
        tipo: 'CHEQUE',
        tipoLabel: 'Cheque Bancario',
        factura: c.factura || `FAC-${cierre.orderCode.slice(-4)}-CH${idx + 1}`,
        referencia: c.nroCheque,
        entidad: c.banco,
        clienteCodigo: c.clienteCodigo,
        clienteNombre: c.clienteNombre,
        monto: c.monto,
        hora: c.fechaCobro || cierre.dateFormatted,
        estado: c.estado || 'En Custodia / Aceptado',
      })
    })

    return list
  }, [facturasEfectivo, transferencias, pagosQr, cheques, cierre.orderCode, cierre.dateFormatted])

  const filteredTodasLasFacturas = useMemo(() => {
    if (!detalleSearchQuery.trim()) return todasLasFacturas
    const q = detalleSearchQuery.toLowerCase()
    return todasLasFacturas.filter(
      (item) =>
        item.factura.toLowerCase().includes(q) ||
        item.referencia.toLowerCase().includes(q) ||
        item.entidad.toLowerCase().includes(q) ||
        item.clienteNombre.toLowerCase().includes(q) ||
        item.clienteCodigo.toLowerCase().includes(q) ||
        item.tipoLabel.toLowerCase().includes(q)
    )
  }, [todasLasFacturas, detalleSearchQuery])

  // Subtotales filtrados para KPIs del Modal
  const subtotalFilteredTransferencias = useMemo(
    () => filteredTransferencias.reduce((acc, t) => acc + t.monto, 0),
    [filteredTransferencias]
  )
  const subtotalFilteredPagosQr = useMemo(
    () => filteredPagosQr.reduce((acc, q) => acc + q.monto, 0),
    [filteredPagosQr]
  )
  const subtotalFilteredCheques = useMemo(
    () => filteredCheques.reduce((acc, c) => acc + c.monto, 0),
    [filteredCheques]
  )
  const subtotalFilteredEfectivo = useMemo(
    () => filteredFacturasEfectivo.reduce((acc, f) => acc + f.monto, 0),
    [filteredFacturasEfectivo]
  )
  const subtotalFilteredTodas = useMemo(
    () => filteredTodasLasFacturas.reduce((acc, it) => acc + it.monto, 0),
    [filteredTodasLasFacturas]
  )

  // ══════════════════════════════════════════════════════════════════════════
  // GUARDAR LIQUIDACIÓN
  // ══════════════════════════════════════════════════════════════════════════
  const handleGuardar = () => {
    const cierreActualizado: CierreOrdenTransporte = {
      ...cierre,
      status: isCuadradoCobranza && isCuadradoAlmacen ? 'LIQUIDATED' : 'OBSERVED',
      statusLabel:
        isCuadradoCobranza && isCuadradoAlmacen
          ? 'Liquidado Conforme'
          : !isCuadradoAlmacen
          ? 'Observado (Faltante Físico)'
          : 'Observado (Descuadre Cobranza)',

      almacen: {
        ...cierre.almacen,
        items: almacenItems,
        totales: totalesAlmacen,
        firmas: {
          ...cierre.almacen.firmas,
          chofer: { ...cierre.almacen.firmas.chofer, firmado: true },
          almacen: { ...cierre.almacen.firmas.almacen, firmado: true },
        },
      },

      cobranza: {
        ...cierre.cobranza,
        resumenFinanciero: {
          ...cierre.cobranza.resumenFinanciero,
          importeFacturado: importeFacturadoEsperado,
          importeBonificado: totalesAlmacen.totalValorBonificacion,
          importeEntregado: totalesAlmacen.totalValorFacturado + totalesAlmacen.totalValorBonificacion,
          importeDevuelto: totalesAlmacen.totalValorDevuelto,
          valorDespacho: totalesAlmacen.totalValorDespacho,
        },
        resumenCobranzas: {
          ...cierre.cobranza.resumenCobranzas,
          efectivo: totalEfectivoCortes,
          transferencia: totalTransferencias,
          qr: totalQr,
          cheque: totalCheques,
          cobranzaChofer: totalCobranzaChofer,
          totalARendir: totalARendir,
        },
        cortesBs: cortes,
        depositosEfectivo: depositos,
        transferencias: transferencias,
        pagosQr: pagosQr,
        cheques: cheques,
        observaciones: observacionesCobranza,
        firmas: {
          ...cierre.cobranza.firmas,
          chofer: { ...cierre.cobranza.firmas.chofer, firmado: true },
          cajero: { ...cierre.cobranza.firmas.cajero, firmado: true },
        },
      },
    }

    onGuardarCierre(cierreActualizado)
    toast.success(`Liquidación de OT #${cierre.orderCode} guardada con éxito`)
  }

  return (
    <div className="space-y-4">
      {/* ── CABECERA PRINCIPAL CON DETALLE COMPLETO DE LA ORDEN DE TRANSPORTE ── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 md:p-5 space-y-4">
        {/* Barra superior: Volver + Título + Acciones rápidas */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={onVolver}
              className="h-9 w-9 rounded-xl border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0 shadow-2xs"
              title="Volver a órdenes"
            >
              <ArrowLeft className="h-4.5 w-4.5" />
            </Button>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base md:text-lg font-bold text-slate-900 dark:text-slate-100">
                  Registro de Liquidación y Cierre de Ruta
                </h1>
                <Badge className="bg-indigo-600 text-white font-mono text-xs px-2 py-0.5 shadow-2xs">
                  OT #{cierre.orderCode}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-xs font-semibold px-2 py-0.5',
                    isCuadradoAlmacen && isCuadradoCobranza
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                  )}
                >
                  {isCuadradoAlmacen && isCuadradoCobranza
                    ? '100% Cuadrado'
                    : 'En Proceso de Liquidación'}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Complete el retorno físico en rampa de almacén y el arqueo financiero en caja
              </p>
            </div>
          </div>
        </div>

        {/* TARJETA DE DATOS OPERATIVOS DEL DESPACHO */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Chofer */}
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Chofer Repartidor
            </span>
            <div className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate mt-0.5">
              {cierre.driverName}
            </div>
            <span className="text-[10px] text-slate-500 font-mono">
              CI: {cierre.driverCi} • {cierre.driverEmpresa}
            </span>
          </div>

          {/* Camión */}
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Vehículo / Placa
            </span>
            <div className="font-mono font-bold text-xs text-slate-800 dark:text-slate-200 truncate mt-0.5">
              {cierre.truckPlate}
            </div>
            <span className="text-[10px] text-slate-500">{cierre.truckType}</span>
          </div>

          {/* Ruta */}
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Ruta Asignada
            </span>
            <div className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate mt-0.5" title={cierre.routeName}>
              {cierre.routeName}
            </div>
            <span className="text-[10px] text-slate-500">{cierre.distributorName}</span>
          </div>

          {/* Fecha */}
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Fecha de Salida
            </span>
            <div className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate mt-0.5">
              {cierre.dateFormatted}
            </div>
            <span className="text-[10px] text-slate-500">Retorno: 17:30</span>
          </div>

          {/* Valor Despachado */}
          <div className="p-2.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900">
            <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">
              Valor Despacho Inicial
            </span>
            <div className="font-mono font-bold text-sm text-blue-950 dark:text-blue-200 mt-0.5">
              Bs {totalesAlmacen.totalValorDespacho.toFixed(2)}
            </div>
            <span className="text-[10px] text-blue-600/80 dark:text-blue-400">
              {totalesAlmacen.totalCantidadDespacho} unidades cargadas
            </span>
          </div>

          {/* Facturado Esperado */}
          <div className="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900">
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
              A Cobrar (Entregado)
            </span>
            <div className="font-mono font-bold text-sm text-emerald-950 dark:text-emerald-200 mt-0.5">
              Bs {totalesAlmacen.totalValorFacturado.toFixed(2)}
            </div>
            <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400">
              {totalesAlmacen.totalFacturadoTotal} unidades entregadas
            </span>
          </div>
        </div>
      </div>

      {/* ── NAVEGACIÓN PRINCIPAL DE PESTAÑAS (TABS) ── */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as 'almacen' | 'cobranza')}
        className="w-full space-y-3"
      >
        <div className="bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <TabsList className="grid w-full grid-cols-2 h-12 bg-slate-100 dark:bg-slate-800/70 p-1 rounded-xl">
            {/* TAB 1: ALMACÉN */}
            <TabsTrigger
              value="almacen"
              className="h-full flex items-center justify-center gap-2 font-bold text-xs rounded-lg data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-xs dark:data-[state=active]:bg-slate-900 dark:data-[state=active]:text-indigo-300 cursor-pointer transition-all"
            >
              <Package className="h-4.5 w-4.5" />
              <span className="text-xs">1. Cierre de Almacén (Liquidación Física)</span>
              <Badge
                variant="outline"
                className={cn(
                  'ml-1.5 text-[10px] py-0.5 px-2 font-mono font-semibold',
                  isCuadradoAlmacen
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'border-rose-200 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                )}
              >
                {isCuadradoAlmacen ? 'Físico Cuadrado' : `${totalFaltanteFisico} Faltantes`}
              </Badge>
            </TabsTrigger>

            {/* TAB 2: COBRANZA */}
            <TabsTrigger
              value="cobranza"
              className="h-full flex items-center justify-center gap-2 font-bold text-xs rounded-lg data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-xs dark:data-[state=active]:bg-slate-900 dark:data-[state=active]:text-indigo-300 cursor-pointer transition-all"
            >
              <Banknote className="h-4.5 w-4.5" />
              <span className="text-xs">2. Cierre de Cobranza (Arqueo y Finanzas)</span>
              <Badge
                variant="outline"
                className={cn(
                  'ml-1.5 text-[10px] py-0.5 px-2 font-mono font-semibold',
                  isCuadradoCobranza
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : isFaltanteCobranza
                    ? 'border-rose-200 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                    : 'border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                )}
              >
                {isCuadradoCobranza
                  ? 'Cuadrado Bs 0.00'
                  : isFaltanteCobranza
                  ? `Falta: Bs ${Math.abs(diferenciaCuadre).toFixed(2)}`
                  : `Sobra: Bs ${diferenciaCuadre.toFixed(2)}`}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* CONTENIDO TAB 1: CIERRE DE ALMACÉN (FÍSICO CON SORTING Y PAGINACIÓN)  */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="almacen" className="space-y-3">
          {/* Tarjetas resumen de conteo físico */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <span className="text-[10px] font-bold uppercase text-slate-400">Total Despachado</span>
              <div className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                {totalesAlmacen.totalCantidadDespacho} uds
              </div>
              <span className="text-[11px] text-slate-500">
                Bs {totalesAlmacen.totalValorDespacho.toFixed(2)}
              </span>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 shadow-xs dark:border-emerald-900/60 dark:bg-emerald-950/30">
              <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400">
                Total Entregado
              </span>
              <div className="text-lg font-bold font-mono text-emerald-700 dark:text-emerald-300 mt-0.5">
                {totalesAlmacen.totalFacturadoTotal} uds
              </div>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono">
                Bs {totalesAlmacen.totalValorFacturado.toFixed(2)}
              </span>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 shadow-xs dark:border-amber-900/60 dark:bg-amber-950/30">
              <span className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">
                Retorno Físico a Bodega
              </span>
              <div className="text-lg font-bold font-mono text-amber-700 dark:text-amber-300 mt-0.5">
                {totalesAlmacen.totalCantidadDevuelto} uds
              </div>
              <span className="text-[11px] text-amber-600 dark:text-amber-400 font-mono">
                Bs {totalesAlmacen.totalValorDevuelto.toFixed(2)}
              </span>
            </div>

            <div
              className={cn(
                'rounded-xl border p-3 shadow-xs',
                isCuadradoAlmacen
                  ? 'border-emerald-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                  : 'border-rose-300 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/40'
              )}
            >
              <span
                className={cn(
                  'text-[10px] font-bold uppercase',
                  isCuadradoAlmacen ? 'text-slate-400' : 'text-rose-700 dark:text-rose-400'
                )}
              >
                Faltantes / Mermas
              </span>
              <div
                className={cn(
                  'text-lg font-bold font-mono mt-0.5',
                  isCuadradoAlmacen
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-700 dark:text-rose-300'
                )}
              >
                {totalesAlmacen.totalCantidadFaltante} uds
              </div>
              <span className="text-[11px] text-slate-500">
                {isCuadradoAlmacen ? 'Sin diferencias físicas' : 'Requiere descargo chofer'}
              </span>
            </div>
          </div>

          {/* Tabla de Productos para registro de devoluciones y faltantes */}
          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-xs overflow-hidden flex flex-col">
            {/* Toolbar Superior: Buscador al 50% a la izquierda + Chips de Filtro al 50% a la derecha */}
            <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/40">
              {/* LADO IZQUIERDO: BUSCADOR (ocupa el 50% del ancho) */}
              <div className="w-full lg:w-1/2 relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-3.5 w-3.5" />
                <Input
                  placeholder="Buscar producto por SKU, descripción o U.M...."
                  value={searchProductQuery}
                  onChange={(e) => setSearchProductQuery(e.target.value)}
                  className="h-8.5 pl-8.5 pr-8 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 w-full rounded-lg shadow-2xs"
                />
                {searchProductQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchProductQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* LADO DERECHO: CHIPS/BOTONES DE FILTRADO (ocupan la otra mitad, con espaciado ordenado y sin saltos) */}
              <div className="w-full lg:w-1/2 flex items-center justify-start lg:justify-end gap-1.5 overflow-x-auto pb-1 lg:pb-0">
                <button
                  type="button"
                  onClick={() => setProductQuickFilter('ALL')}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all shrink-0 border',
                    productQuickFilter === 'ALL'
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-2xs'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  )}
                >
                  Todos ({almacenItems.length})
                </button>

                <button
                  type="button"
                  onClick={() => setProductQuickFilter('DEVUELTOS')}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 shrink-0 border',
                    productQuickFilter === 'DEVUELTOS'
                      ? 'bg-amber-600 border-amber-600 text-white shadow-2xs'
                      : 'bg-amber-50/70 border-amber-200/80 text-amber-800 dark:bg-amber-950/30 dark:border-amber-900/60 dark:text-amber-300 hover:bg-amber-100'
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  <span>Con Devolución ({countDevueltos})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setProductQuickFilter('FALTANTES')}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 shrink-0 border',
                    productQuickFilter === 'FALTANTES'
                      ? 'bg-rose-600 border-rose-600 text-white shadow-2xs'
                      : 'bg-rose-50/70 border-rose-200/80 text-rose-800 dark:bg-rose-950/30 dark:border-rose-900/60 dark:text-rose-300 hover:bg-rose-100'
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                  <span>Con Faltantes ({countFaltantes})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setProductQuickFilter('ENTREGADOS')}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 shrink-0 border',
                    productQuickFilter === 'ENTREGADOS'
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-2xs'
                      : 'bg-emerald-50/70 border-emerald-200/80 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-900/60 dark:text-emerald-300 hover:bg-emerald-100'
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span>100% Entregados ({countEntregados})</span>
                </button>
              </div>
            </div>

            {/* Contenedor de la Tabla con Altura Estrictamente Fija (380px) y Scroll Interno */}
            <div
              style={{ height: '380px', maxHeight: '380px', minHeight: '380px' }}
              className="overflow-y-auto overflow-x-auto relative border-b border-slate-100 dark:border-slate-800 shrink-0"
            >
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700 text-[11px] select-none shadow-xs">
                  <tr>
                    {/* Código */}
                    <th
                      onClick={() => handleProductSort('codigo')}
                      className="py-2.5 px-3 cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition-colors group"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Código</span>
                        {renderProductSortIcon('codigo')}
                      </div>
                    </th>

                    {/* Descripción */}
                    <th
                      onClick={() => handleProductSort('producto')}
                      className="py-2.5 px-3 min-w-[240px] cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition-colors group"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Descripción del Producto</span>
                        {renderProductSortIcon('producto')}
                      </div>
                    </th>

                    {/* U.M. */}
                    <th
                      onClick={() => handleProductSort('um')}
                      className="py-2.5 px-2 text-center cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition-colors group"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>U.M.</span>
                        {renderProductSortIcon('um')}
                      </div>
                    </th>

                    {/* Despacho */}
                    <th
                      onClick={() => handleProductSort('cantidadDespacho')}
                      className="py-2.5 px-2 text-right bg-blue-50/70 dark:bg-blue-950/30 cursor-pointer hover:bg-blue-100/70 transition-colors group"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Despacho</span>
                        {renderProductSortIcon('cantidadDespacho')}
                      </div>
                    </th>

                    {/* Bono */}
                    <th
                      onClick={() => handleProductSort('cantidadBonificacion')}
                      className="py-2.5 px-2 text-right cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition-colors group"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Bono</span>
                        {renderProductSortIcon('cantidadBonificacion')}
                      </div>
                    </th>

                    {/* CANT. DEVUELTA (INPUT MEJORADO) */}
                    <th
                      onClick={() => handleProductSort('cantidadDevuelto')}
                      className="py-2.5 px-3 text-center bg-amber-50 dark:bg-amber-950/40 w-36 cursor-pointer hover:bg-amber-100/80 transition-colors group"
                    >
                      <div className="flex items-center justify-center gap-1 text-amber-900 dark:text-amber-300 font-bold">
                        <span>Cant. Devuelta</span>
                        {renderProductSortIcon('cantidadDevuelto')}
                      </div>
                    </th>

                    {/* CANT. FALTANTE (INPUT MEJORADO) */}
                    <th
                      onClick={() => handleProductSort('cantidadFaltante')}
                      className="py-2.5 px-3 text-center bg-rose-50 dark:bg-rose-950/40 w-36 cursor-pointer hover:bg-rose-100/80 transition-colors group"
                    >
                      <div className="flex items-center justify-center gap-1 text-rose-900 dark:text-rose-300 font-bold">
                        <span>Cant. Faltante</span>
                        {renderProductSortIcon('cantidadFaltante')}
                      </div>
                    </th>

                    {/* Entregado Real */}
                    <th
                      onClick={() => handleProductSort('facturadoTotal')}
                      className="py-2.5 px-2 text-right bg-emerald-50/70 dark:bg-emerald-950/30 cursor-pointer hover:bg-emerald-100/70 transition-colors group"
                    >
                      <div className="flex items-center justify-end gap-1 text-emerald-900 dark:text-emerald-300 font-bold">
                        <span>Entregado</span>
                        {renderProductSortIcon('facturadoTotal')}
                      </div>
                    </th>

                    {/* Valor Facturado */}
                    <th
                      onClick={() => handleProductSort('valorFacturado')}
                      className="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition-colors group"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Valor Facturado</span>
                        {renderProductSortIcon('valorFacturado')}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {paginatedProducts.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-slate-400 italic">
                        No se encontraron productos que coincidan con la búsqueda o filtro aplicado.
                      </td>
                    </tr>
                  ) : (
                    paginatedProducts.map((item) => {
                      const hasDevuelto = item.cantidadDevuelto > 0
                      const hasFaltante = item.cantidadFaltante > 0

                      return (
                        <tr
                          key={item.codigo}
                          className={cn(
                            'transition-colors',
                            hasFaltante
                              ? 'bg-rose-50/30 dark:bg-rose-950/20 hover:bg-rose-50/60'
                              : hasDevuelto
                              ? 'bg-amber-50/30 dark:bg-amber-950/20 hover:bg-amber-50/60'
                              : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                          )}
                        >
                          {/* Código */}
                          <td className="py-2 px-3 font-mono font-bold text-slate-700 dark:text-slate-300">
                            {item.codigo}
                          </td>

                          {/* Descripción */}
                          <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100">
                            <div className="flex items-center gap-1.5">
                              <span>{item.producto}</span>
                              {hasDevuelto && (
                                <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                  Retorna {item.cantidadDevuelto}
                                </span>
                              )}
                              {hasFaltante && (
                                <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                                  Falta {item.cantidadFaltante}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* U.M. */}
                          <td className="py-2 px-2 text-center font-mono text-[10px] text-slate-500">
                            <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-semibold">
                              {item.um}
                            </span>
                          </td>

                          {/* Cant. Despacho */}
                          <td className="py-2 px-2 text-right font-mono font-bold text-blue-700 dark:text-blue-300 bg-blue-50/20 dark:bg-blue-950/10">
                            {item.cantidadDespacho}
                          </td>

                          {/* Bono */}
                          <td className="py-2 px-2 text-right font-mono text-slate-500 dark:text-slate-400">
                            {item.cantidadBonificacion > 0 ? item.cantidadBonificacion : '—'}
                          </td>

                          {/* ── STEPPER INPUT ERGONÓMICO: CANTIDAD DEVUELTA ── */}
                          <td className="py-1.5 px-3 bg-amber-50/40 dark:bg-amber-950/20">
                            <div className="flex items-center justify-center">
                              <div
                                className={cn(
                                  'flex items-center rounded-xl border p-1 transition-all shadow-2xs',
                                  hasDevuelto
                                    ? 'border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/50'
                                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                                )}
                              >
                                <button
                                  type="button"
                                  disabled={item.cantidadDevuelto <= 0}
                                  onClick={() =>
                                    handleUpdateDevuelto(item.codigo, item.cantidadDevuelto - 1)
                                  }
                                  className="h-7.5 w-7.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed font-bold flex items-center justify-center cursor-pointer text-slate-700 dark:text-slate-300 transition-colors"
                                >
                                  <Minus className="h-3.5 w-3.5" />
                                </button>

                                <input
                                  type="number"
                                  min={0}
                                  max={item.cantidadDespacho}
                                  value={item.cantidadDevuelto === 0 ? '0' : item.cantidadDevuelto}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) =>
                                    handleUpdateDevuelto(item.codigo, parseInt(e.target.value) || 0)
                                  }
                                  className={cn(
                                    'h-7.5 w-14 border-0 bg-transparent text-center font-mono font-bold text-xs focus:outline-none focus:ring-0',
                                    hasDevuelto
                                      ? 'text-amber-800 dark:text-amber-300 font-extrabold'
                                      : 'text-slate-400'
                                  )}
                                />

                                <button
                                  type="button"
                                  disabled={
                                    item.cantidadDevuelto >=
                                    item.cantidadDespacho - (item.cantidadFaltante || 0)
                                  }
                                  onClick={() =>
                                    handleUpdateDevuelto(item.codigo, item.cantidadDevuelto + 1)
                                  }
                                  className="h-7.5 w-7.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed font-bold flex items-center justify-center cursor-pointer text-slate-700 dark:text-slate-300 transition-colors"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </td>

                          {/* ── STEPPER INPUT ERGONÓMICO: CANTIDAD FALTANTE ── */}
                          <td className="py-1.5 px-3 bg-rose-50/40 dark:bg-rose-950/20">
                            <div className="flex items-center justify-center">
                              <div
                                className={cn(
                                  'flex items-center rounded-xl border p-1 transition-all shadow-2xs',
                                  hasFaltante
                                    ? 'border-rose-400 bg-rose-50 dark:border-rose-700 dark:bg-rose-950/50'
                                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                                )}
                              >
                                <button
                                  type="button"
                                  disabled={item.cantidadFaltante <= 0}
                                  onClick={() =>
                                    handleUpdateFaltante(item.codigo, item.cantidadFaltante - 1)
                                  }
                                  className="h-7.5 w-7.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed font-bold flex items-center justify-center cursor-pointer text-slate-700 dark:text-slate-300 transition-colors"
                                >
                                  <Minus className="h-3.5 w-3.5" />
                                </button>

                                <input
                                  type="number"
                                  min={0}
                                  max={item.cantidadDespacho}
                                  value={item.cantidadFaltante === 0 ? '0' : item.cantidadFaltante}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) =>
                                    handleUpdateFaltante(item.codigo, parseInt(e.target.value) || 0)
                                  }
                                  className={cn(
                                    'h-7.5 w-14 border-0 bg-transparent text-center font-mono font-bold text-xs focus:outline-none focus:ring-0',
                                    hasFaltante
                                      ? 'text-rose-800 dark:text-rose-300 font-extrabold'
                                      : 'text-slate-400'
                                  )}
                                />

                                <button
                                  type="button"
                                  disabled={
                                    item.cantidadFaltante >=
                                    item.cantidadDespacho - (item.cantidadDevuelto || 0)
                                  }
                                  onClick={() =>
                                    handleUpdateFaltante(item.codigo, item.cantidadFaltante + 1)
                                  }
                                  className="h-7.5 w-7.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed font-bold flex items-center justify-center cursor-pointer text-slate-700 dark:text-slate-300 transition-colors"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </td>

                          {/* Entregado Real */}
                          <td className="py-2 px-2 text-right font-mono font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50/20 dark:bg-emerald-950/10">
                            {item.facturadoTotal}
                          </td>

                          {/* Valor Facturado */}
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                            Bs {item.valorFacturado.toFixed(2)}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* ── PIE DE TABLA: CONTROLES DE PAGINACIÓN DE PRODUCTOS ── */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400 shrink-0">
              <div>
                Mostrando <strong className="text-slate-800 dark:text-slate-200">{productStartIndex}</strong> a{' '}
                <strong className="text-slate-800 dark:text-slate-200">{productEndIndex}</strong> de{' '}
                <strong className="text-slate-800 dark:text-slate-200">{totalProductItems}</strong> productos
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px]">Productos por página:</span>
                <select
                  value={productPageSize}
                  onChange={(e) => setProductPageSize(Number(e.target.value))}
                  className="h-7 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs px-2 text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
                >
                  <option value={10}>10 por pág.</option>
                  <option value={20}>20 por pág.</option>
                  <option value={50}>50 por pág.</option>
                  <option value={0}>Todos ({almacenItems.length})</option>
                </select>
              </div>

              {productPageSize > 0 && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={productCurrentPage === 1}
                    onClick={() => setProductCurrentPage(1)}
                    className="h-7 w-7 text-xs cursor-pointer disabled:opacity-40"
                    title="Primera página"
                  >
                    <ChevronsLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={productCurrentPage === 1}
                    onClick={() => setProductCurrentPage((p) => Math.max(1, p - 1))}
                    className="h-7 w-7 text-xs cursor-pointer disabled:opacity-40"
                    title="Página anterior"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>

                  <span className="px-2 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    Página {productCurrentPage} de {totalProductPages}
                  </span>

                  <Button
                    variant="outline"
                    size="icon"
                    disabled={productCurrentPage === totalProductPages}
                    onClick={() => setProductCurrentPage((p) => Math.min(totalProductPages, p + 1))}
                    className="h-7 w-7 text-xs cursor-pointer disabled:opacity-40"
                    title="Página siguiente"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={productCurrentPage === totalProductPages}
                    onClick={() => setProductCurrentPage(totalProductPages)}
                    className="h-7 w-7 text-xs cursor-pointer disabled:opacity-40"
                    title="Última página"
                  >
                    <ChevronsRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Navegación a Cobranzas */}
        </TabsContent>

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* CONTENIDO TAB 2: CIERRE DE COBRANZAS (DATOS REGISTRADOS EN MÓVIL)     */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="cobranza" className="space-y-3">
          {/* 4 Tarjetas de Resumen Financiero en Vivo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* 1. Facturado Esperado */}
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase text-slate-500">
                  Total Facturado Esperado
                </span>
                <Receipt className="h-4 w-4 text-slate-400" />
              </div>
              <div className="mt-1 text-xl font-bold font-mono text-slate-900 dark:text-slate-100">
                Bs {importeFacturadoEsperado.toFixed(2)}
              </div>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                Sincronizado con entregas de almacén
              </span>
            </div>

            {/* 2. Efectivo Físico Arqueado */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5 shadow-xs dark:border-emerald-900/60 dark:bg-emerald-950/20">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300">
                  Efectivo Físico (Billetaje)
                </span>
                <Banknote className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="mt-1 text-xl font-bold font-mono text-emerald-700 dark:text-emerald-300">
                Bs {totalEfectivoCortes.toFixed(2)}
              </div>
              <span className="text-[11px] text-emerald-600/80 dark:text-emerald-400 block mt-0.5">
                Billetes ({totalBilletes.toFixed(2)}) + Monedas ({totalMonedas.toFixed(2)})
              </span>
            </div>

            {/* 3. Transferencias, QR y Cheques */}
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3.5 shadow-xs dark:border-indigo-900/60 dark:bg-indigo-950/20">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase text-indigo-700 dark:text-indigo-300">
                  Transferencias, QR y Cheques
                </span>
                <Landmark className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="mt-1 text-xl font-bold font-mono text-indigo-700 dark:text-indigo-300">
                Bs {totalDigitalesBancarios.toFixed(2)}
              </div>
              <span className="text-[11px] text-indigo-600/80 dark:text-indigo-400 block mt-0.5">
                3 Medios bancarios y digitales
              </span>
            </div>

            {/* 4. Semáforo de Cuadre / Estado de Liquidación */}
            <div
              className={cn(
                'rounded-xl border p-3.5 shadow-xs transition-all',
                isCuadradoCobranza
                  ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100'
                  : isFaltanteCobranza
                  ? 'border-rose-400 bg-rose-50/90 dark:border-rose-900 dark:bg-rose-950/50 text-rose-950 dark:text-rose-100'
                  : 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100'
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  Estado de Liquidación
                </span>
                {isCuadradoCobranza ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-rose-600 animate-pulse" />
                )}
              </div>
              <div className="mt-1 text-xl font-bold font-mono">
                {isCuadradoCobranza
                  ? '100% Cuadrado'
                  : isFaltanteCobranza
                  ? `- Bs ${Math.abs(diferenciaCuadre).toFixed(2)} (Faltante)`
                  : `+ Bs ${diferenciaCuadre.toFixed(2)} (Sobrante)`}
              </div>
              <span className="text-[11px] block mt-0.5 opacity-80">
                {isCuadradoCobranza
                  ? 'Liquidación conforme y sin diferencias'
                  : 'Valores registrados con diferencia respecto al almacén'}
              </span>
            </div>
          </div>

          {/* GRID PRINCIPAL: 50% ARQUEO DE EFECTIVO vs 50% GRILLA 2x2 DE 4 MÉTODOS DE PAGO */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start w-full">
            {/* ════ LADO IZQUIERDO: ARQUEO DE EFECTIVO FÍSICO REGISTRADO EN MÓVIL ════ */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3 w-full">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <Banknote className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                      Arqueo de Efectivo Físico
                    </h3>
                    <span className="text-[10.5px] text-slate-400 block">Registrado desde el aplicativo móvil</span>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 font-mono font-bold text-xs py-0.5 px-2.5"
                >
                  Bs {totalEfectivoCortes.toFixed(2)}
                </Badge>
              </div>

              {/* Sub-secciones de Billetes y Monedas en 2 columnas internas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Billetes */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-[11px] font-bold uppercase text-slate-500">Billetes</span>
                    <span className="text-[10.5px] font-mono font-bold text-indigo-700 dark:text-indigo-300">
                      Bs {totalBilletes.toFixed(2)}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {cortes
                      .filter((c) => c.tipo === 'BILLETE')
                      .map((c) => (
                        <div
                          key={c.denominacion}
                          className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 text-xs"
                        >
                          <span className="w-14 font-bold text-slate-800 dark:text-slate-200">
                            {c.denominacion}
                          </span>
                          <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                            x {c.cantidad} {c.cantidad === 1 ? 'ud' : 'uds'}
                          </span>
                          <span className="w-16 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                            Bs {c.monto.toFixed(2)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Monedas */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-[11px] font-bold uppercase text-slate-500">Monedas</span>
                    <span className="text-[10.5px] font-mono font-bold text-amber-700 dark:text-amber-300">
                      Bs {totalMonedas.toFixed(2)}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {cortes
                      .filter((c) => c.tipo === 'MONEDA')
                      .map((c) => (
                        <div
                          key={c.denominacion}
                          className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 text-xs"
                        >
                          <span className="w-14 font-bold text-slate-800 dark:text-slate-200">
                            {c.denominacion}
                          </span>
                          <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                            x {c.cantidad} {c.cantidad === 1 ? 'ud' : 'uds'}
                          </span>
                          <span className="w-16 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                            Bs {c.monto.toFixed(2)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              {/* Pie del arqueo */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-500 font-semibold">Total Efectivo Físico Arqueado:</span>
                <span className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400">
                  Bs {totalEfectivoCortes.toFixed(2)}
                </span>
              </div>
            </div>

            {/* ════ LADO DERECHO: 4 TARJETAS DE MÉTODOS DE PAGO EN GRILLA 2x2 (COMPACTO - SOLO TOTALES) ════ */}
            {/* ════ LADO DERECHO: 4 TARJETAS DE MÉTODOS DE PAGO EN GRILLA 2x2 (CON BOTÓN VER DETALLE) ════ */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3.5 w-full flex flex-col justify-between">
              {/* Cabecera Principal */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <Banknote className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                      Medios de Pago y Cobranza
                    </h3>
                    <span className="text-[10.5px] text-slate-400 block">Totales consolidados de los 4 medios de pago en ruta</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <Badge
                    variant="outline"
                    className="border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300 font-mono font-bold text-xs py-0.5 px-2.5"
                  >
                    Total: Bs {totalCobranzaChofer.toFixed(2)}
                  </Badge>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAbrirDetalleModal('ALL')}
                    className="h-7 text-[11px] px-2.5 rounded-lg border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 cursor-pointer flex items-center gap-1.5 font-semibold"
                    title="Ver todas las facturas consolidadas"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>Ver Facturas ({todasLasFacturas.length})</span>
                  </Button>
                </div>
              </div>

              {/* GRILLA CUADRADA DE 2x2 CON LAS 4 TARJETAS Y SU BOTÓN DE VER DETALLE */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-auto">
                {/* ── TARJETA 1: EFECTIVO ── */}
                <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/70 to-emerald-50/20 dark:border-emerald-900/60 dark:from-emerald-950/30 dark:to-slate-900 p-3.5 flex flex-col justify-between space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                        <Banknote className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">1. Efectivo</h4>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {cortes.reduce((acc, c) => acc + c.cantidad, 0)} unidades arqueadas
                        </span>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-bold border-emerald-200 text-emerald-700 bg-white/80 dark:bg-slate-900/80">
                      En Arqueo
                    </Badge>
                  </div>
                  <div className="pt-0.5">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Total Recaudado</span>
                    <span className="text-xl font-bold font-mono text-emerald-700 dark:text-emerald-300 block mt-0.5">
                      Bs {totalEfectivoCortes.toFixed(2)}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAbrirDetalleModal('EFECTIVO')}
                    className="w-full h-8 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:text-emerald-800 dark:hover:text-emerald-200 bg-white/80 hover:bg-white dark:bg-slate-900/60 dark:hover:bg-slate-900 border-emerald-200/90 dark:border-emerald-800/80 rounded-xl flex items-center justify-between px-3 cursor-pointer shadow-2xs transition-all hover:border-emerald-400 group"
                  >
                    <span className="flex items-center gap-1.5">
                      <Eye className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Ver Detalle ({facturasEfectivo.length} facturas)</span>
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 text-emerald-600 dark:text-emerald-400" />
                  </Button>
                </div>

                {/* ── TARJETA 2: TRANSFERENCIAS BANCARIAS ACH ── */}
                <div className="rounded-2xl border border-blue-200/80 bg-gradient-to-br from-blue-50/70 to-blue-50/20 dark:border-blue-900/60 dark:from-blue-950/30 dark:to-slate-900 p-3.5 flex flex-col justify-between space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                        <Landmark className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">2. Transferencias ACH</h4>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {transferencias.length} {transferencias.length === 1 ? 'operación' : 'operaciones'}
                        </span>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-bold border-blue-200 text-blue-700 bg-white/80 dark:bg-slate-900/80">
                      En BD
                    </Badge>
                  </div>
                  <div className="pt-0.5">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Total Recaudado</span>
                    <span className="text-xl font-bold font-mono text-blue-700 dark:text-blue-300 block mt-0.5">
                      Bs {totalTransferencias.toFixed(2)}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAbrirDetalleModal('TRANSFERENCIA')}
                    className="w-full h-8 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-200 bg-white/80 hover:bg-white dark:bg-slate-900/60 dark:hover:bg-slate-900 border-blue-200/90 dark:border-blue-800/80 rounded-xl flex items-center justify-between px-3 cursor-pointer shadow-2xs transition-all hover:border-blue-400 group"
                  >
                    <span className="flex items-center gap-1.5">
                      <Eye className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Ver Detalle ({transferencias.length} {transferencias.length === 1 ? 'transacción' : 'transacciones'})</span>
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 text-blue-600 dark:text-blue-400" />
                  </Button>
                </div>

                {/* ── TARJETA 3: PAGOS QR SIMPLE ── */}
                <div className="rounded-2xl border border-purple-200/80 bg-gradient-to-br from-purple-50/70 to-purple-50/20 dark:border-purple-900/60 dark:from-purple-950/30 dark:to-slate-900 p-3.5 flex flex-col justify-between space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300">
                        <QrCode className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">3. Pagos QR Simple</h4>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {pagosQr.length} {pagosQr.length === 1 ? 'cobro QR' : 'cobros QR'}
                        </span>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-bold border-purple-200 text-purple-700 bg-white/80 dark:bg-slate-900/80">
                      En BD
                    </Badge>
                  </div>
                  <div className="pt-0.5">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Total Recaudado</span>
                    <span className="text-xl font-bold font-mono text-purple-700 dark:text-purple-300 block mt-0.5">
                      Bs {totalQr.toFixed(2)}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAbrirDetalleModal('QR')}
                    className="w-full h-8 text-xs font-semibold text-purple-700 dark:text-purple-300 hover:text-purple-800 dark:hover:text-purple-200 bg-white/80 hover:bg-white dark:bg-slate-900/60 dark:hover:bg-slate-900 border-purple-200/90 dark:border-purple-800/80 rounded-xl flex items-center justify-between px-3 cursor-pointer shadow-2xs transition-all hover:border-purple-400 group"
                  >
                    <span className="flex items-center gap-1.5">
                      <Eye className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                      <span>Ver Detalle ({pagosQr.length} {pagosQr.length === 1 ? 'cobro QR' : 'cobros QR'})</span>
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 text-purple-600 dark:text-purple-400" />
                  </Button>
                </div>

                {/* ── TARJETA 4: CHEQUES BANCARIOS ── */}
                <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/70 to-amber-50/20 dark:border-amber-900/60 dark:from-amber-950/30 dark:to-slate-900 p-3.5 flex flex-col justify-between space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300">
                        <CreditCard className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">4. Cheques Bancarios</h4>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {cheques.length} {cheques.length === 1 ? 'cheque' : 'cheques'}
                        </span>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-bold border-amber-200 text-amber-700 bg-white/80 dark:bg-slate-900/80">
                      En BD
                    </Badge>
                  </div>
                  <div className="pt-0.5">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Total Recaudado</span>
                    <span className="text-xl font-bold font-mono text-amber-700 dark:text-amber-300 block mt-0.5">
                      Bs {totalCheques.toFixed(2)}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAbrirDetalleModal('CHEQUE')}
                    className="w-full h-8 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200 bg-white/80 hover:bg-white dark:bg-slate-900/60 dark:hover:bg-slate-900 border-amber-200/90 dark:border-amber-800/80 rounded-xl flex items-center justify-between px-3 cursor-pointer shadow-2xs transition-all hover:border-amber-400 group"
                  >
                    <span className="flex items-center gap-1.5">
                      <Eye className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                      <span>Ver Detalle ({cheques.length} {cheques.length === 1 ? 'cheque' : 'cheques'})</span>
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 text-amber-600 dark:text-amber-400" />
                  </Button>
                </div>
              </div>

              {/* Pie con resumen de los 4 medios de pago */}
              <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-500 font-semibold">Total Cobranza de la Ruta (4 Medios):</span>
                <span className="font-mono font-bold text-sm text-indigo-700 dark:text-indigo-300">
                  Bs {totalCobranzaChofer.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* ── MODAL DE DETALLE DE MEDIOS DE PAGO Y FACTURAS ASOCIADAS ──       */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      <Dialog open={showDetalleModal} onOpenChange={setShowDetalleModal}>
        <DialogContent className="flex h-[88vh] max-h-[92vh] w-[min(1420px,calc(100vw-2rem))] max-w-none sm:max-w-none flex-col gap-0 overflow-hidden p-0 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl">
          {/* Header del Modal */}
          <DialogHeader className="p-4 pb-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 shrink-0">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pr-6">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-xs shrink-0',
                    detalleMetodoActivo === 'EFECTIVO'
                      ? 'bg-emerald-600'
                      : detalleMetodoActivo === 'TRANSFERENCIA'
                      ? 'bg-blue-600'
                      : detalleMetodoActivo === 'QR'
                      ? 'bg-purple-600'
                      : detalleMetodoActivo === 'CHEQUE'
                      ? 'bg-amber-600'
                      : 'bg-indigo-600'
                  )}
                >
                  {detalleMetodoActivo === 'EFECTIVO' && <Banknote className="h-5 w-5" />}
                  {detalleMetodoActivo === 'TRANSFERENCIA' && <Landmark className="h-5 w-5" />}
                  {detalleMetodoActivo === 'QR' && <QrCode className="h-5 w-5" />}
                  {detalleMetodoActivo === 'CHEQUE' && <CreditCard className="h-5 w-5" />}
                  {detalleMetodoActivo === 'ALL' && <Receipt className="h-5 w-5" />}
                </div>

                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <DialogTitle className="text-base md:text-lg font-bold text-slate-900 dark:text-slate-100">
                      {detalleMetodoActivo === 'EFECTIVO' && 'Detalle de Facturas Cobradas en Efectivo'}
                      {detalleMetodoActivo === 'TRANSFERENCIA' && 'Detalle de Facturas Pagadas por Transferencia ACH'}
                      {detalleMetodoActivo === 'QR' && 'Detalle de Facturas Pagadas por QR Simple'}
                      {detalleMetodoActivo === 'CHEQUE' && 'Detalle de Facturas con Cheques Bancarios'}
                      {detalleMetodoActivo === 'ALL' && 'Detalle Consolidado de Facturas por Medio de Pago'}
                    </DialogTitle>
                    <Badge variant="outline" className="text-xs font-mono font-bold px-2 py-0.5 border-slate-300">
                      OT #{cierre.orderCode}
                    </Badge>
                  </div>
                  <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Chofer: <strong>{cierre.driverName}</strong> ({cierre.driverEmpresa}) • Placa: <strong>{cierre.truckPlate}</strong> • Ruta: <strong>{cierre.routeName}</strong>
                  </DialogDescription>
                </div>
              </div>

              {/* Badges de Montos en el Header */}
              <div className="flex items-center gap-2 self-start md:self-auto font-mono text-xs">
                <div className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                  <span className="text-[10px] text-slate-400 block font-sans uppercase font-bold tracking-wider">
                    Total Ruta
                  </span>
                  <strong className="text-slate-900 dark:text-slate-100 text-sm">
                    Bs {totalCobranzaChofer.toFixed(2)}
                  </strong>
                </div>

                <div
                  className={cn(
                    'px-3 py-1.5 rounded-xl border text-xs',
                    detalleMetodoActivo === 'EFECTIVO'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                      : detalleMetodoActivo === 'TRANSFERENCIA'
                      ? 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'
                      : detalleMetodoActivo === 'QR'
                      ? 'bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800'
                      : detalleMetodoActivo === 'CHEQUE'
                      ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                      : 'bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800'
                  )}
                >
                  <span className="text-[10px] block font-sans uppercase font-bold tracking-wider opacity-80">
                    Subtotal Seleccionado
                  </span>
                  <strong className="text-sm">
                    Bs{' '}
                    {(
                      detalleMetodoActivo === 'EFECTIVO'
                        ? totalEfectivoCortes
                        : detalleMetodoActivo === 'TRANSFERENCIA'
                        ? totalTransferencias
                        : detalleMetodoActivo === 'QR'
                        ? totalQr
                        : detalleMetodoActivo === 'CHEQUE'
                        ? totalCheques
                        : totalCobranzaChofer
                    ).toFixed(2)}
                  </strong>
                </div>
              </div>
            </div>
          </DialogHeader>

          {/* Barra de Filtros y Buscador */}
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col md:flex-row md:items-center justify-between gap-2.5 shrink-0">
            {/* Tabs de Medios de Pago */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setDetalleMetodoActivo('ALL')}
                className={cn(
                  'px-3 py-1.5 rounded-xl font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5',
                  detalleMetodoActivo === 'ALL'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                )}
              >
                <Receipt className="h-3.5 w-3.5" />
                <span>Todos los Medios ({todasLasFacturas.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setDetalleMetodoActivo('EFECTIVO')}
                className={cn(
                  'px-3 py-1.5 rounded-xl font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5',
                  detalleMetodoActivo === 'EFECTIVO'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                )}
              >
                <Banknote className="h-3.5 w-3.5" />
                <span>Efectivo ({facturasEfectivo.length})</span>
                <span className="font-mono text-[10px] opacity-80">Bs {totalEfectivoCortes.toFixed(2)}</span>
              </button>

              <button
                type="button"
                onClick={() => setDetalleMetodoActivo('TRANSFERENCIA')}
                className={cn(
                  'px-3 py-1.5 rounded-xl font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5',
                  detalleMetodoActivo === 'TRANSFERENCIA'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                )}
              >
                <Landmark className="h-3.5 w-3.5" />
                <span>Transferencias ({transferencias.length})</span>
                <span className="font-mono text-[10px] opacity-80">Bs {totalTransferencias.toFixed(2)}</span>
              </button>

              <button
                type="button"
                onClick={() => setDetalleMetodoActivo('QR')}
                className={cn(
                  'px-3 py-1.5 rounded-xl font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5',
                  detalleMetodoActivo === 'QR'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                )}
              >
                <QrCode className="h-3.5 w-3.5" />
                <span>QR ({pagosQr.length})</span>
                <span className="font-mono text-[10px] opacity-80">Bs {totalQr.toFixed(2)}</span>
              </button>

              <button
                type="button"
                onClick={() => setDetalleMetodoActivo('CHEQUE')}
                className={cn(
                  'px-3 py-1.5 rounded-xl font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5',
                  detalleMetodoActivo === 'CHEQUE'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                )}
              >
                <CreditCard className="h-3.5 w-3.5" />
                <span>Cheques ({cheques.length})</span>
                <span className="font-mono text-[10px] opacity-80">Bs {totalCheques.toFixed(2)}</span>
              </button>
            </div>

            {/* Buscador en vivo */}
            <div className="relative w-full md:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-3.5 w-3.5" />
              <Input
                placeholder="Buscar factura, cliente, transacción o banco..."
                value={detalleSearchQuery}
                onChange={(e) => setDetalleSearchQuery(e.target.value)}
                className="h-8.5 pl-8.5 pr-7 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl"
              />
              {detalleSearchQuery && (
                <button
                  type="button"
                  onClick={() => setDetalleSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Sub-selector para Efectivo (Facturas vs Arqueo) */}
          {detalleMetodoActivo === 'EFECTIVO' && (
            <div className="px-4 py-2 bg-emerald-50/40 dark:bg-emerald-950/20 border-b border-emerald-100 dark:border-emerald-900/60 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-emerald-800 dark:text-emerald-300">Modo de visualización:</span>
                <div className="flex bg-white dark:bg-slate-800 p-0.5 rounded-lg border border-emerald-200/60 dark:border-emerald-800/60">
                  <button
                    type="button"
                    onClick={() => setEfectivoSubTab('FACTURAS')}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors',
                      efectivoSubTab === 'FACTURAS'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    )}
                  >
                    Facturas Cobradas ({filteredFacturasEfectivo.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setEfectivoSubTab('ARQUEO')}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors',
                      efectivoSubTab === 'ARQUEO'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    )}
                  >
                    Arqueo de Cortes (Billetes y Monedas)
                  </button>
                </div>
              </div>
              <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono hidden sm:inline">
                {cortes.reduce((acc, c) => acc + c.cantidad, 0)} piezas arqueadas en total
              </span>
            </div>
          )}

          {/* Cuerpo con Scroll para las Tablas */}
          <div className="flex-1 overflow-x-auto overflow-y-auto p-4 space-y-4">
            {/* 1. VISTA TRANSFERENCIAS ACH */}
            {detalleMetodoActivo === 'TRANSFERENCIA' && (
              <div className="rounded-xl border border-blue-200/80 bg-white dark:bg-slate-900 dark:border-blue-900/60 shadow-xs overflow-hidden">
                <div className="p-3 bg-blue-50/60 dark:bg-blue-950/30 border-b border-blue-100 dark:border-blue-900/60 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
                      <Landmark className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                        Transferencias Bancarias Interbancarias (ACH)
                      </h4>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Comprobantes bancarios verificados con extracto oficial
                      </span>
                    </div>
                  </div>
                  <Badge variant="outline" className="font-mono font-bold text-blue-700 bg-blue-50 border-blue-300 dark:bg-blue-950 dark:text-blue-300 text-xs py-0.5 px-2.5">
                    Subtotal: Bs {subtotalFilteredTransferencias.toFixed(2)}
                  </Badge>
                </div>

                {filteredTransferencias.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    No se encontraron transferencias que coincidan con la búsqueda.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300 uppercase tracking-tight">
                          <th className="py-2 px-3">N° Factura</th>
                          <th className="py-2 px-3">N° Transacción ACH</th>
                          <th className="py-2 px-3">Banco Emisor</th>
                          <th className="py-2 px-3">Cliente / Razón Social</th>
                          <th className="py-2 px-3">Fecha / Hora</th>
                          <th className="py-2 px-3 text-right font-bold text-blue-700 dark:text-blue-300">Monto Transferido (Bs)</th>
                          <th className="py-2 px-3 text-center">Estado Conciliación</th>
                          <th className="py-2 px-3">Cuenta Destino</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono dark:divide-slate-800/60 text-xs">
                        {filteredTransferencias.map((t, idx) => (
                          <tr key={t.transaccion + idx} className="hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors">
                            <td className="py-2 px-3 font-bold text-slate-900 dark:text-slate-100">
                              <Badge variant="outline" className="font-mono text-[11px] border-slate-300 dark:border-slate-700">
                                {t.factura || `FAC-${cierre.orderCode.slice(-4)}-TR${idx + 1}`}
                              </Badge>
                            </td>
                            <td className="py-2 px-3 font-bold text-blue-700 dark:text-blue-300">
                              {t.transaccion}
                            </td>
                            <td className="py-2 px-3 font-sans font-medium text-slate-800 dark:text-slate-200">
                              <div className="flex items-center gap-1.5">
                                <Landmark className="h-3 w-3 text-blue-600 shrink-0" />
                                <span>{t.banco}</span>
                              </div>
                            </td>
                            <td className="py-2 px-3 font-sans">
                              <div className="font-semibold text-slate-900 dark:text-slate-100">{t.clienteNombre}</div>
                              <div className="text-[10px] text-slate-500 font-mono">Cód: {t.clienteCodigo}</div>
                            </td>
                            <td className="py-2 px-3 text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                              {t.fechaHora || '10:30 AM'}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-sm text-blue-700 dark:text-blue-300">
                              Bs {t.monto.toFixed(2)}
                            </td>
                            <td className="py-2 px-3 text-center font-sans">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                <CheckCircle2 className="h-3 w-3" />
                                {t.estado || 'Conciliado con Extracto'}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-[10px] text-slate-500 font-mono font-sans">
                              {t.cuentaDestino || 'Cta. Recaudadora BCP #201-5092182'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-300 font-mono font-bold text-xs bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40 text-slate-900 dark:text-slate-100">
                          <td colSpan={5} className="py-2 px-3 uppercase font-sans tracking-wider text-[11px]">
                            Total Transferencias ({filteredTransferencias.length} transacciones)
                          </td>
                          <td className="py-2 px-3 text-right text-blue-700 dark:text-blue-300 font-bold text-sm">
                            Bs {subtotalFilteredTransferencias.toFixed(2)}
                          </td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* 2. VISTA PAGOS QR SIMPLE */}
            {detalleMetodoActivo === 'QR' && (
              <div className="rounded-xl border border-purple-200/80 bg-white dark:bg-slate-900 dark:border-purple-900/60 shadow-xs overflow-hidden">
                <div className="p-3 bg-purple-50/60 dark:bg-purple-950/30 border-b border-purple-100 dark:border-purple-900/60 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300">
                      <QrCode className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                        Pagos QR Simple / Interoperables
                      </h4>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Cobros inmediatos validados en tiempo real mediante código QR
                      </span>
                    </div>
                  </div>
                  <Badge variant="outline" className="font-mono font-bold text-purple-700 bg-purple-50 border-purple-300 dark:bg-purple-950 dark:text-purple-300 text-xs py-0.5 px-2.5">
                    Subtotal: Bs {subtotalFilteredPagosQr.toFixed(2)}
                  </Badge>
                </div>

                {filteredPagosQr.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    No se encontraron pagos QR que coincidan con la búsqueda.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300 uppercase tracking-tight">
                          <th className="py-2 px-3">N° Factura</th>
                          <th className="py-2 px-3">N° Transacción QR</th>
                          <th className="py-2 px-3">Entidad Bancaria / Pasarela</th>
                          <th className="py-2 px-3">Cliente / Razón Social</th>
                          <th className="py-2 px-3">Fecha / Hora</th>
                          <th className="py-2 px-3 text-right font-bold text-purple-700 dark:text-purple-300">Monto Cobrado (Bs)</th>
                          <th className="py-2 px-3 text-center">Estado Pasarela</th>
                          <th className="py-2 px-3">Referencia QR</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono dark:divide-slate-800/60 text-xs">
                        {filteredPagosQr.map((q, idx) => (
                          <tr key={q.transaccion + idx} className="hover:bg-purple-50/40 dark:hover:bg-purple-950/20 transition-colors">
                            <td className="py-2 px-3 font-bold text-slate-900 dark:text-slate-100">
                              <Badge variant="outline" className="font-mono text-[11px] border-slate-300 dark:border-slate-700">
                                {q.factura || `FAC-${cierre.orderCode.slice(-4)}-QR${idx + 1}`}
                              </Badge>
                            </td>
                            <td className="py-2 px-3 font-bold text-purple-700 dark:text-purple-300">
                              {q.transaccion}
                            </td>
                            <td className="py-2 px-3 font-sans font-medium text-slate-800 dark:text-slate-200">
                              <div className="flex items-center gap-1.5">
                                <QrCode className="h-3 w-3 text-purple-600 shrink-0" />
                                <span>{q.banco}</span>
                              </div>
                            </td>
                            <td className="py-2 px-3 font-sans">
                              <div className="font-semibold text-slate-900 dark:text-slate-100">{q.clienteNombre}</div>
                              <div className="text-[10px] text-slate-500 font-mono">Cód: {q.clienteCodigo}</div>
                            </td>
                            <td className="py-2 px-3 text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                              {q.fechaHora || '11:15 AM'}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-sm text-purple-700 dark:text-purple-300">
                              Bs {q.monto.toFixed(2)}
                            </td>
                            <td className="py-2 px-3 text-center font-sans">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                <CheckCircle2 className="h-3 w-3" />
                                {q.estado || 'Validado en Pasarela'}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-[10px] text-slate-500 font-mono">
                              {q.referenciaQr || 'Red Enlace Simple'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-300 font-mono font-bold text-xs bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40 text-slate-900 dark:text-slate-100">
                          <td colSpan={5} className="py-2 px-3 uppercase font-sans tracking-wider text-[11px]">
                            Total Pagos QR ({filteredPagosQr.length} transacciones)
                          </td>
                          <td className="py-2 px-3 text-right text-purple-700 dark:text-purple-300 font-bold text-sm">
                            Bs {subtotalFilteredPagosQr.toFixed(2)}
                          </td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* 3. VISTA CHEQUES BANCARIOS */}
            {detalleMetodoActivo === 'CHEQUE' && (
              <div className="rounded-xl border border-amber-200/80 bg-white dark:bg-slate-900 dark:border-amber-900/60 shadow-xs overflow-hidden">
                <div className="p-3 bg-amber-50/60 dark:bg-amber-950/30 border-b border-amber-100 dark:border-amber-900/60 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
                      <CreditCard className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                        Cheques Bancarios Recibidos en Ruta
                      </h4>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Valores en cartera recibidos por el chofer para entrega en bóveda
                      </span>
                    </div>
                  </div>
                  <Badge variant="outline" className="font-mono font-bold text-amber-700 bg-amber-50 border-amber-300 dark:bg-amber-950 dark:text-amber-300 text-xs py-0.5 px-2.5">
                    Subtotal: Bs {subtotalFilteredCheques.toFixed(2)}
                  </Badge>
                </div>

                {filteredCheques.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    No se encontraron cheques que coincidan con la búsqueda.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300 uppercase tracking-tight">
                          <th className="py-2 px-3">N° Factura</th>
                          <th className="py-2 px-3">N° Cheque</th>
                          <th className="py-2 px-3">Banco Girador</th>
                          <th className="py-2 px-3">Cliente / Girador</th>
                          <th className="py-2 px-3">Fecha Emisión / Vencimiento</th>
                          <th className="py-2 px-3 text-right font-bold text-amber-700 dark:text-amber-300">Monto Cheque (Bs)</th>
                          <th className="py-2 px-3 text-center">Estado Custodia</th>
                          <th className="py-2 px-3">Tipo Cheque</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono dark:divide-slate-800/60 text-xs">
                        {filteredCheques.map((c, idx) => (
                          <tr key={c.nroCheque + idx} className="hover:bg-amber-50/40 dark:hover:bg-amber-950/20 transition-colors">
                            <td className="py-2 px-3 font-bold text-slate-900 dark:text-slate-100">
                              <Badge variant="outline" className="font-mono text-[11px] border-slate-300 dark:border-slate-700">
                                {c.factura || `FAC-${cierre.orderCode.slice(-4)}-CH${idx + 1}`}
                              </Badge>
                            </td>
                            <td className="py-2 px-3 font-bold text-amber-700 dark:text-amber-300">
                              {c.nroCheque}
                            </td>
                            <td className="py-2 px-3 font-sans font-medium text-slate-800 dark:text-slate-200">
                              <div className="flex items-center gap-1.5">
                                <CreditCard className="h-3 w-3 text-amber-600 shrink-0" />
                                <span>{c.banco}</span>
                              </div>
                            </td>
                            <td className="py-2 px-3 font-sans">
                              <div className="font-semibold text-slate-900 dark:text-slate-100">{c.clienteNombre}</div>
                              <div className="text-[10px] text-slate-500 font-mono">Cód: {c.clienteCodigo}</div>
                            </td>
                            <td className="py-2 px-3 text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                              {c.fechaCobro || cierre.dateFormatted}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-sm text-amber-700 dark:text-amber-300">
                              Bs {c.monto.toFixed(2)}
                            </td>
                            <td className="py-2 px-3 text-center font-sans">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                <CheckCircle2 className="h-3 w-3" />
                                {c.estado || 'Al Día / En Cartera'}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-[10px] text-slate-500 font-sans">
                              {c.tipoCheque || 'Al Día (Cobro Inmediato)'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-300 font-mono font-bold text-xs bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40 text-slate-900 dark:text-slate-100">
                          <td colSpan={5} className="py-2 px-3 uppercase font-sans tracking-wider text-[11px]">
                            Total Cheques ({filteredCheques.length} documentos)
                          </td>
                          <td className="py-2 px-3 text-right text-amber-700 dark:text-amber-300 font-bold text-sm">
                            Bs {subtotalFilteredCheques.toFixed(2)}
                          </td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* 4. VISTA EFECTIVO (FACTURAS COBRADAS O ARQUEO) */}
            {detalleMetodoActivo === 'EFECTIVO' && efectivoSubTab === 'FACTURAS' && (
              <div className="rounded-xl border border-emerald-200/80 bg-white dark:bg-slate-900 dark:border-emerald-900/60 shadow-xs overflow-hidden">
                <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/30 border-b border-emerald-100 dark:border-emerald-900/60 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      <Banknote className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                        Facturas Cobradas en Efectivo en Ruta
                      </h4>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Comprobantes y recibos cancelados en efectivo por clientes comerciales
                      </span>
                    </div>
                  </div>
                  <Badge variant="outline" className="font-mono font-bold text-emerald-700 bg-emerald-50 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 text-xs py-0.5 px-2.5">
                    Subtotal: Bs {subtotalFilteredEfectivo.toFixed(2)}
                  </Badge>
                </div>

                {filteredFacturasEfectivo.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    No se encontraron facturas en efectivo que coincidan con la búsqueda.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300 uppercase tracking-tight">
                          <th className="py-2 px-3">N° Factura</th>
                          <th className="py-2 px-3">N° Recibo Chofer</th>
                          <th className="py-2 px-3">Código Cliente</th>
                          <th className="py-2 px-3">Cliente / Razón Social</th>
                          <th className="py-2 px-3">Hora de Cobro</th>
                          <th className="py-2 px-3 text-right font-bold text-emerald-700 dark:text-emerald-300">Monto Cobrado (Bs)</th>
                          <th className="py-2 px-3 text-center">Estado Recaudación</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono dark:divide-slate-800/60 text-xs">
                        {filteredFacturasEfectivo.map((f, idx) => (
                          <tr key={f.factura + idx} className="hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition-colors">
                            <td className="py-2 px-3 font-bold text-slate-900 dark:text-slate-100">
                              <Badge variant="outline" className="font-mono text-[11px] border-slate-300 dark:border-slate-700">
                                {f.factura}
                              </Badge>
                            </td>
                            <td className="py-2 px-3 font-bold text-slate-700 dark:text-slate-300">
                              {f.reciboChofer}
                            </td>
                            <td className="py-2 px-3 text-slate-500 font-mono text-[11px]">
                              {f.clienteCodigo}
                            </td>
                            <td className="py-2 px-3 font-sans font-semibold text-slate-900 dark:text-slate-100">
                              {f.clienteNombre}
                            </td>
                            <td className="py-2 px-3 text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                              {f.hora}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-sm text-emerald-700 dark:text-emerald-300">
                              Bs {f.monto.toFixed(2)}
                            </td>
                            <td className="py-2 px-3 text-center font-sans">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                <CheckCircle2 className="h-3 w-3" />
                                {f.estado}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-300 font-mono font-bold text-xs bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40 text-slate-900 dark:text-slate-100">
                          <td colSpan={5} className="py-2 px-3 uppercase font-sans tracking-wider text-[11px]">
                            Total Facturas en Efectivo ({filteredFacturasEfectivo.length} facturas)
                          </td>
                          <td className="py-2 px-3 text-right text-emerald-700 dark:text-emerald-300 font-bold text-sm">
                            Bs {subtotalFilteredEfectivo.toFixed(2)}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* 4.B VISTA EFECTIVO - ARQUEO FÍSICO DE CORTES */}
            {detalleMetodoActivo === 'EFECTIVO' && efectivoSubTab === 'ARQUEO' && (
              <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-xs overflow-hidden">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      <Coins className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                        Desglose Oficial de Cortes Arqueados en Bóveda
                      </h4>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        11 denominaciones oficiales de billetes y monedas nacionales
                      </span>
                    </div>
                  </div>
                  <Badge variant="outline" className="font-mono font-bold text-emerald-700 bg-emerald-50 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 text-xs py-0.5 px-2.5">
                    Total Arqueado: Bs {totalEfectivoCortes.toFixed(2)}
                  </Badge>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300 uppercase tracking-tight">
                        <th className="py-2 px-3">Denominación</th>
                        <th className="py-2 px-3 text-center">Tipo de Especie</th>
                        <th className="py-2 px-3 text-right">Cantidad de Piezas</th>
                        <th className="py-2 px-3 text-right font-bold text-emerald-700 dark:text-emerald-300">Subtotal Importe (Bs)</th>
                        <th className="py-2 px-3 text-center">Estado Verificación</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono dark:divide-slate-800/60 text-xs">
                      {cortes.map((c) => (
                        <tr key={c.denominacion} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-bold text-slate-900 dark:text-slate-100">
                            {c.denominacion}
                          </td>
                          <td className="py-2 px-3 text-center font-sans text-slate-500">
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-sans">
                              {c.tipo}
                            </Badge>
                          </td>
                          <td className="py-2 px-3 text-right font-semibold text-slate-800 dark:text-slate-200">
                            {c.cantidad} uds
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-emerald-700 dark:text-emerald-300">
                            Bs {c.monto.toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-center font-sans">
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-semibold">
                              <CheckCircle2 className="h-3 w-3" /> Contado y Verificado
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 font-mono font-bold text-xs bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40 text-slate-900 dark:text-slate-100">
                        <td colSpan={2} className="py-2 px-3 uppercase font-sans tracking-wider text-[11px]">
                          Total Efectivo Físico Arqueado
                        </td>
                        <td className="py-2 px-3 text-right font-bold">
                          {cortes.reduce((acc, c) => acc + c.cantidad, 0)} piezas
                        </td>
                        <td className="py-2 px-3 text-right text-emerald-700 dark:text-emerald-300 font-bold text-sm">
                          Bs {totalEfectivoCortes.toFixed(2)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* 5. VISTA CONSOLIDADA (TODOS LOS MEDIOS DE PAGO) */}
            {detalleMetodoActivo === 'ALL' && (
              <div className="rounded-xl border border-indigo-200/80 bg-white dark:bg-slate-900 dark:border-indigo-900/60 shadow-xs overflow-hidden">
                <div className="p-3 bg-indigo-50/60 dark:bg-indigo-950/30 border-b border-indigo-100 dark:border-indigo-900/60 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs">
                      <Receipt className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                        Consolidado Panorámico de Facturas por Método de Pago
                      </h4>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Todas las transacciones y recibos liquidados en la ruta
                      </span>
                    </div>
                  </div>
                  <Badge variant="outline" className="font-mono font-bold text-indigo-700 bg-indigo-50 border-indigo-300 dark:bg-indigo-950 dark:text-indigo-300 text-xs py-0.5 px-2.5">
                    Total Consolidado: Bs {subtotalFilteredTodas.toFixed(2)}
                  </Badge>
                </div>

                {filteredTodasLasFacturas.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    No se encontraron registros que coincidan con la búsqueda.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300 uppercase tracking-tight">
                          <th className="py-2 px-3">Medio de Pago</th>
                          <th className="py-2 px-3">N° Factura</th>
                          <th className="py-2 px-3">Referencia / Comprobante</th>
                          <th className="py-2 px-3">Canal / Entidad</th>
                          <th className="py-2 px-3">Cliente / Razón Social</th>
                          <th className="py-2 px-3">Fecha / Hora</th>
                          <th className="py-2 px-3 text-right font-bold text-indigo-700 dark:text-indigo-300">Monto (Bs)</th>
                          <th className="py-2 px-3 text-center">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono dark:divide-slate-800/60 text-xs">
                        {filteredTodasLasFacturas.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="py-2 px-3 font-sans">
                              {item.tipo === 'EFECTIVO' && (
                                <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 text-[10px] font-semibold">
                                  <Banknote className="h-3 w-3 mr-1" /> Efectivo
                                </Badge>
                              )}
                              {item.tipo === 'TRANSFERENCIA' && (
                                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-200 text-[10px] font-semibold">
                                  <Landmark className="h-3 w-3 mr-1" /> Transferencia
                                </Badge>
                              )}
                              {item.tipo === 'QR' && (
                                <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-200 text-[10px] font-semibold">
                                  <QrCode className="h-3 w-3 mr-1" /> QR Simple
                                </Badge>
                              )}
                              {item.tipo === 'CHEQUE' && (
                                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 text-[10px] font-semibold">
                                  <CreditCard className="h-3 w-3 mr-1" /> Cheque
                                </Badge>
                              )}
                            </td>
                            <td className="py-2 px-3 font-bold text-slate-900 dark:text-slate-100">
                              <Badge variant="outline" className="font-mono text-[11px] border-slate-300 dark:border-slate-700">
                                {item.factura}
                              </Badge>
                            </td>
                            <td className="py-2 px-3 font-bold text-slate-800 dark:text-slate-200">
                              {item.referencia}
                            </td>
                            <td className="py-2 px-3 font-sans text-slate-700 dark:text-slate-300">
                              {item.entidad}
                            </td>
                            <td className="py-2 px-3 font-sans">
                              <div className="font-semibold text-slate-900 dark:text-slate-100">{item.clienteNombre}</div>
                              <div className="text-[10px] text-slate-500 font-mono">Cód: {item.clienteCodigo}</div>
                            </td>
                            <td className="py-2 px-3 text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                              {item.hora}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-sm text-indigo-700 dark:text-indigo-300">
                              Bs {item.monto.toFixed(2)}
                            </td>
                            <td className="py-2 px-3 text-center font-sans">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                <CheckCircle2 className="h-3 w-3" />
                                {item.estado}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-300 font-mono font-bold text-xs bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40 text-slate-900 dark:text-slate-100">
                          <td colSpan={6} className="py-2 px-3 uppercase font-sans tracking-wider text-[11px]">
                            Total Consolidado ({filteredTodasLasFacturas.length} comprobantes)
                          </td>
                          <td className="py-2 px-3 text-right text-indigo-700 dark:text-indigo-300 font-bold text-sm">
                            Bs {subtotalFilteredTodas.toFixed(2)}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer del Modal */}
          <div className="p-3 px-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs shrink-0">
            <span className="text-slate-500 font-mono flex items-center gap-1.5 text-[11px]">
              <Info className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
              Valores expresados en Bolivianos (Bs) • Conciliación conforme en Caja Central
            </span>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowDetalleModal(false)}
              className="cursor-pointer text-xs font-semibold px-4 h-8 border-slate-300 dark:border-slate-700"
            >
              Cerrar Detalle
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* ── FOOTER FLOTANTE CON BORDE SUAVE Y ESQUINAS REDONDEADAS (z-20) ──   */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      <div className="sticky bottom-3 z-20 mt-6 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/70 dark:border-slate-800 p-3.5 shadow-lg shadow-slate-200/40 dark:shadow-black/20">
        <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* LADO IZQUIERDO: ESTADOS DE AMBOS TABS */}
          <div className="flex items-center gap-3 text-xs">
            {/* Almacén */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400 font-semibold">Almacén:</span>
              {isCuadradoAlmacen ? (
                <Badge className="bg-emerald-600 text-white text-[10px] py-0 px-2">
                  <Check className="h-3 w-3 mr-1 inline" /> Cuadrado (0 Faltantes)
                </Badge>
              ) : (
                <Badge className="bg-rose-600 text-white text-[10px] py-0 px-2">
                  <AlertTriangle className="h-3 w-3 mr-1 inline" /> {totalFaltanteFisico} Faltantes
                </Badge>
              )}
            </div>

            <span className="text-slate-300 dark:text-slate-700">|</span>

            {/* Cobranzas */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400 font-semibold">Cobranzas:</span>
              {isCuadradoCobranza ? (
                <Badge className="bg-emerald-600 text-white text-[10px] py-0 px-2">
                  <Check className="h-3 w-3 mr-1 inline" /> Cuadrado Exacto
                </Badge>
              ) : isFaltanteCobranza ? (
                <Badge className="bg-rose-600 text-white text-[10px] py-0 px-2">
                  <AlertTriangle className="h-3 w-3 mr-1 inline" /> Faltante: Bs {Math.abs(diferenciaCuadre).toFixed(2)}
                </Badge>
              ) : (
                <Badge className="bg-amber-600 text-white text-[10px] py-0 px-2">
                  <AlertTriangle className="h-3 w-3 mr-1 inline" /> Sobrante: Bs {diferenciaCuadre.toFixed(2)}
                </Badge>
              )}
            </div>
          </div>

          {/* CENTRO: BALANCE RESUMEN */}
          <div className="flex items-center gap-4 text-xs font-mono">
            <div>
              <span className="text-[10px] text-slate-400 block font-sans">Facturado Esperado:</span>
              <strong className="text-slate-900 dark:text-slate-100">
                Bs {importeFacturadoEsperado.toFixed(2)}
              </strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-sans">Total Rendido:</span>
              <strong className="text-indigo-600 dark:text-indigo-400">
                Bs {totalARendir.toFixed(2)}
              </strong>
            </div>
          </div>

          {/* LADO DERECHO: BOTONES DE GUARDADO */}
          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="default"
              onClick={onVolver}
              className="h-10 px-4 text-xs font-semibold border-slate-300 dark:border-slate-700 cursor-pointer rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </Button>

            <Button
              type="button"
              size="default"
              onClick={handleGuardar}
              className="h-10 px-5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-indigo-600 dark:hover:bg-indigo-700 cursor-pointer flex items-center gap-2 rounded-xl shadow-xs transition-all hover:scale-[1.01]"
            >
              <CheckCircle2 className="h-4.5 w-4.5" />
              <span>Guardar Cierre Logístico</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
