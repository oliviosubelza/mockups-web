// Herramienta de dibujo de polígono: click para ir agregando vértices, click sobre el primero (o
// Enter) para cerrarlo, doble click para cerrar en el mismo gesto. Una vez cerrado (o mientras se
// edita una zona ya existente) los vértices se pueden arrastrar o borrar (click derecho) sin volver
// a entrar en modo dibujo.
//
// TODO ES IMPERATIVO (L.Marker/L.Polyline a mano), no `<Marker>` de react-leaflet por vértice: un
// vértice se agrega en cada click mientras se dibuja, y remontar N componentes React por cada uno
// se ve como un parpadeo. Mismo criterio que `SelectionLayer` con el rectángulo y el lazo.
//
// EL PAN, Y POR QUÉ NO ALCANZA LA DISTINCIÓN NATIVA DE LEAFLET:
// La versión anterior confiaba en que "click sin movimiento agrega vértice, click con movimiento
// panea". Es cierto, pero el umbral de Leaflet es `clickTolerance: 3` (leaflet-src.js:5978): con más
// de 3 px de movimiento arranca el arrastre y se traga el click, con menos es un click. Tres píxeles.
// En trackpad eso es una moneda al aire — querés reencuadrar y te clava un vértice, y como no podés
// confiar en el gesto terminás no paneando nunca.
//
// El arreglo es separar los gestos, no subir el umbral: **ESPACIO apretado = modo pan**. Mientras
// está apretado el click no agrega nada, los vértices no se arrastran (así se puede empezar el pan
// encima de uno) y el cursor lo dice. Es la convención de Figma y de cualquier editor vectorial.
//
// Y la línea guía se esconde mientras el mapa se arrastra: seguía al cursor durante el pan, tirando
// una goma elástica gigante por la pantalla, y eso solo hacía que la herramienta PARECIERA rota
// además de serlo.
//
// TIRADORES DE PUNTO MEDIO: ajustando el contorno aparece un tirador tenue en el medio de cada arista,
// y clickearlo INSERTA un vértice ahí. Es la forma de "hacer un quiebre nuevo" en un lado sin tener que
// redibujar la zona entera.
//
// Es CLICK y no arrastrar, y es una decisión, no una limitación que no se vio: los markers se
// reconstruyen en cada cambio de `puntos` (así se dibuja esta capa), así que un arrastre que insertara
// al empezar destruiría, en pleno gesto, el marker que se está arrastrando. Sostener el arrastre pide
// congelar la reconstrucción y actualizar la forma a mano durante el gesto — bastante máquina para
// ahorrar un click, cuando el vértice nuevo aparece justo donde estaba el tirador y arrastrarlo es el
// gesto siguiente natural.
//
// SNAPPING CON HOLGURA: si `anillosSnap` trae la geometría de las zonas vecinas, cada vértice que se
// pone o se arrastra se imanta a sus vértices y aristas (ver `geo/snapping.ts`). Con `holguraMetros` el
// vértice NO queda sobre el borde vecino sino a esa distancia hacia afuera: es lo que hace que dos zonas
// limiten sin tocarse, en vez de compartir el punto exacto. Se puede suspender con ALT apretado, porque
// a veces querés un vértice cerca del borde y no acomodado por la herramienta.
//
// El indicador ámbar dice DÓNDE está el borde vecino y CUÁNTO quedó de separación, con el número puesto
// al lado. Sin el número el imantado sería un acto de fe: a los zooms a los que se dibuja, un metro de
// separación y cero metros se ven exactamente igual.
//
// ANILLO O TRAZO ABIERTO (`cerrado`): la misma herramienta dibuja las dos cosas. Con `cerrado={false}` el
// mínimo baja a 2 puntos, desaparece el lado que une el final con el principio y el primer vértice deja de
// ser el botón de cerrar. Es lo que necesitan las vías cerradas al tránsito de `restricciones`, y va como
// bandera porque todo el resto —pan con ESPACIO, imantado, arrastre, inserción por punto medio, historial—
// es idéntico: en dos componentes separados, cada arreglo habría que hacerlo dos veces.
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { useMap } from 'react-leaflet'
import { oscurecer } from './color'
import type { LatLngTuple } from './geo/polyline'
import { buscarSnap, RADIO_SNAP_PX, type Snap } from './geo/snapping'
import { formatearMetros, incumple } from './geo/holgura'

