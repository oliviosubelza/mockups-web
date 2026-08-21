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
