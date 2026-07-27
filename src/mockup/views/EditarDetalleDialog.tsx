import { useEffect, useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { OrdenEstadoBadge } from '../estado-badge'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import type { EstadoOrden } from '../mock-data'
import { Truck, User, ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react'

/** Color de la barra de carga según ocupación del camión. */
const cargaColor = (pct: number) =>
  pct >= 90 ? 'bg-destructive' : pct >= 75 ? 'bg-amber-500' : 'bg-primary'

/** Campo etiquetado del detalle: label muted con ícono + el control/valor debajo. */
function InfoField({
  label,
  icon: Icon,
  children,
  className,
}: {
  label: string
  icon: LucideIcon
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-col gap-1.5${className ? ` ${className}` : ''}`}>
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </span>
      {children}
    </div>
  )
}

export interface ParadaDetalle {
  id: string
  secuencia: number
  cliente: string
  direccion: string
  ventana: string
  prioridad?: 'Alta' | 'Normal'
}

export interface EditarDetalleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  codigo?: string
  estado?: EstadoOrden
  paradas: ParadaDetalle[]
  choferes: readonly string[]
  choferValue: string | null
  onChoferChange: (chofer: string) => void
  /**
   * Placas ELEGIBLES para esta orden, ya filtradas por la vista (capacidad >= peso de la orden) y en
   * el orden en que se quieren mostrar. El diálogo no filtra: qué camión sirve es lógica de dominio
   * (truck.capacity_weight vs. el peso de los pedidos), y vive en la vista que conoce el dataset.
   */
  camiones: readonly string[]
  camionValue: string | null
  onCamionChange: (placa: string) => void
  /**
   * Capacidad en kg de una placa (truck.capacity_weight). Se recibe como función en vez de pasar los
   * camiones como objetos porque el Combobox de Base UI filtra solo si los `items` son strings planos:
   * así "buscar camión" queda igual de simple que "buscar chofer", sin itemToStringLabel ni objetos.
   */
  capacidadPorCamion: (placa: string) => number
  /** Peso total de la orden en kg (suma de los pedidos de sus paradas). */
  pesoOrdenKg?: number
  onGuardar?: () => void
}

const ENTREGAS_PER_PAGE = 10

export function EditarDetalleDialog({
  open,
  onOpenChange,
  codigo,
  estado,
  paradas,
  choferes,
  choferValue,
  onChoferChange,
  camiones,
  camionValue,
  onCamionChange,
  capacidadPorCamion,
  pesoOrdenKg,
  onGuardar,
}: EditarDetalleDialogProps) {
  // Estado para la paginación de la tablita interna de paradas
  const [entregasPage, setEntregasPage] = useState(1)

  // Reiniciar la página a 1 cada vez que se abre otra orden.
  useEffect(() => {
    setEntregasPage(1)
  }, [open, codigo])

  const totalPages = Math.max(1, Math.ceil(paradas.length / ENTREGAS_PER_PAGE))
  const paginatedEntregas = paradas.slice(
    (entregasPage - 1) * ENTREGAS_PER_PAGE,
    entregasPage * ENTREGAS_PER_PAGE
  )

  const guardar = onGuardar ?? (() => onOpenChange(false))

  // Carga del camión SELECCIONADO: se calcula acá con peso/capacidad reales en vez de recibir un
  // porcentaje ya cocinado. Motivo concreto: los consumidores no coinciden en qué es el "% de carga"
  // (en OrdenesTransporteView el peso se deriva de las paradas, mientras que OrdenDespacho.cargaPct
  // guarda KILOS a pesar del nombre), así que un pct recibido no era comparable entre vistas y hacía
  // que la barra se dibujara con anchos absurdos. Derivándolo, al elegir un camión más grande baja.
  const capacidadKg = camionValue ? capacidadPorCamion(camionValue) : 0
  const pesoKg = pesoOrdenKg ?? 0
  const cargaPct = capacidadKg > 0 ? Math.round((pesoKg / capacidadKg) * 100) : 0
  // La barra nunca pasa del 100% de ancho, pero el número sí muestra el exceso real (>100% = excede).
  const cargaBarraPct = Math.min(100, cargaPct)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
          <div className="flex items-start gap-3 pr-8">
            <div className="min-w-0 flex-1">
              <DialogTitle className="flex items-center gap-2 text-base">
                Orden de Transporte
                <span className="font-mono text-sm text-muted-foreground">{codigo}</span>
              </DialogTitle>
              <DialogDescription>Editá el chofer y el camión asignados</DialogDescription>
            </div>
            {estado && <OrdenEstadoBadge estado={estado} />}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* Datos editables de la orden: chofer (route.driver) y camión (planning_truck → truck). */}
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <InfoField label="Chofer" icon={User}>
              <Combobox
                items={choferes}
                value={choferValue}
                onValueChange={(v) => onChoferChange(v ?? '')}
              >
                <ComboboxInput placeholder="Buscar por nombre o código SAP…" showClear />
                <ComboboxContent>
                  <ComboboxEmpty>Sin resultados</ComboboxEmpty>
                  <ComboboxList>
                    {(item: string) => (
                      <ComboboxItem key={item} value={item}>
                        {item}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </InfoField>

            <InfoField label="Camión" icon={Truck}>
              {/* Misma mecánica que chofer: items de strings planos (placas) → el filtrado nativo del
                  Combobox matchea tipeando la placa, sin configurar nada. */}
              <Combobox
                items={camiones}
                value={camionValue}
                onValueChange={(v) => onCamionChange(v ?? '')}
              >
                <ComboboxInput placeholder="Buscar por placa…" showClear />
                <ComboboxContent>
                  <ComboboxEmpty>Sin resultados</ComboboxEmpty>
                  <ComboboxList>
                    {(item: string) => (
                      <ComboboxItem key={item} value={item}>
                        <span className="font-medium">{item}</span>
                        {/* Capacidad como texto secundario: el usuario elige con criterio sin tener
                            que abrir la ficha del camión. */}
                        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                          {capacidadPorCamion(item).toLocaleString('es')} kg
                        </span>
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              {/* Carga del camión ELEGIDO: peso de la orden contra su capacidad, visibles los dos para
                  que la comparación se entienda al cambiar de camión. */}
              <div className="flex items-center gap-2 px-1">
                <span className="h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
                  <span
                    className={`block h-full rounded-full ${cargaColor(cargaPct)}`}
                    style={{ width: `${cargaBarraPct}%` }}
                  />
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">{cargaPct}%</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  · {pesoKg.toLocaleString('es')} kg de {capacidadKg.toLocaleString('es')} kg
                </span>
              </div>
            </InfoField>
          </div>

          {/* Paradas de la ruta. */}
          <div className="mt-6">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-medium">Paradas</span>
              <span className="text-sm text-muted-foreground tabular-nums">({paradas.length})</span>
            </div>
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="max-h-[300px] overflow-auto">
                <table className="w-full border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="w-10 px-3 py-2 text-center font-medium">#</th>
                      <th className="px-3 py-2 text-left font-medium">Cliente</th>
                      <th className="hidden px-3 py-2 text-left font-medium sm:table-cell">Dirección</th>
                      <th className="px-3 py-2 text-left font-medium">Horario</th>
                      <th className="px-3 py-2 text-center font-medium">Prioridad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedEntregas.map((entrega) => (
                      <tr key={entrega.id} className="border-t border-border transition-colors hover:bg-muted/30">
                        <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">
                          {entrega.secuencia}
                        </td>
                        <td className="max-w-[200px] truncate px-3 py-2 font-medium">{entrega.cliente}</td>
                        <td className="hidden max-w-[220px] truncate px-3 py-2 text-muted-foreground sm:table-cell">
                          {entrega.direccion}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{entrega.ventana}</td>
                        <td className="px-3 py-2 text-center">
                          <Badge variant={(entrega.prioridad ?? 'Normal') === 'Alta' ? 'destructive' : 'secondary'}>
                            {entrega.prioridad ?? 'Normal'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Paginación de paradas. */}
            <div className="mt-2 flex items-center justify-between px-1">
              <span className="text-xs text-muted-foreground">
                Mostrando {(entregasPage - 1) * ENTREGAS_PER_PAGE + 1}–
                {Math.min(entregasPage * ENTREGAS_PER_PAGE, paradas.length)} de {paradas.length}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="h-7 w-7"
                  onClick={() => setEntregasPage((p) => Math.max(1, p - 1))}
                  disabled={entregasPage === 1}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="px-2 text-xs font-medium tabular-nums">
                  {entregasPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="h-7 w-7"
                  onClick={() => setEntregasPage((p) => Math.min(totalPages, p + 1))}
                  disabled={entregasPage === totalPages}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border px-5 py-5">
          <DialogClose render={<Button variant="outline">Cancelar</Button>} />
          <Button onClick={guardar}>Guardar cambios</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
