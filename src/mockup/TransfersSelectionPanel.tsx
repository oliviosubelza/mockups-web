// Panel derecho del paso combinado (fase 0), sub-paso "Traslados". Reutiliza las columnas y filtros
// de TransfersView para que ambas pantallas no diverjan. El CTA de "Continuar" vive en la
// CoverageSummaryBar del paso, arriba del split.
//
// Clasificación por MOVIMIENTO (reemplaza los Tabs, que eran más altos y desalineaban la tabla
// respecto al panel de camiones): se elige con un select-search agrupado — mismo componente visual
// que los filtros de Pedidos (Popover + Command), altura h-7 → la tabla queda al mismo nivel.
//   Entregas → Traslados (transferencias entre sucursales) · Devoluciones (sin camión asignado)
//   Recojos  → Devoluciones (ya asignadas a un camión: recogida en el regreso)
import { useState } from 'react'
import { ChevronsUpDown } from 'lucide-react'
import { DataTable, FilterBar } from '@/components/data-table'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { buttonVariants } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { DEVOLUCIONES, TRANSFERENCIAS } from './mock-data'
import {
  devolucionColumns,
  devolucionFilterDefs,
  enRango,
  transferColumns,
  transferFilterDefs,
} from './views/TransfersView'
import type { BoardState } from './types'

interface TransferFilters {
  sucursalOrigen?: string
  sucursalDestino?: string
  fechaDesde?: string
  fechaHasta?: string
}

interface DevolucionFilters {
  sucursal?: string
  motivo?: string
  fechaDesde?: string
  fechaHasta?: string
}

// Split de devoluciones: con camión asignado = Recojo (recogida en el regreso); sin asignar =
// Devolución de entrega (pendiente de gestionar en la salida). Constantes: DEVOLUCIONES es estático.
const DEVOLUCIONES_ENTREGA = DEVOLUCIONES.filter((d) => d.camionId == null)
const DEVOLUCIONES_RECOJO = DEVOLUCIONES.filter((d) => d.camionId != null)

type MovKey = 'entrega-traslado' | 'entrega-devolucion' | 'recojo-devolucion'

const MOVIMIENTOS: {
  key: MovKey
  grupo: 'Entregas' | 'Recojos'
  label: string
  base: number
}[] = [
  { key: 'entrega-traslado', grupo: 'Entregas', label: 'Traslados', base: TRANSFERENCIAS.length },
  { key: 'entrega-devolucion', grupo: 'Entregas', label: 'Devoluciones', base: DEVOLUCIONES_ENTREGA.length },
  { key: 'recojo-devolucion', grupo: 'Recojos', label: 'Devoluciones', base: DEVOLUCIONES_RECOJO.length },
]

