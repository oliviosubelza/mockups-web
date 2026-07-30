// La COSTURA entre el mock y DynamoDB. Todo lo que el monitoreo sabe de telemetría entra y sale por
// acá, con la forma EXACTA de los dos ítems de `truck_tracking` (UltimaVersion.sql:498-556,
// DB.puml:489-534, diagrams/monitoreo/README.md:37-56).
//
// ── POR QUÉ ESTE ARCHIVO EXISTE ───────────────────────────────────────────────────────────────
// Antes el mock guardaba en el viaje los valores YA DERIVADOS (`posicion: LatLngTuple`,
// `ultimaSenalMin: number`) y borraba el ítem crudo. Eso hacía que el mock hablara un idioma que el
// backend no habla: no había `trackedAt`, no había `receivedAt`, no había claves, y por lo tanto no
// había nada que probar contra el contrato. El día que exista el endpoint hay que reescribir las
// pantallas, no cablear un fetch.
//
// Acá se ensaya el contrato: el mock GUARDA ítems y DERIVA a la vista, igual que la app real. Lo
// único que cambia cuando llegue el backend es de dónde vienen los ítems.
//
// ── LOS DOS ÍTEMS, Y POR QUÉ SON DOS ─────────────────────────────────────────────────────────
// Cada ping escribe DOS ítems en la misma tabla. Es la denormalización que Dynamo pide a cambio de
// que las dos preguntas del monitor cuesten una Query cada una:
//
//   A) TRAZA   PK = TRIP#{tripId}           SK = TS#{trackedAt}    append, TTL 30 días
//              "¿por dónde anduvo ESTE viaje?"
//   B) ACTUAL  PK = FLEET#{distributorId}   SK = TRIP#{tripId}     overwrite
//              "¿dónde está TODA la flota del distribuidor?" — en UNA sola Query, no en N.
//
// ── NOMBRES DE ATRIBUTO EN INGLÉS, A PROPÓSITO ───────────────────────────────────────────────
// El resto del mock usa identificadores en español (`ViajeMonitoreo`, `posicion`, `entrega`) porque
// son nombres NUESTROS. `latitude`, `longitude`, `battery`, `trackedAt`, `receivedAt`, `employeeId`,
// `tripId`, `distributorId` y `expiresAt` NO se traducen: son el contrato literal del ítem, las claves
// del JSON que va a viajar por el cable. Traducirlas acá obligaría a un mapeo en cada borde y sería
// exactamente la mentira que este archivo viene a sacar.
import { createRand } from '../mock-random'
import { DISTRIBUIDORAS } from '../mock-data'
import type { LatLngTuple } from '../map/geo/polyline'

// Semilla propia: el ruido de la telemetría (atraso de subida, jitter del intervalo de ping) no tiene
// que moverse cuando se toque el avance de las entregas, y viceversa.
const rand = createRand(31_337)

// ── Formas de los ítems ──────────────────────────────────────────────────────────────────────

/**
 * A) TRAZA — un ítem POR PING, append-only. Es el recorrido real del camión.
 *
 * `trackedAt` NO es un atributo suelto: viaja DENTRO de la `sk` (`TS#{trackedAt}`), que es lo que
 * ordena la traza por tiempo dentro de la partición del viaje. Para leerlo está `trackedAtDeSk`.
 * Duplicarlo como atributo sería tener el mismo dato en dos lugares del mismo ítem, con la
 * posibilidad de que discrepen.
 */
export interface ItemTraza {
  /** `TRIP#{tripId}` */
  pk: string
  /** `TS#{trackedAt}` — ISO 8601 en UTC, que ordena lexicográficamente igual que cronológicamente. */
  sk: string
  latitude: number
  longitude: number
  /** Batería del dispositivo del chofer (%). Explica la mayoría de los cortes de señal. */
  battery: number
  /** `trips.driver_employee_id` — QUIÉN reportó. Es el dato de auditoría del ping. */
  employeeId: number
  /** Reloj del SERVIDOR: cuándo llegó el paquete. Ver la nota de los dos relojes, abajo. */
  receivedAt: string
  /**
   * Atributo de TTL: epoch en SEGUNDOS (es el formato que Dynamo exige). Nadie lo lee ni lo borra a
   * mano — se declara una vez en la tabla como atributo de TTL y Dynamo resuelve el vencimiento por
   * su cuenta, en background. Está en el ítem sólo para que el ping nazca con su fecha de muerte.
   */
  expiresAt: number
}

