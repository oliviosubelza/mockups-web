// Datos falsos del mockup de despacho. Los nombres y las columnas siguen al esquema real
// (DB_LOGISTICS): planning_truck, candidate_order, dispatch_plan_order, routes, dispatch_order y
// dispatch_plan. Viven acá —y no dentro de las vistas— para que todos los tableros compartan el
// mismo dataset y los conteos cuadren entre tabla, mapa y tarjetas.
//
// ── Generado, no escrito a mano ──────────────────────────────────────────────────────────────
// El dataset se GENERA con un PRNG de semilla fija (ver mock-random.ts) desde los pools de
// mock-pools.ts. Antes eran arrays escritos a mano de 5-12 filas: se veían vacíos en pantalla y no
// se podían escalar sin volverse inmantenibles.
//
// Semilla fija = dataset SIEMPRE idéntico entre recargas. Es un requisito, no un detalle: las
// capturas a Figma tienen que ser reproducibles, y cualquier decisión guardada por id de pedido
// apuntaría a otro pedido si los datos cambiaran en cada carga.
//
// Para cambiar volúmenes, tocar VOLUMEN. Para cambiar el dataset entero sin tocar volúmenes,
// cambiar SEMILLA.
import {
  Building,
  Building2,
  Map as MapIcon,
  Route,
  ShoppingBag,
  ShoppingCart,
  Store,
  Truck,
  type LucideIcon,
} from 'lucide-react'
import type { StepItem } from '@/components/ui/steps'
import type { AccesorioRuta } from './accesorios'
import { ordenarPorCercania } from './map/geo/hilbert'
import type { LatLngTuple } from './map/geo/polyline'
import { createRand, uniqueNames, type Rand } from './mock-random'
import {
  APELLIDOS,
  CODIGOS_EMPRESA,
  COLOR_CAMION_INACTIVO,
  LETRAS_PLACA,
  LOCALIDADES,
  LUGARES_SCZ,
  MOTIVOS_DEVOLUCION_POOL,
  NOMBRES_ALMACEN,
  NOMBRES_COMERCIALES,
  NOMBRES_DISTRIBUIDORA,
  NOMBRES_PILA,
  NOMBRES_SUCURSAL,
  PREFIJOS_POR_CANAL,
  PRODUCTOS,
  PUNTOS_CALLE_SCZ,
  SUCURSALES_CADENA,
  VIAS,
} from './mock-pools'

/** Semilla del dataset. Cambiarla regenera TODO (mismos volúmenes, otros datos). */
const SEMILLA = 20260728

/**
 * Cuántas filas tiene cada listado. `pedidosPorCanal` es el que más se nota: es lo que se ve al
 * abrir el detalle de un canal, y con 3-4 el diálogo parecía vacío.
 *
 * ── El techo de `pedidosPorCanal` no es estético: es geográfico ──────────────────────────────
 * Cada pedido saca UNA coordenada de `PUNTOS_CALLE_SCZ` (110 por zona, 440 en total) y la marca
 * usada, incluso cuando después comparte el punto de entrega de otro. O sea: el pool alcanza para
 * ~440 pedidos y ni uno más. Pasado ese número `calleLibre` se queda sin calles libres y devuelve
 * `pool[0]` una y otra vez — decenas de puntos de entrega distintos dibujados exactamente uno
 * encima del otro, que es justo lo que ese pool existe para evitar. Medido: con 78 por canal (468
 * pedidos) ya aparecen 4 coordenadas repetidas por decenas de paradas cada una.
 *
 * Por eso 68 y no más: con 408 pedidos ninguna coordenada se repite. El precio ya está pagado y es
 * chico —26 pedidos se colocan por barrido en vez de por sorteo, y la zona sur, que se lleva 120 de
 * los sorteos, agota sus 110 calles y empuja 10 pedidos a una zona vecina—, pero es exactamente el
 * intercambio que `calleLibre` documenta: antes zona corrida que dos pines encimados. Subir de acá
 * exige AMPLIAR el pool de calles, no tocar este número.
 *
 * El otro techo lo pone el canal PROVINCIA, que nombra a sus clientes con prefijo + localidad: son
 * `PREFIJOS_POR_CANAL.provincia × LOCALIDADES` combinaciones y `clientesDeProvincia` tira error si
 * no alcanzan. Con 8 prefijos × 12 localidades hay 96, que cubre estos 68 con aire.
 */
const VOLUMEN = {
  camiones: 54,
  /**
   * Pedidos por canal. Con 6 canales y 10 distribuidoras dan ~66 por distribuidora.
   *
   * SUBIÓ DE 68 A 110 cuando los pedidos dejaron de ser todos de Santa Cruz. Antes los 408 caían en
   * una sola ciudad y alcanzaban; repartidos entre diez distribuidoras eran 40 cada una, y la mitad
   * de las pantallas de esta app se miran POR distribuidora — un plan con 40 pedidos y 38 camiones no
   * muestra nada de lo que la pantalla existe para mostrar.
   *
   * El techo sigue siendo `PUNTOS_CALLE_SCZ` (440 coordenadas), pero ya no lo toca: solo 2 de las 10
   * distribuidoras son de Santa Cruz, así que de los 660 pedidos ~132 piden calle del pool.
   */
  pedidosPorCanal: 110,
  planes: 36,
  corridas: 30,
  /** Techo del listado de órdenes de transporte. Hoy no llega a tocarlo: el reparto por camión da ~57. */
  ordenesTransporte: 72,
  transferencias: 36,
  devoluciones: 36,
  choferes: 40,
  auxiliares: 40,
  vendedores: 30,
  planificadores: 20,
  distribuidoras: 10,
  /**
   * Camiones que participan del ruteo (define cuántas RUTAS y órdenes de despacho hay).
   *
   * Es un equilibrio, no un máximo: como las paradas se reparten POR PESO hasta llenar cada camión,
   * más camiones en ruteo = más rutas pero más FLACAS. Con 38 sobre 324 paradas quedan rutas de 1 a
   * 23 paradas —que es la dispersión que el monitoreo necesita para no mostrar 30 viajes iguales— y
   * apenas ~4% de paradas sin asignar. Con 30 el reparto no daba abasto y ~50 paradas se quedaban
   * sin camión; con 44 casi ninguna ruta pasaba de 14 paradas.
   */
  camionesEnRuta: 38,
}

const rand = createRand(SEMILLA)

/** Nombres de persona ya usados: vendedores, choferes, auxiliares y planificadores no se repiten. */
const personasUsadas = new Set<string>()

export type EstadoCamion = 'disponible' | 'mantenimiento' | 'provincia' | 'sinchofer'
export type CanalId = 'horizontal' | 'tradicional'
 | 'mayorista' | 'supermercado'
 | 'provincia' | 'ecommerce'
  // | 'evenado'

// ── Canales ──────────────────────────────────────────────────────────────────────────────────
// El `color` es un hex y no un token porque Leaflet pinta SVG. El mismo hex se usa en el chip de
// la tabla y en la leyenda del mapa, así no se pueden desincronizar.
// Ninguno es azul: el azul es el color de MARCA (botones, chips, steps). Si un canal también fuera
// azul, en el mapa no se sabría si el punto está "seleccionado" o si es de ese canal.
export const CANAL_META: Record<
  CanalId,
  // `logo` (opcional) = ruta a una imagen (logo real de marca). Si está, se muestra en vez del
  // `icon` lucide — seam para cuando llegue el PNG de eVenado.
  { label: string; icon: LucideIcon; color: string; hint: string; timeOff: string; logo?: string }
> = {
  horizontal: { label: 'Horizontal', icon: Store, color: '#16a34a', hint: 'Tiendas de barrio', timeOff: '16:30' },
  tradicional: { label: 'Tradicional', icon: Building, color: '#0d9488', hint: 'Distribuidores', timeOff: '17:30'  },
  mayorista: { label: 'Mayorista', icon: Building2, color: '#ea580c', hint: 'Grandes volúmenes', timeOff: '16:00' },
  supermercado: { label: 'Supermercados', icon: ShoppingCart, color: '#7c3aed', hint: 'Cadenas', timeOff: '16:30' },
  provincia: { label: 'Provincia', icon: MapIcon, color: '#a16207', hint: 'Entregas fuera de la capital', timeOff: '14:00' },
  // Ecommerce: canal online. Color rosa (bien distinto del resto) + ícono de bolsa para que salte a
  // la vista tanto en tablas como en el mapa.
  ecommerce: { label: 'Ecommerce', icon: ShoppingBag, color: '#db2777', hint: 'Ventas online', timeOff: '18:00' },
  // Canal propio: pedidos con FECHA FIJA de entrega (el cliente fija el día). Entran siempre a la
  // planificación cuando su fecha cae en el corte (timeOff tardío).
  // evenado: { label: 'eVenado', icon: CalendarClock, color: '#ca8a04', hint: 'Pedidos con fecha fija', timeOff: '23:59' },
  }

export const CANAL_IDS = Object.keys(CANAL_META) as CanalId[]

export const CANALES = CANAL_IDS.map((value) => ({ value, label: CANAL_META[value].label }))

// ── Corte de hora ────────────────────────────────────────────────────────────────────────────
// Viven acá (y no en dispatch-plan-store) porque la GENERACIÓN los necesita: para garantizar que
// cada canal tenga pedidos dentro Y fuera del corte hay que evaluar la regla al armar el dataset.
// Al revés habría import circular — el store importa mock-data, no al revés.

export const aMinutos = (hhmmStr: string) => {
  const [h, m] = hhmmStr.split(':').map(Number)
  return h * 60 + m
}

/** "13:00–17:00" → "17:00" (fin de la ventana). Ojo: el separador es EN DASH (–), no un guion. */
export const finVentana = (ventana: string) => ventana.split('–')[1]?.trim() ?? ventana

const hhmm = (h: number) => `${String(h).padStart(2, '0')}:00`

/** Ventanas de entrega candidatas: inicios de 05:00 a 18:00, de 3 o 4 horas, sin pasar las 21:00. */
const VENTANAS: string[] = (() => {
  const out: string[] = []
  for (let inicio = 5; inicio <= 18; inicio++) {
    for (const duracion of [3, 4]) {
      const fin = inicio + duracion
      if (fin > 21) continue
      out.push(`${hhmm(inicio)}–${hhmm(fin)}`)
    }
  }
  return out
})()

const ventanasQueCierranAntesDe = (corte: string) =>
  VENTANAS.filter((v) => aMinutos(finVentana(v)) <= aMinutos(corte))
const ventanasQueCierranDespuesDe = (corte: string) =>
  VENTANAS.filter((v) => aMinutos(finVentana(v)) > aMinutos(corte))

// ── Catálogos y maestros ─────────────────────────────────────────────────────────────────────

export const ALMACENES = [...NOMBRES_ALMACEN]

/** Almacén de salida del plan — en el mapa es de donde arrancan todas las rutas. */
export const DEPOSITO = { nombre: 'Planta Santa Cruz', lat: -17.7712, lng: -63.1421 }

// ── candidate_order ──────────────────────────────────────────────────────────────────────────

// Dimensiones de filtrado del listado de pedidos (contrato del backend `filterOrders`).
export type ProductType = 'Frío' | 'Seco'
export type PaymentType = 'Contado' | 'Crédito' | 'Pronto Pago'

export const PRODUCT_TYPES: ProductType[] = ['Frío', 'Seco']
export const PAYMENT_TYPES: PaymentType[] = ['Contado', 'Crédito', 'Pronto Pago']
/** Sociedades/empresas (company) — códigos de sociedad SAP. */
export const EMPRESAS = [...CODIGOS_EMPRESA]

// ── Mercado / Zona / Vendedor ────────────────────────────────────────────────────────────────
// Dimensiones de planificación además del canal. Son filtros que NARROW: si no hay ninguno
// seleccionado, no filtran (pasan todos). Ciudad es el filtro SUPERIOR (el más amplio).
export type CiudadId = 'santacruz' | 'montero' | 'warnes' | 'laguardia' | 'cotoca'
export type MercadoId = 'capital' | 'provincias' | 'ruta'
export type ZonaId = 'norte' | 'sur' | 'centro' | 'este'

/**
 * Ciudades del maestro. `cityId` es el id NUMÉRICO con el que las conoce el backend (es lo que viaja
 * en `GET /planning/markets/map?cityId=`); el slug de `CiudadId` es solo la clave interna del mockup.
 * Están juntos a propósito: son dos nombres del mismo lugar y separarlos era la forma de que un día
 * el filtro dijera "Montero" y el mapa pidiera los mercados de otra ciudad.
 */
export const CIUDAD_META: Record<CiudadId, { label: string; cityId: number }> = {
  santacruz: { label: 'Santa Cruz de la Sierra', cityId: 1 },
  montero: { label: 'Montero', cityId: 2 },
  warnes: { label: 'Warnes', cityId: 3 },
  laguardia: { label: 'La Guardia', cityId: 4 },
  cotoca: { label: 'Cotoca', cityId: 5 },
}
export const MERCADO_META: Record<MercadoId, { label: string }> = {
  capital: { label: 'Santa Cruz Capital' },
  provincias: { label: 'Provincias' },
  ruta: { label: 'Ruta al Norte' },
}
export const ZONA_META: Record<ZonaId, { label: string }> = {
  norte: { label: 'Norte' },
  sur: { label: 'Sur' },
  centro: { label: 'Centro' },
  este: { label: 'Este' },
}

