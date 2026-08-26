import { AlertTriangle, MapPin, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { TipoConflicto } from '../map/geo/holgura'
import { CIUDAD_META, ciudadDeCityId } from '../mock-data'
import type { Zona } from '../zones-store'

export interface FiltrosZonas {
  texto: string
  estado?: 'activa' | 'inactiva'
}

const ESTADOS: { label: string; value: 'activa' | 'inactiva' }[] = [
  { label: 'Activas', value: 'activa' },
  { label: 'Inactivas', value: 'inactiva' },
]

/** Lista compacta del maestro logístico. Buscar y seleccionar son sus únicas responsabilidades. */
export function ZonasListaPanel({
  zonas,
  filtros,
  onFiltros,
  seleccionadaId,
  onSeleccionar,
  onEditar,
  deshabilitado,
  enConflicto,
}: {
  zonas: Zona[]
  filtros: FiltrosZonas
  onFiltros: (filters: FiltrosZonas) => void
  seleccionadaId: number | null
  onSeleccionar: (id: number | null) => void
  onEditar: (id: number) => void
  deshabilitado: boolean
  enConflicto?: Map<number, TipoConflicto>
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 space-y-2 border-b border-border p-2.5">
        <div className="relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filtros.texto}
            onChange={(event) => onFiltros({ ...filtros, texto: event.target.value })}
            placeholder="Buscar zona logística…"
            className="h-7 pl-7 text-xs"
          />
        </div>
        <div className="flex items-center gap-1">
          {ESTADOS.map(({ label, value }) => {
            const active = filtros.estado === value
            return (
              <Button
                key={value}
                variant={active ? 'secondary' : 'ghost'}
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={() => onFiltros({ ...filtros, estado: active ? undefined : value })}
              >
                {label}
              </Button>
            )
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {zonas.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {filtros.texto || filtros.estado
              ? 'Ninguna zona con estos filtros.'
              : 'Todavía no hay zonas logísticas. Dibujá la primera con «Nueva zona».'}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {zonas.map((zona) => {
              const selected = zona.id === seleccionadaId
              const conflict = enConflicto?.get(zona.id)
              const city = ciudadDeCityId(zona.cityId)
              return (
                <li key={zona.id}>
                  <button
                    type="button"
                    onClick={() => onSeleccionar(selected ? null : zona.id)}
                    onDoubleClick={() => !deshabilitado && onEditar(zona.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                      selected ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/60',
                    )}
                  >
                    {conflict ? (
                      <AlertTriangle
                        size={13}
                        className={cn(
                          'shrink-0',
                          conflict === 'solapa' ? 'text-destructive' : 'text-amber-500',
                        )}
                        aria-label={conflict === 'solapa' ? 'Se pisa con otra zona' : 'Borde demasiado cerca'}
                      />
                    ) : (
                      <MapPin
                        size={13}
                        className={cn('shrink-0', zona.isActive ? 'text-primary' : 'text-muted-foreground')}
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate font-medium">{zona.name}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {city ? CIUDAD_META[city].label : `city ${zona.cityId}`}
                    </span>
                    {!zona.isActive && (
                      <Badge variant="outline" className="h-4 shrink-0 px-1 text-[10px]">Inactiva</Badge>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
