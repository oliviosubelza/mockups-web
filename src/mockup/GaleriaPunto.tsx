// Galería de fotos de un punto de entrega: carrousel 16:9 con epígrafe.
//
// Vive suelto porque lo usan DOS diálogos —el del mapa de planificación actual y el de la propuesta— y
// porque lo que tiene adentro no es decoración: son dos workarounds de Embla que nadie querría volver a
// descubrir por su cuenta (ver el bloque de abajo).
import { useCallback, useEffect, useState } from 'react'
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
export function GaleriaPunto({
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
          {/* Arriba a la IZQUIERDA: el botón de cerrar del diálogo vive en `top-2.5 right-2.5` con
              z-50, así que un contador en la esquina derecha queda tapado por él. */}
          <Badge variant="secondary" className="absolute left-1.5 top-1.5 tabular-nums">
            {actual + 1}/{fotos.length}
          </Badge>
        </>
      )}
    </Carousel>
  )
}