/**
 * B) ACTUAL — un ítem POR VIAJE ACTIVO, overwrite en cada ping. Existe SOLO para poder listar la
 * flota entera de un distribuidor en una sola Query: con la PK de la traza harían falta N consultas,
 * una por camión.
 *
 * Acá `trackedAt` SÍ es un atributo, porque la `sk` la ocupa el viaje. Es el mismo dato con otro
 * lugar de residencia, y es la razón de que las dos formas no sean intercambiables.
 */
export interface ItemActual {
  /** `FLEET#{distributorId}` */
  pk: string
  /** `TRIP#{tripId}` */
  sk: string
  latitude: number
  longitude: number
  battery: number
  /** Reloj del DISPOSITIVO: cuándo el GPS fijó la posición. */
  trackedAt: string
  /** Reloj del SERVIDOR: cuándo llegó el paquete. */
  receivedAt: string
}

// ── Claves ───────────────────────────────────────────────────────────────────────────────────
// POR QUÉ LAS CLAVES SON STRINGS COMPUESTOS Y NO DOS COLUMNAS.
//
// En Postgres esto serían columnas: `trip_id BIGINT`, `tracked_at TIMESTAMP`. En Dynamo single-table
// no: una tabla guarda TIPOS DE ÍTEM distintos en la misma partición-key, y lo que los distingue es el
// PREFIJO del valor de la clave (`TRIP#`, `FLEET#`, `TS#`). Ese prefijo es lo que permite que la traza
// de un viaje y la posición de una flota convivan en la misma tabla sin colisionar, y lo que hace que
// `begins_with(sk, 'TRIP#')` sea una consulta y no un scan.
//
// El mock COMPONE los strings en vez de guardar campos sueltos porque es la única forma de que la
// forma siga siendo honesta: si el mock guardara `{ tripId: 8801 }`, la primera vez que alguien
// escriba la Query real descubriría que le falta el prefijo, que el orden de la SK importa, y que
// `trackedAt` no es un campo sino parte de la clave.

const PREFIJO_TRIP = 'TRIP#'
const PREFIJO_FLEET = 'FLEET#'
const PREFIJO_TS = 'TS#'

/** PK de la TRAZA: la partición es el viaje. */
export const pkTrip = (tripId: number): string => `${PREFIJO_TRIP}${tripId}`

/** SK de la TRAZA: el instante del dispositivo, en ISO UTC para que el orden lexicográfico sea el cronológico. */
export const skTs = (trackedAt: string): string => `${PREFIJO_TS}${trackedAt}`

/** PK del ACTUAL: la partición es el distribuidor — de ahí que la flota entera salga en una Query. */
export const pkFleet = (distributorId: number): string => `${PREFIJO_FLEET}${distributorId}`

/** SK del ACTUAL: el viaje dentro de la flota. */
export const skTrip = (tripId: number): string => `${PREFIJO_TRIP}${tripId}`

/**
 * Recupera el `tripId` de una `sk` de ítem ACTUAL. Es la mitad que falta del merge del listado:
 * Postgres trae `transport_order.trip_id` y Dynamo trae `SK = TRIP#{tripId}`; cruzarlos exige
 * des-componer la clave. Devuelve `null` si la `sk` no es de este tipo de ítem — un ítem de otro tipo
 * en la misma tabla es lo NORMAL en single-table, no un error.
 */
export function tripIdDeSk(sk: string): number | null {
  if (!sk.startsWith(PREFIJO_TRIP)) return null
  const n = Number(sk.slice(PREFIJO_TRIP.length))
  return Number.isFinite(n) ? n : null
}

/**
 * Recupera el `trackedAt` de una `sk` de ítem TRAZA. Existe por la misma razón que el de arriba: en la
 * traza el instante del dispositivo ES la clave de ordenamiento, así que leerlo es des-componerla.
 */
