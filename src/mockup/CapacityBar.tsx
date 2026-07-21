import { cn } from '@/lib/utils'

/**
 * Utilización de un camión. Muestra las DOS restricciones a la vez (peso y volumen) porque un
 * camión se llena por la que se agote primero: con solo el peso, un camión lleno de volumen se ve
 * medio vacío. La barra toma el porcentaje más alto de las dos y avisa cuando se pasa del 90%.
 */
export function CapacityBar({
  peso,
  pesoMax,
  volumen,
  volumenMax,
}: {
  peso: number
  pesoMax: number
  volumen: number
  volumenMax: number
}) {
  const pctPeso = pesoMax > 0 ? (peso / pesoMax) * 100 : 0
  const pctVolumen = volumenMax > 0 ? (volumen / volumenMax) * 100 : 0
  const pct = Math.min(100, Math.round(Math.max(pctPeso, pctVolumen)))
  const alto = pct >= 90

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="tabular-nums text-muted-foreground">
          {peso} / {pesoMax} t
        </span>
        <span className={cn('font-medium tabular-nums', alto ? 'text-amber-600 dark:text-amber-400' : 'text-foreground')}>
          {pct}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', alto ? 'bg-amber-500' : 'bg-primary')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
