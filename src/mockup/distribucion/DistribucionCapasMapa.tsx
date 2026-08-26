// Aspecto del mapa en zonas de distribución: un botón abajo a la derecha que abre el fondo y los rótulos.
//
// MISMO PATRÓN QUE `zonas/ZonasCapasMapa` y `planner/CapasMapa`, hasta en los detalles: ícono con flecha,
// menú que sale hacia adentro del mapa, punto cuando el mapa no está en su forma por defecto. Cuatro
// pantallas del mismo sistema que ofrecen «elegir el fondo» no pueden pedirlo con cuatro gestos distintos.
// Y `CapasMapa` ya pagó las trampas de este `DropdownMenu` (es Base UI, no Radix): el trigger ES el botón
// porque no hay `asChild`, y cada `DropdownMenuLabel` necesita un `Group`/`RadioGroup` de ancestro.
//
// LO PROPIO DE ACÁ es que hay DOS cosas rotulables —el depósito y su polígono— y el rótulo del depósito no
// es un sí/no sino tres opciones. Ver `RotuloDeposito` en el store para por qué tres.
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
import {
  ROTULO_DEPOSITO_META,
  useDistribucionMapaStore,
  type RotuloDeposito,
} from './distribucion-mapa-store'

const ROTULOS = Object.keys(ROTULO_DEPOSITO_META) as RotuloDeposito[]

export function DistribucionCapasMapa() {
  const capa = useDistribucionMapaStore((s) => s.capa)
  const setCapa = useDistribucionMapaStore((s) => s.setCapa)
  const rotulo = useDistribucionMapaStore((s) => s.rotulo)
  const setRotulo = useDistribucionMapaStore((s) => s.setRotulo)
  const verNombresZona = useDistribucionMapaStore((s) => s.verNombresZona)
  const setVerNombresZona = useDistribucionMapaStore((s) => s.setVerNombresZona)

  /** El mapa no está en su forma por defecto: algo se apagó o algo se prendió de más. El fondo queda
   *  afuera —siempre hay uno elegido y ninguno esconde información—. */
  const modificado = rotulo !== 'nombre' || verNombresZona

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
          {/* La lista sale de `map/tiles`: una capa nueva aparece en las cuatro pantallas sin tocar
              cuatro archivos. */}
          {CAPAS_BASE.map((fondo) => (
            <DropdownMenuRadioItem key={fondo.valor} value={fondo.valor} className="text-xs">
              {fondo.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={rotulo} onValueChange={(v) => setRotulo(v as RotuloDeposito)}>
          {/* RADIO Y NO CHECKBOXES: las tres opciones son excluyentes —un depósito tiene un rótulo, no
              una combinación de rótulos— y con checkboxes habría que decidir qué significa tener los dos
              prendidos o los dos apagados. */}
          <DropdownMenuLabel className="text-xs">Rótulo del depósito</DropdownMenuLabel>
          {ROTULOS.map((valor) => (
            <DropdownMenuRadioItem key={valor} value={valor} className="text-xs">
              {ROTULO_DEPOSITO_META[valor].label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs">Zona</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={verNombresZona}
            onCheckedChange={setVerNombresZona}
            className="text-xs"
            title="El depósito cae dentro de su propia zona, así que prenderlo escribe el mismo nombre dos veces"
          >
            Nombre sobre el polígono
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
