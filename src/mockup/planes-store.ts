// Store de planificaciones guardadas en memoria/session (planes_store)
// Mantiene el listado de planes creados durante la sesión para el flujo de demostración.
import { create } from 'zustand'
import { DISTRIBUIDORAS, type EstadoPlan, type Plan, type PlanCamion } from './mock-data'

const STORAGE_KEY = 'mockups-web:planes'

function readStoredPlanes(): Plan[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
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
  addPlan: (input?: CreatePlanInput) => Plan
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

export const usePlanesStore = create<PlanesState>((set, get) => ({
  planes: readStoredPlanes(),

  addPlan: (input) => {
    const currentPlanes = get().planes
    // Asignar ID autoincremental iniciando en 148 si está vacío, o el máximo actual + 1
    const maxId = currentPlanes.reduce((max, p) => (p.id > max ? p.id : max), 147)
    const newId = maxId + 1

    const newPlan: Plan = {
      id: newId,
      fecha: fechaHoy(),
      estado: input?.estado ?? 'optimizado',
      distribuidora: input?.distribuidora || DISTRIBUIDORAS[0]?.nombre || 'Distribuidora Central',
      pedidos: input?.pedidos && input.pedidos > 0 ? input.pedidos : 24,
      camiones: input?.camiones && input.camiones > 0 ? input.camiones : 6,
      creadoPor: input?.creadoPor || 'Juan Pérez',
      camionesDetalle: input?.camionesDetalle?.map((c) => ({ ...c, planId: newId })),
    }

    const updated = [newPlan, ...currentPlanes]
    writeStoredPlanes(updated)
    set({ planes: updated })
    return newPlan
  },

  clearPlanes: () => {
    writeStoredPlanes([])
    set({ planes: [] })
  },

  removePlan: (id) => {
    const updated = get().planes.filter((p) => p.id !== id)
    writeStoredPlanes(updated)
    set({ planes: updated })
  },
}))
