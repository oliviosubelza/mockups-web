// Todas las zonas sobre el mapa. Es la capa que reemplaza al listado como forma principal de llegar a
// una zona: en modo `explorar` los polígonos son clickeables y el click SELECCIONA, así que editar una
// zona dejó de exigir volver a una tabla y entrar de a una.
//
// TRES PAPELES según el modo del workspace, y el cambio de papel es lo que hace que la misma capa sirva
// para explorar y para dibujar:
//   · `explorar`  → las zonas SON el contenido: azules, clickeables, la seleccionada resaltada.
//   · `dibujar` / `editar` → pasan a ser CONTEXTO: grises, apagadas y **no interactivas** —con la
//     excepción de las restringidas, ver el bloque de abajo.
//
// El papel lo elige quien monta la capa, y no siempre sale del modo de un workspace: en el planner es una
// preferencia del usuario (`zonasActivas`), apagada por defecto. Ahí el papel `contenido` convive con
// herramientas de marcado, y para eso está `interactivo`: el color de primer plano sin robar el click.
//
// UNA RESTRINGIDA NO SE APAGA NUNCA DEL TODO. El resto de los tipos sí se aplana en `contexto` —una
// zona de reparto ahí es gris, porque el gris significa "otro territorio, no es de lo que estás
// hablando" y eso es exactamente lo que es—, pero el rojo de una restringida significa otra cosa: "acá
// no se puede". Y eso NO deja de ser cierto porque estés dibujando otra zona o planificando un reparto.
// Aplanarlas al gris del fondo convertía una advertencia en decorado, y peor: la escondía justo en las
// dos pantallas donde alguien está por comprometerse con un trazo o con un plan.
//
// Así que en `contexto` conservan su identidad —`ROJO_RESTRINGIDA`, borde punteado— pero APAGADAS por
// `FACTOR_RESTRINGIDA_FONDO`, en el mismo espíritu del gris al que reemplazan: bajan de plano sin
// cambiar de significado. Las de reparto en `contexto` siguen grises, sin excepción.
//
// EL ASPECTO SE ELIGE DESDE FUERA, PERO SOLO EN SU PANTALLA. Los rótulos, el peso del relleno y el
// resaltado salen de `zonas-mapa-store`, que es el estado del menú de la esquina inferior derecha de
// `/zonas`. Esa lectura está detrás de `aspectoEditor` y no detrás del papel, y la distinción importa:
// esta misma capa la monta el planner, que NO conoce ese store ni tiene dónde ofrecer sus opciones —y lo
// hace en los DOS papeles, `contexto` de fondo y `contenido` cuando se prende "Zonas en primer plano".
// Colgar el aspecto de `papel !== 'contexto'` habría dejado que apagar los nombres en el editor de zonas
// los apagara también en el planificador, desde un menú que allá no existe: un mapa que cambia solo por
// algo que hiciste en otra pantalla, sin control a la vista para revertirlo. Con la bandera explícita, el
// default del store ES el aspecto que ve todo el que no la prende.
//
// LO NO INTERACTIVO NO ES UN DETALLE ESTÉTICO: un polígono de Leaflet con `interactive: true` se come el
// click antes de que llegue al `map.on('click')` de la herramienta de dibujo. Con las zonas clickeables
// mientras dibujás, poner un vértice dentro de una zona existente sería imposible — y es lo que más se
// hace, porque las zonas nuevas nacen pegadas a las viejas.
import { useMemo, useState } from 'react'
import { CircleMarker, Pane, Polygon, Tooltip } from 'react-leaflet'
import type { TipoConflicto } from '../map/geo/holgura'
import { areaKm2, formatearArea } from '../map/geo/medidas'
import { poligonoALatLng, type Zona } from '../zones-store'
import { useZonasMapaStore } from './zonas-mapa-store'

/** Nombre del pane. Exportado para que nadie lo reescriba como string suelto. */
export const PANE_ZONAS = 'zonas'

/** Debajo de `overlayPane` (400), donde `PolygonDrawLayer` monta su `L.layerGroup`: el trazo en curso y
 *  sus vértices quedan SIEMPRE encima, sin depender del orden de montaje. */
const Z_PANE = 340

