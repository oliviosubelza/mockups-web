// Encuadre del mapa respetando los paneles que lo tapan.
//
// Vive suelto porque lo usan TRES lugares con la misma regla y ninguno debería reimplementarla: el
// encuadre automático al abrir un viaje, el centrado al elegir una parada, y los botones de la barra
// de herramientas. Si cada uno llamara a `fitBounds` por su cuenta, el primero que se olvide del
// padding manda el punto debajo de un panel y nadie entiende por qué "a veces" no se ve.
import L from 'leaflet'
import type { LatLngTuple } from './geo/polyline'

/** Respiro vertical mínimo: lo que pide la barra de herramientas de arriba. */
const MARGEN_VERTICAL = 32

/**
 * Duración del vuelo, en segundos.
 *
 * Todo encuadre es ANIMADO a propósito. Con un salto instantáneo el mapa aparece en otro lugar y hay
 * que reconstruir mentalmente dónde quedó lo que estabas mirando; con el vuelo, el recorrido se VE y
 * la relación entre el punto anterior y el nuevo se mantiene sola. Leaflet además hace un arco —
 * aleja, se traslada y vuelve a acercar — que en distancias largas es justo lo que hace entendible el
 * salto de una punta de la ciudad a la otra.
 *
 * 0.9 s es el compromiso: alcanza para leer el movimiento y no se siente lento al apretar un botón
 * dos veces seguidas.
 */
const DURACION_S = 0.9

export interface MargenesMapa {
  /** Ancho (px) que le tapa el panel izquierdo. */
  margenIzq: number
  /** Ancho (px) que le tapa el panel derecho. */
  margenDer: number
  /**
   * Alto (px) que le tapa un panel apoyado ABAJO. Opcional: la mayoría de las pantallas no tiene uno.
   *
   * Existe porque los márgenes laterales por sí solos dejaban de alcanzar: un panel al pie mide alto,
   * no ancho, y sin declararlo el encuadre manda paradas justo abajo de él. Es el mismo problema que
   * ya resolvían `margenIzq`/`margenDer`, en el otro eje.
   */
  margenAbajo?: number
}

/**
 * Encuadra el mapa sobre `puntos`, dejando libre el ancho que ocupan los paneles.
 *
 * Con UN solo punto funciona como "centrar acá": el bounding box degenerado hace que `fitBounds`
 * acerque hasta `zoomMax`, y el padding asimétrico corre el centro para que el punto caiga en la zona
 * VISIBLE del mapa y no detrás de un panel. Es el mismo mecanismo para centrar y para encuadrar, que
 * es justo lo que evita que las dos operaciones se desincronicen.
 */
export function encuadrar(
  map: L.Map,
  puntos: LatLngTuple[],
  {
    margenIzq,
    margenDer,
    margenAbajo = 0,
    zoomMax = 15,
    /** `false` solo para el primer encuadre, si algún día se quiere entrar ya posicionado. */
    animado = true,
  }: MargenesMapa & { zoomMax?: number; animado?: boolean },
): void {
  if (puntos.length === 0) return

  const bounds = L.latLngBounds(puntos)
  const opciones = {
    paddingTopLeft: [margenIzq, MARGEN_VERTICAL] as [number, number],
    // El panel de abajo se suma al respiro, no lo reemplaza: sin los 32 px el punto quedaría pegado
    // al borde superior del panel, técnicamente visible y de hecho ilegible.
    paddingBottomRight: [margenDer, MARGEN_VERTICAL + margenAbajo] as [number, number],
    // Sin tope, un solo punto (o un viaje de una parada) entra hasta el nivel de manzana y se pierde
    // toda referencia de dónde está.
    maxZoom: zoomMax,
  }

  // `flyToBounds` y no `fitBounds`: el segundo TELEPORTA. Es la misma cuenta de encuadre, la
  // diferencia está solo en si el trayecto se ve o no.
  if (animado) map.flyToBounds(bounds, { ...opciones, duration: DURACION_S })
  else map.fitBounds(bounds, opciones)
}
