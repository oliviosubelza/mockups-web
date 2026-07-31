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
  type CanalId,
  type Parada,
  type PaymentType,
} from '../mock-data'
import {
  firmaDeComprobante,
  fotoDeIncidencia,
  fotosDeComprobante,
  type EvidenciaFoto,
} from '../mock-fotos'
import { APELLIDOS, NOMBRES_PILA, PRODUCTOS } from '../mock-pools'
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
/**
 * Desde cuántas paradas una carga cuenta como LARGA. Las largas arrancan la simulación en el primer
 * tercio del recorrido para que el seguimiento en vivo tenga varias paradas por delante — ver `cursor`.
 * Las produce `CARGAS_CONCENTRADAS` en `mock-data`: los primeros camiones con tripulación no reparten
 * sus paradas entre 2-3 órdenes, las concentran en una.
 */
const PARADAS_CARGA_LARGA = 5

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
  /** `photo_url` (`UltimaVersion.sql:464`) — TEXT. Una incidencia sin foto es una afirmación sin prueba. */
  fotoUrl: string
}

/**
 * Una fila de `proof_of_deliveries`. `signature_url` y `photo_url` son TEXT en el esquema, o sea la
 * URL y no el archivo: acá se produce una URL que resuelve, para que el panel muestre la evidencia.
 *
 * Antes esto eran dos booleanos (`tieneFirma`, `tieneFoto`) y el panel mostraba un badge que decía
 * "hay foto". Un comprobante que no se puede ABRIR no prueba nada, y es justo lo que se le pide a
 * este panel cuando el cliente reclama que no recibió la mercadería.
 */
export interface ComprobanteEntrega {
  id: string
  /** receiver_name */
  receptor: string
  /** receiver_document */
  documento: string
  /**
   * `delivery_orders.receiver_relationship` (`:390`) — el CARGO de quien firmó. Es lo que convierte
   * un nombre suelto en una prueba: "Rodrigo Vaca" no dice nada, "Rodrigo Vaca, encargado de almacén"
   * sí. Ojo: la columna está en `delivery_orders`, no en `proof_of_deliveries` como dice el § 29.
   */
  relacion: string
  /** `signature_url` — data URI de la firma. `null` si el chofer no la capturó. */
  firmaUrl: string | null
  /** `photo_url` — fotos de la entrega. Vacío si no hay ninguna. */
  fotoUrls: string[]
  /** `gps_lat` / `gps_lon` (`:438-439`) — dónde se capturó el comprobante, no dónde está el camión. */
  gpsLat: number
  gpsLon: number
  /** captured_at */
  capturadoAt: string
}

/**
 * Información de COBRO de la parada.
 *
 * ⚠️ **NO TIENE TABLA EN `UltimaVersion.sql`.** Se agrega al mockup para poder discutirla, y está
 * marcada como propuesta en la pantalla. Lo que sí tiene origen hoy:
 *   · `montoTotal` y `formaPago` salen del PEDIDO DE SAP (`Pedido.total`, `Pedido.paymentType`), que
 *     entra por el snapshot de ventas. En nuestro esquema `candidate_orders` (`:176-203`) guarda peso
 *     y volumen, y **ningún monto**.
 *   · El resto —estado del cobro, monto cobrado, recibo, quién cobró— **no existe en ninguna tabla**.
 *
 * Lo que haría falta para que esto sea real: una tabla de cobros por entrega (`delivery_payments`:
 * `delivery_order_id`, `method`, `amount`, `currency`, `receipt_number`, `collected_by`,
 * `collected_at`), más un monto en `candidate_orders` o el pedido de SAP resuelto por servicio.
 */
