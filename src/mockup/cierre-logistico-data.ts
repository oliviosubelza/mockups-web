// Dataset estructurado para el Cierre Logístico de Almacén y Cierre Logístico de Cobranzas.
// Mapea los formatos reales de Grupo Venado:
// - Cierre Logístico Almacén (Liquidación física con 30-50 SKUs por orden)
// - Cierre Logístico Cobranzas (Arqueo monetario, depósitos, medios digitales y balance)

export interface CierreAlmacenItem {
  codigo: string
  producto: string
  um: string // BOT, DOY, CAJ, POM, SOB, PAQ, etc.
  cantidadDespacho: number
  cantidadFacturado: number
  cantidadBonificacion: number
  facturadoTotal: number // Facturado + Bonificación
  cantidadDevuelto: number
  cantidadFaltante: number
  cantidadSobrante: number
  valorDespacho: number
  valorFacturado: number
  valorBonificacion: number
  valorDevuelto: number
}

export interface CierreAlmacenInfo {
  fecha: string
  fechaFormatted: string
  choferNombre: string
  choferEmpresa: string
  usuarioLiquidador: string
  placaCamion: string
  tipoCamion: string
  numeroDespacho: string // N° OT / Despacho
  items: CierreAlmacenItem[]
  totales: {
    totalCantidadDespacho: number
    totalCantidadFacturado: number
    totalCantidadBonificacion: number
    totalFacturadoTotal: number
    totalCantidadDevuelto: number
    totalCantidadFaltante: number
    totalCantidadSobrante: number
    totalValorDespacho: number
    totalValorFacturado: number
    totalValorBonificacion: number
    totalValorDevuelto: number
  }
  firmas: {
    chofer: { firmado: boolean; nombre: string; ci: string }
    almacen: { firmado: boolean; nombre: string; cargo: string }
  }
}

export interface CreditoItem {
  clienteCodigo: string
  clienteNombre: string
  factura: string
  monto: number
  estado: string
}

export interface DepositoEfectivoItem {
  banco: string
  numeroComprobante?: string
  voucher?: string
  monto: number
  hora?: string
  cuenta?: string
  estado?: string
}

export interface CorteMonedaItem {
  denominacion: string
  valorUnitario: number
  tipo: 'MONEDA' | 'BILLETE'
  cantidad: number
  monto: number
}

export interface TransferenciaItem {
  transaccion: string
  banco: string
  clienteCodigo: string
  clienteNombre: string
  monto: number
  estado: string
  factura?: string
  fechaHora?: string
  cuentaDestino?: string
}

export interface PagoQrItem {
  transaccion: string
  banco: string
  clienteCodigo: string
  clienteNombre: string
  monto: number
  estado: string
  factura?: string
  fechaHora?: string
  referenciaQr?: string
}

export interface ChequeItem {
  banco: string
  nroCheque: string
  clienteCodigo: string
  clienteNombre: string
  monto: number
  estado: string
  factura?: string
  fechaCobro?: string
  tipoCheque?: string
}

export interface FacturaEfectivoItem {
  factura: string
  reciboChofer: string
  clienteCodigo: string
  clienteNombre: string
  monto: number
  hora: string
  estado: string
}

export interface CobranzaCobradorItem {
  clienteCodigo: string
  clienteNombre: string
  factura: string
  monto: number
  estado: string
}

export interface DevolucionItem {
  clienteCodigo: string
  clienteNombre: string
  factura: string
  monto: number
  motivo?: string
  estado: string
}

export interface CierreCobranzaInfo {
  fecha: string
  fechaFormatted: string
  choferNombre: string
  choferEmpresa: string
  usuarioLiquidador: string
  placaCamion: string
  tipoCamion: string
  numeroDespacho: string

  // Resumen Financiero
  resumenFinanciero: {
    importeFacturado: number
    importeBonificado: number
    importeEntregado: number
    importeDevuelto: number
    valorDespacho: number
  }

  // Resumen Medios de Pago
  resumenCobranzas: {
    efectivo: number
    transferencia: number
    qr: number
    cheque: number
    cobranzaChofer: number
    credito: number
    cobranzaCobrador: number
    totalARendir: number
  }

  // Estadísticas de Pedidos
  pedidos: {
    total?: number
    despacho?: number
    facturado: number
    bonificado?: number
    devuelto?: number
    anulado?: number
    noEntregado?: number
  }

  // Desgloses Detallados
  creditos: CreditoItem[]
  depositosEfectivo: DepositoEfectivoItem[]
  cortesBs: CorteMonedaItem[]
  transferencias: TransferenciaItem[]
  pagosQr: PagoQrItem[]
  cheques: ChequeItem[]
  cobranzaCobrador: CobranzaCobradorItem[]
  devolucionesNoCobradas: DevolucionItem[]
  observaciones?: string

  // Firmas de los 4 roles
  firmas: {
    chofer: { firmado: boolean; nombre: string; cargo: string }
    supervisor: { firmado: boolean; nombre: string; cargo: string }
    cajero: { firmado: boolean; nombre: string; cargo: string }
    administrador: { firmado: boolean; nombre: string; cargo: string }
  }
}

export interface CierreOrdenTransporte {
  id: string
  transportOrderId: number
  orderCode: string
  dateFormatted: string
  dateIso: string
  routeName: string
  distributorName: string
  truckPlate: string
  truckCode: string
  truckType: string
  driverName: string
  driverEmpresa: string
  driverCi: string
  supervisorName: string
  status: 'CLOSED' | 'LIQUIDATED' | 'OBSERVED'
  statusLabel: string

  almacen: CierreAlmacenInfo
  cobranza: CierreCobranzaInfo
}

