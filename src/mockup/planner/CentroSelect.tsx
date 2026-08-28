// El selector de CENTRO —de dónde sale un camión, a dónde vuelve— compartido por sus dos lugares.
//
// Vive suelto y no dentro de uno de los dos porque los dos son legítimos y contestan preguntas
// distintas: el diálogo de salidas y llegadas es donde se DECIDE, antes de optimizar y para toda la
// flota junta; la celda de la tabla de rutas es donde se CORRIGE una ruta puntual, mirando su
// ocupación en la misma fila. Duplicar el control era garantizar que un día uno de los dos escriba
// el id crudo y el otro el nombre.
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

/** Un centro elegible. Es lo mínimo que el control necesita: quién es y cómo se llama. */
export interface OpcionCentro {
  id: number
  nombre: string
}

/**
 * `stopPropagation` EN EL CONTENEDOR y no en cada control: en la tabla, la fila entera es clickeable
 * —hace foco en la ruta y encuadra el mapa—, así que sin esto abrir el select cambiaría además la
 * ruta elegida. Es el mismo problema que un botón dentro de una fila: dos cosas por un click, y una
 * no se pidió. En el diálogo no molesta.
 *
 * `SelectValue` con children y no vacío: Base UI, sin render explícito, escribe el VALOR crudo
 * —«501»— en vez de la etiqueta. El nombre llega por prop y no se busca en `opciones` porque un
 * centro fuera de la lista (una llegada de otra ciudad) igual tiene que poder mostrar su nombre.
 */
export function CentroSelect({
  valor,
  nombre,
  opciones,
  onElegir,
  titulo,
  destacado = false,
  discreto = true,
}: {
  valor: number
  nombre: string
  opciones: OpcionCentro[]
  onElegir: (id: number) => void
  titulo: string
  /** Marca el control cuando lo que dice es una decisión y no el default. */
  destacado?: boolean
  /**
   * Sin borde ni fondo hasta el hover. Es lo que corresponde EN LA TABLA: nueve columnas por fila, y
   * seis cajas de formulario convierten una comparación en un formulario. En el diálogo se apaga —ahí
   * el control es el contenido de la pantalla y esconderlo lo haría invisible—.
   */
  discreto?: boolean
}) {
  return (
    <div className="min-w-0 flex-1" onClick={(e) => e.stopPropagation()}>
      <Select
        value={String(valor)}
        onValueChange={(v) => {
          const id = Number(v)
          if (Number.isFinite(id) && id !== valor) onElegir(id)
        }}
      >
        <SelectTrigger
          size="sm"
          title={titulo}
          aria-label={titulo}
          className={cn(
            'w-full',
            discreto
              ? 'h-6 border-transparent bg-transparent px-1 text-[11px] shadow-none hover:border-border hover:bg-muted/50'
              : 'h-7 text-xs',
            destacado ? 'font-medium text-foreground' : discreto && 'text-muted-foreground',
          )}
        >
          <SelectValue>{() => <span className="truncate">{nombre}</span>}</SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-60">
          {opciones.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