const AZUL = '#2563eb'
const GRIS = '#94a3b8'
const GRIS_OSCURO = '#64748b'
/**
 * Los dos conflictos posibles, con un color cada uno. La distinción no es un matiz: son problemas de
 * gravedad distinta y se arreglan distinto.
 *   · ROJO (`solapa`)  → comparten territorio. Un cliente cae en dos zonas y ninguna consulta puede
 *     decidir cuál es la suya. Hay que rehacer un borde.
 *   · ÁMBAR (`holgura`) → no se pisan, pero los bordes quedaron a menos del mínimo. El reparto funciona;
 *     lo que no aguanta es el redondeo de las coordenadas. Se arregla corriendo un vértice unos metros.
 * Pintar los dos de rojo llevaba a tratar como urgente algo que no lo es, y al revés: perder de vista
 * el solapamiento entre veinte avisos iguales.
 */
const ROJO = '#dc2626'
const AMBAR = '#f59e0b'
const colorConflicto = (tipo: TipoConflicto) => (tipo === 'solapa' ? ROJO : AMBAR)

/**
 * Las zonas RESTRINGIDAS van del mismo rojo que el conflicto `solapa`, y sí, se sabe. NO ES UNA
 * COLISIÓN A ARREGLAR — está escrito acá justo para que nadie llegue después, vea dos rojos y "corrija"
 * uno de los dos.
 *
 * No hay ambigüedad posible porque los dos rojos no pueden salir sobre el mismo polígono: los
 * conflictos se evalúan SOLO entre zonas de reparto (`ZonasWorkspaceView`, `vecinos`), así que una
 * restringida jamás entra en el `enConflicto`, y una de reparto nunca se pinta con este color. Que
 * además signifiquen lo mismo —"acá no vayas"— es lo que hace que el rojo sea el color correcto para
 * las dos cosas en vez de una coincidencia molesta.
 *
 * Se distinguen igual por la forma del borde: el conflicto va SIEMPRE lleno (es un borde que hay que ir
 * a mover), la restringida va SIEMPRE punteada (es una franja que nadie va a mover, no un error).
 */
const ROJO_RESTRINGIDA = ROJO
/** Cuánto sube el relleno de una restringida. El paso es el mismo que separa reposo de hover y hover de
 *  seleccionada, así que se lee como "un escalón más" y no como otro material: son polígonos con más
 *  peso visual que una zona de reparto porque casi siempre están encima de una y tienen que ganarle. */
const ESCALON_RESTRINGIDA = 0.08
/**
 * Cuánto sube el relleno con "Relleno sólido". Es un escalón grande a propósito —tres veces el de la
 * restringida— porque la opción existe para leer la COBERTURA de un vistazo: si el salto fuera sutil, el
 * hueco sin cubrir entre dos zonas seguiría habiendo que buscarlo bordeando contornos, que es justo lo
 * que se viene a evitar. No llega a 1: el fondo tiene que seguir asomando o el mapa deja de ser un mapa.
 */
const ESCALON_SOLIDO = 0.3
/**
 * Qué le queda a una zona atenuada cuando "Resaltar la seleccionada" está prendido.
 *
 * Un FACTOR y no una opacidad fija, para que la atenuación no borre las diferencias que ya estaban: una
 * restringida atenuada sigue pesando más que una de reparto atenuada, y con relleno sólido todo el
 * conjunto sigue leyéndose más. Con un valor fijo, prender el resaltado aplanaría el mapa entero a un
 * solo gris y la única zona con información sería la elegida — que es más de lo que la opción promete.
 */
const FACTOR_ATENUADA = 0.35
/**
 * Cuánto le queda a una restringida cuando la capa es `contexto`.
 *
 * Es el reemplazo del gris: antes el papel `contexto` le borraba el tipo y salía como una zona más del
 * fondo, y con eso se perdía la única advertencia que el mapa daba sin que se la pidieran. Ahora
 * conserva color y punteado, y lo que baja es el PLANO — un factor sobre lo que ya valía en primer
 * plano, no una opacidad fija, por lo mismo que `FACTOR_ATENUADA`: así una restringida de fondo sigue
 * pesando exactamente un escalón más que una de reparto de fondo, igual que en `contenido`.
 *
 * El valor está calibrado contra el TRAZO EN CURSO, que es lo que no puede perder: el polígono que se
 * está dibujando va en `overlayPane` (z 400) sobre este pane (z 340), a opacidad entera y con sus
 * vértices, mientras que esto queda en un punteado fino y translúcido. La restringida se lee, pero
 * nadie la confunde con la línea que está siguiendo el mouse.
 */
