import { useState, useMemo, useEffect } from 'react'
import {
  Building2,
  CheckCircle2,
  Globe2,
  Info,
  LandPlot,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
  ArrowRight,
  Database,
  Radio,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  consultarDistribuidorasSap,
  type SapDistribuidora,
} from './sap-distribuidoras'
import type { Distribuidora } from './distribuidoras-store'
import { CIUDAD_META, type CiudadId, cityIdDe } from '../mock-data'

interface SapDistribuidorasModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  ciudad: CiudadId
  distribuidorasEnDb: Distribuidora[]
  onImportar: (sapItem: SapDistribuidora) => void
  onCrearManual: () => void
}

type TabFiltro = 'PENDIENTES' | 'ALL' | 'IMPORTADAS'

export function SapDistribuidorasModal({
  open,
  onOpenChange,
  ciudad,
  distribuidorasEnDb,
  onImportar,
  onCrearManual,
}: SapDistribuidorasModalProps) {
  const currentCityId = cityIdDe(ciudad)
  const [loading, setLoading] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  // PRIORIZAR LO QUE VIENE DE SAP PENDIENTE DE IMPORTAR
  const [tabFiltro, setTabFiltro] = useState<TabFiltro>('PENDIENTES')
  const [seleccionada, setSeleccionada] = useState<SapDistribuidora | null>(null)
  const [sapItems, setSapItems] = useState<SapDistribuidora[]>([])

  // Identificar cuáles de SAP ya existen en la DB local por nombre exacto
  const itemsConEstado = useMemo(() => {
    return sapItems.map((item) => {
      const yaEnDb = distribuidorasEnDb.find(
        (db) =>
          db.cityId === item.cityId &&
          db.name.trim().toLowerCase() === item.name.trim().toLowerCase(),
      )
      return {
        ...item,
        estaEnDb: !!yaEnDb,
        dbId: yaEnDb?.id,
        dbNombre: yaEnDb?.name,
      }
    })
  }, [sapItems, distribuidorasEnDb])

  // Cargar centros de SAP y preseleccionar la primera pendiente
  useEffect(() => {
    if (open) {
      setLoading(true)
      consultarDistribuidorasSap(currentCityId)
        .then((items) => {
          setSapItems(items)
          // Preseleccionar la primera disponible que no esté en la DB
          const primeraPendiente = items.find(
            (it) =>
              !distribuidorasEnDb.some(
                (db) =>
                  db.cityId === it.cityId &&
                  db.name.trim().toLowerCase() === it.name.trim().toLowerCase(),
              ),
          )
          setSeleccionada(primeraPendiente ?? items[0] ?? null)
        })
        .finally(() => {
          setLoading(false)
        })
    }
  }, [open, currentCityId, distribuidorasEnDb])

  const refrescarSap = () => {
    setLoading(true)
    consultarDistribuidorasSap(currentCityId)
      .then((items) => {
        setSapItems(items)
        const primeraPendiente = items.find(
          (it) =>
            !distribuidorasEnDb.some(
              (db) =>
                db.cityId === it.cityId &&
                db.name.trim().toLowerCase() === it.name.trim().toLowerCase(),
            ),
        )
        setSeleccionada(primeraPendiente ?? items[0] ?? null)
      })
      .finally(() => {
        setLoading(false)
      })
  }

  // Filtrado por texto y tabs
  const itemsFiltrados = useMemo(() => {
    return itemsConEstado.filter((item) => {
      if (tabFiltro === 'PENDIENTES' && item.estaEnDb) return false
      if (tabFiltro === 'IMPORTADAS' && !item.estaEnDb) return false

      if (!busqueda.trim()) return true
      const q = busqueda.toLowerCase()
      return (
        item.sapCode.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.address.toLowerCase().includes(q) ||
        item.plantType.toLowerCase().includes(q)
      )
    })
  }, [itemsConEstado, tabFiltro, busqueda])

  const totalPendientes = itemsConEstado.filter((i) => !i.estaEnDb).length
  const totalImportadas = itemsConEstado.filter((i) => i.estaEnDb).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[min(960px,calc(100vw-2rem))] max-w-none sm:max-w-none max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl rounded-2xl"
        aria-describedby="sap-modal-description"
      >
        {/* ── CABECERA SAP S/4HANA ──────────────────────────────────────────────── */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-900 text-white shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white font-bold shadow-md shadow-blue-500/20">
                <Globe2 className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-tight">
                    Incorporar Distribuidora desde SAP ERP
                  </DialogTitle>
                  <Badge className="bg-blue-500/20 text-blue-300 border-blue-400/30 text-[10px] font-mono">
                    SAP S/4HANA RFC/OData
                  </Badge>
                </div>
                <DialogDescription id="sap-modal-description" className="text-xs text-slate-300 mt-0.5">
                  Selecciona una distribuidora/planta de SAP para guardarla en tu base de datos y delimitar su zona de cobertura en{' '}
                  <strong className="text-white font-semibold">{CIUDAD_META[ciudad].label}</strong>.
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <Badge variant="outline" className="border-slate-700 bg-slate-800/80 text-slate-300 text-xs font-mono py-1 px-2.5">
                <MapPin className="h-3 w-3 mr-1 text-emerald-400" />
                {CIUDAD_META[ciudad].label}
              </Badge>

              <Button
                variant="outline"
                size="sm"
                onClick={refrescarSap}
                disabled={loading}
                className="h-8 border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white text-xs gap-1.5 cursor-pointer"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin text-blue-400')} />
                <span>Consultar SAP</span>
              </Button>
            </div>
          </div>
        </div>

        {/* ── BARRA DE BÚSQUEDA Y FILTROS RÁPIDOS ───────────────────────────────── */}
        <div className="p-3 sm:px-5 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/60 flex flex-col sm:flex-row items-center justify-between gap-2.5 shrink-0">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por código SAP, nombre o dirección..."
              className="h-8 pl-8 text-xs bg-white dark:bg-slate-800"
            />
          </div>

          <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
            <button
              onClick={() => setTabFiltro('PENDIENTES')}
              className={cn(
                'px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5',
                tabFiltro === 'PENDIENTES'
                  ? 'bg-blue-600 text-white font-bold shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900/60 hover:bg-blue-50/50',
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Pendientes de Importar ({totalPendientes})</span>
            </button>
            <button
              onClick={() => setTabFiltro('ALL')}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap',
                tabFiltro === 'ALL'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-bold'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100',
              )}
            >
              Todos en SAP ({itemsConEstado.length})
            </button>
            <button
              onClick={() => setTabFiltro('IMPORTADAS')}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1',
                tabFiltro === 'IMPORTADAS'
                  ? 'bg-emerald-600 text-white font-bold shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60 hover:bg-emerald-50/50',
              )}
            >
              <CheckCircle2 className="h-3 w-3" />
              <span>Ya en DB ({totalImportadas})</span>
            </button>
          </div>
        </div>

        {/* ── CUERPO CON LA LISTA DE DISTRIBUIDORAS SAP ────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-2.5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
              <div className="h-10 w-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Consultando centros disponibles en SAP ERP...
              </p>
            </div>
          ) : itemsFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500 space-y-2">
              <Building2 className="h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="text-xs">No hay centros logísticos en SAP para este filtro.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5">
              {itemsFiltrados.map((item) => {
                const esSeleccionada = seleccionada?.sapCode === item.sapCode
                return (
                  <div
                    key={item.sapCode}
                    onClick={() => {
                      if (!item.estaEnDb) {
                        setSeleccionada(item)
                      }
                    }}
                    className={cn(
                      'rounded-xl border p-3 sm:p-3.5 transition-all relative flex flex-col sm:flex-row sm:items-center justify-between gap-3',
                      item.estaEnDb
                        ? 'border-slate-200 bg-slate-50/70 opacity-75 dark:border-slate-800 dark:bg-slate-900/40 cursor-default'
                        : esSeleccionada
                          ? 'border-blue-600 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/40 ring-2 ring-blue-500/30 cursor-pointer shadow-sm'
                          : 'border-slate-200 hover:border-blue-300 bg-white dark:border-slate-800 dark:bg-slate-900 cursor-pointer hover:shadow-xs',
                    )}
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {/* Radio o Icono de Estado */}
                      <div className="pt-0.5 shrink-0">
                        {item.estaEnDb ? (
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </div>
                        ) : (
                          <div
                            className={cn(
                              'flex h-5 w-5 items-center justify-center rounded-full border transition-all',
                              esSeleccionada
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800',
                            )}
                          >
                            {esSeleccionada && <div className="h-2 w-2 rounded-full bg-white" />}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-[11px] font-bold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.2 rounded border border-blue-200 dark:border-blue-900/60">
                            {item.sapCode}
                          </span>
                          <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                            {item.name}
                          </h4>
                          <Badge variant="secondary" className="text-[10px] font-medium py-0 px-1.5">
                            {item.plantType}
                          </Badge>
                        </div>

                        <p className="text-[11.5px] text-slate-600 dark:text-slate-400 flex items-center gap-1.5 truncate">
                          <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                          <span className="truncate">{item.address}</span>
                        </p>

                        <div className="flex items-center gap-3 text-[10.5px] text-slate-500 font-mono flex-wrap">
                          <span>
                            GPS: <strong className="text-slate-700 dark:text-slate-300">{item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Capacidad: <strong className="text-slate-700 dark:text-slate-300">{item.capacityPlts} plts</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Org: <span className="text-slate-600 dark:text-slate-400 font-sans">{item.sapOrgVentas}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Estado o Botón de Selección */}
                    <div className="shrink-0 flex items-center sm:flex-col sm:items-end justify-between gap-2 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 dark:border-slate-800">
                      {item.estaEnDb ? (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/60 px-2.5 py-1 rounded-lg">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Ya en tu DB</span>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant={esSeleccionada ? 'default' : 'outline'}
                          onClick={(e) => {
                            e.stopPropagation()
                            setSeleccionada(item)
                          }}
                          className={cn(
                            'h-7 text-xs font-semibold px-2.5 cursor-pointer',
                            esSeleccionada
                              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                              : 'text-slate-700 hover:text-blue-600',
                          )}
                        >
                          {esSeleccionada ? '✓ Seleccionada' : 'Seleccionar'}
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── FOOTER CON ACCIONES Y BOTÓN DE TRAZO DE ZONA ─────────────────────── */}
        <div className="p-3.5 sm:px-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Info className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span>
              {seleccionada ? (
                <>
                  Seleccionado: <strong className="text-slate-900 dark:text-slate-100">{seleccionada.name}</strong> ({seleccionada.sapCode})
                </>
              ) : (
                'Selecciona una distribuidora de SAP para continuar'
              )}
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-8.5 text-xs cursor-pointer"
            >
              Cancelar
            </Button>

            <Button
              size="sm"
              disabled={!seleccionada}
              onClick={() => {
                if (seleccionada) {
                  onImportar(seleccionada)
                  onOpenChange(false)
                }
              }}
              className="h-8.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 shadow-sm shadow-emerald-600/20 cursor-pointer"
            >
              <LandPlot className="h-3.5 w-3.5" />
              <span>Trazar Zona</span>
              <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
