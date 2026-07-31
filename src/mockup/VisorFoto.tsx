// Visor de una foto suelta: miniatura que abre un diálogo para verla en grande.
//
// Vive suelto (no dentro de monitoreo) porque la evidencia es un patrón que se repite: la foto del
// comprobante, la de la incidencia y mañana la del punto de entrega o la del conteo en rampa. Todas
// tienen el mismo problema — una miniatura de 100 px no sirve para MIRAR nada, y abrir la URL en otra
// pestaña saca al usuario de la pantalla que estaba vigilando.
//
// POR QUÉ NO ES UN LIGHTBOX A PANTALLA COMPLETA.
// La foto casi nunca se mira sola: se mira contra el resto del caso ("¿esta caja rota es de esta
// parada?"). Un visor a sangre negra tapa todo el contexto y obliga a cerrarlo para volver a leer. El
// diálogo mide lo que la foto necesita y nada más, y lleva EPÍGRAFE: sin él, una foto de una caja es
// una caja de cualquier parte.
import { useState } from 'react'
import { Camera, Maximize2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/**
 * Fallback compartido cuando la imagen no resuelve (sin red, CDN caído, URL vencida).
 *
 * El guard con `dataset` es imprescindible: si el fallback también fallara, sin él el `onError` se
 * dispararía sobre sí mismo en bucle.
 */
function alFallar(fallback: string | undefined) {
  return (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    if (!fallback || img.dataset.fallback === 'listo') return
    img.dataset.fallback = 'listo'
    img.src = fallback
  }
}

export function VisorFoto({
  src,
  abierta,
  onCerrar,
  titulo,
  epigrafe,
  datos,
  fallback,
}: {
  src: string
  abierta: boolean
  onCerrar: () => void
  titulo: string
  /** Una línea que dice QUÉ es la foto. Sin esto, una caja rota podría ser de cualquier parada. */
  epigrafe?: string
  /** Pares dato/valor bajo la foto: hora, GPS, dispositivo. Lo que hace que la foto sea evidencia. */
  datos?: { label: string; valor: string }[]
  fallback?: string
}) {
  return (
    <Dialog open={abierta} onOpenChange={(open) => !open && onCerrar()}>
      {/*
        `z-[1400]`: por encima de todo lo que puede estar debajo, incluido el diálogo del punto de
        entrega (`z-[1300]`), desde el que este visor se puede abrir.
        `sm:max-w-lg`: es una consulta, no una pantalla. Ancho de panel, no de monitor.
      */}
      <DialogContent
        className="z-[1400] flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        overlayClassName="z-[1400]"
      >
        {/* La foto va a sangre y arriba: es lo que el usuario vino a ver, y con margen alrededor se
            volvería a leer como miniatura. `object-contain` y no `cover`: recortar una evidencia es
            justamente lo que no se puede hacer. */}
        <div className="flex min-h-0 flex-1 items-center justify-center bg-muted/40">
          <img
            src={src}
            alt={epigrafe ?? titulo}
            onError={alFallar(fallback)}
            className="max-h-[58vh] w-full object-contain"
          />
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-border p-3">
          <DialogHeader className="gap-0.5">
            <DialogTitle className="pr-7 text-sm">{titulo}</DialogTitle>
            {epigrafe && <DialogDescription className="text-xs">{epigrafe}</DialogDescription>}
          </DialogHeader>

          {datos && datos.length > 0 && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {datos.map((d) => (
                <span key={d.label} className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{d.label}</span>
                  <span className="text-xs tabular-nums">{d.valor}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Miniatura que abre el visor al hacer click. Es la forma en que esto se usa el 100% de las veces, así
 * que se empaqueta junta: el consumidor pone una `<FotoAmpliable>` y no maneja estado de diálogo.
 *
 * El botón anuncia que se puede ampliar con un ícono al pasar el mouse. Sin esa señal, una foto
 * clickeable es una foto que nadie clickea — y el trabajo de subirla se desperdicia.
 */
export function FotoAmpliable({
  src,
  titulo,
  epigrafe,
  datos,
  fallback,
  alto = 'h-28',
  className,
}: {
  src: string
  titulo: string
  epigrafe?: string
  datos?: { label: string; valor: string }[]
  fallback?: string
  /** Clase de alto de la miniatura. El visor no la usa: ahí manda la foto. */
  alto?: string
  className?: string
}) {
  const [abierta, setAbierta] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        title="Ampliar la foto"
        className={cn(
          'group relative w-full overflow-hidden rounded-md border border-border bg-muted',
          'transition-[border-color,box-shadow] hover:border-primary/50 hover:shadow-sm',
          alto,
          className,
        )}
      >
        <img
          src={src}
          alt={epigrafe ?? titulo}
          loading="lazy"
          onError={alFallar(fallback)}
          className="size-full object-cover"
        />
        {/* El indicador aparece al hover y NO ocupa espacio: en una lista de evidencias, un ícono
            fijo por foto es ruido repetido catorce veces. */}
        <span
          className={cn(
            'pointer-events-none absolute right-1.5 top-1.5 flex size-6 items-center justify-center',
            'rounded-md bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100',
          )}
          aria-hidden
        >
          <Maximize2 className="size-3" />
        </span>
      </button>

      <VisorFoto
        src={src}
        abierta={abierta}
        onCerrar={() => setAbierta(false)}
        titulo={titulo}
        epigrafe={epigrafe}
        datos={datos}
        fallback={fallback}
      />
    </>
  )
}

/** Marcador de "acá iba una foto y no hay". Explica la ausencia en vez de dejar un hueco. */
export function SinFoto({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted-foreground">
      <Camera className="size-3.5 shrink-0" />
      {children}
    </p>
  )
}