const AZUL = '#2563eb'
const ESTILO_TRAZO: L.PolylineOptions = { color: AZUL, weight: 2, dashArray: '6 4' }
const ESTILO_GUIA: L.PolylineOptions = { color: AZUL, weight: 1.5, dashArray: '2 6', opacity: 0.55 }
/** Ámbar y no azul: el indicador de imantado tiene que leerse como algo DISTINTO del trazo propio. */
const AMBAR = '#f59e0b'
/** Rojo solo cuando el imantado NO logró la holgura pedida (borde más angosto que la separación, o
 *  geometría degenerada). Es el único caso en que el indicador avisa de un problema y no de una ayuda. */
const ROJO = '#dc2626'
/** Vértice de referencia: relleno. Punto sobre una arista: hueco. La diferencia dice si te estás
 *  alineando con una ESQUINA de la vecina o con un lado, que es información distinta al dibujar. */
const estiloSnap = (snap: Snap, holguraOk: boolean): L.CircleMarkerOptions => {
  const color = holguraOk ? AMBAR : ROJO
  return {
    radius: snap.tipo === 'vertice' ? 7 : 6,
    color,
    weight: 2.5,
    fillColor: color,
    fillOpacity: snap.tipo === 'vertice' ? 1 : 0,
  }
}
const estiloRelleno = (color: string): L.PolylineOptions => ({
  color: oscurecer(color, 0.7),
  weight: 2.5,
  fillColor: color,
  fillOpacity: 0.18,
})
/** Trazo ABIERTO ya terminado (`cerrado={false}`): no hay relleno que lo distinga del trazo en curso,
 *  así que lo que dice "esto ya es una geometría" es el grosor y que deja de ser punteado. */
const estiloLinea = (color: string): L.PolylineOptions => ({
  color,
  weight: 5,
  opacity: 0.95,
  lineCap: 'round',
})

/** Tirador de punto medio: hueco y tenue, para que NO compita con los vértices de verdad. Lo que está
 *  ahí todavía no es un vértice; es la oferta de crear uno. */
