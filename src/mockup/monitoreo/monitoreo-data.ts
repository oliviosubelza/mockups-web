// Dataset simulado del MONITOREO. Es la proyección de última milla: `delivery_orders` (una fila por
// parada de cada orden de transporte) más la posición del camión.
//
// Se DERIVA de ORDENES_TRANSPORTE en vez de escribirse a mano, por la misma razón que el resto del
// mock: los conteos del listado, los pines del mapa y el panel de paradas tienen que cuadrar entre sí.
// Si el progreso fuera un número suelto, la barra diría "7 de 12" y el mapa mostraría otra cosa.
//
// Semilla propia (distinta de la de mock-data) para que el avance de las entregas no se mueva cuando
// se toquen los volúmenes del dataset base, pero siga siendo el MISMO en cada recarga.
//
// ── De dónde sale la posición ──────────────────────────────────────────────────────────────────
// La telemetría no aparece en UltimaVersion.sql porque ese archivo es el esquema RELACIONAL y la
// posición del camión no vive en Postgres: vive en DynamoDB, tabla `truck_tracking`
// (UltimaVersion.sql:498-556). La última posición conocida sale del ítem ACTUAL —
// PK `FLEET#{distributorId}`, SK `TRIP#{tripId}`, overwrite en cada ping. No hace falta ninguna tabla
// nueva. `delivery_orders.arrival_latitude/longitude` (dónde el chofer marcó la llegada) y
// `proof_of_deliveries.gps_lat/lon` (dónde se capturó el comprobante) son otra cosa: eventos
// discretos de una parada, no una traza.
//
// Este generador NO guarda valores derivados de la telemetría: SIEMBRA los ítems crudos en
// `tracking-dynamo` y se queda con el ítem ACTUAL tal cual sale de la tabla. Antes acá vivían
// `posicion: LatLngTuple` y `ultimaSenalMin: number`, o sea el resultado del cálculo sin el dato de
// origen: de un "37" no se recupera el `trackedAt`, no se puede comparar contra `receivedAt` para
// distinguir "el GPS no fija" de "el celular buferea sin cobertura", y el número envejece mal. Las dos
// pantallas ahora derivan (`posicionDe`, `minutosSinSenal`), que es lo que van a hacer con el backend.
import { createRand } from '../mock-random'
import {
  CAMIONES,
  DEPOSITO,
  ORDENES_TRANSPORTE,
  aMinutos,
  finVentana,
  paradasDeOrden,
  rutaPorCamionId,
  type Parada,
} from '../mock-data'
import { PRODUCTOS } from '../mock-pools'
import { nearestOrder } from '../map/route-optimizer'
import type { LatLngTuple } from '../map/geo/polyline'
import type { EstadoEntrega, EstadoViaje } from './monitoreo-estado'
import { DISTRIBUIDOR_ACTIVO, sembrarViaje, type ItemActual } from './tracking-dynamo'

const rand = createRand(90210)

/** Hora de salida del turno. Todo el timeline del viaje se cuenta desde acá. */
const SALIDA_MIN = 8 * 60
/** Minutos que se le imputan a cada parada (viaje + descarga). Alcanza para un timeline creíble. */
const MIN_POR_PARADA = 25
/** Minutos en el almacén entre una carga y la siguiente: descargar devoluciones, chequear y cargar. */
const MIN_RECARGA = 45

const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

// ── Formas ───────────────────────────────────────────────────────────────────────────────────

/** Una fila de `delivery_order_histories`. */
export interface EventoEntrega {
  estado: EstadoEntrega
  hora: string
  nota?: string
}

/** Una fila de `delivery_incidents`. */
export interface IncidenciaEntrega {
  id: string
  /** incident_type */
  tipo: string
  /** severity */
  severidad: 'baja' | 'media' | 'alta'
  /** description */
  descripcion: string
  /** requires_return */
  requiereDevolucion: boolean
  /** created_at */
  hora: string
}

/**
 * Una fila de `proof_of_deliveries`. `signature_url` y `photo_url` son TEXT en el esquema; acá solo
 * interesa si existen, porque el panel muestra presencia de evidencia, no la evidencia misma.
 */
