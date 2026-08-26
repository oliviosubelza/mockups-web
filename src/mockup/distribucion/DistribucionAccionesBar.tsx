// Barra de ACCIONES de la distribuidora seleccionada, flotando abajo al centro del mapa.
//
// Mismo criterio que `zonas/ZonasAccionesBar`: las acciones caen sobre el eje horizontal por el que el
// mouse ya se mueve, y el panel izquierdo se queda con un solo papel —encontrar y elegir— en vez de
// crecer y encogerse por abajo cada vez que cambia la selección.
//
// LA ACCIÓN PRIMARIA CAMBIA DE NOMBRE SEGÚN EL ESTADO, y no es cosmético: «Dibujar zona» y «Editar zona»
// son dos trabajos distintos. El primero empieza de cero y el segundo ajusta vértices existentes; el
// botón es el mismo porque el destino es el mismo modo, pero llamarlo «Editar» cuando no hay nada
// dibujado haría buscar lo que se supone que hay que editar.
//
// Y CUANDO NO HAY ZONA, ACTIVAR Y ELIMINAR NO EXISTEN: no hay fila en `distribution_zones` sobre la que
// operar. Se esconden en vez de deshabilitarse porque su ausencia ya está explicada por el botón de al
// lado, que dice «Dibujar».
import { Building2, Crosshair, MapPin, Pencil, Power, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatearMetros } from '../map/geo/holgura'
import { areaKm2, formatearArea, perimetroM } from '../map/geo/medidas'
import type { LatLngTuple } from '../map/geo/polyline'

export function DistribucionAccionesBar({
  nombre,
  ciudad,
  puntos,
  zonaActiva,
  activa,
  onDibujar,
  onEditarDatos,
  onEncuadrar,
  onAlternarActiva,
  onEliminar,
  onCerrar,
}: {
  nombre: string
  ciudad: string
  /** Vértices de su zona. Vacío = todavía no tiene. */
  puntos: LatLngTuple[]
  /** `null` cuando la distribuidora no tiene zona. */
  zonaActiva: boolean | null
  /** La DISTRIBUIDORA está en circulación, aparte de su zona. */
  activa: boolean
  onDibujar: () => void
  /** Abre el formulario: nombre y ubicación del depósito. */
  onEditarDatos: () => void
  onEncuadrar: () => void
  onAlternarActiva: () => void
  onEliminar: () => void
  /** Quita la selección. Es la salida de este estado, y sin ella la barra no se podría cerrar. */
  onCerrar: () => void
}) {
  const conZona = puntos.length >= 3

  return (
    <div className="pointer-events-auto flex h-11 max-w-full items-center gap-1.5 overflow-hidden rounded-xl border border-border bg-card/95 px-2 shadow-xl backdrop-blur-sm">
      <Building2
        size={14}
        className={
          conZona && zonaActiva && activa
            ? 'ml-0.5 shrink-0 text-primary'
            : 'ml-0.5 shrink-0 text-muted-foreground'
        }
      />
      {/* El nombre se trunca y la ciudad se acorta antes que los botones: si la barra no entra en
          pantalla, lo que tiene que sobrevivir son las acciones. */}
      <span className="min-w-0 max-w-48 truncate text-xs font-semibold">{nombre}</span>
      <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">{ciudad}</span>
      {/* DOS BADGES PARA DOS ESTADOS DISTINTOS: la DISTRIBUIDORA de baja no despacha nada; su ZONA
          desactivada significa que sigue despachando pero sin asignación por polígono. */}
      {!activa ? (
        <Badge variant="outline" className="h-4 shrink-0 px-1 text-[10px]">
          De baja
        </Badge>
      ) : (
        conZona &&
        zonaActiva === false && (
          <Badge variant="outline" className="h-4 shrink-0 px-1 text-[10px]">
            Zona off
          </Badge>
        )
      )}

      {conZona && (
        <>
          <span className="mx-0.5 hidden h-5 w-px shrink-0 bg-border sm:block" aria-hidden />
          <span
            className="hidden shrink-0 items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground sm:flex"
            title="Superficie, perímetro y cantidad de vértices de la zona de distribución"
          >
            <span className="font-medium text-foreground">{formatearArea(areaKm2(puntos))}</span>
            <span aria-hidden>·</span>
            <span>{formatearMetros(perimetroM(puntos))}</span>
            <span aria-hidden>·</span>
            <span>{puntos.length} vért.</span>
          </span>
        </>
      )}

      <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />

      <Button size="sm" className="h-7 shrink-0 gap-1.5 px-2.5 text-xs" onClick={onDibujar}>
        <Pencil size={12} />
        {conZona ? 'Editar zona' : 'Dibujar zona'}
      </Button>
      {/* DOS EDICIONES SEPARADAS, y la distinción es real: «Editar zona» toca el POLÍGONO
          (`distribution_zones`) y «Datos» toca la DISTRIBUIDORA (`distributors` — nombre y ubicación del
          depósito). Son dos tablas, dos formularios y dos modos del mapa; un solo botón «Editar» dejaría
          adivinando qué se va a abrir. */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 gap-1.5 px-2 text-xs"
        onClick={onEditarDatos}
        title="Cambiar el nombre o mover el depósito"
      >
        <MapPin size={12} />
        Datos
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 gap-1.5 px-2 text-xs"
        onClick={onEncuadrar}
        disabled={!conZona}
        title={conZona ? 'Centrar el mapa en esta zona' : 'Esta distribuidora todavía no tiene zona'}
      >
        <Crosshair size={12} />
        Encuadrar
      </Button>
      {/* ACTIVAR/DESACTIVAR Y ELIMINAR APUNTAN A LA ZONA, no a la distribuidora, y por eso solo aparecen
          cuando hay zona: sin polígono no hay fila en `distribution_zones` sobre la que operar. Se
          esconden en vez de deshabilitarse porque su ausencia ya está explicada por el botón «Dibujar
          zona» de al lado. Dar de baja la distribuidora entera es otra cosa y se hace desde el
          formulario. */}
      {conZona && (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1.5 px-2 text-xs"
            onClick={onAlternarActiva}
            title={
              zonaActiva
                ? 'Sacar la ZONA de circulación: los pedidos de ese territorio dejan de asignarse por polígono'
                : 'Volver a poner la zona en circulación'
            }
          >
            <Power size={12} />
            {zonaActiva ? 'Desactivar zona' : 'Activar zona'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1.5 px-2 text-xs text-destructive hover:text-destructive"
            onClick={onEliminar}
            title="Borra el polígono. La distribuidora queda sin zona."
          >
            <Trash2 size={12} />
            Eliminar zona
          </Button>
        </>
      )}

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
