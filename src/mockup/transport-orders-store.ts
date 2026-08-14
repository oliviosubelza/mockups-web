import { create } from 'zustand'
import { ORDENES_TRANSPORTE, type EstadoOrden, type OrdenTransporte, type Parada } from './mock-data'

const STORAGE_KEY = 'mockups-web:transport-orders-v5'
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
  finalizeConfirmedTrip: (input: {
    planId: number | null
    camionId: string | null
    camion: string
    chofer: string
    auxiliar: string
    paradaIds: string[]
    paradas: Parada[]
    orderIds: string[]
  }) => void
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

function maxNumericCode(orders: OrdenTransporte[]): number {
  return orders.reduce((max, order) => {
    const code = Number.parseInt(order.codigo, 10)
    return Number.isFinite(code) ? Math.max(max, code) : max
  }, 0)
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
  finalizeConfirmedTrip: (input) =>
    set((state) => {
      if (input.orderIds.length > 0) {
        let changed = false
        const ids = new Set(input.orderIds)
        const events: TransportOrderEvent[] = []
        const orders = state.orders.map((order) => {
          if (!ids.has(order.id) || order.estado === 'despachada' || order.estado === 'procesado') return order
          changed = true
          events.push(eventFor(order.id, 'STATUS_CHANGED', order.estado, 'despachada'))
          return { ...order, estado: 'despachada' } satisfies OrdenTransporte
        })
        if (!changed) return state
        const next = { orders, events: [...state.events, ...events] }
        persist(next)
        return next
      }

      if (input.planId === null || input.camionId === null || input.paradaIds.length === 0) return state

      const orderId = `plan-${input.planId}-${input.camionId}`
      const existing = state.orders.find((order) => order.id === orderId)
      const nextCode = existing?.codigo ?? String(maxNumericCode(state.orders) + 1)
      const nextOrder: OrdenTransporte = {
        id: orderId,
        codigo: nextCode,
        camion: input.camion,
        chofer: input.chofer,
        auxiliar: input.auxiliar,
        estado: 'despachada',
        paradaIds: [...input.paradaIds],
        paradas: input.paradas.map((parada) => ({
          ...parada,
          pedidos: parada.pedidos.map((pedido) => ({ ...pedido })),
        })),
      }

      const next = existing
        ? {
            orders: state.orders.map((order) => (order.id === orderId ? nextOrder : order)),
            events:
              existing.estado === 'despachada' || existing.estado === 'procesado'
                ? state.events
                : [...state.events, eventFor(orderId, 'STATUS_CHANGED', existing.estado, 'despachada')],
          }
        : {
            orders: [nextOrder, ...state.orders],
            events: [
              ...state.events,
              eventFor(orderId, 'ORDER_CREATED', '', nextOrder.codigo),
              eventFor(orderId, 'STATUS_CHANGED', 'pendiente', 'despachada'),
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
