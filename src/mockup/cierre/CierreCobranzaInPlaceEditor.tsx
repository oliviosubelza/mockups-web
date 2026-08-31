import React, { useState, useMemo } from 'react'
import {
  Banknote,
  Coins,
  QrCode,
  Landmark,
  CreditCard,
  Plus,
  Trash2,
  Sparkles,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Save,
  X,
  FileCheck,
  Check,
  Info,
  ShieldCheck,
  User,
  Truck,
  Calendar,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import {
  type CierreOrdenTransporte,
  type CierreCobranzaInfo,
  type CorteMonedaItem,
  type DepositoEfectivoItem,
  type TransferenciaItem,
  type PagoQrItem,
  type ChequeItem,
} from '../cierre-logistico-data'

interface CierreCobranzaInPlaceEditorProps {
  cierre: CierreOrdenTransporte
  onSave: (
    updatedCobranza: CierreCobranzaInfo,
    newStatus: 'LIQUIDATED' | 'PENDING_CASHIER' | 'OBSERVED',
    statusLabel: string
  ) => void
  onCancel: () => void
}

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

export function CierreCobranzaInPlaceEditor({
  cierre,
  onSave,
  onCancel,
}: CierreCobranzaInPlaceEditorProps) {
  const cob = cierre.cobranza

  // Estado editable de cortes: siempre inicia en 0 para digitación
  const [cortes, setCortes] = useState<CorteMonedaItem[]>(() => {
    return DENOMINACIONES_BASE_BS.map((d) => ({ ...d, cantidad: 0, monto: 0 }))
  })

  // Estado editable de depósitos en ruta
  const [depositos, setDepositos] = useState<DepositoEfectivoItem[]>(() =>
    JSON.parse(JSON.stringify(cob.depositosEfectivo || []))
  )

  // Estado editable de transferencias y pagos QR
  const [transferencias, setTransferencias] = useState<TransferenciaItem[]>(() =>
    JSON.parse(JSON.stringify(cob.transferencias || []))
  )
  const [pagosQr, setPagosQr] = useState<PagoQrItem[]>(() =>
    JSON.parse(JSON.stringify(cob.pagosQr || []))
  )
  const [cheques, setCheques] = useState<ChequeItem[]>(() =>
    JSON.parse(JSON.stringify(cob.cheques || []))
  )

  // Observaciones y firma
  const [observaciones, setObservaciones] = useState<string>('')
  const [choferFirmado, setChoferFirmado] = useState<boolean>(
    cob.firmas.chofer.firmado ?? true
  )
  const [cajeroFirmado, setCajeroFirmado] = useState<boolean>(true)

  // Formulario para nuevo depósito
  const [showAddDeposito, setShowAddDeposito] = useState(false)
  const [newBanco, setNewBanco] = useState('Banco BCP')
  const [newVoucher, setNewVoucher] = useState('')
  const [newMonto, setNewMonto] = useState('')

  // ── MANEJO DE CORTES ──
  const handleUpdateCorteCantidad = (denominacion: string, delta: number) => {
    setCortes((prev) =>
      prev.map((c) => {
        if (c.denominacion === denominacion) {
          const nuevaCantidad = Math.max(0, c.cantidad + delta)
          return {
            ...c,
            cantidad: nuevaCantidad,
            monto: Number((nuevaCantidad * c.valorUnitario).toFixed(2)),
          }
        }
        return c
      })
    )
  }

  const handleSetCorteCantidad = (denominacion: string, valor: string) => {
    const cantNum = parseInt(valor, 10) || 0
    setCortes((prev) =>
      prev.map((c) => {
        if (c.denominacion === denominacion) {
          const nuevaCantidad = Math.max(0, cantNum)
          return {
            ...c,
            cantidad: nuevaCantidad,
            monto: Number((nuevaCantidad * c.valorUnitario).toFixed(2)),
          }
        }
        return c
      })
    )
  }

  // ── MANEJO DE DEPÓSITOS EN RUTA ──
  const handleAddDeposito = () => {
    const mNum = parseFloat(newMonto)
    if (!newVoucher.trim() || isNaN(mNum) || mNum <= 0) {
      toast.error('Ingrese número de voucher y monto válido')
      return
    }
    const nuevo: DepositoEfectivoItem = {
      banco: newBanco,
      voucher: newVoucher.trim(),
      monto: Number(mNum.toFixed(2)),
      estado: 'Contado/Facturado/Cobrado - Depósito Ruta',
    }
    setDepositos((prev) => [...prev, nuevo])
    setNewVoucher('')
    setNewMonto('')
    setShowAddDeposito(false)
    toast.success(`Boleta de depósito ${nuevo.voucher} agregada`)
  }

  const handleRemoveDeposito = (index: number) => {
    setDepositos((prev) => prev.filter((_, i) => i !== index))
  }

  // ── CÁLCULOS REACTIVOS EN TIEMPO REAL ──
  const billetesCortes = useMemo(() => cortes.filter((c) => c.tipo === 'BILLETE'), [cortes])
  const monedasCortes = useMemo(() => cortes.filter((c) => c.tipo === 'MONEDA'), [cortes])

  const totalBilletes = useMemo(
    () => billetesCortes.reduce((acc, it) => acc + (it.monto || 0), 0),
    [billetesCortes]
  )
  const totalMonedas = useMemo(
    () => monedasCortes.reduce((acc, it) => acc + (it.monto || 0), 0),
    [monedasCortes]
  )
  const totalEfectivoFisico = totalBilletes + totalMonedas

  const totalDepositosRuta = useMemo(
    () => depositos.reduce((acc, it) => acc + (it.monto || 0), 0),
    [depositos]
  )

  const totalEfectivoDeclarado = totalEfectivoFisico + totalDepositosRuta

  const totalTransferencias = useMemo(
    () => transferencias.reduce((acc, it) => acc + (it.monto || 0), 0),
    [transferencias]
  )
  const totalPagosQr = useMemo(
    () => pagosQr.reduce((acc, it) => acc + (it.monto || 0), 0),
    [pagosQr]
  )
  const totalCheques = useMemo(
    () => cheques.reduce((acc, it) => acc + (it.monto || 0), 0),
    [cheques]
  )

  const totalCobranzaChofer =
    totalEfectivoDeclarado + totalTransferencias + totalPagosQr + totalCheques

  const totalCredito = cob.resumenCobranzas.credito || 0
  const totalCobrador = cob.resumenCobranzas.cobranzaCobrador || 0

  const totalARendir = totalCobranzaChofer + totalCredito + totalCobrador
  const totalFacturadoEsperado = cob.resumenFinanciero.importeFacturado || 0

  const diferencia = Number((totalARendir - totalFacturadoEsperado).toFixed(2))
  const isCuadrado = Math.abs(diferencia) < 0.01
  const isFaltante = diferencia < -0.01
  const isSobrante = diferencia > 0.01

  // ── GUARDAR LIQUIDACIÓN ──
  const handleGuardar = (liquidarConforme = true) => {
    const newStatus = liquidarConforme
      ? ('LIQUIDATED' as const)
      : ('PENDING_CASHIER' as const)
    const statusLabel = liquidarConforme
      ? 'Liquidado Conforme'
      : 'Rendido Chofer - Pendiente Caja'

    const updatedCobranza: CierreCobranzaInfo = {
      ...cob,
      resumenCobranzas: {
        ...cob.resumenCobranzas,
        efectivo: totalEfectivoDeclarado,
        transferencia: totalTransferencias,
        qr: totalPagosQr,
        cheque: totalCheques,
        cobranzaChofer: totalCobranzaChofer,
        totalARendir: totalARendir,
      },
      cortesBs: cortes,
      depositosEfectivo: depositos,
      transferencias: transferencias,
      pagosQr: pagosQr,
      cheques: cheques,
      firmas: {
        ...cob.firmas,
        chofer: {
          ...cob.firmas.chofer,
          firmado: choferFirmado,
        },
        cajero: {
          ...cob.firmas.cajero,
          firmado: cajeroFirmado,
        },
      },
    }

    onSave(updatedCobranza, newStatus, statusLabel)
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* ── BANNER SUPERIOR DE MODO EDICIÓN ACTIVO ── */}
      <div className="rounded-xl border-2 border-indigo-500/80 bg-indigo-50/60 dark:bg-indigo-950/40 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30 shrink-0">
            <Banknote className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-200">
                Modo Registro y Edición de Cobranzas Activo
              </span>
              <Badge className="bg-indigo-600 text-white text-[10px]">
                OT #{cierre.orderCode}
              </Badge>
            </div>
            <p className="text-xs text-indigo-800/80 dark:text-indigo-300 mt-0.5">
              Ingresa directamente las cantidades físicas de billetes, depósitos y comprobantes. Los totales se calcularán en vivo sobre esta pantalla.
            </p>
          </div>
        </div>

        {/* BOTONES DE ACCIÓN RÁPIDA SUPERIORES */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="h-8 text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer"
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Cancelar
          </Button>
        </div>
      </div>

      {/* ── CUADRO DE 3 TARJETAS RESUMEN EN TIEMPO REAL ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* 1. Facturado Esperado */}
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Total Facturado Esperado
            </span>
            <Badge variant="secondary" className="text-[9px] font-mono">Teórico</Badge>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100">
              Bs {totalFacturadoEsperado.toFixed(2)}
            </span>
            <span className="text-[11px] text-slate-400">
              {cob.pedidos.facturado} facturas entregadas
            </span>
          </div>
        </div>

        {/* 2. Total Recaudado Declarado */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/30 shadow-xs">
          <div className="flex items-center justify-between border-b border-emerald-100 dark:border-emerald-900/50 pb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
              Recaudación Chofer en Mano
            </span>
            <Badge className="bg-emerald-600 text-white text-[9px] font-mono">Declarado</Badge>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono text-emerald-700 dark:text-emerald-300">
              Bs {totalCobranzaChofer.toFixed(2)}
            </span>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
              Efectivo: Bs {totalEfectivoDeclarado.toFixed(2)}
            </span>
          </div>
        </div>

        {/* 3. Semáforo de Cuadre y Diferencia */}
        <div
          className={`rounded-xl p-3 border shadow-xs transition-colors ${
            isCuadrado
              ? 'bg-emerald-50 border-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : isFaltante
              ? 'bg-rose-50 border-rose-300 dark:bg-rose-950/40 dark:border-rose-800 text-rose-900 dark:text-rose-200'
              : 'bg-amber-50 border-amber-300 dark:bg-amber-950/40 dark:border-amber-800 text-amber-900 dark:text-amber-200'
          }`}
        >
          <div className="flex items-center justify-between border-b border-black/10 dark:border-white/10 pb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
              {isCuadrado ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
              )}
              {isCuadrado
                ? 'Balance: 100% Cuadrado'
                : isFaltante
                ? 'Balance: Faltante de Caja'
                : 'Balance: Sobrante de Caja'}
            </span>
            <span className="text-[10px] font-bold font-mono">
              {isCuadrado ? 'Bs 0.00' : `${diferencia >= 0 ? '+' : ''}${diferencia.toFixed(2)} Bs`}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono">
              Total Rendido: Bs {totalARendir.toFixed(2)}
            </span>
            <span className="text-[11px] font-semibold opacity-90">
              {isCuadrado ? 'Sin descuadre' : isFaltante ? 'Faltan Bs ' + Math.abs(diferencia).toFixed(2) : 'Sobran Bs ' + diferencia.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* ── SECCIÓN PRINCIPAL: ARQUEO DE EFECTIVO EN 2 COLUMNAS (BILLETES Y MONEDAS) ── */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5 gap-2">
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-emerald-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
              1. Arqueo Físico de Billetes y Monedas en Mano (Bolivianos)
            </h3>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-slate-500">
              Billetes: <strong className="text-indigo-600 dark:text-indigo-400">Bs {totalBilletes.toFixed(2)}</strong>
            </span>
            <span>•</span>
            <span className="text-slate-500">
              Monedas: <strong className="text-amber-600 dark:text-amber-400">Bs {totalMonedas.toFixed(2)}</strong>
            </span>
            <span>•</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              Total Efectivo en Rampa: Bs {totalEfectivoFisico.toFixed(2)}
            </span>
          </div>
        </div>

        {/* MATRIZ DE CORTES EN 2 COLUMNAS AMPLIAS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* COLUMNA 1: BILLETES (200, 100, 50, 20, 10 BS) */}
          <div className="rounded-lg border border-indigo-100 dark:border-indigo-950 bg-indigo-50/20 dark:bg-indigo-950/10 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-indigo-900 dark:text-indigo-200 border-b border-indigo-100 dark:border-indigo-900 pb-1.5">
              <span className="flex items-center gap-1.5">
                <Banknote className="h-3.5 w-3.5 text-indigo-600" /> Billetes en Bolivianos
              </span>
              <span className="font-mono text-indigo-600 dark:text-indigo-400">
                Subtotal: Bs {totalBilletes.toFixed(2)}
              </span>
            </div>

            <div className="space-y-1.5">
              {billetesCortes.map((c) => (
                <div
                  key={c.denominacion}
                  className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs hover:border-indigo-300 transition-colors"
                >
                  <div className="flex items-center gap-2 w-28">
                    <Badge className="bg-indigo-600 text-white font-mono font-bold text-xs py-0.5 px-2">
                      {c.denominacion}
                    </Badge>
                    <span className="text-[11px] text-slate-400">x Bs {c.valorUnitario}</span>
                  </div>

                  {/* CONTROLES DE CANTIDAD */}
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => handleUpdateCorteCantidad(c.denominacion, -1)}
                      className="h-8 w-8 text-xs font-bold cursor-pointer rounded-lg"
                    >
                      -
                    </Button>
                    <Input
                      type="number"
                      min="0"
                      value={c.cantidad === 0 ? '0' : c.cantidad}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => handleSetCorteCantidad(c.denominacion, e.target.value)}
                      className={cn(
                        "h-8 w-16 text-center font-mono font-bold text-xs rounded-lg",
                        c.cantidad === 0 ? "text-slate-400 bg-slate-50 dark:bg-slate-900" : "text-indigo-900 dark:text-indigo-200 font-extrabold"
                      )}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => handleUpdateCorteCantidad(c.denominacion, 1)}
                      className="h-8 w-8 text-xs font-bold cursor-pointer bg-slate-50 dark:bg-slate-800 rounded-lg"
                    >
                      +
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleUpdateCorteCantidad(c.denominacion, 5)}
                      className="h-8 px-2 text-[11px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer rounded-lg"
                    >
                      +5
                    </Button>
                  </div>

                  <div className="font-mono font-bold text-slate-900 dark:text-slate-100 text-right w-24">
                    Bs {c.monto.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* COLUMNA 2: MONEDAS (5, 2, 1, 0.50, 0.20, 0.10 BS) */}
          <div className="rounded-lg border border-amber-100 dark:border-amber-950 bg-amber-50/20 dark:bg-amber-950/10 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-amber-900 dark:text-amber-200 border-b border-amber-100 dark:border-amber-900 pb-1.5">
              <span className="flex items-center gap-1.5">
                <Coins className="h-3.5 w-3.5 text-amber-600" /> Monedas en Bolivianos
              </span>
              <span className="font-mono text-amber-600 dark:text-amber-400">
                Subtotal: Bs {totalMonedas.toFixed(2)}
              </span>
            </div>

            <div className="space-y-1.5">
              {monedasCortes.map((c) => (
                <div
                  key={c.denominacion}
                  className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs hover:border-amber-300 transition-colors"
                >
                  <div className="flex items-center gap-2 w-28">
                    <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-mono font-bold text-xs py-0.5 px-2">
                      {c.denominacion}
                    </Badge>
                    <span className="text-[11px] text-slate-400">x Bs {c.valorUnitario}</span>
                  </div>

                  {/* CONTROLES DE CANTIDAD */}
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => handleUpdateCorteCantidad(c.denominacion, -1)}
                      className="h-8 w-8 text-xs font-bold cursor-pointer rounded-lg"
                    >
                      -
                    </Button>
                    <Input
                      type="number"
                      min="0"
                      value={c.cantidad === 0 ? '0' : c.cantidad}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => handleSetCorteCantidad(c.denominacion, e.target.value)}
                      className={cn(
                        "h-8 w-16 text-center font-mono font-bold text-xs rounded-lg",
                        c.cantidad === 0 ? "text-slate-400 bg-slate-50 dark:bg-slate-900" : "text-amber-900 dark:text-amber-200 font-extrabold"
                      )}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => handleUpdateCorteCantidad(c.denominacion, 1)}
                      className="h-8 w-8 text-xs font-bold cursor-pointer bg-slate-50 dark:bg-slate-800 rounded-lg"
                    >
                      +
                    </Button>
                  </div>

                  <div className="font-mono font-bold text-slate-900 dark:text-slate-100 text-right w-24">
                    Bs {c.monto.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── SECCIÓN 2: BOLETAS DE DEPÓSITO BANCARIO EN RUTA ── */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-blue-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
              2. Boletas de Depósito Bancario en Ruta ({depositos.length})
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
              Total Depositado: Bs {totalDepositosRuta.toFixed(2)}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAddDeposito(!showAddDeposito)}
              className="h-7 text-xs font-semibold text-blue-600 border-blue-200 hover:bg-blue-50 cursor-pointer"
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {showAddDeposito ? 'Cancelar' : 'Agregar Boleta'}
            </Button>
          </div>
        </div>

        {/* FORMULARIO AGREGAR DEPÓSITO */}
        {showAddDeposito && (
          <div className="bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 space-y-2 animate-in fade-in duration-100">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Banco Receptor
                </Label>
                <select
                  value={newBanco}
                  onChange={(e) => setNewBanco(e.target.value)}
                  className="w-full h-8 mt-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs px-2 text-slate-900 dark:text-slate-100 focus:outline-none"
                >
                  <option value="Banco BCP">Banco BCP</option>
                  <option value="Banco Bisa">Banco Bisa</option>
                  <option value="Banco Unión">Banco Unión</option>
                  <option value="Banco Ganadero">Banco Ganadero</option>
                  <option value="Banco Mercantil Santa Cruz">Banco Mercantil Santa Cruz</option>
                </select>
              </div>
              <div>
                <Label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  N° de Voucher / Operación
                </Label>
                <Input
                  placeholder="Ej: BCP-DEP-99410"
                  value={newVoucher}
                  onChange={(e) => setNewVoucher(e.target.value)}
                  className="h-8 mt-1 font-mono text-xs"
                />
              </div>
              <div>
                <Label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Monto Depositado (Bs)
                </Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={newMonto}
                  onChange={(e) => setNewMonto(e.target.value)}
                  className="h-8 mt-1 font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                onClick={handleAddDeposito}
                className="h-7 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs cursor-pointer px-4"
              >
                Guardar Boleta de Depósito
              </Button>
            </div>
          </div>
        )}

        {/* LISTADO DE COMPROBANTES DE DEPÓSITO */}
        {depositos.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-1">
            No se han registrado boletas de depósito en bancos durante esta ruta.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {depositos.map((dep, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                    {dep.banco} — Voucher: <strong className="font-mono">{dep.voucher}</strong>
                  </div>
                  <div className="text-[11px] text-slate-500">{dep.estado}</div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                    Bs {dep.monto.toFixed(2)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveDeposito(idx)}
                    className="h-7 w-7 text-rose-500 hover:text-rose-700 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── SECCIÓN 3: MEDIOS DIGITALES (QR Y TRANSFERENCIAS) ── */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <QrCode className="h-4 w-4 text-purple-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
              3. Medios Digitales y Cheques Recibidos
            </h3>
          </div>
          <div className="text-xs font-mono font-bold text-purple-600 dark:text-purple-400">
            Total Digital: Bs {(totalPagosQr + totalTransferencias + totalCheques).toFixed(2)}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* PAGOS QR */}
          <div className="rounded-lg border border-purple-100 dark:border-purple-950 bg-purple-50/20 dark:bg-purple-950/10 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-purple-900 dark:text-purple-200 border-b border-purple-100 dark:border-purple-900 pb-1">
              <span>Pagos QR Simple ({pagosQr.length})</span>
              <span className="font-mono">Bs {totalPagosQr.toFixed(2)}</span>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {pagosQr.map((qr, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200">{qr.clienteNombre}</div>
                    <div className="text-[10px] text-slate-400">{qr.banco} • Ref: {qr.transaccion}</div>
                  </div>
                  <div className="font-mono font-bold text-purple-700 dark:text-purple-300">
                    Bs {qr.monto.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* TRANSFERENCIAS */}
          <div className="rounded-lg border border-blue-100 dark:border-blue-950 bg-blue-50/20 dark:bg-blue-950/10 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-blue-900 dark:text-blue-200 border-b border-blue-100 dark:border-blue-900 pb-1">
              <span>Transferencias Bancarias ({transferencias.length})</span>
              <span className="font-mono">Bs {totalTransferencias.toFixed(2)}</span>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {transferencias.map((tr, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200">{tr.clienteNombre}</div>
                    <div className="text-[10px] text-slate-400">{tr.banco} • N° {tr.transaccion}</div>
                  </div>
                  <div className="font-mono font-bold text-blue-700 dark:text-blue-300">
                    Bs {tr.monto.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── SECCIÓN 4: OBSERVACIONES Y FIRMAS DE CONFORMIDAD ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* OBSERVACIONES */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-2">
          <Label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
            <span>Observaciones o Justificación de Liquidación</span>
            {!isCuadrado && <span className="text-rose-600 font-bold text-[11px]">* Justificar descuadre</span>}
          </Label>
          <Textarea
            placeholder="Ingrese notas sobre la recaudación, justificación de diferencias, billetes deteriorados..."
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            className="min-h-20 text-xs"
          />
        </div>

        {/* FIRMAS DE RESPONSABILIDAD */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-3">
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider block">
            Firmas de Conformidad
          </span>

          <div className="space-y-2 text-xs">
            <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={choferFirmado}
                onChange={(e) => setChoferFirmado(e.target.checked)}
                className="h-4 w-4 rounded text-indigo-600"
              />
              <div>
                <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                  Firma Chofer: {cierre.driverName}
                </span>
                <span className="text-[11px] text-slate-500">CI: {cierre.driverCi} • {cierre.driverEmpresa}</span>
              </div>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={cajeroFirmado}
                onChange={(e) => setCajeroFirmado(e.target.checked)}
                className="h-4 w-4 rounded text-indigo-600"
              />
              <div>
                <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                  Firma Cajero Liquidador: {cierre.almacen.usuarioLiquidador}
                </span>
                <span className="text-[11px] text-slate-500">Caja Central de Distribución</span>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* ── BARRA FLOTANTE INFERIOR (STICKY BAR) DE GUARDADO Y CONCILIACIÓN ── */}
      <div className="sticky bottom-2 z-30 rounded-xl border border-slate-300 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-4 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-xs font-mono">
          <div>
            <span className="text-[10px] text-slate-400 block uppercase">Facturado Esperado</span>
            <strong className="text-slate-900 dark:text-slate-100 text-sm">
              Bs {totalFacturadoEsperado.toFixed(2)}
            </strong>
          </div>
          <div className="text-slate-300 dark:text-slate-700">|</div>
          <div>
            <span className="text-[10px] text-slate-400 block uppercase">Rendido Declarado</span>
            <strong className="text-indigo-600 dark:text-indigo-400 text-sm">
              Bs {totalARendir.toFixed(2)}
            </strong>
          </div>
          <div className="text-slate-300 dark:text-slate-700">|</div>
          <div>
            <span className="text-[10px] text-slate-400 block uppercase">Diferencia de Cuadre</span>
            <strong
              className={`text-sm ${
                isCuadrado
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : isFaltante
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {isCuadrado
                ? 'Bs 0.00 (Cuadrado)'
                : isFaltante
                ? `Faltan Bs ${Math.abs(diferencia).toFixed(2)}`
                : `Sobran Bs ${diferencia.toFixed(2)}`}
            </strong>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="cursor-pointer text-xs h-9 px-4"
          >
            Cancelar
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => handleGuardar(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-5 shadow-sm shadow-emerald-600/20 cursor-pointer flex items-center gap-1.5"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>Guardar Liquidación Conforme</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
