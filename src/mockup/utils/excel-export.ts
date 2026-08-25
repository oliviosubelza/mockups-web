import type { OrdenTransporteHistorial } from '../historial-orders-data'

/**
 * Genera y descarga un archivo CSV estructurado y formateado con BOM UTF-8
 * totalmente compatible con Microsoft Excel, Google Sheets y LibreOffice.
 */
export function exportarHistorialAExcel(
  ordenes: OrdenTransporteHistorial[],
  nombreArchivo = 'Historial_Ordenes_Transporte.csv'
) {
  const lineas: string[] = []

  // Metadatos y encabezado del reporte
  lineas.push('REPORTE GENERAL DE HISTORIAL DE ÓRDENES DE TRANSPORTE')
  lineas.push(`Fecha de exportación:;${new Date().toLocaleString('es-BO')}`)
  lineas.push(`Total de Órdenes exportadas:;${ordenes.length}`)
  const totalRecaudado = ordenes.reduce((acc, o) => acc + o.kpis.totalCollected, 0)
  const totalKm = ordenes.reduce((acc, o) => acc + o.totalKm, 0)
  lineas.push(`Monto Total Recaudado (BOB):;${totalRecaudado.toFixed(2)} Bs`)
  lineas.push(`Distancia Total Recorrida (Km):;${totalKm.toFixed(1)} km`)
  lineas.push('')

  // ── SECCIÓN 1: RESUMEN CONSOLIDADO POR ORDEN DE TRANSPORTE ──
  lineas.push('1. RESUMEN DE ÓRDENES DE TRANSPORTE (CONSOLIDADO)')
  const encabezadosOT = [
    'Código OT',
    'Fecha',
    'Hora Salida',
    'Hora Cierre',
    'Distribuidora',
    'Placa Camión',
    'Código Camión',
    'Tipo Camión',
    'Refrigerado',
    'Chofer',
    'Teléfono Chofer',
    'Ayudante',
    'Paradas Totales',
    'Paradas Exitosas',
    '% Efectividad',
    'Peso Asignado (Kg)',
    'Volumen Asignado (M3)',
    'Km Recorridos',
    'Duración Total (Min)',
    'Total Cobrado (Bs)',
    'Cobrado Efectivo (Bs)',
    'Cobrado QR (Bs)',
    'Cobrado Transferencia (Bs)',
    'Cobrado Cheque (Bs)',
    'Estado Operativo',
  ]
  lineas.push(encabezadosOT.join(';'))

  for (const ot of ordenes) {
    const fila = [
      `"${ot.codeFormatted}"`,
      `"${ot.dateFormatted}"`,
      `"${ot.departureDate.split('T')[1].slice(0, 5)}"`,
      `"${ot.completedDate.split('T')[1].slice(0, 5)}"`,
      `"${ot.distributorName}"`,
      `"${ot.truck.plate}"`,
      `"${ot.truck.code}"`,
      `"${ot.truck.truckType}"`,
      ot.truck.isRefrigerated ? '"SÍ"' : '"NO"',
      `"${ot.driver.name}"`,
      `"${ot.driver.phone}"`,
      `"${ot.helper.name}"`,
      ot.kpis.totalStops,
      ot.kpis.completedStops,
      `"${ot.kpis.successRate}%"`,
      ot.assignedWeightKg.toFixed(2),
      ot.assignedVolumeM3.toFixed(2),
      ot.totalKm.toFixed(1),
      ot.kpis.totalDurationMinutes,
      ot.kpis.totalCollected.toFixed(2),
      ot.kpis.collectedCash.toFixed(2),
      ot.kpis.collectedQr.toFixed(2),
      ot.kpis.collectedTransfer.toFixed(2),
      (ot.kpis.collectedCheck || 0).toFixed(2),
      `"${ot.statusLabel}"`,
    ]
    lineas.push(fila.join(';'))
  }

  lineas.push('')
  lineas.push('')

  // ── SECCIÓN 2: DETALLE PUNTO POR PUNTO (PARADAS, TIEMPOS, PRODUCTOS Y DESGLOSE DE COBRANZAS) ──
  lineas.push('2. DETALLE DE PARADAS Y ENTREGAS (PUNTO POR PUNTO CON DESGLOSE DE MÉTODOS DE PAGO)')
  const encabezadosParadas = [
    'Código OT',
    'Secuencia',
    'Cliente',
    'Código Cliente',
    'Dirección',
    'Zona',
    'Canal de Venta',
    'Nro Nota Remisión',
    'Hora Llegada',
    'Hora Salida',
    'Tiempo Traslado',
    'Tiempo Atención',
    'Resultado Entrega',
    'Total Cobrado Parada (Bs)',
    'Cobro Efectivo (Bs)',
    'Cobro QR (Bs)',
    'Cobro Transferencia (Bs)',
    'Cobro Cheque (Bs)',
    'Modalidad de Cobro',
    'Desglose y Nros de Comprobante / Referencia',
    'Receptor',
    'CI / Documento',
    'Incidencias / Motivo Rechazo',
  ]
  lineas.push(encabezadosParadas.join(';'))

  for (const ot of ordenes) {
    for (const p of ot.paradas) {
      const montoCobrado = p.payments.reduce((acc, pay) => acc + pay.amount, 0)
      const montoEfectivo = p.payments.filter((pay) => pay.paymentMethod === 'CASH').reduce((acc, pay) => acc + pay.amount, 0)
      const montoQr = p.payments.filter((pay) => pay.paymentMethod === 'QR').reduce((acc, pay) => acc + pay.amount, 0)
      const montoTransfer = p.payments.filter((pay) => pay.paymentMethod === 'TRANSFER').reduce((acc, pay) => acc + pay.amount, 0)
      const montoCheque = p.payments.filter((pay) => pay.paymentMethod === 'CHECK').reduce((acc, pay) => acc + pay.amount, 0)

      // Modalidad de cobro (Pago Único vs Pago Mixto)
      const numMetodos = p.payments.length
      const modalidadCobro =
        numMetodos === 0
          ? 'SIN COBRO (Crédito / Rechazo)'
          : numMetodos === 1
          ? `PAGO ÚNICO (${p.payments[0].paymentMethodLabel})`
          : `PAGO MIXTO (${numMetodos} métodos)`

      // Cadena detallada de desglose para auditoría contable
      const desgloseTexto =
        p.payments
          .map((pay) => `${pay.paymentMethodLabel}: ${pay.amount.toFixed(2)} Bs (Ref: ${pay.referenceNumber})`)
          .join(' | ') || 'N/A'

      const motivosRechazo = p.items.filter((it) => it.rejectionReason).map((it) => `${it.productName}: ${it.rejectionReason}`).join(' | ')
      const incidenciaTexto = p.incident ? `[${p.incident.code}] ${p.incident.description}` : (motivosRechazo || 'Ninguna')

      const filaParada = [
        `"${ot.codeFormatted}"`,
        p.sequence,
        `"${p.customerName}"`,
        `"${p.customerCode}"`,
        `"${p.address}"`,
        `"${p.zoneName}"`,
        `"${p.saleChannel}"`,
        `"${p.deliveryNoteNumber}"`,
        `"${p.arrivedAt}"`,
        `"${p.deliveredAt}"`,
        `"${p.travelTimeFromPrevious}"`,
        `"${p.serviceDuration}"`,
        `"${p.resultCode}"`,
        montoCobrado.toFixed(2),
        montoEfectivo.toFixed(2),
        montoQr.toFixed(2),
        montoTransfer.toFixed(2),
        montoCheque.toFixed(2),
        `"${modalidadCobro}"`,
        `"${desgloseTexto}"`,
        `"${p.proofOfDelivery.receiverName}"`,
        `"${p.proofOfDelivery.receiverDocument}"`,
        `"${incidenciaTexto}"`,
      ]
      lineas.push(filaParada.join(';'))
    }
  }

  lineas.push('')
  lineas.push('')

  // ── SECCIÓN 3: LIBRO DE COBRANZAS Y TRANSACCIONES INDIVIDUALES (ARQUEO DETALLADO) ──
  lineas.push('3. LIBRO DE COBRANZAS Y TRANSACCIONES (ARQUEO INDIVIDUAL POR COMPROBANTE)')
  const encabezadosTransacciones = [
    'Código OT',
    'Parada #',
    'Cliente',
    'Nro Factura',
    'Método de Pago',
    'Monto Cobrado (Bs)',
    'Moneda',
    'Nro Comprobante / Recibo / Ref',
    'Estado Transacción',
    'Observaciones',
  ]
  lineas.push(encabezadosTransacciones.join(';'))

  for (const ot of ordenes) {
    for (const p of ot.paradas) {
      for (const pay of p.payments) {
        const filaTransaccion = [
          `"${ot.codeFormatted}"`,
          p.sequence,
          `"${p.customerName}"`,
          `"${pay.invoiceId}"`,
          `"${pay.paymentMethodLabel}"`,
          pay.amount.toFixed(2),
          `"${pay.currency || 'BOB'}"`,
          `"${pay.referenceNumber}"`,
          `"${pay.status}"`,
          `"${pay.notes || ''}"`,
        ]
        lineas.push(filaTransaccion.join(';'))
      }
    }
  }

  // BOM para UTF-8 (\uFEFF)
  const contenidoCSV = '\uFEFF' + lineas.join('\r\n')
  const blob = new Blob([contenidoCSV], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.setAttribute('download', nombreArchivo)
  document.body.appendChild(enlace)
  enlace.click()
  document.body.removeChild(enlace)
  URL.revokeObjectURL(url)
}

import type { OrdenRevisionHistorial } from '../historial-revisiones-data'

/**
 * Exporta el historial completo de revisiones, sesiones de conteo y matriz comparativa de SKUs a Excel (CSV con UTF-8).
 */
export function exportarHistorialRevisionesAExcel(
  ordenes: OrdenRevisionHistorial[],
  nombreArchivo = 'Auditoria_Revisiones_Conteos.csv'
) {
  const lineas: string[] = []

  lineas.push('AUDITORÍA DE REVISIONES Y SESIONES DE CONTEO (REPORTES)')
  lineas.push(`Fecha de exportación:;${new Date().toLocaleString('es-BO')}`)
  lineas.push(`Total de Órdenes Auditadas:;${ordenes.length}`)
  lineas.push('')

  // 1. Resumen de Órdenes y Sesiones
  lineas.push('1. RESUMEN DE ÓRDENES Y ESTADO DE SESIONES')
  const cabecerasOT = [
    'Código OT',
    'Fecha',
    'Ruta',
    'Placa Camión',
    'Chofer',
    'Supervisor',
    'Conteo Chofer (DRIVER_INITIAL)',
    'Revisión Supervisor (SUPERVISOR_DISCREPANCY)',
    'Auditoría Semáforo (SUPERVISOR_SEMAPHORE)',
    '% Efectividad Chofer',
    'Total Productos',
    'Productos Cadena Frío',
    'Diferencia Neta Uds Final',
    'Estado Operativo',
  ]
  lineas.push(cabecerasOT.join(';'))

  for (const ot of ordenes) {
    const driverSession = ot.sessions.find((s) => s.sessionType === 'DRIVER_INITIAL')
    const supervisorSession = ot.sessions.find((s) => s.sessionType === 'SUPERVISOR_DISCREPANCY')
    const semaphoreSession = ot.sessions.find((s) => s.sessionType === 'SUPERVISOR_SEMAPHORE')

    const fila = [
      `"${ot.orderCode}"`,
      `"${ot.dateFormatted}"`,
      `"${ot.routeName}"`,
      `"${ot.truck.plate}"`,
      `"${ot.driver.name}"`,
      `"${ot.supervisor?.name || 'N/A'}"`,
      `"${driverSession?.statusLabel || 'N/A'}"`,
      `"${supervisorSession?.statusLabel || (ot.summary.hasDiscrepancies ? 'Pendiente' : 'No requerida')}"`,
      `"${semaphoreSession?.statusLabel || 'No auditada'}"`,
      `${ot.summary.finalMatchRate}%`,
      ot.summary.totalProducts,
      ot.summary.coldChainProductCount,
      ot.summary.totalNetVarianceUnits,
      `"${ot.statusLabel}"`,
    ]
    lineas.push(fila.join(';'))
  }

  lineas.push('')

  // 2. Detalle comparativo por producto (Matriz multi-sesión)
  lineas.push('2. MATRIZ COMPARATIVA DE CONTEOS POR PRODUCTO')
  const cabecerasItems = [
    'Código OT',
    'Producto',
    'Categoría',
    'Cadena Frío',
    'Uds/Caja',
    'Oficial Esperado (Uds)',
    'Conteo Chofer (Uds)',
    'Dif. Chofer (Uds)',
    'Estado Chofer',
    'Conteo Supervisor (Uds)',
    'Dif. Supervisor (Uds)',
    'Estado Supervisor',
    'Auditoría Semáforo (Uds)',
    'Dif. Semáforo (Uds)',
    'Estado Semáforo',
    'Inventario Final Camión (Uds)',
    'Dif. Final Oficial (Uds)',
    'Estado Consolidado',
    'Observaciones Chofer/Supervisor',
  ]
  lineas.push(cabecerasItems.join(';'))

  for (const ot of ordenes) {
    for (const item of ot.items) {
      const supQty = item.supervisorReview?.wasReviewed ? item.supervisorReview.countedQty ?? 'N/A' : 'N/A'
      const supVar = item.supervisorReview?.wasReviewed ? item.supervisorReview.varianceQty ?? 0 : 'N/A'
      const supStatus = item.supervisorReview?.wasReviewed ? item.supervisorReview.status : 'NO REQUERIDA'

      const semQty = item.semaphoreAudit?.wasAudited ? item.semaphoreAudit.countedQty ?? 'N/A' : 'OMITIDO'
      const semVar = item.semaphoreAudit?.wasAudited ? item.semaphoreAudit.varianceQty ?? 0 : 'N/A'
      const semStatus = item.semaphoreAudit?.wasAudited ? item.semaphoreAudit.status : 'SKIPPED'

      const obs = [
        item.driverCount.observation ? `Chofer: ${item.driverCount.observation}` : '',
        item.supervisorReview?.observation ? `Supervisor: ${item.supervisorReview.observation}` : '',
        item.semaphoreAudit?.observation ? `Semáforo: ${item.semaphoreAudit.observation}` : '',
      ]
        .filter(Boolean)
        .join(' | ')

      const filaItem = [
        `"${ot.orderCode}"`,
        `"${item.description}"`,
        `"${item.category}"`,
        item.isColdChain ? 'SÍ' : 'NO',
        item.equivalenceBoxUnit,
        item.expectedQty,
        item.driverCount.countedQty,
        item.driverCount.varianceQty,
        `"${item.driverCount.status}"`,
        supQty,
        supVar,
        `"${supStatus}"`,
        semQty,
        semVar,
        `"${semStatus}"`,
        item.officialInventory.loadedQty,
        item.officialInventory.varianceQty,
        `"${item.officialInventory.status}"`,
        `"${obs}"`,
      ]
      lineas.push(filaItem.join(';'))
    }
  }

  const contenidoCSV = '\uFEFF' + lineas.join('\r\n')
  const blob = new Blob([contenidoCSV], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.setAttribute('download', nombreArchivo)
  document.body.appendChild(enlace)
  enlace.click()
  document.body.removeChild(enlace)
  URL.revokeObjectURL(url)
}

/**
 * Exporta el detalle individual de una Orden de Transporte específica con su matriz de productos
 */
export function exportarOrdenRevisionIndividualAExcel(ot: OrdenRevisionHistorial) {
  const lineas: string[] = []

  lineas.push(`ACTA DE REVISIÓN Y LIQUIDACIÓN DE CARGA - ${ot.orderCode}`)
  lineas.push(`Fecha de Emisión:;${new Date().toLocaleString('es-BO')}`)
  lineas.push(`Fecha de Despacho:;${ot.dateFormatted}`)
  lineas.push(`Ruta:;${ot.routeName}`)
  lineas.push(`Distribuidora:;${ot.distributorName}`)
  lineas.push(`Camión:;${ot.truck.plate} (${ot.truck.code}) - ${ot.truck.truckType}`)
  lineas.push(`Chofer:;${ot.driver.name} (CI: ${ot.driver.document})`)
  lineas.push(`Supervisor:;${ot.supervisor?.name || 'Ing. Marco Antonio Vaca'}`)
  lineas.push(`Estado Final:;${ot.statusLabel}`)
  lineas.push(`Diferencia Neta Final:;${ot.summary.totalNetVarianceUnits} Unidades`)
  lineas.push('')

  lineas.push('MATRIZ DE CONCILIACIÓN DE PRODUCTOS')
  const cabeceras = [
    'Producto',
    'Factor (Uds/Cj)',
    'Esperado Inicial (Uds)',
    'Esperado Cajas',
    'Conteo Chofer (Uds)',
    'Dif. Chofer (Uds)',
    'Obs. Chofer',
    'Revisión Supervisor (Uds)',
    'Dif. Supervisor (Uds)',
    'Dictamen Supervisor',
    'Auditoría Semáforo (Uds)',
    'Estado Semáforo',
    'Carga Final Autorizada (Uds)',
    'Estado Oficial',
  ]
  lineas.push(cabeceras.join(';'))

  for (const item of ot.items) {
    const supQty = item.supervisorReview?.wasReviewed ? item.supervisorReview.countedQty : 'N/A'
    const supVar = item.supervisorReview?.wasReviewed ? item.supervisorReview.varianceQty : 'N/A'
    const supObs = item.supervisorReview?.observation || (item.supervisorReview?.wasReviewed ? 'Aprobado' : 'No requerida')

    const semQty = item.semaphoreAudit?.wasAudited ? item.semaphoreAudit.countedQty : 'N/A'
    const semStatus = item.semaphoreAudit?.wasAudited ? 'Auditado OK' : 'SKIPPED'

    const fila = [
      `"${item.description}"`,
      item.equivalenceBoxUnit,
      item.expectedQty,
      item.expectedBoxes,
      item.driverCount.countedQty,
      item.driverCount.varianceQty,
      `"${item.driverCount.observation || 'Conforme'}"`,
      supQty,
      supVar,
      `"${supObs}"`,
      semQty,
      `"${semStatus}"`,
      item.officialInventory.loadedQty,
      `"${item.officialInventory.status}"`,
    ]
    lineas.push(fila.join(';'))
  }

  const contenidoCSV = '\uFEFF' + lineas.join('\r\n')
  const blob = new Blob([contenidoCSV], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.setAttribute('download', `Acta_Liquidacion_${ot.orderCode}_${ot.dateIso}.csv`)
  document.body.appendChild(enlace)
  enlace.click()
  document.body.removeChild(enlace)
  URL.revokeObjectURL(url)
}

