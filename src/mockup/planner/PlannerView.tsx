// PROPUESTA — Planificación unificada sobre el mapa (paso 1 + paso 2 en una sola pantalla).
//
// QUÉ PROBLEMA RESUELVE.
// Hoy el flujo son dos pantallas: en la primera se eligen camiones y pedidos en tablas, y recién en la
// segunda aparece el mapa. Eso obliga a decidir A CIEGAS —"¿estos 30 pedidos están cerca entre sí?"— y
// a volver atrás cuando el mapa muestra que no. Logística pidió poder agregar y filtrar directamente
// en el armado, sin pasar por el paso previo. Acá el mapa está desde el primer segundo: filtrás y ves
// caer los puntos, elegís camiones y ves cómo se reparten.
//
// DECISIÓN DE LAYOUT — el mapa manda, todo lo demás flota (mismo criterio que el detalle de monitoreo).
// Ningún panel le come ancho al mapa: se superponen y se pliegan. Consecuencias concretas:
//   · El mapa nunca cambia de tamaño → Leaflet no rearma sus tiles al abrir o cerrar un panel, y no se
//     pierde la referencia visual de dónde estabas mirando.
//   · Los paneles TAPAN mapa. Se paga con dos cosas: se pliegan con un click, y la cámara recibe el
//     ancho que ocupan como padding, así ninguna parada queda encuadrada debajo de un panel.
//
// QUÉ NO INVENTA. Todo lo que se ve sale del dataset que ya existe (pedidos, paradas, camiones,
// mercados). No hay ETA, ni distancia en km, ni costo: esos datos no están en el mockup y ponerlos
// sería prometer una pantalla que después no se puede construir.
//
// El flujo actual (`DispatchFlow`) queda intacto: esta ruta es una propuesta paralela para comparar.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { toast } from 'sonner'
import {
  ChevronLeft,
  ClipboardList,
  Loader2,
  MapPinned,
  PackageX,
  Plus,
  Route,
  Trash2,
  Truck,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { openRoute } from '@/core/routing/open-route'
import {
  selectIncludedOrders,
  selectSelectedTrucks,
  useDispatchPlanStore,
} from '../dispatch-plan-store'
import { usePlanesStore } from '../planes-store'
import {
  AUXILIARES,
  CAMIONES,
  CHOFERES,
  tripulacionDeCamion,
  type PlanCamion,
} from '../mock-data'
import { kgToTons } from '../unit-conversion'
import { AlertasPanel } from './AlertasPanel'
import { calcularAlertas } from './planner-alertas'
import { FlotaPanel } from './FlotaPanel'
import { NuevaRutaDialog } from './NuevaRutaDialog'
import { ParadaDetalle } from './ParadaDetalle'
import { ParadaDialog } from './ParadaDialog'
import { ParadaMenu } from './ParadaMenu'
import { AtajosDialog } from './AtajosDialog'
import { usePlannerAtajos } from './planner-atajos'
import { PedidosPanel } from './PedidosPanel'
import { PlannerHud } from './PlannerHud'
import { METRICAS_ALTO_PX, PlannerMetricas } from './PlannerMetricas'
import { PlannerMapa } from './PlannerMapa'
import { RutasPanel } from './RutasPanel'
import {
  aplicarAsignaciones,
  cargaDeRuta,
  TEXTO_OCUPACION,
  construirParadas,
  construirRutas,
  optimizar as repartir,
  reordenarRuta,
  resecuenciar,
  rutaIdDeCamion,
} from './planner-model'
import { RutasTablaPanel, RUTAS_TABLA_PLEGADO_PX } from './RutasTablaPanel'
import { usePlannerStore, type PanelId } from './planner-store'

/** Medidas de los flotantes. En px porque la cámara del mapa las necesita para el padding. */
const PANEL_PX = 300
const DETALLE_PX = 320
const MARGEN_PX = 12
/**
 * Ancho de la barra de herramientas del mapa (`PlannerHerramientas`): botones de 28 px con 2 px de
 * padding a cada lado. Está anclada abajo a la derecha, en la MISMA franja que la tabla de rutas, así
 * que este número es el que las mantiene lado a lado en vez de una encima de la otra.
 */
const HERRAMIENTAS_PX = 32

/** Kilos enteros, con separador de miles: el peso marcado se lee de un vistazo, no se audita. */
const fmt0 = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 })
/**
 * Dónde empieza la columna izquierda (métricas + panel): pegada al borde de arriba.
 *
 * Antes arrancaba más abajo porque el lanzador de paneles le ocupaba la esquina. El lanzador se mudó a
 * la barra superior —los tres botones estaban solos en una tarjeta propia, compitiendo con la barra de
 * acciones por la misma franja cuando las dos hacen lo mismo: mandar— y la esquina quedó libre.
 */
const COLUMNA_TOP_PX = MARGEN_PX

/** Los flotantes entran y salen con el mismo tiempo, o el movimiento se ve descoordinado. */
const DESLIZA = 'transition-transform duration-300 ease-out'

/** Tarjeta elevada sobre el mapa: el panel del dock y el detalle de la parada. */
const FLOTANTE =
  'absolute z-10 flex flex-col overflow-hidden rounded-xl border border-border bg-card/95 shadow-xl backdrop-blur-sm'

// ORDEN = ORDEN DE LA DECISIÓN, de izquierda a derecha: con qué salgo → qué llevo → cómo queda
// repartido. Flota va primera porque sin camiones elegidos no hay plan posible: el gate de Optimizar
// los exige, y abrir en Pedidos hacía que lo primero que armabas fuera lo único que todavía no podías
// usar.
const HERRAMIENTAS: { id: PanelId; label: string; icon: typeof Truck }[] = [
  { id: 'flota', label: 'Flota', icon: Truck },
  // DICE "PUNTOS" Y NO "PEDIDOS", y el cambio no es cosmético: el contador de este botón siempre
  // mostró `paradas.length` —54 puntos de entrega—, pero la etiqueta decía "Pedidos", que son otra
  // cosa y son 71. O sea que el número y la palabra nunca hablaron del mismo objeto. Adentro, el
  // buscador remataba la confusión llamándolos "paradas". Tres nombres para una sola lista.
  //
  // El vocabulario ahora es uno solo: PEDIDO es la orden de venta; PUNTO DE ENTREGA es el lugar (y
  // agrupa de 1 a n pedidos); PARADA es ese mismo punto YA metido en el recorrido de un camión, con
  // su número de orden. Por eso "paradas" solo se usa en el panel de Rutas, que es donde existen.
  //
  // `ClipboardList` y no una caja: lo que se elige acá son ÓRDENES (un documento con líneas), no
  // bultos. El paquete sugería mercadería física, que es justo lo que esta pantalla no maneja.
  { id: 'pedidos', label: 'Puntos', icon: ClipboardList },
  { id: 'rutas', label: 'Rutas', icon: Route },
]