function iconoPuntoMedio(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="width:9px;height:9px;border-radius:999px;background:#fff;border:2px dashed ${AZUL};opacity:.55;cursor:copy;"></div>`,
    iconSize: [9, 9],
    iconAnchor: [4.5, 4.5],
  })
}

function iconoVertice(primero: boolean): L.DivIcon {
  const tam = primero ? 13 : 9
  return L.divIcon({
    className: '',
    html: `<div style="width:${tam}px;height:${tam}px;border-radius:999px;background:${primero ? AZUL : '#fff'};border:2px solid ${AZUL};box-shadow:0 1px 3px rgba(0,0,0,.45);cursor:${primero ? 'pointer' : 'move'};"></div>`,
    iconSize: [tam, tam],
    iconAnchor: [tam / 2, tam / 2],
  })
}

export function PolygonDrawLayer({
  puntos,
  /** true mientras se están agregando vértices con click. false = solo edición (arrastrar/borrar). */
  activo,
  onPuntosChange,
  /** Geometría terminada: click en el primer vértice (solo si `cerrado`), doble click o Enter. */
  onFinalizar,
  color = AZUL,
  anillosSnap = [],
  snapActivo = true,
  snapRadioPx = RADIO_SNAP_PX,
  holguraMetros = 0,
  cerrado = true,
}: {
  puntos: LatLngTuple[]
  activo: boolean
  /**
   * `transitorio` distingue el cuadro intermedio de un gesto (arrastrando un vértice) de la acción
   * terminada. Existe para el historial: sin esto, un solo arrastre empuja decenas de entradas y
   * deshacerlo cuesta cuarenta Ctrl+Z. Se llama con `true` en cada `drag` y con `false` al soltar.
   */
  onPuntosChange: (puntos: LatLngTuple[], transitorio?: boolean) => void
  onFinalizar: (puntosFinal: LatLngTuple[]) => void
  color?: string
  /** Anillos de las zonas vecinas contra los que imantar. Vacío = sin snapping. */
  anillosSnap?: LatLngTuple[][]
  /** Interruptor persistente del imantado (el de la barra). ALT lo suspende momentáneamente. */
  snapActivo?: boolean
  snapRadioPx?: number
  /** Separación a dejar contra el borde imantado, en metros. 0 = imantar encima del borde. */
  holguraMetros?: number
  /**
   * ¿La geometría es un ANILLO o un trazo abierto?
   *
   * `true` (por defecto) es el polígono de siempre: mínimo 3 vértices, el último se une con el primero,
   * click en el primer vértice cierra y aparecen tiradores en todas las aristas.
   *
   * `false` es una polilínea —una vía cerrada al tránsito, por ejemplo—: mínimo 2 puntos, NO hay lado de
   * cierre, el primer vértice no tiene el papel de "cerrar acá" y el último tramo no lleva tirador de
   * punto medio porque ese tramo no existe. Se agregó como bandera y no como componente aparte porque
   * todo lo demás —el pan con ESPACIO, el imantado, el arrastre de vértices, la inserción por punto
   * medio, el historial— es idéntico, y duplicarlo dejaría dos herramientas que se arreglan de a una.
   */
  cerrado?: boolean
}) {
  const map = useMap()

  // Refs "espejo" de las props: los handlers de Leaflet se registran una vez y viven fuera del ciclo
  // de render de React, así que necesitan la versión más nueva sin volver a suscribirse.
  const puntosRef = useRef(puntos)
  puntosRef.current = puntos
  const activoRef = useRef(activo)
  activoRef.current = activo
  const onPuntosChangeRef = useRef(onPuntosChange)
  onPuntosChangeRef.current = onPuntosChange
  const onFinalizarRef = useRef(onFinalizar)
  onFinalizarRef.current = onFinalizar
  const anillosSnapRef = useRef(anillosSnap)
  anillosSnapRef.current = anillosSnap
  const snapActivoRef = useRef(snapActivo)
  snapActivoRef.current = snapActivo
  const snapRadioRef = useRef(snapRadioPx)
  snapRadioRef.current = snapRadioPx
  const holguraRef = useRef(holguraMetros)
  holguraRef.current = holguraMetros
  /** Vértices mínimos para que la geometría exista: 3 para un anillo, 2 para un trazo abierto. */
  const minimo = cerrado ? 3 : 2
  const cerradoRef = useRef(cerrado)
  cerradoRef.current = cerrado
  const minimoRef = useRef(minimo)
  minimoRef.current = minimo

  const capaRef = useRef<L.LayerGroup | null>(null)
  const guiaRef = useRef<L.Polyline | null>(null)
  /** Espacio apretado: modo pan. Vive en un ref y no en estado porque lo leen handlers de Leaflet. */
  const panRef = useRef(false)
  /** El mapa se está arrastrando ahora mismo. Apaga la guía, que si no dibuja una goma por la pantalla. */
  const arrastrandoRef = useRef(false)
  /** Los markers de vértice del render actual, para poder apagarles el arrastre en modo pan. */
  const marcadoresRef = useRef<L.Marker[]>([])
  /** ALT apretado: suspende el imantado sin apagar el interruptor de la barra. */
  const altRef = useRef(false)
  /**
   * Hay un vértice EN PLENO ARRASTRE.
   *
   * Existe por un bug concreto: el efecto de redibujo hace `capa.clearLayers()` en cada cambio de
   * `puntos`, y durante un arrastre `puntos` cambia en cada mousemove. O sea que el marker que estabas
   * arrastrando se DESTRUÍA a los pocos píxeles — y `Marker.onRemove` llama a `dragging.removeHooks()`,
   * así que Leaflet soltaba el arrastre solo. El síntoma era exactamente "se mueve 2 o 3 px y se suelta".
   *
   * Con este ref, mientras dura el gesto no se reconstruye nada: solo se le corrigen las coordenadas a
   * la forma que ya está dibujada. La reconstrucción completa llega en el `dragend`.
   */
  const arrastrandoVerticeRef = useRef(false)
  /** La polilínea/polígono del contorno, para poder moverla sin rehacerla. `any` en la geometría porque
   *  acá vive una `L.Polyline` mientras se traza y una `L.Polygon` una vez cerrado, y lo único que se le
   *  pide es `setLatLngs`. */
  const formaRef = useRef<L.Polyline<any> | null>(null)
  /** El tramo punteado que cierra el trazo mientras se dibuja. */
  const cierreRef = useRef<L.Polyline | null>(null)
  /** Los tiradores de punto medio del render actual. */
  const tiradoresRef = useRef<L.Marker[]>([])
  /** Capa APARTE de `capaRef` a propósito: esa se limpia en cada cambio de `puntos` y se llevaría el
   *  indicador puesto justo cuando más hace falta (al soltar un vértice imantado). */
  const indicadorCapaRef = useRef<L.LayerGroup | null>(null)
  const indicadorRef = useRef<L.CircleMarker | null>(null)
  /** Último estado de la holgura (cumple / no cumple), para rebindear la etiqueta solo cuando cambia. */
  const holguraOkRef = useRef(true)

  useEffect(() => {
    const capa = L.layerGroup().addTo(map)
    capaRef.current = capa
    const indicador = L.layerGroup().addTo(map)
    indicadorCapaRef.current = indicador
    return () => {
      capa.remove()
      capaRef.current = null
      indicador.remove()
      indicadorCapaRef.current = null
      indicadorRef.current = null
    }
  }, [map])

  // Imanta un punto contra las zonas vecinas y pinta (o borra) el indicador. Devuelve el punto que hay
  // que usar de verdad: el imantado si hubo snap, el original si no.
  const resolverSnap = (latlng: L.LatLng): LatLngTuple => {
    const original: LatLngTuple = [latlng.lat, latlng.lng]
    const capa = indicadorCapaRef.current
    const snap =
      snapActivoRef.current && !altRef.current && !panRef.current
        ? buscarSnap(map, latlng, anillosSnapRef.current, {
            radioPx: snapRadioRef.current,
            holguraMetros: holguraRef.current,
          })
        : null

    if (!capa) return snap ? snap.latlng : original
    if (!snap) {
      indicadorRef.current?.remove()
      indicadorRef.current = null
      return original
    }
    // El indicador se pone sobre el BORDE vecino y no sobre el vértice resultante: son el mismo píxel
    // (un metro es 0,07 px a zoom 12) y lo que hace falta señalar es la referencia a la que te estás
    // alineando. El número al lado es el que dice cuánto quedó de separación de verdad.
    const holguraOk = holguraRef.current === 0 || !incumple(snap.holguraM)
    const estilo = estiloSnap(snap, holguraOk)
    if (!indicadorRef.current) {
      // Se remonta en cada cambio de tipo porque Leaflet fija algunas opciones del CircleMarker al
      // crearlo; mover el existente alcanza mientras el tipo no cambie.
      indicadorRef.current = L.circleMarker(snap.borde, estilo).addTo(capa)
    } else {
      indicadorRef.current.setLatLng(snap.borde).setStyle(estilo)
    }
    // La etiqueta con el número se BINDEA una sola vez y después solo se le cambia el contenido: se
    // recalcula en cada mousemove, y `bindTooltip` desmonta y vuelve a montar el nodo — a 60 cuadros por
    // segundo eso parpadea. Se rebindea únicamente al cambiar de estado, porque Leaflet fija el
    // `className` al CREAR el tooltip y no lo re-aplica (mismo caso que la etiqueta de `ZonasLayer`).
    if (holguraRef.current > 0) {
      if (indicadorRef.current.getTooltip() === undefined || holguraOkRef.current !== holguraOk) {
        indicadorRef.current.unbindTooltip().bindTooltip('', {
          permanent: true,
          direction: 'right',
          offset: [9, 0],
          className: holguraOk ? 'snap-holgura' : 'snap-holgura snap-holgura-mal',
        })
      }
      indicadorRef.current.setTooltipContent(formatearMetros(snap.holguraM))
    }
    holguraOkRef.current = holguraOk
    return snap.latlng
  }
  const resolverSnapRef = useRef(resolverSnap)
  resolverSnapRef.current = resolverSnap

  const limpiarIndicador = () => {
    indicadorRef.current?.remove()
    indicadorRef.current = null
  }

  // Redibuja la forma y los vértices en cada cambio. `activo` decide si se ve como TRAZO (todavía no
  // es una zona) o como POLÍGONO relleno (ya cerrado) — el mismo lenguaje visual que los mercados.
  useEffect(() => {
    const capa = capaRef.current
    if (!capa) return

    // Arrastre en curso: NO se reconstruye. Se le corrigen las coordenadas a lo que ya está dibujado y
    // se sale. Reconstruir acá es lo que rompía el arrastre (ver `arrastrandoVerticeRef`).
    if (arrastrandoVerticeRef.current) {
      formaRef.current?.setLatLngs(puntos)
      if (cierreRef.current && puntos.length >= 3) {
        cierreRef.current.setLatLngs([puntos[puntos.length - 1], puntos[0]])
      }
      return
    }

    capa.clearLayers()
    guiaRef.current = null
    formaRef.current = null
    cierreRef.current = null
    tiradoresRef.current = []

    if (puntos.length >= 2) {
      formaRef.current = activo
        ? L.polyline(puntos, ESTILO_TRAZO).addTo(capa)
        : cerrado
          ? L.polygon(puntos, estiloRelleno(color)).addTo(capa)
          : L.polyline(puntos, estiloLinea(color)).addTo(capa)
    }
    // El tramo punteado que une el último punto con el primero solo existe si la geometría es un anillo:
    // en una vía cerrada al tránsito ese lado no se va a guardar, y dibujarlo haría creer que sí.
    if (cerrado && activo && puntos.length >= 3) {
      cierreRef.current = L.polyline([puntos[puntos.length - 1], puntos[0]], ESTILO_GUIA).addTo(capa)
    }

    marcadoresRef.current = []
    puntos.forEach((p, i) => {
      // El primer vértice se destaca SOLO cuando cierra el anillo: en un trazo abierto no tiene ningún
      // papel especial, y pintarlo distinto invitaría a clickearlo esperando que pase algo.
      const primero = cerrado && i === 0
      const marker = L.marker(p, { icon: iconoVertice(primero), draggable: true, autoPan: true }).addTo(capa)
      marcadoresRef.current.push(marker)
      // Se remontan en cada cambio de `puntos`, así que hay que reponerles el estado del modo pan.
      if (panRef.current) marker.dragging?.disable()

      marker.on('dragstart', () => {
        arrastrandoVerticeRef.current = true
        // Los tiradores de punto medio quedarían en posiciones viejas durante todo el gesto —y no se
        // recalculan, porque justamente no estamos reconstruyendo—. Se sacan y vuelven en el dragend.
        tiradoresRef.current.forEach((m) => m.remove())
        tiradoresRef.current = []
      })

      marker.on('drag', (e) => {
        const m = e.target as L.Marker
        const destino = resolverSnapRef.current(m.getLatLng())
        // Reposicionar el marker además de avisar el cambio: si no, el punto del arreglo queda imantado
        // pero el círculo sigue pegado al cursor y se ve un desfasaje mientras arrastrás.
        m.setLatLng(destino)
        const siguiente = [...puntosRef.current]
        siguiente[i] = destino
        onPuntosChangeRef.current(siguiente, true)
      })

      // El gesto terminó: acá recién entra al historial, como UNA entrada.
      marker.on('dragend', () => {
        arrastrandoVerticeRef.current = false
        limpiarIndicador()
        // COPIA y no `puntosRef.current` tal cual: el historial guardaría la MISMA referencia que ya es
        // el presente, `puntos` no cambiaría de identidad y el efecto de redibujo no volvería a correr
        // — se quedaría sin reconstruir los markers ni los tiradores para siempre.
        onPuntosChangeRef.current([...puntosRef.current], false)
      })

      // Parado en el mapa, así que su click burbujea al 'click' del mapa (agregaría un vértice
      // fantasma en el mismo lugar) si no se corta acá.
      marker.on('click', (e) => {
        L.DomEvent.stop(e)
        if (panRef.current) return
        if (cerradoRef.current && i === 0 && activoRef.current && puntosRef.current.length >= 3) {
          onFinalizarRef.current(puntosRef.current)
        }
      })

      marker.on('contextmenu', (e) => {
        L.DomEvent.stop(e)
        if (panRef.current) return
        if (puntosRef.current.length <= minimoRef.current) return
        onPuntosChangeRef.current(puntosRef.current.filter((_, idx) => idx !== i), false)
      })

      marker.bindTooltip(primero ? 'Click para cerrar el polígono' : 'Arrastrar para mover · click derecho para borrar', {
        direction: 'top',
        offset: [0, -8],
      })
    })

    // Tiradores de punto medio: solo con el polígono ya cerrado. Mientras se traza, el contorno todavía
    // se está definiendo y llenarlo de puntos intermedios taparía los vértices que estás poniendo.
    if (!activo && puntos.length >= minimo) {
      // Abierto: se recorre un tramo MENOS. El último lado (del final al principio) no se va a guardar,
      // así que ofrecer un vértice ahí crearía un quiebre en una arista que no existe.
      const tramos = cerrado ? puntos.length : puntos.length - 1
      for (let i = 0; i < tramos; i++) {
        const a = puntos[i]
        const b = puntos[(i + 1) % puntos.length]
        // Aristas cortas EN PANTALLA no llevan tirador: en un contorno denso, o alejando el mapa, los
        // tiradores se apilan sobre los vértices de verdad y no se le puede acertar a ninguno de los
        // dos. El umbral va en píxeles porque el problema es de pantalla, no de territorio.
        if (map.latLngToContainerPoint(a).distanceTo(map.latLngToContainerPoint(b)) < 28) continue

        const medio: LatLngTuple = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
        const tirador = L.marker(medio, { icon: iconoPuntoMedio(), interactive: true }).addTo(capa)
        tiradoresRef.current.push(tirador)
        tirador.on('click', (e) => {
          L.DomEvent.stop(e)
          if (panRef.current) return
          const siguiente = [...puntosRef.current]
          siguiente.splice(i + 1, 0, medio)
          onPuntosChangeRef.current(siguiente, false)
        })
        tirador.bindTooltip('Click para insertar un vértice acá', { direction: 'top', offset: [0, -8] })
      }
    }
  }, [puntos, activo, color, map, cerrado, minimo])

  // Modo pan (ESPACIO) y ocultamiento de la guía mientras el mapa se arrastra. Va en su PROPIO efecto
  // y no dentro del de `activo` porque también hace falta al ajustar vértices: ahí el click no agrega
  // nada, pero los markers siguen tapando el mapa y un pan que empieza encima de uno lo arrastra.
  useEffect(() => {
    const container = map.getContainer()

    const aplicarPan = (encendido: boolean) => {
      if (panRef.current === encendido) return
      panRef.current = encendido
      container.style.cursor = encendido ? 'grab' : activoRef.current ? 'crosshair' : ''
      marcadoresRef.current.forEach((m) => (encendido ? m.dragging?.disable() : m.dragging?.enable()))
      if (encendido) {
        guiaRef.current?.remove()
        guiaRef.current = null
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return
      // `e.code` y no `e.key`: con el espacio, `key` es ' ' y se confunde con cualquier separador.
      if (e.key === 'Alt') altRef.current = true
      if (e.code !== 'Space') return
      e.preventDefault() // si no, la página scrollea debajo del mapa
      aplicarPan(true)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') altRef.current = false
      if (e.code === 'Space') aplicarPan(false)
    }
    // Si el foco se va de la ventana con el espacio (o ALT) apretado nunca llega el keyup y el modo
    // quedaría trabado para siempre. Con ALT pasa seguido: Alt+Tab.
    const onBlur = () => {
      altRef.current = false
      aplicarPan(false)
    }

    const onDragStart = () => {
      arrastrandoRef.current = true
      guiaRef.current?.remove()
      guiaRef.current = null
    }
    const onDragEnd = () => {
      arrastrandoRef.current = false
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    map.on('dragstart', onDragStart)
    map.on('dragend', onDragEnd)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      map.off('dragstart', onDragStart)
      map.off('dragend', onDragEnd)
      aplicarPan(false)
    }
  }, [map])

  // Gestos de dibujo: solo se escuchan mientras `activo`. Dejar el arrastre del mapa prendido: un
  // click SIN movimiento sigue siendo un click (agrega vértice), uno CON movimiento sigue paneando.
  useEffect(() => {
    if (!activo) return
    const container = map.getContainer()
    const prevCursor = container.style.cursor
    if (!panRef.current) container.style.cursor = 'crosshair'
    map.doubleClickZoom.disable()

    const onClick = (e: L.LeafletMouseEvent) => {
      if (panRef.current) return
      onPuntosChangeRef.current([...puntosRef.current, resolverSnapRef.current(e.latlng)], false)
    }

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      const capa = capaRef.current
      if (panRef.current || arrastrandoRef.current) return
      // El indicador se calcula SIEMPRE, aunque todavía no haya ningún vértice: el primer punto de una
      // zona nueva es justamente el que más conviene soldar al borde de la vecina.
      const destino = resolverSnapRef.current(e.latlng)
      if (!capa || puntosRef.current.length === 0) return
      const desde = puntosRef.current[puntosRef.current.length - 1]
      if (!guiaRef.current) guiaRef.current = L.polyline([desde, destino], ESTILO_GUIA).addTo(capa)
      else guiaRef.current.setLatLngs([desde, destino])
    }

    const onDblClick = (e: L.LeafletMouseEvent) => {
      L.DomEvent.stop(e)
      // El navegador dispara 'click' DOS veces antes del 'dblclick': los dos ya agregaron un vértice
      // fantasma pegado a este punto. Se descartan (por distancia en pantalla, no en grados —así
      // funciona igual a cualquier zoom) antes de cerrar.
      const aca = map.latLngToContainerPoint(e.latlng)
      let pts = puntosRef.current
      while (pts.length > 0 && map.latLngToContainerPoint(pts[pts.length - 1]).distanceTo(aca) < 8) {
        pts = pts.slice(0, -1)
      }
      if (panRef.current) return
      if (pts.length >= minimoRef.current) onFinalizarRef.current(pts)
      else if (pts.length !== puntosRef.current.length) onPuntosChangeRef.current(pts, false)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      // No compite con escribir el nombre de la zona o abrir el select de ciudad.
      if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return
      if (e.key === 'Enter' && puntosRef.current.length >= minimoRef.current) {
        onFinalizarRef.current(puntosRef.current)
      }
      else if (e.key === 'Escape') onPuntosChangeRef.current([], false)
      else if ((e.key === 'Backspace' || e.key === 'Delete') && puntosRef.current.length > 0) {
        onPuntosChangeRef.current(puntosRef.current.slice(0, -1), false)
      }
    }

    map.on('click', onClick)
    map.on('dblclick', onDblClick)
    map.on('mousemove', onMouseMove)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      map.off('click', onClick)
      map.off('dblclick', onDblClick)
      map.off('mousemove', onMouseMove)
      window.removeEventListener('keydown', onKeyDown)
      container.style.cursor = prevCursor
      map.doubleClickZoom.enable()
      guiaRef.current?.remove()
      guiaRef.current = null
      limpiarIndicador()
    }
  }, [activo, map])

  return null
}
