// Pantalla de mockup: componentes REALES del workbench con datos falsos.
// Sirve para exportar a Figma (html.to.design) y aprobar diseño sin cablear backend.
import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { LayoutGrid, Monitor } from 'lucide-react'
import { PortalContainerContext } from '@/components/ui/portal-container'
import { Toaster } from '@/components/ui/sonnet'
import { cn } from '@/lib/utils'
import { ClipWarning } from './ClipWarning'
import { DispatchFlow } from './DispatchFlow'
import { resolveFrame, type Frame } from './frame'
import { MockupShell, type MockTheme } from './MockupShell'
import type { BoardState, Fase, PlanningTab, TransferTab } from './types'
import { PlansView } from './views/PlansView'
import { useActiveRouteValue } from '@/core/routing/active-route'
import { getRouteComponent } from './routes'
import { useViewModeStore, type ViewMode } from './view-mode-store'

interface BoardDef {
  /** Nombre corto del tablero — el que se lee en la etiqueta y en Figma. */
  slug: string
  title: string
  breadcrumb: string
  state: BoardState
  /** Sin `fase` el tablero es la lista de planes (la entrada al proceso). */
  fase?: Fase
  planningTab?: PlanningTab
  transferTab?: TransferTab
}

const FLUJO = (fase: Fase, title: string, breadcrumb: string) => ({ fase, title, breadcrumb })

// Qué entra en la captura. Los estados de carga se retratan SOLO en la fase de camiones: son los
// mismos componentes en todas las tablas, no hace falta gastar tableros repitiéndolos.
const BOARDS: BoardDef[] = [

  // { slug: 'camiones-pedidos', ...FLUJO(0, 'Camiones y pedidos', 'Plan DP-0148 / Camiones y pedidos'), state: 'default' },
  // { slug: 'camiones-pedidos', ...FLUJO(0, 'Camiones y pedidos', 'Plan DP-0148 / Camiones y pedidos'), state: 'loading' },
  // { slug: 'camiones-pedidos', ...FLUJO(0, 'Camiones y pedidos', 'Plan DP-0148 / Camiones y pedidos'), state: 'error' },
  // { slug: 'camiones-pedidos', ...FLUJO(0, 'Camiones y pedidos', 'Plan DP-0148 / Camiones y pedidos'), state: 'empty' },

  // Step 2 "Traslados" retirado del wizard (ahora es sub-paso del Step 1). Fases: 0=camiones,
  // 1=planificación, 2=órdenes.
  // { slug: 'transferencias', ...FLUJO(1, 'Transferencias y devoluciones', 'Plan DP-0148 / Transferencias'), state: 'default', transferTab: 'transferencias' },
  // { slug: 'devoluciones', ...FLUJO(1, 'Transferencias y devoluciones', 'Plan DP-0148 / Devoluciones'), state: 'default', transferTab: 'devoluciones' },

  { slug: 'planificacion-mapa', ...FLUJO(1, 'Planificación', 'Plan DP-0148 / Planificación'), state: 'default', planningTab: 'mapa' },
  // { slug: 'planificacion-corridas', ...FLUJO(1, 'Planificación', 'Plan DP-0148 / Planificación'), state: 'default', planningTab: 'corridas' },

  // { slug: 'ordenes', ...FLUJO(2, 'Órdenes de despacho', 'Plan DP-0148 / Órdenes'), state: 'default' },
  // { slug: 'planes', title: 'Planes de despacho', breadcrumb: 'Distribución / Planes', state: 'default' },
]

const THEMES: MockTheme[] = ['light', 'dark']

