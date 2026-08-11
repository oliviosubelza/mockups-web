// Encuadra el mapa sobre los pedidos MÁS los mercados visibles.
//
// CUÁNDO encuadra: solo cuando cambia el CONJUNTO de mercados dibujados — o sea cuando llegan los datos,
// cuando se prende la capa o cuando se cambia de ciudad. Deliberadamente NO reacciona a los pedidos: los
// filtros del mapa (canal, tipo, ruta) cambian el conjunto de paradas todo el tiempo, y re-encuadrar en
// cada uno le arrancaría la vista de las manos al usuario mientras filtra.
import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import type { Parada } from '../../mock-data'
import { encuadrar } from '../encuadrar'
import type { LatLngTuple } from '../geo/polyline'
import { puntosDeMercados, type MercadoMapa } from './mercado-mapa'

/** Respiro para que ni la toolbar (izquierda) ni el control de capas se coman un pin del borde. */
const MARGEN_PX = 48

export function EncuadrarConMercados({
  paradas,
  mercados,
  /** `false` = la capa está apagada: no hay mercados que incluir y el mapa no se toca. */
  activo,
}: {
  paradas: Parada[]
  mercados: MercadoMapa[]
  activo: boolean
}) {
  const map = useMap()

  // Los dos conjuntos se leen por ref: si entraran como dependencias, cualquier re-render con arrays
  // nuevos volvería a encuadrar. La dependencia real es la CLAVE de los mercados, nada más.
  const datos = useRef({ paradas, mercados })
  datos.current = { paradas, mercados }

  const clave = activo ? mercados.map((m) => m.id).join(',') : ''

  useEffect(() => {
    if (clave === '') return
    const { paradas: visibles, mercados: dibujados } = datos.current
    const puntos: LatLngTuple[] = [
      ...visibles.map((p): LatLngTuple => [p.lat, p.lng]),
      ...puntosDeMercados(dibujados),
    ]
    encuadrar(map, puntos, { margenIzq: MARGEN_PX, margenDer: MARGEN_PX, zoomMax: 14 })
  }, [clave, map])

  return null
}
