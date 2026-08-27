// CONFIGURACIÓN de un centro de distribución, en un diálogo.
//
// ═══ POR QUÉ UN DIÁLOGO Y NO UN MENÚ ═══
//
// Acá había un `DropdownMenu` colgado del botón de tres puntos: seis ítems con verbos, uno debajo del
// otro. Funcionaba para DISPARAR acciones, pero no para lo que la mayoría de esos ítems eran en
// realidad —dos INTERRUPTORES (la cobertura y el predeterminado)—. Un interruptor en un menú se lee
// como un botón: hay que abrir el menú para saber en qué estado está, el ítem dice «Poner en
// circulación» o «Sacar de circulación» según el caso, y elegirlo cierra el menú, así que el efecto
// nunca se ve. Y la decisión de predeterminado necesita contexto que en una línea de menú no entra:
// a quién se le está sacando la bandera.
//
// El diálogo muestra los dos estados a la vez, con su explicación, y deja hacer varios cambios antes
// de cerrar. Las tres acciones que sí son acciones —dibujar, datos, eliminar— quedan abajo.
//
// ═══ LOS SWITCHES SE APLICAN AL INSTANTE ═══
//
// No hay «Guardar»: cada uno escribe al store apenas se toca, igual que el switch de la lista. Un
// diálogo de configuración con botón de confirmar obligaría a un draft y a un descarte, y acá no hay
// nada que validar — son dos banderas.
//
// ═══ LAS TRES ACCIONES CIERRAN ═══
//
// Dibujar el contorno y editar los datos cambian el MODO de la pantalla (mapa a sangre, panel
// izquierdo con el formulario): dejar el diálogo abierto encima taparía justo lo que se va a tocar.
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { formatearArea, areaKm2 } from '../map/geo/medidas'
import type { LatLngTuple } from '../map/geo/polyline'

/** Un contorno de la distribuidora. Con varias zonas vivas, la fila del store deja de ser una sola. */
export interface ContornoDelCentro {
  zonaId: number
  puntos: LatLngTuple[]
  activa: boolean
}

export interface CentroConfig {
  id: number
  nombre: string
  ciudad: string
  contornos: ContornoDelCentro[]
  /** `false` = tiene contornos pero TODOS fuera de circulación. `null` = no tiene ninguno. */
  zonaActiva: boolean | null
  /** La DISTRIBUIDORA está en circulación (`distributors.is_active`). */
  activa: boolean
  esPorDefecto: boolean
  /** Nombre del predeterminado de la ciudad cuando NO es este, o `null` si no hay ninguno. */
  predeterminadoActual: string | null
}

