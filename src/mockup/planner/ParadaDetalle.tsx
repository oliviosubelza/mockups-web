// Panel de detalle de una parada (derecha, flotante). Se abre al clickear un pin o una fila de las
// listas, y es donde se contesta la pregunta que el mapa no puede: qué hay adentro de ese punto.
//
// Muestra SOLO lo que el mockup tiene de verdad: los pedidos unificados en ese punto de entrega con su
// código, monto y peso. No hay ETA, ni distancia, ni tiempo de atención — esos datos no existen en
// esta etapa (recién aparecen en monitoreo, con el viaje andando), y ponerlos acá sería prometer una
// pantalla que después no se puede construir.
import { ImageIcon, PackageX, Truck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { CanalGlyph } from '../canal-glyph'
import { CANAL_META, tieneStockPorConfirmar, type Parada } from '../mock-data'
import { cargaDeRuta, type RutaPlan } from './planner-model'

const fmtPeso = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 })
const fmtMoneda = new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' })

/** Par etiqueta/valor: la etiqueta arriba en chico, el dato abajo con peso. */
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[10px] uppercase leading-none tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 truncate text-xs">{children}</span>
    </div>
  )
}

export function ParadaDetalle({
  parada,
  rutas,
  paradas = [],
  onCerrar,
  onMover,
  onVerFicha,
}: {
  parada: Parada
  rutas: RutaPlan[]
  paradas?: Parada[]
  onCerrar: () => void
  /** `null` la saca de su ruta y la devuelve al grupo "Sin asignar". */
  onMover: (rutaId: string | null) => void
  /** Abre la ficha del punto (el diálogo con la foto). */
  onVerFicha: () => void
}) {
  const meta = CANAL_META[parada.canal]
  const ruta = rutas.find((r) => r.id === parada.rutaId) ?? null
  const rutaCarga = ruta && paradas.length > 0 ? cargaDeRuta(paradas, ruta) : null
  const total = parada.pedidos.reduce((acc, p) => acc + p.total, 0)

  return (
    <>
      <div className="flex shrink-0 items-start gap-2 border-b border-border px-2.5 py-2">
        <span className="mt-0.5 shrink-0" style={{ color: meta.color }} title={meta.label}>
          <CanalGlyph canal={parada.canal} size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-tight">{parada.cliente}</span>
          <span className="block truncate text-[11px] leading-tight text-muted-foreground">
            {parada.puntoEntrega}
          </span>
        </span>
        {/* Atajo a la FOTO. Este panel llega por la lista, donde no hubo click en el mapa y por lo
            tanto nadie vio el lugar: sin este botón habría que buscar el marcador para poder mirarlo. */}
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={onVerFicha}
          title="Ver la ficha del punto (fotos y detalle)"
          aria-label="Ver la ficha del punto"
        >
          <ImageIcon size={15} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={onCerrar}
          title="Cerrar detalle"
          aria-label="Cerrar detalle"
        >
          <X size={15} />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 border-b border-border px-2.5 py-2">
          <Campo label="Ventana">
            <span className="tabular-nums">{parada.ventana}</span>
          </Campo>
          <Campo label="Peso">
            <span className="tabular-nums">{fmtPeso.format(parada.pesoTotal)} kg</span>
          </Campo>
          <Campo label="Volumen">
            <span className="tabular-nums">{fmtPeso.format(parada.volumenTotal)} m³</span>
          </Campo>
        </div>

        {/* Mover de ruta desde el detalle: es la corrección de UNA parada. La de muchas se hace
            marcándolas en el mapa (rectángulo/lazo) y usando la barra de abajo. */}
        <div className="space-y-1.5 border-b border-border px-2.5 py-2">
          <span className="text-[10px] uppercase leading-none tracking-wide text-muted-foreground">
            Ruta asignada
          </span>
          <Select
            value={parada.rutaId ?? 'sin-asignar'}
            onValueChange={(v) => onMover(v === 'sin-asignar' ? null : v)}
          >
            <SelectTrigger className="h-8 w-full text-xs">
              {/* Ver la nota del mismo control en `ParadaDialog`: sin children, el trigger mostraba el
                  id crudo de la ruta hasta que alguien abría el popup. */}
              <SelectValue>
                {ruta ? (
                  <span className="flex w-full items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: ruta.color }} />
                    <span className="min-w-0 flex-1 truncate">{ruta.nombre}</span>
                    <span className="shrink-0 font-mono text-muted-foreground">{ruta.camion.placa}</span>
                    {rutaCarga && (
                      <span
                        className={cn(
                          'shrink-0 text-right text-[11px] font-semibold tabular-nums',
                          rutaCarga.ocupacionPct >= 90 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
                        )}
                      >
                        {rutaCarga.ocupacionPct}%
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Sin asignar</span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sin-asignar">
                <span className="flex items-center gap-2 text-xs">
                  <PackageX size={12} className="text-muted-foreground" />
                  Sin asignar
                </span>
              </SelectItem>
              {rutas.map((r) => {
                const c = paradas.length > 0 ? cargaDeRuta(paradas, r) : null
                return (
                  <SelectItem key={r.id} value={r.id}>
                    <span className="flex w-full items-center gap-2 text-xs">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
                      <span className="min-w-0 flex-1 truncate">{r.nombre}</span>
                      <span className="shrink-0 font-mono text-muted-foreground">{r.camion.placa}</span>
                      {c && (
                        <span
                          className={cn(
                            'shrink-0 text-right text-[11px] font-semibold tabular-nums',
                            c.ocupacionPct >= 90 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
                          )}
                        >
                          {c.ocupacionPct}%
                        </span>
                      )}
                    </span>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
          {ruta && parada.secuencia > 0 && (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Truck size={11} />
              Parada #{parada.secuencia} del recorrido de {ruta.camion.placa}
            </p>
          )}
        </div>

        {/* Los pedidos que se unifican en este punto. Es el dato que justifica que la parada exista:
            el camión va UNA vez y descarga los cuatro. */}
        <div className="px-2.5 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] uppercase leading-none tracking-wide text-muted-foreground">
              Pedidos en este punto
            </span>
            <span className="text-[11px] font-medium tabular-nums">{fmtMoneda.format(total)}</span>
          </div>
          <div className="mt-1.5 space-y-1">
            {parada.pedidos.map((pedido) => {
              const porConfirmar = tieneStockPorConfirmar(pedido)
              return (
                <div
                  key={pedido.id}
                  className={cn(
                    'flex items-center gap-2 rounded-md border border-transparent bg-muted/40 px-2 py-1.5',
                    // Stock corto: el pedido entra igual, pero lo que suba al camión puede ser menos
                    // que el total. Es una advertencia, no un bloqueo — de ahí el ámbar y no el rojo.
                    porConfirmar && 'border-amber-500/40 bg-amber-500/5',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[11px] font-medium leading-tight">
                      {pedido.salesOrder}
                    </span>
                    <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                      {pedido.productType} · {pedido.paymentType}
                      {porConfirmar && ' · stock a confirmar'}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-[11px] leading-tight tabular-nums text-muted-foreground">
                    <span className="block font-medium text-foreground">
                      {fmtPeso.format(pedido.peso)} kg
                    </span>
                    {fmtMoneda.format(pedido.total)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
