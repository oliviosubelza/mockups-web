// Store de planificaciones guardadas en memoria/session (planes_store)
// Mantiene el listado de planes creados durante la sesión para el flujo de demostración.
import { create } from 'zustand'
import { CAMIONES, type EstadoPlan, type Plan, type PlanCamion } from './mock-data'

const STORAGE_KEY = 'mockups-web:planes'
export const PLAN_DISTRIBUIDORA_UNICA = 'DISCRUZ'

type StoredPlan = Omit<Plan, 'estado'> & { estado?: string }

function normalizePlanEstado(estado?: string): EstadoPlan {
  return estado === 'aprobado' ? 'aprobado' : 'borrador'
}

function normalizeStoredPlan(plan: StoredPlan): Plan {
  return {
    ...plan,
    estado: normalizePlanEstado(plan.estado),
    distribuidora: PLAN_DISTRIBUIDORA_UNICA,
  }
}

function readStoredPlanes(): Plan[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map((plan) => normalizeStoredPlan(plan as StoredPlan)) : []
  } catch {
    return []
  }
}

function writeStoredPlanes(planes: Plan[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(planes))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(planes))
  } catch {
    // Si el almacenamiento está deshabilitado se mantiene en memoria Zustand
  }
}

export interface CreatePlanInput {
  distribuidora?: string
  pedidos?: number
  camiones?: number
  creadoPor?: string
  estado?: EstadoPlan
  camionesDetalle?: PlanCamion[]
} 

interface PlanesState {
  planes: Plan[]
  activePlanId: number | null
  addPlan: (input?: CreatePlanInput) => Plan
  saveActivePlan: (input?: CreatePlanInput) => Plan
  updatePlanEstado: (id: number, estado: EstadoPlan) => void
  updateCamionDetalle: (
    planId: number,
    rutaId: string,
    updates: { chofer?: string; camionPlaca?: string },
  ) => void
  beginPlan: () => Plan
  clearPlanes: () => void
  removePlan: (id: number) => void
}

/** ISO (YYYY-MM-DD) fecha de hoy */
function fechaHoy(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function resolvePlanCount(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && value >= 0 ? value : fallback
}

export const usePlanesStore = create<PlanesState>((set, get) => ({
  planes: readStoredPlanes(),
  activePlanId: null,

  addPlan: (input) => {
    const currentPlanes = get().planes
    // Asignar ID autoincremental iniciando en 148 si está vacío, o el máximo actual + 1
    const maxId = currentPlanes.reduce((max, p) => (p.id > max ? p.id : max), 147)
    const newId = maxId + 1

    const newPlan: Plan = {
      id: newId,
      fecha: fechaHoy(),
      estado: input?.estado ?? 'borrador',
      distribuidora: PLAN_DISTRIBUIDORA_UNICA,
      pedidos: resolvePlanCount(input?.pedidos, 24),
      camiones: resolvePlanCount(input?.camiones, 6),
      creadoPor: input?.creadoPor || 'Juan Pérez',
      camionesDetalle: input?.camionesDetalle?.map((c) => ({ ...c, planId: newId })),
    }

    const updated = [newPlan, ...currentPlanes]
    writeStoredPlanes(updated)
    set({ planes: updated, activePlanId: newId })
    return newPlan
  },

  saveActivePlan: (input) => {
    const { activePlanId, planes } = get()
    if (activePlanId === null) return get().addPlan(input)

    const current = planes.find((plan) => plan.id === activePlanId)
    if (!current) return get().addPlan(input)

    const updatedPlan: Plan = {
      ...current,
      fecha: fechaHoy(),
      estado: input?.estado ?? current.estado,
      distribuidora: PLAN_DISTRIBUIDORA_UNICA,
      pedidos: resolvePlanCount(input?.pedidos, current.pedidos),
      camiones: resolvePlanCount(input?.camiones, current.camiones),
      creadoPor: input?.creadoPor || current.creadoPor || 'Juan Pérez',
      camionesDetalle: input?.camionesDetalle
        ? input.camionesDetalle.map((camion) => ({ ...camion, planId: activePlanId }))
        : current.camionesDetalle,
    }

    const updated = planes.map((plan) => (plan.id === activePlanId ? updatedPlan : plan))
    writeStoredPlanes(updated)
    set({ planes: updated, activePlanId })
    return updatedPlan
  },

  updatePlanEstado: (id, estado) => {
    const updated = get().planes.map((plan) => (plan.id === id ? { ...plan, estado } : plan))
    writeStoredPlanes(updated)
    set({ planes: updated })
  },

  updateCamionDetalle: (planId, rutaId, updates) => {
    const { planes } = get()
    const plan = planes.find((p) => p.id === planId)
    if (!plan || !plan.camionesDetalle) return

    const newCamion = updates.camionPlaca ? CAMIONES.find((c) => c.placa === updates.camionPlaca) : undefined

    const updatedCamiones = plan.camionesDetalle.map((c) => {
      if (c.rutaId !== rutaId && c.id !== rutaId) return c
      return {
        ...c,
        ...(updates.chofer !== undefined ? { chofer: updates.chofer } : {}),
        ...(newCamion
          ? {
              id: newCamion.id,
              camionId: newCamion.id,
              placa: newCamion.placa,
              tipo: newCamion.tipo,
              clase: newCamion.clase,
              capacidadKg: (newCamion.capacidadPeso ?? 0) * 1000,
              capacidadVolM3: newCamion.capacidadVolumen ?? 0,
              ocupacionPct:
                newCamion.capacidadPeso > 0
                  ? Math.round((c.cargaKg / (newCamion.capacidadPeso * 1000)) * 100)
                  : 0,
            }
          : {}),
      }
    })

    const updatedPlan: Plan = {
      ...plan,
      camionesDetalle: updatedCamiones,
    }

    const updatedPlanes = planes.map((p) => (p.id === planId ? updatedPlan : p))
    writeStoredPlanes(updatedPlanes)
    set({ planes: updatedPlanes })
  },

  beginPlan: () =>
    get().addPlan({
      estado: 'borrador',
      pedidos: 0,
      camiones: 0,
      camionesDetalle: [],
    }),

  clearPlanes: () => {
    writeStoredPlanes([])
    set({ planes: [], activePlanId: null })
  },

  removePlan: (id) => {
    const updated = get().planes.filter((p) => p.id !== id)
    writeStoredPlanes(updated)
    set((state) => ({ planes: updated, activePlanId: state.activePlanId === id ? null : state.activePlanId }))
  },
}))
