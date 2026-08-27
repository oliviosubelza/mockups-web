// El panel que informa si lo dibujado SIRVE, abajo a la derecha del mapa de restricciones.
//
// Es el equivalente de `zonas/ZonasConflictosPanel` y ocupa el mismo píxel por las mismas razones: es la
// única esquina libre —el listado toma toda la izquierda, la barra de arriba el borde superior, la pista
// el centro de abajo y el dock la derecha alta— y es la que el mouse NO cruza mientras se dibuja hacia el
// norte de la ciudad. Un dato que cambia en cada cuadro del arrastre necesita un lugar FIJO donde
// mirarlo, no un toast: la corrección es un lazo cerrado (movés el punto → mirás el número → volvés a
// mover) y para eso el número tiene que estar siempre en el mismo lugar.
//
// ═══ QUÉ MIDE, Y POR QUÉ NO ES LA HOLGURA ═══
//
// En zonas la métrica grande es la separación con la vecina, porque ahí hay una REGLA que cumplir: los
// bordes no se tocan. Acá esa regla no existe y no debería: dos restricciones pueden superponerse sin
// problema (un área sin tránsito los martes y otra sin entrega de 8 a 12 pueden ser el mismo territorio),
// y una restricción se dibuja justamente ENCIMA de las zonas de reparto a las que afecta. Copiar el panel
// de zonas tal cual habría puesto un número en rojo permanente midiendo algo que a nadie le importa.
//
// Las dos preguntas que sí se hacen mientras se dibuja una restricción son otras:
//   1. ¿CUÁNTO abarca? — área para un polígono, largo para una vía. Es la que no se puede contestar a
//      ojo, porque a ojo depende del zoom: el mismo trazo parece cuatro cuadras o media ciudad.
//   2. ¿A QUIÉN le pega? — qué zonas logísticas toca. Es lo que convierte un dibujo en una consecuencia
//      operativa, y es el dato que después alguien va a tener que explicar en una reunión.
// El panel contesta esas dos y nada más. Los errores de forma van abajo, en la lista de problemas.
import { AlertTriangle, CheckCircle2, Crosshair, LandPlot, MapPinned, Ruler } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatearMetros } from '../map/geo/holgura'
import { formatearArea } from '../map/geo/medidas'
import type { RestrictionType, ValidationIssue } from './domain'

/** Caja común: mismo ancho y mismo cristal que el panel de zonas, en la misma esquina. */
function Caja({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-auto w-64 overflow-hidden rounded-xl border border-border bg-card/95 shadow-xl backdrop-blur-sm">
      {children}
    </div>
  )
}

function Encabezado({ titulo, extra }: { titulo: string; extra?: React.ReactNode }) {
  return (
    <div className="flex h-8 items-center gap-1.5 border-b border-border px-2.5">
      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </span>
      {extra}
    </div>
  )
}

export interface ZonaAlcanzada {
  id: number
  nombre: string
}

/**
 * Panel de la geometría EN CURSO (modos dibujar/editar).
 *
 * `issues` llega ya calculado con el validador del dominio (`validateRestrictionDraft`) y no con reglas
 * propias de la pantalla: es el mismo que va a rechazar el guardado, así que lo que se lee acá es
 * exactamente lo que falta para publicar. Un panel con su propio criterio dejaría pasar cosas que después
 * el store rechaza, o al revés — marcaría en rojo algo que se podía guardar.
 */
