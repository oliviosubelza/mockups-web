// Fase 3 — Transferencias entre sucursales + Devoluciones (logística inversa). Las órdenes se crean
// en OTRO sistema; acá se LISTAN a nivel orden (no ítem), se filtran, se seleccionan y se suman a la
// planificación. La acción sobre la selección aparece arriba de la tabla (bulkActions del DataTable).
import { useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  CAMIONES,
  camionPorId,
  DEVOLUCIONES,
  MOTIVOS_DEVOLUCION,
  SUCURSALES,
  TRANSFERENCIAS,
  type Devolucion,
  type Transferencia,
} from '../mock-data'
import type { BoardState, TransferTab } from '../types'

const fmtPeso = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 })
const fmtVol = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 2 })
const sucursalOptions = SUCURSALES.map((s) => ({ label: s, value: s }))

/** "2026-07-13" → "13/07". */
const fmtFecha = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

// ── Transferencias (orden entre sucursales) ────────────────────────────────────────────────────

interface TransferFilters extends Record<string, unknown> {
  sucursalOrigen?: string
  sucursalDestino?: string
  fechaDesde?: string
  fechaHasta?: string
}

export const transferFilterDefs = defineFilters<TransferFilters>([
  { type: 'daterange', id: 'fecha', label: 'Fecha', fromKey: 'fechaDesde', toKey: 'fechaHasta' },
  { type: 'select', id: 'sucursalDestino', label: 'Destino', options: sucursalOptions },
])

export const transferColumns = defineColumns<Transferencia>([
  { id: 'codigo', header: 'Código', accessorKey: 'codigo', size: 120, pin: 'left' },
  { id: 'sucursalOrigen', header: 'Origen', accessorKey: 'sucursalOrigen', size: 160 },
  { id: 'sucursalDestino', header: 'Destino', accessorKey: 'sucursalDestino', size: 160 },
  {
    id: 'fecha',
    header: 'Fecha',
    accessorKey: 'fecha',
    size: 110,
    cell: (row) => <span className="tabular-nums">{fmtFecha(row.fecha)}</span>,
  },
  {
    id: 'items',
    header: 'Ítems',
    accessorKey: 'items',
    size: 90,
    meta: { align: 'right' },
    cell: (row) => <span className="tabular-nums">{row.items}</span>,
  },
  {
    id: 'peso',
    header: 'Peso',
    size: 110,
    meta: { align: 'right' },
    cell: (row) => <span className="tabular-nums">{fmtPeso.format(row.peso)} kg</span>,
  },
  {
    id: 'volumen',
    header: 'Volumen',
    size: 110,
    meta: { align: 'right' },
    cell: (row) => <span className="tabular-nums">{fmtVol.format(row.volumen)} m³</span>,
  },
  {
    id: 'estado',
    header: 'Estado',
    accessorKey: 'estado',
    size: 120,
    cell: (row) => (
      <Badge variant="outline" className="rounded-full border-primary/30 text-primary">
        {row.estado}
      </Badge>
    ),
  },
])

// ── Devoluciones (orden por cliente) ─────────────────────────────────────────────────────────

interface DevolucionFilters extends Record<string, unknown> {
  sucursal?: string
  motivo?: string
  fechaDesde?: string
  fechaHasta?: string
}

export const devolucionFilterDefs = defineFilters<DevolucionFilters>([
  { type: 'daterange', id: 'fecha', label: 'Fecha', fromKey: 'fechaDesde', toKey: 'fechaHasta' },
  // { type: 'select', id: 'sucursal', label: 'Sucursal', options: sucursalOptions },
  // {
  //   type: 'select',
  //   id: 'motivo',
  //   label: 'Motivo',
  //   options: MOTIVOS_DEVOLUCION.map((m) => ({ label: m, value: m })),
  // },
])