// ── CATÁLOGO MAESTRO DE PRODUCTOS GRUPO VENADO (55 SKUs) ──
const CATALOGO_VENADO = [
  { codigo: '600192', producto: 'B. REFRESCANTE CHICHA CAMBA DE 2 L NP', um: 'BOT', precio: 12.0 },
  { codigo: '600190', producto: 'B. REFRESCANTE MOCOCHINCHI DE 2 L NP', um: 'BOT', precio: 12.0 },
  { codigo: '600115', producto: 'REFRESCO FRUSSION DURAZNO 3 L', um: 'BOT', precio: 12.0 },
  { codigo: '600116', producto: 'REFRESCO FRUSSION MANZANA 3 L', um: 'BOT', precio: 12.0 },
  { codigo: '600117', producto: 'REFRESCO FRUSSION CITRUS 3 L', um: 'BOT', precio: 12.0 },
  { codigo: '600207', producto: 'RAPTOR ANALCOHOLICO DE 350 ML', um: 'BOT', precio: 3.8 },
  { codigo: '600208', producto: 'RAPTOR ENERGY DRINK 500 ML', um: 'LATA', precio: 6.5 },
  { codigo: '600204', producto: 'BEBIDA DE LA GRANJA NARANJA 300ML', um: 'BOT', precio: 5.0 },
  { codigo: '600205', producto: 'BEBIDA DE LA GRANJA NARANJA 2000 ML', um: 'BOT', precio: 18.5 },
  { codigo: '600206', producto: 'BEBIDA DE LA GRANJA MANZANA 2000 ML', um: 'BOT', precio: 18.5 },
  { codigo: 'KRI-MAY-100', producto: 'Mayonesa Kris Doypack 100g', um: 'DOY', precio: 3.5 },
  { codigo: 'KRI-MAY-250', producto: 'Mayonesa Kris Doypack 250g', um: 'DOY', precio: 7.0 },
  { codigo: 'KRI-MAY-500', producto: 'Mayonesa Kris Doypack 500g', um: 'DOY', precio: 12.0 },
  { codigo: 'KRI-MAY-1000', producto: 'Mayonesa Kris Doypack 1000g', um: 'DOY', precio: 21.5 },
  { codigo: 'KRI-MAY-POM', producto: 'Mayonesa Kris Pomo 400g', um: 'POM', precio: 13.5 },
  { codigo: 'KRI-KET-100', producto: 'Kétchup Kris Doypack 100g', um: 'DOY', precio: 3.2 },
  { codigo: 'KRI-KET-250', producto: 'Kétchup Kris Doypack 250g', um: 'DOY', precio: 6.5 },
  { codigo: 'KRI-KET-500', producto: 'Kétchup Kris Doypack 500g', um: 'DOY', precio: 11.5 },
  { codigo: 'KRI-KET-1000', producto: 'Kétchup Kris Doypack 1000g', um: 'DOY', precio: 20.0 },
  { codigo: 'KRI-MOS-100', producto: 'Mostaza Kris Doypack 100g', um: 'DOY', precio: 3.0 },
  { codigo: 'KRI-MOS-250', producto: 'Mostaza Kris Pomo 250g', um: 'POM', precio: 6.0 },
  { codigo: 'KRI-MOS-500', producto: 'Mostaza Kris Doypack 500g', um: 'DOY', precio: 10.5 },
  { codigo: 'KRI-GOLF-250', producto: 'Salsa Golf Kris Doypack 250g', um: 'DOY', precio: 8.0 },
  { codigo: 'KRI-GOLF-500', producto: 'Salsa Golf Kris Doypack 500g', um: 'DOY', precio: 14.0 },
  { codigo: 'KRI-SOJ-150', producto: 'Salsa de Soya Kris 150ml', um: 'BOT', precio: 4.5 },
  { codigo: 'KRI-SOJ-500', producto: 'Salsa de Soya Kris 500ml', um: 'BOT', precio: 9.0 },
  { codigo: 'KRI-ING-150', producto: 'Salsa Inglesa Kris 150ml', um: 'BOT', precio: 5.5 },
  { codigo: 'KRI-VIN-BLA', producto: 'Vinagre Blanco Kris 500ml', um: 'BOT', precio: 4.0 },
  { codigo: 'KRI-VIN-TIN', producto: 'Vinagre Tinto Kris 500ml', um: 'BOT', precio: 4.0 },
  { codigo: 'KRI-GEL-FRU', producto: 'Gelatina Kris Frutilla 85g', um: 'SOB', precio: 2.8 },
  { codigo: 'KRI-GEL-LIM', producto: 'Gelatina Kris Limón 85g', um: 'SOB', precio: 2.8 },
  { codigo: 'KRI-GEL-NAR', producto: 'Gelatina Kris Naranja 85g', um: 'SOB', precio: 2.8 },
  { codigo: 'KRI-GEL-PI', producto: 'Gelatina Kris Piña 85g', um: 'SOB', precio: 2.8 },
  { codigo: 'KRI-GEL-UVA', producto: 'Gelatina Kris Uva 85g', um: 'SOB', precio: 2.8 },
  { codigo: 'KRI-PUD-CHO', producto: 'Pudín Kris Chocolate 100g', um: 'SOB', precio: 3.5 },
  { codigo: 'KRI-PUD-VAI', producto: 'Pudín Kris Vainilla 100g', um: 'SOB', precio: 3.5 },
  { codigo: 'KRI-FLA-CAR', producto: 'Flan Kris Caramelo 100g', um: 'SOB', precio: 3.5 },
  { codigo: 'FID-COR-400', producto: 'Fideos Coronilla Tallarín 400g', um: 'PAQ', precio: 4.2 },
  { codigo: 'FID-COR-ESP', producto: 'Fideos Coronilla Espagueti 400g', um: 'PAQ', precio: 4.2 },
  { codigo: 'FID-COR-COD', producto: 'Fideos Coronilla Codito 400g', um: 'PAQ', precio: 4.2 },
  { codigo: 'FID-COR-PLU', producto: 'Fideos Coronilla Plumita 400g', um: 'PAQ', precio: 4.2 },
  { codigo: 'CER-CHO-300', producto: 'Cereal Kris Choco Flakes 300g', um: 'CAJ', precio: 14.5 },
  { codigo: 'CER-MAI-300', producto: 'Cereal Kris Corn Flakes 300g', um: 'CAJ', precio: 13.5 },
  { codigo: 'CER-AZU-300', producto: 'Cereal Kris Azucarado 300g', um: 'CAJ', precio: 14.0 },
  { codigo: 'AVN-KRI-500', producto: 'Avena Kris Instantánea 500g', um: 'BOL', precio: 8.5 },
  { codigo: 'TE-BRIST-100', producto: 'Té Bristol Clásico 100 saquitos', um: 'CAJ', precio: 16.0 },
  { codigo: 'TE-BRIST-CAN', producto: 'Té Bristol Canela y Clavo 50s', um: 'CAJ', precio: 10.0 },
  { codigo: 'MAT-YER-500', producto: 'Mate de Hierbas 50s', um: 'CAJ', precio: 11.0 },
  { codigo: 'DET-LIMP-1K', producto: 'Limpiador Multiuso Líquido 1L', um: 'BOT', precio: 12.0 },
  { codigo: 'JAB-LIQ-500', producto: 'Jabón Líquido Antibacterial 500ml', um: 'BOT', precio: 13.0 },
  { codigo: 'ACE-VEG-900', producto: 'Aceite Vegetal Fino 900ml', um: 'BOT', precio: 12.5 },
  { codigo: 'HAR-TRG-1K', producto: 'Harina de Trigo Especial 1kg', um: 'BOL', precio: 7.0 },
  { codigo: 'LECH-CON-395', producto: 'Leche Condensada Kris 395g', um: 'LATA', precio: 11.0 },
  { codigo: 'DUL-LEC-400', producto: 'Dulce de Leche Kris 400g', um: 'POT', precio: 13.5 },
  { codigo: 'SAL-PAR-500', producto: 'Sal Parrillera Kris 500g', um: 'BOL', precio: 5.0 },
]

// Función auxiliar para construir items de almacén con 30 a 50 productos
function generarItemsAlmacen(
  cantidadItems: number,
  seed: number,
  conDevoluciones: boolean,
  conFaltantes: boolean
): CierreAlmacenItem[] {
  const items: CierreAlmacenItem[] = []
  const count = Math.min(CATALOGO_VENADO.length, Math.max(30, cantidadItems))

  for (let i = 0; i < count; i++) {
    const prod = CATALOGO_VENADO[i]
    // Cantidades pseudo-aleatorias basadas en el seed y el índice
    const baseCant = 15 + ((seed * 7 + i * 13) % 45) // 15 a 60 unidades
    const bono = i % 4 === 0 ? Math.max(1, Math.floor(baseCant * 0.05)) : 0
    let dev = 0
    let falt = 0

    if (conDevoluciones && (i === 2 || i === 8 || i === 15 || i === 24)) {
      dev = ((seed + i) % 3) + 1 // 1 a 3 unidades
    }
    if (conFaltantes && (i === 5 || i === 19)) {
      falt = 1 + (seed % 2) // 1 o 2 unidades
    }

    const cantFact = Math.max(0, baseCant - bono - dev - falt)
    const factTotal = cantFact + bono
    const vDespacho = parseFloat((baseCant * prod.precio).toFixed(2))
    const vFacturado = parseFloat((cantFact * prod.precio).toFixed(2))
    const vBono = parseFloat((bono * prod.precio).toFixed(2))
    const vDev = parseFloat((dev * prod.precio).toFixed(2))

    items.push({
      codigo: prod.codigo,
      producto: prod.producto,
      um: prod.um,
      cantidadDespacho: baseCant,
      cantidadFacturado: cantFact,
      cantidadBonificacion: bono,
      facturadoTotal: factTotal,
      cantidadDevuelto: dev,
      cantidadFaltante: falt,
      cantidadSobrante: 0,
      valorDespacho: vDespacho,
      valorFacturado: vFacturado,
      valorBonificacion: vBono,
      valorDevuelto: vDev,
    })
  }

  return items
}