// Un tablero = un artboard (default 1440x900, el estándar de escritorio; ?w/?h lo cambian).
// Al importarlo a Figma llega con la medida correcta y no hay que redimensionarlo a mano. El theme
// se aplica con la clase `.dark` en la RAÍZ del tablero (no en <html>), y por eso conviven claro y
// oscuro en la misma captura.
function Board({
  board,
  initialTheme,
  frame,
  fluid = false,
}: {
  board: BoardDef
  initialTheme: MockTheme
  frame: Frame
  /** Modo "web normal": el tablero llena el viewport (100vw×100vh) e ignora el marco fijo (?w/?h). */
  fluid?: boolean
}) {
  const [theme, setTheme] = useState<MockTheme>(initialTheme)
  // El contenido y el título siguen a la RUTA ACTIVA (el sidebar navega abriendo tabs). Si no hay
  // ruta activa se cae al tablero fijo — así el modo Figma sigue funcionando igual que antes.
  const activeRoute = useActiveRouteValue()
  const ActiveScreen = activeRoute ? getRouteComponent(activeRoute.routeId) : undefined
  // Los overlays (selects, popovers, dialogs) se portalizan al `document.body` por defecto, que
  // está FUERA del `.dark` de este tablero → salían en claro sobre tableros oscuros. Portalizándolos
  // DENTRO del tablero heredan su `.dark`. (En la app real el `.dark` vive en <html>, ancestro del
  // body, así que ahí no hace falta — es propio de tener varios themes en una misma página.)
  const [boardEl, setBoardEl] = useState<HTMLElement | null>(null)

  return (
    <div
      ref={setBoardEl}
      style={
        // El `transform` convierte al tablero en el bloque contenedor de sus descendientes fixed (el
        // Sidebar del workbench es `position: fixed`): sin esto los sidebars se anclarían al VIEWPORT.
        // En modo `fluid` (web normal) el tablero se fija al viewport (inset:0) → llena la pantalla y
        // sigue conteniendo su sidebar; se ignoran el marco fijo y los params ?w/?h.
        fluid
          ? { transform: 'translate(0)', position: 'fixed', inset: 0 }
          : {
              transform: 'translate(0)',
              // Inline y no clase Tailwind: el valor es dinámico, y Tailwind solo genera las clases
              // que puede ver escritas en el fuente (no existe `w-[${n}px]` en build time).
              width: `${frame.width}px`,
              height: `${frame.height}px`,
            }
      }
      className={cn(
        'flex flex-col overflow-hidden bg-background text-foreground',
        theme === 'dark' && 'dark'
      )}
    >
      <PortalContainerContext.Provider value={boardEl ?? undefined}>
        <MockupShell
          title={activeRoute?.title ?? board.title}
          breadcrumb={board.breadcrumb}
          theme={theme}
          onThemeChange={setTheme}
        >
          {ActiveScreen ? (
            <ActiveScreen />
          ) : board.fase === undefined ? (
            <PlansView state={board.state} />
          ) : (
            <DispatchFlow
              state={board.state}
              initialFase={board.fase}
              planningTab={board.planningTab}
            />
          )}
        </MockupShell>

        {/* Toasts (avisos de eventos del monitoreo). Hasta ahora `notify()` existía pero NUNCA se veía:
            el `<Toaster>` no estaba montado en ningún lado del árbol, así que las notificaciones se
            emitían al vacío.

            Va DENTRO del tablero, no en la raíz de la página, por dos razones. El tablero tiene
            `transform: translate(0)`, que lo convierte en el bloque contenedor de sus descendientes
            `fixed`: así el toast aparece adentro del marco y entra en la captura de Figma, en vez de
            pegarse a la esquina del viewport. Y hereda el `.dark` del tablero, que es lo único que hace
            que un aviso sobre un tablero oscuro no salga en claro.

            Abajo al centro: en el detalle del monitoreo los bordes izquierdo y derecho son paneles
            flotantes (340 y 380 px) y la esquina inferior derecha es del botón de modo de vista. El
            centro es la única franja que no le tapa nada a nadie.

            Sonner tiene UN store global de toasts, así que en modo mockup (varios tableros apilados
            mostrando la misma pantalla) el aviso se dibuja en cada tablero. Es lo correcto acá: cada
            marco es una captura independiente. Lo que sí no puede pasar es que el MISMO evento se
            apile dos veces, y eso lo resuelve el `id` estable de cada aviso. */}
        <Toaster position="bottom-center" theme={theme} />
      </PortalContainerContext.Provider>
    </div>
  )
}

/**
 * Botón flotante TEMPORAL para alternar entre modo mockup (tableros para Figma) y modo web (pantalla
 * completa). Fixed con z-index altísimo para flotar sobre todo, incluso sobre el board fullscreen y
 * el sidebar de Leaflet. No entra en la captura de Figma (queda fuera del marco del tablero).
 */
