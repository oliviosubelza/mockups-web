// Configuración del ASPECTO del mapa en la pantalla de Restricciones: un solo botón abajo a la derecha
// que abre el fondo, los rótulos y el énfasis.
//
// ES EL MISMO PATRÓN QUE `zonas/ZonasCapasMapa` y `planner/CapasMapa`, a propósito y hasta en los
// detalles: un ícono con flecha, el menú que sale hacia adentro del mapa, un punto cuando el mapa no está
// en su forma por defecto. Tres pantallas del mismo sistema que ofrecen "elegir el fondo" no pueden
// pedirlo con tres gestos distintos, y además `CapasMapa` ya pagó las trampas de este `DropdownMenu` (es
// Base UI, no Radix): el trigger ES el botón porque no hay `asChild`, y cada `DropdownMenuLabel` necesita
// un `Group`/`RadioGroup` de ancestro o revienta.
//
// ═══ ESTO NO FILTRA RESTRICCIONES ═══
//
// El menú controla CÓMO SE VE el mapa; QUÉ restricciones se dibujan lo decide el filtro del listado de la
// izquierda —que no filtra solo filas: las geometrías que quedan fuera del filtro tampoco se pintan—. La
// única excepción aparente son las zonas logísticas, y no es una excepción: son de OTRO agregado, no
// están en ese listado y no hay ningún otro lugar desde donde encenderlas.
import { Layers } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { IconoConFlecha, useMenuHover } from '../map/menu-mapa'
import { CAPAS_BASE, type CapaBase } from '../map/tiles'
import { useRestriccionesMapaStore } from './restricciones-mapa-store'

export function RestriccionesCapasMapa() {
  const capa = useRestriccionesMapaStore((s) => s.capa)
  const setCapa = useRestriccionesMapaStore((s) => s.setCapa)
  const verNombres = useRestriccionesMapaStore((s) => s.verNombres)
  const setVerNombres = useRestriccionesMapaStore((s) => s.setVerNombres)
  const verZonasLogisticas = useRestriccionesMapaStore((s) => s.verZonasLogisticas)
  const setVerZonasLogisticas = useRestriccionesMapaStore((s) => s.setVerZonasLogisticas)
  const resaltarSeleccionada = useRestriccionesMapaStore((s) => s.resaltarSeleccionada)
  const setResaltarSeleccionada = useRestriccionesMapaStore((s) => s.setResaltarSeleccionada)
  const rellenoSolido = useRestriccionesMapaStore((s) => s.rellenoSolido)
  const setRellenoSolido = useRestriccionesMapaStore((s) => s.setRellenoSolido)

  /**
   * El mapa no está en su forma por defecto: algo se apagó o algo se prendió de más.
   *
   * Cubre las dos direcciones, igual que en zonas: el relleno sólido y el resaltado cambian el mapa TANTO
   * como apagar los nombres y son igual de fáciles de dejar puestos sin querer. El fondo queda afuera:
   * siempre hay uno elegido y ninguno esconde información.
   */
  const modificado = !verNombres || !verZonasLogisticas || resaltarSeleccionada || rellenoSolido

  const menu = useMenuHover()

  return (
    <DropdownMenu open={menu.abierto} onOpenChange={menu.setAbierto}>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          'relative size-7 gap-px rounded-md',
        )}
        title="Aspecto del mapa"
        aria-label="Aspecto del mapa"
        {...menu.trigger}
      >
        <IconoConFlecha side="left">
          <Layers className="size-3.5" />
        </IconoConFlecha>
        {modificado && (
          <span className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" aria-hidden />
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" side="left" className="w-60" {...menu.contenido}>
        <DropdownMenuRadioGroup value={capa} onValueChange={(v) => setCapa(v as CapaBase)}>
          {/* El label va DENTRO del grupo: es `Menu.GroupLabel` de Base UI y necesita un `Menu.Group` o
              `Menu.RadioGroup` de ancestro. */}
          <DropdownMenuLabel className="text-xs">Fondo</DropdownMenuLabel>
          {/* La lista sale de `map/tiles`, igual que en las otras pantallas: una capa nueva tiene que
              aparecer en todas sin tocar un archivo por pantalla. */}
          {CAPAS_BASE.map((fondo) => (
            <DropdownMenuRadioItem key={fondo.valor} value={fondo.valor} className="text-xs">
              {fondo.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs">Capas</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={verNombres}
            onCheckedChange={setVerNombres}
            className="text-xs"
          >
            Nombres de restricción
          </DropdownMenuCheckboxItem>
          {/* La única capa de OTRO agregado. Va acá y no en el listado de la izquierda porque ese listado
              es el CRUD de restricciones: una fila de zona ahí sería una fila que no se puede editar. */}
          <DropdownMenuCheckboxItem
            checked={verZonasLogisticas}
            onCheckedChange={setVerZonasLogisticas}
            className="text-xs"
          >
            Zonas logísticas de fondo
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>

        {/* ÉNFASIS, y no dos capas más. Las de arriba contestan "¿esto se dibuja?"; estas dos, "¿cómo se
            dibuja lo que ya está?". Mezclarlas haría creer que el resaltado ESCONDE las demás, y no: las
            atenuadas siguen ahí y siguen respondiendo al click. Mismo grupo aparte que en zonas. */}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs">Énfasis</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={resaltarSeleccionada}
            onCheckedChange={setResaltarSeleccionada}
            className="text-xs"
          >
            Resaltar la seleccionada
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={rellenoSolido}
            onCheckedChange={setRellenoSolido}
            className="text-xs"
          >
            Relleno sólido de las áreas
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
