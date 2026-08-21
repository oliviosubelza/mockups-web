// Panel "Rutas": UNA ruta a la vez, elegida con un select-search, y su tabla de paradas debajo.
//
// POR QUÉ NO ES UNA LISTA DE TARJETAS. Antes eran N tarjetas apiladas, cada una con nombre, placa,
// barra de ocupación y conteos. Con seis camiones el panel se llenaba de barras compitiendo entre sí y
// había que hacer scroll para llegar a la última, pero lo que se hace en esta pantalla es mirar UNA
// ruta —¿este recorrido tiene sentido?, ¿en qué orden visita?— y para eso las otras cinco son ruido.
//
// El select-search resuelve las dos cosas que la lista sí hacía bien: se ve el conjunto completo al
// abrirlo (con su color, su placa y su ocupación) y se salta a cualquiera escribiendo. El "ojo" de
// cada tarjeta también vive ahí, uno por opción, más un "mostrar/ocultar todas" arriba: prender y
// apagar rutas es comparar el mapa contra varias a la vez, así que el select NO se cierra al tocar un
// ojo —solo el cuerpo de la opción elige y cierra—. Afuera del select no quedó ningún botón: eran
// acciones sobre "la ruta elegida" flotando fuera del control que la elige.
import { useEffect, useMemo, useState } from 'react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  AlertTriangle,
  Boxes,
  ChevronsUpDown,
  Crosshair,
  GripVertical,
  Eye,
  EyeOff,
  PackageX,
  Route,
  Search,
  Settings2,
} from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { CanalGlyph } from '../canal-glyph'
import { CANAL_META, MAX_CLIENTES_POR_CAMION, type Parada } from '../mock-data'
import { TEXTO_OCUPACION, cargaDeRuta, type CargaRuta, type RutaPlan } from './planner-model'
import { usePlannerStore } from './planner-store'
import { AccesoriosDialog } from './AccesoriosDialog'
import { resumenAccesorios, totalAccesorios } from '../accesorios'

const fmtPeso = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 })

/** Id del grupo "Sin asignar": no es una ruta, pero se elige con el mismo select. */
const SIN_ASIGNAR = '__sin-asignar__'

/**
 * Fila de una parada dentro de una ruta, ARRASTRABLE para cambiar el orden de visita.
 *
 * La manija es un elemento aparte y no la fila entera: la fila ya tiene un click —enfocar la parada en
 * el mapa— y si además iniciara el arrastre, cada intento de mirar una parada empezaría a moverla. Con
 * manija propia los dos gestos conviven sin ambigüedad, que es la razón por la que casi todas las
 * listas ordenables tienen una.
 */
function FilaParada({
  parada,
  enFoco,
  onFoco,
  arrastrable,
}: {
  parada: Parada
  enFoco: boolean
  onFoco: () => void
  /** `false` con búsqueda activa o en "Sin asignar": ahí reordenar no significa nada. */
  arrastrable: boolean
}) {
  const meta = CANAL_META[parada.canal]
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: parada.id,
    disabled: !arrastrable,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex h-7 items-center gap-2 pl-1 pr-2 text-xs transition-colors',
        enFoco ? 'bg-primary/10' : 'hover:bg-muted/70',
        // Mientras viaja se despega del resto: sombra y fondo sólido para que no se lea a través de
        // las filas que va cruzando.
        isDragging && 'relative z-10 rounded-md bg-card shadow-lg',
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        disabled={!arrastrable}
        title={arrastrable ? 'Arrastrar para cambiar el orden de visita' : undefined}
        aria-label={`Reordenar ${parada.cliente}`}
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground',
          arrastrable ? 'cursor-grab hover:text-foreground active:cursor-grabbing' : 'opacity-30',
        )}
      >
        <GripVertical size={12} />
      </button>

      <button
        type="button"
        onClick={onFoco}
        title={`${parada.cliente} · ${parada.puntoEntrega} · ${parada.ventana}`}
        className="flex h-full min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className="w-5 shrink-0 text-right text-[11px] font-semibold tabular-nums text-muted-foreground">
          {parada.secuencia > 0 ? parada.secuencia : '—'}
        </span>
        <span className="shrink-0" style={{ color: meta.color }} title={meta.label}>
          <CanalGlyph canal={parada.canal} size={13} />
        </span>
        <span className="min-w-0 flex-1 truncate">{parada.cliente}</span>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {fmtPeso.format(parada.pesoTotal)} kg
        </span>
      </button>
    </div>
  )
}

