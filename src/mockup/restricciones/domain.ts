import type { LatLngTuple } from '../map/geo/polyline'
import { autoSeCruza } from '../map/geo/solapamiento'

export const RESTRICTION_TYPES = ['RESTRICTED_AREA', 'CLOSED_ROAD', 'PLATE_ROTATION'] as const
export const RESTRICTION_EFFECTS = ['NO_TRANSIT', 'NO_DELIVERY', 'NO_VEHICLE'] as const
export const RESTRICTION_SEVERITIES = ['BLOCKING', 'WARNING'] as const

export type RestrictionType = (typeof RESTRICTION_TYPES)[number]
export type RestrictionEffect = (typeof RESTRICTION_EFFECTS)[number]
export type RestrictionSeverity = (typeof RESTRICTION_SEVERITIES)[number]
export type GeoJsonPosition = [number, number]

export interface PolygonGeoJson {
  type: 'Polygon'
  coordinates: GeoJsonPosition[][]
}

export interface LineStringGeoJson {
  type: 'LineString'
  coordinates: GeoJsonPosition[]
}

export type RestrictionGeometry = PolygonGeoJson | LineStringGeoJson | null

export interface AuditFields {
  createdBy: string | null
  updatedBy: string | null
  createdAt: string | null
  updatedAt: string | null
  deletedAt: string | null
}

export interface PlanningRestrictionSchedule extends AuditFields {
  id: number
  validFrom: string | null
  validTo: string | null
  dayOfWeek: number | null
  startTime: string | null
  endTime: string | null
}

export interface PlanningRestrictionVehicleRule extends AuditFields {
  id: number
  plateLastDigit: number | null
  minCapacityWeightKg: number | null
  truckType: string | null
  plate: string | null
}

interface PlanningRestrictionBase extends AuditFields {
  id: number
  distributorId: number
  name: string
  description: string | null
  effect: RestrictionEffect
  severity: RestrictionSeverity
  isActive: boolean
  schedules: PlanningRestrictionSchedule[]
  vehicleRules: PlanningRestrictionVehicleRule[]
}

export type PlanningRestriction =
  | (PlanningRestrictionBase & {
      restrictionType: 'RESTRICTED_AREA'
      geometryGeoJson: PolygonGeoJson
    })
  | (PlanningRestrictionBase & {
      restrictionType: 'CLOSED_ROAD'
      geometryGeoJson: LineStringGeoJson
    })
  | (PlanningRestrictionBase & {
      restrictionType: 'PLATE_ROTATION'
      geometryGeoJson: null
    })

export interface RestrictionScheduleDraft {
  id?: number
  validFrom: string | null
  validTo: string | null
  dayOfWeek: number | null
  startTime: string | null
  endTime: string | null
}

export interface RestrictionVehicleRuleDraft {
  id?: number
  plateLastDigit: number | null
  minCapacityWeightKg: number | null
  truckType: string | null
  plate: string | null
}

export interface PlanningRestrictionDraft {
  distributorId: number
  name: string
  description: string | null
  restrictionType: RestrictionType
  effect: RestrictionEffect
  severity: RestrictionSeverity
  geometryGeoJson: RestrictionGeometry
  isActive: boolean
  schedules: RestrictionScheduleDraft[]
  vehicleRules: RestrictionVehicleRuleDraft[]
}

export interface ValidationIssue {
  field: string
  message: string
}

export interface RestrictionMoment {
  date: string
  time?: string
}

export interface RestrictionTruck {
  plate: string
  capacityWeightKg: number
  truckType: string
}

export const RESTRICTION_TYPE_META: Record<
  RestrictionType,
  {
    label: string
    shortLabel: string
    geometry: 'Polygon' | 'LineString' | 'Sin geometría'
    description: string
  }
