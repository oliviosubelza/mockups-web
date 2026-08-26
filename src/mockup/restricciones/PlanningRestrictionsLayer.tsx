import { Pane, Polygon, Polyline, Tooltip } from 'react-leaflet'
import { DISTRIBUIDORAS } from '../mock-data'
import { momentoDelPlan } from './momento'
import {
  RESTRICTION_EFFECT_META,
  RESTRICTION_SEVERITY_META,
  geometryToLatLng,
  restrictionMatchesMoment,
} from './domain'
import { usePlanningRestrictionsStore } from './store'

export const PANE_PLANNING_RESTRICTIONS = 'planning-restrictions'
const RESTRICTION_COLOR = '#dc2626'

export function PlanningRestrictionsLayer() {
  const restrictions = usePlanningRestrictionsStore((state) => state.restrictions)
  const moment = momentoDelPlan()
  // El planner de este mock trabaja con una única distribuidora. Hasta que exista selector, usar la
  // primera del mismo maestro evita mostrar restricciones de otro operador como si aplicaran al plan.
  const distributorId = DISTRIBUIDORAS[0]?.id
  const applicable = restrictions.filter(
    (restriction) =>
      restriction.distributorId === distributorId &&
      restriction.isActive &&
      restriction.deletedAt === null &&
      restrictionMatchesMoment(restriction, { date: moment.fecha, time: moment.hora }),
  )

  const spatial = applicable.filter((restriction) => restriction.geometryGeoJson !== null)
  if (spatial.length === 0) return null

  return (
    <Pane name={PANE_PLANNING_RESTRICTIONS} style={{ zIndex: 345 }}>
      {spatial.map((restriction) => {
        const points = geometryToLatLng(restriction.geometryGeoJson)
        const pathOptions = {
          color: RESTRICTION_COLOR,
          weight: restriction.restrictionType === 'CLOSED_ROAD' ? 5 : 3,
          opacity: 0.9,
          fillColor: RESTRICTION_COLOR,
          fillOpacity: restriction.restrictionType === 'RESTRICTED_AREA' ? 0.15 : 0,
          dashArray: restriction.severity === 'WARNING' ? '10 7' : undefined,
          lineCap: 'round' as const,
        }
        const tooltip = (
          <Tooltip sticky pane="tooltipPane">
            <div className="space-y-1">
              <strong>{restriction.name}</strong>
              <div>{RESTRICTION_EFFECT_META[restriction.effect].label} · {RESTRICTION_SEVERITY_META[restriction.severity].label}</div>
              <div className="text-[10px] opacity-75">Capa informativa: no altera rutas automáticamente.</div>
            </div>
          </Tooltip>
        )
        return restriction.restrictionType === 'RESTRICTED_AREA' ? (
          <Polygon key={restriction.id} positions={points} pathOptions={pathOptions} interactive>
            {tooltip}
          </Polygon>
        ) : (
          <Polyline key={restriction.id} positions={points} pathOptions={pathOptions} interactive>
            {tooltip}
          </Polyline>
        )
      })}
    </Pane>
  )
}