export const devolucionColumns = defineColumns<Devolucion>([
  { id: 'codigo', header: 'Código', accessorKey: 'codigo', size: 120, pin: 'left' },
  { id: 'cliente', header: 'Cliente', accessorKey: 'cliente', size: 200 },
  {
    id: 'fecha',
    header: 'Fecha',
    accessorKey: 'fecha',
    size: 110,
    cell: (row) => <span className="tabular-nums">{fmtFecha(row.fecha)}</span>,
  },
  {
    id: 'items',
    header: 'Ítems',
    accessorKey: 'items',
    size: 90,
    meta: { align: 'right' },
    cell: (row) => <span className="tabular-nums">{row.items}</span>,
  },
  {
    id: 'peso',
    header: 'Peso',
    size: 110,
    meta: { align: 'right' },
    cell: (row) => <span className="tabular-nums">{fmtPeso.format(row.peso)} kg</span>,
  },
  {
    id: 'volumen',
    header: 'Volumen',
    size: 110,
    meta: { align: 'right' },
    cell: (row) => <span className="tabular-nums">{fmtVol.format(row.volumen)} m³</span>,
  },
  // {
  //   id: 'motivo',
  //   header: 'Motivo',
  //   accessorKey: 'motivo',
  //   size: 140,
  //   cell: (row) => (
  //     <Badge variant="outline" className="rounded-full font-normal">
  //       {row.motivo}
  //     </Badge>
  //   ),
  // },
  // {
  //   id: 'camion',
  //   header: 'Camión asignado',
  //   size: 150,
  //   cell: (row) => {
  //     const camion = camionPorId(row.camionId)
  //     return camion ? (
  //       <span className="tabular-nums">{camion.placa}</span>
  //     ) : (
  //       <span className="text-xs text-muted-foreground">Sin asignar</span>
  //     )
  //   },
  // },
])

// Rango de fecha del daterange (ISO) contra la fecha de la orden (YYYY-MM-DD).
export const enRango = (fecha: string, desde?: string, hasta?: string) =>
  (!desde || fecha >= desde.slice(0, 10)) && (!hasta || fecha <= hasta.slice(0, 10))

