// Listado de CAMIONES (reemplaza al listado de órdenes de transporte). Entra por una ruta propia del
// sidebar, SIN dispatchPlanId: el scope real es la distribuidora del planificador (ver doc
// 12-obtener-camiones.md). Cada fila es un camión que TIENE órdenes de transporte; su carga y su
// conteo se DERIVAN de esas órdenes (Σ del peso de sus paradas), así el mockup cuadra punta a punta.
//
// El vínculo camión→orden es indirecto (transport_orders.route_id → routes.planning_truck_id →
// planning_truck.truck_id → trucks). Acá se simula agrupando ORDENES_TRANSPORTE por su placa.
//
// La acción deja de ser "unificar" (bulk, 2+ órdenes): ahora es POR CAMIÓN. "Finalizar" toma TODAS
// las órdenes del camión, junta sus paradas y va al mapa (mismo destino que disparaba "unificar").
// "Ver detalle" abre el detalle de las órdenes de ese camión (el flujo actual, filtrado por camión).
import { useMemo, useState } from 'react'
import { AlertTriangle, Check, CheckCircle2, Flag, MapPin, Truck } from 'lucide-react'
import { DataTable, defineColumns, defineFilters, FilterBar } from '@/components/data-table'
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
import { cn } from '@/lib/utils'
import { openRoute } from '@/core/tabs'
import { OrdenEstadoBadge } from '../estado-badge'
import {
  CAMIONES,
  ORDENES_TRANSPORTE,
  paradasDeOrden,
  pesoDeOrden,
  type Camion,
  type OrdenTransporte,
} from '../mock-data'
import { useUnifyStore } from '../unify-store'

const kg = (n: number) => `${n.toLocaleString('es')} kg`
const m3 = (n: number) => `${n.toLocaleString('es', { maximumFractionDigits: 1 })} m³`

/** Volumen (m³) de una orden = suma del volumen de sus paradas (assigned_volume_m3 agregado). */
const volumenDeOrden = (o: OrdenTransporte): number =>
  paradasDeOrden(o).reduce((acc, p) => acc + p.volumenTotal, 0)

/**
 * Fila del listado: un camión con el agregado de SUS órdenes de transporte.
 * capacidadKg = trucks.capacity_weight (en el mock, capacidadPeso en toneladas → *1000).
 * cargaKg     = Σ del peso de las paradas de todas sus órdenes (assigned_weight_kg agregado).
 */
interface CamionResumen {
  id: string
  placa: string
  tipo: Camion['tipo']
  clase: Camion['clase']
  capacidadKg: number
  capacidadVolM3: number
  ordenes: OrdenTransporte[]
  orderCount: number
  cargaKg: number
  cargaVolM3: number
  ocupacionPct: number
}

// Se arma UNA sola vez desde el dataset: solo camiones que tienen órdenes de transporte. El resto de
// la flota (sin órdenes) no aparece en este listado —es una vista de despacho, no el maestro.
const CAMIONES_RESUMEN: CamionResumen[] = Array.from(
  new Set(ORDENES_TRANSPORTE.map((o) => o.camion)),
).map((placa) => {
  const ordenes = ORDENES_TRANSPORTE.filter((o) => o.camion === placa)
  const camion = CAMIONES.find((c) => c.placa === placa)
  const capacidadKg = (camion?.capacidadPeso ?? 0) * 1000
  const capacidadVolM3 = camion?.capacidadVolumen ?? 0
  const cargaKg = ordenes.reduce((acc, o) => acc + pesoDeOrden(o), 0)
  const cargaVolM3 = ordenes.reduce((acc, o) => acc + volumenDeOrden(o), 0)
  return {
    id: placa,
    placa,
    tipo: camion?.tipo ?? 'Seco',
    clase: camion?.clase ?? 'Camión',
    capacidadKg,
    capacidadVolM3,
    ordenes,
    orderCount: ordenes.length,
    cargaKg,
    cargaVolM3,
    ocupacionPct: capacidadKg > 0 ? Math.round((cargaKg / capacidadKg) * 100) : 0,
  }
})

