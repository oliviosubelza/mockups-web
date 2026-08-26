// Barra de ACCIONES de la restricción seleccionada, flotando abajo al centro del mapa.
//
// MISMO CRITERIO QUE `zonas/ZonasAccionesBar`, y por los mismos dos motivos: las acciones caen sobre el
// eje horizontal por el que el mouse ya se mueve (no a 320 px, en el pie del panel izquierdo), y el panel
// de la izquierda se queda con un solo papel —ENCONTRAR y ELEGIR— en vez de crecer y encogerse por abajo
// cada vez que cambia la selección.
//
// OCUPA EL LUGAR DE LA PISTA DE USO, no se suma a ella: la pista dice "click en una restricción la
// selecciona", que es justo lo que acabás de hacer.
//
// LO QUE ESTA BARRA MUESTRA Y LA DE ZONAS NO: el EFECTO y la vigencia. Una zona es un territorio y con el
// nombre alcanza para saber de qué se habla; una restricción es una regla, y su nombre ("Cierre Av.
// Cañoto") no dice si prohíbe pasar o solo entregar, ni si rige siempre o los domingos de 6 a 10. Sin
// esos dos datos habría que abrir el detalle para saber sobre qué se está operando, y entonces la barra
// no serviría para operar.
import { Crosshair, ExternalLink, Pencil, Power, Route, Square, Trash2, Truck, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatearMetros } from '../map/geo/holgura'
import { areaKm2, formatearArea, perimetroM } from '../map/geo/medidas'
import {
  RESTRICTION_EFFECT_META,
  RESTRICTION_TYPE_META,
  describeSchedules,
  describeVehicleRules,
  geometryToLatLng,
  type PlanningRestriction,
  type RestrictionType,
} from './domain'

const ICONO: Record<RestrictionType, typeof Square> = {
  RESTRICTED_AREA: Square,
  CLOSED_ROAD: Route,
  PLATE_ROTATION: Truck,
}

export function RestriccionesAccionesBar({
  restriccion,
  onEditar,
  onEncuadrar,
  onAlternarActiva,
  onEliminar,
  onVerDetalle,
  onCerrar,
}: {
  restriccion: PlanningRestriction
  onEditar: () => void
  onEncuadrar: () => void
  onAlternarActiva: () => void
  onEliminar: () => void
  /** Sale a `/restricciones/:id`: la auditoría completa (quién, cuándo, historial) no cabe en una barra. */
  onVerDetalle: () => void
  /** Quita la selección. Es la salida de este estado, y sin ella la barra no se podría cerrar. */
  onCerrar: () => void
}) {
  const Icono = ICONO[restriccion.restrictionType]
  const puntos = geometryToLatLng(restriccion.geometryGeoJson)
  const esArea = restriccion.restrictionType === 'RESTRICTED_AREA'
  const esVia = restriccion.restrictionType === 'CLOSED_ROAD'
  const sinGeometria = restriccion.geometryGeoJson === null

  return (
    <div className="pointer-events-auto flex h-11 max-w-full items-center gap-1.5 overflow-hidden rounded-xl border border-border bg-card/95 px-2 shadow-xl backdrop-blur-sm">
      <Icono
        size={14}
        className={cn(
          'ml-0.5 shrink-0',
          !restriccion.isActive
            ? 'text-muted-foreground'
            : restriccion.severity === 'BLOCKING'
              ? 'text-destructive'
              : 'text-amber-500',
        )}
      />
      {/* El nombre se trunca antes que los botones: si la barra no entra en pantalla, lo que tiene que
          sobrevivir son las acciones. */}
      <span className="min-w-0 max-w-44 truncate text-xs font-semibold">{restriccion.name}</span>
      <Badge
        variant={restriccion.severity === 'BLOCKING' ? 'destructive' : 'outline'}
        className="h-4 shrink-0 px-1 text-[10px]"
        title={RESTRICTION_TYPE_META[restriccion.restrictionType].label}
      >
        {RESTRICTION_EFFECT_META[restriccion.effect].label}
      </Badge>
      {!restriccion.isActive && (
        <Badge variant="outline" className="h-4 shrink-0 px-1 text-[10px]">
          Inactiva
        </Badge>
      )}

      {/* CUÁNTO ABARCA Y CUÁNDO RIGE, al lado del nombre y no en un tooltip. Se esconde con `hidden
          sm:flex`: si la barra no entra, lo que tiene que sobrevivir son las acciones. */}
      <span className="mx-0.5 hidden h-5 w-px shrink-0 bg-border sm:block" aria-hidden />
      <span className="hidden shrink-0 items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground sm:flex">
        {sinGeometria ? (
          <span className="not-italic">sin geometría</span>
        ) : esArea && puntos.length >= 3 ? (
          <>
            <span className="font-medium text-foreground">{formatearArea(areaKm2(puntos))}</span>
            <span aria-hidden>·</span>
            <span>{puntos.length} vért.</span>
          </>
        ) : esVia && puntos.length >= 2 ? (
          <>
            <span className="font-medium text-foreground">
              {formatearMetros(perimetroM(puntos, false))}
            </span>
            <span aria-hidden>·</span>
            <span>{puntos.length} pts</span>
          </>
        ) : (
          <span>geometría incompleta</span>
        )}
        <span aria-hidden>·</span>
        <span className="max-w-40 truncate" title="Vigencia y alcance de flota">
          {describeSchedules(restriccion)} · {describeVehicleRules(restriccion)}
        </span>
      </span>

      <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />

      {/* Editar es la acción PRIMARIA: es lo único que solo se puede hacer desde esta pantalla (activar y
          eliminar son cambios de estado que la tabla del catálogo también da). */}
      <Button size="sm" className="h-7 shrink-0 gap-1.5 px-2.5 text-xs" onClick={onEditar}>
        <Pencil size={12} />
        Editar
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 gap-1.5 px-2 text-xs"
        onClick={onEncuadrar}
        disabled={sinGeometria}
        title={
          sinGeometria
            ? 'La restricción por placa no tiene geometría que encuadrar'
            : 'Centrar el mapa en esta restricción'
        }
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
          restriccion.isActive
            ? 'Sacarla de circulación: deja de evaluarse en planes nuevos'
            : 'Volver a ponerla en circulación'
        }
      >
        <Power size={12} />
        {restriccion.isActive ? 'Desactivar' : 'Activar'}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 gap-1.5 px-2 text-xs"
        onClick={onVerDetalle}
        title="Abrir el detalle con la auditoría completa"
      >
        <ExternalLink size={12} />
        Detalle
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