export interface CobroEntrega {
  /** Lo FACTURADO: `Σ planned_qty × unit_price_snapshot`. Es lo que decía la nota de entrega. */
  facturado: number
  /**
   * Lo que hay que cobrar DE VERDAD: `Σ delivered_qty × unit_price_snapshot`, y solo la parte que no
   * va a crédito. Es distinto de `facturado` en cuanto el cliente rechaza algo, y es la diferencia que
   * hace que la caja del chofer cuadre o no.
   */
  aCobrar: number
  /** Suma de los pagos CONFIRMADOS. */
  cobrado: number
  /** Suma de los QR que el banco todavía no confirmó. Ni cobrado ni perdido: en el aire. */
  enProceso: number
  /** `aCobrar − cobrado − enProceso`. Lo que el cliente quedó debiendo. */
  saldo: number
  estado: 'cobrado' | 'parcial' | 'en_proceso' | 'pendiente' | 'no_corresponde'
  /** Los cobros, en orden de registro. Puede haber varios y de métodos distintos. */
  pagos: PagoEntrega[]
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
  /** Monto del pedido en Bs. Viene de SAP: `candidate_orders` NO tiene columna de monto. */
  total: number
  /** `payment_type` del pedido de SAP. Decide si este pedido se cobra en el punto o va a crédito. */
  formaPago: PaymentType
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
  /**
   * `unit_price_snapshot` — precio unitario congelado al despachar.
   *
   * **Esta columna existe desde el esquema nuevo, y cambia el cobro de raíz.** Antes el monto a
   * cobrar no tenía origen en ninguna tabla y había que traerlo de SAP; ahora sale de acá, y sale
   * MEJOR: lo que se cobra es `delivered_qty × unit_price_snapshot`, o sea **lo que el cliente
   * realmente recibió**. Si rechazó tres cajas, esas tres no se cobran — y eso, con el total de la
   * factura, no se podía calcular.
   */
  precioUnitario: number
}

/**
 * Métodos de cobro. Son los cuatro de la app del chofer (`PaymentMethodType` en el mockup móvil):
 * efectivo, transferencia, QR y cheque.
 */
export type MetodoPago = 'efectivo' | 'transferencia' | 'qr' | 'cheque'

/**
 * UN cobro de la entrega. Son VARIOS por parada: el cliente puede pagar 200 en QR, 300 en efectivo y
 * dejar 500 a deber. Por eso es una lista y no tres campos sueltos — con `montoCobrado` a secas no hay
 * forma de contestar "¿con qué pagó?", que es justo lo que se le pregunta al chofer cuando la caja no
 * cuadra.
 *
 * **Solo el QR tiene tabla hoy**: `delivery_payment_references` (`delivery_order_id`,
 * `collection_payment_id`, `id_qr`, `amount`, `currency`, `status`). Efectivo, transferencia y cheque
 * se registran en la app y **no tienen dónde guardarse** — ver el aviso de la pestaña *Cobro*.
 */
export interface PagoEntrega {
  id: string
  metodo: MetodoPago
  /** `delivery_payment_references.amount` para el QR; sin columna para el resto. */
  monto: number
  /** Nº de recibo, de operación, de cheque, o el `id_qr` del banco. */
  referencia: string
  /** Banco, cuando aplica. `null` en efectivo. */
  banco: string | null
  /**
   * `delivery_payment_references.status`. El QR nace `pendiente` —el banco todavía no confirmó— y
   * pasa a `confirmado`. Los otros tres métodos nacen confirmados: el chofer tiene la plata en la mano.
   */
  estado: 'pendiente' | 'confirmado' | 'expirado'
  hora: string
  /** `delivery_payment_references.collection_payment_id`. Solo QR: es el id de Ms Cobranzas. */
  collectionPaymentId: number | null
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
  /**
   * `dispatch_delivery_points.delivery_point_id` — el puntero al maestro EXTERNO de puntos de entrega.
   * Está acá porque la evidencia (foto del comprobante y de la incidencia) se resuelve por punto, igual
   * que la galería del planificador: la misma parada se ve como el mismo lugar en las dos pantallas.
   */
  puntoEntregaId: string
  /** Canal del cliente. Elige QUÉ tipo de local ilustra la evidencia. */
  canal: CanalId
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
  /** Cobro de la parada. **Sin tabla en el esquema** — ver `CobroEntrega`. */
  cobro: CobroEntrega
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

/**
 * Catálogo de incidencias. En producción esto es `incident_code` + `incident_type` + `severity`.
 * `foto` no es una columna: es QUÉ retrata la evidencia, y decide de dónde sale la imagen (ver
 * `fotoDeIncidencia`). Una incidencia de producto se prueba con la mercadería; una de acceso, con el
 * lugar.
 */
const TIPOS_INCIDENCIA: {
  tipo: string
  severidad: IncidenciaEntrega['severidad']
  requiereDevolucion: boolean
  foto: EvidenciaFoto
}[] = [
  { tipo: 'Producto dañado', severidad: 'alta', requiereDevolucion: true, foto: 'mercaderia' },
  { tipo: 'Faltante en la carga', severidad: 'media', requiereDevolucion: false, foto: 'mercaderia' },
  { tipo: 'Acceso bloqueado', severidad: 'baja', requiereDevolucion: false, foto: 'lugar' },
  { tipo: 'Demora en la descarga', severidad: 'baja', requiereDevolucion: false, foto: 'lugar' },
  { tipo: 'Rechazo del cliente', severidad: 'alta', requiereDevolucion: true, foto: 'lugar' },
]

/**
 * Incidencias de la entrega. Una parada que falló SIEMPRE deja rastro — si no, el planificador ve un
 * "no entregado" sin explicación y tiene que llamar por teléfono. El resto es la excepción real.
 */
function construirIncidencias(
  estado: EstadoEntrega,
  entregaId: string,
  llegada: number,
  parada: Parada,
): IncidenciaEntrega[] {
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
      fotoUrl: fotoDeIncidencia(tipo.foto, parada.puntoEntregaId, parada.canal),
    }
  })
}