export function PanelGeometria({
  tipo,
  puntos,
  areaKm2: area,
  largoM,
  autoCruce,
  issues,
  zonasAlcanzadas,
  onIrAZona,
}: {
  tipo: RestrictionType
  puntos: number
  /** Solo tiene sentido para un área. Se ignora en los otros tipos. */
  areaKm2: number
  /** Largo del trazo abierto. Solo tiene sentido para una vía. */
  largoM: number
  autoCruce: boolean
  issues: ValidationIssue[]
  /** Zonas de reparto que la geometría toca. Vacío no es lo mismo que "no se calculó": ver abajo. */
  zonasAlcanzadas: ZonaAlcanzada[]
  onIrAZona: (id: number) => void
}) {
  // La restricción por placa no tiene forma que validar: su panel dice por qué y se va. No se esconde el
  // panel entero porque entonces la esquina cambiaría de contenido según el tipo y habría que volver a
  // buscar dónde se leen los problemas.
  if (tipo === 'PLATE_ROTATION') {
    return (
      <Caja>
        <Encabezado titulo="Geometría" />
        <p className="flex items-start gap-2 px-2.5 py-2.5 text-xs text-muted-foreground">
          <MapPinned size={13} className="mt-0.5 shrink-0" />
          <span>
            La restricción por placa no tiene geometría: se evalúa por horario y reglas vehiculares. El
            mapa queda solo como referencia.
          </span>
        </p>
      </Caja>
    )
  }

  const esArea = tipo === 'RESTRICTED_AREA'
  const minimo = esArea ? 3 : 2
  const completa = puntos >= minimo
  const problemas = issues.filter((issue) => issue.field === 'geometryGeoJson')
  const cumple = completa && problemas.length === 0 && !autoCruce

  return (
    <Caja>
      <Encabezado
        titulo={esArea ? 'Área restringida' : 'Vía cerrada'}
        extra={
          cumple ? (
            <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-500">
              <CheckCircle2 size={12} />
              En regla
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-destructive">
              <AlertTriangle size={12} />
              {problemas.length + (autoCruce ? 1 : 0) || 'incompleta'}
            </span>
          )
        }
      />

      {/* LA MÉTRICA GRANDE, en la misma posición que la holgura en zonas: es la que se mira de reojo
          mientras se arrastra un punto, así que no puede compartir tamaño con nada. */}
      <div className="flex items-end gap-2 px-2.5 pb-2 pt-2">
        <Ruler size={14} className="mb-1 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {esArea ? 'Superficie' : 'Largo del trazo'}
          </div>
          <div
            className={cn(
              'truncate text-lg font-semibold leading-tight tabular-nums',
              completa ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {completa ? (esArea ? formatearArea(area) : formatearMetros(largoM)) : '—'}
          </div>
        </div>
        <div className="shrink-0 pb-0.5 text-right text-[10px] leading-tight text-muted-foreground">
          mínimo
          <br />
          <span className="tabular-nums">{minimo} pts</span>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border px-2.5 py-1 text-[11px] text-muted-foreground">
        <span>
          <span className="font-medium tabular-nums text-foreground">{puntos}</span>{' '}
          {esArea ? `vértice${puntos !== 1 ? 's' : ''}` : `punto${puntos !== 1 ? 's' : ''}`}
        </span>
        {/* En castellano y no «Polygon» / «LineString»: el tipo GeoJSON es el nombre que la geometría
            tiene en la base, no lo que alguien necesita leer mientras dibuja. Es la misma frase que usa el
            panel de zonas en este renglón. */}
        {autoCruce ? (
          <span className="font-medium text-destructive">El contorno se cruza a sí mismo</span>
        ) : (
          <span>{esArea ? 'Contorno simple' : 'Trazo abierto'}</span>
        )}
      </div>

      {/* LOS PROBLEMAS DE FORMA SOLO SE MUESTRAN CON LA GEOMETRÍA YA COMPLETA. Antes, con cero vértices,
          el panel cantaba «el área restringida necesita un Polygon GeoJSON» — la frase del validador del
          dominio, correcta y escrita para otro lector. Lo que falta cuando todavía no dibujaste nada ya lo
          dicen las dos líneas de arriba: «0 vértices» y «mínimo 3 pts». */}
      {completa && problemas.length > 0 && (
        <ul className="space-y-1 border-t border-border px-2.5 py-1.5">
          {problemas.map((issue) => (
            <li key={issue.message} className="flex items-start gap-1.5 text-[11px] text-destructive">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
              <span>{issue.message}</span>
            </li>
          ))}
        </ul>
      )}

      {/* ZONAS ALCANZADAS. Va acá y no en una capa aparte porque es la CONSECUENCIA de la geometría: el
          número cambia con cada punto que se mueve, igual que el área. Cada fila es clickeable —saber
          cuál es no alcanza si después hay que ir a buscarla a mano por el mapa—, mismo gesto que las
          filas de conflicto del panel de zonas.

          Cuando la geometría todavía no está completa NO se dice "0 zonas": se dice que falta. Un cero es
          una respuesta ("no le pega a ninguna") y acá todavía no hay pregunta que contestar. */}
      <div className="border-t border-border">
        <div className="flex items-center gap-1.5 px-2.5 pt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          <LandPlot size={11} />
          <span className="flex-1">Zonas logísticas alcanzadas</span>
          {completa && (
            <span className="font-semibold tabular-nums text-foreground">{zonasAlcanzadas.length}</span>
          )}
        </div>
        {!completa ? (
          <p className="px-2.5 pb-2 pt-1 text-[11px] text-muted-foreground">
            Se calcula cuando la geometría esté completa.
          </p>
        ) : zonasAlcanzadas.length === 0 ? (
          <p className="px-2.5 pb-2 pt-1 text-[11px] text-muted-foreground">
            Ninguna: cae fuera de todas las zonas dibujadas.
          </p>
        ) : (
          <ul className="max-h-24 space-y-0.5 overflow-y-auto p-1">
            {zonasAlcanzadas.map((zona) => (
              <li key={zona.id}>
                <button
                  type="button"
                  onClick={() => onIrAZona(zona.id)}
                  title="Encuadrar la zona en el mapa"
                  className="group flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[11px] transition-colors hover:bg-muted/60"
                >
                  <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{zona.nombre}</span>
                  <Crosshair
                    size={11}
                    className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Caja>
  )
}
