// Señales visuales de "esto acaba de cambiar" para el listado de monitoreo.
//
// El problema: el listado se actualiza por SSE mientras el planificador mira otra parte de la tabla.
// Sin un aviso, el dato cambia y nadie se entera — la pantalla es "en vivo" solo para quien tiene la
// suerte de estar mirando la fila correcta en el segundo correcto.
//
// La solución NO es animar todo. Se avisa con dos canales de duración idéntica y significado distinto:
//   · `Destello`   → la CELDA que cambió. Precisión: dice QUÉ cambió.
//   · `useFilasVivas` → una barra de acento en la FILA. Alcance: se ve con visión periférica y hace
//                       girar la vista hacia el lugar correcto.
//
// Los dos apagan solos a los 1200 ms (`DESTELLO_MS`), que es lo que dura la animación en `index.css`.
// Si se cambia allá, se cambia acá: es un solo número en dos archivos porque CSS no puede leer TS.
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/** Duración del aviso. Igual que las animaciones `celda-viva` / `fila-viva` de `index.css`. */
const DESTELLO_MS = 1200

/**
 * `true` durante `DESTELLO_MS` cada vez que `firma` cambia.
 *
 * La `firma` es un string o número que RESUME lo que importa de ese dato: para el progreso es el
 * conteo de cerradas, para el estado es el estado. Se pasa una firma y no el objeto entero porque los
 * objetos se reconstruyen en cada tick del stream aunque no haya cambiado nada, y entonces la tabla
 * destellaría siempre — que es lo mismo que no destellar nunca.
 *
 * El primer render NO destella: al abrir la pantalla todo es "nuevo" y la tabla entera se prendería
 * fuego sin que haya pasado nada.
 */
export function useCambio(firma: string | number | null | undefined): boolean {
  const anterior = useRef(firma)
  const [activo, setActivo] = useState(false)

  useEffect(() => {
    if (anterior.current === firma) return
    anterior.current = firma
    setActivo(true)
    const id = setTimeout(() => setActivo(false), DESTELLO_MS)
    return () => clearTimeout(id)
  }, [firma])

  return activo
}

/** Envuelve una celda y la destella cuando su `firma` cambia. */
export function Destello({
  firma,
  className,
  children,
}: {
  firma: string | number | null | undefined
  className?: string
  children: React.ReactNode
}) {
  const cambio = useCambio(firma)
  // `inline-flex` y no `block`: la celda tiene que seguir midiendo lo que mide su contenido, o el
  // fondo del destello se estira por toda la columna y parece que cambió la fila entera.
  return <span className={cn('inline-flex w-full items-center', cambio && 'celda-viva', className)}>{children}</span>
}

/**
 * Qué filas cambiaron recién. Devuelve un `Set` de ids para que `rowClassName` lo consulte.
 *
 * Vive acá y no en la vista porque necesita memoria entre renders: compara la firma de cada fila
 * contra la de la vuelta anterior. Una fila nueva (recién despachada) **no** cuenta como cambio — al
 * entrar no hay nada que "cambió", y con 40 filas el primer render sería un destello general.
 */
export function useFilasVivas<T>(
  filas: T[],
  idDe: (fila: T) => string,
  firmaDe: (fila: T) => string,
): Set<string> {
  const firmas = useRef(new Map<string, string>())
  const [vivas, setVivas] = useState<Set<string>>(new Set())

  useEffect(() => {
    const cambiadas: string[] = []
    for (const fila of filas) {
      const id = idDe(fila)
      const firma = firmaDe(fila)
      const previa = firmas.current.get(id)
      if (previa !== undefined && previa !== firma) cambiadas.push(id)
      firmas.current.set(id, firma)
    }
    if (cambiadas.length === 0) return

    setVivas((prev) => new Set([...prev, ...cambiadas]))
    const id = setTimeout(() => {
      // Se sacan SOLO las que entraron en esta tanda: si se vaciara el set entero, un cambio que
      // llegó 200 ms después vería su aviso cortado a la mitad.
      setVivas((prev) => {
        const siguiente = new Set(prev)
        for (const c of cambiadas) siguiente.delete(c)
        return siguiente
      })
    }, DESTELLO_MS)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas])

  return vivas
}
