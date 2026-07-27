// Datos falsos del mockup de despacho. Los nombres y las columnas siguen al esquema real
// (DB_LOGISTICS): planning_truck, candidate_order, dispatch_plan_order, routes, dispatch_order y
// dispatch_plan. Viven acá —y no dentro de las vistas— para que todos los tableros compartan el
// mismo dataset y los conteos cuadren entre tabla, mapa y tarjetas.
import {
  ArrowLeftRight,
  Building,
  Building2,
  CalendarClock,
  ClipboardCheck,
  Map as MapIcon,
  Route,
  ShoppingBag,
  ShoppingCart,
  Store,
  Truck,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'
import type { StepItem } from '@/components/ui/steps'

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
  // planificación cuando su fecha cae en el corte (timeOff tardío). Ícono lucide de placeholder
  // hasta cablear el logo real (setear `logo` acá).
  // evenado: { label: 'eVenado', icon: CalendarClock, color: '#ca8a04', hint: 'Pedidos con fecha fija', timeOff: '23:59' },
  }

export const CANALES = (Object.keys(CANAL_META) as CanalId[]).map((value) => ({
  value,
  label: CANAL_META[value].label,
}))

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

// channelId estático por canal; el resto del resumen (countOrders/countCustomers/total/totalWeight)
// se DERIVA de PEDIDOS más abajo, así las tarjetas SIEMPRE cuadran con la tabla y no se pueden
// desincronizar ni quedar como copia-pega entre canales.
const CHANNEL_IDS: Record<CanalId, number> = {
  horizontal: 78945,
  tradicional: 78946,
  mayorista: 78947,
  supermercado: 78948,
  provincia: 78950,
  ecommerce: 78951,
  // evenado: 78949,
}

export const ALMACENES = ['Planta Santa Cruz', 'CD Warnes', 'CD Montero']

/** Almacén de salida del plan — en el mapa es de donde arrancan todas las rutas. */
export const DEPOSITO = { nombre: 'Planta Santa Cruz', lat: -17.7712, lng: -63.1421 }

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

export const CAMIONES: Camion[] = [
  { id: 't1', placa: '3421-ABC', tipo: 'Seco', clase: 'Camión',  capacidadPeso: 28, capacidadVolumen: 62, asignadoPeso: 21.4, asignadoVolumen: 48, estado: 'disponible',    turnoInicio: '06:00', turnoFin: '16:00', enRuteo: true,  almacen: 'Planta Santa Cruz', color: '#e11d48' },
  { id: 't2', placa: '2870-XKD', tipo: 'Seco', clase: 'Camión',  capacidadPeso: 30, capacidadVolumen: 68, asignadoPeso: 27.9, asignadoVolumen: 64, estado: 'provincia',    turnoInicio: '06:00', turnoFin: '16:00', enRuteo: true,  almacen: 'Planta Santa Cruz', color: '#c026d3' },
  { id: 't3', placa: '5530-QWE', tipo: 'Frío', clase: 'Furgón',  capacidadPeso: 22, capacidadVolumen: 55, asignadoPeso: 8.2,  asignadoVolumen: 24, estado: 'disponible',    turnoInicio: '07:00', turnoFin: '17:00', enRuteo: true,  almacen: 'CD Warnes',         color: '#b45309' },
  { id: 't4', placa: '7712-MNB', tipo: 'Frío', clase: 'Furgón',  capacidadPeso: 24, capacidadVolumen: 58, asignadoPeso: 0,    asignadoVolumen: 0,  estado: 'sinchofer',    turnoInicio: '07:00', turnoFin: '17:00', enRuteo: false, almacen: 'Planta Santa Cruz', color: '#0891b2' },
  { id: 't5', placa: '4467-TYU', tipo: 'Frío', clase: 'Camión',  capacidadPeso: 12, capacidadVolumen: 28, asignadoPeso: 9.6,  asignadoVolumen: 22, estado: 'sinchofer',    turnoInicio: '08:00', turnoFin: '15:00', enRuteo: true,  almacen: 'CD Montero',        color: '#4d7c0f' },
  { id: 't6', placa: '6628-VBN', tipo: 'Seco', clase: 'Camión',  capacidadPeso: 14, capacidadVolumen: 30, asignadoPeso: 0,    asignadoVolumen: 0,  estado: 'sinchofer',    turnoInicio: '08:00', turnoFin: '15:00', enRuteo: true,  almacen: 'Planta Santa Cruz', color: '#db2777' },
  { id: 't7', placa: '2245-GHJ', tipo: 'Seco', clase: 'Camión',  capacidadPeso: 9,  capacidadVolumen: 20, asignadoPeso: 0,    asignadoVolumen: 0,  estado: 'provincia',    turnoInicio: '08:00', turnoFin: '15:00', enRuteo: false, almacen: 'CD Warnes',         color: '#7e22ce' },
  { id: 't8', placa: '3308-ZXC', tipo: 'Seco', clase: 'Camión',  capacidadPeso: 20, capacidadVolumen: 44, asignadoPeso: 0,    asignadoVolumen: 0,  estado: 'provincia',    turnoInicio: '06:00', turnoFin: '16:00', enRuteo: true,  almacen: 'CD Warnes',         color: '#0f766e' },
  { id: 't9', placa: '5174-JKL', tipo: 'Frío', clase: 'Furgón',  capacidadPeso: 11, capacidadVolumen: 26, asignadoPeso: 0,    asignadoVolumen: 0,  estado: 'disponible',    turnoInicio: '08:00', turnoFin: '15:00', enRuteo: true,  almacen: 'CD Montero',        color: '#a16207' },
  { id: 't10', placa: '1194-LRT', tipo: 'Seco', clase: 'Camión', capacidadPeso: 26, capacidadVolumen: 60, asignadoPeso: 0,    asignadoVolumen: 0,  estado: 'provincia', turnoInicio: '—',     turnoFin: '—',     enRuteo: false, almacen: 'CD Warnes',         color: '#64748b' },
  { id: 't11', placa: '9083-PLM', tipo: 'Seco', clase: 'Camión', capacidadPeso: 27, capacidadVolumen: 61, asignadoPeso: 0,    asignadoVolumen: 0,  estado: 'mantenimiento', turnoInicio: '—',     turnoFin: '—',     enRuteo: false, almacen: 'CD Montero',        color: '#64748b' },
  { id: 't12', placa: '8891-RFV', tipo: 'Frío', clase: 'Camión', capacidadPeso: 16, capacidadVolumen: 34, asignadoPeso: 0,    asignadoVolumen: 0,  estado: 'mantenimiento', turnoInicio: '—',     turnoFin: '—',     enRuteo: false, almacen: 'Planta Santa Cruz', color: '#64748b' },
]

