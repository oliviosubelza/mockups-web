// La segunda lectura del viaje: TABLA. Es lo mismo que muestra el panel izquierdo del mapa, pero
// desplegado —una fila por parada y una columna por dato— en vez de una tarjeta por vez.
//
// Por qué las dos y no una: el eje contesta CUÁNDO y la tabla contesta CUÁNTO. Un carril de tiempo no
// puede llevar montos sin volverse ilegible, y una tabla de montos no deja ver que el viaje se estiró a
// partir de la parada 6. Son dos preguntas distintas sobre el mismo viaje, así que van en dos pestañas
// que comparten la selección: la parada que se elige en el eje queda elegida acá, y al revés.
//
// De dónde sale cada columna:
//   Ventana                → dispatch_delivery_points.delivery_window_start/end
//   Plan                   → derivado (ver `linea-tiempo.ts`)
//   Real / Atención        → delivery_orders.arrived_at / delivered_at
//   Peso                   → dispatch_delivery_points.total_weight_kg
//   A cobrar … Saldo       → DERIVADOS de delivery_order_items (delivered_qty × unit_price_snapshot) y
//                            delivery_payment_references. Ojo: el ESTADO agregado del cobro no tiene
//                            columna en ninguna tabla — lo calcula el frontend. Es el mismo hueco que
//                            marca la pestaña "Cobro" del detalle de la parada.
//   Inc.                   → count(delivery_incidents)
import { useMemo } from 'react'
import { AlertTriangle, PackageCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
// Se importan las PIEZAS de la tabla pero no `Table`: ese wrapper trae su propio contenedor con
// `overflow-x-auto`, y anidarlo dentro del scroller vertical de la pestaña deja la barra horizontal
// colgada al final de la tabla —o sea, fuera de la pantalla hasta que bajás del todo—. Con un solo
// contenedor que scrollea en los dos ejes, las barras quedan donde el usuario las espera y el
// `sticky` del encabezado y del pie tiene un único ancestro contra el cual pegarse.
import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { bs, ESTADO_COBRO, METODO_PAGO } from './cobro-estilo'
import { EstadoEntregaBadge } from './EstadoEntregaBadge'
import { duracionTexto } from './monitoreo-data'
import { desvioTexto, horaDeEje, TIER_DESVIO, type HitoLineaTiempo, type LineaTiempo } from './linea-tiempo'

/** Celda numérica: alineada a la derecha y con cifras de ancho fijo, para poder comparar en vertical. */
const NUM = 'text-right tabular-nums'

// `position: sticky` no funciona sobre `<thead>` ni `<tfoot>` — hay que pegarlo celda por celda.
const TH = 'sticky top-0 z-20 bg-background'
const TD_PIE = 'sticky bottom-0 z-20 border-t border-border bg-muted'

export function TablaViajeMonitoreo({
  linea,
  seleccion,
  onSeleccionar,
  vivas,
}: {
  linea: LineaTiempo
  seleccion: number | null
  onSeleccionar: (secuencia: number) => void
  /** Ids de las entregas que acaban de cambiar, para el destello. */
  vivas: Set<string>
}) {
  // Los totales se suman sobre TODAS las paradas del viaje, cerradas o no: la pregunta que contesta el
  // pie es "cuánta plata hay en la calle en este camión", y una parada pendiente también la tiene.
  const totales = useMemo(
    () =>
      linea.hitos.reduce(
        (acc, h) => ({
          pesoKg: acc.pesoKg + h.entrega.pesoKg,
          aCobrar: acc.aCobrar + h.entrega.cobro.aCobrar,
          cobrado: acc.cobrado + h.entrega.cobro.cobrado,
          enProceso: acc.enProceso + h.entrega.cobro.enProceso,
          saldo: acc.saldo + h.entrega.cobro.saldo,
          incidencias: acc.incidencias + h.incidencias,
        }),
        { pesoKg: 0, aCobrar: 0, cobrado: 0, enProceso: 0, saldo: 0, incidencias: 0 },
      ),
    [linea.hitos],
  )

  return (
    <div className="min-h-0 flex-1 overflow-auto [scrollbar-width:thin]">
      <table className="w-full caption-bottom text-xs">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn('w-10 text-center', TH)}>#</TableHead>
            <TableHead className={cn('min-w-52', TH)}>Cliente</TableHead>
            <TableHead className={cn('w-32', TH)}>Estado</TableHead>
            <TableHead className={cn('w-28', TH)}>Ventana</TableHead>
            <TableHead className={cn('w-16', NUM, TH)}>Plan</TableHead>
            <TableHead className={cn('w-16', NUM, TH)}>Real</TableHead>
            <TableHead className={cn('w-20', NUM, TH)}>Desvío</TableHead>
            <TableHead className={cn('w-20', NUM, TH)}>Atención</TableHead>
            <TableHead className={cn('w-20', NUM, TH)}>Peso kg</TableHead>
            <TableHead className={cn('w-14', NUM, TH)}>Ped.</TableHead>
            <TableHead className={cn('w-24', NUM, TH)}>A cobrar</TableHead>
            <TableHead className={cn('w-24', NUM, TH)}>Cobrado</TableHead>
            <TableHead className={cn('w-24', NUM, TH)}>En proceso</TableHead>
            <TableHead className={cn('w-24', NUM, TH)}>Saldo</TableHead>
            <TableHead className={cn('w-40', TH)}>Cobro</TableHead>
            <TableHead className={cn('w-14', NUM, TH)}>Inc.</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {linea.hitos.map((h) => (
            <Fila
              key={h.secuencia}
              hito={h}
              activo={h.secuencia === seleccion}
              viva={vivas.has(h.entrega.id)}
              onSeleccionar={() => onSeleccionar(h.secuencia)}
            />
          ))}
        </TableBody>

        {/* El pie va pegado abajo: en un viaje de 20 paradas, unos totales que hay que ir a buscar al
            final del scroll no son totales, son una nota al pie. */}
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={8} className={cn('font-medium', TD_PIE)}>
              {linea.hitos.length} paradas · {linea.aTiempo} en horario de {linea.medidas} medidas
            </TableCell>
            <TableCell className={cn(NUM, 'font-semibold', TD_PIE)}>{bs(totales.pesoKg)}</TableCell>
            <TableCell className={TD_PIE} />
            <TableCell className={cn(NUM, 'font-semibold', TD_PIE)}>{bs(totales.aCobrar)}</TableCell>
            <TableCell className={cn(NUM, 'font-semibold text-emerald-600 dark:text-emerald-400', TD_PIE)}>
              {bs(totales.cobrado)}
            </TableCell>
            <TableCell className={cn(NUM, 'font-semibold text-sky-600 dark:text-sky-400', TD_PIE)}>
              {bs(totales.enProceso)}
            </TableCell>
            <TableCell
              className={cn(NUM, 'font-semibold', TD_PIE, totales.saldo > 0 && 'text-destructive')}
            >
              {bs(totales.saldo)}
            </TableCell>
            <TableCell className={cn('text-[10px] font-normal text-muted-foreground', TD_PIE)}>Bs</TableCell>
            <TableCell className={cn(NUM, 'font-semibold', TD_PIE)}>{totales.incidencias || '—'}</TableCell>
          </TableRow>
        </TableFooter>
      </table>
    </div>
  )
}

