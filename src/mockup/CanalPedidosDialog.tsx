// Diálogo por CANAL: los pedidos que ese canal mete a la planificación POR CORTE, uno por fila,
// para poder quitar los que no deban entrar. Se abre clickeando una fila del resumen
// (ver OrderSelectionPanel).
//
// Por qué existe: el resumen agregaba y sumaba por canal, pero no había forma de sacar UN pedido
// puntual. La tabla de "fuera de corte" solo permitía AGREGAR los que la regla dejaba afuera; los
// que entraban por corte no se podían quitar.
//
// Los de FUERA del corte NO se listan acá: ya tienen su propia pestaña ("Seleccionar fuera de
// corte") y tenerlos en los dos lados era el mismo control duplicado. Sí se cuentan en el pie, para
// que los totales cierren contra la fila del resumen.
//
// La decisión se guarda en el store al instante (misma convención que la tabla de fuera de corte:
// no hay Aceptar/Cancelar). Cerrar solo cierra.
import { useState } from 'react'
import { DataTable, defineColumns } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CANAL_META, type CanalId, type Pedido } from './mock-data'
import { CanalGlyph } from './canal-glyph'
import { estaIncluido, incluidoPorDefecto, useDispatchPlanStore } from './dispatch-plan-store'

// Mismos formatos que el resto del paso (convención del proyecto: cada vista declara los suyos).
const fmtMoneda = new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' })
const fmtPeso = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 })

/**
 * Campos donde busca el buscador del diálogo. No dependen de las columnas visibles: se puede buscar
 * por vendedor o punto de entrega aunque no se estén mostrando.
 */
const SEARCH_KEYS = ['salesOrder', 'cliente', 'vendedor', 'puntoEntrega', 'company'] as const

const columns = defineColumns<Pedido>([
  { id: 'salesOrder', header: 'Pedido', accessorKey: 'salesOrder', size: 96, pin: 'left' },
  { id: 'cliente', header: 'Cliente', accessorKey: 'cliente', size: 200 },
  // Sin badge de corte: acá TODAS las filas están dentro del corte (las de fuera se manejan en su
  // propia pestaña), así que marcarlas sería ruido — todas dirían lo mismo.
  {
    id: 'ventana',
    header: 'Entrega',
    accessorKey: 'ventana',
    size: 130,
    cell: (row) => <span className="truncate tabular-nums">{row.ventana}</span>,
  },
  { id: 'vendedor', header: 'Vendedor', accessorKey: 'vendedor', size: 150 },
  {
    id: 'total',
    header: 'Total (Bs)',
    accessorKey: 'total',
    size: 108,
    meta: { align: 'right' },
    cell: (row) => <span className="font-medium tabular-nums">{fmtMoneda.format(row.total)}</span>,
  },
  {
    id: 'peso',
    header: 'Peso',
    accessorKey: 'peso',
    size: 92,
    meta: { align: 'right' },
    cell: (row) => <span className="tabular-nums">{fmtPeso.format(row.peso)} kg</span>,
  },
])

/** Métrica compacta del pie del diálogo. */
function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] leading-tight text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold leading-tight tabular-nums">{value}</span>
    </div>
  )
}