function calcularTotalesAlmacen(items: CierreAlmacenItem[]) {
  return items.reduce(
    (acc, it) => ({
      totalCantidadDespacho: acc.totalCantidadDespacho + it.cantidadDespacho,
      totalCantidadFacturado: acc.totalCantidadFacturado + it.cantidadFacturado,
      totalCantidadBonificacion: acc.totalCantidadBonificacion + it.cantidadBonificacion,
      totalFacturadoTotal: acc.totalFacturadoTotal + it.facturadoTotal,
      totalCantidadDevuelto: acc.totalCantidadDevuelto + it.cantidadDevuelto,
      totalCantidadFaltante: acc.totalCantidadFaltante + it.cantidadFaltante,
      totalCantidadSobrante: acc.totalCantidadSobrante + it.cantidadSobrante,
      totalValorDespacho: parseFloat((acc.totalValorDespacho + it.valorDespacho).toFixed(2)),
      totalValorFacturado: parseFloat((acc.totalValorFacturado + it.valorFacturado).toFixed(2)),
      totalValorBonificacion: parseFloat((acc.totalValorBonificacion + it.valorBonificacion).toFixed(2)),
      totalValorDevuelto: parseFloat((acc.totalValorDevuelto + it.valorDevuelto).toFixed(2)),
    }),
    {
      totalCantidadDespacho: 0,
      totalCantidadFacturado: 0,
      totalCantidadBonificacion: 0,
      totalFacturadoTotal: 0,
      totalCantidadDevuelto: 0,
      totalCantidadFaltante: 0,
      totalCantidadSobrante: 0,
      totalValorDespacho: 0,
      totalValorFacturado: 0,
      totalValorBonificacion: 0,
      totalValorDevuelto: 0,
    }
  )
}

function generarCortesBsParaMonto(montoTotal: number): CorteMonedaItem[] {
  let remCents = Math.round(montoTotal * 100)
  const denominaciones = [
    { den: '200 Bs', valCents: 20000, val: 200, tipo: 'BILLETE' as const },
    { den: '100 Bs', valCents: 10000, val: 100, tipo: 'BILLETE' as const },
    { den: '50 Bs', valCents: 5000, val: 50, tipo: 'BILLETE' as const },
    { den: '20 Bs', valCents: 2000, val: 20, tipo: 'BILLETE' as const },
    { den: '10 Bs', valCents: 1000, val: 10, tipo: 'BILLETE' as const },
    { den: '5 Bs', valCents: 500, val: 5, tipo: 'MONEDA' as const },
    { den: '2 Bs', valCents: 200, val: 2, tipo: 'MONEDA' as const },
    { den: '1 Bs', valCents: 100, val: 1, tipo: 'MONEDA' as const },
    { den: '0.50 Bs', valCents: 50, val: 0.5, tipo: 'MONEDA' as const },
    { den: '0.20 Bs', valCents: 20, val: 0.2, tipo: 'MONEDA' as const },
    { den: '0.10 Bs', valCents: 10, val: 0.1, tipo: 'MONEDA' as const },
  ]

  return denominaciones.map((d) => {
    let cant = 0
    if (remCents >= d.valCents) {
      cant = Math.floor(remCents / d.valCents)
      remCents = remCents % d.valCents
    }
    return {
      denominacion: d.den,
      valorUnitario: d.val,
      tipo: d.tipo,
      cantidad: cant,
      monto: parseFloat(((cant * d.valCents) / 100).toFixed(2)),
    }
  })
}

const CLIENTES_RUTA_BASE = [
  { codigo: 'CLI-10110', nombre: 'Abarrotes Doña Rosa' },
  { codigo: 'CLI-10115', nombre: 'Comercial El Cristo' },
  { codigo: 'CLI-10122', nombre: 'Pulpería San José' },
  { codigo: 'CLI-10134', nombre: 'Micromercado Los Pinos' },
  { codigo: 'CLI-10148', nombre: 'Minimarket Santa Ana' },
  { codigo: 'CLI-10155', nombre: 'Snack & Abarrotes Central' },
  { codigo: 'CLI-10162', nombre: 'Tienda La Pascana' },
  { codigo: 'CLI-10170', nombre: 'Abarrotes El Carmen' },
  { codigo: 'CLI-10178', nombre: 'Mercado Mutualista Puesto #42' },
  { codigo: 'CLI-10185', nombre: 'Comercial Los Pozos Express' },
  { codigo: 'CLI-10191', nombre: 'Bodega San Antonio' },
  { codigo: 'CLI-10204', nombre: 'Super Tienda La Villa' },
  { codigo: 'CLI-10212', nombre: 'Pulpería Don Carlos' },
  { codigo: 'CLI-10220', nombre: 'Distribuidora Minorista Cañoto' },
  { codigo: 'CLI-10228', nombre: 'Abarrotes Tres Hermanos' },
  { codigo: 'CLI-10235', nombre: 'Micromercado San Jorge' },
  { codigo: 'CLI-10242', nombre: 'Almacén El Progreso' },
  { codigo: 'CLI-10250', nombre: 'Tienda El Oasis' },
]

export function generarFacturasEfectivoParaMonto(
  orderCode: string,
  totalEfectivo: number
): FacturaEfectivoItem[] {
  const montoRedondeado = Math.max(0, Math.round(totalEfectivo * 100) / 100)
  if (montoRedondeado <= 0) return []

  const numFacturas = Math.min(CLIENTES_RUTA_BASE.length, Math.max(6, Math.min(18, Math.round(montoRedondeado / 750))))
  const pesos = [14, 8, 16, 6, 10, 15, 7, 12, 5, 13, 9, 11, 6, 12, 8, 7, 10, 8].slice(0, numFacturas)
  const sumaPesos = pesos.reduce((a, b) => a + b, 0)

  let acumulado = 0
  const facturas: FacturaEfectivoItem[] = []
  const orderDigits = orderCode.replace(/\D/g, '')
  const orderSuffix = orderDigits.length >= 4 ? orderDigits.slice(-4) : '1001'

  for (let i = 0; i < numFacturas; i++) {
    const isUltimo = i === numFacturas - 1
    const cliente = CLIENTES_RUTA_BASE[i]
    let montoItem = 0

    if (isUltimo) {
      montoItem = Math.max(0, Math.round((montoRedondeado - acumulado) * 100) / 100)
    } else {
      montoItem = Math.round(((pesos[i] / sumaPesos) * montoRedondeado) * 100) / 100
      acumulado = Math.round((acumulado + montoItem) * 100) / 100
    }

    const horaH = 8 + Math.floor(i / 2)
    const horaM = (i * 23) % 60
    const horaStr = `${String(horaH).padStart(2, '0')}:${String(horaM).padStart(2, '0')} ${horaH < 12 ? 'AM' : 'PM'}`

    facturas.push({
      factura: `FAC-${orderSuffix}-${String(i + 101).padStart(3, '0')}`,
      reciboChofer: `REC-${orderSuffix}${String(i + 1).padStart(2, '0')}`,
      clienteCodigo: cliente.codigo,
      clienteNombre: cliente.nombre,
      monto: montoItem,
      hora: horaStr,
      estado: 'Cobrado en Efectivo',
    })
  }

  return facturas
}

// ── CONSTRUCCIÓN DE LAS 8 ÓRDENES CON 30 A 50 PRODUCTOS CADA UNA ──

const itemsOT1 = generarItemsAlmacen(42, 101, true, false) // 42 SKUs
const totalesOT1 = calcularTotalesAlmacen(itemsOT1)

const itemsOT2 = generarItemsAlmacen(36, 202, true, false) // 36 SKUs
const totalesOT2 = calcularTotalesAlmacen(itemsOT2)

const itemsOT3 = generarItemsAlmacen(50, 303, true, false) // 50 SKUs
const totalesOT3 = calcularTotalesAlmacen(itemsOT3)

const itemsOT4 = generarItemsAlmacen(48, 404, true, false) // 48 SKUs
const totalesOT4 = calcularTotalesAlmacen(itemsOT4)

const itemsOT5 = generarItemsAlmacen(35, 505, false, false) // 35 SKUs
const totalesOT5 = calcularTotalesAlmacen(itemsOT5)

const itemsOT6 = generarItemsAlmacen(40, 606, true, false) // 40 SKUs
const totalesOT6 = calcularTotalesAlmacen(itemsOT6)

