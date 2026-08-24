// Control de CAPAS del mapa: un solo botón que abre la lista de lo que se puede prender y apagar.
//
// Es el equivalente del selector de columnas del DataTable, y a propósito: ahí el patrón ya está
// aprendido —un ícono, una lista de checkboxes, se tilda lo que se quiere ver— y acá el problema es el
// mismo, solo que las "columnas" son capas del mapa. Reusar el gesto vale más que inventar uno.
//
// POR QUÉ REEMPLAZA A LOS BOTONES SUELTOS. Antes cada capa era un botón de la barra: satélite,
// mercados, etiquetas… La barra crecía un botón por cada cosa nueva y, peor, cada botón era un ícono
// mudo que había que probar para saber qué hacía. Una lista con nombre dice qué es cada cosa y no
// ocupa más alto cuando aparece la sexta capa.
//
// Las rutas van en un SUBMENÚ y no en la lista principal: son N y cambian con el plan, así que
// mezclarlas con las capas fijas haría que el menú midiera distinto en cada pantalla.
import { Layers, Loader2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { IconoConFlecha, useMenuHover } from '../map/menu-mapa'
import { CAPAS_BASE } from '../map/tiles'
import type { RutaPlan } from './planner-model'
import { usePlannerStore, type CapaBase, type ColorPor } from './planner-store'

export function CapasMapa({
  rutas,
  cargandoCapas,
}: {
  rutas: RutaPlan[]
  /** Hay datos que el mapa DIBUJA viajando por red: mercados, recorridos por calles, o los dos. */
  cargandoCapas: boolean
}) {
  const capa = usePlannerStore((s) => s.capa)
  const setCapa = usePlannerStore((s) => s.setCapa)
  const colorPor = usePlannerStore((s) => s.colorPor)
  const setColorPor = usePlannerStore((s) => s.setColorPor)
  const verMercados = usePlannerStore((s) => s.verMercados)
  const setVerMercados = usePlannerStore((s) => s.setVerMercados)
  const verZonas = usePlannerStore((s) => s.verZonas)
  const setVerZonas = usePlannerStore((s) => s.setVerZonas)
  const verZonasRestringidas = usePlannerStore((s) => s.verZonasRestringidas)
  const setVerZonasRestringidas = usePlannerStore((s) => s.setVerZonasRestringidas)
  const verEtiquetas = usePlannerStore((s) => s.verEtiquetas)
  const setVerEtiquetas = usePlannerStore((s) => s.setVerEtiquetas)
  const verTrazos = usePlannerStore((s) => s.verTrazos)
  const setVerTrazos = usePlannerStore((s) => s.setVerTrazos)
  const resaltarRuta = usePlannerStore((s) => s.resaltarRuta)
  const setResaltarRuta = usePlannerStore((s) => s.setResaltarRuta)
  const zonasActivas = usePlannerStore((s) => s.zonasActivas)
  const setZonasActivas = usePlannerStore((s) => s.setZonasActivas)
  const verDeposito = usePlannerStore((s) => s.verDeposito)
  const setVerDeposito = usePlannerStore((s) => s.setVerDeposito)
  const rutasOcultas = usePlannerStore((s) => s.rutasOcultas)
  const toggleRutaVisible = usePlannerStore((s) => s.toggleRutaVisible)
  const optimizado = usePlannerStore((s) => s.optimizado)

  const ocultas = rutasOcultas.length

  // Apertura por hover + flecha: el patrón compartido de las barras de mapa. Ver `map/menu-mapa`.
  const menu = useMenuHover()

  return (
    <DropdownMenu open={menu.abierto} onOpenChange={menu.setAbierto}>
      {/* El trigger ES el botón: este DropdownMenu es Base UI, no Radix, y no tiene `asChild`. Meterle
          un <Button> adentro anidaba un <button> dentro de otro —HTML inválido— y filtraba `asChild`
          al DOM. Se le pasan las clases del botón directamente, igual que hace el DataTable. */}
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          'relative size-7 gap-px rounded-md',
        )}
        title="Capas del mapa"
        aria-label="Capas del mapa"
        {...menu.trigger}
      >
        {/* Esta barra está pegada al borde DERECHO del mapa, así que el menú sale hacia la izquierda
            (`side="left"`) y la flecha va a la izquierda del ícono, apuntando para allá.

            El tamaño del ícono va como clase `size-*` y no como prop de Lucide: ver la nota de
            `IconoConFlecha`. Con la prop, ícono y flecha se dibujan los dos a 16 px y no entran en un
            botón de 28. */}
        <IconoConFlecha side="left">
          {cargandoCapas ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Layers className="size-3.5" />
          )}
        </IconoConFlecha>
        {/* Punto de "el mapa no está como sale de fábrica". Sin él, un mapa al que le falta media
            información se ve igual que uno completo y se pierde tiempo buscando paradas que están
            ocultas. Sigue arriba a la derecha: la flecha ocupa el lado izquierdo, así que esa esquina
            quedó libre.

            CADA CAPA ENTRA POR EL LADO QUE ESCONDE ALGO, y ese lado depende de su default: las que
            arrancan apagadas (`verMercados`, `verEtiquetas`, `verZonas`) avisan cuando están PRENDIDAS
            —el mapa muestra de más y conviene saber de dónde salió ese dibujo—, y las que arrancan
            prendidas (`verTrazos`, `verZonasRestringidas`) avisan cuando están APAGADAS. Por eso la
            condición mezcla negadas y sin negar: no es una inconsistencia, es la misma regla leída
            desde el default de cada una. Y `verZonasRestringidas` es el caso donde más importa: apagar
            las restricciones deja un mapa en el que TODO parece planificable. */}
        {(ocultas > 0 ||
          !verTrazos ||
          !verZonasRestringidas ||
          verMercados ||
          verEtiquetas ||
          verZonas) && (
          <span className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" aria-hidden />
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" side="left" className="w-52" {...menu.contenido}>
        {/* Qué codifica el color de los puntos. Va PRIMERO porque es la decisión que más cambia lo que
            se ve: es la diferencia entre un mapa que responde "dónde están los mayoristas" y uno que
            responde "a quién le tocó cada punto". */}
        <DropdownMenuRadioGroup value={colorPor} onValueChange={(v) => setColorPor(v as ColorPor)}>
          {/* El label va DENTRO del grupo: `DropdownMenuLabel` es `Menu.GroupLabel` de Base UI y
              revienta sin un `Menu.Group` o `Menu.RadioGroup` de ancestro. */}
          <DropdownMenuLabel className="text-xs">Colorear puntos por</DropdownMenuLabel>
          <DropdownMenuRadioItem value="canal" className="text-xs">
            Canal del cliente
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="ruta" className="text-xs" disabled={!optimizado}>
            Ruta asignada
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={capa} onValueChange={(v) => setCapa(v as CapaBase)}>
          <DropdownMenuLabel className="text-xs">Fondo</DropdownMenuLabel>
          {/* La lista sale de `map/tiles` y no está escrita acá: es la misma que ofrecen el monitoreo y el
              mapa de órdenes, y con tres copias alcanza con que alguien sume una capa en un archivo para
              que las pantallas dejen de ofrecer lo mismo. */}
          {CAPAS_BASE.map((fondo) => (
            <DropdownMenuRadioItem key={fondo.valor} value={fondo.valor} className="text-xs">
              {fondo.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs">Capas</DropdownMenuLabel>
          {/* Las zonas van PRIMERAS de las capas de fondo: son el perímetro dentro del cual todo lo
              demás cae, así que prenderlas cambia cómo se lee el resto y no solo suma dibujo. Salen
              del mismo dato maestro que la pantalla de Zonas — lo que se dibujó allá se ve acá. */}
          <DropdownMenuCheckboxItem
            checked={verZonas}
            onCheckedChange={setVerZonas}
            className="text-xs"
          >
            Zonas de reparto
          </DropdownMenuCheckboxItem>
          {/* Pegada a las de reparto porque salen del mismo dato maestro y se dibujan en la misma capa,
              pero con interruptor PROPIO y encendido por defecto: no son una variante de las otras sino
              lo contrario —territorio recortado, no territorio cubierto—, y esconderlas por omisión
              dejaría planificar sobre una restricción que nadie vio. Ver `verZonasRestringidas` en el
              store. */}
          <DropdownMenuCheckboxItem
            checked={verZonasRestringidas}
            onCheckedChange={setVerZonasRestringidas}
            className="text-xs"
          >
            Zonas restringidas
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={verMercados}
            onCheckedChange={setVerMercados}
            className="text-xs"
          >
            Mercados
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={verEtiquetas}
            onCheckedChange={setVerEtiquetas}
            className="text-xs"
          >
            Nombres de parada
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={verTrazos}
            onCheckedChange={setVerTrazos}
            disabled={!optimizado}
            className="text-xs"
          >
            Trazos de ruta
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={verDeposito}
            onCheckedChange={setVerDeposito}
            className="text-xs"
          >
            Almacén de salida
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>

        {/* ÉNFASIS, y no una capa más. Las de arriba contestan "¿esto se dibuja?"; esta contesta "¿cómo
            se dibuja lo que ya está?". Mezclarlas haría creer que apagarla esconde rutas, y no: las
            atenuadas siguen ahí. Por eso el grupo aparte.

            Sale APAGADA: el mapa abre mostrando el reparto completo, con las siete rutas iguales.
            Prenderla lo pasa a "estoy siguiendo esta". Ver `resaltarRuta` en el store. */}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs">Énfasis</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={resaltarRuta}
            onCheckedChange={setResaltarRuta}
            // Sin trazos no hay nada que atenuar, y sin optimizar no hay trazos: el ítem se apaga por
            // la misma razón que "Trazos de ruta", no por una regla propia.
            disabled={!optimizado || !verTrazos}
            className="text-xs"
          >
            Resaltar la ruta elegida
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={zonasActivas}
            onCheckedChange={setZonasActivas}
            // Sin NINGUNA capa de zonas prendida no hay zona que traer al frente. Son las dos y no
            // solo las de reparto: desde que las restringidas arrancan encendidas, el caso normal al
            // abrir el mapa es tener zonas a la vista con `verZonas` apagado, y mirar sólo el
            // `verZonas` dejaba el ítem gris con polígonos dibujados en pantalla.
            disabled={!verZonas && !verZonasRestringidas}
            className="text-xs"
          >
            Zonas en primer plano
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>

        {/* Rutas: submenú, y solo cuando existen. Antes esto era el "ojo" de cada tarjeta del panel de
            rutas — sigue estando ahí, pero desde acá se llega sin abrir el dock. */}
        {rutas.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="text-xs">
                Rutas visibles
                <span className="ml-auto pl-2 text-[11px] tabular-nums text-muted-foreground">
                  {rutas.length - ocultas}/{rutas.length}
                </span>
              </DropdownMenuSubTrigger>
              {/* `DropdownMenuGroup` porque adentro hay ítems de menú y Base UI los quiere agrupados,
                  igual que en el menú padre. */}
              <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
                <DropdownMenuGroup>
                  {rutas.map((ruta) => (
                    // CHECKBOX y no Item. Esto antes era un `DropdownMenuItem` con
                    // `onSelect={e => { e.preventDefault(); toggle() }}` — el patrón de Radix. Este
                    // menú es Base UI: `Menu.Item` NO tiene `onSelect` (solo `onClick`), así que el
                    // toggle nunca corría, y su `closeOnClick` es `true` por defecto, así que el menú
                    // se cerraba. Los dos síntomas, una sola causa.
                    //
                    // `Menu.CheckboxItem` arregla las dos: trae `onCheckedChange` y su `closeOnClick`
                    // es `false`. Y además es lo semánticamente correcto — esto ES una casilla, y así
                    // se pueden prender y apagar varias rutas seguidas mirando el mapa, que es
                    // exactamente para lo que sirve la lista.
                    <DropdownMenuCheckboxItem
                      key={ruta.id}
                      checked={!rutasOcultas.includes(ruta.id)}
                      onCheckedChange={() => toggleRutaVisible(ruta.id)}
                      className="gap-2 text-xs"
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ background: ruta.color }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">{ruta.nombre}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {ruta.camion.placa}
                      </span>
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
