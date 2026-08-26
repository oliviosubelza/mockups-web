// Dataset estructurado para el Historial de Revisiones y Sesiones de Conteo.
// Cumple estrictamente con el modelo de base de datos db_script.sql:
// - transport_orders
// - transport_order_count_sessions (DRIVER_INITIAL, SUPERVISOR_DISCREPANCY, SUPERVISOR_SEMAPHORE)
// - transport_order_count_session_items
// - truck_inventories

export type SessionType = 'DRIVER_INITIAL' | 'SUPERVISOR_DISCREPANCY' | 'SUPERVISOR_SEMAPHORE'
export type SessionStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NOT_REQUIRED'
export type ExecutorRole = 'DRIVER' | 'SUPERVISOR'
export type ItemCountStatus = 'MATCH' | 'MISMATCH' | 'SKIPPED' | 'APPROVED' | 'NOT_COUNTED'
export type SupervisorReviewScope = 'PARTIAL' | 'FULL' | 'NONE'

export interface ItemSesionConteo {
  productId: number
  code: string
  description: string
  category: string
  isColdChain: boolean
  equivalenceBoxUnit: number
  unitName: string

  // Foto de referencia oficial congelada al iniciar la sesión
  expectedQty: number
  expectedBoxes: number
  expectedUnits: number

  // 1. Conteo Inicial por Chofer (DRIVER_INITIAL)
  driverCount: {
    countedBoxes: number
    countedUnits: number
    countedQty: number
    varianceQty: number
    status: ItemCountStatus
    observation?: string
  }

  // 2. Revisión por Supervisor (SUPERVISOR_DISCREPANCY)
  supervisorReview?: {
    wasReviewed: boolean // true si se revisó en modo parcial o total
    countedBoxes?: number
    countedUnits?: number
    countedQty?: number
    varianceQty?: number
    status: ItemCountStatus
    observation?: string
    approved: boolean
  }

  // 3. Auditoría Semáforo (SUPERVISOR_SEMAPHORE - Muestreo aleatorio/ciego)
  semaphoreAudit?: {
    wasAudited: boolean
    countedBoxes?: number
    countedUnits?: number
    countedQty?: number
    varianceQty?: number
    status: ItemCountStatus
    observation?: string
  }

  // Inventario Oficial Final en Camión (truck_inventories)
  officialInventory: {
    loadedQty: number
    loadedBoxes: number
    loadedUnits: number
    varianceQty: number
    status: 'MATCH' | 'MISMATCH' | 'APPROVED' | 'PENDING'
    verifiedSupervisorName?: string
  }
}

export interface SesionConteoInfo {
  id: number
  sessionType: SessionType
  sessionTypeLabel: string
  status: SessionStatus
  statusLabel: string
  executorId: number
  executorName: string
  executorRole: ExecutorRole
  startedAt: string
  completedAt?: string
  durationMinutes?: number
  notes?: string
  reviewScope?: SupervisorReviewScope
  totalItems: number
  matchItems: number
  mismatchItems: number
  skippedItems?: number
}

export interface OrdenRevisionHistorial {
  id: string
  transportOrderId: number
  orderCode: string
  distributorName: string
  departureDate: string
  completedDate: string
  dateFormatted: string
  dateIso: string // YYYY-MM-DD para filtrado
  routeName: string
  status: 'COMPLETED' | 'CHECKED_OK' | 'DISCREPANCY' | 'ENROUTE'
  statusLabel: string

  truck: {
    id: number
    plate: string
    code: string
    truckType: string
    isRefrigerated: boolean
  }

  driver: {
    id: number
    name: string
    phone: string
    document: string
  }

  supervisor?: {
    id: number
    name: string
  }

  // Resumen de auditoría
  summary: {
    totalProducts: number
    coldChainProductCount: number
    hasDiscrepancies: boolean
    driverStatus: 'MATCH' | 'DISCREPANCY'
    supervisorReviewScope: SupervisorReviewScope
    supervisorReviewed: boolean
    semaphoreAudited: boolean
    finalMatchRate: number // Porcentaje 0 - 100%
    totalNetVarianceUnits: number
  }

  // Sesiones de conteo registradas (Línea de tiempo)
  sessions: SesionConteoInfo[]

