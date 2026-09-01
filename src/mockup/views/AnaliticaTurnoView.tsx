import React, { useMemo, useState, useEffect } from 'react'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Coins,
  Download,
  Eye,
  FileSpreadsheet,
  Filter,
  Flame,
  Layers,
  ListFilter,
  MapPin,
  Maximize2,
  Package,
  PackageCheck,
  PackageX,
  QrCode,
  Radio,
  RefreshCw,
  RotateCcw,
  Route,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Truck,
  User,
  X,
  XCircle,
} from 'lucide-react'
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useFlotaViva } from '../monitoreo/use-flota-viva'
import { HISTORIAL_ORDENES_TRANSPORTE } from '../historial-orders-data'
import { navigateTo } from '../routes'

export function AnaliticaTurnoView() {
  // ── ESTADOS DE FILTRO PRINCIPALES ──
  const [selectedShift, setSelectedShift] = useState<'CURRENT' | 'MORNING' | 'FULL_DAY'>('CURRENT')
  const [selectedTruck, setSelectedTruck] = useState('ALL')
  const [selectedDriver, setSelectedDriver] = useState('ALL')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [refreshCounter, setRefreshCounter] = useState(15)

  // ── ESTADO DEL WIDGET DE CHOFERES (TOP 5 vs RIESGO) ──
  const [driverViewMode, setDriverViewMode] = useState<'ATRASO' | 'AVANCE'>('ATRASO')
  const [isFleetModalOpen, setIsFleetModalOpen] = useState(false)
  const [fleetSearchTerm, setFleetSearchTerm] = useState('')
  const [fleetFilterStatus, setFleetFilterStatus] = useState<'ALL' | 'RIESGO' | 'OBSERVADO' | 'OPTIMO'>('ALL')

  // Datos en vivo de la flota
  const { filas: flotaViva } = useFlotaViva()

  // Contador de autorefresco simulado
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      setRefreshCounter((prev) => {
        if (prev <= 1) {
          return 15
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [autoRefresh])

  // Listados para los filtros
  const truckOptions = useMemo(() => {
    const set = new Set<string>()
    flotaViva.forEach((f) => set.add(f.camion))
    HISTORIAL_ORDENES_TRANSPORTE.slice(0, 8).forEach((h) => set.add(h.truck.plate))
    return Array.from(set)
  }, [flotaViva])

  const driverOptions = useMemo(() => {
    const set = new Set<string>()
    flotaViva.forEach((f) => set.add(f.chofer))
    HISTORIAL_ORDENES_TRANSPORTE.slice(0, 8).forEach((h) => set.add(h.driver.name))
    return Array.from(set)
  }, [flotaViva])

  // ── CONSOLIDACIÓN DE DATOS DE LA OPERACIÓN ──
  const kpisConsolidados = useMemo(() => {
    // Filtrar viajes en vivo según filtros
    const viajesFiltrados = flotaViva.filter((f) => {
      if (selectedTruck !== 'ALL' && f.camion !== selectedTruck) return false
      if (selectedDriver !== 'ALL' && f.chofer !== selectedDriver) return false
      return true
    })

    // Contadores de paradas
    let totalParadas = 0
    let paradasEntregadas = 0
    let paradasPendientes = 0
    let paradasRechazadas = 0
    let totalMontoEsperado = 0
    let totalMontoRecaudado = 0
    let totalMontoEfectivo = 0
    let totalMontoQR = 0
    let totalMontoTransf = 0
    let totalMontoCredito = 0

    viajesFiltrados.forEach((f) => {
      totalParadas += f.resumen.total
      paradasEntregadas += f.resumen.entregadas
      paradasPendientes += f.resumen.pendientes
      paradasRechazadas += (f.resumen.devueltas || 0) + (f.resumen.fallidas || 0)

      // Cálculo monetario estimado basado en entregas
      f.entregas.forEach((e) => {
        const monto = e.cobro?.facturado || 320
        totalMontoEsperado += monto
        if (e.estado === 'entregado') {
          const cobrado = e.cobro?.cobrado || monto
          totalMontoRecaudado += cobrado
          // Distribuir medios de pago reales
          if (e.cobro?.pagos && e.cobro.pagos.length > 0) {
            e.cobro.pagos.forEach((p) => {
              if (p.metodo === 'efectivo') totalMontoEfectivo += p.monto
              else if (p.metodo === 'qr') totalMontoQR += p.monto
              else if (p.metodo === 'transferencia') totalMontoTransf += p.monto
              else totalMontoCredito += p.monto
            })
          } else {
            // Default proporcional si es mock sintético
            totalMontoEfectivo += cobrado * 0.62
            totalMontoQR += cobrado * 0.23
            totalMontoTransf += cobrado * 0.15
          }
        }
      })
    })

    // En caso de que no haya paradas en vivo, completar con el historial del día
    if (totalParadas === 0) {
      totalParadas = 180
      paradasEntregadas = 142
      paradasPendientes = 33
      paradasRechazadas = 5
      totalMontoEsperado = 54000
      totalMontoRecaudado = 48250
      totalMontoEfectivo = 31362.5
      totalMontoQR = 10615
      totalMontoTransf = 6272.5
    }

    const otifRate = totalParadas > 0 ? ((paradasEntregadas / (paradasEntregadas + paradasRechazadas || 1)) * 100).toFixed(1) : '94.8'
    const avancePct = totalParadas > 0 ? ((paradasEntregadas / totalParadas) * 100).toFixed(1) : '78.9'
    const rechazoRate = totalParadas > 0 ? ((paradasRechazadas / totalParadas) * 100).toFixed(1) : '2.8'
    const cobranzaPct = totalMontoEsperado > 0 ? ((totalMontoRecaudado / totalMontoEsperado) * 100).toFixed(1) : '89.4'

    return {
      totalParadas,
      paradasEntregadas,
      paradasPendientes,
      paradasRechazadas,
      otifRate,
      avancePct,
      rechazoRate,
      cobranzaPct,
      totalMontoEsperado,
      totalMontoRecaudado,
      totalMontoEfectivo,
      totalMontoQR,
      totalMontoTransf,
      totalMontoCredito,
    }
  }, [flotaViva, selectedTruck, selectedDriver])

  // ── DATA GRÁFICO 1: RITMO DE ENTREGAS POR HORA & TIEMPO PROMEDIO ──
  const dataRitmoHorario = useMemo(() => [
    { hora: '08:00', entregas: 8, tiempoPromedioMin: 14.5, meta: 12 },
    { hora: '09:00', entregas: 19, tiempoPromedioMin: 12.2, meta: 15 },
    { hora: '10:00', entregas: 28, tiempoPromedioMin: 11.0, meta: 20 },
    { hora: '11:00', entregas: 34, tiempoPromedioMin: 9.8, meta: 25 },
    { hora: '12:00', entregas: 22, tiempoPromedioMin: 15.2, meta: 20 },
    { hora: '13:00', entregas: 16, tiempoPromedioMin: 13.0, meta: 18 },
    { hora: '14:00', entregas: 24, tiempoPromedioMin: 10.5, meta: 20 },
    { hora: '15:00', entregas: 21, tiempoPromedioMin: 11.8, meta: 20 },
    { hora: '16:00', entregas: 12, tiempoPromedioMin: 12.4, meta: 15 },
    { hora: '17:00', entregas: 6, tiempoPromedioMin: 14.0, meta: 10 },
  ], [])

  // ── DATA GRÁFICO 2: MEDIOS DE PAGO (DONUT) ──
  const dataMediosPago = useMemo(() => [
    {
      name: 'Efectivo',
      monto: kpisConsolidados.totalMontoEfectivo,
      color: '#10b981', // Emerald
      icon: Banknote,
    },
    {
      name: 'Pago QR',
      monto: kpisConsolidados.totalMontoQR,
      color: '#8b5cf6', // Violet
      icon: QrCode,
    },
    {
      name: 'Transferencia',
      monto: kpisConsolidados.totalMontoTransf,
      color: '#3b82f6', // Blue
      icon: Coins,
    },
  ], [kpisConsolidados])

  // ── UNIVERSO COMPLETO DE LOS 40 CAMIONES EN RUTA (DATASET ENRIQUECIDO) ──
  const flotaCompleta40 = useMemo(() => {
    // Generar 40 camiones representativos combinando flota viva + datos realistas
    const poolNombres = [
      'Mario Morales', 'Fernando Quispe', 'Juan Choque', 'Gonzalo Torrez', 'Luis Ramos',
      'Carlos Mamani', 'Roberto Vargas', 'Miguel Nina', 'David Flores', 'Jorge Gutierrez',
      'Raul Condori', 'Victor Apaza', 'Hernan Mendoza', 'Edgar Soliz', 'Marcelo Choquehuanca',
      'Oscar Vaca', 'Pedro Alarcon', 'Hugo Salinas', 'Diego Montaño', 'Ramiro Pinto',
      'Sergio Acarapi', 'Alberto Poma', 'Gustavo Zeballos', 'Javier Yujra', 'Daniel Ticona',
      'Felipe Huanca', 'Rene Colque', 'Gabriel Tarqui', 'Walter Canaviri', 'Cesar Machaca',
      'Ivan Quenta', 'Freddy Laura', 'Alejandro Calisaya', 'Boris Cuentas', 'Christian Loza',
      'Alvaro Carvajal', 'Erick Santander', 'Jaime Villca', 'Julio Chumacero', 'Mauricio Balboa'
    ]

    const poolPlacas = [
      '9044-TRX', '8123-POU', '5512-BNM', '4411-ZZX', '7712-QWE',
      '3456-ABC', '1289-KLL', '2388-GHJ', '6621-RTY', '9934-VBN',
      '1189-LKJ', '5543-WER', '8876-DFG', '3321-MNB', '4489-ZXC',
      '6672-ASD', '2219-QWE', '7731-RTY', '8845-UIO', '9912-PAS',
      '1456-DFG', '2589-HJK', '3698-LZX', '4712-CVB', '5823-BNM',
      '6934-QWE', '7045-RTY', '8156-UIO', '9267-PAS', '1378-DFG',
      '2489-HJK', '3590-LZX', '4601-CVB', '5712-BNM', '6823-QWE',
      '7934-RTY', '8045-UIO', '9156-PAS', '1267-DFG', '2378-HJK'
    ]

    return poolNombres.map((nombre, idx) => {
      const placa = poolPlacas[idx] || `99${idx}-ABC`
      const total = 26 + (idx % 8)

      // Los primeros 4 tienen menor avance (atrasados/riesgo)
      let entregadas = 0
      let rechazadas = 0
      let dwellTimeMin = 11

      if (idx === 0) { // Morales
        entregadas = 12
        rechazadas = 2
        dwellTimeMin = 24
      } else if (idx === 1) { // Quispe
        entregadas = 14
        rechazadas = 1
        dwellTimeMin = 21
      } else if (idx === 2) { // Choque
        entregadas = 17
        rechazadas = 1
        dwellTimeMin = 18
      } else if (idx === 3) { // Torrez
        entregadas = 18
        rechazadas = 2
        dwellTimeMin = 17
      } else {
        // Avances entre 75% y 100%
        const factor = Math.min(1, 0.72 + (idx * 0.007))
        entregadas = Math.min(total, Math.round(total * factor))
        rechazadas = idx % 9 === 0 ? 1 : 0
        dwellTimeMin = Math.round(9 + (idx % 5))
      }

      const pendientes = Math.max(0, total - entregadas - rechazadas)
      const pct = Math.round((entregadas / total) * 100)

      let estado: 'RIESGO' | 'OBSERVADO' | 'OPTIMO' = 'OPTIMO'
      if (pct < 55 || dwellTimeMin >= 20 || rechazadas >= 2) {
        estado = 'RIESGO'
      } else if (pct < 75 || dwellTimeMin >= 16) {
        estado = 'OBSERVADO'
      }

      return {
        id: `ot-${4470 + idx}`,
        ordenId: String(4470 + idx),
        nombre,
        nombreCorto: nombre.split(' ')[0] + ' ' + (nombre.split(' ')[1]?.[0] ? nombre.split(' ')[1][0] + '.' : ''),
        camion: placa,
        total,
        entregadas,
        pendientes,
        rechazadas,
        eficienciaPct: pct,
        dwellTimeMin,
        estado,
      }
    })
  }, [])

  // ── RESUMEN GLOBAL DE LA SALUD DE LA FLOTA (40 CAMIONES) ──
  const resumenFlota = useMemo(() => {
    const total = flotaCompleta40.length
    const optimos = flotaCompleta40.filter((f) => f.estado === 'OPTIMO').length
    const observados = flotaCompleta40.filter((f) => f.estado === 'OBSERVADO').length
    const riesgo = flotaCompleta40.filter((f) => f.estado === 'RIESGO').length

    return {
      total,
      optimos,
      observados,
      riesgo,
    }
  }, [flotaCompleta40])

  // ── FILTRADO COMPACTO TOP 5 PARA EL GRÁFICO SEGÚN MODO ──
  const dataTop5Choferes = useMemo(() => {
    const copia = [...flotaCompleta40]
    if (driverViewMode === 'ATRASO') {
      // Ordenar por menor avance y mayor dwell time (5 con mayor riesgo/atraso)
      copia.sort((a, b) => a.eficienciaPct - b.eficienciaPct || b.dwellTimeMin - a.dwellTimeMin)
      return copia.slice(0, 5)
    } else {
      // Ordenar por mayor avance (Top 5 más eficientes / por terminar)
      copia.sort((a, b) => b.eficienciaPct - a.eficienciaPct || a.dwellTimeMin - b.dwellTimeMin)
      return copia.slice(0, 5)
    }
  }, [flotaCompleta40, driverViewMode])

  // ── FILTRADO DE LA TABLA DEL MODAL COMPLETO (40 CAMIONES) ──
  const flotaFiltradaModal = useMemo(() => {
    return flotaCompleta40.filter((f) => {
      if (fleetFilterStatus !== 'ALL' && f.estado !== fleetFilterStatus) return false
      if (fleetSearchTerm.trim()) {
        const query = fleetSearchTerm.toLowerCase()
        const matchName = f.nombre.toLowerCase().includes(query)
        const matchPlate = f.camion.toLowerCase().includes(query)
        if (!matchName && !matchPlate) return false
      }
      return true
    })
  }, [flotaCompleta40, fleetFilterStatus, fleetSearchTerm])

  // ── DATA GRÁFICO 4: PARETO DE MOTIVOS DE RECHAZO E INCIDENCIAS ──
  const dataMotivosRechazo = useMemo(() => [
    { motivo: 'Local Cerrado / Ausente', cantidad: 18, pct: 42, color: '#f43f5e' },
    { motivo: 'Sin Dinero / Iliquidez', cantidad: 11, pct: 26, color: '#f97316' },
    { motivo: 'Pedido Duplicado / Error', cantidad: 6, pct: 14, color: '#eab308' },
    { motivo: 'Producto Dañado (Ruta)', cantidad: 5, pct: 12, color: '#ec4899' },
    { motivo: 'Fuera de Horario', cantidad: 3, pct: 6, color: '#64748b' },
  ], [])

  // Feed de incidentes vivos del turno
  const incidentesVivos = useMemo(() => [
    {
      id: 'inc-101',
      hora: '14:22',
      camion: '3456-ABC',
      chofer: 'Carlos Mamani',
      cliente: 'Abarrotes Don Pepe',
      motivo: 'Local Cerrado (Reintento)',
      severidad: 'MEDIA',
      monto: 850.00,
      otId: '4471',
    },
    {
      id: 'inc-102',
      hora: '13:48',
      camion: '9044-TRX',
      chofer: 'Mario Morales',
      cliente: 'Minimarket Los Andes',
      motivo: '2 Cajas Cerveza Dañadas (Merma)',
      severidad: 'ALTA',
      monto: 420.50,
      otId: '4473',
    },
    {
      id: 'inc-103',
      hora: '12:15',
      camion: '1289-KLL',
      chofer: 'Roberto Vargas',
      cliente: 'Comercial El Fuerte',
      motivo: 'Pago QR pendiente de confirmación',
      severidad: 'BAJA',
      monto: 1240.00,
      otId: '4472',
    },
    {
      id: 'inc-104',
      hora: '11:05',
      camion: '5512-BNM',
      chofer: 'Juan Choque',
      cliente: 'Licorería San Martín',
      motivo: 'Rechazo parcial por vencimiento',
      severidad: 'MEDIA',
      monto: 610.00,
      otId: '4474',
    },
  ], [])

  const handleExportExcel = () => {
    toast.success('Generando reporte analítico en Excel...', {
      description: 'El archivo descargará los KPIs consolidados y el desglose de paradas por hora.',
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto pr-1">
      {/* ── BARRA SUPERIOR DE CONTROL Y FILTROS RÁPIDOS ── */}
      <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
              <Activity className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Analítica y Métricas Operativas del Turno
                </h2>
                <Badge
                  variant="outline"
                  className="gap-1 border-emerald-500 bg-emerald-50 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                >
                  <span className="inline-block size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Turno Activo (40 Camiones)
                </Badge>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Monitoreo focalizado por excepción: ritmo horario, recaudación en calle y control de flota en riesgo.
              </p>
            </div>
          </div>

          {/* Controles de Filtrado */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Selector de Turno / Ventana */}
            <Select
              value={selectedShift}
              onValueChange={(val) => {
                if (val) setSelectedShift(val as 'CURRENT' | 'MORNING' | 'FULL_DAY')
              }}
            >
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue placeholder="Turno" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CURRENT">🟢 Turno en Curso (Hoy)</SelectItem>
                <SelectItem value="MORNING">🌅 Turno Mañana (08-14h)</SelectItem>
                <SelectItem value="FULL_DAY">📅 Día Completo</SelectItem>
              </SelectContent>
            </Select>

            {/* Selector de Camión */}
            <Select
              value={selectedTruck}
              onValueChange={(val) => {
                if (val) setSelectedTruck(val)
              }}
            >
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder="Camión" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">🚛 Todos Camiones</SelectItem>
                {truckOptions.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Selector de Chofer */}
            <Select
              value={selectedDriver}
              onValueChange={(val) => {
                if (val) setSelectedDriver(val)
              }}
            >
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder="Chofer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">👤 Todos Choferes</SelectItem>
                {driverOptions.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Toggle de Auto-Refresco */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={cn(
                'h-8 gap-1.5 text-xs font-medium cursor-pointer',
                autoRefresh
                  ? 'border-indigo-200 bg-indigo-50/60 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300'
                  : 'text-slate-600 dark:text-slate-400'
              )}
            >
              <RefreshCw className={cn('size-3.5', autoRefresh && 'animate-spin text-indigo-600')} />
              <span>{autoRefresh ? `${refreshCounter}s` : 'Pausado'}</span>
            </Button>

            {/* Exportar */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportExcel}
              className="h-8 gap-1.5 text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Download className="size-3.5 text-emerald-600" />
              <span>Exportar</span>
            </Button>
          </div>
        </div>
      </div>

      {/* ── FILA 1: TARJETAS SCORECARD DE KPIS OPERATIVOS ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1: OTIF Estimado */}
        <Card className="border-slate-200 shadow-xs dark:border-slate-800">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Nivel de Servicio (OTIF)
              </span>
              <div className="flex size-7 items-center justify-center rounded-md bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                <Target className="size-4" />
              </div>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-50">
                {kpisConsolidados.otifRate}%
              </span>
              <span className="flex items-center text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                <ArrowUpRight className="size-3.5" /> +1.4% vs meta
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-1.5">
              <span>{kpisConsolidados.paradasEntregadas} a tiempo e íntegras</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">Meta: 95%</span>
            </div>
          </CardContent>
        </Card>

        {/* KPI 2: Avance de Paradas */}
        <Card className="border-slate-200 shadow-xs dark:border-slate-800">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Avance de Paradas (40 OTs)
              </span>
              <div className="flex size-7 items-center justify-center rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                <PackageCheck className="size-4" />
              </div>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-50">
                {kpisConsolidados.paradasEntregadas}
                <span className="text-sm font-normal text-slate-400 dark:text-slate-500">
                  /{kpisConsolidados.totalParadas}
                </span>
              </span>
              <Badge variant="secondary" className="text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200">
                {kpisConsolidados.avancePct}%
              </Badge>
            </div>
            {/* Barra de Progreso Multi-segmento */}
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 flex">
              <div
                style={{ width: `${(kpisConsolidados.paradasEntregadas / kpisConsolidados.totalParadas) * 100}%` }}
                className="bg-emerald-500"
                title="Entregadas OK"
              />
              <div
                style={{ width: `${(kpisConsolidados.paradasRechazadas / kpisConsolidados.totalParadas) * 100}%` }}
                className="bg-rose-500"
                title="Rechazadas"
              />
              <div
                style={{ width: `${(kpisConsolidados.paradasPendientes / kpisConsolidados.totalParadas) * 100}%` }}
                className="bg-slate-300 dark:bg-slate-700"
                title="Pendientes"
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {kpisConsolidados.paradasEntregadas} OK
              </span>
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-slate-400" />
                {kpisConsolidados.paradasPendientes} Pend.
              </span>
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-rose-500" />
                {kpisConsolidados.paradasRechazadas} Rech.
              </span>
            </div>
          </CardContent>
        </Card>

        {/* KPI 3: Recaudación en Ruta */}
        <Card className="border-slate-200 shadow-xs dark:border-slate-800">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Recaudación en Ruta (Bs.)
              </span>
              <div className="flex size-7 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                <Banknote className="size-4" />
              </div>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-50">
                Bs. {kpisConsolidados.totalMontoRecaudado.toLocaleString('es-BO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {kpisConsolidados.cobranzaPct}% cobrado
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-1.5">
              <span>Proyectado: Bs. {kpisConsolidados.totalMontoEsperado.toLocaleString('es-BO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">● 98.2% en mano</span>
            </div>
          </CardContent>
        </Card>

        {/* KPI 4: Tasa de Rechazos e Incidencias */}
        <Card className="border-slate-200 shadow-xs dark:border-slate-800">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Rechazos / Incidencias
              </span>
              <div className="flex size-7 items-center justify-center rounded-md bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400">
                <ShieldAlert className="size-4" />
              </div>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-50">
                {kpisConsolidados.paradasRechazadas}
                <span className="text-sm font-normal text-slate-400 dark:text-slate-500">
                  {' '}({kpisConsolidados.rechazoRate}%)
                </span>
              </span>
              <Badge variant="outline" className="text-[10px] font-bold border-rose-300 text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300">
                Bajo Control
              </Badge>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-1.5">
              <span>{incidentesVivos.length} incidentes reportados</span>
              <span className="font-semibold text-rose-600 dark:text-rose-400">Max tol: 4.0%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── FILA 2: GRÁFICOS PRINCIPALES (RITMO HORARIO & MEDIOS DE PAGO) ── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* GRÁFICO 1: Ritmo de Entregas por Hora & Tiempo de Parada (2 columnas en LG) */}
        <Card className="border-slate-200 shadow-xs lg:col-span-2 dark:border-slate-800">
          <CardHeader className="p-3.5 pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Clock className="size-4 text-blue-600" />
                  Ritmo de Entregas por Hora y Tiempo de Atención
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                  Barras: Cantidad de paradas completadas por hora | Línea: Tiempo promedio de descarga/atención (minutos).
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  <span className="size-2.5 rounded-xs bg-blue-500" /> Entregas
                </span>
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  <span className="size-2.5 rounded-full bg-amber-500" /> Dwell Time (min)
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3.5 pt-1">
            <div className="h-[230px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dataRitmoHorario} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.6} />
                  <XAxis
                    dataKey="hora"
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                  />
                  <YAxis
                    yAxisId="left"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: '#f59e0b' }}
                    unit="m"
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      const entregas = payload.find((p) => p.dataKey === 'entregas')?.value
                      const tiempo = payload.find((p) => p.dataKey === 'tiempoPromedioMin')?.value
                      return (
                        <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-md text-xs dark:border-slate-700 dark:bg-slate-900">
                          <p className="font-bold text-slate-900 dark:text-slate-100">Franja: {label}</p>
                          <div className="mt-1 space-y-1">
                            <p className="text-blue-600 dark:text-blue-400 font-medium">
                              📦 Paradas Entregadas: <span className="font-bold">{String(entregas)} pedidos</span>
                            </p>
                            <p className="text-amber-600 dark:text-amber-400 font-medium">
                              ⏱️ Tiempo Promedio: <span className="font-bold">{String(tiempo)} minutos</span>
                            </p>
                          </div>
                        </div>
                      )
                    }}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="entregas"
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={38}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="tiempoPromedioMin"
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: '#f59e0b' }}
                    activeDot={{ r: 6 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* GRÁFICO 2: Medios de Recaudación en Ruta (Donut 1 columna) */}
        <Card className="border-slate-200 shadow-xs dark:border-slate-800">
          <CardHeader className="p-3.5 pb-2">
            <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Banknote className="size-4 text-emerald-600" />
              Medios de Pago del Turno
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
              Desglose en vivo de dinero recaudado en mano por los choferes.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3.5 pt-1">
            <div className="h-[155px] w-full relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={dataMediosPago}
                    innerRadius={48}
                    outerRadius={72}
                    paddingAngle={3}
                    dataKey="monto"
                  >
                    {dataMediosPago.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: any) => [
                      `Bs. ${Number(val || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                      'Monto',
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Centro del Donut */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] uppercase font-bold text-slate-400">Total Cobrado</span>
                <span className="text-xs font-black text-slate-900 dark:text-slate-100">
                  Bs. {(kpisConsolidados.totalMontoRecaudado / 1000).toFixed(1)}k
                </span>
              </div>
            </div>

            {/* Leyenda y Montos */}
            <div className="mt-1 space-y-1.5 border-t border-slate-100 dark:border-slate-800 pt-2 text-xs">
              {dataMediosPago.map((item) => {
                const pct = ((item.monto / (kpisConsolidados.totalMontoRecaudado || 1)) * 100).toFixed(0)
                const IconComponent = item.icon
                return (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
                      <IconComponent className="size-3.5 text-slate-500" />
                      <span className="text-slate-600 dark:text-slate-400 font-medium">{item.name} ({pct}%)</span>
                    </div>
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      Bs. {item.monto.toLocaleString('es-BO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── FILA 3: GRÁFICO COMPACTO TOP 5 CHOFERES & PARETO DE RECHAZOS ── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* GRÁFICO 3: Rendimiento Focalizado (Top 5 en Riesgo / Top 5 Líderes + Modal de 40) */}
        <Card className="border-slate-200 shadow-xs dark:border-slate-800">
          <CardHeader className="p-3.5 pb-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Truck className="size-4 text-indigo-600" />
                  Rendimiento Focalizado de Flota
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                  Gestión por excepción de los 40 camiones activos en ruta.
                </CardDescription>
              </div>

              {/* Toggle de Selección: 5 en Riesgo vs Top 5 Avance vs Ver los 40 */}
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setDriverViewMode('ATRASO')}
                  className={cn(
                    'px-2 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1',
                    driverViewMode === 'ATRASO'
                      ? 'bg-rose-50 text-rose-700 shadow-xs border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-900'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  )}
                >
                  <Flame className="size-3 text-rose-500" />
                  <span>5 en Riesgo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDriverViewMode('AVANCE')}
                  className={cn(
                    'px-2 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1',
                    driverViewMode === 'AVANCE'
                      ? 'bg-emerald-50 text-emerald-700 shadow-xs border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  )}
                >
                  <TrendingUp className="size-3 text-emerald-500" />
                  <span>Top 5 Avance</span>
                </button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsFleetModalOpen(true)}
                  className="h-6 px-2 text-[11px] text-slate-600 hover:text-indigo-600 dark:text-slate-300 cursor-pointer"
                  title="Ver los 40 camiones"
                >
                  <Maximize2 className="size-3 mr-1" />
                  <span>Ver 40</span>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3.5 pt-1">
            {/* Gráfico de Barras Horizontales Top 5 */}
            <div className="h-[185px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dataTop5Choferes}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" opacity={0.6} />
                  <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis
                    type="category"
                    dataKey="nombreCorto"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                    width={90}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0].payload
                      return (
                        <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-md text-xs dark:border-slate-700 dark:bg-slate-900">
                          <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-1 mb-1">
                            <span className="font-bold text-slate-900 dark:text-slate-100">
                              {d.nombre}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px] font-bold',
                                d.estado === 'RIESGO' && 'border-rose-300 text-rose-700 bg-rose-50',
                                d.estado === 'OBSERVADO' && 'border-amber-300 text-amber-700 bg-amber-50',
                                d.estado === 'OPTIMO' && 'border-emerald-300 text-emerald-700 bg-emerald-50'
                              )}
                            >
                              🚛 {d.camion} · {d.eficienciaPct}%
                            </Badge>
                          </div>
                          <div className="space-y-0.5 text-[11px]">
                            <p className="text-emerald-600 font-medium">✅ Entregadas: {d.entregadas} de {d.total} paradas</p>
                            <p className="text-slate-500">⏳ Pendientes: {d.pendientes} paradas</p>
                            {d.rechazadas > 0 && <p className="text-rose-500 font-semibold">❌ Rechazos: {d.rechazadas} paradas</p>}
                            <p className="text-amber-600 font-semibold mt-1">⏱️ Dwell time prom: {d.dwellTimeMin} min/parada</p>
                          </div>
                        </div>
                      )
                    }}
                  />
                  <Bar dataKey="entregadas" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="pendientes" stackId="a" fill="#cbd5e1" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="rechazadas" stackId="a" fill="#f43f5e" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Barra Inferior: Radiografía Compacta de los 40 Camiones */}
            <div className="mt-2 flex flex-col sm:flex-row items-center justify-between gap-1.5 rounded-lg bg-slate-50 p-2 text-xs border border-slate-100 dark:bg-slate-800/60 dark:border-slate-800">
              <span className="font-semibold text-slate-700 dark:text-slate-300 text-[11px]">
                Salud de Flota (40 camiones):
              </span>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                  <span className="size-2 rounded-full bg-emerald-500" />
                  {resumenFlota.optimos} Óptimos (&gt;75%)
                </span>
                <span className="flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
                  <span className="size-2 rounded-full bg-amber-500" />
                  {resumenFlota.observados} Observados
                </span>
                <span className="flex items-center gap-1 font-bold text-rose-700 dark:text-rose-400">
                  <span className="size-2 rounded-full bg-rose-500" />
                  {resumenFlota.riesgo} En Riesgo
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* GRÁFICO 4: Pareto de Motivos de Rechazo e Incidencias */}
        <Card className="border-slate-200 shadow-xs dark:border-slate-800">
          <CardHeader className="p-3.5 pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <ShieldAlert className="size-4 text-rose-600" />
                  Top Motivos de Rechazo y Devolución en Ruta
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                  Causas raíz de no entrega registradas por los choferes en la aplicación móvil.
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-[10px] border-slate-300 text-slate-600">
                Pareto 80/20
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-3.5 pt-1">
            <div className="h-[210px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dataMotivosRechazo} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.6} />
                  <XAxis
                    dataKey="motivo"
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    interval={0}
                    tickFormatter={(val) => (val.length > 12 ? val.substring(0, 10) + '…' : val)}
                  />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0].payload
                      return (
                        <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-md text-xs dark:border-slate-700 dark:bg-slate-900">
                          <p className="font-bold text-slate-900 dark:text-slate-100">{d.motivo}</p>
                          <p className="text-rose-600 font-semibold mt-1">
                            {d.cantidad} pedidos rechazados ({d.pct}% del total)
                          </p>
                        </div>
                      )
                    }}
                  />
                  <Bar dataKey="cantidad" radius={[4, 4, 0, 0]} maxBarSize={36}>
                    {dataMotivosRechazo.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── FILA 4: FEED DE INCIDENTES Y DESCUADRES EN TIEMPO REAL ── */}
      <Card className="border-slate-200 shadow-xs dark:border-slate-800">
        <CardHeader className="p-3.5 pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-500" />
                Bitácora de Incidentes Críticos y Desvíos del Turno
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                Alertas operativas registradas en calle que requieren atención o seguimiento.
              </CardDescription>
            </div>
            <span className="text-xs font-semibold text-slate-500">
              {incidentesVivos.length} eventos activos
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-3.5 pt-0">
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {incidentesVivos.map((inc) => (
              <div
                key={inc.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-2.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 rounded-md px-1.5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] font-bold shrink-0',
                      inc.severidad === 'ALTA' && 'border-rose-300 text-rose-700 bg-rose-50 dark:bg-rose-950/40',
                      inc.severidad === 'MEDIA' && 'border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/40',
                      inc.severidad === 'BAJA' && 'border-blue-300 text-blue-700 bg-blue-50 dark:bg-blue-950/40'
                    )}
                  >
                    {inc.severidad}
                  </Badge>
                  <span className="font-mono text-slate-400 text-[11px]">{inc.hora}</span>
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{inc.cliente}</span>
                    <span className="text-slate-400 mx-1.5">·</span>
                    <span className="text-slate-600 dark:text-slate-400">{inc.motivo}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  <span className="text-slate-500 font-mono text-[11px]">
                    🚛 {inc.camion} ({inc.chofer.split(' ')[0]})
                  </span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    Bs. {inc.monto.toLocaleString('es-BO', { minimumFractionDigits: 2 })}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/50 cursor-pointer"
                    onClick={() => navigateTo('monitoreo-detalle', { ordenId: inc.otId })}
                  >
                    <Eye className="size-3 mr-1" /> Ver en Mapa
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── MODAL: RADIOGRAFÍA DE LOS 40 CAMIONES EN RUTA ── */}
      <Dialog open={isFleetModalOpen} onOpenChange={setIsFleetModalOpen}>
        <DialogContent className="w-[94vw] sm:max-w-4xl lg:max-w-5xl max-h-[85vh] flex flex-col p-0 overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800">
          <DialogHeader className="p-4 pb-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Truck className="size-5 text-indigo-600 dark:text-indigo-400" />
                  Rendimiento y Avance de la Flota Completa (40 Camiones en Ruta)
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                  Desglose individual del avance de paradas, nivel de efectividad y tiempo de atención en cliente en tiempo real.
                </DialogDescription>
              </div>
            </div>

            {/* Filtros dentro del Modal */}
            <div className="mt-3 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <Input
                  placeholder="Buscar por nombre de chofer o placa..."
                  value={fleetSearchTerm}
                  onChange={(e) => setFleetSearchTerm(e.target.value)}
                  className="h-8 pl-9 text-xs bg-white dark:bg-slate-900"
                />
                {fleetSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setFleetSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              {/* Segmentos de estado */}
              <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFleetFilterStatus('ALL')}
                  className={cn(
                    'h-8 px-2.5 text-xs font-medium cursor-pointer transition-all',
                    fleetFilterStatus === 'ALL'
                      ? 'bg-slate-900 text-white font-semibold dark:bg-slate-100 dark:text-slate-900 border-slate-900 dark:border-slate-100'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  )}
                >
                  Todos ({flotaCompleta40.length})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFleetFilterStatus('RIESGO')}
                  className={cn(
                    'h-8 px-2.5 text-xs font-medium cursor-pointer transition-all',
                    fleetFilterStatus === 'RIESGO'
                      ? 'bg-rose-600 text-white font-semibold border-rose-600'
                      : 'text-rose-700 border-rose-200 hover:bg-rose-50 dark:text-rose-400 dark:border-rose-900 dark:hover:bg-rose-950/40'
                  )}
                >
                  🔴 En Riesgo ({resumenFlota.riesgo})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFleetFilterStatus('OBSERVADO')}
                  className={cn(
                    'h-8 px-2.5 text-xs font-medium cursor-pointer transition-all',
                    fleetFilterStatus === 'OBSERVADO'
                      ? 'bg-amber-600 text-white font-semibold border-amber-600'
                      : 'text-amber-700 border-amber-200 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-900 dark:hover:bg-amber-950/40'
                  )}
                >
                  🟡 Observados ({resumenFlota.observados})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFleetFilterStatus('OPTIMO')}
                  className={cn(
                    'h-8 px-2.5 text-xs font-medium cursor-pointer transition-all',
                    fleetFilterStatus === 'OPTIMO'
                      ? 'bg-emerald-600 text-white font-semibold border-emerald-600'
                      : 'text-emerald-700 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-900 dark:hover:bg-emerald-950/40'
                  )}
                >
                  🟢 Óptimos ({resumenFlota.optimos})
                </Button>
              </div>
            </div>
          </DialogHeader>

          {/* Tabla de los 40 Choferes */}
          <div className="flex-1 overflow-y-auto p-4 pt-2">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 dark:bg-slate-800/80 dark:border-slate-800 text-[11px]">
                    <th className="py-2.5 px-3 font-semibold">Chofer</th>
                    <th className="py-2.5 px-3 font-semibold">Camión</th>
                    <th className="py-2.5 px-3 font-semibold">Paradas Entregadas</th>
                    <th className="py-2.5 px-3 font-semibold">Progreso de Ruta</th>
                    <th className="py-2.5 px-3 font-semibold">Dwell Time</th>
                    <th className="py-2.5 px-3 font-semibold">Estado</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {flotaFiltradaModal.map((f) => (
                    <tr key={f.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-200">
                        {f.nombre}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-600 dark:text-slate-400">
                        🚛 {f.camion}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {f.entregadas} de {f.total}
                        </span>
                        {f.rechazadas > 0 && (
                          <span className="text-[10px] text-rose-600 font-bold ml-1.5 bg-rose-50 dark:bg-rose-950/50 px-1 py-0.5 rounded">
                            {f.rechazadas} rechazo{f.rechazadas > 1 ? 's' : ''}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 flex">
                            <div
                              style={{ width: `${f.eficienciaPct}%` }}
                              className={cn(
                                'h-full rounded-full transition-all',
                                f.estado === 'OPTIMO' && 'bg-emerald-500',
                                f.estado === 'OBSERVADO' && 'bg-amber-500',
                                f.estado === 'RIESGO' && 'bg-rose-500'
                              )}
                            />
                          </div>
                          <span className="font-bold text-[11px] w-9">{f.eficienciaPct}%</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        <span
                          className={cn(
                            'font-semibold',
                            f.dwellTimeMin >= 20
                              ? 'text-rose-600 dark:text-rose-400 font-bold'
                              : f.dwellTimeMin >= 15
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-600 dark:text-slate-400'
                          )}
                        >
                          ⏱️ {f.dwellTimeMin} min/p
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] font-bold',
                            f.estado === 'OPTIMO' && 'border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40',
                            f.estado === 'OBSERVADO' && 'border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/40',
                            f.estado === 'RIESGO' && 'border-rose-300 text-rose-700 bg-rose-50 dark:bg-rose-950/40'
                          )}
                        >
                          {f.estado === 'OPTIMO' ? '🟢 Óptimo' : f.estado === 'OBSERVADO' ? '🟡 Observado' : '🔴 En Riesgo'}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2.5 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/50 cursor-pointer font-semibold"
                          onClick={() => {
                            setIsFleetModalOpen(false)
                            navigateTo('monitoreo-detalle', { ordenId: f.ordenId })
                          }}
                        >
                          <Eye className="size-3.5 mr-1" /> Ver en Mapa
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer del Modal */}
          <div className="p-3 px-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between text-xs text-slate-500">
            <span>Mostrando <strong>{flotaFiltradaModal.length}</strong> de {flotaCompleta40.length} camiones</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsFleetModalOpen(false)}
              className="h-7 px-3 text-xs cursor-pointer"
            >
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