function ViewModeToggle({ mode, onToggle }: { mode: ViewMode; onToggle: () => void }) {
  const goingToWeb = mode === 'mockup'
  const btnRef = useRef<HTMLButtonElement>(null)
  // Posición libre (fixed). null = esquina inferior derecha por defecto.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  // Estado del arrastre: offset del puntero dentro del botón + punto inicial + si ya se movió.
  const drag = useRef<{ ox: number; oy: number; sx: number; sy: number; moved: boolean } | null>(null)

  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    drag.current = { ox: e.clientX - rect.left, oy: e.clientY - rect.top, sx: e.clientX, sy: e.clientY, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d) return
    // Umbral: hasta 4px es un click, no un arrastre (evita mover sin querer al tocar).
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return
    d.moved = true
    const el = btnRef.current
    const w = el?.offsetWidth ?? 0
    const h = el?.offsetHeight ?? 0
    setPos({
      x: clamp(e.clientX - d.ox, 4, window.innerWidth - w - 4),
      y: clamp(e.clientY - d.oy, 4, window.innerHeight - h - 4),
    })
  }
  const onPointerUp = () => {
    const d = drag.current
    drag.current = null
    // Si no se arrastró, fue un click → alterna el modo.
    if (d && !d.moved) onToggle()
  }

  return (
    <button
      ref={btnRef}
      type="button"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      title="Arrastrame para moverme · click para alternar el modo de vista"
      style={pos ? { left: pos.x, top: pos.y } : { right: 16, bottom: 16 }}
      className="fixed z-[99999] flex touch-none cursor-grab select-none items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 shadow-lg transition-colors hover:bg-neutral-100 active:cursor-grabbing"
    >
      {goingToWeb ? <Monitor size={15} /> : <LayoutGrid size={15} />}
      {goingToWeb ? 'Modo web' : 'Modo mockup'}
    </button>
  )
}

// Por defecto la página apila TODOS los tableros: la extensión free de html.to.design limita la
// cantidad de imports (no de pantallas), así que una sola captura debe traerse el entregable
// entero. Se apilan en vertical, no en horizontal: la captura respeta el scroll vertical, pero
// el ancho excedente se recorta.
// ?board=planificacion-paradas&theme=dark aísla un tablero (sin gastar otro import).
export function Mockup() {
  // Los knobs del tablero (?board, ?theme, ?w, ?h) siguen viniendo de la URL: son parámetros de
  // CAPTURA, uno por export a Figma. `useSearchParams` y no `location.search` para que se relean
  // cuando el router navega (`openRoute` los arrastra vía sticky search params).
  const [searchParams] = useSearchParams()
  const slug = searchParams.get('board')
  const theme = (searchParams.get('theme') as MockTheme | null) ?? 'light'
  const frame = resolveFrame(searchParams.toString())

  // El modo de vista vive en su propio store (localStorage), NO en la URL: así sobrevive el reload
  // y no se pierde al navegar. Ver view-mode-store.ts.
  const view = useViewModeStore((s) => s.mode)
  const toggleView = useViewModeStore((s) => s.toggle)

  const toggle = <ViewModeToggle mode={view} onToggle={toggleView} />

  // Modo "web normal": un solo tablero a pantalla completa, como una web de verdad — sin el fondo
  // de tableros apilados, sin marco fijo ni params de resolución. Muestra el step que se está viendo
  // (el último tablero de BOARDS, o el que pida ?board=), en claro salvo que ?theme lo cambie.
  if (view === 'web') {
    const board = (slug && BOARDS.find((b) => b.slug === slug)) || BOARDS[BOARDS.length - 1]
    return (
      <>
        {toggle}
        <Board board={board} initialTheme={theme} frame={frame} fluid />
      </>
    )
  }

  if (slug) {
    const state = (searchParams.get('state') as BoardState | null) ?? 'default'
    const board = BOARDS.find((b) => b.slug === slug && b.state === state)
    if (board) {
      return (
        <>
          {toggle}
          <ClipWarning frameWidth={frame.width} />
          <Board board={board} initialTheme={theme} frame={frame} />
        </>
      )
    }
  }

  return (
    <>
      {toggle}
      {/* <ClipWarning frameWidth={frame.width} /> */}
      {/* El contenedor sigue al frame: si midiera más que el viewport de captura, el recorte se
          comería el borde derecho de TODOS los tableros. */}
      <div
        className="flex flex-col gap-20 bg-neutral-200 py-20"
        style={{ width: `${frame.width}px` }}
      >
        {BOARDS.flatMap((board) =>
          THEMES.map((boardTheme) => (
            <div key={`${board.slug}-${board.state}-${boardTheme}`} className="flex flex-col gap-3">
              {/* Etiqueta fuera del tablero: no debe entrar en el frame que va a Figma. */}
              <span className="px-2 font-mono text-sm text-neutral-500">
                {/* {board.slug} / {board.state} / {boardTheme} */}
              </span>
              <Board board={board} initialTheme={boardTheme} frame={frame} />
            </div>
          ))
        )}
      </div>
    </>
  )
}