export function CanalPedidosDialog({
  canal,
  pedidos,
  onClose,
}: {
  /** Canal a editar. `null` cierra el diálogo. */
  canal: CanalId | null
  /**
   * TODOS los pedidos del canal ya filtrados por el panel (narrowing + filtros del DTO), sin separar
   * por corte. El diálogo hace el split él mismo: lista solo los de DENTRO del corte, y usa los de
   * fuera únicamente para reconciliar sus totales con la fila del resumen que se clickeó.
   */
  pedidos: Pedido[]
  onClose: () => void
}) {
  const orderOverrides = useDispatchPlanStore((s) => s.orderOverrides)
  const setOrdersIncluded = useDispatchPlanStore((s) => s.setOrdersIncluded)

  // La tabla siembra su selección al MONTAR (`defaultSelectedIds` no es controlado). Este nonce va
  // en su `key`: al restablecer, la tabla se remonta y vuelve a sembrar — sin esto los checkboxes
  // quedarían mostrando la selección vieja aunque el store ya estuviera limpio.
  const [seedNonce, setSeedNonce] = useState(0)

  if (!canal) return null

  const meta = CANAL_META[canal]

  // Solo los de DENTRO del corte: los de fuera ya tienen su propia pestaña ("Seleccionar fuera de
  // corte") y mostrarlos acá duplicaba el mismo control en dos lugares.
  const dentro = pedidos.filter(incluidoPorDefecto)
  // El scope que se manda al store son SOLO los listados: así destildar acá no puede tocar las
  // decisiones tomadas en la pestaña de fuera de corte.
  const scopeIds = dentro.map((p) => p.id)
  const incluidos = dentro.filter((p) => estaIncluido(p, orderOverrides))
  const quitados = dentro.length - incluidos.length

  const totalMonto = incluidos.reduce((acc, p) => acc + p.total, 0)
  const totalPeso = incluidos.reduce((acc, p) => acc + p.peso, 0)

  // Fuera de corte que el usuario agregó en la otra pestaña. No se listan, pero SÍ se cuentan acá:
  // sin este dato el pie diría "entran 2" mientras la fila del resumen dice 3, y no habría forma de
  // entender la diferencia.
  const fueraAgregados = pedidos.filter(
    (p) => !incluidoPorDefecto(p) && estaIncluido(p, orderOverrides),
  ).length

  // Todos los listados están dentro del corte, así que el default es "entran todos".
  const restablecer = () => {
    setOrdersIncluded(scopeIds, scopeIds)
    setSeedNonce((n) => n + 1)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* Solo se pisa el breakpoint `sm`: el `max-w-[calc(100%-2rem)]` del DialogContent se conserva
          para que en pantallas chicas el diálogo no se salga del viewport. */}
      <DialogContent className="flex max-h-[85vh] flex-col gap-3 sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="shrink-0" style={{ color: meta.color }}>
              <CanalGlyph canal={canal} size={17} />
            </span>
            {meta.label}
          </DialogTitle>
          <DialogDescription>
            Pedidos que entran solos por cerrar antes de las {meta.timeOff}. Destildá los que no
            quieras en esta planificación. Los que quedan fuera del corte se eligen en
            &ldquo;Seleccionar fuera de corte&rdquo;.
          </DialogDescription>
        </DialogHeader>

        {/* `overflow-auto` y no `fillHeight` en la tabla: con 3-4 pedidos la tabla crece con su
            contenido (fillHeight la estiraría vacía hasta el 85vh), y si la lista es larga scrollea
            acá dentro en vez de recortarse contra el alto máximo del diálogo. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          <DataTable
            // El nonce fuerza el remonte tras "Restablecer" para que la siembra vuelva a correr.
            key={`${canal}-${seedNonce}`}
            tableId="mockup-canal-pedidos"
            columns={columns}
            data={dentro}
            getRowId={(row) => row.id}
            emptyTitle="Nada dentro del corte"
            emptyMessage="Todos los pedidos de este canal cierran después del corte: se eligen en “Seleccionar fuera de corte”."
            bodyMinHeight={280}
            selectable
            defaultSelectedIds={incluidos.map((p) => p.id)}
            onSelectionChange={(rows) => setOrdersIncluded(scopeIds, rows.map((r) => r.id))}
            searchable
            searchPlaceholder="Buscar por código, cliente, vendedor…"
            searchKeys={[...SEARCH_KEYS]}
            clientPagination
            defaultPageSize={8}
          />
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <div className="flex items-center gap-5">
            <Kpi label="Dentro del corte" value={`${incluidos.length} de ${dentro.length}`} />
            <Kpi label="Monto" value={fmtMoneda.format(totalMonto)} />
            <Kpi label="Peso" value={`${fmtPeso.format(totalPeso)} kg`} />
            {quitados > 0 && <Kpi label="Quitados" value={String(quitados)} />}
            {/* Reconcilia con la fila del resumen: lo que entra del canal es esto + los de fuera. */}
            {fueraAgregados > 0 && (
              <Kpi label="+ Fuera de corte" value={String(fueraAgregados)} />
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={restablecer}>
              Restablecer
            </Button>
            <Button size="sm" onClick={onClose}>
              Listo
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
