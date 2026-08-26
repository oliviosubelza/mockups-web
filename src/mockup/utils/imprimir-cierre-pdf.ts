import type { CierreOrdenTransporte } from '../cierre-logistico-data'

/**
 * Genera el HTML y activa la impresión en un iframe aislado para el Acta de Cierre de ALMACÉN.
 */
export function imprimirActaCierreAlmacenPDF(cierre: CierreOrdenTransporte): void {
  const alm = cierre.almacen

  const filasProductosHtml = alm.items
    .map((it, idx) => {
      const hasDev = it.cantidadDevuelto > 0
      const bgColor = hasDev ? '#fefce8' : idx % 2 === 0 ? '#ffffff' : '#f8fafc'
      const devColor = hasDev ? '#b45309' : '#64748b'
      const devWeight = hasDev ? 'bold' : 'normal'

      return `
        <tr style="background-color: ${bgColor};">
          <td style="text-align: center; color: #64748b;">${idx + 1}</td>
          <td style="font-family: monospace; font-weight: bold; color: #0f172a;">${it.codigo}</td>
          <td style="text-align: left; font-weight: 500; color: #1e293b;">${it.producto}</td>
          <td style="text-align: center; color: #64748b;">${it.um}</td>
          <td style="text-align: right; font-family: monospace;">${it.cantidadDespacho}</td>
          <td style="text-align: right; font-family: monospace;">${it.cantidadFacturado}</td>
          <td style="text-align: right; font-family: monospace;">${it.cantidadBonificacion}</td>
          <td style="text-align: right; font-family: monospace; font-weight: bold; background: rgba(0,0,0,0.02);">${it.facturadoTotal}</td>
          <td style="text-align: right; font-family: monospace; color: ${devColor}; font-weight: ${devWeight};">${it.cantidadDevuelto}</td>
          <td style="text-align: right; font-family: monospace; color: #94a3b8;">${it.cantidadFaltante || '-'}</td>
          <td style="text-align: right; font-family: monospace; color: #94a3b8;">${it.cantidadSobrante || '-'}</td>
          <td style="text-align: right; font-family: monospace;">${it.valorDespacho.toFixed(2)}</td>
          <td style="text-align: right; font-family: monospace; font-weight: bold;">${it.valorFacturado.toFixed(2)}</td>
          <td style="text-align: right; font-family: monospace; color: ${devColor}; font-weight: ${devWeight};">${it.valorDevuelto.toFixed(2)}</td>
        </tr>
      `
    })
    .join('')

  const fechaActualStr = new Date().toLocaleString('es-BO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>Acta de Cierre Almacén - ${cierre.orderCode}</title>
      <style>
        @page { size: landscape; margin: 8mm 8mm 8mm 8mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          color: #0f172a;
          background: #ffffff;
          padding: 4px;
          font-size: 9.5px;
          line-height: 1.35;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .header-box {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #0f172a;
          padding-bottom: 6px;
          margin-bottom: 8px;
        }
        .empresa-title { font-size: 13px; font-weight: 900; letter-spacing: -0.2px; text-transform: uppercase; color: #0f172a; }
        .empresa-sub { font-size: 8.5px; color: #475569; margin-top: 1px; }
        .title-badge {
          border: 1.5px solid #0f172a;
          background: #f1f5f9;
          padding: 4px 14px;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          text-align: center;
        }
        .meta-box { text-align: right; font-size: 9px; font-family: monospace; }
        .info-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px 12px;
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          padding: 6px 10px;
          border-radius: 4px;
          margin-bottom: 8px;
          font-size: 9px;
        }
        .info-item span { display: block; color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase; }
        .info-item strong { color: #0f172a; font-size: 9.5px; }
        .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 8px; }
        .summary-card { border: 1px solid #cbd5e1; background: #f8fafc; padding: 5px 8px; border-radius: 4px; }
        .summary-card .label { font-size: 8px; font-weight: bold; color: #475569; text-transform: uppercase; }
        .summary-card .qty { font-size: 11.5px; font-weight: bold; font-family: monospace; margin-top: 1px; color: #0f172a; }
        .summary-card .val { font-size: 9px; color: #334155; font-family: monospace; margin-top: 1px; }
        table.prod-table { width: 100%; border-collapse: collapse; font-size: 8px; margin-bottom: 8px; }
        table.prod-table thead { display: table-header-group; }
        table.prod-table th { background: #f1f5f9; color: #0f172a; border: 1px solid #cbd5e1; padding: 3.5px 4px; font-weight: bold; text-align: center; }
        table.prod-table td { border: 1px solid #cbd5e1; padding: 3px 4px; color: #1e293b; }
        table.prod-table tr { page-break-inside: avoid; break-inside: avoid; }
        table.prod-table tfoot { display: table-footer-group; font-weight: bold; background: #e2e8f0; font-size: 8px; }
        
        .firmas-container {
          page-break-inside: avoid;
          break-inside: avoid;
          margin-top: 18px;
          padding-top: 12px;
          border-top: 1px solid #cbd5e1;
        }
        .declaracion-text { font-size: 8.5px; color: #475569; font-style: italic; text-align: justify; margin-bottom: 12px; line-height: 1.35; }
        .firmas-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 40px; margin-top: 10px; }
        .firma-card {
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          border-radius: 4px;
          padding: 8px 12px;
          text-align: center;
        }
        .firma-area {
          height: 48px;
          border-bottom: 1px dashed #94a3b8;
          margin-bottom: 6px;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding-bottom: 2px;
        }
        .firma-area span {
          font-size: 8px;
          color: #94a3b8;
          font-style: italic;
        }
        .firma-card strong { font-size: 9.5px; color: #0f172a; display: block; }
        .firma-card .role { color: #475569; font-size: 8px; margin-top: 1px; }
        .firma-card .badge-rol {
          display: inline-block;
          font-size: 7.5px;
          font-weight: bold;
          color: #1e293b;
          background: #e2e8f0;
          padding: 1px 6px;
          border-radius: 3px;
          margin-top: 4px;
          text-transform: uppercase;
        }

        .footer-line { border-top: 1px solid #e2e8f0; margin-top: 12px; padding-top: 4px; display: flex; justify-content: space-between; font-size: 7.5px; color: #94a3b8; font-family: monospace; }
      </style>
    </head>
    <body>
      <div class="header-box">
        <div>
          <div class="empresa-title">Distribuidora DISCRUZ</div>
        </div>
        <div>
          <div class="title-badge">ACTA DE CIERRE DE ALMACÉN</div>
        </div>
        <div class="meta-box">
          <div><span style="color: #64748b;">N° DESPACHO:</span> <strong>${cierre.orderCode}</strong></div>
          <div><span style="color: #64748b;">Fecha Emisión:</span> <strong>${cierre.dateFormatted}</strong></div>
          <div><span style="color: #64748b;">Estado:</span> <strong style="color: #047857;">${cierre.statusLabel}</strong></div>
        </div>
      </div>

      <div class="info-grid">
        <div class="info-item"><span>N° Despacho / OT:</span><strong>${cierre.orderCode}</strong></div>
        <div class="info-item"><span>Fecha de Salida:</span><strong>${cierre.dateFormatted}</strong></div>
        <div class="info-item"><span>Ruta / Zona:</span><strong>${cierre.routeName}</strong></div>
        <div class="info-item"><span>Placa / Vehículo:</span><strong>${cierre.truckPlate} (${cierre.truckType})</strong></div>
        <div class="info-item"><span>Chofer Responsable:</span><strong>${cierre.driverName}</strong></div>
        <div class="info-item"><span>C.I. Chofer:</span><strong>${cierre.driverCi}</strong></div>
        <div class="info-item"><span>Empresa:</span><strong>${cierre.driverEmpresa}</strong></div>
        <div class="info-item"><span>Usuario:</span><strong>${alm.usuarioLiquidador}</strong></div>
      </div>

      <div class="summary-grid">
        <div class="summary-card">
          <div class="label">1. Total Despacho</div>
          <div class="qty">${alm.totales.totalCantidadDespacho} unidades</div>
          <div class="val">Valor Total: <strong>Bs ${alm.totales.totalValorDespacho.toFixed(2)}</strong></div>
        </div>
        <div class="summary-card">
          <div class="label">2. Total Facturado</div>
          <div class="qty" style="color: #047857;">${alm.totales.totalCantidadFacturado} unidades</div>
          <div class="val">Valor Total: <strong>Bs ${alm.totales.totalValorFacturado.toFixed(2)}</strong></div>
        </div>
        <div class="summary-card">
          <div class="label">3. Bonificaciones</div>
          <div class="qty" style="color: #6b21a8;">${alm.totales.totalCantidadBonificacion} unidades</div>
          <div class="val">Valor Total: <strong>Bs ${alm.totales.totalValorBonificacion.toFixed(2)}</strong></div>
        </div>
        <div class="summary-card">
          <div class="label">4. Retorno / Devolución</div>
          <div class="qty" style="color: #b45309;">${alm.totales.totalCantidadDevuelto} unidades</div>
          <div class="val">Valor Total: <strong>Bs ${alm.totales.totalValorDevuelto.toFixed(2)}</strong></div>
        </div>
      </div>

      <div>
        <div style="font-size: 8.5px; font-weight: bold; text-transform: uppercase; color: #334155; margin-bottom: 3px; display: flex; justify-content: space-between;">
          <span>Conciliación Física de Carga y Retorno por Producto (${alm.items.length} productos registrados):</span>
          <span style="font-family: monospace; font-size: 8px; color: #64748b;">Valores monetarios expresados en Bolivianos (Bs)</span>
        </div>

        <table class="prod-table">
          <thead>
            <tr>
              <th style="width: 25px;">N°</th>
              <th style="width: 65px;">Código</th>
              <th style="text-align: left; min-width: 170px;">Descripción del Producto</th>
              <th style="width: 35px;">U.M.</th>
              <th style="width: 50px; text-align: right;">Cant. Desp.</th>
              <th style="width: 50px; text-align: right;">Cant. Fact.</th>
              <th style="width: 45px; text-align: right;">Cant. Bon.</th>
              <th style="width: 55px; text-align: right; font-weight: bold;">Fact. Total</th>
              <th style="width: 50px; text-align: right;">Cant. Dev.</th>
              <th style="width: 40px; text-align: right;">Falt.</th>
              <th style="width: 40px; text-align: right;">Sobr.</th>
              <th style="width: 60px; text-align: right;">Valor Desp.</th>
              <th style="width: 60px; text-align: right;">Valor Fact.</th>
              <th style="width: 60px; text-align: right;">Valor Dev.</th>
            </tr>
          </thead>
          <tbody>
            ${filasProductosHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4" style="text-align: right; padding: 4px;">TOTALES GENERALES (BS):</td>
              <td style="text-align: right; font-family: monospace;">${alm.totales.totalCantidadDespacho}</td>
              <td style="text-align: right; font-family: monospace;">${alm.totales.totalCantidadFacturado}</td>
              <td style="text-align: right; font-family: monospace;">${alm.totales.totalCantidadBonificacion}</td>
              <td style="text-align: right; font-family: monospace; font-weight: 900;">${alm.totales.totalFacturadoTotal}</td>
              <td style="text-align: right; font-family: monospace;">${alm.totales.totalCantidadDevuelto}</td>
              <td style="text-align: right; font-family: monospace;">${alm.totales.totalCantidadFaltante}</td>
              <td style="text-align: right; font-family: monospace;">${alm.totales.totalCantidadSobrante}</td>
              <td style="text-align: right; font-family: monospace;">Bs ${alm.totales.totalValorDespacho.toFixed(2)}</td>
              <td style="text-align: right; font-family: monospace;">Bs ${alm.totales.totalValorFacturado.toFixed(2)}</td>
              <td style="text-align: right; font-family: monospace;">Bs ${alm.totales.totalValorDevuelto.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="firmas-container">
        <div class="declaracion-text">
          <strong>DECLARACIÓN DE CONFORMIDAD DE ALMACÉN:</strong> El Chofer Responsable y el Encargado de Rampa/Almacén
          certifican que las cantidades despachadas, entregadas y retornadas corresponden fielmente al inventario físico verificado.
        </div>

        <div class="firmas-grid">
          <div class="firma-card">
            <div class="firma-area"><span>Espacio para Firma / Sello</span></div>
            <strong>${alm.firmas.chofer.nombre}</strong>
            <div class="role">Chofer Repartidor • CI: ${alm.firmas.chofer.ci}</div>
            <div class="role">Empresa: ${cierre.driverEmpresa}</div>
            <div class="badge-rol">Conformidad Chofer</div>
          </div>
          <div class="firma-card">
            <div class="firma-area"><span>Espacio para Firma / Sello</span></div>
            <strong>${alm.firmas.almacen.nombre}</strong>
            <div class="role">${alm.firmas.almacen.cargo}</div>
            <div class="role">Rampa de Descarga Almacén Central</div>
            <div class="badge-rol">Conformidad Almacén</div>
          </div>
        </div>

        <div class="footer-line">
          <span>Distribuidora DISCRUZ • Cierre de Almacén</span>
          <span>Generado el ${fechaActualStr}</span>
        </div>
      </div>
    </body>
    </html>
  `

  ejecutarImpresionEnIframe(htmlContent)
}

/**
 * Genera el HTML y activa la impresión en un iframe aislado para el Acta de Cierre de COBRANZAS Y CAJA.
 * Con diseño balanceado de 2 columnas de ancho completo para que las tablas no se corten
 * y una sección de firmas amplia y protegida con espacio real para firmar.
 */
export function imprimirActaCierreCobranzasPDF(cierre: CierreOrdenTransporte): void {
  const cob = cierre.cobranza

  const filasCortesHtml = cob.cortesBs
    .map(
      (c) => `
        <tr>
          <td style="font-family: monospace; font-weight: bold; padding: 3px 6px;">${c.denominacion}</td>
          <td style="text-align: center; color: #64748b; padding: 3px 6px;">${c.tipo}</td>
          <td style="text-align: right; font-family: monospace; padding: 3px 6px;">${c.cantidad}</td>
          <td style="text-align: right; font-family: monospace; font-weight: bold; padding: 3px 6px;">Bs ${c.monto.toFixed(2)}</td>
        </tr>
      `
    )
    .join('')

  const filasTransferenciasHtml =
    cob.transferencias.length > 0
      ? cob.transferencias
          .map(
            (t) => `
            <tr>
              <td style="font-family: monospace; font-weight: bold; padding: 3px 6px; width: 22%;">${t.transaccion}</td>
              <td style="font-weight: 500; padding: 3px 6px; width: 18%;">${t.banco}</td>
              <td style="padding: 3px 6px; width: 35%;">${t.clienteNombre} <span style="color:#64748b; font-size:7.5px;">(${t.clienteCodigo})</span></td>
              <td style="text-align: right; font-family: monospace; font-weight: bold; padding: 3px 6px; width: 25%;">Bs ${t.monto.toFixed(2)}</td>
            </tr>
          `
          )
          .join('')
      : `<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 5px;">No se registraron transferencias directas</td></tr>`

  const filasQrHtml =
    cob.pagosQr.length > 0
      ? cob.pagosQr
          .map(
            (q) => `
            <tr>
              <td style="font-family: monospace; font-weight: bold; padding: 3px 6px; width: 22%;">${q.transaccion}</td>
              <td style="font-weight: 500; padding: 3px 6px; width: 18%;">${q.banco}</td>
              <td style="padding: 3px 6px; width: 35%;">${q.clienteNombre} <span style="color:#64748b; font-size:7.5px;">(${q.clienteCodigo})</span></td>
              <td style="text-align: right; font-family: monospace; font-weight: bold; padding: 3px 6px; width: 25%;">Bs ${q.monto.toFixed(2)}</td>
            </tr>
          `
          )
          .join('')
      : `<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 5px;">No se registraron cobros QR</td></tr>`

  const filasCreditosHtml =
    cob.creditos.length > 0
      ? cob.creditos
          .map(
            (cr) => `
            <tr>
              <td style="font-family: monospace; font-weight: bold; padding: 3px 6px; width: 22%;">${cr.factura}</td>
              <td style="padding: 3px 6px; width: 53%;">${cr.clienteNombre} <span style="color:#64748b; font-size:7.5px;">(${cr.clienteCodigo})</span></td>
              <td style="text-align: right; font-family: monospace; font-weight: bold; color: #6b21a8; padding: 3px 6px; width: 25%;">Bs ${cr.monto.toFixed(2)}</td>
            </tr>
          `
          )
          .join('')
      : `<tr><td colspan="3" style="text-align: center; color: #94a3b8; padding: 5px;">Sin ventas a crédito</td></tr>`

  const filasDevolucionesHtml =
    cob.devolucionesNoCobradas.length > 0
      ? cob.devolucionesNoCobradas
          .map(
            (d) => `
            <tr>
              <td style="font-family: monospace; font-weight: bold; padding: 3px 6px; width: 22%;">${d.factura}</td>
              <td style="padding: 3px 6px; width: 35%;">${d.clienteNombre}</td>
              <td style="font-style: italic; color: #64748b; padding: 3px 6px; width: 23%; font-size: 7.5px;">${d.motivo || 'Rechazo'}</td>
              <td style="text-align: right; font-family: monospace; font-weight: bold; color: #b45309; padding: 3px 6px; width: 20%;">Bs ${d.monto.toFixed(2)}</td>
            </tr>
          `
          )
          .join('')
      : `<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 5px;">Sin facturas devueltas</td></tr>`

  const fechaActualStr = new Date().toLocaleString('es-BO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>Acta de Cierre Cobranzas - ${cierre.orderCode}</title>
      <style>
        @page { size: landscape; margin: 8mm 8mm 8mm 8mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          color: #0f172a;
          background: #ffffff;
          padding: 4px;
          font-size: 9.5px;
          line-height: 1.35;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        .header-box {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #0f172a;
          padding-bottom: 6px;
          margin-bottom: 8px;
        }
        .empresa-title { font-size: 13px; font-weight: 900; letter-spacing: -0.2px; text-transform: uppercase; color: #0f172a; }
        .empresa-sub { font-size: 8.5px; color: #475569; margin-top: 1px; }
        .title-badge {
          border: 1.5px solid #0f172a;
          background: #f1f5f9;
          padding: 4px 14px;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          text-align: center;
        }
        .meta-box { text-align: right; font-size: 9px; font-family: monospace; }

        .info-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px 12px;
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          padding: 6px 10px;
          border-radius: 4px;
          margin-bottom: 8px;
          font-size: 9px;
        }
        .info-item span { display: block; color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase; }
        .info-item strong { color: #0f172a; font-size: 9.5px; }

        .summary-3col {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-bottom: 10px;
        }
        .summary-box {
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          padding: 6px 10px;
          border-radius: 4px;
          font-size: 9px;
        }
        .summary-box .title {
          font-size: 8.5px;
          font-weight: bold;
          text-transform: uppercase;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 3px;
          margin-bottom: 4px;
          color: #1e293b;
        }
        .summary-row {
          display: flex;
          justify-content: space-between;
          padding: 2px 0;
          border-bottom: 1px dashed #f1f5f9;
        }
        .summary-row.total {
          border-top: 1px solid #0f172a;
          border-bottom: none;
          font-weight: bold;
          margin-top: 3px;
          padding-top: 3px;
          color: #0f172a;
        }

        /* DISEÑO DE 2 COLUMNAS EQUILIBRADAS DE ANCHO COMPLETO (50% / 50%) */
        .details-container {
          display: grid;
          grid-template-columns: 48% 50%;
          gap: 16px;
          margin-bottom: 10px;
        }

        .section-box {
          margin-bottom: 8px;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .section-header {
          font-size: 8.5px;
          font-weight: bold;
          text-transform: uppercase;
          color: #334155;
          margin-bottom: 3px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #cbd5e1;
          padding-bottom: 2px;
        }

        table.detail-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 8px;
          table-layout: fixed;
        }
        table.detail-table th {
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          padding: 3px 6px;
          font-weight: bold;
          text-align: left;
          color: #0f172a;
        }
        table.detail-table td {
          border: 1px solid #cbd5e1;
          padding: 3px 6px;
          color: #1e293b;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        table.detail-table tr {
          page-break-inside: avoid;
          break-inside: avoid;
        }

        /* SECCIÓN DE CONFORMIDAD Y FIRMAS AMPLIAS (PROTEGIDAS CONTRA CORTES) */
        .firmas-container {
          page-break-inside: avoid;
          break-inside: avoid;
          margin-top: 16px;
          padding-top: 10px;
          border-top: 1px solid #cbd5e1;
        }
        .declaracion-text {
          font-size: 8px;
          color: #475569;
          font-style: italic;
          text-align: justify;
          margin-bottom: 10px;
          line-height: 1.35;
        }
        .firmas-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
          margin-top: 6px;
        }
        .firma-card {
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          border-radius: 4px;
          padding: 8px 6px;
          text-align: center;
          min-height: 96px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .firma-area {
          height: 44px;
          border-bottom: 1px dashed #94a3b8;
          margin-bottom: 6px;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding-bottom: 2px;
        }
        .firma-area span {
          font-size: 7.5px;
          color: #94a3b8;
          font-style: italic;
        }
        .firma-card strong {
          font-size: 9px;
          color: #0f172a;
          display: block;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .firma-card .role {
          color: #475569;
          font-size: 7.5px;
          margin-top: 1px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .firma-card .badge-rol {
          display: inline-block;
          font-size: 7px;
          font-weight: bold;
          color: #1e293b;
          background: #e2e8f0;
          padding: 1px 4px;
          border-radius: 3px;
          margin-top: 3px;
          text-transform: uppercase;
        }

        .footer-line {
          border-top: 1px solid #e2e8f0;
          margin-top: 10px;
          padding-top: 3px;
          display: flex;
          justify-content: space-between;
          font-size: 7.5px;
          color: #94a3b8;
          font-family: monospace;
        }
      </style>
    </head>
    <body>
      <!-- CABECERA INSTITUCIONAL -->
      <div class="header-box">
        <div>
          <div class="empresa-title">Distribuidora DISCRUZ</div>
        </div>
        <div>
          <div class="title-badge">ACTA DE CIERRE DE COBRANZAS</div>
        </div>
        <div class="meta-box">
          <div><span style="color: #64748b;">N° DESPACHO:</span> <strong>${cierre.orderCode}</strong></div>
          <div><span style="color: #64748b;">Fecha Emisión:</span> <strong>${cierre.dateFormatted}</strong></div>
          <div><span style="color: #64748b;">Estado:</span> <strong style="color: #047857;">100% CUADRADO</strong></div>
        </div>
      </div>

      <!-- FICHA TÉCNICA OPERATIVA -->
      <div class="info-grid">
        <div class="info-item"><span>N° Despacho / OT:</span><strong>${cierre.orderCode}</strong></div>
        <div class="info-item"><span>Fecha de Salida:</span><strong>${cierre.dateFormatted}</strong></div>
        <div class="info-item"><span>Chofer Repartidor:</span><strong>${cierre.driverName}</strong></div>
        <div class="info-item"><span>C.I. Chofer:</span><strong>${cierre.driverCi}</strong></div>
        <div class="info-item"><span>Placa / Vehículo:</span><strong>${cierre.truckPlate} (${cierre.truckType})</strong></div>
        <div class="info-item"><span>Empresa:</span><strong>${cierre.driverEmpresa}</strong></div>
        <div class="info-item"><span>Usuario:</span><strong>${cob.usuarioLiquidador}</strong></div>
        <div class="info-item"><span>Pedidos Gestionados:</span><strong>${cob.pedidos.despacho} Desp. / ${cob.pedidos.facturado} Fact. / ${cob.pedidos.devuelto} Dev.</strong></div>
      </div>

      <!-- 3 BLOQUES DE RESUMEN FINANCIERO -->
      <div class="summary-3col">
        <div class="summary-box">
          <div class="title">1. Resumen de Facturación</div>
          <div class="summary-row"><span>Importe Facturado:</span><strong style="font-family: monospace;">Bs ${cob.resumenFinanciero.importeFacturado.toFixed(2)}</strong></div>
          <div class="summary-row"><span>Importe Bonificado:</span><span style="font-family: monospace;">Bs ${cob.resumenFinanciero.importeBonificado.toFixed(2)}</span></div>
          <div class="summary-row"><span>Importe Entregado (F+B):</span><span style="font-family: monospace; font-weight: 600;">Bs ${cob.resumenFinanciero.importeEntregado.toFixed(2)}</span></div>
          <div class="summary-row"><span>Importe Devuelto:</span><span style="font-family: monospace; color: #b45309;">Bs ${cob.resumenFinanciero.importeDevuelto.toFixed(2)}</span></div>
          <div class="summary-row total"><span>Valor Despacho Total:</span><strong style="font-family: monospace;">Bs ${cob.resumenFinanciero.valorDespacho.toFixed(2)}</strong></div>
        </div>

        <div class="summary-box" style="background: #f0fdf4; border-color: #bbf7d0;">
          <div class="title" style="color: #166534;">2. Recaudación en Mano (Chofer)</div>
          <div class="summary-row"><span>Efectivo Físico:</span><span style="font-family: monospace;">Bs ${cob.resumenCobranzas.efectivo.toFixed(2)}</span></div>
          <div class="summary-row"><span>Transferencias Bancarias:</span><span style="font-family: monospace;">Bs ${cob.resumenCobranzas.transferencia.toFixed(2)}</span></div>
          <div class="summary-row"><span>Cobros QR:</span><span style="font-family: monospace;">Bs ${cob.resumenCobranzas.qr.toFixed(2)}</span></div>
          <div class="summary-row"><span>Cheques:</span><span style="font-family: monospace;">Bs ${cob.resumenCobranzas.cheque.toFixed(2)}</span></div>
          <div class="summary-row total" style="color: #14532d;"><span>Cobranza Chofer Total:</span><strong style="font-family: monospace;">Bs ${cob.resumenCobranzas.cobranzaChofer.toFixed(2)}</strong></div>
        </div>

        <div class="summary-box" style="background: #eff6ff; border-color: #bfdbfe;">
          <div class="title" style="color: #1e40af;">3. Conciliación y Rendición Total</div>
          <div class="summary-row"><span>Cobranza en Mano:</span><span style="font-family: monospace;">Bs ${cob.resumenCobranzas.cobranzaChofer.toFixed(2)}</span></div>
          <div class="summary-row"><span>Ventas a Crédito Autorizadas:</span><span style="font-family: monospace;">Bs ${cob.resumenCobranzas.credito.toFixed(2)}</span></div>
          <div class="summary-row"><span>Cobranza Cobrador:</span><span style="font-family: monospace;">Bs ${cob.resumenCobranzas.cobranzaCobrador.toFixed(2)}</span></div>
          <div class="summary-row total" style="color: #1e3a8a; font-size: 10px; background: #dbeafe; padding: 4px; border-radius: 3px;">
            <span>TOTAL RENDIDO EN CAJA:</span>
            <strong style="font-family: monospace;">Bs ${cob.resumenCobranzas.totalARendir.toFixed(2)}</strong>
          </div>
        </div>
      </div>

      <!-- DESGLOSE EN 2 COLUMNAS AMPLIAS (SIN CORTES DE INFORMACIÓN) -->
      <div class="details-container">
        <!-- COLUMNA IZQUIERDA: ARQUEO DE EFECTIVO + VENTAS A CRÉDITO -->
        <div>
          <!-- 1. ARQUEO DE EFECTIVO -->
          <div class="section-box">
            <div class="section-header">
              <span>Arqueo de Efectivo en Mano:</span>
              <strong style="font-family: monospace; color: #0f172a;">Bs ${cob.resumenCobranzas.efectivo.toFixed(2)}</strong>
            </div>
            <table class="detail-table">
              <thead>
                <tr>
                  <th style="width: 32%;">Denominación</th>
                  <th style="text-align: center; width: 22%;">Tipo</th>
                  <th style="text-align: right; width: 18%;">Cant.</th>
                  <th style="text-align: right; width: 28%;">Total (Bs)</th>
                </tr>
              </thead>
              <tbody>
                ${filasCortesHtml}
              </tbody>
              <tfoot>
                <tr style="font-weight: bold; background: #e2e8f0;">
                  <td colspan="3" style="text-align: right; padding: 3px 6px;">Total Efectivo Físico:</td>
                  <td style="text-align: right; font-family: monospace; padding: 3px 6px;">Bs ${cob.resumenCobranzas.efectivo.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <!-- 2. VENTAS A CRÉDITO -->
          <div class="section-box">
            <div class="section-header">
              <span>Ventas a Crédito Autorizadas:</span>
              <strong style="font-family: monospace; color: #6b21a8;">Bs ${cob.resumenCobranzas.credito.toFixed(2)}</strong>
            </div>
            <table class="detail-table">
              <thead>
                <tr>
                  <th style="width: 22%;">Factura</th>
                  <th style="width: 53%;">Cliente / Razón Social</th>
                  <th style="text-align: right; width: 25%;">Monto (Bs)</th>
                </tr>
              </thead>
              <tbody>${filasCreditosHtml}</tbody>
            </table>
          </div>
        </div>

        <!-- COLUMNA DERECHA: TRANSFERENCIAS + QR + DEVOLUCIONES -->
        <div>
          <!-- 3. TRANSFERENCIAS BANCARIAS -->
          <div class="section-box">
            <div class="section-header">
              <span>Transferencias Bancarias Registradas:</span>
              <strong style="font-family: monospace; color: #047857;">Bs ${cob.resumenCobranzas.transferencia.toFixed(2)}</strong>
            </div>
            <table class="detail-table">
              <thead>
                <tr>
                  <th style="width: 22%;">N° Trans.</th>
                  <th style="width: 18%;">Banco</th>
                  <th style="width: 35%;">Cliente</th>
                  <th style="text-align: right; width: 25%;">Monto (Bs)</th>
                </tr>
              </thead>
              <tbody>${filasTransferenciasHtml}</tbody>
            </table>
          </div>

          <!-- 4. PAGOS QR -->
          <div class="section-box">
            <div class="section-header">
              <span>Cobros mediante Código QR:</span>
              <strong style="font-family: monospace; color: #047857;">Bs ${cob.resumenCobranzas.qr.toFixed(2)}</strong>
            </div>
            <table class="detail-table">
              <thead>
                <tr>
                  <th style="width: 22%;">N° Trans.</th>
                  <th style="width: 18%;">Banco</th>
                  <th style="width: 35%;">Cliente</th>
                  <th style="text-align: right; width: 25%;">Monto (Bs)</th>
                </tr>
              </thead>
              <tbody>${filasQrHtml}</tbody>
            </table>
          </div>

          <!-- 5. DEVOLUCIONES FÍSICAS -->
          <div class="section-box">
            <div class="section-header">
              <span>Devoluciones Físicas / Facturas No Cobradas:</span>
              <strong style="font-family: monospace; color: #b45309;">Bs ${cob.resumenFinanciero.importeDevuelto.toFixed(2)}</strong>
            </div>
            <table class="detail-table">
              <thead>
                <tr>
                  <th style="width: 22%;">Factura</th>
                  <th style="width: 35%;">Cliente</th>
                  <th style="width: 23%;">Motivo</th>
                  <th style="text-align: right; width: 20%;">Monto (Bs)</th>
                </tr>
              </thead>
              <tbody>${filasDevolucionesHtml}</tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- SECCIÓN DE CONFORMIDAD Y 4 FIRMAS ESPACIOSAS -->
      <div class="firmas-container">
        <div class="declaracion-text">
          <strong>DECLARACIÓN DE CONFORMIDAD DE CAJA:</strong> El Chofer Repartidor, Supervisor de Operaciones, Cajera Liquidadora y
          Administración certifican la recepción íntegra y conciliación matemática de los valores en efectivo, transferencias bancarias,
          cobros QR y facturas de crédito, declarando el despacho debidamente cerrado y liquidado sin saldos pendientes.
        </div>

        <div class="firmas-grid">
          <div class="firma-card">
            <div class="firma-area"><span>Espacio para Firma / Sello</span></div>
            <strong>${cob.firmas.chofer.nombre}</strong>
            <div class="role">Chofer Repartidor (IVSA)</div>
            <div class="badge-rol">Chofer Entrega</div>
          </div>

          <div class="firma-card">
            <div class="firma-area"><span>Espacio para Firma / Sello</span></div>
            <strong>${cob.firmas.supervisor.nombre}</strong>
            <div class="role">${cob.firmas.supervisor.cargo}</div>
            <div class="badge-rol">V°B° Supervisor</div>
          </div>

          <div class="firma-card">
            <div class="firma-area"><span>Espacio para Firma / Sello</span></div>
            <strong>${cob.firmas.cajero.nombre}</strong>
            <div class="role">${cob.firmas.cajero.cargo}</div>
            <div class="badge-rol">Caja Central</div>
          </div>

          <div class="firma-card">
            <div class="firma-area"><span>Espacio para Firma / Sello</span></div>
            <strong>${cob.firmas.administrador.nombre}</strong>
            <div class="role">${cob.firmas.administrador.cargo}</div>
            <div class="badge-rol">Aprobación Admin</div>
          </div>
        </div>

        <div class="footer-line">
          <span>Distribuidora DISCRUZ • Cierre de Cobranzas y Caja</span>
          <span>Generado automáticamente el ${fechaActualStr}</span>
        </div>
      </div>
    </body>
    </html>
  `

  ejecutarImpresionEnIframe(htmlContent)
}

/**
 * Función genérica para despachar la impresión según el tab activo.
 */
export function imprimirActaCierreSegunTab(
  cierre: CierreOrdenTransporte,
  activeTab: 'almacen' | 'cobranza' | 'balance'
): void {
  if (activeTab === 'cobranza') {
    imprimirActaCierreCobranzasPDF(cierre)
  } else {
    // Para 'almacen' y 'balance' se usa el Acta de Cierre de Almacén
    imprimirActaCierreAlmacenPDF(cierre)
  }
}

/**
 * Helper interno para inyectar HTML en iframe y disparar print de forma aislada.
 */
function ejecutarImpresionEnIframe(htmlContent: string): void {
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.style.opacity = '0'
  iframe.style.pointerEvents = 'none'
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  if (!doc) return

  doc.open()
  doc.write(htmlContent)
  doc.close()

  setTimeout(() => {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()

    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe)
      }
    }, 2000)
  }, 250)
}