export interface ComprobanteEntrega {
  id: string
  /** receiver_name */
  receptor: string
  /** receiver_document */
  documento: string
  /** signature_url != null */
  tieneFirma: boolean
  /** photo_url != null */
  tieneFoto: boolean
  /** captured_at */
  capturadoAt: string
}

/**
 * Un PEDIDO de los que la parada agrupa — una fila de `candidate_orders`, o sea una orden de venta
 * de SAP. Es el nivel que más se confunde: la parada NO es un pedido, la parada agrupa N pedidos.
 * El camión frena una vez y baja los 3 pedidos que ese cliente hizo.
 */
export interface PedidoEntrega {
  id: string
  /** sales_order_id — el número con el que Ventas lo conoce. */
  salesOrder: string
  /** document_id — el documento SAP. */
  documento: string
  canal: string
  pesoKg: number
  volumenM3: number
}

/** Una fila de `delivery_order_items`. Consolidado POR PRODUCTO de la parada. */
export interface ItemEntrega {
  id: string
  /** product_id, resuelto a su nombre */
  producto: string
  unidad: string
  /** planned_qty */
  planificado: number
  /** loaded_qty */
  cargado: number
  /** delivered_qty */
  entregado: number
  /** returned_qty */
  devuelto: number
}

/** Una fila de `delivery_orders`, ya cruzada con su parada para poder pintarla. */
export interface EntregaMonitoreo {
  /** delivery_orders.id */
  id: string
  /** transport_order_id */
  ordenId: string
  /** dispatch_delivery_point_id — el pivote que une la parada planificada con la entrega real. */
  paradaId: string
  /** route_delivery_points.sequence — el orden de visita. */
  secuencia: number
  cliente: string
  puntoEntrega: string
  ventana: string
  pesoKg: number
  volumenM3: number
  /** Los pedidos que esta parada agrupa. Su longitud es el "N pedidos" que se muestra. */
  pedidos: PedidoEntrega[]
  lat: number
  lng: number
  estado: EstadoEntrega
  /** arrived_at */
  llegadaAt: string | null
  /** delivered_at */
  entregaAt: string | null
  /** receiver_name */
  receptor: string
  /** delivery_result_code — solo cuando no se entregó. */
  motivo: string
  /** delivery_incidents de esta entrega. */
  incidencias: IncidenciaEntrega[]
  /** proof_of_deliveries — solo existe si el chofer capturó evidencia. */
  comprobante: ComprobanteEntrega | null
  /** delivery_order_items */
  items: ItemEntrega[]
  /** Se calcula al vuelo: `delivered_at` cayó fuera de la ventana horaria del punto. */
  fueraDeVentana: boolean
  historial: EventoEntrega[]
}

/** Una `transport_order` vista desde el monitoreo. Es la fila del listado maestro. */
export interface OrdenMonitoreo {
  id: string
  codigo: string
  /**
   * `transport_order.trip_id` — la SALIDA física, acotada en el tiempo por `departure_date` →
   * `completed_date`. NO es el camión: un camión hace 2-3 salidas por día y esa clave se descartó a
   * propósito, porque sin cota temporal la traza de la mañana y la de la tarde caen en la misma
   * partición.
   *
   * Es NUMÉRICO porque es la PK de `trips` y porque es la mitad de la clave de Dynamo
   * (`TRIP#{tripId}`): era un string `trip-{ordenId}`, que no existe en ninguna tabla y hacía que la
   * clave del mock no se pudiera comparar con la real.
   *
   * El esquema admite varias órdenes por viaje (`transport_order.trip_id` es muchos a uno y nullable),
   * pero este generador emite estrictamente 1:1 — una orden por viaje, como la regla de abajo. Las
   * pantallas pueden asumir 1:1 sobre estos datos; el backend no.
   */
  tripId: number
  camion: string
  chofer: string
  auxiliar: string
  entregas: EntregaMonitoreo[]
}

/**
 * Un `trip`: el camión saliendo del almacén con UNA carga.
 *
 * UN VIAJE = UNA CARGA = UNA ORDEN DE TRANSPORTE. El chofer no intercala órdenes: sale, entrega toda
 * la orden, vuelve al almacén, recarga y recién ahí arranca la siguiente. Por eso el camión y el
 * chofer se repiten en el listado — son dos salidas distintas del mismo camión, no una sola.
 *
 * Es el flujo de HOY, no una restricción del esquema: `transport_order.trip_id` es muchos a uno, así
 * que el día que unificación meta dos órdenes en una carga el 1:1 se rompe sin migrar nada. Por eso el
 * tracking se guarda por `trip` y no por orden: esa clave es correcta en los dos mundos.
 */
