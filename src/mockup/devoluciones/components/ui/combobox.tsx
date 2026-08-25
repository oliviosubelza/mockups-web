// El `Combobox` que el módulo de devoluciones espera, montado sobre el kit de ESTE repo.
//
// Vino de `mockups_sales`, donde el kit es Radix; acá es Base UI. La API pública es la misma —mismas
// props, mismos nombres— así que los cuatro llamadores quedaron intactos; lo que cambió es el interior:
//
//   · `asChild` → `render`. Base UI presta sus props al elemento que le pasás en vez de clonar un hijo.
//   · Se fue `onCloseAutoFocus` y con él `focusMovesOnSelect`. La prop se acepta y se ignora para no
//     tocar a los llamadores, pero está documentada abajo: es una promesa que hoy no se cumple.
//   · Las variables `--radix-popover-*` no existen acá. El ancho se mide del trigger y el alto se topa
//     en 22rem, que es lo que hacía el cálculo original en la práctica.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

export interface ComboboxOption {
  value: string
  label: string
  /**
   * Un cuerpo más rico para la fila, cuando una línea de texto no alcanza. Es solo presentación: el
   * `label` sigue siendo lo que busca el filtro y lo que muestra el trigger una vez elegido.
   */
  content?: ReactNode
}

interface ComboboxProps {
  options: ComboboxOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  invalid?: boolean
  id?: string
  className?: string
  /** Nombre accesible del trigger, donde no hay un `<label>` visible apuntándole. */
  'aria-label'?: string
  /**
   * ACEPTADA Y SIN EFECTO en esta versión. En el original evitaba que el foco volviera al trigger
   * cuando el llamador movía el cursor a otro lado al elegir. Base UI no expone el `onCloseAutoFocus`
   * con el que se hacía. Se deja en la firma para no tocar a los llamadores; si el salto de foco
   * molesta en alguna pantalla, hay que resolverlo acá y no en el llamador.
   */
  focusMovesOnSelect?: boolean
}

/** Selección simple con buscador. Para listas largas (productos, clientes, vendedores). */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Selecciona…',
  searchPlaceholder = 'Buscar…',
  emptyText = 'Sin resultados.',
  disabled,
  invalid,
  id,
  className,
  'aria-label': ariaLabel,
}: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const [ancho, setAncho] = useState<number>()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const selected = options.find((o) => o.value === value)

  // El panel copia el ancho del trigger. Se mide al abrir y no una sola vez: el trigger vive dentro de
  // formularios que se reacomodan, y un ancho viejo deja el panel corrido respecto del campo.
  useLayoutEffect(() => {
    if (open && triggerRef.current) setAncho(triggerRef.current.getBoundingClientRect().width)
  }, [open])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            ref={triggerRef}
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={ariaLabel}
            disabled={disabled}
            className={cn(
              'h-9 w-full justify-between gap-2 px-3 font-normal',
              !selected && 'text-muted-foreground',
              invalid && 'border-destructive focus-visible:ring-destructive/30',
              className,
            )}
          />
        }
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        className="flex flex-col overflow-hidden p-0"
        style={{ width: ancho, maxHeight: '22rem' }}
      >
        <Command className="flex min-h-0 flex-col">
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-none flex-1">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => {
                    onChange(opt.value)
                    setOpen(false)
                  }}
                  // Un cuerpo de varias filas tiene que colgar de arriba, o el tilde flota en el medio
                  // de una tarjeta de dos líneas.
                  className={cn(opt.content && 'items-start')}
                >
                  <Check
                    className={cn(
                      'h-4 w-4 shrink-0',
                      opt.content && 'mt-0.5',
                      opt.value === value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {opt.content ?? opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
