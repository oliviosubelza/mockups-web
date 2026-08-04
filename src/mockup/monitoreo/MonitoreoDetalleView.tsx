// Detalle del monitoreo: MAPA A SANGRE con paneles flotantes encima.
//
// DECISIÓN DE LAYOUT — los paneles flotan, no empujan.
// Antes esto era un SplitPane: cada panel le comía ancho al mapa y abrir el detalle lo achicaba. En
// una pantalla de vigilancia eso está al revés. El mapa ES el contenido; la lista y el detalle son
// herramientas SOBRE él, igual que en Google Maps. Consecuencias concretas de flotar:
//   · El mapa nunca cambia de tamaño → Leaflet no re-renderiza sus tiles al abrir o cerrar un panel,
//     y el usuario no pierde la referencia visual de dónde estaba mirando.
//   · Los paneles tapan mapa. Se paga con dos cosas: se pueden colapsar, y `fitBounds` recibe el ancho
//     que ocupan como padding asimétrico para que ninguna parada quede encuadrada abajo de un panel.
//
// DECISIÓN DE ALCANCE — un viaje es UNA carga de UNA orden.
// El chofer no intercala órdenes: sale, entrega toda la orden, vuelve al almacén, recarga y recién
// ahí arranca la siguiente. Por eso el mapa muestra exactamente las paradas de esta orden y nada más
// — no hay paradas de otras órdenes que atenuar, ni el camión se va a puntos fuera de pantalla.
//
// La orden se lee de la URL (`:ordenId`). Recargar reconstruye el contexto solo.
import { useMemo, useState } from 'react'
import { ArrowLeft, ChevronFirst, ListOrdered, Search, Truck, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useRouteParams } from '@/core/routing/active-route'
import { openRoute } from '@/core/routing/open-route'
import { DetalleParadaPanel } from './DetalleParadaPanel'
import { BateriaChofer, Frescura, LeyendaColapsable, ProgresoEntregas } from './ProgresoEntregas'
import { ParadasPanel } from './ParadasPanel'
import { SeguimientoMapa } from './SeguimientoMapa'
import {
  duracionTexto,
  entregasDeViaje,
  ordenPorId,
  resumenEntregas,
  viajePorTripId,
  type EntregaMonitoreo,
} from './monitoreo-data'
import { ESTADO_ENTREGA, ESTADO_VIAJE } from './monitoreo-estado'
import { useSeguimientoVivo } from './use-seguimiento-vivo'

/** Anchos de los paneles flotantes y su separación del borde. En px porque `fitBounds` los necesita. */
const PARADAS_PX = 340
const DETALLE_PX = 380
const MARGEN_PX = 12

/**
 * Clases compartidas de un panel flotante: tarjeta elevada sobre el mapa, no un borde de la pantalla.
 * El alto NO va acá: el de paradas ocupa todo (es una lista larga) y el de detalle mide su contenido.
 *
 * `z-10` y no `z-[1000]`: ver la nota de apilado en el contenedor del mapa. Un z alto acá tapaba los
 * overlays de la app (el Select del tema portaliza al body con z-50 y quedaba DEBAJO del mapa).
 */
const PANEL_FLOTANTE =
  'absolute z-10 flex flex-col overflow-hidden rounded-xl border border-border bg-card/95 shadow-xl backdrop-blur-sm'

/** Los dos paneles entran y salen con el mismo tiempo, o el movimiento se ve descoordinado. */
const DESLIZA = 'transition-transform duration-300 ease-out'

/** Alto de la pastilla "Paradas" más su respiro. La barra de herramientas se apoya debajo de ella. */
const PASTILLA_PX = 40

/**
 * Color del punto de estado del viaje. Se deriva de `ESTADO_ENTREGA` y no se escribe a mano para que
 * el punto del encabezado y los pines del mapa nunca discrepen: "en ruta" tiene que ser el mismo azul
 * que una parada en curso.
 */
