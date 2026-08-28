import { create } from 'zustand'
import { ORDENES_TRANSPORTE, type EstadoOrden, type OrdenTransporte, type Parada } from './mock-data'

// v6: el seed cambió (ver `cloneSeed`). La versión de la clave es lo ÚNICO que hace que un navegador
// con el estado viejo guardado vea el arreglo — sin subirla, `readPersisted` devuelve el `v5` de siempre
// y la corrección no llega a nadie que ya haya abierto la app.
const STORAGE_KEY = 'mockups-web:transport-orders-v6'

/**
 * Camiones con los que arranca la CONFIRMACIÓN: pocos, porque las órdenes se crean confirmando un
 * plan y arrancar con la flota entera confirmada haría que esa pantalla no tuviera nada que hacer.
 */
const DEFAULT_CONFIRMATION_TRUCKS = 3

/**
 * Camiones con los que arranca el MONITOREO EN VIVO, y por qué esto tuvo que existir.
 *
 * ═══ EL SÍNTOMA ═══
 *
 * «Monitoreo en Vivo» abría con la lista VACÍA. No era intermitente ni dependía del navegador: era así
 * siempre, porque el dataset tiene semilla fija.
 *
 * ═══ LA CAUSA ═══
 *
 * El seed tomaba los tres PRIMEROS camiones del dataset y nada más. Esos tres dan cinco órdenes:
 *
 *   ot1-ot3  5534-QAZ  pendiente / cargando   SIN TRIPULACIÓN
 *   ot4      1202-HJK  cargando
 *   ot5      2809-NBV  pendiente
 *
 * Y `esOrdenMonitoreable` pide `despachada` o `procesado` **con chofer**. Cero de cinco. Peor: el
 * primer camión es justamente el que el generador deja sin tripulación A PROPÓSITO, para retratar el
 * caso «sin asignar» — así que uno de los tres nunca iba a servir.
 *
 * Mientras tanto el dataset completo tiene **14 órdenes monitoreables en 12 camiones**. El seed las
 * tiraba todas.
 *
 * ═══ POR QUÉ NO ALCANZA CON SUBIR `DEFAULT_CONFIRMATION_TRUCKS` ═══
 *
 * Porque son dos preguntas distintas y una no contesta la otra. La confirmación quiere POCOS camiones
 * (si no, no queda nada que confirmar); el monitoreo quiere camiones DESPACHADOS. Subir el número de
 * la confirmación hasta que por casualidad entre un despachado ata una pantalla al azar de la otra: el
 * día que el generador reordene las rutas, el monitoreo se vacía de nuevo y nadie va a saber por qué.
 *
 * Así que el seed pide las dos cosas por su nombre y las une.
 *
 * ═══ Y NO SON LOS PRIMEROS QUE APAREZCAN ═══
 *
 * La primera versión tomaba los tres primeros monitoreables y el resultado fue un viaje de UNA parada:
 * un camión que sale, entrega una vez y termina. Ahí no hay nada que monitorear — el progreso va de
 * 0/1 a 1/1 y la pantalla no llega a mostrar su propio mecanismo. Se eligen los de MÁS PARADAS, que es
 * lo que esta pantalla existe para mirar.
 */
const DEFAULT_MONITORING_TRUCKS = 3

/**
 * Mínimo de paradas para que un viaje sirva de material de monitoreo. Por debajo de esto la
 * simulación en vivo se termina antes de que alguien alcance a mirarla.
 */
const MIN_PARADAS_MONITOREO = 5

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
    planningRouteRefs: string[]
  }) => void
  reset: () => void
}

const cloneSeed = (): OrdenTransporte[] => {
  const placasDe = (ordenes: OrdenTransporte[], cuantas: number) =>
    Array.from(new Set(ordenes.map((order) => order.camion))).slice(0, cuantas)

  const defaultPlates = new Set([
    // Los primeros del dataset: es lo que había, y es lo que la confirmación necesita.
    ...placasDe(ORDENES_TRANSPORTE, DEFAULT_CONFIRMATION_TRUCKS),
    // Y los que de verdad dan material para monitorear: despachados, con chofer y con recorrido largo.
    //
    // La condición de "monitoreable" está escrita acá y no importada de `monitoreo-data` a propósito:
    // importarla ataría el store del listado de OT al módulo del monitoreo por un predicado de tres
    // términos, y este archivo no sabe nada de monitoreo. Si algún día cambia, el
    // `esOrdenMonitoreable` de `monitoreo-data` es el que manda y esto es su espejo.
    //
    // El orden es por CANTIDAD DE PARADAS, descendente. `paradaIds` alcanza y no hace falta resolver
    // las paradas: son los puntos del viaje, que es exactamente lo que se quiere maximizar. El
    // desempate por código deja el resultado estable — el dataset tiene semilla fija, así que si el
    // criterio no fuera total, dos corridas iguales podrían sembrar camiones distintos.
    ...placasDe(
      ORDENES_TRANSPORTE.filter(
        (order) =>
          order.chofer !== '' &&
          (order.estado === 'despachada' || order.estado === 'procesado') &&
          order.paradaIds.length >= MIN_PARADAS_MONITOREO,
      ).sort((a, b) =>
        b.paradaIds.length - a.paradaIds.length || a.codigo.localeCompare(b.codigo),
      ),
      DEFAULT_MONITORING_TRUCKS,
    ),
  ])

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

      if (input.camionId === null || input.paradaIds.length === 0) return state

      const routeKey = [...input.planningRouteRefs].sort().join('|')
      const orderId = routeKey
        ? `planned-routes-${input.camionId}-${routeKey}`
        : `plan-${input.planId ?? 'adhoc'}-${input.camionId}`
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
        planningRouteRefs: [...input.planningRouteRefs],
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