  // Matriz comparativa multi-sesión por producto
  items: ItemSesionConteo[]
}

// ── CATÁLOGO REAL DE PRODUCTOS DE GRUPO VENADO (venado-productos.md) ──
export const VENADO_CATALOG = [
  { id: 101, code: 'KRI-MAY-500', description: 'Mayonesa Kris Doypack 500g', category: 'Salsas y Culinarios', isColdChain: false, equivalenceBoxUnit: 24, unitName: 'Doypacks' },
  { id: 102, code: 'KRI-KET-500', description: 'Ketchup Kris Doypack 500g', category: 'Salsas y Culinarios', isColdChain: false, equivalenceBoxUnit: 24, unitName: 'Doypacks' },
  { id: 103, code: 'KRI-MOS-250', description: 'Mostaza Kris Pomo 250g', category: 'Salsas y Culinarios', isColdChain: false, equivalenceBoxUnit: 24, unitName: 'Pomos' },
  { id: 104, code: 'KRI-GOL-500', description: 'Salsa Golf Kris Doypack 500g', category: 'Salsas y Culinarios', isColdChain: false, equivalenceBoxUnit: 24, unitName: 'Doypacks' },
  { id: 105, code: 'KRI-BBQ-400', description: 'Salsa Barbacoa Kris Pomo 400g', category: 'Salsas y Culinarios', isColdChain: false, equivalenceBoxUnit: 12, unitName: 'Pomos' },
  { id: 106, code: 'KRI-LLA-200', description: 'Llajua con Quirquiña Kris 200g', category: 'Culinarios Kris', isColdChain: false, equivalenceBoxUnit: 24, unitName: 'Doypacks' },
  { id: 107, code: 'KRI-EXT-200', description: 'Extracto de Tomate Kris 200g', category: 'Culinarios Kris', isColdChain: false, equivalenceBoxUnit: 24, unitName: 'Doypacks' },
  { id: 108, code: 'KRI-KAO-400', description: 'Achocolatado Kriskao Doypack 400g', category: 'Cereales y Polvos', isColdChain: false, equivalenceBoxUnit: 12, unitName: 'Doypacks' },
  { id: 109, code: 'KRI-GEL-FRU', description: 'Gelatina Kris Sabor Frutilla 100g', category: 'Postres Kris', isColdChain: false, equivalenceBoxUnit: 48, unitName: 'Bolsas' },
  { id: 110, code: 'KRI-GEL-FRA', description: 'Gelatina Kris Sabor Frambuesa 100g', category: 'Postres Kris', isColdChain: false, equivalenceBoxUnit: 48, unitName: 'Bolsas' },
  { id: 111, code: 'KRI-GEL-PIN', description: 'Gelatina Kris Sabor Piña 100g', category: 'Postres Kris', isColdChain: false, equivalenceBoxUnit: 48, unitName: 'Bolsas' },
  { id: 112, code: 'KRI-FLA-VAI', description: 'Flan Kris Sabor Vainilla 100g', category: 'Postres Kris', isColdChain: false, equivalenceBoxUnit: 24, unitName: 'Cajas' },
  { id: 113, code: 'KRI-PUD-CHO', description: 'Pudín Kris Sabor Chocolate 100g', category: 'Postres Kris', isColdChain: false, equivalenceBoxUnit: 24, unitName: 'Cajas' },
  { id: 114, code: 'KRI-REF-NAR', description: 'Refresco en Polvo Kris Naranja 30g', category: 'Bebidas en Polvo', isColdChain: false, equivalenceBoxUnit: 50, unitName: 'Sobres' },
  { id: 115, code: 'KRI-REF-CHI', description: 'Refresco en Polvo Kris Chicha Morada', category: 'Bebidas en Polvo', isColdChain: false, equivalenceBoxUnit: 50, unitName: 'Sobres' },
  { id: 116, code: 'KRI-REF-MOC', description: 'Refresco en Polvo Kris Mocochinchi', category: 'Bebidas en Polvo', isColdChain: false, equivalenceBoxUnit: 50, unitName: 'Sobres' },
  { id: 117, code: 'SPE-AGU-500', description: 'Agua Purificada Speranza 500ml', category: 'Bebidas Speranza', isColdChain: false, equivalenceBoxUnit: 24, unitName: 'Botellas' },
  { id: 118, code: 'TOL-LAC-CHO', description: 'Bebida Láctea Tolón Chocolatada 1L', category: 'Lácteos Tolón', isColdChain: true, equivalenceBoxUnit: 12, unitName: 'Tetra' },
  { id: 119, code: 'TOL-YOG-FRU', description: 'Yogurt Bebible Tolón Frutilla 1L', category: 'Lácteos Tolón', isColdChain: true, equivalenceBoxUnit: 12, unitName: 'Botellas' },
  { id: 120, code: 'KRI-POL-HOR', description: 'Polvo para Hornear Kris Lata 250g', category: 'Panificación', isColdChain: false, equivalenceBoxUnit: 12, unitName: 'Latas' },
  { id: 121, code: 'KRI-SOP-FID', description: 'Sopa de Pollo con Fideos Criollo 75g', category: 'Sopas y Caldos', isColdChain: false, equivalenceBoxUnit: 30, unitName: 'Sobres' },
  { id: 122, code: 'KRI-CAL-GAL', description: 'Caldo en Cubos Gallina Kris x12', category: 'Sopas y Caldos', isColdChain: false, equivalenceBoxUnit: 24, unitName: 'Cajas' },
]

