// Listado del maestro de restricciones, plegado sobre el borde izquierdo del mapa.
//
// Es el gemelo de `zonas/ZonasListaPanel` y tiene sus mismas dos únicas responsabilidades: BUSCAR y
// ELEGIR. Nada de operar sobre lo elegido —editar, activar, borrar viven en la barra de abajo, sobre el
// eje por el que el mouse ya se mueve— y nada de horarios ni reglas, que son el interior de la
// restricción y no su identidad.
//
// LA DIFERENCIA CON ZONAS ES EL FILTRO POR TIPO, y no es decorativo: acá conviven tres cosas que en el
// mapa se ven distintas o no se ven en absoluto. `PLATE_ROTATION` no tiene geometría, así que este panel
// es el ÚNICO lugar de la pantalla donde esas restricciones existen; sin poder aislarlas quedarían
// mezcladas entre polígonos y líneas, buscándose de a una en una lista.
//
// Por eso también cada fila dice si la restricción tiene o no geometría. Sin ese dato, clickear una
// regla por placa parecería no hacer nada: el mapa no se mueve porque no hay dónde ir.
import { AlertTriangle, Ban, Route, Search, Square, Truck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  RESTRICTION_TYPES,
  RESTRICTION_TYPE_META,
  describeSchedules,
  type PlanningRestriction,
  type RestrictionType,
} from './domain'

export interface FiltrosRestricciones {
  texto: string
  tipo?: RestrictionType
  estado?: 'activa' | 'inactiva'
}

const ESTADOS: { label: string; value: 'activa' | 'inactiva' }[] = [
  { label: 'Activas', value: 'activa' },
  { label: 'Inactivas', value: 'inactiva' },
]

const ICONO: Record<RestrictionType, typeof Ban> = {
  RESTRICTED_AREA: Square,
  CLOSED_ROAD: Route,
  PLATE_ROTATION: Truck,
}

export function RestriccionesListaPanel({
  restricciones,
  filtros,
  onFiltros,
  seleccionadaId,
  onSeleccionar,
  onEditar,
}: {
  restricciones: PlanningRestriction[]
  filtros: FiltrosRestricciones
  onFiltros: (filtros: FiltrosRestricciones) => void
  seleccionadaId: number | null
  onSeleccionar: (id: number | null) => void
  onEditar: (id: number) => void
}) {
  const hayFiltro = Boolean(filtros.texto || filtros.tipo || filtros.estado)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 space-y-2 border-b border-border p-2.5">
        <div className="relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filtros.texto}
            onChange={(event) => onFiltros({ ...filtros, texto: event.target.value })}
            placeholder="Buscar restricción…"
            className="h-7 pl-7 text-xs"
          />
        </div>
        {/* El tipo va con la etiqueta CORTA ("Área", "Vía", "Placa") y no con la larga: son tres chips en
            320 px de panel, y "Restricción por placa" no entra sin partirse en dos renglones. */}
        <div className="flex items-center gap-1">
          {RESTRICTION_TYPES.map((tipo) => {
            const activo = filtros.tipo === tipo
            const Icono = ICONO[tipo]
            return (
              <Button
                key={tipo}
                variant={activo ? 'secondary' : 'ghost'}
                size="sm"
                className="h-6 gap-1 px-1.5 text-[11px]"
                title={RESTRICTION_TYPE_META[tipo].description}
                onClick={() => onFiltros({ ...filtros, tipo: activo ? undefined : tipo })}
              >
                <Icono size={11} />
                {RESTRICTION_TYPE_META[tipo].shortLabel}
              </Button>
            )
          })}
        </div>
        <div className="flex items-center gap-1">
          {ESTADOS.map(({ label, value }) => {
            const activo = filtros.estado === value
            return (
              <Button
                key={value}
                variant={activo ? 'secondary' : 'ghost'}
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={() => onFiltros({ ...filtros, estado: activo ? undefined : value })}
              >
                {label}
              </Button>
            )
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {restricciones.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {hayFiltro
              ? 'Ninguna restricción con estos filtros.'
              : 'Todavía no hay restricciones. Creá la primera con «Nueva restricción».'}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {restricciones.map((restriccion) => {
              const seleccionada = restriccion.id === seleccionadaId
              const Icono = ICONO[restriccion.restrictionType]
              const sinGeometria = restriccion.geometryGeoJson === null
              return (
                <li key={restriccion.id}>
                  <button
                    type="button"
                    onClick={() => onSeleccionar(seleccionada ? null : restriccion.id)}
                    onDoubleClick={() => onEditar(restriccion.id)}
                    className={cn(
                      'w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                      seleccionada ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/60',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      {/* El ícono dice el TIPO y el color la severidad — pero solo si la restricción está
                          activa. Una inactiva bloqueante no bloquea nada, así que pintarla de rojo
                          mentiría con el único canal que se lee sin leer. */}
                      <Icono
                        size={13}
                        className={cn(
                          'shrink-0',
                          !restriccion.isActive
                            ? 'text-muted-foreground'
                            : restriccion.severity === 'BLOCKING'
                              ? 'text-destructive'
                              : 'text-amber-500',
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate font-medium">{restriccion.name}</span>
                      {!restriccion.isActive && (
                        <Badge variant="outline" className="h-4 shrink-0 px-1 text-[10px]">
                          Inactiva
                        </Badge>
                      )}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 pl-[21px] text-[11px] text-muted-foreground">
                      <span className="min-w-0 truncate">{describeSchedules(restriccion)}</span>
                      {sinGeometria && (
                        <>
                          <span aria-hidden>·</span>
                          <span
                            className="flex shrink-0 items-center gap-0.5"
                            title="Se evalúa por horario y reglas vehiculares: no hay nada que mostrar en el mapa"
                          >
                            <AlertTriangle size={9} />
                            sin geometría
                          </span>
                        </>
                      )}
                    </span>
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
