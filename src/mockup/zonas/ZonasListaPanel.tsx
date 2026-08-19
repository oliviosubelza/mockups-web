// Listado de zonas como PANEL FLOTANTE sobre el mapa, plegable.
//
// POR QUÉ NO ES UN SplitPane, aunque la pantalla tenga "lista + mapa": las dos pantallas del proyecto
// que lo usaban lo abandonaron y las dos dejaron escrito por qué (`MonitoreoDetalleView.tsx:1-13`,
// `PlannerView.tsx:10-14`). Un panel que EMPUJA le come ancho al mapa, y al abrirlo o cerrarlo Leaflet
// rearma los tiles y se pierde la referencia visual de dónde estabas mirando. En un editor de dibujo es
// peor todavía: el canvas se reencuadraría mientras estás poniendo vértices.
//
// POR QUÉ UNA LISTA Y NO EL `DataTable`: en 320 px de ancho una tabla con filtros y paginado no entra.
// Lo que hace falta acá es encontrar una zona y saltar a ella, no comparar columnas.
//
// LAS ACCIONES VIVEN EN EL PIE, no en un menú por fila ni en un globo sobre el mapa. Son las de la zona
// SELECCIONADA, y la selección se hace tanto desde acá como clickeando el polígono: un solo lugar donde
// buscarlas, en vez de dos juegos de botones que hay que mantener iguales.
import { useMemo } from 'react'
import { Crosshair, MapPin, Pencil, Plus, Power, Search, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { CIUDAD_META, ciudadDeCityId, type CiudadId } from '../mock-data'
import type { Zona } from '../zones-store'

export interface FiltrosZonas {
  texto: string
  ciudad?: CiudadId
  estado?: 'activa' | 'inactiva'
}

const ESTADOS: { label: string; value: 'activa' | 'inactiva' }[] = [
  { label: 'Activas', value: 'activa' },
  { label: 'Inactivas', value: 'inactiva' },
]

export function ZonasListaPanel({
  zonas,
  filtros,
  onFiltros,
  seleccionadaId,
  onSeleccionar,
  onEncuadrar,
  onEditar,
  onNueva,
  onAlternarActiva,
  onEliminar,
  deshabilitado,
}: {
  /** Ya filtradas por el llamador: el panel muestra, no decide. */
  zonas: Zona[]
  filtros: FiltrosZonas
  onFiltros: (f: FiltrosZonas) => void
  seleccionadaId: number | null
  onSeleccionar: (id: number | null) => void
  onEncuadrar: (id: number) => void
  onEditar: (id: number) => void
  onNueva: () => void
  onAlternarActiva: (id: number) => void
  onEliminar: (zona: Zona) => void
  /** `true` mientras se dibuja o edita: el panel queda de consulta y no puede disparar acciones que
   *  cambiarían de zona en medio de un trazo sin guardar. */
  deshabilitado: boolean
}) {
  const seleccionada = useMemo(
    () => zonas.find((z) => z.id === seleccionadaId) ?? null,
    [zonas, seleccionadaId],
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 space-y-2 border-b border-border p-2.5">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filtros.texto}
              onChange={(e) => onFiltros({ ...filtros, texto: e.target.value })}
              placeholder="Buscar zona…"
              className="h-7 pl-7 text-xs"
            />
          </div>
          <Button
            size="sm"
            className="h-7 shrink-0 gap-1.5 px-2 text-xs"
            onClick={onNueva}
            disabled={deshabilitado}
          >
            <Plus size={13} />
            Nueva
          </Button>
        </div>

        {/* Filtros como chips y no como <Select>: son pocos valores y alternarlos es un click en vez de
            abrir un desplegable, elegir y que se cierre. */}
        <div className="flex flex-wrap gap-1">
          {Object.entries(CIUDAD_META).map(([id, meta]) => {
            const activo = filtros.ciudad === id
            return (
              <Button
                key={id}
                variant={activo ? 'secondary' : 'ghost'}
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={() => onFiltros({ ...filtros, ciudad: activo ? undefined : (id as CiudadId) })}
              >
                {meta.label}
              </Button>
            )
          })}
          <span className="mx-0.5 my-auto h-4 w-px bg-border" aria-hidden />
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
        {zonas.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            Ninguna zona con estos filtros.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {zonas.map((zona) => {
              const sel = zona.id === seleccionadaId
              const ciudad = ciudadDeCityId(zona.cityId)
              return (
                <li key={zona.id}>
                  <button
                    type="button"
                    // Un click selecciona (y encuadra); el doble click entra a editar el contorno. Es
                    // el gesto que ya tiene aprendido cualquiera que haya usado un explorador de
                    // archivos, y evita gastar un botón por fila.
                    onClick={() => onSeleccionar(sel ? null : zona.id)}
                    onDoubleClick={() => !deshabilitado && onEditar(zona.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                      sel ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/60',
                    )}
                  >
                    <MapPin
                      size={13}
                      className={cn('shrink-0', zona.isActive ? 'text-primary' : 'text-muted-foreground')}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">{zona.name}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {ciudad ? CIUDAD_META[ciudad].label : `city ${zona.cityId}`}
                    </span>
                    {!zona.isActive && (
                      <Badge variant="outline" className="h-4 shrink-0 px-1 text-[10px]">
                        Inactiva
                      </Badge>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Pie de acciones de la zona seleccionada. Aparece por selección, venga del listado o de un click
          en el polígono — las dos rutas terminan en el mismo lugar. */}
      {seleccionada && (
        <div className="shrink-0 space-y-2 border-t border-border bg-muted/30 p-2.5">
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-xs font-semibold">{seleccionada.name}</span>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 shrink-0"
              title="Quitar selección"
              onClick={() => onSeleccionar(null)}
            >
              <X size={12} />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            <Button
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => onEditar(seleccionada.id)}
              disabled={deshabilitado}
            >
              <Pencil size={12} />
              Editar contorno
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => onEncuadrar(seleccionada.id)}
            >
              <Crosshair size={12} />
              Encuadrar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => onAlternarActiva(seleccionada.id)}
              disabled={deshabilitado}
            >
              <Power size={12} />
              {seleccionada.isActive ? 'Desactivar' : 'Activar'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-destructive hover:text-destructive"
              onClick={() => onEliminar(seleccionada)}
              disabled={deshabilitado}
            >
              <Trash2 size={12} />
              Eliminar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