export interface ViajeMonitoreo {
  /** `trips.id`. Numérico: es la PK de la tabla y la mitad de la clave de Dynamo (`TRIP#{tripId}`). */
  tripId: number
  camion: string
  chofer: string
  auxiliar: string
  estado: EstadoViaje
  /** trips.departure_date */
  salida: string
  /** La orden que esta carga entrega. */
  ordenId: string
  /**
   * `trips.driver_employee_id` — el `employeeId` que va en cada ping de la traza. El esquema solo
   * guarda `name_driver_employee`, así que el id no existe en el dataset: se simula a partir del nombre
   * (ver `idEmpleado`). Es un hueco del esquema, no una decisión del mock.
   */
  employeeId: number
  /** Color de la ruta del camión (el mismo que usa el planificador). */
  color: string
  /** Ruta planificada completa: depósito → paradas en orden de visita → depósito. */
  recorrido: LatLngTuple[]
  /** Cuántas paradas ya están cerradas. Es el punto de corte del trazo recorrido vs pendiente. */
  cursor: number
  /**
   * El ítem ACTUAL de `truck_tracking` TAL CUAL sale de la tabla — PK `FLEET#{distributorId}`,
   * SK `TRIP#{tripId}`, DynamoDB y no Postgres. `null` = el camión no salió o ya volvió, o sea que no
   * hay ítem en la partición de la flota.
   *
   * Se guarda el ÍTEM CRUDO y no lo que la pantalla muestra. Antes acá había `posicion`,
   * `ultimaSenalMin` y `bateria`: tres derivados sin su dato de origen. La posición se saca con
   * `posicionDe(tracking)`, los minutos con `minutosSinSenal(tracking.trackedAt, ahora)` y la batería
   * es `tracking.battery` — sin campo duplicado, porque dos copias del mismo porcentaje se
   * desincronizan en el primer ping que actualice una sola.
   */
  tracking: ItemActual | null
}

// ── Construcción ─────────────────────────────────────────────────────────────────────────────

const DEPOT: LatLngTuple = [DEPOSITO.lat, DEPOSITO.lng]

/** Punto intermedio entre dos coordenadas (`t` = 0..1). Simula al camión a mitad de tramo. */
const interpolar = (a: LatLngTuple, b: LatLngTuple, t: number): LatLngTuple => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
]

/**
 * Estado de una parada según dónde está el camión dentro de su recorrido.
 * Antes del cursor está cerrada; justo en el cursor es la parada activa; después, pendiente.
 * La mayoría de las cerradas se entregan bien — el fallo y la devolución son la excepción,
 * igual que en la calle.
 */
function estadoDeParada(indice: number, cursor: number, estadoViaje: EstadoViaje): EstadoEntrega {
  // Todavía no salió del almacén: nada pudo pasar.
  if (estadoViaje === 'pendiente') return 'pendiente'
  if (indice < cursor) {
    if (rand.chance(0.08)) return 'fallido'
    if (rand.chance(0.05)) return 'devuelto'
    return 'entregado'
  }
  // Con el viaje finalizado el cursor vale `total`, así que acá ya no cae ninguna parada.
  if (indice === cursor && estadoViaje === 'en_ruta') return rand.chance(0.35) ? 'en_sitio' : 'en_camino'
  return 'pendiente'
}

/** Timeline de una parada. Cada transición es una fila de `delivery_order_histories`. */
function construirHistorial(
  estado: EstadoEntrega,
  /** Salida de ESTE viaje, no del turno: el segundo viaje del camión arranca más tarde. */
  salida: number,
  llegada: number,
  entrega: number,
  motivo: string,
): EventoEntrega[] {
  const eventos: EventoEntrega[] = [{ estado: 'pendiente', hora: hhmm(salida), nota: 'Orden creada al finalizar el camión' }]
  if (estado === 'pendiente') return eventos

  eventos.push({ estado: 'en_camino', hora: hhmm(llegada - 12) })
  if (estado === 'en_camino') return eventos

  eventos.push({ estado: 'en_sitio', hora: hhmm(llegada) })
  if (estado === 'en_sitio') return eventos

  eventos.push({
    estado,
    hora: hhmm(entrega),
    nota: estado === 'entregado' ? undefined : motivo,
  })
  return eventos
}

