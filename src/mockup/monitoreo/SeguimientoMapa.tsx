// Mapa del MONITOREO. Es un componente aparte de `OrdersMap` a propósito, no por duplicar código.
//
// Los dos mapas tienen contratos incompatibles:
//   · OrdersMap  → color = camión asignado, ícono = canal del cliente. Pregunta: "¿a quién le tocó?"
//   · Este       → color/relleno = estado de la entrega, número = orden de visita. Pregunta: "¿cómo va?"
// Meter los dos en un solo componente obliga a un prop `modo` y a ramificar cada pin, cada tooltip y
// cada capa. Eso es exactamente cómo un archivo de 250 líneas termina en 1000. Lo que SÍ se comparte
// son las primitivas: `divIcon`, el control de capas y el invalidate por resize.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Truck, Warehouse } from 'lucide-react'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import type { LatLngTuple } from '../map/geo/polyline'
import { reactIcon } from '../map/div-icon'
import { encuadrar } from '../map/encuadrar'
import { InvalidateOnResize } from '../map/InvalidateOnResize'
import { DEPOSITO } from '../mock-data'
import type { EntregaMonitoreo, ViajeMonitoreo } from './monitoreo-data'
import { HerramientasMapa, type CapaBase } from './HerramientasMapa'
import { ESTADO_ENTREGA } from './monitoreo-estado'
import { minutosSinSenal, posicionDe, senalVieja as esSenalVieja, type ItemActual } from './tracking-dynamo'

const SANTA_CRUZ: [number, number] = [-17.786, -63.17]
const INITIAL_ZOOM = 12

/** Zoom al centrar. 15 muestra unas cuadras: suficiente contexto para saber DÓNDE sin perder la calle. */
const ZOOM_CAMION = 15
const ZOOM_PARADA = 16

/** URLs de las capas base. Antes vivían en `MapLayersControl`, que se reemplazó por herramienta propia. */
const TILES: Record<CapaBase, string> = {
  calles: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  satelite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
}

/** Alto del rombo que forma la punta, proporcional al cuerpo de la chapa. */
const puntaDe = (ancho: number) => Math.round(ancho * 0.34)

/**
 * Chapa blanca con punta: el contenedor de todos los marcadores de LUGAR del mapa.
 *
 * Antes cada parada era un círculo de color pelado. Con quince paradas el mapa quedaba como un
 * sarpullido de puntos rojos y verdes encima de las calles — el color competía con el mapa en vez de
 * apoyarse en él. La chapa blanca resuelve dos cosas de una: separa el marcador del fondo sea cual
 * sea la capa (calles claras, satélite oscuro), y encierra el color adentro, donde SIGNIFICA algo.
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
 * Pin de una parada. El NÚMERO DE SECUENCIA manda siempre: es el dato que responde "¿en qué orden
 * las visita?", y sin él el mapa es una nube de puntos de colores.
 *
 * Antes el símbolo (✓ / ✕ / ↩) reemplazaba al número apenas la parada cerraba, así que en un viaje
 * casi terminado —el caso que MÁS se mira— se veía una fila de tildes y el orden se perdía entero.
 * El estado se lee por DOS canales, uno de ellos independiente del color (entre 5% y 8% de los
 * hombres tiene algún daltonismo):
 *   1. COLOR    — el matiz semántico del estado.
 *   2. INSIGNIA — ✓ / ✕ / ↩ solo cuando la parada CERRÓ. Sin insignia, sigue abierta.
 *
 * El relleno del círculo ya NO codifica nada, y es una corrección: antes hueco = abierta, pero cuando
 * el pin pasó a vivir dentro de una chapa BLANCA el relleno blanco se confundió con ella y quedaba un
 * aro de 2px flotando. La insignia cubre lo mismo y mejor — el relleno solo decía "cerrada", la
 * insignia dice CUÁL de los tres cierres fue.
 */