> = {
  RESTRICTED_AREA: {
    label: 'Área restringida',
    shortLabel: 'Área',
    geometry: 'Polygon',
    description: 'Perímetro donde se declara una limitación de tránsito o entrega.',
  },
  CLOSED_ROAD: {
    label: 'Vía cerrada',
    shortLabel: 'Vía',
    geometry: 'LineString',
    description: 'Trazo lineal que representa una calle o tramo cerrado.',
  },
  PLATE_ROTATION: {
    label: 'Restricción por placa',
    shortLabel: 'Placa',
    geometry: 'Sin geometría',
    description: 'Regla global por placa, horario y atributos del vehículo.',
  },
}

export const RESTRICTION_EFFECT_META: Record<RestrictionEffect, { label: string }> = {
  NO_TRANSIT: { label: 'Sin tránsito' },
  NO_DELIVERY: { label: 'Sin entrega' },
  NO_VEHICLE: { label: 'Vehículo no habilitado' },
}

export const RESTRICTION_SEVERITY_META: Record<RestrictionSeverity, { label: string }> = {
  BLOCKING: { label: 'Bloqueante' },
  WARNING: { label: 'Advertencia' },
}

export const EFFECTS_BY_TYPE: Record<RestrictionType, RestrictionEffect[]> = {
  RESTRICTED_AREA: ['NO_TRANSIT', 'NO_DELIVERY'],
  CLOSED_ROAD: ['NO_TRANSIT'],
  PLATE_ROTATION: ['NO_VEHICLE'],
}

export const DAYS_OF_WEEK = [
  { value: 1, label: 'Lunes', short: 'Lu' },
  { value: 2, label: 'Martes', short: 'Ma' },
  { value: 3, label: 'Miércoles', short: 'Mi' },
  { value: 4, label: 'Jueves', short: 'Ju' },
  { value: 5, label: 'Viernes', short: 'Vi' },
  { value: 6, label: 'Sábado', short: 'Sá' },
  { value: 0, label: 'Domingo', short: 'Do' },
] as const

export const SPATIAL_NOT_EVALUATED = {
  status: 'NOT_EVALUATED' as const,
  reason: 'El mock no integra un motor geoespacial o de ruteo para evaluar ni evitar esta geometría.',
}

export function activeSchedules(restriction: PlanningRestriction): PlanningRestrictionSchedule[] {
  return restriction.schedules.filter((schedule) => schedule.deletedAt === null)
}

export function activeVehicleRules(
  restriction: PlanningRestriction,
): PlanningRestrictionVehicleRule[] {
  return restriction.vehicleRules.filter((rule) => rule.deletedAt === null)
}

export function restrictionToDraft(restriction: PlanningRestriction): PlanningRestrictionDraft {
  return {
    distributorId: restriction.distributorId,
    name: restriction.name,
    description: restriction.description,
    restrictionType: restriction.restrictionType,
    effect: restriction.effect,
    severity: restriction.severity,
    geometryGeoJson: structuredClone(restriction.geometryGeoJson),
    isActive: restriction.isActive,
    schedules: activeSchedules(restriction).map((schedule) => ({
      id: schedule.id,
      validFrom: schedule.validFrom,
      validTo: schedule.validTo,
      dayOfWeek: schedule.dayOfWeek,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
    })),
    vehicleRules: activeVehicleRules(restriction).map((rule) => ({
      id: rule.id,
      plateLastDigit: rule.plateLastDigit,
      minCapacityWeightKg: rule.minCapacityWeightKg,
      truckType: rule.truckType,
      plate: rule.plate,
    })),
  }
}

export function emptyRestrictionDraft(distributorId: number): PlanningRestrictionDraft {
  return {
    distributorId,
    name: '',
    description: null,
    restrictionType: 'RESTRICTED_AREA',
    effect: 'NO_TRANSIT',
    severity: 'WARNING',
    geometryGeoJson: emptyGeometry('RESTRICTED_AREA'),
    isActive: true,
    schedules: [],
    vehicleRules: [],
  }
}