const DRIVERS = [
  { id: 101, name: 'Carlos Mendoza Vargas', phone: '+591 76543210', document: '5498214 SC' },
  { id: 102, name: 'Jorge Luis Torrez', phone: '+591 78912345', document: '6743921 SC' },
  { id: 103, name: 'Mario Hugo Céspedes', phone: '+591 71234567', document: '4982103 SC' },
  { id: 104, name: 'Roberto Gómez Flores', phone: '+591 75678901', document: '5120934 SC' },
  { id: 105, name: 'Raúl Ernesto Salazar', phone: '+591 73456789', document: '6219845 SC' },
  { id: 106, name: 'David Fernando Morales', phone: '+591 79012345', document: '5876543 SC' },
]

const TRUCKS = [
  { id: 12, plate: '3012-ABC', code: 'CAM-012', truckType: 'Camión Mediano 5T', isRefrigerated: true },
  { id: 18, plate: '4198-XYZ', code: 'CAM-018', truckType: 'Furgón Seco 3.5T', isRefrigerated: false },
  { id: 24, plate: '5230-KLM', code: 'CAM-024', truckType: 'Camión Pesado 10T', isRefrigerated: true },
  { id: 9, plate: '1845-PTQ', code: 'CAM-009', truckType: 'Camioneta 1.5T', isRefrigerated: false },
  { id: 15, plate: '2764-BTR', code: 'CAM-015', truckType: 'Furgón Refrigerado 4T', isRefrigerated: true },
  { id: 31, plate: '3890-LMN', code: 'CAM-031', truckType: 'Camión Mediano 6T', isRefrigerated: false },
]

const ROUTES = [
  'Ruta 01 - Centro / Equipetrol',
  'Ruta 02 - Warnes / Montero',
  'Ruta 03 - Pampa de la Isla',
  'Ruta 04 - Doble Vía La Guardia',
  'Ruta Express - Supermercados Fidalga/Hipermaxi',
  'Ruta Mayorista - Mercado Abasto Sur',
]

const DATES = [
  { iso: '2026-08-25', formatted: '25/08/2026' },
  { iso: '2026-08-24', formatted: '24/08/2026' },
  { iso: '2026-08-23', formatted: '23/08/2026' },
  { iso: '2026-08-20', formatted: '20/08/2026' },
]