/**
 * Cargos posibles de quien recibe. Es `delivery_orders.receiver_relationship` (`:390`), y el catálogo
 * sale de la app del chofer (§ 29 del doc oficial: `ENCARGADO_ALMACEN`).
 */
const RELACIONES = ['Encargado de almacén', 'Administrador', 'Cajero', 'Propietario', 'Jefe de tienda']

/**
 * QUIÉN RECIBIÓ Y FIRMÓ. Es una PERSONA, no el cliente.
 *
 * Esto estaba mal en el mock y la confusión era razonable: el receptor se derivaba del nombre del
 * cliente (`parada.cliente.split(' ').slice(-2)`), así que en "Casa La Ramada" el comprobante decía
 * que había firmado "La Ramada" — un local, no alguien. En el esquema son dos cosas distintas y
 * viven en tablas distintas:
 *
 *   · el CLIENTE  → `dispatch_delivery_points.customer_name` (la cabecera del panel)
 *   · quien FIRMA → `proof_of_deliveries.receiver_name` + `receiver_document` (la pestaña Comprobante)
 *
 * Y la diferencia importa justo cuando el comprobante se usa: si el cliente reclama que no recibió,
 * "firmó Casa La Ramada" no prueba nada, y "firmó Rodrigo Vaca, encargado de almacén, CI 4829102" sí.
 *
 * Se deriva por HASH del id de la entrega y no del PRNG por dos razones: la simulación en vivo tiene
 * que producir el MISMO receptor cuando cierra esa parada (no tiene acceso al PRNG del generador), y
 * consumir el PRNG acá correría todo el dataset de abajo.
 */
export function receptorDe(entregaId: string): { nombre: string; relacion: string; documento: string } {
  // `>>>` y no `>>`: el hash es un entero SIN signo de 32 bits, y el corrimiento con signo lo vuelve
  // negativo arriba de 2^31 — con un índice negativo, el apellido salía `undefined` en ~la mitad de
  // las entregas ("Patricia undefined"). Es el clásico de mezclar `>>>` con `>>` sobre el mismo hash.
  const h = hashTexto(entregaId)
  return {
    nombre: `${NOMBRES_PILA[h % NOMBRES_PILA.length]} ${APELLIDOS[(h >>> 5) % APELLIDOS.length]}`,
    relacion: RELACIONES[(h >>> 11) % RELACIONES.length],
    documento: `${3_000_000 + (h % 6_999_999)}`,
  }
}