export const MOTIVOS_FALLO = ['Cliente ausente', 'Local cerrado', 'Rechazo por faltante', 'Dirección no encontrada']
export const MOTIVOS_DEVOLUCION = ['Producto observado', 'Pedido anulado en puerta']

/** Catálogo de incidencias. En producción esto es `incident_code` + `incident_type` + `severity`. */
const TIPOS_INCIDENCIA: { tipo: string; severidad: IncidenciaEntrega['severidad']; requiereDevolucion: boolean }[] = [
  { tipo: 'Producto dañado', severidad: 'alta', requiereDevolucion: true },
  { tipo: 'Faltante en la carga', severidad: 'media', requiereDevolucion: false },
  { tipo: 'Acceso bloqueado', severidad: 'baja', requiereDevolucion: false },
  { tipo: 'Demora en la descarga', severidad: 'baja', requiereDevolucion: false },
  { tipo: 'Rechazo del cliente', severidad: 'alta', requiereDevolucion: true },
]

/**
 * Incidencias de la entrega. Una parada que falló SIEMPRE deja rastro — si no, el planificador ve un
 * "no entregado" sin explicación y tiene que llamar por teléfono. El resto es la excepción real.
 */
function construirIncidencias(estado: EstadoEntrega, entregaId: string, llegada: number): IncidenciaEntrega[] {
  const cuantas = estado === 'fallido' ? 1 : estado === 'devuelto' ? (rand.chance(0.5) ? 1 : 0) : rand.chance(0.06) ? 1 : 0
  return Array.from({ length: cuantas }, (_, i) => {
    const tipo = rand.pick(TIPOS_INCIDENCIA)
    return {
      id: `inc-${entregaId}-${i + 1}`,
      tipo: tipo.tipo,
      severidad: tipo.severidad,
      descripcion: `${tipo.tipo} reportado por el chofer en el punto.`,
      requiereDevolucion: tipo.requiereDevolucion,
      hora: hhmm(llegada + rand.int(1, 10)),
    }
  })
}

/**
 * Reparte lo CARGADO entre entregado y devuelto según cómo cerró la parada.
 *
 * Exportada porque la usan dos lugares: el generador del dataset y la simulación en vivo cuando cierra
 * una parada en pantalla. Si cada uno tuviera su propia regla, una entrega cerrada en vivo mostraría
 * "Entregado" en la cabecera y 0 unidades entregadas en la pestaña Pedido.
 */
export function repartirItems(items: ItemEntrega[], estado: EstadoEntrega): ItemEntrega[] {
  const cerrada = estado === 'entregado' || estado === 'fallido' || estado === 'devuelto'
  return items.map((item) => {
    const entregado = estado === 'entregado' ? item.cargado : estado === 'devuelto' ? Math.floor(item.cargado / 2) : 0
    return { ...item, entregado, devuelto: cerrada ? item.cargado - entregado : 0 }
  })
}

/**
 * Ítems de la entrega. Las cantidades CUADRAN con el estado, que es la razón de generarlas y no
 * escribirlas: si no cuadraran, la pestaña "Pedido" contradiría al badge de la cabecera.
 */
function construirItems(entregaId: string, estado: EstadoEntrega): ItemEntrega[] {
  const base = rand
    .shuffle(PRODUCTOS)
    .slice(0, rand.int(2, 4))
    .map((producto, i) => {
      const planificado = rand.int(4, 40)
      // Un faltante ocasional en la carga: cargado < planificado. Es el caso que retrata
      // `truck_inventories.variance_qty` (loaded_qty vs expected_qty, UltimaVersion.sql:362); en
      // `delivery_order_items` no hay columna de desvío, solo `planned_qty` y `loaded_qty`.
      const cargado = rand.chance(0.12) ? Math.max(1, planificado - rand.int(1, 3)) : planificado
      return {
        id: `doi-${entregaId}-${i + 1}`,
        producto: producto.nombre,
        unidad: producto.unidad,
        planificado,
        cargado,
        entregado: 0,
        devuelto: 0,
      }
    })
  return repartirItems(base, estado)
}