/** Camiones elegibles. Constante de módulo: `CAMIONES` es un dataset fijo, no cambia en runtime. */
const DISPONIBLES = CAMIONES.filter((c) => c.estado === 'disponible')
const ELEGIBLES = DISPONIBLES.length

const TITULOS: Record<PanelId, string> = {
  flota: 'Flota del plan',
  pedidos: 'Puntos de entrega',
  // "La ruta" y no "Las rutas": el listado de las seis se mudó a la tabla del pie, y este panel quedó
  // siendo el DETALLE de la elegida —sus paradas en orden de visita—. El título tiene que decir cuál
  // de las dos preguntas contesta, o el usuario busca acá la comparación que está abajo.
  rutas: 'La ruta elegida',
}

export function PlannerView() {
  const selectedTruckIds = useDispatchPlanStore((s) => s.selectedTruckIds)
  const toggleTruck = useDispatchPlanStore((s) => s.toggleTruck)
  const setOrdersIncluded = useDispatchPlanStore((s) => s.setOrdersIncluded)
  // Suscripción, no `getState()`: el mensaje del estado vacío cambia con el filtro, así que tiene que
  // re-renderizar cuando el canal cambia.
  const sinCanal = useDispatchPlanStore((s) => s.activeCanales.length === 0)
  // Estos selectores derivan arrays NUEVOS en cada llamada; sin igualdad shallow, Zustand v5 los ve
  // como snapshot cambiante y entra en bucle de render.
  const camiones = useDispatchPlanStore(useShallow(selectSelectedTrucks))
  const pedidos = useDispatchPlanStore(useShallow(selectIncludedOrders))

  const panel = usePlannerStore((s) => s.panel)
  const dockAbierto = usePlannerStore((s) => s.dockAbierto)
  const abrirPanel = usePlannerStore((s) => s.abrirPanel)
  const mostrarPanel = usePlannerStore((s) => s.mostrarPanel)
  const cerrarDock = usePlannerStore((s) => s.cerrarDock)
  const asignaciones = usePlannerStore((s) => s.asignaciones)
  const setAsignaciones = usePlannerStore((s) => s.setAsignaciones)
  const accesorios = usePlannerStore((s) => s.accesorios)
  const optimizado = usePlannerStore((s) => s.optimizado)
  const setColorPor = usePlannerStore((s) => s.setColorPor)
  const setOptimizado = usePlannerStore((s) => s.setOptimizado)
  const verMetricas = usePlannerStore((s) => s.verMetricas)
  const verAcciones = usePlannerStore((s) => s.verAcciones)
  const verRutas = usePlannerStore((s) => s.verRutas)
  const setVerRutas = usePlannerStore((s) => s.setVerRutas)
  const altoRutas = usePlannerStore((s) => s.altoRutas)
  const setAltoRutas = usePlannerStore((s) => s.setAltoRutas)
  const rutasPlegado = usePlannerStore((s) => s.rutasPlegado)
  const setRutasPlegado = usePlannerStore((s) => s.setRutasPlegado)
  const optimizando = usePlannerStore((s) => s.optimizando)
  const setOptimizando = usePlannerStore((s) => s.setOptimizando)
  const procesando = usePlannerStore((s) => s.procesando)
  const setProcesando = usePlannerStore((s) => s.setProcesando)
  const paradaFoco = usePlannerStore((s) => s.paradaFoco)
  const setParadaFoco = usePlannerStore((s) => s.setParadaFoco)
  const fichaAbierta = usePlannerStore((s) => s.fichaAbierta)
  const abrirFicha = usePlannerStore((s) => s.abrirFicha)
  const cerrarFicha = usePlannerStore((s) => s.cerrarFicha)
  const menuParada = usePlannerStore((s) => s.menuParada)
  const cerrarMenuParada = usePlannerStore((s) => s.cerrarMenuParada)
  const alternarSeleccion = usePlannerStore((s) => s.alternarSeleccion)
  const setHerramientaStore = usePlannerStore((s) => s.setHerramienta)
  const rutasOcultas = usePlannerStore((s) => s.rutasOcultas)
  const setRutasOcultas = usePlannerStore((s) => s.setRutasOcultas)
  const atajosAbiertos = usePlannerStore((s) => s.atajosAbiertos)
  const setAtajosAbiertos = usePlannerStore((s) => s.setAtajosAbiertos)
  const pedirEncuadre = usePlannerStore((s) => s.pedirEncuadre)
  const seleccion = usePlannerStore((s) => s.seleccion)
  const setSeleccion = usePlannerStore((s) => s.setSeleccion)
  const setHerramienta = usePlannerStore((s) => s.setHerramienta)
  const resetPlanner = usePlannerStore((s) => s.reset)

  const nombresRuta = usePlannerStore((s) => s.nombresRuta)
  const setNombreRuta = usePlannerStore((s) => s.setNombreRuta)
  const setRutaFoco = usePlannerStore((s) => s.setRutaFoco)

  const [destinoMasivo, setDestinoMasivo] = useState<string | null>(null)
  const [nuevaRutaAbierta, setNuevaRutaAbierta] = useState(false)

  // Estado de PANTALLA, no del plan: se limpia al salir para que volver a entrar no arranque con las
  // rutas dibujadas de la visita anterior. La selección de camiones y pedidos SÍ se conserva — es del
  // plan y vive en `dispatch-plan-store`.
  useEffect(() => resetPlanner, [resetPlanner])

  const paradasBase = useMemo(() => construirParadas(pedidos), [pedidos])
  const rutas = useMemo(() => construirRutas(camiones, nombresRuta), [camiones, nombresRuta])
  const paradas = useMemo(
    () => aplicarAsignaciones(paradasBase, asignaciones, rutas),
    [asignaciones, paradasBase, rutas],
  )
  const paradasSinAsignar = useMemo(
    () => paradas.filter((p) => !p.rutaId).length,
    [paradas],
  )

  const disponible = useMemo(
    () => ({
      pesoTon: Number(camiones.reduce((acc, c) => acc + c.capacidadPeso, 0).toFixed(2)),
      volumenM3: Number(camiones.reduce((acc, c) => acc + c.capacidadVolumen, 0).toFixed(1)),
    }),
    [camiones],
  )
  const necesario = useMemo(
    () => ({
      pesoTon: Number(kgToTons(pedidos.reduce((acc, p) => acc + p.peso, 0)).toFixed(2)),
      volumenM3: Number(pedidos.reduce((acc, p) => acc + p.volumen, 0).toFixed(1)),
    }),
    [pedidos],
  )

  const detalleVisible = paradaFoco !== null
  // El detalle se sigue dibujando MIENTRAS sale de cuadro. Sin esto, cerrarlo lo vacía en el primer
  // frame y lo que se ve deslizar es una tarjeta en blanco.
  const [ultimoFocoId, setUltimoFocoId] = useState<string | null>(null)
  useEffect(() => {
    if (paradaFoco) setUltimoFocoId(paradaFoco)
  }, [paradaFoco])
  // El déficit lo calcula la vista porque ahora lo consumen dos piezas (las métricas lo dibujan como
  // barra roja, las acciones lo usan como gate) y no puede haber dos definiciones de "no alcanza".
  const hayDeficit =
    disponible.volumenM3 - necesario.volumenM3 < 0 || disponible.pesoTon - necesario.pesoTon < 0

  const foco = useMemo(
    () => paradas.find((p) => p.id === (paradaFoco ?? ultimoFocoId)) ?? null,
    [paradaFoco, paradas, ultimoFocoId],
  )

  // Márgenes que los flotantes le tapan al mapa. La cámara los usa como padding asimétrico para que
  // "encuadrar" no mande una parada abajo de un panel. Plegado, lo único que tapa son los 32 px del
  // lanzador.
  // Basta con que UNA de las dos tarjetas de la columna esté visible para que tape 300 px: la cámara
  // tiene que reservarlos igual, o encuadrar mandaría paradas debajo de las métricas.
  const margenIzq = MARGEN_PX * 2 + (dockAbierto || verMetricas ? PANEL_PX : 0)
  const margenDer = detalleVisible ? DETALLE_PX + MARGEN_PX * 2 : MARGEN_PX * 3

  /**
   * La tabla de rutas del pie EXISTE solo con el reparto hecho: antes de optimizar no hay rutas
   * generadas, y una tabla vacía apoyada sobre el mapa es alto robado para decir "todavía nada".
   */
  const tablaRutas = optimizado && rutas.length > 0
  const tablaVisible = tablaRutas && verRutas
  /** Lo que la tabla mide AHORA: plegada es su cabecera y nada más. */
  const altoTabla = rutasPlegado ? RUTAS_TABLA_PLEGADO_PX : altoRutas
  /** Lo que la tabla le tapa al mapa por abajo. Es el mismo contrato que los márgenes laterales. */
  const margenAbajo = tablaVisible ? altoTabla + MARGEN_PX : 0

  const enfocar = useCallback(
    (id: string) => {
      setParadaFoco(id)
      pedirEncuadre('foco')
    },
    [pedirEncuadre, setParadaFoco],
  )

  // Optimizar SIMULA trabajo (2 s) a propósito: en la app real esto es una llamada al optimizador, y
  // una pantalla que reparte 40 paradas de forma instantánea entrena una expectativa falsa.
  const timers = useRef<number[]>([])
  useEffect(
    () => () => {
      timers.current.forEach((id) => window.clearTimeout(id))
    },
    [],
  )

  const optimizar = () => {
    if (optimizando || camiones.length === 0 || paradasBase.length === 0) return
    setOptimizando(true)
    const id = window.setTimeout(() => {
      setAsignaciones(repartir(paradasBase, rutas))
      setOptimizado(true)
      setOptimizando(false)
      pedirEncuadre('todo')
      // El color de los puntos salta a "ruta": hasta acá la pregunta era dónde están los clientes de
      // cada canal, y a partir de acá es a quién le tocó cada punto. No es magia, es que el estado de
      // la pantalla avanzó — y se puede volver atrás desde el menú de Capas.
      setColorPor('ruta')
      // `mostrarPanel` y no `abrirPanel`: el segundo es un TOGGLE (el mismo botón del riel abre y
      // pliega), y con Rutas ya abierto lo cerraría justo cuando acaba de llenarse.
      mostrarPanel('rutas')
      toast.success(`Paradas repartidas entre ${rutas.length} ruta(s)`)
    }, 2000)
    timers.current.push(id)
  }

  /** Camiones que todavía no son una ruta: los únicos con los que se puede crear una nueva. */
  const camionesLibres = useMemo(
    () => DISPONIBLES.filter((c) => !selectedTruckIds.includes(c.id)),
    [selectedTruckIds],
  )

  /**
   * Crea una ruta VACÍA a mano.
   *
   * NO inventa una lista de rutas paralela: suma el camión al plan (mismo store que el panel de Flota)
   * y le guarda el nombre. Todo lo que ya existe —el mapa, "Mover a…", optimizar, generar— sigue
   * leyendo `rutas`, que se deriva de los camiones elegidos, así que la ruta nueva es una ruta más
   * desde el primer frame y no un caso especial que haya que contemplar en cada lugar.
   *
   * Sin velo de "procesando": acá no hay reparto que simular, la ruta nace vacía.
   */
  const crearRuta = (camionId: string, nombre: string) => {
    const rutaId = rutaIdDeCamion(camionId)
    toggleTruck(camionId)
    setNombreRuta(rutaId, nombre)
    setNuevaRutaAbierta(false)
    // Se abre el panel de Rutas con la nueva ya elegida: lo siguiente que va a hacer quien la creó es
    // mandarle paradas, y para eso tiene que verla.
    mostrarPanel('rutas')
    setRutaFoco(rutaId)
    toast.success(`${nombre} creada — vacía, movele paradas`)
  }

  /**
   * Saca puntos de entrega del plan.
   *
   * NO INVENTA UN SEGUNDO MECANISMO DE EXCLUSIÓN. Quitar un punto es marcar sus pedidos como no
   * incluidos en `dispatch-plan-store`, que es el MISMO interruptor que usan el diálogo por canal y
   * el de fuera de corte. Como las paradas se derivan de los pedidos incluidos, el punto desaparece
   * solo del mapa y de las tres listas, sin que nadie tenga que acordarse de filtrarlo.
   *
   * Un mecanismo aparte —una lista de "ids ocultos" en el estado de pantalla— habría sido más rápido
   * de escribir y habría creado la peor clase de bug: dos definiciones de "está en el plan" que se
   * contradicen, con el HUD contando una cosa y el mapa dibujando otra.
   *
   * Es REVERSIBLE y por eso no pregunta: se devuelven desde la card "Quitados" del panel de Pedidos.
   */
  const quitarParadas = (paradaIds: string[]) => {
    const objetivo = new Set(paradaIds)
    const pedidoIds = paradas.filter((p) => objetivo.has(p.id)).flatMap((p) => p.pedidos.map((x) => x.id))
    if (pedidoIds.length === 0) return
    setOrdersIncluded(pedidoIds, [])
    setSeleccion([])
    setParadaFoco(null)
    toast.success(
      paradaIds.length === 1
        ? `${paradas.find((p) => objetivo.has(p.id))?.cliente ?? 'Punto'} salió del plan`
        : `${paradaIds.length} puntos salieron del plan`,
      { description: 'Se devuelven desde “Quitados”, en el panel de Pedidos.' },
    )
  }

  /**
   * Mueve un conjunto de paradas a una ruta (o les quita la asignación) y resecuencia.
   *
   * LOS TEXTOS SE ARMAN ACÁ, no en cada llamador. Los tres puntos de entrada —el menú de la parada, el
   * detalle de la derecha y la barra de selección múltiple— tenían cada uno su copia de la misma
   * frase, y la de la barra decía “N parada(s) → Sin asignar”, como si “Sin asignar” fuera una ruta a
   * la que se manda algo. No lo es: quitarle la asignación a una parada no la mueve a ningún lado, la
   * deja esperando camión. Una sola definición de la frase evita que las tres vuelvan a divergir.
   *
   * Son DOS textos y no uno: el velo de trabajo cuenta lo que está pasando (gerundio) y el aviso del
   * final cuenta lo que quedó (pasado). Reusar la misma cadena para los dos dejaba el velo diciendo
   * algo ya terminado.
   *
   * PRENDE LA RUTA DESTINO SI ESTABA APAGADA, y eso arregla un bug con forma de dato perdido. El mapa
   * saca del dibujo las paradas cuya ruta está oculta (`visibles`, en PlannerMapa), y ese filtro solo
   * alcanza a las ASIGNADAS: un punto sin ruta se ve siempre. Así que mover puntos a una ruta apagada
   * los hacía desaparecer JUSTO en el frame en que se asignaban — se veía como "se borraron del plan"
   * cuando en realidad estaban en la ruta y el mapa los estaba filtrando. El caso aparece solo cuando
   * se suman canales DESPUÉS de optimizar: los puntos nuevos entran sin asignar, visibles, y el ojo de
   * la ruta destino puede llevar rato apagado de cuando se estuvo aislando el reparto.
   *
   * Se prende la ruta en vez de bloquear el movimiento porque las dos cosas no compiten: apagar una
   * ruta es una decisión sobre QUÉ MIRAR, y mandarle paradas es una decisión sobre EL PLAN. La segunda
   * manda. El aviso lo dice para que el ojo no parezca haberse prendido solo.
   */
  const mover = (paradaIds: string[], rutaId: string | null) => {
    if (paradaIds.length === 0) return
    const nombreDestino = rutaId ? (rutas.find((r) => r.id === rutaId)?.nombre ?? 'la ruta') : null
    const una = paradaIds.length === 1
    const quien = una
      ? (paradas.find((p) => p.id === paradaIds[0])?.cliente ?? 'El punto')
      : `${paradaIds.length} paradas`
    const enCurso = nombreDestino
      ? `Moviendo ${quien} a ${nombreDestino}…`
      : `Dejando ${quien} sin asignar…`
    const hecho = nombreDestino
      ? `${quien} → ${nombreDestino}`
      : `${quien} ${una ? 'quedó' : 'quedaron'} sin asignar`
    // Las rutas tocadas son la de ORIGEN de cada parada y la de destino: las dos cambian de recorrido.
    const tocadas = new Set<string>()
    if (rutaId) tocadas.add(rutaId)
    for (const id of paradaIds) {
      const previa = asignaciones[id]?.rutaId
      if (previa) tocadas.add(previa)
    }

    const siguiente = { ...asignaciones }
    for (const id of paradaIds) siguiente[id] = { rutaId, secuencia: 0 }

    setProcesando(enCurso)
    const id = window.setTimeout(() => {
      setAsignaciones(resecuenciar(paradasBase, siguiente, [...tocadas]))
      // Del store y no del render: entre el click y este callback pasan 900 ms, y en ese rato el ojo de
      // cualquier ruta pudo cambiar. Escribir el array capturado en el closure revertiría ese cambio.
      const ocultas = usePlannerStore.getState().rutasOcultas
      const seEncendio = rutaId !== null && ocultas.includes(rutaId)
      if (seEncendio) setRutasOcultas(ocultas.filter((x) => x !== rutaId))
      setProcesando(null)
      setSeleccion([])
      setDestinoMasivo(null)
      // Vuelta a la mano: el rectángulo y el lazo DESHABILITAN el arrastre del mapa mientras están
      // activos. Dejar la herramienta puesta después de mover deja el mapa trabado sin motivo.
      setHerramienta('pan')
      toast.success(
        hecho,
        seEncendio
          ? { description: `${nombreDestino} estaba apagada en el mapa: se volvió a mostrar.` }
          : undefined,
      )
    }, 900)
    timers.current.push(id)
  }

  /**
   * Aplica el orden de visita que alguien armó arrastrando filas.
   *
   * SIN el velo de "procesando" que sí tienen optimizar y mover: acá no hay nada que simular. La
   * parada ya está en su ruta y lo único que cambia es su número de orden — el trazo del mapa se
   * redibuja en el mismo frame, y meter una espera de 900 ms convertiría un gesto directo en un
   * trámite.
   */
  const reordenar = (rutaId: string, ordenIds: string[]) => {
    setAsignaciones(reordenarRuta(asignaciones, rutaId, ordenIds))
  }

  // Generar rutas: mismo contrato que el paso 2 actual (guarda el plan con su detalle por camión) para
  // que la propuesta se pueda seguir hasta el listado de planificaciones sin flujos a medias.
  const generar = () => {
    if (paradasSinAsignar > 0) {
      toast.error(`Hay ${paradasSinAsignar} punto(s) de entrega sin asignar a una ruta`)
      return
    }
    const camionesDetalle: PlanCamion[] = rutas.map((ruta) => {
      const truck = ruta.camion
      const base = tripulacionDeCamion(truck.placa)
      const indice = CAMIONES.findIndex((c) => c.id === truck.id)
      const tripulacion = base.chofer
        ? base
        : {
            chofer: CHOFERES[indice % CHOFERES.length] ?? '',
            auxiliar: AUXILIARES[indice % AUXILIARES.length] ?? '',
          }
      const propias = paradas
        .filter((p) => p.rutaId === ruta.id)
        .sort((a, b) => a.secuencia - b.secuencia)
      const cargaKg = propias.reduce((acc, p) => acc + p.pesoTotal, 0)
      const capacidadKg = (truck.capacidadPeso ?? 0) * 1000

      return {
        id: truck.id,
        camionId: truck.id,
        placa: truck.placa,
        tipo: truck.tipo,
        clase: truck.clase,
        capacidadKg,
        capacidadVolM3: truck.capacidadVolumen ?? 0,
        rutaNombre: ruta.nombre,
        rutaId: ruta.id,
        rutaColor: ruta.color,
        paradaIds: propias.map((p) => p.id),
        paradas: propias,
        orderCount: 1,
        cargaKg,
        cargaVolM3: propias.reduce((acc, p) => acc + p.volumenTotal, 0),
        pedidos: propias.reduce((acc, p) => acc + p.pedidos.length, 0),
        chofer: tripulacion.chofer,
        auxiliar: tripulacion.auxiliar,
        ocupacionPct: capacidadKg > 0 ? Math.round((cargaKg / capacidadKg) * 100) : 0,
        // El bandeo viaja con la ruta guardada. Sin esta línea se cargan los pallets en el panel, se
        // genera el plan y el dato se evapora: el control del retorno no tendría contra qué comparar.
        accesorios: accesorios[ruta.id] ?? [],
      }
    })
    // Las rutas vacías no se guardan: un camión sin paradas no es una ruta, es un camión libre.
    const conParadas = camionesDetalle.filter((c) => c.paradaIds.length > 0)

    usePlanesStore.getState().saveActivePlan({
      pedidos: pedidos.length,
      camiones: conParadas.length,
      camionesDetalle: conParadas,
    })
    toast.success(`Plan generado con ${conParadas.length} ruta(s)`)
    openRoute('rutas-creadas')
  }

  /**
   * Paradas que el teclado puede marcar con Ctrl+A: las que se están VIENDO. Una ruta oculta no se ve,
   * así que meter sus paradas en la selección sería marcar a ciegas.
   */
  const paradaMenu = useMemo(
    () => (menuParada ? (paradas.find((p) => p.id === menuParada.id) ?? null) : null),
    [menuParada, paradas],
  )

  usePlannerAtajos(
    useMemo(
      () => ({
        setHerramienta: setHerramientaStore,
        encuadrar: () => pedirEncuadre('todo'),
        alternarPanel: () => (dockAbierto ? cerrarDock() : mostrarPanel(panel)),
        irAPanel: (p) => mostrarPanel(p),
        seleccionarTodo: () =>
          setSeleccion(
            paradas.filter((p) => !(p.rutaId && rutasOcultas.includes(p.rutaId))).map((p) => p.id),
          ),
        // Escape es "soltar todo lo que tengo agarrado", en un orden: primero lo marcado (que es lo
        // más caro de reconstruir por accidente), y recién si no hay nada marcado, el foco.
        limpiar: () => {
          if (usePlannerStore.getState().seleccion.length > 0) {
            setSeleccion([])
            return
          }
          setParadaFoco(null)
        },
        optimizar,
        verAyuda: () => setAtajosAbiertos(true),
      }),
      // `optimizar` y `mover` se redefinen en cada render (dependen de los datos), así que el objeto
      // se rearma igual; el `useMemo` está para que no lo haga cuando NADA cambió.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [dockAbierto, panel, paradas, rutasOcultas, optimizado, optimizando, rutas],
    ),
  )

  /**
   * Los problemas del plan, en un solo lugar.
   *
   * Se recalcula en cada render porque TODO lo que entra puede cambiar en cualquier momento (un
   * camión que se suma, una parada que se mueve, un pedido que se saca). Es una función pura sobre
   * arrays que ya están en memoria; el costo es irrelevante al lado de redibujar el mapa.
   */
  const alertas = useMemo(
    () => calcularAlertas({ pedidos, camiones, rutas, paradasAsignadas: paradas, optimizado }),
    [camiones, optimizado, paradas, pedidos, rutas],
  )

  const paradasMarcadas = useMemo(
    () => paradas.filter((p) => seleccion.includes(p.id)),
    [paradas, seleccion],
  )

  /**
   * Peso de lo MARCADO. Es la cuenta que se hace armando una ruta a mano: se marca un área, se mira
   * cuánto pesa, se suma un punto más.
   */
  const marcado = useMemo(
    () => ({ pesoKg: paradasMarcadas.reduce((acc, p) => acc + p.pesoTotal, 0) }),
    [paradasMarcadas],
  )

  const conteoPanel: Record<PanelId, number> = {
    pedidos: paradas.length,
    flota: selectedTruckIds.length,
    rutas: rutas.length,
  }



  return (
    // `rounded-none`: el mapa va a sangre. Con el `rounded-xl` que trae Card, el `overflow-hidden`
    // recortaba las cuatro esquinas del mapa y dejaba un borde curvo peleando con las tarjetas
    // flotantes —que sí son redondeadas—. Acá el contraste es el que ordena: fondo recto, herramientas
    // redondeadas encima.
    // `border-0` además de `rounded-none`: la ruta pide `fullBleed`, así que este borde caería JUSTO
    // encima del `border-b` de la topbar y del borde del sidebar — dos líneas de 1 px pegadas que se
    // leen como una sola gruesa y mal alineada.
    <Card className="relative h-full min-h-0 gap-0 overflow-hidden rounded-none border-0 p-0">
      {/* `isolate` NO es decorativo: CONTIENE la escalera de z-index de Leaflet, que internamente
          llega a 1000. Sin esto esos valores compiten en el contexto de apilado RAÍZ y, como los
          overlays de la app se portalizan al body con z-50 (selects, popovers), el mapa les ganaba y
          aparecían DETRÁS. Con el mapa aislado, el máximo que esta pantalla aporta al contexto raíz
          es el z-10 de los flotantes. */}
      <div className="absolute inset-0 isolate">
        <PlannerMapa
          paradas={paradas}
          rutas={rutas}
          margenIzq={margenIzq}
          margenDer={margenDer}
          margenAbajo={margenAbajo}
        />
      </div>

      {/* ── Métricas del plan ──
          Primera tarjeta de la columna izquierda, con el MISMO ancho que el panel de abajo: las dos son
          la misma columna, no dos objetos que cayeron cerca. Alto fijo (`METRICAS_ALTO_PX`) para que el
          panel de abajo sepa dónde empezar sin medir el DOM y no salte cuando un número pasa de dos a
          tres dígitos. */}
      <div
        className={cn(FLOTANTE, DESLIZA, 'left-3')}
        style={{
          width: PANEL_PX,
          top: COLUMNA_TOP_PX,
          transform: verMetricas ? 'translateX(0)' : `translateX(calc(-100% - ${MARGEN_PX}px))`,
        }}
        aria-hidden={!verMetricas}
      >
        <PlannerMetricas
          camionesElegidos={selectedTruckIds.length}
          camionesElegibles={ELEGIBLES}
          paradas={paradas.length}
          pedidos={pedidos.length}
          volumenDisponible={disponible.volumenM3}
          volumenNecesario={necesario.volumenM3}
          pesoDisponibleTon={disponible.pesoTon}
          pesoNecesarioTon={necesario.pesoTon}
        />
      </div>

      {/* ── Panel activo ──
          Cae DEBAJO del lanzador (y de las métricas, si están encendidas) y con su mismo borde
          izquierdo, no a su costado: al costado se leían como dos cosas distintas puestas en fila y el
          panel quedaba "después" de una columna de íconos. Alineados al mismo eje son una columna.

          SIEMPRE montado y desplazado con `translateX`: montarlo y desmontarlo lo hacía aparecer de
          golpe, sin transición posible, y remontaba las listas en cada apertura. El `top` transiciona
          para que apagar las métricas lo haga SUBIR en vez de saltar. */}
      <div
        className={cn(FLOTANTE, DESLIZA, 'left-3 bottom-3 transition-[transform,top]')}
        style={{
          width: PANEL_PX,
          top: verMetricas ? COLUMNA_TOP_PX + METRICAS_ALTO_PX + 6 : COLUMNA_TOP_PX,
          transform: dockAbierto ? 'translateX(0)' : `translateX(calc(-100% - ${MARGEN_PX}px))`,
        }}
        aria-hidden={!dockAbierto}
      >
        <div className="flex h-7 shrink-0 items-center gap-1 border-b border-border px-2.5">
          <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {TITULOS[panel]}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-5 shrink-0 text-muted-foreground"
            onClick={cerrarDock}
            title="Ocultar el panel"
            aria-label="Ocultar el panel"
          >
            <ChevronLeft size={13} />
          </Button>
        </div>

        {panel === 'flota' && <FlotaPanel />}
        {panel === 'pedidos' && (
          <PedidosPanel
            paradas={paradas}
            rutas={rutas}
            paradaFoco={paradaFoco}
            onFoco={enfocar}
          />
        )}
        {panel === 'rutas' && (
          <RutasPanel
            rutas={rutas}
            paradasAsignadas={paradas}
            paradaFoco={paradaFoco}
            onFoco={enfocar}
            onOptimizar={optimizar}
            onReordenar={reordenar}
          />
        )}
      </div>

      {/* ── Barra superior: selector de panel + acciones ──
          Los tres botones de panel vivían en una tarjeta propia pegada a la esquina. Eran el único
          objeto de esa esquina y competían con esta barra por la misma franja, cuando las dos cosas son
          lo mismo: los mandos de la pantalla. Juntos en una sola tarjeta se leen como un solo control y
          la columna izquierda recupera el borde de arriba.

          ORDEN: navegación (qué panel miro) → separador → acciones (qué le hago al plan). De izquierda
          a derecha, de lo reversible a lo que no lo es.

          `pointer-events-none` en el contenedor y `auto` en la tarjeta: la franja no captura los clicks
          del mapa que quedan a sus costados. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center transition-[padding] duration-300 ease-out"
        style={{ paddingLeft: margenIzq, paddingRight: margenDer }}
      >
        <div className="pointer-events-auto flex h-11 shrink-0 items-center gap-1 rounded-xl border border-border bg-card/95 px-2 shadow-xl backdrop-blur-sm">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => openRoute('planificacion-mapa')}
            title="Volver a la lista de planificaciones"
          >
            <ChevronLeft size={14} />
            <span className="hidden sm:inline">Volver</span>
          </Button>
          <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />

          {HERRAMIENTAS.map(({ id, label, icon: Icon }) => {
            const activo = panel === id && dockAbierto
            return (
              <Button
                key={id}
                variant="ghost"
                size="sm"
                onClick={() => abrirPanel(id)}
                title={`${label}${conteoPanel[id] > 0 ? ` (${conteoPanel[id]})` : ''}`}
                aria-pressed={activo}
                className={cn(
                  'h-7 gap-1.5 px-2 text-xs',
                  activo && 'bg-primary/15 text-primary hover:bg-primary/20',
                )}
              >
                <Icon size={14} />
                {label}
                {/* El conteo va como texto al lado del nombre, no como pastilla flotante: acá hay
                    ancho, y una pastilla encima del ícono era un parche del botón cuadrado de 28 px. */}
                {conteoPanel[id] > 0 && (
                  <span className="tabular-nums text-muted-foreground">{conteoPanel[id]}</span>
                )}
              </Button>
            )
          })}

          {verAcciones && (
            <>
              <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />

              {/* Los avisos van PRIMEROS del grupo de acciones. La barra se lee de izquierda a
                  derecha como el trabajo: qué está mal → armar → repartir → guardar. Un contador de
                  problemas después del botón de guardar llega tarde. */}
              <AlertasPanel alertas={alertas} onIrA={mostrarPanel} />

              {/* "Nueva ruta" SOLO existe con el reparto hecho, y no está deshabilitado antes: está
                  ausente. Antes de optimizar no hay rutas —hay camiones elegidos y paradas sueltas—,
                  así que "crear una ruta más" no significa nada todavía; para sumar capacidad en ese
                  momento el lugar es Flota. Su momento es DESPUÉS: mirás el reparto, decidís que ese
                  grupo de puntos merece su propio recorrido, y necesitás un destino al que mandarlos.

                  Va antes de Optimizar y fuera del HUD: el HUD son las dos acciones que hacen AVANZAR
                  el plan (repartir, guardar), y esto es corregirlo. */}
              {optimizado && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs"
                  disabled={camionesLibres.length === 0}
                  onClick={() => setNuevaRutaAbierta(true)}
                  title={
                    camionesLibres.length === 0
                      ? 'Todos los camiones disponibles ya son una ruta de este plan'
                      : 'Crear una ruta vacía para moverle paradas'
                  }
                >
                  <Plus size={14} />
                  Nueva ruta
                </Button>
              )}
              <PlannerHud
                camionesElegidos={selectedTruckIds.length}
                paradas={paradas.length}
                paradasSinAsignar={paradasSinAsignar}
                hayDeficit={hayDeficit}
                optimizado={optimizado}
                optimizando={optimizando}
                onOptimizar={optimizar}
                onGenerar={generar}
              />
            </>
          )}
        </div>
      </div>

      {/* ── Detalle de la parada (derecha) ──
          Mide su contenido y solo llega al alto completo cuando lo necesita: un punto con un pedido
          dejaría media tarjeta en blanco.

          SU TECHO DE ALTO DESCUENTA LA TABLA DEL PIE, y eso es lo que evita que abrir una parada
          EMPUJE la tabla. Antes la tabla se angostaba para dejarle lugar: cada click en un punto le
          movía el ancho y las columnas saltaban, cuando el detalle es una tarjeta corta que casi nunca
          llega abajo. Ahora la tabla no se mueve nunca y el que cede es el detalle, que además ya
          scrollea por dentro. */}
      <div
        className={cn(FLOTANTE, DESLIZA, 'right-3 top-3')}
        style={{
          width: DETALLE_PX,
          maxHeight: `calc(100% - 1.5rem - ${margenAbajo}px)`,
          transform: detalleVisible ? 'translateX(0)' : `translateX(calc(100% + ${MARGEN_PX}px))`,
        }}
        aria-hidden={!detalleVisible}
      >
        {foco && (
          <ParadaDetalle
            parada={foco}
            rutas={rutas}
            paradas={paradas}
            hayRutas={optimizado}
            onCerrar={() => setParadaFoco(null)}
            onQuitar={() => quitarParadas([foco.id])}
            onVerFicha={() => abrirFicha(foco.id)}
            onMover={(rutaId) => mover([foco.id], rutaId)}
          />
        )}
      </div>

      {/* ── Tabla de rutas generadas (al pie, entre las dos columnas) ──
          POR QUÉ ABAJO Y NO EN LA COLUMNA IZQUIERDA. El panel de Rutas muestra UNA ruta a la vez y eso
          está bien para "¿este recorrido tiene sentido?", pero deja sin lugar la otra pregunta: "de las
          seis, ¿cuál va apretada y cuál vacía?". Eso es comparar filas, y comparar filas pide ANCHO —
          justo lo que a la columna de 300 px le falta y a la franja del pie le sobra.

          VIVE ENTRE LAS DOS COLUMNAS, no de borde a borde: apoyada debajo del panel lateral lo
          acortaría, y el panel lateral es el que se usa para trabajar. Los flotantes de los costados
          mandan; la tabla ocupa lo que sobra en el medio.

          Montada mientras haya rutas y desplazada con `translateY` al apagarla, igual que el panel
          lateral: remontar la tabla en cada apertura perdería el scroll y el alto se vería saltar. */}
      {tablaRutas && (
        <div
          className={cn(FLOTANTE, DESLIZA, 'bottom-3')}
          style={{
            // Los bordes salen de las mismas medidas que los márgenes de la cámara, y no de un valor
            // propio: si se separan, la tabla y el encuadre dejan de hablar de la misma pantalla.
            left: MARGEN_PX + (dockAbierto || verMetricas ? PANEL_PX + 6 : 0),
            // Fijo, y NO reactivo al detalle de la parada: lo único que descuenta es la barra de
            // herramientas del mapa, que está anclada en la misma esquina y quedaría tapada justo
            // cuando se está marcando en el mapa. El detalle no entra en esta cuenta porque el que se
            // acorta para no pisarla es él (ver su `maxHeight`).
            right: MARGEN_PX + HERRAMIENTAS_PX + 6,
            height: altoTabla,
            transform: verRutas ? 'translateY(0)' : `translateY(calc(100% + ${MARGEN_PX}px))`,
          }}
          aria-hidden={!verRutas}
        >
          <RutasTablaPanel
            rutas={rutas}
            paradasAsignadas={paradas}
            alto={altoRutas}
            onAlto={setAltoRutas}
            plegado={rutasPlegado}
            onPlegado={setRutasPlegado}
            onCerrar={() => setVerRutas(false)}
          />
        </div>
      )}

      {/* ── Barra de selección múltiple (abajo, centrada) ──
          Aparece SOLO con paradas marcadas por rectángulo o lazo. Es una barra y no un diálogo a
          propósito: mover un grupo se decide MIRANDO dónde están esos puntos, y un modal tapa
          justamente eso. Entra deslizando desde abajo para que el cambio de estado se note sin robar
          el foco. */}
      <div
        // El `bottom` es dinámico porque la tabla de rutas se apoya en la misma franja: la barra tiene
        // que subir por encima de ella o queda tapada justo cuando hace falta (marcar paradas en el
        // mapa y mirar en qué ruta caen es el mismo gesto).
        style={{ bottom: tablaVisible ? altoTabla + MARGEN_PX + 10 : 16 }}
        className={cn(
          'absolute inset-x-0 z-20 flex justify-center px-4',
          // Ver la nota de la pestaña: en Tailwind v4 `translate-y-*` es la propiedad `translate`.
          'transition-[opacity,translate] duration-300 ease-out',
          seleccion.length > 0
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none translate-y-3 opacity-0',
        )}
        aria-hidden={seleccion.length === 0}
      >
        <div className="flex items-center gap-2 rounded-full border border-border bg-card/95 py-1.5 pl-4 pr-1.5 shadow-xl backdrop-blur-sm">
          <span className="text-xs">
            <span className="font-semibold tabular-nums">{paradasMarcadas.length}</span> parada
            {paradasMarcadas.length !== 1 ? 's' : ''} marcada
            {paradasMarcadas.length !== 1 ? 's' : ''}
          </span>
          <span className="text-xs text-muted-foreground">
            {paradasMarcadas.reduce((acc, p) => acc + p.pedidos.length, 0)} pedidos
          </span>

          {/* PESO DE LO MARCADO, en kg y nada más. Es la cuenta que se hace armando una ruta a mano:
              se marca, se mira cuánto pesa, se marca uno más. En kg y no en toneladas porque los
              incrementos que interesan son de a cien y pico, y en toneladas eso es "1,2" tres veces
              seguidas. */}
          <span className="text-xs font-medium tabular-nums">
            Peso: {fmt0.format(marcado.pesoKg)} kg
          </span>

          {/* MOVER A… SOLO EXISTE CON EL REPARTO HECHO, igual que "Nueva ruta" en la barra de arriba y
              por la misma razón: antes de optimizar no hay rutas, hay camiones elegidos y paradas
              sueltas. Ofrecer las N rutas derivadas de esos camiones las hacía pasar por generadas —y
              "Sin asignar" ahí es doblemente vacío, porque en ese momento TODAS lo están.

              No va deshabilitado: un select gris con un destino que no existe todavía sigue afirmando
              que existe. Lo que queda es el otro uso legítimo de marcar un área antes de repartir,
              que es sacar puntos del plan. */}
          {!optimizado ? (
            <span className="text-xs text-muted-foreground">
              Optimizá primero: todavía no hay rutas a las que moverlas.
            </span>
          ) : (
            <>
              <Select value={destinoMasivo ?? ''} onValueChange={(v) => v && setDestinoMasivo(v)}>
                <SelectTrigger className="h-7 w-52 text-xs">
                  <SelectValue placeholder="Mover a…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sin-asignar">
                    <span className="flex items-center gap-2 text-xs">
                      <PackageX size={12} className="text-muted-foreground" />
                      Sin asignar
                    </span>
                  </SelectItem>
                  {rutas.map((r) => {
                    const c = cargaDeRuta(paradas, r)
                    return (
                      <SelectItem key={r.id} value={r.id}>
                        <span className="flex w-full items-center gap-2 text-xs">
                          <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
                          <span className="min-w-0 flex-1 truncate">{r.nombre}</span>
                          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{r.camion.placa}</span>
                          <span
                            className={cn(
                              'shrink-0 text-right text-[11px] font-semibold tabular-nums',
                              TEXTO_OCUPACION[c.nivel],
                            )}
                          >
                            {c.ocupacionPct}%
                          </span>
                        </span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>

              <Button
                size="sm"
                className="h-7"
                disabled={!destinoMasivo}
                onClick={() =>
                  mover(
                    paradasMarcadas.map((p) => p.id),
                    destinoMasivo === 'sin-asignar' ? null : destinoMasivo,
                  )
                }
              >
                Mover
              </Button>
            </>
          )}

          {/* QUITAR es la otra mitad de esta barra: marcás un área y o la mandás a otra ruta, o la
              sacás del plan. No es una herramienta de puntero aparte —un modo "goma" que borra al
              hacer click— porque el rectángulo y el lazo YA son la forma de elegir qué; sumar un
              quinto modo destructivo solo agrega una manera de borrar sin querer. */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400"
            onClick={() => quitarParadas(paradasMarcadas.map((p) => p.id))}
            title="Sacar del plan los puntos marcados — se devuelven desde “Quitados”"
          >
            <Trash2 size={13} />
            Quitar
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => {
              setSeleccion([])
              setDestinoMasivo(null)
              setHerramienta('pan')
            }}
            title="Limpiar la selección"
            aria-label="Limpiar la selección"
          >
            <X size={14} />
          </Button>
        </div>
      </div>

      {/* Menú contextual de la parada (click derecho en su marcador). */}
      {menuParada && paradaMenu && (
        <ParadaMenu
          parada={paradaMenu}
          rutas={rutas}
          paradas={paradas}
          hayRutas={optimizado}
          x={menuParada.x}
          y={menuParada.y}
          marcada={seleccion.includes(paradaMenu.id)}
          onCerrar={cerrarMenuParada}
          onVerFicha={() => abrirFicha(paradaMenu.id)}
          onAlternarSeleccion={() => alternarSeleccion(paradaMenu.id)}
          onCentrar={() => pedirEncuadre('foco')}
          onQuitar={() => quitarParadas([paradaMenu.id])}
          onMover={(rutaId) => mover([paradaMenu.id], rutaId)}
        />
      )}

      <AtajosDialog abierto={atajosAbiertos} onCerrar={() => setAtajosAbiertos(false)} />

      <NuevaRutaDialog
        abierto={nuevaRutaAbierta}
        onOpenChange={setNuevaRutaAbierta}
        camionesLibres={camionesLibres}
        nombreSugerido={`Ruta ${rutas.length + 1}`}
        onCrear={crearRuta}
      />

      {/* Ficha del punto. Se abre clickeando su marcador en el mapa o desde el panel lateral; el panel
          queda debajo, así que cerrarla devuelve a donde se estaba. */}
      <ParadaDialog
        parada={fichaAbierta ? foco : null}
        rutas={rutas}
        paradas={paradas}
        hayRutas={optimizado}
        onCerrar={cerrarFicha}
        onMover={(rutaId) => {
          if (!foco) return
          mover([foco.id], rutaId)
          cerrarFicha()
        }}
        onCentrar={() => {
          cerrarFicha()
          pedirEncuadre('foco')
        }}
      />

      {/* Velo de trabajo en curso. z alto para tapar también los controles internos de Leaflet. */}
      {(optimizando || procesando) && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/50 backdrop-blur-[1px]">
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-3 shadow-xl">
            <Loader2 size={18} className="animate-spin text-primary" />
            <span className="text-sm font-medium">
              {optimizando ? 'Repartiendo paradas entre los camiones…' : procesando}
            </span>
          </div>
        </div>
      )}

      {/* Estado vacío: sin canal no hay pedidos, y el mapa quedaría mudo sin decir por qué. Se muestra
          sobre el mapa, no en lugar de él — la ciudad sigue siendo el contexto. */}
      {paradas.length === 0 && !optimizando && (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
          <div className="pointer-events-auto flex max-w-xs flex-col items-center gap-1.5 rounded-xl border border-border bg-card/95 px-5 py-4 text-center shadow-xl backdrop-blur-sm">
            <MapPinned size={20} className="text-muted-foreground" />
            <p className="text-sm font-medium">
              {sinCanal ? 'Todavía no hay paradas' : 'Ningún pedido coincide'}
            </p>
            {/* Dos mensajes distintos porque son dos situaciones distintas: no haber pedido nada
                todavía, o haber filtrado hasta dejar la ciudad vacía. Con un solo texto ("elegí un
                canal") el segundo caso mandaba a tocar un filtro que ya estaba puesto. */}
            <p className="text-xs text-muted-foreground">
              {sinCanal
                ? 'Abrí Pedidos y elegí al menos un canal: los puntos aparecen en el mapa a medida que filtrás.'
                : 'Los filtros actuales no dejan pasar ningún pedido. Sacá alguna ciudad, zona o vendedor.'}
            </p>
            <Button size="sm" variant="outline" className="mt-1" onClick={() => mostrarPanel('pedidos')}>
              {sinCanal ? 'Abrir pedidos' : 'Revisar filtros'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