const FACTOR_RESTRINGIDA_FONDO = 0.6

export type PapelZonas = 'contenido' | 'contexto'

export function ZonasLayer({
  zonas,
  papel,
  seleccionadaId,
  onSeleccionar,
  enConflicto,
  interactivo = true,
  aspectoEditor = false,
}: {
  zonas: Zona[]
  papel: PapelZonas
  seleccionadaId: number | null
  /** Solo se llama en `contenido`. En `contexto` los polígonos no reciben el mouse. */
  onSeleccionar: (id: number | null) => void
  /** Qué zonas están en conflicto y de qué tipo. Se resaltan INCLUSO como contexto: mientras dibujás, la
   *  zona que estás invadiendo es lo más importante del fondo. */
  enConflicto?: Map<number, TipoConflicto>
  /**
   * Corta el mouse aun siendo `contenido`. Es para el caso del planner: las zonas se ven en primer
   * plano, pero mientras hay una herramienta de marcado activa el click le pertenece al gesto de
   * seleccionar paradas, no al polígono que esas paradas tienen debajo.
   *
   * Separado de `papel` a propósito: el papel dice CÓMO SE VE, esto dice SI RESPONDE. Colapsarlos
   * obligaría a apagar el color para devolver el click.
   */
  interactivo?: boolean
  /**
   * Obedecer al menú de aspecto de la pantalla de Zonas (`zonas-mapa-store`).
   *
   * APAGADO POR DEFECTO, y ese default es la garantía: el planner monta esta misma capa y no tiene ese
   * menú, así que sin la bandera se vería exactamente como se veía siempre pase lo que pase en `/zonas`.
   * Ver el bloque del encabezado — colgarlo del `papel` en vez de una bandera propia parecía equivalente
   * y no lo es.
   */
  aspectoEditor?: boolean
}) {
  // El hover se guarda acá y no en el padre a propósito: es estado puramente visual de esta capa y
  // subirlo haría re-renderizar la pantalla entera —listado incluido— cada vez que el mouse cruza un
  // polígono.
  const [hoverId, setHoverId] = useState<number | null>(null)

  const verNombresElegido = useZonasMapaStore((s) => s.verNombres)
  const verMedidasElegido = useZonasMapaStore((s) => s.verMedidas)
  const verVerticesElegido = useZonasMapaStore((s) => s.verVertices)
  const resaltarElegido = useZonasMapaStore((s) => s.resaltarSeleccionada)
  const rellenoSolidoElegido = useZonasMapaStore((s) => s.rellenoSolido)

  // EL ÚNICO LUGAR DONDE EL STORE SE APAGA. Las cinco preferencias se resuelven acá arriba, de una vez,
  // y el resto del componente lee booleanos comunes. Repartir el `aspectoEditor &&` por cada lugar donde
  // se usan era garantizar que la próxima opción entrara sin la guardia y que el planner empezara a
  // obedecer un menú que no tiene — un olvido de tres caracteres que no rompe nada acá y se manifiesta
  // en otra pantalla.
  //
  // `verMedidas` depende además de que haya nombre: la medida se dibuja DEBAJO del nombre, así que sin
  // etiqueta no hay dónde ponerla. El menú ya deshabilita el ítem, pero el valor guardado sobrevive a
  // apagar los nombres —para que volver a prenderlos devuelva la vista que tenías— y esa combinación
  // llegaría hasta acá si no se resolviera también de este lado.
  const verNombres = !aspectoEditor || verNombresElegido
  const verMedidas = aspectoEditor && verMedidasElegido && verNombresElegido
  const verVertices = aspectoEditor && verVerticesElegido

  /**
   * Los anillos en `[lat, lng]`, una sola vez por cambio de `zonas`.
   *
   * Antes se reconvertía el GeoJSON en cada pasada —dos por render, tres desde que hay medidas y cuatro
   * con los vértices del hover— y el hover redibuja la capa entera cada vez que el mouse cruza un
   * polígono. El área se calcula sobre esto, así que sin el memo la superficie de las diez zonas se
   * recalcularía en cada movimiento del mouse para dar exactamente el mismo número.
   */
  const anillos = useMemo(
    () => new Map(zonas.map((z) => [z.id, poligonoALatLng(z.polygonGeoJson)])),
    [zonas],
  )

  if (zonas.length === 0) return null
  const contexto = papel === 'contexto'
  /** Responde al mouse: hay que ser contenido Y estar habilitado. Todo lo demás cuelga de esto. */
  const activo = !contexto && interactivo
  /**
   * El relleno sólido y el resaltado NO tocan el papel `contexto`, aunque el menú esté prendido.
   *
   * Ahí el fondo está deliberadamente aplanado —relleno 0,1, gris, sin selección; y las restringidas,
   * que conservan el rojo, entran apagadas por su factor— para que el contorno que estás trazando sea
   * lo único con peso en pantalla. Subirle el relleno a las vecinas mientras
   * dibujás le quitaría contraste justo al trazo, que es lo contrario de lo que las dos opciones vienen a
   * hacer. Los rótulos sí se respetan en los dos papeles: ahí apagarlos AYUDA a dibujar.
   */
  const rellenoSolido = aspectoEditor && rellenoSolidoElegido && !contexto
  /**
   * La zona que queda entera; el resto se atenúa. `null` = todas iguales, que es el estado por defecto.
   *
   * Un solo valor del que cuelga todo, igual que `destacada` en `PlannerMapa`: cada polígono decide si
   * está atenuado comparándose con este id, así que "no hay ninguna elegida" y "el resaltado está
   * apagado" se expresan de la misma forma y no hay dos condiciones que mantener sincronizadas.
   */
  const destacada = aspectoEditor && resaltarElegido && !contexto ? seleccionadaId : null
  /** La zona bajo el mouse, resuelta UNA vez: la tercera pasada la necesita para cada uno de sus
   *  vértices, y buscarla ahí adentro sería un recorrido de la lista por punto dibujado. */
  const zonaHover = (hoverId !== null && zonas.find((z) => z.id === hoverId)) || null

  return (
    <Pane name={PANE_ZONAS} style={{ zIndex: Z_PANE }}>
      {/* Dos pasadas —rellenos y después bordes— porque las zonas se TOCAN: con una sola, el relleno de
          la que se monta última pisa el borde de su vecina y borra la frontera justo donde hay que
          verla. Mismo criterio que `MercadosLayer`. */}
      {zonas.map((zona) => {
        const sel = !contexto && zona.id === seleccionadaId
        const conflicto = enConflicto?.get(zona.id)
        const hover = activo && zona.id === hoverId
        // EL TIPO VALE EN LOS DOS PAPELES. Ver el bloque del encabezado: el fondo aplana la zona de
        // reparto porque ahí el tipo es una clasificación, y no aplana la restringida porque ahí el
        // tipo es una advertencia.
        const restringida = zona.tipo === 'restringida'
        // La restringida INACTIVA vuelve a ser fondo común: una restricción dada de baja no restringe
        // nada, así que pintarla de rojo apagado avisaría de algo que ya no rige. Por eso la condición
        // pide vigencia y no solo tipo — y por eso el color, más abajo, chequea `isActive` ANTES que
        // el tipo.
        const restringidaFondo = contexto && restringida && zona.isActive
        // UNA ZONA EN CONFLICTO NO SE ATENÚA NUNCA, ni siquiera con el resaltado prendido. El resaltado
        // contesta "cuál estoy mirando" y el conflicto contesta "cuál está mal": bajarle la opacidad a
        // la segunda para responder la primera esconde el único aviso que la pantalla da sin que se lo
        // pidan, y encima justo cuando el usuario está concentrado en otra zona.
        const atenuada = destacada !== null && zona.id !== destacada && !conflicto
        // El relleno queda bajo a propósito: es lo que compite con lo que haya debajo. Lo que hace
        // legible la zona es el borde de la pasada siguiente, que no le cuesta contraste a nada. Solo
        // el seleccionado sube, porque ahí hay una pregunta puntual que contestar. El hover sube el
        // relleno a mitad de camino entre reposo y seleccionado: es la única señal de que el polígono
        // responde al click. Sin esto no hay ninguna — un polígono pintado se ve igual sea clickeable
        // o no.
        // La restringida de fondo NO cae al 0,1 plano del contexto: parte del valor que tendría en
        // primer plano (sel y hover son false ahí, así que es el de reposo más su escalón) y de ahí la
        // baja el factor. Fijarle un 0,1 como al gris le habría borrado el escalón que la distingue de
        // una zona de reparto, que es lo mismo que aplanarla — solo que en rojo.
        const relleno = conflicto
          ? 0.22
          : contexto && !restringidaFondo
            ? 0.1
            : (sel ? 0.28 : hover ? 0.2 : 0.12) + (restringida ? ESCALON_RESTRINGIDA : 0)
        return (
          <Polygon
            key={`fill-${zona.id}`}
            positions={anillos.get(zona.id) ?? []}
            interactive={activo}
            pathOptions={{
              stroke: false,
              // `isActive` va PRIMERO —antes iba después de `contexto`— para que la vigencia siga
              // ganándole al tipo ahora que el tipo sobrevive al fondo: una restringida de baja tiene
              // que verse gris en los dos papeles, no roja en uno.
              fillColor: conflicto
                ? colorConflicto(conflicto)
                : !zona.isActive
                  ? GRIS
                  : restringida
                    ? ROJO_RESTRINGIDA
                    : contexto
                      ? GRIS
                      : AZUL,
              // El sólido SUMA sobre lo que ya había en vez de fijar un valor: así el seleccionado sigue
              // pesando más que el de al lado y la restringida más que la de reparto. Con un valor fijo,
              // prender la opción borraría todas las jerarquías que la capa construyó.
              fillOpacity:
                Math.min(1, relleno + (rellenoSolido ? ESCALON_SOLIDO : 0)) *
                (atenuada ? FACTOR_ATENUADA : 1) *
                (restringidaFondo ? FACTOR_RESTRINGIDA_FONDO : 1),
            }}
            eventHandlers={{
              // Volver a clickear la misma zona la deselecciona: sin esto no habría forma de quitar el
              // resaltado desde el mapa.
              click: () => activo && onSeleccionar(sel ? null : zona.id),
              mouseover: (e) => {
                if (!activo) return
                setHoverId(zona.id)
                // El cursor va sobre el elemento SVG del path y no sobre el contenedor del mapa: si se
                // tocara el contenedor pisaría el `crosshair`/`grab` que maneja la herramienta de dibujo.
                e.target.getElement()?.style.setProperty('cursor', 'pointer')
              },
              mouseout: () => setHoverId((v) => (v === zona.id ? null : v)),
            }}
          />
        )
      })}

      {zonas.map((zona) => {
        const sel = !contexto && zona.id === seleccionadaId
        const conflicto = enConflicto?.get(zona.id)
        const hover = activo && zona.id === hoverId
        const restringida = zona.tipo === 'restringida'
        const restringidaFondo = contexto && restringida && zona.isActive
        const atenuada = destacada !== null && zona.id !== destacada && !conflicto
        const anillo = anillos.get(zona.id) ?? []
        return (
          <Polygon
            key={`stroke-${zona.id}`}
            positions={anillo}
            interactive={false}
            pathOptions={{
              color: conflicto
                ? colorConflicto(conflicto)
                : !zona.isActive
                  ? GRIS_OSCURO
                  : restringida
                    ? ROJO_RESTRINGIDA
                    : contexto
                      ? GRIS_OSCURO
                      : AZUL,
              weight: conflicto ? 3 : sel ? 3.5 : hover ? 3 : contexto ? 1.5 : 2,
              // El borde se atenúa MÁS que el relleno (mismo factor sobre un valor que arranca en 1), y
              // es lo correcto: el borde es lo que hace legible una zona, así que es lo que hay que
              // bajar para que las demás pasen a fondo. Un mapa con los rellenos atenuados y los bordes
              // enteros no resalta nada, solo se despinta.
              //
              // El factor de fondo se aplica también acá y no solo al relleno: con el relleno bajado y
              // el borde entero, la restringida quedaría dibujada MÁS fuerte que las zonas grises que
              // la rodean —el borde es lo que hace legible un polígono— y "apagada" habría terminado
              // siendo "resaltada". El peso sí se queda en el 1,5 del contexto: lo que baja es el
              // plano, no el grosor.
              opacity:
                (conflicto ? 1 : contexto ? 0.75 : 1) *
                (atenuada ? FACTOR_ATENUADA : 1) *
                (restringidaFondo ? FACTOR_RESTRINGIDA_FONDO : 1),
              // Punteado = la zona no está operativa (inactiva), o es contexto. Un contorno lleno
              // significa "esta zona está en uso". Un conflicto SIEMPRE va lleno, aunque sea contexto:
              // es el borde que hay que ir a mover.
              //
              // La restringida va punteada SIEMPRE, y va primero en la cadena por eso. Su borde no es
              // una frontera de reparto sino el límite de una franja que se superpone con lo de abajo:
              // el punteado deja ver el contorno azul que cruza por debajo, que con línea llena
              // quedaría tapado y parecería que la zona de reparto se cortó ahí.
              dashArray: restringida
                ? '5 4'
                : conflicto
                  ? undefined
                  : contexto || !zona.isActive
                    ? '5 4'
                    : undefined,
              fill: false,
            }}
          >
            {/* La etiqueta se puede APAGAR desde el menú de aspecto. Con diez zonas chicas y pegadas los
                nombres se pisan entre sí y terminan tapando justo el borde que se está mirando; apagarlos
                devuelve el mapa a la geometría, que es de lo que trata esta pantalla.

                `pane` EXPLÍCITO: react-leaflet le pasa a cada capa el pane del contexto, así que acá la
                etiqueta terminaría en z 340 — el nombre dibujado DEBAJO del polígono que estás
                trazando. El nombre va al pane de etiquetas, como cualquier rótulo de mapa. */}
            {verNombres && (
              <Tooltip
                // Remontar al cambiar la selección: Leaflet fija `className` al CREAR el tooltip y no lo
                // re-aplica si solo cambian las props, así que sin esto el resaltado no se vería. La
                // medida NO entra en la `key` porque solo cambia el contenido, y eso React sí lo
                // actualiza en su lugar.
                key={sel ? 'sel' : 'normal'}
                permanent
                direction="center"
                pane="tooltipPane"
                className={sel ? 'zona-etiqueta zona-etiqueta-sel' : 'zona-etiqueta'}
              >
                {zona.name}
                {/* Segunda línea, más chica y más tenue, en vez de "Nombre · 2,3 km²" en un renglón: la
                    etiqueta va CENTRADA sobre el polígono y con todo en una línea se pasaría de largo de
                    los bordes de las zonas angostas. Los estilos van inline porque la regla
                    `.zona-etiqueta` de `index.css` describe el rótulo entero y esto es su subtítulo:
                    dos declaraciones en el único lugar que las usa, no una clase nueva. */}
                {verMedidas && (
                  <span style={{ display: 'block', fontSize: '9px', fontWeight: 500, opacity: 0.8 }}>
                    {formatearArea(areaKm2(anillo))}
                  </span>
                )}
              </Tooltip>
            )}
          </Polygon>
        )
      })}

      {/* Tercera pasada: los VÉRTICES del polígono bajo el mouse. Una sola zona a la vez y solo con la
          opción prendida, así que en el 99 % de los renders no se dibuja nada.
          Contesta una pregunta puntual y previa a editar: si el borde es una recta de cuatro puntos o
          una escalera de ochenta. Lo primero se corrige arrastrando; lo segundo se rehace. Son puntos
          INERTES —`interactive: false`— y no tiradores: mover un vértice se hace en modo edición, con su
          historial y su validación de holgura detrás. Un punto arrastrable acá sería una segunda forma de
          editar el contorno, sin nada de eso. */}
      {verVertices &&
        activo &&
        zonaHover &&
        (anillos.get(zonaHover.id) ?? []).map((punto, i) => (
          <CircleMarker
            key={`vertice-${zonaHover.id}-${i}`}
            center={punto}
            radius={2.5}
            interactive={false}
            pathOptions={{
              // Borde blanco: los vértices caen sobre el relleno de su propia zona y sobre lo que haya
              // debajo, y sin el halo se pierden contra un satélite o contra una avenida.
              color: '#fff',
              weight: 1.5,
              fillColor: zonaHover.tipo === 'restringida' ? ROJO_RESTRINGIDA : AZUL,
              fillOpacity: 1,
            }}
          />
        ))}
    </Pane>
  )
}