/**
 * Primer `trips.id` del dataset. Los viajes se numeran corridos desde acá, igual que un BIGSERIAL:
 * el id no dice nada del contenido y no se puede reconstruir desde la orden, que es exactamente el
 * comportamiento de una PK autoincremental. Es un ANCLA de la simulación, no un id escrito a mano —
 * si cambia el volumen del dataset base, los ids se renumeran solos.
 */
const TRIP_ID_BASE = 8_800

/**
 * `trips.driver_employee_id` simulado a partir del nombre del chofer.
 *
 * El esquema NO modela el id: `trips` guarda `name_driver_employee` (un nombre desnormalizado) y
 * `driver_employee_id` no tiene FK declarada (UltimaVersion.sql:206-225). Pero el ping de la traza
 * lleva `employeeId` —es su dato de auditoría, QUIÉN reportó—, así que el mock tiene que producir uno.
 * Un hash del nombre alcanza y es ESTABLE: el mismo chofer da el mismo id en cada recarga, que es la
 * propiedad que importa para que la traza de un viaje no cambie de autor.
 */
function idEmpleado(nombre: string): number {
  let h = 0
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) >>> 0
  return 7_000 + (h % 3_000)
}

interface ViajeBruto {
  placa: string
  ordenes: typeof ORDENES_TRANSPORTE
  paradas: Parada[]
}

/**
 * UN VIAJE POR ORDEN DE TRANSPORTE.
 *
 * Antes esto agrupaba por camión y mezclaba las paradas de las 2-3 órdenes en un solo recorrido
 * (`nearestOrder(DEPOT, ordenes.flatMap(...))`). Retrataba una operación que NO existe: el chofer no
 * intercala órdenes. Sale con una carga, entrega todas sus paradas, vuelve al almacén, recarga y
 * recién ahí arranca la siguiente. Son dos salidas distintas del mismo camión.
 *
 * Consecuencias de modelarlo bien: cada viaje tiene su propio recorrido depósito → paradas → depósito,
 * el mapa muestra solo las paradas de esa orden (no hay "paradas de otras órdenes" que atenuar), y el
 * camión se repite en el listado con horarios de salida distintos.
 *
 * SOLO entran órdenes CON TRIPULACIÓN. `mock-data` deja a propósito un camión sin chofer ni auxiliar
 * para que las pantallas de despacho retraten el caso "sin asignar", pero ese camión nunca salió: en
 * el esquema, un `trip` sin `driver_employee_id` no puede tener `departure_date`.
 */