// ── candidate_order ──────────────────────────────────────────────────────────────────────────

// Dimensiones de filtrado del listado de pedidos (contrato del backend `filterOrders`).
export type ProductType = 'Frío' | 'Seco'
export type PaymentType = 'Contado' | 'Crédito' | 'Transferencia'

/** Distribuidoras (distributorId): scope OBLIGATORIO del listado — de qué distribuidora son los pedidos. */
export const DISTRIBUIDORAS = [
  { id: 501, nombre: 'Distribuidora Santa Cruz' },
  { id: 502, nombre: 'Distribuidora Warnes' },
  { id: 503, nombre: 'Distribuidora Montero' },
]

export const PRODUCT_TYPES: ProductType[] = ['Frío', 'Seco']
export const PAYMENT_TYPES: PaymentType[] = ['Contado', 'Crédito', 'Transferencia']
/** Sociedades/empresas (company) — códigos de sociedad SAP. */
export const EMPRESAS = ['GV05', 'GV02']

// ── Mercado / Zona / Vendedor ────────────────────────────────────────────────────────────────
// Dimensiones de planificación además del canal. En el modelo real serían tablas propias (market,
// zone, salesperson); en el mockup Mercado y Zona se DERIVAN por pedido (ver mercadoDe/zonaDe más
// abajo) para no duplicar el dato en cada fila, y Vendedor sale del propio pedido. Son filtros que
// NARROW: si no hay ninguno seleccionado, no filtran (pasan todos).
// Ciudad es el filtro SUPERIOR (el más amplio): acota primero, antes que canal/mercado/zona.
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
}

