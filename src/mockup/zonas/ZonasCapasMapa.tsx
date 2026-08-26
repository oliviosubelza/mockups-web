// Configuración del ASPECTO del mapa en la pantalla de Zonas: un solo botón abajo a la derecha que abre
// el fondo, los rótulos y el énfasis.
//
// ES EL MISMO PATRÓN QUE `planner/CapasMapa`, a propósito y hasta en los detalles: un ícono con flecha,
// el menú que sale hacia adentro del mapa, un punto cuando el mapa no está en su forma por defecto. Dos
// pantallas del mismo sistema que ofrecen "elegir el fondo" no pueden pedirlo con dos gestos distintos, y
// además ese archivo ya pagó las trampas de este `DropdownMenu` (es Base UI, no Radix): el trigger ES el
// botón porque no hay `asChild`, y cada `DropdownMenuLabel` necesita un `Group`/`RadioGroup` de ancestro
// o revienta. Lo que sigue las respeta; ver los comentarios largos allá.
//
// ═══ ESTO NO FILTRA ZONAS, Y LA OMISIÓN ES LA DECISIÓN MÁS IMPORTANTE DEL ARCHIVO ═══
//
// El menú controla CÓMO SE VE el mapa; QUÉ zonas se dibujan lo decide el filtro del listado de la
// izquierda —que ya no filtra solo filas: los polígonos que quedan fuera del filtro tampoco se pintan—.
// Las restricciones no aparecen entre estas opciones porque pertenecen a otro agregado y otra ruta.
//
// Una sola pregunta, un solo lugar donde se contesta. Si algún día hace falta llegar al filtro desde el
// mapa, lo que hay que hacer es abrir el listado, no duplicar controles acá.
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
import { useZonasMapaStore } from './zonas-mapa-store'

export function ZonasCapasMapa() {
  const capa = useZonasMapaStore((s) => s.capa)
  const setCapa = useZonasMapaStore((s) => s.setCapa)
  const verNombres = useZonasMapaStore((s) => s.verNombres)
  const setVerNombres = useZonasMapaStore((s) => s.setVerNombres)
  const verMedidas = useZonasMapaStore((s) => s.verMedidas)
  const setVerMedidas = useZonasMapaStore((s) => s.setVerMedidas)
  const verVertices = useZonasMapaStore((s) => s.verVertices)
  const setVerVertices = useZonasMapaStore((s) => s.setVerVertices)
  const resaltarSeleccionada = useZonasMapaStore((s) => s.resaltarSeleccionada)
  const setResaltarSeleccionada = useZonasMapaStore((s) => s.setResaltarSeleccionada)
  const rellenoSolido = useZonasMapaStore((s) => s.rellenoSolido)
  const setRellenoSolido = useZonasMapaStore((s) => s.setRellenoSolido)

  /**
   * El mapa no está en su forma por defecto: algo se apagó o algo se prendió de más.
   *
   * En `CapasMapa` el punto avisa "hay algo apagado"; acá tiene que cubrir también lo prendido, porque el
   * relleno sólido y el resaltado cambian el mapa TANTO como apagar los nombres y son igual de fáciles de
   * dejar puestos sin querer. Sin esta señal, un mapa con nueve zonas fantasma se ve como un mapa con una
   * sola zona y se pierde el rato buscando las que "desaparecieron". El fondo queda afuera: siempre hay
   * uno elegido y ninguno esconde información.
   */
  const modificado = !verNombres || verMedidas || verVertices || resaltarSeleccionada || rellenoSolido

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

      <DropdownMenuContent align="end" side="left" className="w-56" {...menu.contenido}>
        <DropdownMenuRadioGroup value={capa} onValueChange={(v) => setCapa(v as CapaBase)}>
          {/* El label va DENTRO del grupo: es `Menu.GroupLabel` de Base UI y necesita un `Menu.Group` o
              `Menu.RadioGroup` de ancestro. */}
          <DropdownMenuLabel className="text-xs">Fondo</DropdownMenuLabel>
          {/* La lista sale de `map/tiles`, igual que en las otras dos pantallas: una capa nueva tiene que
              aparecer en las tres sin tocar tres archivos. */}
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
            Nombres de zona
          </DropdownMenuCheckboxItem>
          {/* DESHABILITADO en vez de escondido cuando no hay nombres: la medida se dibuja DEBAJO del
              nombre, así que sin etiqueta no tiene dónde ir. Escondiéndolo, el ítem aparecería y
              desaparecería según el estado del de arriba y el menú cambiaría de alto al tildarlo — y
              nadie descubriría que la opción existe si abrió el menú con los nombres apagados. */}
          <DropdownMenuCheckboxItem
            checked={verMedidas}
            onCheckedChange={setVerMedidas}
            disabled={!verNombres}
            className="text-xs"
          >
            Medidas en la etiqueta
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={verVertices}
            onCheckedChange={setVerVertices}
            className="text-xs"
          >
            Vértices al pasar el mouse
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>

        {/* ÉNFASIS, y no dos capas más. Las de arriba contestan "¿esto se dibuja?"; estas dos, "¿cómo se
            dibuja lo que ya está?". Mezclarlas haría creer que el resaltado ESCONDE las demás zonas, y no:
            las atenuadas siguen ahí y siguen respondiendo al click. Mismo grupo aparte que en
            `CapasMapa`. */}
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
            Relleno sólido
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
