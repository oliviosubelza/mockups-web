// Detalle de un PUNTO DE ENTREGA, al hacer click en su pin del mapa (step de Planificación).
//
// Estructura pedida: galería tipo carrousel arriba, detalles abajo. El orden importa — la foto es lo
// que resuelve la pregunta del planificador ("¿a qué lugar estoy mandando el camión?") y los datos
// son la confirmación. Al revés habría que scrollear para ver lo que más se mira.
//
// Todo lo que muestra ya existía en el modelo (Parada + sus Pedidos + el camión/ruta asignados); lo
// único nuevo son las fotos, que son ilustraciones generadas (ver mock-fotos.ts).
import { useEffect, useState } from 'react'
import {
  Boxes,
  Clock,
  Hash,
  MapPin,
  Navigation,
  Package,
  Pin,
  Truck,
  Weight,
  type LucideIcon,
} from 'lucide-react'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '@/components/ui/carousel'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { CANAL_META, camionPorId, rutaPorCamionId, type Parada } from './mock-data'
import { CanalGlyph } from './canal-glyph'
import { fotosDePunto, ilustracionDePunto } from './mock-fotos'

const fmtMoneda = new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' })
const fmtPeso = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 })

/** Campo del bloque de detalles: ícono + rótulo chico y el valor debajo. */
function Campo({
  icon: Icon,
  label,
  children,
  className,
}: {
  icon: LucideIcon
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5', className)}>
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Icon className="size-3.5 shrink-0" />
        {label}
      </span>
      <span className="min-w-0 truncate text-sm">{children}</span>
    </div>
  )
}

/**
 * Galería del punto. El contador y los puntitos van juntos: los puntitos dicen "hay más" de un
 * vistazo, el contador dice cuántas exactamente cuando son varias. Con UNA sola foto no se dibujan
 * flechas ni indicadores — serían controles muertos.
 */
