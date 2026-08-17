// Ficha del punto de entrega: se abre al clickear su marcador en el mapa.
//
// Contesta la pregunta que el mapa no puede: "¿a qué lugar estoy mandando el camión?". Por eso la FOTO
// va primero y a sangre — es lo que resuelve la duda; los números son la confirmación. Al revés habría
// que scrollear para llegar a lo que más se mira.
//
// QUÉ MEJORA SOBRE `PuntoEntregaDialog` (el de la planificación actual):
//   · Lee las rutas DEL PLAN que se está armando, no `RUTAS` del dataset global — en esta pantalla las
//     rutas se crean eligiendo camiones, así que las del dataset no tienen nada que ver.
//   · Se puede ACTUAR: el select de ruta mueve la parada desde acá. El diálogo viejo era de solo
//     lectura, y había que cerrarlo y buscar la parada en otro lado para moverla.
//   · Suma el MONTO de la parada a los agregados. Estaba solo por pedido, y "cuánto vale este punto"
//     es justamente lo que decide si vale la pena mandar un camión.
//   · Las filas de pedido ya no dicen "Pendiente": era un literal escrito a mano que no salía de ningún
//     campo. En su lugar va la forma de pago, que sí existe, y el aviso de stock a confirmar.
//
// Denso a propósito: es una consulta rápida sobre el mapa, no una ficha para leer de corrido.
import { Boxes, Clock, Coins, Crosshair, PackageX, Weight, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { CanalGlyph } from '../canal-glyph'
import { GaleriaPunto } from '../GaleriaPunto'
import { fotosDePunto, ilustracionDePunto } from '../mock-fotos'
import { CANAL_META, tieneStockPorConfirmar, type Parada } from '../mock-data'
import { cargaDeRuta, type RutaPlan } from './planner-model'

const fmtMoneda = new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' })
const fmtPeso = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 })

/** Agregado del punto: rótulo chico con ícono arriba, valor debajo. Sin caja — el aire lo da el gap. */
function Dato({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="flex items-center gap-1 text-[10px] uppercase leading-none tracking-wide text-muted-foreground">
        <Icon className="size-3 shrink-0" />
        {label}
      </span>
      <span className="truncate text-[13px] font-medium leading-tight tabular-nums">{children}</span>
    </div>
  )
}