/** Una fila `interruptor + explicación`. La explicación no es opcional: es lo que el menú no tenía. */
function Opcion({
  titulo,
  descripcion,
  checked,
  disabled,
  onCheckedChange,
}: {
  titulo: string
  descripcion: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (valor: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{titulo}</p>
        <p className="text-xs leading-snug text-muted-foreground">{descripcion}</p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        className="mt-0.5 shrink-0"
        aria-label={titulo}
      />
    </div>
  )
}

export function CentroConfigDialog({
  centro,
  onOpenChange,
  onAlternarActiva,
  onPorDefecto,
  onEditarZona,
  onEditarDatos,
  onEliminarZona,
}: {
  /** El centro a configurar. `null` cierra el diálogo — es el estado abierto/cerrado y el dato en uno. */
  centro: CentroConfig | null
  onOpenChange: (abierto: boolean) => void
  /** Prende o apaga la cobertura de TODOS los contornos del centro a la vez. */
  onAlternarActiva: (id: number) => void
  onPorDefecto: (id: number, esDefecto: boolean) => void
  /** `zonaId` = editar ese contorno. `null` = dibujar uno NUEVO para este centro. */
  onEditarZona: (id: number, zonaId: number | null) => void
  onEditarDatos: (id: number) => void
  onEliminarZona: (zonaId: number) => void
}) {
  if (!centro) return null

  const tieneZona = centro.contornos.length > 0
  const coberturaActiva = tieneZona && centro.zonaActiva === true && centro.activa
  const areaTotal = centro.contornos.reduce((suma, c) => suma + areaKm2(c.puntos), 0)

  /** Cierra y después ejecuta: la acción cambia el modo de la pantalla detrás del diálogo. */
  const cerrarY = (accion: () => void) => () => {
    onOpenChange(false)
    accion()
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(480px,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle className="truncate">{centro.nombre}</DialogTitle>
          <DialogDescription>
            {centro.ciudad}
            {tieneZona
              ? ` · ${centro.contornos.length} contorno${centro.contornos.length === 1 ? '' : 's'} · ${formatearArea(areaTotal)}`
              : ' · sin contorno'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Opcion
            titulo="Cobertura en circulación"
            descripcion={
              !tieneZona
                ? 'Sin contorno no hay asignación por territorio. Dibujá uno para poder activarla.'
                : coberturaActiva
                  ? 'Los pedidos que caen dentro de sus contornos se despachan desde este centro.'
                  : 'Los contornos están dibujados pero no se usan para asignar pedidos.'
            }
            checked={coberturaActiva}
            disabled={!tieneZona}
            onCheckedChange={() => onAlternarActiva(centro.id)}
          />

          <Separator />

          <Opcion
            titulo="Centro predeterminado"
            descripcion={
              centro.esPorDefecto
                ? 'Recibe los pedidos que no caen dentro de ningún contorno de la ciudad.'
                : centro.predeterminadoActual
                  ? `Hoy lo es ${centro.predeterminadoActual}. Activarlo acá se lo quita: la ciudad tiene uno solo.`
                  : 'Nadie lo es en esta ciudad: los pedidos fuera de todo contorno quedan sin despachante.'
            }
            checked={centro.esPorDefecto}
            onCheckedChange={(valor) => onPorDefecto(centro.id, valor)}
          />

          <Separator />

          {/* ── LOS CONTORNOS, UNO POR FILA ──────────────────────────────────────────────────────
              Acá había un solo botón «Editar contorno», porque había un solo contorno. Con varios, el
              diálogo tiene que decir CUÁLES son y dejar operar sobre cada uno: editar el segundo no es
              lo mismo que editar el primero, y borrar «el contorno» dejó de identificar algo.

              Se listan con su superficie porque es lo único que los distingue a simple vista — no
              tienen nombre, y ponerles uno sería inventar una columna que la tabla no tiene. */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium">
                {tieneZona
                  ? `${centro.contornos.length} contorno${centro.contornos.length === 1 ? '' : 's'}`
                  : 'Sin contornos'}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={cerrarY(() => onEditarZona(centro.id, null))}
              >
                <Plus size={13} />
                Dibujar otro
              </Button>
            </div>

            {tieneZona ? (
              <ul className="space-y-0.5">
                {centro.contornos.map((contorno, i) => (
                  <li
                    key={contorno.zonaId}
                    className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs"
                  >
                    <span className="w-5 shrink-0 tabular-nums text-muted-foreground">#{i + 1}</span>
                    <span className="min-w-0 flex-1 tabular-nums">
                      {formatearArea(areaKm2(contorno.puntos))}
                      <span className="ml-1.5 text-[11px] text-muted-foreground">
                        {contorno.puntos.length} vért.
                      </span>
                    </span>
                    {!contorno.activa && (
                      <Badge variant="outline" className="h-4 shrink-0 px-1 text-[10px]">
                        Off
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0 text-muted-foreground"
                      title="Editar este contorno"
                      onClick={cerrarY(() => onEditarZona(centro.id, contorno.zonaId))}
                    >
                      <Pencil size={12} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                      title="Eliminar este contorno"
                      onClick={cerrarY(() => onEliminarZona(contorno.zonaId))}
                    >
                      <Trash2 size={12} />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] leading-snug text-muted-foreground">
                Este centro recibe los pedidos que traen su sello. Dibujale un contorno para acotarlo a
                un territorio.
              </p>
            )}
          </div>

          <Separator />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={cerrarY(() => onEditarDatos(centro.id))}
            >
              <MapPin size={13} />
              Datos y ubicación
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
