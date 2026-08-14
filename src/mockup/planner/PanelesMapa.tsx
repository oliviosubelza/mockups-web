// Menú de VISTA: qué flotantes se ven encima del mapa.
//
// El ícono es un engranaje y no un esquema de paneles: a 14 px un `PanelsTopLeft` se confunde con el
// selector de columnas del DataTable y con el propio lanzador de paneles. El engranaje se lee como
// "ajustes de esta pantalla", que es exactamente lo que hay adentro.
//
// Es el menú Ver de VSCode, y a propósito. Esta pantalla puede tener cinco cosas flotando sobre el
// mapa a la vez, y cuál estorba depende de lo que estés haciendo: revisando un trazo, todo tapa;
// armando la selección de pedidos, el panel lateral es lo único que importa. En vez de adivinar por el
// usuario, se le da el interruptor.
//
// Va SEPARADO de "Capas" porque son dos cosas distintas y confundirlas hace un menú imposible de
// escanear: Capas es qué se DIBUJA en el mapa (mercados, trazos, etiquetas); Paneles es qué HERRAMIENTA
// se ve encima. Una es el dato, la otra es la interfaz.
import { Keyboard, Settings2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { usePlannerStore } from './planner-store'

export function PanelesMapa() {
  const dockAbierto = usePlannerStore((s) => s.dockAbierto)
  const cerrarDock = usePlannerStore((s) => s.cerrarDock)
  const mostrarPanel = usePlannerStore((s) => s.mostrarPanel)
  const panel = usePlannerStore((s) => s.panel)
  const verMetricas = usePlannerStore((s) => s.verMetricas)
  const setVerMetricas = usePlannerStore((s) => s.setVerMetricas)
  const verAcciones = usePlannerStore((s) => s.verAcciones)
  const setVerAcciones = usePlannerStore((s) => s.setVerAcciones)
  const paradaFoco = usePlannerStore((s) => s.paradaFoco)
  const setParadaFoco = usePlannerStore((s) => s.setParadaFoco)
  const setAtajosAbiertos = usePlannerStore((s) => s.setAtajosAbiertos)

  const algoOculto = !dockAbierto || !verMetricas || !verAcciones

  return (
    <DropdownMenu>
      {/* El trigger ES el botón: este DropdownMenu es Base UI, no Radix, y no tiene `asChild`. Meterle
          un <Button> adentro anidaba un <button> dentro de otro —HTML inválido— y filtraba `asChild`
          al DOM. Se le pasan las clases del botón directamente, igual que hace el DataTable. */}
      <DropdownMenuTrigger
        className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'relative size-7 rounded-md')}
        title="Paneles"
        aria-label="Paneles"
      >
        <Settings2 size={14} />
        {/* Punto de "hay algo apagado": una pantalla a la que le falta la mitad de la información no
            puede verse igual que una completa. */}
        {algoOculto && (
          <span className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" aria-hidden />
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" side="left" className="w-52">
        <DropdownMenuGroup>
          {/* El label va DENTRO del grupo: `DropdownMenuLabel` es `Menu.GroupLabel` de Base UI y
              revienta sin un `Menu.Group` o `Menu.RadioGroup` de ancestro. */}
          <DropdownMenuLabel className="text-xs">Paneles</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={verMetricas}
            onCheckedChange={setVerMetricas}
            className="text-xs"
          >
            Métricas del plan
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={verAcciones}
            onCheckedChange={setVerAcciones}
            className="text-xs"
          >
            Cobertura y acciones
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={dockAbierto}
            // El dock no tiene un `setDockAbierto` suelto: abrirlo es SIEMPRE abrirlo en un panel, y
            // el que corresponde es el último que se estaba mirando.
            onCheckedChange={(v) => (v ? mostrarPanel(panel) : cerrarDock())}
            className="text-xs"
          >
            Panel lateral
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={paradaFoco !== null}
            // Solo se puede APAGAR: el detalle se enciende eligiendo una parada, no desde un menú —
            // sin parada elegida no hay nada que mostrar.
            disabled={paradaFoco === null}
            onCheckedChange={() => setParadaFoco(null)}
            className="text-xs"
          >
            Detalle de la parada
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />
        {/* La ayuda de atajos vive acá porque es el menú de "ajustes de esta pantalla", y porque un
            atajo que no se puede descubrir no existe: `?` solo lo encuentra quien ya sabe que hay
            atajos. */}
        <DropdownMenuItem className="gap-2 text-xs" onClick={() => setAtajosAbiertos(true)}>
          <Keyboard size={13} />
          Atajos de teclado
          <span className="ml-auto text-[11px] text-muted-foreground">?</span>
        </DropdownMenuItem>

        {algoOculto && (
          <>
            <DropdownMenuSeparator />
            {/* Escotilla de salida: con tres interruptores apagados y el mapa pelado, buscar cuál
                prender de nuevo es trabajo. Un solo click los devuelve todos. */}
            {/* `onClick` y no `onSelect`: `Menu.Item` de Base UI no tiene `onSelect`. TypeScript no lo
                caza porque el ítem se renderiza como <div> y `onSelect` es un handler DOM válido ahí
                (el de selección de texto), así que compilaba y no hacía nada. */}
            <DropdownMenuItem
              className="text-xs"
              onClick={() => {
                setVerMetricas(true)
                setVerAcciones(true)
                mostrarPanel(panel)
              }}
            >
              Mostrar todo
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
