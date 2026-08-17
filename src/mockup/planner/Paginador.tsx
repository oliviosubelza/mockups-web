// Paginación de las listas de los paneles.
//
// POR QUÉ NO SE USA EL DataTable ACÁ. El DataTable es el componente correcto para una tabla de ancho
// completo: trae columnas redimensionables, orden persistido, densidad, selector de columnas. En un
// panel de 300 px sobre un mapa nada de eso entra, y su barra de herramientas sola mide más que las
// filas que muestra. Los diálogos SÍ usan DataTable, que es donde ese ancho existe.
//
// Lo que sí hace falta es el paginado: una lista de 59 paradas dentro de un panel angosto obliga a un
// scroll larguísimo, y perdés la referencia de cuánto llevás recorrido.
//
// DOS RENGLONES Y NO UNO. Antes eran dos flechas y un "1/6": para llegar a la página 5 había que
// apretar cuatro veces, y la única forma de ver más filas juntas era no verlas. Los números directos y
// el selector de filas no entran en 284 px junto con el rango, así que el pie creció un renglón. Son
// 14 px de panel a cambio de sacar cuatro clicks de un gesto que se hace todo el tiempo.
import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

/** Filas por página que se ofrecen. El primero es el default de cualquier lista del panel. */
export const FILAS_POR_PAGINA = [10, 25, 50] as const

export interface Pagina<T> {
  items: T[]
  pagina: number
  paginas: number
  total: number
  desde: number
  hasta: number
  setPagina: (p: number) => void
  porPagina: number
  setPorPagina: (n: number) => void
}

/**
 * Rebana una lista en páginas. `clave` identifica el conjunto: cuando cambia (otro filtro, otra ruta),
 * la paginación vuelve a la primera página — quedarse en la página 4 de una lista que ahora tiene 2 es
 * lo que produce el clásico "no hay nada acá" con datos que sí existen.
 */
export function usePagina<T>(items: T[], porPaginaInicial: number, clave: string): Pagina<T> {
  const [pagina, setPagina] = useState(0)
  const [porPagina, setPorPaginaState] = useState(porPaginaInicial)

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
    porPagina,
    // Cambiar el tamaño vuelve a la primera página. Conservar el índice haría que pasar de 10 a 50
    // filas te deje mirando la página 4 de una lista que ahora tiene 2 — el mismo "no hay nada acá".
    setPorPagina: (n: number) => {
      setPorPaginaState(n)
      setPagina(0)
    },
  }
}

/**
 * Números de página a dibujar, con elipsis.
 *
 * Con 6 páginas entran todas; con 40 no entra ninguna lista completa en un panel de 300 px. La regla
 * clásica —primera, última y una ventana alrededor de la actual— es la que mantiene el control del
 * mismo ancho sin importar el tamaño del conjunto, que es justamente lo que un panel angosto necesita.
 */
export function ventanaPaginas(actual: number, total: number, max = 7): (number | 'gap')[] {
  if (total <= max) return Array.from({ length: total }, (_, i) => i)

  const lados = Math.floor((max - 3) / 2) // descontando primera, última y al menos una elipsis
  let desde = Math.max(1, actual - lados)
  let hasta = Math.min(total - 2, actual + lados)

  // Pegado a un extremo, la ventana se corre hacia el otro en vez de encogerse: si no, cerca del
  // principio el control muestra tres números y cerca del medio cinco, y el ancho baila.
  if (actual <= lados + 1) hasta = Math.min(total - 2, max - 2)
  if (actual >= total - lados - 2) desde = Math.max(1, total - max + 1)

  const paginas: (number | 'gap')[] = [0]
  if (desde > 1) paginas.push('gap')
  for (let i = desde; i <= hasta; i++) paginas.push(i)
  if (hasta < total - 2) paginas.push('gap')
  paginas.push(total - 1)
  return paginas
}

/**
 * Pie de paginación.
 *
 * No se renderiza cuando la lista no llega ni al tamaño de página más chico: ahí no hay nada que
 * paginar ni que redimensionar, y el pie sería una barra que solo ocupa lugar. Los NÚMEROS, en cambio,
 * se esconden solos con una sola página, pero el selector de filas se queda — si desapareciera al
 * subir a 50 filas, no habría forma de volver a 10.
 */
export function Paginador<T>({ pagina }: { pagina: Pagina<T> }) {
  if (pagina.total <= FILAS_POR_PAGINA[0]) return null

  const numeros = ventanaPaginas(pagina.pagina, pagina.paginas)

  return (
    <div className="shrink-0 space-y-0.5 border-t border-border px-2 py-1">
      <div className="flex h-4 items-center justify-between gap-2 text-[11px] tabular-nums text-muted-foreground">
        <span>
          {pagina.desde}–{pagina.hasta} de {pagina.total}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex h-4 items-center gap-0.5 rounded px-1 tabular-nums transition-colors hover:bg-muted hover:text-foreground"
            title="Filas por página"
          >
            {pagina.porPagina} filas
            <ChevronDown size={9} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-0">
            {FILAS_POR_PAGINA.map((n) => (
              <DropdownMenuItem
                key={n}
                onClick={() => pagina.setPorPagina(n)}
                className={cn('text-xs', n === pagina.porPagina && 'font-semibold')}
              >
                {n} filas
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {pagina.paginas > 1 && (
        <div className="flex items-center justify-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-5 shrink-0"
            disabled={pagina.pagina === 0}
            onClick={() => pagina.setPagina(pagina.pagina - 1)}
            title="Página anterior"
            aria-label="Página anterior"
          >
            <ChevronLeft size={13} />
          </Button>

          {numeros.map((n, i) =>
            n === 'gap' ? (
              // La elipsis NO es un botón: no hay una "página …" a la que ir, y hacerla clickeable
              // (saltar de a bloques) es un gesto que nadie descubre y que sorprende al que lo toca.
              <span
                key={`gap-${i}`}
                className="w-3 text-center text-[11px] leading-none text-muted-foreground"
                aria-hidden
              >
                ·
              </span>
            ) : (
              <button
                key={n}
                type="button"
                onClick={() => pagina.setPagina(n)}
                aria-current={n === pagina.pagina ? 'page' : undefined}
                aria-label={`Página ${n + 1}`}
                className={cn(
                  'size-5 shrink-0 rounded text-[11px] tabular-nums transition-colors',
                  n === pagina.pagina
                    ? 'bg-primary/15 font-semibold text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {n + 1}
              </button>
            ),
          )}

          <Button
            variant="ghost"
            size="icon"
            className="size-5 shrink-0"
            disabled={pagina.pagina >= pagina.paginas - 1}
            onClick={() => pagina.setPagina(pagina.pagina + 1)}
            title="Página siguiente"
            aria-label="Página siguiente"
          >
            <ChevronRight size={13} />
          </Button>
        </div>
      )}
    </div>
  )
}
