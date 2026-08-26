import type { OrdenTransporteHistorial } from '../historial-orders-data'
import type { OrdenRevisionHistorial } from '../historial-revisiones-data'
import type { CierreOrdenTransporte } from '../cierre-logistico-data'

/**
 * Escapa caracteres especiales XML para garantizar archivos válidos en Microsoft Excel.
 */
function xmlEscape(val: unknown): string {
  if (val == null) return ''
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Generador de celdas tipadas para el estándar Microsoft Excel XML Spreadsheet 2003.
 */
function cellString(val: unknown, style = 'CellText'): string {
  return `<Cell ss:StyleID="${style}"><Data ss:Type="String">${xmlEscape(val)}</Data></Cell>`
}

function cellNumber(val: number | null | undefined, style = 'CellNumber'): string {
  if (val == null || isNaN(val)) {
    return `<Cell ss:StyleID="CellCenter"><Data ss:Type="String">-</Data></Cell>`
  }
  return `<Cell ss:StyleID="${style}"><Data ss:Type="Number">${val}</Data></Cell>`
}

function cellCurrency(val: number | null | undefined): string {
  return cellNumber(val, 'CellCurrency')
}

function cellPercent(val: number | null | undefined): string {
  if (val == null || isNaN(val)) {
    return `<Cell ss:StyleID="CellCenter"><Data ss:Type="String">-</Data></Cell>`
  }
  // En Excel los porcentajes van en base decimal (ej: 0.95 = 95%)
  const decimalVal = val > 1 ? val / 100 : val
  return `<Cell ss:StyleID="CellPercent"><Data ss:Type="Number">${decimalVal}</Data></Cell>`
}

function cellHeader(val: string, style = 'HeaderNavy'): string {
  return `<Cell ss:StyleID="${style}"><Data ss:Type="String">${xmlEscape(val)}</Data></Cell>`
}

/**
 * Plantilla base con estilos corporativos para Libros de Trabajo de Microsoft Excel (.xls).
 */
function getWorkbookTemplate(worksheetsXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Author>Grupo Venado - Sistema de Despacho y Monitoreo</Author>
  <Created>${new Date().toISOString()}</Created>
  <Company>Grupo Venado</Company>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Borders/>
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="10" ss:Color="#1E293B"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>

  <!-- Encabezados de Títulos -->
  <Style ss:ID="ReportTitle">
   <Font ss:FontName="Calibri" ss:Size="14" ss:Bold="1" ss:Color="#0F172A"/>
   <Alignment ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="ReportSubtitle">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#64748B"/>
   <Alignment ss:Vertical="Center"/>
  </Style>

  <!-- Cabeceras de Tablas con Colores Corporativos -->
  <Style ss:ID="HeaderNavy">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1E293B" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334155"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334155"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334155"/>
   </Borders>
  </Style>

  <Style ss:ID="HeaderBlue">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1E40AF" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#172554"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#3B82F6"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#3B82F6"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#3B82F6"/>
   </Borders>
  </Style>

  <Style ss:ID="HeaderGreen">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#065F46" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#064E3B"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#10B981"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#10B981"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#10B981"/>
   </Borders>
  </Style>

  <Style ss:ID="HeaderAmber">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#92400E" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#78350F"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#F59E0B"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#F59E0B"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#F59E0B"/>
   </Borders>
  </Style>

  <!-- Formatos de Datos de Celda -->
  <Style ss:ID="CellText">
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>

  <Style ss:ID="CellBold">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/>
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>

  <Style ss:ID="CellCenter">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>

  <Style ss:ID="CellNumber">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <NumberFormat ss:Format="#,##0.00"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>

  <Style ss:ID="CellInteger">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <NumberFormat ss:Format="#,##0"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>

  <Style ss:ID="CellCurrency">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <NumberFormat ss:Format="&quot;Bs &quot;#,##0.00"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>

  <Style ss:ID="CellPercent">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <NumberFormat ss:Format="0.0%"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
 </Styles>
 ${worksheetsXml}
</Workbook>`
}

/**
 * Descarga en el navegador el archivo generado.
 */
function downloadWorkbookXml(workbookXml: string, filename: string) {
  const finalFilename = filename.endsWith('.xls') || filename.endsWith('.xml') ? filename : `${filename}.xls`
  const blob = new Blob([workbookXml], { type: 'application/vnd.ms-excel;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', finalFilename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. EXPORTACIÓN GENERAL DE HISTORIAL DE ÓRDENES (4 HOJAS SEPARADAS)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Exporta el reporte general de historial a un Libro Excel con 4 pestañas independientes:
 *  - Hoja 1: Resumen OTs (Consolidado de viajes)
 *  - Hoja 2: Detalle Paradas (Punto por punto y tiempos)
 *  - Hoja 3: Libro de Cobranzas (Arqueo financiero por comprobante)
 *  - Hoja 4: Auditoría y Revisiones (Mermas y cuadre de rampa)
 */
export function exportarHistorialAExcel(
  ordenes: OrdenTransporteHistorial[],
  nombreArchivo = 'Reporte_General_OT_GrupoVenado.xls'
) {
  // ── HOJA 1: RESUMEN DE ÓRDENES ──
  const headersSheet1 = [
    'Código OT', 'Fecha', 'Hora Salida', 'Hora Cierre', 'Distribuidora',
    'Placa Camión', 'Código Camión', 'Tipo Camión', 'Refrigerado',
    'Chofer', 'Teléfono', 'Ayudante',
    'Paradas Totales', 'Paradas Exitosas', '% Efectividad',
    'Peso (Kg)', 'Volumen (M3)', 'Km Recorridos', 'Duración (Min)',
    'Total Cobrado (Bs)', 'Efectivo (Bs)', 'QR (Bs)', 'Transferencia (Bs)', 'Cheque (Bs)',
    'Estado Operativo'
  ]

  let rowsSheet1 = `
   <Row ss:Height="24">
    <Cell ss:MergeAcross="${headersSheet1.length - 1}" ss:StyleID="ReportTitle">
     <Data ss:Type="String">REPORTE CONSOLIDADO DE ÓRDENES DE TRANSPORTE - GRUPO VENADO</Data>
    </Cell>
   </Row>
   <Row ss:Height="18">
    <Cell ss:MergeAcross="${headersSheet1.length - 1}" ss:StyleID="ReportSubtitle">
     <Data ss:Type="String">Generado el ${new Date().toLocaleString('es-BO')} • Total de Viajes: ${ordenes.length}</Data>
    </Cell>
   </Row>
   <Row ss:Height="8"/>
   <Row ss:Height="24">
    ${headersSheet1.map((h) => cellHeader(h, 'HeaderNavy')).join('\n    ')}
   </Row>`

  for (const ot of ordenes) {
    rowsSheet1 += `
   <Row ss:Height="19">
    ${cellString(ot.codeFormatted, 'CellBold')}
    ${cellString(ot.dateFormatted, 'CellCenter')}
    ${cellString(ot.departureDate.split('T')[1]?.slice(0, 5) || '05:30', 'CellCenter')}
    ${cellString(ot.completedDate.split('T')[1]?.slice(0, 5) || '14:30', 'CellCenter')}
    ${cellString(ot.distributorName)}
    ${cellString(ot.truck.plate, 'CellBold')}
    ${cellString(ot.truck.code, 'CellCenter')}
    ${cellString(ot.truck.truckType)}
    ${cellString(ot.truck.isRefrigerated ? 'SÍ' : 'NO', 'CellCenter')}
    ${cellString(ot.driver.name)}
    ${cellString(ot.driver.phone, 'CellCenter')}
    ${cellString(ot.helper.name)}
    ${cellNumber(ot.kpis.totalStops, 'CellInteger')}
    ${cellNumber(ot.kpis.completedStops, 'CellInteger')}
    ${cellPercent(ot.kpis.successRate)}
    ${cellNumber(ot.assignedWeightKg)}
    ${cellNumber(ot.assignedVolumeM3)}
    ${cellNumber(ot.totalKm)}
    ${cellNumber(ot.kpis.totalDurationMinutes, 'CellInteger')}
    ${cellCurrency(ot.kpis.totalCollected)}
    ${cellCurrency(ot.kpis.collectedCash)}
    ${cellCurrency(ot.kpis.collectedQr)}
    ${cellCurrency(ot.kpis.collectedTransfer)}
    ${cellCurrency(ot.kpis.collectedCheck || 0)}
    ${cellString(ot.statusLabel, 'CellCenter')}
   </Row>`
  }

  // ── HOJA 2: DETALLE DE PARADAS Y ENTREGAS ──
  const headersSheet2 = [
    'Código OT', 'Secuencia', 'Cliente', 'Código Cliente', 'Dirección',
    'Zona', 'Canal de Venta', 'Nro Nota Remisión',
    'Hora Llegada', 'Hora Salida', 'Tiempo Traslado', 'Tiempo Atención',
    'Resultado Entrega', 'Total Cobrado (Bs)',
    'Efectivo (Bs)', 'QR (Bs)', 'Transferencia (Bs)', 'Cheque (Bs)',
    'Modalidad de Cobro', 'Receptor', 'CI / Documento', 'Incidencias / Motivo'
  ]

  let rowsSheet2 = `
   <Row ss:Height="24">
    <Cell ss:MergeAcross="${headersSheet2.length - 1}" ss:StyleID="ReportTitle">
     <Data ss:Type="String">DETALLE DE PARADAS, ENTREGAS Y TIEMPOS EN RUTA</Data>
    </Cell>
   </Row>
   <Row ss:Height="18">
    <Cell ss:MergeAcross="${headersSheet2.length - 1}" ss:StyleID="ReportSubtitle">
     <Data ss:Type="String">Registro cronológico parada por parada con evidencia de entrega y tiempos de atención</Data>
    </Cell>
   </Row>
   <Row ss:Height="8"/>
   <Row ss:Height="24">
    ${headersSheet2.map((h) => cellHeader(h, 'HeaderBlue')).join('\n    ')}
   </Row>`

  for (const ot of ordenes) {
    for (const p of ot.paradas) {
      const montoCobrado = p.payments.reduce((acc, pay) => acc + pay.amount, 0)
      const montoEfectivo = p.payments.filter((pay) => pay.paymentMethod === 'CASH').reduce((acc, pay) => acc + pay.amount, 0)
      const montoQr = p.payments.filter((pay) => pay.paymentMethod === 'QR').reduce((acc, pay) => acc + pay.amount, 0)
      const montoTransfer = p.payments.filter((pay) => pay.paymentMethod === 'TRANSFER').reduce((acc, pay) => acc + pay.amount, 0)
      const montoCheque = p.payments.filter((pay) => pay.paymentMethod === 'CHECK').reduce((acc, pay) => acc + pay.amount, 0)

      const numMetodos = p.payments.length
      const modalidadCobro = numMetodos === 0 ? 'Sin Cobro (Crédito)' : numMetodos === 1 ? `Pago Único (${p.payments[0].paymentMethodLabel})` : `Pago Mixto (${numMetodos} métodos)`
      const incidenciaTexto = p.incident ? `[${p.incident.code}] ${p.incident.description}` : 'Conforme'

      rowsSheet2 += `
   <Row ss:Height="19">
    ${cellString(ot.codeFormatted, 'CellBold')}
    ${cellNumber(p.sequence, 'CellInteger')}
    ${cellString(p.customerName)}
    ${cellString(p.customerCode, 'CellCenter')}
    ${cellString(p.address)}
    ${cellString(p.zoneName)}
    ${cellString(p.saleChannel)}
    ${cellString(p.deliveryNoteNumber, 'CellCenter')}
    ${cellString(p.arrivedAt, 'CellCenter')}
    ${cellString(p.deliveredAt, 'CellCenter')}
    ${cellString(p.travelTimeFromPrevious, 'CellCenter')}
    ${cellString(p.serviceDuration, 'CellCenter')}
    ${cellString(p.resultCode, 'CellCenter')}
    ${cellCurrency(montoCobrado)}
    ${cellCurrency(montoEfectivo)}
    ${cellCurrency(montoQr)}
    ${cellCurrency(montoTransfer)}
    ${cellCurrency(montoCheque)}
    ${cellString(modalidadCobro)}
    ${cellString(p.proofOfDelivery.receiverName)}
    ${cellString(p.proofOfDelivery.receiverDocument, 'CellCenter')}
    ${cellString(incidenciaTexto)}
   </Row>`
    }
  }

  // ── HOJA 3: LIBRO DE COBRANZAS Y ARQUEO ──
  const headersSheet3 = [
    'Código OT', 'Parada #', 'Cliente', 'Nro Factura',
    'Método de Pago', 'Monto Cobrado (Bs)', 'Moneda',
    'Nro Comprobante / Referencia / QR', 'Estado Transacción', 'Observaciones'
  ]

  let rowsSheet3 = `
   <Row ss:Height="24">
    <Cell ss:MergeAcross="${headersSheet3.length - 1}" ss:StyleID="ReportTitle">
     <Data ss:Type="String">LIBRO DE COBRANZAS Y ARQUEO FINANCIERO DE LIQUIDACIÓN</Data>
    </Cell>
   </Row>
   <Row ss:Height="18">
    <Cell ss:MergeAcross="${headersSheet3.length - 1}" ss:StyleID="ReportSubtitle">
     <Data ss:Type="String">Desglose de pagos individuales por factura para cuadre de caja, cuentas y cobranzas</Data>
    </Cell>
   </Row>
   <Row ss:Height="8"/>
   <Row ss:Height="24">
    ${headersSheet3.map((h) => cellHeader(h, 'HeaderAmber')).join('\n    ')}
   </Row>`

  for (const ot of ordenes) {
    for (const p of ot.paradas) {
      for (const pay of p.payments) {
        rowsSheet3 += `
   <Row ss:Height="19">
    ${cellString(ot.codeFormatted, 'CellBold')}
    ${cellNumber(p.sequence, 'CellInteger')}
    ${cellString(p.customerName)}
    ${cellString(pay.invoiceId, 'CellCenter')}
    ${cellString(pay.paymentMethodLabel, 'CellBold')}
    ${cellCurrency(pay.amount)}
    ${cellString(pay.currency || 'BOB', 'CellCenter')}
    ${cellString(pay.referenceNumber, 'CellCenter')}
    ${cellString(pay.status, 'CellCenter')}
    ${cellString(pay.notes || '')}
   </Row>`
      }
    }
  }

  // ── HOJA 4: AUDITORÍA DE CARGA Y MERMAS (RAMPA) ──
  const headersSheet4 = [
    'Código OT', 'Fecha', 'Placa Camión', 'Chofer', 'Total Paradas',
    'Peso Planificado (Kg)', 'Resultado Liquidación', 'Diferencias Reportadas'
  ]

  let rowsSheet4 = `
   <Row ss:Height="24">
    <Cell ss:MergeAcross="${headersSheet4.length - 1}" ss:StyleID="ReportTitle">
     <Data ss:Type="String">RESUMEN DE AUDITORÍA Y CONTROL DE DESPACHO</Data>
    </Cell>
   </Row>
   <Row ss:Height="18">
    <Cell ss:MergeAcross="${headersSheet4.length - 1}" ss:StyleID="ReportSubtitle">
     <Data ss:Type="String">Trazabilidad de cierre y estado final de liquidación</Data>
    </Cell>
   </Row>
   <Row ss:Height="8"/>
   <Row ss:Height="24">
    ${headersSheet4.map((h) => cellHeader(h, 'HeaderGreen')).join('\n    ')}
   </Row>`

  for (const ot of ordenes) {
    rowsSheet4 += `
   <Row ss:Height="19">
    ${cellString(ot.codeFormatted, 'CellBold')}
    ${cellString(ot.dateFormatted, 'CellCenter')}
    ${cellString(ot.truck.plate, 'CellBold')}
    ${cellString(ot.driver.name)}
    ${cellNumber(ot.kpis.totalStops, 'CellInteger')}
    ${cellNumber(ot.assignedWeightKg)}
    ${cellString(ot.statusLabel, 'CellCenter')}
    ${cellString(ot.kpis.successRate === 100 ? '100% Conforme' : 'Con observaciones en entrega', 'CellCenter')}
   </Row>`
  }

  const worksheets = `
 <Worksheet ss:Name="1. Resumen de Órdenes">
  <Table ss:DefaultRowHeight="18">
   <Column ss:Width="100"/>
   <Column ss:Width="85"/>
   <Column ss:Width="75"/>
   <Column ss:Width="75"/>
   <Column ss:Width="160"/>
   <Column ss:Width="85"/>
   <Column ss:Width="85"/>
   <Column ss:Width="110"/>
   <Column ss:Width="75"/>
   <Column ss:Width="150"/>
   <Column ss:Width="95"/>
   <Column ss:Width="140"/>
   <Column ss:Width="90"/>
   <Column ss:Width="95"/>
   <Column ss:Width="85"/>
   <Column ss:Width="90"/>
   <Column ss:Width="90"/>
   <Column ss:Width="90"/>
   <Column ss:Width="90"/>
   <Column ss:Width="110"/>
   <Column ss:Width="95"/>
   <Column ss:Width="95"/>
   <Column ss:Width="110"/>
   <Column ss:Width="95"/>
   <Column ss:Width="110"/>
   ${rowsSheet1}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <Selected/>
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>4</SplitHorizontal>
   <TopRowBottomPane>4</TopRowBottomPane>
  </WorksheetOptions>
 </Worksheet>

 <Worksheet ss:Name="2. Detalle de Paradas">
  <Table ss:DefaultRowHeight="18">
   <Column ss:Width="90"/>
   <Column ss:Width="65"/>
   <Column ss:Width="180"/>
   <Column ss:Width="90"/>
   <Column ss:Width="200"/>
   <Column ss:Width="110"/>
   <Column ss:Width="110"/>
   <Column ss:Width="110"/>
   <Column ss:Width="80"/>
   <Column ss:Width="80"/>
   <Column ss:Width="85"/>
   <Column ss:Width="85"/>
   <Column ss:Width="100"/>
   <Column ss:Width="110"/>
   <Column ss:Width="90"/>
   <Column ss:Width="90"/>
   <Column ss:Width="100"/>
   <Column ss:Width="90"/>
   <Column ss:Width="140"/>
   <Column ss:Width="140"/>
   <Column ss:Width="95"/>
   <Column ss:Width="180"/>
   ${rowsSheet2}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>4</SplitHorizontal>
   <TopRowBottomPane>4</TopRowBottomPane>
  </WorksheetOptions>
 </Worksheet>

 <Worksheet ss:Name="3. Libro de Cobranzas">
  <Table ss:DefaultRowHeight="18">
   <Column ss:Width="95"/>
   <Column ss:Width="65"/>
   <Column ss:Width="180"/>
   <Column ss:Width="95"/>
   <Column ss:Width="120"/>
   <Column ss:Width="110"/>
   <Column ss:Width="65"/>
   <Column ss:Width="170"/>
   <Column ss:Width="110"/>
   <Column ss:Width="160"/>
   ${rowsSheet3}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>4</SplitHorizontal>
   <TopRowBottomPane>4</TopRowBottomPane>
  </WorksheetOptions>
 </Worksheet>

 <Worksheet ss:Name="4. Auditoría y Control">
  <Table ss:DefaultRowHeight="18">
   <Column ss:Width="100"/>
   <Column ss:Width="90"/>
   <Column ss:Width="95"/>
   <Column ss:Width="160"/>
   <Column ss:Width="90"/>
   <Column ss:Width="110"/>
   <Column ss:Width="120"/>
   <Column ss:Width="160"/>
   ${rowsSheet4}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>4</SplitHorizontal>
   <TopRowBottomPane>4</TopRowBottomPane>
  </WorksheetOptions>
 </Worksheet>`

  const workbookXml = getWorkbookTemplate(worksheets)
  downloadWorkbookXml(workbookXml, nombreArchivo)
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. EXPORTACIÓN GENERAL DE AUDITORÍA Y REVISIONES (2 HOJAS SEPARADAS)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Exporta el reporte de revisiones y sesiones de conteo a un Libro Excel con 2 pestañas:
 *  - Hoja 1: Resumen de Sesiones y Rampa (Tiempos, Lead Time y Despacho)
 *  - Hoja 2: Matriz Comparativa de Productos (Multi-sesión sin SKU con nombres limpios)
 */
export function exportarHistorialRevisionesAExcel(
  ordenes: OrdenRevisionHistorial[],
  nombreArchivo = 'Auditoria_Revisiones_Conteos_Venado.xls'
) {
  // ── HOJA 1: RESUMEN DE SESIONES ──
  const headersSheet1 = [
    'Código OT', 'Fecha', 'Ruta', 'Distribuidora', 'Placa Camión',
    'Chofer', 'Supervisor', 'Conteo Chofer (DRIVER_INITIAL)',
    'Revisión Supervisor (SUPERVISOR_DISCREPANCY)', 'Auditoría Semáforo (SUPERVISOR_SEMAPHORE)',
    '% Efectividad Chofer', 'Total Productos', 'Productos Cadena Frío',
    'Diferencia Neta Final', 'Estado Oficial'
  ]

  let rowsSheet1 = `
   <Row ss:Height="24">
    <Cell ss:MergeAcross="${headersSheet1.length - 1}" ss:StyleID="ReportTitle">
     <Data ss:Type="String">AUDITORÍA Y SESIONES DE CONTEO EN RAMPA - GRUPO VENADO</Data>
    </Cell>
   </Row>
   <Row ss:Height="18">
    <Cell ss:MergeAcross="${headersSheet1.length - 1}" ss:StyleID="ReportSubtitle">
     <Data ss:Type="String">Generado el ${new Date().toLocaleString('es-BO')} • Total de Órdenes Auditadas: ${ordenes.length}</Data>
    </Cell>
   </Row>
   <Row ss:Height="8"/>
   <Row ss:Height="24">
    ${headersSheet1.map((h) => cellHeader(h, 'HeaderGreen')).join('\n    ')}
   </Row>`

  for (const ot of ordenes) {
    const driverSession = ot.sessions.find((s) => s.sessionType === 'DRIVER_INITIAL')
    const supervisorSession = ot.sessions.find((s) => s.sessionType === 'SUPERVISOR_DISCREPANCY')
    const semaphoreSession = ot.sessions.find((s) => s.sessionType === 'SUPERVISOR_SEMAPHORE')

    rowsSheet1 += `
   <Row ss:Height="19">
    ${cellString(ot.orderCode, 'CellBold')}
    ${cellString(ot.dateFormatted, 'CellCenter')}
    ${cellString(ot.routeName)}
    ${cellString(ot.distributorName)}
    ${cellString(ot.truck.plate, 'CellBold')}
    ${cellString(ot.driver.name)}
    ${cellString(ot.supervisor?.name || 'Ing. Marco Antonio Vaca')}
    ${cellString(driverSession?.statusLabel || 'Completado', 'CellCenter')}
    ${cellString(supervisorSession?.statusLabel || (ot.summary.hasDiscrepancies ? 'Pendiente' : 'No requerida'), 'CellCenter')}
    ${cellString(semaphoreSession?.statusLabel || 'No auditada', 'CellCenter')}
    ${cellPercent(ot.summary.finalMatchRate)}
    ${cellNumber(ot.summary.totalProducts, 'CellInteger')}
    ${cellNumber(ot.summary.coldChainProductCount, 'CellInteger')}
    ${cellNumber(ot.summary.totalNetVarianceUnits, 'CellInteger')}
    ${cellString(ot.statusLabel, 'CellCenter')}
   </Row>`
  }

  // ── HOJA 2: MATRIZ DE PRODUCTOS ──
  const headersSheet2 = [
    'Código OT', 'Producto', 'Categoría', 'Cadena Frío',
    'Factor (Uds/Caja)',
    'Esperado (Cajas)', 'Esperado (Uds Sueltas)', 'Esperado Total (Uds)',
    'Chofer (Cajas)', 'Chofer (Uds Sueltas)', 'Chofer Total (Uds)', 'Dif. Chofer (Uds)', 'Estado Chofer',
    'Sup. (Cajas)', 'Sup. (Uds Sueltas)', 'Sup. Total (Uds)', 'Dif. Supervisor (Uds)', 'Dictamen Supervisor',
    'Semáforo Total (Uds)', 'Estado Semáforo',
    'Carga Final (Cajas)', 'Carga Final (Uds Sueltas)', 'Carga Final Total (Uds)', 'Dif. Final Oficial (Uds)',
    'Desglose Físico Final', 'Estado Consolidado',
    'Observaciones de Rampa'
  ]

  let rowsSheet2 = `
   <Row ss:Height="24">
    <Cell ss:MergeAcross="${headersSheet2.length - 1}" ss:StyleID="ReportTitle">
     <Data ss:Type="String">MATRIZ COMPARATIVA DE CONTEOS - DESGLOSE EN CAJAS Y UNIDADES ENTERAS</Data>
    </Cell>
   </Row>
   <Row ss:Height="18">
    <Cell ss:MergeAcross="${headersSheet2.length - 1}" ss:StyleID="ReportSubtitle">
     <Data ss:Type="String">Cruce de rampa con conteo de cajas cerradas y unidades sueltas sin decimales artificiales</Data>
    </Cell>
   </Row>
   <Row ss:Height="8"/>
   <Row ss:Height="24">
    ${headersSheet2.map((h) => cellHeader(h, 'HeaderNavy')).join('\n    ')}
   </Row>`

  for (const ot of ordenes) {
    for (const item of ot.items) {
      const factor = item.equivalenceBoxUnit && item.equivalenceBoxUnit > 0 ? item.equivalenceBoxUnit : 1
      
      const expectedBoxes = Math.floor(item.expectedQty / factor)
      const expectedUnits = item.expectedQty % factor

      const driverBoxes = item.driverCount.countedBoxes
      const driverUnits = item.driverCount.countedUnits
      
      const supBoxes = item.supervisorReview?.wasReviewed ? (item.supervisorReview.countedBoxes ?? 0) : null
      const supUnits = item.supervisorReview?.wasReviewed ? (item.supervisorReview.countedUnits ?? 0) : null
      const supQty = item.supervisorReview?.wasReviewed ? item.supervisorReview.countedQty : null
      const supVar = item.supervisorReview?.wasReviewed ? item.supervisorReview.varianceQty : null
      const supStatus = item.supervisorReview?.wasReviewed ? (item.supervisorReview.status === 'APPROVED' ? 'Aprobado' : item.supervisorReview.status) : 'No requerida'

      const semQty = item.semaphoreAudit?.wasAudited ? item.semaphoreAudit.countedQty : null
      const semStatus = item.semaphoreAudit?.wasAudited ? 'Auditado OK' : 'SKIPPED'

      const loadedQty = item.officialInventory.loadedQty
      const loadedBoxes = item.officialInventory.loadedBoxes
      const loadedUnits = item.officialInventory.loadedUnits
      const desgloseTexto = loadedBoxes > 0 && loadedUnits > 0 ? `${loadedBoxes} cj + ${loadedUnits} u` : loadedBoxes > 0 ? `${loadedBoxes} cj` : `${loadedUnits} u`

      const obs = [
        item.driverCount.observation ? `Chofer: ${item.driverCount.observation}` : '',
        item.supervisorReview?.observation ? `Sup: ${item.supervisorReview.observation}` : '',
        item.semaphoreAudit?.observation ? `Semáforo: ${item.semaphoreAudit.observation}` : '',
      ]
        .filter(Boolean)
        .join(' | ') || 'Conforme'

      rowsSheet2 += `
   <Row ss:Height="19">
    ${cellString(ot.orderCode, 'CellBold')}
    ${cellString(item.description)}
    ${cellString(item.category)}
    ${cellString(item.isColdChain ? 'SÍ' : 'NO', 'CellCenter')}
    ${cellNumber(item.equivalenceBoxUnit, 'CellInteger')}
    ${cellNumber(expectedBoxes, 'CellInteger')}
    ${cellNumber(expectedUnits, 'CellInteger')}
    ${cellNumber(item.expectedQty, 'CellInteger')}
    ${cellNumber(driverBoxes, 'CellInteger')}
    ${cellNumber(driverUnits, 'CellInteger')}
    ${cellNumber(item.driverCount.countedQty, 'CellInteger')}
    ${cellNumber(item.driverCount.varianceQty, 'CellInteger')}
    ${cellString(item.driverCount.status, 'CellCenter')}
    ${cellNumber(supBoxes, 'CellInteger')}
    ${cellNumber(supUnits, 'CellInteger')}
    ${cellNumber(supQty, 'CellInteger')}
    ${cellNumber(supVar, 'CellInteger')}
    ${cellString(supStatus, 'CellCenter')}
    ${cellNumber(semQty, 'CellInteger')}
    ${cellString(semStatus, 'CellCenter')}
    ${cellNumber(loadedBoxes, 'CellInteger')}
    ${cellNumber(loadedUnits, 'CellInteger')}
    ${cellNumber(loadedQty, 'CellInteger')}
    ${cellNumber(item.officialInventory.varianceQty, 'CellInteger')}
    ${cellString(desgloseTexto, 'CellBold')}
    ${cellString(item.officialInventory.status, 'CellCenter')}
    ${cellString(obs)}
   </Row>`
    }
  }

  const worksheets = `
 <Worksheet ss:Name="1. Resumen de Sesiones">
  <Table ss:DefaultRowHeight="18">
   <Column ss:Width="95"/>
   <Column ss:Width="85"/>
   <Column ss:Width="160"/>
   <Column ss:Width="160"/>
   <Column ss:Width="90"/>
   <Column ss:Width="150"/>
   <Column ss:Width="160"/>
   <Column ss:Width="140"/>
   <Column ss:Width="150"/>
   <Column ss:Width="140"/>
   <Column ss:Width="90"/>
   <Column ss:Width="85"/>
   <Column ss:Width="95"/>
   <Column ss:Width="95"/>
   <Column ss:Width="110"/>
   ${rowsSheet1}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <Selected/>
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>4</SplitHorizontal>
   <TopRowBottomPane>4</TopRowBottomPane>
  </WorksheetOptions>
 </Worksheet>

 <Worksheet ss:Name="2. Matriz de Productos">
  <Table ss:DefaultRowHeight="18">
   <Column ss:Width="90"/>
   <Column ss:Width="230"/>
   <Column ss:Width="110"/>
   <Column ss:Width="75"/>
   <Column ss:Width="105"/>
   <Column ss:Width="95"/>
   <Column ss:Width="105"/>
   <Column ss:Width="110"/>
   <Column ss:Width="95"/>
   <Column ss:Width="105"/>
   <Column ss:Width="110"/>
   <Column ss:Width="90"/>
   <Column ss:Width="95"/>
   <Column ss:Width="95"/>
   <Column ss:Width="105"/>
   <Column ss:Width="110"/>
   <Column ss:Width="90"/>
   <Column ss:Width="110"/>
   <Column ss:Width="100"/>
   <Column ss:Width="95"/>
   <Column ss:Width="95"/>
   <Column ss:Width="105"/>
   <Column ss:Width="110"/>
   <Column ss:Width="95"/>
   <Column ss:Width="120"/>
   <Column ss:Width="100"/>
   <Column ss:Width="190"/>
   ${rowsSheet2}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>4</SplitHorizontal>
   <TopRowBottomPane>4</TopRowBottomPane>
  </WorksheetOptions>
 </Worksheet>`

  const workbookXml = getWorkbookTemplate(worksheets)
  downloadWorkbookXml(workbookXml, nombreArchivo)
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. EXPORTACIÓN INDIVIDUAL DE ACTA DE CONCILIACIÓN DE UNA OT (2 HOJAS)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Exporta el acta individual de una Orden de Transporte específica a un Libro Excel con 2 pestañas:
 *  - Hoja 1: Acta y Carátula de Despacho (Datos del camión, chofer, supervisor, balance de carga y sellos)
 *  - Hoja 2: Matriz de Conciliación (Detalle producto a producto en cajas y unidades enteras)
 */
export function exportarOrdenRevisionIndividualAExcel(ot: OrdenRevisionHistorial) {
  // ── HOJA 1: ACTA Y CARÁTULA ──
  const totalEsperado = ot.items.reduce((acc, it) => acc + it.expectedQty, 0)
  const totalCargado = ot.items.reduce((acc, it) => acc + it.officialInventory.loadedQty, 0)

  const rowsSheet1 = `
   <Row ss:Height="26">
    <Cell ss:MergeAcross="3" ss:StyleID="ReportTitle">
     <Data ss:Type="String">ACTA OFICIAL DE CONCILIACIÓN Y DESPACHO DE CARGA</Data>
    </Cell>
   </Row>
   <Row ss:Height="18">
    <Cell ss:MergeAcross="3" ss:StyleID="ReportSubtitle">
     <Data ss:Type="String">Sistema de Control Logístico y Gestión de Rampa • Grupo Venado</Data>
    </Cell>
   </Row>
   <Row ss:Height="12"/>

   <Row ss:Height="20">
    ${cellHeader('DATO OPERATIVO', 'HeaderNavy')}
    <Cell ss:MergeAcross="2" ss:StyleID="HeaderNavy"><Data ss:Type="String">DETALLE</Data></Cell>
   </Row>

   <Row ss:Height="20">
    ${cellString('Código de Orden de Transporte', 'CellBold')}
    <Cell ss:MergeAcross="2" ss:StyleID="CellBold"><Data ss:Type="String">${xmlEscape(ot.orderCode)}</Data></Cell>
   </Row>
   <Row ss:Height="20">
    ${cellString('Fecha de Despacho')}
    <Cell ss:MergeAcross="2" ss:StyleID="CellText"><Data ss:Type="String">${xmlEscape(ot.dateFormatted)}</Data></Cell>
   </Row>
   <Row ss:Height="20">
    ${cellString('Ruta y Zona')}
    <Cell ss:MergeAcross="2" ss:StyleID="CellText"><Data ss:Type="String">${xmlEscape(ot.routeName)}</Data></Cell>
   </Row>
   <Row ss:Height="20">
    ${cellString('Centro / Distribuidora')}
    <Cell ss:MergeAcross="2" ss:StyleID="CellText"><Data ss:Type="String">${xmlEscape(ot.distributorName)}</Data></Cell>
   </Row>
   <Row ss:Height="20">
    ${cellString('Camión Asignado')}
    <Cell ss:MergeAcross="2" ss:StyleID="CellText"><Data ss:Type="String">${xmlEscape(ot.truck.plate)} (${xmlEscape(ot.truck.code)}) - ${xmlEscape(ot.truck.truckType)}</Data></Cell>
   </Row>
   <Row ss:Height="20">
    ${cellString('Cadena de Frío')}
    <Cell ss:MergeAcross="2" ss:StyleID="CellText"><Data ss:Type="String">${ot.truck.isRefrigerated ? 'Camión con Termo / Refrigerado' : 'Carga Seca'}</Data></Cell>
   </Row>
   <Row ss:Height="20">
    ${cellString('Chofer Responsable')}
    <Cell ss:MergeAcross="2" ss:StyleID="CellText"><Data ss:Type="String">${xmlEscape(ot.driver.name)} (CI: ${xmlEscape(ot.driver.document)})</Data></Cell>
   </Row>
   <Row ss:Height="20">
    ${cellString('Supervisor de Rampa')}
    <Cell ss:MergeAcross="2" ss:StyleID="CellText"><Data ss:Type="String">${xmlEscape(ot.supervisor?.name || 'Ing. Marco Antonio Vaca')}</Data></Cell>
   </Row>

   <Row ss:Height="12"/>
   <Row ss:Height="20">
    ${cellHeader('RESUMEN DE INVENTARIO', 'HeaderGreen')}
    <Cell ss:MergeAcross="2" ss:StyleID="HeaderGreen"><Data ss:Type="String">BALANCE FÍSICO DE UNIDADES</Data></Cell>
   </Row>
   <Row ss:Height="20">
    ${cellString('Total Unidades Esperadas (ERP)', 'CellBold')}
    <Cell ss:MergeAcross="2" ss:StyleID="CellNumber"><Data ss:Type="Number">${totalEsperado}</Data></Cell>
   </Row>
   <Row ss:Height="20">
    ${cellString('Total Unidades Físicas Cargadas', 'CellBold')}
    <Cell ss:MergeAcross="2" ss:StyleID="CellNumber"><Data ss:Type="Number">${totalCargado}</Data></Cell>
   </Row>
   <Row ss:Height="20">
    ${cellString('Diferencia Neta Final')}
    <Cell ss:MergeAcross="2" ss:StyleID="CellNumber"><Data ss:Type="Number">${ot.summary.totalNetVarianceUnits}</Data></Cell>
   </Row>
   <Row ss:Height="20">
    ${cellString('Estado Oficial de Salida')}
    <Cell ss:MergeAcross="2" ss:StyleID="CellBold"><Data ss:Type="String">INVENTARIO SELLADO Y APROBADO (${xmlEscape(ot.statusLabel)})</Data></Cell>
   </Row>`

  // ── HOJA 2: MATRIZ DE CONCILIACIÓN ──
  const headersSheet2 = [
    'Producto',
    'Factor (Uds/Caja)',
    'Esperado (Cajas)', 'Esperado (Uds Sueltas)', 'Esperado Total (Uds)',
    'Chofer (Cajas)', 'Chofer (Uds Sueltas)', 'Chofer Total (Uds)', 'Dif. Chofer (Uds)', 'Obs. Chofer',
    'Sup. (Cajas)', 'Sup. (Uds Sueltas)', 'Sup. Total (Uds)', 'Dif. Supervisor (Uds)', 'Dictamen Supervisor',
    'Semáforo Total (Uds)', 'Estado Semáforo',
    'Carga Final (Cajas)', 'Carga Final (Uds Sueltas)', 'Carga Final Autorizada (Uds)', 'Dif. Final Oficial (Uds)',
    'Desglose Físico Final', 'Estado Oficial'
  ]

  let rowsSheet2 = `
   <Row ss:Height="24">
    <Cell ss:MergeAcross="${headersSheet2.length - 1}" ss:StyleID="ReportTitle">
     <Data ss:Type="String">MATRIZ DE CONCILIACIÓN DE PRODUCTOS - ${xmlEscape(ot.orderCode)}</Data>
    </Cell>
   </Row>
   <Row ss:Height="18">
    <Cell ss:MergeAcross="${headersSheet2.length - 1}" ss:StyleID="ReportSubtitle">
     <Data ss:Type="String">Desglose físico por producto • Chofer: ${xmlEscape(ot.driver.name)} • Camión: ${xmlEscape(ot.truck.plate)}</Data>
    </Cell>
   </Row>
   <Row ss:Height="8"/>
   <Row ss:Height="24">
    ${headersSheet2.map((h) => cellHeader(h, 'HeaderNavy')).join('\n    ')}
   </Row>`

  for (const item of ot.items) {
    const factor = item.equivalenceBoxUnit && item.equivalenceBoxUnit > 0 ? item.equivalenceBoxUnit : 1
    
    const expectedBoxes = Math.floor(item.expectedQty / factor)
    const expectedUnits = item.expectedQty % factor

    const driverBoxes = item.driverCount.countedBoxes
    const driverUnits = item.driverCount.countedUnits

    const supBoxes = item.supervisorReview?.wasReviewed ? (item.supervisorReview.countedBoxes ?? 0) : null
    const supUnits = item.supervisorReview?.wasReviewed ? (item.supervisorReview.countedUnits ?? 0) : null
    const supQty = item.supervisorReview?.wasReviewed ? item.supervisorReview.countedQty : null
    const supVar = item.supervisorReview?.wasReviewed ? item.supervisorReview.varianceQty : null
    const supObs = item.supervisorReview?.observation || (item.supervisorReview?.wasReviewed ? 'Aprobado' : 'No requerida')

    const semQty = item.semaphoreAudit?.wasAudited ? item.semaphoreAudit.countedQty : null
    const semStatus = item.semaphoreAudit?.wasAudited ? 'Auditado OK' : 'SKIPPED'

    const loadedQty = item.officialInventory.loadedQty
    const loadedBoxes = item.officialInventory.loadedBoxes
    const loadedUnits = item.officialInventory.loadedUnits
    const desgloseTexto = loadedBoxes > 0 && loadedUnits > 0 ? `${loadedBoxes} cj + ${loadedUnits} u` : loadedBoxes > 0 ? `${loadedBoxes} cj` : `${loadedUnits} u`

    rowsSheet2 += `
   <Row ss:Height="19">
    ${cellString(item.description, 'CellBold')}
    ${cellNumber(item.equivalenceBoxUnit, 'CellInteger')}
    ${cellNumber(expectedBoxes, 'CellInteger')}
    ${cellNumber(expectedUnits, 'CellInteger')}
    ${cellNumber(item.expectedQty, 'CellInteger')}
    ${cellNumber(driverBoxes, 'CellInteger')}
    ${cellNumber(driverUnits, 'CellInteger')}
    ${cellNumber(item.driverCount.countedQty, 'CellInteger')}
    ${cellNumber(item.driverCount.varianceQty, 'CellInteger')}
    ${cellString(item.driverCount.observation || 'Conforme')}
    ${cellNumber(supBoxes, 'CellInteger')}
    ${cellNumber(supUnits, 'CellInteger')}
    ${cellNumber(supQty, 'CellInteger')}
    ${cellNumber(supVar, 'CellInteger')}
    ${cellString(supObs, 'CellCenter')}
    ${cellNumber(semQty, 'CellInteger')}
    ${cellString(semStatus, 'CellCenter')}
    ${cellNumber(loadedBoxes, 'CellInteger')}
    ${cellNumber(loadedUnits, 'CellInteger')}
    ${cellNumber(loadedQty, 'CellInteger')}
    ${cellNumber(item.officialInventory.varianceQty, 'CellInteger')}
    ${cellString(desgloseTexto, 'CellBold')}
    ${cellString(item.officialInventory.status, 'CellCenter')}
   </Row>`
  }

  const worksheets = `
 <Worksheet ss:Name="1. Acta y Datos del Viaje">
  <Table ss:DefaultRowHeight="18">
   <Column ss:Width="190"/>
   <Column ss:Width="130"/>
   <Column ss:Width="130"/>
   <Column ss:Width="130"/>
   ${rowsSheet1}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <Selected/>
  </WorksheetOptions>
 </Worksheet>

 <Worksheet ss:Name="2. Matriz de Productos">
  <Table ss:DefaultRowHeight="18">
   <Column ss:Width="240"/>
   <Column ss:Width="105"/>
   <Column ss:Width="95"/>
   <Column ss:Width="105"/>
   <Column ss:Width="110"/>
   <Column ss:Width="95"/>
   <Column ss:Width="105"/>
   <Column ss:Width="110"/>
   <Column ss:Width="90"/>
   <Column ss:Width="140"/>
   <Column ss:Width="95"/>
   <Column ss:Width="105"/>
   <Column ss:Width="110"/>
   <Column ss:Width="90"/>
   <Column ss:Width="110"/>
   <Column ss:Width="100"/>
   <Column ss:Width="95"/>
   <Column ss:Width="95"/>
   <Column ss:Width="105"/>
   <Column ss:Width="115"/>
   <Column ss:Width="95"/>
   <Column ss:Width="120"/>
   <Column ss:Width="100"/>
   ${rowsSheet2}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>4</SplitHorizontal>
   <TopRowBottomPane>4</TopRowBottomPane>
  </WorksheetOptions>
 </Worksheet>`

  const workbookXml = getWorkbookTemplate(worksheets)
  downloadWorkbookXml(workbookXml, `Acta_Liquidacion_${ot.orderCode}_${ot.dateIso}.xls`)
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. EXPORTACIÓN DE CIERRE LOGÍSTICO (ALMACÉN Y COBRANZAS)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Exporta el Cierre Logístico de Almacén (image.png) en formato Excel oficial.
 */
export function exportarCierreAlmacenIndividualAExcel(cierre: CierreOrdenTransporte) {
  const alm = cierre.almacen

  const headers = [
    'Código', 'Producto', 'U.M.', 'Cantidad Despacho', 'Cantidad Facturado',
    'Cantidad Bonificación', 'Facturado Total', 'Cantidad Devuelto',
    'Cantidad Faltante', 'Cantidad Sobrante', 'Valor Despacho (Bs)',
    'Valor Facturado (Bs)', 'Valor Bonificación (Bs)', 'Valor Devuelto (Bs)'
  ]

  let rows = `
   <Row ss:Height="26">
    <Cell ss:MergeAcross="${headers.length - 1}" ss:StyleID="ReportTitle">
     <Data ss:Type="String">CIERRE LOGÍSTICO DE ALMACÉN - GRUPO VENADO</Data>
    </Cell>
   </Row>
   <Row ss:Height="18">
    <Cell ss:MergeAcross="${headers.length - 1}" ss:StyleID="ReportSubtitle">
     <Data ss:Type="String">Liquidación Física de Retorno de Carga • N° Despacho: ${xmlEscape(alm.numeroDespacho)} • Fecha: ${xmlEscape(alm.fechaFormatted)}</Data>
    </Cell>
   </Row>
   <Row ss:Height="10"/>

   <Row ss:Height="20">
    ${cellHeader('DATO OPERATIVO', 'HeaderNavy')}
    <Cell ss:MergeAcross="3" ss:StyleID="HeaderNavy"><Data ss:Type="String">VALOR</Data></Cell>
    ${cellHeader('DATO OPERATIVO', 'HeaderNavy')}
    <Cell ss:MergeAcross="${headers.length - 7}" ss:StyleID="HeaderNavy"><Data ss:Type="String">VALOR</Data></Cell>
   </Row>
   <Row ss:Height="19">
    ${cellString('Fecha', 'CellBold')}
    <Cell ss:MergeAcross="3" ss:StyleID="CellText"><Data ss:Type="String">${xmlEscape(alm.fechaFormatted)}</Data></Cell>
    ${cellString('Placa / Camión', 'CellBold')}
    <Cell ss:MergeAcross="${headers.length - 7}" ss:StyleID="CellBold"><Data ss:Type="String">${xmlEscape(alm.placaCamion)}</Data></Cell>
   </Row>
   <Row ss:Height="19">
    ${cellString('Chofer', 'CellBold')}
    <Cell ss:MergeAcross="3" ss:StyleID="CellText"><Data ss:Type="String">${xmlEscape(alm.choferNombre)} - ${xmlEscape(alm.choferEmpresa)}</Data></Cell>
    ${cellString('N° Despacho (OT)', 'CellBold')}
    <Cell ss:MergeAcross="${headers.length - 7}" ss:StyleID="CellBold"><Data ss:Type="String">${xmlEscape(alm.numeroDespacho)}</Data></Cell>
   </Row>
   <Row ss:Height="19">
    ${cellString('Usuario', 'CellBold')}
    <Cell ss:MergeAcross="3" ss:StyleID="CellText"><Data ss:Type="String">${xmlEscape(alm.usuarioLiquidador)}</Data></Cell>
    ${cellString('Distribuidora', 'CellBold')}
    <Cell ss:MergeAcross="${headers.length - 7}" ss:StyleID="CellText"><Data ss:Type="String">${xmlEscape(cierre.distributorName)}</Data></Cell>
   </Row>
   <Row ss:Height="12"/>

   <Row ss:Height="24">
    ${headers.map((h) => cellHeader(h, 'HeaderNavy')).join('\n    ')}
   </Row>`

  for (const it of alm.items) {
    rows += `
   <Row ss:Height="19">
    ${cellString(it.codigo, 'CellBold')}
    ${cellString(it.producto)}
    ${cellString(it.um, 'CellCenter')}
    ${cellNumber(it.cantidadDespacho, 'CellInteger')}
    ${cellNumber(it.cantidadFacturado, 'CellInteger')}
    ${cellNumber(it.cantidadBonificacion, 'CellInteger')}
    ${cellNumber(it.facturadoTotal, 'CellBold')}
    ${cellNumber(it.cantidadDevuelto, 'CellInteger')}
    ${cellNumber(it.cantidadFaltante, 'CellInteger')}
    ${cellNumber(it.cantidadSobrante, 'CellInteger')}
    ${cellCurrency(it.valorDespacho)}
    ${cellCurrency(it.valorFacturado)}
    ${cellCurrency(it.valorBonificacion)}
    ${cellCurrency(it.valorDevuelto)}
   </Row>`
  }

  // Fila de Totales
  rows += `
   <Row ss:Height="22">
    <Cell ss:MergeAcross="2" ss:StyleID="HeaderNavy"><Data ss:Type="String">TOTALES GENERALES</Data></Cell>
    ${cellNumber(alm.totales.totalCantidadDespacho, 'HeaderNavy')}
    ${cellNumber(alm.totales.totalCantidadFacturado, 'HeaderNavy')}
    ${cellNumber(alm.totales.totalCantidadBonificacion, 'HeaderNavy')}
    ${cellNumber(alm.totales.totalFacturadoTotal, 'HeaderNavy')}
    ${cellNumber(alm.totales.totalCantidadDevuelto, 'HeaderNavy')}
    ${cellNumber(alm.totales.totalCantidadFaltante, 'HeaderNavy')}
    ${cellNumber(alm.totales.totalCantidadSobrante, 'HeaderNavy')}
    ${cellCurrency(alm.totales.totalValorDespacho, 'HeaderNavy')}
    ${cellCurrency(alm.totales.totalValorFacturado, 'HeaderNavy')}
    ${cellCurrency(alm.totales.totalValorBonificacion, 'HeaderNavy')}
    ${cellCurrency(alm.totales.totalValorDevuelto, 'HeaderNavy')}
   </Row>
   <Row ss:Height="20"/>

   <Row ss:Height="22">
    <Cell ss:MergeAcross="5" ss:StyleID="HeaderGreen"><Data ss:Type="String">CONFORMIDAD CHOFER</Data></Cell>
    <Cell ss:MergeAcross="${headers.length - 7}" ss:StyleID="HeaderGreen"><Data ss:Type="String">CONFORMIDAD ALMACÉN</Data></Cell>
   </Row>
   <Row ss:Height="30">
    <Cell ss:MergeAcross="5" ss:StyleID="CellText"><Data ss:Type="String">Firma: ${xmlEscape(alm.firmas.chofer.nombre)} (CI: ${xmlEscape(alm.firmas.chofer.ci)})</Data></Cell>
    <Cell ss:MergeAcross="${headers.length - 7}" ss:StyleID="CellText"><Data ss:Type="String">Firma: ${xmlEscape(alm.firmas.almacen.nombre)} (${xmlEscape(alm.firmas.almacen.cargo)})</Data></Cell>
   </Row>`

  const worksheets = `
 <Worksheet ss:Name="Cierre Almacén">
  <Table ss:DefaultRowHeight="18">
   <Column ss:Width="80"/>
   <Column ss:Width="240"/>
   <Column ss:Width="50"/>
   <Column ss:Width="105"/>
   <Column ss:Width="105"/>
   <Column ss:Width="120"/>
   <Column ss:Width="95"/>
   <Column ss:Width="105"/>
   <Column ss:Width="100"/>
   <Column ss:Width="100"/>
   <Column ss:Width="110"/>
   <Column ss:Width="110"/>
   <Column ss:Width="120"/>
   <Column ss:Width="110"/>
   ${rows}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <Selected/>
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>8</SplitHorizontal>
   <TopRowBottomPane>8</TopRowBottomPane>
  </WorksheetOptions>
 </Worksheet>`

  const workbookXml = getWorkbookTemplate(worksheets)
  downloadWorkbookXml(workbookXml, `Cierre_Almacen_${cierre.orderCode}_${cierre.dateIso}.xls`)
}

/**
 * Exporta el Cierre Logístico de Cobranzas (cierre_logistico_cobranza1.png y 2.png) en formato Excel oficial.
 */
export function exportarCierreCobranzasIndividualAExcel(cierre: CierreOrdenTransporte) {
  const cob = cierre.cobranza

  const rows = `
   <Row ss:Height="26">
    <Cell ss:MergeAcross="6" ss:StyleID="ReportTitle">
     <Data ss:Type="String">CIERRE LOGÍSTICO DE COBRANZAS - GRUPO VENADO</Data>
    </Cell>
   </Row>
   <Row ss:Height="18">
    <Cell ss:MergeAcross="6" ss:StyleID="ReportSubtitle">
     <Data ss:Type="String">Liquidación Financiera y Arqueo de Ruta • N° Despacho: ${xmlEscape(cob.numeroDespacho)} • Fecha: ${xmlEscape(cob.fechaFormatted)}</Data>
    </Cell>
   </Row>
   <Row ss:Height="10"/>

   <Row ss:Height="20">
    ${cellHeader('DATO OPERATIVO', 'HeaderNavy')}
    <Cell ss:MergeAcross="2" ss:StyleID="HeaderNavy"><Data ss:Type="String">VALOR</Data></Cell>
    ${cellHeader('DATO OPERATIVO', 'HeaderNavy')}
    <Cell ss:MergeAcross="1" ss:StyleID="HeaderNavy"><Data ss:Type="String">VALOR</Data></Cell>
   </Row>
   <Row ss:Height="19">
    ${cellString('Fecha', 'CellBold')}
    <Cell ss:MergeAcross="2" ss:StyleID="CellText"><Data ss:Type="String">${xmlEscape(cob.fechaFormatted)}</Data></Cell>
    ${cellString('Placa / Camión', 'CellBold')}
    <Cell ss:MergeAcross="1" ss:StyleID="CellBold"><Data ss:Type="String">${xmlEscape(cob.placaCamion)}</Data></Cell>
   </Row>
   <Row ss:Height="19">
    ${cellString('Chofer', 'CellBold')}
    <Cell ss:MergeAcross="2" ss:StyleID="CellText"><Data ss:Type="String">${xmlEscape(cob.choferNombre)} - ${xmlEscape(cob.choferEmpresa)}</Data></Cell>
    ${cellString('N° Despacho (OT)', 'CellBold')}
    <Cell ss:MergeAcross="1" ss:StyleID="CellBold"><Data ss:Type="String">${xmlEscape(cob.numeroDespacho)}</Data></Cell>
   </Row>
   <Row ss:Height="19">
    ${cellString('Usuario', 'CellBold')}
    <Cell ss:MergeAcross="2" ss:StyleID="CellText"><Data ss:Type="String">${xmlEscape(cob.usuarioLiquidador)}</Data></Cell>
    ${cellString('Distribuidora', 'CellBold')}
    <Cell ss:MergeAcross="1" ss:StyleID="CellText"><Data ss:Type="String">${xmlEscape(cierre.distributorName)}</Data></Cell>
   </Row>
   <Row ss:Height="12"/>

   <!-- TABLAS PRINCIPALES DE RESUMEN (3 BLOQUES COMO EN LA IMAGEN) -->
   <Row ss:Height="22">
    <Cell ss:MergeAcross="1" ss:StyleID="HeaderNavy"><Data ss:Type="String">RESUMEN FACTURACIÓN</Data></Cell>
    <Cell ss:MergeAcross="2" ss:StyleID="HeaderGreen"><Data ss:Type="String">RECAUDACIÓN Y MEDIOS DE PAGO</Data></Cell>
    <Cell ss:MergeAcross="1" ss:StyleID="HeaderAmber"><Data ss:Type="String">ESTADÍSTICAS PEDIDOS</Data></Cell>
   </Row>

   <Row ss:Height="19">
    ${cellString('IMPORTE FACTURADO', 'CellBold')}
    ${cellCurrency(cob.resumenFinanciero.importeFacturado, 'CellBold')}
    ${cellString('Efectivo', 'CellText')}
    ${cellCurrency(cob.resumenCobranzas.efectivo)}
    ${cellString('', 'CellText')}
    ${cellString('Despacho', 'CellBold')}
    ${cellNumber(cob.pedidos.despacho, 'CellInteger')}
   </Row>

   <Row ss:Height="19">
    ${cellString('Importe Bonificado', 'CellText')}
    ${cellCurrency(cob.resumenFinanciero.importeBonificado)}
    ${cellString('Transferencia', 'CellText')}
    ${cellCurrency(cob.resumenCobranzas.transferencia)}
    ${cellString('', 'CellText')}
    ${cellString('Facturado', 'CellBold')}
    ${cellNumber(cob.pedidos.facturado, 'CellInteger')}
   </Row>

   <Row ss:Height="19">
    ${cellString('Importe Entregado', 'CellText')}
    ${cellCurrency(cob.resumenFinanciero.importeEntregado)}
    ${cellString('Qr', 'CellText')}
    ${cellCurrency(cob.resumenCobranzas.qr)}
    ${cellString('', 'CellText')}
    ${cellString('Devuelto', 'CellBold')}
    ${cellNumber(cob.pedidos.devuelto, 'CellInteger')}
   </Row>

   <Row ss:Height="19">
    ${cellString('Importe Devuelto', 'CellText')}
    ${cellCurrency(cob.resumenFinanciero.importeDevuelto)}
    ${cellString('Cheque', 'CellText')}
    ${cellCurrency(cob.resumenCobranzas.cheque)}
    ${cellString('', 'CellText')}
    <Cell ss:MergeAcross="1" ss:StyleID="CellText"><Data ss:Type="String"></Data></Cell>
   </Row>

   <Row ss:Height="19">
    ${cellString('Valor Despacho', 'CellBold')}
    ${cellCurrency(cob.resumenFinanciero.valorDespacho, 'CellBold')}
    ${cellString('Cobranza Chofer', 'CellBold')}
    ${cellCurrency(cob.resumenCobranzas.cobranzaChofer, 'CellBold')}
    ${cellString('', 'CellText')}
    <Cell ss:MergeAcross="1" ss:StyleID="CellText"><Data ss:Type="String"></Data></Cell>
   </Row>

   <Row ss:Height="19">
    <Cell ss:MergeAcross="1" ss:StyleID="CellText"><Data ss:Type="String"></Data></Cell>
    ${cellString('Crédito', 'CellText')}
    ${cellCurrency(cob.resumenCobranzas.credito)}
    ${cellString('', 'CellText')}
    <Cell ss:MergeAcross="1" ss:StyleID="CellText"><Data ss:Type="String"></Data></Cell>
   </Row>

   <Row ss:Height="19">
    <Cell ss:MergeAcross="1" ss:StyleID="CellText"><Data ss:Type="String"></Data></Cell>
    ${cellString('Cobranza Cobrador', 'CellText')}
    ${cellCurrency(cob.resumenCobranzas.cobranzaCobrador)}
    ${cellString('', 'CellText')}
    <Cell ss:MergeAcross="1" ss:StyleID="CellText"><Data ss:Type="String"></Data></Cell>
   </Row>

   <Row ss:Height="22">
    <Cell ss:MergeAcross="1" ss:StyleID="CellText"><Data ss:Type="String"></Data></Cell>
    ${cellString('TOTAL A RENDIR', 'HeaderNavy')}
    ${cellCurrency(cob.resumenCobranzas.totalARendir, 'HeaderNavy')}
    ${cellString('', 'CellText')}
    <Cell ss:MergeAcross="1" ss:StyleID="CellText"><Data ss:Type="String"></Data></Cell>
   </Row>
   <Row ss:Height="15"/>

   <!-- DESGLOSE 1: CRÉDITOS -->
   <Row ss:Height="20">
    <Cell ss:MergeAcross="6" ss:StyleID="HeaderNavy"><Data ss:Type="String">1. DETALLE DE VENTAS A CRÉDITO</Data></Cell>
   </Row>
   <Row ss:Height="20">
    ${cellHeader('Cliente (Código)', 'HeaderNavy')}
    <Cell ss:MergeAcross="2" ss:StyleID="HeaderNavy"><Data ss:Type="String">Nombre del Cliente / Factura</Data></Cell>
    ${cellHeader('Monto (Bs)', 'HeaderNavy')}
    <Cell ss:MergeAcross="1" ss:StyleID="HeaderNavy"><Data ss:Type="String">Estado de Cobro</Data></Cell>
   </Row>` +
   cob.creditos.map(c => `
   <Row ss:Height="18">
    ${cellString(c.clienteCodigo, 'CellBold')}
    <Cell ss:MergeAcross="2" ss:StyleID="CellText"><Data ss:Type="String">${xmlEscape(c.clienteNombre)} (${xmlEscape(c.factura)})</Data></Cell>
    ${cellCurrency(c.monto)}
    <Cell ss:MergeAcross="1" ss:StyleID="CellText"><Data ss:Type="String">${xmlEscape(c.estado)}</Data></Cell>
   </Row>`).join('') + `

   <Row ss:Height="12"/>

   <!-- DESGLOSE 2: ARQUEO DE EFECTIVO (BS) -->
   <Row ss:Height="20">
    <Cell ss:MergeAcross="6" ss:StyleID="HeaderGreen"><Data ss:Type="String">2. ARQUEO FÍSICO DE EFECTIVO EN BOLIVIANOS (Bs ${cob.resumenCobranzas.efectivo.toFixed(2)})</Data></Cell>
   </Row>
   <Row ss:Height="20">
    ${cellHeader('Corte Bs', 'HeaderGreen')}
    ${cellHeader('Tipo', 'HeaderGreen')}
    ${cellHeader('Cantidad', 'HeaderGreen')}
    ${cellHeader('Monto (Bs)', 'HeaderGreen')}
    <Cell ss:MergeAcross="2" ss:StyleID="HeaderGreen"><Data ss:Type="String">Estado</Data></Cell>
   </Row>` +
   cob.cortesBs.map(k => `
   <Row ss:Height="18">
    ${cellString(k.denominacion, 'CellBold')}
    ${cellString(k.tipo, 'CellCenter')}
    ${cellNumber(k.cantidad, 'CellInteger')}
    ${cellCurrency(k.monto)}
    <Cell ss:MergeAcross="2" ss:StyleID="CellText"><Data ss:Type="String">Contado/Facturado/Cobrado - Efectivo</Data></Cell>
   </Row>`).join('') + `

   <Row ss:Height="12"/>

   <!-- DESGLOSE 3: TRANSFERENCIAS -->
   <Row ss:Height="20">
    <Cell ss:MergeAcross="6" ss:StyleID="HeaderNavy"><Data ss:Type="String">3. DETALLE DE TRANSFERENCIAS BANCARIAS (Bs ${cob.resumenCobranzas.transferencia.toFixed(2)})</Data></Cell>
   </Row>
   <Row ss:Height="20">
    ${cellHeader('Transacción', 'HeaderNavy')}
    ${cellHeader('Banco', 'HeaderNavy')}
    ${cellHeader('Cliente', 'HeaderNavy')}
    <Cell ss:MergeAcross="1" ss:StyleID="HeaderNavy"><Data ss:Type="String">Razón Social</Data></Cell>
    ${cellHeader('Monto (Bs)', 'HeaderNavy')}
    ${cellHeader('Estado', 'HeaderNavy')}
   </Row>` +
   cob.transferencias.map(t => `
   <Row ss:Height="18">
    ${cellString(t.transaccion, 'CellBold')}
    ${cellString(t.banco, 'CellCenter')}
    ${cellString(t.clienteCodigo, 'CellCenter')}
    <Cell ss:MergeAcross="1" ss:StyleID="CellText"><Data ss:Type="String">${xmlEscape(t.clienteNombre)}</Data></Cell>
    ${cellCurrency(t.monto)}
    ${cellString(t.estado)}
   </Row>`).join('') + `

   <Row ss:Height="12"/>

   <!-- DESGLOSE 4: PAGOS QR -->
   <Row ss:Height="20">
    <Cell ss:MergeAcross="6" ss:StyleID="HeaderNavy"><Data ss:Type="String">4. DETALLE DE COBROS CON QR INTERBANCARIO (Bs ${cob.resumenCobranzas.qr.toFixed(2)})</Data></Cell>
   </Row>
   <Row ss:Height="20">
    ${cellHeader('Transacción', 'HeaderNavy')}
    ${cellHeader('Banco', 'HeaderNavy')}
    ${cellHeader('Cliente', 'HeaderNavy')}
    <Cell ss:MergeAcross="1" ss:StyleID="HeaderNavy"><Data ss:Type="String">Razón Social</Data></Cell>
    ${cellHeader('Monto (Bs)', 'HeaderNavy')}
    ${cellHeader('Estado', 'HeaderNavy')}
   </Row>` +
   cob.pagosQr.map(q => `
   <Row ss:Height="18">
    ${cellString(q.transaccion, 'CellBold')}
    ${cellString(q.banco, 'CellCenter')}
    ${cellString(q.clienteCodigo, 'CellCenter')}
    <Cell ss:MergeAcross="1" ss:StyleID="CellText"><Data ss:Type="String">${xmlEscape(q.clienteNombre)}</Data></Cell>
    ${cellCurrency(q.monto)}
    ${cellString(q.estado)}
   </Row>`).join('') + `

   <Row ss:Height="12"/>

   <!-- DESGLOSE 5: DEVOLUCIONES NO COBRADAS -->
   <Row ss:Height="20">
    <Cell ss:MergeAcross="6" ss:StyleID="HeaderAmber"><Data ss:Type="String">5. DEVOLUCIONES Y RECHAZOS (NO COBRADO)</Data></Cell>
   </Row>
   <Row ss:Height="20">
    ${cellHeader('Cliente (Código)', 'HeaderAmber')}
    ${cellHeader('Factura', 'HeaderAmber')}
    <Cell ss:MergeAcross="2" ss:StyleID="HeaderAmber"><Data ss:Type="String">Nombre del Cliente / Motivo</Data></Cell>
    ${cellHeader('Monto (Bs)', 'HeaderAmber')}
    ${cellHeader('Estado', 'HeaderAmber')}
   </Row>` +
   cob.devolucionesNoCobradas.map(d => `
   <Row ss:Height="18">
    ${cellString(d.clienteCodigo, 'CellBold')}
    ${cellString(d.factura, 'CellCenter')}
    <Cell ss:MergeAcross="2" ss:StyleID="CellText"><Data ss:Type="String">${xmlEscape(d.clienteNombre)} ${d.motivo ? `- ${xmlEscape(d.motivo)}` : ''}</Data></Cell>
    ${cellCurrency(d.monto)}
    ${cellString(d.estado)}
   </Row>`).join('') + `

   <Row ss:Height="20"/>

   <!-- FIRMAS DE LOS 4 ROLES -->
   <Row ss:Height="22">
    <Cell ss:MergeAcross="1" ss:StyleID="HeaderNavy"><Data ss:Type="String">CHOFER</Data></Cell>
    <Cell ss:MergeAcross="1" ss:StyleID="HeaderNavy"><Data ss:Type="String">SUPERVISOR</Data></Cell>
    <Cell ss:MergeAcross="1" ss:StyleID="HeaderNavy"><Data ss:Type="String">CAJERO</Data></Cell>
    ${cellHeader('ADMINISTRADOR', 'HeaderNavy')}
   </Row>
   <Row ss:Height="30">
    <Cell ss:MergeAcross="1" ss:StyleID="CellText"><Data ss:Type="String">${xmlEscape(cob.firmas.chofer.nombre)}</Data></Cell>
    <Cell ss:MergeAcross="1" ss:StyleID="CellText"><Data ss:Type="String">${xmlEscape(cob.firmas.supervisor.nombre)}</Data></Cell>
    <Cell ss:MergeAcross="1" ss:StyleID="CellText"><Data ss:Type="String">${xmlEscape(cob.firmas.cajero.nombre)}</Data></Cell>
    ${cellString(cob.firmas.administrador.nombre, 'CellText')}
   </Row>`

  const worksheets = `
 <Worksheet ss:Name="Cierre Cobranzas">
  <Table ss:DefaultRowHeight="18">
   <Column ss:Width="160"/>
   <Column ss:Width="110"/>
   <Column ss:Width="140"/>
   <Column ss:Width="110"/>
   <Column ss:Width="140"/>
   <Column ss:Width="110"/>
   <Column ss:Width="200"/>
   ${rows}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <Selected/>
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>8</SplitHorizontal>
   <TopRowBottomPane>8</TopRowBottomPane>
  </WorksheetOptions>
 </Worksheet>`

  const workbookXml = getWorkbookTemplate(worksheets)
  downloadWorkbookXml(workbookXml, `Cierre_Cobranzas_${cierre.orderCode}_${cierre.dateIso}.xls`)
}

/**
 * Exporta el Cierre Logístico Completo (Almacén + Cobranzas) en un único libro con 2 hojas.
 */
export function exportarCierreLogisticoCompletoAExcel(cierre: CierreOrdenTransporte) {
  const alm = cierre.almacen
  const cob = cierre.cobranza

  // Hoja 1: Almacén
  const headersAlm = [
    'Código', 'Producto', 'U.M.', 'Cantidad Despacho', 'Cantidad Facturado',
    'Cantidad Bonificación', 'Facturado Total', 'Cantidad Devuelto',
    'Cantidad Faltante', 'Cantidad Sobrante', 'Valor Despacho (Bs)',
    'Valor Facturado (Bs)', 'Valor Bonificación (Bs)', 'Valor Devuelto (Bs)'
  ]

  let rowsAlm = `
   <Row ss:Height="26">
    <Cell ss:MergeAcross="${headersAlm.length - 1}" ss:StyleID="ReportTitle">
     <Data ss:Type="String">CIERRE LOGÍSTICO DE ALMACÉN - GRUPO VENADO</Data>
    </Cell>
   </Row>
   <Row ss:Height="18">
    <Cell ss:MergeAcross="${headersAlm.length - 1}" ss:StyleID="ReportSubtitle">
     <Data ss:Type="String">N° Despacho: ${xmlEscape(alm.numeroDespacho)} • Chofer: ${xmlEscape(alm.choferNombre)} • Placa: ${xmlEscape(alm.placaCamion)}</Data>
    </Cell>
   </Row>
   <Row ss:Height="8"/>
   <Row ss:Height="24">
    ${headersAlm.map((h) => cellHeader(h, 'HeaderNavy')).join('\n    ')}
   </Row>`

  for (const it of alm.items) {
    rowsAlm += `
   <Row ss:Height="19">
    ${cellString(it.codigo, 'CellBold')}
    ${cellString(it.producto)}
    ${cellString(it.um, 'CellCenter')}
    ${cellNumber(it.cantidadDespacho, 'CellInteger')}
    ${cellNumber(it.cantidadFacturado, 'CellInteger')}
    ${cellNumber(it.cantidadBonificacion, 'CellInteger')}
    ${cellNumber(it.facturadoTotal, 'CellBold')}
    ${cellNumber(it.cantidadDevuelto, 'CellInteger')}
    ${cellNumber(it.cantidadFaltante, 'CellInteger')}
    ${cellNumber(it.cantidadSobrante, 'CellInteger')}
    ${cellCurrency(it.valorDespacho)}
    ${cellCurrency(it.valorFacturado)}
    ${cellCurrency(it.valorBonificacion)}
    ${cellCurrency(it.valorDevuelto)}
   </Row>`
  }

  rowsAlm += `
   <Row ss:Height="22">
    <Cell ss:MergeAcross="2" ss:StyleID="HeaderNavy"><Data ss:Type="String">TOTALES</Data></Cell>
    ${cellNumber(alm.totales.totalCantidadDespacho, 'HeaderNavy')}
    ${cellNumber(alm.totales.totalCantidadFacturado, 'HeaderNavy')}
    ${cellNumber(alm.totales.totalCantidadBonificacion, 'HeaderNavy')}
    ${cellNumber(alm.totales.totalFacturadoTotal, 'HeaderNavy')}
    ${cellNumber(alm.totales.totalCantidadDevuelto, 'HeaderNavy')}
    ${cellNumber(alm.totales.totalCantidadFaltante, 'HeaderNavy')}
    ${cellNumber(alm.totales.totalCantidadSobrante, 'HeaderNavy')}
    ${cellCurrency(alm.totales.totalValorDespacho, 'HeaderNavy')}
    ${cellCurrency(alm.totales.totalValorFacturado, 'HeaderNavy')}
    ${cellCurrency(alm.totales.totalValorBonificacion, 'HeaderNavy')}
    ${cellCurrency(alm.totales.totalValorDevuelto, 'HeaderNavy')}
   </Row>`

  // Hoja 2: Cobranzas
  let rowsCob = `
   <Row ss:Height="26">
    <Cell ss:MergeAcross="6" ss:StyleID="ReportTitle">
     <Data ss:Type="String">CIERRE LOGÍSTICO DE COBRANZAS - GRUPO VENADO</Data>
    </Cell>
   </Row>
   <Row ss:Height="18">
    <Cell ss:MergeAcross="6" ss:StyleID="ReportSubtitle">
     <Data ss:Type="String">N° Despacho: ${xmlEscape(cob.numeroDespacho)} • Chofer: ${xmlEscape(cob.choferNombre)} • Total a Rendir: Bs ${cob.resumenCobranzas.totalARendir.toFixed(2)}</Data>
    </Cell>
   </Row>
   <Row ss:Height="8"/>

   <Row ss:Height="22">
    <Cell ss:MergeAcross="1" ss:StyleID="HeaderNavy"><Data ss:Type="String">FACTURACIÓN</Data></Cell>
    <Cell ss:MergeAcross="2" ss:StyleID="HeaderGreen"><Data ss:Type="String">RECAUDACIÓN</Data></Cell>
    <Cell ss:MergeAcross="1" ss:StyleID="HeaderAmber"><Data ss:Type="String">PEDIDOS</Data></Cell>
   </Row>
   <Row ss:Height="19">
    ${cellString('IMPORTE FACTURADO', 'CellBold')}
    ${cellCurrency(cob.resumenFinanciero.importeFacturado, 'CellBold')}
    ${cellString('Efectivo', 'CellText')}
    ${cellCurrency(cob.resumenCobranzas.efectivo)}
    ${cellString('', 'CellText')}
    ${cellString('Despacho', 'CellBold')}
    ${cellNumber(cob.pedidos.despacho, 'CellInteger')}
   </Row>
   <Row ss:Height="19">
    ${cellString('Importe Bonificado', 'CellText')}
    ${cellCurrency(cob.resumenFinanciero.importeBonificado)}
    ${cellString('Transferencia', 'CellText')}
    ${cellCurrency(cob.resumenCobranzas.transferencia)}
    ${cellString('', 'CellText')}
    ${cellString('Facturado', 'CellBold')}
    ${cellNumber(cob.pedidos.facturado, 'CellInteger')}
   </Row>
   <Row ss:Height="19">
    ${cellString('Importe Entregado', 'CellText')}
    ${cellCurrency(cob.resumenFinanciero.importeEntregado)}
    ${cellString('Qr', 'CellText')}
    ${cellCurrency(cob.resumenCobranzas.qr)}
    ${cellString('', 'CellText')}
    ${cellString('Devuelto', 'CellBold')}
    ${cellNumber(cob.pedidos.devuelto, 'CellInteger')}
   </Row>
   <Row ss:Height="19">
    ${cellString('Importe Devuelto', 'CellText')}
    ${cellCurrency(cob.resumenFinanciero.importeDevuelto)}
    ${cellString('Cheque', 'CellText')}
    ${cellCurrency(cob.resumenCobranzas.cheque)}
    ${cellString('', 'CellText')}
    <Cell ss:MergeAcross="1" ss:StyleID="CellText"><Data ss:Type="String"></Data></Cell>
   </Row>
   <Row ss:Height="19">
    ${cellString('Valor Despacho', 'CellBold')}
    ${cellCurrency(cob.resumenFinanciero.valorDespacho, 'CellBold')}
    ${cellString('Cobranza Chofer', 'CellBold')}
    ${cellCurrency(cob.resumenCobranzas.cobranzaChofer, 'CellBold')}
    ${cellString('', 'CellText')}
    <Cell ss:MergeAcross="1" ss:StyleID="CellText"><Data ss:Type="String"></Data></Cell>
   </Row>
   <Row ss:Height="22">
    <Cell ss:MergeAcross="1" ss:StyleID="CellText"><Data ss:Type="String"></Data></Cell>
    ${cellString('TOTAL A RENDIR', 'HeaderNavy')}
    ${cellCurrency(cob.resumenCobranzas.totalARendir, 'HeaderNavy')}
    ${cellString('', 'CellText')}
    <Cell ss:MergeAcross="1" ss:StyleID="CellText"><Data ss:Type="String"></Data></Cell>
   </Row>`

  const worksheets = `
 <Worksheet ss:Name="1. Cierre Almacén">
  <Table ss:DefaultRowHeight="18">
   <Column ss:Width="80"/>
   <Column ss:Width="240"/>
   <Column ss:Width="50"/>
   <Column ss:Width="105"/>
   <Column ss:Width="105"/>
   <Column ss:Width="120"/>
   <Column ss:Width="95"/>
   <Column ss:Width="105"/>
   <Column ss:Width="100"/>
   <Column ss:Width="100"/>
   <Column ss:Width="110"/>
   <Column ss:Width="110"/>
   <Column ss:Width="120"/>
   <Column ss:Width="110"/>
   ${rowsAlm}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <Selected/>
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>4</SplitHorizontal>
   <TopRowBottomPane>4</TopRowBottomPane>
  </WorksheetOptions>
 </Worksheet>

 <Worksheet ss:Name="2. Cierre Cobranzas">
  <Table ss:DefaultRowHeight="18">
   <Column ss:Width="160"/>
   <Column ss:Width="110"/>
   <Column ss:Width="140"/>
   <Column ss:Width="110"/>
   <Column ss:Width="140"/>
   <Column ss:Width="110"/>
   <Column ss:Width="200"/>
   ${rowsCob}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>4</SplitHorizontal>
   <TopRowBottomPane>4</TopRowBottomPane>
  </WorksheetOptions>
 </Worksheet>`

  const workbookXml = getWorkbookTemplate(worksheets)
  downloadWorkbookXml(workbookXml, `Cierre_Logistico_Consolidado_${cierre.orderCode}_${cierre.dateIso}.xls`)
}