/**
 * Ojo de visibilidad de UNA ruta, pensado para vivir DENTRO de una opción del select.
 *
 * El detalle que lo hace funcionar es cortar la propagación: `CommandItem` de cmdk dispara su
 * `onSelect` desde el `onClick` del div, así que sin `stopPropagation` cada click en el ojo también
 * elegiría la ruta y cerraría el popover. Con el corte, el cuerpo de la opción sigue siendo lo único
 * que selecciona y cierra; el ojo solo prende y apaga el dibujo en el mapa, y el select queda abierto
 * para seguir encendiendo y apagando rutas de a una sin reabrirlo.
 */
function OjoRuta({
  oculta,
  nombre,
  onToggle,
}: {
  oculta: boolean
  nombre: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      // El pointerdown también se corta: sin esto el gesto empieza a "elegir" la fila antes del click.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      title={oculta ? `Mostrar ${nombre} en el mapa` : `Ocultar ${nombre} del mapa`}
      aria-label={oculta ? `Mostrar ${nombre} en el mapa` : `Ocultar ${nombre} del mapa`}
      aria-pressed={!oculta}
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-background hover:text-foreground',
        oculta ? 'text-muted-foreground' : 'text-foreground',
      )}
    >
      {oculta ? <EyeOff size={12} /> : <Eye size={12} />}
    </button>
  )
}

/**
 * Barra de ocupación en línea, con TRES niveles y el exceso a la vista.
 *
 * EL BUG QUE TENÍA: `width` estaba acotado a 100 y el color solo distinguía "≥ 90". Una ruta al 1200%
 * dibujaba exactamente la misma barra llena y ámbar que una al 91%. La barra decía "está lleno"
 * cuando lo que pasaba era "no entra ni de casualidad", y quien miraba no tenía cómo notar la
 * diferencia sin leer el número.
 *
 * Ahora la barra se parte en dos tramos: hasta el 100% va la capacidad real, y lo que sobra se dibuja
 * PEGADO a la derecha, en el color del nivel y rayado. Es la convención de cualquier medidor que
 * admite exceso, y la única forma de que el sobrante ocupe lugar visual en vez de desaparecer.
 */
function Ocupacion({ carga, color }: { carga: CargaRuta; color: string }) {
  const { nivel, ocupacionPct } = carga
  // El exceso se dibuja proporcional al tramo que sobra, con un piso: al 101% tiene que verse ALGO, y
  // se acota al 40% del ancho para que al 1200% la barra siga siendo una barra y no todo exceso.
  const excesoPct =
    ocupacionPct <= 100 ? 0 : Math.min(40, Math.max(6, ((ocupacionPct - 100) / 100) * 40))

  return (
    <div className="flex items-center gap-2">
      <div className="flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full min-w-0 flex-1 rounded-l-full transition-all duration-500',
            nivel === 'alta' && 'bg-amber-500',
            nivel === 'critica' && 'bg-rose-500',
          )}
          style={{
            width: `${Math.min(100, ocupacionPct)}%`,
            background: nivel === 'ok' ? color : undefined,
          }}
        />
        {excesoPct > 0 && (
          // Rayado además de color: sobre el ámbar del nivel "alta", un tramo liso pegado a otro liso
          // se lee como una sola barra. La textura dice "esto es de otra naturaleza".
          <div
            className={cn(
              'h-full shrink-0 rounded-r-full',
              nivel === 'critica' ? 'bg-rose-600' : 'bg-amber-600',
            )}
            style={{
              width: `${excesoPct}%`,
              backgroundImage:
                'repeating-linear-gradient(45deg, rgba(255,255,255,0.45) 0 2px, transparent 2px 4px)',
            }}
          />
        )}
      </div>
      <span
        className={cn(
          'shrink-0 text-[11px] font-semibold tabular-nums',
          nivel === 'ok' && 'text-foreground',
          nivel === 'alta' && 'text-amber-600 dark:text-amber-400',
          nivel === 'critica' && 'text-rose-600 dark:text-rose-400',
        )}
      >
        {ocupacionPct}%
      </span>
    </div>
  )
}