const COLOR_VIAJE: Record<keyof typeof ESTADO_VIAJE, string> = {
  pendiente: ESTADO_ENTREGA.pendiente.color,
  en_ruta: ESTADO_ENTREGA.en_camino.color,
  finalizado: ESTADO_ENTREGA.entregado.color,
}

/**
 * Filtros de la lista de paradas. Son TRES y no uno por estado a propósito: el planificador no busca
 * "las devueltas", busca "lo que todavía me falta" o "lo que salió mal". Un select con seis estados
 * obliga a traducir la pregunta al vocabulario del sistema.
 *
 * "Con problema" agrupa a propósito cuatro cosas distintas —fallida, devuelta, con incidencia y fuera
 * de ventana— porque todas terminan en la misma acción: alguien tiene que mirar esa parada.
 */
type FiltroParadas = 'todas' | 'abiertas' | 'problema'

const FILTROS: { id: FiltroParadas; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'abiertas', label: 'Abiertas' },
  { id: 'problema', label: 'Con problema' },
]

const conProblema = (e: EntregaMonitoreo) =>
  e.estado === 'fallido' || e.estado === 'devuelto' || e.incidencias.length > 0 || e.fueraDeVentana

/** Par etiqueta/valor de la cabecera: la etiqueta arriba en chico, el dato abajo con peso. */
function Campo({
  label,
  alineado,
  children,
}: {
  label: string
  alineado?: 'right'
  children: React.ReactNode
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5', alineado === 'right' && 'items-end')}>
      <span className="text-[10px] uppercase leading-none tracking-wide text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-xs">{children}</span>
    </div>
  )
}

