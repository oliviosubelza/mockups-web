// Puntos de entrega QUITADOS del plan: los que alguien sacó a mano y se pueden devolver.
//
// POR QUÉ ESTA LISTA TIENE QUE EXISTIR. Quitar un punto lo borra del mapa y de las tres listas — que
// es exactamente lo que se pide— pero eso deja una acción sin vuelta atrás en una pantalla donde todo
// lo demás es reversible. Sin este lugar, el único camino de regreso sería acordarse de en qué canal
// estaba y destildarlo ahí adentro. Una acción destructiva sin lista de deshacer es una acción que la
// gente no usa, por miedo.
//
// SE LISTA POR PUNTO DE ENTREGA, NO POR PEDIDO. Lo que se sacó fue un punto —"este cliente no va
// hoy"—, y devolverlo tiene que ser el mismo gesto en la misma unidad. Mostrar sus cuatro pedidos
// sueltos obligaría a devolverlos de a uno y a saber que son cuatro.
import { RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CanalGlyph } from '../canal-glyph'
import { CANAL_META, type Pedido } from '../mock-data'

const fmtPeso = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 })

/** Un punto de entrega quitado, con todo lo que se fue con él. */
export interface PuntoQuitado {
  puntoEntregaId: string
  puntoEntrega: string
  cliente: string
  canal: Pedido['canal']
  pedidos: Pedido[]
  pesoKg: number
}

/** Agrupa los pedidos excluidos por punto de entrega. Es la unidad en la que se quitó y se devuelve. */
export function agruparQuitados(pedidos: Pedido[]): PuntoQuitado[] {
  const porPunto = new Map<string, PuntoQuitado>()
  for (const pedido of pedidos) {
    const previo = porPunto.get(pedido.puntoEntregaId)
    if (previo) {
      previo.pedidos.push(pedido)
      previo.pesoKg += pedido.peso
      continue
    }
    porPunto.set(pedido.puntoEntregaId, {
      puntoEntregaId: pedido.puntoEntregaId,
      puntoEntrega: pedido.puntoEntrega,
      cliente: pedido.cliente,
      canal: pedido.canal,
      pedidos: [pedido],
      pesoKg: pedido.peso,
    })
  }
  return [...porPunto.values()].sort((a, b) => a.cliente.localeCompare(b.cliente))
}

export function QuitadosDialog({
  abierto,
  onOpenChange,
  puntos,
  onDevolver,
}: {
  abierto: boolean
  onOpenChange: (v: boolean) => void
  puntos: PuntoQuitado[]
  /** Devuelve al plan los pedidos de esos ids. Vacío = todos los de la lista. */
  onDevolver: (pedidoIds: string[]) => void
}) {
  const pesoTotal = puntos.reduce((acc, p) => acc + p.pesoKg, 0)
  const todos = puntos.flatMap((p) => p.pedidos.map((x) => x.id))

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Trash2 size={15} className="text-muted-foreground" />
            Puntos quitados del plan
          </DialogTitle>
          <DialogDescription className="text-xs">
            No se ven en el mapa ni entran en el reparto. Devolvé los que quieras recuperar: vuelven
            con todos sus pedidos.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto">
          {puntos.length === 0 ? (
            <p className="px-2 py-8 text-center text-xs text-muted-foreground">
              No sacaste ningún punto del plan.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {puntos.map((punto) => {
                const meta = CANAL_META[punto.canal]
                return (
                  <li key={punto.puntoEntregaId} className="flex items-center gap-2 py-2">
                    <span className="shrink-0" style={{ color: meta.color }} title={meta.label}>
                      <CanalGlyph canal={punto.canal} size={14} />
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{punto.cliente}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {punto.puntoEntrega}
                      </p>
                    </div>

                    <span className="shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                      {punto.pedidos.length}p · {fmtPeso.format(punto.pesoKg)} kg
                    </span>

                    {/* El botón dice DEVOLVER y no "restaurar" ni un ícono solo: es la única acción de
                        la fila y tiene que poder leerse sin adivinar qué hace el dibujito. */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 shrink-0 gap-1 px-2 text-[11px]"
                      onClick={() => onDevolver(punto.pedidos.map((p) => p.id))}
                    >
                      <RotateCcw size={11} />
                      Devolver
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {puntos.length > 0 && (
          <DialogFooter className="items-center gap-3 sm:justify-between">
            <span className="text-xs text-muted-foreground">
              <span className="font-semibold tabular-nums text-foreground">{puntos.length}</span>{' '}
              punto{puntos.length !== 1 ? 's' : ''} afuera ·{' '}
              <span className="tabular-nums">{fmtPeso.format(pesoTotal)} kg</span>
            </span>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onDevolver(todos)}>
              <RotateCcw size={13} />
              Devolver todos
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
