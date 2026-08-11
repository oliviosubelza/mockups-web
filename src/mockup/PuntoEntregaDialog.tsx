// Detalle de un PUNTO DE ENTREGA, al hacer click en su pin del mapa (step de Planificación).
//
// Estructura pedida: galería tipo carrousel arriba, detalles abajo. El orden importa — la foto es lo
// que resuelve la pregunta del planificador ("¿a qué lugar estoy mandando el camión?") y los datos
// son la confirmación. Al revés habría que scrollear para ver lo que más se mira.
//
// Se compone con los componentes de `components/ui`, pero eligiendo el primitivo por lo que ES cada
// cosa: `Field` para los pares rótulo/valor (no dibuja caja), `Badge` para los chips, y
// `AspectRatio`, `ScrollArea` y `Carousel` para la estructura. Los datos NO van en `Item`:
// `Item` es una fila de lista con borde y relleno, y usarlo por dato convierte el grid en una rejilla
// de cajas — pesado y con el doble de aire del necesario. Un par rótulo/valor es tipografía.
//
// Denso a propósito: es un panel de consulta rápida sobre el mapa, no una ficha para leer de corrido.
import { useCallback, useEffect, useState } from 'react'
import {
  Boxes,
  Clock,
  Hash,
  MapPin,
  Navigation,
  Package,
  Truck,
  Weight,
  type LucideIcon,
} from 'lucide-react'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import { Badge } from '@/components/ui/badge'
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
import { Field, FieldDescription, FieldTitle } from '@/components/ui/field'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { CANAL_META, camionPorId, rutaPorCamionId, type Parada } from './mock-data'
import { CanalGlyph } from './canal-glyph'
import { fotosDePunto, ilustracionDePunto } from './mock-fotos'

const fmtMoneda = new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' })
const fmtPeso = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 })

/**
 * Un dato del punto: rótulo chico arriba, valor debajo. `Field` con `gap-0` — el primitivo de pares
 * rótulo/valor del sistema, que aporta la semántica (role="group") sin dibujar ninguna caja.
 */
function Dato({
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
    // `gap-0` pisa el `gap-2` de Field por tailwind-merge: el rótulo va pegado a su valor, si no el
    // par se lee como dos cosas sueltas.
    <Field className={cn('gap-0', className)}>
      <FieldDescription className="flex items-center gap-1 text-[11px] leading-tight">
        <Icon className="size-3 shrink-0" />
        {label}
      </FieldDescription>
      <FieldTitle className="truncate text-[13px] leading-tight tabular-nums">{children}</FieldTitle>
    </Field>
  )
}

