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
import { Hand, Lasso, Maximize2, Minus, MousePointerClick, Plus, RouteOff, SquareDashed } from 'lucide-react'
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
  rutasSinRuteo,
  onReintentarRuteo,
}: {
  rutas: RutaPlan[]
  onEncuadrar: () => void
  /** Hay datos que el mapa DIBUJA viajando por red: mercados, recorridos por calles, o los dos. */
  cargandoCapas: boolean
  /** Cuántas rutas quedaron dibujadas con el trazo RECTO porque el ruteador no contestó. */
  rutasSinRuteo: number
  onReintentarRuteo: () => void
}) {
  const map = useMap()
  const herramienta = usePlannerStore((s) => s.herramienta)
  const setHerramienta = usePlannerStore((s) => s.setHerramienta)

  return (
    // `z-[1000]` supera los panes internos de Leaflet (400-700) y queda contenido por el `isolate` del
    // contenedor, así que no compite con los popovers de la app (que se portalizan con z-50).
    <div className="absolute bottom-3 right-3 z-[1000] flex flex-col gap-0.5 rounded-lg border border-border bg-card/95 p-0.5 shadow-lg backdrop-blur-sm">
      {/* ── EL RUTEO POR CALLES FALLÓ ───────────────────────────────────────────────────────────
          ARRIBA DE TODO Y EN ÁMBAR, en una columna de íconos grises que no llaman la atención — que es
          justo lo que hace falta acá. El resto de esta barra son controles: cosas que se usan cuando se
          las busca. Esto es lo contrario, un aviso que tiene que encontrarte a vos.

          POR QUÉ EXISTE. Cuando el ruteador no contesta, el mapa dibuja el recorrido como segmentos
          rectos de parada a parada. Eso está bien —el reparto y el orden de visita se siguen leyendo—
          pero se ve EXACTAMENTE IGUAL que un recorrido real, así que sin este botón la pantalla afirma
          en silencio que el camión va a manejar en línea recta cruzando manzanas y el cuarto anillo. El
          fallback estaba; lo que faltaba era decirlo.

          Y ES EL BOTÓN DE REINTENTAR, no un cartel: el fallo típico es un servidor público lento o un
          corte de red, o sea justo la clase de cosa que se arregla preguntando de nuevo. Un aviso que
          no trae la acción obliga a reoptimizar el plan entero para volver a pedir lo mismo. */}
      {rutasSinRuteo > 0 && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-md bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 hover:text-amber-700 dark:text-amber-400"
            onClick={onReintentarRuteo}
            title={`${rutasSinRuteo} ruta${rutasSinRuteo !== 1 ? 's' : ''} sin recorrido por calles: se ${rutasSinRuteo !== 1 ? 'dibujan' : 'dibuja'} en línea recta porque el ruteador no contestó. Clic para reintentar.`}
            aria-label={`Reintentar el ruteo por calles de ${rutasSinRuteo} ruta(s)`}
          >
            <RouteOff className="size-3.5" />
          </Button>
          <span className="mx-1 h-px bg-border" aria-hidden />
        </>
      )}
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
