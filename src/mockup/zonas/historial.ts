// Historial de undo/redo para el editor de zonas.
//
// POR QUÉ NO ALCANZA UN `useState` CON UNA PILA: arrastrar un vértice dispara `drag` en cada
// mousemove — decenas de eventos por gesto. Si cada uno empujara una entrada, un solo arrastre
// llenaría el historial y Ctrl+Z tendría que apretarse cuarenta veces para deshacerlo.
//
// De ahí las DOS operaciones de escritura. `reemplazar` pisa el presente sin crear entrada (es el
// cuadro intermedio de un gesto en curso) y `confirmar` cierra la acción y sí agrega una. La regla
// para quien lo usa es simple: `reemplazar` mientras el mouse está apretado, `confirmar` al soltarlo.
import { useCallback, useMemo, useState } from 'react'

/** Tope de entradas. Un editor de zonas es una sesión larga con muchos ajustes finos, y cada entrada
 *  guarda el arreglo completo de vértices: sin tope, la pila crece toda la sesión. */
const MAX_ENTRADAS = 100

export interface Historial<T> {
  presente: T
  /** Cuadro intermedio de un gesto (arrastre): pisa el presente SIN crear una entrada. */
  reemplazar: (valor: T) => void
  /** Acción terminada: descarta el futuro y agrega una entrada nueva. */
  confirmar: (valor: T) => void
  /** Arranca de cero: una sola entrada y sin historia previa (cargar una zona existente). */
  reiniciar: (valor: T) => void
  deshacer: () => void
  rehacer: () => void
  puedeDeshacer: boolean
  puedeRehacer: boolean
}

interface Estado<T> {
  pila: T[]
  /** Índice del presente dentro de `pila`. Todo lo que está DESPUÉS es el futuro rehacible. */
  i: number
}

export function useHistorial<T>(inicial: T): Historial<T> {
  // Pila e índice en UN solo `useState` a propósito: son dos mitades del mismo dato y separarlos deja
  // una ventana de render donde el índice ya cambió y la pila no.
  const [estado, setEstado] = useState<Estado<T>>({ pila: [inicial], i: 0 })

  const reemplazar = useCallback((valor: T) => {
    setEstado(({ pila, i }) => {
      const siguiente = [...pila]
      siguiente[i] = valor
      return { pila: siguiente, i }
    })
  }, [])

  const confirmar = useCallback((valor: T) => {
    setEstado(({ pila, i }) => {
      // `slice(0, i + 1)` es lo que borra el futuro: después de deshacer y volver a editar, la rama
      // que se había deshecho deja de existir. Es el comportamiento de cualquier editor.
      const cortada = [...pila.slice(0, i + 1), valor]
      const recortada = cortada.length > MAX_ENTRADAS ? cortada.slice(cortada.length - MAX_ENTRADAS) : cortada
      return { pila: recortada, i: recortada.length - 1 }
    })
  }, [])

  const reiniciar = useCallback((valor: T) => {
    setEstado({ pila: [valor], i: 0 })
  }, [])

  const deshacer = useCallback(() => {
    setEstado((e) => (e.i > 0 ? { ...e, i: e.i - 1 } : e))
  }, [])

  const rehacer = useCallback(() => {
    setEstado((e) => (e.i < e.pila.length - 1 ? { ...e, i: e.i + 1 } : e))
  }, [])

  return useMemo(
    () => ({
      presente: estado.pila[estado.i],
      reemplazar,
      confirmar,
      reiniciar,
      deshacer,
      rehacer,
      puedeDeshacer: estado.i > 0,
      puedeRehacer: estado.i < estado.pila.length - 1,
    }),
    [estado, reemplazar, confirmar, reiniciar, deshacer, rehacer],
  )
}
