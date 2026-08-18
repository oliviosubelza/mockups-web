// Servicio de RUTEO POR CALLES: convierte una lista de paradas en el recorrido real que haría un
// vehículo entre ellas.
//
//   GET https://router.project-osrm.org/route/v1/driving/{lng,lat};{lng,lat};…
//
// POR QUÉ EXISTE. El mapa dibujaba el recorrido como segmentos rectos de parada a parada, y eso no es
// un recorrido: es un diagrama de adyacencia. Se lee mal en dos sentidos —cruza manzanas, ríos y el
// aeropuerto, y sugiere distancias que ningún camión va a manejar— y sobre todo no comunica la única
// cosa que la pantalla está afirmando, que es que ese orden de visita se puede recorrer.
//
// A DIFERENCIA DE `planning-markets`, ESTE SERVICIO NO ESTÁ SIMULADO: pega de verdad contra el servidor
// público de demostración de OSRM (Open Source Routing Machine) sobre datos de OpenStreetMap. No pide
// clave y manda `access-control-allow-origin: *`, así que funciona desde el navegador sin proxy.
//
// LO QUE ESO IMPLICA, dicho explícito porque es lo que hay que revisar antes de producción:
//   · Es un servidor de DEMOSTRACIÓN. Sus dueños piden uso razonable y no da ninguna garantía de
//     disponibilidad ni de latencia. Para producción va un OSRM propio (es un contenedor y un extracto
//     de OSM de Bolivia) o el motor que ya se use del lado del backend — este archivo es el único que
//     habría que tocar, porque nadie más sabe de dónde sale la geometría.
//   · Puede fallar, tardar o estar bloqueado por la red de la empresa. `null` es una respuesta VÁLIDA
//     y esperada; quien llama se queda con el trazo recto, que es lo que se veía hasta ahora. Un
//     recorrido que no se pudo rutear no puede dejar el mapa sin líneas.
//
// La geometría llega en `polyline6` porque es el formato nativo de OSRM: la misma codificación de
// Google pero con 6 decimales de precisión en vez de 5. `decodePolyline` ya lo soportaba.
import { decodePolyline, type LatLngTuple } from '../map/geo/polyline'

/** Base del endpoint. Vive acá para que nadie la escriba de nuevo como string suelto. */
export const OSRM_DRIVING_URL = 'https://router.project-osrm.org/route/v1/driving'

/**
 * `full` y NO `simplified`.
 *
 * Empezó en `simplified` para ahorrar vértices y estuvo mal: la simplificación de OSRM se calcula UNA
 * vez, del lado del servidor, con una tolerancia pensada para una vista de conjunto. A zoom de calle
 * eso se ve —y se vio—: las rotondas quedaban dibujadas como hexágonos y las curvas como cuerdas que
 * cortan la esquina por dentro de la manzana. El recorrido era correcto y el dibujo mentía.
 *
 * El ahorro además era imaginario. Lo que asustaba eran 41 KB de geometría, pero eso salió de medir una
 * ruta de prueba de 350 km entre puntos al azar; una ruta urbana de verdad —9 paradas, 43 km— son 5,5 KB
 * y ~700 vértices, y las seis rutas del plan juntas no llegan a 4.500.
 *
 * Y lo importante: SIMPLIFICAR NO ES TRABAJO DEL SERVICIO. Leaflet ya simplifica cada polilínea en cada
 * zoom (`smoothFactor`, Douglas-Peucker en coordenadas de pantalla), que es lo mismo pero hecho donde se
 * puede hacer bien — sabiendo cuántos píxeles mide un metro en ese momento. Pre-simplificar era hacer
 * ese trabajo antes, peor y de forma irreversible: el detalle que el servidor tira no se puede recuperar
 * al acercarse.
 */
const OVERVIEW = 'full'

/** Precisión de `polyline6`. Con la de Google (5) el recorrido sale desplazado y diez veces más chico. */
const PRECISION_OSRM = 6

