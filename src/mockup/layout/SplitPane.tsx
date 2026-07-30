// Split horizontal redimensionable y colapsable: dos paneles con un divisor arrastrable en el medio,
// y cada panel contraíble a un riel angosto con su botón para volver a abrirlo.
//
// Vive suelto porque es LAYOUT, no negocio. La misma mecánica la necesitan la planificación
// (mapa | tabla) y el monitoreo (paradas | mapa), y va a hacer falta de nuevo. Copiarla en cada
// pantalla es cómo un archivo de 600 líneas termina en 2000: la lógica de arrastre no tiene nada que
// ver con lo que la pantalla muestra.
//
// Técnica: `flex-basis` en px (no en %) + transición CSS, igual que el sidebar del shell. Con px el
// colapso se ve DESLIZAR; con % salta. Por eso hace falta medir el contenedor con un ResizeObserver.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Ancho del panel contraído: lo justo para el botón de expandir y el título vertical. */
const RAIL_PX = 44
const DIVIDER_PX = 8

const clampNum = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/** Botón para contraer un panel. Direccional: el panel se cierra hacia su propio borde. */
export function CollapseButton({
  label,
  side,
  onClick,
  className,
}: {
  label: string
  side: 'left' | 'right'
  onClick: () => void
  className?: string
}) {
  const Icon = side === 'left' ? PanelLeftClose : PanelRightClose
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('size-7 shrink-0', className)}
      onClick={onClick}
      title={`Contraer ${label.toLowerCase()}`}
      aria-label={`Contraer ${label.toLowerCase()}`}
    >
      <Icon size={15} />
    </Button>
  )
}

/** Riel del panel contraído: llena el ancho angosto con el botón de expandir y el título rotado. */
function CollapsedRail({ title, side, onExpand }: { title: string; side: 'left' | 'right'; onExpand: () => void }) {
  const Icon = side === 'left' ? PanelLeftOpen : PanelRightOpen
  return (
    <div className="flex h-full w-full flex-col items-center gap-2 overflow-hidden bg-muted/30 py-2">
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        onClick={onExpand}
        title={`Mostrar ${title.toLowerCase()}`}
        aria-label={`Mostrar ${title.toLowerCase()}`}
      >
        <Icon size={15} />
      </Button>
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground [writing-mode:vertical-rl]">
        {title}
      </span>
    </div>
  )
}

export interface SplitPaneSide {
  /** Título del riel cuando el panel está contraído. */
  title: string
  /** Ancho mínimo (px) mientras los dos paneles están abiertos. */
  minPx?: number
  /**
   * Contenido del panel. Recibe `collapse` para que cada pantalla ubique el botón donde le sirva
   * (dentro de su propia cabecera, junto a sus filtros), en vez de imponerle una barra fija.
   */
  render: (api: { collapse: () => void }) => ReactNode
}

export function SplitPane({
  left,
  right,
  /** Proporción inicial del panel izquierdo (0..1). */
  defaultRatio = 0.5,
  className,
}: {
  left: SplitPaneSide
  right: SplitPaneSide
  defaultRatio?: number
  className?: string
}) {
  const minLeft = left.minPx ?? 280
  const minRight = right.minPx ?? 320

  // Nunca los dos contraídos a la vez: colapsar uno garantiza que el otro quede abierto.
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const bothOpen = leftOpen && rightOpen

  const collapseLeft = () => {
    setLeftOpen(false)
    setRightOpen(true)
  }
  const collapseRight = () => {
    setRightOpen(false)
    setLeftOpen(true)
  }

  // Ancho del contenedor: los flex-basis se calculan en px, así que hay que medirlo.
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const [splitPx, setSplitPx] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)

  const usable = Math.max(0, width - DIVIDER_PX)
  const maxSplit = Math.max(minLeft, usable - minRight)
  const split = clampNum(splitPx ?? usable * defaultRatio, minLeft, maxSplit)

  // Suman `usable` → sin huecos. Ambos con grow/shrink en 0 para que mande el basis y la transición
  // lo pueda animar.
  let leftBasis: number
  let rightBasis: number
  if (!leftOpen) {
    leftBasis = RAIL_PX
    rightBasis = usable - RAIL_PX
  } else if (!rightOpen) {
    rightBasis = RAIL_PX
    leftBasis = usable - RAIL_PX
  } else {
    leftBasis = split
    rightBasis = usable - split
  }

  const onDividerDown = (e: React.PointerEvent) => {
    if (!bothOpen) return
    e.preventDefault()
    setDragging(true)
    const startX = e.clientX
    const startBasis = leftBasis
    const onMove = (ev: PointerEvent) =>
      setSplitPx(clampNum(startBasis + (ev.clientX - startX), minLeft, maxSplit))
    const onUp = () => {
      setDragging(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Durante el arrastre se apaga la transición: si no, el panel persigue al puntero con retardo.
  const panelTransition = !dragging && 'transition-[flex-basis] duration-300 ease-out'

  return (
    <div ref={wrapRef} className={cn('flex min-h-0 flex-1', className)}>
      <div
        className={cn('flex min-h-0 flex-col overflow-hidden', panelTransition)}
        style={{ flexGrow: 0, flexShrink: 0, flexBasis: width ? leftBasis : `${defaultRatio * 100}%` }}
      >
        {leftOpen ? (
          left.render({ collapse: collapseLeft })
        ) : (
          <CollapsedRail title={left.title} side="left" onExpand={() => setLeftOpen(true)} />
        )}
      </div>

      <div
        onPointerDown={onDividerDown}
        className={cn(
          'relative flex shrink-0 items-center justify-center bg-border',
          bothOpen ? 'cursor-col-resize hover:bg-primary/40' : 'cursor-default',
        )}
        style={{ width: DIVIDER_PX }}
        role="separator"
        aria-orientation="vertical"
      >
        {bothOpen && <div className="h-6 w-1 rounded-full bg-muted-foreground/40" />}
      </div>

      <div
        className={cn('flex min-h-0 flex-col overflow-hidden', panelTransition)}
        style={{ flexGrow: 0, flexShrink: 0, flexBasis: width ? rightBasis : `${(1 - defaultRatio) * 100}%` }}
      >
        {rightOpen ? (
          right.render({ collapse: collapseRight })
        ) : (
          <CollapsedRail title={right.title} side="right" onExpand={() => setRightOpen(true)} />
        )}
      </div>
    </div>
  )
}
