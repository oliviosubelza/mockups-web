// Barra de ACCIONES de la zona seleccionada, flotando abajo al centro del mapa.
//
// DE DÓNDE VIENE. Estas cuatro acciones vivían en el PIE del panel izquierdo. Ahí tenían dos problemas,
// y el segundo es el que las movió:
//   1. estaban a 300 px de la zona sobre la que operaban: seleccionabas un polígono en el centro del
//      mapa y los botones aparecían pegados al borde izquierdo de la pantalla, así que cada acción era
//      un viaje del mouse de ida y de vuelta;
//   2. mezclaban dos papeles en el mismo panel. El listado sirve para ENCONTRAR y ELEGIR; borrar,
//      desactivar o editar el contorno es OPERAR sobre lo elegido. Con las dos cosas juntas, el panel
//      crecía y se encogía por abajo cada vez que cambiaba la selección, y el pie tapaba las últimas
//      filas de la lista justo cuando estabas comparando zonas.
//
// AHORA EL PANEL IZQUIERDO SOLO SELECCIONA, y las acciones aparecen acá: cerca del mapa, en el eje
// horizontal por el que se mueve el mouse, y en el mismo lugar venga la selección del listado o de un
// click en el polígono. Es la barra contextual de cualquier editor (la de Figma al seleccionar un
// objeto, la de Google Maps al elegir un lugar).
//
// OCUPA EL LUGAR DE LA PISTA DE USO, no se suma a ella: la pista dice "click en una zona la selecciona",
// que es justamente lo que ya pasó. Apilar las dos sería repetir la instrucción que acabás de cumplir.
//
// SE VE COMO LA BARRA DE ARRIBA (rounded-xl, alto 44, botones chicos) y no como la píldora de la pista
// (rounded-full, texto): son controles, no un mensaje. La forma tiene que decir "esto se clickea".
import { Crosshair, MapPin, Pencil, Power, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CIUDAD_META, ciudadDeCityId } from '../mock-data'
import type { Zona } from '../zones-store'

export function ZonasAccionesBar({
  zona,
  onEditar,
  onEncuadrar,
  onAlternarActiva,
  onEliminar,
  onCerrar,
}: {
  zona: Zona
  onEditar: () => void
  onEncuadrar: () => void
  onAlternarActiva: () => void
  onEliminar: () => void
  /** Quita la selección. Es la salida de este estado, y sin ella la barra no se podría cerrar. */
  onCerrar: () => void
}) {
  const ciudad = ciudadDeCityId(zona.cityId)

  return (
    <div className="pointer-events-auto flex h-11 max-w-full items-center gap-1.5 overflow-hidden rounded-xl border border-border bg-card/95 px-2 shadow-xl backdrop-blur-sm">
      <MapPin size={14} className="ml-0.5 shrink-0 text-primary" />
      {/* El nombre se trunca y la ciudad se acorta antes que los botones: si la barra no entra en
          pantalla, lo que tiene que sobrevivir son las acciones. */}
      <span className="min-w-0 max-w-48 truncate text-xs font-semibold">{zona.name}</span>
      <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">
        {ciudad ? CIUDAD_META[ciudad].label : `city ${zona.cityId}`}
      </span>
      {!zona.isActive && (
        <Badge variant="outline" className="h-4 shrink-0 px-1 text-[10px]">
          Inactiva
        </Badge>
      )}

      <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />

      {/* Editar contorno es la acción PRIMARIA de una zona: es lo único que solo se puede hacer desde
          esta pantalla (activar y eliminar son cambios de estado que cualquier tabla podría dar). */}
      <Button size="sm" className="h-7 shrink-0 gap-1.5 px-2.5 text-xs" onClick={onEditar}>
        <Pencil size={12} />
        Editar contorno
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 gap-1.5 px-2 text-xs"
        onClick={onEncuadrar}
        title="Centrar el mapa en esta zona"
      >
        <Crosshair size={12} />
        Encuadrar
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 gap-1.5 px-2 text-xs"
        onClick={onAlternarActiva}
        title={
          zona.isActive
            ? 'Sacarla de circulación: deja de usarse en planes nuevos'
            : 'Volver a ponerla en circulación'
        }
      >
        <Power size={12} />
        {zona.isActive ? 'Desactivar' : 'Activar'}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 gap-1.5 px-2 text-xs text-destructive hover:text-destructive"
        onClick={onEliminar}
      >
        <Trash2 size={12} />
        Eliminar
      </Button>

      <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0 text-muted-foreground"
        onClick={onCerrar}
        title="Quitar la selección"
      >
        <X size={13} />
      </Button>
    </div>
  )
}
