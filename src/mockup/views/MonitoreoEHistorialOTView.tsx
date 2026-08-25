import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import {
  Activity,
  ClipboardCheck,
  FileClock,
  Radio,
  ShieldCheck,
  Truck,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { MonitoreoView } from '../monitoreo/MonitoreoView'
import { HistorialOrdenesTransporteView } from './HistorialOrdenesTransporteView'
import { HistorialRevisionesView } from './HistorialRevisionesView'
import { useFlotaViva } from '../monitoreo/use-flota-viva'
import { HISTORIAL_ORDENES_TRANSPORTE } from '../historial-orders-data'
import { HISTORIAL_REVISIONES_DATA } from '../historial-revisiones-data'

export type MasterTab = 'LIVE' | 'HISTORY' | 'AUDIT'

interface MonitoreoEHistorialOTViewProps {
  initialTab?: MasterTab
}

export function MonitoreoEHistorialOTView({ initialTab }: MonitoreoEHistorialOTViewProps) {
  const [searchParams, setSearchParams] = useSearchParams()

  // Determinar pestaña activa: prop > URL query ?tab > default 'LIVE'
  const resolveTabFromUrl = (): MasterTab => {
    if (initialTab) return initialTab
    const tabParam = searchParams.get('tab')?.toUpperCase()
    if (tabParam === 'LIVE' || tabParam === 'HISTORY' || tabParam === 'AUDIT') {
      return tabParam as MasterTab
    }
    return 'LIVE'
  }

  const [activeTab, setActiveTab] = useState<MasterTab>(resolveTabFromUrl)

  // Sincronizar estado cuando cambie el query param
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab')?.toUpperCase()
    if (tabFromUrl === 'LIVE' || tabFromUrl === 'HISTORY' || tabFromUrl === 'AUDIT') {
      setActiveTab(tabFromUrl as MasterTab)
    }
  }, [searchParams])

  const handleTabChange = (newTab: MasterTab) => {
    setActiveTab(newTab)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', newTab.toLowerCase())
      return next
    })
  }

  // Contadores vivos para los badges de las pestañas
  const { filas: flotaViva } = useFlotaViva()
  const enRutaCount = flotaViva.filter((f) => f.estadoViaje === 'en_ruta').length
  const totalFlotaCount = flotaViva.length

  const historialCount = HISTORIAL_ORDENES_TRANSPORTE.length
  const revisionesCount = HISTORIAL_REVISIONES_DATA.length

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      {/* ── BARRA SUPERIOR DE PESTAÑAS MAESTRAS (3 LENTES OPERATIVOS) ── */}
      <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          {/* Selector de Pestañas con Iconos y Badges */}
          <div
            role="tablist"
            aria-label="Lentes de Monitoreo e Historial de OT"
            className="flex flex-wrap items-center gap-1.5"
          >
            {/* ── TAB 1: EN VIVO (RUTA ACTIVA) ── */}
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'LIVE'}
              onClick={() => handleTabChange('LIVE')}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer border',
                activeTab === 'LIVE'
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-xs dark:border-indigo-500 dark:bg-indigo-950/50 dark:text-indigo-200'
                  : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
              )}
            >
              <div className="relative flex items-center">
                <Radio className={cn('size-3.5', activeTab === 'LIVE' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400')} />
                <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              </div>
              <span>Monitoreo en Vivo</span>
              <Badge
                variant="secondary"
                className={cn(
                  'text-[10px] py-0 px-1.5 font-bold',
                  activeTab === 'LIVE'
                    ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                )}
              >
                {enRutaCount} en ruta / {totalFlotaCount}
              </Badge>
            </button>

            {/* ── TAB 2: HISTORIAL Y LIQUIDACIÓN ── */}
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'HISTORY'}
              onClick={() => handleTabChange('HISTORY')}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer border',
                activeTab === 'HISTORY'
                  ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-xs dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-200'
                  : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
              )}
            >
              <FileClock className={cn('size-3.5', activeTab === 'HISTORY' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400')} />
              <span>Historial y Liquidación</span>
              <Badge
                variant="secondary"
                className={cn(
                  'text-[10px] py-0 px-1.5 font-bold',
                  activeTab === 'HISTORY'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                )}
              >
                {historialCount} viajes
              </Badge>
            </button>

            {/* ── TAB 3: AUDITORÍA DE CARGA (RAMPA) ── */}
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'AUDIT'}
              onClick={() => handleTabChange('AUDIT')}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer border',
                activeTab === 'AUDIT'
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-700 shadow-xs dark:border-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-200'
                  : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
              )}
            >
              <ShieldCheck className={cn('size-3.5', activeTab === 'AUDIT' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400')} />
              <span>Auditoría de Carga (Rampa)</span>
              <Badge
                variant="secondary"
                className={cn(
                  'text-[10px] py-0 px-1.5 font-bold',
                  activeTab === 'AUDIT'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                )}
              >
                {revisionesCount} auditadas
              </Badge>
            </button>
          </div>

          {/* Breve descripción contextual del lente activo */}
          <div className="hidden lg:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            {activeTab === 'LIVE' && (
              <span>🔴 Señal GPS y avance de paradas en tiempo real</span>
            )}
            {activeTab === 'HISTORY' && (
              <span>📋 Rendición de viajes cerrados, cobros y PODs</span>
            )}
            {activeTab === 'AUDIT' && (
              <span>🛡️ Conciliación de inventario inicial y actas de rampa</span>
            )}
          </div>
        </div>
      </div>

      {/* ── CONTENIDO DINÁMICO SEGÚN LA PESTAÑA ACTIVA ── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {activeTab === 'LIVE' && <MonitoreoView />}
        {activeTab === 'HISTORY' && <HistorialOrdenesTransporteView />}
        {activeTab === 'AUDIT' && <HistorialRevisionesView />}
      </div>
    </div>
  )
}
