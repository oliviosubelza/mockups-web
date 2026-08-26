// Dataset estructurado para el Cierre Logístico de Almacén y Cierre Logístico de Cobranzas.
// Mapea exactamente los formatos de las 3 imágenes reales de Grupo Venado:
// - image.png (Cierre Logístico Almacén)
// - cierre_logistico_cobranza1.png y cierre_logistico_cobranza2.png (Cierre Logístico Cobranzas)
// Relación 1 a 1 con transport_orders.

export interface CierreAlmacenItem {
  codigo: string
  producto: string
  um: string // BOT, DOY, CAJ, POM, etc.
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
  estado: string // "Credito/Facturado/Entregado"
}

export interface DepositoEfectivoItem {
  banco: string
  voucher: string
  monto: number
  estado: string // "Contado/Facturado/Cobrado - Efectivo"
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
  estado: string // "Contado/Facturado/Cobrado - Transferencia"
}

export interface PagoQrItem {
  transaccion: string
  banco: string
  clienteCodigo: string
  clienteNombre: string
  monto: number
  estado: string // "Contado/Facturado/Cobrado - QR"
}

export interface ChequeItem {
  banco: string
  nroCheque: string
  clienteCodigo: string
  clienteNombre: string
  monto: number
  estado: string // "Contado/Facturado/Cobrado - Cheque"
}

export interface CobranzaCobradorItem {
  clienteCodigo: string
  clienteNombre: string
  factura: string
  monto: number
  estado: string // "Contado/Facturado/Entregado - Sin Cobrar"
}

