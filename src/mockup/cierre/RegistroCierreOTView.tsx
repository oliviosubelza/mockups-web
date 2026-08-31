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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type {
  CierreOrdenTransporte,
  CierreAlmacenItem,
  CorteMonedaItem,
  DepositoEfectivoItem,
  TransferenciaItem,
  PagoQrItem,
  ChequeItem,
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

  // Total 4 Medios No Efectivo (Boletas + Transferencias + QR + Cheques)
  const totalNoEfectivo = totalDepositos + totalTransferencias + totalQr + totalCheques

  // Total Cobranza Chofer = Efectivo Físico Arqueado + Depósitos y Medios Digitales
  const totalCobranzaChofer = totalEfectivoCortes + totalNoEfectivo

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

            {/* 3. Depósitos y Medios Digitales */}
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3.5 shadow-xs dark:border-indigo-900/60 dark:bg-indigo-950/20">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase text-indigo-700 dark:text-indigo-300">
                  Depósitos y Medios Digitales
                </span>
                <Landmark className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="mt-1 text-xl font-bold font-mono text-indigo-700 dark:text-indigo-300">
                Bs {totalNoEfectivo.toFixed(2)}
              </div>
              <span className="text-[11px] text-indigo-600/80 dark:text-indigo-400 block mt-0.5">
                4 Métodos registrados en ruta
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
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3.5 w-full flex flex-col justify-between">
              {/* Cabecera Principal */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                      Depósitos y Medios Digitales
                    </h3>
                    <span className="text-[10.5px] text-slate-400 block">Totales consolidados registrados en la base de datos</span>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className="border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300 font-mono font-bold text-xs py-0.5 px-2.5 self-start sm:self-auto"
                >
                  Total: Bs {totalNoEfectivo.toFixed(2)}
                </Badge>
              </div>

              {/* GRILLA CUADRADA DE 2x2 CON LAS 4 TARJETAS COMPACTAS (SOLO TOTALES) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-auto">
                {/* ── TARJETA 1: BOLETAS DE DEPÓSITO BANCARIO ── */}
                <div className="rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/70 to-indigo-50/20 dark:border-indigo-900/60 dark:from-indigo-950/30 dark:to-slate-900 p-4 flex flex-col justify-between space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">1. Boletas Depósito</h4>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {depositos.length} {depositos.length === 1 ? 'comprobante' : 'comprobantes'}
                        </span>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-bold border-indigo-200 text-indigo-700 bg-white/80 dark:bg-slate-900/80">
                      En BD
                    </Badge>
                  </div>
                  <div className="pt-1">
                    <span className="text-[10.5px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Total Recaudado</span>
                    <span className="text-2xl font-bold font-mono text-indigo-700 dark:text-indigo-300 block mt-0.5">
                      Bs {totalDepositos.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* ── TARJETA 2: TRANSFERENCIAS BANCARIAS ACH ── */}
                <div className="rounded-2xl border border-blue-200/80 bg-gradient-to-br from-blue-50/70 to-blue-50/20 dark:border-blue-900/60 dark:from-blue-950/30 dark:to-slate-900 p-4 flex flex-col justify-between space-y-3 shadow-2xs">
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
                  <div className="pt-1">
                    <span className="text-[10.5px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Total Recaudado</span>
                    <span className="text-2xl font-bold font-mono text-blue-700 dark:text-blue-300 block mt-0.5">
                      Bs {totalTransferencias.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* ── TARJETA 3: PAGOS QR SIMPLE ── */}
                <div className="rounded-2xl border border-purple-200/80 bg-gradient-to-br from-purple-50/70 to-purple-50/20 dark:border-purple-900/60 dark:from-purple-950/30 dark:to-slate-900 p-4 flex flex-col justify-between space-y-3 shadow-2xs">
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
                  <div className="pt-1">
                    <span className="text-[10.5px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Total Recaudado</span>
                    <span className="text-2xl font-bold font-mono text-purple-700 dark:text-purple-300 block mt-0.5">
                      Bs {totalQr.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* ── TARJETA 4: CHEQUES BANCARIOS ── */}
                <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/70 to-emerald-50/20 dark:border-emerald-900/60 dark:from-emerald-950/30 dark:to-slate-900 p-4 flex flex-col justify-between space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                        <CreditCard className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">4. Cheques Bancarios</h4>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {cheques.length} {cheques.length === 1 ? 'cheque' : 'cheques'}
                        </span>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-bold border-emerald-200 text-emerald-700 bg-white/80 dark:bg-slate-900/80">
                      En BD
                    </Badge>
                  </div>
                  <div className="pt-1">
                    <span className="text-[10.5px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Total Recaudado</span>
                    <span className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-300 block mt-0.5">
                      Bs {totalCheques.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Pie con resumen de medios digitales */}
              <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-500 font-semibold">Total Medios No Efectivo:</span>
                <span className="font-mono font-bold text-sm text-indigo-700 dark:text-indigo-300">
                  Bs {totalNoEfectivo.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

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
