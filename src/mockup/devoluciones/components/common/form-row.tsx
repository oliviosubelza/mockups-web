// Una fila de formulario: etiqueta a la izquierda, campo a la derecha.
//
// SUBIÓ ACÁ DESDE EL FORMULARIO DE MOTIVOS cuando apareció el segundo formulario del módulo (los
// parámetros de motivo). Dos copias serían dos lugares donde arreglar el mismo salto de línea, y las
// dos pantallas reemplazan al mismo sistema, así que tienen que verse igual.
//
// La etiqueta va alineada a la derecha y pegada al campo, como en el sistema viejo: el ojo baja por
// el borde de los campos y las etiquetas quedan del lado de lo que nombran. En una pantalla angosta
// la grilla se cae a una sola columna (`sm:`), así que la etiqueta se pone arriba y nada se aprieta.
import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'

export function FormRow({
  label,
  htmlFor,
  requerido,
  ayuda,
  children,
}: {
  label: string
  htmlFor?: string
  requerido?: boolean
  ayuda?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[minmax(0,160px)_minmax(0,1fr)] sm:items-baseline sm:gap-x-4">
      <Label htmlFor={htmlFor} className="pt-1.5 text-xs font-semibold sm:justify-end sm:text-right">
        {label}
        {requerido && <span className="text-destructive">*</span>}
      </Label>
      <div className="min-w-0 space-y-1">
        {children}
        {ayuda && <p className="text-[11px] leading-snug text-muted-foreground">{ayuda}</p>}
      </div>
    </div>
  )
}
