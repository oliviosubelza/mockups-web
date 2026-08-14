// Panel derecho del paso combinado (fase 0), sub-paso "Traslados". Reutiliza las columnas y filtros
// de TransfersView para que ambas pantallas no diverjan. El CTA de "Continuar" vive en la
// CoverageSummaryBar del paso, arriba del split.
//
// Clasificación por MOVIMIENTO. Son tres y cuelgan de dos grupos del negocio:
//   Entregas → Traslados (transferencias entre sucursales) · Devoluciones (todavía sin camión)
//   Recojos  → Devoluciones ya asignadas a un camión (recogida en el regreso)
//
// POR QUÉ EL ENCABEZADO SE REHIZO (antes: un select-search + una tarjeta de resumen debajo).
//  1. Decía lo mismo dos veces. La pastilla mostraba "Entregas · Devoluciones 13" y la tarjeta de
//     abajo repetía badge "Entregas" + título "Devoluciones". Dos formatos para un solo dato.
//  2. Escondía la estructura. Con tres movimientos y un select, se ve UNO: elegías cinco traslados,
//     cambiabas a devoluciones y esos cinco desaparecían de la vista sin dejar rastro. Ahora los tres
//     están siempre a la vista, cada uno con su propia fracción elegidas/total.
//  3. Los KPIs no tenían contra qué compararse. "Peso 0 kg" suelto no dice nada; el resto de la
//     pantalla SIEMPRE compara contra capacidad. Ahora se compara contra lo que SOBRA en los camiones
//     ya elegidos, que es la pregunta real: ¿esto que estoy agregando entra?
//  4. La frase "lo seleccionado es lo que se suma a la planificación" era falsa: la selección vivía en
//     un `useState` de este archivo y no llegaba a ningún lado. Ahora vive en `dispatch-plan-store`.
//
// LÍMITE CONOCIDO: lo elegido acá NO entra todavía en `selectNeededTotals` (la barra de cobertura de
// arriba). Hacerlo exige decidir si una devolución ocupa la capacidad de la salida o la del regreso, y
// esa regla no está definida — ver la nota en `selectMovimientoTotals`.
import { useState } from 'react'
import { ArrowLeftRight, PackageCheck, Undo2, type LucideIcon } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { DataTable, FilterBar } from '@/components/data-table'
import { cn } from '@/lib/utils'
import { DEVOLUCIONES, TRANSFERENCIAS } from './mock-data'
import { kgToTons } from './unit-conversion'
import {
  selectCoverage,
  selectMovimientoTotals,
  useDispatchPlanStore,
} from './dispatch-plan-store'
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
  icon: LucideIcon
  hint: string
  base: number
}[] = [
  {
    key: 'entrega-traslado',
    grupo: 'Entregas',
    label: 'Traslados',
    icon: ArrowLeftRight,
    hint: 'Transferencias entre sucursales',
    base: TRANSFERENCIAS.length,
  },
  {
    key: 'entrega-devolucion',
    grupo: 'Entregas',
    label: 'Devoluciones',
    icon: Undo2,
    hint: 'Devoluciones todavía sin camión asignado',
    base: DEVOLUCIONES_ENTREGA.length,
  },
  {
    key: 'recojo-devolucion',
    grupo: 'Recojos',
    label: 'Recojos',
    icon: PackageCheck,
    hint: 'Devoluciones ya asignadas a un camión: se recogen en el regreso',
    base: DEVOLUCIONES_RECOJO.length,
  },
]

/** Dos decimales: las dos barras muestran magnitudes chicas (m³ y toneladas), y con uno solo un
 *  traslado de 0,04 m³ se leería como 0. */
const fmtCantidad = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 2 })

/**
 * Chip de un movimiento. Es un BOTÓN de vista y a la vez el indicador de cuánto se lleva elegido ahí.
 * Los tres están siempre visibles: es lo único que permite ver de un vistazo que hay trabajo pendiente
 * en un movimiento que no estás mirando.
 *
 * La fracción `elegidas/total` va siempre, incluso en 0: las dos mitades importan. Con solo el total
 * no se distingue "no lo miré" de "lo miré y no elegí ninguna".
 */