/** Corte de la espera. Sin esto una ruta que nunca contesta deja el trazo recto sin decir por qué. */
const TIMEOUT_MS = 12_000

export interface RutaPorCalles {
  /** Vértices del recorrido, listos para Leaflet ([lat, lng]). */
  path: LatLngTuple[]
  /** Distancia real por calles, en metros. */
  metros: number
  /** Tiempo de manejo estimado por el motor, en segundos. Sin paradas ni descargas. */
  segundos: number
}

interface OsrmRuta {
  geometry?: unknown
  distance?: unknown
  duration?: unknown
}

interface OsrmRespuesta {
  code?: unknown
  routes?: OsrmRuta[]
}

/**
 * Recorrido por calles que pasa por `puntos` EN ESE ORDEN.
 *
 * No reordena nada: el orden de visita ya lo decidió el planificador (`resecuenciar`, el arrastre del
 * panel de Rutas o el optimizador). Acá se pregunta "¿cómo se maneja de acá hasta acá?", no "¿en qué
 * orden conviene?". Son dos problemas distintos y mezclarlos haría que rutear cambiara el plan.
 *
 * Devuelve `null` —nunca lanza— cuando no se pudo rutear: menos de dos puntos, red caída, servidor
 * ocupado, respuesta con `code != 'Ok'`. La única excepción que sí propaga es el `AbortError` de la
 * cancelación, porque eso no es un fallo del ruteo sino que a quien preguntaba ya no le interesa.
 */
export async function fetchRutaPorCalles(
  puntos: LatLngTuple[],
  signal?: AbortSignal,
): Promise<RutaPorCalles | null> {
  if (puntos.length < 2) return null

  // INVERSIÓN lat/lng: OSRM habla el orden de GeoJSON (`lng,lat`) y Leaflet el inverso. Es el mismo
  // error clásico que documenta el adaptador de mercados —el recorrido aparece en el océano Índico— y
  // por eso la inversión pasa UNA sola vez, acá.
  // Cuatro decimales alcanzan: son ~11 m, más fino que el ancho de la calle a la que el motor va a
  // enganchar el punto igual, y mantiene la URL corta con 47 coordenadas.
  const coords = puntos.map(([lat, lng]) => `${lng.toFixed(4)},${lat.toFixed(4)}`).join(';')
  const url = `${OSRM_DRIVING_URL}/${coords}?overview=${OVERVIEW}&geometries=polyline${PRECISION_OSRM}`

  // Dos motivos de aborto en el mismo `signal`: el del llamador (desmontar, cambiar de plan) y el del
  // timeout. `AbortSignal.any` los une sin tener que manejar dos controladores en el hook.
  const porTiempo = AbortSignal.timeout(TIMEOUT_MS)
  const combinado = signal ? AbortSignal.any([signal, porTiempo]) : porTiempo

  let cuerpo: OsrmRespuesta
  try {
    const res = await fetch(url, { signal: combinado })
    if (!res.ok) return null
    cuerpo = (await res.json()) as OsrmRespuesta
  } catch (e) {
    // El aborto del LLAMADOR se propaga (no es un fallo de ruteo); el del timeout se traga y cae al
    // trazo recto, que es lo mismo que hace cualquier otro fallo del servidor.
    if (signal?.aborted) throw e
    return null
  }

  if (cuerpo.code !== 'Ok') return null
  const ruta = cuerpo.routes?.[0]
  if (!ruta || typeof ruta.geometry !== 'string') return null

  const path = decodePolyline(ruta.geometry, PRECISION_OSRM)
  // Una geometría de menos de dos vértices no dibuja nada: mejor que el llamador use el trazo recto.
  if (path.length < 2) return null

  return {
    path,
    metros: typeof ruta.distance === 'number' ? ruta.distance : 0,
    segundos: typeof ruta.duration === 'number' ? ruta.duration : 0,
  }
}