function Fila({
  hito,
  activo,
  viva,
  onSeleccionar,
}: {
  hito: HitoLineaTiempo
  activo: boolean
  viva: boolean
  onSeleccionar: () => void
}) {
  const { entrega } = hito
  const cobro = entrega.cobro
  const metodos = useMemo(
    () => Array.from(new Set(cobro.pagos.map((p) => p.metodo))),
    [cobro.pagos],
  )

  return (
    <TableRow
      onClick={onSeleccionar}
      data-state={activo ? 'selected' : undefined}
      // `fila-viva` es la barra de acento del listado de monitoreo, reusada tal cual: el destello es
      // el canal de VISIÓN PERIFÉRICA —la celda dice qué cambió, esto dice DÓNDE mirar— y tiene que
      // significar lo mismo en las dos pantallas.
      className={cn('cursor-pointer', activo && 'bg-primary/5', viva && 'fila-viva')}
    >
      <TableCell className="text-center font-medium tabular-nums text-muted-foreground">
        {hito.secuencia}
      </TableCell>

      <TableCell className="max-w-56" title={entrega.receptor ? `Recibió: ${entrega.receptor}` : undefined}>
        <div className="flex flex-col">
          <span className="truncate font-medium text-foreground">{hito.cliente}</span>
          <span className="truncate text-[11px] text-muted-foreground">{hito.puntoEntrega}</span>
        </div>
      </TableCell>

      <TableCell>
        {/* El motivo va en el título y no en una columna propia: solo existe en las paradas que no se
            entregaron, y una columna vacía en 18 de 20 filas es ancho robado a las que sí tienen dato. */}
        <span title={entrega.motivo || undefined}>
          <EstadoEntregaBadge estado={hito.estado} />
        </span>
      </TableCell>

      <TableCell>
        <span
          className={cn(
            'tabular-nums',
            hito.fueraDeVentana ? 'font-medium text-destructive' : 'text-muted-foreground',
          )}
          title={hito.fueraDeVentana ? 'Se cerró fuera de la ventana comprometida' : undefined}
        >
          {hito.ventana}
        </span>
      </TableCell>

      <TableCell className={cn(NUM, 'text-muted-foreground')}>{horaDeEje(hito.planLlegada)}</TableCell>

      <TableCell className={NUM}>
        {hito.realLlegada === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          horaDeEje(hito.realLlegada)
        )}
      </TableCell>

      <TableCell className={NUM}>
        {hito.tier ? (
          <span className={cn('font-semibold', TIER_DESVIO[hito.tier].texto)}>
            {desvioTexto(hito.desvioLlegada)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      <TableCell className={cn(NUM, 'text-muted-foreground')}>{duracionTexto(hito.atencion)}</TableCell>
      <TableCell className={NUM}>{bs(entrega.pesoKg)}</TableCell>
      <TableCell className={cn(NUM, 'text-muted-foreground')} title={entrega.pedidos.map((p) => p.documento).join('\n')}>
        {entrega.pedidos.length}
      </TableCell>

      <TableCell className={NUM}>{bs(cobro.aCobrar)}</TableCell>
      <TableCell className={cn(NUM, cobro.cobrado > 0 && 'text-emerald-600 dark:text-emerald-400')}>
        {bs(cobro.cobrado)}
      </TableCell>
      <TableCell className={cn(NUM, cobro.enProceso > 0 && 'text-sky-600 dark:text-sky-400')}>
        {bs(cobro.enProceso)}
      </TableCell>
      <TableCell className={cn(NUM, cobro.saldo > 0 && 'font-medium text-destructive')}>
        {bs(cobro.saldo)}
      </TableCell>

      <TableCell>
        <div className="flex items-center gap-1.5">
          <Badge
            variant="outline"
            className={cn('shrink-0 rounded-full font-medium', ESTADO_COBRO[cobro.estado].badge)}
          >
            {ESTADO_COBRO[cobro.estado].label}
          </Badge>
          {/* Los métodos como íconos y no como texto: son hasta cuatro por parada y el nombre completo
              haría la columna más ancha que la del cliente. */}
          {metodos.map((metodo) => {
            const Icono = METODO_PAGO[metodo].icono
            return (
              <Icono
                key={metodo}
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-label={METODO_PAGO[metodo].label}
              />
            )
          })}
        </div>
      </TableCell>

      <TableCell className={NUM}>
        {hito.incidencias > 0 ? (
          <span className="inline-flex items-center gap-1 font-medium text-destructive">
            <AlertTriangle className="size-3.5" />
            {hito.incidencias}
          </span>
        ) : entrega.comprobante ? (
          <PackageCheck
            className="ml-auto size-3.5 text-muted-foreground"
            aria-label="Con comprobante de entrega"
          />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  )
}