export function emptyGeometry(restrictionType: RestrictionType): RestrictionGeometry {
  if (restrictionType === 'RESTRICTED_AREA') return { type: 'Polygon', coordinates: [[]] }
  if (restrictionType === 'CLOSED_ROAD') return { type: 'LineString', coordinates: [] }
  return null
}

export function emptyScheduleDraft(): RestrictionScheduleDraft {
  return {
    validFrom: null,
    validTo: null,
    dayOfWeek: null,
    startTime: null,
    endTime: null,
  }
}

export function emptyVehicleRuleDraft(): RestrictionVehicleRuleDraft {
  return {
    plateLastDigit: null,
    minCapacityWeightKg: null,
    truckType: null,
    plate: null,
  }
}

function isCoordinate(position: unknown): position is GeoJsonPosition {
  if (!Array.isArray(position) || position.length !== 2) return false
  const [lng, lat] = position
  return (
    typeof lng === 'number' &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180 &&
    typeof lat === 'number' &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90
  )
}

const samePosition = (a: GeoJsonPosition, b: GeoJsonPosition) => a[0] === b[0] && a[1] === b[1]
const positionKey = ([lng, lat]: GeoJsonPosition) => `${lng}:${lat}`

function validatePolygon(geometry: RestrictionGeometry, issues: ValidationIssue[]): void {
  if (!geometry || geometry.type !== 'Polygon') {
    issues.push({ field: 'geometryGeoJson', message: 'El área restringida necesita un Polygon GeoJSON.' })
    return
  }
  const ring = geometry.coordinates[0]
  if (!Array.isArray(ring)) {
    issues.push({ field: 'geometryGeoJson', message: 'El Polygon necesita un anillo exterior.' })
    return
  }
  if (ring.some((position) => !isCoordinate(position))) {
    issues.push({
      field: 'geometryGeoJson',
      message: 'Cada coordenada debe ser [longitud, latitud] dentro de límites válidos.',
    })
    return
  }
  if (ring.length < 4) {
    issues.push({
      field: 'geometryGeoJson',
      message: 'El Polygon necesita al menos 3 vértices distintos y el punto de cierre.',
    })
    return
  }
  if (!samePosition(ring[0], ring[ring.length - 1])) {
    issues.push({ field: 'geometryGeoJson', message: 'El anillo del Polygon debe estar cerrado.' })
    return
  }
  const openRing = ring.slice(0, -1)
  if (new Set(openRing.map(positionKey)).size < 3) {
    issues.push({ field: 'geometryGeoJson', message: 'El Polygon necesita al menos 3 vértices distintos.' })
    return
  }
  if (new Set(openRing.map(positionKey)).size !== openRing.length) {
    issues.push({ field: 'geometryGeoJson', message: 'El contorno no puede repetir vértices internos.' })
    return
  }
  const leafletRing: LatLngTuple[] = openRing.map(([lng, lat]) => [lat, lng])
  if (autoSeCruza(leafletRing)) {
    issues.push({ field: 'geometryGeoJson', message: 'El contorno del Polygon se cruza consigo mismo.' })
  }
}

