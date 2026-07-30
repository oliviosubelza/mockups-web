// Barra de progreso segmentada del viaje: entregado / no entregado / devuelto / pendiente.
//
// Es lo único que se le roba a un diseño de cards dentro de una tabla densa: da la lectura de "cómo
// va" sin obligar a leer números. Los tres estados cerrados se dibujan primero y el pendiente cierra
// la barra, así el relleno crece de izquierda a derecha a medida que avanza el viaje.
import { useEffect, useState } from 'react'
import { BatteryFull, BatteryLow, BatteryMedium, BatteryWarning, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ResumenEntregas } from './monitoreo-data'
import { ESTADO_ENTREGA } from './monitoreo-estado'

/**
 * Batería del dispositivo del chofer, en tres tramos.
 *
 * El color NO es el único canal: el ÍCONO cambia de forma en cada tramo (lleno → medio → bajo →
 * advertencia). Con dos pasos —rojo abajo de 20, gris arriba— un 24% se veía igual de tranquilo que
 * un 95%, y justamente 24% es el momento de avisarle al chofer que enchufe el teléfono. El tramo
 * intermedio existe para eso: no es una alarma, es una advertencia.
 *
 * Arriba del 40% el número va NEUTRO a propósito. Pintar de verde una batería sana es ruido: en una
 * pantalla de vigilancia el color tiene que reservarse para lo que necesita atención.
 */
const TRAMOS_BATERIA = [
  { hasta: 20, clase: 'text-destructive', icono: BatteryWarning, aviso: 'Crítica: el tracking está por cortarse' },
  { hasta: 40, clase: 'text-amber-600 dark:text-amber-400', icono: BatteryLow, aviso: 'Baja: conviene avisarle al chofer' },
  { hasta: 75, clase: 'text-muted-foreground', icono: BatteryMedium, aviso: 'Batería del dispositivo del chofer' },
  { hasta: 100, clase: 'text-muted-foreground', icono: BatteryFull, aviso: 'Batería del dispositivo del chofer' },
] as const

export function BateriaChofer({ pct, className }: { pct: number | null; className?: string }) {
  if (pct === null) return null

  const tramo = TRAMOS_BATERIA.find((t) => pct <= t.hasta) ?? TRAMOS_BATERIA[TRAMOS_BATERIA.length - 1]
  const Icono = tramo.icono

  return (
    <span
      className={cn('flex items-center gap-1 text-xs tabular-nums', tramo.clase, pct <= 40 && 'font-medium', className)}
      title={`${pct}% · ${tramo.aviso}`}
    >
      <Icono className="size-3.5 shrink-0" />
      {pct}%
    </span>
  )
}

/**
 * Frescura de LA PANTALLA, no de un camión.
 *
 * La "última señal" de un camión (`now() - trackedAt`, derivado del ítem de `truck_tracking`) dice "a
 * ese camión se le cayó el GPS". Esto dice "la conexión se murió
 * y estás mirando datos congelados". Sin el segundo, una pantalla muerta se ve idéntica a una flota
 * detenida — todo quieto, sin ninguna pista de por qué.
 *
 * Tiene su propio intervalo porque el texto envejece SOLO: si dependiera del render del padre, un
 * stream caído dejaría el cartel clavado en "hace 0 s" justo cuando más importa que avance.
 */
export function Frescura({ desde }: { desde: number }) {
  const [ahora, setAhora] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 5000)
    return () => clearInterval(id)
  }, [])

  const segundos = Math.max(0, Math.round((ahora - desde) / 1000))
  const vieja = segundos >= 120

  return (
    <span
      className={cn('flex items-center gap-1.5 text-[11px]', vieja ? 'text-destructive' : 'text-muted-foreground')}
    >
      <span
        className={cn('size-1.5 shrink-0 rounded-full', vieja ? 'bg-destructive' : 'animate-pulse bg-primary')}
        aria-hidden
      />
      {segundos < 10
        ? 'En vivo'
        : segundos < 60
          ? `Actualizado hace ${segundos} s`
          : `Actualizado hace ${Math.round(segundos / 60)} min`}
    </span>
  )
}

const TRAMOS = [
  { key: 'entregadas', estado: 'entregado' },
  { key: 'fallidas', estado: 'fallido' },
  { key: 'devueltas', estado: 'devuelto' },
] as const

export function ProgresoEntregas({ resumen, className }: { resumen: ResumenEntregas; className?: string }) {
  const { total } = resumen
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0)

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className="flex h-2 w-full min-w-16 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${resumen.entregadas} de ${total} entregadas, ${resumen.pendientes} pendientes`}
      >
        {TRAMOS.map(({ key, estado }) => (
          <div
            key={key}
            className="h-full transition-all"
            style={{ width: `${pct(resumen[key])}%`, background: ESTADO_ENTREGA[estado].color }}
          />
        ))}
      </div>
      <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {resumen.entregadas + resumen.fallidas + resumen.devueltas}/{total}
      </span>
    </div>
  )
}

/** Leyenda del encoding. Va en el detalle: sin ella, los símbolos del mapa hay que adivinarlos. */
export function LeyendaEntregas() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {(['entregado', 'fallido', 'devuelto', 'en_camino', 'pendiente'] as const).map((estado) => {
        const meta = ESTADO_ENTREGA[estado]
        return (
          <span key={estado} className="flex items-center gap-1.5">
            {/* Mismo tratamiento que el pin: siempre relleno. El canal que no depende del color es
                el SÍMBOLO — con ✓/✕/↩ la parada cerró, sin símbolo sigue abierta. */}
            <span
              className="inline-flex size-3 items-center justify-center rounded-full text-[8px] font-bold text-white"
              style={{ background: meta.color }}
              aria-hidden
            >
              {meta.simbolo}
            </span>
            {meta.label}
          </span>
        )
      })}
    </div>
  )
}

/**
 * La leyenda como herramienta activable en vez de bloque fijo.
 *
 * Desplegada ocupa tres líneas del panel — espacio que le saca a la lista de paradas, que es lo que
 * el usuario vino a mirar. Y es una ayuda de LECTURA: se consulta una vez para aprender el encoding y
 * después estorba. Cerrada cuesta una línea.
 *
 * La animación usa el truco de `grid-template-rows: 0fr → 1fr`: anima el alto sin tener que medirlo ni
 * hardcodearlo, así la leyenda puede crecer si algún día se agrega un estado.
 */
export function LeyendaColapsable() {
  const [abierta, setAbierta] = useState(false)

  return (
    <div>
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        className="flex w-full items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={abierta}
      >
        <ChevronDown className={cn('size-3 transition-transform duration-200', abierta && 'rotate-180')} />
        Leyenda
      </button>

      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out',
          abierta ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="pt-2">
            <LeyendaEntregas />
          </div>
        </div>
      </div>
    </div>
  )
}