/**
 * `proof_of_deliveries` de una entrega efectiva.
 *
 * Exportada por la misma razón que `repartirItems`: la usan el generador del dataset Y la simulación
 * en vivo cuando cierra una parada. Con dos implementaciones, una entrega cerrada en pantalla mostraría
 * un comprobante distinto al de las que ya venían cerradas.
 *
 * El GPS del comprobante NO es la posición del camión: es dónde se capturó la firma, o sea el punto,
 * con un desvío de pocos metros —el chofer firma en la puerta, no clavado en la coordenada del maestro—.
 */
export function construirComprobante(args: {
  entregaId: string
  puntoEntregaId: string
  canal: CanalId
  lat: number
  lng: number
  hora: string
  /** El chofer puede cerrar sin foto: es la excepción, y el panel tiene que poder retratarla. */
  conFoto?: boolean
}): ComprobanteEntrega {
  const desvio = (n: number) => (((hashTexto(args.entregaId + n) % 60) - 30) / 100_000) // ±30 m aprox.
  const quien = receptorDe(args.entregaId)
  return {
    id: `pod-${args.entregaId}`,
    receptor: quien.nombre,
    documento: quien.documento,
    relacion: quien.relacion,
    firmaUrl: firmaDeComprobante(quien.nombre),
    fotoUrls: args.conFoto === false ? [] : fotosDeComprobante(args.puntoEntregaId, args.canal),
    gpsLat: Number((args.lat + desvio(1)).toFixed(6)),
    gpsLon: Number((args.lng + desvio(2)).toFixed(6)),
    capturadoAt: args.hora,
  }
}

/** Hash estable de un string. Se usa para desviar el GPS del comprobante sin consumir el PRNG. */
function hashTexto(texto: string): number {
  let h = 0
  for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) >>> 0
  return h
}

/** Bancos de plaza, para la referencia de transferencias, cheques y QR. */
const BANCOS = ['BNB', 'Banco Unión', 'BCP', 'Banco Ganadero', 'Banco Fassil']

/** Cómo se reparte un cobro entre métodos. Los pesos son a ojo, pero el orden importa: el efectivo
 *  sigue siendo lo más común en reparto, y el cheque lo más raro. */
const METODOS: MetodoPago[] = ['efectivo', 'qr', 'transferencia', 'efectivo', 'qr', 'cheque']

/**
 * Cobro de la parada, DERIVADO de los ítems entregados y de cómo cerró.
 *
 * **Qué cambió con el esquema nuevo:** el monto ya no hay que inventarlo ni traerlo de SAP. Sale de
 * `delivered_qty × unit_price_snapshot`, o sea de lo que el cliente REALMENTE recibió. Un pedido de
 * 12 cajas del que rechazaron 3 se cobra por 9, y eso es exactamente lo que el chofer tiene que
 * llevar de vuelta.
 *
 * **Los pagos son VARIOS y pueden ser parciales.** El cliente paga 200 en QR, 300 en efectivo y deja
 * 500 a deber; eso son dos filas y un saldo, no un booleano. El QR además nace `pendiente`: el banco
 * confirma después, y hasta que confirme la plata no está ni cobrada ni perdida.
 *
 * Todo se deriva por HASH del id de la entrega y no del PRNG, por lo mismo que el receptor: la
 * simulación en vivo tiene que producir los MISMOS cobros cuando cierra esa parada.
 */
