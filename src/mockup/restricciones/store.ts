import { create } from 'zustand'
import { DISTRIBUIDORAS } from '../mock-data'
import {
  restrictionToDraft,
  validateRestrictionDraft,
  type AuditFields,
  type LineStringGeoJson,
  type PlanningRestriction,
  type PlanningRestrictionDraft,
  type PlanningRestrictionSchedule,
  type PlanningRestrictionVehicleRule,
  type PolygonGeoJson,
  type RestrictionScheduleDraft,
  type RestrictionVehicleRuleDraft,
  type ValidationIssue,
} from './domain'

const STORAGE_KEY = 'mockups-web:planning-restrictions:v1'
const LOCAL_USER = 'Juan Pérez'

export type RestrictionStoreResult =
  | { ok: true; restriction: PlanningRestriction }
  | { ok: false; issues: ValidationIssue[] }

function audit(createdAt: string, updatedAt = createdAt): AuditFields {
  return {
    createdBy: LOCAL_USER,
    updatedBy: LOCAL_USER,
    createdAt,
    updatedAt,
    deletedAt: null,
  }
}

function schedule(
  id: number,
  values: Omit<RestrictionScheduleDraft, 'id'>,
  createdAt: string,
): PlanningRestrictionSchedule {
  return {
    id,
    validFrom: values.validFrom,
    validTo: values.validTo,
    dayOfWeek: values.dayOfWeek,
    startTime: values.startTime,
    endTime: values.endTime,
    ...audit(createdAt),
  }
}

function vehicleRule(
  id: number,
  values: Omit<RestrictionVehicleRuleDraft, 'id'>,
  createdAt: string,
): PlanningRestrictionVehicleRule {
  return {
    id,
    plateLastDigit: values.plateLastDigit,
    minCapacityWeightKg: values.minCapacityWeightKg,
    truckType: values.truckType,
    plate: values.plate,
    ...audit(createdAt),
  }
}

function demoRestrictions(): PlanningRestriction[] {
  const santaCruz = DISTRIBUIDORAS[0]?.id ?? 501
  const warnes = DISTRIBUIDORAS[1]?.id ?? 502
  return [
    {
      id: 901,
      distributorId: santaCruz,
      name: 'Centro histórico - obras nocturnas',
      description: 'Restricción municipal durante la renovación de calzada.',
      restrictionType: 'RESTRICTED_AREA',
      effect: 'NO_TRANSIT',
      severity: 'BLOCKING',
      geometryGeoJson: {
        type: 'Polygon',
        coordinates: [
          [
            [-63.1862, -17.7814],
            [-63.1808, -17.7814],
            [-63.1808, -17.7867],
            [-63.1862, -17.7867],
            [-63.1862, -17.7814],
          ],
        ],
      },
      isActive: true,
      schedules: [
        schedule(
          1401,
          {
            validFrom: '2026-08-01',
            validTo: '2026-12-31',
            dayOfWeek: null,
            startTime: '22:00',
            endTime: '06:00',
          },
          '2026-08-20T14:10:00.000Z',
        ),
      ],
      vehicleRules: [
        vehicleRule(
          1801,
          {
            plateLastDigit: null,
            minCapacityWeightKg: 3500,
            truckType: null,
            plate: null,
          },
          '2026-08-20T14:10:00.000Z',
        ),
      ],
      ...audit('2026-08-20T14:10:00.000Z'),
    },
    {
      id: 902,
      distributorId: santaCruz,
      name: 'Av. Cañoto - cierre por obras',
      description: 'Cierre temporal entre el primer y segundo anillo.',
      restrictionType: 'CLOSED_ROAD',
      effect: 'NO_TRANSIT',
      severity: 'WARNING',
      geometryGeoJson: {
        type: 'LineString',
        coordinates: [
          [-63.1884, -17.7788],
          [-63.1861, -17.7816],
          [-63.184, -17.7843],
          [-63.1817, -17.787],
        ],
      },
      isActive: true,
      schedules: [],
      vehicleRules: [],
      ...audit('2026-08-22T11:40:00.000Z'),
    },
    {
      id: 903,
      distributorId: warnes,
      name: 'Rotación de placas - lunes',
      description: 'No circulan vehículos cuyo primer bloque numérico termina en 1 o 2.',
      restrictionType: 'PLATE_ROTATION',
      effect: 'NO_VEHICLE',
      severity: 'BLOCKING',
      geometryGeoJson: null,
      isActive: true,
      schedules: [
        schedule(
          1402,
          {
            validFrom: null,
            validTo: null,
            dayOfWeek: 1,
            startTime: null,
            endTime: null,
          },
          '2026-08-23T09:15:00.000Z',
        ),
      ],
      vehicleRules: [
        vehicleRule(
          1802,
          {
            plateLastDigit: 1,
            minCapacityWeightKg: null,
            truckType: null,
            plate: null,
          },
          '2026-08-23T09:15:00.000Z',
        ),
        vehicleRule(
          1803,
          {
            plateLastDigit: 2,
            minCapacityWeightKg: null,
            truckType: null,
            plate: null,
          },
          '2026-08-23T09:15:00.000Z',
        ),
      ],
      ...audit('2026-08-23T09:15:00.000Z'),
    },
  ]
}