/**
 * Acciones de la ruta elegida, detrás de un engranaje a la derecha del select.
 *
 * POR QUÉ UN MENÚ Y NO BOTONES SUELTOS. Acá hubo dos íconos al lado del select (ojo y encuadrar) y se
 * sacaron por muteados: un ícono suelto no dice qué hace hasta que lo tocás, y eran dos. Un engranaje
 * es UNA sola cosa —"qué puedo hacer con esta ruta"— y adentro cada acción va con su nombre escrito.
 * También es el lugar donde entra la próxima sin que la cabecera crezca un botón por acción.
 */
function RutaMenu({
  ruta,
  totalAccesorios,
  oculta,
  onAccesorios,
  onEncuadrar,
  onToggleVisible,
}: {
  ruta: RutaPlan
  /** Unidades de bandeo cargadas en la ruta. Se muestra al lado de la acción, como un conteo. */
  totalAccesorios: number
  oculta: boolean
  onAccesorios: () => void
  onEncuadrar: () => void
  onToggleVisible: () => void
}) {
  return (
    <DropdownMenu>
      {/* El trigger ES el botón: este menú es Base UI y no tiene `asChild` — meterle un <Button>
          adentro anida un <button> en otro. Mismo criterio que `CapasMapa`. */}
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          'size-7 shrink-0 rounded-md text-muted-foreground hover:text-foreground',
        )}
        title={`Acciones de ${ruta.nombre}`}
        aria-label={`Acciones de ${ruta.nombre}`}
      >
        <Settings2 className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          {/* El label repite de qué ruta son las acciones: el menú sale flotando sobre la tabla de
              paradas y sin el nombre no se sabe si aplica a la ruta o a la parada de abajo. */}
          <DropdownMenuLabel className="text-xs">
            {ruta.nombre} · <span className="font-mono">{ruta.camion.placa}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {/* El bandeo es lo primero: es lo único de acá que EDITA la ruta, el resto solo mueve la vista. */}
        <DropdownMenuItem onClick={onAccesorios} className="text-xs">
          <Boxes className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">Accesorios del camión</span>
          {totalAccesorios > 0 && (
            <span className="shrink-0 font-semibold tabular-nums">{totalAccesorios}</span>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onEncuadrar} className="text-xs">
          <Crosshair className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">Encuadrar en el mapa</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onToggleVisible} className="text-xs">
          {oculta ? (
            <Eye className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <EyeOff className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 flex-1 truncate">
            {oculta ? 'Mostrar en el mapa' : 'Ocultar del mapa'}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function RutasPanel({
  rutas,
  paradasAsignadas,
  paradaFoco,
  onFoco,
  onOptimizar,
  onReordenar,
}: {
  rutas: RutaPlan[]
  paradasAsignadas: Parada[]
  paradaFoco: string | null
  onFoco: (id: string) => void
  onOptimizar: () => void
  /** Aplica el nuevo orden de visita de una ruta (arrastre de filas). */
  onReordenar: (rutaId: string, ordenIds: string[]) => void
}) {
  const optimizado = usePlannerStore((s) => s.optimizado)
  const rutaFoco = usePlannerStore((s) => s.rutaFoco)
  const setRutaFoco = usePlannerStore((s) => s.setRutaFoco)
  const rutasOcultas = usePlannerStore((s) => s.rutasOcultas)
  const toggleRutaVisible = usePlannerStore((s) => s.toggleRutaVisible)
  const setRutasOcultas = usePlannerStore((s) => s.setRutasOcultas)
  const accesorios = usePlannerStore((s) => s.accesorios)
  const accesoriosRuta = usePlannerStore((s) => s.accesoriosRuta)
  const abrirAccesorios = usePlannerStore((s) => s.abrirAccesorios)
  const cerrarAccesorios = usePlannerStore((s) => s.cerrarAccesorios)
  const setAccesorio = usePlannerStore((s) => s.setAccesorio)
  const pedirEncuadre = usePlannerStore((s) => s.pedirEncuadre)

  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  const sinAsignar = useMemo(
    () => paradasAsignadas.filter((p) => !p.rutaId),
    [paradasAsignadas],
  )

  // Se elige sola la primera ruta al entrar: un panel que abre pidiendo que elijas algo antes de
  // mostrar nada es un paso de más cuando la respuesta obvia es "la primera".
  useEffect(() => {
    if (rutas.length === 0) return
    if (rutaFoco && (rutaFoco === SIN_ASIGNAR || rutas.some((r) => r.id === rutaFoco))) return
    setRutaFoco(rutas[0].id)
  }, [rutaFoco, rutas, setRutaFoco])

  // `activationConstraint`: sin él, cualquier click sobre la manija cuenta como arrastre y el botón
  // deja de poder recibir un click limpio. 4 px es el umbral clásico de "esto fue un gesto, no un dedo
  // tembloroso". El teclado entra por el mismo contexto y hace la lista accesible sin mouse.
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  /** Cuántas se están dibujando. Alimenta el conteo y el gate de los dos botones masivos. */
  const enMapa = rutas.filter((r) => !rutasOcultas.includes(r.id)).length

  const ruta = rutas.find((r) => r.id === rutaFoco) ?? null
  const esSinAsignar = rutaFoco === SIN_ASIGNAR
  const carga = ruta ? cargaDeRuta(paradasAsignadas, ruta) : null
  const accesoriosDeRuta = (ruta && accesorios[ruta.id]) || []
  /** Ruta del diálogo abierto. Puede no ser la del foco si alguien cambió de ruta con él abierto. */
  const rutaAccesorios = rutas.find((r) => r.id === accesoriosRuta) ?? null
  const paradas = esSinAsignar ? sinAsignar : (carga?.paradas ?? [])

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    if (!texto) return paradas
    return paradas.filter((p) => p.cliente.toLowerCase().includes(texto))
  }, [busqueda, paradas])


  /**
   * Reordenar solo tiene sentido sobre la lista COMPLETA de una ruta real: con una búsqueda activa se
   * ven 3 de 12 paradas y arrastrar la segunda visible "arriba de todo" no dice nada sobre las 9 que
   * no se ven. En "Sin asignar" directamente no hay orden de visita que definir.
   */
  const sePuedeReordenar = !esSinAsignar && rutaFoco !== null && busqueda.trim() === ''

  const alSoltar = (evento: DragEndEvent) => {
    const { active, over } = evento
    if (!over || active.id === over.id || !rutaFoco) return
    const ids = paradas.map((p) => p.id)
    const desde = ids.indexOf(String(active.id))
    const hasta = ids.indexOf(String(over.id))
    if (desde === -1 || hasta === -1) return
    onReordenar(rutaFoco, arrayMove(ids, desde, hasta))
  }

  if (rutas.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
        <Route size={20} className="text-muted-foreground" />
        <p className="text-sm font-medium">Sin camiones</p>
        <p className="text-xs text-muted-foreground">
          Cada camión que elijas en Flota se convierte en una ruta de este plan.
        </p>
      </div>
    )
  }

  if (!optimizado) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <Route size={20} className="text-muted-foreground" />
        <p className="text-sm font-medium">
          {rutas.length} ruta{rutas.length !== 1 ? 's' : ''} sin repartir
        </p>
        <p className="text-xs text-muted-foreground">
          Las paradas todavía no tienen camión. Optimizar las reparte por capacidad y dibuja el
          recorrido de cada una.
        </p>
        <Button size="sm" className="mt-1" onClick={onOptimizar}>
          Optimizar
        </Button>
      </div>
    )
  }

  const oculta = rutaFoco !== null && rutasOcultas.includes(rutaFoco)
  const etiqueta = esSinAsignar ? 'Sin asignar' : (ruta?.nombre ?? 'Elegí una ruta')

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── Cabecera: el select-search y el engranaje de la ruta ──
          ANTES TENÍA DOS BOTONES AL LADO (ojo y encuadrar) y se veían mal por una razón concreta: dos
          íconos mudos sueltos, sin dueño visible con el popover cerrado. La vuelta no son esos botones
          otra vez: es UN engranaje —"qué puedo hacer con esta ruta"— con las acciones nombradas
          adentro. Un control en vez de dos, y con lugar para la próxima acción. */}
      <div className="shrink-0 space-y-2 border-b border-border px-2 py-2">
        <div className="flex items-center gap-1">
          <Popover open={abierto} onOpenChange={setAbierto}>
            <PopoverTrigger
              className={cn(
                buttonVariants({ variant: 'outline', size: 'sm' }),
                'h-7 min-w-0 flex-1 justify-start gap-1.5 px-2 text-xs',
              )}
            >
              {esSinAsignar ? (
                <PackageX size={12} className="shrink-0 text-amber-600 dark:text-amber-400" />
              ) : (
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: ruta?.color }}
                  aria-hidden
                />
              )}
              <span className="min-w-0 flex-1 truncate text-left font-medium">{etiqueta}</span>
              {/* Si la ruta que estás mirando está apagada, el trigger tiene que decirlo: si no, el
                  panel lista sus paradas, el mapa no dibuja nada, y parece un bug. */}
              {oculta && <EyeOff size={12} className="shrink-0 text-muted-foreground" />}
              {!esSinAsignar && ruta && (
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {ruta.camion.placa}
                </span>
              )}
              <ChevronsUpDown size={12} className="shrink-0 opacity-50" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-0">
              <Command>
                <CommandInput placeholder="Buscar ruta o placa…" className="h-8 text-xs" />

                {/* Prender y apagar de a una sirve para AISLAR una ruta; para eso primero hay que
                    apagar las otras ocho, y hacerlo de a una es justo el trabajo que estos dos botones
                    borran. Van arriba de la lista, con el conteo al lado: el número dice en qué estado
                    estás sin tener que contar ojitos fila por fila. */}
                <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-[11px] tabular-nums text-muted-foreground">
                    {enMapa} de {rutas.length} en el mapa
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 shrink-0 px-1.5 text-[11px]"
                    disabled={rutasOcultas.length === 0}
                    onClick={() => setRutasOcultas([])}
                  >
                    Mostrar todas
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 shrink-0 px-1.5 text-[11px]"
                    disabled={enMapa === 0}
                    onClick={() => setRutasOcultas(rutas.map((r) => r.id))}
                  >
                    Ocultar todas
                  </Button>
                </div>

                <CommandList>
                  <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                    Sin resultados
                  </CommandEmpty>
                  {/* El conjunto completo se ve ACÁ: color, placa, ocupación y conteos de cada ruta,
                      que es lo que la lista de tarjetas mostraba a costa de todo el panel. */}
                  <CommandGroup>
                    {rutas.map((r) => {
                      const c = cargaDeRuta(paradasAsignadas, r)
                      const rOculta = rutasOcultas.includes(r.id)
                      return (
                        <CommandItem
                          key={r.id}
                          value={`${r.nombre} ${r.camion.placa}`}
                          data-checked={rutaFoco === r.id}
                          onSelect={() => {
                            setRutaFoco(r.id)
                            setAbierto(false)
                          }}
                          // `[&>svg]:hidden` tapa el check que `CommandItem` dibuja SIEMPRE al final
                          // (invisible cuando no está elegida). Quedaba después del ojo, como un
                          // cuarto ícono en el borde, y era la mitad de por qué la fila se veía
                          // amontonada. La marca de "elegida" se dibuja acá abajo, en su propia
                          // columna a la IZQUIERDA: así el ancho de la fila no depende de cuál esté
                          // seleccionada y las columnas quedan alineadas de arriba a abajo.
                          className="gap-2 pl-1 pr-1 text-xs [&>svg]:hidden"
                        >
                          <span
                            className={cn(
                              'w-3 shrink-0 text-center text-[11px] font-bold leading-none',
                              rutaFoco === r.id ? 'text-primary' : 'text-transparent',
                            )}
                            aria-hidden
                          >
                            •
                          </span>
                          {/* Una ruta apagada se lee apagada: mismo dato, menos tinta. Sin esta señal
                              el ojo sería el único indicio y habría que recorrerlos uno por uno. */}
                          <span
                            className={cn(
                              'flex min-w-0 flex-1 items-center gap-2 transition-opacity',
                              rOculta && 'opacity-45',
                            )}
                          >
                            <span
                              className="size-2.5 shrink-0 rounded-full"
                              style={{ background: r.color }}
                              aria-hidden
                            />
                            <span className="min-w-0 flex-1 truncate">{r.nombre}</span>
                            {/* El aviso viaja en la lista y no solo en la ruta abierta: si hubiera que
                                entrar a cada una para descubrir cuál se pasó de clientes, con seis
                                camiones son seis clicks para una pregunta de un vistazo. */}
                            {c.excedeClientes && (
                              <AlertTriangle
                                size={11}
                                className="shrink-0 text-amber-600 dark:text-amber-400"
                              />
                            )}
                            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                              {r.camion.placa}
                            </span>
                            <span
                              className={cn(
                                'w-9 shrink-0 text-right text-[11px] font-semibold tabular-nums',
                                TEXTO_OCUPACION[c.nivel],
                              )}
                            >
                              {c.ocupacionPct}%
                            </span>
                          </span>
                          {/* Línea fina antes del ojo: sin ella el ícono se lee como una columna más
                              del dato de la ruta, cuando es un control. */}
                          <span className="h-4 w-px shrink-0 bg-border" aria-hidden />
                          <OjoRuta
                            oculta={rOculta}
                            nombre={r.nombre}
                            onToggle={() => toggleRutaVisible(r.id)}
                          />
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>

                  {/* "Sin asignar" es el resto de empaquetado del optimizador. Va en el mismo select y
                      no escondido en otro lado: es la ruta más importante de revisar cuando existe. */}
                  {sinAsignar.length > 0 && (
                    <CommandGroup heading="Pendiente">
                      <CommandItem
                        value="Sin asignar"
                        data-checked={esSinAsignar}
                        onSelect={() => {
                          setRutaFoco(SIN_ASIGNAR)
                          setAbierto(false)
                        }}
                        className="gap-2 text-xs"
                      >
                        <PackageX size={12} className="text-amber-600 dark:text-amber-400" />
                        <span className="min-w-0 flex-1 truncate">Sin asignar</span>
                        <span className="shrink-0 text-[11px] font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                          {sinAsignar.length}
                        </span>
                      </CommandItem>
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Solo para rutas reales: "Sin asignar" no es un camión —no tiene bandeo, no se dibuja ni se
              apaga— así que un engranaje ahí ofrecería tres acciones que no aplican. */}
          {!esSinAsignar && ruta && (
            <RutaMenu
              ruta={ruta}
              totalAccesorios={totalAccesorios(accesoriosDeRuta)}
              oculta={oculta}
              onAccesorios={() => abrirAccesorios(ruta.id)}
              onEncuadrar={() => pedirEncuadre('ruta')}
              onToggleVisible={() => toggleRutaVisible(ruta.id)}
            />
          )}
        </div>

        {esSinAsignar ? (
          <p className="text-[11px] leading-snug text-muted-foreground">
            No entran en ningún camión con la capacidad elegida. Sumá flota o sacá pedidos.
          </p>
        ) : (
          carga &&
          ruta && (
            <>
              <Ocupacion carga={carga} color={ruta.color} />
              <div className="flex items-baseline justify-between gap-2 text-[10px] tabular-nums text-muted-foreground">
                <span>
                  {fmtPeso.format(carga.pesoKg / 1000)} / {ruta.camion.capacidadPeso} t ·{' '}
                  {fmtPeso.format(carga.volumenM3)} / {ruta.camion.capacidadVolumen} m³
                </span>
                {/* El conteo de paradas se pinta cuando pasa el techo de clientes. Es la MISMA cifra
                    de siempre cambiando de color, y no un cartel nuevo al lado: el dato que se vuelve
                    problema tiene que avisar desde donde ya estaba, o hay que aprender dos lugares. */}
                <span
                  className={cn(
                    carga.excedeClientes && 'font-semibold text-amber-600 dark:text-amber-400',
                  )}
                  title={
                    carga.excedeClientes
                      ? `Más de ${MAX_CLIENTES_POR_CAMION} clientes en un camión: no le da la jornada aunque le sobre capacidad`
                      : undefined
                  }
                >
                  {carga.paradas.length} paradas · {carga.pedidos} pedidos
                </span>
              </div>

              {/* BANDEO, solo cuando hay. La ACCIÓN se mudó al engranaje de arriba; acá queda el DATO,
                  que sigue perteneciendo al detalle de la ruta —es un atributo del camión que sale,
                  igual que su ocupación—. Antes esta fila era un botón punteado que decía "Agregar
                  accesorios (pallets, carritos…)" incluso vacía: un campo de formulario en un panel
                  que no es un formulario, ocupando alto en las 9 de 10 rutas que no lo tocan.

                  Sin accesorios no se dibuja nada: la ausencia ya se ve, y anunciarla es gastar dos
                  renglones en decir "no hay". */}
              {accesoriosDeRuta.length > 0 && (
                <div className="flex items-center gap-1.5 text-[11px] leading-snug text-muted-foreground">
                  <Boxes size={12} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{resumenAccesorios(accesoriosDeRuta)}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-foreground">
                    {totalAccesorios(accesoriosDeRuta)}
                  </span>
                </div>
              )}

              {/* Sobrecarga de capacidad. Solo el nivel CRÍTICO trae cartel: entre 90 y 150 el color
                  de la barra alcanza —es un "va apretado" que se resuelve acomodando—, pero pasado el
                  150 hay que decir qué hacer, porque ningún acomodo mete media carga extra. */}
              {carga.nivel === 'critica' && (
                <p className="flex items-start gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[11px] leading-snug">
                  <AlertTriangle
                    size={12}
                    className="mt-px shrink-0 text-rose-600 dark:text-rose-400"
                  />
                  <span>
                    <span className="font-semibold text-rose-700 dark:text-rose-300">
                      {carga.ocupacionPct}% de capacidad
                    </span>{' '}
                    <span className="text-muted-foreground">
                      — el camión no puede salir así. Sacale paradas o repartilas en otra ruta.
                    </span>
                  </span>
                </p>
              )}

              {/* La ocupación en porcentaje NO puede contar esto: son dos restricciones distintas y un
                  solo número las mezclaría. La ruta puede ir al 38% y ser imposible igual. */}
              {carga.excedeClientes && (
                <p className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] leading-snug">
                  <AlertTriangle
                    size={12}
                    className="mt-px shrink-0 text-amber-600 dark:text-amber-400"
                  />
                  <span>
                    <span className="font-semibold text-amber-700 dark:text-amber-300">
                      {carga.paradas.length} clientes
                    </span>{' '}
                    <span className="text-muted-foreground">
                      — el tope por camión es {MAX_CLIENTES_POR_CAMION}. Movele paradas a otra ruta o
                      sumá un camión.
                    </span>
                  </span>
                </p>
              )}
            </>
          )
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar cliente en esta ruta"
            className="h-7 pl-7 text-xs"
            aria-label="Buscar parada"
          />
        </div>
      </div>

      {/* ── Tabla de paradas de la ruta elegida ──
          Encabezado fijo con las columnas que importan: orden de visita, cliente y peso. Es una tabla y
          no una lista porque las tres se comparan verticalmente entre filas. */}
      <div className="flex h-6 shrink-0 items-center gap-2 border-b border-border bg-muted/40 pl-1 pr-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="w-4 shrink-0" aria-hidden />
        <span className="w-5 shrink-0 text-right">#</span>
        <span className="min-w-0 flex-1">Cliente</span>
        <span className="shrink-0">Peso</span>
      </div>

      {/* SIN PAGINAR, a diferencia de los otros paneles. Acá se arrastra para reordenar, y un orden que
          se puede cambiar solo dentro de la página visible no es un orden: mover la parada 9 al primer
          lugar sería imposible. Una ruta tiene ~10 paradas, así que la lista entra scrolleando. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {visibles.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {paradas.length === 0
              ? 'Esta ruta todavía no tiene paradas.'
              : 'Ninguna parada coincide con la búsqueda.'}
          </p>
        ) : (
          <DndContext
            sensors={sensores}
            collisionDetection={closestCenter}
            // El arrastre es SOLO vertical: es una lista, no un tablero. Sin esto la fila se despega
            // hacia el costado y el gesto se siente flojo.
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={alSoltar}
          >
            <SortableContext
              items={visibles.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              {visibles.map((parada) => (
                <FilaParada
                  key={parada.id}
                  parada={parada}
                  enFoco={paradaFoco === parada.id}
                  onFoco={() => onFoco(parada.id)}
                  arrastrable={sePuedeReordenar}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Por qué NO se puede arrastrar ahora mismo. Una manija que a veces responde y a veces no, sin
          decir por qué, se lee como un bug. */}
      {!sePuedeReordenar && visibles.length > 1 && !esSinAsignar && (
        <p className="shrink-0 border-t border-border px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
          Limpiá la búsqueda para poder reordenar las paradas.
        </p>
      )}

      {rutaAccesorios && (
        <AccesoriosDialog
          abierto
          rutaNombre={rutaAccesorios.nombre}
          placa={rutaAccesorios.camion.placa}
          items={accesorios[rutaAccesorios.id] ?? []}
          onCerrar={cerrarAccesorios}
          onCambiar={(tipoId, cantidad, series) =>
            setAccesorio(rutaAccesorios.id, tipoId, cantidad, series)
          }
        />
      )}
    </div>
  )
}