export function ParadaDialog({
  parada,
  rutas,
  paradas = [],
  onCerrar,
  onMover,
  onCentrar,
}: {
  /** Parada a mostrar. `null` cierra el diálogo. */
  parada: Parada | null
  rutas: RutaPlan[]
  paradas?: Parada[]
  onCerrar: () => void
  /** `null` la saca de su ruta y la devuelve al grupo "Sin asignar". */
  onMover: (rutaId: string | null) => void
  onCentrar: () => void
}) {
  if (!parada) return null

  const meta = CANAL_META[parada.canal]
  const ruta = rutas.find((r) => r.id === parada.rutaId) ?? null
  const rutaCarga = ruta && paradas.length > 0 ? cargaDeRuta(paradas, ruta) : null
  const total = parada.pedidos.reduce((acc, p) => acc + p.total, 0)
  const fotos = fotosDePunto(parada.puntoEntregaId, parada.canal)
  const fallback = ilustracionDePunto(parada.puntoEntregaId)

  return (
    <Dialog open onOpenChange={(open) => !open && onCerrar()}>
      {/* `z-[1300]`: por encima de toda la escalera del mapa (Leaflet llega a 1000 y la barra de
          herramientas también). Con el z-50 por defecto el diálogo quedaba DEBAJO de la barra.
          `sm:max-w-md`: es una consulta sobre el mapa, no una pantalla — ancho de panel. */}
      <DialogContent
        className="z-[1300] flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        overlayClassName="z-[1300]"
      >
        {/* La galería va casi a sangre: una foto con margen alrededor se lee como thumbnail. */}
        <div className="shrink-0 p-3 pb-0">
          <GaleriaPunto fotos={fotos} fallback={fallback} epigrafe={parada.puntoEntrega} />
        </div>

        {/* Bloque FIJO: identidad, agregados y la acción. No scrollea — es lo que se consulta de un
            vistazo, y perderlo mientras se recorre la lista de pedidos sería perder el contexto. */}
        <div className="flex shrink-0 flex-col gap-3 p-3 pb-2">
          <DialogHeader className="gap-1">
            <DialogTitle className="flex items-center gap-1.5 pr-7 text-sm">
              <span className="shrink-0" style={{ color: meta.color }}>
                <CanalGlyph canal={parada.canal} size={15} />
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="min-w-0 truncate font-semibold">{parada.cliente}</span>
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {parada.puntoEntrega}
                </span>
              </span>
            </DialogTitle>
            {/* Las clases van en el propio `DialogDescription` (que es un <p>) y no en un div anidado:
                Base UI compone con `render`, no con `asChild`, y los Badge son <span>, así que
                anidarlos en el párrafo es HTML válido. */}
            <DialogDescription className="flex flex-wrap items-center gap-1">
              <Badge variant="outline">{meta.label}</Badge>
              <Badge variant="outline" className="font-mono">
                {parada.puntoEntregaId}
              </Badge>
              {ruta && (
                <Badge variant="outline">
                  {/* El color es DATO: el mismo con el que se pinta esta ruta en el mapa. */}
                  <span className="size-2 rounded-full" style={{ backgroundColor: ruta.color }} />
                  {ruta.nombre}
                  {parada.secuencia > 0 ? ` · Parada #${parada.secuencia}` : ''}
                  {rutaCarga && (
                    <span
                      className={cn(
                        'ml-1 font-semibold tabular-nums',
                        rutaCarga.ocupacionPct >= 90 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
                      )}
                    >
                      · {rutaCarga.ocupacionPct}%
                    </span>
                  )}
                </Badge>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Los CUATRO agregados que deciden, en una fila. El monto entra acá y no en la lista: es lo
              que dice si vale la pena mandar un camión a este punto. */}
          <div className="grid grid-cols-4 gap-x-3">
            <Dato icon={Clock} label="Ventana">
              {parada.ventana}
            </Dato>
            <Dato icon={Weight} label="Peso">
              {fmtPeso.format(parada.pesoTotal)} kg
            </Dato>
            <Dato icon={Boxes} label="Volumen">
              {fmtPeso.format(parada.volumenTotal)} m³
            </Dato>
            <Dato icon={Coins} label="Monto">
              {fmtMoneda.format(total)}
            </Dato>
          </div>

          {/* La ACCIÓN. Un diálogo que solo informa obliga a cerrarlo y buscar la parada en otro lado
              para hacer lo único que se quiere hacer después de mirarla: cambiarla de camión. */}
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[10px] uppercase leading-none tracking-wide text-muted-foreground">
              Ruta
            </span>
            <Select
              value={parada.rutaId ?? 'sin-asignar'}
              onValueChange={(v) => onMover(v === 'sin-asignar' ? null : v)}
            >
              <SelectTrigger className="h-8 min-w-0 flex-1 text-xs">
                {/* La etiqueta se renderiza ACÁ y no se deja al `SelectValue` vacío: los `SelectItem`
                    viven en el popup, que se monta recién al abrirlo, así que hasta entonces el value
                    no encuentra su ítem y el trigger mostraba el id crudo ("r-t3") en vez del nombre. */}
                <SelectValue>
                  {ruta ? (
                    <span className="flex w-full items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ background: ruta.color }}
                      />
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
              <SelectContent className="z-[1400]">
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
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ background: r.color }}
                        />
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
          </div>
        </div>

        <Separator />

        {/* Encabezado de la lista, TAMBIÉN fijo: el contador es la referencia de cuánto hay, así que no
            puede irse de pantalla apenas se scrollea. */}
        <div className="flex shrink-0 items-center justify-between gap-2 px-3 pb-1.5 pt-2 text-xs font-medium text-muted-foreground">
          <span>
            {parada.pedidos.length} pedido{parada.pedidos.length !== 1 ? 's' : ''} en este punto
          </span>
          <span className="text-[11px] font-normal">
            Se entregan todos en una sola visita
          </span>
        </div>

        {/* La ÚNICA región que scrollea es la lista: así el diálogo mide lo mismo con 1 pedido que con
            40, y la foto, los agregados y el select nunca se pierden de vista. */}
        {/* `max-h` y NO `flex-1`: con un solo pedido, un `min-h` dejaba 40 px de blanco entre la lista
            y el pie. Así el diálogo mide lo que mide su contenido y la lista scrollea recién cuando la
            parada tiene muchos pedidos. */}
        <ScrollArea className="max-h-[220px]">
          <div className="px-3 pb-3">
            <div className="divide-y overflow-hidden rounded-md border">
              {parada.pedidos.map((pedido) => {
                const porConfirmar = tieneStockPorConfirmar(pedido)
                return (
                  <div
                    key={pedido.id}
                    className={cn(
                      'flex items-center gap-2 px-2.5 py-1.5',
                      // Stock corto: el pedido entra igual, pero lo que suba al camión puede ser menos
                      // que el total. Es advertencia, no bloqueo — de ahí el ámbar y no el rojo.
                      porConfirmar && 'bg-amber-500/5',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-xs font-medium tabular-nums">
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
        </ScrollArea>

        {/* `m-0` anula el `-mx-4 -mb-4` que `DialogFooter` trae de fábrica: esos márgenes negativos
            existen para compensar el `p-4` por defecto del contenido, y acá el contenido es `p-0`. Sin
            anularlos el pie se salía 16 px del contenedor por tres lados y el `overflow-hidden` le
            cortaba los botones. */}
        <DialogFooter className="m-0 shrink-0 gap-2 border-t border-border p-2 sm:justify-between">
          {/* Cerrar y volver AL PUNTO: después de mirar la ficha lo que se quiere es seguir trabajando
              sobre ese lugar en el mapa, no quedar donde estaba la cámara antes de abrirla. */}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onCentrar}>
            <Crosshair size={13} />
            Centrar en el mapa
          </Button>
          <Button size="sm" onClick={onCerrar}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
