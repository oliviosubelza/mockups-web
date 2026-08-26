import { useMemo, useState } from 'react'
import { CircleMarker, Pane, Polygon, Tooltip } from 'react-leaflet'
import type { TipoConflicto } from '../map/geo/holgura'
import { areaKm2, formatearArea } from '../map/geo/medidas'
import { poligonoALatLng, type Zona } from '../zones-store'
import { useZonasMapaStore } from './zonas-mapa-store'

export const PANE_ZONAS = 'zonas'
const Z_PANE = 340
const AZUL = '#2563eb'
const GRIS = '#94a3b8'
const GRIS_OSCURO = '#64748b'
const ROJO = '#dc2626'
const AMBAR = '#f59e0b'
const ESCALON_SOLIDO = 0.3
const FACTOR_ATENUADA = 0.35

const colorConflicto = (tipo: TipoConflicto) => (tipo === 'solapa' ? ROJO : AMBAR)

export type PapelZonas = 'contenido' | 'contexto'

/** Capa exclusiva de zonas logísticas. Las restricciones usan `PlanningRestrictionsLayer`. */
export function ZonasLayer({
  zonas,
  papel,
  seleccionadaId,
  onSeleccionar,
  enConflicto,
  interactivo = true,
  aspectoEditor = false,
}: {
  zonas: Zona[]
  papel: PapelZonas
  seleccionadaId: number | null
  onSeleccionar: (id: number | null) => void
  enConflicto?: Map<number, TipoConflicto>
  interactivo?: boolean
  aspectoEditor?: boolean
}) {
  const [hoverId, setHoverId] = useState<number | null>(null)
  const verNombresElegido = useZonasMapaStore((state) => state.verNombres)
  const verMedidasElegido = useZonasMapaStore((state) => state.verMedidas)
  const verVerticesElegido = useZonasMapaStore((state) => state.verVertices)
  const resaltarElegido = useZonasMapaStore((state) => state.resaltarSeleccionada)
  const rellenoSolidoElegido = useZonasMapaStore((state) => state.rellenoSolido)

  const verNombres = !aspectoEditor || verNombresElegido
  const verMedidas = aspectoEditor && verMedidasElegido && verNombresElegido
  const verVertices = aspectoEditor && verVerticesElegido
  const contexto = papel === 'contexto'
  const activo = !contexto && interactivo
  const rellenoSolido = aspectoEditor && rellenoSolidoElegido && !contexto
  const destacada = aspectoEditor && resaltarElegido && !contexto ? seleccionadaId : null
  const anillos = useMemo(
    () => new Map(zonas.map((zona) => [zona.id, poligonoALatLng(zona.polygonGeoJson)])),
    [zonas],
  )
  const zonaHover = hoverId === null ? null : zonas.find((zona) => zona.id === hoverId) ?? null

  if (zonas.length === 0) return null

  return (
    <Pane name={PANE_ZONAS} style={{ zIndex: Z_PANE }}>
      {zonas.map((zona) => {
        const seleccionada = !contexto && zona.id === seleccionadaId
        const conflicto = enConflicto?.get(zona.id)
        const hover = activo && zona.id === hoverId
        const atenuada = destacada !== null && zona.id !== destacada && !conflicto
        const fillColor = conflicto
          ? colorConflicto(conflicto)
          : !zona.isActive
            ? GRIS
            : contexto
              ? GRIS
              : AZUL
        const baseOpacity = conflicto ? 0.22 : contexto ? 0.1 : seleccionada ? 0.28 : hover ? 0.2 : 0.12
        return (
          <Polygon
            key={`fill-${zona.id}`}
            positions={anillos.get(zona.id) ?? []}
            interactive={activo}
            pathOptions={{
              stroke: false,
              fillColor,
              fillOpacity:
                Math.min(1, baseOpacity + (rellenoSolido ? ESCALON_SOLIDO : 0)) *
                (atenuada ? FACTOR_ATENUADA : 1),
            }}
            eventHandlers={{
              click: () => activo && onSeleccionar(seleccionada ? null : zona.id),
              mouseover: (event) => {
                if (!activo) return
                setHoverId(zona.id)
                event.target.getElement()?.style.setProperty('cursor', 'pointer')
              },
              mouseout: () => setHoverId((current) => (current === zona.id ? null : current)),
            }}
          />
        )
      })}

      {zonas.map((zona) => {
        const seleccionada = !contexto && zona.id === seleccionadaId
        const conflicto = enConflicto?.get(zona.id)
        const hover = activo && zona.id === hoverId
        const atenuada = destacada !== null && zona.id !== destacada && !conflicto
        const anillo = anillos.get(zona.id) ?? []
        return (
          <Polygon
            key={`stroke-${zona.id}`}
            positions={anillo}
            interactive={false}
            pathOptions={{
              color: conflicto
                ? colorConflicto(conflicto)
                : !zona.isActive || contexto
                  ? GRIS_OSCURO
                  : AZUL,
              weight: conflicto ? 3 : seleccionada ? 3.5 : hover ? 3 : contexto ? 1.5 : 2,
              opacity: (conflicto ? 1 : contexto ? 0.75 : 1) * (atenuada ? FACTOR_ATENUADA : 1),
              dashArray: conflicto ? undefined : contexto || !zona.isActive ? '5 4' : undefined,
              fill: false,
            }}
          >
            {verNombres && (
              <Tooltip
                key={seleccionada ? 'selected' : 'normal'}
                permanent
                direction="center"
                pane="tooltipPane"
                className={seleccionada ? 'zona-etiqueta zona-etiqueta-sel' : 'zona-etiqueta'}
              >
                {zona.name}
                {verMedidas && (
                  <span style={{ display: 'block', fontSize: '9px', fontWeight: 500, opacity: 0.8 }}>
                    {formatearArea(areaKm2(anillo))}
                  </span>
                )}
              </Tooltip>
            )}
          </Polygon>
        )
      })}

      {verVertices &&
        activo &&
        zonaHover &&
        (anillos.get(zonaHover.id) ?? []).map((point, index) => (
          <CircleMarker
            key={`vertex-${zonaHover.id}-${index}`}
            center={point}
            radius={2.5}
            interactive={false}
            pathOptions={{ color: '#fff', weight: 1.5, fillColor: AZUL, fillOpacity: 1 }}
          />
        ))}
    </Pane>
  )
}
