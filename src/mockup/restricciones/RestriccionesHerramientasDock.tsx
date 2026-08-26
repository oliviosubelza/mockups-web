// Dock VERTICAL de herramientas de dibujo, sobre el borde derecho del mapa de restricciones.
//
// Es el mismo dock que `zonas/ZonasHerramientasDock`, y comparte con él las tres decisiones de fondo:
//   · la separación es por NATURALEZA, no por tamaño: arriba va identidad y decisión (cancelar, tipo,
//     nombre, guardar), acá los INSTRUMENTOS —se usan decenas de veces por geometría, siempre con el
//     mouse ya sobre el mapa— y abajo a la derecha el resultado (el panel de validación);
//   · vertical y a la derecha, la convención de cualquier editor vectorial, que además deja libre el eje
//     horizontal —el que el trazo recorre— y no pelea con el listado de la izquierda;
//   · sin atajos inventados: cada botón dice en su `title` el atajo que YA existe (Ctrl+Z, Enter, Alt).
//
// LAS DOS DIFERENCIAS CON EL DE ZONAS SALEN DE LA REGLA GEOMÉTRICA, QUE ACÁ NO EXISTE:
//
// 1. El imantado NO deja holgura, imanta ENCIMA del borde. Entre dos zonas de reparto tiene que quedar
//    una franja de un metro (un cliente no puede caer en dos zonas), pero una restricción se dibuja
//    justamente para que COINCIDA con algo: el perímetro exacto de un mercado, el borde de la zona a la
//    que le pega, la calle que se cerró. Dejar un metro de sobra convertiría "esta área es la zona Norte"
//    en "esta área es casi la zona Norte", que es una diferencia que después nadie puede explicar.
//
// 2. El botón de terminar cambia de nombre y de mínimo según el tipo. Un ÁREA se cierra (3 vértices, el
//    último se une con el primero); una VÍA se termina (2 puntos, no hay lado de cierre). Es el mismo
//    botón porque es el mismo momento —"ya está, pasá a ajustar"—, pero llamar "cerrar el polígono" a un
//    trazo abierto haría buscar un lado que no se va a guardar.
import { Check, Crosshair, Magnet, PenLine, Redo2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

function Separador() {
  return <span className="mx-auto my-0.5 h-px w-5 bg-border" aria-hidden />
}

export function RestriccionesHerramientasDock({
  snap,
  onSnap,
  snapDisponible,
  puedeDeshacer,
  onDeshacer,
  puedeRehacer,
  onRehacer,
  /** `true` mientras se agregan puntos con click; `false` = ajustando los que ya están. */
  trazando,
  /** `true` para un área (anillo), `false` para una vía (trazo abierto). */
  cerrado,
  puedeTerminar,
  onTerminar,
  puedeRedibujar,
  onRedibujar,
  onEncuadrar,
}: {
  snap: boolean
  onSnap: () => void
  snapDisponible: boolean
  puedeDeshacer: boolean
  onDeshacer: () => void
  puedeRehacer: boolean
  onRehacer: () => void
  trazando: boolean
  cerrado: boolean
  puedeTerminar: boolean
  onTerminar: () => void
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
            ? 'Imantado: no hay zonas ni restricciones a las que engancharse'
            : snap
              ? 'Imantado a los bordes de las zonas y de las otras restricciones — activado (Alt lo suspende)'
              : 'Imantado desactivado — los puntos caen donde clickeás'
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

      {trazando ? (
        <Button
          variant="secondary"
          size="icon"
          className="size-8"
          title={
            cerrado
              ? 'Cerrar el área (Enter o doble click)'
              : 'Terminar el trazo de la vía (Enter o doble click)'
          }
          disabled={!puedeTerminar}
          onClick={onTerminar}
        >
          <Check size={14} />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          title="Redibujar desde cero — borra la geometría actual"
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
        title="Encuadrar la geometría en pantalla"
        onClick={onEncuadrar}
      >
        <Crosshair size={14} />
      </Button>
    </div>
  )
}