/**
 * Galería del punto.
 *
 * `loop` NO es un capricho de UX: `CarouselPrevious`/`CarouselNext` se deshabilitan solos con
 * `canScrollPrev`/`canScrollNext`, y esos flags los calcula Embla midiendo los slides AL MONTAR.
 * Dentro de un diálogo que entra con `zoom-in-95` la medida inicial no es la final, Embla concluye
 * que hay un solo slide y los dos botones quedan inertes para siempre. Con `loop` siempre se puede
 * ir a la anterior y a la siguiente, así que dejan de depender de esa medición.
 *
 * El `reInit` al cargar cada foto arregla la otra mitad: aunque los botones respondan, con anchos
 * mal medidos el scroll no cae en el slide correcto.
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

  // Re-medir cuando el diálogo terminó de animar: el primer render mide el popup en escala.
  useEffect(() => {
    if (!api) return
    const t = setTimeout(() => api.reInit(), 180)
    return () => clearTimeout(t)
  }, [api])

  const remedir = useCallback(() => api?.reInit(), [api])

  return (
    <Carousel setApi={setApi} opts={{ loop: true }} className="overflow-hidden rounded-md border">
      <CarouselContent className="ml-0">
        {fotos.map((foto, i) => (
          <CarouselItem key={i} className="pl-0">
            {/* AspectRatio y no una clase suelta: mismo encuadre para todas, así el diálogo no salta
                de alto al pasar de una foto a otra. */}
            <AspectRatio ratio={16 / 9} className="bg-muted">
              <img
                src={foto}
                alt={`${epigrafe} — foto ${i + 1} de ${fotos.length}`}
                // La primera se carga ya (es la que se ve); las demás al pasar el carrousel.
                loading={i === 0 ? 'eager' : 'lazy'}
                onLoad={remedir}
                onError={(e) => {
                  // El guard es imprescindible: si el fallback también fallara, sin él el onError se
                  // dispararía sobre sí mismo en bucle.
                  const img = e.currentTarget
                  if (img.dataset.fallback === 'listo') return
                  img.dataset.fallback = 'listo'
                  img.src = fallback
                }}
                className="size-full object-cover"
              />
            </AspectRatio>
          </CarouselItem>
        ))}
      </CarouselContent>

      {/* Epígrafe sobre un degradado, no sobre la imagen pelada: garantiza contraste sin importar qué
          haya debajo. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-1.5 pt-6">
        <span className="line-clamp-1 text-[11px] font-medium text-white">{epigrafe}</span>
      </div>

      {/* Con una sola foto no se dibujan controles: serían botones muertos. */}
      {fotos.length > 1 && (
        <>
          <CarouselPrevious className="left-1.5 size-7" />
          <CarouselNext className="right-1.5 size-7" />
          <Badge variant="secondary" className="absolute right-1.5 top-1.5 tabular-nums">
            {actual + 1}/{fotos.length}
          </Badge>
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
          1100 → scrim 1200). Con el z-50 por defecto el modal quedaba DEBAJO de la toolbar.
          max-w-md: es una consulta rápida sobre el mapa, no una pantalla — ancho de panel. */}
      <DialogContent
        className="z-[1300] flex max-h-[82vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        overlayClassName="z-[1300]"
      >
        {/* La galería va pegada al borde: una foto con margen alrededor se lee como thumbnail, a
            sangre se lee como galería. */}
        <div className="shrink-0 p-3 pb-0">
          <Galeria fotos={fotos} fallback={fallback} epigrafe={parada.puntoEntrega} />
        </div>

        {/* Bloque FIJO: identidad y agregados del punto. No scrollea — es lo que se consulta de un
            vistazo, y perderlo mientras se recorre la lista de pedidos sería perder el contexto. */}
        <div className="flex shrink-0 flex-col gap-3 p-3 pb-2">
          <DialogHeader className="gap-1">
            <DialogTitle className="flex items-center gap-1.5 pr-7 text-sm">
              <span className="shrink-0" style={{ color: meta.color }}>
                <CanalGlyph canal={parada.canal} size={15} />
              </span>
              <div className="flex flex-col min-w-0 leading-tight">
                <span className="min-w-0 truncate font-semibold">{parada.cliente}</span>
                {parada.puntoEntrega && (
                  <span className="truncate text-xs font-normal text-muted-foreground">
                    {parada.puntoEntrega}
                  </span>
                )}
              </div>
            </DialogTitle>
            {/* Las clases van en el propio DialogDescription (que es un <p>) y no en un div
                anidado: base-ui compone con `render`, no con `asChild`, y los Badge son <span>,
                así que anidarlos en el párrafo es HTML válido. */}
            <DialogDescription className="flex flex-wrap items-center gap-1">
              <Badge variant="outline">{meta.label}</Badge>
              <Badge variant="outline" className="font-mono">
                {parada.puntoEntregaId}
              </Badge>
              {ruta && (
                <Badge variant="outline">
                  {/* El color es DATO: es el mismo con el que se pinta la ruta en el mapa. */}
                  <span className="size-2 rounded-full" style={{ backgroundColor: ruta.color }} />
                  {ruta.nombre}
                </Badge>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Grid denso de datos: sin cajas ni separadores, el aire lo da el gap. */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            <Dato icon={MapPin} label="Dirección" className="col-span-2">
              {parada.puntoEntrega}
            </Dato>
            <Dato icon={Clock} label="Ventana">
              {parada.ventana}
            </Dato>
            <Dato icon={Truck} label="Camión">
              {camion ? `${camion.placa} · ${camion.tipo}` : 'Sin asignar'}
            </Dato>
            <Dato icon={Weight} label="Peso total">
              {fmtPeso.format(parada.pesoTotal)} kg
            </Dato>
            <Dato icon={Boxes} label="Volumen total">
              {parada.volumenTotal} m³
            </Dato>
            <Dato icon={Hash} label="Secuencia">
              #{parada.secuencia}
            </Dato>
            <Dato icon={Navigation} label="Coordenadas">
              {parada.lat.toFixed(4)}, {parada.lng.toFixed(4)}
            </Dato>
          </div>

          {/*
            Aviso de "parada clavada" (camionForzadoId): RETIRADO a pedido — no aporta al flujo.
            Si alguna vez hace falta, va acá dentro del bloque fijo y hay que reponer los imports de
            `Alert`, `AlertDescription` y el ícono `Pin`, que se sacaron por quedar sin uso.
          */}
        </div>

        <Separator />

        {/* Encabezado de la lista, TAMBIÉN fijo: el contador es la referencia de cuánto hay, así que
            no puede irse de pantalla apenas se scrollea. */}
        <div className="flex shrink-0 items-center gap-1.5 px-3 pb-1.5 pt-2 text-xs font-medium text-muted-foreground">
          <Package className="size-3.5" />
          {parada.pedidos.length} pedido{parada.pedidos.length !== 1 ? 's' : ''} en esta parada
        </div>

        {/*
          La ÚNICA región que scrollea es la lista. Antes scrolleaba todo el cuerpo, y eso tenía dos
          problemas al crecer la cantidad de pedidos: el alto del modal dependía de N (impredecible), y
          al bajar se perdían de vista la foto, los totales y el propio contador.
          Con la lista acotada, el modal mide lo mismo con 1 pedido que con 40.

          NO se pasó a dos columnas (lista al costado) a propósito: el 94% de las paradas tiene 1 o 2
          pedidos, así que una columna dedicada estaría vacía casi siempre y obligaría a un modal
          ancho que taparía el mapa que se está consultando.

          Si algún día una parada tuviera cientos de pedidos, la respuesta NO es agrandar este modal
          hasta volverlo una grilla: es mandar al listado de pedidos filtrado por este punto de
          entrega. Un modal que se convierte en tabla es una tabla mal ubicada.
        */}
        <ScrollArea className="min-h-[84px] flex-1">
          <div className="px-3 pb-3">
            {/* UN borde para toda la lista y filas divididas, en vez de una caja por fila: se lee
                como tabla compacta y no como pila de tarjetas. */}
            <ItemGroup className="gap-0 divide-y overflow-hidden rounded-md border">
              {parada.pedidos.map((pedido) => (
                <Item key={pedido.id} size="xs" className="rounded-none">
                  <ItemContent className="gap-0">
                    <ItemTitle className="font-mono text-xs tabular-nums">
                      {pedido.salesOrder}
                    </ItemTitle>
                    <ItemDescription className="text-[11px] leading-tight">
                      {pedido.productType} · {pedido.paymentType} · {pedido.vendedor}
                    </ItemDescription>
                  </ItemContent>
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                    {fmtPeso.format(pedido.peso)} kg
                  </span>
                  <span className="shrink-0 text-xs font-medium tabular-nums">
                    {fmtMoneda.format(pedido.total)}
                  </span>
                </Item>
              ))}
            </ItemGroup>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
