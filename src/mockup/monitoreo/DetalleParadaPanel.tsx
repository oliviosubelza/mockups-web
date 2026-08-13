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
import { useState } from 'react'
import {
  Banknote,
  Building2,
  Camera,
  CheckCircle2,
  CircleAlert,
  FileText,
  Image,
  MapPin,
  PenLine,
  QrCode,
  Receipt,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { PARADAS } from '../mock-data'
import { fotosDePunto, ilustracionDePunto } from '../mock-fotos'
import { PuntoEntregaDialog } from '../PuntoEntregaDialog'
import { FotoAmpliable, SinFoto } from '../VisorFoto'
import { EstadoEntregaBadge } from './EstadoEntregaBadge'
import { atencionMin, duracionTexto } from './monitoreo-data'
import type { CobroEntrega, EntregaMonitoreo, IncidenciaEntrega, MetodoPago } from './monitoreo-data'
import { ESTADO_ENTREGA } from './monitoreo-estado'

const SEVERIDAD: Record<IncidenciaEntrega['severidad'], { label: string; badge: string }> = {
  baja: { label: 'Baja', badge: 'border-border bg-muted text-muted-foreground' },
  media: { label: 'Media', badge: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  alta: { label: 'Alta', badge: 'border-destructive/30 bg-destructive/10 text-destructive' },
}

const ESTADO_COBRO: Record<CobroEntrega['estado'], { label: string; badge: string }> = {
  cobrado: { label: 'Cobrado', badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  parcial: { label: 'Cobro parcial', badge: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  en_proceso: { label: 'Esperando al banco', badge: 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  pendiente: { label: 'Sin cobrar', badge: 'border-destructive/30 bg-destructive/10 text-destructive' },
  no_corresponde: { label: 'No corresponde', badge: 'border-border bg-muted text-muted-foreground' },
}

/** Los cuatro métodos de la app del chofer. Mismos nombres y mismos íconos que el mockup móvil. */
const METODO_PAGO: Record<MetodoPago, { label: string; icono: typeof Banknote }> = {
  efectivo: { label: 'Efectivo', icono: Banknote },
  transferencia: { label: 'Transferencia', icono: Building2 },
  qr: { label: 'Pago QR', icono: QrCode },
  cheque: { label: 'Cheque', icono: FileText },
}

/** Bs con separador de miles y dos decimales. La moneda va en la etiqueta, no en cada número. */
const bs = (n: number) => n.toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Formatea el par de coordenadas para mostrarlo. Cinco decimales son ~1 m: más dígitos en una etiqueta
 * de pantalla son ruido que nadie compara a ojo.
 */
const gps = (lat: number, lon: number) => `${lat.toFixed(5)}, ${lon.toFixed(5)}`

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

const TONO_ACTIVIDAD = {
  info: {
    contenedor: 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    chip: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
    icono: CheckCircle2,
  },
  success: {
    contenedor: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    chip: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
    icono: CheckCircle2,
  },
  warning: {
    contenedor: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    chip: 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
    icono: CircleAlert,
  },
  danger: {
    contenedor: 'border-destructive/25 bg-destructive/10 text-destructive',
    chip: 'bg-destructive/10 text-destructive',
    icono: CircleAlert,
  },
} as const

export function DetalleParadaPanel({
  entrega,
  actividadReciente,
  onCerrar,
}: {
  entrega: EntregaMonitoreo
  actividadReciente?: { at: number; titulo: string; descripcion: string; tono: 'info' | 'success' | 'warning' | 'danger' } | null
  onCerrar: () => void
}) {
  const meta = ESTADO_ENTREGA[entrega.estado]
  // Fallback compartido por toda la evidencia de esta parada: es el mismo punto de entrega.
  const fallbackFoto = ilustracionDePunto(entrega.puntoEntregaId)
  const tonoActividad = actividadReciente ? TONO_ACTIVIDAD[actividadReciente.tono] : null
  const IconoActividad = tonoActividad?.icono ?? CheckCircle2

  /**
   * Ficha del punto de entrega — la MISMA del mapa de planificación (`PuntoEntregaDialog`), no una
   * copia. La parada del monitoreo ES un `dispatch_delivery_point`, así que se busca por su id y se
   * reutiliza el componente entero: foto, canal, dirección, ventana, totales y los pedidos.
   *
   * Se abre desde la cabecera del panel y NO desde el click en el pin, a propósito: en el mapa, el
   * click en un pin ya SELECCIONA la parada (es lo que abre este panel). Si además abriera un modal,
   * la acción principal de la pantalla quedaría tapada por una ficha que casi nunca se necesita.
   * Acá, en cambio, está a un click de donde ya estás mirando.
   */
  const [verPunto, setVerPunto] = useState(false)
  const parada = PARADAS.find((p) => p.id === entrega.paradaId) ?? null
  const fotoPunto = fotosDePunto(entrega.puntoEntregaId, entrega.canal)[0]

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

          {/* Miniatura del LUGAR. Es la forma más corta de contestar "¿dónde es esto?": una foto de la
              fachada ubica mejor que la dirección escrita, sobre todo en una zona que no se conoce.
              Abre la ficha completa del punto. */}
          {parada && (
            <button
              type="button"
              onClick={() => setVerPunto(true)}
              title="Ver el punto de entrega"
              className="group relative size-9 shrink-0 overflow-hidden rounded-md border border-border bg-muted transition-colors hover:border-primary/50"
            >
              <img
                src={fotoPunto}
                alt={`Punto de entrega: ${entrega.puntoEntrega}`}
                loading="lazy"
                onError={(e) => {
                  const img = e.currentTarget
                  if (img.dataset.fallback === 'listo') return
                  img.dataset.fallback = 'listo'
                  img.src = fallbackFoto
                }}
                className="size-full object-cover"
              />
              <span
                className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden
              >
                <Image className="size-3.5" />
              </span>
            </button>
          )}
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
          {/* Señal de "en vivo" sin texto: el punto latiendo alcanza. Con la palabra al lado del badge
              de estado, la cabecera decía dos veces lo mismo con distintas palabras. */}
          <span
            className="inline-flex size-5 items-center justify-center rounded-full border border-primary/15 bg-primary/10 text-primary"
            title="Datos en vivo"
            aria-label="Datos en vivo"
          >
            <span className="senal-viva size-1.5 rounded-full bg-current" aria-hidden />
          </span>
        </div>

        {actividadReciente && (
          <div className={cn('mt-2.5 rounded-xl border px-2.5 py-2', tonoActividad?.contenedor)}>
            <div className="flex items-start gap-2">
              <span
                className={cn(
                  'mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full',
                  tonoActividad?.chip,
                )}
              >
                <IconoActividad className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                {/* El título solo aparece cuando DICE algo que el badge de estado no dijo: si la
                    actividad es "En el punto" y el badge ya dice "En el punto", repetirlo es ruido.
                    Tampoco lleva un pill "Ahora": la tarjeta ES el último evento, por eso está acá
                    arriba y con tinte propio. */}
                {actividadReciente.titulo !== meta.label && (
                  <span className="block text-xs font-semibold">{actividadReciente.titulo}</span>
                )}
                <span className="block text-[11px] leading-snug opacity-90">
                  {actividadReciente.descripcion}
                </span>
              </span>
            </div>
          </div>
        )}

        {/* Llegada y cierre van en UNA celda y no en dos: son las puntas de un intervalo, y separarlas
            en columnas hermanas obligaba a leer dos etiquetas para reconstruir uno solo. La columna que
            se gana la usa la DURACIÓN, que es la pregunta real — "¿cuánto estuvo acá?" — y que antes
            había que restar de cabeza. */}
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          <Dato label="Ventana">{entrega.ventana}</Dato>
          <Dato label="Llegada → Cierre">
            {entrega.llegadaAt ?? '—'}
            {entrega.entregaAt ? ` → ${entrega.entregaAt}` : ''}
          </Dato>
          <Dato label="Duración">{duracionTexto(atencionMin(entrega))}</Dato>
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
                <li
                  key={`${evento.estado}-${evento.hora}`}
                  className={cn('flex gap-2.5', ultimo && actividadReciente && 'rounded-lg bg-muted/55 px-2 py-2')}
                >
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
                      la palabra del chofer contra la del cliente. Se puede ampliar: en una miniatura
                      de 100 px no se distingue una caja mojada de una caja sana. */}
                  <FotoAmpliable
                    src={inc.fotoUrl}
                    titulo={inc.tipo}
                    epigrafe={`${entrega.cliente} · parada #${entrega.secuencia}`}
                    datos={[
                      { label: 'Reportada', valor: inc.hora },
                      { label: 'Severidad', valor: SEVERIDAD[inc.severidad].label },
                    ]}
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
              {/* QUIÉN FIRMÓ, no el cliente. El cliente ya está en la cabecera del panel; acá va la
                  PERSONA que recibió, con su cargo y su documento — que es lo único que convierte al
                  comprobante en una prueba cuando alguien reclama que no recibió la mercadería. */}
              <div className="grid grid-cols-2 gap-2">
                <Dato label="Recibió">{entrega.comprobante.receptor}</Dato>
                <Dato label="Cargo">{entrega.comprobante.relacion}</Dato>
                <Dato label="Documento">{entrega.comprobante.documento}</Dato>
                <Dato label="Capturado">{entrega.comprobante.capturadoAt}</Dato>
                <Dato label="GPS del comprobante">
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3 shrink-0 text-muted-foreground" />
                    {gps(entrega.comprobante.gpsLat, entrega.comprobante.gpsLon)}
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
                  <FotoAmpliable
                    src={entrega.comprobante.firmaUrl}
                    titulo={`Firma de ${entrega.comprobante.receptor}`}
                    epigrafe={`${entrega.comprobante.relacion} · ${entrega.cliente}`}
                    datos={[
                      { label: 'Documento', valor: entrega.comprobante.documento },
                      { label: 'Capturada', valor: entrega.comprobante.capturadoAt },
                    ]}
                    alto="h-20"
                    className="bg-white"
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
                  <SinFoto>El chofer cerró la entrega sin adjuntar foto.</SinFoto>
                ) : (
                  entrega.comprobante.fotoUrls.map((foto, i) => (
                    <FotoAmpliable
                      key={foto}
                      src={foto}
                      titulo={`Comprobante · foto ${i + 1} de ${entrega.comprobante!.fotoUrls.length}`}
                      epigrafe={`${entrega.cliente} · recibió ${entrega.comprobante!.receptor}`}
                      datos={[
                        { label: 'Capturado', valor: entrega.comprobante!.capturadoAt },
                        {
                          label: 'GPS',
                          valor: gps(entrega.comprobante!.gpsLat, entrega.comprobante!.gpsLon),
                        },
                      ]}
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
            {/* Qué tiene respaldo y qué no. Cambió con el esquema nuevo y conviene decirlo con
                precisión en vez de tachar la pestaña entera: el QR ya se puede implementar. */}
            {/* <p className="rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 px-2 py-1.5 text-[11px] leading-snug text-amber-700 dark:text-amber-400">
              <span className="font-semibold">Solo el QR está respaldado.</span> Sale de{' '}
              <code className="font-mono">delivery_payment_references</code> (monto, <code className="font-mono">id_qr</code>,
              estado del banco). <span className="font-medium">Efectivo, transferencia y cheque todavía no tienen
              tabla</span>: la app los registra y no hay dónde guardarlos.
            </p> */}

            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className={cn('rounded-full text-[10px]', ESTADO_COBRO[entrega.cobro.estado].badge)}>
                {ESTADO_COBRO[entrega.cobro.estado].label}
              </Badge>
              {entrega.cobro.saldo > 0 && entrega.cobro.estado !== 'no_corresponde' && (
                <span className="text-[11px] font-medium text-destructive">
                  Saldo Bs {bs(entrega.cobro.saldo)}
                </span>
              )}
            </div>

            {/* Cuatro montos, y ninguno sobra:
                  · FACTURADO  — lo que decía la nota de entrega (planificado × precio)
                  · A COBRAR   — lo que el cliente REALMENTE recibió (entregado × precio), sin el crédito
                  · COBRADO    — la plata que el chofer tiene
                  · SALDO      — lo que quedó debiendo
                La diferencia entre los dos primeros es lo que el cliente rechazó, y es justo lo que
                hace que la caja del chofer cuadre o no. */}
            <div className="grid grid-cols-2 gap-2">
              <Dato label="Facturado (Bs)">{bs(entrega.cobro.facturado)}</Dato>
              <Dato label="A cobrar">{bs(entrega.cobro.aCobrar)}</Dato>
              <Dato label="Cobrado">
                <span className={cn(entrega.cobro.cobrado > 0 && 'font-medium')}>
                  {bs(entrega.cobro.cobrado)}
                </span>
              </Dato>
              <Dato label="Saldo">
                <span className={cn(entrega.cobro.saldo > 0 && 'font-medium text-destructive')}>
                  {bs(entrega.cobro.saldo)}
                </span>
              </Dato>
            </div>

            {entrega.cobro.enProceso > 0 && (
              <p className="rounded-md bg-sky-500/10 px-2 py-1.5 text-[11px] text-sky-700 dark:text-sky-400">
                <span className="font-medium">Bs {bs(entrega.cobro.enProceso)} en proceso.</span> El QR está
                emitido y el banco todavía no confirmó: ni cobrado ni perdido.
              </p>
            )}

            {/* {entrega.cobro.facturado > entrega.cobro.aCobrar && entrega.cobro.estado !== 'no_corresponde' && (
              <p className="text-[11px] text-muted-foreground">
                Se factura Bs {bs(entrega.cobro.facturado)} y se cobran Bs {bs(entrega.cobro.aCobrar)}: la
                diferencia es lo que el cliente rechazó o va a crédito.
              </p>
            )} */}

            {entrega.cobro.estado === 'no_corresponde' && (
              <p className="text-[11px] text-muted-foreground">
                No hay nada que cobrar en el punto: todos los pedidos de esta parada van a crédito.
              </p>
            )}

            {/* ── Los pagos ──
                Son VARIOS a propósito: 200 en QR, 300 en efectivo y el resto a deber es un caso
                normal, no un borde. Con un solo campo "cobrado" no habría forma de contestar "¿con
                qué pagó?", que es la primera pregunta cuando la caja no cuadra. */}
            <div className="border-t border-border pt-2">
              <p className="mb-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                <Receipt className="size-3" />
                {entrega.cobro.pagos.length > 0
                  ? `${entrega.cobro.pagos.length} cobro${entrega.cobro.pagos.length !== 1 ? 's' : ''} registrado${entrega.cobro.pagos.length !== 1 ? 's' : ''}`
                  : 'Cobros registrados'}
              </p>

              {entrega.cobro.pagos.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted-foreground">
                  {entrega.cobro.estado === 'no_corresponde'
                    ? 'Esta parada no se cobra en el punto.'
                    : 'Todavía no se registró ningún cobro.'}
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {entrega.cobro.pagos.map((pago) => {
                    const meta = METODO_PAGO[pago.metodo]
                    const Icono = meta.icono
                    return (
                      <li key={pago.id} className="flex items-start gap-2 py-2">
                        <span
                          className={cn(
                            'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md',
                            pago.estado === 'pendiente'
                              ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                              : 'bg-muted text-muted-foreground',
                          )}
                        >
                          <Icono className="size-3.5" />
                        </span>

                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="flex items-baseline gap-2">
                            <span className="text-xs font-medium">{meta.label}</span>
                            <span className="ml-auto shrink-0 text-xs font-medium tabular-nums">
                              Bs {bs(pago.monto)}
                            </span>
                          </span>
                          <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                            {/* La referencia es lo que permite RASTREAR el cobro: el nº de recibo, la
                                operación bancaria, el cheque, o el `id_qr` del banco. */}
                            <span className="font-mono">{pago.referencia}</span>
                            {pago.banco && <span>· {pago.banco}</span>}
                            {pago.hora && <span>· {pago.hora}</span>}
                          </span>
                          {pago.estado === 'pendiente' && (
                            <span className="text-[11px] text-sky-600 dark:text-sky-400">
                              Esperando confirmación del banco
                              {pago.collectionPaymentId ? ` · cobro #${pago.collectionPaymentId}` : ''}
                            </span>
                          )}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* La ficha del punto es la MISMA del planificador: mismo componente, mismos datos, misma foto.
          Que las dos pantallas muestren el mismo lugar de la misma forma no es ahorro de código, es
          lo que hace que el usuario reconozca el punto al pasar de una a otra. */}
      {verPunto && <PuntoEntregaDialog parada={parada} onClose={() => setVerPunto(false)} />}
    </div>
  )
}
