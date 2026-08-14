// Paginación de las listas de los paneles.
//
// POR QUÉ NO SE USA EL DataTable ACÁ. El DataTable es el componente correcto para una tabla de ancho
// completo: trae columnas redimensionables, orden persistido, densidad, selector de columnas. En un
// panel de 300 px sobre un mapa nada de eso entra, y su barra de herramientas sola mide más que las
// filas que muestra. Los diálogos SÍ usan DataTable, que es donde ese ancho existe.
//
// Lo que sí hace falta es el paginado: una lista de 59 paradas dentro de un panel angosto obliga a un
// scroll larguísimo, y perdés la referencia de cuánto llevás recorrido. Este es el mínimo que resuelve
// eso: cuántos se ven de cuántos hay, y dos flechas.
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface Pagina<T> {
  items: T[]
  pagina: number
  paginas: number
  total: number
  desde: number
  hasta: number
  setPagina: (p: number) => void
}

/**
 * Rebana una lista en páginas. `clave` identifica el conjunto: cuando cambia (otro filtro, otra ruta),
 * la paginación vuelve a la primera página — quedarse en la página 4 de una lista que ahora tiene 2 es
 * lo que produce el clásico "no hay nada acá" con datos que sí existen.
 */
export function usePagina<T>(items: T[], porPagina: number, clave: string): Pagina<T> {
  const [pagina, setPagina] = useState(0)

  useEffect(() => {
    setPagina(0)
  }, [clave])

  const paginas = Math.max(1, Math.ceil(items.length / porPagina))
  // Acota en el RENDER además del efecto: si la lista se acorta, el frame intermedio no puede pintar
  // una página vacía antes de que el efecto corrija.
  const actual = Math.min(pagina, paginas - 1)

  const visibles = useMemo(
    () => items.slice(actual * porPagina, actual * porPagina + porPagina),
    [actual, items, porPagina],
  )

  return {
    items: visibles,
    pagina: actual,
    paginas,
    total: items.length,
    desde: items.length === 0 ? 0 : actual * porPagina + 1,
    hasta: Math.min(items.length, (actual + 1) * porPagina),
    setPagina,
  }
}

/** Pie de paginación. No se renderiza con una sola página: dos flechas muertas son ruido. */
export function Paginador<T>({ pagina }: { pagina: Pagina<T> }) {
  if (pagina.paginas <= 1) return null

  return (
    <div className="flex h-7 shrink-0 items-center justify-between gap-2 border-t border-border px-2">
      <span className="text-[11px] tabular-nums text-muted-foreground">
        {pagina.desde}–{pagina.hasta} de {pagina.total}
      </span>
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="size-5"
          disabled={pagina.pagina === 0}
          onClick={() => pagina.setPagina(pagina.pagina - 1)}
          title="Página anterior"
          aria-label="Página anterior"
        >
          <ChevronLeft size={13} />
        </Button>
        <span className="px-1 text-[11px] tabular-nums text-muted-foreground">
          {pagina.pagina + 1}/{pagina.paginas}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-5"
          disabled={pagina.pagina >= pagina.paginas - 1}
          onClick={() => pagina.setPagina(pagina.pagina + 1)}
          title="Página siguiente"
          aria-label="Página siguiente"
        >
          <ChevronRight size={13} />
        </Button>
      </div>
    </div>
  )
}