function construir(): { viajes: ViajeMonitoreo[]; ordenes: OrdenMonitoreo[] } {
  const viajes: ViajeMonitoreo[] = []
  const ordenes: OrdenMonitoreo[] = []

  const despachadas = ORDENES_TRANSPORTE.filter((o) => o.chofer !== '')

  // Instante de referencia de TODA la telemetría sembrada: se toma UNA vez para que los `trackedAt` de
  // los distintos viajes sean comparables entre sí. Si cada viaje llamara a `Date.now()`, dos camiones
  // con la misma antigüedad de señal quedarían fechados con milisegundos distintos por el solo hecho de
  // haberse generado en otro orden.
  const ahora = Date.now()

  // Reloj por camión: la segunda carga del día no puede salir antes de que la primera haya vuelto.
  // Sin esto, dos viajes del mismo camión saldrían los dos a las 08:00 y el listado se contradiría.
  const libreDesde = new Map<string, number>()

  // Las cargas que efectivamente salen: una orden sin paradas no produce viaje. Se resuelve ANTES
  // del bucle porque el estado de cada carga depende de CUÁNTAS tiene su camión, y eso no se puede
  // saber a mitad de la iteración. Ni `nearestOrder` ni `paradasDeOrden` consumen el PRNG, así que
  // adelantarlas no corre el resto del dataset.
  const cargas = despachadas
    .map((orden) => ({ orden, paradas: nearestOrder(DEPOT, paradasDeOrden(orden)) }))
    .filter((carga) => carga.paradas.length > 0)

  // ── UN camión, UNA carga en la calle ────────────────────────────────────────────────
  // Las cargas de un camión son SECUENCIALES: sale, reparte, vuelve, recarga y recién ahí sale otra
  // vez. De ahí salen dos invariantes que un sorteo POR ORDEN no puede respetar, porque decide cada
  // fila sin mirar las otras del mismo camión:
  //
  //   1. Nunca hay dos cargas del mismo camión EN RUTA a la vez — un camión no está en dos lugares.
  //      El listado repetía la misma placa dos veces "En ruta" y el mapa dibujaba DOS pines para un
  //      solo camión, cada uno en una posición distinta.
  //   2. Los estados son MONÓTONOS en el tiempo: primero las finalizadas, después a lo sumo una en
  //      ruta, después las pendientes. Se veía la carga de las 12:00 ya terminada mientras la de las
  //      08:00 seguía en la calle.
  //
  // Por eso el sorteo pasa a ser POR CAMIÓN: se elige CUÁL de sus cargas está en la calle ahora y el
  // resto se deduce. `-1` = todavía no salió (todas pendientes); `n` = ya volvió de todas (todas
  // finalizadas).
  //
  // Las proporciones NO son las del sorteo viejo, y el cambio es a propósito: aquel repartía por
  // ORDEN, así que un 20% de "sin salir" dejaba una de cada cinco filas quieta. Éste reparte por
  // CAMIÓN, y un camión sorteado "sin salir" se lleva sus 2-3 cargas con él — el mismo 20% vaciaba
  // la pantalla. Los dos casos borde se achican a ~10% cada uno porque ya no hacen falta para la
  // cobertura de la UI: un camión con tres cargas y la segunda en curso YA produce una finalizada,
  // una en ruta y una pendiente él solo.
  const cargasPorCamion = new Map<string, number>()
  for (const { orden } of cargas) {
    cargasPorCamion.set(orden.camion, (cargasPorCamion.get(orden.camion) ?? 0) + 1)
  }
  const enCursoPorCamion = new Map<string, number>()
  for (const [placa, n] of cargasPorCamion) {
    const fase = rand.next()
    // < 0.10 el camión no salió · < 0.20 ya cerró la jornada · el resto tiene una carga en la calle.
    enCursoPorCamion.set(placa, fase < 0.1 ? -1 : fase < 0.2 ? n : rand.int(0, n - 1))
  }

  /** Cargas del camión ya emitidas: da el índice de la actual dentro de su jornada. */
  const emitidas = new Map<string, number>()

  cargas.forEach(({ orden, paradas }, i) => {
    const total = paradas.length
    const salidaMin = libreDesde.get(orden.camion) ?? SALIDA_MIN

    // El estado NO se sortea acá: sale de comparar esta carga contra la que el camión tiene en curso.
    const indiceCarga = emitidas.get(orden.camion) ?? 0
    emitidas.set(orden.camion, indiceCarga + 1)
    const enCurso = enCursoPorCamion.get(orden.camion) ?? -1
    const estadoViaje: EstadoViaje =
      indiceCarga < enCurso ? 'finalizado' : indiceCarga === enCurso ? 'en_ruta' : 'pendiente'
    const cursor =
      estadoViaje === 'pendiente' ? 0 : estadoViaje === 'finalizado' ? total : rand.int(1, Math.max(1, total - 1))

    const estados = paradas.map((_, idx) => estadoDeParada(idx, cursor, estadoViaje))

    {
      const entregas: EntregaMonitoreo[] = paradas
        .map((parada, idx) => {
          const estado = estados[idx]
          const llegada = salidaMin + (idx + 1) * MIN_POR_PARADA
          const entrega = llegada + rand.int(4, 14)
          const cerrada = estado === 'entregado' || estado === 'fallido' || estado === 'devuelto'
          const motivo =
            estado === 'fallido' ? rand.pick(MOTIVOS_FALLO) : estado === 'devuelto' ? rand.pick(MOTIVOS_DEVOLUCION) : ''
          const entregaId = `do-${orden.id}-${parada.id}`
          const receptor = estado === 'entregado' ? parada.cliente.split(' ').slice(-2).join(' ') : ''

          return {
            id: entregaId,
            ordenId: orden.id,
            paradaId: parada.id,
            secuencia: idx + 1,
            cliente: parada.cliente,
            puntoEntrega: parada.puntoEntrega,
            ventana: parada.ventana,
            pesoKg: parada.pesoTotal,
            volumenM3: parada.volumenTotal,
            pedidos: parada.pedidos.map((p) => ({
              id: p.id,
              salesOrder: p.salesOrder,
              documento: p.id.replace(/^\D+/, ''),
              canal: p.canal,
              pesoKg: p.peso,
              volumenM3: p.volumen,
            })),
            lat: parada.lat,
            lng: parada.lng,
            estado,
            llegadaAt: estado === 'pendiente' || estado === 'en_camino' ? null : hhmm(llegada),
            entregaAt: cerrada ? hhmm(entrega) : null,
            receptor,
            motivo,
            incidencias: construirIncidencias(estado, entregaId, llegada),
            // Solo la entrega efectiva deja comprobante: un "no entregado" no tiene firma ni receptor.
            comprobante:
              estado === 'entregado'
                ? {
                    id: `pod-${entregaId}`,
                    receptor,
                    documento: `${rand.int(3_000_000, 9_999_999)}`,
                    tieneFirma: true,
                    tieneFoto: rand.chance(0.7),
                    capturadoAt: hhmm(entrega),
                  }
                : null,
            items: construirItems(entregaId, estado),
            fueraDeVentana: cerrada && entrega > aMinutos(finVentana(parada.ventana)),
            historial: construirHistorial(estado, salidaMin, llegada, entrega, motivo),
          }
        })
        .sort((a, b) => a.secuencia - b.secuencia)

      // 1:1 estricto: un viaje por orden. `i` es el índice de la orden despachada, así que el id sale
      // corrido sin huecos, como lo daría la secuencia de la tabla.
      const tripId = TRIP_ID_BASE + i

      ordenes.push({
        id: orden.id,
        codigo: orden.codigo,
        tripId,
        camion: orden.camion,
        chofer: orden.chofer,
        auxiliar: orden.auxiliar,
        entregas,
      })

      // ── El viaje: depósito → paradas de ESTA orden → depósito ──
      const recorrido: LatLngTuple[] = [DEPOT, ...paradas.map((p) => [p.lat, p.lng] as LatLngTuple), DEPOT]
      const desde = recorrido[cursor]
      const hasta = recorrido[Math.min(cursor + 1, recorrido.length - 1)]
      // El color de la ruta se hereda del planificador: el mismo camión tiene que verse del mismo
      // color en las dos pantallas, o el usuario cree que son cosas distintas.
      const camion = CAMIONES.find((c) => c.placa === orden.camion)
      const enRuta = estadoViaje === 'en_ruta'
      const senalVieja = i % 7 === 3
      const employeeId = idEmpleado(orden.chofer)

      // ── Telemetría: se SIEMBRA la tabla, no se guarda el resultado ──
      // Solo un viaje EN RUTA tiene ítems: el que no salió nunca reportó, y al finalizado se le borra
      // el ítem ACTUAL cuando vuelve al almacén (la traza sobrevive hasta que el TTL la limpie).
      //
      // Un puñado de camiones con la señal vieja: es el caso que la columna "Última señal" existe para
      // delatar. Un camión sin GPS se ve igual que uno detenido si nadie lo marca. Y la batería
      // CORRELACIONA con eso a propósito: en la calle, el motivo más común de que un camión deje de
      // reportar es el celular agotándose. Generarlas independientes daría camiones sin señal con 90% de
      // batería, que es justo el caso que no explica nada.
      const tracking = enRuta
        ? sembrarViaje({
            tripId,
            distributorId: DISTRIBUIDOR_ACTIVO,
            employeeId,
            // Lo YA RECORRIDO: depósito, las paradas visitadas y el punto donde está ahora. El resto
            // del `recorrido` todavía no pasó, así que no puede haber pings ahí.
            camino: [...recorrido.slice(0, cursor + 1), interpolar(desde, hasta, 0.55)],
            antiguedadMin: senalVieja ? rand.int(34, 95) : rand.int(0, 4),
            battery: senalVieja ? rand.int(3, 14) : rand.int(35, 98),
            ahora,
          })
        : null

      viajes.push({
        tripId,
        camion: orden.camion,
        chofer: orden.chofer,
        auxiliar: orden.auxiliar,
        estado: estadoViaje,
        salida: hhmm(salidaMin),
        ordenId: orden.id,
        employeeId,
        color: rutaPorCamionId(camion?.id ?? null)?.color ?? '#2563eb',
        recorrido,
        cursor,
        tracking,
      })

      // El camión queda libre recién cuando volvió al almacén: ida + vuelta + recarga.
      libreDesde.set(orden.camion, salidaMin + (total + 1) * MIN_POR_PARADA + MIN_RECARGA)
    }
  })

  return { viajes, ordenes }
}