function validateLineString(geometry: RestrictionGeometry, issues: ValidationIssue[]): void {
  if (!geometry || geometry.type !== 'LineString') {
    issues.push({ field: 'geometryGeoJson', message: 'La vía cerrada necesita un LineString GeoJSON.' })
    return
  }
  if (geometry.coordinates.some((position) => !isCoordinate(position))) {
    issues.push({
      field: 'geometryGeoJson',
      message: 'Cada coordenada debe ser [longitud, latitud] dentro de límites válidos.',
    })
    return
  }
  if (geometry.coordinates.length < 2 || new Set(geometry.coordinates.map(positionKey)).size < 2) {
    issues.push({
      field: 'geometryGeoJson',
      message: 'Decisión del mock/GeoJSON: el LineString necesita al menos 2 puntos distintos.',
    })
  }
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function validTime(value: string): boolean {
  const match = value.match(/^(\d{2}):(\d{2})$/)
  if (!match) return false
  return Number(match[1]) <= 23 && Number(match[2]) <= 59
}

export function validateRestrictionDraft(draft: PlanningRestrictionDraft): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!Number.isInteger(draft.distributorId) || draft.distributorId <= 0) {
    issues.push({ field: 'distributorId', message: 'Seleccione una distribuidora válida.' })
  }
  const name = draft.name.trim()
  if (!name) issues.push({ field: 'name', message: 'El nombre es obligatorio.' })
  if (name.length > 50) issues.push({ field: 'name', message: 'El nombre admite hasta 50 caracteres.' })
  if ((draft.description ?? '').length > 100) {
    issues.push({ field: 'description', message: 'La descripción admite hasta 100 caracteres.' })
  }
  const knownType = RESTRICTION_TYPES.includes(draft.restrictionType)
  if (!knownType) {
    issues.push({ field: 'restrictionType', message: 'El tipo de restricción no pertenece al catálogo.' })
  }
  if (!RESTRICTION_EFFECTS.includes(draft.effect)) {
    issues.push({ field: 'effect', message: 'El efecto no pertenece al catálogo.' })
  } else if (knownType && !EFFECTS_BY_TYPE[draft.restrictionType].includes(draft.effect)) {
    issues.push({ field: 'effect', message: 'El efecto no corresponde al tipo de restricción elegido.' })
  }
  if (!RESTRICTION_SEVERITIES.includes(draft.severity)) {
    issues.push({ field: 'severity', message: 'La severidad no pertenece al catálogo.' })
  }

  if (draft.restrictionType === 'RESTRICTED_AREA') validatePolygon(draft.geometryGeoJson, issues)
  if (draft.restrictionType === 'CLOSED_ROAD') validateLineString(draft.geometryGeoJson, issues)
  if (draft.restrictionType === 'PLATE_ROTATION' && draft.geometryGeoJson !== null) {
    issues.push({ field: 'geometryGeoJson', message: 'La restricción por placa no admite geometría.' })
  }

  const scheduleIds = draft.schedules.flatMap((schedule) => (schedule.id === undefined ? [] : [schedule.id]))
  if (new Set(scheduleIds).size !== scheduleIds.length) {
    issues.push({ field: 'schedules', message: 'Una fila de horario no puede repetirse por id.' })
  }
  draft.schedules.forEach((schedule, index) => {
    const field = `schedules[${index}]`
    const empty =
      schedule.validFrom === null &&
      schedule.validTo === null &&
      schedule.dayOfWeek === null &&
      schedule.startTime === null &&
      schedule.endTime === null
    if (empty) issues.push({ field, message: 'Una fila de horario no puede estar completamente vacía.' })
    if (schedule.validFrom && !validDate(schedule.validFrom)) {
      issues.push({ field: `${field}.validFrom`, message: 'La fecha inicial no es válida.' })
    }
    if (schedule.validTo && !validDate(schedule.validTo)) {
      issues.push({ field: `${field}.validTo`, message: 'La fecha final no es válida.' })
    }
    if (schedule.validFrom && schedule.validTo && schedule.validFrom > schedule.validTo) {
      issues.push({ field, message: 'La fecha inicial debe ser anterior o igual a la fecha final.' })
    }
    if (
      schedule.dayOfWeek !== null &&
      (!Number.isInteger(schedule.dayOfWeek) || schedule.dayOfWeek < 0 || schedule.dayOfWeek > 6)
    ) {
      issues.push({ field: `${field}.dayOfWeek`, message: 'El día debe estar entre 0 y 6.' })
    }
    if (schedule.startTime && !validTime(schedule.startTime)) {
      issues.push({ field: `${field}.startTime`, message: 'La hora inicial no es válida.' })
    }
    if (schedule.endTime && !validTime(schedule.endTime)) {
      issues.push({ field: `${field}.endTime`, message: 'La hora final no es válida.' })
    }
    if (schedule.startTime && schedule.endTime && schedule.startTime === schedule.endTime) {
      issues.push({ field, message: 'La hora inicial y final no pueden ser iguales.' })
    }
  })

  const ruleIds = draft.vehicleRules.flatMap((rule) => (rule.id === undefined ? [] : [rule.id]))
  if (new Set(ruleIds).size !== ruleIds.length) {
    issues.push({ field: 'vehicleRules', message: 'Una regla vehicular no puede repetirse por id.' })
  }
  draft.vehicleRules.forEach((rule, index) => {
    const field = `vehicleRules[${index}]`
    const plate = rule.plate?.trim() || null
    const truckType = rule.truckType?.trim() || null
    if (
      rule.plateLastDigit === null &&
      rule.minCapacityWeightKg === null &&
      truckType === null &&
      plate === null
    ) {
      issues.push({ field, message: 'Una regla vehicular no puede estar completamente vacía.' })
    }
    if (
      rule.plateLastDigit !== null &&
      (!Number.isInteger(rule.plateLastDigit) || rule.plateLastDigit < 0 || rule.plateLastDigit > 9)
    ) {
      issues.push({ field: `${field}.plateLastDigit`, message: 'El último dígito debe estar entre 0 y 9.' })
    }
    if (
      rule.minCapacityWeightKg !== null &&
      (!Number.isFinite(rule.minCapacityWeightKg) || rule.minCapacityWeightKg < 0)
    ) {
      issues.push({ field: `${field}.minCapacityWeightKg`, message: 'El peso mínimo debe ser mayor o igual a 0.' })
    }
    if ((rule.truckType ?? '').length > 50) {
      issues.push({ field: `${field}.truckType`, message: 'El tipo de camión admite hasta 50 caracteres.' })
    }
    if ((rule.plate ?? '').length > 20) {
      issues.push({ field: `${field}.plate`, message: 'La placa admite hasta 20 caracteres.' })
    }
  })
  return issues
}

function localDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function previousDate(date: string): string {
  const previous = localDate(date)
  previous.setDate(previous.getDate() - 1)
  return formatLocalDate(previous)
}

function dateAndDayMatch(schedule: RestrictionScheduleDraft, startDate: string): boolean {
  if (schedule.validFrom && startDate < schedule.validFrom) return false
  if (schedule.validTo && startDate > schedule.validTo) return false
  if (schedule.dayOfWeek !== null && localDate(startDate).getDay() !== schedule.dayOfWeek) return false
  return true
}

function isOvernight(schedule: RestrictionScheduleDraft): boolean {
  return (schedule.startTime ?? '00:00') > (schedule.endTime ?? '24:00')
}

function timeMatches(schedule: RestrictionScheduleDraft, time: string): boolean {
  const start = schedule.startTime ?? '00:00'
  const end = schedule.endTime ?? '24:00'
  return isOvernight(schedule) ? time >= start || time < end : time >= start && time < end
}

export function scheduleMatchesMoment(
  schedule: RestrictionScheduleDraft,
  moment: RestrictionMoment,
): boolean {
  if (moment.time === undefined) {
    if (dateAndDayMatch(schedule, moment.date)) return true
    return isOvernight(schedule) && dateAndDayMatch(schedule, previousDate(moment.date))
  }
  if (!timeMatches(schedule, moment.time)) return false
  const end = schedule.endTime ?? '24:00'
  const startDate = isOvernight(schedule) && moment.time < end ? previousDate(moment.date) : moment.date
  return dateAndDayMatch(schedule, startDate)
}

export function restrictionMatchesMoment(
  restriction: PlanningRestriction,
  moment: RestrictionMoment,
): boolean {
  const schedules = activeSchedules(restriction)
  return schedules.length === 0 || schedules.some((schedule) => scheduleMatchesMoment(schedule, moment))
}

export function normalizePlate(plate: string): string {
  return plate.trim().toUpperCase()
}

