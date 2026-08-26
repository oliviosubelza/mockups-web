// Las restricciones dibujadas en el mapa del WORKSPACE de restricciones.
//
// POR QUÉ NO ES `PlanningRestrictionsLayer`. Esa capa es la que ve el planificador: filtra por
// distribuidora y por el momento del plan, no se selecciona, no distingue lo activo de lo inactivo y
// pinta todo con el mismo rojo. Es correcta para su pantalla —ahí las restricciones son un obstáculo del
// terreno— y es inútil para esta, donde son EL CONTENIDO que se está editando. Acá hacen falta cinco
// cosas que allá no: selección, papel (contenido/contexto), el aspecto que elige el menú del rincón,
// severidad legible a simple vista y las inactivas visibles pero apagadas.
//
// Es el gemelo de `zonas/ZonasLayer`, con la misma división en dos pasadas (rellenos primero, trazos y
// etiquetas después) por la misma razón: en una sola pasada Leaflet intercala el relleno de una geometría
// sobre el trazo de la anterior según el orden de inserción, y los bordes de dos restricciones que se
// tocan quedan comidos por el relleno del vecino.
//
// LAS DE TIPO `PLATE_ROTATION` NO APARECEN, y no es un olvido: no tienen geometría. Existen, se listan y
// se editan desde el panel de la izquierda, pero no hay dónde ponerlas en un mapa. Inventarles un punto
// en el centro de la ciudad diría que la regla aplica ahí y no en el resto, que es exactamente lo
// contrario de lo que significa.
import { useMemo, useState } from 'react'
import { Pane, Polygon, Polyline, Tooltip } from 'react-leaflet'
import { geometryToLatLng, type PlanningRestriction } from './domain'
import { useRestriccionesMapaStore } from './restricciones-mapa-store'

export const PANE_RESTRICCIONES = 'restricciones-editor'
const Z_PANE = 345
/** Bloqueante: la restricción impide el paso o la entrega. Es el rojo de siempre del sistema. */
const ROJO = '#dc2626'
/** Advertencia: se puede pasar, pero alguien tiene que enterarse. */
const AMBAR = '#f59e0b'
const GRIS = '#94a3b8'
const GRIS_OSCURO = '#64748b'
const ESCALON_SOLIDO = 0.3
const FACTOR_ATENUADA = 0.35

export type PapelRestricciones = 'contenido' | 'contexto'

/** Solo las que tienen algo que dibujar. `PLATE_ROTATION` queda afuera por definición. */
export const conGeometria = (restricciones: PlanningRestriction[]) =>
  restricciones.filter((r) => r.geometryGeoJson !== null)

