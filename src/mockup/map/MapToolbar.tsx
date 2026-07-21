import type { LucideIcon } from 'lucide-react'
import { Hand, Lasso, Route, SquareDashedMousePointer, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { MapTool } from './SelectionLayer'

// Toolbar flotante del mapa (arriba a la izquierda). Controlada por props — el proyecto de
// referencia disparaba comandos de un command bus; acá el estado de la herramienta vive en OrdersMap
// como useState y la toolbar solo avisa qué se tocó.
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
    <div className="absolute left-3 top-3 z-[1000] flex flex-col gap-1 rounded-lg border border-border bg-background/95 p-1 shadow-md backdrop-blur">
      {TOOLS.map(({ tool, icon: Icon, label }) => (
        <Button
          key={tool}
          variant={activeTool === tool ? 'default' : 'ghost'}
          size="icon"
          onClick={() => onToolChange(tool)}
          aria-label={label}
          aria-pressed={activeTool === tool}
          title={label}
        >
          <Icon />
        </Button>
      ))}

      {/* El botón de ruta se habilita recién tras presionar Optimizar. Muestra las polilíneas de
          ejemplo (no calcula nada). */}
      {showRouteTool && (
        <>
          <span className="my-0.5 h-px bg-border" />
          <Button
            variant={demoActive ? 'default' : 'ghost'}
            size="icon"
            onClick={onToggleDemo}
            aria-label="Mostrar ruta"
            aria-pressed={demoActive}
            title="Mostrar ruta"
          >
            <Route />
          </Button>
        </>
      )}

      {selectedCount > 0 && (
        <>
          <span className="my-0.5 h-px bg-border" />
          <Button
            variant="ghost"
            size="icon"
            onClick={onClear}
            aria-label="Limpiar selección"
            title="Limpiar selección"
          >
            <Trash2 />
          </Button>
        </>
      )}

      {selectedCount > 0 && (
        <span
          className={cn(
            'mt-0.5 rounded-md bg-primary/10 px-1 py-0.5 text-center text-[10px] font-medium tabular-nums text-primary'
          )}
        >
          {selectedCount}
        </span>
      )}
    </div>
  )
}