function ChipMovimiento({
  label,
  icon: Icon,
  hint,
  elegidas,
  total,
  activo,
  onClick,
}: {
  label: string
  icon: LucideIcon
  hint: string
  elegidas: number
  total: number
  activo: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      aria-pressed={activo}
      className={cn(
        'flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors',
        activo
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border/60 bg-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      <Icon size={13} className={activo ? 'text-primary' : undefined} />
      <span className="font-medium">{label}</span>
      <span
        className={cn(
          'rounded-full px-1 text-[10px] font-semibold tabular-nums',
          // Solo se pinta cuando hay algo elegido. Un badge de color en 0 grita sin tener nada que
          // decir, y con tres chips en fila serían tres avisos permanentes que el ojo aprende a ignorar.
          elegidas > 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
        )}
      >
        {elegidas}/{total}
      </span>
    </button>
  )
}

/**
 * Cuánto de la capacidad LIBRE consume lo elegido en los tres movimientos.
 *
 * El sobrante sale de los camiones ya elegidos menos los pedidos que entran al plan: es el hueco real
 * que queda. Si lo agregado lo supera, la barra se llena y pasa a rojo — es el mismo lenguaje que la
 * barra de cobertura de arriba, a propósito: son la misma pregunta a distinta escala.
 */
function BarraEncaje({
  label,
  usado,
  libre,
  unidad,
}: {
  label: string
  usado: number
  libre: number
  unidad: string
}) {
  const excede = usado > libre
  const pct = libre > 0 ? Math.min(100, Math.round((usado / libre) * 100)) : usado > 0 ? 100 : 0

  return (
    <div className="flex min-w-36 flex-1 flex-col gap-0.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium">{label}</span>
        <span className={cn('text-[11px] tabular-nums', excede ? 'text-destructive' : 'text-muted-foreground')}>
          <span className={cn('font-semibold', excede ? 'text-destructive' : 'text-foreground')}>
            {fmtCantidad.format(usado)}
          </span>{' '}
          de {fmtCantidad.format(Math.max(libre, 0))} {unidad}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            excede ? 'bg-destructive' : 'bg-primary',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function TransfersSelectionPanel({ state }: { state: BoardState }) {
  const [mov, setMov] = useState<MovKey>('entrega-traslado')
  const [transferFilters, setTransferFilters] = useState<Partial<TransferFilters>>({})
  const [devolucionFilters, setDevolucionFilters] = useState<Partial<DevolucionFilters>>({})

  const selectedTransferIds = useDispatchPlanStore((s) => s.selectedTransferIds)
  const selectedDevolucionIds = useDispatchPlanStore((s) => s.selectedDevolucionIds)
  const setMovimientoSeleccion = useDispatchPlanStore((s) => s.setMovimientoSeleccion)
  // Estos selectores derivan objetos NUEVOS en cada llamada; sin igualdad shallow, Zustand v5 los ve
  // como snapshot cambiante y entra en bucle de render.
  const agregado = useDispatchPlanStore(useShallow(selectMovimientoTotals))
  const cobertura = useDispatchPlanStore(useShallow(selectCoverage))

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

  const filtraDevolucion = (d: (typeof DEVOLUCIONES)[number]) =>
    (!devolucionFilters.sucursal || d.sucursal === devolucionFilters.sucursal) &&
    (!devolucionFilters.motivo || d.motivo === devolucionFilters.motivo) &&
    enRango(d.fecha, devolucionFilters.fechaDesde, devolucionFilters.fechaHasta)

  const devolucionesBase =
    mov === 'recojo-devolucion' ? DEVOLUCIONES_RECOJO : DEVOLUCIONES_ENTREGA
  const devoluciones = sinDatos ? [] : devolucionesBase.filter(filtraDevolucion)

  // Elegidas por movimiento. Se cuentan contra el UNIVERSO del movimiento (`base`) y no contra lo que
  // el filtro deja a la vista: el chip informa el estado del movimiento, no el de la tabla.
  const elegidasDe = (key: MovKey): number => {
    if (key === 'entrega-traslado') return selectedTransferIds.length
    const universo = key === 'recojo-devolucion' ? DEVOLUCIONES_RECOJO : DEVOLUCIONES_ENTREGA
    return universo.filter((d) => selectedDevolucionIds.includes(d.id)).length
  }

  // Ids del movimiento activo, para que la tabla nazca con lo ya decidido tildado.
  const idsElegidosActivos =
    mov === 'entrega-traslado'
      ? selectedTransferIds
      : devolucionesBase.filter((d) => selectedDevolucionIds.includes(d.id)).map((d) => d.id)

  const registrar = (scope: { id: string }[], rows: { id: string }[]) =>
    setMovimientoSeleccion(
      mov === 'entrega-traslado' ? 'transferencia' : 'devolucion',
      scope.map((row) => row.id),
      rows.map((row) => row.id),
    )

  // Capacidad que sobra según la barra de cobertura de arriba (camiones elegidos − pedidos del plan).
  // Negativa significa que los pedidos YA exceden: ahí el hueco libre es 0, no un número en rojo que
  // se leería como "tengo -5 m³ disponibles".
  const libreVolumen = Math.max(0, cobertura.volumeSurplusM3)
  const librePesoTon = Math.max(0, cobertura.weightSurplusTon)
  const usadoPesoTon = Number(kgToTons(agregado.pesoKg).toFixed(2))

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3">
      {/* ── Encabezado: los tres movimientos + cuánto ocupa lo agregado ──
          Un solo bloque. Antes eran dos (selector arriba, tarjeta de resumen abajo) diciendo lo mismo,
          y entre los dos se comían el alto que alineaba esta tabla con la de camiones. */}
      <div className="shrink-0 space-y-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {MOVIMIENTOS.map((m) => (
            <ChipMovimiento
              key={m.key}
              label={m.label}
              icon={m.icon}
              hint={m.hint}
              elegidas={elegidasDe(m.key)}
              total={m.base}
              activo={mov === m.key}
              onClick={() => setMov(m.key)}
            />
          ))}
          <span className="ml-auto text-[11px] text-muted-foreground">
            {/* El total de los TRES, no el del activo: es lo que se está agregando al plan. */}
            <span className="font-semibold tabular-nums text-foreground">{agregado.ordenes}</span>{' '}
            órden{agregado.ordenes === 1 ? '' : 'es'} ·{' '}
            <span className="tabular-nums">{agregado.items}</span> ítems
          </span>
        </div>

        {/* Cuánto de lo que sobra en los camiones se lleva lo agregado. Sin camiones elegidos todavía
            no hay hueco que medir y el bloque se calla en vez de mostrar dos barras al 100%. */}
        {libreVolumen > 0 || librePesoTon > 0 || agregado.ordenes > 0 ? (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <BarraEncaje
              label="Volumen"
              usado={agregado.volumenM3}
              libre={libreVolumen}
              unidad="m³"
            />
            <BarraEncaje label="Peso" usado={usadoPesoTon} libre={librePesoTon} unidad="t" />
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Elegí camiones a la izquierda para ver cuánto espacio libre queda para estos movimientos.
          </p>
        )}
      </div>

      {mov === 'entrega-traslado' ? (
        <DataTable
          key={`transfer-${mov}-${state}`}
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
          defaultSelectedIds={idsElegidosActivos}
          onSelectionChange={(rows) => registrar(transferencias, rows)}
          rowClassName={(row) =>
            selectedTransferIds.includes(row.id)
              ? 'bg-primary/10 ring-1 ring-inset ring-primary/25 hover:bg-primary/15'
              : ''
          }
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
          key={`devolucion-${mov}-${state}`}
          tableId={`mockup-step1-${mov}-${state}`}
          columns={devolucionColumns}
          data={devoluciones}
          getRowId={(row) => row.id}
          isLoading={state === 'loading'}
          isError={state === 'error'}
          errorMessage="No pudimos traer las órdenes de devolución."
          onRetry={() => {}}
          emptyTitle={mov === 'recojo-devolucion' ? 'Sin recojos' : 'Sin devoluciones'}
          emptyMessage={
            mov === 'recojo-devolucion'
              ? 'No hay devoluciones asignadas para recojo en este plan.'
              : 'No hay devoluciones pendientes de entrega en este plan.'
          }
          fillHeight
          selectable
          defaultSelectedIds={idsElegidosActivos}
          onSelectionChange={(rows) => registrar(devoluciones, rows)}
          rowClassName={(row) =>
            selectedDevolucionIds.includes(row.id)
              ? 'bg-primary/10 ring-1 ring-inset ring-primary/25 hover:bg-primary/15'
              : ''
          }
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