/**
 * Fecha de la planificación (YYYY-MM-DD): SIEMPRE mañana (hoy + 1 día). La planificación es para un
 * día específico, así que todas las tablas comparten esta fecha. Se calcula con Date para que el
 * mockup no haya que editarlo manualmente cada vez que se actualiza. Usa componentes locales (no
 * toISOString) para no correrse un día por zona horaria.
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

export const PEDIDOS: Pedido[] = [
  { id: 'p1',  salesOrder: '10241', cliente: 'Tienda Doña Rosa',      canal: 'horizontal',  company: 'GV05', paymentType: 'Contado',       productType: 'Seco', fechaEntrega: FECHA_PLAN, total: 1240.50, vendedor: 'M. Suárez', puntoEntregaId: 'DP-011', puntoEntrega: 'Plan 3000, calle 6',        ventana: '08:00–12:00', peso: 420,  volumen: 1.8, priority: 2, listo: true,  lat: -17.8072, lng: -63.1173 },
  { id: 'p2',  salesOrder: '10242', cliente: 'Almacén El Trigal',     canal: 'horizontal',  company: 'GV05', paymentType: 'Crédito',       productType: 'Seco', fechaEntrega: FECHA_PLAN, total: 1890.00, vendedor: 'M. Suárez', puntoEntregaId: 'DP-014', puntoEntrega: 'Villa 1ro de Mayo, av. 9',  ventana: '08:00–12:00', peso: 610,  volumen: 2.4, priority: 1, listo: true,  lat: -17.8206, lng: -63.1541 },
  { id: 'p3',  salesOrder: '10256', cliente: 'Panadería Sur',         canal: 'tradicional', company: 'GV02', paymentType: 'Contado',       productType: 'Frío', fechaEntrega: FECHA_PLAN, total: 520.75,  vendedor: 'J. Rojas',  puntoEntregaId: 'DP-058', puntoEntrega: 'Villa 1ro de Mayo, calle 12', ventana: '08:00–12:00', peso: 180,  volumen: 0.7, priority: 2, listo: true,  lat: -17.8251, lng: -63.1487 },
  // { id: 'p4',  salesOrder: '10243', cliente: 'Kiosco San Martín',     canal: 'evenado',     company: 'GV05', paymentType: 'Transferencia', productType: 'Seco', fechaEntrega: FECHA_PLAN, total: 430.00,  vendedor: 'L. Áñez',   puntoEntregaId: 'DP-017', puntoEntrega: 'Equipetrol, calle 3',       ventana: '15:00–18:00', peso: 140,  volumen: 0.6, priority: 3, listo: true,  lat: -17.7638, lng: -63.1968 },
  // { id: 'p5',  salesOrder: '10244', cliente: 'Minimarket La Rotonda', canal: 'evenado',     company: 'GV05', paymentType: 'Contado',       productType: 'Frío', fechaEntrega: FECHA_PLAN, total: 980.20,  vendedor: 'M. Suárez', puntoEntregaId: 'DP-019', puntoEntrega: 'Zona Norte, rotonda',       ventana: '08:00–12:00', peso: 300,  volumen: 1.3, priority: 2, listo: true,  lat: -17.7402, lng: -63.1725 },
  { id: 'p6',  salesOrder: '10245', cliente: 'Tienda El Carmen',      canal: 'horizontal',  company: 'GV02', paymentType: 'Crédito',       productType: 'Seco', fechaEntrega: FECHA_PLAN, total: 610.00,  vendedor: 'J. Rojas',  puntoEntregaId: 'DP-023', puntoEntrega: 'Zona Sur, av. Grigotá',     ventana: '13:00–17:00', peso: 210,  volumen: 0.9, priority: 3, listo: false, lat: -17.8351, lng: -63.1846 },
  { id: 'p7',  salesOrder: '10254', cliente: 'Abarrotes Vallejos',    canal: 'horizontal',  company: 'GV05', paymentType: 'Contado',       productType: 'Seco', fechaEntrega: FECHA_PLAN, total: 1520.90, vendedor: 'L. Áñez',   puntoEntregaId: 'DP-027', puntoEntrega: 'Pampa de la Isla',          ventana: '08:00–12:00', peso: 520,  volumen: 2.1, priority: 2, listo: true,  lat: -17.7975, lng: -63.1345 },
  { id: 'p8',  salesOrder: '10246', cliente: 'Distribuidora Guapay',  canal: 'mayorista',   company: 'GV02', paymentType: 'Crédito',       productType: 'Seco', fechaEntrega: FECHA_PLAN, total: 8400.00, vendedor: 'C. Mamani', puntoEntregaId: 'DP-002', puntoEntrega: 'Parque Industrial',         ventana: '06:00–10:00', peso: 4200, volumen: 12.5, priority: 1, listo: true,  lat: -17.7891, lng: -63.1032 },
  { id: 'p9',  salesOrder: '10247', cliente: 'Mayorista Los Pozos',   canal: 'mayorista',   company: 'GV02', paymentType: 'Contado',       productType: 'Frío', fechaEntrega: FECHA_PLAN, total: 6750.50, vendedor: 'C. Mamani', puntoEntregaId: 'DP-004', puntoEntrega: 'Mercado Los Pozos',         ventana: '06:00–10:00', peso: 3400, volumen: 9.8,  priority: 1, listo: true,  lat: -17.7815, lng: -63.1795 },
  { id: 'p10', salesOrder: '10248', cliente: 'Hipermaxi Norte',       canal: 'supermercado', company: 'GV05', paymentType: 'Transferencia', productType: 'Seco', fechaEntrega: FECHA_PLAN, total: 4200.00, vendedor: 'J. Rojas',  puntoEntregaId: 'DP-021', puntoEntrega: 'Av. Banzer 5to anillo',     ventana: '07:00–11:00', peso: 2100, volumen: 6.4,  priority: 1, listo: true,  lat: -17.7460, lng: -63.1889 },
  { id: 'p11', salesOrder: '10257', cliente: 'Farmacia Centro',       canal: 'supermercado', company: 'GV05', paymentType: 'Contado',       productType: 'Frío', fechaEntrega: FECHA_PLAN, total: 1830.00, vendedor: 'M. Suárez', puntoEntregaId: 'DP-059', puntoEntrega: 'Centro, av. Cañoto 2do anillo', ventana: '07:00–11:00', peso: 900,  volumen: 2.8,  priority: 2, listo: true,  lat: -17.7835, lng: -63.1795 },
  { id: 'p12', salesOrder: '10249', cliente: 'Fidalga Equipetrol',    canal: 'supermercado', company: 'GV02', paymentType: 'Crédito',       productType: 'Seco', fechaEntrega: FECHA_PLAN, total: 3120.40, vendedor: 'L. Áñez',   puntoEntregaId: 'DP-025', puntoEntrega: 'Equipetrol Norte',          ventana: '07:00–11:00', peso: 1600, volumen: 5.1,  priority: 1, listo: true,  lat: -17.7684, lng: -63.2062 },
  { id: 'p13', salesOrder: '10250', cliente: 'IC Norte Cristo Rey',   canal: 'supermercado', company: 'GV05', paymentType: 'Contado',       productType: 'Seco', fechaEntrega: FECHA_PLAN, total: 2750.00, vendedor: 'J. Rojas',  puntoEntregaId: 'DP-028', puntoEntrega: 'Cristo Rey, 3er anillo',    ventana: '07:00–11:00', peso: 1400, volumen: 4.5,  priority: 2, listo: true,  lat: -17.7719, lng: -63.1633 },
  { id: 'p14', salesOrder: '10251', cliente: 'Hotel Los Tajibos',     canal: 'tradicional', company: 'GV02', paymentType: 'Transferencia', productType: 'Frío', fechaEntrega: FECHA_PLAN, total: 1360.75, vendedor: 'C. Mamani', puntoEntregaId: 'DP-031', puntoEntrega: 'Av. San Martín 455',        ventana: '15:00–18:00', peso: 680,  volumen: 2.6,  priority: 2, listo: true,  lat: -17.7601, lng: -63.2005 },
  { id: 'p15', salesOrder: '10252', cliente: 'Restaurante Jardín',    canal: 'horizontal',  company: 'GV05', paymentType: 'Contado',       productType: 'Frío', fechaEntrega: FECHA_PLAN, total: 640.00,  vendedor: 'M. Suárez', puntoEntregaId: 'DP-034', puntoEntrega: 'Centro, calle Sucre',       ventana: '16:00–19:00', peso: 320,  volumen: 1.2,  priority: 3, listo: true,  lat: -17.7842, lng: -63.1820 },
  { id: 'p16', salesOrder: '10253', cliente: 'Café Lorca',            canal: 'tradicional', company: 'GV02', paymentType: 'Crédito',       productType: 'Seco', fechaEntrega: FECHA_PLAN, total: 360.50,  vendedor: 'L. Áñez',   puntoEntregaId: 'DP-036', puntoEntrega: 'Centro, calle René Moreno', ventana: '17:00–20:00', peso: 180,  volumen: 0.7,  priority: 3, listo: true,  lat: -17.7833, lng: -63.1750 },
  // Tradicional (distribuidores medianos)
  { id: 'p17', salesOrder: '10261', cliente: 'Comercial El Bosque',    canal: 'tradicional', company: 'GV02', paymentType: 'Crédito',       productType: 'Seco', fechaEntrega: FECHA_PLAN, total: 2150.00, vendedor: 'C. Mamani', puntoEntregaId: 'DP-050', puntoEntrega: 'Av. Cañoto, 2do anillo',    ventana: '09:00–13:00', peso: 940,  volumen: 3.4,  priority: 2, listo: true,  lat: -17.7550, lng: -63.1420 },
  { id: 'p18', salesOrder: '10262', cliente: 'Distribuidora San Jorge', canal: 'tradicional', company: 'GV05', paymentType: 'Contado',      productType: 'Seco', fechaEntrega: FECHA_PLAN, total: 1780.00, vendedor: 'L. Áñez',   puntoEntregaId: 'DP-051', puntoEntrega: 'Av. Virgen de Cotoca',      ventana: '08:00–12:00', peso: 720,  volumen: 2.7,  priority: 2, listo: true,  lat: -17.8010, lng: -63.1690 },
  { id: 'p19', salesOrder: '10263', cliente: 'Comercial La Pascana',   canal: 'tradicional', company: 'GV02', paymentType: 'Transferencia', productType: 'Frío', fechaEntrega: FECHA_PLAN, total: 2680.30, vendedor: 'C. Mamani', puntoEntregaId: 'DP-052', puntoEntrega: 'Doble Vía La Guardia',      ventana: '09:00–13:00', peso: 1150, volumen: 4.1,  priority: 1, listo: true,  lat: -17.7930, lng: -63.1980 },
  // Mayorista (grandes volúmenes)
  { id: 'p20', salesOrder: '10264', cliente: 'Mayorista Central Abasto', canal: 'mayorista', company: 'GV02', paymentType: 'Crédito',      productType: 'Seco', fechaEntrega: FECHA_PLAN, total: 9200.00, vendedor: 'C. Mamani', puntoEntregaId: 'DP-053', puntoEntrega: 'Mercado Abasto',            ventana: '06:00–10:00', peso: 5200, volumen: 15.0, priority: 1, listo: true,  lat: -17.7960, lng: -63.1100 },
  { id: 'p21', salesOrder: '10265', cliente: 'Depósito La Ramada',     canal: 'mayorista',   company: 'GV02', paymentType: 'Contado',       productType: 'Seco', fechaEntrega: FECHA_PLAN, total: 7350.50, vendedor: 'C. Mamani', puntoEntregaId: 'DP-054', puntoEntrega: 'Mercado La Ramada',         ventana: '06:00–10:00', peso: 4100, volumen: 12.2, priority: 1, listo: true,  lat: -17.7880, lng: -63.1210 },
  { id: 'p22', salesOrder: '10266', cliente: 'Comercial 7 Calles',     canal: 'mayorista',   company: 'GV05', paymentType: 'Crédito',       productType: 'Frío', fechaEntrega: FECHA_PLAN, total: 5600.00, vendedor: 'J. Rojas',  puntoEntregaId: 'DP-055', puntoEntrega: 'Zona 7 Calles',             ventana: '06:00–10:00', peso: 3300, volumen: 9.5,  priority: 2, listo: true,  lat: -17.7830, lng: -63.1720 },
  { id: 'p23', salesOrder: '10267', cliente: 'Mayorista Santa Rosa',   canal: 'mayorista',   company: 'GV02', paymentType: 'Contado',       productType: 'Seco', fechaEntrega: FECHA_PLAN, total: 6100.75, vendedor: 'C. Mamani', puntoEntregaId: 'DP-056', puntoEntrega: 'Av. Grigotá 4to anillo',    ventana: '06:00–10:00', peso: 3800, volumen: 11.0, priority: 1, listo: true,  lat: -17.7700, lng: -63.1050 },
  // Supermercado (cadenas)
  // { id: 'p24', salesOrder: '10268', cliente: 'Fidalga Las Brisas',     canal: 'evenado',      company: 'GV05', paymentType: 'Transferencia', productType: 'Frío', fechaEntrega: FECHA_PLAN, total: 3450.00, vendedor: 'J. Rojas',  puntoEntregaId: 'DP-057', puntoEntrega: 'Av. Beni 4to anillo',       ventana: '07:00–11:00', peso: 1700, volumen: 5.4,  priority: 1, listo: true,  lat: -17.7580, lng: -63.1830 },
  { id: 'p25', salesOrder: '10269', cliente: 'Ketal Sur',             canal: 'supermercado', company: 'GV05', paymentType: 'Contado',       productType: 'Seco', fechaEntrega: FECHA_PLAN, total: 3980.00, vendedor: 'D. Céspedes', puntoEntregaId: 'DP-060', puntoEntrega: 'Av. Santos Dumont 4to anillo', ventana: '07:00–11:00', peso: 1980, volumen: 6.0,  priority: 1, listo: true,  lat: -17.8090, lng: -63.1720 },
  { id: 'p26', salesOrder: '10270', cliente: 'Slan Center Norte',      canal: 'supermercado', company: 'GV02', paymentType: 'Crédito',       productType: 'Frío', fechaEntrega: FECHA_PLAN, total: 2640.50, vendedor: 'J. Rojas',    puntoEntregaId: 'DP-061', puntoEntrega: 'Av. Banzer 6to anillo',      ventana: '07:00–11:00', peso: 1320, volumen: 4.2,  priority: 2, listo: true,  lat: -17.7380, lng: -63.1770 },
  // Provincia (entregas fuera de la capital)
  { id: 'p27', salesOrder: '10271', cliente: 'Distribuidora Montero',   canal: 'provincia',    company: 'GV02', paymentType: 'Crédito',       productType: 'Seco', fechaEntrega: FECHA_PLAN, total: 5240.00, vendedor: 'R. Vaca',     puntoEntregaId: 'DP-062', puntoEntrega: 'Montero, av. Circunvalación', ventana: '05:00–09:00', peso: 2900, volumen: 8.6,  priority: 1, listo: true,  lat: -17.3390, lng: -63.2530 },
  { id: 'p28', salesOrder: '10272', cliente: 'Comercial Warnes',        canal: 'provincia',    company: 'GV05', paymentType: 'Contado',       productType: 'Seco', fechaEntrega: FECHA_PLAN, total: 3120.75, vendedor: 'R. Vaca',     puntoEntregaId: 'DP-063', puntoEntrega: 'Warnes, plaza principal',    ventana: '05:00–09:00', peso: 1740, volumen: 5.5,  priority: 2, listo: true,  lat: -17.5100, lng: -63.1680 },
  { id: 'p29', salesOrder: '10273', cliente: 'Mercado La Guardia',      canal: 'provincia',    company: 'GV02', paymentType: 'Transferencia', productType: 'Frío', fechaEntrega: FECHA_PLAN, total: 4470.00, vendedor: 'P. Justiniano', puntoEntregaId: 'DP-064', puntoEntrega: 'La Guardia, doble vía',    ventana: '05:00–09:00', peso: 2510, volumen: 7.4,  priority: 1, listo: true,  lat: -17.8930, lng: -63.3200 },
  { id: 'p30', salesOrder: '10274', cliente: 'Abarrotes Cotoca',        canal: 'provincia',    company: 'GV05', paymentType: 'Crédito',       productType: 'Seco', fechaEntrega: FECHA_PLAN, total: 2280.40, vendedor: 'P. Justiniano', puntoEntregaId: 'DP-065', puntoEntrega: 'Cotoca, calle Comercio',   ventana: '06:00–10:00', peso: 1180, volumen: 3.9,  priority: 2, listo: true,  lat: -17.7460, lng: -63.0570 },
  // Ecommerce (ventas online)
  { id: 'p31', salesOrder: '10275', cliente: 'Pedido web #4471',        canal: 'ecommerce',    company: 'GV05', paymentType: 'Transferencia', productType: 'Seco', fechaEntrega: FECHA_PLAN, total: 540.00,  vendedor: 'D. Céspedes', puntoEntregaId: 'DP-066', puntoEntrega: 'Las Palmas, calle 5',       ventana: '14:00–18:00', peso: 190,  volumen: 0.8,  priority: 3, listo: true,  lat: -17.8005, lng: -63.1490 },
  { id: 'p32', salesOrder: '10276', cliente: 'Pedido web #4472',        canal: 'ecommerce',    company: 'GV05', paymentType: 'Transferencia', productType: 'Frío', fechaEntrega: FECHA_PLAN, total: 780.50,  vendedor: 'D. Céspedes', puntoEntregaId: 'DP-067', puntoEntrega: 'Urbari, av. Piraí',         ventana: '14:00–18:00', peso: 260,  volumen: 1.1,  priority: 2, listo: true,  lat: -17.7920, lng: -63.2010 },
  { id: 'p33', salesOrder: '10277', cliente: 'Pedido web #4473',        canal: 'ecommerce',    company: 'GV02', paymentType: 'Contado',       productType: 'Seco', fechaEntrega: FECHA_PLAN, total: 1120.00, vendedor: 'M. Suárez',   puntoEntregaId: 'DP-068', puntoEntrega: 'Sirari, calle Los Cusis',   ventana: '15:00–19:00', peso: 410,  volumen: 1.6,  priority: 3, listo: false, lat: -17.7660, lng: -63.1930 },
  { id: 'p34', salesOrder: '10278', cliente: 'Pedido web #4474',        canal: 'ecommerce',    company: 'GV02', paymentType: 'Transferencia', productType: 'Seco', fechaEntrega: FECHA_PLAN, total: 960.25,  vendedor: 'L. Áñez',     puntoEntregaId: 'DP-069', puntoEntrega: 'Equipetrol, calle 9 Este',  ventana: '15:00–19:00', peso: 330,  volumen: 1.3,  priority: 3, listo: true,  lat: -17.7700, lng: -63.2020 },
]

// ── Derivación de Mercado / Zona por pedido ──────────────────────────────────────────────────
// El mockup no guarda mercado/zona en cada fila: los deriva de forma DETERMINISTA del número de
// pedido para tener valores estables y bien repartidos entre los filtros. En el modelo real
// vendrían de delivery_point (zona) y de la cartera del vendedor (mercado).
const numDePedido = (p: Pedido) => Number(p.id.replace(/\D/g, '')) || 0
export const ciudadDe = (p: Pedido): CiudadId => CIUDAD_IDS[numDePedido(p) % CIUDAD_IDS.length]
export const mercadoDe = (p: Pedido): MercadoId => MERCADO_IDS[numDePedido(p) % MERCADO_IDS.length]
export const zonaDe = (p: Pedido): ZonaId => ZONA_IDS[numDePedido(p) % ZONA_IDS.length]

/** Vendedores distintos presentes en PEDIDOS (fuente única, así el filtro no se desincroniza). */
export const VENDEDORES = Array.from(new Set(PEDIDOS.map((p) => p.vendedor))).sort()

