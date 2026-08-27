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
import { MapPin, Pencil, Trash2 } from 'lucide-react'
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

export interface CentroConfig {
  id: number
  nombre: string
  ciudad: string
  puntos: LatLngTuple[]
  /** `false` = tiene contorno pero está fuera de circulación. `null` = no tiene contorno. */
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
  onAlternarActiva: (id: number) => void
  onPorDefecto: (id: number, esDefecto: boolean) => void
  onEditarZona: (id: number) => void
  onEditarDatos: (id: number) => void
  onEliminarZona: (id: number) => void
}) {
  if (!centro) return null

  const tieneZona = centro.puntos.length >= 3
  const coberturaActiva = tieneZona && centro.zonaActiva === true && centro.activa

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
            {tieneZona ? ` · ${formatearArea(areaKm2(centro.puntos))} · ${centro.puntos.length} vértices` : ' · sin contorno'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Opcion
            titulo="Cobertura en circulación"
            descripcion={
              !tieneZona
                ? 'Sin contorno no hay asignación por territorio. Dibujalo para poder activarla.'
                : coberturaActiva
                  ? 'Los pedidos que caen dentro del contorno se despachan desde este centro.'
                  : 'El contorno está dibujado pero no se usa para asignar pedidos.'
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

          {/* Las tres que no son estados sino destinos. Van abajo y con el borrado separado. */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={cerrarY(() => onEditarZona(centro.id))}
            >
              <Pencil size={13} />
              {tieneZona ? 'Editar contorno' : 'Dibujar contorno'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={cerrarY(() => onEditarDatos(centro.id))}
            >
              <MapPin size={13} />
              Datos y ubicación
            </Button>
            {tieneZona && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto gap-1.5 text-destructive hover:text-destructive"
                onClick={cerrarY(() => onEliminarZona(centro.id))}
              >
                <Trash2 size={13} />
                Eliminar contorno
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
