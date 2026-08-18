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
  const verEtiquetas = usePlannerStore((s) => s.verEtiquetas)
  const setVerEtiquetas = usePlannerStore((s) => s.setVerEtiquetas)
  const verTrazos = usePlannerStore((s) => s.verTrazos)
  const setVerTrazos = usePlannerStore((s) => s.setVerTrazos)
  const verDeposito = usePlannerStore((s) => s.verDeposito)
  const setVerDeposito = usePlannerStore((s) => s.setVerDeposito)
  const rutasOcultas = usePlannerStore((s) => s.rutasOcultas)
  const toggleRutaVisible = usePlannerStore((s) => s.toggleRutaVisible)
  const optimizado = usePlannerStore((s) => s.optimizado)

  const ocultas = rutasOcultas.length

  return (
    <DropdownMenu>
      {/* El trigger ES el botón: este DropdownMenu es Base UI, no Radix, y no tiene `asChild`. Meterle
          un <Button> adentro anidaba un <button> dentro de otro —HTML inválido— y filtraba `asChild`
          al DOM. Se le pasan las clases del botón directamente, igual que hace el DataTable. */}
      <DropdownMenuTrigger
        className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'relative size-7 rounded-md')}
        title="Capas del mapa"
        aria-label="Capas del mapa"
      >
        {cargandoCapas ? <Loader2 size={14} className="animate-spin" /> : <Layers size={14} />}
        {/* Punto de "hay algo apagado". Sin él, un mapa al que le falta media información se ve igual
            que uno completo y se pierde tiempo buscando paradas que están ocultas. */}
        {(ocultas > 0 || !verTrazos || verMercados || verEtiquetas) && (
          <span className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" aria-hidden />
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" side="left" className="w-52">
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

        {/* El TAMAÑO del punto también codifica algo y eso no se adivina: sin decirlo, un punto grande
            se lee como "importante" o "seleccionado". Vive acá —y no en una leyenda flotante sobre el
            mapa— porque es una regla fija que se consulta una vez, no un dato que haya que tener a la
            vista todo el tiempo tapando ciudad. */}
        <div className="flex items-center gap-1.5 px-2 pb-1.5 pt-0.5 text-[10px] text-muted-foreground">
          <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground" aria-hidden />
          <span className="size-2.5 shrink-0 rounded-full bg-muted-foreground" aria-hidden />
          <span>El tamaño es el peso de la parada</span>
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={capa} onValueChange={(v) => setCapa(v as CapaBase)}>
          <DropdownMenuLabel className="text-xs">Fondo</DropdownMenuLabel>
          <DropdownMenuRadioItem value="calles" className="text-xs">
            Calles
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="suave" className="text-xs">
            Calles en gris
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="satelite" className="text-xs">
            Satélite
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs">Capas</DropdownMenuLabel>
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