export interface DevolucionItem {
  clienteCodigo: string
  clienteNombre: string
  factura: string
  monto: number
  motivo?: string
  estado: string // "Visitado o Facturado/Sin Entregar - Sin Cobrar"
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
    importeFacturado: number     // Bs 1.118,74
    importeBonificado: number   // Bs 92,81
    importeEntregado: number    // Bs 1.211,55 (Facturado + Bonificado)
    importeDevuelto: number     // Bs 41,15
    valorDespacho: number       // Bs 1.252,70
  }

  // Resumen Medios de Pago
  resumenCobranzas: {
    efectivo: number            // Bs 400,00
    transferencia: number       // Bs 300,00
    qr: number                  // Bs 252,70
    cheque: number              // Bs 0,00
    cobranzaChofer: number      // Bs 952,70 (Efectivo + Transf + QR + Cheque)
    credito: number             // Bs 166,04
    cobranzaCobrador: number    // Bs 0,00
    totalARendir: number        // Bs 1.118,74 (Cobranza Chofer + Crédito + Cobrador)
  }

  // Estadísticas de Pedidos
  pedidos: {
    despacho: number            // 30
    facturado: number           // 28
    devuelto: number            // 2
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

// ── DATASET REAL BASADO EXACTAMENTE EN LAS IMÁGENES DE GRUPO VENADO ──

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

    // ── 1. CIERRE ALMACÉN (image.png) ──
    almacen: {
      fecha: '2026-02-12',
      fechaFormatted: '12/2/2026',
      choferNombre: 'VÍCTOR HUGO CONDORI PAREDES',
      choferEmpresa: 'IVSA',
      usuarioLiquidador: 'CARLOS.ROJAS01',
      placaCamion: '4284 IYB HINO FRIO',
      tipoCamion: 'HINO FRIO',
      numeroDespacho: '525420002',
      items: [
        {
          codigo: '600192',
          producto: 'B. REFRESCANTE CHICHA CAMBA DE 2 L NP',
          um: 'BOT',
          cantidadDespacho: 10,
          cantidadFacturado: 8,
          cantidadBonificacion: 1,
          facturadoTotal: 9,
          cantidadDevuelto: 1,
          cantidadFaltante: 0,
          cantidadSobrante: 0,
          valorDespacho: 120.0,
          valorFacturado: 96.0,
          valorBonificacion: 12.0,
          valorDevuelto: 12.0,
        },
        {
          codigo: '600190',
          producto: 'B. REFRESCANTE MOCOCHINCHI DE 2 L NP',
          um: 'BOT',
          cantidadDespacho: 8,
          cantidadFacturado: 8,
          cantidadBonificacion: 0,
          facturadoTotal: 8,
          cantidadDevuelto: 0,
          cantidadFaltante: 0,
          cantidadSobrante: 0,
          valorDespacho: 96.0,
          valorFacturado: 96.0,
          valorBonificacion: 0.0,
          valorDevuelto: 0.0,
        },
        {
          codigo: '600115',
          producto: 'REFRESCO FRUSSION DURAZNO 3 L',
          um: 'BOT',
          cantidadDespacho: 7,
          cantidadFacturado: 6,
          cantidadBonificacion: 1,
          facturadoTotal: 7,
          cantidadDevuelto: 0,
          cantidadFaltante: 0,
          cantidadSobrante: 0,
          valorDespacho: 84.0,
          valorFacturado: 72.0,
          valorBonificacion: 12.0,
          valorDevuelto: 0.0,
        },
        {
          codigo: '600207',
          producto: 'RAPTOR ANALCOHOLICO DE 350 ML',
          um: 'BOT',
          cantidadDespacho: 140,
          cantidadFacturado: 128,
          cantidadBonificacion: 7,
          facturadoTotal: 135,
          cantidadDevuelto: 5,
          cantidadFaltante: 0,
          cantidadSobrante: 0,
          valorDespacho: 536.2,
          valorFacturado: 490.2,
          valorBonificacion: 26.8,
          valorDevuelto: 19.2,
        },
        {
          codigo: '600204',
          producto: 'BEBIDA DE LA GRANJA NARANJA 300ML',
          um: 'BOT',
          cantidadDespacho: 13,
          cantidadFacturado: 10,
          cantidadBonificacion: 1,
          facturadoTotal: 11,
          cantidadDevuelto: 2,
          cantidadFaltante: 0,
          cantidadSobrante: 0,
          valorDespacho: 65.0,
          valorFacturado: 50.0,
          valorBonificacion: 5.0,
          valorDevuelto: 10.0,
        },
        {
          codigo: '600205',
          producto: 'BEBIDA DE LA GRANJA NARANJA 2000 ML',
          um: 'BOT',
          cantidadDespacho: 19,
          cantidadFacturado: 17,
          cantidadBonificacion: 2,
          facturadoTotal: 19,
          cantidadDevuelto: 0,
          cantidadFaltante: 0,
          cantidadSobrante: 0,
          valorDespacho: 351.5,
          valorFacturado: 314.5,
          valorBonificacion: 37.0,
          valorDevuelto: 0.0,
        },
      ],
      totales: {
        totalCantidadDespacho: 197,
        totalCantidadFacturado: 177,
        totalCantidadBonificacion: 12,
        totalFacturadoTotal: 189,
        totalCantidadDevuelto: 8,
        totalCantidadFaltante: 0,
        totalCantidadSobrante: 0,
        totalValorDespacho: 1252.7,
        totalValorFacturado: 1118.7,
        totalValorBonificacion: 92.8,
        totalValorDevuelto: 41.2,
      },
      firmas: {
        chofer: { firmado: true, nombre: 'VÍCTOR HUGO CONDORI', ci: '5429180 LP' },
        almacen: { firmado: true, nombre: 'CARLOS ROJAS T.', cargo: 'Encargado de Rampa y Almacén' },
      },
    },

    // ── 2. CIERRE COBRANZAS (cierre_logistico_cobranza1.png y 2.png) ──
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
        importeFacturado: 1118.74,
        importeBonificado: 92.81,
        importeEntregado: 1211.55,
        importeDevuelto: 41.15,
        valorDespacho: 1252.7,
      },

      resumenCobranzas: {
        efectivo: 400.0,
        transferencia: 300.0,
        qr: 252.7,
        cheque: 0.0,
        cobranzaChofer: 952.7,
        credito: 166.04,
        cobranzaCobrador: 0.0,
        totalARendir: 1118.74,
      },

      pedidos: {
        despacho: 30,
        facturado: 28,
        devuelto: 2,
      },

      creditos: [
        {
          clienteCodigo: '1338183',
          clienteNombre: 'Abarrotes Doña María - Mutualista',
          factura: 'F-88291',
          monto: 100.0,
          estado: 'Credito/Facturado/Entregado',
        },
        {
          clienteCodigo: '1093764',
          clienteNombre: 'Comercial El Carmen',
          factura: 'F-88295',
          monto: 66.04,
          estado: 'Credito/Facturado/Entregado',
        },
      ],

      depositosEfectivo: [
        {
          banco: 'BISA',
          voucher: '1234',
          monto: 0.0, // Referencial en plantilla
          estado: 'Contado/Facturado/Cobrado - Efectivo',
        },
      ],

      cortesBs: [
        { denominacion: 'Bs 0,10', valorUnitario: 0.1, tipo: 'MONEDA', cantidad: 0, monto: 0.0 },
        { denominacion: 'Bs 0,20', valorUnitario: 0.2, tipo: 'MONEDA', cantidad: 0, monto: 0.0 },
        { denominacion: 'Bs 0,50', valorUnitario: 0.5, tipo: 'MONEDA', cantidad: 0, monto: 0.0 },
        { denominacion: 'Bs 1,00', valorUnitario: 1.0, tipo: 'MONEDA', cantidad: 0, monto: 0.0 },
        { denominacion: 'Bs 2,00', valorUnitario: 2.0, tipo: 'MONEDA', cantidad: 5, monto: 10.0 },
        { denominacion: 'Bs 5,00', valorUnitario: 5.0, tipo: 'MONEDA', cantidad: 8, monto: 40.0 },
        { denominacion: 'Bs 10,00', valorUnitario: 10.0, tipo: 'BILLETE', cantidad: 5, monto: 50.0 },
        { denominacion: 'Bs 20,00', valorUnitario: 20.0, tipo: 'BILLETE', cantidad: 5, monto: 100.0 },
        { denominacion: 'Bs 50,00', valorUnitario: 50.0, tipo: 'BILLETE', cantidad: 2, monto: 100.0 },
        { denominacion: 'Bs 100,00', valorUnitario: 100.0, tipo: 'BILLETE', cantidad: 1, monto: 100.0 },
        { denominacion: 'Bs 200,00', valorUnitario: 200.0, tipo: 'BILLETE', cantidad: 0, monto: 0.0 },
      ],

      transferencias: [
        {
          transaccion: '991000901',
          banco: 'BCP',
          clienteCodigo: '1020301',
          clienteNombre: 'Minimarket Los Pinos',
          monto: 50.0,
          estado: 'Contado/Facturado/Cobrado - Transferencia',
        },
        {
          transaccion: '991000902',
          banco: 'GANADERO',
          clienteCodigo: '1020310',
          clienteNombre: 'Tienda San Silvestre',
          monto: 50.0,
          estado: 'Contado/Facturado/Cobrado - Transferencia',
        },
        {
          transaccion: '991000905',
          banco: 'GANADERO',
          clienteCodigo: '1020200',
          clienteNombre: 'Snack El Buen Sabor',
          monto: 100.0,
          estado: 'Contado/Facturado/Cobrado - Transferencia',
        },
        {
          transaccion: '991000920',
          banco: 'BCP',
          clienteCodigo: '1020198',
          clienteNombre: 'Comercializadora Oriental',
          monto: 100.0,
          estado: 'Contado/Facturado/Cobrado - Transferencia',
        },
      ],

      pagosQr: [
        {
          transaccion: '991000901',
          banco: 'BISA',
          clienteCodigo: '1020301',
          clienteNombre: 'Pulpería La Salle',
          monto: 52.7,
          estado: 'Contado/Facturado/Cobrado - QR',
        },
        {
          transaccion: '991000902',
          banco: 'BISA',
          clienteCodigo: '1020310',
          clienteNombre: 'Almacén 3 Pasos',
          monto: 50.0,
          estado: 'Contado/Facturado/Cobrado - QR',
        },
        {
          transaccion: '991000905',
          banco: 'BISA',
          clienteCodigo: '1020200',
          clienteNombre: 'Micromercado Florida',
          monto: 20.0,
          estado: 'Contado/Facturado/Cobrado - QR',
        },
        {
          transaccion: '991000920',
          banco: 'BISA',
          clienteCodigo: '1020102',
          clienteNombre: 'Kiosco Central',
          monto: 30.0,
          estado: 'Contado/Facturado/Cobrado - QR',
        },
        {
          transaccion: '991000910',
          banco: 'BISA',
          clienteCodigo: '1020191',
          clienteNombre: 'Licorería San Martín',
          monto: 50.0,
          estado: 'Contado/Facturado/Cobrado - QR',
        },
        {
          transaccion: '991000915',
          banco: 'BISA',
          clienteCodigo: '1020155',
          clienteNombre: 'Supermercado Familiar',
          monto: 50.0,
          estado: 'Contado/Facturado/Cobrado - QR',
        },
      ],

      cheques: [],

      cobranzaCobrador: [],

      devolucionesNoCobradas: [
        {
          clienteCodigo: '1020301',
          clienteNombre: 'Tienda La Cholita',
          factura: '123',
          monto: 26.2,
          motivo: 'Local cerrado en segundo intento',
          estado: 'Visitado o Facturado/Sin Entregar - Sin Cobrar',
        },
        {
          clienteCodigo: '1020310',
          clienteNombre: 'Comedor Doña Rosa',
          factura: '-',
          monto: 20.0,
          motivo: 'Rechazo parcial por falta de liquidez',
          estado: 'Visitado o Facturado/Sin Entregar - Sin Cobrar',
        },
      ],

      firmas: {
        chofer: { firmado: true, nombre: 'VÍCTOR HUGO CONDORI', cargo: 'Chofer Repartidor (IVSA)' },
        supervisor: { firmado: true, nombre: 'Ing. Roberto Flores T.', cargo: 'Supervisor de Rampa y Rutas' },
        cajero: { firmado: true, nombre: 'Lic. Laura Mendoza', cargo: 'Cajera Central de Liquidación' },
        administrador: { firmado: true, nombre: 'Lic. Sergio Daza', cargo: 'Jefe de Administración y Finanzas' },
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
      items: [
        {
          codigo: 'KRI-MAY-500',
          producto: 'Mayonesa Kris Doypack 500g',
          um: 'DOY',
          cantidadDespacho: 192,
          cantidadFacturado: 180,
          cantidadBonificacion: 12,
          facturadoTotal: 192,
          cantidadDevuelto: 0,
          cantidadFaltante: 0,
          cantidadSobrante: 0,
          valorDespacho: 2304.0,
          valorFacturado: 2160.0,
          valorBonificacion: 144.0,
          valorDevuelto: 0.0,
        },
        {
          codigo: 'KRI-KET-500',
          producto: 'Ketchup Kris Doypack 500g',
          um: 'DOY',
          cantidadDespacho: 149,
          cantidadFacturado: 140,
          cantidadBonificacion: 5,
          facturadoTotal: 145,
          cantidadDevuelto: 4,
          cantidadFaltante: 0,
          cantidadSobrante: 0,
          valorDespacho: 1788.0,
          valorFacturado: 1680.0,
          valorBonificacion: 60.0,
          valorDevuelto: 48.0,
        },
        {
          codigo: 'KRI-MOS-250',
          producto: 'Mostaza Kris Pomo 250g',
          um: 'POM',
          cantidadDespacho: 7,
          cantidadFacturado: 7,
          cantidadBonificacion: 0,
          facturadoTotal: 7,
          cantidadDevuelto: 0,
          cantidadFaltante: 0,
          cantidadSobrante: 0,
          valorDespacho: 70.0,
          valorFacturado: 70.0,
          valorBonificacion: 0.0,
          valorDevuelto: 0.0,
        },
      ],
      totales: {
        totalCantidadDespacho: 348,
        totalCantidadFacturado: 327,
        totalCantidadBonificacion: 17,
        totalFacturadoTotal: 344,
        totalCantidadDevuelto: 4,
        totalCantidadFaltante: 0,
        totalCantidadSobrante: 0,
        totalValorDespacho: 4162.0,
        totalValorFacturado: 3910.0,
        totalValorBonificacion: 204.0,
        totalValorDevuelto: 48.0,
      },
      firmas: {
        chofer: { firmado: true, nombre: 'GONZALO MAMANI RAMOS', ci: '6192834 SC' },
        almacen: { firmado: true, nombre: 'DENISSE MAMANI', cargo: 'Encargada de Rampa y Almacén' },
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
        importeFacturado: 3910.0,
        importeBonificado: 204.0,
        importeEntregado: 4114.0,
        importeDevuelto: 48.0,
        valorDespacho: 4162.0,
      },
      resumenCobranzas: {
        efectivo: 1800.0,
        transferencia: 1200.0,
        qr: 610.0,
        cheque: 0.0,
        cobranzaChofer: 3610.0,
        credito: 300.0,
        cobranzaCobrador: 0.0,
        totalARendir: 3910.0,
      },
      pedidos: {
        despacho: 35,
        facturado: 34,
        devuelto: 1,
      },
      creditos: [
        {
          clienteCodigo: '1102948',
          clienteNombre: 'Supermercado Belén - Santos Dumont',
          factura: 'F-90124',
          monto: 300.0,
          estado: 'Credito/Facturado/Entregado',
        },
      ],
      depositosEfectivo: [],
      cortesBs: [
        { denominacion: 'Bs 10,00', valorUnitario: 10.0, tipo: 'BILLETE', cantidad: 20, monto: 200.0 },
        { denominacion: 'Bs 20,00', valorUnitario: 20.0, tipo: 'BILLETE', cantidad: 30, monto: 600.0 },
        { denominacion: 'Bs 50,00', valorUnitario: 50.0, tipo: 'BILLETE', cantidad: 10, monto: 500.0 },
        { denominacion: 'Bs 100,00', valorUnitario: 100.0, tipo: 'BILLETE', cantidad: 5, monto: 500.0 },
      ],
      transferencias: [
        {
          transaccion: '992000101',
          banco: 'BCP',
          clienteCodigo: '1020444',
          clienteNombre: 'Distribuciones Santa Ana',
          monto: 1200.0,
          estado: 'Contado/Facturado/Cobrado - Transferencia',
        },
      ],
      pagosQr: [
        {
          transaccion: '992000102',
          banco: 'BISA',
          clienteCodigo: '1020555',
          clienteNombre: 'Tienda La Amistad',
          monto: 610.0,
          estado: 'Contado/Facturado/Cobrado - QR',
        },
      ],
      cheques: [],
      cobranzaCobrador: [],
      devolucionesNoCobradas: [
        {
          clienteCodigo: '1020666',
          clienteNombre: 'Kiosco El Trébol',
          factura: 'F-90130',
          monto: 48.0,
          motivo: 'Envase con fisura leve reportado en cliente',
          estado: 'Visitado o Facturado/Sin Entregar - Sin Cobrar',
        },
      ],
      firmas: {
        chofer: { firmado: true, nombre: 'GONZALO MAMANI RAMOS', cargo: 'Chofer Repartidor' },
        supervisor: { firmado: true, nombre: 'Ing. Marco Antonio Vaca', cargo: 'Supervisor de Rampa y Rutas' },
        cajero: { firmado: true, nombre: 'Lic. Laura Mendoza', cargo: 'Cajera Central de Liquidación' },
        administrador: { firmado: true, nombre: 'Lic. Sergio Daza', cargo: 'Jefe de Administración y Finanzas' },
      },
    },
  },
  {
    id: 'cierre-525420005',
    transportOrderId: 525420005,
    orderCode: '525420005',
    dateFormatted: '12/02/2026',
    dateIso: '2026-02-12',
    routeName: 'Ruta 108 - Villa 1ro de Mayo y Plan 3000',
    distributorName: 'Distribuidora Central Santa Cruz - Grupo Venado',
    truckPlate: '3819 XDF',
    truckCode: 'CAM-08',
    truckType: 'HINO 300 3.5 Tn',
    driverName: 'MAURICIO VARGAS PEÑARANDA',
    driverEmpresa: 'IVSA',
    driverCi: '7201948 CB',
    supervisorName: 'Ing. Roberto Flores T.',
    status: 'LIQUIDATED',
    statusLabel: 'Liquidado Conforme',

    almacen: {
      fecha: '2026-02-12',
      fechaFormatted: '12/2/2026',
      choferNombre: 'MAURICIO VARGAS PEÑARANDA',
      choferEmpresa: 'IVSA',
      usuarioLiquidador: 'SILVIA.GUTIERREZ03',
      placaCamion: '3819 XDF HINO 300',
      tipoCamion: 'HINO 300',
      numeroDespacho: '525420005',
      items: [
        {
          codigo: '600192',
          producto: 'B. REFRESCANTE CHICHA CAMBA DE 2 L NP',
          um: 'BOT',
          cantidadDespacho: 25,
          cantidadFacturado: 23,
          cantidadBonificacion: 2,
          facturadoTotal: 25,
          cantidadDevuelto: 0,
          cantidadFaltante: 0,
          cantidadSobrante: 0,
          valorDespacho: 300.0,
          valorFacturado: 276.0,
          valorBonificacion: 24.0,
          valorDevuelto: 0.0,
        },
        {
          codigo: 'KRI-MAY-500',
          producto: 'Mayonesa Kris Doypack 500g',
          um: 'DOY',
          cantidadDespacho: 50,
          cantidadFacturado: 48,
          cantidadBonificacion: 2,
          facturadoTotal: 50,
          cantidadDevuelto: 0,
          cantidadFaltante: 0,
          cantidadSobrante: 0,
          valorDespacho: 600.0,
          valorFacturado: 576.0,
          valorBonificacion: 24.0,
          valorDevuelto: 0.0,
        },
      ],
      totales: {
        totalCantidadDespacho: 75,
        totalCantidadFacturado: 71,
        totalCantidadBonificacion: 4,
        totalFacturadoTotal: 75,
        totalCantidadDevuelto: 0,
        totalCantidadFaltante: 0,
        totalCantidadSobrante: 0,
        totalValorDespacho: 900.0,
        totalValorFacturado: 852.0,
        totalValorBonificacion: 48.0,
        totalValorDevuelto: 0.0,
      },
      firmas: {
        chofer: { firmado: true, nombre: 'MAURICIO VARGAS PEÑARANDA', ci: '7201948 CB' },
        almacen: { firmado: true, nombre: 'SILVIA GUTIÉRREZ', cargo: 'Supervisora Liquidadora Rampa' },
      },
    },

    cobranza: {
      fecha: '2026-02-12',
      fechaFormatted: '12/2/2026',
      choferNombre: 'MAURICIO VARGAS PEÑARANDA',
      choferEmpresa: 'IVSA',
      usuarioLiquidador: 'SILVIA.GUTIERREZ03',
      placaCamion: '3819 XDF HINO 300',
      tipoCamion: 'HINO 300',
      numeroDespacho: '525420005',
      resumenFinanciero: {
        importeFacturado: 852.0,
        importeBonificado: 48.0,
        importeEntregado: 900.0,
        importeDevuelto: 0.0,
        valorDespacho: 900.0,
      },
      resumenCobranzas: {
        efectivo: 500.0,
        transferencia: 252.0,
        qr: 100.0,
        cheque: 0.0,
        cobranzaChofer: 852.0,
        credito: 0.0,
        cobranzaCobrador: 0.0,
        totalARendir: 852.0,
      },
      pedidos: {
        despacho: 18,
        facturado: 18,
        devuelto: 0,
      },
      creditos: [],
      depositosEfectivo: [],
      cortesBs: [
        { denominacion: 'Bs 50,00', valorUnitario: 50.0, tipo: 'BILLETE', cantidad: 6, monto: 300.0 },
        { denominacion: 'Bs 100,00', valorUnitario: 100.0, tipo: 'BILLETE', cantidad: 2, monto: 200.0 },
      ],
      transferencias: [
        {
          transaccion: '993000501',
          banco: 'BCP',
          clienteCodigo: '1030999',
          clienteNombre: 'Supermercado Plan 3000',
          monto: 252.0,
          estado: 'Contado/Facturado/Cobrado - Transferencia',
        },
      ],
      pagosQr: [
        {
          transaccion: '993000502',
          banco: 'BISA',
          clienteCodigo: '1030888',
          clienteNombre: 'Minimarket El Carmen',
          monto: 100.0,
          estado: 'Contado/Facturado/Cobrado - QR',
        },
      ],
      cheques: [],
      cobranzaCobrador: [],
      devolucionesNoCobradas: [],
      firmas: {
        chofer: { firmado: true, nombre: 'MAURICIO VARGAS PEÑARANDA', cargo: 'Chofer Repartidor' },
        supervisor: { firmado: true, nombre: 'Ing. Roberto Flores T.', cargo: 'Supervisor de Rampa' },
        cajero: { firmado: true, nombre: 'Lic. Laura Mendoza', cargo: 'Cajera Central de Liquidación' },
        administrador: { firmado: true, nombre: 'Lic. Sergio Daza', cargo: 'Jefe de Administración y Finanzas' },
      },
    },
  },
  {
    id: 'cierre-525420010',
    transportOrderId: 525420010,
    orderCode: '525420010',
    dateFormatted: '15/02/2026',
    dateIso: '2026-02-15',
    routeName: 'Ruta 103 - Abasto y Los Pozos (Carga Completa 50 SKUs)',
    distributorName: 'Distribuidora Central Santa Cruz - Grupo Venado',
    truckPlate: '4284 IYB',
    truckCode: 'CAM-04',
    truckType: 'HINO FRIO 3.5 Tn',
    driverName: 'JAVIER QUISPE COLQUE',
    driverEmpresa: 'IVSA',
    driverCi: '4193820 SC',
    supervisorName: 'Ing. Roberto Flores T.',
    status: 'LIQUIDATED',
    statusLabel: 'Liquidado Conforme (50 Productos)',

    almacen: {
      fecha: '2026-02-15',
      fechaFormatted: '15/2/2026',
      choferNombre: 'JAVIER QUISPE COLQUE',
      choferEmpresa: 'IVSA',
      usuarioLiquidador: 'CARLOS.ROJAS01',
      placaCamion: '4284 IYB HINO FRIO',
      tipoCamion: 'HINO FRIO',
      numeroDespacho: '525420010',
      items: [
        { codigo: '600192', producto: 'B. REFRESCANTE CHICHA CAMBA DE 2 L NP', um: 'BOT', cantidadDespacho: 30, cantidadFacturado: 26, cantidadBonificacion: 2, facturadoTotal: 28, cantidadDevuelto: 2, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 360.0, valorFacturado: 312.0, valorBonificacion: 24.0, valorDevuelto: 24.0 },
        { codigo: '600190', producto: 'B. REFRESCANTE MOCOCHINCHI DE 2 L NP', um: 'BOT', cantidadDespacho: 25, cantidadFacturado: 23, cantidadBonificacion: 2, facturadoTotal: 25, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 300.0, valorFacturado: 276.0, valorBonificacion: 24.0, valorDevuelto: 0.0 },
        { codigo: '600115', producto: 'REFRESCO FRUSSION DURAZNO 3 L', um: 'BOT', cantidadDespacho: 20, cantidadFacturado: 18, cantidadBonificacion: 2, facturadoTotal: 20, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 240.0, valorFacturado: 216.0, valorBonificacion: 24.0, valorDevuelto: 0.0 },
        { codigo: '600116', producto: 'REFRESCO FRUSSION MANZANA 3 L', um: 'BOT', cantidadDespacho: 20, cantidadFacturado: 17, cantidadBonificacion: 2, facturadoTotal: 19, cantidadDevuelto: 1, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 240.0, valorFacturado: 204.0, valorBonificacion: 24.0, valorDevuelto: 12.0 },
        { codigo: '600117', producto: 'REFRESCO FRUSSION CITRUS 3 L', um: 'BOT', cantidadDespacho: 15, cantidadFacturado: 14, cantidadBonificacion: 1, facturadoTotal: 15, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 180.0, valorFacturado: 168.0, valorBonificacion: 12.0, valorDevuelto: 0.0 },
        { codigo: '600207', producto: 'RAPTOR ANALCOHOLICO DE 350 ML', um: 'BOT', cantidadDespacho: 120, cantidadFacturado: 110, cantidadBonificacion: 6, facturadoTotal: 116, cantidadDevuelto: 4, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 459.6, valorFacturado: 421.3, valorBonificacion: 22.98, valorDevuelto: 15.32 },
        { codigo: '600208', producto: 'RAPTOR ENERGY DRINK 500 ML', um: 'LATA', cantidadDespacho: 60, cantidadFacturado: 55, cantidadBonificacion: 5, facturadoTotal: 60, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 390.0, valorFacturado: 357.5, valorBonificacion: 32.5, valorDevuelto: 0.0 },
        { codigo: '600204', producto: 'BEBIDA DE LA GRANJA NARANJA 300ML', um: 'BOT', cantidadDespacho: 40, cantidadFacturado: 36, cantidadBonificacion: 4, facturadoTotal: 40, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 200.0, valorFacturado: 180.0, valorBonificacion: 20.0, valorDevuelto: 0.0 },
        { codigo: '600205', producto: 'BEBIDA DE LA GRANJA NARANJA 2000 ML', um: 'BOT', cantidadDespacho: 25, cantidadFacturado: 22, cantidadBonificacion: 2, facturadoTotal: 24, cantidadDevuelto: 1, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 462.5, valorFacturado: 407.0, valorBonificacion: 37.0, valorDevuelto: 18.5 },
        { codigo: '600206', producto: 'BEBIDA DE LA GRANJA MANZANA 2000 ML', um: 'BOT', cantidadDespacho: 25, cantidadFacturado: 24, cantidadBonificacion: 1, facturadoTotal: 25, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 462.5, valorFacturado: 444.0, valorBonificacion: 18.5, valorDevuelto: 0.0 },
        { codigo: 'KRI-MAY-100', producto: 'Mayonesa Kris Doypack 100g', um: 'DOY', cantidadDespacho: 150, cantidadFacturado: 140, cantidadBonificacion: 10, facturadoTotal: 150, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 525.0, valorFacturado: 490.0, valorBonificacion: 35.0, valorDevuelto: 0.0 },
        { codigo: 'KRI-MAY-250', producto: 'Mayonesa Kris Doypack 250g', um: 'DOY', cantidadDespacho: 120, cantidadFacturado: 110, cantidadBonificacion: 8, facturadoTotal: 118, cantidadDevuelto: 2, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 840.0, valorFacturado: 770.0, valorBonificacion: 56.0, valorDevuelto: 14.0 },
        { codigo: 'KRI-MAY-500', producto: 'Mayonesa Kris Doypack 500g', um: 'DOY', cantidadDespacho: 80, cantidadFacturado: 72, cantidadBonificacion: 5, facturadoTotal: 77, cantidadDevuelto: 3, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 960.0, valorFacturado: 864.0, valorBonificacion: 60.0, valorDevuelto: 36.0 },
        { codigo: 'KRI-MAY-1000', producto: 'Mayonesa Kris Doypack 1000g', um: 'DOY', cantidadDespacho: 40, cantidadFacturado: 38, cantidadBonificacion: 2, facturadoTotal: 40, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 860.0, valorFacturado: 817.0, valorBonificacion: 43.0, valorDevuelto: 0.0 },
        { codigo: 'KRI-MAY-POM', producto: 'Mayonesa Kris Pomo 400g', um: 'POM', cantidadDespacho: 30, cantidadFacturado: 28, cantidadBonificacion: 2, facturadoTotal: 30, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 405.0, valorFacturado: 378.0, valorBonificacion: 27.0, valorDevuelto: 0.0 },
        { codigo: 'KRI-KET-100', producto: 'Kétchup Kris Doypack 100g', um: 'DOY', cantidadDespacho: 120, cantidadFacturado: 112, cantidadBonificacion: 8, facturadoTotal: 120, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 384.0, valorFacturado: 358.4, valorBonificacion: 25.6, valorDevuelto: 0.0 },
        { codigo: 'KRI-KET-250', producto: 'Kétchup Kris Doypack 250g', um: 'DOY', cantidadDespacho: 90, cantidadFacturado: 84, cantidadBonificacion: 6, facturadoTotal: 90, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 585.0, valorFacturado: 546.0, valorBonificacion: 39.0, valorDevuelto: 0.0 },
        { codigo: 'KRI-KET-500', producto: 'Kétchup Kris Doypack 500g', um: 'DOY', cantidadDespacho: 70, cantidadFacturado: 64, cantidadBonificacion: 4, facturadoTotal: 68, cantidadDevuelto: 2, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 805.0, valorFacturado: 736.0, valorBonificacion: 46.0, valorDevuelto: 23.0 },
        { codigo: 'KRI-KET-1000', producto: 'Kétchup Kris Doypack 1000g', um: 'DOY', cantidadDespacho: 30, cantidadFacturado: 29, cantidadBonificacion: 1, facturadoTotal: 30, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 600.0, valorFacturado: 580.0, valorBonificacion: 20.0, valorDevuelto: 0.0 },
        { codigo: 'KRI-MOS-100', producto: 'Mostaza Kris Doypack 100g', um: 'DOY', cantidadDespacho: 80, cantidadFacturado: 75, cantidadBonificacion: 5, facturadoTotal: 80, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 240.0, valorFacturado: 225.0, valorBonificacion: 15.0, valorDevuelto: 0.0 },
        { codigo: 'KRI-MOS-250', producto: 'Mostaza Kris Pomo 250g', um: 'POM', cantidadDespacho: 60, cantidadFacturado: 56, cantidadBonificacion: 4, facturadoTotal: 60, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 360.0, valorFacturado: 336.0, valorBonificacion: 24.0, valorDevuelto: 0.0 },
        { codigo: 'KRI-MOS-500', producto: 'Mostaza Kris Doypack 500g', um: 'DOY', cantidadDespacho: 40, cantidadFacturado: 38, cantidadBonificacion: 2, facturadoTotal: 40, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 420.0, valorFacturado: 399.0, valorBonificacion: 21.0, valorDevuelto: 0.0 },
        { codigo: 'KRI-GOLF-250', producto: 'Salsa Golf Kris Doypack 250g', um: 'DOY', cantidadDespacho: 50, cantidadFacturado: 46, cantidadBonificacion: 4, facturadoTotal: 50, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 400.0, valorFacturado: 368.0, valorBonificacion: 32.0, valorDevuelto: 0.0 },
        { codigo: 'KRI-GOLF-500', producto: 'Salsa Golf Kris Doypack 500g', um: 'DOY', cantidadDespacho: 35, cantidadFacturado: 32, cantidadBonificacion: 2, facturadoTotal: 34, cantidadDevuelto: 1, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 490.0, valorFacturado: 448.0, valorBonificacion: 28.0, valorDevuelto: 14.0 },
        { codigo: 'KRI-SOJ-150', producto: 'Salsa de Soya Kris 150ml', um: 'BOT', cantidadDespacho: 60, cantidadFacturado: 56, cantidadBonificacion: 4, facturadoTotal: 60, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 270.0, valorFacturado: 252.0, valorBonificacion: 18.0, valorDevuelto: 0.0 },
        { codigo: 'KRI-SOJ-500', producto: 'Salsa de Soya Kris 500ml', um: 'BOT', cantidadDespacho: 40, cantidadFacturado: 38, cantidadBonificacion: 2, facturadoTotal: 40, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 360.0, valorFacturado: 342.0, valorBonificacion: 18.0, valorDevuelto: 0.0 },
        { codigo: 'KRI-ING-150', producto: 'Salsa Inglesa Kris 150ml', um: 'BOT', cantidadDespacho: 30, cantidadFacturado: 28, cantidadBonificacion: 2, facturadoTotal: 30, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 165.0, valorFacturado: 154.0, valorBonificacion: 11.0, valorDevuelto: 0.0 },
        { codigo: 'KRI-VIN-BLA', producto: 'Vinagre Blanco Kris 500ml', um: 'BOT', cantidadDespacho: 50, cantidadFacturado: 47, cantidadBonificacion: 3, facturadoTotal: 50, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 200.0, valorFacturado: 188.0, valorBonificacion: 12.0, valorDevuelto: 0.0 },
        { codigo: 'KRI-VIN-TIN', producto: 'Vinagre Tinto Kris 500ml', um: 'BOT', cantidadDespacho: 30, cantidadFacturado: 28, cantidadBonificacion: 2, facturadoTotal: 30, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 120.0, valorFacturado: 112.0, valorBonificacion: 8.0, valorDevuelto: 0.0 },
        { codigo: 'KRI-GEL-FRU', producto: 'Gelatina Kris Frutilla 85g', um: 'SOB', cantidadDespacho: 100, cantidadFacturado: 92, cantidadBonificacion: 8, facturadoTotal: 100, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 280.0, valorFacturado: 257.6, valorBonificacion: 22.4, valorDevuelto: 0.0 },
        { codigo: 'KRI-GEL-LIM', producto: 'Gelatina Kris Limón 85g', um: 'SOB', cantidadDespacho: 80, cantidadFacturado: 74, cantidadBonificacion: 6, facturadoTotal: 80, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 224.0, valorFacturado: 207.2, valorBonificacion: 16.8, valorDevuelto: 0.0 },
        { codigo: 'KRI-GEL-NAR', producto: 'Gelatina Kris Naranja 85g', um: 'SOB', cantidadDespacho: 80, cantidadFacturado: 75, cantidadBonificacion: 5, facturadoTotal: 80, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 224.0, valorFacturado: 210.0, valorBonificacion: 14.0, valorDevuelto: 0.0 },
        { codigo: 'KRI-GEL-PI', producto: 'Gelatina Kris Piña 85g', um: 'SOB', cantidadDespacho: 70, cantidadFacturado: 65, cantidadBonificacion: 5, facturadoTotal: 70, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 196.0, valorFacturado: 182.0, valorBonificacion: 14.0, valorDevuelto: 0.0 },
        { codigo: 'KRI-GEL-UVA', producto: 'Gelatina Kris Uva 85g', um: 'SOB', cantidadDespacho: 60, cantidadFacturado: 56, cantidadBonificacion: 4, facturadoTotal: 60, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 168.0, valorFacturado: 156.8, valorBonificacion: 11.2, valorDevuelto: 0.0 },
        { codigo: 'KRI-PUD-CHO', producto: 'Pudín Kris Chocolate 100g', um: 'SOB', cantidadDespacho: 50, cantidadFacturado: 46, cantidadBonificacion: 4, facturadoTotal: 50, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 175.0, valorFacturado: 161.0, valorBonificacion: 14.0, valorDevuelto: 0.0 },
        { codigo: 'KRI-PUD-VAI', producto: 'Pudín Kris Vainilla 100g', um: 'SOB', cantidadDespacho: 40, cantidadFacturado: 37, cantidadBonificacion: 3, facturadoTotal: 40, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 140.0, valorFacturado: 129.5, valorBonificacion: 10.5, valorDevuelto: 0.0 },
        { codigo: 'KRI-FLA-CAR', producto: 'Flan Kris Caramelo 100g', um: 'SOB', cantidadDespacho: 50, cantidadFacturado: 46, cantidadBonificacion: 4, facturadoTotal: 50, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 175.0, valorFacturado: 161.0, valorBonificacion: 14.0, valorDevuelto: 0.0 },
        { codigo: 'FID-COR-400', producto: 'Fideos Coronilla Tallarín 400g', um: 'PAQ', cantidadDespacho: 120, cantidadFacturado: 112, cantidadBonificacion: 8, facturadoTotal: 120, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 504.0, valorFacturado: 470.4, valorBonificacion: 33.6, valorDevuelto: 0.0 },
        { codigo: 'FID-COR-ESP', producto: 'Fideos Coronilla Espagueti 400g', um: 'PAQ', cantidadDespacho: 120, cantidadFacturado: 110, cantidadBonificacion: 8, facturadoTotal: 118, cantidadDevuelto: 2, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 504.0, valorFacturado: 462.0, valorBonificacion: 33.6, valorDevuelto: 8.4 },
        { codigo: 'FID-COR-COD', producto: 'Fideos Coronilla Codito 400g', um: 'PAQ', cantidadDespacho: 90, cantidadFacturado: 84, cantidadBonificacion: 6, facturadoTotal: 90, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 378.0, valorFacturado: 352.8, valorBonificacion: 25.2, valorDevuelto: 0.0 },
        { codigo: 'FID-COR-PLU', producto: 'Fideos Coronilla Plumita 400g', um: 'PAQ', cantidadDespacho: 80, cantidadFacturado: 74, cantidadBonificacion: 6, facturadoTotal: 80, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 336.0, valorFacturado: 310.8, valorBonificacion: 25.2, valorDevuelto: 0.0 },
        { codigo: 'CER-CHO-300', producto: 'Cereal Kris Choco Flakes 300g', um: 'CAJ', cantidadDespacho: 40, cantidadFacturado: 37, cantidadBonificacion: 3, facturadoTotal: 40, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 580.0, valorFacturado: 536.5, valorBonificacion: 43.5, valorDevuelto: 0.0 },
        { codigo: 'CER-MAI-300', producto: 'Cereal Kris Corn Flakes 300g', um: 'CAJ', cantidadDespacho: 40, cantidadFacturado: 38, cantidadBonificacion: 2, facturadoTotal: 40, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 540.0, valorFacturado: 513.0, valorBonificacion: 27.0, valorDevuelto: 0.0 },
        { codigo: 'CER-AZU-300', producto: 'Cereal Kris Azucarado 300g', um: 'CAJ', cantidadDespacho: 35, cantidadFacturado: 33, cantidadBonificacion: 2, facturadoTotal: 35, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 490.0, valorFacturado: 462.0, valorBonificacion: 28.0, valorDevuelto: 0.0 },
        { codigo: 'AVN-KRI-500', producto: 'Avena Kris Instantánea 500g', um: 'BOL', cantidadDespacho: 60, cantidadFacturado: 56, cantidadBonificacion: 4, facturadoTotal: 60, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 510.0, valorFacturado: 476.0, valorBonificacion: 34.0, valorDevuelto: 0.0 },
        { codigo: 'TE-BRIST-100', producto: 'Té Bristol Clásico 100 saquitos', um: 'CAJ', cantidadDespacho: 50, cantidadFacturado: 46, cantidadBonificacion: 4, facturadoTotal: 50, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 800.0, valorFacturado: 736.0, valorBonificacion: 64.0, valorDevuelto: 0.0 },
        { codigo: 'TE-BRIST-CAN', producto: 'Té Bristol Canela y Clavo 50s', um: 'CAJ', cantidadDespacho: 40, cantidadFacturado: 38, cantidadBonificacion: 2, facturadoTotal: 40, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 400.0, valorFacturado: 380.0, valorBonificacion: 20.0, valorDevuelto: 0.0 },
        { codigo: 'MAT-YER-500', producto: 'Mate de Hierbas 50s', um: 'CAJ', cantidadDespacho: 35, cantidadFacturado: 33, cantidadBonificacion: 2, facturadoTotal: 35, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 385.0, valorFacturado: 363.0, valorBonificacion: 22.0, valorDevuelto: 0.0 },
        { codigo: 'DET-LIMP-1K', producto: 'Limpiador Multiuso Líquido 1L', um: 'BOT', cantidadDespacho: 45, cantidadFacturado: 41, cantidadBonificacion: 3, facturadoTotal: 44, cantidadDevuelto: 1, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 540.0, valorFacturado: 492.0, valorBonificacion: 36.0, valorDevuelto: 12.0 },
        { codigo: 'JAB-LIQ-500', producto: 'Jabón Líquido Antibacterial 500ml', um: 'BOT', cantidadDespacho: 50, cantidadFacturado: 47, cantidadBonificacion: 3, facturadoTotal: 50, cantidadDevuelto: 0, cantidadFaltante: 0, cantidadSobrante: 0, valorDespacho: 650.0, valorFacturado: 611.0, valorBonificacion: 39.0, valorDevuelto: 0.0 },
      ],
      totales: {
        totalCantidadDespacho: 2985,
        totalCantidadFacturado: 2783,
        totalCantidadBonificacion: 184,
        totalFacturadoTotal: 2967,
        totalCantidadDevuelto: 18,
        totalCantidadFaltante: 0,
        totalCantidadSobrante: 0,
        totalValorDespacho: 20498.7,
        totalValorFacturado: 19088.1,
        totalValorBonificacion: 1280.98,
        totalValorDevuelto: 129.62,
      },
      firmas: {
        chofer: { firmado: true, nombre: 'JAVIER QUISPE COLQUE', ci: '4193820 SC' },
        almacen: { firmado: true, nombre: 'CARLOS ROJAS T.', cargo: 'Liquidador de Operaciones' },
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
        importeFacturado: 19088.1,
        importeBonificado: 1280.98,
        importeEntregado: 20369.08,
        importeDevuelto: 129.62,
        valorDespacho: 20498.7,
      },
      resumenCobranzas: {
        efectivo: 9500.0,
        transferencia: 5200.0,
        qr: 2888.1,
        cheque: 0.0,
        cobranzaChofer: 17588.1,
        credito: 1500.0,
        cobranzaCobrador: 0.0,
        totalARendir: 19088.1,
      },
      pedidos: {
        despacho: 65,
        facturado: 62,
        devuelto: 3,
      },
      creditos: [
        {
          clienteCodigo: '1102948',
          clienteNombre: 'Supermercado Fidalga - Equipetrol',
          factura: 'F-92014',
          monto: 1500.0,
          estado: 'Credito/Facturado/Entregado',
        },
      ],
      depositosEfectivo: [],
      cortesBs: [
        { denominacion: 'Bs 200,00', valorUnitario: 200.0, tipo: 'BILLETE', cantidad: 30, monto: 6000.0 },
        { denominacion: 'Bs 100,00', valorUnitario: 100.0, tipo: 'BILLETE', cantidad: 25, monto: 2500.0 },
        { denominacion: 'Bs 50,00', valorUnitario: 50.0, tipo: 'BILLETE', cantidad: 16, monto: 800.0 },
        { denominacion: 'Bs 20,00', valorUnitario: 20.0, tipo: 'BILLETE', cantidad: 10, monto: 200.0 },
      ],
      transferencias: [
        {
          transaccion: '99300101',
          banco: 'BCP',
          clienteCodigo: '1020888',
          clienteNombre: 'Hipermaxi Los Pozos',
          monto: 3200.0,
          estado: 'Contado/Facturado/Cobrado - Transferencia',
        },
        {
          transaccion: '99300102',
          banco: 'BISA',
          clienteCodigo: '1020999',
          clienteNombre: 'Comercial La Ramada',
          monto: 2000.0,
          estado: 'Contado/Facturado/Cobrado - Transferencia',
        },
      ],
      pagosQr: [
        {
          transaccion: '99300201',
          banco: 'BISA',
          clienteCodigo: '1020777',
          clienteNombre: 'Minimarket El Carmen',
          monto: 2888.1,
          estado: 'Contado/Facturado/Cobrado - QR',
        },
      ],
      cheques: [],
      cobranzaCobrador: [],
      devolucionesNoCobradas: [
        {
          clienteCodigo: '1020111',
          clienteNombre: 'Snack Doña Rosa',
          factura: 'F-92040',
          monto: 129.62,
          motivo: 'Falta de espacio en almacén cliente',
          estado: 'Visitado o Facturado/Sin Entregar - Sin Cobrar',
        },
      ],
      firmas: {
        chofer: { firmado: true, nombre: 'JAVIER QUISPE COLQUE', cargo: 'Chofer Repartidor (IVSA)' },
        supervisor: { firmado: true, nombre: 'Ing. Roberto Flores T.', cargo: 'Supervisor de Rampa' },
        cajero: { firmado: true, nombre: 'Lic. Laura Mendoza', cargo: 'Cajera Central de Liquidación' },
        administrador: { firmado: true, nombre: 'Lic. Sergio Daza', cargo: 'Jefe de Administración' },
      },
    },
  },
  {
    id: 'cierre-ORD-2026-0820',
    transportOrderId: 1002,
    orderCode: 'ORD-2026-0820',
    dateFormatted: '20/08/2026',
    dateIso: '2026-08-20',
    routeName: 'Ruta 201 - Zona Industrial y Equipetrol',
    distributorName: 'Distribuidora Central Santa Cruz - Grupo Venado',
    truckPlate: '2940 KLP',
    truckCode: 'CAM-05',
    truckType: 'HINO 500 6.5 Tn',
    driverName: 'FERNANDO RÍOS CALLE',
    driverEmpresa: 'VENADO LOGÍSTICA',
    driverCi: '3910284 LP',
    supervisorName: 'Ing. Marco Antonio Vaca',
    status: 'OBSERVED',
    statusLabel: 'Observado por Cuadre',

    almacen: {
      fecha: '2026-08-20',
      fechaFormatted: '20/8/2026',
      choferNombre: 'FERNANDO RÍOS CALLE',
      choferEmpresa: 'VENADO LOGÍSTICA',
      usuarioLiquidador: 'RODRIGO.FLORES08',
      placaCamion: '2940 KLP HINO 500',
      tipoCamion: 'HINO 500',
      numeroDespacho: 'ORD-2026-0820',
      items: [
        {
          codigo: 'KRI-MAY-500',
          producto: 'Mayonesa Kris Doypack 500g',
          um: 'DOY',
          cantidadDespacho: 100,
          cantidadFacturado: 90,
          cantidadBonificacion: 5,
          facturadoTotal: 95,
          cantidadDevuelto: 3,
          cantidadFaltante: 2,
          cantidadSobrante: 0,
          valorDespacho: 1200.0,
          valorFacturado: 1080.0,
          valorBonificacion: 60.0,
          valorDevuelto: 36.0,
        },
      ],
      totales: {
        totalCantidadDespacho: 100,
        totalCantidadFacturado: 90,
        totalCantidadBonificacion: 5,
        totalFacturadoTotal: 95,
        totalCantidadDevuelto: 3,
        totalCantidadFaltante: 2,
        totalCantidadSobrante: 0,
        totalValorDespacho: 1200.0,
        totalValorFacturado: 1080.0,
        totalValorBonificacion: 60.0,
        totalValorDevuelto: 36.0,
      },
      firmas: {
        chofer: { firmado: true, nombre: 'FERNANDO RÍOS CALLE', ci: '3910284 LP' },
        almacen: { firmado: true, nombre: 'RODRIGO FLORES TAPIA', cargo: 'Supervisor Liquidador Rampa' },
      },
    },

    cobranza: {
      fecha: '2026-08-20',
      fechaFormatted: '20/8/2026',
      choferNombre: 'FERNANDO RÍOS CALLE',
      choferEmpresa: 'VENADO LOGÍSTICA',
      usuarioLiquidador: 'RODRIGO.FLORES08',
      placaCamion: '2940 KLP HINO 500',
      tipoCamion: 'HINO 500',
      numeroDespacho: 'ORD-2026-0820',
      resumenFinanciero: {
        importeFacturado: 1080.0,
        importeBonificado: 60.0,
        importeEntregado: 1140.0,
        importeDevuelto: 36.0,
        valorDespacho: 1200.0,
      },
      resumenCobranzas: {
        efectivo: 600.0,
        transferencia: 380.0,
        qr: 100.0,
        cheque: 0.0,
        cobranzaChofer: 1080.0,
        credito: 0.0,
        cobranzaCobrador: 0.0,
        totalARendir: 1080.0,
      },
      pedidos: {
        despacho: 20,
        facturado: 19,
        devuelto: 1,
      },
      creditos: [],
      depositosEfectivo: [],
      cortesBs: [
        { denominacion: 'Bs 100,00', valorUnitario: 100.0, tipo: 'BILLETE', cantidad: 6, monto: 600.0 },
      ],
      transferencias: [
        {
          transaccion: '994000101',
          banco: 'BCP',
          clienteCodigo: '1040501',
          clienteNombre: 'Comercial La Florida',
          monto: 380.0,
          estado: 'Contado/Facturado/Cobrado - Transferencia',
        },
      ],
      pagosQr: [
        {
          transaccion: '994000102',
          banco: 'BISA',
          clienteCodigo: '1040502',
          clienteNombre: 'Supermercado Central',
          monto: 100.0,
          estado: 'Contado/Facturado/Cobrado - QR',
        },
      ],
      cheques: [],
      cobranzaCobrador: [],
      devolucionesNoCobradas: [
        {
          clienteCodigo: '1040503',
          clienteNombre: 'Abarrotes Don Pepe',
          factura: 'F-90210',
          monto: 36.0,
          motivo: 'Faltante de 2 unidades verificado en rampa',
          estado: 'Visitado o Facturado/Sin Entregar - Sin Cobrar',
        },
      ],
      firmas: {
        chofer: { firmado: true, nombre: 'FERNANDO RÍOS CALLE', cargo: 'Chofer Repartidor' },
        supervisor: { firmado: true, nombre: 'Ing. Marco Antonio Vaca', cargo: 'Supervisor de Rampa y Rutas' },
        cajero: { firmado: true, nombre: 'Lic. Laura Mendoza', cargo: 'Cajera Central de Liquidación' },
        administrador: { firmado: false, nombre: 'Pendiente Admin', cargo: 'Jefe de Administración' },
      },
    },
  },
]

