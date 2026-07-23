// Barra de cobertura del paso combinado (fase 0): compara la capacidad disponible (camiones
// seleccionados) contra lo necesario (pedidos dentro del corte + fuera seleccionados a mano), en
// volumen y peso. Es de SOLO LECTURA — no calcula ni sugiere selección, solo informa si la
// selección actual alcanza. Vive ARRIBA del split de paneles (no dentro de uno) para no sesgar su
// visibilidad hacia un lado.
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, Truck } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CAMIONES } from './mock-data'
import { kgToTons } from './unit-conversion'
import {
  selectAvailableCapacity,
  selectCoverage,
  selectNeededTotals,
  useDispatchPlanStore,
} from './dispatch-plan-store'

const fmt = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 })

// Tiempo de recorrido estimado por camión. Placeholder VISUAL: el promedio real dependería del
// canal, pero todavía no hay una fuente definida para ese dato, así que se fija en 8 h/camión.
const HORAS_POR_CAMION = 8

/**
 * Barra de cobertura de un recurso (volumen o peso). El relleno representa cuánto de la capacidad
 * DISPONIBLE (camiones seleccionados) consume lo NECESARIO (pedidos incluidos): al 100% la
 * capacidad quedó justa; si lo necesario supera a lo disponible la barra se llena y pasa a rojo
 * (déficit). Etiquetas explícitas Disponible/Necesario + chip Sobran/Faltan para que se lea solo.
 */
function CoverageBar({
  label,
  available,
  needed,
  surplus,
  unit,
}: {
  label: string
  available: number
  needed: number
  surplus: number
  unit: string
}) {
  const deficit = surplus < 0
  // Relleno = necesario / disponible. Sin capacidad seleccionada, la barra se llena solo si ya hay
  // demanda (déficit total); si no hay ni capacidad ni demanda, queda vacía.
  const pct =
    available > 0 ? Math.min(100, Math.round((needed / available) * 100)) : needed > 0 ? 100 : 0

  return (
    <div className="flex min-w-56 flex-1 flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium">{label}</span>
        <Badge
          variant="outline"
          className={cn(
            'gap-1 rounded-full tabular-nums',
            deficit
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : 'border-primary/30 bg-primary/10 text-primary',
          )}
        >
          {deficit ? <AlertTriangle size={11} /> : <CheckCircle2 size={11} />}
          {deficit ? 'Faltan' : 'Sobran'} {fmt.format(Math.abs(surplus))} {unit}
        </Badge>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', deficit ? 'bg-destructive' : 'bg-primary')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground tabular-nums">
        <span>
          Disponible <span className="font-medium text-foreground">{fmt.format(available)} {unit}</span>
        </span>
        <span>
          Necesario <span className="font-medium text-foreground">{fmt.format(needed)} {unit}</span>
        </span>
      </div>
    </div>
  )
}

export function CoverageSummaryBar({
  onNext,
  ctaLabel = 'Continuar a Traslados',
  onBack,
}: {
  onNext: () => void
  ctaLabel?: string
  onBack?: () => void
}) {
  const selectedTruckIds = useDispatchPlanStore((s) => s.selectedTruckIds)
  const activeCanales = useDispatchPlanStore((s) => s.activeCanales)
  // Estos selectores derivan objetos NUEVOS en cada llamada; sin igualdad shallow, useSyncExternalStore
  // (Zustand v5) los ve como snapshot cambiante y entra en bucle de render infinito.
  const available = useDispatchPlanStore(useShallow(selectAvailableCapacity))
  const needed = useDispatchPlanStore(useShallow(selectNeededTotals))
  const coverage = useDispatchPlanStore(useShallow(selectCoverage))

  // Elegibles (disponible) vs seleccionados: dos números SIEMPRE visibles y distintos, sin
  // depender de que haya alguno seleccionado (a diferencia del badge propio del DataTable).
  const eligibles = CAMIONES.filter((c) => c.estado === 'disponible').length
  const puedeAvanzar = selectedTruckIds.length > 0 && activeCanales.length > 0
  const neededPesoTon = kgToTons(needed.pesoKg)
  const tiempoTotalHoras = selectedTruckIds.length * HORAS_POR_CAMION

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
      {/* Compacto: "2 / N camiones". El detalle (seleccionados / elegibles) vive en el tooltip
          para dejar espacio a la métrica de tiempo. */}
      <span
        className="flex items-center gap-1 text-xs text-muted-foreground"
        title={`${selectedTruckIds.length} seleccionados de ${eligibles} elegibles`}
      >
        <Truck size={14} className="text-foreground" />
        <span className="font-semibold text-foreground tabular-nums">{selectedTruckIds.length}</span>
        <span className="text-muted-foreground/60">/</span>
        <span className="tabular-nums">{eligibles}</span>
        camiones
      </span>

      {/* Tiempo de recorrido estimado (placeholder visual, 8 h/camión). */}
      <span
        className="flex items-center gap-1 text-xs text-muted-foreground"
        title={`Estimado a ${HORAS_POR_CAMION} h por camión (promedio pendiente de definir por canal)`}
      >
        <Clock size={14} className="text-foreground" />
        <span className="font-semibold text-foreground tabular-nums">{tiempoTotalHoras} h</span>
        <span className="text-[11px] text-muted-foreground/80">≈{HORAS_POR_CAMION} h/camión</span>
      </span>

      <CoverageBar
        label="Volumen"
        available={available.volumenM3}
        needed={needed.volumenM3}
        surplus={coverage.volumeSurplusM3}
        unit="m³"
      />
      <CoverageBar
        label="Peso"
        available={available.pesoTon}
        needed={neededPesoTon}
        surplus={coverage.weightSurplusTon}
        unit="t"
      />

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {onBack && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onBack}>
            <ArrowLeft size={14} />
            Pedidos
          </Button>
        )}
        {/* Gate: no se puede avanzar sin al menos un camión y un canal seleccionado. */}
        <Button
          size="sm"
          disabled={!puedeAvanzar}
          title={
            !puedeAvanzar ? 'Seleccioná al menos un camión y un canal para continuar' : undefined
          }
          onClick={onNext}
        >
          {ctaLabel}
        </Button>
      </div>
    </div>
  )
}
