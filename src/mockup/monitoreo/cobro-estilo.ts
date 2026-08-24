// Vocabulario visual del COBRO. Vive acá y no dentro de un panel por la misma razón que
// `monitoreo-estado`: el detalle de la parada, la tabla del viaje y cualquier vista que venga después
// tienen que llamar "Esperando al banco" a lo mismo y pintarlo del mismo ámbar. Con las constantes
// dentro de un componente, la segunda vista que las necesita las copia y a la primera corrección las
// dos pantallas se separan.
//
// Ojo: el cobro NO tiene tabla propia todavía. `delivery_payment_references` guarda los pagos, pero el
// ESTADO agregado de la entrega (cobrado / parcial / en proceso / pendiente) es derivado y hoy lo
// calcula el frontend. Ver `CobroEntrega` en `monitoreo-data`.
import { Banknote, Building2, FileText, QrCode } from 'lucide-react'
import type { CobroEntrega, MetodoPago } from './monitoreo-data'

export const ESTADO_COBRO: Record<CobroEntrega['estado'], { label: string; badge: string }> = {
  cobrado: {
    label: 'Cobrado',
    badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  parcial: {
    label: 'Cobro parcial',
    badge: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  en_proceso: {
    label: 'Esperando al banco',
    badge: 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400',
  },
  pendiente: { label: 'Sin cobrar', badge: 'border-destructive/30 bg-destructive/10 text-destructive' },
  no_corresponde: { label: 'No corresponde', badge: 'border-border bg-muted text-muted-foreground' },
}

/** Los cuatro métodos de la app del chofer. Mismos nombres y mismos íconos que el mockup móvil. */
export const METODO_PAGO: Record<MetodoPago, { label: string; icono: typeof Banknote }> = {
  efectivo: { label: 'Efectivo', icono: Banknote },
  transferencia: { label: 'Transferencia', icono: Building2 },
  qr: { label: 'Pago QR', icono: QrCode },
  cheque: { label: 'Cheque', icono: FileText },
}

/** Bs con separador de miles y dos decimales. La moneda va en la etiqueta, no en cada número. */
export const bs = (n: number) =>
  n.toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