function writeStored(restrictions: PlanningRestriction[]): void {
  try {
    const serialized = JSON.stringify(restrictions)
    localStorage.setItem(STORAGE_KEY, serialized)
    sessionStorage.setItem(STORAGE_KEY, serialized)
  } catch {
    // Zustand conserva la publicación atómica en memoria cuando storage no está disponible.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function hasAuditShape(value: Record<string, unknown>): boolean {
  return (
    typeof value.createdBy === 'string' &&
    typeof value.updatedBy === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string' &&
    (value.deletedAt === null || typeof value.deletedAt === 'string')
  )
}

function referenceIssues(draft: PlanningRestrictionDraft): ValidationIssue[] {
  return DISTRIBUIDORAS.some((distributor) => distributor.id === draft.distributorId)
    ? []
    : [{ field: 'distributorId', message: 'La distribuidora seleccionada no existe en el maestro.' }]
}

function looksLikeRestriction(value: unknown): value is PlanningRestriction {
  if (!isRecord(value) || !hasAuditShape(value)) return false
  if (
    typeof value.id !== 'number' ||
    typeof value.distributorId !== 'number' ||
    typeof value.name !== 'string' ||
    typeof value.isActive !== 'boolean' ||
    !Array.isArray(value.schedules) ||
    !Array.isArray(value.vehicleRules)
  ) {
    return false
  }
  if (
    !value.schedules.every((row) => isRecord(row) && typeof row.id === 'number' && hasAuditShape(row)) ||
    !value.vehicleRules.every((row) => isRecord(row) && typeof row.id === 'number' && hasAuditShape(row))
  ) {
    return false
  }
  try {
    const draft = restrictionToDraft(value as unknown as PlanningRestriction)
    return validateRestrictionDraft(draft).length === 0 && referenceIssues(draft).length === 0
  } catch {
    return false
  }
}

function hasUniqueStoredIds(restrictions: PlanningRestriction[]): boolean {
  const unique = (ids: number[]) => new Set(ids).size === ids.length
  return (
    unique(restrictions.map((restriction) => restriction.id)) &&
    unique(restrictions.flatMap((restriction) => restriction.schedules.map((row) => row.id))) &&
    unique(restrictions.flatMap((restriction) => restriction.vehicleRules.map((row) => row.id)))
  )
}

function readStored(): PlanningRestriction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY)
    if (raw === null) {
      const seed = demoRestrictions()
      writeStored(seed)
      return seed
    }
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.every(looksLikeRestriction) && hasUniqueStoredIds(parsed)) return parsed
  } catch {
    // Un JSON local inválido no bloquea el catálogo de demostración.
  }
  const seed = demoRestrictions()
  writeStored(seed)
  return seed
}

function nowIso(): string {
  return new Date().toISOString()
}

function nextRestrictionId(restrictions: PlanningRestriction[]): number {
  return restrictions.reduce((max, restriction) => Math.max(max, restriction.id), 900) + 1
}

function nextScheduleId(restrictions: PlanningRestriction[]): number {
  return restrictions.reduce(
    (max, restriction) => restriction.schedules.reduce((childMax, child) => Math.max(childMax, child.id), max),
    1400,
  ) + 1
}

function nextVehicleRuleId(restrictions: PlanningRestriction[]): number {
  return restrictions.reduce(
    (max, restriction) => restriction.vehicleRules.reduce((childMax, child) => Math.max(childMax, child.id), max),
    1800,
  ) + 1
}

function normalizedDraft(draft: PlanningRestrictionDraft): PlanningRestrictionDraft {
  return {
    ...structuredClone(draft),
    name: draft.name.trim(),
    description: draft.description?.trim() || null,
    schedules: draft.schedules.map((row) => ({ ...row })),
    vehicleRules: draft.vehicleRules.map((row) => ({
      ...row,
      truckType: row.truckType?.trim() || null,
      plate: row.plate?.trim().toUpperCase() || null,
    })),
  }
}