const itemsOT7 = generarItemsAlmacen(32, 707, false, false) // 32 SKUs
const totalesOT7 = calcularTotalesAlmacen(itemsOT7)

const itemsOT8 = generarItemsAlmacen(45, 808, true, false) // 45 SKUs
const totalesOT8 = calcularTotalesAlmacen(itemsOT8)

export const CIERRES_ORDENES_TRANSPORTE: CierreOrdenTransporte[] = [
  {
    id: 'cierre-525420002',
    transportOrderId: 525420002,
    orderCode: '525420002',
    dateFormatted: '12/02/2026',
    dateIso: '2026-02-12',
    routeName: 'Ruta 102 - Comercial Norte y Mutualista',
    distributorName: 'Distribuidora Central Santa Cruz - Grupo Venado',
    truckPlate: '4284 IYB',
    truckCode: 'CAM-04',
    truckType: 'HINO FRIO 3.5 Tn',
    driverName: 'VÍCTOR HUGO CONDORI PAREDES',
    driverEmpresa: 'IVSA',
    driverCi: '5429180 LP',
    supervisorName: 'Ing. Roberto Flores T.',
    status: 'LIQUIDATED',
    statusLabel: 'Liquidado Conforme',

    almacen: {
      fecha: '2026-02-12',
      fechaFormatted: '12/2/2026',
      choferNombre: 'VÍCTOR HUGO CONDORI PAREDES',
      choferEmpresa: 'IVSA',
      usuarioLiquidador: 'CARLOS.ROJAS01',
      placaCamion: '4284 IYB HINO FRIO',
      tipoCamion: 'HINO FRIO',
      numeroDespacho: '525420002',
      items: itemsOT1,
      totales: totalesOT1,
      firmas: {
        chofer: { firmado: true, nombre: 'VÍCTOR HUGO CONDORI PAREDES', ci: '5429180 LP' },
        almacen: { firmado: true, nombre: 'CARLOS.ROJAS01', cargo: 'Liquidador Almacén' },
      },
    },

    cobranza: {
      fecha: '2026-02-12',
      fechaFormatted: '12/2/2026',
      choferNombre: 'VÍCTOR HUGO CONDORI PAREDES',
      choferEmpresa: 'IVSA',
      usuarioLiquidador: 'CARLOS.ROJAS01',
      placaCamion: '4284 IYB HINO FRIO',
      tipoCamion: 'HINO FRIO',
      numeroDespacho: '525420002',
      resumenFinanciero: {
        importeFacturado: totalesOT1.totalValorFacturado,
        importeBonificado: totalesOT1.totalValorBonificacion,
        importeEntregado: totalesOT1.totalValorFacturado + totalesOT1.totalValorBonificacion,
        importeDevuelto: totalesOT1.totalValorDevuelto,
        valorDespacho: totalesOT1.totalValorDespacho,
      },
      resumenCobranzas: {
        efectivo: totalesOT1.totalValorFacturado - 950.0,
        transferencia: 300.0,
        qr: 250.0,
        cheque: 400.0,
        cobranzaChofer: totalesOT1.totalValorFacturado,
        credito: 0.0,
        cobranzaCobrador: 0.0,
        totalARendir: totalesOT1.totalValorFacturado,
      },
      pedidos: { total: 32, facturado: 30, bonificado: 5, anulado: 0, noEntregado: 2 },
      creditos: [],
      depositosEfectivo: [],
      cortesBs: generarCortesBsParaMonto(totalesOT1.totalValorFacturado - 950.0),
      transferencias: [
        {
          transaccion: 'TR-102948',
          banco: 'Banco BCP',
          clienteCodigo: '10101',
          clienteNombre: 'Hipermaxi Norte',
          monto: 300.0,
          estado: 'Conciliado',
          factura: 'FAC-0002-081',
          fechaHora: '10:15 AM',
          cuentaDestino: 'Cta. Recaudadora BCP #201-5092182',
        },
      ],
      pagosQr: [
        {
          transaccion: 'QR-990182',
          banco: 'Banco BISA (Simple)',
          clienteCodigo: '10102',
          clienteNombre: 'Supermercado Fidalga',
          monto: 250.0,
          estado: 'Validado',
          factura: 'FAC-0002-085',
          fechaHora: '11:20 AM',
          referenciaQr: 'BISA-SIMPLE-990182',
        },
      ],
      cheques: [
        {
          banco: 'Banco Mercantil Santa Cruz',
          nroCheque: 'CHQ-001928',
          clienteCodigo: '10105',
          clienteNombre: 'Distribuidora San Martín',
          monto: 400.0,
          estado: 'Al Día',
          factura: 'FAC-0002-092',
          fechaCobro: '12/02/2026',
        },
      ],
      cobranzaCobrador: [],
      devolucionesNoCobradas: [],
      firmas: {
        chofer: { firmado: true, nombre: 'VÍCTOR HUGO CONDORI', cargo: 'Chofer Repartidor' },
        supervisor: { firmado: true, nombre: 'Ing. Roberto Flores T.', cargo: 'Supervisor de Rampa' },
        cajero: { firmado: true, nombre: 'Lic. Laura Mendoza', cargo: 'Cajera Central' },
        administrador: { firmado: true, nombre: 'Lic. Sergio Daza', cargo: 'Jefe Admin' },
      },
    },
  },
  {
    id: 'cierre-ORD-2026-0819',
    transportOrderId: 1001,
    orderCode: 'ORD-2026-0819',
    dateFormatted: '19/08/2026',
    dateIso: '2026-08-19',
    routeName: 'Ruta 104 - Radial 10 y Santos Dumont',
    distributorName: 'Distribuidora Central Santa Cruz - Grupo Venado',
    truckPlate: '5120 GHT',
    truckCode: 'CAM-02',
    truckType: 'HINO 500 5 Tn',
    driverName: 'GONZALO MAMANI RAMOS',
    driverEmpresa: 'VENADO LOGÍSTICA',
    driverCi: '6192834 SC',
    supervisorName: 'Ing. Marco Antonio Vaca',
    status: 'LIQUIDATED',
    statusLabel: 'Liquidado Conforme',

    almacen: {
      fecha: '2026-08-19',
      fechaFormatted: '19/8/2026',
      choferNombre: 'GONZALO MAMANI RAMOS',
      choferEmpresa: 'VENADO LOGÍSTICA',
      usuarioLiquidador: 'DENISSE.MAMANI04',
      placaCamion: '5120 GHT HINO 500',
      tipoCamion: 'HINO 500',
      numeroDespacho: 'ORD-2026-0819',
      items: itemsOT2,
      totales: totalesOT2,
      firmas: {
        chofer: { firmado: true, nombre: 'GONZALO MAMANI RAMOS', ci: '6192834 SC' },
        almacen: { firmado: true, nombre: 'DENISSE.MAMANI04', cargo: 'Liquidador Almacén' },
      },
    },

    cobranza: {
      fecha: '2026-08-19',
      fechaFormatted: '19/8/2026',
      choferNombre: 'GONZALO MAMANI RAMOS',
      choferEmpresa: 'VENADO LOGÍSTICA',
      usuarioLiquidador: 'DENISSE.MAMANI04',
      placaCamion: '5120 GHT HINO 500',
      tipoCamion: 'HINO 500',
      numeroDespacho: 'ORD-2026-0819',
      resumenFinanciero: {
        importeFacturado: totalesOT2.totalValorFacturado,
        importeBonificado: totalesOT2.totalValorBonificacion,
        importeEntregado: totalesOT2.totalValorFacturado + totalesOT2.totalValorBonificacion,
        importeDevuelto: totalesOT2.totalValorDevuelto,
        valorDespacho: totalesOT2.totalValorDespacho,
      },
      resumenCobranzas: {
        efectivo: totalesOT2.totalValorFacturado - 1150.0,
        transferencia: 500.0,
        qr: 300.0,
        cheque: 350.0,
        cobranzaChofer: totalesOT2.totalValorFacturado,
        credito: 0.0,
        cobranzaCobrador: 0.0,
        totalARendir: totalesOT2.totalValorFacturado,
      },
      pedidos: { total: 28, facturado: 27, bonificado: 4, anulado: 0, noEntregado: 1 },
      creditos: [],
      depositosEfectivo: [],
      cortesBs: generarCortesBsParaMonto(totalesOT2.totalValorFacturado - 1150.0),
      transferencias: [
        {
          transaccion: 'TR-440192',
          banco: 'Banco BCP',
          clienteCodigo: '10201',
          clienteNombre: 'Agencia Santos Dumont',
          monto: 500.0,
          estado: 'Conciliado',
          factura: 'FAC-0819-081',
          fechaHora: '09:40 AM',
          cuentaDestino: 'Cta. Recaudadora BCP #201-5092182',
        },
      ],
      pagosQr: [
        {
          transaccion: 'QR-110294',
          banco: 'Banco BISA (Simple)',
          clienteCodigo: '10202',
          clienteNombre: 'Comercial La Pascana',
          monto: 300.0,
          estado: 'Validado',
          factura: 'FAC-0819-086',
          fechaHora: '11:05 AM',
          referenciaQr: 'BISA-SIMPLE-110294',
        },
      ],
      cheques: [
        {
          banco: 'Banco Unión',
          nroCheque: 'CHQ-883190',
          clienteCodigo: '10208',
          clienteNombre: 'Abarrotes Santos Dumont',
          monto: 350.0,
          estado: 'Al Día',
          factura: 'FAC-0819-093',
          fechaCobro: '19/08/2026',
        },
      ],
      cobranzaCobrador: [],
      devolucionesNoCobradas: [],
      firmas: {
        chofer: { firmado: true, nombre: 'GONZALO MAMANI RAMOS', cargo: 'Chofer Repartidor' },
        supervisor: { firmado: true, nombre: 'Ing. Marco Antonio Vaca', cargo: 'Supervisor' },
        cajero: { firmado: true, nombre: 'Lic. Laura Mendoza', cargo: 'Cajera Central' },
        administrador: { firmado: true, nombre: 'Lic. Sergio Daza', cargo: 'Jefe Admin' },
      },
    },
  },
  {
    id: 'cierre-525420010',
    transportOrderId: 525420010,
    orderCode: '525420010',
    dateFormatted: '15/02/2026',
    dateIso: '2026-02-15',
    routeName: 'Ruta 106 - Equipetrol y Sirari',
    distributorName: 'Distribuidora Central Santa Cruz - Grupo Venado',
    truckPlate: '4284 IYB',
    truckCode: 'CAM-04',
    truckType: 'HINO FRIO 3.5 Tn',
    driverName: 'JAVIER QUISPE COLQUE',
    driverEmpresa: 'IVSA',
    driverCi: '4193820 SC',
    supervisorName: 'Ing. Roberto Flores T.',
    status: 'LIQUIDATED',
    statusLabel: 'Liquidado Conforme',

    almacen: {
      fecha: '2026-02-15',
      fechaFormatted: '15/2/2026',
      choferNombre: 'JAVIER QUISPE COLQUE',
      choferEmpresa: 'IVSA',
      usuarioLiquidador: 'CARLOS.ROJAS01',
      placaCamion: '4284 IYB HINO FRIO',
      tipoCamion: 'HINO FRIO',
      numeroDespacho: '525420010',
      items: itemsOT3,
      totales: totalesOT3,
      firmas: {
        chofer: { firmado: true, nombre: 'JAVIER QUISPE COLQUE', ci: '4193820 SC' },
        almacen: { firmado: true, nombre: 'CARLOS.ROJAS01', cargo: 'Liquidador Almacén' },
      },
    },

    cobranza: {
      fecha: '2026-02-15',
      fechaFormatted: '15/2/2026',
      choferNombre: 'JAVIER QUISPE COLQUE',
      choferEmpresa: 'IVSA',
      usuarioLiquidador: 'CARLOS.ROJAS01',
      placaCamion: '4284 IYB HINO FRIO',
      tipoCamion: 'HINO FRIO',
      numeroDespacho: '525420010',
      resumenFinanciero: {
        importeFacturado: totalesOT3.totalValorFacturado,
        importeBonificado: totalesOT3.totalValorBonificacion,
        importeEntregado: totalesOT3.totalValorFacturado + totalesOT3.totalValorBonificacion,
        importeDevuelto: totalesOT3.totalValorDevuelto,
        valorDespacho: totalesOT3.totalValorDespacho,
      },
      resumenCobranzas: {
        efectivo: totalesOT3.totalValorFacturado - 1750.0,
        transferencia: 700.0,
        qr: 500.0,
        cheque: 550.0,
        cobranzaChofer: totalesOT3.totalValorFacturado,
        credito: 0.0,
        cobranzaCobrador: 0.0,
        totalARendir: totalesOT3.totalValorFacturado,
      },
      pedidos: { total: 45, facturado: 43, bonificado: 8, anulado: 0, noEntregado: 2 },
      creditos: [],
      depositosEfectivo: [],
      cortesBs: generarCortesBsParaMonto(totalesOT3.totalValorFacturado - 1750.0),
      transferencias: [
        {
          transaccion: 'TR-772019',
          banco: 'Banco Ganadero',
          clienteCodigo: '10301',
          clienteNombre: 'Hipermaxi Equipetrol',
          monto: 700.0,
          estado: 'Conciliado',
          factura: 'FAC-0010-082',
          fechaHora: '10:30 AM',
          cuentaDestino: 'Cta. Recaudadora Ganadero #105-88219',
        },
      ],
      pagosQr: [
        {
          transaccion: 'QR-551029',
          banco: 'Banco BISA (Simple)',
          clienteCodigo: '10302',
          clienteNombre: 'Farmacias Chávez Sirari',
          monto: 500.0,
          estado: 'Validado',
          factura: 'FAC-0010-087',
          fechaHora: '12:15 PM',
          referenciaQr: 'BISA-SIMPLE-551029',
        },
      ],
      cheques: [
        {
          banco: 'Banco BISA',
          nroCheque: 'CHQ-55201',
          clienteCodigo: '10310',
          clienteNombre: 'Restaurante Sirari Gourmet',
          monto: 550.0,
          estado: 'Al Día',
          factura: 'FAC-0010-094',
          fechaCobro: '15/02/2026',
        },
      ],
      cobranzaCobrador: [],
      devolucionesNoCobradas: [],
      firmas: {
        chofer: { firmado: true, nombre: 'JAVIER QUISPE COLQUE', cargo: 'Chofer Repartidor' },
        supervisor: { firmado: true, nombre: 'Ing. Roberto Flores T.', cargo: 'Supervisor' },
        cajero: { firmado: true, nombre: 'Lic. Laura Mendoza', cargo: 'Cajera Central' },
        administrador: { firmado: true, nombre: 'Lic. Sergio Daza', cargo: 'Jefe Admin' },
      },
    },
  },
  {
    id: 'cierre-525420012',
    transportOrderId: 525420012,
    orderCode: '525420012',
    dateFormatted: '16/02/2026',
    dateIso: '2026-02-16',
    routeName: 'Ruta 107 - La Ramada y Cañoto',
    distributorName: 'Distribuidora Central Santa Cruz - Grupo Venado',
    truckPlate: '5120 GHT',
    truckCode: 'CAM-02',
    truckType: 'HINO 500 5 Tn',
    driverName: 'FERNANDO RÍOS CALLE',
    driverEmpresa: 'IVSA',
    driverCi: '5920193 LP',
    supervisorName: 'Ing. Marco Antonio Vaca',
    status: 'OBSERVED',
    statusLabel: 'Observado (Faltante)',

    almacen: {
      fecha: '2026-02-16',
      fechaFormatted: '16/2/2026',
      choferNombre: 'FERNANDO RÍOS CALLE',
      choferEmpresa: 'IVSA',
      usuarioLiquidador: 'CARLOS.ROJAS01',
      placaCamion: '5120 GHT HINO 500',
      tipoCamion: 'HINO 500',
      numeroDespacho: '525420012',
      items: itemsOT4,
      totales: totalesOT4,
      firmas: {
        chofer: { firmado: true, nombre: 'FERNANDO RÍOS CALLE', ci: '5920193 LP' },
        almacen: { firmado: true, nombre: 'CARLOS.ROJAS01', cargo: 'Liquidador Almacén' },
      },
    },

    cobranza: {
      fecha: '2026-02-16',
      fechaFormatted: '16/2/2026',
      choferNombre: 'FERNANDO RÍOS CALLE',
      choferEmpresa: 'IVSA',
      usuarioLiquidador: 'CARLOS.ROJAS01',
      placaCamion: '5120 GHT HINO 500',
      tipoCamion: 'HINO 500',
      numeroDespacho: '525420012',
      resumenFinanciero: {
        importeFacturado: totalesOT4.totalValorFacturado,
        importeBonificado: totalesOT4.totalValorBonificacion,
        importeEntregado: totalesOT4.totalValorFacturado + totalesOT4.totalValorBonificacion,
        importeDevuelto: totalesOT4.totalValorDevuelto,
        valorDespacho: totalesOT4.totalValorDespacho,
      },
      resumenCobranzas: {
        efectivo: totalesOT4.totalValorFacturado - 950.0,
        transferencia: 350.0,
        qr: 280.0,
        cheque: 320.0,
        cobranzaChofer: totalesOT4.totalValorFacturado,
        credito: 0.0,
        cobranzaCobrador: 0.0,
        totalARendir: totalesOT4.totalValorFacturado,
      },
      pedidos: { total: 38, facturado: 36, bonificado: 6, anulado: 0, noEntregado: 2 },
      creditos: [],
      depositosEfectivo: [],
      cortesBs: generarCortesBsParaMonto(totalesOT4.totalValorFacturado - 950.0),
      transferencias: [
        {
          transaccion: 'TR-77102',
          banco: 'Banco Mercantil',
          clienteCodigo: '10405',
          clienteNombre: 'Minimarket Los Pinos',
          monto: 350.0,
          estado: 'Conciliado',
          factura: 'FAC-0012-081',
          fechaHora: '09:50 AM',
          cuentaDestino: 'Cta. Recaudadora Mercantil #401-22910',
        },
      ],
      pagosQr: [
        {
          transaccion: 'QR-880291',
          banco: 'Banco BISA (Simple)',
          clienteCodigo: '10401',
          clienteNombre: 'Comercial Cañoto',
          monto: 100.0,
          estado: 'Validado',
          factura: 'FAC-0012-085',
          fechaHora: '10:45 AM',
          referenciaQr: 'BISA-SIMPLE-880291',
        },
        {
          transaccion: 'QR-880315',
          banco: 'Banco BCP',
          clienteCodigo: '10412',
          clienteNombre: 'Abarrotes Don Pepe',
          monto: 180.0,
          estado: 'Validado',
          factura: 'FAC-0012-086',
          fechaHora: '11:30 AM',
          referenciaQr: 'BCP-QR-880315',
        },
      ],
      cheques: [
        {
          banco: 'Banco Ganadero',
          nroCheque: 'CHQ-33190',
          clienteCodigo: '10420',
          clienteNombre: 'Super Cañoto Express',
          monto: 320.0,
          estado: 'Al Día',
          factura: 'FAC-0012-092',
          fechaCobro: '16/02/2026',
        },
      ],
      cobranzaCobrador: [],
      devolucionesNoCobradas: [],
      firmas: {
        chofer: { firmado: true, nombre: 'FERNANDO RÍOS CALLE', cargo: 'Chofer Repartidor' },
        supervisor: { firmado: true, nombre: 'Ing. Marco Antonio Vaca', cargo: 'Supervisor' },
        cajero: { firmado: true, nombre: 'Lic. Laura Mendoza', cargo: 'Cajera Central' },
        administrador: { firmado: false, nombre: 'Pendiente Admin', cargo: 'Jefe Admin' },
      },
    },
  },
  {
    id: 'cierre-525420015',
    transportOrderId: 525420015,
    orderCode: '525420015',
    dateFormatted: '18/02/2026',
    dateIso: '2026-02-18',
    routeName: 'Ruta 108 - Villa 1ro de Mayo y Pampa de la Isla',
    distributorName: 'Distribuidora Central Santa Cruz - Grupo Venado',
    truckPlate: '3120 LKP',
    truckCode: 'CAM-07',
    truckType: 'MERCEDES BENZ 8 Tn',
    driverName: 'CARLOS ALBERTO MEDINA',
    driverEmpresa: 'TRANS-ORIENTE',
    driverCi: '7829102 SC',
    supervisorName: 'Ing. Roberto Flores T.',
    status: 'CLOSED',
    statusLabel: 'Pendiente Liquidación',

    almacen: {
      fecha: '2026-02-18',
      fechaFormatted: '18/2/2026',
      choferNombre: 'CARLOS ALBERTO MEDINA',
      choferEmpresa: 'TRANS-ORIENTE',
      usuarioLiquidador: 'CARLOS.ROJAS01',
      placaCamion: '3120 LKP MERCEDES BENZ',
      tipoCamion: 'MERCEDES BENZ',
      numeroDespacho: '525420015',
      items: itemsOT5,
      totales: totalesOT5,
      firmas: {
        chofer: { firmado: true, nombre: 'CARLOS ALBERTO MEDINA', ci: '7829102 SC' },
        almacen: { firmado: true, nombre: 'CARLOS.ROJAS01', cargo: 'Liquidador Almacén' },
      },
    },

    cobranza: {
      fecha: '2026-02-18',
      fechaFormatted: '18/2/2026',
      choferNombre: 'CARLOS ALBERTO MEDINA',
      choferEmpresa: 'TRANS-ORIENTE',
      usuarioLiquidador: 'CARLOS.ROJAS01',
      placaCamion: '3120 LKP MERCEDES BENZ',
      tipoCamion: 'MERCEDES BENZ',
      numeroDespacho: '525420015',
      resumenFinanciero: {
        importeFacturado: totalesOT5.totalValorFacturado,
        importeBonificado: totalesOT5.totalValorBonificacion,
        importeEntregado: totalesOT5.totalValorFacturado + totalesOT5.totalValorBonificacion,
        importeDevuelto: totalesOT5.totalValorDevuelto,
        valorDespacho: totalesOT5.totalValorDespacho,
      },
      resumenCobranzas: {
        efectivo: totalesOT5.totalValorFacturado - 900.0,
        transferencia: 400.0,
        qr: 200.0,
        cheque: 300.0,
        cobranzaChofer: totalesOT5.totalValorFacturado,
        credito: 0.0,
        cobranzaCobrador: 0.0,
        totalARendir: totalesOT5.totalValorFacturado,
      },
      pedidos: { total: 30, facturado: 30, bonificado: 4, anulado: 0, noEntregado: 0 },
      creditos: [],
      depositosEfectivo: [],
      cortesBs: generarCortesBsParaMonto(totalesOT5.totalValorFacturado - 900.0),
      transferencias: [
        {
          transaccion: 'TR-88190',
          banco: 'Banco BCP',
          clienteCodigo: '108001',
          clienteNombre: 'Supermercado Central Villa',
          monto: 400.0,
          estado: 'Conciliado',
          factura: 'FAC-0015-081',
          fechaHora: '10:05 AM',
          cuentaDestino: 'Cta. Recaudadora BCP #201-5092182',
        },
      ],
      pagosQr: [
        {
          transaccion: 'QR-55410',
          banco: 'Banco BISA (Simple)',
          clienteCodigo: '108012',
          clienteNombre: 'Tienda La Esmeralda',
          monto: 200.0,
          estado: 'Validado',
          factura: 'FAC-0015-086',
          fechaHora: '11:15 AM',
          referenciaQr: 'BISA-SIMPLE-55410',
        },
      ],
      cheques: [
        {
          banco: 'Banco Mercantil',
          nroCheque: 'CHQ-22019',
          clienteCodigo: '108030',
          clienteNombre: 'Comercial Pampa de la Isla',
          monto: 300.0,
          estado: 'Al Día',
          factura: 'FAC-0015-091',
          fechaCobro: '18/02/2026',
        },
      ],
      cobranzaCobrador: [],
      devolucionesNoCobradas: [],
      firmas: {
        chofer: { firmado: true, nombre: 'CARLOS ALBERTO MEDINA', cargo: 'Chofer Repartidor' },
        supervisor: { firmado: true, nombre: 'Ing. Roberto Flores T.', cargo: 'Supervisor' },
        cajero: { firmado: false, nombre: 'Pendiente Caja', cargo: 'Cajero Central' },
        administrador: { firmado: false, nombre: 'Pendiente Admin', cargo: 'Jefe Admin' },
      },
    },
  },
  {
    id: 'cierre-525420018',
    transportOrderId: 525420018,
    orderCode: '525420018',
    dateFormatted: '20/02/2026',
    dateIso: '2026-02-20',
    routeName: 'Ruta 110 - Plan 3000 y El Fuerte',
    distributorName: 'Distribuidora Central Santa Cruz - Grupo Venado',
    truckPlate: '4820 TUV',
    truckCode: 'CAM-09',
    truckType: 'ISUZU FORWARD 6 Tn',
    driverName: 'MARCELO QUIROGA SUÁREZ',
    driverEmpresa: 'IVSA',
    driverCi: '4820194 SC',
    supervisorName: 'Ing. Roberto Flores T.',
    status: 'OBSERVED',
    statusLabel: 'Observado (Faltante)',

    almacen: {
      fecha: '2026-02-20',
      fechaFormatted: '20/2/2026',
      choferNombre: 'MARCELO QUIROGA SUÁREZ',
      choferEmpresa: 'IVSA',
      usuarioLiquidador: 'CARLOS.ROJAS01',
      placaCamion: '4820 TUV ISUZU',
      tipoCamion: 'ISUZU FORWARD',
      numeroDespacho: '525420018',
      items: itemsOT6,
      totales: totalesOT6,
      firmas: {
        chofer: { firmado: true, nombre: 'MARCELO QUIROGA SUÁREZ', ci: '4820194 SC' },
        almacen: { firmado: true, nombre: 'CARLOS.ROJAS01', cargo: 'Liquidador Almacén' },
      },
    },

    cobranza: {
      fecha: '2026-02-20',
      fechaFormatted: '20/2/2026',
      choferNombre: 'MARCELO QUIROGA SUÁREZ',
      choferEmpresa: 'IVSA',
      usuarioLiquidador: 'CARLOS.ROJAS01',
      placaCamion: '4820 TUV ISUZU',
      tipoCamion: 'ISUZU FORWARD',
      numeroDespacho: '525420018',
      resumenFinanciero: {
        importeFacturado: totalesOT6.totalValorFacturado,
        importeBonificado: totalesOT6.totalValorBonificacion,
        importeEntregado: totalesOT6.totalValorFacturado + totalesOT6.totalValorBonificacion,
        importeDevuelto: totalesOT6.totalValorDevuelto,
        valorDespacho: totalesOT6.totalValorDespacho,
      },
      resumenCobranzas: {
        efectivo: totalesOT6.totalValorFacturado - 1465.0,
        transferencia: 800.0,
        qr: 245.0,
        cheque: 420.0,
        cobranzaChofer: totalesOT6.totalValorFacturado,
        credito: 0.0,
        cobranzaCobrador: 0.0,
        totalARendir: totalesOT6.totalValorFacturado,
      },
      pedidos: { total: 34, facturado: 33, bonificado: 5, anulado: 0, noEntregado: 1 },
      creditos: [],
      depositosEfectivo: [],
      cortesBs: generarCortesBsParaMonto(totalesOT6.totalValorFacturado - 1465.0),
      transferencias: [
        {
          transaccion: 'TR-66014',
          banco: 'Banco Ganadero',
          clienteCodigo: '11002',
          clienteNombre: 'Supermercado Plan 3000',
          monto: 520.0,
          estado: 'Conciliado',
          factura: 'FAC-0018-081',
          fechaHora: '09:20 AM',
          cuentaDestino: 'Cta. Recaudadora Ganadero #105-88219',
        },
        {
          transaccion: 'TR-66089',
          banco: 'Banco BCP',
          clienteCodigo: '11015',
          clienteNombre: 'Comercial El Fuerte',
          monto: 280.0,
          estado: 'Conciliado',
          factura: 'FAC-0018-082',
          fechaHora: '10:40 AM',
          cuentaDestino: 'Cta. Recaudadora BCP #201-5092182',
        },
      ],
      pagosQr: [
        {
          transaccion: 'QR-44120',
          banco: 'Banco Unión',
          clienteCodigo: '11030',
          clienteNombre: 'Tienda Doña María',
          monto: 150.0,
          estado: 'Validado',
          factura: 'FAC-0018-088',
          fechaHora: '11:10 AM',
          referenciaQr: 'UNION-QR-44120',
        },
        {
          transaccion: 'QR-44195',
          banco: 'Banco BISA (Simple)',
          clienteCodigo: '11042',
          clienteNombre: 'Snack Central',
          monto: 95.0,
          estado: 'Validado',
          factura: 'FAC-0018-089',
          fechaHora: '11:55 AM',
          referenciaQr: 'BISA-SIMPLE-44195',
        },
      ],
      cheques: [
        {
          banco: 'Banco Unión',
          nroCheque: 'CHQ-11029',
          clienteCodigo: '11050',
          clienteNombre: 'Distribuidora El Fuerte',
          monto: 420.0,
          estado: 'Al Día',
          factura: 'FAC-0018-095',
          fechaCobro: '20/02/2026',
        },
      ],
      cobranzaCobrador: [],
      devolucionesNoCobradas: [],
      firmas: {
        chofer: { firmado: true, nombre: 'MARCELO QUIROGA SUÁREZ', cargo: 'Chofer Repartidor' },
        supervisor: { firmado: true, nombre: 'Ing. Roberto Flores T.', cargo: 'Supervisor' },
        cajero: { firmado: true, nombre: 'Lic. Laura Mendoza', cargo: 'Cajera Central' },
        administrador: { firmado: false, nombre: 'Pendiente Admin', cargo: 'Jefe Admin' },
      },
    },
  },
  {
    id: 'cierre-525420022',
    transportOrderId: 525420022,
    orderCode: '525420022',
    dateFormatted: '22/02/2026',
    dateIso: '2026-02-22',
    routeName: 'Ruta 112 - Parque Industrial y Cotoca',
    distributorName: 'Distribuidora Central Santa Cruz - Grupo Venado',
    truckPlate: '3120 LKP',
    truckCode: 'CAM-07',
    truckType: 'MERCEDES BENZ 8 Tn',
    driverName: 'EDGAR TITO CONDORI',
    driverEmpresa: 'TRANS-ORIENTE',
    driverCi: '6192019 SC',
    supervisorName: 'Ing. Roberto Flores T.',
    status: 'CLOSED',
    statusLabel: 'Pendiente Liquidación',

    almacen: {
      fecha: '2026-02-22',
      fechaFormatted: '22/2/2026',
      choferNombre: 'EDGAR TITO CONDORI',
      choferEmpresa: 'TRANS-ORIENTE',
      usuarioLiquidador: 'CARLOS.ROJAS01',
      placaCamion: '3120 LKP MERCEDES BENZ',
      tipoCamion: 'MERCEDES BENZ',
      numeroDespacho: '525420022',
      items: itemsOT7,
      totales: totalesOT7,
      firmas: {
        chofer: { firmado: true, nombre: 'EDGAR TITO CONDORI', ci: '6192019 SC' },
        almacen: { firmado: true, nombre: 'CARLOS.ROJAS01', cargo: 'Liquidador Almacén' },
      },
    },

    cobranza: {
      fecha: '2026-02-22',
      fechaFormatted: '22/2/2026',
      choferNombre: 'EDGAR TITO CONDORI',
      choferEmpresa: 'TRANS-ORIENTE',
      usuarioLiquidador: 'CARLOS.ROJAS01',
      placaCamion: '3120 LKP MERCEDES BENZ',
      tipoCamion: 'MERCEDES BENZ',
      numeroDespacho: '525420022',
      resumenFinanciero: {
        importeFacturado: totalesOT7.totalValorFacturado,
        importeBonificado: totalesOT7.totalValorBonificacion,
        importeEntregado: totalesOT7.totalValorFacturado + totalesOT7.totalValorBonificacion,
        importeDevuelto: totalesOT7.totalValorDevuelto,
        valorDespacho: totalesOT7.totalValorDespacho,
      },
      resumenCobranzas: {
        efectivo: totalesOT7.totalValorFacturado - 1445.0,
        transferencia: 650.0,
        qr: 295.0,
        cheque: 500.0,
        cobranzaChofer: totalesOT7.totalValorFacturado,
        credito: 0.0,
        cobranzaCobrador: 0.0,
        totalARendir: totalesOT7.totalValorFacturado,
      },
      pedidos: { total: 26, facturado: 26, bonificado: 3, anulado: 0, noEntregado: 0 },
      creditos: [],
      depositosEfectivo: [],
      cortesBs: generarCortesBsParaMonto(totalesOT7.totalValorFacturado - 1445.0),
      transferencias: [
        {
          transaccion: 'TR-55012',
          banco: 'Banco Mercantil',
          clienteCodigo: '11204',
          clienteNombre: 'Distribuidora Cotoca',
          monto: 650.0,
          estado: 'Conciliado',
          factura: 'FAC-0022-081',
          fechaHora: '09:35 AM',
          cuentaDestino: 'Cta. Recaudadora Mercantil #401-22910',
        },
      ],
      pagosQr: [
        {
          transaccion: 'QR-33104',
          banco: 'Banco BCP',
          clienteCodigo: '11218',
          clienteNombre: 'Micromercado Guapilo',
          monto: 210.0,
          estado: 'Validado',
          factura: 'FAC-0022-085',
          fechaHora: '10:20 AM',
          referenciaQr: 'BCP-QR-33104',
        },
        {
          transaccion: 'QR-33150',
          banco: 'Banco FIE',
          clienteCodigo: '11225',
          clienteNombre: 'Pulpería San José Cotoca',
          monto: 85.0,
          estado: 'Validado',
          factura: 'FAC-0022-086',
          fechaHora: '11:40 AM',
          referenciaQr: 'FIE-QR-33150',
        },
      ],
      cheques: [
        {
          banco: 'Banco BISA',
          nroCheque: 'CHQ-99102',
          clienteCodigo: '11240',
          clienteNombre: 'Supermercado Cotoca',
          monto: 500.0,
          estado: 'Al Día',
          factura: 'FAC-0022-092',
          fechaCobro: '22/02/2026',
        },
      ],
      cobranzaCobrador: [],
      devolucionesNoCobradas: [],
      firmas: {
        chofer: { firmado: true, nombre: 'EDGAR TITO CONDORI', cargo: 'Chofer Repartidor' },
        supervisor: { firmado: true, nombre: 'Ing. Roberto Flores T.', cargo: 'Supervisor' },
        cajero: { firmado: false, nombre: 'Pendiente Caja', cargo: 'Cajero Central' },
        administrador: { firmado: false, nombre: 'Pendiente Admin', cargo: 'Jefe Admin' },
      },
    },
  },
  {
    id: 'cierre-525420025',
    transportOrderId: 525420025,
    orderCode: '525420025',
    dateFormatted: '25/02/2026',
    dateIso: '2026-02-25',
    routeName: 'Ruta 115 - Warnes y Parque Industrial',
    distributorName: 'Distribuidora Central Santa Cruz - Grupo Venado',
    truckPlate: '5031 QWE',
    truckCode: 'CAM-11',
    truckType: 'VOLVO VM 10 Tn',
    driverName: 'HERNÁN PACHECO LOAYZA',
    driverEmpresa: 'TRANS-ORIENTE',
    driverCi: '5920194 SC',
    supervisorName: 'Ing. Roberto Flores T.',
    status: 'LIQUIDATED',
    statusLabel: 'Liquidado Conforme',

    almacen: {
      fecha: '2026-02-25',
      fechaFormatted: '25/2/2026',
      choferNombre: 'HERNÁN PACHECO LOAYZA',
      choferEmpresa: 'TRANS-ORIENTE',
      usuarioLiquidador: 'CARLOS.ROJAS01',
      placaCamion: '5031 QWE VOLVO',
      tipoCamion: 'VOLVO VM',
      numeroDespacho: '525420025',
      items: itemsOT8,
      totales: totalesOT8,
      firmas: {
        chofer: { firmado: true, nombre: 'HERNÁN PACHECO LOAYZA', ci: '5920194 SC' },
        almacen: { firmado: true, nombre: 'CARLOS.ROJAS01', cargo: 'Liquidador Almacén' },
      },
    },

    cobranza: {
      fecha: '2026-02-25',
      fechaFormatted: '25/2/2026',
      choferNombre: 'HERNÁN PACHECO LOAYZA',
      choferEmpresa: 'TRANS-ORIENTE',
      usuarioLiquidador: 'CARLOS.ROJAS01',
      placaCamion: '5031 QWE VOLVO',
      tipoCamion: 'VOLVO VM',
      numeroDespacho: '525420025',
      resumenFinanciero: {
        importeFacturado: totalesOT8.totalValorFacturado,
        importeBonificado: totalesOT8.totalValorBonificacion,
        importeEntregado: totalesOT8.totalValorFacturado + totalesOT8.totalValorBonificacion,
        importeDevuelto: totalesOT8.totalValorDevuelto,
        valorDespacho: totalesOT8.totalValorDespacho,
      },
      resumenCobranzas: {
        efectivo: totalesOT8.totalValorFacturado - 1920.0,
        transferencia: 1000.0,
        qr: 320.0,
        cheque: 600.0,
        cobranzaChofer: totalesOT8.totalValorFacturado,
        credito: 0.0,
        cobranzaCobrador: 0.0,
        totalARendir: totalesOT8.totalValorFacturado,
      },
      pedidos: { total: 36, facturado: 35, bonificado: 6, anulado: 0, noEntregado: 1 },
      creditos: [],
      depositosEfectivo: [],
      cortesBs: generarCortesBsParaMonto(totalesOT8.totalValorFacturado - 1920.0),
      transferencias: [
        {
          transaccion: 'TR-99201',
          banco: 'Banco Ganadero',
          clienteCodigo: '115001',
          clienteNombre: 'Hipermaxi Warnes',
          monto: 1000.0,
          estado: 'Conciliado',
          factura: 'FAC-0025-081',
          fechaHora: '09:15 AM',
          cuentaDestino: 'Cta. Recaudadora Ganadero #105-88219',
        },
      ],
      pagosQr: [
        {
          transaccion: 'QR-77210',
          banco: 'Banco BISA (Simple)',
          clienteCodigo: '115022',
          clienteNombre: 'Tienda La Fama Warnes',
          monto: 320.0,
          estado: 'Validado',
          factura: 'FAC-0025-085',
          fechaHora: '10:50 AM',
          referenciaQr: 'BISA-SIMPLE-77210',
        },
      ],
      cheques: [
        {
          banco: 'Banco Mercantil Santa Cruz',
          nroCheque: 'CHQ-77102',
          clienteCodigo: '115035',
          clienteNombre: 'Comercial Parque Industrial',
          monto: 600.0,
          estado: 'Al Día',
          factura: 'FAC-0025-092',
          fechaCobro: '25/02/2026',
        },
      ],
      cobranzaCobrador: [],
      devolucionesNoCobradas: [],
      firmas: {
        chofer: { firmado: true, nombre: 'HERNÁN PACHECO LOAYZA', cargo: 'Chofer Repartidor' },
        supervisor: { firmado: true, nombre: 'Ing. Roberto Flores T.', cargo: 'Supervisor' },
        cajero: { firmado: true, nombre: 'Lic. Laura Mendoza', cargo: 'Cajera Central' },
        administrador: { firmado: true, nombre: 'Lic. Sergio Daza', cargo: 'Jefe Admin' },
      },
    },
  },
]
