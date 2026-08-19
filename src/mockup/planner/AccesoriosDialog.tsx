// Bandeo de una ruta: qué se lleva el camión que NO es mercadería y tiene que volver.
//
// POR QUÉ SE CARGA ACÁ Y NO AL DESPACHAR. El pallet no aparece en el playón: se decide cuando se
// decide la ruta, porque depende de qué lleva y a quién. Si el dato se pidiera recién al cargar el
// camión, el que carga no tendría con qué comparar y "salió con 12" sería lo que él mismo escribió —
// que es exactamente el control que no existe hoy.
//
// UNA FILA POR TIPO, SIEMPRE TODAS. La lista no crece a medida que se agregan: los cuatro tipos están
// desde el principio en cero. Con cuatro filas, un botón "agregar accesorio" + selector sería un paso
// de más para llegar al mismo lado, y esconder los tipos disponibles detrás de un menú hace que nadie
// se entere de que existen.
import { useState } from 'react'
import { Boxes, Minus, Plus, X } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  TIPOS_ACCESORIO,
  pesoAccesoriosKg,
  resumenAccesorios,
  volumenAccesoriosM3,
  type AccesorioRuta,
  type TipoAccesorio,
} from '../accesorios'

const fmt = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 2 })

/** Fila de un tipo que se cuenta por cantidad: menos / número / más. */
function FilaCantidad({
  tipo,
  cantidad,
  onCambiar,
}: {
  tipo: TipoAccesorio
  cantidad: number
  onCambiar: (n: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        className="size-7 shrink-0"
        // Sin esto, mantener apretado en 0 dejaría el botón "vivo" sin efecto visible: apagarlo dice
        // que ya se llegó al piso.
        disabled={cantidad === 0}
        onClick={() => onCambiar(cantidad - 1)}
        aria-label={`Quitar un ${tipo.nombre.toLowerCase()}`}
      >
        <Minus size={12} />
      </Button>
      {/* Escribible además de los botones: pasar de 0 a 24 a botonazos son 24 clicks. */}
      <Input
        value={cantidad}
        onChange={(e) => onCambiar(Number(e.target.value.replace(/\D/g, '')) || 0)}
        inputMode="numeric"
        className="h-7 w-14 text-center text-xs tabular-nums"
        aria-label={`Cantidad de ${tipo.plural.toLowerCase()}`}
      />
      <Button
        variant="outline"
        size="icon"
        className="size-7 shrink-0"
        onClick={() => onCambiar(cantidad + 1)}
        aria-label={`Sumar un ${tipo.nombre.toLowerCase()}`}
      >
        <Plus size={12} />
      </Button>
    </div>
  )
}

/**
 * Fila de un tipo con trazabilidad por SERIE: se agregan códigos, no cantidades.
 *
 * La cantidad no se escribe — sale de cuántos códigos hay. Un campo de cantidad al lado de la lista
 * de códigos serían dos fuentes para el mismo número, y la primera vez que no coincidan (porque
 * alguien escribió 3 y cargó 2 códigos) nadie va a saber cuál de las dos es la verdad.
 */
function FilaSeries({
  tipo,
  series,
  onCambiar,
}: {
  tipo: TipoAccesorio
  series: string[]
  onCambiar: (series: string[]) => void
}) {
  const [texto, setTexto] = useState('')

  const agregar = () => {
    const codigo = texto.trim().toUpperCase()
    // Duplicado ignorado en silencio: el mismo activo no puede ir dos veces en el mismo camión, y un
    // cartel de error para algo que se resuelve no agregándolo es ruido.
    if (!codigo || series.includes(codigo)) return setTexto('')
    onCambiar([...series, codigo])
    setTexto('')
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            // El diálogo escucha Enter para confirmar: sin frenarlo acá, agregar un código cerraría
            // la ventana en el mismo gesto.
            e.preventDefault()
            agregar()
          }}
          placeholder="Código SAP"
          className="h-7 w-32 text-xs"
          aria-label={`Código de ${tipo.nombre.toLowerCase()}`}
        />
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={agregar}>
          Agregar
        </Button>
      </div>
      {series.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1">
          {series.map((codigo) => (
            <Badge
              key={codigo}
              variant="outline"
              className="gap-1 rounded-full py-0 pl-2 pr-1 font-mono text-[10px]"
            >
              {codigo}
              <button
                type="button"
                onClick={() => onCambiar(series.filter((s) => s !== codigo))}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Sacar ${codigo}`}
              >
                <X size={9} />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

export function AccesoriosDialog({
  abierto,
  rutaNombre,
  placa,
  items,
  onCerrar,
  onCambiar,
}: {
  abierto: boolean
  rutaNombre: string
  placa: string
  items: AccesorioRuta[]
  onCerrar: () => void
  /** `cantidad` manda en los tipos por cantidad; `series` en los de serie. El store normaliza. */
  onCambiar: (tipoId: string, cantidad: number, series?: string[]) => void
}) {
  const buscar = (tipoId: string) => items.find((item) => item.tipoId === tipoId)
  const resumen = resumenAccesorios(items)

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes size={16} className="text-muted-foreground" />
            Accesorios de {rutaNombre}
          </DialogTitle>
          <DialogDescription>
            Lo que sale con <span className="font-mono">{placa}</span> y no es mercadería. Al cerrar el
            viaje se cuenta de vuelta y la diferencia queda registrada como faltante.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col divide-y divide-border">
          {TIPOS_ACCESORIO.map((tipo) => {
            const item = buscar(tipo.id)
            const cantidad = item?.salida ?? 0
            return (
              <div key={tipo.id} className="flex items-center justify-between gap-4 py-2.5">
                <div className="min-w-0">
                  <p
                    className={cn(
                      'text-xs font-medium',
                      cantidad === 0 && 'text-muted-foreground',
                    )}
                  >
                    {tipo.plural}
                    {tipo.origen === 'sap' && (
                      <Badge
                        variant="outline"
                        className="ml-1.5 rounded-full px-1.5 py-0 text-[9px] font-semibold"
                      >
                        SAP
                      </Badge>
                    )}
                  </p>
                  {tipo.nota && (
                    <p className="text-[10px] leading-snug text-muted-foreground">{tipo.nota}</p>
                  )}
                </div>
                {tipo.trazabilidad === 'serie' ? (
                  <FilaSeries
                    tipo={tipo}
                    series={item?.series ?? []}
                    onCambiar={(series) => onCambiar(tipo.id, series.length, series)}
                  />
                ) : (
                  <FilaCantidad
                    tipo={tipo}
                    cantidad={cantidad}
                    onCambiar={(n) => onCambiar(tipo.id, n)}
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* Peso y volumen del bandeo, INFORMATIVOS. Se muestran porque son la mitad de la discusión
            —"¿me entran 20 pallets encima de la carga?"— pero no entran todavía en la ocupación de la
            ruta: encender eso cambia el número que decide si un camión sale, y esa decisión no está
            tomada. Decirlo acá es más honesto que sumarlo callado o que no mostrarlo. */}
        {resumen && (
          <p className="rounded-md border border-border bg-muted/40 px-2.5 py-2 text-[11px] leading-snug">
            <span className="font-medium">{resumen}</span>
            <span className="text-muted-foreground">
              {' '}
              — {fmt.format(pesoAccesoriosKg(items))} kg y {fmt.format(volumenAccesoriosM3(items))} m³
              estimados, que hoy NO se descuentan de la capacidad del camión.
            </span>
          </p>
        )}

        <DialogFooter>
          <Button onClick={onCerrar}>Listo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