function buildRestriction(
  id: number,
  draft: PlanningRestrictionDraft,
  schedules: PlanningRestrictionSchedule[],
  vehicleRules: PlanningRestrictionVehicleRule[],
  auditFields: AuditFields,
): PlanningRestriction {
  const common = {
    id,
    distributorId: draft.distributorId,
    name: draft.name,
    description: draft.description,
    effect: draft.effect,
    severity: draft.severity,
    isActive: draft.isActive,
    schedules,
    vehicleRules,
    ...auditFields,
  }
  if (draft.restrictionType === 'RESTRICTED_AREA') {
    return {
      ...common,
      restrictionType: 'RESTRICTED_AREA',
      geometryGeoJson: structuredClone(draft.geometryGeoJson) as PolygonGeoJson,
    }
  }
  if (draft.restrictionType === 'CLOSED_ROAD') {
    return {
      ...common,
      restrictionType: 'CLOSED_ROAD',
      geometryGeoJson: structuredClone(draft.geometryGeoJson) as LineStringGeoJson,
    }
  }
  return { ...common, restrictionType: 'PLATE_ROTATION', geometryGeoJson: null }
}

function childConflictIssues(
  existing: PlanningRestriction,
  draft: PlanningRestrictionDraft,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const schedules = new Map(existing.schedules.map((row) => [row.id, row]))
  draft.schedules.forEach((row, index) => {
    if (row.id !== undefined && (!schedules.has(row.id) || schedules.get(row.id)?.deletedAt !== null)) {
      issues.push({ field: `schedules[${index}].id`, message: 'El horario no pertenece al agregado activo.' })
    }
  })
  const rules = new Map(existing.vehicleRules.map((row) => [row.id, row]))
  draft.vehicleRules.forEach((row, index) => {
    if (row.id !== undefined && (!rules.has(row.id) || rules.get(row.id)?.deletedAt !== null)) {
      issues.push({ field: `vehicleRules[${index}].id`, message: 'La regla no pertenece al agregado activo.' })
    }
  })
  return issues
}

function replaceSchedules(
  allRestrictions: PlanningRestriction[],
  existing: PlanningRestrictionSchedule[],
  requested: RestrictionScheduleDraft[],
  changedAt: string,
): PlanningRestrictionSchedule[] {
  const requestedById = new Map(
    requested.flatMap((row) => (row.id === undefined ? [] : [[row.id, row] as const])),
  )
  const history = existing.map((row) => {
    if (row.deletedAt !== null) return row
    const replacement = requestedById.get(row.id)
    if (!replacement) {
      return { ...row, deletedAt: changedAt, updatedAt: changedAt, updatedBy: LOCAL_USER }
    }
    return {
      ...row,
      validFrom: replacement.validFrom,
      validTo: replacement.validTo,
      dayOfWeek: replacement.dayOfWeek,
      startTime: replacement.startTime,
      endTime: replacement.endTime,
      updatedAt: changedAt,
      updatedBy: LOCAL_USER,
    }
  })
  let nextId = nextScheduleId(allRestrictions)
  const created = requested
    .filter((row) => row.id === undefined)
    .map((row) => schedule(nextId++, row, changedAt))
  return [...history, ...created]
}

function replaceVehicleRules(
  allRestrictions: PlanningRestriction[],
  existing: PlanningRestrictionVehicleRule[],
  requested: RestrictionVehicleRuleDraft[],
  changedAt: string,
): PlanningRestrictionVehicleRule[] {
  const requestedById = new Map(
    requested.flatMap((row) => (row.id === undefined ? [] : [[row.id, row] as const])),
  )
  const history = existing.map((row) => {
    if (row.deletedAt !== null) return row
    const replacement = requestedById.get(row.id)
    if (!replacement) {
      return { ...row, deletedAt: changedAt, updatedAt: changedAt, updatedBy: LOCAL_USER }
    }
    return {
      ...row,
      plateLastDigit: replacement.plateLastDigit,
      minCapacityWeightKg: replacement.minCapacityWeightKg,
      truckType: replacement.truckType,
      plate: replacement.plate,
      updatedAt: changedAt,
      updatedBy: LOCAL_USER,
    }
  })
  let nextId = nextVehicleRuleId(allRestrictions)
  const created = requested
    .filter((row) => row.id === undefined)
    .map((row) => vehicleRule(nextId++, row, changedAt))
  return [...history, ...created]
}

interface PlanningRestrictionsState {
  restrictions: PlanningRestriction[]
  createRestriction: (draft: PlanningRestrictionDraft) => RestrictionStoreResult
  replaceRestriction: (id: number, draft: PlanningRestrictionDraft) => RestrictionStoreResult
  setRestrictionActive: (id: number, isActive: boolean) => void
  softDeleteRestriction: (id: number) => void
  resetDemoRestrictions: () => void
}

