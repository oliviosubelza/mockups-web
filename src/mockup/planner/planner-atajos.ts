// Atajos de teclado del planificador.
//
// POR QUÉ EXISTEN. Esta pantalla es de trabajo repetitivo: mirar una ruta, marcar dos paradas, moverlas,
// encuadrar, mirar la siguiente. Con el mouse eso son cuatro viajes a esquinas distintas de la pantalla
// por vuelta. Los atajos que están acá son los de esa vuelta, no un catálogo.
//
// LA TABLA ES LA FUENTE. Los atajos se declaran como DATO (`ATAJOS`) y de ahí salen las dos cosas: el
// manejador que los ejecuta y la ayuda que los lista. Escribirlos dos veces garantiza que algún día la
// ayuda mienta.
import { useEffect } from 'react'

export interface Atajo {
  /** Lo que se muestra en la ayuda y en los tooltips. */
  teclas: string
  descripcion: string
  grupo: 'Herramientas' | 'Vista' | 'Selección' | 'Plan'
  /**
   * `null` para los que NO son de teclado (Shift+click). Se listan igual en la ayuda: es donde alguien
   * va a buscar "cómo marco varias", y esa respuesta no puede faltar por no ser una tecla.
   */
  tecla: string | null
  /** `true` si el atajo pide Ctrl (o ⌘ en Mac). */
  meta?: boolean
}

export const ATAJOS: Atajo[] = [
  { grupo: 'Herramientas', tecla: 'h', teclas: 'H', descripcion: 'Mover el mapa' },
  { grupo: 'Herramientas', tecla: 's', teclas: 'S', descripcion: 'Marcar paradas clickeándolas' },
  { grupo: 'Herramientas', tecla: 'r', teclas: 'R', descripcion: 'Marcar con rectángulo' },
  { grupo: 'Herramientas', tecla: 'l', teclas: 'L', descripcion: 'Marcar con lazo' },

  { grupo: 'Vista', tecla: 'f', teclas: 'F', descripcion: 'Encuadrar todas las paradas' },
  { grupo: 'Vista', tecla: 'b', teclas: 'B', descripcion: 'Mostrar u ocultar el panel lateral' },
  // 1-2-3 siguen el orden de la barra superior, que es el orden de la decisión (flota → pedidos →
  // rutas). Si el atajo y el botón no coincidieran, habría dos órdenes que aprender para lo mismo.
  { grupo: 'Vista', tecla: '1', teclas: '1', descripcion: 'Ir a Flota' },
  { grupo: 'Vista', tecla: '2', teclas: '2', descripcion: 'Ir a Pedidos' },
  { grupo: 'Vista', tecla: '3', teclas: '3', descripcion: 'Ir a Rutas' },

  { grupo: 'Selección', tecla: null, teclas: 'Shift + click', descripcion: 'Sumar o sacar una parada' },
  {
    grupo: 'Selección',
    tecla: null,
    teclas: 'Shift + arrastrar',
    descripcion: 'Sumar un área a lo ya marcado',
  },
  { grupo: 'Selección', tecla: 'a', meta: true, teclas: 'Ctrl + A', descripcion: 'Marcar todas las paradas visibles' },
  { grupo: 'Selección', tecla: 'Escape', teclas: 'Esc', descripcion: 'Limpiar la selección o cerrar el detalle' },

  { grupo: 'Plan', tecla: 'o', teclas: 'O', descripcion: 'Optimizar el reparto' },
  { grupo: 'Plan', tecla: '?', teclas: '?', descripcion: 'Ver esta ayuda' },
]

/** En Mac el modificador se dibuja ⌘. Se calcula una vez: no cambia en runtime. */
export const ES_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

export const etiquetaTeclas = (a: Atajo) => (ES_MAC ? a.teclas.replace('Ctrl', '⌘') : a.teclas)

/**
 * ¿El evento nació en un lugar donde la tecla es TEXTO y no un comando?
 *
 * Sin esto, escribir "flota" en el buscador de camiones dispararía encuadrar (f), ir a Rutas (l→no,
 * pero o→optimizar sí) y media pantalla se movería sola. Es el bug clásico de los atajos de una sola
 * letra, y por eso el guard va primero que cualquier otra cosa.
 */
function enCampoDeTexto(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.closest !== 'function') return false
  return el.closest('input, textarea, select, [contenteditable="true"]') !== null
}

/**
 * ¿Hay un diálogo abierto?
 *
 * Con la ficha del punto o el detalle de un canal en pantalla, las teclas son del diálogo: apretar 2
 * no puede cambiar el panel de atrás mientras mirás una foto. Escape se deja pasar igual porque lo
 * maneja el propio diálogo — el guard solo evita que ADEMÁS limpie la selección de abajo.
 */
function hayDialogo(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"]') !== null
}

export interface AccionesAtajos {
  setHerramienta: (h: 'pan' | 'punto' | 'rect' | 'lasso') => void
  encuadrar: () => void
  alternarPanel: () => void
  irAPanel: (p: 'pedidos' | 'flota' | 'rutas') => void
  seleccionarTodo: () => void
  limpiar: () => void
  optimizar: () => void
  verAyuda: () => void
}

export function usePlannerAtajos(acciones: AccionesAtajos): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (enCampoDeTexto(e.target)) return
      // Ningún atajo lleva Alt: si está apretada, es un atajo del sistema o del navegador.
      if (e.altKey) return

      const meta = e.ctrlKey || e.metaKey

      if (meta) {
        // `Ctrl+A` es "seleccionar todo" en todos lados; acá lo único seleccionable son las paradas.
        if (e.key.toLowerCase() === 'a' && !hayDialogo()) {
          e.preventDefault()
          acciones.seleccionarTodo()
        }
        return
      }

      if (e.key === 'Escape') {
        if (hayDialogo()) return
        acciones.limpiar()
        return
      }

      if (hayDialogo()) return

      switch (e.key.toLowerCase()) {
        case 'h':
          acciones.setHerramienta('pan')
          break
        case 's':
          acciones.setHerramienta('punto')
          break
        case 'r':
          acciones.setHerramienta('rect')
          break
        case 'l':
          acciones.setHerramienta('lasso')
          break
        case 'f':
          acciones.encuadrar()
          break
        case 'b':
          acciones.alternarPanel()
          break
        case '1':
          acciones.irAPanel('flota')
          break
        case '2':
          acciones.irAPanel('pedidos')
          break
        case '3':
          acciones.irAPanel('rutas')
          break
        case 'o':
          acciones.optimizar()
          break
        case '?':
          acciones.verAyuda()
          break
        default:
          return
      }
      // Solo se previene el default de las teclas que EFECTIVAMENTE se manejaron: hacerlo antes del
      // switch rompería el resto del teclado de la página.
      e.preventDefault()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [acciones])
}
