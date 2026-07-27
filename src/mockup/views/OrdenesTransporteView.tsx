// Listado de ÓRDENES DE TRANSPORTE con UNIFICACIÓN. Es como el último step de Planificaciones, pero
// el objetivo acá es fusionar varias órdenes del MISMO camión en un solo viaje reoptimizado (ver doc
// 11-unificacion-ordenes-transporte.md). Cada orden POSEE paradas reales (subconjunto de PARADAS):
// el conteo y el peso se derivan del dato, y al unificar se le pasan esas mismas paradas al planner
// (via unify-store) → el mockup es consistente punta a punta.
//
// En el diálogo se puede JUGAR con la selección: cada orden se incluye/excluye con un toggle (no se
// borra, se atenúa) para acomodar el peso bajo la capacidad del camión. La barra de capacidad (estilo
// step 1) valida que el peso combinado de las INCLUIDAS no supere el límite del camión.
import { useCallback, useMemo, useState } from 'react'
import { AlertTriangle, Check, CheckCircle2, Combine, MapPin, MoreVertical, SquarePen, Truck, CloudBackup } from 'lucide-react'
import { DataTable, defineColumns, defineFilters, FilterBar } from '@/components/data-table'
import type { BulkAction } from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { openRoute } from '@/core/tabs'
import { OrdenEstadoBadge } from '../estado-badge'
import {
  CAMIONES,
  CHOFERES,
  ORDENES_TRANSPORTE,
  paradasDeOrden,
  pedidosDeOrden,
  pesoDeOrden,
  type EstadoOrden,
  type OrdenTransporte,
} from '../mock-data'
import { useUnifyStore } from '../unify-store'
import { EditarDetalleDialog } from './EditarDetalleDialog'

interface OrdenFilters extends Record<string, unknown> {
  camion?: string
  chofer?: string
  estado?: EstadoOrden
}

const ESTADO_OPCIONES = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'cargando', label: 'Cargando' },
  { value: 'despachada', label: 'Despachada' },
]

// Opciones de camión y chofer derivadas del dataset, así los filtros nunca se desincronizan.
const CAMION_OPCIONES = Array.from(new Set(ORDENES_TRANSPORTE.map((o) => o.camion))).map((c) => ({
  label: c,
  value: c,
}))
const CHOFER_OPCIONES = Array.from(
  new Set(ORDENES_TRANSPORTE.map((o) => o.chofer).filter(Boolean)),
).map((c) => ({ label: c, value: c }))

const filterDefs = defineFilters<OrdenFilters>([
  { type: 'select', id: 'camion', label: 'Camión', options: CAMION_OPCIONES },
  { type: 'select', id: 'chofer', label: 'Chofer', options: CHOFER_OPCIONES },
  { type: 'select', id: 'estado', label: 'Estado', options: ESTADO_OPCIONES },
])

const kg = (n: number) => `${n.toLocaleString('es')} kg`

/** Capacidad del camión (planning_truck → truck.capacity_weight), en kg. */
const capacidadKgDe = (placa: string) => (CAMIONES.find((c) => c.placa === placa)?.capacidadPeso ?? 0) * 1000

/**
 * Barra de capacidad de peso del camión (mismo lenguaje visual que la barra de cobertura del step 1):
 * relleno = seleccionado / capacidad; badge Disponibles/Excede; roja al superar la capacidad.
 */
function CapacidadPesoBar({ capacidadKg, usadoKg }: { capacidadKg: number; usadoKg: number }) {
  const excede = usadoKg > capacidadKg
  const pct = capacidadKg > 0 ? Math.min(100, Math.round((usadoKg / capacidadKg) * 100)) : usadoKg > 0 ? 100 : 0
  const alto = !excede && pct >= 90
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium">Peso</span>
        <Badge
          variant="outline"
          className={cn(
            'gap-1 rounded-full tabular-nums',
            excede
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : 'border-primary/30 bg-primary/10 text-primary',
          )}
        >
          {excede ? <AlertTriangle size={11} /> : <CheckCircle2 size={11} />}
          {excede ? `Excede ${kg(usadoKg - capacidadKg)}` : `Disponibles ${kg(capacidadKg - usadoKg)}`}
        </Badge>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            excede ? 'bg-destructive' : alto ? 'bg-amber-500' : 'bg-primary',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-baseline justify-between gap-2 text-[11px] tabular-nums text-muted-foreground">
        <span>
          Capacidad de Camión: <span className="font-medium text-foreground">{kg(capacidadKg)}</span>
        </span>
        <span>
          Seleccionado <span className="font-medium text-foreground">{kg(usadoKg)}</span>
        </span>
      </div>
    </div>
  )
}