export function trackedAtDeSk(sk: string): string | null {
  return sk.startsWith(PREFIJO_TS) ? sk.slice(PREFIJO_TS.length) : null
}

// ── Scope del distribuidor ───────────────────────────────────────────────────────────────────

/**
 * `distributorId` del monitoreo. Los cuatro endpoints web están acotados por él
 * (`?distributorId={id}`) y la PK del ítem ACTUAL es `FLEET#{distributorId}`, así que sin scope no hay
 * ni Query ni stream: son una partición y una suscripción POR DISTRIBUIDOR.
 *
 * El mock trabaja con UNA distribuidora —la primera del maestro, no un número escrito a mano— porque
 * el selector de distribuidora es una pantalla que todavía no existe. Lo que importa del ensayo es que
 * el scope EXISTA y viaje hasta la clave, no que se pueda cambiar.
 */
export const DISTRIBUIDOR_ACTIVO: number = DISTRIBUIDORAS[0].id

// ── Umbrales y cadencias ─────────────────────────────────────────────────────────────────────

/**
 * A partir de cuántos minutos sin ping se considera que el camión DEJÓ DE REPORTAR.
 *
 * El número no es redondo por gusto. La app del chofer reporta cada 10-15 s en movimiento
 * (Secuencia.puml, página 1), así que 15 min son entre 60 y 90 pings consecutivos perdidos: dos
 * órdenes de magnitud por encima de un túnel, una zona sin cobertura o un reintento. Nada normal se
 * parece a eso.
 *
 * El otro borde también importa: el ping se CORTA cuando el camión está detenido, así que un silencio
 * corto es compatible con una descarga y no puede alarmar. 15 min está arriba de la descarga típica y
 * abajo de la parada más larga que el dataset modela.
 *
 * Vivía escrito dos veces como `> 15` (MonitoreoView y SeguimientoMapa), sin ninguna justificación y
 * con el riesgo de que la tabla y el mapa discreparan sobre qué camión está caído.
 */
export const UMBRAL_SENAL_VIEJA_MIN = 15

/** Intervalo del ping en movimiento, en ms. Es el documentado, no una elección del mock. */
export const PING_MIN_MS = 10_000
export const PING_MAX_MS = 15_000

/** Días que vive un ítem de la traza. Es el TTL de la tabla. */
const TTL_DIAS = 30

/**
 * Cuántos pings emite el mock por tramo (parada → parada) al sembrar la traza.
 *
 * SIMPLIFICACIÓN DECLARADA: a 12 s de cadencia, los 25 min que el dataset le imputa a cada parada
 * darían ~125 pings por tramo y ~4.000 ítems por viaje. La CADENCIA entre ítems consecutivos sí es la
 * documentada (10-15 s); lo que el mock comprime es la DURACIÓN total de la traza, que queda como una
 * ventana reciente del recorrido en vez de la jornada completa. Ninguna pantalla dibuja la traza
 * entera —el mapa dibuja el recorrido PLANIFICADO—, así que la única propiedad que hace falta
 * conservar es que los ítems existan, estén ordenados y el último sea la posición actual.
 */
const PINGS_POR_TRAMO = 8

// ── La "tabla" ───────────────────────────────────────────────────────────────────────────────
// Dos Maps que imitan las dos semánticas de escritura, no un array de todo junto: la traza es APPEND
// (una lista por partición) y el actual es OVERWRITE (un ítem por par pk+sk). Colapsarlas en una sola
// colección haría que el mock aceptara escrituras que la tabla real rechaza o pisa.

/** pk (`TRIP#…`) → ítems de traza, siempre ordenados por `sk` ascendente. */
const TRAZA = new Map<string, ItemTraza[]>()

/** pk (`FLEET#…`) → sk (`TRIP#…`) → ítem. El Map interno ES el overwrite. */
const ACTUAL = new Map<string, Map<string, ItemActual>>()

// ── Escritura: POST /monitoring/tracks ───────────────────────────────────────────────────────

