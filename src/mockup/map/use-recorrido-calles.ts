// UN recorrido con hitos, ruteado por calles y partido por esos hitos.
//
// Es la capa que le faltaba entre `useRutasPorCalles` —que devuelve una tira de vértices por ruta— y
// una pantalla que necesita saber QUÉ PEDAZO de esa tira corresponde a cada tramo entre paradas. La
// planificación no necesitaba esa correspondencia (dibuja el recorrido entero de un color y listo);
// el monitoreo no puede vivir sin ella, porque parte el trazo en "hecho / falta" y mueve un camión
// por dentro de un tramo puntual.
//
// Vive en `map/` y no en `monitoreo/` a propósito: no sabe de viajes ni de entregas, solo de puntos.
import { useMemo } from 'react'
import { partirPorHitos } from './geo/recorrido'
import { useRutasPorCalles } from './use-rutas-calles'
import type { LatLngTuple } from './geo/polyline'

export interface RecorridoCalles {
  /**
   * Un tramo por hito consecutivo: `tramos[i]` es cómo se maneja de `hitos[i]` a `hitos[i + 1]`.
   *
   * `null` significa "todavía no hay geometría de calles": puede ser que esté en camino, que el ruteo
   * haya fallado o que el recorrido no dé para partirlo. Los tres casos se resuelven igual —quien
   * llama usa los segmentos rectos— y por eso son UN solo valor y no tres estados. Lo que distingue
   * "esperando" de "no hay" es `cargando`, que solo sirve para mostrarlo, nunca para decidir qué dibujar.
   */
  tramos: LatLngTuple[][] | null
  cargando: boolean
}

/** Recorrido por calles de `hitos`, en ese orden. `activo` en `false` no pide nada. */
export function useRecorridoCalles(
  id: string | number | null,
  hitos: LatLngTuple[],
  activo = true,
): RecorridoCalles {
  // Clave primitiva por el mismo motivo que dentro de `useRutasPorCalles`: `hitos` puede llegar como
  // array nuevo en cada render y usarlo de dependencia dispararía un ruteo por render.
  const clave = useMemo(() => hitos.map(([lat, lng]) => `${lat},${lng}`).join('|'), [hitos])

  const tramoUnico = useMemo(
    () => (id === null || hitos.length < 2 ? [] : [{ id: String(id), puntos: hitos }]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, clave],
  )

  const { porRuta, cargando } = useRutasPorCalles(tramoUnico, activo)
  const path = id === null ? undefined : porRuta.get(String(id))

  const tramos = useMemo(
    () => (path && path.length >= 2 ? partirPorHitos(path, hitos) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, clave],
  )

  return { tramos, cargando }
}
