// Menú contextual de una parada: click derecho sobre su marcador.
//
// POR QUÉ EXISTE. El click izquierdo tiene que quedar libre para lo que se hace todo el tiempo —
// recorrer paradas— y eso deja sin lugar a las ACCIONES sobre una parada puntual. El click derecho es
// el gesto convencional para "qué puedo hacer con esto", y así las dos cosas conviven sin pelearse.
//
// POR QUÉ ES A MANO Y NO UN `DropdownMenu`. El disparador no es un elemento de React: los marcadores
// son HTML serializado que Leaflet inyecta en su propio DOM, así que no hay nada que envolver en un
// trigger. Lo único que llega del click es una coordenada, y anclar un menú de Base UI a un punto
// arbitrario cuesta más que estas 40 líneas.
import { useEffect, useLayoutEffect, useRef } from 'react'
import { Check, Crosshair, ImageIcon, PackageX, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Parada } from '../mock-data'
import { TEXTO_OCUPACION, cargaDeRuta, type RutaPlan } from './planner-model'

/** Margen mínimo al borde del mapa cuando el menú se voltea para no salirse. */
const MARGEN_PX = 8

function Opcion({
  icon: Icon,
  children,
  onClick,
  destacada = false,
  peligrosa = false,
}: {
  icon?: typeof Check
  children: React.ReactNode
  onClick: () => void
  destacada?: boolean
  /** Saca algo del plan. Se pinta distinto para que no se elija por inercia bajando por el menú. */
  peligrosa?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
        'hover:bg-accent hover:text-accent-foreground',
        destacada && 'text-primary',
        peligrosa && 'text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400',
      )}
    >
      {Icon ? <Icon size={13} className="shrink-0" /> : <span className="size-3.5 shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  )
}

export function ParadaMenu({
  parada,
  rutas,
  paradas = [],
  x,
  y,
  marcada,
  hayRutas,
  onCerrar,
  onVerFicha,
  onAlternarSeleccion,
  onCentrar,
  onMover,
  onQuitar,
}: {
  parada: Parada
  rutas: RutaPlan[]
  paradas?: Parada[]
  /** Píxeles dentro del contenedor del mapa (`containerPoint` de Leaflet). */
  x: number
  y: number
  marcada: boolean
  /**
   * Si las rutas del plan YA EXISTEN (reparto hecho).
   *
   * `false` antes de optimizar: en ese momento hay camiones elegidos y paradas sueltas, no recorridos,
   * y listar las N rutas derivadas de esos camiones las hacía pasar por generadas.
   */
  hayRutas: boolean
  onCerrar: () => void
  onVerFicha: () => void
  onAlternarSeleccion: () => void
  onCentrar: () => void
  onMover: (rutaId: string | null) => void
  /** Saca el punto de entrega del plan entero. Reversible desde la lista de "Quitados". */
  onQuitar: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  // Cerrar con Escape o con un click afuera. `mousedown` y no `click`: si esperáramos al click, el
  // mismo gesto que abre el menú de OTRA parada cerraría este después de haber abierto aquel.
  useEffect(() => {
    const afuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCerrar()
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
    }
    document.addEventListener('mousedown', afuera)
    window.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', afuera)
      window.removeEventListener('keydown', escape)
    }
  }, [onCerrar])

  // Voltear contra los bordes. Se mide DESPUÉS de pintar (`useLayoutEffect`) porque el alto depende de
  // cuántas rutas haya, y antes de que el navegador dibuje para que no se vea el salto.
  useLayoutEffect(() => {
    const el = ref.current
    const contenedor = el?.offsetParent as HTMLElement | null
    if (!el || !contenedor) return
    const maxX = contenedor.clientWidth - el.offsetWidth - MARGEN_PX
    const maxY = contenedor.clientHeight - el.offsetHeight - MARGEN_PX
    el.style.left = `${Math.max(MARGEN_PX, Math.min(x, maxX))}px`
    el.style.top = `${Math.max(MARGEN_PX, Math.min(y, maxY))}px`
  }, [x, y, hayRutas, rutas.length])

  return (
    <div
      ref={ref}
      // `z-20`: por encima de los flotantes de la pantalla (z-10) y por debajo del velo de trabajo.
      className="absolute z-20 w-60 overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-xl"
      style={{ left: x, top: y }}
      role="menu"
    >
      <div className="border-b border-border px-2 pb-1.5 pt-1">
        <p className="truncate text-xs font-semibold">{parada.cliente}</p>
        <p className="truncate text-[11px] text-muted-foreground">{parada.puntoEntrega}</p>
      </div>

      <div className="py-1">
        <Opcion
          icon={ImageIcon}
          onClick={() => {
            onVerFicha()
            onCerrar()
          }}
        >
          Ver ficha del punto
        </Opcion>
        <Opcion
          icon={marcada ? PackageX : Check}
          onClick={() => {
            onAlternarSeleccion()
            onCerrar()
          }}
        >
          {marcada ? 'Quitar de la selección' : 'Marcar esta parada'}
        </Opcion>
        <Opcion
          icon={Crosshair}
          onClick={() => {
            onCentrar()
            onCerrar()
          }}
        >
          Centrar en el mapa
        </Opcion>
        {/* QUITAR ≠ "Sin asignar", y la diferencia es la que más se confunde: sin asignar el punto
            sigue en el plan esperando camión —y el HUD lo cuenta como pendiente—; quitado sale del
            plan entero y deja de aparecer en el mapa. Por eso está acá arriba, junto a las acciones
            sobre el punto, y no abajo entre las rutas a las que se lo puede mandar. */}
        <Opcion
          icon={Trash2}
          peligrosa
          onClick={() => {
            onQuitar()
            onCerrar()
          }}
        >
          Quitar del plan
        </Opcion>
      </div>

      {/* Mover de ruta: lista PLANA y no un submenú. Con hasta ~10 rutas un submenú agrega un hover y
          una espera para llegar a lo mismo, y este menú se abre justo para esto.

          DESAPARECE ENTERO antes del reparto —ni el título ni la lista vacía— porque un "Mover a" sin
          destinos posibles no es una acción deshabilitada: es una acción que todavía no existe. */}
      {hayRutas && (
        <div className="border-t border-border pt-1">
          <p className="px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Mover a
          </p>
          <div className="max-h-48 overflow-y-auto">
            {rutas.map((ruta) => {
              const c = paradas.length > 0 ? cargaDeRuta(paradas, ruta) : null
              return (
                <Opcion
                  key={ruta.id}
                  onClick={() => {
                    onMover(ruta.id)
                    onCerrar()
                  }}
                >
                  <span className="flex w-full items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: ruta.color }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{ruta.nombre}</span>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {ruta.camion.placa}
                    </span>
                    {c && (
                      <span
                        className={cn(
                          'shrink-0 text-right text-[11px] font-semibold tabular-nums',
                          TEXTO_OCUPACION[c.nivel],
                        )}
                      >
                        {c.ocupacionPct}%
                      </span>
                    )}
                  </span>
                </Opcion>
              )
            })}
            {/* Solo si ya tiene ruta: "sacar de la ruta" sobre una parada sin asignar es una opción muerta. */}
            {parada.rutaId && (
              <Opcion
                icon={PackageX}
                onClick={() => {
                  onMover(null)
                  onCerrar()
                }}
              >
                Sin asignar
              </Opcion>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
