// Barra de ACCIONES de la distribuidora seleccionada, flotando abajo al centro del mapa.
//
// Mismo criterio que `zonas/ZonasAccionesBar`: las acciones caen sobre el eje horizontal por el que el
// mouse ya se mueve, y el panel izquierdo se queda con un solo papel —encontrar y elegir— en vez de
// crecer y encogerse por abajo cada vez que cambia la selección.
//
// LA ACCIÓN PRIMARIA CAMBIA DE NOMBRE SEGÚN EL ESTADO, y no es cosmético: «Dibujar contorno» y «Editar
// contorno» son dos trabajos distintos. El primero empieza de cero y el segundo ajusta vértices
// existentes; el botón es el mismo porque el destino es el mismo modo, pero llamarlo «Editar» cuando no
// hay nada dibujado haría buscar lo que se supone que hay que editar.
//
// TRES BOTONES Y NO SEIS. Acá había además «Datos», «Activar/Desactivar» y «Eliminar contorno»: las
// mismas tres que ahora viven en el diálogo de configuración, que es donde se explican. Repetirlas en
// una barra de 44 px las dejaba sin contexto —un botón «Activar» no dice qué activa— y hacía que la
// barra creciera hasta empujar el nombre del centro fuera de pantalla. Queda lo que se hace SOBRE EL
// MAPA (dibujar, encuadrar) más la puerta a todo lo demás.
import { Building2, Crosshair, Pencil, Plus, Settings2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatearMetros } from '../map/geo/holgura'
import { areaKm2, formatearArea, perimetroM } from '../map/geo/medidas'
import type { LatLngTuple } from '../map/geo/polyline'

export function DistribucionAccionesBar({
  nombre,
  ciudad,
  anillos,
  zonaActiva,
  activa,
  onDibujar,
  onEditar,
  onEncuadrar,
  onConfigurar,
  onCerrar,
}: {
  nombre: string
  ciudad: string
  /** Los contornos de la distribuidora, uno por zona viva. Vacío = todavía no dibujó ninguno. */
  anillos: LatLngTuple[][]
  /** `null` cuando la distribuidora no tiene ningún contorno. */
  zonaActiva: boolean | null
  /** La DISTRIBUIDORA está en circulación, aparte de su zona. */
  activa: boolean
  /** Dibuja un contorno NUEVO para esta distribuidora. */
  onDibujar: () => void
  /**
   * Edita un contorno existente. Con uno solo entra derecho; con varios abre el diálogo, que es el
   * único lugar donde se puede elegir CUÁL.
   */
  onEditar: () => void
  onEncuadrar: () => void
  /** Abre el diálogo de configuración: cobertura, predeterminado, datos y borrado del contorno. */
  onConfigurar: () => void
  /** Quita la selección. Es la salida de este estado, y sin ella la barra no se podría cerrar. */
  onCerrar: () => void
}) {
  const conZona = anillos.length > 0
  // Las medidas de la barra son las del TERRITORIO, o sea la suma de sus contornos: son pedazos
  // distintos del mapa, no versiones del mismo.
  const areaTotal = anillos.reduce((suma, a) => suma + areaKm2(a), 0)
  const perimetroTotal = anillos.reduce((suma, a) => suma + perimetroM(a), 0)
  const vertices = anillos.reduce((suma, a) => suma + a.length, 0)

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
            title="Superficie, perímetro y vértices del territorio: la suma de todos sus contornos"
          >
            <span className="font-medium text-foreground">{formatearArea(areaTotal)}</span>
            <span aria-hidden>·</span>
            <span>{formatearMetros(perimetroTotal)}</span>
            <span aria-hidden>·</span>
            <span>{vertices} vért.</span>
            {anillos.length > 1 && (
              <>
                <span aria-hidden>·</span>
                <span>{anillos.length} contornos</span>
              </>
            )}
          </span>
        </>
      )}

      <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />

      {/* La acción PRIMARIA va con el `Button` por defecto y no con un verde propio: el primario del
          tema ya es "esto es lo que viniste a hacer", y pintarlo a mano hace que esta barra no se
          parezca a la de zonas logísticas, que es su gemela. */}
      {/* ── DIBUJAR vs EDITAR, y por qué son DOS botones ────────────────────────────────────────
          Con un contorno por distribuidora alcanzaba con uno solo que cambiaba de nombre. Con varios,
          «Editar contorno» dejó de identificar algo y «Dibujar otro» escondía la acción más frecuente
          —corregir el que ya está— detrás de un diálogo.

          Sin contornos hay un solo botón, porque no hay nada que editar. */}
      {conZona ? (
        <>
          <Button size="sm" className="h-7 shrink-0 gap-1.5 px-2.5 text-xs" onClick={onEditar}>
            <Pencil size={12} />
            Editar contorno
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 shrink-0 gap-1.5 px-2 text-xs"
            onClick={onDibujar}
            title="Dibujar otro territorio para este centro"
          >
            <Plus size={12} />
            Agregar
          </Button>
        </>
      ) : (
        <Button size="sm" className="h-7 shrink-0 gap-1.5 px-2.5 text-xs" onClick={onDibujar}>
          <Pencil size={12} />
          Dibujar contorno
        </Button>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 gap-1.5 px-2 text-xs"
        onClick={onEncuadrar}
        disabled={!conZona}
        title={conZona ? 'Centrar el mapa en este centro' : 'Este centro todavía no tiene contorno'}
      >
        <Crosshair size={12} />
        Encuadrar
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 gap-1.5 px-2 text-xs"
        onClick={onConfigurar}
        title="Cobertura, centro predeterminado, datos del depósito"
      >
        <Settings2 size={12} />
        Configurar
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
