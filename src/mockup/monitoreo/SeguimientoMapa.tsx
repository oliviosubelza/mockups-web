// Mapa del MONITOREO. Es un componente aparte de `OrdersMap` a propósito, no por duplicar código.
//
// Los dos mapas tienen contratos incompatibles:
//   · OrdersMap  → color = camión asignado, ícono = canal del cliente. Pregunta: "¿a quién le tocó?"
//   · Este       → color/relleno = estado de la entrega, número = orden de visita. Pregunta: "¿cómo va?"
// Meter los dos en un solo componente obliga a un prop `modo` y a ramificar cada pin, cada tooltip y
// cada capa. Eso es exactamente cómo un archivo de 250 líneas termina en 1000. Lo que SÍ se comparte
// son las primitivas: `divIcon`, el control de capas y el invalidate por resize.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapPin, Truck, Warehouse } from 'lucide-react'
import { MapContainer, Marker, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { cn } from '@/lib/utils'
import type { LatLngTuple } from '../map/geo/polyline'
import { cortarEn, unirTramos } from '../map/geo/recorrido'
import { oscurecer } from '../map/color'
import { reactIcon } from '../map/div-icon'
import { encuadrar } from '../map/encuadrar'
import { InvalidateOnResize } from '../map/InvalidateOnResize'
import { CLAVES_TRAZO, TRAZO, TRAZO_LABEL, type ClaveTrazo } from './trazo-estilo'
import { CAPA_POR_DEFECTO } from '../map/tiles'
import { CapaBaseTiles } from '../map/CapaBaseTiles'
import { MercadosLayer } from '../map/mercados/MercadosLayer'
import { useCityIdsDelMapa, useMercadosMapa } from '../map/mercados/use-mercados-mapa'
import { DEPOSITO } from '../mock-data'
import type { EntregaMonitoreo, ViajeMonitoreo } from './monitoreo-data'
import { HerramientasMapa, type CapaBase } from './HerramientasMapa'
import { useNotificacionesStore } from './notificaciones-store'
import { useNotificacionesEventos } from './use-notificaciones-eventos'
import { ESTADO_ENTREGA } from './monitoreo-estado'
import { minutosSinSenal, posicionDe, senalVieja as esSenalVieja, type ItemActual } from './tracking-dynamo'

const SANTA_CRUZ: [number, number] = [-17.786, -63.17]
const INITIAL_ZOOM = 12

/** Zoom al centrar. 15 muestra unas cuadras: suficiente contexto para saber DÓNDE sin perder la calle. */
const ZOOM_CAMION = 15
const ZOOM_PARADA = 16

/**
 * Cuánto se queda la cámara en la próxima parada antes de volver a la traza del camión.
 *
 * El vuelo de ida dura 0,9 s, así que esto deja ~1,7 s de quietud sobre la parada: alcanza para leer
 * cuál es y dónde está, y no tanto como para que la pantalla se sienta trabada. Menos de un segundo de
 * pausa y el movimiento se lee como un rebote, no como "mirá acá, ahora mirá allá".
 */
const MS_MIRANDO_LA_PARADA = 2600

/** Alto del rombo que forma la punta, proporcional al cuerpo de la chapa. */
const puntaDe = (ancho: number) => Math.round(ancho * 0.34)

/**
 * Chapa blanca con punta. Hoy la usa SOLO EL DEPÓSITO.
 *
 * Nació como el contenedor de todos los marcadores de lugar y las paradas la dejaron cuando se
 * volvieron gotas: envolver el color en blanco cuesta una capa de anidamiento, y con ocho paradas en el
 * mismo barrio ese costo se pagaba en solapamiento (ver `PIN_ANCHO`). Para el depósito el argumento
 * original sigue en pie y encima suma: es UNO, no se apila con nada, y ser la única chapa del mapa lo
 * distingue de las paradas de un vistazo — que es exactamente lo que un punto de partida tiene que hacer.
 *
 * La punta es un cuadrado rotado 45° que el cuerpo tapa por la mitad, así solo asoma el vértice.
 * La sombra va como `drop-shadow` en el contenedor y no como `box-shadow` en cada parte: `drop-shadow`
 * sigue la silueta combinada, de modo que cuerpo y punta proyectan UNA sombra en vez de dos cruzadas.
 */
function Chapa({
  ancho,
  resaltado,
  children,
}: {
  ancho: number
  resaltado?: boolean
  children: React.ReactNode
}) {
  const punta = puntaDe(ancho)

  return (
    <div
      style={{
        position: 'relative',
        width: ancho,
        height: ancho + punta / 2,
        filter: `drop-shadow(0 2px 3px rgb(0 0 0 / ${resaltado ? 0.45 : 0.3}))`,
      }}
    >
      {/* La punta va PRIMERO en el DOM para que el cuerpo la pinte encima. */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: ancho - punta / 2,
          width: punta,
          height: punta,
          marginLeft: -punta / 2,
          background: '#fff',
          borderRadius: 2,
          transform: 'rotate(45deg)',
        }}
      />
      <div
        style={{
          position: 'relative',
          width: ancho,
          height: ancho,
          // Círculo perfecto, no cuadrado redondeado: a 32px un `border-radius` intermedio no se lee
          // como una forma decidida, se lee como un círculo mal hecho.
          borderRadius: 999,
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * Contorno de la gota y su caja. Es EL MISMO marcador que el editor de planificación, y el path está
 * copiado y no importado a propósito: los dos mapas tienen contratos distintos —allá el ancho codifica
 * el peso de la parada, acá no hay peso— y compartir el componente obligaría a un prop `modo` que
 * ramifique cada pieza. Lo que se comparte es la FORMA, que es una constante de dos líneas.
 *
 * La caja (`-2 -2 30 37`) es más grande que la gota (24 × 32) porque el aro de la parada en foco se
 * dibuja por FUERA de la silueta y en una caja justa quedaba recortado contra el borde.
 */
const GOTA = 'M13 1C6.37 1 1 6.37 1 13c0 8.6 12 20 12 20s12-11.4 12-20C25 6.37 19.63 1 13 1z'
const VIEWBOX_PIN = '-2 -2 30 37'
const CAJA_SOBRE_GOTA = 30 / 24
const PIN_RATIO = 37 / 30
/** Dónde cae la PUNTA dentro de la caja. Un pin ancla en su punta o flota arriba de lo que señala. */
const PIN_ANCLA_Y = 35 / 37
/** Azul de la selección. Es el mismo de `en_camino` y del editor: la selección es una sola idea. */
const SELECCION = '#2563eb'

/**
 * Ancho de la gota de una parada, en px.
 *
 * ERA UNA CHAPA DE 32 px (40 al resaltarse) y eso estaba mal medido. La chapa blanca envolvía un
 * círculo de color que a su vez envolvía el número: tres capas anidadas, y cada una necesita su propio
 * diámetro, así que el marcador terminaba en 43 px de alto —54 el resaltado— para mostrar un número de
 * una cifra. Con ocho paradas en el mismo barrio se pisaban entre ellas y el mapa se leía como una
 * mancha con relieve.
 *
 * La gota resuelve lo mismo con una capa menos: el color ES la silueta y el hueco blanco es el fondo
 * del número, no un envoltorio. 22 px es el mismo ancho máximo que usa el editor de planificación, que
 * dibuja 53 paradas donde acá hay ocho.
 */
const PIN_ANCHO = 22
/** Cuánto crece la parada en foco. Tiene que saltar por encima del resto sin depender del color. */
const PIN_CRECE_FOCO = 6

/**
 * Escala del marcador según el zoom, recortada en los dos extremos.
 *
 * Misma curva que el editor. No es cosmética: al alejarse, dos paradas de la misma manzana caen a
 * pocos píxeles una de otra, y lo único que evita que se pisen es que el marcador se achique con la
 * distancia. Fuera de [12, 17] el ajuste deja de ayudar — más lejos serían puntos indistinguibles y
 * más cerca, gotas de media cuadra.
 */
function escalaPorZoom(zoom: number): number {
  const z = Math.min(17, Math.max(12, zoom))
  return 0.82 + ((z - 12) / 5) * 0.36
}

/**
 * Alto en px de la caja del pin de una parada. Lo necesita el TOOLTIP: su offset se mide desde el ancla
 * del marcador, que es la punta de la gota, así que para quedar arriba de la cabeza hay que subir todo
 * el alto. Y como el pin ahora escala con el zoom, un offset fijo lo dejaba pegado al pin de cerca y
 * flotando lejos de él al alejarse.
 */
function altoPinEntrega(resaltado: boolean, escala: number): number {
  const anchoGota = Math.round((resaltado ? PIN_ANCHO + PIN_CRECE_FOCO : PIN_ANCHO) * escala)
  return Math.round(Math.round(anchoGota * CAJA_SOBRE_GOTA) * PIN_RATIO)
}

/**
 * Pin de una parada: una GOTA del color de su estado con el ORDEN DE VISITA adentro.
 *
 * El NÚMERO manda siempre. Es el dato que responde "¿en qué orden las visita?" y sin él el mapa es una
 * nube de puntos de colores. Antes el símbolo (✓ / ✕ / ↩) lo reemplazaba apenas la parada cerraba, así
 * que en un viaje casi terminado —el caso que MÁS se mira— quedaba una fila de tildes y el orden se
 * perdía entero.
 *
 * LO QUE SE PERDIÓ AL ACHICAR, dicho explícito porque era una decisión deliberada y no un descuido: el
 * pin grande llevaba además una insignia de 15 px con el símbolo del cierre, como segundo canal
 * independiente del color (entre 5% y 8% de los hombres tiene algún daltonismo). A 22 px ese símbolo
 * mide 5 px y no se distingue un ✓ de un ✕, o sea que el canal redundante dejaría de ser un canal y
 * pasaría a ser ruido. El estado en TEXTO sigue estando en las dos partes donde se lee de verdad: el
 * tooltip del pin y la lista de paradas.
 *
 * El número va en el tono OSCURO del color y no en el color plano: sobre el hueco blanco, un ámbar o un
 * gris claro a 9 px es ilegible. Es el mismo matiz, con el contraste que un texto de ese cuerpo necesita.
 */
function pinEntrega(entrega: EntregaMonitoreo, resaltado: boolean, escala: number) {
  const meta = ESTADO_ENTREGA[entrega.estado]
  const anchoGota = Math.round((resaltado ? PIN_ANCHO + PIN_CRECE_FOCO : PIN_ANCHO) * escala)
  const w = Math.round(anchoGota * CAJA_SOBRE_GOTA)
  const h = Math.round(w * PIN_RATIO)
  // Id único del degradado: los marcadores se inyectan como HTML suelto en el DOM del mapa, y un id
  // repetido haría que todos resolvieran contra la primera definición — que desaparece en cuanto ese
  // marcador se desmonta, dejando al resto sin relleno.
  const gid = `gm-${entrega.id.replace(/[^a-zA-Z0-9_-]/g, '')}`

  return reactIcon(
    <div
      style={{
        width: w,
        height: h,
        // LA SOMBRA ES EL BORDE de este marcador. `drop-shadow` y no `box-shadow` porque sigue la
        // SILUETA de la gota; un box-shadow dibujaría la sombra de un rectángulo alrededor de algo que
        // no lo es. Corta y pegada: a 22 px una sombra de elevación se lee como un segundo marcador
        // borroso al lado del primero.
        filter: resaltado
          ? 'drop-shadow(0 2px 3px rgba(0,0,0,0.5))'
          : 'drop-shadow(0 1px 2px rgba(0,0,0,0.45))',
      }}
    >
      <svg width={w} height={h} viewBox={VIEWBOX_PIN} xmlns="http://www.w3.org/2000/svg">
        <defs>
          {/* Brillo arriba y sombra abajo, en blanco y negro translúcidos: le da volumen sin tener que
              calcular una versión más clara y otra más oscura de cada color de estado. */}
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
            <stop offset="52%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
          </linearGradient>
        </defs>

        {/* Sin borde: lo que separa el pin del fondo es el `drop-shadow`, que funciona igual sobre
            calles claras que sobre satélite. El único trazo es el AZUL de la parada en foco, y ese no
            es decoración: es el estado de la selección y tiene que ganarle al resto del mapa. */}
        <path
          d={GOTA}
          fill={meta.color}
          stroke={resaltado ? SELECCION : 'none'}
          strokeWidth={resaltado ? 2.5 : 0}
          strokeLinejoin="round"
        />
        <path d={GOTA} fill={`url(#${gid})`} />

        <circle cx="13" cy="13" r="6.6" fill="#ffffff" />
        <text
          x="13"
          y="13"
          fill={oscurecer(meta.color, 0.55)}
          fontSize="9"
          fontWeight="700"
          fontFamily="system-ui, sans-serif"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {entrega.secuencia}
        </text>
      </svg>
    </div>,
    [w, h],
    [w / 2, Math.round(h * PIN_ANCLA_Y)],
  )
}

/**
 * Ancho de la chapa del depósito. Bajó de 34 a 28 junto con el achique de las paradas: el tamaño es
 * JERARQUÍA, y una chapa de 34 al lado de gotas de 22 leía el almacén como lo más importante del mapa.
 * Sigue siendo más grande que una parada —es el origen del viaje— pero por debajo del camión, que es lo
 * único que se mueve y lo que la pantalla vino a mirar.
 */
const DEPOSITO_ANCHO = 28

const pinDeposito = reactIcon(
  <Chapa ancho={DEPOSITO_ANCHO}>
    <div
      style={{
        width: 20,
        height: 20,
        borderRadius: 999,
        background: '#0f172a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
      }}
    >
      <Warehouse size={12} strokeWidth={2.25} />
    </div>
  </Chapa>,
  [DEPOSITO_ANCHO, DEPOSITO_ANCHO + puntaDe(DEPOSITO_ANCHO) / 2],
  [DEPOSITO_ANCHO / 2, DEPOSITO_ANCHO + puntaDe(DEPOSITO_ANCHO) / 2],
)

/**
 * Cada cuánto sale una onda del camión. Es el LATIDO del reporte, no un adorno: la onda dice "este
 * equipo acaba de reportar".
 *
 * Hoy 5 s para que la demo se lea; en producción la cadencia real del ping es 10-15 s en movimiento y
 * puede subir a 30 s o 1 min. Cuando el ping sea real, este número sale del intervalo del dispositivo
 * y no de acá — por eso es UNA constante y no un valor repartido por el archivo.
 */
const PULSO_MS = 5000

/**
 * El camión. Círculo pleno, no chapa: no es un LUGAR, es un objeto en movimiento — la misma
 * distinción que hace Google entre un pin y el punto azul.
 *
 * Antes llevaba `animate-pulse` sobre TODO el marcador más un `box-shadow` de 5px de color y otro
 * negro encima. Eran tres efectos peleando: el pulse desvanecía el ícono entero (parecía que el
 * camión titilaba, no que la señal estuviera viva) y los dos halos se mezclaban en una mancha.
 *
 * Ahora el ícono queda quieto y lo que se mueve son DOS ONDAS que salen de él (`.truck-pulse`, en
 * `index.css`). La diferencia no es estética: el pulse viejo atenuaba el camión —lo hacía menos
 * visible justo cuando reportaba— y estas ondas se expanden hacia afuera dejando el pin intacto.
 *
 * **Sin señal no hay ondas.** Un camión que dejó de reportar se pinta gris y quieto. Es la misma
 * información que el tooltip da en texto ("Sin señal hace 37 min"), pero visible de un vistazo y a
 * cualquier zoom: en una pantalla de vigilancia, lo que hay que poder barrer con la vista es
 * justamente cuál dejó de latir.
 */
function pinCamion(color: string, senalVieja: boolean) {
  const tono = senalVieja ? '#64748b' : color

  return reactIcon(
    <div style={{ position: 'relative', width: 36, height: 36 }}>
      {/* Las ondas van DEBAJO del cuerpo en el DOM para que el ícono nunca quede tapado por ellas. */}
      {!senalVieja && (
        <>
          <span className="truck-pulse" style={{ '--pulso-color': tono, '--pulso-ms': `${PULSO_MS}ms` } as React.CSSProperties} />
          <span className="truck-pulse truck-pulse-2" style={{ '--pulso-color': tono, '--pulso-ms': `${PULSO_MS}ms` } as React.CSSProperties} />
        </>
      )}
      <div
        style={{
          position: 'relative',
          width: 36,
          height: 36,
          borderRadius: 999,
          background: tono,
          border: '3px solid #fff',
          boxShadow: `0 0 0 1px ${tono}55, 0 2px 6px rgb(0 0 0 / 0.35)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
        }}
      >
        <Truck size={18} strokeWidth={2.5} />
      </div>
    </div>,
    36,
  )
}

/**
 * Encuadre automático del mapa. Dos momentos, dos criterios.
 *
 * 1. AL ABRIR UN VIAJE → centra en el CAMIÓN, no en el recorrido completo. Encuadrar toda la ruta
 *    daba una vista a altura fija donde el camión era un punto de 36px entre quince pines: la primera
 *    pregunta al entrar es "¿dónde está?", y respondía "en algún lugar de la ciudad". Si el viaje
 *    todavía no salió (o ya volvió) no hay camión, y ahí sí se encuadra el recorrido.
 *
 * 2. AL ELEGIR UNA PARADA → centra en esa parada. El click puede venir de la LISTA, donde la parada
 *    bien puede estar fuera de cuadro; sin esto, seleccionás algo en el panel y el mapa no acusa recibo.
 *
 * Las dependencias son deliberadamente angostas. Ninguno de los dos efectos depende de `posicion`: si
 * lo hicieran, el mapa se reencuadraría en CADA tick de la simulación y el usuario no podría ni
 * arrastrarlo — cada vez que el camión avanza un metro le arrancarían la vista de las manos.
 */
function AjustarVista({
  tripId,
  recorrido,
  posicionInicial,
  focoLat,
  focoLng,
  tourActivo,
  tourEnCurso,
  tramo,
  margenIzq,
  margenDer,
  marcarProgramatico,
}: {
  tripId: number
  recorrido: LatLngTuple[]
  posicionInicial: LatLngTuple | null
  focoLat: number | null
  focoLng: number | null
  /**
   * Encadenar el segundo acto: el foco lo movió la SIMULACIÓN (no un click) y el seguimiento automático
   * está encendido.
   *
   * Las dos condiciones van juntas en un solo booleano porque las dos significan lo mismo para la cámara:
   * "el usuario no está manejando la vista ahora mismo". Si eligió la parada a mano, o si apagó el
   * seguimiento, cualquier movimiento que no pidió es una molestia.
   */
  tourActivo: boolean
  /**
   * Bandera compartida con `SeguirCamion`: "hay un tour en curso, no reencuadres". La escribe este
   * componente y la lee él, igual que `programatico`.
   *
   * Es una bandera aparte y no `programatico` con más duración, porque las dos cosas que `programatico`
   * hace tienen plazos distintos: silenciar el detector de gestos tiene que durar lo que dura el vuelo
   * (si dura todo el tour, el usuario arrastra el mapa y el seguimiento no se enteraría), y frenar el
   * reencuadre tiene que durar la secuencia completa.
   */
  tourEnCurso: React.RefObject<boolean>
  /**
   * El tramo en curso —camión → próxima parada, por calles— POR REF.
   *
   * Por ref y no como prop normal porque cambia en cada ping: como dependencia del efecto, el tour se
   * re-armaría una vez por segundo y nunca llegaría a su segundo acto. Lo que interesa es su valor en
   * el momento de volar, no cada versión intermedia.
   */
  tramo: React.RefObject<LatLngTuple[] | null>
  margenIzq: number
  margenDer: number
  /** Avisa que el movimiento que viene lo hace el código, no el usuario. Ver `SeguirCamion`. */
  marcarProgramatico: () => void
}) {
  const map = useMap()

  // Los márgenes cambian al abrir o cerrar un panel, y no queremos reencuadrar por eso. Se leen del
  // ref en el momento de encuadrar, así siempre son los vigentes sin entrar como dependencia.
  const margenes = useRef({ margenIzq, margenDer })
  margenes.current = { margenIzq, margenDer }

  useEffect(() => {
    marcarProgramatico()
    if (posicionInicial) encuadrar(map, [posicionInicial], { ...margenes.current, zoomMax: ZOOM_CAMION })
    else encuadrar(map, recorrido, margenes.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId])

  /**
   * ACTO 1 — la parada. Vale para los dos orígenes del foco: el click puede venir de la LISTA, donde la
   * parada bien puede estar fuera de cuadro, y sin esto seleccionás algo en el panel y el mapa no acusa
   * recibo.
   */
  useEffect(() => {
    if (focoLat === null || focoLng === null) return
    marcarProgramatico()
    encuadrar(map, [[focoLat, focoLng]], { ...margenes.current, zoomMax: ZOOM_PARADA })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focoLat, focoLng])

  /**
   * ACTO 2 — la traza, unos segundos después y solo cuando el foco fue AUTOMÁTICO.
   *
   * Arregla un agujero real: cuando la simulación cerraba una parada, la cámara volaba a la siguiente y
   * se quedaba ahí, a zoom de manzana. Si el camión venía de la otra punta de la ciudad quedaba fuera del
   * cuadro, y la pantalla mostraba un punto de entrega quieto en vez de un camión andando — justo lo
   * contrario de lo que se vino a ver.
   *
   * ENCUADRA EL TRAMO, NO EL CAMIÓN SOLO. Centrarlo también lo trae de vuelta, pero al zoom de la parada,
   * y entonces se ve el camión sin nada alrededor: nunca la relación entre los dos, que es la pregunta
   * real ("¿cuánto le falta para llegar?"). El tramo mete al camión, la parada y el camino por calles
   * entre ambos en un solo cuadro, y de paso el zoom sale solo — cuanto más lejos está, más alejado se ve.
   *
   * ES UN EFECTO APARTE Y NO UNA RAMA DEL ACTO 1, y esa separación es la parte fina. `tourActivo` se apaga
   * en cuanto el usuario arrastra el mapa (arrastrar apaga el seguimiento), y con los dos actos en el
   * mismo efecto ese cambio lo re-ejecutaba ENTERO: el usuario se iba a mirar otra zona y el mapa lo
   * devolvía a la parada de un vuelo. Separados, apagar el tour solo cancela lo que falta.
   *
   * El `clearTimeout` es lo que hace al tour interrumpible: si mientras la cámara está sobre la parada
   * cambia el foco —otra selección, o la simulación cerrando la siguiente— el segundo acto de la anterior
   * nunca se ejecuta, y no quedan dos vuelos peleándose.
   */
  useEffect(() => {
    if (!tourActivo || focoLat === null || focoLng === null) return
    tourEnCurso.current = true
    const id = setTimeout(() => {
      tourEnCurso.current = false
      const traza = tramo.current
      // Sin tramo no hay nada que mostrar: el camión no salió, o ya volvió al depósito. Quedarse en la
      // parada es la respuesta correcta, no encuadrar un punto suelto.
      if (!traza || traza.length < 2) return
      marcarProgramatico()
      encuadrar(map, traza, { ...margenes.current, zoomMax: ZOOM_CAMION })
    }, MS_MIRANDO_LA_PARADA)
    return () => {
      clearTimeout(id)
      // Se suelta también al cancelar. Si el tour se interrumpe —otro foco, el usuario arrastrando— la
      // bandera no puede quedar trabada en `true`: dejaría al seguimiento sordo para el resto de la
      // sesión, que es la misma clase de bug que `programatico` evita soltándose por tiempo.
      tourEnCurso.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focoLat, focoLng, tourActivo])

  return null
}

/**
 * Respiro contra el borde de la zona visible antes de considerar que el camión "se fue de cuadro".
 *
 * TIENE QUE SER MENOR QUE EL PADDING DE `encuadrar` (32 px verticales), y era 48. La diferencia importa
 * desde que el tour encuadra el tramo completo: el camión queda en un EXTREMO de ese encuadre, o sea a
 * unos 32 px del borde, y con un respiro de 48 `SeguirCamion` lo declaraba fuera de cuadro y volvía a
 * centrarlo — deshaciendo el encuadre que acababa de hacerse, medio segundo después. Dos mecanismos
 * peleando por la cámara. Con el respiro por debajo del padding, todo lo que `encuadrar` mete en el
 * cuadro cuenta como visible, que es la única relación coherente entre los dos.
 */
const MARGEN_SEGURO = 24

/**
 * SEGUIR AL CAMIÓN — el encuadre que corre solo mientras el usuario no toca el mapa.
 *
 * El problema real que resuelve: el encuadre automático de `AjustarVista` ocurre UNA vez al abrir el
 * viaje, y a los pocos minutos el camión se fue de cuadro —o peor, quedó detrás de un panel, que es
 * peor que estar afuera porque el mapa parece estar bien y el camión no está—. Hasta ahora había que
 * apretar "Centrar en el camión" cada tanto, en la pantalla que existe justamente para NO tener que
 * hacer nada.
 *
 * Tres reglas, y las tres importan:
 *
 * 1. **Solo si el usuario no tomó el control.** Cualquier arrastre o zoom manual apaga el seguimiento
 *    al instante: si alguien se fue a mirar otra zona, moverle la vista es lo más molesto que puede
 *    hacer una pantalla. Se vuelve a encender con el botón de la barra.
 * 2. **Solo si el camión NO está visible.** No se reencuadra en cada ping: mientras el camión esté
 *    dentro de la zona útil, el mapa no se mueve. Reencuadrar cada 5 s sería un temblor constante.
 * 3. **La zona útil descuenta los paneles.** Es lo que hace que "detrás del panel de paradas" cuente
 *    como fuera de cuadro. Sin esto, el camión puede estar dentro del `<div>` del mapa y aun así ser
 *    invisible.
 *
 * La bandera `programatico` es la parte fina, y es COMPARTIDA con `AjustarVista`: nuestros propios
 * vuelos disparan `zoomstart` igual que un zoom del usuario. Sin ella pasan dos cosas, las dos malas:
 * el encuadre inicial apagaría el seguimiento antes de que la pantalla termine de abrir, y cada
 * reencuadre automático se apagaría a sí mismo.
 */
function SeguirCamion({
  posicion,
  activo,
  margenIzq,
  margenDer,
  programatico,
  tourEnCurso,
  marcarProgramatico,
  onUsuarioTomaControl,
  onFueraDeCuadro,
}: {
  posicion: LatLngTuple | null
  activo: boolean
  margenIzq: number
  margenDer: number
  programatico: React.RefObject<boolean>
  /** Hay un tour de cámara en curso y no se le puede robar el volante. Ver `AjustarVista`. */
  tourEnCurso: React.RefObject<boolean>
  marcarProgramatico: () => void
  onUsuarioTomaControl: () => void
  /**
   * Avisa si el camión está fuera de la zona visible. Se reporta SIEMPRE, también con el seguimiento
   * apagado — es justamente ahí donde el dato hace falta: con el seguimiento encendido el camión vuelve
   * solo, y con el seguimiento apagado la pantalla tiene que poder decir "se te fue".
   */
  onFueraDeCuadro: (fuera: boolean) => void
}) {
  const map = useMap()

  useEffect(() => {
    const marcar = () => {
      if (!programatico.current) onUsuarioTomaControl()
    }
    map.on('dragstart', marcar)
    map.on('zoomstart', marcar)
    return () => {
      map.off('dragstart', marcar)
      map.off('zoomstart', marcar)
    }
  }, [map, programatico, onUsuarioTomaControl])

  // El aviso hacia arriba se manda solo cuando el valor CAMBIA: `moveend` y cada ping lo evaluarían
  // varias veces por segundo, y un setState por evaluación re-renderizaría el mapa entero al ritmo del GPS.
  const fueraPrevio = useRef<boolean | null>(null)
  const reportar = useRef(onFueraDeCuadro)
  reportar.current = onFueraDeCuadro

  useEffect(() => {
    /** ¿Está el camión dentro de la zona que NO tapan los paneles? */
    const evaluar = () => {
      if (!posicion) return
      // Se pregunta en píxeles de pantalla y no en coordenadas, porque "detrás de un panel" es una
      // condición de layout, no de geografía.
      const punto = map.latLngToContainerPoint(posicion)
      const { x: ancho, y: alto } = map.getSize()
      const visible =
        punto.x > margenIzq + MARGEN_SEGURO &&
        punto.x < ancho - margenDer - MARGEN_SEGURO &&
        punto.y > MARGEN_SEGURO &&
        punto.y < alto - MARGEN_SEGURO

      if (fueraPrevio.current !== !visible) {
        fueraPrevio.current = !visible
        reportar.current(!visible)
      }

      if (visible || !activo) return
      // Mientras un vuelo nuestro está en curso no se reencuadra: a mitad de camino el camión todavía
      // puede estar fuera de cuadro, y volver a llamar cortaría la animación en cada ping.
      if (programatico.current) return
      // Y tampoco durante el TOUR (ver `AjustarVista`): entre el acto 1 y el acto 2 el camión está fuera
      // de cuadro a propósito —la cámara está sobre la próxima parada— y sin esta guarda el seguimiento
      // lo traía al centro justo en ese hueco, metiendo un tercer movimiento en medio de una secuencia de
      // dos. Se veía como un temblor: parada, camión de golpe, traza. El tour ya termina mostrando el
      // camión, así que acá no hay nada que rescatar.
      if (tourEnCurso.current) return

      // Mismo helper que usan el botón y el encuadre inicial: una sola regla de centrado en todo el
      // mapa. `zoomMax` es el zoom ACTUAL a propósito — seguir al camión no debe cambiar la escala que
      // el usuario venía mirando, solo traerlo de vuelta al cuadro.
      marcarProgramatico()
      encuadrar(map, [posicion], { margenIzq, margenDer, zoomMax: map.getZoom() })
    }

    evaluar()
    // También al terminar de mover o hacer zoom: si el usuario arrastra el mapa hasta perder al camión,
    // el ping no cambió y sin estos eventos nadie se enteraría de que se fue de cuadro.
    map.on('moveend', evaluar)
    map.on('zoomend', evaluar)
    return () => {
      map.off('moveend', evaluar)
      map.off('zoomend', evaluar)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posicion, activo, margenIzq, margenDer])

  return null
}

/**
 * Pastilla del MODO DE LA CÁMARA: dice por qué el mapa no está siguiendo al camión y lo devuelve con un
 * click.
 *
 * Es la pieza que convierte dos estados invisibles en uno visible. El seguimiento se apaga en dos casos
 * legítimos —el usuario arrastró el mapa, o eligió una parada para mirarla— y hasta ahora eso dejaba la
 * pantalla MUDA: el camión seguía andando fuera del cuadro y el mapa se veía perfectamente normal. Había
 * que acordarse de que existe un botón en la barra, y en el caso de la parada, ni eso: nada indicaba que
 * el sistema había pausado nada.
 *
 * DOS MENSAJES Y NO UNO, porque no son la misma situación:
 *   · Mirando una parada → la pausa la hizo el SISTEMA. Nombra la parada, así queda claro qué la causó y
 *     que se deshace sola al cerrarla.
 *   · Fuera de cuadro    → la pausa la hizo el USUARIO y encima perdió al camión de vista. Acá el dato
 *     nuevo es la POSICIÓN, no el modo.
 *
 * POR QUÉ UNA PASTILLA Y NO UN DIÁLOGO. Un modal tapa el mapa y hay que descartarlo para volver a
 * mirarlo, en una pantalla cuyo trabajo es que se pueda mirar sin interrupciones — y encima aparecería
 * cada vez que alguien elige una parada, que es la acción más frecuente de la pantalla. Un diálogo que
 * hay que cerrar seguido deja de leerse y se cierra por reflejo.
 *
 * POR QUÉ TAMPOCO UN REENCUADRE AUTOMÁTICO: si el mapa volviera al camión solo, nadie podría mirar otra
 * cosa — cada ping le arrancaría la vista de las manos, que es el problema que `seguir` resuelve.
 *
 * Va DENTRO del MapContainer (como `HerramientasMapa`) para vivir en el sistema de coordenadas del mapa;
 * arriba al centro porque es la única franja que no le pertenece a nadie: los paneles flotantes ocupan
 * los bordes laterales, la barra de herramientas la esquina superior izquierda y los toasts la franja de
 * abajo.
 */
function AvisoCamara({
  /** Hay una parada elegida a mano: el seguimiento está en pausa por eso y no porque el usuario lo apagó. */
  paradaMirando,
  onSeguir,
}: {
  paradaMirando: number | null
  onSeguir: () => void
}) {
  const porParada = paradaMirando !== null

  return (
    <button
      type="button"
      onClick={onSeguir}
      className={cn(
        'absolute left-1/2 top-3 z-[1000] flex -translate-x-1/2 items-center gap-2 rounded-full',
        'border border-border bg-card/95 py-1.5 pl-3 pr-3.5 text-xs font-medium shadow-lg backdrop-blur-sm',
        'transition-colors hover:bg-accent',
      )}
    >
      {porParada ? (
        <MapPin size={14} className="text-muted-foreground" />
      ) : (
        <Truck size={14} className="text-muted-foreground" />
      )}
      {porParada ? `Mirando la parada ${paradaMirando}` : 'El camión salió de cuadro'}
      <span className="font-semibold text-primary">
        {porParada ? 'Seguir al camión' : 'Seguirlo'}
      </span>
    </button>
  )
}

/**
 * Informa el zoom al componente padre. Tiene que ser HIJO del mapa: `useMapEvents` necesita el contexto
 * de Leaflet, y el que lo tiene es el que está adentro del `MapContainer`.
 *
 * `zoomend` y no `zoom`: durante la animación de zoom el evento se dispara en cada cuadro, y recalcular
 * los ocho iconos por cuadro hace que Leaflet los recree —cada uno es un `divIcon` nuevo— justo mientras
 * el mapa se está moviendo. Al final del gesto es una sola vez y no se nota.
 */
function ZoomWatch({ onZoom }: { onZoom: (zoom: number) => void }) {
  const map = useMapEvents({ zoomend: () => onZoom(map.getZoom()) })
  return null
}

/**
 * Una línea del recorrido, con su HALO blanco debajo.
 *
 * POR QUÉ EL HALO. Es la misma pieza que ya usa el editor de planificación, y acá hacía más falta
 * todavía: desde que el trazo va por calles, la línea corre ENCIMA de la calle que dibuja la tesela, y
 * sobre satélite o sobre un fondo gris con muchas calles el trazo se pierde contra el fondo. El halo lo
 * separa de lo que tenga abajo sin cambiarle el color, que es dato.
 *
 * `atenuado` es la vista de tramo: baja la opacidad al 20 % de la suya en vez de ocultar la línea. El
 * contexto —de dónde viene, cuánto le falta— sigue haciendo falta, y borrarlo dejaría una línea suelta en
 * el vacío, imposible de ubicar.
 *
 * El halo copia la opacidad EN PROPORCIÓN: el trazo de lo ya recorrido está apagado a propósito, así que
 * un halo a opacidad plena lo traería al frente y arruinaría la jerarquía que la atenuación establece.
 */
function Trazo({
  positions,
  estilo,
  atenuado,
}: {
  positions: LatLngTuple[]
  estilo: { color: string; weight: number; opacity: number }
  atenuado?: boolean
}) {
  if (positions.length < 2) return null
  const opacity = atenuado ? estilo.opacity * 0.2 : estilo.opacity

  return (
    <>
      <Polyline
        positions={positions}
        pathOptions={{
          color: '#ffffff',
          weight: estilo.weight + 3,
          opacity: opacity * 0.8,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
      <Polyline
        positions={positions}
        pathOptions={{
          color: estilo.color,
          weight: estilo.weight,
          opacity,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
    </>
  )
}

/**
 * Leyenda de los trazos, abajo del mapa.
 *
 * POR QUÉ HACE FALTA. Las tres líneas codifican tiempo con tono y grosor, y eso se lee muy bien una vez
 * que sabés la regla — pero no se adivina. Sin leyenda, un gris más oscuro que otro gris es una diferencia
 * que se VE y no se entiende, y la pantalla queda dependiendo de que alguien te la explique. Es el mismo
 * argumento por el que la leyenda de estados de parada ya existía en el panel.
 *
 * Muestra SOLO los trazos que están dibujados: si apagaste "Por recorrer" desde el menú de capas, su
 * renglón se va. Una leyenda que nombra algo que no está en el mapa manda a buscar una línea que no
 * existe.
 *
 * Abajo y no arriba porque arriba es de la pastilla de la cámara; a la izquierda y no al centro porque el
 * centro de abajo es de los toasts de eventos. Y se corre con el panel de paradas: `margenIzq` es el mismo
 * que usa `fitBounds`, así que la leyenda nunca queda debajo de una tarjeta.
 */
function LeyendaTrazos({
  visibles,
  margenIzq,
}: {
  visibles: ClaveTrazo[]
  margenIzq: number
}) {
  if (visibles.length === 0) return null

  return (
    <div
      className={cn(
        'absolute bottom-3 z-[1000] flex items-center gap-3 rounded-lg border border-border',
        'bg-card/95 px-2.5 py-1.5 shadow-lg backdrop-blur-sm',
        'transition-[left] duration-300 ease-out',
      )}
      style={{ left: margenIzq }}
    >
      {visibles.map((clave) => (
        <span key={clave} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {/* La muestra es un TRAZO de verdad —mismo color y mismo grosor— y no un cuadradito de color:
              acá el grosor es parte de lo que hay que reconocer, no un detalle de estilo. */}
          <span
            className="block w-5 rounded-full"
            style={{
              height: TRAZO[clave].weight,
              background: TRAZO[clave].color,
              opacity: TRAZO[clave].opacity,
            }}
            aria-hidden
          />
          {TRAZO_LABEL[clave]}
        </span>
      ))}
    </div>
  )
}

export function SeguimientoMapa({
  viaje,
  entregas,
  tracking,
  /** Paradas ya cerradas — viene de la simulación en vivo, no de `viaje.cursor`. */
  cursor,
  paradaFoco,
  /** El foco lo movió la simulación, no un click. Habilita el segundo acto del tour de la cámara. */
  focoAuto = false,
  onSeleccionar,
  /**
   * Recorrido POR CALLES partido en tramos, indexado igual que `viaje.recorrido`: `tramosCalles[i]` va
   * del punto `i` al `i + 1`. `null` = todavía no hay ruteo, y entonces se dibuja el trazo recto.
   *
   * Llega como prop y NO se rutea acá adentro porque la simulación necesita la MISMA geometría para
   * mover el camión: si cada uno la pidiera por su cuenta, el pin andaría al lado de su propia línea
   * durante el rato en que una respuesta llegó y la otra no.
   */
  tramosCalles = null,
  /** Hay ruteo en vuelo. Solo alimenta el spinner del menú de capas; nunca decide qué se dibuja. */
  ruteando = false,
  /** Ancho (px) que los paneles flotantes le tapan al mapa de cada lado, para encuadrar sin ocultar. */
  margenIzq = 32,
  margenDer = 32,
  /** Dónde apoyar la barra de herramientas. Lo calcula la vista, que conoce sus paneles. */
  anclaHerramientas,
}: {
  viaje: ViajeMonitoreo
  entregas: EntregaMonitoreo[]
  /**
   * Último ítem ACTUAL del viaje — el ping CRUDO, no la posición ya resuelta. El mapa necesita las
   * tres cosas que el ítem trae juntas (dónde, hace cuánto y con qué batería), y pasarlas como tres
   * props sueltas era la forma de que se desincronizaran: el pin en un lugar y el tooltip contando la
   * señal de otro ping.
   */
  tracking: ItemActual | null
  cursor: number
  paradaFoco: string | null
  focoAuto?: boolean
  onSeleccionar: (paradaId: string) => void
  tramosCalles?: LatLngTuple[][] | null
  ruteando?: boolean
  margenIzq?: number
  margenDer?: number
  anclaHerramientas: { top: number; left: number }
}) {
  // Todo lo que la pantalla muestra del camión se DERIVA del ítem, así el pin, el tooltip y el corte de
  // la polilínea hablan del MISMO ping. La tupla va memoizada contra el ítem —que solo cambia de
  // identidad cuando llega un ping nuevo— porque abajo entra como dependencia de otro `useMemo`: un
  // array nuevo en cada render lo invalidaría siempre.
  const posicion = useMemo(() => (tracking ? posicionDe(tracking) : null), [tracking])
  const ahora = Date.now()
  const minutos = tracking ? minutosSinSenal(tracking.trackedAt, ahora) : null
  const senalVieja = tracking ? esSenalVieja(tracking.trackedAt, ahora) : false
  /**
   * Las tres líneas del mapa, cortadas del mismo recorrido:
   *   · `recorrido` → lo ya hecho, sólido y atenuado;
   *   · `pendiente` → lo que falta, punteado a color pleno;
   *   · `tramo`     → el trecho que está haciendo AHORA, de su posición a la próxima parada.
   * Es la lectura de progreso más barata del mapa — no hay que leer un solo número.
   *
   * SE CORTAN EN DOS LUGARES DISTINTOS y por eso el cálculo está junto. El corte por PARADA sale gratis
   * cuando hay ruteo: los tramos ya vienen separados por parada, así que "lo hecho" son los primeros
   * `cursor` tramos y no hay que buscar nada. El corte en la POSICIÓN DEL CAMIÓN es el que necesita
   * geometría (`cortarEn`), porque el camión está a mitad de una calle, en un lugar que no es un vértice
   * ni una parada.
   *
   * Sin ruteo cae al recorrido de hitos, que es el comportamiento que había: rectas de parada a parada.
   */
  const { recorrido, pendiente, tramo } = useMemo<{
    recorrido: LatLngTuple[]
    pendiente: LatLngTuple[]
    tramo: LatLngTuple[] | null
  }>(() => {
    if (tramosCalles) {
      // `cursor` paradas cerradas = los `cursor` primeros tramos terminados. El tramo `cursor` es el
      // que el camión está haciendo, y los de más atrás incluyen la vuelta al depósito.
      const cerrados = tramosCalles.slice(0, Math.min(cursor, tramosCalles.length))
      const restantes = tramosCalles.slice(Math.min(cursor, tramosCalles.length))

      if (!posicion || restantes.length === 0) {
        return { recorrido: unirTramos(cerrados), pendiente: unirTramos(restantes), tramo: null }
      }

      const [andado, porAndar] = cortarEn(restantes[0], posicion)
      return {
        recorrido: unirTramos([...cerrados, andado]),
        pendiente: unirTramos([porAndar, ...restantes.slice(1)]),
        // El tramo en curso ES el resto del tramo actual: mismo asfalto, mismo corte. Antes era una
        // recta de la posición del camión a la parada, que en una avenida con retorno mentía el doble
        // — la distancia y el lado de la calle por el que va a llegar.
        tramo: porAndar.length > 1 ? porAndar : null,
      }
    }

    const corte = Math.min(cursor + 1, viaje.recorrido.length)
    const hecho = viaje.recorrido.slice(0, corte)
    const falta = viaje.recorrido.slice(Math.max(corte - 1, 0))
    // Con el camión en ruta, el quiebre real está en su posición actual, no en la última parada.
    if (posicion) {
      return {
        recorrido: [...hecho, posicion],
        pendiente: [posicion, ...falta.slice(1)],
        tramo: falta.length > 1 ? [posicion, falta[1]] : null,
      }
    }
    return { recorrido: hecho, pendiente: falta, tramo: null }
  }, [viaje.recorrido, tramosCalles, cursor, posicion])

  /**
   * Recorrido completo para la CÁMARA (encuadrar, ver todo). Con ruteo es la tira por calles, que abarca
   * un poco más que la línea de hitos —el camino real se va para los costados— y encuadrar con los hitos
   * dejaba pedazos de ruta cortados contra el borde.
   */
  const paraEncuadrar = useMemo<LatLngTuple[]>(
    () => (tramosCalles ? unirTramos(tramosCalles) : viaje.recorrido),
    [tramosCalles, viaje.recorrido],
  )

  const [capa, setCapa] = useState<CapaBase>(CAPA_POR_DEFECTO)

  /**
   * Zoom actual, solo para la ESCALA de los marcadores. Vive en estado y no en un ref porque los iconos
   * se recalculan en el render: al alejarse, dos paradas de la misma manzana caen a pocos píxeles y lo
   * único que evita que se pisen es que la gota se achique. Ver `escalaPorZoom`.
   */
  const [zoom, setZoom] = useState(INITIAL_ZOOM)
  const escalaPin = escalaPorZoom(zoom)

  /**
   * Seguimiento automático. Arranca ENCENDIDO: quien abre esta pantalla quiere mirar el camión, no
   * administrar la cámara. Se apaga solo en cuanto el usuario arrastra o hace zoom (ver
   * `SeguirCamion`) y se vuelve a encender con su botón o con "Centrar en el camión".
   */
  const [seguir, setSeguir] = useState(true)
  /** Espejo de `seguir` para los efectos que lo consultan sin querer depender de él. */
  const seguirRef = useRef(seguir)
  seguirRef.current = seguir

  /**
   * POR QUÉ se apagó el seguimiento. La distinción es la que permite retomarlo sin adivinar:
   *  · `'usuario'` → arrastró, hizo zoom o apretó el botón. Es una DECISIÓN suya y no se toca: se fue a
   *                  mirar otra zona, y encendérselo de vuelta sería pelearle la vista.
   *  · `'foco'`    → lo pausó el SISTEMA porque el usuario eligió una parada de la lista. Es TEMPORAL:
   *                  al cerrar la parada, volver a seguir al camión es exactamente lo que quería.
   *
   * Sin la distinción hay que elegir entre dos comportamientos y los dos están mal: "retomar siempre"
   * también revive el seguimiento del que se fue a mirar otra cosa, y "no retomar nunca" deja el
   * seguimiento apagado para el resto de la sesión por haber mirado una parada.
   */
  const motivoPausa = useRef<'usuario' | 'foco' | null>(null)

  /**
   * Vista de TRAMO SIGUIENTE: en vez del recorrido completo, solo el trecho que el camión está
   * haciendo ahora — de donde está a su próxima parada.
   *
   * Por qué es una vista aparte y no el modo por defecto: el recorrido completo responde "¿cuánto le
   * falta?" y el tramo responde "¿qué está haciendo AHORA?". Son dos preguntas distintas y ninguna
   * gana siempre; con quince paradas dibujadas, la segunda se pierde entre las líneas de las otras
   * trece.
   */
  const [soloTramo, setSoloTramo] = useState(false)

  /**
   * Capa de mercados. Arranca APAGADA: en monitoreo el mapa ya carga recorrido, paradas por estado y el
   * camión en movimiento, y once polígonos de fondo por defecto tapan justo lo que se vino a mirar.
   *
   * El `cityId` sale del filtro de Ciudad del plan si el usuario dejó uno puesto; si no, de la capital,
   * que es donde corren los viajes del dataset. Acá no hay paradas de planificación de dónde derivarlo
   * (esta pantalla trabaja con entregas), y por eso el fallback es explícito y no adivinado.
   */
  const [verMercados, setVerMercados] = useState(false)

  /**
   * Nombres de parada SIEMPRE visibles, en vez de solo al pasar el mouse.
   *
   * Arranca apagado y es la decisión correcta para el caso normal: el pin ya lleva el número de visita,
   * que es lo que se necesita para leer el orden, y ocho etiquetas encima de las calles tapan justo el
   * recorrido que se vino a mirar. Se prende para el caso en que la pregunta es "¿cuál de estos es el
   * Hipermaxi?" — ahí sí, recorrer ocho pines con el mouse para averiguarlo es peor que el desorden.
   */
  const [verEtiquetas, setVerEtiquetas] = useState(false)

  /**
   * Qué trazos se dibujan. Los tres arrancan encendidos: juntos son la respuesta completa a "¿cómo va este
   * viaje?" y apagar uno por defecto sería esconder un tercio de la historia.
   *
   * Se pueden apagar porque cada uno contesta una pregunta distinta y a veces molestan las otras dos: para
   * mirar de cerca la maniobra de ahora, el recorrido de las siete paradas anteriores es ruido; para
   * evaluar cuánto falta, lo ya recorrido no aporta. Es el mismo argumento de las capas — el mapa
   * completo es el default correcto, no la única vista posible.
   */
  const [trazosOcultos, setTrazosOcultos] = useState<ClaveTrazo[]>([])
  const verTrazo = (clave: ClaveTrazo) => !trazosOcultos.includes(clave)
  const alternarTrazo = (clave: ClaveTrazo) =>
    setTrazosOcultos((ocultos) =>
      ocultos.includes(clave) ? ocultos.filter((c) => c !== clave) : [...ocultos, clave],
    )
  const [mercadoSelId, setMercadoSelId] = useState<number | null>(null)
  const cityIds = useCityIdsDelMapa([], 'santacruz')
  const { mercados, cargando: cargandoMercados } = useMercadosMapa(cityIds, verMercados)

  /**
   * Avisos de eventos. El hook vive acá y no en la vista porque acá están juntas las tres cosas que
   * necesita —las entregas vivas, el ping actual y el callback que enfoca una parada— y porque su
   * interruptor es una herramienta más de esta barra. La preferencia sí es global (store persistido):
   * es del usuario, no de este viaje.
   */
  const notificaciones = useNotificacionesStore((s) => s.activas)
  const setNotificaciones = useNotificacionesStore((s) => s.setActivas)
  useNotificacionesEventos({ viaje, entregas, tracking, activas: notificaciones, onVerParada: onSeleccionar })

  // Esta vista entra siempre "viva": seguimiento y avisos encendidos sin depender de la sesión
  // anterior ni del foco actual. El operador puede apagarlos después si quiere.
  useEffect(() => {
    motivoPausa.current = null
    setSeguir(true)
    setNotificaciones(true)
  }, [viaje?.tripId, setNotificaciones])

  // Coordenadas de la parada en foco como PRIMITIVAS y no como objeto: `entregas` se reconstruye en
  // cada tick de la simulación, así que un `{lat, lng}` nuevo haría refirar el centrado sin parar.
  const enFoco = entregas.find((e) => e.paradaId === paradaFoco)
  const focoLat = enFoco?.lat ?? null
  const focoLng = enFoco?.lng ?? null

  // El ícono se memoiza porque Leaflet RECREA el marcador cuando cambia la prop `icon`, y eso
  // reinicia la animación del pulso. Sin esto, con un ping cada 1,2 s la onda no llegaría a salir
  // nunca: se cortaría a la mitad en cada tick.
  const iconoCamion = useMemo(() => pinCamion(viaje.color, senalVieja), [viaje.color, senalVieja])

  /**
   * Bandera compartida: "el movimiento que viene lo hace el código". La leen los dos componentes que
   * mueven el mapa (`AjustarVista` y `SeguirCamion`) y el detector de gestos del usuario.
   *
   * Se suelta por TIEMPO y no por `moveend`: si el usuario arrastra a mitad de un vuelo, el evento
   * puede no llegar y la bandera quedaría trabada en `true`, dejando el seguimiento sordo a los
   * gestos para siempre. 1,2 s cubre el vuelo de 0,9 s con margen.
   */
  const programatico = useRef(false)

  /**
   * Hay un tour de cámara en curso. Lo escribe `AjustarVista` y lo lee `SeguirCamion`: mientras dura, el
   * seguimiento no reencuadra, porque el camión está fuera de cuadro A PROPÓSITO.
   */
  const tourEnCurso = useRef(false)

  const marcarProgramatico = useCallback(() => {
    programatico.current = true
    setTimeout(() => {
      programatico.current = false
    }, 1200)
  }, [])

  // El camión está fuera de la zona visible. Lo calcula `SeguirCamion` (que es quien conoce los píxeles
  // y los paneles) y solo se muestra con el seguimiento APAGADO: encendido, vuelve solo.
  const [fueraDeCuadro, setFueraDeCuadro] = useState(false)

  /**
   * ELEGIR UNA PARADA A MANO PAUSA EL SEGUIMIENTO.
   *
   * Sin esto, la pantalla se contradecía: hacías click en una parada de la lista, la cámara volaba hasta
   * ella y ~1,2 s después `SeguirCamion` la reemplazaba por el camión, porque desde su punto de vista el
   * camión había quedado fuera de cuadro. O sea que mirar una parada era imposible mientras el
   * seguimiento estuviera encendido, y no había ninguna forma de enterarse de por qué.
   *
   * La pausa es del SISTEMA y por eso se ANUNCIA (ver `AvisoCamara`): una pantalla que apaga sola una
   * función sin decirlo deja al usuario sin saber qué la volvió a prender. Y es temporal — al cerrar la
   * parada se retoma, que es lo que quería quien la abrió para mirarla un rato.
   *
   * `focoAuto` sale primero porque ese foco no lo eligió nadie: lo movió la simulación al cerrar una
   * parada, y ahí manda el tour de la cámara, que no pausa nada. Si venía pausado por un foco manual, un
   * avance automático lo retoma: el usuario dejó de mirar su parada porque el camión avanzó.
   */
  useEffect(() => {
    if (focoAuto || paradaFoco === null) {
      if (motivoPausa.current === 'foco') {
        motivoPausa.current = null
        setSeguir(true)
      }
      return
    }
    // `seguir` se lee de un REF y no de las dependencias, a propósito: como dependencia, apretar
    // "Seguir al camión" con la parada abierta volvería a disparar este efecto y lo apagaría de nuevo —
    // el botón no funcionaría. Y por ref y no desde el updater de `setSeguir` porque acá hay que escribir
    // `motivoPausa`, y un updater con efectos secundarios corre dos veces en StrictMode.
    if (!seguirRef.current) return
    motivoPausa.current = 'foco'
    setSeguir(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paradaFoco, focoAuto])

  /**
   * El tramo en curso por REF, para el segundo acto del tour (ver `AjustarVista`). El valor cambia en
   * cada ping y el tour solo necesita el vigente en el momento de volar, no cada versión intermedia.
   */
  const tramoRef = useRef<LatLngTuple[] | null>(tramo)
  tramoRef.current = tramo

  /** Retomar el seguimiento a mano: limpia la pausa para que no quede una decisión vieja pendiente. */
  const retomarSeguimiento = useCallback(() => {
    motivoPausa.current = null
    setSeguir(true)
  }, [])

  return (
    <MapContainer
      center={SANTA_CRUZ}
      zoom={INITIAL_ZOOM}
      scrollWheelZoom
      attributionControl={false}
      zoomControl={false}
      className="h-full w-full"
    >
      {/* `key={capa}`: sin remontar, Leaflet reusa la capa y mezcla teselas de las dos durante la
          transición. `subdomains` porque CARTO sirve desde a–d y OSM desde a–c. */}
      <CapaBaseTiles capa={capa} />
      <ZoomWatch onZoom={setZoom} />
      <InvalidateOnResize />

      {/* Mercados: fondo. Su pane propio (z 350) la deja debajo del recorrido y de todos los pines, así
          que prenderla no le quita legibilidad a nada de lo que ya estaba en el mapa. A diferencia de la
          planificación, acá NO se re-encuadra al cargarla: esta pantalla tiene su propia cámara
          (seguimiento del camión) y moverla por una capa de fondo sería pelearle la vista al usuario. */}
      {verMercados && (
        <MercadosLayer mercados={mercados} seleccionadoId={mercadoSelId} onSeleccionar={setMercadoSelId} />
      )}

      <HerramientasMapa
        recorrido={paraEncuadrar}
        posicionCamion={posicion}
        capa={capa}
        onCapa={setCapa}
        seguir={seguir}
        // Centrar a mano vuelve a ENCENDER el seguimiento: pedir el camión es, justamente, decir
        // "quiero mirarlo a él". Obligar a apretar dos botones para eso sería trámite.
        // Apagarlo desde el botón cuenta como decisión del USUARIO, así que cerrar una parada después
        // no debe revivirlo.
        onSeguir={(v) => {
          motivoPausa.current = v ? null : 'usuario'
          setSeguir(v)
        }}
        soloTramo={soloTramo}
        onSoloTramo={setSoloTramo}
        hayTramo={tramo !== null}
        verMercados={verMercados}
        onVerMercados={setVerMercados}
        verEtiquetas={verEtiquetas}
        onVerEtiquetas={setVerEtiquetas}
        trazosOcultos={trazosOcultos}
        onAlternarTrazo={alternarTrazo}
        cargandoCapas={cargandoMercados || ruteando}
        notificaciones={notificaciones}
        onNotificaciones={setNotificaciones}
        ancla={anclaHerramientas}
        margenIzq={margenIzq}
        margenDer={margenDer}
      />
      <SeguirCamion
        posicion={posicion}
        activo={seguir}
        margenIzq={margenIzq}
        margenDer={margenDer}
        programatico={programatico}
        tourEnCurso={tourEnCurso}
        marcarProgramatico={marcarProgramatico}
        onUsuarioTomaControl={() => {
          motivoPausa.current = 'usuario'
          setSeguir(false)
        }}
        onFueraDeCuadro={setFueraDeCuadro}
      />

      {/* Con el seguimiento ENCENDIDO no hay pastilla: el camión vuelve solo, o lo trae el segundo acto
          del tour. Apagado, aparece en los dos casos que lo apagan, y con una diferencia importante entre
          ellos: la pausa por PARADA se anuncia siempre —la hizo el sistema y hay que decirlo— y la del
          usuario solo cuando además perdió al camión de vista, porque apagarlo fue su decisión y no
          necesita que se la recuerden. */}
      {/* La leyenda lista lo que EFECTIVAMENTE está dibujado: los trazos encendidos, y `ahora` solo si hay
          un tramo en curso que dibujar (con el camión en el depósito no hay ninguno). */}
      <LeyendaTrazos
        visibles={CLAVES_TRAZO.filter(
          (clave) => verTrazo(clave) && (clave !== 'ahora' || tramo !== null),
        )}
        margenIzq={margenIzq}
      />

      {!seguir && posicion && (enFoco || fueraDeCuadro) && (
        <AvisoCamara paradaMirando={enFoco?.secuencia ?? null} onSeguir={retomarSeguimiento} />
      )}
      <AjustarVista
        tripId={viaje.tripId}
        recorrido={paraEncuadrar}
        // La posición del PRIMER render, no la que llega en cada ping: encuadrar con la posición viva
        // le arrancaría la vista de las manos al usuario en cada tick.
        posicionInicial={viaje.tracking ? posicionDe(viaje.tracking) : null}
        focoLat={focoLat}
        focoLng={focoLng}
        // El tour solo corre si el usuario no está manejando la vista: foco automático Y seguimiento
        // encendido. Con el seguimiento apagado —que solo pasa por decisión suya— el avance sigue
        // mostrando la parada nueva, pero la cámara no se va sola a buscar el camión.
        tourActivo={focoAuto && seguir}
        tourEnCurso={tourEnCurso}
        tramo={tramoRef}
        margenIzq={margenIzq}
        margenDer={margenDer}
        marcarProgramatico={marcarProgramatico}
      />

      {/* Con la vista de tramo, el recorrido completo no se OCULTA: se atenúa. Sigue siendo el
          contexto —de dónde viene, cuánto le falta— y borrarlo dejaría una línea suelta en el vacío,
          imposible de ubicar. Lo que cambia es cuál de las dos líneas manda la vista. */}
      {verTrazo('hecho') && <Trazo positions={recorrido} estilo={TRAZO.hecho} atenuado={soloTramo} />}
      {verTrazo('falta') && <Trazo positions={pendiente} estilo={TRAZO.falta} atenuado={soloTramo} />}
      {/* EL TRAMO EN CURSO SE DIBUJA SIEMPRE, no solo en la vista de tramo.
          Antes aparecía únicamente con `soloTramo` encendido, y por eso hacía falta encenderlo: en la
          vista normal, "qué está haciendo ahora" —la pregunta de una pantalla de vigilancia— no estaba
          dibujada en ninguna parte. Ahora lo está, y `soloTramo` pasa a ser lo que su nombre dice: no
          agrega la línea, ATENÚA el contexto para que quede sola.

          Es el más grueso de los tres y el único a color: las tres líneas se distinguen por GROSOR y no
          solo por tono, que es lo que las mantiene legibles para quien no distingue bien el azul del
          gris. Ver `trazo-estilo`. */}
      {verTrazo('ahora') && tramo && <Trazo positions={tramo} estilo={TRAZO.ahora} />}

      {/* Los offsets de tooltip son NEGATIVOS y grandes porque el ancla del pin es su punta (abajo):
          para quedar arriba del marcador hay que subir todo su alto, no la mitad. */}
      <Marker position={[DEPOSITO.lat, DEPOSITO.lng]} icon={pinDeposito}>
        {/* -34 y no -42: la chapa del depósito bajó de 34 a 28 px de ancho, así que su alto total
            (ancho + media punta) pasó de 42 a 33 y el tooltip quedaba flotando arriba del pin. */}
        <Tooltip direction="top" offset={[0, -34]}>
          <span className="font-medium">{DEPOSITO.nombre}</span> — salida y retorno
        </Tooltip>
      </Marker>

      {entregas.map((entrega) => {
        const meta = ESTADO_ENTREGA[entrega.estado]
        const enFocoPin = paradaFoco === entrega.paradaId
        const alto = altoPinEntrega(enFocoPin, escalaPin)
        return (
          <Marker
            key={entrega.id}
            position={[entrega.lat, entrega.lng]}
            icon={pinEntrega(entrega, enFocoPin, escalaPin)}
            eventHandlers={{ click: () => onSeleccionar(entrega.paradaId) }}
            // La parada en foco se dibuja ENCIMA de sus vecinas. Con los pines más chicos siguen
            // pudiendo tocarse, y la que está seleccionada es justamente la que no puede quedar debajo.
            zIndexOffset={enFocoPin ? 500 : 0}
          >
            {/* UN tooltip que cambia de modo, con `key` para que Leaflet lo remonte: `permanent` se lee
                una sola vez, al crear la capa, así que sin remontar prender las etiquetas no hacía nada.
                Es el mismo patrón que el editor de planificación.

                El contenido NO es el mismo en los dos modos, y ahí está el punto. Permanente hay ocho a
                la vez y tiene que ser un nombre y nada más; en hover hay uno, es una consulta puntual y
                ahí sí entra el estado y la hora. */}
            <Tooltip
              key={verEtiquetas ? 'permanente' : 'hover'}
              permanent={verEtiquetas}
              direction={verEtiquetas ? 'bottom' : 'top'}
              offset={verEtiquetas ? [0, 4] : [0, -(alto - 2)]}
              className={verEtiquetas ? 'stop-detail-tip' : ''}
            >
              {verEtiquetas ? (
                <span className="block max-w-28 truncate text-center text-[9px] font-semibold leading-tight">
                  {entrega.secuencia}. {entrega.cliente}
                </span>
              ) : (
                <>
                  <span className="font-medium">
                    #{entrega.secuencia} · {entrega.cliente}
                  </span>
                  <br />
                  {meta.label}
                  {entrega.entregaAt ? ` · ${entrega.entregaAt}` : ''}
                </>
              )}
            </Tooltip>
          </Marker>
        )
      })}

      {posicion && (
        <Marker position={posicion} icon={iconoCamion} zIndexOffset={1000}>
          <Tooltip direction="top" offset={[0, -22]}>
            <span className="font-medium">{viaje.camion}</span>
            {` · ${viaje.chofer}`}
            <br />
            {/* Los minutos se DERIVAN de `trackedAt` (reloj del dispositivo). Antes venían de un campo
                guardado en el dataset, y por eso el tooltip podía decir "Sin señal hace 37 min" de un
                camión cuyo pin acababa de moverse. */}
            {senalVieja ? `Sin señal hace ${minutos} min` : `Señal hace ${minutos ?? 0} min`}
            {/* La batería se lee JUNTO al estado de la señal: es la explicación más frecuente de
                que un camión haya dejado de reportar. Sale del MISMO ítem, no de un campo aparte. */}
            {tracking ? ` · Batería ${tracking.battery}%` : ''}
          </Tooltip>
        </Marker>
      )}
    </MapContainer>
  )
}