export function firstNumericBlockLastDigit(plate: string): number | null {
  const block = plate.match(/\d+/)?.[0]
  return block ? Number(block[block.length - 1]) : null
}

export function vehicleRuleMatchesTruck(
  rule: RestrictionVehicleRuleDraft,
  truck: RestrictionTruck,
): boolean {
  if (rule.plateLastDigit !== null && firstNumericBlockLastDigit(truck.plate) !== rule.plateLastDigit) {
    return false
  }
  if (
    rule.minCapacityWeightKg !== null &&
    truck.capacityWeightKg < rule.minCapacityWeightKg
  ) {
    return false
  }
  if (
    rule.truckType?.trim() &&
    rule.truckType.trim().toUpperCase() !== truck.truckType.trim().toUpperCase()
  ) {
    return false
  }
  if (rule.plate?.trim() && normalizePlate(rule.plate) !== normalizePlate(truck.plate)) return false
  return true
}

export function restrictionMatchesTruck(
  restriction: PlanningRestriction,
  truck: RestrictionTruck,
): boolean {
  const rules = activeVehicleRules(restriction)
  return rules.length === 0 || rules.some((rule) => vehicleRuleMatchesTruck(rule, truck))
}

function shortDay(day: number | null): string {
  if (day === null) return 'Todos los días'
  return DAYS_OF_WEEK.find((item) => item.value === day)?.short ?? `Día ${day}`
}

function shortDate(value: string): string {
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year.slice(2)}`
}

export function describeSchedule(schedule: RestrictionScheduleDraft): string {
  const parts: string[] = []
  if (schedule.dayOfWeek !== null) parts.push(shortDay(schedule.dayOfWeek))
  if (schedule.startTime || schedule.endTime) {
    parts.push(`${schedule.startTime ?? '00:00'}–${schedule.endTime ?? '24:00'}`)
  }
  if (schedule.validFrom && schedule.validTo) {
    parts.push(`${shortDate(schedule.validFrom)}–${shortDate(schedule.validTo)}`)
  } else if (schedule.validFrom) {
    parts.push(`desde ${shortDate(schedule.validFrom)}`)
  } else if (schedule.validTo) {
    parts.push(`hasta ${shortDate(schedule.validTo)}`)
  }
  return parts.join(' · ') || 'Fila vacía'
}

export function describeSchedules(restriction: PlanningRestriction): string {
  const schedules = activeSchedules(restriction)
  if (schedules.length === 0) return 'Permanente'
  if (schedules.length === 1) return describeSchedule(schedules[0])
  return `${schedules.length} franjas (O)`
}

export function describeVehicleRules(restriction: PlanningRestriction): string {
  const rules = activeVehicleRules(restriction)
  if (rules.length === 0) return 'Toda la flota'
  return `${rules.length} regla${rules.length === 1 ? '' : 's'} (O)`
}

export function geometryToLatLng(geometry: RestrictionGeometry): LatLngTuple[] {
  if (!geometry) return []
  const coordinates = geometry.type === 'Polygon' ? (geometry.coordinates[0] ?? []) : geometry.coordinates
  const open =
    geometry.type === 'Polygon' &&
    coordinates.length > 1 &&
    samePosition(coordinates[0], coordinates[coordinates.length - 1])
      ? coordinates.slice(0, -1)
      : coordinates
  return open.map(([lng, lat]) => [lat, lng])
}

export function latLngToGeometry(
  type: RestrictionType,
  points: LatLngTuple[],
): RestrictionGeometry {
  if (type === 'PLATE_ROTATION' || points.length === 0) return null
  const coordinates = points.map(([lat, lng]) => [lng, lat] as GeoJsonPosition)
  if (type === 'CLOSED_ROAD') return { type: 'LineString', coordinates }
  return { type: 'Polygon', coordinates: [[...coordinates, coordinates[0]]] }
}

export function formatAuditDate(value: string | null): string {
  if (!value) return 'Sin dato'
  return new Intl.DateTimeFormat('es-BO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}
