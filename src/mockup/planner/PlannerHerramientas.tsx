// Barra de herramientas del mapa. Mismo criterio que la del monitoreo: los controles nativos de
// Leaflet se anclan a las esquinas —que acá son del dock, del HUD y del panel de detalle— y viven
// dentro del contexto de apilado aislado del mapa, así que no hay z-index que los saque de abajo de un
// panel. Una barra propia se posiciona donde queremos y habla el mismo idioma visual.
//
// COMPACTA A PROPÓSITO. Son botones de 28 px sin etiqueta y agrupados por lo que hacen. Todo lo que es
// "qué se ve" se fue al menú de Capas: una barra que crece un botón por cada capa nueva termina siendo
// una columna de íconos mudos que hay que probar uno por uno.
//
//   · Puntero → qué hace el mouse (navegar / marcar por rectángulo / marcar por lazo).
//   · Cámara  → a dónde mira el mapa (acercar, alejar, encuadrar todo).
//   · Capas   → qué se dibuja encima (menú propio).
//   · Paneles → qué flotantes se ven sobre el mapa (menú propio, estilo menú Ver de VSCode).
import { Hand, Lasso, Maximize2, Minus, MousePointerClick, Plus, SquareDashed } from 'lucide-react'
import { useMap } from 'react-leaflet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CapasMapa } from './CapasMapa'
import { PanelesMapa } from './PanelesMapa'
import type { RutaPlan } from './planner-model'
import { usePlannerStore, type Herramienta } from './planner-store'

/**
 * Botón de la barra. `activo` marca las que son INTERRUPTOR y no disparador: a 14 px la diferencia
 * entre dos íconos parecidos no se ve, así que el estado se dice con fondo y color, no solo con forma.
 */
function Tool({
  etiqueta,
  onClick,
  activo,
  children,
}: {
  etiqueta: string
  onClick: () => void
  activo?: boolean
  children: React.ReactNode
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('size-7 rounded-md', activo && 'bg-primary/15 text-primary hover:bg-primary/20')}
      onClick={onClick}
      title={etiqueta}
      aria-label={etiqueta}
      aria-pressed={activo}
    >
      {children}
    </Button>
  )
}

/** La `tecla` va en el tooltip: un atajo que no se ve en ningún lado es un atajo que nadie usa. */
const PUNTEROS: { id: Herramienta; etiqueta: string; tecla: string; icon: typeof Hand }[] = [
  { id: 'pan', etiqueta: 'Mover el mapa', tecla: 'H', icon: Hand },
  { id: 'punto', etiqueta: 'Marcar paradas clickeándolas', tecla: 'S', icon: MousePointerClick },
  { id: 'rect', etiqueta: 'Marcar paradas con un rectángulo', tecla: 'R', icon: SquareDashed },
  { id: 'lasso', etiqueta: 'Marcar paradas con un lazo', tecla: 'L', icon: Lasso },
]

export function PlannerHerramientas({
  rutas,
  onEncuadrar,
  cargandoCapas,
}: {
  rutas: RutaPlan[]
  onEncuadrar: () => void
  /** Hay datos que el mapa DIBUJA viajando por red: mercados, recorridos por calles, o los dos. */
  cargandoCapas: boolean
}) {
  const map = useMap()
  const herramienta = usePlannerStore((s) => s.herramienta)
  const setHerramienta = usePlannerStore((s) => s.setHerramienta)

  return (
    // `z-[1000]` supera los panes internos de Leaflet (400-700) y queda contenido por el `isolate` del
    // contenedor, así que no compite con los popovers de la app (que se portalizan con z-50).
    <div className="absolute bottom-3 right-3 z-[1000] flex flex-col gap-0.5 rounded-lg border border-border bg-card/95 p-0.5 shadow-lg backdrop-blur-sm">
      {PUNTEROS.map(({ id, etiqueta, tecla, icon: Icon }) => (
        <Tool
          key={id}
          etiqueta={`${etiqueta}  (${tecla})`}
          onClick={() => setHerramienta(id)}
          activo={herramienta === id}
        >
          <Icon size={14} />
        </Tool>
      ))}

      <span className="mx-1 h-px bg-border" aria-hidden />

      <Tool etiqueta="Acercar" onClick={() => map.zoomIn()}>
        <Plus size={14} />
      </Tool>
      <Tool etiqueta="Alejar" onClick={() => map.zoomOut()}>
        <Minus size={14} />
      </Tool>
      <Tool etiqueta="Encuadrar todas las paradas  (F)" onClick={onEncuadrar}>
        <Maximize2 size={13} />
      </Tool>

      <span className="mx-1 h-px bg-border" aria-hidden />

      {/* Dos menús y no uno: "Capas" es qué se DIBUJA en el mapa, "Paneles" es qué HERRAMIENTA se ve
          encima. Juntarlos daba una lista de nueve casillas donde nada se encontraba. */}
      <CapasMapa rutas={rutas} cargandoCapas={cargandoCapas} />
      <PanelesMapa />
    </div>
  )
}
