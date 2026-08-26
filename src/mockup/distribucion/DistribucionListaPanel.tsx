import { useState, useMemo } from 'react'
import {
  Building2,
  CheckCircle2,
  LandPlot,
  MapPin,
  Pencil,
  Search,
  Sparkles,
  SlidersHorizontal,
  ChevronRight,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { areaKm2, formatearArea } from '../map/geo/medidas'
import type { LatLngTuple } from '../map/geo/polyline'

export interface DistribuidoraFila {
  id: number
  nombre: string
  /** Vértices de su zona. Vacío = todavía no tiene polígono dibujado. */
  puntos: LatLngTuple[]
  /** `false` = tiene zona pero está fuera de circulación. `null` = no tiene zona. */
  zonaActiva: boolean | null
  /** La DISTRIBUIDORA está en circulación (`distributors.is_active`), aparte de su zona. */
  activa: boolean
}

type TabFiltro = 'ALL' | 'ACTIVAS' | 'INACTIVAS' | 'SIN_ZONA'

export function DistribucionListaPanel({
  distribuidoras,
  texto,
  onTexto,
  seleccionadaId,
  onSeleccionar,
  onEditarZona,
  onNueva,
  onAlternarActiva,
  totalEnCiudad,
}: {
  distribuidoras: DistribuidoraFila[]
  texto: string
  onTexto: (texto: string) => void
  seleccionadaId: number | null
  onSeleccionar: (id: number | null) => void
  onEditarZona: (id: number) => void
  onNueva: () => void
  onAlternarActiva?: (id: number) => void
  totalEnCiudad: number
}) {
  const [tab, setTab] = useState<TabFiltro>('ALL')

  const conZona = distribuidoras.filter((d) => d.puntos.length >= 3)
  const activas = conZona.filter((d) => d.zonaActiva === true && d.activa)
  const inactivas = conZona.filter((d) => d.zonaActiva === false || !d.activa)
  const sinZona = distribuidoras.filter((d) => d.puntos.length < 3)
  const areaCubierta = activas.reduce((suma, d) => suma + areaKm2(d.puntos), 0)

  const itemsFiltrados = useMemo(() => {
    return distribuidoras.filter((d) => {
      const tieneZona = d.puntos.length >= 3
      if (tab === 'ACTIVAS' && (!tieneZona || d.zonaActiva !== true || !d.activa)) return false
      if (tab === 'INACTIVAS' && (!tieneZona || (d.zonaActiva === true && d.activa))) return false
      if (tab === 'SIN_ZONA' && tieneZona) return false

      if (!texto.trim()) return true
      return d.nombre.toLowerCase().includes(texto.toLowerCase())
    })
  }, [distribuidoras, tab, texto])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card/40">
      {/* ── Resumen Superior con Métricas Clave ──────────────────────────────── */}
      <div className="grid grid-cols-3 gap-1.5 border-b border-border/80 bg-muted/30 px-3 py-2 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Building2 size={10} className="shrink-0 text-slate-500" />
            <span className="truncate">Centros</span>
          </div>
          <div className="truncate text-xs font-bold tabular-nums text-foreground mt-0.5">
            {totalEnCiudad} distrib.
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <CheckCircle2 size={10} className="shrink-0 text-emerald-500" />
            <span className="truncate">Activas</span>
          </div>
          <div className="truncate text-xs font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
            {activas.length} en reparto
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <LandPlot size={10} className="shrink-0 text-blue-500" />
            <span className="truncate">Área Total</span>
          </div>
          <div className="truncate text-xs font-bold tabular-nums text-foreground mt-0.5">
            {areaCubierta > 0 ? formatearArea(areaCubierta) : '—'}
          </div>
        </div>
      </div>

      {/* ── Botón de Alta y Búsqueda ────────────────────────────────────────── */}
      <div className="shrink-0 space-y-2 border-b border-border/80 p-2.5 bg-background/50">
        <Button
          size="sm"
          className="h-8 w-full gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm shadow-emerald-600/20 cursor-pointer transition-all hover:scale-[1.01]"
          onClick={onNueva}
        >
          <Sparkles size={13} />
          <span>Nueva Zona de Distribución (SAP)</span>
        </Button>

        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={texto}
            onChange={(event) => onTexto(event.target.value)}
            placeholder="Buscar distribuidora o centro…"
            className="h-7.5 pl-8 text-xs bg-background"
          />
        </div>

        {/* Pestañas de Filtrado Rápido */}
        <div className="grid grid-cols-4 gap-1 pt-0.5">
          <button
            type="button"
            onClick={() => setTab('ALL')}
            className={cn(
              'px-1 py-1 rounded-md text-[10.5px] font-medium text-center transition-all cursor-pointer',
              tab === 'ALL'
                ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                : 'bg-muted/40 hover:bg-muted/80 text-muted-foreground',
            )}
          >
            Todas ({distribuidoras.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('ACTIVAS')}
            className={cn(
              'px-1 py-1 rounded-md text-[10.5px] font-medium text-center transition-all cursor-pointer',
              tab === 'ACTIVAS'
                ? 'bg-emerald-600 text-white font-bold shadow-xs'
                : 'bg-muted/40 hover:bg-muted/80 text-emerald-700 dark:text-emerald-400',
            )}
          >
            Activas ({activas.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('INACTIVAS')}
            className={cn(
              'px-1 py-1 rounded-md text-[10.5px] font-medium text-center transition-all cursor-pointer',
              tab === 'INACTIVAS'
                ? 'bg-amber-600 text-white font-bold shadow-xs'
                : 'bg-muted/40 hover:bg-muted/80 text-amber-700 dark:text-amber-400',
            )}
          >
            Off ({inactivas.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('SIN_ZONA')}
            className={cn(
              'px-1 py-1 rounded-md text-[10.5px] font-medium text-center transition-all cursor-pointer',
              tab === 'SIN_ZONA'
                ? 'bg-slate-700 text-white font-bold shadow-xs'
                : 'bg-muted/40 hover:bg-muted/80 text-slate-600 dark:text-slate-400',
            )}
          >
            Sin ({sinZona.length})
          </button>
        </div>
      </div>

      {/* ── Aviso de Una Sola Distribuidora ──────────────────────────────────── */}
      {totalEnCiudad === 1 && (
        <p className="flex shrink-0 items-start gap-1.5 border-b border-border bg-emerald-50/50 dark:bg-emerald-950/20 px-3 py-2 text-[11px] leading-snug text-emerald-900 dark:text-emerald-200">
          <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>
            Una sola distribuidora en esta ciudad: todos los pedidos van a ella por descarte.
          </span>
        </p>
      )}

      {/* ── Lista de Distribuidoras y Zonas con Switch Directo ───────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2 space-y-1.5">
        {itemsFiltrados.length === 0 ? (
          <div className="py-10 text-center space-y-1.5">
            <Building2 size={24} className="mx-auto text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">
              {texto
                ? 'Ninguna distribuidora coincide con la búsqueda.'
                : 'No hay distribuidoras en esta categoría.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {itemsFiltrados.map((distribuidora) => {
              const seleccionada = distribuidora.id === seleccionadaId
              const tieneZona = distribuidora.puntos.length >= 3
              const esActiva = tieneZona && distribuidora.zonaActiva === true && distribuidora.activa

              return (
                <li key={distribuidora.id}>
                  <div
                    onClick={() => onSeleccionar(seleccionada ? null : distribuidora.id)}
                    className={cn(
                      'group w-full rounded-xl border p-2.5 text-left transition-all cursor-pointer relative flex flex-col gap-1.5',
                      seleccionada
                        ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40'
                        : 'border-border/70 hover:border-primary/40 bg-card hover:bg-muted/40 hover:shadow-xs',
                    )}
                  >
                    {/* Fila Superior: Icono, Nombre y Switch */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div
                          className={cn(
                            'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold',
                            esActiva
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-muted text-muted-foreground',
                          )}
                        >
                          <Building2 size={12} />
                        </div>
                        <span
                          className={cn(
                            'truncate text-xs font-bold text-foreground',
                            !distribuidora.activa && 'line-through decoration-muted-foreground/50',
                          )}
                        >
                          {distribuidora.nombre}
                        </span>
                      </div>

                      {/* Switch de Activación Directo */}
                      {tieneZona ? (
                        <div
                          className="flex items-center gap-1.5 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                          title={esActiva ? 'Desactivar zona' : 'Activar zona'}
                        >
                          <span className={cn('text-[9.5px] font-bold', esActiva ? 'text-emerald-600' : 'text-muted-foreground')}>
                            {esActiva ? 'ON' : 'OFF'}
                          </span>
                          <Switch
                            size="sm"
                            checked={esActiva}
                            onCheckedChange={() => onAlternarActiva?.(distribuidora.id)}
                            className="cursor-pointer"
                          />
                        </div>
                      ) : (
                        <Badge variant="outline" className="h-4.5 px-1.5 text-[9.5px] border-dashed border-amber-400 text-amber-700 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-950/30">
                          Sin zona
                        </Badge>
                      )}
                    </div>

                    {/* Fila Inferior: Medidas y Botón de Edición Rápida */}
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5 border-t border-border/40">
                      <span className="truncate">
                        {tieneZona ? (
                          <>
                            <span className="font-semibold text-foreground font-mono">
                              {formatearArea(areaKm2(distribuidora.puntos))}
                            </span>{' '}
                            • {distribuidora.puntos.length} vértices
                          </>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400 font-medium text-[10.5px]">
                            Requiere trazar polígono
                          </span>
                        )}
                      </span>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 text-muted-foreground hover:text-primary hover:bg-primary/10 cursor-pointer rounded-md"
                          title={tieneZona ? 'Editar polígono en mapa' : 'Dibujar polígono en mapa'}
                          onClick={(e) => {
                            e.stopPropagation()
                            onEditarZona(distribuidora.id)
                          }}
                        >
                          <Pencil size={11} />
                        </Button>
                        <ChevronRight size={13} className="text-muted-foreground/50 group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
