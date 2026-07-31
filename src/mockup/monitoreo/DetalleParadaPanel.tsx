// Tercera zona del monitoreo: el detalle de UNA parada, que abre al hacer click en su pin o en su
// tarjeta y no existe mientras no haya selección.
//
// Por qué panel y no diálogo: el usuario está VIGILANDO. Un modal tapa el mapa y corta el flujo — deja
// de ver dónde está el camión justo cuando abre el detalle de una parada. El panel lateral deja las
// tres cosas a la vista al mismo tiempo: la lista, el recorrido y la evidencia.
//
// Casi todo lo que se muestra acá sale de última milla y tiene columna propia en UltimaVersion.sql:
//   Historial    → delivery_order_histories
//   Incidencias  → delivery_incidents        (incl. photo_url, :464)
//   Comprobante  → proof_of_deliveries       (signature_url, photo_url, gps_lat/lon, :431-454)
//   Pedido       → delivery_order_items (consolidado POR PRODUCTO de la parada)
//
// La excepción es la quinta pestaña: **Cobro NO tiene tabla**. Se agrega igual, marcada como propuesta
// en la propia pantalla, porque es la discusión que viene y conviene tenerla sobre algo concreto. Los
// montos y la forma de pago que muestra salen del PEDIDO DE SAP; el estado del cobro no tiene origen en
// ninguna parte. Ver `CobroEntrega` en `monitoreo-data`.
//
// La evidencia se MUESTRA, no se anuncia. Antes esta pestaña tenía dos badges que decían "Firma
// capturada" y "Foto capturada": un comprobante que no se puede abrir no sirve para lo único que se le
// pide, que es responder al cliente que dice que no recibió la mercadería.
import { Banknote, Camera, MapPin, PenLine, Receipt, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { ilustracionDePunto } from '../mock-fotos'
import { EstadoEntregaBadge } from './EstadoEntregaBadge'
import type { CobroEntrega, EntregaMonitoreo, IncidenciaEntrega } from './monitoreo-data'
import { ESTADO_ENTREGA } from './monitoreo-estado'

const SEVERIDAD: Record<IncidenciaEntrega['severidad'], { label: string; badge: string }> = {
  baja: { label: 'Baja', badge: 'border-border bg-muted text-muted-foreground' },
  media: { label: 'Media', badge: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  alta: { label: 'Alta', badge: 'border-destructive/30 bg-destructive/10 text-destructive' },
}

const ESTADO_COBRO: Record<CobroEntrega['estado'], { label: string; badge: string }> = {
  cobrado: { label: 'Cobrado', badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  parcial: { label: 'Parcial', badge: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  pendiente: { label: 'Pendiente', badge: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  no_corresponde: { label: 'No corresponde', badge: 'border-border bg-muted text-muted-foreground' },
}

/** Bs con separador de miles y dos decimales. La moneda va en la etiqueta, no en cada número. */
const bs = (n: number) => n.toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Una foto de evidencia. El `onError` cae a la ilustración del punto (data URI, sin red) por la misma
 * razón que la galería del planificador: sin él, la pestaña queda con huecos roto offline y la
 * exportación a Figma captura una imagen vacía. El guard evita que el fallback se dispare sobre sí mismo.
 */
function FotoEvidencia({ src, alt, fallback, alto = 'h-28' }: { src: string; alt: string; fallback: string; alto?: string }) {
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={(e) => {
        const img = e.currentTarget
        if (img.dataset.fallback === 'listo') return
        img.dataset.fallback = 'listo'
        img.src = fallback
      }}
      className={cn('w-full rounded-md border border-border bg-muted object-cover', alto)}
    />
  )
}

/** Estado vacío de una pestaña. Un panel en blanco parece roto; esto dice que no hay nada QUE mostrar. */
function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-6 text-center text-xs text-muted-foreground">{children}</p>
}

/** Par etiqueta/valor de la cabecera. */
function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-xs tabular-nums">{children}</span>
    </div>
  )
}

export function DetalleParadaPanel({ entrega, onCerrar }: { entrega: EntregaMonitoreo; onCerrar: () => void }) {
  const meta = ESTADO_ENTREGA[entrega.estado]
  // Fallback compartido por toda la evidencia de esta parada: es el mismo punto de entrega.
  const fallbackFoto = ilustracionDePunto(entrega.puntoEntregaId)

  return (
    // `flex-auto` y NO `flex-1` en toda la cadena (raíz → Tabs → panel de la pestaña).
    // `flex-1` implica `flex-basis: 0`, que fuerza al panel a ocupar todo el alto disponible: una
    // pestaña con tres eventos dejaba media tarjeta en blanco. Con `flex-auto` la base es el
    // contenido, así que el panel MIDE lo que muestra y solo se encoge —y aparece el scroll— cuando
    // choca contra el `max-h` del contenedor. El `min-h-0` es lo que le permite encogerse.
    <div className="flex min-h-0 flex-auto flex-col">
      {/* ── Cabecera: quién, dónde, cuándo ── */}
      <div className="shrink-0 border-b border-border px-3 py-2.5">
        <div className="flex items-start gap-2">
          <span
            className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold text-white"
            style={{ background: meta.color }}
          >
            {entrega.secuencia}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{entrega.cliente}</span>
            <span className="block truncate text-xs text-muted-foreground">{entrega.puntoEntrega}</span>
          </span>
          <Button variant="ghost" size="icon" className="-mr-1 size-7 shrink-0" onClick={onCerrar} aria-label="Cerrar detalle">
            <X size={15} />
          </Button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <EstadoEntregaBadge estado={entrega.estado} />
          {entrega.fueraDeVentana && (
            <Badge variant="outline" className="rounded-full border-amber-500/30 bg-amber-500/10 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              Fuera de ventana
            </Badge>
          )}
        </div>

        <div className="mt-2.5 grid grid-cols-3 gap-2">
          <Dato label="Ventana">{entrega.ventana}</Dato>
          <Dato label="Llegada">{entrega.llegadaAt ?? '—'}</Dato>
          <Dato label="Cierre">{entrega.entregaAt ?? '—'}</Dato>
        </div>

        {/* La carga de la parada. Va en la CABECERA y no en una pestaña porque responde la pregunta
            que más se confunde del modelo: esta parada no es un pedido, AGRUPA varios. */}
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Dato label="Pedidos">{entrega.pedidos.length}</Dato>
          <Dato label="Peso">{entrega.pesoKg.toLocaleString('es')} kg</Dato>
          <Dato label="Volumen">{entrega.volumenM3.toLocaleString('es')} m³</Dato>
        </div>

        {/* El motivo solo existe cuando la entrega no se concretó: es `delivery_result_code`. */}
        {entrega.motivo && (
          <p className="mt-2 rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">{entrega.motivo}</p>
        )}
      </div>

      {/* ── Pestañas ── */}
      <Tabs defaultValue="historial" className="flex min-h-0 flex-auto flex-col gap-0">
        {/* Cinco pestañas en 380 px: `gap-2` y `overflow-x-auto` para que la quinta no empuje a las
            otras fuera del panel si la traducción o el contador las hacen crecer. */}
        <TabsList
          variant="line"
          className="h-9 w-full shrink-0 justify-start gap-2 overflow-x-auto border-b border-border px-3"
        >
          <TabsTrigger value="historial" className="flex-none text-xs">
            Historial
          </TabsTrigger>
          <TabsTrigger value="incidencias" className="flex-none text-xs">
            Incidencias
            {entrega.incidencias.length > 0 && (
              <span className="ml-1 rounded-full bg-destructive/10 px-1.5 text-[10px] font-semibold text-destructive">
                {entrega.incidencias.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="comprobante" className="flex-none text-xs">
            Comprobante
          </TabsTrigger>
          <TabsTrigger value="pedido" className="flex-none text-xs">
            Pedido
          </TabsTrigger>
          <TabsTrigger value="cobro" className="flex-none text-xs">
            Cobro
          </TabsTrigger>
        </TabsList>

        {/* ── Historial: delivery_order_histories ── */}
        <TabsContent value="historial" className="min-h-0 flex-auto overflow-y-auto">
          <ol className="flex flex-col px-3 py-3">
            {entrega.historial.map((evento, i) => {
              const em = ESTADO_ENTREGA[evento.estado]
              const ultimo = i === entrega.historial.length - 1
              return (
                <li key={`${evento.estado}-${evento.hora}`} className="flex gap-2.5">
                  {/* Riel del timeline: punto + línea hasta el evento siguiente. */}
                  <span className="flex flex-col items-center">
                    <span className="mt-1 size-2 shrink-0 rounded-full" style={{ background: em.color }} />
                    {!ultimo && <span className="w-px flex-1 bg-border" />}
                  </span>
                  <span className={cn('flex min-w-0 flex-1 flex-col', ultimo ? 'pb-0' : 'pb-3')}>
                    <span className="flex items-baseline gap-2">
                      <span className="text-xs font-medium">{em.label}</span>
                      <span className="text-[11px] tabular-nums text-muted-foreground">{evento.hora}</span>
                    </span>
                    {evento.nota && <span className="text-[11px] text-muted-foreground">{evento.nota}</span>}
                  </span>
                </li>
              )
            })}
          </ol>
        </TabsContent>

        {/* ── Incidencias: delivery_incidents ── */}
        <TabsContent value="incidencias" className="min-h-0 flex-auto overflow-y-auto">
          {entrega.incidencias.length === 0 ? (
            <Vacio>Sin incidencias registradas.</Vacio>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {entrega.incidencias.map((inc) => (
                <li key={inc.id} className="flex flex-col gap-1 px-3 py-2.5">
                  <span className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">{inc.tipo}</span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">{inc.hora}</span>
                  </span>
                  <span className="text-[11px] text-muted-foreground">{inc.descripcion}</span>
                  <span className="flex flex-wrap gap-1">
                    <Badge variant="outline" className={cn('rounded-full text-[10px]', SEVERIDAD[inc.severidad].badge)}>
                      Severidad {SEVERIDAD[inc.severidad].label}
                    </Badge>
                    {inc.requiereDevolucion && (
                      <Badge variant="outline" className="rounded-full text-[10px]">
                        Requiere devolución
                      </Badge>
                    )}
                  </span>
                  {/* `photo_url`: la foto es LA prueba de la incidencia. Sin ella, "producto dañado" es
                      la palabra del chofer contra la del cliente. */}
                  <FotoEvidencia
                    src={inc.fotoUrl}
                    alt={`Foto de la incidencia: ${inc.tipo}`}
                    fallback={fallbackFoto}
                    alto="h-24"
                  />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        {/* ── Comprobante: proof_of_deliveries ── */}
        <TabsContent value="comprobante" className="min-h-0 flex-auto overflow-y-auto">
          {!entrega.comprobante ? (
            <Vacio>
              Sin comprobante. Solo la entrega efectiva deja firma y receptor.
            </Vacio>
          ) : (
            <div className="flex flex-col gap-2.5 px-3 py-3">
              <div className="grid grid-cols-2 gap-2">
                <Dato label="Recibió">{entrega.comprobante.receptor}</Dato>
                <Dato label="Documento">{entrega.comprobante.documento}</Dato>
                <Dato label="Capturado">{entrega.comprobante.capturadoAt}</Dato>
                <Dato label="GPS del comprobante">
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3 shrink-0 text-muted-foreground" />
                    {entrega.comprobante.gpsLat.toFixed(5)}, {entrega.comprobante.gpsLon.toFixed(5)}
                  </span>
                </Dato>
              </div>

              {/* ── Firma (`signature_url`) ──
                  Sobre fondo blanco explícito: es papel, y la tinta tiene que verse en los dos temas. */}
              {entrega.comprobante.firmaUrl && (
                <div className="flex flex-col gap-1">
                  <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    <PenLine className="size-3" />
                    Firma del receptor
                  </span>
                  <img
                    src={entrega.comprobante.firmaUrl}
                    alt={`Firma de ${entrega.comprobante.receptor}`}
                    className="h-20 w-full rounded-md border border-border bg-white object-contain"
                  />
                </div>
              )}

              {/* ── Fotos (`photo_url`) ── */}
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <Camera className="size-3" />
                  {entrega.comprobante.fotoUrls.length > 0
                    ? `Fotos de la entrega (${entrega.comprobante.fotoUrls.length})`
                    : 'Fotos de la entrega'}
                </span>
                {entrega.comprobante.fotoUrls.length === 0 ? (
                  // Cerró sin foto: es un caso real y hay que poder verlo, no esconderlo.
                  <p className="rounded-md border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted-foreground">
                    El chofer cerró la entrega sin adjuntar foto.
                  </p>
                ) : (
                  entrega.comprobante.fotoUrls.map((foto, i) => (
                    <FotoEvidencia
                      key={foto}
                      src={foto}
                      alt={`Comprobante de ${entrega.cliente} — foto ${i + 1}`}
                      fallback={fallbackFoto}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Pedido ──
            Dos bloques en un orden deliberado: PRIMERO los pedidos que la parada agrupa (el nivel
            de negocio, lo que Ventas y el cliente conocen), DESPUÉS los productos consolidados (lo
            que el chofer realmente baja del camión). Si se mostraran solo los productos, se perdería
            de vista que una parada puede estar juntando tres pedidos distintos. */}
        <TabsContent value="pedido" className="min-h-0 flex-auto overflow-y-auto">
          <div className="border-b border-border px-3 py-2.5">
            <p className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {entrega.pedidos.length} pedido{entrega.pedidos.length !== 1 ? 's' : ''} en esta parada
            </p>
            <ul className="flex flex-col gap-1">
              {entrega.pedidos.map((pedido) => (
                <li key={pedido.id} className="flex items-baseline gap-2 text-xs">
                  <span className="font-mono font-medium">{pedido.salesOrder}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{pedido.canal}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {pedido.pesoKg.toLocaleString('es')} kg
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="px-3 pb-1 pt-2.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            Productos consolidados
          </p>

          {entrega.items.length === 0 ? (
            <Vacio>Esta parada no tiene ítems cargados.</Vacio>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-1.5 text-left font-medium">Producto</th>
                  <th className="px-1 py-1.5 text-right font-medium">Carg.</th>
                  <th className="px-1 py-1.5 text-right font-medium">Entr.</th>
                  <th className="px-3 py-1.5 text-right font-medium">Dev.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entrega.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-1.5">
                      <span className="block truncate">{item.producto}</span>
                      <span className="text-[10px] text-muted-foreground">{item.unidad}</span>
                    </td>
                    <td className="px-1 py-1.5 text-right tabular-nums">{item.cargado}</td>
                    <td className="px-1 py-1.5 text-right tabular-nums font-medium">{item.entregado}</td>
                    <td
                      className={cn(
                        'px-3 py-1.5 text-right tabular-nums',
                        item.devuelto > 0 ? 'font-medium text-destructive' : 'text-muted-foreground',
                      )}
                    >
                      {item.devuelto}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TabsContent>

        {/* ── Cobro ──
            La única pestaña SIN respaldo en el esquema, y por eso lo primero que muestra es eso. El
            aviso no es un adorno: sin él, en dos semanas alguien va a implementar contra esta pantalla
            y va a buscar una tabla que no existe.

            Lo que sí tiene origen: el monto y la forma de pago del pedido de SAP. Lo que no: el estado
            del cobro, el monto cobrado y el recibo. */}
        <TabsContent value="cobro" className="min-h-0 flex-auto overflow-y-auto">
          <div className="flex flex-col gap-2.5 px-3 py-3">
            <p className="rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 px-2 py-1.5 text-[11px] leading-snug text-amber-700 dark:text-amber-400">
              <span className="font-semibold">Propuesta, sin esquema todavía.</span> El monto y la forma
              de pago salen del pedido de SAP; <span className="font-medium">el cobro no tiene tabla</span>{' '}
              (haría falta una <code className="font-mono">delivery_payments</code> por entrega: método,
              monto, recibo, quién cobró y cuándo).
            </p>

            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className={cn('rounded-full text-[10px]', ESTADO_COBRO[entrega.cobro.estado].badge)}>
                {ESTADO_COBRO[entrega.cobro.estado].label}
              </Badge>
              {entrega.cobro.recibo && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Receipt className="size-3" />
                  <span className="font-mono">{entrega.cobro.recibo}</span>
                </span>
              )}
            </div>

            {/* Tres montos y no uno: el total del pedido NO es lo que el chofer trae de vuelta. El
                crédito viaja en la carga pero se cobra en oficina, y confundirlos es lo que hace que
                una caja no cuadre. */}
            <div className="grid grid-cols-2 gap-2">
              <Dato label="Total del pedido (Bs)">{bs(entrega.cobro.montoTotal)}</Dato>
              <Dato label="A cobrar en el punto">{bs(entrega.cobro.montoCobrable)}</Dato>
              <Dato label="Cobrado">
                <span className={cn(entrega.cobro.montoCobrado > 0 && 'font-medium')}>
                  {bs(entrega.cobro.montoCobrado)}
                </span>
              </Dato>
              <Dato label="Hora del cobro">{entrega.cobro.cobradoAt ?? '—'}</Dato>
            </div>

            {entrega.cobro.montoCobrable === 0 && (
              <p className="text-[11px] text-muted-foreground">
                Todos los pedidos de esta parada van a crédito: no hay nada que cobrar en el punto.
              </p>
            )}

            <div className="border-t border-border pt-2">
              <p className="mb-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                <Banknote className="size-3" />
                Por pedido
              </p>
              <ul className="flex flex-col gap-1">
                {entrega.pedidos.map((pedido) => (
                  <li key={pedido.id} className="flex items-baseline gap-2 text-xs">
                    <span className="font-mono font-medium">{pedido.salesOrder}</span>
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate',
                        pedido.formaPago === 'Crédito' ? 'text-muted-foreground' : 'text-foreground',
                      )}
                    >
                      {pedido.formaPago}
                    </span>
                    <span className="shrink-0 tabular-nums">{bs(pedido.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
