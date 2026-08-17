// Desglose por canal: la tabla completa de lo que cada canal le está metiendo al plan.
//
// POR QUÉ ES UN DIÁLOGO Y NO UN PANEL. Es una pregunta que se hace de a ratos —"¿cuánto me está
// metiendo Tradicional?"— y se contesta comparando canales entre sí. Comparar necesita ANCHO: cinco
// columnas alineadas en 300 px no se comparan, se adivinan. Acá hay 576 px y las cinco entran.
//
// LO QUE REEMPLAZA. Antes esto vivía adentro de un popover con forma de select (chevron incluido) que
// no seleccionaba nada: abría diálogos. Una forma que promete elegir un valor y en cambio abre otra
// cosa se lee mal aunque esté a la vista — que era exactamente el síntoma. Ahora el panel muestra el
// RESUMEN (la barra apilada) y este diálogo el DETALLE.
import { AlertTriangle, ChevronRight } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { CanalGlyph } from '../canal-glyph'
import { CANAL_META, type CanalId } from '../mock-data'

const fmtPeso = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 })

/** Una fila del desglose. La calcula `PedidosPanel` sobre el mismo predicado que el mapa y el HUD. */
export interface FilaCanal {
  canal: CanalId
  /** Pedidos que EFECTIVAMENTE entran al plan (regla de corte + decisiones manuales). */
  pedidos: number
  /** Pedidos del canal en el alcance, entren o no. */
  total: number
  clientes: number
  pesoKg: number
  /** Cuántos de los suyos quedan fuera de corte. Es la advertencia, no un dato más. */
  fuera: number
}

/**
 * Barra apilada con la composición del plan por canal.
 *
 * ES EL CONTROL, no un adorno: reemplaza al texto mudo "Ver pedidos por canal". En los mismos píxeles
 * dice algo que el texto no decía —que dos tercios son Horizontal y el resto se reparte— y el color de
 * cada tramo es el MISMO con el que ese canal se dibuja en el mapa, así que la barra y la ciudad se
 * leen con la misma clave.
 *
 * Reparte por PEDIDOS y no por kilos a propósito: el número que va escrito abajo es "66 pedidos", y
 * una barra que partiera por peso contaría otra cosa que la línea que tiene pegada. El peso por canal
 * está en la tabla, con su columna.
 */
export function BarraCanales({ filas, className }: { filas: FilaCanal[]; className?: string }) {
  const total = filas.reduce((acc, f) => acc + f.pedidos, 0)

  return (
    // `span` y no `div`: esta barra vive DENTRO de un botón (el resumen del panel es clickeable), y un
    // div ahí es HTML inválido. Con `flex` se comporta igual y el marcado queda correcto en los dos
    // lugares donde se usa.
    <span
      className={cn('flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-muted', className)}
    >
      {total === 0
        ? null
        : filas
            .filter((f) => f.pedidos > 0)
            .map((f) => {
              const meta = CANAL_META[f.canal]
              return (
                <span
                  key={f.canal}
                  // `minWidth` en px: un canal con 1 de 66 pedidos da 1,5% y sin piso desaparece. Un
                  // tramo invisible es peor que no tenerlo — hace que la suma no cierre a ojo.
                  style={{
                    width: `${(f.pedidos / total) * 100}%`,
                    minWidth: 3,
                    background: meta.color,
                  }}
                  title={`${meta.label} · ${f.pedidos} pedidos · ${fmtPeso.format(f.pesoKg)} kg`}
                />
              )
            })}
    </span>
  )
}

export function CanalesDialog({
  abierto,
  onOpenChange,
  filas,
  onElegirCanal,
}: {
  abierto: boolean
  onOpenChange: (v: boolean) => void
  filas: FilaCanal[]
  /** Abre el detalle de ese canal (la tabla pedido por pedido del paso 1). */
  onElegirCanal: (canal: CanalId) => void
}) {
  const totalPedidos = filas.reduce((acc, f) => acc + f.pedidos, 0)
  const totalPeso = filas.reduce((acc, f) => acc + f.pesoKg, 0)

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base">Pedidos por canal</DialogTitle>
          <DialogDescription className="text-xs">
            Lo que entra al plan con los filtros y las decisiones actuales. Elegí un canal para
            revisarlo pedido por pedido.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <BarraCanales filas={filas} />

          {/* Encabezado de columnas: es una TABLA, y las cuatro cifras se comparan verticalmente entre
              canales. Sin encabezado, tres números pegados a la derecha no dicen qué son. */}
          <div>
            <div className="flex h-6 items-center gap-2 border-b border-border px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span className="min-w-0 flex-1">Canal</span>
              <span className="w-12 shrink-0 text-right">Pedidos</span>
              <span className="w-12 shrink-0 text-right">Clientes</span>
              <span className="w-20 shrink-0 text-right">Peso</span>
              <span className="w-4 shrink-0" aria-hidden />
            </div>

            <div className="max-h-[50vh] overflow-y-auto">
              {filas.length === 0 ? (
                <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                  Los filtros actuales no dejan pasar ningún pedido.
                </p>
              ) : (
                filas.map((fila) => {
                  const meta = CANAL_META[fila.canal]
                  const excluidos = fila.total - fila.pedidos
                  return (
                    <button
                      key={fila.canal}
                      type="button"
                      onClick={() => onElegirCanal(fila.canal)}
                      title={`${meta.label} · ${fila.pedidos} de ${fila.total} pedidos · corte ${meta.timeOff}`}
                      className="group flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-colors hover:bg-muted/70"
                    >
                      <span className="shrink-0" style={{ color: meta.color }}>
                        <CanalGlyph canal={fila.canal} size={15} />
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{meta.label}</span>

                      {/* La advertencia viaja PEGADA al canal que la tiene. En el resumen del panel se ve
                          que hay pedidos fuera de corte; acá se ve de quién son. */}
                      {fila.fuera > 0 && (
                        <span
                          className="flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-amber-600 dark:text-amber-400"
                          title={`${fila.fuera} pedido(s) de ${meta.label} fuera del corte de las ${meta.timeOff}`}
                        >
                          <AlertTriangle size={10} />
                          {fila.fuera}
                        </span>
                      )}

                      <span className="w-12 shrink-0 text-right tabular-nums">
                        {fila.pedidos}
                        {/* El denominador solo aparece cuando NO son todos: "24" y "24/24" dicen lo
                            mismo, pero el segundo obliga a leer dos números para descubrirlo. */}
                        {excluidos > 0 && (
                          <span className="text-[11px] text-muted-foreground">/{fila.total}</span>
                        )}
                      </span>
                      <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">
                        {fila.clientes}
                      </span>
                      <span className="w-20 shrink-0 text-right tabular-nums">
                        {fmtPeso.format(fila.pesoKg)} kg
                      </span>
                      <ChevronRight
                        size={14}
                        className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      />
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {filas.length > 0 && (
            <div className="flex items-center gap-2 border-t border-border px-2 pt-2 text-xs">
              <span className="min-w-0 flex-1 font-medium">Total</span>
              <span className="w-12 shrink-0 text-right font-semibold tabular-nums">
                {totalPedidos}
              </span>
              <span className="w-12 shrink-0" aria-hidden />
              <span className="w-20 shrink-0 text-right font-semibold tabular-nums">
                {fmtPeso.format(totalPeso)} kg
              </span>
              <span className="w-4 shrink-0" aria-hidden />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
