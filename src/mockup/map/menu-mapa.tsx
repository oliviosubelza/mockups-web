// Comportamiento y flecha de los MENÚS de las barras de herramientas de los mapas.
//
// Vive suelto porque el patrón se repite en tres barras —capas y trazos en monitoreo, capas y paneles en
// planificación— y las tres partes que lo componen son fáciles de implementar distinto: los tiempos del
// hover, cuál de los dos lados cancela el cierre, y para dónde apunta la flecha. Con una copia por barra,
// alcanza con que alguien ajuste un delay en un archivo para que dos menús que se ven iguales se sientan
// distintos.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Cuánto tarda el menú en abrirse al pasar el mouse por encima.
 *
 * No es cero, y en una barra VERTICAL eso importa más que en la barra horizontal de un editor: los botones
 * están apilados, así que el mouse pasa por arriba de uno para llegar a los de abajo. Sin demora, ir de
 * "Encuadrar" a "Avisos" abría el menú de capas en el camino. 120 ms es menos de lo que tarda alguien en
 * detenerse a propósito y más de lo que tarda en pasar de largo.
 */
const MS_ABRIR = 120

/**
 * Cuánto sigue abierto después de que el mouse se va.
 *
 * Cubre dos huecos reales: los 4 px de separación entre el botón y el menú (`sideOffset`), y el trayecto en
 * diagonal desde el botón hasta el primer ítem, que sale del área de los dos por un instante. Sin esta
 * gracia, el menú se cierra justo cuando vas a elegir algo — el defecto clásico de los menús por hover.
 */
const MS_CERRAR = 260

/** Lados en los que un menú puede abrirse. Es el mismo vocabulario que `DropdownMenuContent`. */
export type LadoMenu = 'top' | 'bottom' | 'left' | 'right'

const FLECHA = {
  top: ChevronUp,
  bottom: ChevronDown,
  left: ChevronLeft,
  right: ChevronRight,
} as const

/**
 * La flecha que anuncia que el botón ABRE algo, en vez de disparar una acción.
 *
 * POR QUÉ HACE FALTA. En estas barras todos los botones son un ícono cuadrado sin texto, y los que abren un
 * menú se veían idénticos a los que acercan, encuadran o centran: había que apretarlos para averiguar qué
 * hacían. La flecha es la convención de que hay algo más adentro, la misma que usa cualquier `select`.
 *
 * APUNTA AL LADO POR DONDE SALE EL MENÚ, y por eso recibe el mismo `side` que el contenido en vez de ser
 * siempre hacia abajo. Una flecha que promete un movimiento y hace otro es peor que no tener flecha: en
 * estas barras el panel se despliega al costado —hacia adentro del mapa— porque la barra está pegada a un
 * borde.
 *
 * EL TAMAÑO VA COMO CLASE `size-*` Y NO COMO PROP DE LUCIDE, y no es intercambiable: `buttonVariants` trae
 * `[&_svg:not([class*='size-'])]:size-4`, y ese CSS le gana a los atributos `width`/`height` que Lucide
 * escribe con su prop `size`. Sin la clase, la flecha se dibuja a 16 px —el mismo tamaño que el ícono al
 * que acompaña— y en un botón de 28 px el contenido no entra.
 */
function FlechaMenu({ side, className }: { side: LadoMenu; className?: string }) {
  const Icono = FLECHA[side]
  return <Icono className={cn('size-2 opacity-60', className)} strokeWidth={3} aria-hidden />
}

/**
 * El contenido de un botón que abre un menú: su ícono y la flecha, del lado correcto.
 *
 * ES UN COMPONENTE Y NO DOS ELEMENTOS SUELTOS porque la regla tiene DOS mitades y las dos se olvidan por
 * separado: la flecha apunta al lado por donde sale el menú, y además se ubica de ese lado del ícono. Una
 * flecha que apunta a la izquierda pero está dibujada a la derecha del ícono señala hacia el ícono, o sea
 * hacia adentro del botón — dice lo contrario de lo que pasa. Encapsulado, el `side` decide las dos cosas
 * y no hay forma de escribir la mitad.
 *
 * Devuelve un fragmento y no un `<div>`: así el ícono y la flecha siguen siendo hijos directos del botón y
 * su `flex` los alinea como a cualquier otro contenido.
 */
export function IconoConFlecha({ side, children }: { side: LadoMenu; children: ReactNode }) {
  // Arriba y a la izquierda la flecha va ANTES del ícono; abajo y a la derecha, después.
  const antes = side === 'left' || side === 'top'
  return (
    <>
      {antes && <FlechaMenu side={side} />}
      {children}
      {!antes && <FlechaMenu side={side} />}
    </>
  )
}

export interface MenuHover {
  abierto: boolean
  setAbierto: (abierto: boolean) => void
  /** Handlers para el TRIGGER: entrar abre (con demora), salir programa el cierre. */
  trigger: { onMouseEnter: () => void; onMouseLeave: () => void }
  /** Handlers para el CONTENIDO: entrar cancela el cierre pendiente, salir lo programa. */
  contenido: { onMouseEnter: () => void; onMouseLeave: () => void }
}

/**
 * Apertura por HOVER, como los menús de la barra de VS Code.
 *
 * Se maneja a mano porque Base UI no lo trae: su `Menu.Root` abre por click o por teclado, y el hover solo
 * abre SUBmenús. Así que el `open` va controlado y los dos lados —el botón y el panel— comparten UN
 * temporizador: el que entra lo cancela, el que sale lo arma. Eso es lo que permite que el mouse cruce el
 * hueco entre uno y otro sin que el menú se cierre en el camino, y no se puede lograr con un `<div>` que
 * los envuelva a los dos porque el contenido se portaliza fuera del árbol del trigger.
 *
 * El click y el teclado siguen funcionando: `onOpenChange` recibe las tres cosas igual. El hover se SUMA,
 * no reemplaza — importante porque en una pantalla táctil no hay hover, y si fuera la única forma de abrir,
 * el menú quedaría inalcanzable ahí.
 */
export function useMenuHover(): MenuHover {
  const [abierto, setAbierto] = useState(false)
  const temporizador = useRef<number | null>(null)

  const cancelar = () => {
    if (temporizador.current !== null) {
      clearTimeout(temporizador.current)
      temporizador.current = null
    }
  }
  const programar = (abrir: boolean) => {
    cancelar()
    temporizador.current = window.setTimeout(() => setAbierto(abrir), abrir ? MS_ABRIR : MS_CERRAR)
  }

  // Un temporizador vivo después de desmontar llamaría a `setState` sobre un componente que ya no está.
  useEffect(() => cancelar, [])

  return {
    abierto,
    setAbierto,
    trigger: { onMouseEnter: () => programar(true), onMouseLeave: () => programar(false) },
    contenido: { onMouseEnter: cancelar, onMouseLeave: () => programar(false) },
  }
}