/** Fila de una orden en el diálogo: toggle de incluir/excluir (no se borra, se atenúa). */
function OrdenRow({
  orden,
  incluida,
  onToggle,
}: {
  orden: OrdenTransporte
  incluida: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={incluida}
      title={incluida ? 'Quitar de la unificación' : 'Volver a incluir'}
      className={cn(
        'flex w-full items-center gap-3 rounded-md border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50',
        !incluida && 'opacity-45',
      )}
    >
      {/* Check estilo casilla: incluida = tildada; excluida = vacía + fila atenuada. */}
      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
          incluida ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background',
        )}
      >
        {incluida && <Check size={11} strokeWidth={3} />}
      </span>
      <span className={cn('font-mono text-xs font-medium', !incluida && 'line-through')}>{orden.codigo}</span>
      <OrdenEstadoBadge estado={orden.estado} />
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <MapPin className="size-3.5" /> {orden.paradaIds.length}
      </span>
      <span className="ml-auto tabular-nums text-muted-foreground">{kg(pesoDeOrden(orden))}</span>
    </button>
  )
}

export function OrdenesTransporteView() {
  const [ordenes, setOrdenes] = useState<OrdenTransporte[]>(ORDENES_TRANSPORTE)
  const [procesando, setProcesando] = useState<boolean>(false)
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())

  const [filters, setFilters] = useState<Partial<OrdenFilters>>({})
  // Conjunto de trabajo de la unificación (todas las órdenes elegidas). null = diálogo cerrado.
  const [unificar, setUnificar] = useState<OrdenTransporte[] | null>(null)
  // Ids EXCLUIDOS del conjunto (siguen visibles, atenuados, fuera de la suma de peso).
  const [excluidas, setExcluidas] = useState<Set<string>>(new Set())
  const setUnifyCtx = useUnifyStore((s) => s.set)
  // Orden cuyo detalle ("Editar detalles") está abierto (null = diálogo cerrado).
  const [ordenDetalle, setOrdenDetalle] = useState<OrdenTransporte | null>(null)
  // Chofer asignado por orden (override local del mockup).
  const [choferPorOrden, setChoferPorOrden] = useState<Record<string, string>>({})
  const choferDe = (o: OrdenTransporte) => choferPorOrden[o.id] || o.chofer
  const asignarChofer = (id: string, chofer: string) =>
    setChoferPorOrden((prev) => ({ ...prev, [id]: chofer }))
  // Camión reasignado por orden (mismo patrón que el chofer: override local, el dataset no se muta).
  const [camionPorOrden, setCamionPorOrden] = useState<Record<string, string>>({})
  const camionDe = (o: OrdenTransporte) => camionPorOrden[o.id] || o.camion
  const reasignarCamion = (id: string, placa: string) =>
    setCamionPorOrden((prev) => ({ ...prev, [id]: placa }))

  /**
   * Camiones que se le pueden asignar a la orden abierta: capacidad >= peso de la orden. El camión
   * ACTUAL se incluye siempre, incluso si no alcanza (una orden puede exceder su propio camión) —
   * si no, el Combobox tendría un `value` que no está en `items` y quedaría inconsistente.
   * Orden: capacidad ascendente, así el primero es el que "justo alcanza".
   */
  const camionesElegibles = useMemo(() => {
    if (!ordenDetalle) return []
    const pesoKg = pesoDeOrden(ordenDetalle)
    const actual = camionDe(ordenDetalle)
    const placas = CAMIONES.filter((c) => capacidadKgDe(c.placa) >= pesoKg).map((c) => c.placa)
    if (!placas.includes(actual)) placas.push(actual)
    return placas.sort((a, b) => capacidadKgDe(a) - capacidadKgDe(b))
  }, [ordenDetalle, camionPorOrden])

  const data = useMemo(
    () =>
      ordenes.filter(
        (o) =>
          (!filters.camion || o.camion === filters.camion) &&
          (!filters.chofer || o.chofer === filters.chofer) &&
          (!filters.estado || o.estado === filters.estado),
      ),
    [filters, ordenes],
  )

  const processTransportOrder = async (transportOrder: OrdenTransporte) => {
    setProcessingIds((prev) => new Set(prev).add(transportOrder.id))
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      setOrdenes((prevOrdenes) =>
        prevOrdenes.map((orden) =>
          orden.id === transportOrder.id
            ? { ...orden, estado: 'procesado' }
            : orden,
        ),
      )
    } finally { 
      setProcessingIds((prev) => {
        const next = new Set(prev)
        next.delete(transportOrder.id)
        return next
      })
    }
  }

  const columns = useMemo(() => defineColumns<OrdenTransporte>([
    { id: 'codigo', header: 'Orden', accessorKey: 'codigo', size: 110, pin: 'left' },
    {
      id: 'camion',
      header: 'Camión',
      accessorKey: 'camion',
      size: 140,
      cell: (row) => (
        <span className="flex items-center gap-2">
          <Truck className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{camionDe(row)}</span>
        </span>
      ),
    },
    {
      id: 'chofer',
      header: 'Chofer',
      accessorKey: 'chofer',
      size: 190,
      cell: (row) => {
        const chofer = choferDe(row)
        return chofer ? (
          <span className="truncate">{chofer}</span>
        ) : (
          <span className="text-xs text-muted-foreground">Sin asignar</span>
        )
      },
    },
    {
      id: 'paradas',
      header: 'Paradas',
      size: 100,
      meta: { align: 'right' },
      cell: (row) => <span className="tabular-nums">{row.paradaIds.length}</span>,
    },
    {
      id: 'carga',
      header: 'Carga',
      size: 120,
      meta: { align: 'right' },
      cell: (row) => <span className="tabular-nums text-muted-foreground">{kg(pesoDeOrden(row))}</span>,
    },
    {
      id: 'estado',
      header: 'Estado',
      accessorKey: 'estado',
      size: 130,
      cell: (row) => <OrdenEstadoBadge estado={row.estado} />,
    },
    {
      id: 'acciones',
      header: 'Acciones',
      size: 90,
      cell: (row) => (
        <div className="flex justify-center">
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-8 w-8 p-0 mx-auto flex hover:bg-muted focus-visible:ring-1"
              >
                <MoreVertical className="h-4 w-4 text-muted-foreground" />
                <span className="sr-only">Abrir menú de acciones</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 shadow-md">
              <DropdownMenuItem
                onClick={() => setOrdenDetalle(row)}
                className="cursor-pointer flex items-center gap-2"
              >
                <SquarePen />
                <span>Editar detalles</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => processTransportOrder(row)}
                className="cursor-pointer flex items-center gap-2"
              >
                <CloudBackup />
                <span>Procesar Orden</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ]), [choferPorOrden, camionPorOrden])

  const bulkActions: BulkAction<OrdenTransporte>[] = [
    {
      label: 'Unificar',
      icon: Combine,
      onClick: (rows) => {
        setUnificar(rows)
        setExcluidas(new Set())
      },
    },
  ]

  const toggle = (id: string) =>
    setExcluidas((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  // Solo las INCLUIDAS cuentan para la validación y la unificación.
  const incluidas = unificar?.filter((o) => !excluidas.has(o.id)) ?? []
  // La unificación mira el camión REASIGNADO (camionDe), no el del dataset: mismo criterio que ya se
  // usaba con el chofer (choferDe) al armar el contexto. Si no, se validaría la capacidad de un camión
  // que la orden ya no tiene y se mandaría al optimizador una placa vieja.
  const camiones = Array.from(new Set(incluidas.map((o) => camionDe(o))))
  const mismoCamion = camiones.length === 1
  const suficientes = incluidas.length >= 2
  const capacidadKg = mismoCamion ? capacidadKgDe(camiones[0]) : 0
  const usadoKg = incluidas.reduce((acc, o) => acc + pesoDeOrden(o), 0)
  const excede = mismoCamion && usadoKg > capacidadKg
  const totalParadas = incluidas.reduce((acc, o) => acc + o.paradaIds.length, 0)
  const puedeContinuar = mismoCamion && suficientes && !excede

  const continuar = () => {
    if (!puedeContinuar) return
    // Unión real de paradas de las INCLUIDAS → lo que recibe el optimizador.
    const paradaIds = Array.from(new Set(incluidas.flatMap((o) => o.paradaIds)))
    // La tripulación sale de la primera orden incluida: acá ya se validó mismoCamion, y chofer/auxiliar
    // son consistentes por camión. El chofer respeta la asignación local del mockup (choferDe).
    const primera = incluidas[0]
    setUnifyCtx({
      camion: camiones[0],
      paradaIds,
      ordenes: incluidas.map((o) => o.codigo),
      chofer: choferDe(primera),
      auxiliar: primera.auxiliar,
      pedidos: incluidas.reduce((acc, o) => acc + pedidosDeOrden(o), 0),
      cargaKg: usadoKg,
      capacidadKg,
    })
    openRoute('reoptimizar-plan')
    setUnificar(null)
  }

  const Skeleton = ({ className }: { className?: string }) => (
    <div className={cn("animate-pulse rounded-md bg-muted", className)} />
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-foreground">Órdenes de transporte</h2>
        <p className="text-sm text-muted-foreground">
          Filtrá por camión o chofer, seleccioná 2 o más órdenes del mismo camión y unificalas: se
          juntan todos sus puntos de entrega y se reoptimiza una sola ruta para ese camión.
        </p>
      </div>

      <DataTable
        tableId="mockup-ordenes-transporte-unif"
        columns={columns}
        data={data}
        getRowId={(row) => row.id}
        isCellLoading={(orden) => processingIds.has(orden.id)}
        emptyTitle="Sin órdenes"
        emptyMessage="Ninguna orden de transporte coincide con los filtros."
        fillHeight
        searchable
        searchPlaceholder="Buscar por orden, camión o chofer…"
        clientPagination
        defaultPageSize={12}
        // selectable
        bulkActions={bulkActions}
        exportable
        exportFilename="ordenes-transporte"
        filterBar={
          <FilterBar
            defs={filterDefs}
            values={filters}
            onChange={(u) => setFilters((prev) => ({ ...prev, ...u }))}
          />
        }
      />

      <Dialog open={!!unificar} onOpenChange={(open) => !open && setUnificar(null)}>
        {/* Altura acotada: header + capacidad + footer FIJOS; solo la lista de órdenes scrollea, así
            aguanta muchas órdenes sin romper el diálogo. */}
        <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
            <DialogTitle className="flex items-center gap-2">
              <Combine className="size-4" />
              Unificar órdenes de transporte
            </DialogTitle>
            <DialogDescription>
              {mismoCamion
                ? 'Se fusionan en un solo viaje y se reoptimiza la ruta del camión.'
                : 'Dejá incluidas solo las órdenes de un mismo camión.'}
            </DialogDescription>
          </DialogHeader>

          {/* Bloque fijo: camión, capacidad (barra estilo step 1) y avisos. */}
          <div className="flex shrink-0 flex-col gap-3 border-b border-border px-5 py-3">
            {mismoCamion ? (
              <>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="flex items-center gap-2">
                    <Truck className="size-4 text-muted-foreground" />
                    <span className="font-medium">{camiones[0]}</span>
                  </span>
                  <span className="text-muted-foreground">
                    · {incluidas.length} {incluidas.length === 1 ? 'orden' : 'órdenes'} de transporte
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <MapPin className="size-3.5" /> {totalParadas} paradas
                  </span>
                </div>
                <CapacidadPesoBar capacidadKg={capacidadKg} usadoKg={usadoKg} />
                {excede && (
                  <p className="text-xs text-destructive">
                    La carga supera la capacidad del camión. Quitá alguna orden de la lista para poder
                    continuar.
                  </p>
                )}
                {!suficientes && (
                  <p className="text-xs text-muted-foreground">
                    Necesitás al menos 2 órdenes incluidas para unificar.
                  </p>
                )}
              </>
            ) : (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
                Hay órdenes de {camiones.length || 0} camiones ({camiones.join(', ') || '—'}). Dejá
                incluidas solo las de un mismo camión para unificar.
              </p>
            )}
          </div>

          {/* Lista scrolleable de órdenes (toggle incluir/excluir). Encabezado con el conteo. */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between px-5 pb-1 pt-3 text-xs text-muted-foreground">
              <span>Órdenes seleccionadas</span>
              <span className="tabular-nums">
                {incluidas.length} incluidas de {unificar?.length ?? 0}
              </span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-5 pb-4 pt-1">
              {unificar?.map((o) => (
                <OrdenRow
                  key={o.id}
                  orden={o}
                  incluida={!excluidas.has(o.id)}
                  onToggle={() => toggle(o.id)}
                />
              ))}
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-border px-5 py-4">
            <DialogClose render={<Button variant="outline">Cancelar</Button>} />
            <Button onClick={continuar} disabled={!puedeContinuar}>
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditarDetalleDialog
        open={!!ordenDetalle}
        onOpenChange={(o) => { if (!o) setOrdenDetalle(null) }}
        codigo={ordenDetalle?.codigo}
        estado={ordenDetalle?.estado}
        paradas={ordenDetalle ? paradasDeOrden(ordenDetalle).map((p, i) => ({ id: p.id, secuencia: p.secuencia ?? i + 1, cliente: p.cliente, direccion: p.puntoEntrega, ventana: p.ventana })) : []}
        choferes={CHOFERES}
        choferValue={ordenDetalle ? choferDe(ordenDetalle) || null : null}
        onChoferChange={(v) => ordenDetalle && asignarChofer(ordenDetalle.id, v)}
        camiones={camionesElegibles}
        camionValue={ordenDetalle ? camionDe(ordenDetalle) || null : null}
        // Igual que el chofer: limpiar el campo guarda '' y camionDe vuelve al camión del dataset.
        onCamionChange={(v) => ordenDetalle && reasignarCamion(ordenDetalle.id, v)}
        capacidadPorCamion={capacidadKgDe}
        pesoOrdenKg={ordenDetalle ? pesoDeOrden(ordenDetalle) : undefined}
        onGuardar={() => setOrdenDetalle(null)}
      />
    </div>
  )
}
