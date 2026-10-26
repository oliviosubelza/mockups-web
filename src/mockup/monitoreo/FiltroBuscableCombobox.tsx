import { useMemo, useState, type ReactNode } from 'react'
import { Check, ChevronDown, Search, X, type LucideIcon } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface FiltroBuscableOption {
  value: string
  label: string
  subtitle?: string
  glyph?: ReactNode
}

interface FiltroBuscableComboboxProps {
  label: string
  placeholderTodos: string
  searchPlaceholder: string
  icon: LucideIcon
  options: FiltroBuscableOption[]
  selectedValues: string[]
  onToggle: (value: string) => void
  onClear: () => void
  popoverWidth?: string
}

export function FiltroBuscableCombobox({
  label,
  placeholderTodos,
  searchPlaceholder,
  icon: Icon,
  options,
  selectedValues,
  onToggle,
  onClear,
  popoverWidth = 'w-72',
}: FiltroBuscableComboboxProps) {
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Filtrado de opciones en tiempo real por búsqueda
  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.subtitle && opt.subtitle.toLowerCase().includes(q)),
    )
  }, [options, searchQuery])

  // Etiqueta para el botón disparador (Trigger)
  const triggerLabel = useMemo(() => {
    if (selectedValues.length === 0) return placeholderTodos
    if (selectedValues.length === 1) {
      const match = options.find((o) => o.value === selectedValues[0])
      return match ? match.label : selectedValues[0]
    }
    return `${selectedValues.length} ${label.toLowerCase()}s`
  }, [selectedValues, options, placeholderTodos, label])

  const hasSelection = selectedValues.length > 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              'flex h-8 min-w-[155px] max-w-[230px] items-center justify-between gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-800 shadow-xs hover:bg-slate-50 focus-visible:outline-none cursor-pointer text-left dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 transition-colors',
              hasSelection
                ? 'border-indigo-500/50 bg-indigo-50/20 text-indigo-600 font-medium dark:text-indigo-400 dark:border-indigo-500/40 dark:bg-indigo-950/20'
                : 'text-slate-500 dark:text-slate-400',
            )}
            title={hasSelection ? `${label}: ${triggerLabel}` : placeholderTodos}
          >
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <Icon size={13} className={cn('shrink-0', hasSelection ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400')} />
              <span className="truncate">{triggerLabel}</span>
              {selectedValues.length > 1 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[9px] font-bold text-white tabular-nums shrink-0">
                  {selectedValues.length}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0 ml-1">
              {hasSelection && (
                <span
                  onClick={(e) => {
                    e.stopPropagation()
                    onClear()
                  }}
                  className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  title={`Quitar filtro de ${label.toLowerCase()}`}
                >
                  <X size={12} />
                </span>
              )}
              <ChevronDown size={12} className="opacity-50" />
            </div>
          </button>
        }
      />

      <PopoverContent className={cn('p-2', popoverWidth)} align="start">
        {/* Buscador interno con botón de borrado de búsqueda */}
        <div className="relative mb-2">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 pr-7 text-xs bg-slate-50 dark:bg-slate-950"
            autoFocus
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Opción "Todos los ..." */}
        <button
          type="button"
          onClick={() => {
            onClear()
            setOpen(false)
          }}
          className={cn(
            'flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer mb-1',
            !hasSelection && 'bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300',
          )}
        >
          <span className="flex items-center gap-1.5">
            <Icon size={13} className="text-slate-400" />
            {placeholderTodos}
          </span>
          {!hasSelection && <Check size={13} className="text-indigo-600 dark:text-indigo-400" />}
        </button>

        <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

        {/* Lista con scroll de opciones */}
        <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
          {filteredOptions.length === 0 ? (
            <div className="py-4 text-center text-xs text-slate-400">
              No se encontraron {label.toLowerCase()}s para "{searchQuery}"
            </div>
          ) : (
            filteredOptions.map((opt) => {
              const isSelected = selectedValues.includes(opt.value)
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onToggle(opt.value)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md p-2 text-xs transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer',
                    isSelected && 'bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300',
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {opt.glyph ? (
                      <div className="shrink-0">{opt.glyph}</div>
                    ) : (
                      <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100 font-mono text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {opt.label.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-slate-900 dark:text-slate-100">
                        {opt.label}
                      </div>
                      {opt.subtitle && (
                        <div className="truncate text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                          {opt.subtitle}
                        </div>
                      )}
                    </div>
                  </div>
                  {isSelected && <Check size={14} className="text-indigo-600 dark:text-indigo-400 shrink-0 ml-2" />}
                </button>
              )
            })
          )}
        </div>

        {/* Pie de selección activa */}
        {hasSelection && (
          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 px-1">
            <span>
              {selectedValues.length} seleccionado{selectedValues.length !== 1 ? 's' : ''}
            </span>
            <button
              type="button"
              onClick={onClear}
              className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 hover:underline cursor-pointer font-medium"
            >
              Limpiar selección
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