const TIPO_OPCIONES = Array.from(new Set(CAMIONES_RESUMEN.map((c) => c.tipo))).map((t) => ({
  label: t,
  value: t,
}))
const CLASE_OPCIONES = Array.from(new Set(CAMIONES_RESUMEN.map((c) => c.clase))).map((c) => ({
  label: c,
  value: c,
}))

interface CamionFilters extends Record<string, unknown> {
  tipo?: Camion['tipo']
  clase?: Camion['clase']
}

const filterDefs = defineFilters<CamionFilters>([
  { type: 'select', id: 'tipo', label: 'Tipo', options: TIPO_OPCIONES },
  { type: 'select', id: 'clase', label: 'Clase', options: CLASE_OPCIONES },
])

/**
 * Indicador de ocupación (mismo lenguaje visual que la barra de capacidad del flujo de unificación):
 * relleno = carga / capacidad; rojo al exceder, ámbar al acercarse (≥90%).
 */
function OcupacionBar({ capacidadKg, cargaKg }: { capacidadKg: number; cargaKg: number }) {
  const excede = cargaKg > capacidadKg
  const pct = capacidadKg > 0 ? Math.min(100, Math.round((cargaKg / capacidadKg) * 100)) : cargaKg > 0 ? 100 : 0
  const alto = !excede && pct >= 90
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-full min-w-16 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            excede ? 'bg-destructive' : alto ? 'bg-amber-500' : 'bg-primary',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={cn(
          'w-11 shrink-0 text-right text-xs tabular-nums',
          excede ? 'font-medium text-destructive' : 'text-muted-foreground',
        )}
      >
        {Math.round((cargaKg / (capacidadKg || 1)) * 100)}%
      </span>
    </div>
  )
}

/**
 * Barra de capacidad genérica (peso o volumen) para el paso de selección. Muestra disponible/excede
 * como ALERTA — nunca bloquea: exceder es solo un aviso para que el planificador lo observe y decida.
 */
function CargaBar({
  label,
  capacidad,
  usado,
  fmt,
}: {
  label: string
  capacidad: number
  usado: number
  fmt: (n: number) => string
}) {
  const excede = usado > capacidad
  const pct = capacidad > 0 ? Math.min(100, Math.round((usado / capacidad) * 100)) : usado > 0 ? 100 : 0
  const alto = !excede && pct >= 90
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium">{label}</span>
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
          {excede ? `Excede ${fmt(usado - capacidad)}` : `Disponible ${fmt(capacidad - usado)}`}
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
          Capacidad: <span className="font-medium text-foreground">{fmt(capacidad)}</span>
        </span>
        <span>
          Carga <span className="font-medium text-foreground">{fmt(usado)}</span>
        </span>
      </div>
    </div>
  )
}

/**
 * Fila de una orden en el paso de selección: toggle de incluir/excluir (no se borra, se atenúa).
 * Es exactamente el mecanismo de selección que vivía en el diálogo de unificación del listado de
 * órdenes: acá se reubica como PASO PREVIO al mapa, disparado por "Finalizar".
 */
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

