// Tarjetas de resumen del viaje que se está unificando, en una franja ARRIBA del mapa: tripulación
// (chofer/auxiliar) y los dos techos del camión (pedidos y peso). Aparecen recién cuando el usuario
// vuelve del diálogo de finalización y cae en el mapa en solo-lectura: ahí ya no tiene la tabla de
// órdenes a la vista y necesita saber con qué viaje está trabajando sin volver atrás.
//
// Lee el contexto de unificación por su cuenta y devuelve null si no hay ninguno en curso. Así
// PlanningView la monta siempre sin preguntar nada: en la planificación normal (sin unificación) el
// componente simplemente no dibuja, y la vista no gana ni una condición nueva.
//
// Ubicación: franja PROPIA en el flujo del layout, hermana del mapa y por ENCIMA de él — no un overlay
// flotando adentro. Por eso no necesita absolute, z-index ni pointer-events: no compite con los
// controles de Leaflet ni le roba el arrastre al mapa en los huecos entre tarjetas. El mapa cede la
// altura de la franja (el panel es flex-col y el mapa queda con flex-1), así que nada queda tapado.
// `shrink-0` para que la franja no se comprima cuando el panel es bajo; el que se achica es el mapa.
//
// Se lee como parte de la Card, no como algo pegado sobre el mapa: fondo `bg-muted/20` + `border-b`,
// el mismo lenguaje de las franjas de resumen del proyecto (CoverageSummaryBar, OrderSelectionPanel).
import { AlertTriangle, CheckCircle2, Package, User, Users, Weight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { MAX_PEDIDOS_POR_CAMION } from '../mock-data'
import { useUnifyStore } from '../unify-store'

// Mismo formato que el listado de camiones y el diálogo de finalización (miles con separador local +
// unidad). Se repite acá en vez de importarse desde la vista: el mapa no debería depender de una view.
const kg = (n: number) => `${n.toLocaleString('es')} kg`

/** Porcentaje de llenado tope 100 (la barra no se desborda; el exceso se comunica con color + badge). */
const pctLleno = (usado: number, tope: number) =>
  tope > 0 ? Math.min(100, Math.round((usado / tope) * 100)) : usado > 0 ? 100 : 0

// Ya no flota sobre el mapa, así que no hace falta ni sombra ni backdrop-blur (eran para despegarse
// del tile de fondo). Dentro de la franja `bg-muted/20` la tarjeta se despega sola con fondo sólido.
const CARD = 'rounded-md border border-border/60 bg-background'

/** Tarjeta de texto (tripulación). '' = sin asignar, en gris igual que la columna Chofer del listado. */
function TarjetaTexto({
  icono: Icono,
  label,
  valor,
}: {
  icono: typeof User
  label: string
  valor: string
}) {
  return (
    <div className={cn(CARD, 'flex min-w-28 max-w-48 items-center gap-1.5 px-2.5 py-1.5')}>
      <Icono size={13} className="shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
        {valor ? (
          <span className="truncate text-xs font-medium text-foreground">{valor}</span>
        ) : (
          <span className="truncate text-xs text-muted-foreground">Sin asignar</span>
        )}
      </div>
    </div>
  )
}

/**
 * Tarjeta con barra compacta (pedidos o peso). Variante propia, más chata que las barras de las
 * tablas (h-1.5, sin los números al pie): sobre el mapa el espacio vertical es lo escaso.
 * Exceder el tope es ALERTA, nunca bloqueo —misma convención que el diálogo de finalización.
 */
function TarjetaBarra({
  icono: Icono,
  label,
  usado,
  tope,
  fmt,
}: {
  icono: typeof User
  label: string
  usado: number
  tope: number
  fmt: (n: number) => string
}) {
  const excede = usado > tope
  const pct = pctLleno(usado, tope)
  const alto = !excede && pct >= 90
  return (
    <div className={cn(CARD, 'flex min-w-40 flex-1 max-w-64 flex-col gap-1 px-2.5 py-1.5')}>
      <div className="flex items-center gap-1.5">
        <Icono size={13} className="shrink-0 text-muted-foreground" />
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
        <Badge
          variant="outline"
          className={cn(
            'ml-auto gap-1 rounded-full px-1.5 py-0 text-[10px] tabular-nums',
            excede
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : alto
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'border-primary/30 bg-primary/10 text-primary',
          )}
        >
          {excede ? <AlertTriangle size={11} /> : <CheckCircle2 size={11} />}
          {fmt(usado)} / {fmt(tope)}
        </Badge>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            excede ? 'bg-destructive' : alto ? 'bg-amber-500' : 'bg-primary',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function UnifyMapStats() {
  const { camion, chofer, auxiliar, pedidos, cargaKg, capacidadKg } = useUnifyStore()

  // Sin unificación en curso no hay nada que resumir: la planificación normal no gana ninguna franja.
  if (camion === null) return null

  return (
    <div className="shrink-0 border-b border-border bg-muted/20 px-3 py-2">
      {/* flex-wrap + min-widths: el panel del mapa arranca en ~60% del ancho de la Card, así que la
          fila tiene que poder partirse en dos renglones. Las tarjetas de texto son las que se encogen
          primero; las de barra reservan más ancho porque una barra angosta no comunica nada. */}
      <div className="flex flex-wrap items-stretch gap-1.5">
        <TarjetaTexto icono={User} label="Chofer" valor={chofer} />
        <TarjetaTexto icono={Users} label="Auxiliar" valor={auxiliar} />
        <TarjetaBarra
          icono={Package}
          label="Pedidos"
          usado={pedidos}
          tope={MAX_PEDIDOS_POR_CAMION}
          fmt={(n) => `${n}`}
        />
        <TarjetaBarra icono={Weight} label="Peso" usado={cargaKg} tope={capacidadKg} fmt={kg} />
      </div>
    </div>
  )
}
