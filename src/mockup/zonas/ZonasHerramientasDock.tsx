// Dock VERTICAL de herramientas de dibujo, sobre el borde derecho del mapa.
//
// QUÉ PROBLEMA RESUELVE. Todo esto vivía en la barra de arriba, junto con el nombre, la ciudad, cancelar
// y guardar: nueve controles en una sola fila de 44 px de alto. Tres cosas de naturaleza distinta
// mezcladas en un renglón — QUIÉN es la zona (nombre, ciudad), CÓMO se la dibuja (imantado, deshacer,
// cerrar) y QUÉ se hace con ella (cancelar, guardar) — así que para encontrar cualquiera había que leer
// la fila entera, y el ancho crecía hasta chocar con el listado.
//
// La separación es por naturaleza, no por tamaño:
//   · arriba (`ZonasWorkspaceView`) → identidad y decisión: cancelar, ciudad, nombre, guardar.
//   · acá, al costado → los INSTRUMENTOS. Se usan decenas de veces por zona, siempre con el mouse ya
//     sobre el mapa, y no cambian de lugar al aparecer o desaparecer un vecino.
//   · abajo a la derecha → el resultado (`ZonasConflictosPanel`).
//
// VERTICAL Y EN LA DERECHA, no horizontal: es la convención de cualquier editor vectorial (Figma, QGIS,
// Illustrator) y deja el eje horizontal —el que el trazo recorre— libre. La izquierda ya la ocupa el
// listado, así que la derecha es el único costado disponible.
//
// SIN ATAJOS INVENTADOS: cada botón dice en su `title` el atajo que YA existe (Ctrl+Z, Enter, Alt). El
// dock no agrega teclas nuevas; hace visible lo que antes había que descubrir.
import { Check, Crosshair, Magnet, PenLine, Redo2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatearMetros, METROS_HOLGURA } from '../map/geo/holgura'

function Separador() {
  return <span className="mx-auto my-0.5 h-px w-5 bg-border" aria-hidden />
}

export function ZonasHerramientasDock({
  snap,
  onSnap,
  snapDisponible,
  motivoSinSnap,
  puedeDeshacer,
  onDeshacer,
  puedeRehacer,
  onRehacer,
  /** `true` mientras se agregan vértices con click; `false` = ajustando los que ya están. */
  trazando,
  puedeCerrar,
  onCerrar,
  puedeRedibujar,
  onRedibujar,
  onEncuadrar,
}: {
  snap: boolean
  onSnap: () => void
  snapDisponible: boolean
  /**
   * Por qué el imantado está apagado, cuando el motivo no es el de siempre ("no hay vecinas").
   *
   * Va como TEXTO y no como un `tipoZona` porque el dock no sabe —ni tiene por qué— que las zonas
   * tienen tipos: es una caja de instrumentos sobre un contorno, y darle esa categoría lo obligaría a
   * decidir con qué reglas se dibuja cada tipo, que es justamente lo que resuelve el workspace. Acá
   * solo cambia una frase.
   */
  motivoSinSnap?: string
  puedeDeshacer: boolean
  onDeshacer: () => void
  puedeRehacer: boolean
  onRehacer: () => void
  trazando: boolean
  puedeCerrar: boolean
  onCerrar: () => void
  puedeRedibujar: boolean
  onRedibujar: () => void
  onEncuadrar: () => void
}) {
  return (
    <div className="pointer-events-auto flex w-10 flex-col items-center gap-0.5 rounded-xl border border-border bg-card/95 p-1 shadow-xl backdrop-blur-sm">
      <Button
        variant={snap && snapDisponible ? 'secondary' : 'ghost'}
        size="icon"
        className="size-8"
        aria-pressed={snap}
        disabled={!snapDisponible}
        onClick={onSnap}
        title={
          !snapDisponible
            ? (motivoSinSnap ?? 'Imantado: no hay zonas vecinas en esta ciudad')
            : snap
              ? `Imantado a ${formatearMetros(METROS_HOLGURA)} del borde vecino — activado (Alt lo suspende)`
              : 'Imantado desactivado — los vértices caen donde clickeás'
        }
      >
        <Magnet size={14} className={snap && snapDisponible ? '' : 'opacity-40'} />
      </Button>

      <Separador />

      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        title="Deshacer (Ctrl+Z)"
        disabled={!puedeDeshacer}
        onClick={onDeshacer}
      >
        <Undo2 size={14} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        title="Rehacer (Ctrl+Shift+Z)"
        disabled={!puedeRehacer}
        onClick={onRehacer}
      >
        <Redo2 size={14} />
      </Button>

      <Separador />

      {/* Cerrar el polígono tenía TRES formas (click en el primer vértice, doble click, Enter) y ninguna
          visible: había que descubrir un atajo o acertarle a un punto de 13 px. Acá es un botón, y sigue
          diciendo el atajo. */}
      {trazando ? (
        <Button
          variant="secondary"
          size="icon"
          className="size-8"
          title="Cerrar el polígono (Enter o doble click)"
          disabled={!puedeCerrar}
          onClick={onCerrar}
        >
          <Check size={14} />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          title="Redibujar desde cero — borra el contorno actual"
          disabled={!puedeRedibujar}
          onClick={onRedibujar}
        >
          <PenLine size={14} />
        </Button>
      )}

      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        title="Encuadrar el contorno en pantalla"
        onClick={onEncuadrar}
      >
        <Crosshair size={14} />
      </Button>
    </div>
  )
}