const { viajes, ordenes } = construir()

export const VIAJES_MONITOREO: ViajeMonitoreo[] = viajes
export const ORDENES_MONITOREO: OrdenMonitoreo[] = ordenes

// ── Consultas ────────────────────────────────────────────────────────────────────────────────

/** El viaje por su `trips.id`. Es también la clave con la que se arma la PK de Dynamo. */
export const viajePorTripId = (tripId: number | null | undefined): ViajeMonitoreo | undefined =>
  tripId == null ? undefined : VIAJES_MONITOREO.find((v) => v.tripId === tripId)

export const ordenPorId = (id: string | null): OrdenMonitoreo | undefined =>
  id ? ORDENES_MONITOREO.find((o) => o.id === id) : undefined

/**
 * Entregas del viaje en orden de visita — lo que se pinta en el mapa.
 *
 * Un viaje es UNA carga de UNA orden, así que esto es exactamente el listado de esa orden. Ya no hace
 * falta juntar entregas de varias órdenes ni atenuar las que no son de la que se abrió.
 */
export const entregasDeViaje = (tripId: number): EntregaMonitoreo[] =>
  ORDENES_MONITOREO.filter((o) => o.tripId === tripId)
    .flatMap((o) => o.entregas)
    .sort((a, b) => a.secuencia - b.secuencia)