export interface Ping {
  tripId: number
  distributorId: number
  employeeId: number
  latitude: number
  longitude: number
  battery: number
  /** Reloj del DISPOSITIVO, ISO UTC. Lo pone el celular; el servidor no lo toca. */
  trackedAt: string
  /**
   * Atraso de subida en ms. Opcional: si no viene, el mock lo simula. Es el hueco entre los dos
   * relojes, y por eso se puede forzar — hay que poder ensayar el celular que buferea.
   */
  atrasoMs?: number
}

/**
 * Un ping: escribe los DOS ítems, igual que el endpoint real (Secuencia.puml, página 1).
 *
 * `receivedAt` se calcula acá y SIEMPRE es posterior a `trackedAt`, porque eso es lo único que
 * justifica tener dos relojes: el celular estampa cuándo fijó el GPS, el servidor cuándo recibió el
 * paquete. Un teléfono en zona muerta buferea y sube tarde, y ahí los dos valores se separan minutos.
 * Con un solo reloj se pierde la mitad del diagnóstico: "el GPS no fija" y "el equipo no tiene datos"
 * se ven idénticos. (Y `trackedAt` NO sirve como evidencia de auditoría: el reloj del equipo es
 * alterable. Para eso está `receivedAt`.)
 *
 * Devuelve el ítem ACTUAL porque es el que la pantalla consume; la traza queda guardada para
 * `queryTraza`.
 */
export function escribirPing(ping: Ping): ItemActual {
  const trackedMs = Date.parse(ping.trackedAt)
  // Atraso normal de subida: décimas a un par de segundos. Un 6% de las veces, la zona muerta: el
  // celular subió el punto entre 1 y 4 min después de haberlo fijado.
  const atraso = ping.atrasoMs ?? (rand.chance(0.06) ? rand.int(60_000, 240_000) : rand.int(300, 2_500))
  const receivedAt = new Date(trackedMs + atraso).toISOString()

  const traza: ItemTraza = {
    pk: pkTrip(ping.tripId),
    sk: skTs(ping.trackedAt),
    latitude: ping.latitude,
    longitude: ping.longitude,
    battery: ping.battery,
    employeeId: ping.employeeId,
    receivedAt,
    expiresAt: Math.floor(trackedMs / 1000) + TTL_DIAS * 24 * 60 * 60,
  }

  const actual: ItemActual = {
    pk: pkFleet(ping.distributorId),
    sk: skTrip(ping.tripId),
    latitude: ping.latitude,
    longitude: ping.longitude,
    battery: ping.battery,
    trackedAt: ping.trackedAt,
    receivedAt,
  }

  const particion = TRAZA.get(traza.pk)
  if (particion) particion.push(traza)
  else TRAZA.set(traza.pk, [traza])

  const flota = ACTUAL.get(actual.pk)
  if (flota) flota.set(actual.sk, actual)
  else ACTUAL.set(actual.pk, new Map([[actual.sk, actual]]))

  return actual
}

/**
 * Borra el ítem ACTUAL de un viaje. Es lo que pasa cuando el viaje se cierra: el camión volvió al
 * almacén y deja de ser parte de la flota en curso, así que su ítem sale de la partición
 * `FLEET#{distributorId}`. La TRAZA no se toca — la borra el TTL a los 30 días, que es justamente el
 * punto de tenerla en Dynamo.
 */
export function borrarActual(distributorId: number, tripId: number): void {
  ACTUAL.get(pkFleet(distributorId))?.delete(skTrip(tripId))
}

// ── Siembra del dataset ──────────────────────────────────────────────────────────────────────

export interface SiembraViaje {
  tripId: number
  distributorId: number
  employeeId: number
  /**
   * Vértices del tramo YA RECORRIDO: depósito → paradas visitadas → posición actual. El mock
   * subdivide cada tramo en `PINGS_POR_TRAMO` pings, que es la forma más barata de que la traza siga
   * el camino en vez de teletransportarse entre paradas.
   */
  camino: LatLngTuple[]
  /** Antigüedad del ÚLTIMO ping, en minutos. Es el caso "camión sin señal" cuando es grande. */
  antiguedadMin: number
  /** Batería del dispositivo en el último ping (%). */
  battery: number
  /** Instante de referencia (`Date.now()` del arranque). Todos los `trackedAt` se cuentan desde acá. */
  ahora: number
}