// Generador de órdenes con productos reales de Grupo Venado
function buildVenadoOrder(
  index: number,
  orderNumber: number,
  dateObj: { iso: string; formatted: string },
  truckIndex: number,
  driverIndex: number,
  routeIndex: number,
  scenario: 'PERFECT' | 'DISCREPANCY_PARTIAL' | 'DISCREPANCY_SEMAPHORE' | 'SEMAPHORE_OK'
): OrdenRevisionHistorial {
  const truck = TRUCKS[truckIndex % TRUCKS.length]
  const driver = DRIVERS[driverIndex % DRIVERS.length]
  const route = ROUTES[routeIndex % ROUTES.length]
  const orderCode = `OT-${orderNumber}`

  // Selección de 6 a 8 SKUs de Grupo Venado para esta orden
  const skusForOrder = [
    VENADO_CATALOG[0], // Mayonesa Kris 500g
    VENADO_CATALOG[1], // Ketchup Kris 500g
    VENADO_CATALOG[2], // Mostaza Kris 250g
    VENADO_CATALOG[5], // Llajua con Quirquiña Kris
    VENADO_CATALOG[7], // Kriskao 400g
    VENADO_CATALOG[8], // Gelatina Frutilla Kris
    ...(truck.isRefrigerated
      ? [VENADO_CATALOG[17], VENADO_CATALOG[18]] // Tolón Chocolatada + Yogurt
      : [VENADO_CATALOG[13], VENADO_CATALOG[16]]), // Refresco Kris Naranja + Agua Speranza
  ]

  let hasDiscrepancy = false
  let totalNetVariance = 0
  let isSemaphore = scenario === 'SEMAPHORE_OK' || scenario === 'DISCREPANCY_SEMAPHORE'

  const items: ItemSesionConteo[] = skusForOrder.map((sku, skuIdx) => {
    // ── 3 ESCENARIOS DE EMPAQUE (Cajas completas, Solo unidades sueltas, Cajas + Unidades) ──
    let baseBoxes = 0
    let baseUnits = 0

    if (skuIdx % 3 === 0) {
      // Caso 1: SOLO CAJAS COMPLETAS (Empaque cerrado sin unidades sueltas)
      baseBoxes = 8 + (skuIdx % 4) * 2 // 8, 10, 12, 14 cajas
      baseUnits = 0
    } else if (skuIdx % 3 === 1) {
      // Caso 2: CAJAS + UNIDADES SUELTAS (Carga Mixta)
      baseBoxes = 6 + (skuIdx % 3) * 2 // 6, 8, 10 cajas
      baseUnits = Math.min(Math.floor(sku.equivalenceBoxUnit / 2), 4 + (skuIdx % 5)) // ej. 5 unidades sueltas
    } else {
      // Caso 3: SOLO UNIDADES SUELTAS (Menudeo / Fraccionado sin cajas enteras)
      baseBoxes = 0
      baseUnits = Math.min(sku.equivalenceBoxUnit - 1, 6 + (skuIdx % 5)) // ej. 8 unidades
    }

    const expectedQty = (baseBoxes * sku.equivalenceBoxUnit) + baseUnits
    const expectedBoxes = Number((expectedQty / sku.equivalenceBoxUnit).toFixed(2))

    // Introducir discrepancia controlada en el primer producto si el escenario lo requiere
    const itemHasDisc = (scenario === 'DISCREPANCY_PARTIAL' || scenario === 'DISCREPANCY_SEMAPHORE') && skuIdx === 0
    const variance = itemHasDisc ? -2 : 0

    if (itemHasDisc) {
      hasDiscrepancy = true
      totalNetVariance += variance
    }

    const countedQty = Math.max(0, expectedQty + variance)
    const countedBoxes = Math.floor(countedQty / sku.equivalenceBoxUnit)
    const countedUnits = countedQty % sku.equivalenceBoxUnit

    return {
      productId: sku.id,
      code: sku.code,
      description: sku.description,
      category: sku.category,
      isColdChain: sku.isColdChain,
      equivalenceBoxUnit: sku.equivalenceBoxUnit,
      unitName: sku.unitName,
      expectedQty,
      expectedBoxes,
      expectedUnits: baseUnits,
      driverCount: {
        countedBoxes,
        countedUnits,
        countedQty,
        varianceQty: variance,
        status: itemHasDisc ? 'MISMATCH' : 'MATCH',
        observation: itemHasDisc ? `Merma de ${Math.abs(variance)} unidades reportada en rampa` : undefined,
      },
      supervisorReview: itemHasDisc
        ? {
            wasReviewed: true,
            countedBoxes,
            countedUnits,
            countedQty,
            varianceQty: variance,
            status: 'MATCH',
            observation: 'Merma verificada físicamente en rampa de despacho. Aprobada.',
            approved: true,
          }
        : undefined,
      semaphoreAudit: isSemaphore
        ? {
            wasAudited: skuIdx < 4,
            countedBoxes: skuIdx < 4 ? countedBoxes : undefined,
            countedUnits: skuIdx < 4 ? countedUnits : undefined,
            countedQty: skuIdx < 4 ? countedQty : undefined,
            varianceQty: 0,
            status: skuIdx < 4 ? 'MATCH' : 'SKIPPED',
          }
        : {
            wasAudited: false,
            status: 'SKIPPED',
          },
      officialInventory: {
        loadedQty: countedQty,
        loadedBoxes: countedBoxes,
        loadedUnits: countedUnits,
        varianceQty: variance,
        status: itemHasDisc ? 'APPROVED' : 'MATCH',
        verifiedSupervisorName: 'Ing. Marco Antonio Vaca',
      },
    }
  })

  const sessions: SesionConteoInfo[] = [
    {
      id: 1000 + index * 3 + 1,
      sessionType: 'DRIVER_INITIAL',
      sessionTypeLabel: '1. Conteo Inicial Chofer',
      status: 'COMPLETED',
      statusLabel: hasDiscrepancy ? 'Completado con Diferencias' : '100% Conforme',
      executorId: driver.id,
      executorName: driver.name,
      executorRole: 'DRIVER',
      startedAt: `${dateObj.iso}T05:30:00Z`,
      completedAt: `${dateObj.iso}T05:52:00Z`,
      durationMinutes: 22,
      notes: hasDiscrepancy ? 'Reporté faltante de unidades por rotura de envase en rampa' : 'Carga completa conforme',
      totalItems: items.length,
      matchItems: hasDiscrepancy ? items.length - 1 : items.length,
      mismatchItems: hasDiscrepancy ? 1 : 0,
    },
    {
      id: 1000 + index * 3 + 2,
      sessionType: 'SUPERVISOR_DISCREPANCY',
      sessionTypeLabel: '2. Revisión de Discrepancias',
      status: hasDiscrepancy ? 'COMPLETED' : 'NOT_REQUIRED',
      statusLabel: hasDiscrepancy ? 'Completado (Parcial)' : 'No Requerido',
      executorId: 2,
      executorName: 'Ing. Marco Antonio Vaca',
      executorRole: 'SUPERVISOR',
      startedAt: `${dateObj.iso}T06:05:00Z`,
      completedAt: `${dateObj.iso}T06:18:00Z`,
      durationMinutes: hasDiscrepancy ? 13 : undefined,
      notes: hasDiscrepancy ? 'Se validó merma en rampa y se autorizó despacho con stock ajustado' : 'Sin discrepancias reportadas',
      reviewScope: hasDiscrepancy ? 'PARTIAL' : 'NONE',
      totalItems: hasDiscrepancy ? 1 : 0,
      matchItems: hasDiscrepancy ? 1 : 0,
      mismatchItems: 0,
    },
    {
      id: 1000 + index * 3 + 3,
      sessionType: 'SUPERVISOR_SEMAPHORE',
      sessionTypeLabel: '3. Auditoría Semáforo',
      status: isSemaphore ? 'COMPLETED' : 'NOT_REQUIRED',
      statusLabel: isSemaphore ? 'Auditado OK' : 'No Seleccionada',
      executorId: 3,
      executorName: 'Ing. Roberto Méndez',
      executorRole: 'SUPERVISOR',
      startedAt: `${dateObj.iso}T06:20:00Z`,
      completedAt: `${dateObj.iso}T06:28:00Z`,
      durationMinutes: isSemaphore ? 8 : undefined,
      notes: isSemaphore ? 'Muestreo ciego de calidad en rampa OK. 100% coincidencia.' : undefined,
      totalItems: isSemaphore ? 4 : 0,
      matchItems: isSemaphore ? 4 : 0,
      mismatchItems: 0,
      skippedItems: isSemaphore ? items.length - 4 : undefined,
    },
  ]

  return {
    id: `ot-rev-${orderNumber}`,
    transportOrderId: orderNumber,
    orderCode,
    distributorName: 'Distribuidora Central Santa Cruz - Grupo Venado',
    departureDate: `${dateObj.iso}T06:30:00`,
    completedDate: `${dateObj.iso}T14:45:00`,
    dateFormatted: dateObj.formatted,
    dateIso: dateObj.iso,
    routeName: route,
    status: hasDiscrepancy ? 'DISCREPANCY' : 'COMPLETED',
    statusLabel: hasDiscrepancy ? 'Discrepancia Aprobada' : '100% Conforme',
    truck,
    driver,
    supervisor: {
      id: 2,
      name: 'Ing. Marco Antonio Vaca',
    },
    summary: {
      totalProducts: items.length,
      coldChainProductCount: items.filter((i) => i.isColdChain).length,
      hasDiscrepancies: hasDiscrepancy,
      driverStatus: hasDiscrepancy ? 'DISCREPANCY' : 'MATCH',
      supervisorReviewScope: hasDiscrepancy ? 'PARTIAL' : 'NONE',
      supervisorReviewed: hasDiscrepancy,
      semaphoreAudited: isSemaphore,
      finalMatchRate: hasDiscrepancy ? 97.5 : 100,
      totalNetVarianceUnits: totalNetVariance,
    },
    sessions,
    items,
  }
}