export function TransfersSelectionPanel({ state }: { state: BoardState }) {
  const [mov, setMov] = useState<MovKey>('entrega-traslado')
  const [movOpen, setMovOpen] = useState(false)
  const [transferFilters, setTransferFilters] = useState<Partial<TransferFilters>>({})
  const [devolucionFilters, setDevolucionFilters] = useState<Partial<DevolucionFilters>>({})

  const sinDatos = state === 'empty' || state === 'error'
  const actual = MOVIMIENTOS.find((m) => m.key === mov)!

  const transferencias = sinDatos
    ? []
    : TRANSFERENCIAS.filter(
        (t) =>
          (!transferFilters.sucursalOrigen || t.sucursalOrigen === transferFilters.sucursalOrigen) &&
          (!transferFilters.sucursalDestino ||
            t.sucursalDestino === transferFilters.sucursalDestino) &&
          enRango(t.fecha, transferFilters.fechaDesde, transferFilters.fechaHasta)
      )

  const filtraDevolucion = (d: (typeof DEVOLUCIONES)[number]) =>
    (!devolucionFilters.sucursal || d.sucursal === devolucionFilters.sucursal) &&
    (!devolucionFilters.motivo || d.motivo === devolucionFilters.motivo) &&
    enRango(d.fecha, devolucionFilters.fechaDesde, devolucionFilters.fechaHasta)

  const devolucionesBase =
    mov === 'recojo-devolucion' ? DEVOLUCIONES_RECOJO : DEVOLUCIONES_ENTREGA
  const devoluciones = sinDatos ? [] : devolucionesBase.filter(filtraDevolucion)

  const conteoActivo = mov === 'entrega-traslado' ? transferencias.length : devoluciones.length

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3">
      {/* Select-search de movimiento (mismo estilo que los filtros de Pedidos, altura h-7). Las
          opciones van agrupadas por Entregas / Recojos, que es la jerarquía del negocio. */}
      <div className="flex items-center gap-1.5">
        <Popover open={movOpen} onOpenChange={setMovOpen}>
          <PopoverTrigger
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }),
              'h-7 shrink-0 gap-1.5'
            )}
          >
            <span className="text-muted-foreground">{actual.grupo}</span>
            <span className="opacity-50">·</span>
            {actual.label}
            <span className="flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums">
              {conteoActivo}
            </span>
            <ChevronsUpDown size={13} className="opacity-50" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-0">
            <Command>
              <CommandInput placeholder="Buscar movimiento…" className="h-8 text-xs" />
              <CommandList>
                <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                  Sin resultados
                </CommandEmpty>
                {(['Entregas', 'Recojos'] as const).map((grupo) => (
                  <CommandGroup key={grupo} heading={grupo}>
                    {MOVIMIENTOS.filter((m) => m.grupo === grupo).map((m) => (
                      <CommandItem
                        key={m.key}
                        value={`${m.grupo} ${m.label}`}
                        data-checked={mov === m.key}
                        onSelect={() => {
                          setMov(m.key)
                          setMovOpen(false)
                        }}
                        className="gap-2 text-xs"
                      >
                        <span className="min-w-0 flex-1 truncate">{m.label}</span>
                        <span className="text-muted-foreground tabular-nums">{m.base}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {mov === 'entrega-traslado' ? (
        <DataTable
          tableId={`mockup-step1-transferencias-${state}`}
          columns={transferColumns}
          data={transferencias}
          getRowId={(row) => row.id}
          isLoading={state === 'loading'}
          isError={state === 'error'}
          errorMessage="No pudimos traer las órdenes de transferencia."
          onRetry={() => {}}
          emptyTitle="Sin transferencias"
          emptyMessage="No hay órdenes de transferencia entre sucursales para este plan."
          fillHeight
          selectable
          searchable
          searchPlaceholder="Buscar por código…"
          clientPagination
          defaultPageSize={8}
          filterBar={
            <FilterBar
              defs={transferFilterDefs}
              values={transferFilters}
              onChange={(u) => setTransferFilters((prev) => ({ ...prev, ...u }))}
            />
          }
        />
      ) : (
        <DataTable
          tableId={`mockup-step1-${mov}-${state}`}
          columns={devolucionColumns}
          data={devoluciones}
          getRowId={(row) => row.id}
          isLoading={state === 'loading'}
          isError={state === 'error'}
          errorMessage="No pudimos traer las órdenes de devolución."
          onRetry={() => {}}
          emptyTitle="Sin devoluciones"
          emptyMessage={
            mov === 'recojo-devolucion'
              ? 'No hay devoluciones asignadas para recojo en este plan.'
              : 'No hay devoluciones pendientes de entrega en este plan.'
          }
          fillHeight
          selectable
          searchable
          searchPlaceholder="Buscar por código o cliente…"
          clientPagination
          defaultPageSize={8}
          filterBar={
            <FilterBar
              defs={devolucionFilterDefs}
              values={devolucionFilters}
              onChange={(u) => setDevolucionFilters((prev) => ({ ...prev, ...u }))}
            />
          }
        />
      )}
    </div>
  )
}