export const CIUDAD_IDS = Object.keys(CIUDAD_META) as CiudadId[]
export const MERCADO_IDS = Object.keys(MERCADO_META) as MercadoId[]
export const ZONA_IDS = Object.keys(ZONA_META) as ZonaId[]

/** `CiudadId` → el `cityId` numérico que espera el backend. */
export const cityIdDe = (ciudad: CiudadId): number => CIUDAD_META[ciudad].cityId

/** Vuelta: `cityId` numérico → la ciudad del mockup (`undefined` si no es una de las nuestras). */
export const ciudadDeCityId = (cityId: number): CiudadId | undefined =>
  CIUDAD_IDS.find((c) => CIUDAD_META[c].cityId === cityId)

/**
 * Centro aproximado de cada ciudad.
 *
 * VIVE ACÁ Y NO EN `zones-store`, donde estaba: es dato del maestro de ciudades, igual que `CIUDAD_META`,
 * y lo necesitan tres pantallas más las coordenadas de las distribuidoras de abajo. Desde `zones-store` no
 * se podía usar sin ciclo de imports. Ese módulo lo re-exporta, así que nada de lo que ya lo importaba de
 * ahí se rompe.
 *
 * Es a DÓNDE MIRA un editor de mapa al abrirse, y con la lista vacía es lo único que hay: sin nada
 * guardado no hay qué encuadrar, así que este punto es la diferencia entre abrir sobre Santa Cruz y abrir
 * sobre el Atlántico en zoom de continente.
 */
export const CIUDAD_CENTRO: Record<CiudadId, LatLngTuple> = {
  santacruz: [-17.783, -63.182],
  montero: [-17.339, -63.25],
  warnes: [-17.517, -63.167],
  laguardia: [-17.917, -63.233],
  cotoca: [-17.817, -63.033],
}

/**
 * Dónde se planta el depósito de cada distribuidora, como desplazamiento en grados respecto del centro de
 * SU ciudad, por posición dentro de esa ciudad.
 *
 * ESTAS COORDENADAS NO SON DECORATIVAS: son la única referencia que tiene alguien para dibujar la zona de
 * distribución. Sin el depósito en el mapa, "recortá el territorio de esta distribuidora" es una consigna
 * sobre un mapa vacío — no hay forma de saber de qué lado de la ciudad empezar. Reflejan
 * `distributors.latitude / longitude`, que en el esquema son `NOT NULL`.
 *
 * SE SEPARAN A PROPÓSITO, y bastante: 0,03° son ~3,3 km. Con las dos distribuidoras de una ciudad
 * apiladas en el centro los dos íconos se taparían entre sí y no habría cómo saber cuál es cuál al
 * dibujar. Es un desplazamiento fijo por posición y no un sorteo: dos recargas tienen que dejar los
 * depósitos en el mismo lugar, o el polígono que dibujaste ayer rodea el vacío hoy.
 *
 * Alcanza con dos entradas para la regla de hoy (máximo 2 por ciudad); las otras tres quedan por si el
 * tope sube, y como son opuestas entre sí siguen separando bien.
 */
const OFFSET_DEPOSITO: LatLngTuple[] = [
  [0.031, -0.039],
  [-0.029, 0.042],
  [0.035, 0.034],
  [-0.037, -0.031],
  [0.005, 0.053],
]

/**
 * TOPE de distribuidoras por ciudad.
 *
 * Es la regla del negocio: una ciudad tiene UNA o DOS distribuidoras, nunca más. Y es exactamente el
 * rango donde la zona de distribución tiene sentido — con una no hay nada que partir (todo lo de la
 * ciudad es suyo por descarte) y con dos hay que decidir el corte. Se declara como constante y no se deja
 * implícita en una lista escrita a mano porque es una invariante: el reparto de abajo se calcula, así que
 * no se puede violar por un dedazo al agregar una ciudad o una distribuidora.
 */
const MAX_DISTRIBUIDORAS_POR_CIUDAD = 2

/**
 * En qué ciudad cae cada distribuidora, por posición en la lista.
 *
 * SE CALCULA, no se escribe: se recorren las ciudades en orden y se les va dando una distribuidora hasta
 * llenar la primera vuelta, y recién entonces empieza la segunda. Eso garantiza el mínimo de 1 antes de
 * que ninguna llegue a 2, que es lo que pide la regla.
 *
 * EL TOPE MANDA SOBRE `VOLUMEN.distribuidoras`: si el volumen pidiera más de
 * `ciudades × MAX_DISTRIBUIDORAS_POR_CIUDAD`, las de más no tendrían dónde ir y la única salida honesta
 * es no crearlas. Con las 5 ciudades de hoy el techo son 10, que es justo el volumen actual — así que
 * quedan 2 por ciudad y ninguna se descarta. Bajar el volumen a 9 deja una ciudad con 1, que es el otro
 * caso que la pantalla sabe mostrar («una sola distribuidora: no hace falta dibujar nada»).
 */
const CIUDAD_POR_POSICION: CiudadId[] = Array.from(
  { length: MAX_DISTRIBUIDORAS_POR_CIUDAD },
  () => CIUDAD_IDS,
).flat()

/**
 * Distribuidoras (distributorId): scope OBLIGATORIO del listado — de qué distribuidora son los pedidos.
 *
 * `cityId` refleja la columna `distributors.city_id` (agregada junto con `distribution_zones`): es lo que
 * contesta "elegí una ciudad y decime qué distribuidoras hay ahí". Vive acá abajo y no arriba con los
 * otros catálogos porque necesita `cityIdDe`, que se define recién en este bloque.
 */
export const DISTRIBUIDORAS = NOMBRES_DISTRIBUIDORA.slice(
  0,
  // El tope por ciudad gana: pedir más distribuidoras que casilleros crearía algunas sin ciudad.
  Math.min(VOLUMEN.distribuidoras, CIUDAD_POR_POSICION.length),
).map(
  (nombre, i) => {
    const ciudad = CIUDAD_POR_POSICION[i]
    // Posición DENTRO de su ciudad, no en la lista global: es lo que decide cuál de los offsets le toca.
    // Con el índice global, las dos de una misma ciudad (posiciones i e i+5) caerían en offsets 0 y 5 —
    // que con solo cinco entradas es 0 y 0, o sea el mismo punto para las dos.
    const enSuCiudad = CIUDAD_POR_POSICION.slice(0, i).filter((c) => c === ciudad).length
    const [dLat, dLng] = OFFSET_DEPOSITO[enSuCiudad % OFFSET_DEPOSITO.length]
    const [lat, lng] = CIUDAD_CENTRO[ciudad]
    return {
      id: 501 + i,
      nombre: `Distribuidora ${nombre}`,
      cityId: cityIdDe(ciudad),
      /** Depósito de la distribuidora — espejo de `distributors.latitude / longitude`. */
      lat: Number((lat + dLat).toFixed(6)),
      lng: Number((lng + dLng).toFixed(6)),
    }
  },
)

/** Las distribuidoras de una ciudad. Es el filtro superior de la pantalla de zonas de distribución. */
export const distribuidorasDeCiudad = (ciudad: CiudadId) =>
  DISTRIBUIDORAS.filter((d) => d.cityId === cityIdDe(ciudad))

/**
 * Mercado DERIVADO de la ciudad, no sorteado: "Ruta al Norte" tiene que contener a Montero y Warnes,
 * y no a La Guardia (que está al sur). Sorteándolo, el filtro devolvía combinaciones imposibles.
 */
const MERCADO_POR_CIUDAD: Record<CiudadId, MercadoId> = {
  santacruz: 'capital',
  montero: 'ruta',
  warnes: 'ruta',
  laguardia: 'provincias',
  cotoca: 'provincias',
}

/** Zona de venta de las ciudades del interior (la capital sí sortea entre sus cuatro zonas). */
const ZONA_POR_CIUDAD: Partial<Record<CiudadId, ZonaId>> = {
  montero: 'norte',
  warnes: 'norte',
  laguardia: 'sur',
  cotoca: 'este',
}

// ── Personas ─────────────────────────────────────────────────────────────────────────────────

/** "M. Suárez" — inicial + apellido, como los vendedores del maestro. */
function nombresConInicial(cantidad: number): string[] {
  const out: string[] = []
  const iniciales = rand.cycler(NOMBRES_PILA)
  const apellidos = rand.cycler(APELLIDOS)
  // Cota de intentos: sin ella un pool chico haría girar el loop para siempre.
  for (let intento = 0; out.length < cantidad && intento < cantidad * 200; intento++) {
    const nombre = `${iniciales()[0]}. ${apellidos()}`
    if (personasUsadas.has(nombre)) continue
    personasUsadas.add(nombre)
    out.push(nombre)
  }
  if (out.length < cantidad) {
    throw new Error(`[mock-data] no alcanzan los nombres de persona únicos (pedidos ${cantidad})`)
  }
  return out
}

/** "Pablo Méndez" — nombre completo, para planificadores. */
function nombresCompletos(cantidad: number): string[] {
  const out: string[] = []
  const nombres = rand.cycler(NOMBRES_PILA)
  const apellidos = rand.cycler(APELLIDOS)
  for (let intento = 0; out.length < cantidad && intento < cantidad * 200; intento++) {
    const nombre = `${nombres()} ${apellidos()}`
    if (personasUsadas.has(nombre)) continue
    personasUsadas.add(nombre)
    out.push(nombre)
  }
  if (out.length < cantidad) {
    throw new Error(`[mock-data] no alcanzan los nombres completos únicos (pedidos ${cantidad})`)
  }
  return out
}

/** Vendedores (salesperson). Es una dimensión de filtro, así que no puede haber dos iguales. */
const VENDEDORES_POOL = nombresConInicial(VOLUMEN.vendedores)

// Choferes y auxiliares para asignar a una orden. El nombre va concatenado con su código SAP de
// empleado (Nombre-SAP), así el buscador filtra por ambos. Comparten maestro de empleados, pero con
// rangos de código distintos (30xx / 41xx) para no confundirlos al leer un legajo suelto.
export const CHOFERES = nombresConInicial(VOLUMEN.choferes).map((n, i) => `${n}-${3021 + i}`)
export const AUXILIARES = nombresConInicial(VOLUMEN.auxiliares).map((n, i) => `${n}-${4101 + i}`)

/** Nombres de planificador de ejemplo (genéricos, no reales). */
export const PLANIFICADORES = nombresCompletos(VOLUMEN.planificadores)

// ── planning_truck (+ truck del maestro) ─────────────────────────────────────────────────────

/**
 * Carrocería del vehículo (`vehicle_class`).
 *
 * La `Minivan` NO es "un camión más chico" a efectos del mockup: es otro orden de magnitud (1–2,5 t
 * contra 9–30 t), y por eso su capacidad se genera aparte. Ponerle el rango de los camiones habría
 * dado mini-vans de 20 toneladas, que es la clase de dato que hace desconfiar de toda la pantalla.
 */
export type ClaseCamion = 'Furgón' | 'Camión' | 'Minivan'

/** Todas las carrocerías, para los filtros. Una sola fuente: agregar una acá la muestra en todos. */
export const CLASES_CAMION: ClaseCamion[] = ['Camión', 'Furgón', 'Minivan']

export interface Camion {
  id: string
  placa: string
  /** truck_type / is_refrigerated del contrato SAP — refrigeración: Frío o Seco. */
  tipo: 'Frío' | 'Seco'
  /** vehicle_class del contrato SAP — carrocería: Furgón, Camión o Minivan. */
  clase: ClaseCamion
  /** capacity_weight, en toneladas. */
  capacidadPeso: number
  /** capacity_volume, en m³. */
  capacidadVolumen: number
  /** assigned_weight — lo que ya lleva cargado el plan. */
  asignadoPeso: number
  /** assigned_volume. */
  asignadoVolumen: number
  estado: EstadoCamion
  /** shift_start / shift_end — Google Route Optimization los necesita para rutear. */
  turnoInicio: string
  turnoFin: string
  /** is_included_in_routing — si el camión entra o no en la corrida. */
  enRuteo: boolean
  almacen: string
  distribuidoraId?: number
  /** Color con el que se pinta este camión (y sus paradas) en el mapa. */
  color: string
}

/**
 * Color por camión: se reparte el círculo de matices SALTEANDO la franja azul (205°–255°). El azul
 * es el color de MARCA (selección), y un camión azul haría indistinguible "seleccionado" de "es de
 * ese camión". Generado y no escrito a mano porque a 30+ camiones garantizar matices bien distintos
 * a ojo es imposible. El reparto lo hace `colorDeCamion` — ver ahí por qué NO es un reparto en orden.
 */
const BANDA_AZUL = { desde: 205, hasta: 255 }

function hslAHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const canal = (n: number) => {
    const k = (n + h / 30) % 12
    const v = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(255 * v)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${canal(0)}${canal(8)}${canal(4)}`
}

/**
 * Paso entre matices consecutivos, sobre el círculo YA reducido (310°, sin la franja azul).
 *
 * No es el ángulo áureo (137,5°): ese está definido para un círculo de 360° y acá el círculo mide 310,
 * así que aplicado tal cual deja al camión 10 a 2,4° del camión 1 — dos rojos idénticos. 129,15 es el
 * valor que maximiza la separación MÍNIMA en el rango que importa: 52° con 4-5 rutas y 26° de 6 a 12,
 * contra los 13° parejos del reparto en orden.
 *
 * El precio, dicho explícito: pasando las ~12 rutas los matices vuelven a acercarse. Es el intercambio
 * correcto porque un plan usa entre 4 y 10 camiones, y en el listado de la flota —donde sí se ven los
 * 30— el color es un punto al lado de la placa, no algo que se compare fila contra fila. Ahí la
 * rotación de claridad de abajo es la que sostiene la distinción.
 */
const PASO_MATIZ = 129.15

/**
 * Color de un camión.
 *
 * ANTES REPARTÍA EL CÍRCULO EN ORDEN (`indice / total`), y con 30 camiones eso daba saltos de 13°: los
 * ocho primeros salían todos entre rojo y amarillo. El problema no era teórico — quien planifica elige
 * los primeros camiones de la lista, así que las rutas del mapa terminaban siendo seis tonos de marrón
 * imposibles de distinguir entre sí.
 *
 * Ahora los índices CONSECUTIVOS caen en extremos opuestos del círculo (129° de distancia), que es
 * exactamente el caso que importa: los camiones se eligen en orden.
 *
 * La lightness rota en tres pasos como segundo eje de separación. Recién a partir del camión ~9 el
 * paso áureo empieza a cerrar huecos chicos, y ahí la diferencia de claridad es la que sostiene la
 * distinción. Se mantiene en la franja 36–46: más claro y el número del marcador —que se dibuja en
 * este color sobre blanco— pierde contraste.
 */
function colorDeCamion(indice: number): string {
  const anchoBanda = BANDA_AZUL.hasta - BANDA_AZUL.desde
  // El paseo se hace sobre el círculo REDUCIDO (sin la franja azul) y recién después se reinserta el
  // salto. Aplicarlo al revés metería matices dentro de la franja reservada.
  let matiz = (indice * PASO_MATIZ) % (360 - anchoBanda)
  if (matiz >= BANDA_AZUL.desde) matiz += anchoBanda
  const luz = [42, 36, 46][indice % 3]
  return hslAHex(matiz, 62, luz)
}

const TURNOS = [
  { inicio: '06:00', fin: '16:00' },
  { inicio: '07:00', fin: '17:00' },
  { inicio: '08:00', fin: '15:00' },
  { inicio: '05:00', fin: '14:00' },
] as const

/**
 * Flota. Los primeros `camionesEnRuta` quedan disponibles y en ruteo (son los que usa la corrida);
 * el resto se reparte entre los estados que lo dejan AFUERA, para que la vista de flota muestre
 * también los casos de mantenimiento, provincia y sin chofer.
 */
export const CAMIONES: Camion[] = (() => {
  const letras = rand.shuffle(LETRAS_PLACA)
  const estadosFueraDeRuteo: EstadoCamion[] = ['mantenimiento', 'provincia', 'sinchofer']

  return Array.from({ length: VOLUMEN.camiones }, (_, i) => {
    const enRuteo = i < VOLUMEN.camionesEnRuta
    const estado: EstadoCamion = enRuteo
      ? 'disponible'
      : estadosFueraDeRuteo[(i - VOLUMEN.camionesEnRuta) % estadosFueraDeRuteo.length]

    // La carrocería se sortea ANTES que la capacidad porque la manda: una mini-van con el rango de
    // un camión daría una furgoneta de 20 toneladas.
    const clase: ClaseCamion = rand.chance(0.15)
      ? 'Minivan'
      : rand.chance(0.35)
        ? 'Furgón'
        : 'Camión'
    const capacidadPeso =
      clase === 'Minivan' ? Number(rand.float(1, 2.5, 1).toFixed(1)) : rand.int(9, 30)
    // Volumen coherente con el peso: ~2,2 m³ por tonelada, con dispersión por carrocería.
    const capacidadVolumen = Number((capacidadPeso * rand.float(2.0, 2.4, 2)).toFixed(1))
    // Lo ya cargado nunca supera la capacidad: el exceso se retrata en las órdenes de transporte
    // (ahí sí es un caso a mostrar), no en el maestro de la flota.
    const ocupacion = enRuteo ? rand.float(0, 0.92, 2) : 0
    const turno = enRuteo ? rand.pick(TURNOS) : null

    return {
      id: `t${i + 1}`,
      placa: `${rand.int(1000, 9999)}-${letras[i % letras.length]}`,
      tipo: rand.chance(0.35) ? 'Frío' : 'Seco',
      clase,
      capacidadPeso,
      capacidadVolumen,
      asignadoPeso: Number((capacidadPeso * ocupacion).toFixed(1)),
      asignadoVolumen: Number((capacidadVolumen * ocupacion).toFixed(1)),
      estado,
      turnoInicio: turno?.inicio ?? '—',
      turnoFin: turno?.fin ?? '—',
      enRuteo,
      almacen: rand.pick(ALMACENES),
      distribuidoraId: DISTRIBUIDORAS[i % DISTRIBUIDORAS.length]?.id ?? 501,
      color: enRuteo ? colorDeCamion(i) : COLOR_CAMION_INACTIVO,
    } satisfies Camion
  })
})()

/** Resuelve la distribuidora asignada a un camión de la flota */
export const distribuidoraIdDeCamion = (c: Camion): number => {
  if (c.distribuidoraId) return c.distribuidoraId
  const idx = parseInt(c.id.replace(/\D/g, ''), 10) || 1
  return DISTRIBUIDORAS[(idx - 1) % DISTRIBUIDORAS.length]?.id ?? 501
}

export const distribuidoraNombreDeCamion = (c: Camion): string => {
  const id = distribuidoraIdDeCamion(c)
  const dist = DISTRIBUIDORAS.find((d) => d.id === id)
  return dist ? dist.nombre : `Distribuidora #${id}`
}

export const camionesDeDistribuidora = (distribuidoraId: number): Camion[] =>
  CAMIONES.filter((c) => distribuidoraIdDeCamion(c) === distribuidoraId)

// ── Pedidos ──────────────────────────────────────────────────────────────────────────────────

/**
 * Una LÍNEA del pedido. En el ERD es `sales_order_item` (`DB.puml:24-31`), y ahí está la trampa:
 * esa entidad vive en el paquete de snapshots marcada `<<MS Ventas - SAP>>`, o sea **no es tabla
 * nuestra** — grepeá `UltimaVersion.sql` y no aparece. Lo nuestro es `candidate_orders`
 * (`UltimaVersion.sql:176-203`), que del pedido guarda `total_weight_kg` y `total_volume_m3` y
 * NINGUNA línea. La primera estructura propia con detalle por producto es
 * `transport_order_sales_items` (`:338`), o sea recién en el chequeo de carga: muchísimo después de
 * este paso.
 *
 * Está acá para poder discutir la pantalla. Para que sea real, el snapshot de pedidos candidatos
 * tiene que traer los ítems con `product_id`, descripción, unidad, `requested_qty` y `confirmed_qty`.
 */
export interface ItemPedido {
  id: string
  /** product_id, resuelto a su nombre. Hoy `product_snapshot` (`DB.puml:35-40`) solo trae peso y
   *  volumen: la descripción también hay que pedirla. */
  producto: string
  /**
   * Código SAP del material. Va JUNTO al nombre y no en su lugar: el nombre es lo que se lee de
   * corrido, el código es lo que se dicta por teléfono cuando hay que reclamarle el stock a Ventas.
   * Sin él, "Mayonesa Real doypack" no alcanza para pedir nada — hay tres presentaciones parecidas.
   */
  codigo: string
  /** `true` cuando la línea es regalo/promoción y NO mercadería facturada normal. */
  esBonificacion?: boolean
  /** Lo que se cuenta (cajas, packs, bolsas). No es dato del esquema. */
  unidad: string
  /** requested_qty — lo que el cliente pidió. */
  solicitado: number
  /** confirmed_qty — lo que Ventas confirmó CON stock. Si es menor que `solicitado`, esa línea está
   *  a confirmar; si es 0, no hay nada reservado. */
  confirmado: number
}

/** Una línea queda pendiente cuando Ventas confirmó menos de lo solicitado. */
export const itemPorConfirmar = (item: ItemPedido): boolean => item.confirmado < item.solicitado

/** Las líneas que Ventas no confirmó completas: `confirmed_qty < requested_qty`. */
export const itemsPorConfirmar = (p: Pedido): ItemPedido[] =>
  p.items.filter(itemPorConfirmar)

/** Regalos/promociones todavía sin stock confirmado. */
export const bonificacionesPorConfirmar = (p: Pedido): ItemPedido[] =>
  p.items.filter((item) => item.esBonificacion === true && itemPorConfirmar(item))

/** Si falta una bonificación, el pedido NO se puede tomar en la planificación. */
export const tieneBonificacionSinConfirmar = (p: Pedido): boolean =>
  bonificacionesPorConfirmar(p).length > 0

/** Pedido elegible para selección manual/automática dentro del plan. */
export const pedidoEsSeleccionable = (p: Pedido): boolean =>
  !tieneBonificacionSinConfirmar(p)

/**
 * Un pedido "con stock a confirmar" es el que tiene AL MENOS una línea corta. Es el criterio que
 * pinta la fila en el diálogo del canal: el pedido entra igual a la planificación, pero lo que
 * suba al camión puede ser menos de lo que dice el total.
 */
export const tieneStockPorConfirmar = (p: Pedido): boolean =>
  p.items.some(itemPorConfirmar)

export interface Pedido {
  id: string
  /** sales_order_id — el pedido tal como viene de Ventas/SAP. */
  salesOrder: string
  cliente: string
  canal: CanalId
  /** company — sociedad/empresa SAP del pedido. */
  company: string
  /** payment_type — forma de pago. */
  paymentType: PaymentType
  /** product_type — naturaleza de la mercadería: frío o seco. */
  productType: ProductType
  /** delivery_date (YYYY-MM-DD) — fecha de entrega comprometida. */
  fechaEntrega: string
  /** total del pedido en Bs (monto). */
  total: number
  /** salesperson — vendedor asignado al pedido. */
  vendedor: string
  /** delivery_point_id: varios pedidos pueden compartirlo → se unifican en UNA parada. */
  puntoEntregaId: string
  puntoEntrega: string
  /** delivery_window. */
  ventana: string
  /** total_weight, en kg. */
  peso: number
  /** total_volume, en m³. */
  volumen: number
  priority: 1 | 2 | 3
  /** ready_for_dispatch. */
  listo: boolean
  lat: number
  lng: number
  /**
   * Ciudad / mercado / zona EXPLÍCITOS y coherentes con lat-lng. Antes se derivaban del número de
   * pedido con un módulo, así que un pedido con coordenadas de Montero podía quedar etiquetado
   * "Cotoca" y los filtros contradecían el mapa.
   */
  ciudad: CiudadId
  /**
   * Distribuidora DUEÑA del pedido (`distributors.id`), sellada al generarlo.
   *
   * Antes esto se DEDUCÍA con una heurística (`distribuidoraIdDe`: norte/este a la primera, sur/centro
   * a la segunda) sobre una ciudad que además siempre era Santa Cruz. Dos problemas: ocho de las diez
   * distribuidoras no tenían un solo pedido, y la que sí tenía los recibía por una regla que ninguna
   * columna del modelo respalda. Ahora el pedido dice de quién es, como en la base.
   *
   * La ZONA DE DISTRIBUCIÓN sigue siendo otra cosa y se resuelve por geometría: un pedido es de esta
   * distribuidora, y además puede caer o no dentro del contorno que ella dibujó.
   */
  distribuidoraId: number
  mercado: MercadoId
  zona: ZonaId
  /** Las líneas del pedido. Ver `ItemPedido`: hoy NO vienen en el snapshot. */
  items: ItemPedido[]
  camionId?: string | null
  rutaId?: string | null
  secuencia?: number
}

/**
 * Fecha de la planificación (YYYY-MM-DD): SIEMPRE mañana (hoy + 1 día). La planificación es para un
 * día específico, así que todas las tablas comparten esta fecha. Se calcula con Date para que el
 * mockup no haya que editarlo manualmente cada vez que se actualiza. Usa componentes locales (no
 * toISOString) para no correrse un día por zona horaria.
 *
 * TODOS los pedidos usan esta fecha a propósito: el filtro de Entrega arranca en "mañana", así que
 * un pedido con otra fecha quedaría invisible al abrir la vista.
 */
