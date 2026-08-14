// Métricas del plan: la tarjeta de la columna izquierda, arriba del panel del dock.
//
// POR QUÉ EN FILAS Y NO EN UNA FRANJA HORIZONTAL. Como tira horizontal arriba del mapa, esto medía
// 600 px de ancho para decir seis números, se comía media franja superior y empujaba la barra de
// acciones contra el panel de detalle. En columna, con el ANCHO del panel de la izquierda, entra en el
// espacio que esa columna ya ocupa: no le quita nada nuevo al mapa y deja la franja de arriba libre
// para lo único que va ahí, que son las dos acciones.
//
// Y sobre todo: en filas cabe la comparación COMPLETA. Peso y volumen vuelven a mostrar disponible
// contra necesario con su barra, que es lo que en una sola línea no entraba y había que mandar al
// tooltip. La pregunta "¿alcanza?" vive acá, al lado de "¿con cuántos camiones?", que es su causa.
import { AlertTriangle, CheckCircle2, Clock, MapPin, Package, Truck } from 'lucide-react'
import { cn } from '@/lib/utils'

const fmt = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 })

/**
 * Tiempo de recorrido estimado por camión. Placeholder VISUAL, igual que en `CoverageSummaryBar`: el
 * promedio real dependería del canal y de la ruta, y todavía no hay una fuente definida para ese dato.
 * Se deja explícito en la etiqueta ("≈8 h/camión") para que nadie lo lea como un cálculo real.
 */
const HORAS_POR_CAMION = 8

/**
 * Alto FIJO de la tarjeta.
 *
 * Lo exporta para que la vista sepa dónde empieza el panel de abajo sin tener que medir el DOM. Un
 * alto variable obligaría a un ResizeObserver y a que el panel del dock saltara cada vez que un número
 * cambia de dos a tres dígitos.
 */
export const METRICAS_ALTO_PX = 160

/** Fila etiqueta/valor. Alto fijo (h-6) para que las cuatro se lean como una tabla y no como texto. */
function Fila({
  icon: Icon,
  label,
  valor,
  titulo,
}: {
  icon: typeof Truck
  label: string
  valor: string
  titulo: string
}) {
  return (
    <div className="flex h-6 items-center gap-2 text-xs" title={titulo}>
      <Icon size={12} className="shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{label}</span>
      <span className="shrink-0 font-semibold tabular-nums">{valor}</span>
    </div>
  )
}

/**
 * Cobertura de un recurso: disponible (camiones elegidos) contra necesario (lo que entra al plan).
 *
 * El relleno es NECESARIO / DISPONIBLE: al 100% la capacidad quedó justa; si lo necesario la supera,
 * la barra se llena y pasa a rojo. Las dos cifras van debajo con su etiqueta porque el saldo solo
 * ("sobran 62,7 m³") no dice si eso es mucho o poco: 62 sobre 70 y 62 sobre 900 son planes distintos.
 */
function Recurso({
  label,
  disponible,
  necesario,
  unidad,
}: {
  label: string
  disponible: number
  necesario: number
  unidad: string
}) {
  const saldo = Number((disponible - necesario).toFixed(2))
  const deficit = saldo < 0
  // Sin capacidad elegida la barra se llena solo si ya hay demanda (déficit total); sin capacidad ni
  // demanda queda vacía, que es lo correcto: todavía no se decidió nada.
  const pct =
    disponible > 0 ? Math.min(100, Math.round((necesario / disponible) * 100)) : necesario > 0 ? 100 : 0

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium">{label}</span>
        <span
          className={cn(
            'flex items-center gap-1 text-[11px] font-medium tabular-nums',
            deficit ? 'text-destructive' : 'text-primary',
          )}
        >
          {deficit ? <AlertTriangle size={10} /> : <CheckCircle2 size={10} />}
          {deficit ? 'Faltan' : 'Sobran'} {fmt.format(Math.abs(saldo))} {unidad}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            deficit ? 'bg-destructive' : 'bg-primary',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-baseline justify-between gap-2 text-[10px] tabular-nums text-muted-foreground">
        <span>
          Necesario <span className="font-medium text-foreground">{fmt.format(necesario)}</span>
        </span>
        <span>
          Disponible <span className="font-medium text-foreground">{fmt.format(disponible)}</span> {unidad}
        </span>
      </div>
    </div>
  )
}

export function PlannerMetricas({
  camionesElegidos,
  camionesElegibles,
  paradas,
  pedidos,
  volumenDisponible,
  volumenNecesario,
  pesoDisponibleTon,
  pesoNecesarioTon,
}: {
  camionesElegidos: number
  camionesElegibles: number
  paradas: number
  pedidos: number
  volumenDisponible: number
  volumenNecesario: number
  pesoDisponibleTon: number
  pesoNecesarioTon: number
}) {
  const horas = camionesElegidos * HORAS_POR_CAMION

  return (
    <div
      className="flex flex-col gap-1.5 px-2.5 py-2"
      style={{ height: METRICAS_ALTO_PX }}
    >
      {/* Lo que se ELIGIÓ. Va primero porque es la causa: la capacidad de abajo sale de estos camiones
          y la demanda sale de estas paradas. */}
      <Fila
        icon={Truck}
        label="Camiones"
        valor={`${camionesElegidos} / ${camionesElegibles}`}
        titulo={`${camionesElegidos} camiones elegidos de ${camionesElegibles} disponibles`}
      />
      <Fila
        icon={MapPin}
        label="Paradas"
        valor={String(paradas)}
        titulo="Puntos de entrega del plan (los pedidos del mismo punto ya vienen unificados)"
      />
      <Fila
        icon={Package}
        label="Pedidos"
        valor={String(pedidos)}
        titulo="Pedidos que entran al plan con los filtros y decisiones actuales"
      />

      <span className="h-px bg-border" aria-hidden />

      <Recurso
        label="Peso"
        disponible={pesoDisponibleTon}
        necesario={pesoNecesarioTon}
        unidad="t"
      />
      <Recurso
        label="Volumen"
        disponible={volumenDisponible}
        necesario={volumenNecesario}
        unidad="m³"
      />

      <div
        className="mt-auto flex items-center gap-1.5 text-[11px] text-muted-foreground"
        title={`Estimado a ${HORAS_POR_CAMION} h por camión (promedio pendiente de definir por canal)`}
      >
        <Clock size={12} />
        <span className="font-semibold tabular-nums text-foreground">{horas} h</span>
        <span className="text-muted-foreground/80">≈{HORAS_POR_CAMION} h/camión</span>
      </div>
    </div>
  )
}
