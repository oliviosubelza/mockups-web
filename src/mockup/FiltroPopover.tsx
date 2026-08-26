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

/**
 * MULTI o ÚNICO.
 *
 * `multi` (el default, y lo que hacía este componente desde siempre) es un filtro que NARROW: se acumulan
 * valores y el trigger muestra cuántos hay puestos.
 *
 * `unico` es un SELECTOR: hay exactamente un valor elegido, el trigger muestra su etiqueta en vez de un
 * contador, y elegir cierra el popover porque la decisión ya está tomada. Se agregó para el selector de
 * ciudad de las zonas de distribución, que necesitaba buscador y no lo tenía —era un `Select` común—.
 *
 * ES UNA BANDERA Y NO UN COMPONENTE NUEVO porque todo lo demás es idéntico: el mismo trigger, el mismo
 * buscador, la misma lista, el mismo popover. Dos componentes gemelos significan que el día que se
 * arregle el ancho del popover hay que acordarse de los dos.
 */
export type ModoFiltro = 'multi' | 'unico'

export function FiltroPopover({
  label,
  icon: Icon,
  options,
  active,
  onToggle,
  searchPlaceholder,
  emptyText,
  modo = 'multi',
  ancho = 'w-56',
}: {
  label: string
  icon: LucideIcon
  options: FiltroOption[]
  /** En `unico`, a lo sumo un valor. */
  active: string[]
  onToggle: (value: string) => void
  searchPlaceholder: string
  emptyText: string
  modo?: ModoFiltro
  /** Ancho del popover. Se puede ensanchar cuando las etiquetas son largas y `w-56` las corta. */
  ancho?: string
}) {
  const [open, setOpen] = useState(false)
  const unico = modo === 'unico'
  const elegida = unico ? options.find((o) => active.includes(o.value)) : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          buttonVariants({ variant: 'outline', size: 'sm' }),
          'h-7 shrink-0 gap-1.5 px-2 text-xs',
          active.length > 0 && !unico && 'border-primary/50 bg-primary/5',
        )}
        title={unico ? label : undefined}
      >
        <Icon size={13} />
        {/* EN `unico` EL TRIGGER MUESTRA EL VALOR, no la dimensión: «Santa Cruz de la Sierra» y no
            «Ciudad 1». Un selector cuyo botón no dice qué está elegido obliga a abrirlo para saberlo, y
            acá el valor manda sobre TODO lo que se ve en la pantalla. La etiqueta de la dimensión queda
            en el `title`, que es donde hace falta solo la primera vez. */}
        {unico ? (
          <span className="min-w-0 max-w-44 truncate">{elegida?.label ?? label}</span>
        ) : (
          <>
            {label}
            {active.length > 0 && (
              <span className="flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums">
                {active.length}
              </span>
            )}
          </>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className={cn('p-0', ancho)}>
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
                  onSelect={() => {
                    onToggle(opt.value)
                    // Elegir CIERRA en modo único: la decisión ya está tomada y dejarlo abierto obliga a
                    // un click de más (o a un click afuera) antes de poder ver el mapa que acabás de
                    // cambiar. En multi se queda abierto a propósito: se están acumulando valores.
                    if (unico) setOpen(false)
                  }}
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