function calcularFechaPlan(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const FECHA_PLAN = calcularFechaPlan()

/** Rangos de peso (kg) y monto (Bs) por canal: un mayorista no pesa lo mismo que un kiosco. */
/**
 * DENSIDAD DE LA CARGA, en kg/m³. Es el puente entre el peso de un pedido y el volumen que ocupa, y
 * decide cuál de las dos capacidades del camión se agota primero — o sea, decide qué significa la barra
 * de ocupación de toda la planificación.
 *
 * ESTABA MAL Y SE VEÍA. Era 250–340 kg/m³, mientras que un camión del maestro admite
 * `capacidadPeso × 2,0–2,4 m³/t`, es decir 417–500 kg/m³. Con la carga MENOS densa que lo que la caja
 * admite, el volumen se agotaba SIEMPRE antes que el peso: llenar un camión al 100 % de peso lo dejaba
 * al 147–167 % de volumen. Y como el optimizador reparte por peso, cada plan salía con todas las rutas
 * por encima del 100 % — un plan imposible según su propia barra, con los camiones a tres cuartos de su
 * peso útil.
 *
 * Ahora la carga es MÁS densa que la caja, que es lo que corresponde a bebida embotellada: una caja de
 * botellas ronda los 600–750 kg/m³ y es de las mercaderías más densas que se reparten en ciudad. Con
 * eso el PESO vuelve a ser la restricción que manda, que es la realidad del negocio: a un camión de
 * bebida se le termina el peso mucho antes que el espacio, y por eso las cajas van a media altura.
 */
const DENSIDAD_SECO: [number, number] = [520, 700]

/** El frío va en cajas más llenas y con menos aire de embalaje: es la carga más densa que se reparte. */
const DENSIDAD_FRIO: [number, number] = [600, 750]

/**
 * ENVASE RETORNABLE VACÍO. Deliberadamente MUY por debajo de las otras dos y de la densidad de la caja
 * del camión: una devolución son cajas y botellas vacías, que ocupan lo mismo que llenas y no pesan.
 *
 * Es el único caso del dataset donde el volumen SÍ tiene que ser la restricción que se agota primero, y
 * está bien que lo sea — es exactamente el problema real del reparto de retornables.
 */
const DENSIDAD_ENVASE_VACIO: [number, number] = [180, 260]

const PERFIL_CANAL: Record<CanalId, { peso: [number, number]; total: [number, number] }> = {
  horizontal: { peso: [80, 700], total: [280, 2200] },
  tradicional: { peso: [400, 1700], total: [900, 3400] },
  mayorista: { peso: [2400, 5600], total: [4300, 9900] },
  supermercado: { peso: [850, 2500], total: [1700, 4800] },
  provincia: { peso: [900, 3200], total: [1800, 5800] },
  ecommerce: { peso: [70, 520], total: [240, 1500] },
}

/** Clientes de un canal, con nombres únicos entre TODOS los canales. */
function clientesDelCanal(canal: CanalId, cantidad: number, usados: Set<string>): string[] {
  if (canal === 'ecommerce') {
    // El "cliente" de una venta online es el número de pedido web: único por construcción.
    return Array.from({ length: cantidad }, (_, i) => `Pedido web #${4471 + i}`)
  }
  if (canal === 'supermercado') {
    // Cadena + sucursal ("Fidalga Equipetrol"), que es como se los nombra realmente.
    return uniqueNames(rand, PREFIJOS_POR_CANAL.supermercado, SUCURSALES_CADENA, cantidad, usados)
  }
  return uniqueNames(
    rand,
    PREFIJOS_POR_CANAL[canal],
    [...LUGARES_SCZ, ...NOMBRES_COMERCIALES],
    cantidad,
    usados,
  )
}

/** Prefijo + localidad para provincia: el nombre del cliente LLEVA la localidad, así que van juntos. */
function clientesDeProvincia(cantidad: number, usados: Set<string>) {
  const pares = rand.shuffle(
    PREFIJOS_POR_CANAL.provincia.flatMap((prefijo) =>
      LOCALIDADES.map((localidad) => ({ prefijo, localidad })),
    ),
  )
  const out: { cliente: string; localidad: (typeof LOCALIDADES)[number] }[] = []
  for (const { prefijo, localidad } of pares) {
    if (out.length === cantidad) break
    const cliente = `${prefijo} ${localidad.nombre}`
    if (usados.has(cliente)) continue
    usados.add(cliente)
    out.push({ cliente, localidad })
  }
  if (out.length < cantidad) {
    throw new Error(
      `[mock-data] no alcanzan los clientes de provincia: pedidos ${cantidad}, hay ${out.length}`,
    )
  }
  return out
}

/**
 * Líneas de un pedido. Las cantidades son ILUSTRATIVAS y a propósito no suman el `peso` del pedido:
 * el peso sale agregado de `candidate_orders`, y para derivarlo de las líneas haría falta el peso
 * por producto de `product_snapshot`, que hoy tampoco pedimos. Inventar una conversión acá haría
 * parecer resuelto algo que no lo está.
 *
 * ~1 de cada 4 pedidos sale con stock a confirmar, y de esos algunos tienen más de una línea corta:
 * hace falta que el caso se vea sin buscarlo, y que el panel tenga que agrupar de verdad.
 */
function generarItems(pedidoId: string, productType: ProductType): ItemPedido[] {
  const compatibles = PRODUCTOS.filter(
    (producto) => producto.temperatura === productType || producto.temperatura === 'Ambos',
  )
  const universo = compatibles.length >= 3 ? compatibles : PRODUCTOS
  const maxItems = Math.min(7, universo.length)
  const catalogo = rand.shuffle(universo).slice(0, rand.int(3, maxItems))
  // Se decide por PEDIDO, no por línea: si cada línea tirara su propio dado, casi todos los pedidos
  // terminarían con alguna corta y el color dejaría de distinguir nada.
  const conFaltante = rand.chance(0.26)
  const cortas = conFaltante ? rand.int(1, Math.min(2, catalogo.length)) : 0
  const conBonificacion = rand.chance(0.38)
  let bonificacionIndex = conBonificacion ? rand.int(0, catalogo.length - 1) : -1
  // Parte de los faltantes cae justo en la bonificación: ese es el caso bloqueante que el negocio
  // quiere ver. Si NO bloquea, se mueve la bonificación fuera de las líneas cortas para que el
  // escenario quede controlado y no aparezca por accidente.
  const bonificacionSinStock = conFaltante && bonificacionIndex >= 0 && rand.chance(0.6)
  if (!bonificacionSinStock && bonificacionIndex >= 0 && bonificacionIndex < cortas) {
    bonificacionIndex = rand.int(cortas, catalogo.length - 1)
  }
  const indicesCortos = new Set<number>(Array.from({ length: cortas }, (_, i) => i))
  if (bonificacionSinStock && bonificacionIndex >= 0 && !indicesCortos.has(bonificacionIndex)) {
    const [primero] = indicesCortos
    if (primero !== undefined) indicesCortos.delete(primero)
    indicesCortos.add(bonificacionIndex)
  }

  return catalogo.map((producto, i) => {
    const esBonificacion = i === bonificacionIndex
    const solicitado = esBonificacion ? rand.int(1, 6) : rand.int(4, 60)
    const corta = indicesCortos.has(i)
    return {
      id: `${pedidoId}-i${i + 1}`,
      producto: producto.nombre,
      codigo: producto.codigo,
      esBonificacion,
      unidad: producto.unidad,
      solicitado,
      // Sin stock nada (confirmado 0) o parcial. El sin-stock total es el caso que más duele en la
      // planificación, así que tiene que aparecer.
      confirmado: corta ? (rand.chance(0.35) ? 0 : rand.int(1, solicitado - 1)) : solicitado,
    }
  })
}

export const PEDIDOS: Pedido[] = (() => {
  const clientesUsados = new Set<string>()
  const vendedor = rand.cycler(VENDEDORES_POOL)
  /** Reparte los pedidos entre las CIUDADES, en ciclo: ninguna queda sin datos. */
  const ciudadDelPedido = rand.cycler(CIUDAD_IDS)
  /** Un ciclo por ciudad del interior, para repartir entre sus distribuidoras. */
  const cicloPorCiudad = new Map<CiudadId, () => (typeof DISTRIBUIDORAS)[number]>()

  /**
   * Las distribuidoras de una ciudad, en el orden del maestro.
   *
   * LO QUE ESTÁ EN JUEGO: de los pedidos de cada distribuidora sale después su contorno sembrado, que
   * es la ENVOLVENTE CONVEXA de esa nube (`zonas-distribucion-seed.ts`). Dos nubes entrelazadas dan
   * dos envolventes que se pisan casi por completo, y ahí el territorio deja de significar algo: un
   * punto adentro de los dos polígonos no tiene dueño definido.
   *
   * Por eso el reparto NO es un sorteo ni un ciclo cuando hay dos en la misma ciudad.
   */
  const deLaCiudad = (ciudad: CiudadId) =>
    DISTRIBUIDORAS.filter((d) => d.cityId === cityIdDe(ciudad))

  /**
   * La dueña de un pedido de la CAPITAL, según de qué lado del centro cae.
   *
   * PARTIDA POR LONGITUD, y eso es lo que garantiza que las dos envolventes NO se pisen: dos nubes
   * separadas por una recta son linealmente separables, y el teorema del hiperplano separador dice que
   * entonces sus envolventes convexas tampoco se tocan. Partir por zona logística —norte+este contra
   * sur+centro— parecía más natural pero no cumple eso: «centro» está en el medio y su envolvente se
   * mete adentro de la otra.
   *
   * La zona logística sigue existiendo y sigue siendo independiente: son dos particiones distintas del
   * mismo territorio, que es exactamente lo que las dos pantallas afirman.
   */
  const duenaEnLaCapital = (lng: number): (typeof DISTRIBUIDORAS)[number] => {
    const dos = deLaCiudad('santacruz')
    if (dos.length < 2) return dos[0] ?? DISTRIBUIDORAS[0]
    return lng < CIUDAD_CENTRO.santacruz[1] ? dos[0] : dos[1]
  }

  /** La dueña de un pedido del INTERIOR: ciclo entre las de esa ciudad, separadas por sus depósitos. */
  const duenaEnElInterior = (ciudad: CiudadId): (typeof DISTRIBUIDORAS)[number] => {
    const dos = deLaCiudad(ciudad)
    if (dos.length === 0) return DISTRIBUIDORAS[0]
    if (dos.length === 1) return dos[0]
    let ciclo = cicloPorCiudad.get(ciudad)
    if (!ciclo) {
      ciclo = rand.cycler(dos)
      cicloPorCiudad.set(ciudad, ciclo)
    }
    return ciclo()
  }
  const out: Pedido[] = []
  // Localidades "cercanas" a la capital: una tienda de barrio en Cotoca es plausible, en Buena Vista
  // (a 100 km) no. Dan algo de dispersión al filtro de Ciudad sin volver falso el dataset.
  const cercanas = LOCALIDADES.slice(0, 4)

  let siguienteId = 1
  let siguientePunto = 1

  /**
   * Coordenadas ya asignadas, para que DOS puntos de entrega distintos no caigan en el mismo lugar.
   *
   * Es la contrapartida de elegir de un pool en vez de sortear con jitter. El jitter daba coordenadas
   * prácticamente únicas por construcción; una lista de 440 posiciones, no: el dataset necesita ~325
   * puntos, y eligiendo con reemplazo la paradoja del cumpleaños predice cientos de repeticiones. Cada
   * repetición son dos clientes distintos, con su propio `DP-xxxx` y sus propios pedidos, dibujados
   * exactamente uno ENCIMA del otro — un pin que tapa a otro sin que nadie pueda saberlo, que es el
   * mismo problema que el `zIndexOffset` del mapa existe para evitar.
   *
   * Compartir punto SÍ existe y es otra cosa: es el mismo `DP-xxxx` con varios pedidos (ver
   * `compartir` más abajo), y ahí un solo pin representando a todos es exactamente lo correcto.
   */
  const coordenadasUsadas = new Set<string>()

  /**
   * Una calle libre de la zona. Si la zona se agotó cae a cualquier otra: preferimos un pedido con la
   * zona un poco corrida antes que dos pines superpuestos, porque lo primero no se ve y lo segundo sí.
   *
   * EL MARGEN SE ENSANCHÓ. Antes los 408 pedidos caían todos en Santa Cruz y agotaban zonas enteras
   * (la sur se llevaba 120 sobre 110 calles). Desde que el pedido se reparte entre las diez
   * distribuidoras, solo las 2 de la capital piden calle: ~132 de los 660, sobre 440 disponibles. La
   * caída por barrido prácticamente no ocurre y ninguna coordenada se repite.
   */
  /**
   * Una coordenada cerca del depósito de una distribuidora, para las ciudades que NO tienen pool de
   * calles.
   *
   * `PUNTOS_CALLE_SCZ` son 440 coordenadas relevadas sobre calles reales de Santa Cruz; no existe el
   * equivalente para Montero, Warnes, La Guardia y Cotoca. Antes eso no importaba porque todos los
   * pedidos eran de la capital.
   *
   * SE SORTEA SOBRE UN ANILLO y no sobre un disco: con un disco uniforme en radio, la mitad de los
   * puntos cae en el 25% central y el pueblo entero se ve como una mancha alrededor del depósito. El
   * anillo (radio entre el 35% y el 100% del máximo) los reparte por el área que la ciudad ocupa de
   * verdad.
   *
   * NO caen sobre calles, y se sabe: son localidades chicas que se miran alejadas, donde el pin marca
   * la manzana y no el portón. La capital —que es la que se mira de cerca— sigue usando el pool.
   */
  const cercaDelDeposito = (dist: { lat: number; lng: number }): readonly [number, number] => {
    const RADIO_MAX_KM = 3.5
    const angulo = rand.next() * Math.PI * 2
    const radioKm = RADIO_MAX_KM * (0.35 + rand.next() * 0.65)
    const dLat = (radioKm / 111.32) * Math.sin(angulo)
    const dLng = ((radioKm / 111.32) * Math.cos(angulo)) / Math.cos((dist.lat * Math.PI) / 180)
    return [Number((dist.lat + dLat).toFixed(6)), Number((dist.lng + dLng).toFixed(6))] as const
  }

  const calleLibre = (zona: ZonaId): readonly [number, number] => {
    const clave = (p: readonly [number, number]) => `${p[0]},${p[1]}`
    const tomar = (p: readonly [number, number]) => {
      coordenadasUsadas.add(clave(p))
      return p
    }

    // SORTEO CON REINTENTO, y no "la primera libre de la lista". Barrer la lista en orden daría
    // coordenadas correctas y un mapa mentiroso: el pool está ordenado por distancia al ancla, así que
    // los primeros pedidos se apilarían todos alrededor del centro de su zona y la dispersión que este
    // cambio venía a arreglar se perdería por otro lado. Los doce intentos alcanzan mientras la zona
    // vaya por debajo de las ~90 de 110 tomadas; recién sobre el final del canal empiezan a fallar, y
    // por eso abajo hay barrido.
    const pool = PUNTOS_CALLE_SCZ[zona]
    for (let intento = 0; intento < 12; intento++) {
      const p = rand.pick(pool)
      if (!coordenadasUsadas.has(clave(p))) return tomar(p)
    }

    // Zona saturada: recién acá se barre, primero la propia y después las otras.
    const propia = pool.find((p) => !coordenadasUsadas.has(clave(p)))
    if (propia) return tomar(propia)
    for (const otra of ZONA_IDS) {
      const libre = PUNTOS_CALLE_SCZ[otra].find((p) => !coordenadasUsadas.has(clave(p)))
      if (libre) return tomar(libre)
    }
    // Sin ninguna libre en las cuatro zonas (imposible con los volúmenes actuales) se reusa una: un pin
    // repetido es preferible a un dataset que no se puede construir.
    return pool[0]
  }

  for (const canal of CANAL_IDS) {
    const cantidad = VOLUMEN.pedidosPorCanal
    const corte = CANAL_META[canal].timeOff
    const ventanasDentro = ventanasQueCierranAntesDe(corte)
    const ventanasFuera = ventanasQueCierranDespuesDe(corte)
    const perfil = PERFIL_CANAL[canal]

    const deProvincia = canal === 'provincia' ? clientesDeProvincia(cantidad, clientesUsados) : null
    const nombres = deProvincia ? null : clientesDelCanal(canal, cantidad, clientesUsados)

    // Puntos de entrega ya creados en ESTE canal, para poder compartirlos: varios pedidos del mismo
    // delivery_point se unifican en UNA parada, y sin puntos repetidos esa lógica no se ejercita.
    // El punto LLEVA su cliente: un delivery_point pertenece a UN cliente, así que compartir punto
    // implica compartir cliente (es el caso "el mismo local hizo dos pedidos"). Sin esto una parada
    // unificada mostraba un cliente mientras sus pedidos pertenecían a otros distintos.
    // EL PUNTO LLEVA SU CIUDAD, SU ZONA Y SU DISTRIBUIDORA, no solo su coordenada. Compartir punto es
    // "el mismo local hizo dos pedidos": el segundo pedido está en el MISMO lugar, así que le
    // corresponden la misma ciudad y la misma distribuidora. Sin esto, un pedido sorteado para Montero
    // que reusaba un punto de Santa Cruz quedaba con coordenadas de la capital y etiqueta de Montero —
    // el filtro de ciudad y el mapa decían cosas distintas del mismo pedido.
    const puntosDelCanal: {
      id: string
      nombre: string
      lat: number
      lng: number
      cliente: string
      ciudad: CiudadId
      zona: ZonaId
      distribuidoraId: number
    }[] = []

    for (let i = 0; i < cantidad; i++) {
      const clientePropio = deProvincia ? deProvincia[i].cliente : nombres![i]

      // La coordenada se ELIGE de las calles de la zona, no se calcula con jitter alrededor del ancla.
      // El jitter era un cuadrado de casi 5 km de lado y no sabía dónde hay ciudad: dejaba pines en el
      // Río Piraí, en las lagunas de oxidación y en campo abierto sin una calle a cientos de metros.
      // Ver `PUNTOS_CALLE_SCZ` para de dónde salen las coordenadas y cómo regenerarlas.
      // ── A QUIÉN LE TOCA, Y DÓNDE CAE ────────────────────────────────────────────────────────
      // El pedido se reparte por CICLO entre las diez distribuidoras y de ahí saca su ciudad y su
      // coordenada. Antes decía `const ciudad = 'santacruz'` escrito, así que ocho distribuidoras y
      // cuatro ciudades existían en los filtros sin un solo pedido detrás.
      //
      // Por ciclo y no por sorteo: con `pick` puro alguna quedaba en cero, que es justo el estado que
      // esto viene a eliminar.
      // ── A QUIÉN LE TOCA ─────────────────────────────────────────────────────────────────────
      // Ver `duenaDe`. En la capital el dueño lo decide la COORDENADA, así que hay que tenerla antes;
      // en el interior lo decide un ciclo por ciudad y la coordenada sale del depósito que toque.
      const ciudadSorteada = ciudadDelPedido()
      const zonaSorteada = ZONA_POR_CIUDAD[ciudadSorteada] ?? rand.pick(ZONA_IDS)
      const lugar = rand.pick(LUGARES_SCZ)

      // ~22% de los pedidos reusan un punto de entrega ya existente del canal → paradas unificadas.
      const compartir = puntosDelCanal.length > 0 && rand.chance(0.22)
      const punto = compartir
        ? rand.pick(puntosDelCanal)
        : (() => {
            // La coordenada se pide DENTRO de esta rama: `calleLibre` marca la calle como usada, y
            // llamándola siempre se quemaba una del pool en cada pedido que después compartía punto.
            //
            // EL ORDEN IMPORTA. En la capital la coordenada decide el dueño (partición por longitud);
            // en el interior el dueño decide la coordenada (anillo alrededor de su depósito).
            // `[lat, lng]`, orden de Leaflet.
            const enLaCapital = ciudadSorteada === 'santacruz'
            const interiorDist = enLaCapital ? null : duenaEnElInterior(ciudadSorteada)
            const [lat, lng] = enLaCapital
              ? calleLibre(zonaSorteada)
              : cercaDelDeposito(interiorDist!)
            const dist = interiorDist ?? duenaEnLaCapital(lng)
            return {
              id: `DP-${String(siguientePunto++).padStart(4, '0')}`,
              nombre: `Suc. ${lugar} · ${rand.pick(VIAS)} ${rand.int(2, 48)}`,
              lat,
              lng,
              cliente: clientePropio,
              ciudad: ciudadSorteada,
              zona: zonaSorteada,
              distribuidoraId: dist.id,
            }
          })()

      // Todo lo GEOGRÁFICO sale del punto, no del sorteo: ver la nota de `puntosDelCanal`.
      const ciudad = punto.ciudad
      const zona = punto.zona
      if (!compartir) puntosDelCanal.push(punto)
      // Al compartir punto, el pedido es del cliente DUEÑO del punto (su nombre propio queda sin
      // usar, que es correcto: hay menos clientes distintos que pedidos, como en la realidad).
      const cliente = punto.cliente

      // Un tercio queda FUERA del corte: la pestaña de selección manual necesita carga y el diálogo
      // del canal necesita algo que quitar. Los dos grupos quedan siempre no vacíos.
      const ventana = rand.chance(0.33) ? rand.pick(ventanasFuera) : rand.pick(ventanasDentro)
      const peso = rand.int(perfil.peso[0], perfil.peso[1])
      const productType: ProductType = rand.chance(0.35) ? 'Frío' : 'Seco'

      out.push({
        id: `p${siguienteId}`,
        salesOrder: String(10241 + siguienteId),
        cliente,
        canal,
        company: rand.pick(EMPRESAS),
        paymentType: rand.pick(PAYMENT_TYPES),
        productType,
        fechaEntrega: FECHA_PLAN,
        total: rand.float(perfil.total[0], perfil.total[1], 2),
        vendedor: vendedor(),
        puntoEntregaId: punto.id,
        puntoEntrega: punto.nombre,
        ventana,
        peso,
        // La densidad decide qué capacidad del camión se agota primero. Ver `DENSIDAD_SECO`.
        volumen: Number(
          (peso /
            (productType === 'Frío'
              ? rand.int(DENSIDAD_FRIO[0], DENSIDAD_FRIO[1])
              : rand.int(DENSIDAD_SECO[0], DENSIDAD_SECO[1]))).toFixed(2),
        ),
        priority: rand.pick([1, 2, 3] as const),
        listo: rand.chance(0.9),
        lat: punto.lat,
        lng: punto.lng,
        ciudad,
        distribuidoraId: punto.distribuidoraId,
        mercado: MERCADO_POR_CIUDAD[ciudad],
        zona,
        items: generarItems(`p${siguienteId}`, productType),
      })
      siguienteId++
    }
  }

  return out
})()

/**
 * Arma UN pedido en una coordenada dada. Es la fábrica que usa el generador de pedidos por contorno
 * (`pedidos-de-contorno.ts`) para poblar una zona de distribución recién dibujada.
 *
 * ═══ POR QUÉ ACÁ Y NO ALLÁ ═══
 *
 * Todo lo que un pedido necesita para ser plausible —las ventanas horarias válidas, los perfiles de
 * peso y monto por canal, las densidades que dan el volumen, los nombres de local, las vías, el
 * mercado de cada ciudad, los ítems— son constantes PRIVADAS de este módulo. Exportar las once para
 * que otro archivo las combine sería publicar el interior del generador y garantizar que las dos
 * copias se separen: bastaría con tocar `PERFIL_CANAL` acá para que los pedidos de contorno quedaran
 * con otro criterio de peso sin que nadie lo note.
 *
 * Lo que sale exportado es la OPERACIÓN, no los ingredientes: se pide "un pedido de este canal, en
 * esta coordenada, de esta ciudad" y se recibe un `Pedido` armado con las mismas reglas que los del
 * dataset base.
 *
 * `rand` viene POR PARÁMETRO y no del `rand` del módulo: el que llama necesita sembrarlo con algo
 * derivado del contorno para que la misma zona dé siempre los mismos pedidos. Usando el de acá, el
 * orden de generación dependería de cuántas veces se llamó antes y el mapa cambiaría solo.
 */
export function crearPedidoEn(input: {
  id: string
  salesOrder: string
  puntoEntregaId: string
  canal: CanalId
  ciudad: CiudadId
  /** Distribuidora dueña. La sabe el que llama: es la del contorno donde cayó el punto. */
  distribuidoraId: number
  zona: ZonaId
  lat: number
  lng: number
  cliente: string
  vendedor: string
  rand: Rand
}): Pedido {
  const { rand: r, canal, ciudad, zona, lat, lng, cliente, vendedor } = input
  const perfil = PERFIL_CANAL[canal]
  const corte = CANAL_META[canal].timeOff
  // El mismo tercio fuera de corte que el dataset base: la bandeja de "fuera de corte" tiene que
  // tener algo adentro también cuando los pedidos vienen de un contorno.
  const ventana = r.chance(0.33)
    ? r.pick(ventanasQueCierranDespuesDe(corte))
    : r.pick(ventanasQueCierranAntesDe(corte))
  const productType: ProductType = r.chance(0.35) ? 'Frío' : 'Seco'
  const peso = r.int(perfil.peso[0], perfil.peso[1])

  return {
    id: input.id,
    salesOrder: input.salesOrder,
    cliente,
    canal,
    company: r.pick(EMPRESAS),
    paymentType: r.pick(PAYMENT_TYPES),
    productType,
    fechaEntrega: FECHA_PLAN,
    total: r.float(perfil.total[0], perfil.total[1], 2),
    vendedor,
    puntoEntregaId: input.puntoEntregaId,
    puntoEntrega: `Suc. ${r.pick(LUGARES_SCZ)} · ${r.pick(VIAS)} ${r.int(2, 48)}`,
    ventana,
    peso,
    volumen: Number(
      (
        peso /
        (productType === 'Frío'
          ? r.int(DENSIDAD_FRIO[0], DENSIDAD_FRIO[1])
          : r.int(DENSIDAD_SECO[0], DENSIDAD_SECO[1]))
      ).toFixed(2),
    ),
    priority: r.pick([1, 2, 3] as const),
    listo: r.chance(0.9),
    lat,
    lng,
    ciudad,
    distribuidoraId: input.distribuidoraId,
    mercado: MERCADO_POR_CIUDAD[ciudad],
    zona,
    items: generarItems(input.id, productType),
  }
}

// Los pedidos ya guardan ciudad/mercado/zona; estos accesores quedan por compatibilidad con los
// consumidores (filtros del panel y narrowing del store), que los llaman como función.
export const ciudadDe = (p: Pedido): CiudadId => p.ciudad
export const mercadoDe = (p: Pedido): MercadoId => p.mercado
export const zonaDe = (p: Pedido): ZonaId => p.zona

/**
 * La distribuidora dueña del pedido. LO LEE, ya no lo adivina.
 *
 * Esto era una heurística —«norte y este a la primera, sur y centro a la segunda»— sobre una ciudad
 * que además siempre era Santa Cruz. Ninguna columna del modelo dice eso, y el resultado era que la
 * mitad del maestro no tenía pedidos. Ahora el dueño se sella al generar el pedido
 * (`Pedido.distribuidoraId`) y esto es un accesor, como `ciudadDe` o `zonaDe`.
 */
export const distribuidoraIdDe = (p: Pedido): number => p.distribuidoraId

export const distribuidoraNombreDe = (p: Pedido): string => {
  const id = distribuidoraIdDe(p)
  const dist = DISTRIBUIDORAS.find((d) => d.id === id)
  return dist ? dist.nombre : `Distribuidora #${id}`
}

/** Vendedores distintos presentes en PEDIDOS (fuente única, así el filtro no se desincroniza). */
export const VENDEDORES = Array.from(new Set(PEDIDOS.map((p) => p.vendedor))).sort()

// ── Resumen por canal (respuesta del backend) ──────────────────────────────────────────────────
// Shape exacto del endpoint de canales: un agregado por canal. `total` es monto (Bs) y
// `totalWeight` va en kg. Las tarjetas de la fase de canales pintan estos números.
export interface CanalResumen {
  channelId: number
  channelName: string
  countOrders: number
  countCustomers: number
  total: number
  totalWeight: number
  timeOff: string
}

// channelId estático por canal; el resto del resumen se DERIVA de PEDIDOS, así las tarjetas SIEMPRE
// cuadran con la tabla y no se pueden desincronizar ni quedar como copia-pega entre canales.
const CHANNEL_IDS: Record<CanalId, number> = {
  horizontal: 78945,
  tradicional: 78946,
  mayorista: 78947,
  supermercado: 78948,
  provincia: 78950,
  ecommerce: 78951,
  // evenado: 78949,
}

export const CANAL_RESUMEN: Record<CanalId, CanalResumen> = Object.fromEntries(
  CANAL_IDS.map((canal) => {
    const items = PEDIDOS.filter((p) => p.canal === canal)
    return [
      canal,
      {
        channelId: CHANNEL_IDS[canal],
        channelName: CANAL_META[canal].label.toUpperCase(),
        countOrders: items.length,
        countCustomers: new Set(items.map((p) => p.cliente)).size,
        total: Number(items.reduce((acc, p) => acc + p.total, 0).toFixed(2)),
        totalWeight: Number(items.reduce((acc, p) => acc + p.peso, 0).toFixed(2)),
        timeOff: CANAL_META[canal].timeOff,
      } satisfies CanalResumen,
    ]
  })
) as Record<CanalId, CanalResumen>

// ── dispatch_plan_order (paradas) ────────────────────────────────────────────────────────────

export interface Parada {
  id: string
  /** delivery_point_id — la clave por la que se unifican los pedidos. */
  puntoEntregaId: string
  puntoEntrega: string
  cliente: string
  canal: CanalId
  /**
   * Centro que despacha esta parada, o `null` si todavía no se resolvió.
   *
   * Lo pone `construirParadas` con el resolvedor del plan (contorno primero, sello después). Es una
   * RESTRICCIÓN DEL RUTEO: una ruta pertenece a un centro y solo puede llevar paradas de ese centro.
   */
  distribuidoraId?: number | null
  /** Los candidate_order que colapsaron en esta parada. */
  pedidos: Pedido[]
  pesoTotal: number
  volumenTotal: number
  ventana: string
  /** planned_sequence dentro de la ruta del camión. */
  secuencia: number
  /** Camión que le asignó la optimización (null = todavía sin asignar). */
  camionId: string | null
  rutaId?: string | null
  /** forced_planning_truck_id — el usuario clavó esta parada a un camión. */
  camionForzadoId: string | null
  lat: number
  lng: number
}

/**
 * Arma las paradas del plan a partir de los pedidos: los que comparten delivery_point_id se
 * UNIFICAN en una sola parada (el camión va una vez y descarga todo). Es el corazón de
 * dispatch_plan_order y por eso se deriva de los pedidos en vez de escribirse a mano: los totales
 * nunca pueden quedar desfasados de sus pedidos.
 *
 * La asignación de camión también se CALCULA. Antes era un mapa de ids escrito a mano, que con un
 * dataset generado dejaría casi todas las paradas sin camión — y sin camión no hay RUTAS ni colores
 * en el mapa. Se reparte por CERCANÍA: paradas ordenadas por posición y cortadas en tramos
 * consecutivos, para que cada ruta se vea como una ruta y no como puntos salteados.
 */
function construirParadas(pedidos: Pedido[]): Parada[] {
  const porPunto = new Map<string, Pedido[]>()
  for (const pedido of pedidos) {
    porPunto.set(pedido.puntoEntregaId, [...(porPunto.get(pedido.puntoEntregaId) ?? []), pedido])
  }

  const paradas: Parada[] = [...porPunto.entries()].map(([puntoEntregaId, delPunto], i) => {
    const primero = delPunto[0]
    return {
      id: `stop-${puntoEntregaId}`,
      puntoEntregaId,
      puntoEntrega: primero.puntoEntrega,
      cliente: primero.cliente,
      canal: primero.canal,
      pedidos: delPunto,
      pesoTotal: delPunto.reduce((acc, p) => acc + p.peso, 0),
      volumenTotal: Number(delPunto.reduce((acc, p) => acc + p.volumen, 0).toFixed(1)),
      ventana: primero.ventana,
      secuencia: i + 1,
      camionId: null,
      camionForzadoId: null,
      lat: primero.lat,
      lng: primero.lng,
    }
  })

  const enRuteo = CAMIONES.filter((c) => c.enRuteo)
  // Orden geográfico por curva de Hilbert: agrupa por VECINDAD REAL, no por franja.
  // Antes acá había un `sort` por longitud y después latitud. Un sort es unidimensional y la cercanía
  // no lo es: cada camión terminaba con una franja vertical del mapa, angosta en longitud pero de
  // todo el rango norte-sur — paradas del mismo viaje separadas ~95 km. El orden FINO dentro de cada
  // ruta lo sigue haciendo el nearest-neighbour del mapa.
  const porCercania = ordenarPorCercania(paradas, (p) => [p.lat, p.lng])

  // El reparto es POR PESO, a prorrata de la capacidad de cada camión. Antes había un target FIJO de
  // 44 paradas por camión: con 175 paradas, `Math.floor(i / 44)` solo llegaba al índice 3, así que 4
  // camiones se comían el dataset entero (~80 t cada uno contra capacidades de 9-29 t → 953% de
  // ocupación) y los otros 26 quedaban vacíos. Un target por CANTIDAD ignora que las paradas no pesan
  // lo mismo ni los camiones tienen la misma capacidad; el techo real del camión son los kilos.
  //
  // Se llena un camión hasta su cupo antes de pasar al siguiente: recorrer la curva de Hilbert en
  // orden mantiene la contigüidad geográfica de cada ruta.
  //
  // Un TERCIO de los camiones se llena por encima de su capacidad a propósito: es el escenario de
  // validación de peso que `ORDENES_TRANSPORTE` necesita más abajo ("los camiones cuyas paradas
  // asignadas ya pesan más que su capacidad reciben TODAS sus paradas y salta la alerta al
  // unificar"). Si acá se topeara todo al 100%, ese escenario no podría existir en el dataset.
  // Antes el exceso salía por accidente del reparto por cantidad; ahora es explícito y acotado.
  const EXCEDE_CADA = 3
  const FACTOR_EXCEDE = 1.15
  const capKg = enRuteo.map((c) => c.capacidadPeso * 1000)
  const excede = enRuteo.map((_, i) => i % EXCEDE_CADA === 0)
  const demandaKg = porCercania.reduce((acc, p) => acc + p.pesoTotal, 0)
  // Los que exceden se llevan su cupo fijo; el resto se reparte lo que queda, a prorrata.
  const cupoExcedidos = capKg.reduce((acc, kg, i) => acc + (excede[i] ? kg * FACTOR_EXCEDE : 0), 0)
  const capResto = capKg.reduce((acc, kg, i) => acc + (excede[i] ? 0 : kg), 0)
  const ratioResto =
    capResto > 0 ? Math.max(0, Math.min(1, (demandaKg - cupoExcedidos) / capResto)) : 0
  const objetivoKg = capKg.map((kg, i) => (excede[i] ? kg * FACTOR_EXCEDE : kg * ratioResto))
  let actual = 0

  /**
   * A qué CIUDAD reparte cada camión. **Se decide ANTES de repartir, y ese es todo el punto.**
   *
   * ═══ EL PROBLEMA ═══
   *
   * La curva de Hilbert agrupa por vecindad, pero el reparto NO la respetaba: cuando el camión de
   * turno se quedaba sin cupo, la parada iba al PRIMERO con lugar recorriendo la lista en círculo. Y
   * un camión llenado a medias al principio de la curva —en Montero— seguía teniendo cupo trescientas
   * paradas después, cuando la curva ya iba por La Guardia. Se la llevaba igual.
   *
   * Estaba en el dataset y se veía: una orden con paradas en Montero, La Guardia y Warnes, **69,9 km
   * entre las dos más lejanas**. En el monitoreo, un camión que cruza el departamento entre entrega y
   * entrega; en el planificador, una ruta que ninguna persona armaría. La contigüidad que la curva
   * conseguía la deshacía el bucle de abajo.
   *
   * ═══ POR QUÉ NO ALCANZA CON "EL CAMIÓN SE ATA A LA PRIMERA CIUDAD QUE LE TOQUE" ═══
   *
   * Fue el primer intento y dejó **227 de 525 paradas sin camión** (contra ~5% que el mockup quiere a
   * propósito). El motivo: la curva recorre las ciudades en orden espacial, así que las primeras se
   * quedaban con TODA la flota y las últimas no encontraban un solo camión libre. Atar por orden de
   * llegada reparte los camiones según por dónde empieza la curva, que no tiene nada que ver con
   * dónde está el trabajo.
   *
   * ═══ LA REGLA ═══
   *
   * Cada camión va a la ciudad con más demanda TODAVÍA SIN CUBRIR, y se le descuenta su cupo. Es un
   * reparto goloso, determinista y proporcional al peso real de cada ciudad — no a cuántas ciudades
   * hay ni a en qué orden aparecen.
   *
   * Un camión reparte en UNA ciudad no es una restricción inventada para el mockup: es la única
   * lectura posible de un reparto diario, y es la misma regla que el planificador ya aplica por centro
   * de distribución (`mismoCentro` en `planner-model`).
   */
  const faltaPorCiudad = new Map<CiudadId, number>()
  for (const parada of porCercania) {
    const c = ciudadDe(parada.pedidos[0])
    faltaPorCiudad.set(c, (faltaPorCiudad.get(c) ?? 0) + parada.pesoTotal)
  }
  const ciudadDeCamion: CiudadId[] = enRuteo.map((_, i) => {
    let elegida = CIUDAD_IDS[0]
    let mayor = -Infinity
    // Recorrido explícito y no un `sort`: el orden de inserción del Map es el de la curva, así que un
    // empate se resuelve siempre igual. Con `sort` sobre un array reconstruido, no.
    for (const [ciudad, falta] of faltaPorCiudad) {
      if (falta > mayor) {
        mayor = falta
        elegida = ciudad
      }
    }
    faltaPorCiudad.set(elegida, mayor - objetivoKg[i])
    return elegida
  })

  porCercania.forEach((parada) => {
    // ~5% queda sin asignar a propósito: es el estado "todavía sin camión" que el mockup retrata.
    // El sorteo se hace UNA vez por parada, igual que antes, para no correr la semilla del dataset.
    if (rand.chance(0.05)) return
    // Todas las paradas de un punto de entrega son del mismo lugar, así que la ciudad sale del primer
    // pedido — igual que el dueño en `construirParadas` del planificador.
    const ciudad = ciudadDe(parada.pedidos[0])
    // Primer camión, desde el actual, que sea de esta ciudad (o todavía no sea de ninguna) y donde la
    // parada entre dentro de su cupo.
    let idx = -1
    for (let k = 0; k < enRuteo.length; k++) {
      const i = (actual + k) % enRuteo.length
      if (ciudadDeCamion[i] !== ciudad) continue
      if (objetivoKg[i] >= parada.pesoTotal) {
        idx = i
        break
      }
    }
    // No entra en ninguno: queda sin camión en vez de pasarse del cupo o de cruzar de ciudad. Suma a
    // las ~5% sorteadas arriba, y es el mismo estado "todavía sin camión" que la pantalla ya sabe
    // mostrar — no un hueco nuevo.
    if (idx === -1) return
    objetivoKg[idx] -= parada.pesoTotal
    actual = idx
    parada.camionId = enRuteo[idx].id
  })

  // Un puñado de paradas clavadas a mano por el usuario (forced_planning_truck_id).
  for (const parada of rand.shuffle(paradas.filter((p) => p.camionId)).slice(0, 4)) {
    parada.camionForzadoId = parada.camionId
  }

  return paradas
}

export const PARADAS: Parada[] = construirParadas(PEDIDOS)

// ── Rutas ────────────────────────────────────────────────────────────────────────────────────
// Una RUTA (en esta fase del flujo todavía no se habla de camiones) = la agrupación de paradas que
// la corrida asignó a un mismo vehículo. Se derivan de los camiones que aparecen en las paradas,
// renombrados "Ruta 1..N" y heredando el color con el que ya se pintan sus pines en el mapa. Es la
// MISMA lista que usan el filtro del mapa y el "Mover a" de la lista de pedidos.
export interface Ruta {
  id: string
  nombre: string
  color: string
  /** Camión de la corrida al que corresponde esta ruta (mockup). */
  camionId: string
}
export const RUTAS: Ruta[] = CAMIONES.filter((c) => PARADAS.some((p) => p.camionId === c.id)).map(
  (c, i) => ({ id: `r${i + 1}`, nombre: `Ruta ${i + 1}`, color: c.color, camionId: c.id }),
)

/** Ruta a la que pertenece una parada según el camión que le asignó la corrida. */
export const rutaPorCamionId = (camionId: string | null): Ruta | undefined =>
  camionId ? RUTAS.find((r) => r.camionId === camionId) : undefined

/** Ruta por su propio id ('r1', 'r2', …). Para datos que ya guardan el id de ruta (ej. órdenes). */
export const rutaPorId = (rutaId: string | null): Ruta | undefined =>
  rutaId ? RUTAS.find((r) => r.id === rutaId) : undefined

// Camión (→ ruta) de cada pedido según la parada que lo contiene: los pedidos del mismo punto de
// entrega comparten la asignación de la corrida.
const camionPorPedidoId = new Map<string, string | null>()
for (const parada of PARADAS) {
  for (const pedido of parada.pedidos) camionPorPedidoId.set(pedido.id, parada.camionId)
}

/** Ruta a la que pertenece un pedido según la corrida (undefined = todavía sin asignar). */
export const rutaPorPedidoId = (pedidoId: string): Ruta | undefined =>
  rutaPorCamionId(camionPorPedidoId.get(pedidoId) ?? null)

export function camionPorId(id: string | null): Camion | undefined {
  return id ? CAMIONES.find((c) => c.id === id) : undefined
}

/** Paradas asignadas a un camión. */
const paradasDeCamion = (camionId: string): Parada[] =>
  PARADAS.filter((p) => p.camionId === camionId)

// ── routes (corridas de optimización) ────────────────────────────────────────────────────────

export interface Corrida {
  id: string
  /** engine — quién resolvió el ruteo. */
  motor: string
  ejecutadaEn: string
  estado: 'completada' | 'fallida'
  distanciaKm: number
  tiempoMin: number
  costo: number
  score: number
  camiones: number
  paradas: number
  /** is_selected — la corrida que se va a ejecutar. */
  seleccionada: boolean
}

/**
 * Historial de corridas, de la más reciente a la más vieja. La primera es la mejor y la
 * seleccionada, y la calidad decae hacia el pasado: es lo que se espera de optimizaciones
 * sucesivas. Camiones y paradas salen del plan REAL, no de números inventados.
 */
export const CORRIDAS: Corrida[] = (() => {
  const paradasAsignadas = PARADAS.filter((p) => p.camionId).length
  return Array.from({ length: VOLUMEN.corridas }, (_, i) => {
    const decaimiento = i / VOLUMEN.corridas
    const hora = new Date()
    hora.setMinutes(hora.getMinutes() - (18 + i * 23))
    const fallida = i > 0 && rand.chance(0.1)

    return {
      id: `run-${VOLUMEN.corridas - i}`,
      motor: 'Google Route Optimization',
      ejecutadaEn: `Hoy ${String(hora.getHours()).padStart(2, '0')}:${String(hora.getMinutes()).padStart(2, '0')}`,
      estado: fallida ? 'fallida' : 'completada',
      distanciaKm: Number((214.6 * (1 + decaimiento * 0.45)).toFixed(1)),
      tiempoMin: Math.round(486 * (1 + decaimiento * 0.4)),
      costo: Math.round(1842 * (1 + decaimiento * 0.35)),
      score: Number((0.94 - decaimiento * 0.3).toFixed(2)),
      camiones: RUTAS.length,
      paradas: paradasAsignadas,
      seleccionada: i === 0,
    } satisfies Corrida
  })
})()

// ── dispatch_order ───────────────────────────────────────────────────────────────────────────

export type EstadoOrden = 'pendiente' | 'cargando' | 'despachada' | 'procesado'

export interface OrdenDespacho {
  id: string
  codigo: string
  camionId: string
  rutaId: string
  conductor: string
  almacen: string
  estado: EstadoOrden
  salida: string
  /**
   * OJO: son KILOS, no un porcentaje, a pesar del nombre — OrdersView lo muestra como "Kg". El
   * nombre queda por compatibilidad con las vistas que ya lo leen así.
   */
  cargaPct: number
  /** Tiempo estimado de recorrido de la ruta, en minutos. */
  duracionMin: number
}

// Una orden por RUTA (o sea, por camión de la corrida). El chofer arranca VACÍO: la corrida genera
// la orden y el despachador asigna el chofer después, en el detalle.
export const ORDENES: OrdenDespacho[] = RUTAS.map((ruta, i) => {
  const camion = camionPorId(ruta.camionId)
  const paradas = paradasDeCamion(ruta.camionId)
  const estados: EstadoOrden[] = ['pendiente', 'cargando', 'despachada']

  return {
    id: `do${i + 1}`,
    codigo: String(2041 + i),
    // La PLACA real y no un placeholder tipo 'Truck-SAP1': la vista la muestra cruda y el selector de
    // reasignación trabaja con placas, así la orden queda trazable contra la flota.
    camionId: camion?.placa ?? '—',
    rutaId: ruta.id,
    conductor: '',
    almacen: camion?.almacen ?? ALMACENES[0],
    estado: i < 3 ? estados[i] : rand.pick(estados),
    salida: `${String(6 + Math.floor(i / 4)).padStart(2, '0')}:${['00', '15', '30', '45'][i % 4]}`,
    cargaPct: Math.round(paradas.reduce((acc, p) => acc + p.pesoTotal, 0)),
    duracionMin: 120 + paradas.length * 12,
  } satisfies OrdenDespacho
})

// ── transport_orders para la vista de UNIFICACIÓN ──────────────────────────────────────────────
// Varias órdenes del MISMO camión (mismo planning_truck vía route) coexisten y se quieren fusionar
// en un solo viaje reoptimizado. Para que el mockup sea CONSISTENTE, cada orden "posee" un
// subconjunto REAL de PARADAS (sus route_delivery_points): el conteo de paradas y el peso se DERIVAN
// de ahí, y al unificar el optimizador recibe exactamente esas paradas (no números inventados).
export interface OrdenTransporte {
  /** transport_orders.id (interno). */
  id: string
  /** Número visible de la orden. */
  codigo: string
  /** Placa del planning_truck (clave de agrupación para unificar). */
  camion: string
  /** trip.driver_employee_id → nombre ('' = sin asignar todavía). */
  chofer: string
  /** trip.helper_employee_id → nombre ('' = sin asignar todavía). */
  auxiliar: string
  /** transport_orders.status. */
  estado: EstadoOrden
  /** dispatch_delivery_point ids que cubre la ruta de esta orden. */
  paradaIds: string[]
  /** Fotografía de las paradas generadas por la planificación. Las órdenes semilla se resuelven por id. */
  paradas?: Parada[]
  /** Rutas planificadas que originaron la orden. */
  planningRouteRefs?: string[]
}

/**
 * Órdenes de transporte agrupadas por camión, cada una dueña de paradas REALES.
 *
 * Dos escenarios se construyen a propósito porque son los que la vista tiene que retratar:
 *  1. VALIDACIÓN DE PESO — un tercio de los camiones recibe paradas por ~115% de su capacidad, así
 *     al unificar sus órdenes el peso EXCEDE y salta la alerta. Se calcula contra la capacidad REAL
 *     del camión, no con números fijos: si cambia la flota, el escenario sigue valiendo.
 *  2. SIN TRIPULACIÓN — el primer camión queda sin chofer ni auxiliar ('' en ambos), que es el caso
 *     "sin asignar". El resto los tiene CONSISTENTES por placa: la tripulación viaja con el camión,
 *     no con la orden, así que todas las órdenes de un mismo camión comparten la dupla.
 */
export const ORDENES_TRANSPORTE: OrdenTransporte[] = (() => {
  const chofer = rand.cycler(CHOFERES)
  const auxiliar = rand.cycler(AUXILIARES)
  const estados: EstadoOrden[] = ['pendiente', 'cargando', 'despachada']
  // Llenado de los camiones que NO exceden: la mayoría de las unificaciones tiene que entrar bien.
  const factoresNormales = [0.55, 0.85]
  const out: OrdenTransporte[] = []
  /**
   * Cuántas cargas concentran TODAS sus paradas en una sola orden, en vez de repartirlas entre 2-3.
   * Son las que el monitoreo usa para mostrar un viaje largo: con el reparto normal, un viaje queda con
   * 1-3 paradas y la simulación en vivo dura menos de un minuto.
   *
   * Eran 5 cuando había 26 rutas; hoy hay ~37 y solo una de cada tres órdenes sale despachada, así que
   * con 5 los viajes largos casi nunca llegaban al monitoreo — quedaban en una orden pendiente. Con 20
   * el listado en vivo abre con viajes de 4 a 23 paradas en vez de una fila de viajes de 2. Sigue
   * dejando ~17 rutas repartidas en 2-3 órdenes, que son las que le dan material a "unificar".
   */
  const CARGAS_CONCENTRADAS = 20
  let concentradas = 0

  const candidatos = RUTAS.map((r) => {
    const camion = camionPorId(r.camionId)!
    const paradas = paradasDeCamion(r.camionId)
    return {
      camion,
      paradas,
      disponibleKg: paradas.reduce((acc, p) => acc + p.pesoTotal, 0),
      capacidadKg: camion.capacidadPeso * 1000,
    }
  }).filter((x) => x.paradas.length >= 2)

  for (let i = 0; i < candidatos.length && out.length < VOLUMEN.ordenesTransporte; i++) {
    const { camion, paradas, disponibleKg, capacidadKg } = candidatos[i]

    // Quién exceden se decide POR LOS DATOS: los camiones cuyas paradas asignadas ya pesan más que
    // su capacidad reciben TODAS sus paradas, y al unificar salta la alerta de peso. Antes el factor
    // se asignaba por posición en la lista, sin correlación con qué camión podía realmente pasarse
    // — y entonces el escenario no aparecía en el dataset.
    const objetivoKg =
      disponibleKg > capacidadKg
        ? disponibleKg
        : capacidadKg * factoresNormales[i % factoresNormales.length]

    // Se toman paradas hasta pasar el objetivo de peso (o agotarlas).
    const elegidas: Parada[] = []
    let acumulado = 0
    for (const parada of paradas) {
      if (acumulado >= objetivoKg) break
      elegidas.push(parada)
      acumulado += parada.pesoTotal
    }
    if (elegidas.length === 0) continue

    // Se reparten en 2-3 órdenes: unificar necesita VARIAS órdenes del mismo camión para tener algo
    // que fusionar (con una sola, la acción no aplica).
    //
    // EXCEPCIÓN — las primeras `CARGAS_CONCENTRADAS` con tripulación NO se reparten. El monitoreo emite
    // un viaje por orden, así que repartir 6 paradas en 3 órdenes daba viajes de 2 paradas y la
    // simulación en vivo de esa carga se terminaba en menos de un minuto. Concentrándolas, esas cargas
    // salen con 4-23 paradas y el seguimiento tiene algo que mostrar. No cambia ningún peso ni ninguna
    // asignación de parada: es el MISMO conjunto, agrupado distinto — así que el mapa del planificador
    // y las alertas de capacidad quedan igual. El costo es que esos camiones no sirven para ensayar
    // "unificar"; las ~17 rutas restantes sí.
    // El `rand.int` se consume IGUAL cuando la carga se concentra, para no correr el PRNG: si se
    // saltara, todo el dataset de abajo (estados, incidencias, telemetría) cambiaría de golpe.
    const reparto = Math.min(elegidas.length, rand.int(2, 3))
    // El camión `i === 0` es el que queda sin tripulación a propósito, así que nunca sale al monitoreo:
    // concentrarle las paradas no serviría de nada.
    const cargaConcentrada = i !== 0 && concentradas < CARGAS_CONCENTRADAS
    if (cargaConcentrada) concentradas++
    const cantidadOrdenes = cargaConcentrada ? 1 : reparto
    const porOrden = Math.ceil(elegidas.length / cantidadOrdenes)
    const tripulacion = i === 0 ? { chofer: '', auxiliar: '' } : { chofer: chofer(), auxiliar: auxiliar() }

    for (let j = 0; j < cantidadOrdenes && out.length < VOLUMEN.ordenesTransporte; j++) {
      const lote = elegidas.slice(j * porOrden, (j + 1) * porOrden)
      if (lote.length === 0) continue
      out.push({
        id: `ot${out.length + 1}`,
        codigo: String(2051 + out.length),
        camion: camion.placa,
        chofer: tripulacion.chofer,
        auxiliar: tripulacion.auxiliar,
        estado: rand.pick(estados),
        paradaIds: lote.map((p) => p.id),
      })
    }
  }

  return out
})()

/**
 * Tripulación de un camión, por placa. La dupla chofer/auxiliar viaja con el CAMIÓN, no con la
 * orden, así que se resuelve una sola vez acá y la usan todas las superficies (listado de camiones,
 * franja del mapa, planes creados) — antes cada una la derivaba por su cuenta y un plan recién
 * creado terminaba con una dupla hardcodeada que no correspondía a ningún camión real.
 *
 * Si el camión tiene órdenes de transporte, gana la dupla de sus órdenes — INCLUIDO el caso vacío
 * del primer camión, que el dataset deja sin tripulación a propósito para retratar "sin asignar".
 * Si no tiene órdenes (un camión de la flota que recién entra en un plan) se le asigna una dupla
 * determinística por su posición en la flota: siempre la misma placa → la misma tripulación.
 */
export const tripulacionDeCamion = (placa: string): { chofer: string; auxiliar: string } => {
  const conOrdenes = ORDENES_TRANSPORTE.find((o) => o.camion === placa)
  if (conOrdenes) return { chofer: conOrdenes.chofer, auxiliar: conOrdenes.auxiliar }
  const i = CAMIONES.findIndex((c) => c.placa === placa)
  if (i < 0) return { chofer: '', auxiliar: '' }
  return { chofer: CHOFERES[i % CHOFERES.length], auxiliar: AUXILIARES[i % AUXILIARES.length] }
}

/** Paradas (dispatch_delivery_points) reales que cubre una orden de transporte. */
export const paradasDeOrden = (o: OrdenTransporte): Parada[] =>
  o.paradas ?? PARADAS.filter((p) => o.paradaIds.includes(p.id))

/** Peso total (kg) de una orden = suma del peso de sus paradas. */
export const pesoDeOrden = (o: OrdenTransporte): number =>
  paradasDeOrden(o).reduce((acc, p) => acc + p.pesoTotal, 0)

/**
 * Cantidad de pedidos (candidate_order) de una orden = suma de los pedidos de sus paradas. Los
 * pedidos que comparten delivery_point ya colapsaron en la parada, así que contar por parada NO
 * duplica: es el mismo total que ve el chofer al cargar.
 */
export const pedidosDeOrden = (o: OrdenTransporte): number =>
  paradasDeOrden(o).reduce((acc, p) => acc + p.pedidos.length, 0)

/**
 * Techo de pedidos por camión. La regla del negocio es que un camión "se llena por capacidad o por
 * cantidad de pedidos": llegar a 50 pedidos lo cierra igual que llegar a su capacidad en kg, porque
 * cada pedido cuesta una descarga y un comprobante, no solo peso. Superarlo es ALERTA, no bloqueo.
 */
export const MAX_PEDIDOS_POR_CAMION = 50

/**
 * Techo de CLIENTES (puntos de entrega) por camión.
 *
 * Es un límite distinto al de pedidos y al de capacidad, y por eso vive aparte: lo que se agota no es
 * el espacio de la caja sino la JORNADA. Cada cliente cuesta llegar, estacionar, descargar, firmar y
 * volver a subir, y a partir de 45 paradas el camión no termina el recorrido en su turno por más
 * lugar que le quede adentro. Un camión puede ir al 40% de su capacidad y ser inviable igual.
 *
 * ALERTA, NO BLOQUEO: hay días en que se sale igual y se acepta volver tarde. La pantalla avisa; la
 * decisión es de quien planifica.
 */
export const MAX_CLIENTES_POR_CAMION = 45

// ── dispatch_plan ────────────────────────────────────────────────────────────────────────────

// El listado se arma SOLO con columnas propias de `dispatch_plans` más el catálogo `plan_status`
// (estado) y el maestro `distributors` (distribuidora) — dos lookups. Los conteos NO son agregados:
// `dispatch_plans` ya los guarda desnormalizados (planned_order_count / planned_truck_count), así que
// el listado no tiene que sumar sobre planning_truck ni dispatch_delivery_points.
export type EstadoPlan = 'borrador' | 'aprobado'

export interface PlanCamion {
  id: string
  camionId: string
  placa: string
  tipo: 'Frío' | 'Seco'
  clase: ClaseCamion
  capacidadKg: number
  capacidadVolM3: number
  rutaNombre: string
  rutaId: string
  rutaColor: string
  /**
   * Paradas que la optimización le asignó a ESTE camión. Sin esto el plan guardaba solo agregados y
   * "Finalizar" desde el listado de camiones no tenía con qué armar el viaje: quedaba sin paradas,
   * sin pedidos y con el botón deshabilitado.
   */
  paradaIds: string[]
  /** Paradas completas confirmadas para esta ruta; evita reconstruirlas desde otro dataset. */
  paradas?: Parada[]
  orderCount: number
  cargaKg: number
  cargaVolM3: number
  pedidos: number
  chofer: string
  auxiliar: string
  ocupacionPct: number
  /**
   * BANDEO: pallets, carritos y demás que salen con el camión y tienen que volver. Se declara en la
   * planificación y viaja con la ruta guardada, porque el control del retorno compara contra ESTE
   * número — si no quedara acá, "salió con 12" sería lo que escriba el que descarga.
   *
   * Opcional: los planes viejos y las rutas que no llevan nada no tienen la clave.
   */
  accesorios?: AccesorioRuta[]
  planId?: number
}

export interface Plan {
  /** dispatch_plans.id — PK numérico. */
  id: number
  /** dispatch_plans.plan_date (YYYY-MM-DD). */
  fecha: string
  /** plan_status.name (dispatch_plans.plan_status_id). */
  estado: EstadoPlan
  /** distributors.name (dispatch_plans.distributor_id). */
  distribuidora: string
  /** dispatch_plans.planned_order_count — contador guardado en el plan. */
  pedidos: number
  /** dispatch_plans.planned_truck_count — contador guardado en el plan. */
  camiones: number
  /** Planificador del plan (dispatch_plans.employee_id / created_by). */
  creadoPor: string
  /** Detalle de camiones asignados y sus rutas creadas. */
  camionesDetalle?: PlanCamion[]
}

/** YYYY-MM-DD de hoy + `dias` (negativo = pasado). Mantiene el listado fresco sin editar fechas a mano. */
function fechaOffset(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Planes de más nuevo a más viejo. Los de hoy pueden estar en borrador; los pasados ya están
 * aprobados — un plan viejo en borrador sería inconsistente (nunca se ejecutó).
 */
export const PLANES: Plan[] = []

// ── Transferencias entre sucursales + Devoluciones (logística inversa) ─────────────────────────
// Se crean en OTRO sistema; acá solo se LISTAN a nivel ORDEN (no ítem), se seleccionan y se suman
// a la planificación. Transferencias = orden entre sucursales; Devoluciones = orden por cliente que
// un camión recoge en el regreso. Alcance preliminar; el detalle de DTOs se define después.

export const SUCURSALES = [...NOMBRES_SUCURSAL]
export const MOTIVOS_DEVOLUCION = [...MOTIVOS_DEVOLUCION_POOL]

// Solo las transferencias confirmadas entran a la planificación → en el mockup todas están confirmadas.
export type EstadoTransferencia = 'Confirmada'

/** Orden de transferencia entre sucursales (nivel documento). */
export interface Transferencia {
  id: string
  codigo: string
  sucursalOrigen: string
  sucursalDestino: string
  /** delivery/transfer date (YYYY-MM-DD). */
  fecha: string
  /** cantidad de ítems/líneas de la orden. */
  items: number
  /** peso total, en kg. */
  peso: number
  /** volumen total, en m³. */
  volumen: number
  estado: EstadoTransferencia
}

export const TRANSFERENCIAS: Transferencia[] = Array.from(
  { length: VOLUMEN.transferencias },
  (_, i) => {
    const origen = rand.pick(SUCURSALES)
    // Destino distinto del origen: una transferencia de una sucursal a sí misma no existe.
    const destino = rand.pick(SUCURSALES.filter((s) => s !== origen))
    const peso = rand.int(120, 980)
    return {
      id: `tr${i + 1}`,
      codigo: String(i + 1).padStart(4, '0'),
      sucursalOrigen: origen,
      sucursalDestino: destino,
      fecha: FECHA_PLAN,
      items: rand.int(3, 32),
      peso,
      // Producto lleno moviéndose entre sucursales: la misma densidad que un pedido de venta. Antes era
      // 230–300 kg/m³ y arrastraba el mismo problema que los pedidos — ver `DENSIDAD_SECO`.
      volumen: Number((peso / rand.int(DENSIDAD_SECO[0], DENSIDAD_SECO[1])).toFixed(2)),
      estado: 'Confirmada',
    } satisfies Transferencia
  },
)

/** Orden de devolución por cliente (nivel documento). */
export interface Devolucion {
  id: string
  codigo: string
  cliente: string
  /** sucursal que gestiona la devolución. */
  sucursal: string
  /** return date (YYYY-MM-DD). */
  fecha: string
  /** cantidad de ítems/líneas de la orden. */
  items: number
  /** peso total, en kg. */
  peso: number
  /** volumen total, en m³. */
  volumen: number
  motivo: string
  /** Camión al que se asigna la recogida en el regreso (null = sin asignar). */
  camionId: string | null
}

// El cliente de una devolución sale de PEDIDOS: es alguien que ya recibió mercadería, no un nombre
// inventado aparte. Se toman sin repetir para que no haya dos devoluciones del mismo cliente.
export const DEVOLUCIONES: Devolucion[] = (() => {
  const clientes = rand.shuffle(Array.from(new Set(PEDIDOS.map((p) => p.cliente))))
  const enRuteo = CAMIONES.filter((c) => c.enRuteo)
  return Array.from({ length: VOLUMEN.devoluciones }, (_, i) => {
    const peso = rand.int(8, 140)
    return {
      id: `dv${i + 1}`,
      codigo: String(i + 1).padStart(4, '0'),
      cliente: clientes[i % clientes.length],
      sucursal: rand.pick(SUCURSALES),
      fecha: FECHA_PLAN,
      items: rand.int(1, 9),
      peso,
      // Envase retornable VACÍO: liviano y voluminoso, a diferencia de los pedidos. No es un descuido
      // que sea la densidad más baja del dataset — ver `DENSIDAD_ENVASE_VACIO`.
      volumen: Number(
        (peso / rand.int(DENSIDAD_ENVASE_VACIO[0], DENSIDAD_ENVASE_VACIO[1])).toFixed(2),
      ),
      motivo: rand.pick(MOTIVOS_DEVOLUCION),
      // Casi la mitad sin asignar: el mockup tiene que mostrar el estado "todavía sin camión".
      camionId: rand.chance(0.55) ? rand.pick(enRuteo).id : null,
    } satisfies Devolucion
  })
})()

// ── Fases del flujo ──────────────────────────────────────────────────────────────────────────

export const FASES: StepItem[] = [
  { id: 'camiones', label: 'Camiones y pedidos', description: 'Flota y pedidos elegibles', icon: Truck },
  // Step 2 "Traslados y devoluciones" retirado del wizard: los traslados ahora viven como sub-paso
  // dentro del Step 1 (TrucksAndOrdersView). Se deja comentado, no borrado, para poder revertir.
  // { id: 'transferencias', label: 'Traslados', description: 'Y devoluciones', icon: ArrowLeftRight },
  { id: 'planificacion', label: 'Planificación', description: 'Paradas y rutas', icon: Route },
  { id: 'rutas', label: 'Rutas', description: 'Generar rutas', icon: Route },
]