export function RestriccionesLayer({
  restricciones,
  papel,
  seleccionadaId,
  onSeleccionar,
  interactivo = true,
}: {
  restricciones: PlanningRestriction[]
  papel: PapelRestricciones
  seleccionadaId: number | null
  onSeleccionar: (id: number | null) => void
  interactivo?: boolean
}) {
  const [hoverId, setHoverId] = useState<number | null>(null)
  const verNombres = useRestriccionesMapaStore((s) => s.verNombres)
  const resaltarElegido = useRestriccionesMapaStore((s) => s.resaltarSeleccionada)
  const rellenoSolidoElegido = useRestriccionesMapaStore((s) => s.rellenoSolido)

  const contexto = papel === 'contexto'
  const activo = !contexto && interactivo
  const rellenoSolido = rellenoSolidoElegido && !contexto
  const destacada = resaltarElegido && !contexto ? seleccionadaId : null

  const dibujables = useMemo(() => conGeometria(restricciones), [restricciones])
  const trazos = useMemo(
    () => new Map(dibujables.map((r) => [r.id, geometryToLatLng(r.geometryGeoJson)])),
    [dibujables],
  )

  if (dibujables.length === 0) return null

  /** El color dice SEVERIDAD, no tipo: el tipo ya se lee de la forma (un área es un polígono, una vía es
   *  una línea), así que gastar el color en repetirlo desperdicia el único canal que puede decir cuánto
   *  importa. Lo apagado —gris— es "no está en circulación", y gana sobre la severidad: una restricción
   *  inactiva bloqueante no bloquea nada. */
  const colorDe = (r: PlanningRestriction) => {
    if (contexto || !r.isActive) return GRIS
    return r.severity === 'BLOCKING' ? ROJO : AMBAR
  }

  return (
    <Pane name={PANE_RESTRICCIONES} style={{ zIndex: Z_PANE }}>
      {dibujables
        .filter((r) => r.restrictionType === 'RESTRICTED_AREA')
        .map((r) => {
          const seleccionada = !contexto && r.id === seleccionadaId
          const hover = activo && r.id === hoverId
          const atenuada = destacada !== null && r.id !== destacada
          const base = contexto ? 0.08 : seleccionada ? 0.26 : hover ? 0.2 : 0.13
          return (
            <Polygon
              key={`fill-${r.id}`}
              positions={trazos.get(r.id) ?? []}
              interactive={activo}
              pathOptions={{
                stroke: false,
                fillColor: colorDe(r),
                fillOpacity:
                  Math.min(1, base + (rellenoSolido ? ESCALON_SOLIDO : 0)) *
                  (atenuada ? FACTOR_ATENUADA : 1),
              }}
              eventHandlers={{
                click: () => activo && onSeleccionar(seleccionada ? null : r.id),
                mouseover: (event) => {
                  if (!activo) return
                  setHoverId(r.id)
                  event.target.getElement()?.style.setProperty('cursor', 'pointer')
                },
                mouseout: () => setHoverId((current) => (current === r.id ? null : current)),
              }}
            />
          )
        })}

      {dibujables.map((r) => {
        const seleccionada = !contexto && r.id === seleccionadaId
        const hover = activo && r.id === hoverId
        const atenuada = destacada !== null && r.id !== destacada
        const puntos = trazos.get(r.id) ?? []
        const color = colorDe(r)
        const via = r.restrictionType === 'CLOSED_ROAD'
        // Una VÍA es la geometría en sí: si no responde al click, no hay forma de seleccionarla —no tiene
        // relleno que la reciba—. Un ÁREA delega el click en su relleno, que es un blanco mucho más
        // grande que una línea de 3 px.
        const interactivoAca = activo && via
        const etiqueta = verNombres && (
          <Tooltip
            key={seleccionada ? 'selected' : 'normal'}
            permanent
            direction={via ? 'top' : 'center'}
            pane="tooltipPane"
            className={seleccionada ? 'zona-etiqueta zona-etiqueta-sel' : 'zona-etiqueta'}
          >
            {r.name}
          </Tooltip>
        )
        const estilo = {
          color: contexto || !r.isActive ? GRIS_OSCURO : color,
          // La vía se dibuja más gruesa que el borde de un área porque la línea ES la restricción: con
          // 2 px sobre una avenida de una capa de calles no se distingue del trazado de la calle.
          weight: via
            ? seleccionada
              ? 7
              : hover
                ? 6
                : contexto
                  ? 3.5
                  : 5
            : seleccionada
              ? 3.5
              : hover
                ? 3
                : contexto
                  ? 1.5
                  : 2,
          opacity: (contexto ? 0.7 : 1) * (atenuada ? FACTOR_ATENUADA : 1),
          // Punteado = "no está en circulación", el mismo código que en zonas. La severidad NO se
          // codifica con el punteado aunque `PlanningRestrictionsLayer` lo haga: allá no hay inactivas
          // que mostrar y el canal estaba libre; acá ya lo ocupa el estado.
          dashArray: contexto || !r.isActive ? '6 5' : undefined,
          lineCap: 'round' as const,
          fill: false,
        }
        const handlers = {
          click: () => interactivoAca && onSeleccionar(seleccionada ? null : r.id),
          mouseover: (event: { target: { getElement: () => HTMLElement | SVGElement | undefined } }) => {
            if (!interactivoAca) return
            setHoverId(r.id)
            event.target.getElement()?.style.setProperty('cursor', 'pointer')
          },
          mouseout: () => setHoverId((current) => (current === r.id ? null : current)),
        }
        return via ? (
          <Polyline
            key={`stroke-${r.id}`}
            positions={puntos}
            interactive={interactivoAca}
            pathOptions={estilo}
            eventHandlers={handlers}
          >
            {etiqueta}
          </Polyline>
        ) : (
          <Polygon key={`stroke-${r.id}`} positions={puntos} interactive={false} pathOptions={estilo}>
            {etiqueta}
          </Polygon>
        )
      })}
    </Pane>
  )
}