function Galeria({
  fotos,
  fallback,
  epigrafe,
}: {
  fotos: string[]
  /** Ilustración a usar si una foto no carga (sin red, CDN caído, export a Figma). */
  fallback: string
  epigrafe: string
}) {
  const [api, setApi] = useState<CarouselApi>()
  const [actual, setActual] = useState(0)

  useEffect(() => {
    if (!api) return
    const sync = () => setActual(api.selectedScrollSnap())
    sync()
    api.on('select', sync)
    return () => {
      api.off('select', sync)
    }
  }, [api])

  const varias = fotos.length > 1

  return (
    <Carousel setApi={setApi} className="relative overflow-hidden rounded-lg border border-border/60">
      <CarouselContent className="ml-0">
        {fotos.map((foto, i) => (
          <CarouselItem key={i} className="pl-0">
            {/* aspect-video: mismo encuadre para todas, así el diálogo no salta de alto al pasar.
                bg-muted evita el flash blanco mientras la foto del CDN todavía no llegó. */}
            <img
              src={foto}
              alt={`${epigrafe} — foto ${i + 1} de ${fotos.length}`}
              // La primera se carga ya (es la que se ve); las demás recién al pasar el carrousel.
              loading={i === 0 ? 'eager' : 'lazy'}
              onError={(e) => {
                // El guard es imprescindible: si el fallback también fallara, sin él el onError se
                // volvería a disparar sobre sí mismo en bucle.
                const img = e.currentTarget
                if (img.dataset.fallback === 'listo') return
                img.dataset.fallback = 'listo'
                img.src = fallback
              }}
              className="aspect-video w-full bg-muted object-cover"
            />
          </CarouselItem>
        ))}
      </CarouselContent>

      {/* Epígrafe sobre un degradado, no sobre la imagen pelada: garantiza contraste sin importar
          qué haya debajo. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-8">
        <span className="line-clamp-1 text-xs font-medium text-white">{epigrafe}</span>
      </div>

      {varias && (
        <>
          <CarouselPrevious className="left-2" />
          <CarouselNext className="right-2" />
          <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white tabular-nums">
            {actual + 1}/{fotos.length}
          </span>
          <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center gap-1.5">
            {fotos.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === actual ? 'w-4 bg-white' : 'w-1.5 bg-white/50',
                )}
              />
            ))}
          </div>
        </>
      )}
    </Carousel>
  )
}

export function PuntoEntregaDialog({
  parada,
  onClose,
}: {
  /** Parada a mostrar. `null` cierra el diálogo. */
  parada: Parada | null
  onClose: () => void
}) {
  if (!parada) return null

  const meta = CANAL_META[parada.canal]
  const camion = camionPorId(parada.camionId)
  const ruta = rutaPorCamionId(parada.camionId)
  const fotos = fotosDePunto(parada.puntoEntregaId, parada.canal)
  const fallback = ilustracionDePunto(parada.puntoEntregaId)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* z-[1300]: por encima de la escalera del mapa (Leaflet ≤1000 → MapToolbar 1000 → tarjetas
          1100 → scrim 1200). Con el z-50 por defecto el modal quedaba DEBAJO de la toolbar. */}
      <DialogContent
        className="z-[1300] flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        overlayClassName="z-[1300]"
      >
        {/* La galería va FUERA del área con padding y pegada al borde: una foto con margen alrededor
            se lee como thumbnail, a sangre se lee como galería. */}
        <div className="shrink-0 p-4 pb-0">
          <Galeria fotos={fotos} fallback={fallback} epigrafe={parada.puntoEntrega} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
          <DialogHeader className="gap-1">
            <DialogTitle className="flex items-center gap-2 pr-8">
              <span className="shrink-0" style={{ color: meta.color }}>
                <CanalGlyph canal={parada.canal} size={17} />
              </span>
              <span className="min-w-0 truncate">{parada.cliente}</span>
            </DialogTitle>
            <DialogDescription>
              {meta.label} · Punto {parada.puntoEntregaId}
              {ruta && (
                <>
                  {' · '}
                  <span
                    className="inline-block size-2 rounded-full align-middle"
                    style={{ backgroundColor: ruta.color }}
                  />{' '}
                  {ruta.nombre}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Campo icon={MapPin} label="Dirección" className="col-span-2 sm:col-span-3">
              {parada.puntoEntrega}
            </Campo>
            <Campo icon={Clock} label="Ventana de entrega">
              <span className="tabular-nums">{parada.ventana}</span>
            </Campo>
            <Campo icon={Weight} label="Peso total">
              <span className="tabular-nums">{fmtPeso.format(parada.pesoTotal)} kg</span>
            </Campo>
            <Campo icon={Boxes} label="Volumen total">
              <span className="tabular-nums">{parada.volumenTotal} m³</span>
            </Campo>
            <Campo icon={Truck} label="Camión">
              {camion ? (
                <span className="tabular-nums">
                  {camion.placa} · {camion.tipo}
                </span>
              ) : (
                <span className="text-muted-foreground">Sin asignar</span>
              )}
            </Campo>
            <Campo icon={Hash} label="Secuencia">
              <span className="tabular-nums">#{parada.secuencia}</span>
            </Campo>
            <Campo icon={Navigation} label="Coordenadas">
              <span className="tabular-nums text-xs">
                {parada.lat.toFixed(4)}, {parada.lng.toFixed(4)}
              </span>
            </Campo>
          </div>

          {/* Solo si está clavada: mostrar "no forzada" en todas sería ruido en la mayoría de casos. */}
          {parada.camionForzadoId && (
            <div className="flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-500">
              <Pin className="size-3.5 shrink-0" />
              Parada clavada a este camión a mano — la optimización no la va a mover.
            </div>
          )}

          {/* Los pedidos del punto. Es lo que hace útil el modal cuando la parada está UNIFICADA:
              varios pedidos que el camión descarga en una sola visita. */}
          <div className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <Package className="size-3.5" />
              {parada.pedidos.length} pedido{parada.pedidos.length !== 1 ? 's' : ''} en esta parada
            </span>
            <div className="divide-y divide-border/60 overflow-hidden rounded-md border border-border/60">
              {parada.pedidos.map((pedido) => (
                <div key={pedido.id} className="flex items-center gap-3 px-2.5 py-1.5 text-xs">
                  <span className="w-14 shrink-0 font-mono tabular-nums">{pedido.salesOrder}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {pedido.productType} · {pedido.paymentType} · {pedido.vendedor}
                  </span>
                  <span className="shrink-0 tabular-nums">{fmtPeso.format(pedido.peso)} kg</span>
                  <span className="w-20 shrink-0 text-right font-medium tabular-nums">
                    {fmtMoneda.format(pedido.total)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