export function MonitoreoDetalleView() {
  // `useRouteParams` y no `useParams`: el shell renderiza esta pantalla fuera de un <Route element>.
  const { ordenId } = useRouteParams()
  const [paradaFoco, setParadaFoco] = useState<string | null>(null)
  const [paradasAbierto, setParadasAbierto] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<FiltroParadas>('todas')

  const orden = ordenPorId(ordenId ?? null)
  // El puente orden → viaje es `transport_order.trip_id`, que la fila de Postgres ya trae: navegar por
  // orden y trackear por viaje no cuesta una consulta extra.
  const viaje = viajePorTripId(orden?.tripId)

  // Las entregas de esta orden, en orden de visita. Un viaje = una carga = una orden.
  const base = useMemo(() => (viaje ? entregasDeViaje(viaje.tripId) : []), [viaje])

  // La simulación en vivo es la única fuente del estado actual: devuelve las entregas ya mutadas y el
  // último ítem ACTUAL crudo (la posición y la batería se derivan de él, no se guardan).
  const { tracking, cursor, actualizadoAt, entregas } = useSeguimientoVivo(viaje, base)

  // El resumen se calcula sobre las entregas VIVAS de la orden abierta, no sobre el dataset: así la
  // barra de progreso avanza sola cuando la simulación cierra una parada.
  //
  // La SALIDA del viaje entra acá porque los tiempos la necesitan y los conteos no: el primer tramo de
  // tránsito va del depósito a la parada 1, y el total en ruta se mide desde que el camión arrancó. Sin
  // ella los dos quedarían en `null` — un viaje "sin tiempos" en vez de un viaje con tiempos mal
  // medidos, que es la falla correcta.
  const resumen = useMemo(() => resumenEntregas(entregas, viaje?.salida), [entregas, viaje?.salida])

  const seleccionada = useMemo(
    () => entregas.find((e) => e.paradaId === paradaFoco) ?? null,
    [entregas, paradaFoco],
  )

  // El filtro afecta SOLO a la lista; el mapa sigue mostrando el recorrido completo. Ocultar pines
  // rompería la lectura de la secuencia — verías el ①, el ④ y el ⑦ sin nada en el medio.
  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    return entregas.filter((e) => {
      if (filtro === 'abiertas' && ESTADO_ENTREGA[e.estado].cerrada) return false
      if (filtro === 'problema' && !conProblema(e)) return false
      if (!texto) return true
      return e.cliente.toLowerCase().includes(texto) || e.puntoEntrega.toLowerCase().includes(texto)
    })
  }, [entregas, busqueda, filtro])

  // Click sobre la parada ya abierta = cerrar. Sin esto el panel no tendría forma de salir desde el
  // mapa: habría que ir a buscar la X, y el gesto natural es volver a tocar el pin.
  const seleccionar = (paradaId: string) => setParadaFoco((actual) => (actual === paradaId ? null : paradaId))

  // Sin contexto (F5 o URL directa) no hay nada que seguir: se vuelve al listado.
  if (!orden || !viaje) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">
          {ordenId ? `La orden ${ordenId} no existe o ya no está en seguimiento.` : 'No hay ninguna orden en seguimiento.'}
        </p>
        <Button variant="outline" size="sm" onClick={() => openRoute('monitoreo')}>
          <ArrowLeft className="size-3.5" />
          Volver al listado
        </Button>
      </div>
    )
  }

  const cerradas = resumen.entregadas + resumen.fallidas + resumen.devueltas

  return (
    // `rounded-none`: el mapa va a sangre de verdad. Con el `rounded-xl` que trae Card, el
    // `overflow-hidden` recortaba las cuatro esquinas del mapa y dejaba un borde curvo que peleaba
    // con las tarjetas flotantes —que sí son redondeadas— por ser dos superficies distintas.
    // Acá el contraste es el que ordena: fondo recto, herramientas redondeadas encima.
    <Card className="relative h-full min-h-0 gap-0 overflow-hidden rounded-none p-0">
      {/* ── Mapa a sangre: es el fondo de la pantalla, no una columna más ──
          `isolate` (isolation: isolate) NO es decorativo: CONTIENE la escalera de z-index de
          Leaflet, que internamente llega a 1000 (.leaflet-pane 400 … .leaflet-top/bottom 1000).
          Sin esto esos valores compiten en el contexto de apilado RAÍZ, y como los overlays de la
          app se portalizan al body con z-50 (el Select del tema, los popovers, los menús), el mapa
          les ganaba y aparecían DETRÁS. Con el mapa aislado, todo lo suyo queda adentro y el
          máximo que esta pantalla aporta al contexto raíz es el z-10 de los paneles. */}
      <div
        className="absolute inset-0 isolate"
      >
        <SeguimientoMapa
          viaje={viaje}
          entregas={entregas}
          tracking={tracking}
          cursor={cursor}
          paradaFoco={paradaFoco}
          onSeleccionar={seleccionar}
          margenIzq={paradasAbierto ? PARADAS_PX + MARGEN_PX * 2 : MARGEN_PX * 3}
          margenDer={seleccionada ? DETALLE_PX + MARGEN_PX * 2 : MARGEN_PX * 3}
          // Con el panel abierto la barra se apoya en su borde derecho; con el panel cerrado baja
          // al hueco que deja la pastilla "Paradas", que ocupa esa misma esquina.
          anclaHerramientas={
            paradasAbierto
              ? { top: MARGEN_PX, left: PARADAS_PX + MARGEN_PX * 2 }
              : { top: MARGEN_PX + PASTILLA_PX, left: MARGEN_PX }
          }
        />
      </div>

      {/* ── Panel de paradas (izquierda, flotante) ──
          Siempre montado y desplazado con `translateX`, igual que el de detalle. Antes se montaba y
          desmontaba con un ternario: aparecía y desaparecía de golpe, sin transición posible. */}
      <div
        className={cn(PANEL_FLOTANTE, DESLIZA, 'inset-y-3 left-3')}
        style={{
          width: PARADAS_PX,
          transform: paradasAbierto ? 'translateX(0)' : `translateX(calc(-100% - ${MARGEN_PX}px))`,
        }}
        aria-hidden={!paradasAbierto}
      >
        {/* Cabecera del viaje. Vive DENTRO del panel y no en una barra propia: una franja fija
            arriba le comería alto al mapa justo cuando lo que se busca es que el mapa mande. */}
        <div className="shrink-0 border-b border-border px-2.5 py-2">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={() => openRoute('monitoreo')}
              aria-label="Volver al listado"
            >
              <ArrowLeft size={15} />
            </Button>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold leading-tight">Orden {orden.codigo}</span>
              {/* Estado del viaje como PUNTO + texto, no como badge. Un badge de color es correcto en
                  la tabla del listado, donde compite con otras 40 filas y necesita saltar; acá es el
                  único viaje en pantalla y el color solo agrega ruido. El punto alcanza, y además
                  queda del mismo lenguaje que el indicador de frescura de abajo. */}
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ background: COLOR_VIAJE[viaje.estado] }}
                  aria-hidden
                />
                {ESTADO_VIAJE[viaje.estado].label}
                <span aria-hidden>·</span>
                <span className="tabular-nums">Salió {viaje.salida}</span>
              </span>
            </span>

            {/* `ChevronFirst` (chevron + línea vertical): la flecha dice hacia dónde se va y la línea
                representa el borde contra el que se pliega. Un chevron pelado se lee como "anterior";
                con la línea se lee como "colapsar hasta el borde". */}
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={() => setParadasAbierto(false)}
              title="Ocultar paradas"
              aria-label="Ocultar paradas"
            >
              <ChevronFirst size={16} />
            </Button>
          </div>

          {/* Los tres datos CLAVE, en grilla con etiqueta.
              Antes eran una línea corrida de íconos y texto chico, todos del mismo peso: había que
              leerla entera para encontrar uno. Con etiqueta arriba se saltan con la vista, y sobre
              todo se distingue la IDENTIDAD del viaje (camión, chofer) de su SALUD (batería) — que es
              el único de los tres que puede requerir una acción. */}
          <div className="mt-2.5 grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-0.5 rounded-lg bg-muted/50 px-2.5 py-2">
            <Campo label="Camión">
              <span className="flex items-center gap-1.5">
                <Truck className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="font-mono">{viaje.camion}</span>
              </span>
            </Campo>
            <Campo label="Chofer">
              <span className="flex min-w-0 items-center gap-1.5">
                <User className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{viaje.chofer}</span>
              </span>
            </Campo>
            <Campo label="Batería" alineado="right">
              {/* `battery` sale del ÚLTIMO PING, no de un campo del viaje: es telemetría, cambia con
                  cada reporte y no tiene sentido guardarla aparte del ítem que la trae. */}
              <BateriaChofer pct={tracking?.battery ?? null} className="justify-end" />
            </Campo>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <ProgresoEntregas resumen={resumen} />
          </div>

          {/* ── Tiempos del viaje ──
              Van DEBAJO del progreso y no arriba: el progreso contesta "cómo va" (¿llego?), esto
              contesta "por qué va así" (¿dónde se pierde el tiempo?). El orden importa porque el
              segundo solo se pregunta después del primero.

              Son TRES y no uno porque separan la causa: si la atención promedio está en 9 min y el
              tránsito en 30, el problema es el ruteo, no el chofer descargando. Un único "tiempo en
              ruta" promedio los suma y no permite decidir nada. El total va a la derecha y con la
              etiqueta más corta porque es el que contiene a los otros dos. */}
          <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-0.5 rounded-lg bg-muted/50 px-2.5 py-2">
            <Campo label="Atención prom.">
              <span className="tabular-nums" title="Promedio de tiempo parado en el punto de entrega">
                {duracionTexto(resumen.atencionPromedioMin)}
              </span>
            </Campo>
            <Campo label="Tránsito prom.">
              <span className="tabular-nums" title="Promedio de tiempo entre una parada y la siguiente">
                {duracionTexto(resumen.transitoPromedioMin)}
              </span>
            </Campo>
            <Campo label="En ruta" alineado="right">
              <span className="tabular-nums" title="Desde la salida del depósito hasta la última parada cerrada">
                {duracionTexto(resumen.enRutaMin)}
              </span>
            </Campo>
          </div>

          {/* Frescura de la PANTALLA. Va acá abajo y no junto al estado del viaje a propósito: no es
              un dato del camión, es de la conexión. */}
          <div className="mt-1.5">
            <Frescura desde={actualizadoAt} />
          </div>
        </div>

        {/* ── Buscador y filtros de paradas ──
            Con 20 paradas la lista deja de escanearse, y las dos preguntas que se repiten son "¿dónde
            está tal cliente?" y "¿qué me falta / qué salió mal?". El texto resuelve la primera; los
            tres chips la segunda, sin obligar a abrir un select para algo que se usa a cada rato. */}
        <div className="shrink-0 space-y-1.5 border-b border-border px-2.5 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar cliente o punto de entrega"
              className="h-7 pl-7 text-xs"
              aria-label="Buscar parada"
            />
          </div>

          <div className="flex items-center gap-1">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltro(f.id)}
                aria-pressed={filtro === f.id}
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors',
                  filtro === f.id
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {f.label}
              </button>
            ))}
            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {/* Cuando hay filtro activo el contador cambia de significado: deja de ser el progreso
                  del viaje y pasa a ser "cuántas quedaron a la vista". Decirlo evita que alguien lea
                  "3" y crea que el camión solo tiene tres paradas. */}
              {visibles.length === entregas.length
                ? `${cerradas} de ${entregas.length} cerradas`
                : `${visibles.length} de ${entregas.length}`}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <ParadasPanel
            entregas={visibles}
            paradaFoco={paradaFoco}
            onSeleccionar={seleccionar}
            vacio={
              entregas.length === 0
                ? 'Este viaje todavía no tiene paradas cargadas.'
                : 'Ninguna parada coincide con la búsqueda.'
            }
          />
        </div>

        <div className="shrink-0 border-t border-border px-3 py-2">
          <LeyendaColapsable />
        </div>
      </div>

      {/* Pastilla para traerlo de vuelta. No es un riel: sin panel, un riel sería una franja vacía
          tapando mapa para no mostrar nada. Se cruza con el panel (uno entra mientras el otro sale). */}
      <Button
        variant="secondary"
        size="sm"
        className={cn(
          'absolute left-3 top-3 z-10 gap-1.5 rounded-full border border-border shadow-lg',
          'transition-[opacity,transform] duration-300 ease-out',
          paradasAbierto ? 'pointer-events-none -translate-x-2 opacity-0' : 'translate-x-0 opacity-100',
        )}
        onClick={() => setParadasAbierto(true)}
        aria-hidden={paradasAbierto}
        tabIndex={paradasAbierto ? -1 : undefined}
      >
        <ListOrdered className="size-3.5" />
        Paradas
        <span className="tabular-nums text-muted-foreground">
          {cerradas}/{entregas.length}
        </span>
      </Button>

      {/* ── Panel de detalle (derecha, flotante) ──
          Se desplaza con `translateX` en vez de montarse y desmontarse: el contenido no reflowea
          durante la animación y el panel entra deslizando desde el borde, como una herramienta que
          aparece sobre el mapa. Fuera de cuadro lo recorta el `overflow-hidden` de la Card. */}
      <div
        // `top-3` + `max-h` en vez de `inset-y-3`: el panel MIDE su contenido y solo llega al alto
        // completo cuando lo necesita. Una pestaña con tres eventos dejaba media tarjeta en blanco.
        className={cn(PANEL_FLOTANTE, DESLIZA, 'right-3 top-3 max-h-[calc(100%-1.5rem)]')}
        style={{
          width: DETALLE_PX,
          transform: seleccionada ? 'translateX(0)' : `translateX(calc(100% + ${MARGEN_PX}px))`,
        }}
        aria-hidden={!seleccionada}
      >
        {seleccionada && <DetalleParadaPanel entrega={seleccionada} onCerrar={() => setParadaFoco(null)} />}
      </div>
    </Card>
  )
}
