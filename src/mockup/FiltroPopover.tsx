// Filtro multi-select con buscador y contador propio.
//
// SUBIÓ DE `planner/` A LA RAÍZ DEL MOCKUP porque ya lo usan dos módulos: el planificador y el
// monitoreo. Un componente compartido colgando de una feature obliga a la otra a importar
// `../planner/…`, que es una dependencia en la dirección equivocada entre hermanos.
//
// DUPLICACIÓN CONOCIDA: `OrderSelectionPanel` tiene su propia copia. Se repite a propósito porque
// pertenece al flujo por steps, que está deprecado: este archivo es el que queda y el otro se va con
// su pantalla.
import { useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface FiltroOption {
  value: string
  label: string
  glyph?: ReactNode
  /**
   * Dato al final de la fila: cuánto pesa esa opción en el conjunto que se está filtrando (un monto,
   * un conteo). Opcional porque la mayoría de las dimensiones son un maestro y no tienen nada que
   * contar; donde sí lo hay, es lo que convierte al filtro en un RESUMEN — se ve el reparto completo
   * antes de elegir, en vez de tener que clickear opción por opción para descubrirlo.
   */
  hint?: ReactNode
}

export function FiltroPopover({
  label,
  icon: Icon,
  options,
  active,
  onToggle,
  searchPlaceholder,
  emptyText,
}: {
  label: string
  icon: LucideIcon
  options: FiltroOption[]
  active: string[]
  onToggle: (value: string) => void
  searchPlaceholder: string
  emptyText: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          buttonVariants({ variant: 'outline', size: 'sm' }),
          'h-7 shrink-0 gap-1.5 px-2 text-xs',
          active.length > 0 && 'border-primary/50 bg-primary/5',
        )}
      >
        <Icon size={13} />
        {label}
        {active.length > 0 && (
          <span className="flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums">
            {active.length}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
              {emptyText}
            </CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  data-checked={active.includes(opt.value)}
                  onSelect={() => onToggle(opt.value)}
                  className="gap-2 text-xs"
                >
                  {opt.glyph}
                  <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                  {opt.hint && (
                    <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
                      {opt.hint}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
