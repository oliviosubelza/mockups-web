import { create } from 'zustand'
import { ORDENES_TRANSPORTE, type EstadoOrden, type OrdenTransporte, type Plan } from './mock-data'

const STORAGE_KEY = 'mockups-web:transport-orders-v4'
const DEFAULT_CONFIRMATION_TRUCKS = 3

export type TransportOrderEventType =
  | 'DRIVER_ASSIGNED'
  | 'TRUCK_REASSIGNED'
  | 'STATUS_CHANGED'
  | 'ORDER_CREATED'

export interface TransportOrderEvent {
  id: string
  transportOrderId: string
  type: TransportOrderEventType
  actor: string
  occurredAt: string
  previousValue: string
  newValue: string
}

interface PersistedTransportOrders {
  orders: OrdenTransporte[]
  events: TransportOrderEvent[]
}

interface TransportOrdersState extends PersistedTransportOrders {
  assignDriver: (orderId: string, driver: string) => void
  reassignTruck: (orderId: string, truckPlate: string) => void
  changeStatus: (orderId: string, status: EstadoOrden) => void
  createForPlan: (plan: Plan) => void
  reset: () => void
}

const cloneSeed = (): OrdenTransporte[] => {
  const defaultPlates = new Set(
    Array.from(new Set(ORDENES_TRANSPORTE.map((order) => order.camion))).slice(
      0,
      DEFAULT_CONFIRMATION_TRUCKS,
    ),
  )
  return ORDENES_TRANSPORTE
    .filter((order) => defaultPlates.has(order.camion))
    .map((order) => ({
      ...order,
      paradaIds: [...order.paradaIds],
    }))
}

function readPersisted(): PersistedTransportOrders {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { orders: cloneSeed(), events: [] }
    const parsed = JSON.parse(raw) as Partial<PersistedTransportOrders>
    if (!Array.isArray(parsed.orders) || !Array.isArray(parsed.events)) {
      return { orders: cloneSeed(), events: [] }
    }
    return { orders: parsed.orders, events: parsed.events }
  } catch {
    return { orders: cloneSeed(), events: [] }
  }
}

function persist(data: PersistedTransportOrders): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Zustand sigue siendo la fuente durante la sesión si el navegador bloquea el storage.
  }
}

function eventFor(
  orderId: string,
  type: TransportOrderEventType,
  previousValue: string,
  newValue: string,
): TransportOrderEvent {
  const occurredAt = new Date().toISOString()
  return {
    id: `${orderId}-${type}-${occurredAt}`,
    transportOrderId: orderId,
    type,
    actor: 'Juan Pérez',
    occurredAt,
    previousValue,
    newValue,
  }
}

const updateOrder = (
  state: PersistedTransportOrders,
  orderId: string,
  field: 'chofer' | 'camion' | 'estado',
  value: string,
  type: TransportOrderEventType,
): PersistedTransportOrders => {
  const current = state.orders.find((order) => order.id === orderId)
  if (!current || current[field] === value) return state

  const next = {
    orders: state.orders.map((order) =>
      order.id === orderId ? { ...order, [field]: value } as OrdenTransporte : order,
    ),
    events: [...state.events, eventFor(orderId, type, current[field], value)],
  }
  persist(next)
  return next
}

const initial = readPersisted()

export const useTransportOrdersStore = create<TransportOrdersState>((set) => ({
  ...initial,
  assignDriver: (orderId, driver) =>
    set((state) => updateOrder(state, orderId, 'chofer', driver, 'DRIVER_ASSIGNED')),
  reassignTruck: (orderId, truckPlate) =>
    set((state) => updateOrder(state, orderId, 'camion', truckPlate, 'TRUCK_REASSIGNED')),
  changeStatus: (orderId, status) =>
    set((state) => updateOrder(state, orderId, 'estado', status, 'STATUS_CHANGED')),
  createForPlan: (plan) =>
    set((state) => {
      const existingIds = new Set(state.orders.map((order) => order.id))
      const created = (plan.camionesDetalle ?? [])
        .map((truck, index): OrdenTransporte => ({
          id: `plan-${plan.id}-${truck.rutaId}`,
          codigo: `OT-${plan.id}-${String(index + 1).padStart(2, '0')}`,
          camion: truck.placa,
          chofer: truck.chofer,
          auxiliar: truck.auxiliar,
          // En el mock la acción mobile "iniciar ruta" se adelanta para que el monitoreo tenga
          // tracking visible apenas se generan las órdenes.
          estado: 'despachada',
          paradaIds: [...truck.paradaIds],
          paradas: truck.paradas?.map((parada) => ({
            ...parada,
            pedidos: parada.pedidos.map((pedido) => ({ ...pedido })),
          })),
        }))
        .filter((order) => !existingIds.has(order.id) && order.paradaIds.length > 0)

      if (created.length === 0) return state
      const next = {
        orders: [...created, ...state.orders],
        events: [
          ...state.events,
          ...created.map((order) => eventFor(order.id, 'ORDER_CREATED', '', order.codigo)),
        ],
      }
      persist(next)
      return next
    }),
  reset: () => {
    const next = { orders: cloneSeed(), events: [] }
    persist(next)
    set(next)
  },
}))
