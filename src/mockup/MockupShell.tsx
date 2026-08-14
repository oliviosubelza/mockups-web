// Chrome de la app para los tableros: el MISMO AppSidebar del workbench (alimentado con rutas
// falsas registradas en el RouteRegistry) + una top bar con el toggle de theme a la derecha.
import type { ReactNode } from 'react'
import { Bell, Moon, PanelLeft, Search, Sun } from 'lucide-react'
import { AppSidebar } from '@/components/app-sidebar'
import { SidebarResizeHandle } from '@/components/sidebar-resize-handle'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={toggleSidebar}>
        <PanelLeft size={16} />
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

        <Avatar className="h-7 w-7">
          <AvatarFallback className="bg-primary text-xs text-primary-foreground">OS</AvatarFallback>
        </Avatar>
      </div>
    </header>
  )
}

/** Alto de la top bar. El Sidebar es `position: fixed`, así que no "sabe" que hay una barra arriba:
 *  se le pasa por `--sidebar-offset` (mismo mecanismo que usa App.tsx con el TitleBar de Electron). */
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

  return (
    // Mismo armado que el shell real (App.tsx): barra superior a lo ANCHO de la ventana y el
    // sidebar por debajo — no el sidebar de borde a borde con la barra a su derecha.
    <div
      className="flex h-full min-h-0 flex-col"
      style={{ '--sidebar-offset': TOPBAR_HEIGHT } as React.CSSProperties}
    >
      <TopBar title={title} breadcrumb={breadcrumb} theme={theme} onThemeChange={onThemeChange} />
      <SidebarProvider
        className="min-h-0 flex-1"
        style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}
      >
        <AppSidebar />
        <SidebarResizeHandle />
        {/* min-w-0: sin esto, una tabla ancha (min-width:auto del inset flex) empuja el ancho de
            toda la vista y desborda el board (que es overflow-hidden) → se recorta el contenido. */}
        <SidebarInset className="flex min-h-0 min-w-0 flex-col">
          {/* A sangre además va `overflow-hidden`: una vista que llena exactamente su caja no debe
              poder generar una barra de scroll por un subpíxel. */}
          <div
            className={cn(
              'min-h-0 min-w-0 flex-1',
              fullBleed ? 'overflow-hidden' : 'overflow-auto p-4',
            )}
          >
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
