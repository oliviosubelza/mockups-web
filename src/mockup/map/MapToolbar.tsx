import type { LucideIcon } from 'lucide-react'
import { Hand, Lasso, Route, SquareDashedMousePointer, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { MapTool } from './SelectionLayer'

// Toolbar flotante del mapa (arriba a la izquierda). Controlada por props — el proyecto de
// referencia disparaba comandos de un command bus; acá el estado de la herramienta vive en OrdersMap
// como useState y la toolbar solo avisa qué se tocó.
//
// El lenguaje visual es el MISMO que las herramientas del monitoreo (`HerramientasMapa`): tarjeta
// `rounded-xl` con `bg-card/95`, sombra y blur, y botones `size-8 rounded-lg`. Las dos son la misma
// herramienta conceptual sobre dos mapas del mismo producto, y que se vieran distinto era una diferencia
// sin razón: obligaba a re-aprender dónde mirar al pasar de planificar a monitorear.
//
// La herramienta ACTIVA se marca con `bg-primary/10 text-primary` y no con el botón sólido de antes: a
// 15 px un botón lleno de color pesa más que el mapa que está arriba, y el estado se lee igual.
interface ToolDef {
  tool: MapTool
  icon: LucideIcon
  label: string
}

const TOOLS: ToolDef[] = [
  { tool: 'pan', icon: Hand, label: 'Mover mapa' },
  { tool: 'rect', icon: SquareDashedMousePointer, label: 'Selección rectángulo' },
  { tool: 'lasso', icon: Lasso, label: 'Selección libre (lazo)' },
]

export function MapToolbar({
  activeTool,
  onToolChange,
  onClear,
  selectedCount,
  showRouteTool,
  demoActive,
  onToggleDemo,
}: {
  activeTool: MapTool
  onToolChange: (tool: MapTool) => void
  onClear: () => void
  selectedCount: number
  /** El botón de ruta aparece recién tras Optimizar. */
  showRouteTool: boolean
  demoActive: boolean
  onToggleDemo: () => void
}) {
  return (
    <div className="absolute left-3 top-3 z-[1000] flex flex-col overflow-hidden rounded-xl border border-border bg-card/95 shadow-lg backdrop-blur-sm">
      {TOOLS.map(({ tool, icon: Icon, label }) => (
        <Button
          key={tool}
          variant="ghost"
          size="icon"
          className={cn(
            'size-8 rounded-lg',
            activeTool === tool && 'bg-primary/10 text-primary hover:bg-primary/15',
          )}
          onClick={() => onToolChange(tool)}
          aria-label={label}
          aria-pressed={activeTool === tool}
          title={label}
        >
          <Icon size={15} />
        </Button>
      ))}

      {/* El botón de ruta se habilita recién tras presionar Optimizar. Muestra las polilíneas de
          ejemplo (no calcula nada). */}
      {showRouteTool && (
        <>
          <span className="mx-1.5 h-px bg-border" aria-hidden />
          <Button
            variant="ghost"
            size="icon"
            className={cn('size-8 rounded-lg', demoActive && 'bg-primary/10 text-primary hover:bg-primary/15')}
            onClick={onToggleDemo}
            aria-label="Mostrar ruta"
            aria-pressed={demoActive}
            title="Mostrar ruta"
          >
            <Route size={15} />
          </Button>
        </>
      )}

      {selectedCount > 0 && (
        <>
          <span className="mx-1.5 h-px bg-border" aria-hidden />
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-lg"
            onClick={onClear}
            aria-label="Limpiar selección"
            title="Limpiar selección"
          >
            <Trash2 size={15} />
          </Button>
          {/* Cuántas paradas quedaron seleccionadas. Va PEGADO al botón de limpiar, que es la acción que
              opera sobre ese número. */}
          <span className="mb-1 rounded-md bg-primary/10 px-1 text-center text-[10px] font-medium tabular-nums text-primary">
            {selectedCount}
          </span>
        </>
      )}
    </div>
  )
}
