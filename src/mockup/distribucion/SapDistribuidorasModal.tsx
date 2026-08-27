import { useState, useMemo, useEffect } from 'react'
import {
  Building2,
  CheckCircle2,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
  ArrowRight,
  Plus,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
        className="w-[min(940px,calc(100vw-2rem))] max-w-none sm:max-w-none max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden border-border bg-card shadow-2xl rounded-2xl"
        aria-describedby="sap-modal-description"
      >
        {/* ── Encabezado Limpio ─────────────────────────────────────────────────── */}
        <DialogHeader className="p-4 sm:px-6 border-b border-border bg-muted/20 flex flex-row items-center justify-between shrink-0 space-y-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">
              <Building2 className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                Crear nuevo centro de distribución
              </DialogTitle>
              <DialogDescription id="sap-modal-description" className="sr-only">
                Selecciona un centro de distribución desde SAP o créalo manualmente.
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-medium px-2 py-0.5">
              <MapPin className="h-3 w-3 mr-1 text-primary" />
              {CIUDAD_META[ciudad].label}
            </Badge>

            <Button
              variant="ghost"
              size="sm"
              onClick={refrescarSap}
              disabled={loading}
              className="h-7 px-2 text-xs gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
              title="Consultar SAP"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin text-primary')} />
              <span>Sincronizar SAP</span>
            </Button>
          </div>
        </DialogHeader>

        {/* ── Filtros y Buscador ────────────────────────────────────────────────── */}
        <div className="p-3 sm:px-6 border-b border-border/80 bg-background/50 flex flex-col sm:flex-row items-center justify-between gap-2.5 shrink-0">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por código o nombre…"
              className="h-8 pl-8 text-xs bg-background"
            />
          </div>

          <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
            <button
              type="button"
              onClick={() => setTabFiltro('PENDIENTES')}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5',
                tabFiltro === 'PENDIENTES'
                  ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                  : 'bg-muted/40 hover:bg-muted text-muted-foreground',
              )}
            >
              <Sparkles className="h-3 w-3" />
              <span>Pendientes ({totalPendientes})</span>
            </button>
            <button
              type="button"
              onClick={() => setTabFiltro('ALL')}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap',
                tabFiltro === 'ALL'
                  ? 'bg-foreground text-background font-bold shadow-xs'
                  : 'bg-muted/40 hover:bg-muted text-muted-foreground',
              )}
            >
              Todos ({itemsConEstado.length})
            </button>
            <button
              type="button"
              onClick={() => setTabFiltro('IMPORTADAS')}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1',
                tabFiltro === 'IMPORTADAS'
                  ? 'bg-emerald-600 text-white font-bold shadow-xs'
                  : 'bg-muted/40 hover:bg-muted text-muted-foreground',
              )}
            >
              <CheckCircle2 className="h-3 w-3" />
              <span>En BD ({totalImportadas})</span>
            </button>
          </div>
        </div>

        {/* ── Tabla de Centros de Distribución ──────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:px-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
              <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-muted-foreground">
                Consultando centros de distribución en SAP ERP…
              </p>
            </div>
          ) : itemsFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center text-muted-foreground space-y-2">
              <Building2 className="h-8 w-8 opacity-40" />
              <p className="text-xs">No hay centros de distribución disponibles para este filtro.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-10 text-center py-2 px-2"></TableHead>
                    <TableHead className="w-28 text-xs font-semibold py-2 px-3">Código SAP</TableHead>
                    <TableHead className="text-xs font-semibold py-2 px-3">Centro de Distribución</TableHead>
                    <TableHead className="w-36 text-xs font-semibold py-2 px-3">Tipo</TableHead>
                    <TableHead className="w-28 text-xs font-semibold py-2 px-3">Capacidad</TableHead>
                    <TableHead className="w-28 text-center text-xs font-semibold py-2 px-3">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemsFiltrados.map((item) => {
                    const esSeleccionada = seleccionada?.sapCode === item.sapCode
                    return (
                      <TableRow
                        key={item.sapCode}
                        onClick={() => {
                          if (!item.estaEnDb) {
                            setSeleccionada(item)
                          }
                        }}
                        className={cn(
                          'transition-colors text-xs',
                          item.estaEnDb
                            ? 'opacity-60 bg-muted/20 cursor-default'
                            : esSeleccionada
                              ? 'bg-primary/10 hover:bg-primary/15 font-medium cursor-pointer'
                              : 'hover:bg-muted/40 cursor-pointer',
                        )}
                      >
                        {/* Selector Radio */}
                        <TableCell className="text-center py-2 px-2">
                          <div className="flex items-center justify-center">
                            {item.estaEnDb ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <div
                                className={cn(
                                  'flex h-4 w-4 items-center justify-center rounded-full border transition-all',
                                  esSeleccionada
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-muted-foreground/40 bg-background',
                                )}
                              >
                                {esSeleccionada && <div className="h-1.5 w-1.5 rounded-full bg-background" />}
                              </div>
                            )}
                          </div>
                        </TableCell>

                        {/* Código SAP */}
                        <TableCell className="font-mono font-bold text-primary py-2 px-3">
                          {item.sapCode}
                        </TableCell>

                        {/* Nombre y Dirección */}
                        <TableCell className="py-2 px-3">
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-foreground truncate">
                              {item.name}
                            </span>
                            <span className="text-[11px] text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                              <MapPin className="h-2.5 w-2.5 shrink-0" />
                              {item.address}
                            </span>
                          </div>
                        </TableCell>

                        {/* Tipo de Planta */}
                        <TableCell className="py-2 px-3">
                          <Badge variant="secondary" className="text-[10.5px] font-normal py-0 px-1.5">
                            {item.plantType}
                          </Badge>
                        </TableCell>

                        {/* Capacidad */}
                        <TableCell className="py-2 px-3 tabular-nums font-mono text-muted-foreground">
                          {item.capacityPlts} plts
                        </TableCell>

                        {/* Estado */}
                        <TableCell className="text-center py-2 px-3">
                          {item.estaEnDb ? (
                            <Badge variant="outline" className="text-[10px] text-emerald-700 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                              Registrado
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              Disponible
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────────────────────────── */}
        <div className="p-3.5 sm:px-6 border-t border-border bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
            {seleccionada && !seleccionada.estaEnDb ? (
              <span className="truncate">
                Seleccionado: <strong className="text-foreground">{seleccionada.name}</strong> ({seleccionada.sapCode})
              </span>
            ) : (
              <span>Selecciona un centro de distribución de la tabla</span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onOpenChange(false)
                onCrearManual()
              }}
              className="h-8 text-xs cursor-pointer gap-1 text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3 w-3" />
              <span>Crear manual</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-8 text-xs cursor-pointer"
            >
              Cancelar
            </Button>

            <Button
              size="sm"
              disabled={!seleccionada || seleccionada.estaEnDb}
              onClick={() => {
                if (seleccionada && !seleccionada.estaEnDb) {
                  onImportar(seleccionada)
                  onOpenChange(false)
                }
              }}
              className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 shadow-xs cursor-pointer"
            >
              <span>Trazar Zona</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
