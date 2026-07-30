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
  ClipboardCheck,
  Map as MapIcon,
  Route,
  ShoppingBag,
  ShoppingCart,
  Store,
  Truck,
  type LucideIcon,
} from 'lucide-react'
import type { StepItem } from '@/components/ui/steps'
import { ordenarPorCercania } from './map/geo/hilbert'
import { createRand, uniqueNames } from './mock-random'
import {
  ANCLAS_ZONA,
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
  SUCURSALES_CADENA,
  VIAS,
} from './mock-pools'

/** Semilla del dataset. Cambiarla regenera TODO (mismos volúmenes, otros datos). */
const SEMILLA = 20260728

/**
 * Cuántas filas tiene cada listado. `pedidosPorCanal` es el que más se nota: es lo que se ve al
 * abrir el detalle de un canal, y con 3-4 el diálogo parecía vacío.
 */
const VOLUMEN = {
  camiones: 36,
  pedidosPorCanal: 36,
  planes: 36,
  corridas: 30,
  ordenesTransporte: 36,
  transferencias: 36,
  devoluciones: 36,
  choferes: 40,
  auxiliares: 40,
  vendedores: 30,
  planificadores: 20,
  distribuidoras: 10,
  /** Camiones que participan del ruteo (define cuántas RUTAS y órdenes de despacho hay). */
  camionesEnRuta: 30,
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
export type PaymentType = 'Contado' | 'Crédito' | 'Transferencia'

/** Distribuidoras (distributorId): scope OBLIGATORIO del listado — de qué distribuidora son los pedidos. */
export const DISTRIBUIDORAS = NOMBRES_DISTRIBUIDORA.slice(0, VOLUMEN.distribuidoras).map(
  (nombre, i) => ({ id: 501 + i, nombre: `Distribuidora ${nombre}` }),
)

export const PRODUCT_TYPES: ProductType[] = ['Frío', 'Seco']
export const PAYMENT_TYPES: PaymentType[] = ['Contado', 'Crédito', 'Transferencia']
/** Sociedades/empresas (company) — códigos de sociedad SAP. */
export const EMPRESAS = [...CODIGOS_EMPRESA]

// ── Mercado / Zona / Vendedor ────────────────────────────────────────────────────────────────
// Dimensiones de planificación además del canal. Son filtros que NARROW: si no hay ninguno
// seleccionado, no filtran (pasan todos). Ciudad es el filtro SUPERIOR (el más amplio).
export type CiudadId = 'santacruz' | 'montero' | 'warnes' | 'laguardia' | 'cotoca'
export type MercadoId = 'capital' | 'provincias' | 'ruta'
export type ZonaId = 'norte' | 'sur' | 'centro' | 'este'

export const CIUDAD_META: Record<CiudadId, { label: string }> = {
  santacruz: { label: 'Santa Cruz de la Sierra' },
  montero: { label: 'Montero' },
  warnes: { label: 'Warnes' },
  laguardia: { label: 'La Guardia' },
  cotoca: { label: 'Cotoca' },
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

export interface Camion {
  id: string
  placa: string
  /** truck_type / is_refrigerated del contrato SAP — refrigeración: Frío o Seco. */
  tipo: 'Frío' | 'Seco'
  /** vehicle_class del contrato SAP — carrocería: Furgón o Camión. */
  clase: 'Furgón' | 'Camión'
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
  /** Color con el que se pinta este camión (y sus paradas) en el mapa. */
  color: string
}

/**
 * Color por camión: se reparte el círculo de matices SALTEANDO la franja azul (205°–255°). El azul
 * es el color de MARCA (selección), y un camión azul haría indistinguible "seleccionado" de "es de
 * ese camión". Generado y no escrito a mano porque a 30+ camiones garantizar matices bien distintos
 * a ojo es imposible.
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

function colorDeCamion(indice: number, total: number): string {
  const anchoBanda = BANDA_AZUL.hasta - BANDA_AZUL.desde
  let matiz = (indice * (360 - anchoBanda)) / Math.max(total, 1)
  if (matiz >= BANDA_AZUL.desde) matiz += anchoBanda
  return hslAHex(matiz, 62, 42)
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

    const capacidadPeso = rand.int(9, 30)
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
      clase: rand.chance(0.3) ? 'Furgón' : 'Camión',
      capacidadPeso,
      capacidadVolumen,
      asignadoPeso: Number((capacidadPeso * ocupacion).toFixed(1)),
      asignadoVolumen: Number((capacidadVolumen * ocupacion).toFixed(1)),
      estado,
      turnoInicio: turno?.inicio ?? '—',
      turnoFin: turno?.fin ?? '—',
      enRuteo,
      almacen: rand.pick(ALMACENES),
      color: enRuteo ? colorDeCamion(i, VOLUMEN.camionesEnRuta) : COLOR_CAMION_INACTIVO,
    } satisfies Camion
  })
})()

// ── Pedidos ──────────────────────────────────────────────────────────────────────────────────

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
  mercado: MercadoId
  zona: ZonaId
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

export const PEDIDOS: Pedido[] = (() => {
  const clientesUsados = new Set<string>()
  const vendedor = rand.cycler(VENDEDORES_POOL)
  const out: Pedido[] = []
  // Localidades "cercanas" a la capital: una tienda de barrio en Cotoca es plausible, en Buena Vista
  // (a 100 km) no. Dan algo de dispersión al filtro de Ciudad sin volver falso el dataset.
  const cercanas = LOCALIDADES.slice(0, 4)

  let siguienteId = 1
  let siguientePunto = 1

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
    const puntosDelCanal: {
      id: string
      nombre: string
      lat: number
      lng: number
      cliente: string
    }[] = []

    for (let i = 0; i < cantidad; i++) {
      const clientePropio = deProvincia ? deProvincia[i].cliente : nombres![i]

      // Ciudad y coordenada se eligen JUNTAS, para que el pin y el filtro no se contradigan.
      let ciudad: CiudadId
      let ancla: { lat: number; lng: number }
      let lugar: string
      if (deProvincia) {
        const localidad = deProvincia[i].localidad
        ciudad = localidad.ciudad as CiudadId
        ancla = { lat: localidad.lat, lng: localidad.lng }
        lugar = localidad.nombre
      } else if (rand.chance(0.2)) {
        const localidad = rand.pick(cercanas)
        ciudad = localidad.ciudad as CiudadId
        ancla = { lat: localidad.lat, lng: localidad.lng }
        lugar = localidad.nombre
      } else {
        ciudad = 'santacruz'
        ancla = ANCLAS_ZONA[rand.pick(ZONA_IDS)]
        lugar = rand.pick(LUGARES_SCZ)
      }

      const zona = ZONA_POR_CIUDAD[ciudad] ?? rand.pick(ZONA_IDS)
      const jitter = ciudad === 'santacruz' ? 0.022 : 0.011
      const lat = Number((ancla.lat + rand.float(-jitter, jitter, 4)).toFixed(4))
      const lng = Number((ancla.lng + rand.float(-jitter, jitter, 4)).toFixed(4))

      // ~22% de los pedidos reusan un punto de entrega ya existente del canal → paradas unificadas.
      const compartir = puntosDelCanal.length > 0 && rand.chance(0.22)
      const punto = compartir
        ? rand.pick(puntosDelCanal)
        : {
            id: `DP-${String(siguientePunto++).padStart(4, '0')}`,
            nombre: `${lugar}, ${rand.pick(VIAS)} ${rand.int(2, 48)}`,
            lat,
            lng,
            cliente: clientePropio,
          }
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
        // Densidad ~250-340 kg/m³ (el seco ocupa más por kilo que el frío).
        volumen: Number((peso / rand.int(productType === 'Frío' ? 300 : 250, 340)).toFixed(2)),
        priority: rand.pick([1, 2, 3] as const),
        listo: rand.chance(0.9),
        lat: punto.lat,
        lng: punto.lng,
        ciudad,
        mercado: MERCADO_POR_CIUDAD[ciudad],
        zona,
      })
      siguienteId++
    }
  }

  return out
})()

// Los pedidos ya guardan ciudad/mercado/zona; estos accesores quedan por compatibilidad con los
// consumidores (filtros del panel y narrowing del store), que los llaman como función.
export const ciudadDe = (p: Pedido): CiudadId => p.ciudad
export const mercadoDe = (p: Pedido): MercadoId => p.mercado
export const zonaDe = (p: Pedido): ZonaId => p.zona

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
  /** Los candidate_order que colapsaron en esta parada. */
  pedidos: Pedido[]
  pesoTotal: number
  volumenTotal: number
  ventana: string
  /** planned_sequence dentro de la ruta del camión. */
  secuencia: number
  /** Camión que le asignó la optimización (null = todavía sin asignar). */
  camionId: string | null
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
  const porCamion = Math.ceil(porCercania.length / Math.max(enRuteo.length, 1))

  porCercania.forEach((parada, i) => {
    // ~12% queda sin asignar a propósito: es el estado "todavía sin camión" que el mockup retrata.
    if (rand.chance(0.12)) return
    parada.camionId = enRuteo[Math.min(Math.floor(i / porCamion), enRuteo.length - 1)].id
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
    const cantidadOrdenes = Math.min(elegidas.length, rand.int(2, 3))
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

/** Paradas (dispatch_delivery_points) reales que cubre una orden de transporte. */
export const paradasDeOrden = (o: OrdenTransporte): Parada[] =>
  PARADAS.filter((p) => o.paradaIds.includes(p.id))

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

// ── dispatch_plan ────────────────────────────────────────────────────────────────────────────

// El listado se arma SOLO con columnas propias de `dispatch_plans` más el catálogo `plan_status`
// (estado) y el maestro `distributors` (distribuidora) — dos lookups. Los conteos NO son agregados:
// `dispatch_plans` ya los guarda desnormalizados (planned_order_count / planned_truck_count), así que
// el listado no tiene que sumar sobre planning_truck ni dispatch_delivery_points.
export type EstadoPlan = 'borrador' | 'optimizado' | 'aprobado'

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
 * Planes de más nuevo a más viejo. Los de hoy pueden estar en borrador u optimizado; los pasados ya
 * están aprobados — un plan viejo en borrador sería inconsistente (nunca se ejecutó).
 */
export const PLANES: Plan[] = (() => {
  const planificador = rand.cycler(PLANIFICADORES)
  return Array.from({ length: VOLUMEN.planes }, (_, i) => {
    // Dos planes por día hacia atrás.
    const dias = -Math.floor(i / 2)
    const estado: EstadoPlan =
      dias === 0 ? (rand.chance(0.5) ? 'borrador' : 'optimizado') : 'aprobado'
    return {
      id: 148 - i,
      fecha: fechaOffset(dias),
      estado,
      distribuidora: rand.pick(DISTRIBUIDORAS).nombre,
      pedidos: rand.int(9, 48),
      camiones: rand.int(2, 12),
      creadoPor: planificador(),
    } satisfies Plan
  })
})()

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
      volumen: Number((peso / rand.int(230, 300)).toFixed(2)),
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
      volumen: Number((peso / rand.int(180, 260)).toFixed(2)),
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
  { id: 'ordenes', label: 'Órdenes', description: 'Emitir despacho', icon: ClipboardCheck },
]
