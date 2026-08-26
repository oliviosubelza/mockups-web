import { useState } from 'react'
import {
  Building2,
  CheckCircle2,
  Crosshair,
  LandPlot,
  MapPin,
  Pencil,
  Power,
  ShieldCheck,
  Trash2,
  X,
  AlertTriangle,
  Layers,
  Sparkles,
  ChevronLeft,
  Warehouse,
  ThermometerSnowflake,
  Package,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { areaKm2, formatearArea, perimetroM } from '../map/geo/medidas'
import { formatearMetros } from '../map/geo/holgura'
import type { LatLngTuple } from '../map/geo/polyline'
import { cn } from '@/lib/utils'

interface DistribucionDetallePanelProps {
  distribuidoraId: number
  nombre: string
  ciudad: string
  latitud: number
  longitud: number
  puntos: LatLngTuple[]
  zonaActiva: boolean | null
  distribuidoraActiva: boolean
  onEditarZona: () => void
  onEditarDatos: () => void
  onEncuadrar: () => void
  onAlternarActiva: () => void
  onEliminarZona: () => void
  onCerrar: () => void
}

type TabDetalle = 'TERRITORIO' | 'PLANTA'

export function DistribucionDetallePanel({
  distribuidoraId,
  nombre,
  ciudad,
  latitud,
  longitud,
  puntos,
  zonaActiva,
  distribuidoraActiva,
  onEditarZona,
  onEditarDatos,
  onEncuadrar,
  onAlternarActiva,
  onEliminarZona,
  onCerrar,
}: DistribucionDetallePanelProps) {
  const [tab, setTab] = useState<TabDetalle>('TERRITORIO')

  const conZona = puntos.length >= 3
  const esActiva = conZona && zonaActiva === true && distribuidoraActiva
  const area = conZona ? areaKm2(puntos) : 0
  const perimetro = conZona ? perimetroM(puntos) : 0

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card border-r border-border">
      {/* ── Header con botón Volver a Lista ─────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border p-3 bg-muted/20 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground hover:text-foreground shrink-0 cursor-pointer rounded-md"
            onClick={onCerrar}
            title="Volver al listado"
          >
            <ChevronLeft size={14} />
          </Button>
          <div className="min-w-0">
            <h3 className="text-xs font-bold truncate text-foreground">{nombre}</h3>
            <p className="text-[10px] text-muted-foreground truncate">{ciudad} • ID #{distribuidoraId}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {conZona ? (
            <Badge
              className={cn(
                'text-[10px] font-bold px-1.5 py-0.5',
                esActiva
                  ? 'bg-emerald-600 text-white'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300',
              )}
            >
              {esActiva ? '🟢 Activa' : '🟡 Inactiva'}
            </Badge>
          ) : (
            <Badge variant="outline" className="border-dashed text-amber-600 text-[10px]">
              Sin polígono
            </Badge>
          )}
        </div>
      </div>

      {/* ── Pestañas de la Ficha ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 border-b border-border/80 bg-muted/10 p-1 gap-1 shrink-0 text-xs">
        <button
          type="button"
          onClick={() => setTab('TERRITORIO')}
          className={cn(
            'py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer text-center',
            tab === 'TERRITORIO'
              ? 'bg-background text-foreground shadow-xs font-bold'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Territorio & Zona
        </button>
        <button
          type="button"
          onClick={() => setTab('PLANTA')}
          className={cn(
            'py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer text-center',
            tab === 'PLANTA'
              ? 'bg-background text-foreground shadow-xs font-bold'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Planta & Almacén
        </button>
      </div>

      {/* ── Cuerpo del Detalle ──────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-3.5 text-xs">
        {tab === 'TERRITORIO' ? (
          <>
            {/* Switch de Circulación Operativa */}
            <div className="rounded-xl border border-border p-3 bg-muted/10 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-foreground block">Circulación de Reparto</span>
                  <span className="text-[10px] text-muted-foreground block">
                    {esActiva
                      ? 'Los pedidos de este sector se asignan automáticamente a esta planta.'
                      : 'Zona fuera de servicio: los pedidos no se enrutarán por polígono.'}
                  </span>
                </div>

                <Switch
                  size="default"
                  checked={esActiva}
                  disabled={!conZona}
                  onCheckedChange={onAlternarActiva}
                  className="cursor-pointer shrink-0"
                />
              </div>
            </div>

            {/* Geometría y Medidas del Polígono */}
            {conZona ? (
              <div className="rounded-xl border border-border p-3 bg-muted/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Métricas de Cobertura
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[10px] gap-1 text-primary cursor-pointer"
                    onClick={onEncuadrar}
                  >
                    <Crosshair size={10} />
                    <span>Encuadrar</span>
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-lg bg-background p-2.5 border border-border shadow-2xs">
                    <div className="text-[10px] text-muted-foreground">Superficie Total</div>
                    <div className="text-base font-bold text-foreground font-mono mt-0.5">
                      {formatearArea(area)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-background p-2.5 border border-border shadow-2xs">
                    <div className="text-[10px] text-muted-foreground">Perímetro</div>
                    <div className="text-base font-bold text-foreground font-mono mt-0.5">
                      {formatearMetros(perimetro)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
                  <span>Vértices del Polígono:</span>
                  <span className="font-mono font-bold text-foreground">{puntos.length} puntos delimitadores</span>
                </div>

                <div className="flex items-center gap-1.5 text-[10.5px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 p-2 rounded-lg border border-emerald-200 dark:border-emerald-900/60">
                  <ShieldCheck size={13} className="shrink-0" />
                  <span>Polígono verificado: Sin solapamiento con distribuidoras vecinas.</span>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-3.5 text-center space-y-2.5">
                <AlertTriangle size={24} className="mx-auto text-amber-600 dark:text-amber-400" />
                <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-snug">
                  Esta distribuidora no cuenta con un perímetro delimitado. Dibuja el polígono en el mapa para habilitar su despacho.
                </p>
                <Button
                  size="sm"
                  className="h-8 w-full gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs cursor-pointer"
                  onClick={onEditarZona}
                >
                  <Pencil size={12} />
                  <span>Dibujar Polígono en Mapa</span>
                </Button>
              </div>
            )}
          </>
        ) : (
          /* ── Pestaña PLANTA & SAP ─────────────────────────────────────────── */
          <div className="space-y-3">
            {/* Ubicación GPS */}
            <div className="rounded-xl border border-border p-3 bg-muted/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Depósito Físico
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-[10px] gap-1 text-primary cursor-pointer"
                  onClick={onEncuadrar}
                >
                  <Crosshair size={10} />
                  <span>Centrar Depósito</span>
                </Button>
              </div>

              <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
                <MapPin size={13} className="mt-0.5 shrink-0 text-primary" />
                <div>
                  <span className="font-mono text-foreground font-semibold text-xs">
                    {latitud.toFixed(6)}, {longitud.toFixed(6)}
                  </span>
                  <p className="text-[10.5px] text-muted-foreground mt-0.5">
                    Ancla física para cálculo de rutas y tiempos de retorno.
                  </p>
                </div>
              </div>
            </div>

            {/* Atributos Logísticos */}
            <div className="rounded-xl border border-border p-3 bg-muted/10 space-y-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Capacidad & Operación
              </span>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-lg bg-background p-2 border border-border">
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Package size={11} className="text-blue-500" />
                    <span>Capacidad</span>
                  </div>
                  <div className="font-bold text-foreground font-mono mt-0.5">1,850 plts</div>
                </div>

                <div className="rounded-lg bg-background p-2 border border-border">
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <ThermometerSnowflake size={11} className="text-cyan-500" />
                    <span>Almacenaje</span>
                  </div>
                  <div className="font-bold text-foreground mt-0.5 truncate">Ambiente / Frío</div>
                </div>
              </div>

              <div className="rounded-lg bg-background p-2 border border-border text-[11px] flex items-center justify-between">
                <span className="text-muted-foreground">Org. de Ventas SAP:</span>
                <span className="font-mono font-semibold text-foreground">BO01 - Directo Mayorista</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer Actions ──────────────────────────────────────────────────── */}
      <div className="border-t border-border p-2.5 bg-muted/20 space-y-1.5 shrink-0">
        <Button
          size="sm"
          className="h-8 w-full gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs shadow-xs cursor-pointer"
          onClick={onEditarZona}
        >
          <Pencil size={12} />
          <span>{conZona ? 'Editar Polígono en Mapa' : 'Dibujar Polígono'}</span>
        </Button>

        <div className="grid grid-cols-2 gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-7.5 gap-1 text-xs cursor-pointer"
            onClick={onEditarDatos}
          >
            <MapPin size={12} />
            <span>Mover Depósito</span>
          </Button>

          {conZona ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7.5 gap-1 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer"
              onClick={onEliminarZona}
            >
              <Trash2 size={12} />
              <span>Eliminar Zona</span>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7.5 gap-1 text-xs cursor-pointer"
              onClick={onCerrar}
            >
              <span>Volver a Lista</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