function pinEntrega(entrega: EntregaMonitoreo, resaltado: boolean) {
  const meta = ESTADO_ENTREGA[entrega.estado]
  const ancho = resaltado ? 40 : 32
  const punta = puntaDe(ancho)
  const circulo = Math.round(ancho * 0.72)

  return reactIcon(
    <Chapa ancho={ancho} resaltado={resaltado}>
      <div
        style={{
          width: circulo,
          height: circulo,
          borderRadius: 999,
          background: meta.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: Math.round(circulo * 0.56),
          fontWeight: 700,
          fontFamily: 'ui-monospace, monospace',
          lineHeight: 1,
        }}
      >
        {entrega.secuencia}
      </div>

      {meta.simbolo && (
        <span
          style={{
            position: 'absolute',
            top: -3,
            right: -3,
            width: 15,
            height: 15,
            borderRadius: 999,
            background: meta.color,
            border: '1.5px solid #fff',
            color: '#fff',
            fontSize: 9,
            fontWeight: 700,
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {meta.simbolo}
        </span>
      )}
    </Chapa>,
    [ancho, ancho + punta / 2],
    // Ancla en la PUNTA, no en el centro: el pin señala el lugar desde arriba en vez de pisarlo.
    [ancho / 2, ancho + punta / 2],
  )
}

/** El depósito lleva la misma chapa que las paradas: es otro LUGAR, no otra clase de objeto. */
const DEPOSITO_ANCHO = 34

const pinDeposito = reactIcon(
  <Chapa ancho={DEPOSITO_ANCHO}>
    <div
      style={{
        width: 24,
        height: 24,
        borderRadius: 999,
        background: '#0f172a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
      }}
    >
      <Warehouse size={14} strokeWidth={2.25} />
    </div>
  </Chapa>,
  [DEPOSITO_ANCHO, DEPOSITO_ANCHO + puntaDe(DEPOSITO_ANCHO) / 2],
  [DEPOSITO_ANCHO / 2, DEPOSITO_ANCHO + puntaDe(DEPOSITO_ANCHO) / 2],
)

/**
 * El camión. Círculo pleno, no chapa: no es un LUGAR, es un objeto en movimiento — la misma
 * distinción que hace Google entre un pin y el punto azul.
 *
 * Antes llevaba `animate-pulse` sobre TODO el marcador más un `box-shadow` de 5px de color y otro
 * negro encima. Eran tres efectos peleando: el pulse desvanecía el ícono entero (parecía que el
 * camión titilaba, no que la señal estuviera viva) y los dos halos se mezclaban en una mancha. Ahora
 * hay un solo aro fino y una sombra limpia; la señal en vivo ya la comunica el indicador de frescura.
 */
function pinCamion(color: string, senalVieja: boolean) {
  const tono = senalVieja ? '#64748b' : color

  return reactIcon(
    <div
      style={{
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
  margenIzq,
  margenDer,
}: {
  tripId: number
  recorrido: LatLngTuple[]
  posicionInicial: LatLngTuple | null
  focoLat: number | null
  focoLng: number | null
  margenIzq: number
  margenDer: number
}) {
  const map = useMap()

  // Los márgenes cambian al abrir o cerrar un panel, y no queremos reencuadrar por eso. Se leen del
  // ref en el momento de encuadrar, así siempre son los vigentes sin entrar como dependencia.
  const margenes = useRef({ margenIzq, margenDer })
  margenes.current = { margenIzq, margenDer }

  useEffect(() => {
    if (posicionInicial) encuadrar(map, [posicionInicial], { ...margenes.current, zoomMax: ZOOM_CAMION })
    else encuadrar(map, recorrido, margenes.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId])

  useEffect(() => {
    if (focoLat === null || focoLng === null) return
    encuadrar(map, [[focoLat, focoLng]], { ...margenes.current, zoomMax: ZOOM_PARADA })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focoLat, focoLng])

  return null
}

export function SeguimientoMapa({
  viaje,
  entregas,
  tracking,
  /** Paradas ya cerradas — viene de la simulación en vivo, no de `viaje.cursor`. */
  cursor,
  paradaFoco,
  onSeleccionar,
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
  onSeleccionar: (paradaId: string) => void
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
  // La polilínea se parte en dos: lo recorrido va sólido y atenuado, lo que falta va punteado a color
  // pleno. Es la lectura de progreso más barata del mapa — no hay que leer un solo número.
  const { recorrido, pendiente } = useMemo(() => {
    const corte = Math.min(cursor + 1, viaje.recorrido.length)
    const hecho = viaje.recorrido.slice(0, corte)
    const falta = viaje.recorrido.slice(Math.max(corte - 1, 0))
    // Con el camión en ruta, el quiebre real está en su posición actual, no en la última parada.
    if (posicion) return { recorrido: [...hecho, posicion], pendiente: [posicion, ...falta.slice(1)] }
    return { recorrido: hecho, pendiente: falta }
  }, [viaje.recorrido, cursor, posicion])

  const [capa, setCapa] = useState<CapaBase>('calles')

  // Coordenadas de la parada en foco como PRIMITIVAS y no como objeto: `entregas` se reconstruye en
  // cada tick de la simulación, así que un `{lat, lng}` nuevo haría refirar el centrado sin parar.
  const enFoco = entregas.find((e) => e.paradaId === paradaFoco)
  const focoLat = enFoco?.lat ?? null
  const focoLng = enFoco?.lng ?? null

  return (
    <MapContainer
      center={SANTA_CRUZ}
      zoom={INITIAL_ZOOM}
      scrollWheelZoom
      attributionControl={false}
      zoomControl={false}
      className="h-full w-full"
    >
      <TileLayer url={TILES[capa]} />
      <InvalidateOnResize />
      <HerramientasMapa
        recorrido={viaje.recorrido}
        posicionCamion={posicion}
        capa={capa}
        onCapa={setCapa}
        ancla={anclaHerramientas}
        margenIzq={margenIzq}
        margenDer={margenDer}
      />
      <AjustarVista
        tripId={viaje.tripId}
        recorrido={viaje.recorrido}
        // La posición del PRIMER render, no la que llega en cada ping: encuadrar con la posición viva
        // le arrancaría la vista de las manos al usuario en cada tick.
        posicionInicial={viaje.tracking ? posicionDe(viaje.tracking) : null}
        focoLat={focoLat}
        focoLng={focoLng}
        margenIzq={margenIzq}
        margenDer={margenDer}
      />

      {recorrido.length > 1 && (
        <Polyline positions={recorrido} pathOptions={{ color: viaje.color, weight: 4, opacity: 0.35 }} />
      )}
      {pendiente.length > 1 && (
        <Polyline
          positions={pendiente}
          pathOptions={{ color: viaje.color, weight: 3, opacity: 0.9, dashArray: '6 8' }}
        />
      )}

      {/* Los offsets de tooltip son NEGATIVOS y grandes porque el ancla del pin es su punta (abajo):
          para quedar arriba del marcador hay que subir todo su alto, no la mitad. */}
      <Marker position={[DEPOSITO.lat, DEPOSITO.lng]} icon={pinDeposito}>
        <Tooltip direction="top" offset={[0, -42]}>
          <span className="font-medium">{DEPOSITO.nombre}</span> — salida y retorno
        </Tooltip>
      </Marker>

      {entregas.map((entrega) => {
        const meta = ESTADO_ENTREGA[entrega.estado]
        return (
          <Marker
            key={entrega.id}
            position={[entrega.lat, entrega.lng]}
            icon={pinEntrega(entrega, paradaFoco === entrega.paradaId)}
            eventHandlers={{ click: () => onSeleccionar(entrega.paradaId) }}
          >
            <Tooltip direction="top" offset={[0, -40]}>
              <span className="font-medium">
                #{entrega.secuencia} · {entrega.cliente}
              </span>
              <br />
              {meta.label}
              {entrega.entregaAt ? ` · ${entrega.entregaAt}` : ''}
            </Tooltip>
          </Marker>
        )
      })}

      {posicion && (
        <Marker position={posicion} icon={pinCamion(viaje.color, senalVieja)} zIndexOffset={1000}>
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
