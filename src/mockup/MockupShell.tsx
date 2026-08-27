// Chrome de la app para los tableros: el MISMO AppSidebar del workbench (alimentado con rutas
// falsas registradas en el RouteRegistry) + una top bar con el toggle de theme a la derecha.
import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { Bell, Menu, Moon, Search, Sun } from 'lucide-react'
import { AppSidebar } from '@/components/app-sidebar'
import { SidebarResizeHandle } from '@/components/sidebar-resize-handle'
import { SidebarProvider } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSidebarWidthStore } from '@/core/sidebar/use-sidebar-resize'
import { PerfilMenu } from './PerfilMenu'

export type MockTheme = 'light' | 'dark'

interface MockupShellProps {
  title: string
  breadcrumb?: string
  theme: MockTheme
  onThemeChange: (theme: MockTheme) => void
  children: ReactNode
  /**
   * La vista se dibuja PEGADA a los bordes del inset, sin el respiro de 16 px.
   *
   * Existe para las pantallas cuyo contenido ES el fondo —los mapas a sangre—: ahí el padding no es
   * respiro, es un marco que separa el mapa del shell y le roba 32 px de ancho y de alto a la única
   * cosa que la pantalla vino a mostrar. Para todo lo demás (tablas, formularios, listados) el padding
   * sigue siendo lo correcto y por eso es opt-out y no al revés.
   */
  fullBleed?: boolean
}

function TopBar({ title, breadcrumb, theme, onThemeChange }: Omit<MockupShellProps, 'children'>) {
  const toggleSidebar = useSidebarWidthStore((s) => s.toggle)

  return (
    <header className="print:hidden flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3 relative z-10">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 hover:bg-accent cursor-pointer"
        onClick={toggleSidebar}
        aria-label="Abrir o cerrar menú"
        title="Menú"
      >
        <Menu size={18} />
      </Button>
      <Separator orientation="vertical" className="mx-1 h-5" />

      <div className="flex min-w-0 flex-col">
        {/* {breadcrumb && (
          <span className="truncate text-[11px] leading-none text-muted-foreground">{breadcrumb}</span>
        )} */}
        <h1 className="truncate text-sm font-semibold leading-tight tracking-tight">{title}</h1>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {/* <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input placeholder="Buscar…" className="h-8 w-56 pl-8 text-sm" />
        </div> */}

        {/* <Button variant="ghost" size="icon" className="h-8 w-8">
          <Bell size={15} />
        </Button> */}

        {/* Apariencia como un único select (antes eran dos botones sueltos). */}
        <Select value={theme} onValueChange={(v) => v && onThemeChange(v as MockTheme)}>
          <SelectTrigger size="sm" className="w-28" aria-label="Apariencia">
            {/* Base UI muestra el valor crudo ("dark"/"light") si no le damos un render explícito:
                lo formateamos con ícono + etiqueta según el theme elegido. */}
            <SelectValue>
              {(value) => (
                <>
                  {value === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
                  {value === 'dark' ? 'Oscuro' : 'Claro'}
                </>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="light">
              <Sun size={14} /> Claro
            </SelectItem>
            <SelectItem value="dark">
              <Moon size={14} /> Oscuro
            </SelectItem>
          </SelectContent>
        </Select>

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        {/* Quién sos y con qué rol estás mirando. Vive acá y no dentro de una pantalla porque el rol
            decide qué muestra y qué deja firmar más de un módulo — ver `PerfilMenu`. */}
        <PerfilMenu />
      </div>
    </header>
  )
}

/** Alto de la top bar. */
const TOPBAR_HEIGHT = '3rem'

export function MockupShell({
  title,
  breadcrumb,
  theme,
  onThemeChange,
  children,
  fullBleed = false,
}: MockupShellProps) {
  const sidebarWidth = useSidebarWidthStore((s) => s.width)
  const isOpen = useSidebarWidthStore((s) => s.isOpen)
  const closeSidebar = useSidebarWidthStore((s) => s.close)

  // Cerrar el menú flotante con Escape
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeSidebar()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, closeSidebar])

  return (
    <div
      className="relative flex h-full min-h-0 flex-col overflow-hidden"
      style={{ '--sidebar-offset': TOPBAR_HEIGHT } as React.CSSProperties}
    >
      <TopBar title={title} breadcrumb={breadcrumb} theme={theme} onThemeChange={onThemeChange} />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Backdrop / oscurecido cuando el menú se despliega ('over') */}
        <div
          role="presentation"
          aria-hidden={!isOpen}
          onClick={closeSidebar}
          className={cn(
            'absolute inset-0 z-30 bg-black/50 backdrop-blur-[0.5px] transition-opacity duration-200 ease-in-out',
            isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          )}
        />

        {/* Menú drawer desplegado por encima ('over') */}
        <div
          className={cn(
            'absolute top-0 bottom-0 left-0 z-40 flex bg-sidebar text-sidebar-foreground transition-transform duration-200 ease-out shadow-2xl',
            isOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
          )}
          style={
            {
              width: `${sidebarWidth}px`,
              '--sidebar-width': `${sidebarWidth}px`,
            } as React.CSSProperties
          }
        >
          <SidebarProvider
            className="h-full w-full bg-sidebar"
            style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}
          >
            <div className="flex h-full w-full flex-row bg-sidebar border-r border-sidebar-border shadow-2xl">
              <div className="flex-1 min-w-0 h-full overflow-hidden bg-sidebar">
                <AppSidebar />
              </div>
              <SidebarResizeHandle />
            </div>
          </SidebarProvider>
        </div>

        {/* Contenido principal — ocupa todo el ancho y no es empujado por el menú */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
          <div
            className={cn(
              'min-h-0 min-w-0 flex-1',
              fullBleed ? 'overflow-hidden' : 'overflow-auto p-4'
            )}
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