// ── GENERACIÓN DE 22 ÓRDENES DE TRANSPORTE DISTRIBUIDAS EN 4 FECHAS ──
export const HISTORIAL_REVISIONES_DATA: OrdenRevisionHistorial[] = [
  // 25 de Agosto (8 OTs)
  buildVenadoOrder(0, 100451, DATES[0], 0, 0, 0, 'DISCREPANCY_SEMAPHORE'),
  buildVenadoOrder(1, 100452, DATES[0], 1, 1, 1, 'PERFECT'),
  buildVenadoOrder(2, 100453, DATES[0], 2, 2, 2, 'SEMAPHORE_OK'),
  buildVenadoOrder(3, 100454, DATES[0], 3, 3, 3, 'PERFECT'),
  buildVenadoOrder(4, 100455, DATES[0], 4, 4, 4, 'DISCREPANCY_PARTIAL'),
  buildVenadoOrder(5, 100456, DATES[0], 5, 5, 5, 'PERFECT'),
  buildVenadoOrder(6, 100457, DATES[0], 0, 1, 0, 'SEMAPHORE_OK'),
  buildVenadoOrder(7, 100458, DATES[0], 1, 2, 1, 'PERFECT'),

  // 24 de Agosto (6 OTs)
  buildVenadoOrder(8, 100445, DATES[1], 2, 3, 2, 'DISCREPANCY_PARTIAL'),
  buildVenadoOrder(9, 100446, DATES[1], 3, 4, 3, 'PERFECT'),
  buildVenadoOrder(10, 100447, DATES[1], 4, 5, 4, 'SEMAPHORE_OK'),
  buildVenadoOrder(11, 100448, DATES[1], 5, 0, 5, 'PERFECT'),
  buildVenadoOrder(12, 100449, DATES[1], 0, 1, 0, 'PERFECT'),
  buildVenadoOrder(13, 100450, DATES[1], 1, 2, 1, 'DISCREPANCY_SEMAPHORE'),

  // 23 de Agosto (4 OTs)
  buildVenadoOrder(14, 100438, DATES[2], 2, 3, 2, 'PERFECT'),
  buildVenadoOrder(15, 100439, DATES[2], 3, 4, 3, 'SEMAPHORE_OK'),
  buildVenadoOrder(16, 100440, DATES[2], 4, 5, 4, 'DISCREPANCY_PARTIAL'),
  buildVenadoOrder(17, 100441, DATES[2], 5, 0, 5, 'PERFECT'),

  // 20 de Agosto (4 OTs)
  buildVenadoOrder(18, 100430, DATES[3], 0, 1, 0, 'PERFECT'),
  buildVenadoOrder(19, 100431, DATES[3], 1, 2, 1, 'DISCREPANCY_PARTIAL'),
  buildVenadoOrder(20, 100432, DATES[3], 2, 3, 2, 'SEMAPHORE_OK'),
  buildVenadoOrder(21, 100433, DATES[3], 3, 4, 3, 'PERFECT'),
]
