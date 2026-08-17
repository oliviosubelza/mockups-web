// Diálogo "Nueva ruta": crear una ruta VACÍA a mano, para después mandarle paradas.
//
// POR QUÉ EXISTE. El optimizador reparte entre los camiones que ya están en el plan, y ahí se acaba.
// Lo que faltaba es el movimiento inverso: mirar el reparto, decidir que esos ocho puntos del sur
// merecen su propio recorrido, y tener DÓNDE ponerlos. Sin esto la única salida era volver a Flota,
// sumar un camión y adivinar cuál de las rutas nuevas era la que acababas de crear.
//
// UNA RUTA = UN CAMIÓN, y por eso acá se elige un camión LIBRE.
// Se podría dejar crear dos rutas sobre el mismo camión (el mapa viejo lo hacía, con ids
// `-custom-<timestamp>`), pero entonces la ocupación miente: las dos rutas calculan su porcentaje
// contra la misma capacidad y cada una muestra 60% mientras el camión lleva 120%. Un mockup que
// muestra un número imposible enseña mal la pantalla.
//
// CONSECUENCIA: crear una ruta SUMA ese camión al plan (el mismo `dispatch-plan-store` que usa el
// panel de Flota). No hay una segunda lista de rutas por otro lado; lo único que agrega esta pantalla
// es el NOMBRE, que es justamente lo que Flota no deja poner.
import { useEffect, useMemo, useState } from 'react'
import { Search, Truck } from 'lucide-react'
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
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { Camion } from '../mock-data'

export function NuevaRutaDialog({
  abierto,
  onOpenChange,
  camionesLibres,
  nombreSugerido,
  onCrear,
}: {
  abierto: boolean
  onOpenChange: (v: boolean) => void
  /** Camiones disponibles que TODAVÍA no son una ruta del plan. */
  camionesLibres: Camion[]
  /** `Ruta N` con el número que sigue. Se puede pisar. */
  nombreSugerido: string
  onCrear: (camionId: string, nombre: string) => void
}) {
  const [nombre, setNombre] = useState(nombreSugerido)
  const [camionId, setCamionId] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')

  // Cada apertura arranca limpia: dejar el camión de la vez anterior elegido es la forma más fácil de
  // crear dos rutas sobre el mismo camión sin querer.
  useEffect(() => {
    if (!abierto) return
    setNombre(nombreSugerido)
    setCamionId(null)
    setBusqueda('')
  }, [abierto, nombreSugerido])

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    if (!texto) return camionesLibres
    return camionesLibres.filter(
      (c) =>
        c.placa.toLowerCase().includes(texto) ||
        c.tipo.toLowerCase().includes(texto) ||
        c.clase.toLowerCase().includes(texto),
    )
  }, [busqueda, camionesLibres])

  const camion = camionesLibres.find((c) => c.id === camionId) ?? null
  const puedeCrear = camion !== null && nombre.trim().length > 0

  const crear = () => {
    if (!camion || !puedeCrear) return
    onCrear(camion.id, nombre.trim())
  }

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Truck size={16} className="text-primary" />
            Nueva ruta
          </DialogTitle>
          <DialogDescription className="text-xs">
            Se crea vacía. Después le mandás paradas marcándolas en el mapa y usando “Mover a…”, o
            desde el menú de cada punto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="nueva-ruta-nombre" className="text-xs">
              Nombre
            </Label>
            <Input
              id="nueva-ruta-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ruta sur, Refuerzo mayoristas…"
              className="h-8 text-xs"
              // Enter crea si ya hay camión elegido: el orden natural es escribir el nombre después de
              // elegir el camión, y obligar a ir al botón con el mouse es un paso de más.
              onKeyDown={(e) => {
                if (e.key === 'Enter' && puedeCrear) crear()
              }}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <Label className="text-xs">Camión</Label>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {camionesLibres.length} libre{camionesLibres.length !== 1 ? 's' : ''}
              </span>
            </div>

            {camionesLibres.length === 0 ? (
              // Sin camiones libres no hay ruta posible, y decirlo acá es más honesto que una lista
              // vacía: el problema no es la búsqueda, es que la flota entera ya está en el plan.
              <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                Todos los camiones disponibles ya son una ruta de este plan.
              </p>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar por placa o tipo"
                    className="h-8 pl-7 text-xs"
                    aria-label="Buscar camión"
                  />
                </div>

                {/* La lista va ADENTRO del diálogo y no en un combobox: la capacidad de cada camión es
                    justamente el dato con el que se elige, y en un select cerrado no se compara. */}
                <div
                  role="radiogroup"
                  aria-label="Camión de la ruta"
                  className="max-h-56 overflow-y-auto rounded-md border border-border"
                >
                  {visibles.length === 0 ? (
                    <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                      Ningún camión coincide con la búsqueda.
                    </p>
                  ) : (
                    visibles.map((c) => {
                      const elegido = c.id === camionId
                      return (
                        <button
                          key={c.id}
                          type="button"
                          role="radio"
                          aria-checked={elegido}
                          onClick={() => setCamionId(c.id)}
                          title={`${c.placa} · ${c.tipo} · ${c.clase} · ${c.capacidadPeso} t / ${c.capacidadVolumen} m³`}
                          className={cn(
                            'flex h-8 w-full items-center gap-2 px-2 text-left text-xs transition-colors',
                            elegido ? 'bg-primary/10' : 'hover:bg-muted/70',
                          )}
                        >
                          {/* El color del camión es el que va a tener el trazo de la ruta: elegir el
                              camión y saber de qué color va a salir la ruta es el mismo gesto. */}
                          <span
                            className={cn(
                              'flex size-3.5 shrink-0 items-center justify-center rounded-sm border text-[8px] font-bold text-white',
                              elegido ? 'border-transparent' : 'border-border bg-background',
                            )}
                            style={elegido ? { background: c.color } : undefined}
                            aria-hidden
                          >
                            {elegido && '✓'}
                          </span>
                          <span className="w-[68px] shrink-0 truncate font-mono font-medium">
                            {c.placa}
                          </span>
                          <span
                            className={cn(
                              'flex size-4 shrink-0 items-center justify-center rounded text-[9px] font-bold',
                              c.tipo === 'Frío'
                                ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                                : 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
                            )}
                            aria-hidden
                          >
                            {c.tipo === 'Frío' ? 'F' : 'S'}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                            {c.clase}
                          </span>
                          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                            {c.capacidadPeso}t · {c.capacidadVolumen}m³
                          </span>
                        </button>
                      )
                    })
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={!puedeCrear}
            title={
              camionesLibres.length === 0
                ? 'No quedan camiones libres'
                : !camion
                  ? 'Elegí el camión de la ruta'
                  : nombre.trim() === ''
                    ? 'Poné un nombre'
                    : undefined
            }
            onClick={crear}
          >
            Crear ruta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
