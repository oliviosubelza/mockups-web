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
}

export interface PagoQrItem {
  transaccion: string
  banco: string
  clienteCodigo: string
  clienteNombre: string
  monto: number
  estado: string
}

export interface ChequeItem {
  banco: string
  nroCheque: string
  clienteCodigo: string
  clienteNombre: string
  monto: number
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
        efectivo: totalesOT1.totalValorFacturado - 1400.0,
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
      depositosEfectivo: [
        { banco: 'Banco BCP', numeroComprobante: 'DEP-99410', monto: 450.0, hora: '15:30', cuenta: 'Cta. Cte. Central' },
      ],
      cortesBs: generarCortesBsParaMonto(totalesOT1.totalValorFacturado - 1400.0),
      transferencias: [
        { transaccion: 'TR-102948', banco: 'Banco BCP', clienteCodigo: '10101', clienteNombre: 'Hipermaxi Norte', monto: 300.0, estado: 'Conciliado' },
      ],
      pagosQr: [
        { transaccion: 'QR-990182', banco: 'BISA', clienteCodigo: '10102', clienteNombre: 'Supermercado Fidalga', monto: 250.0, estado: 'Validado' },
      ],
      cheques: [
        { banco: 'Banco Mercantil', nroCheque: 'CHQ-001928', clienteCodigo: '10105', clienteNombre: 'Distribuidora San Martín', monto: 400.0, estado: 'Al Día' },
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
        efectivo: totalesOT2.totalValorFacturado - 1750.0,
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
      depositosEfectivo: [
        { banco: 'Banco Ganadero', numeroComprobante: 'DEP-77312', monto: 600.0, hora: '14:20', cuenta: 'Cta. Cte. Central' },
      ],
      cortesBs: generarCortesBsParaMonto(totalesOT2.totalValorFacturado - 1750.0),
      transferencias: [
        { transaccion: 'TR-440192', banco: 'Banco BCP', clienteCodigo: '10201', clienteNombre: 'Agencia Santos Dumont', monto: 500.0, estado: 'Conciliado' },
      ],
      pagosQr: [
        { transaccion: 'QR-110294', banco: 'BISA', clienteCodigo: '10202', clienteNombre: 'Comercial La Pascana', monto: 300.0, estado: 'Validado' },
      ],
      cheques: [
        { banco: 'Banco Unión', nroCheque: 'CHQ-883190', clienteCodigo: '10208', clienteNombre: 'Abarrotes Santos Dumont', monto: 350.0, estado: 'Al Día' },
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
        efectivo: totalesOT3.totalValorFacturado - 2550.0,
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
      depositosEfectivo: [
        { banco: 'Banco BCP', numeroComprobante: 'DEP-66201', monto: 800.0, hora: '16:00', cuenta: 'Cta. Cte. Central' },
      ],
      cortesBs: generarCortesBsParaMonto(totalesOT3.totalValorFacturado - 2550.0),
      transferencias: [
        { transaccion: 'TR-772019', banco: 'Banco Ganadero', clienteCodigo: '10301', clienteNombre: 'Hipermaxi Equipetrol', monto: 700.0, estado: 'Conciliado' },
      ],
      pagosQr: [
        { transaccion: 'QR-551029', banco: 'BISA', clienteCodigo: '10302', clienteNombre: 'Farmacias Chávez', monto: 500.0, estado: 'Validado' },
      ],
      cheques: [
        { banco: 'Banco BISA', nroCheque: 'CHQ-55201', clienteCodigo: '10310', clienteNombre: 'Restaurante Sirari Gourmet', monto: 550.0, estado: 'Al Día' },
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
        efectivo: totalesOT4.totalValorFacturado - 1450.0,
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
      depositosEfectivo: [
        { banco: 'Banco Unión', numeroComprobante: 'DEP-55190', monto: 500.0, hora: '15:10', cuenta: 'Cta. Cte. Central' },
      ],
      cortesBs: generarCortesBsParaMonto(totalesOT4.totalValorFacturado - 1450.0),
      transferencias: [
        { transaccion: 'TR-77102', banco: 'Banco Mercantil', clienteCodigo: '10405', clienteNombre: 'Minimarket Los Pinos', monto: 350.0, estado: 'Conciliado' },
      ],
      pagosQr: [
        { transaccion: 'QR-880291', banco: 'BISA', clienteCodigo: '10401', clienteNombre: 'Comercial Cañoto', monto: 100.0, estado: 'Validado' },
        { transaccion: 'QR-880315', banco: 'BCP', clienteCodigo: '10412', clienteNombre: 'Abarrotes Don Pepe', monto: 180.0, estado: 'Validado' },
      ],
      cheques: [
        { banco: 'Banco Ganadero', nroCheque: 'CHQ-33190', clienteCodigo: '10420', clienteNombre: 'Super Cañoto Express', monto: 320.0, estado: 'Al Día' },
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
        efectivo: totalesOT5.totalValorFacturado - 1350.0,
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
      depositosEfectivo: [
        { banco: 'Banco BCP', numeroComprobante: 'DEP-44102', monto: 450.0, hora: '16:40', cuenta: 'Cta. Cte. Central' },
      ],
      cortesBs: generarCortesBsParaMonto(totalesOT5.totalValorFacturado - 1350.0),
      transferencias: [
        { transaccion: 'TR-88190', banco: 'Banco BCP', clienteCodigo: '108001', clienteNombre: 'Supermercado Central Villa', monto: 400.0, estado: 'Conciliado' },
      ],
      pagosQr: [
        { transaccion: 'QR-55410', banco: 'BISA', clienteCodigo: '108012', clienteNombre: 'Tienda La Esmeralda', monto: 200.0, estado: 'Validado' },
      ],
      cheques: [
        { banco: 'Banco Mercantil', nroCheque: 'CHQ-22019', clienteCodigo: '108030', clienteNombre: 'Comercial Pampa de la Isla', monto: 300.0, estado: 'Al Día' },
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
        efectivo: totalesOT6.totalValorFacturado - 1845.0,
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
      depositosEfectivo: [
        { banco: 'Banco FIE', numeroComprobante: 'DEP-33901', monto: 380.0, hora: '15:50', cuenta: 'Cta. Cte. Central' },
      ],
      cortesBs: generarCortesBsParaMonto(totalesOT6.totalValorFacturado - 1845.0),
      transferencias: [
        { transaccion: 'TR-66014', banco: 'Banco Ganadero', clienteCodigo: '11002', clienteNombre: 'Supermercado Plan 3000', monto: 520.0, estado: 'Conciliado' },
        { transaccion: 'TR-66089', banco: 'Banco BCP', clienteCodigo: '11015', clienteNombre: 'Comercial El Fuerte', monto: 280.0, estado: 'Conciliado' },
      ],
      pagosQr: [
        { transaccion: 'QR-44120', banco: 'Banco Unión', clienteCodigo: '11030', clienteNombre: 'Tienda Doña María', monto: 150.0, estado: 'Validado' },
        { transaccion: 'QR-44195', banco: 'BISA', clienteCodigo: '11042', clienteNombre: 'Snack Central', monto: 95.0, estado: 'Validado' },
      ],
      cheques: [
        { banco: 'Banco Unión', nroCheque: 'CHQ-11029', clienteCodigo: '11050', clienteNombre: 'Distribuidora El Fuerte', monto: 420.0, estado: 'Al Día' },
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
    routeName: 'Ruta 112 - Cotoca y Guapilo',
    distributorName: 'Distribuidora Central Santa Cruz - Grupo Venado',
    truckPlate: '2910 MNB',
    truckCode: 'CAM-05',
    truckType: 'HINO 300 4 Tn',
    driverName: 'EDGAR TITO CONDORI',
    driverEmpresa: 'VENADO LOGÍSTICA',
    driverCi: '3920194 LP',
    supervisorName: 'Ing. Roberto Flores T.',
    status: 'CLOSED',
    statusLabel: 'Pendiente Liquidación',

    almacen: {
      fecha: '2026-02-22',
      fechaFormatted: '22/2/2026',
      choferNombre: 'EDGAR TITO CONDORI',
      choferEmpresa: 'VENADO LOGÍSTICA',
      usuarioLiquidador: 'CARLOS.ROJAS01',
      placaCamion: '2910 MNB HINO 300',
      tipoCamion: 'HINO 300',
      numeroDespacho: '525420022',
      items: itemsOT7,
      totales: totalesOT7,
      firmas: {
        chofer: { firmado: true, nombre: 'EDGAR TITO CONDORI', ci: '3920194 LP' },
        almacen: { firmado: true, nombre: 'CARLOS.ROJAS01', cargo: 'Liquidador Almacén' },
      },
    },

    cobranza: {
      fecha: '2026-02-22',
      fechaFormatted: '22/2/2026',
      choferNombre: 'EDGAR TITO CONDORI',
      choferEmpresa: 'VENADO LOGÍSTICA',
      usuarioLiquidador: 'CARLOS.ROJAS01',
      placaCamion: '2910 MNB HINO 300',
      tipoCamion: 'HINO 300',
      numeroDespacho: '525420022',
      resumenFinanciero: {
        importeFacturado: totalesOT7.totalValorFacturado,
        importeBonificado: totalesOT7.totalValorBonificacion,
        importeEntregado: totalesOT7.totalValorFacturado + totalesOT7.totalValorBonificacion,
        importeDevuelto: totalesOT7.totalValorDevuelto,
        valorDespacho: totalesOT7.totalValorDespacho,
      },
      resumenCobranzas: {
        efectivo: totalesOT7.totalValorFacturado - 1845.0,
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
      depositosEfectivo: [
        { banco: 'Banco Mercantil', numeroComprobante: 'DEP-22190', monto: 400.0, hora: '16:20', cuenta: 'Cta. Cte. Central' },
      ],
      cortesBs: generarCortesBsParaMonto(totalesOT7.totalValorFacturado - 1845.0),
      transferencias: [
        { transaccion: 'TR-55012', banco: 'Banco Mercantil', clienteCodigo: '11204', clienteNombre: 'Distribuidora Cotoca', monto: 650.0, estado: 'Conciliado' },
      ],
      pagosQr: [
        { transaccion: 'QR-33104', banco: 'Banco BCP', clienteCodigo: '11218', clienteNombre: 'Micromercado Guapilo', monto: 210.0, estado: 'Validado' },
        { transaccion: 'QR-33150', banco: 'Banco FIE', clienteCodigo: '11225', clienteNombre: 'Pulpería San José', monto: 85.0, estado: 'Validado' },
      ],
      cheques: [
        { banco: 'Banco BISA', nroCheque: 'CHQ-99102', clienteCodigo: '11240', clienteNombre: 'Supermercado Cotoca', monto: 500.0, estado: 'Al Día' },
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
        efectivo: totalesOT8.totalValorFacturado - 2670.0,
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
      depositosEfectivo: [
        { banco: 'Banco Ganadero', numeroComprobante: 'DEP-11029', monto: 750.0, hora: '16:05', cuenta: 'Cta. Cte. Central' },
      ],
      cortesBs: generarCortesBsParaMonto(totalesOT8.totalValorFacturado - 2670.0),
      transferencias: [
        { transaccion: 'TR-99201', banco: 'Banco Ganadero', clienteCodigo: '115001', clienteNombre: 'Hipermaxi Warnes', monto: 1000.0, estado: 'Conciliado' },
      ],
      pagosQr: [
        { transaccion: 'QR-77210', banco: 'BISA', clienteCodigo: '115022', clienteNombre: 'Tienda La Fama Warnes', monto: 320.0, estado: 'Validado' },
      ],
      cheques: [
        { banco: 'Banco Mercantil', nroCheque: 'CHQ-77102', clienteCodigo: '115035', clienteNombre: 'Comercial Parque Industrial', monto: 600.0, estado: 'Al Día' },
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