export const usePlanningRestrictionsStore = create<PlanningRestrictionsState>((set, get) => ({
  restrictions: readStored(),

  createRestriction: (input) => {
    const draft = normalizedDraft(input)
    const issues = [...validateRestrictionDraft(draft), ...referenceIssues(draft)]
    draft.schedules.forEach((row, index) => {
      if (row.id !== undefined) {
        issues.push({ field: `schedules[${index}].id`, message: 'Un horario nuevo no puede traer id.' })
      }
    })
    draft.vehicleRules.forEach((row, index) => {
      if (row.id !== undefined) {
        issues.push({ field: `vehicleRules[${index}].id`, message: 'Una regla nueva no puede traer id.' })
      }
    })
    if (issues.length > 0) return { ok: false, issues }

    const restrictions = get().restrictions
    const createdAt = nowIso()
    let scheduleId = nextScheduleId(restrictions)
    let ruleId = nextVehicleRuleId(restrictions)
    const schedules = draft.schedules.map((row) => schedule(scheduleId++, row, createdAt))
    const vehicleRules = draft.vehicleRules.map((row) => vehicleRule(ruleId++, row, createdAt))
    const created = buildRestriction(
      nextRestrictionId(restrictions),
      draft,
      schedules,
      vehicleRules,
      audit(createdAt),
    )
    const next = [created, ...restrictions]
    writeStored(next)
    set({ restrictions: next })
    return { ok: true, restriction: created }
  },

  replaceRestriction: (id, input) => {
    const draft = normalizedDraft(input)
    const restrictions = get().restrictions
    const existing = restrictions.find((restriction) => restriction.id === id && restriction.deletedAt === null)
    if (!existing) {
      return { ok: false, issues: [{ field: 'id', message: 'La restricción ya no está disponible.' }] }
    }
    if (draft.restrictionType !== existing.restrictionType) {
      return {
        ok: false,
        issues: [{ field: 'restrictionType', message: 'El tipo es inmutable después de crear la restricción.' }],
      }
    }
    const issues = [
      ...validateRestrictionDraft(draft),
      ...referenceIssues(draft),
      ...childConflictIssues(existing, draft),
    ]
    if (issues.length > 0) return { ok: false, issues }

    const changedAt = nowIso()
    const replacement = buildRestriction(
      id,
      draft,
      replaceSchedules(restrictions, existing.schedules, draft.schedules, changedAt),
      replaceVehicleRules(restrictions, existing.vehicleRules, draft.vehicleRules, changedAt),
      {
        createdBy: existing.createdBy,
        createdAt: existing.createdAt,
        updatedBy: LOCAL_USER,
        updatedAt: changedAt,
        deletedAt: null,
      },
    )
    const next = restrictions.map((restriction) => (restriction.id === id ? replacement : restriction))
    writeStored(next)
    set({ restrictions: next })
    return { ok: true, restriction: replacement }
  },

  setRestrictionActive: (id, isActive) => {
    const changedAt = nowIso()
    const next = get().restrictions.map((restriction) =>
      restriction.id === id && restriction.deletedAt === null
        ? { ...restriction, isActive, updatedAt: changedAt, updatedBy: LOCAL_USER }
        : restriction,
    ) as PlanningRestriction[]
    writeStored(next)
    set({ restrictions: next })
  },

  softDeleteRestriction: (id) => {
    const changedAt = nowIso()
    const next = get().restrictions.map((restriction) => {
      if (restriction.id !== id || restriction.deletedAt !== null) return restriction
      return {
        ...restriction,
        isActive: false,
        deletedAt: changedAt,
        updatedAt: changedAt,
        updatedBy: LOCAL_USER,
        schedules: restriction.schedules.map((row) =>
          row.deletedAt === null
            ? { ...row, deletedAt: changedAt, updatedAt: changedAt, updatedBy: LOCAL_USER }
            : row,
        ),
        vehicleRules: restriction.vehicleRules.map((row) =>
          row.deletedAt === null
            ? { ...row, deletedAt: changedAt, updatedAt: changedAt, updatedBy: LOCAL_USER }
            : row,
        ),
      }
    }) as PlanningRestriction[]
    writeStored(next)
    set({ restrictions: next })
  },

  resetDemoRestrictions: () => {
    const restrictions = demoRestrictions()
    writeStored(restrictions)
    set({ restrictions })
  },
}))

export function findRestriction(id: number): PlanningRestriction | undefined {
  return usePlanningRestrictionsStore.getState().restrictions.find((restriction) => restriction.id === id)
}

export function validateStoredRestriction(restriction: PlanningRestriction): ValidationIssue[] {
  return validateRestrictionDraft(restrictionToDraft(restriction))
}