// Resumen por canal DERIVADO de PEDIDOS: countOrders/countCustomers/total/totalWeight se calculan
// del listado, así la tarjeta y la tabla nunca se desincronizan (channelId y timeOff son metadata).
export const CANAL_RESUMEN: Record<CanalId, CanalResumen> = Object.fromEntries(
  (Object.keys(CANAL_META) as CanalId[]).map((canal) => {
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
 */
function construirParadas(pedidos: Pedido[]): Parada[] {
  const porPunto = new Map<string, Pedido[]>()
  for (const pedido of pedidos) {
    porPunto.set(pedido.puntoEntregaId, [...(porPunto.get(pedido.puntoEntregaId) ?? []), pedido])
  }

  // Asignación de camión que "devolvió" la optimización, y los pines manuales del usuario.
  const camionPorPunto: Record<string, string> = {
    'DP-002': 't2', 'DP-004': 't2', 'DP-021': 't1', 'DP-025': 't1', 'DP-028': 't1', 'DP-059': 't1',
    'DP-011': 't3', 'DP-014': 't3', 'DP-027': 't3', 'DP-058': 't3',
    'DP-017': 't5', 'DP-019': 't5', 'DP-031': 't5', 'DP-034': 't5', 'DP-036': 't5',
  }
  const forzados: Record<string, string> = { 'DP-002': 't2' }

  return [...porPunto.entries()].map(([puntoEntregaId, delPunto], i) => {
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
      camionId: camionPorPunto[puntoEntregaId] ?? null,
      camionForzadoId: forzados[puntoEntregaId] ?? null,
      lat: primero.lat,
      lng: primero.lng,
    }
  })
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

export const CORRIDAS: Corrida[] = [
  { id: 'r3', motor: 'Google Route Optimization', ejecutadaEn: 'Hoy 09:42', estado: 'completada', distanciaKm: 214.6, tiempoMin: 486, costo: 1842, score: 0.94, camiones: 4, paradas: 13, seleccionada: true },
  { id: 'r2', motor: 'Google Route Optimization', ejecutadaEn: 'Hoy 09:18', estado: 'completada', distanciaKm: 238.1, tiempoMin: 512, costo: 1975, score: 0.88, camiones: 4, paradas: 13, seleccionada: false },
  { id: 'r1', motor: 'Google Route Optimization', ejecutadaEn: 'Hoy 08:55', estado: 'completada', distanciaKm: 262.9, tiempoMin: 574, costo: 2160, score: 0.79, camiones: 5, paradas: 13, seleccionada: false },
]

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
  /** Ocupación del camión sobre su capacidad (0–100). */
  cargaPct: number
  /** Tiempo estimado de recorrido de la ruta, en minutos. */
  duracionMin: number
}

// El chofer arranca VACÍO: la corrida genera la orden (una por camión/ruta) y el despachador asigna
// el chofer después, en el detalle de la orden.
export const ORDENES: OrdenDespacho[] = [
  { id: 'do1', codigo: '2041', camionId: 'Truck-SAP1', rutaId: 'r1', conductor: '', almacen: 'Planta Santa Cruz', estado: 'despachada', salida: '06:30', cargaPct: 20393, duracionMin: 210 },
  { id: 'do2', codigo: '2042', camionId: 'Truck-SAP2', rutaId: 'r2', conductor: '', almacen: 'Planta Santa Cruz', estado: 'cargando',   salida: '06:45', cargaPct: 23000, duracionMin: 255 },
  { id: 'do3', codigo: '2043', camionId: 'Truck-SAP3', rutaId: 'r3', conductor: '', almacen: 'CD Warnes',         estado: 'pendiente',  salida: '07:15', cargaPct: 10234, duracionMin: 165 },
  { id: 'do4', codigo: '2044', camionId: 'Truck-SAP4', rutaId: 'r4', conductor: '', almacen: 'CD Montero',        estado: 'pendiente',  salida: '08:00', cargaPct: 23456, duracionMin: 300 },
]

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

// Cada orden apunta a paradas REALES por su id (`stop-<deliveryPointId>`). Se eligen a propósito
// para que 3421-ABC (cap. 28 t) muestre la validación de peso: sus 2 primeras órdenes ENTRAN
// (24.000 kg) y la 3ra la EXCEDE (29.400 kg > 28.000). Los pesos salen del `pesoTotal` real de cada
// parada, así el diálogo, la tabla y el mapa cuadran.
//
// chofer y auxiliar son CONSISTENTES por placa: la tripulación viaja con el camión, no con la orden,
// así que todas las órdenes del mismo camión comparten la misma dupla. 5530-QWE queda sin tripulación
// ('' en ambos) a propósito: es el caso "sin asignar" que ejercita el mockup.
export const ORDENES_TRANSPORTE: OrdenTransporte[] = [
  // Camión 3421-ABC (cap. 28 t) — 3 órdenes; 2 entran, la 3ra excede.
  { id: 'ot1', codigo: '2051', camion: '3421-ABC', chofer: 'M. Céspedes-3021', auxiliar: 'E. Quispe-4101',   estado: 'pendiente',  paradaIds: ['stop-DP-002', 'stop-DP-004', 'stop-DP-053'] }, // 12.800 kg
  { id: 'ot2', codigo: '2052', camion: '3421-ABC', chofer: 'M. Céspedes-3021', auxiliar: 'E. Quispe-4101',   estado: 'pendiente',  paradaIds: ['stop-DP-054', 'stop-DP-055', 'stop-DP-056'] }, // 11.200 kg
  { id: 'ot3', codigo: '2053', camion: '3421-ABC', chofer: 'M. Céspedes-3021', auxiliar: 'E. Quispe-4101',   estado: 'pendiente',  paradaIds: ['stop-DP-021', 'stop-DP-060', 'stop-DP-061'] }, //  5.400 kg
  // Camión 2870-XKD (cap. 30 t) — 2 órdenes.
  { id: 'ot4', codigo: '2054', camion: '2870-XKD', chofer: 'J. Rojas-3022',    auxiliar: 'S. Choque-4102',   estado: 'cargando',   paradaIds: ['stop-DP-011', 'stop-DP-014', 'stop-DP-058', 'stop-DP-023', 'stop-DP-027'] },
  { id: 'ot5', codigo: '2055', camion: '2870-XKD', chofer: 'J. Rojas-3022',    auxiliar: 'S. Choque-4102',   estado: 'pendiente',  paradaIds: ['stop-DP-059', 'stop-DP-025', 'stop-DP-028'] },
  // Camión 5530-QWE (cap. 22 t) — 2 órdenes (sin chofer ni auxiliar asignados).
  { id: 'ot6', codigo: '2056', camion: '5530-QWE', chofer: '',                 auxiliar: '',                 estado: 'pendiente',  paradaIds: ['stop-DP-031', 'stop-DP-034', 'stop-DP-036'] },
  { id: 'ot7', codigo: '2057', camion: '5530-QWE', chofer: '',                 auxiliar: '',                 estado: 'pendiente',  paradaIds: ['stop-DP-050', 'stop-DP-051'] },
  // Camión 4467-TYU (cap. 12 t) — 1 orden sola (no unificable por sí misma).
  { id: 'ot8', codigo: '2058', camion: '4467-TYU', chofer: 'A. Peña-3023',     auxiliar: 'V. Terceros-4103', estado: 'despachada', paradaIds: ['stop-DP-052', 'stop-DP-062', 'stop-DP-063', 'stop-DP-064', 'stop-DP-065', 'stop-DP-066'] },
]

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

// Choferes disponibles para asignar a una orden de despacho (selector del detalle). El nombre va
// concatenado con su código SAP de empleado (Nombre-SAP), así el buscador filtra por ambos.
export const CHOFERES = [
  'M. Céspedes-3021',
  'J. Rojas-3022',
  'A. Peña-3023',
  'R. Justiniano-3024',
  'D. Mamani-3025',
  'L. Áñez-3026',
  'C. Vaca-3027',
  'P. Suárez-3028',
]

// Auxiliares (ayudantes de reparto) disponibles para asignar a una orden. Mismo formato Nombre-SAP
// que CHOFERES —es el mismo maestro de empleados—, con su propio rango de códigos (41xx) para que no
// se confundan al leer un legajo suelto.
export const AUXILIARES = [
  'E. Quispe-4101',
  'S. Choque-4102',
  'V. Terceros-4103',
  'G. Cuéllar-4104',
  'N. Flores-4105',
  'H. Ledezma-4106',
  'F. Sandoval-4107',
  'O. Chávez-4108',
]

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

/** Nombres de planificador de ejemplo (genéricos, no reales). */
export const PLANIFICADORES = ['Pablo Méndez', 'Pedro Salinas', 'José Ortiz', 'Juana Ríos', 'Diego Torres']

export const PLANES: Plan[] = [
  { id: 148, fecha: fechaOffset(0),  estado: 'borrador',   distribuidora: 'Distribuidora Santa Cruz', pedidos: 24, camiones: 5, creadoPor: 'Pablo Méndez' },
  { id: 147, fecha: fechaOffset(0),  estado: 'optimizado', distribuidora: 'Distribuidora Warnes',     pedidos: 22, camiones: 6, creadoPor: 'Pedro Salinas' },
  { id: 146, fecha: fechaOffset(-1), estado: 'aprobado',   distribuidora: 'Distribuidora Santa Cruz', pedidos: 31, camiones: 8, creadoPor: 'José Ortiz' },
  { id: 145, fecha: fechaOffset(-1), estado: 'aprobado',   distribuidora: 'Distribuidora Montero',    pedidos: 12, camiones: 3, creadoPor: 'Juana Ríos' },
  { id: 144, fecha: fechaOffset(-2), estado: 'aprobado',   distribuidora: 'Distribuidora Warnes',     pedidos: 27, camiones: 7, creadoPor: 'Diego Torres' },
  { id: 143, fecha: fechaOffset(-3), estado: 'optimizado', distribuidora: 'Distribuidora Santa Cruz', pedidos: 18, camiones: 4, creadoPor: 'Pablo Méndez' },
  { id: 142, fecha: fechaOffset(-4), estado: 'borrador',   distribuidora: 'Distribuidora Montero',    pedidos: 9,  camiones: 2, creadoPor: 'José Ortiz' },
  { id: 141, fecha: fechaOffset(-6), estado: 'aprobado',   distribuidora: 'Distribuidora Warnes',     pedidos: 33, camiones: 9, creadoPor: 'Pedro Salinas' },
]

// ── Transferencias entre sucursales + Devoluciones (logística inversa) ─────────────────────────
// Se crean en OTRO sistema; acá solo se LISTAN a nivel ORDEN (no ítem), se seleccionan y se suman
// a la planificación. Transferencias = orden entre sucursales; Devoluciones = orden por cliente que
// un camión recoge en el regreso. Alcance preliminar; el detalle de DTOs se define después.

export const SUCURSALES = ['Sucursal Norte', 'Sucursal Sur', 'Sucursal Centro', 'Sucursal Este']
export const MOTIVOS_DEVOLUCION = ['Vencido', 'Dañado', 'Error de pedido', 'No recibido', 'Cambio']

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

export const TRANSFERENCIAS: Transferencia[] = [
  { id: 'tr1', codigo: '0001', sucursalOrigen: 'Sucursal Norte',  sucursalDestino: 'Sucursal Sur',    fecha: FECHA_PLAN, items: 12, peso: 480, volumen: 1.9, estado: 'Confirmada' },
  { id: 'tr2', codigo: '0002', sucursalOrigen: 'Sucursal Norte',  sucursalDestino: 'Sucursal Este',   fecha: FECHA_PLAN, items: 8,  peso: 300, volumen: 1.2, estado: 'Confirmada' },
  { id: 'tr3', codigo: '0003', sucursalOrigen: 'Sucursal Centro', sucursalDestino: 'Sucursal Sur',    fecha: FECHA_PLAN, items: 20, peso: 540, volumen: 2.1, estado: 'Confirmada' },
  { id: 'tr4', codigo: '0004', sucursalOrigen: 'Sucursal Este',   sucursalDestino: 'Sucursal Norte',  fecha: FECHA_PLAN, items: 6,  peso: 388, volumen: 1.5, estado: 'Confirmada' },
  { id: 'tr5', codigo: '0005', sucursalOrigen: 'Sucursal Sur',    sucursalDestino: 'Sucursal Centro', fecha: FECHA_PLAN, items: 10, peso: 210, volumen: 0.8, estado: 'Confirmada' },
  { id: 'tr6', codigo: '0006', sucursalOrigen: 'Sucursal Norte',  sucursalDestino: 'Sucursal Centro', fecha: FECHA_PLAN, items: 7,  peso: 316, volumen: 1.3, estado: 'Confirmada' },
  { id: 'tr7', codigo: '0007', sucursalOrigen: 'Sucursal Centro', sucursalDestino: 'Sucursal Este',   fecha: FECHA_PLAN, items: 15, peso: 525, volumen: 2.0, estado: 'Confirmada' },
]

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

export const DEVOLUCIONES: Devolucion[] = [
  { id: 'dv1', codigo: '0001', cliente: 'Tienda Doña Rosa',      sucursal: 'Sucursal Norte',  fecha: FECHA_PLAN, items: 3, peso: 45, volumen: 0.2,  motivo: 'Vencido',         camionId: 't1' },
  { id: 'dv2', codigo: '0002', cliente: 'Almacén El Trigal',     sucursal: 'Sucursal Sur',    fecha: FECHA_PLAN, items: 2, peso: 30, volumen: 0.15, motivo: 'Dañado',          camionId: null },
  { id: 'dv3', codigo: '0003', cliente: 'Hipermaxi Norte',       sucursal: 'Sucursal Norte',  fecha: FECHA_PLAN, items: 5, peso: 80, volumen: 0.4,  motivo: 'Error de pedido',  camionId: 't1' },
  { id: 'dv4', codigo: '0004', cliente: 'Fidalga Equipetrol',    sucursal: 'Sucursal Centro', fecha: FECHA_PLAN, items: 1, peso: 12, volumen: 0.05, motivo: 'No recibido',      camionId: null },
  { id: 'dv5', codigo: '0005', cliente: 'Minimarket La Rotonda', sucursal: 'Sucursal Este',   fecha: FECHA_PLAN, items: 4, peso: 60, volumen: 0.3,  motivo: 'Cambio',          camionId: null },
  { id: 'dv6', codigo: '0006', cliente: 'Distribuidora Guapay',  sucursal: 'Sucursal Sur',    fecha: FECHA_PLAN, items: 6, peso: 95, volumen: 0.5,  motivo: 'Vencido',         camionId: 't2' },
  { id: 'dv7', codigo: '0007', cliente: 'IC Norte Cristo Rey',   sucursal: 'Sucursal Centro', fecha: FECHA_PLAN, items: 2, peso: 28, volumen: 0.12, motivo: 'Dañado',          camionId: null },
]

// ── Fases del flujo ──────────────────────────────────────────────────────────────────────────

export const FASES: StepItem[] = [
  { id: 'camiones', label: 'Camiones y pedidos', description: 'Flota y pedidos elegibles', icon: Truck },
  // Step 2 "Traslados y devoluciones" retirado del wizard: los traslados ahora viven como sub-paso
  // dentro del Step 1 (TrucksAndOrdersView). Se deja comentado, no borrado, para poder revertir.
  // { id: 'transferencias', label: 'Traslados', description: 'Y devoluciones', icon: ArrowLeftRight },
  { id: 'planificacion', label: 'Planificación', description: 'Paradas y rutas', icon: Route },
  { id: 'ordenes', label: 'Órdenes', description: 'Emitir despacho', icon: ClipboardCheck },
]