export interface ResumenEntregas {
  total: number
  entregadas: number
  fallidas: number
  devueltas: number
  pendientes: number
  /** Cerradas / total. Es el progreso real del viaje. */
  progresoPct: number
  incidencias: number
  fueraDeVentana: number
}

/** Conteos por estado. Lo usan la barra de progreso, la columna del listado y el encabezado. */
export function resumenEntregas(entregas: EntregaMonitoreo[]): ResumenEntregas {
  const cuenta = (e: EstadoEntrega) => entregas.filter((x) => x.estado === e).length
  const entregadas = cuenta('entregado')
  const fallidas = cuenta('fallido')
  const devueltas = cuenta('devuelto')
  const cerradas = entregadas + fallidas + devueltas
  return {
    total: entregas.length,
    entregadas,
    fallidas,
    devueltas,
    pendientes: entregas.length - cerradas,
    progresoPct: entregas.length > 0 ? Math.round((cerradas / entregas.length) * 100) : 0,
    incidencias: entregas.reduce((acc, e) => acc + e.incidencias.length, 0),
    fueraDeVentana: entregas.filter((e) => e.fueraDeVentana).length,
  }
}

// ── Horario planificado ──────────────────────────────────────────────────────────────────────
// La simulación en vivo necesita fechar los eventos que genera. Las fórmulas viven acá y no en el
// hook para que la línea de tiempo simulada sea la MISMA que la del dataset: si el hook inventara
// sus propias horas, una parada cerrada en vivo quedaría fuera de secuencia con las ya cerradas.

// Reciben la SALIDA del viaje y no la del turno: con un viaje por orden, la segunda carga del mismo
// camión sale más tarde, y fechar sus eventos desde las 08:00 los pondría antes de que el camión
// hubiera vuelto del primer viaje.

/** Hora planificada de llegada a la parada `secuencia` (1..n) de un viaje que salió a `salida`. */
export const horaLlegadaPlanificada = (salida: string, secuencia: number): string =>
  hhmm(aMinutos(salida) + secuencia * MIN_POR_PARADA)

/** Hora planificada de cierre de esa parada. El promedio de descarga del dataset. */
export const horaEntregaPlanificada = (salida: string, secuencia: number): string =>
  hhmm(aMinutos(salida) + secuencia * MIN_POR_PARADA + 9)