export function CamionesView() {
  const [filters, setFilters] = useState<Partial<CamionFilters>>({})
  // Camión en proceso de finalización (paso de selección de órdenes). null = diálogo cerrado.
  const [seleccion, setSeleccion] = useState<CamionResumen | null>(null)
  // Órdenes EXCLUIDAS de la finalización (siguen visibles, atenuadas, fuera de la suma de peso).
  const [excluidas, setExcluidas] = useState<Set<string>>(new Set())
  const setUnifyCtx = useUnifyStore((s) => s.set)

  const data = useMemo(
    () =>
      CAMIONES_RESUMEN.filter(
        (c) =>
          (!filters.tipo || c.tipo === filters.tipo) && (!filters.clase || c.clase === filters.clase),
      ),
    [filters],
  )

  // "Finalizar" ya NO va directo al mapa: abre el paso de selección para elegir qué órdenes del
  // camión entran en el viaje final. Arranca con todas incluidas.
  const abrirSeleccion = (c: CamionResumen) => {
    setSeleccion(c)
    setExcluidas(new Set())
  }

  const toggle = (id: string) =>
    setExcluidas((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  // Solo las órdenes INCLUIDAS cuentan para la carga y para lo que recibe el mapa.
  const incluidas = seleccion?.ordenes.filter((o) => !excluidas.has(o.id)) ?? []
  const usadoKg = incluidas.reduce((acc, o) => acc + pesoDeOrden(o), 0)
  const usadoVolM3 = incluidas.reduce((acc, o) => acc + volumenDeOrden(o), 0)
  const capacidadKg = seleccion?.capacidadKg ?? 0
  const capacidadVolM3 = seleccion?.capacidadVolM3 ?? 0
  // Exceder capacidad (peso o volumen) es una ALERTA, no un bloqueo: el planificador la observa y
  // decide igual. Lo único que impide finalizar es no tener ninguna orden incluida.
  const excedePeso = usadoKg > capacidadKg
  const excedeVol = usadoVolM3 > capacidadVolM3
  const totalParadas = Array.from(new Set(incluidas.flatMap((o) => o.paradaIds))).length
  const puedeFinalizar = incluidas.length >= 1

  // Confirma la finalización: junta las paradas de las órdenes INCLUIDAS y va al mapa (mismo destino
  // que disparaba "unificar"). El planner scopea el mapa a esas paradas y dibuja UNA sola ruta.
  const confirmar = () => {
    if (!seleccion || !puedeFinalizar) return
    const paradaIds = Array.from(new Set(incluidas.flatMap((o) => o.paradaIds)))
    setUnifyCtx({ camion: seleccion.placa, paradaIds, ordenes: incluidas.map((o) => o.codigo) })
    openRoute('reoptimizar-plan')
    setSeleccion(null)
  }

  const columns = useMemo(
    () =>
      defineColumns<CamionResumen>([
        {
          id: 'placa',
          header: 'Camión',
          accessorKey: 'placa',
          size: 190,
          pin: 'left',
          cell: (row) => (
            <span className="flex items-center gap-2">
              <Truck className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">{row.placa}</span>
            </span>
          ),
        },
        {
          id: 'tipo',
          header: 'Tipo',
          accessorKey: 'tipo',
          size: 50,
          pin: 'left',
          cell: (row) => (
            <span className="flex items-center gap-2">
              <Badge variant="outline" className="rounded-full text-[10px]">
                {row.tipo}
              </Badge>
            </span>
          ),
        },
        {
          id: 'ordenes',
          header: 'Órdenes',
          size: 100,
          meta: { align: 'right' },
          cell: (row) => (
            <span className="tabular-nums">
              {row.orderCount}
              <span className="ml-1 text-xs text-muted-foreground">
                {/* {row.orderCount === 1 ? 'orden' : 'órdenes'} */}
              </span>
            </span>
          ),
        },
        {
          id: 'capacidad',
          header: 'Capacidad',
          size: 120,
          meta: { align: 'right' },
          cell: (row) => <span className="tabular-nums text-muted-foreground">{kg(row.capacidadKg)}</span>,
        },
        {
          id: 'carga',
          header: 'Carga',
          size: 120,
          meta: { align: 'right' },
          cell: (row) => (
            <span
              className={cn(
                'tabular-nums',
                row.cargaKg > row.capacidadKg ? 'font-medium text-destructive' : 'text-muted-foreground',
              )}
            >
              {kg(row.cargaKg)}
            </span>
          ),
        },
        {
          id: 'ocupacion',
          header: 'Ocupación',
          size: 170,
          cell: (row) => <OcupacionBar capacidadKg={row.capacidadKg} cargaKg={row.cargaKg} />,
        },
        {
          id: 'acciones',
          header: '',
          size: 140,
          enableSorting: false,
          cell: (row) => (
            <div className="flex items-center justify-end">
              <Button size="sm" onClick={() => abrirSeleccion(row)}>
                <Flag className="size-3.5" />
                Finalizar
              </Button>
            </div>
          ),
        },
      ]),
    // finalizar es estable (usa setters de store/tab); no depende del render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-foreground">Camiones</h2>
        {/* <p className="text-sm text-muted-foreground">
          Camiones con órdenes de transporte de la distribuidora. Cada fila muestra su capacidad y la
          carga acumulada de todas sus órdenes. Finalizá un camión para reoptimizar su ruta en el mapa.
        </p> */}
      </div>

      <DataTable
        tableId="mockup-camiones"
        columns={columns}
        data={data}
        getRowId={(row) => row.id}
        emptyTitle="Sin camiones"
        emptyMessage="Ningún camión con órdenes coincide con los filtros."
        fillHeight
        searchable
        searchPlaceholder="Buscar por placa…"
        clientPagination
        defaultPageSize={12}
        exportable
        exportFilename="camiones"
        onRowDoubleClick={(row) => abrirSeleccion(row)}
        filterBar={
          <FilterBar
            defs={filterDefs}
            values={filters}
            onChange={(u) => setFilters((prev) => ({ ...prev, ...u }))}
          />
        }
      />

      {/* Paso de selección (previo al mapa): se elige qué órdenes del camión entran en el viaje final.
          Es la selección que vivía en el diálogo de unificación del listado de órdenes, reubicada acá
          y disparada por "Finalizar". Al confirmar se va al mapa con las órdenes incluidas. */}
      <Dialog open={!!seleccion} onOpenChange={(open) => !open && setSeleccion(null)}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg pb-1">
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
            <DialogTitle className="flex items-center gap-2">
              <Truck className="size-4" />
              Finalizar {seleccion?.placa}
            </DialogTitle>
            <DialogDescription>
              Seleccionar si desea unificar.
            </DialogDescription>
          </DialogHeader>

          {seleccion && (
            <>
              <div className="flex shrink-0 flex-col gap-3 border-b border-border px-5 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="text-muted-foreground">
                    {incluidas.length} {incluidas.length === 1 ? 'orden' : 'órdenes'} incluidas
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <MapPin className="size-3.5" /> {totalParadas} paradas
                  </span>
                </div>
                <CargaBar label="Peso" capacidad={capacidadKg} usado={usadoKg} fmt={kg} />
                {/* <CargaBar label="Volumen" capacidad={capacidadVolM3} usado={usadoVolM3} fmt={m3} />
                {(excedePeso || excedeVol) && (
                  <p className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      La carga supera la capacidad del camión
                      {excedePeso && excedeVol ? ' (peso y volumen)' : excedePeso ? ' (peso)' : ' (volumen)'}.
                      Podés finalizar igual; revisalo antes de continuar.
                    </span>
                  </p>
                )} */}
                {incluidas.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Incluí al menos una orden para finalizar.
                  </p>
                )}
              </div>

              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex shrink-0 items-center justify-between px-5 pb-1 pt-3 text-xs text-muted-foreground">
                  <span>Órdenes del camión</span>
                  <span className="tabular-nums">
                    {incluidas.length} incluidas de {seleccion.ordenes.length}
                  </span>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-5 pb-4 pt-1">
                  {seleccion.ordenes.map((o) => (
                    <OrdenRow
                      key={o.id}
                      orden={o}
                      incluida={!excluidas.has(o.id)}
                      onToggle={() => toggle(o.id)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          <DialogFooter className="shrink-0 border-t border-border px-5 py-4">
            <DialogClose render={<Button variant="outline">Cancelar</Button>} />
            <Button onClick={confirmar} disabled={!puedeFinalizar}>
              <Flag className="size-3.5" />
              Finalizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