export function construirCobro(
  pedidos: PedidoEntrega[],
  items: ItemEntrega[],
  entregaId: string,
  estado: EstadoEntrega,
  horaCierre: string | null,
): CobroEntrega {
  const redondear = (n: number) => Number(n.toFixed(2))
  const h = hashTexto(entregaId)

  // Qué parte de la parada se cobra en el punto. El crédito viaja en el camión pero se cobra en
  // oficina, así que se descuenta en proporción a lo que pesa dentro del total de la parada. En el
  // esquema nuevo esto se podría atribuir ítem por ítem —`delivery_order_items.sales_order_id` ya
  // existe—; el mock lo aproxima porque sus ítems son el consolidado por producto.
  const totalPedidos = pedidos.reduce((acc, p) => acc + p.total, 0)
  const contado = pedidos.filter((p) => p.formaPago !== 'Crédito').reduce((acc, p) => acc + p.total, 0)
  const porcionCobrable = totalPedidos > 0 ? contado / totalPedidos : 0

  const facturado = redondear(items.reduce((acc, i) => acc + i.planificado * i.precioUnitario, 0))
  const cerrada = estado === 'entregado' || estado === 'devuelto'

  // Antes de cerrar, lo que se ESPERA cobrar sale de lo planificado; después, de lo que el cliente
  // realmente recibió. Usar `entregado` en las dos puntas daba cero en toda parada abierta, y el panel
  // decía "no corresponde" en 54 de 87 entregas — o sea, ocultaba la deuda justo antes de cobrarla.
  const base = items.reduce(
    (acc, i) => acc + (cerrada ? i.entregado : i.planificado) * i.precioUnitario,
    0,
  )
  const aCobrar = redondear(base * porcionCobrable)

  // "No corresponde" es UNA sola cosa: no hay nada que cobrar en el punto porque todo va a crédito.
  // No es lo mismo que "todavía no cobró", y confundirlos borra la deuda de la pantalla.
  if (porcionCobrable === 0) {
    return { facturado, aCobrar: 0, cobrado: 0, enProceso: 0, saldo: 0, estado: 'no_corresponde', pagos: [] }
  }
  if (!cerrada) {
    return { facturado, aCobrar, cobrado: 0, enProceso: 0, saldo: aCobrar, estado: 'pendiente', pagos: [] }
  }

  // Uno, dos o tres pagos. Con dos o tres, el reparto es desparejo a propósito: un cliente que paga
  // en dos veces casi nunca parte por la mitad exacta.
  const cuantos = 1 + (h % 3)
  const proporciones = cuantos === 1 ? [1] : cuantos === 2 ? [0.6, 0.4] : [0.45, 0.35, 0.2]
  // Uno de cada cuatro queda debiendo: el último tramo no se paga. Es el caso que hace que el panel
  // tenga que mostrar SALDO y no solo "cobrado".
  const quedaDebiendo = cuantos > 1 && h % 4 === 0

  const registradas = proporciones.slice(0, quedaDebiendo ? proporciones.length - 1 : proporciones.length)
  const ultimo = registradas.length - 1

  const pagos: PagoEntrega[] = registradas
    .map((porcion, i) => {
      const metodo = METODOS[(h >>> (i * 3 + 2)) % METODOS.length]
      const esQr = metodo === 'qr'
      const banco = metodo === 'efectivo' ? null : BANCOS[(h >>> (i * 4 + 5)) % BANCOS.length]
      const id = `pay-${entregaId}-${i + 1}`
      // La referencia se deriva del id del PAGO y no del de la entrega: con el hash de la entrega
      // corrido por el índice, dos pagos de paradas distintas salían con el mismo número de recibo.
      const r = hashTexto(id)
      return {
        id,
        metodo,
        monto: redondear(aCobrar * porcion),
        // El QR se referencia con el `id_qr` del banco; el resto con su comprobante.
        referencia: esQr
          ? `${25_051_501_009_100_000_000n + BigInt(r % 900_000_000)}`
          : metodo === 'cheque'
            ? `CHQ-${100_000 + (r % 899_999)}`
            : metodo === 'transferencia'
              ? `OP-${1_000_000 + (r % 8_999_999)}`
              : `REC-${100_000 + (r % 899_999)}`,
        banco,
        // Solo el QR puede quedar esperando al banco, y solo el ÚLTIMO registrado: los anteriores ya
        // se confirmaron mientras el chofer seguía cobrando. `ultimo` es el índice de la lista que se
        // emite de verdad — usar el del arreglo original hacía que este caso no ocurriera nunca,
        // porque cuando el cliente queda debiendo ese índice se recorta.
        estado: esQr && i === ultimo && h % 3 === 0 ? 'pendiente' : 'confirmado',
        hora: horaCierre ?? '',
        collectionPaymentId: esQr ? 1_000 + (r % 8_999) : null,
      } satisfies PagoEntrega
    })

  const cobrado = redondear(pagos.filter((p) => p.estado === 'confirmado').reduce((a, p) => a + p.monto, 0))
  const enProceso = redondear(pagos.filter((p) => p.estado === 'pendiente').reduce((a, p) => a + p.monto, 0))
  const saldo = redondear(Math.max(0, aCobrar - cobrado - enProceso))

  return {
    facturado,
    aCobrar,
    cobrado,
    enProceso,
    saldo,
    estado:
      saldo > 0 ? (cobrado > 0 || enProceso > 0 ? 'parcial' : 'pendiente') : enProceso > 0 ? 'en_proceso' : 'cobrado',
    pagos,
  }
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
        // `unit_price_snapshot`: el precio CONGELADO al despachar, no el vigente. Por eso es un
        // snapshot: si mañana sube la lista, la entrega de ayer se sigue cobrando a lo de ayer.
        precioUnitario: rand.int(1_200, 48_000) / 100,
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
    // Dónde está el camión dentro de su recorrido. En un viaje EN RUTA el cursor decide cuántas
    // paradas le quedan por delante, y eso es exactamente lo que dura la simulación en vivo (~17 s por
    // parada). Con `rand.int(1, total - 1)` una carga larga podía arrancar en la penúltima parada y la
    // pantalla de seguimiento se terminaba en 20 segundos. Las cargas de 5+ paradas arrancan en el
    // PRIMER TERCIO, así que siempre quedan 4 o más por recorrer.
    const cursorEnRuta =
      total >= PARADAS_CARGA_LARGA
        ? rand.int(1, Math.max(1, Math.ceil(total / 3)))
        : rand.int(1, Math.max(1, total - 1))
    const cursor = estadoViaje === 'pendiente' ? 0 : estadoViaje === 'finalizado' ? total : cursorEnRuta

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
          // Los ítems se arman ANTES del objeto porque el cobro se calcula sobre ellos:
          // `delivered_qty × unit_price_snapshot`.
          const itemsEntrega = construirItems(entregaId, estado)
          // `delivery_orders.receiver_name`: la PERSONA que recibió, no el cliente (que es
          // `parada.cliente` y ya viaja en la fila). Ver `receptorDe`.
          const receptor = estado === 'entregado' ? receptorDe(entregaId).nombre : ''
          const pedidos: PedidoEntrega[] = parada.pedidos.map((p) => ({
            id: p.id,
            salesOrder: p.salesOrder,
            documento: p.id.replace(/^\D+/, ''),
            canal: p.canal,
            pesoKg: p.peso,
            volumenM3: p.volumen,
            total: p.total,
            formaPago: p.paymentType,
          }))

          return {
            id: entregaId,
            ordenId: orden.id,
            paradaId: parada.id,
            secuencia: idx + 1,
            cliente: parada.cliente,
            puntoEntrega: parada.puntoEntrega,
            puntoEntregaId: parada.puntoEntregaId,
            canal: parada.canal,
            ventana: parada.ventana,
            pesoKg: parada.pesoTotal,
            volumenM3: parada.volumenTotal,
            pedidos,
            lat: parada.lat,
            lng: parada.lng,
            estado,
            llegadaAt: estado === 'pendiente' || estado === 'en_camino' ? null : hhmm(llegada),
            entregaAt: cerrada ? hhmm(entrega) : null,
            receptor,
            motivo,
            incidencias: construirIncidencias(estado, entregaId, llegada, parada),
            // Solo la entrega efectiva deja comprobante: un "no entregado" no tiene firma ni receptor.
            comprobante:
              estado === 'entregado'
                ? construirComprobante({
                    entregaId,
                    puntoEntregaId: parada.puntoEntregaId,
                    canal: parada.canal,
                    lat: parada.lat,
                    lng: parada.lng,
                    hora: hhmm(entrega),
                    // 3 de cada 10 entregas cierran sin foto: el panel tiene que retratar el caso.
                    conFoto: rand.chance(0.7),
                  })
                : null,
            items: itemsEntrega,
            cobro: construirCobro(pedidos, itemsEntrega, entregaId, estado, cerrada ? hhmm(entrega) : null),
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