const interpolar = (a: LatLngTuple, b: LatLngTuple, t: number): LatLngTuple => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
]

/**
 * Siembra la traza de un viaje y su ítem ACTUAL.
 *
 * Los `trackedAt` se generan HACIA ATRÁS desde `ahora - antiguedadMin`: el ancla es el ÚLTIMO ping,
 * porque es el único instante que la pantalla mira ("última señal hace X"). Generar hacia adelante
 * desde una hora de salida inventada dejaría el último ping en cualquier lado.
 *
 * El intervalo entre pings consecutivos es el documentado (10-15 s) con jitter del PRNG sembrado —
 * nunca `Math.random`: el dataset se genera al importar el módulo y con azar real cambiaría en cada
 * recarga, rompiendo la reproducibilidad de las capturas.
 */
export function sembrarViaje(siembra: SiembraViaje): ItemActual | null {
  const { camino } = siembra
  if (camino.length < 2) return null

  // Puntos del recorrido, del depósito a la posición actual.
  const puntos: LatLngTuple[] = [camino[0]]
  for (let i = 1; i < camino.length; i++) {
    for (let paso = 1; paso <= PINGS_POR_TRAMO; paso++) {
      puntos.push(interpolar(camino[i - 1], camino[i], paso / PINGS_POR_TRAMO))
    }
  }

  // Instantes, también del más viejo al más nuevo. Se arma desde el final para que el último caiga
  // exactamente en `ahora - antiguedadMin`.
  const instantes: number[] = [siembra.ahora - siembra.antiguedadMin * 60_000]
  while (instantes.length < puntos.length) {
    instantes.unshift(instantes[0] - rand.int(PING_MIN_MS, PING_MAX_MS))
  }

  // La batería BAJA a lo largo del viaje hasta el valor que reporta el último ping: un dispositivo que
  // reportó 8% toda la mañana no es un dispositivo, es un dato inventado.
  const bateriaInicial = Math.min(100, siembra.battery + rand.int(4, 20))
  const ultimo = puntos.length - 1

  let actual: ItemActual | null = null
  for (let i = 0; i <= ultimo; i++) {
    const avance = ultimo === 0 ? 1 : i / ultimo
    actual = escribirPing({
      tripId: siembra.tripId,
      distributorId: siembra.distributorId,
      employeeId: siembra.employeeId,
      latitude: puntos[i][0],
      longitude: puntos[i][1],
      battery: Math.round(bateriaInicial - (bateriaInicial - siembra.battery) * avance),
      trackedAt: new Date(instantes[i]).toISOString(),
    })
  }

  return actual
}

// ── Lectura: las DOS Queries del monitor ─────────────────────────────────────────────────────
// Se llaman como las Queries reales a propósito. Cuando exista el backend, el cuerpo de estas tres
// funciones es un `await ddb.query(...)` o un `fetch`, y ninguna pantalla se enterá.

/**
 * `Query PK = FLEET#{distributorId}` — la flota entera del distribuidor, UNA sola Query.
 *
 * Devuelve N ítems ACTUAL, uno por viaje activo. Es el snapshot de
 * `GET /monitoring/orders?distributorId={id}`: el listado cruza cada ítem con su orden por el `tripId`
 * que ya trajo Postgres.
 */
export function queryFlota(distributorId: number): ItemActual[] {
  const flota = ACTUAL.get(pkFleet(distributorId))
  return flota ? [...flota.values()] : []
}

/**
 * `Query PK = TRIP#{tripId}` — la traza del viaje, en orden cronológico.
 *
 * Es también la base de "el recorrido entre dos horas" (`SK BETWEEN t1 AND t2`): con la SK ordenada
 * por tiempo, ese filtro es un rango sobre esta misma partición.
 */
export function queryTraza(tripId: number): ItemTraza[] {
  return TRAZA.get(pkTrip(tripId)) ?? []
}