export function TransfersView({
  state,
  onNext,
  initialTab = 'transferencias',
}: {
  state: BoardState
  onNext: () => void
  initialTab?: TransferTab
}) {
  const [tab, setTab] = useState<TransferTab>(initialTab)
  const [transferFilters, setTransferFilters] = useState<Partial<TransferFilters>>({})
  const [devolucionFilters, setDevolucionFilters] = useState<Partial<DevolucionFilters>>({})

  // Modal "Agregar a la planificación" (transferencias): guarda la selección y el camión que traslada.
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferSel, setTransferSel] = useState<Transferencia[]>([])
  const [transferCamion, setTransferCamion] = useState('')

  // Modal "Asignar a camión…" (devoluciones): guarda la selección y el camión elegido.
  const [devolucionOpen, setDevolucionOpen] = useState(false)
  const [devolucionSel, setDevolucionSel] = useState<Devolucion[]>([])
  const [camionAsignado, setCamionAsignado] = useState('')

  const sinDatos = state === 'empty' || state === 'error'

  const transferencias = sinDatos
    ? []
    : TRANSFERENCIAS.filter(
        (t) =>
          (!transferFilters.sucursalOrigen || t.sucursalOrigen === transferFilters.sucursalOrigen) &&
          (!transferFilters.sucursalDestino ||
            t.sucursalDestino === transferFilters.sucursalDestino) &&
          enRango(t.fecha, transferFilters.fechaDesde, transferFilters.fechaHasta)
      )

  const devoluciones = sinDatos
    ? []
    : DEVOLUCIONES.filter(
        (d) =>
          (!devolucionFilters.sucursal || d.sucursal === devolucionFilters.sucursal) &&
          (!devolucionFilters.motivo || d.motivo === devolucionFilters.motivo) &&
          enRango(d.fecha, devolucionFilters.fechaDesde, devolucionFilters.fechaHasta)
      )

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TransferTab)}>
          <TabsList>
            <TabsTrigger value="transferencias">
              Traslados ({transferencias.length})
            </TabsTrigger>
            <TabsTrigger value="devoluciones">Devoluciones ({devoluciones.length})</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button className="ml-auto shrink-0" onClick={onNext}>
          Continuar a planificación
        </Button>
      </div>

      {tab === 'transferencias' ? (
        <DataTable
          tableId={`mockup-transferencias-${state}`}
          columns={transferColumns}
          data={transferencias}
          getRowId={(row) => row.id}
          isLoading={state === 'loading'}
          isError={state === 'error'}
          errorMessage="No pudimos traer las órdenes de transferencia."
          onRetry={() => {}}
          emptyTitle="Sin transferencias"
          emptyMessage="No hay órdenes de transferencia entre sucursales para este plan."
          bodyMinHeight={360}
          selectable
          searchable
          searchPlaceholder="Buscar por código…"
          clientPagination
          defaultPageSize={10}
          filterBar={
            <FilterBar
              defs={transferFilterDefs}
              values={transferFilters}
              onChange={(u) => setTransferFilters((prev) => ({ ...prev, ...u }))}
            />
          }
          // bulkActions={[
          //   {
          //     label: 'Agregar a la planificación',
          //     onClick: (rows) => {
          //       setTransferSel(rows)
          //       setTransferCamion('')
          //       setTransferOpen(true)
          //     },
          //   },
          // ]}
        />
      ) : (
        <DataTable
          tableId={`mockup-devoluciones-${state}`}
          columns={devolucionColumns}
          data={devoluciones}
          getRowId={(row) => row.id}
          isLoading={state === 'loading'}
          isError={state === 'error'}
          errorMessage="No pudimos traer las órdenes de devolución."
          onRetry={() => {}}
          emptyTitle="Sin devoluciones"
          emptyMessage="No hay órdenes de devolución para asignar en este plan."
          bodyMinHeight={360}
          selectable
          searchable
          searchPlaceholder="Buscar por código o cliente…"
          clientPagination
          defaultPageSize={10}
          filterBar={
            <FilterBar
              defs={devolucionFilterDefs}
              values={devolucionFilters}
              onChange={(u) => setDevolucionFilters((prev) => ({ ...prev, ...u }))}
            />
          }
          // bulkActions={[
          //   {
          //     label: 'Asignar a camión…',
          //     onClick: (rows) => {
          //       setDevolucionSel(rows)
          //       setCamionAsignado('')
          //       setDevolucionOpen(true)
          //     },
          //   },
          // ]}
        />
      )}

      {/* Modal transferencias: sumar las órdenes seleccionadas a la planificación (en un camión). */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar a la planificación</DialogTitle>
            <DialogDescription>
              {transferSel.length} orden{transferSel.length === 1 ? '' : 'es'} de transferencia se
              sumarán a la planificación de hoy.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-muted-foreground">Camión que la traslada</span>
            <Select value={transferCamion} onValueChange={(v) => v && setTransferCamion(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Elegí un camión…" />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {CAMIONES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.placa} — {c.clase} {c.tipo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancelar</Button>} />
            <Button disabled={!transferCamion} onClick={() => setTransferOpen(false)}>
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal devoluciones: asignar el camión que las recoge en el regreso. */}
      <Dialog open={devolucionOpen} onOpenChange={setDevolucionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar devoluciones a un camión</DialogTitle>
            <DialogDescription>
              {devolucionSel.length} orden{devolucionSel.length === 1 ? '' : 'es'} de devolución para
              recoger en el regreso.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-muted-foreground">Camión</span>
            <Select value={camionAsignado} onValueChange={(v) => v && setCamionAsignado(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Elegí un camión…" />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {CAMIONES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.placa} — {c.clase} {c.tipo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancelar</Button>} />
            <Button disabled={!camionAsignado} onClick={() => setDevolucionOpen(false)}>
              Asignar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