/**
 * Última posición del viaje: `Query PK = TRIP#{tripId}, ScanIndexForward=false, Limit=1`.
 *
 * `ScanIndexForward=false` recorre la partición de la SK más alta a la más baja y `Limit=1` corta en
 * el primer ítem. Como la SK es `TS#{trackedAt}` en ISO UTC, ese ítem es el ping más reciente — y
 * cuesta UNA lectura, no traer la traza y quedarse con el último. Acá se escribe como leer el final
 * del array porque el array ya está ordenado por SK, que es la misma invariante.
 */
export function ultimaPosicion(tripId: number): ItemTraza | null {
  const particion = queryTraza(tripId)
  return particion.length > 0 ? particion[particion.length - 1] : null
}

/**
 * Snapshot de posición del DETALLE (`GET /monitoring/orders/{transportOrderId}`): la última posición
 * conocida del viaje, resuelta con la Query documentada en Secuencia.puml —
 * `Query PK=TRIP#{trip_id}, ScanIndexForward=false, Limit=1` sobre la TRAZA.
 *
 * Devuelve la forma ACTUAL porque es la que las pantallas consumen, y NO es una conversión ficticia:
 * los dos ítems son EL MISMO PING escrito dos veces —eso es lo que el doble write garantiza—, así que
 * reconstruir uno desde el otro es legítimo. Lo único que cambia de lugar es `trackedAt`: en la traza
 * vive DENTRO de la SK y hay que des-componerla; en el actual es un atributo.
 */
export function snapshotDetalle(distributorId: number, tripId: number): ItemActual | null {
  const ultima = ultimaPosicion(tripId)
  if (!ultima) return null
  const trackedAt = trackedAtDeSk(ultima.sk)
  if (trackedAt === null) return null
  return {
    pk: pkFleet(distributorId),
    sk: skTrip(tripId),
    latitude: ultima.latitude,
    longitude: ultima.longitude,
    battery: ultima.battery,
    trackedAt,
    receivedAt: ultima.receivedAt,
  }
}

// ── Derivados ────────────────────────────────────────────────────────────────────────────────
// LO QUE SIGUE SE CALCULA, NO SE GUARDA — y es exactamente lo que la forma anterior tenía al revés.
//
// El mock guardaba `ultimaSenalMin: 37` y `posicion: [-17.78, -63.17]`, y con eso el `trackedAt` crudo
// quedaba IRRECUPERABLE: de un "37" no se puede sacar a qué hora fijó el GPS, no se puede comparar
// contra `receivedAt` para distinguir "no fija" de "no tiene datos", y el número se vuelve mentira en
// cuanto pasa un minuto sin que nadie lo recalcule. Ese era el bug de la forma vieja: no era una
// simplificación de detalle, era la pérdida del dato de origen.
//
// La regla es una sola: se guarda el instante, se deriva el minuto.

/**
 * Minutos transcurridos desde el último ping del dispositivo. Es la columna "Última señal" y el
 * "Sin señal hace X" del mapa.
 *
 * Se compara contra `trackedAt` (reloj del DISPOSITIVO) y no contra `receivedAt` a propósito: la
 * pregunta es "¿hace cuánto que este camión no sabe dónde está?", no "¿hace cuánto que el servidor no
 * recibe nada?". Son dos diagnósticos distintos y el usuario mira el primero.
 */
export function minutosSinSenal(trackedAt: string, ahora: number): number {
  return Math.max(0, Math.floor((ahora - Date.parse(trackedAt)) / 60_000))
}

/** ¿El camión dejó de reportar? Un solo lugar decide, así la tabla y el mapa nunca discrepan. */
export const senalVieja = (trackedAt: string, ahora: number): boolean =>
  minutosSinSenal(trackedAt, ahora) > UMBRAL_SENAL_VIEJA_MIN

/**
 * Posición como par `[lat, lng]` — el formato que consume Leaflet.
 *
 * Sirve para los dos tipos de ítem porque los dos llevan `latitude`/`longitude`: el ACTUAL para el
 * listado y el pin, la TRAZA para el recorrido real. El ítem guarda los dos números por separado
 * (como el contrato) y la tupla se arma acá, en el borde de la vista.
 */
export const posicionDe = (item: Pick<ItemActual, 'latitude' | 'longitude'>): LatLngTuple => [
  item.latitude,
  item.longitude,
]
