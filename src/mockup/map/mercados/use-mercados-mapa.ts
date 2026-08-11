// Datos de la capa de mercados: pide el endpoint (hoy simulado), adapta y expone estado de carga.
//
// El componente que dibuja no sabe de fetch y este hook no sabe de Leaflet. Esa frontera es la que
// permite cambiar el mock por el endpoint real sin abrir ningún .tsx.
import { useEffect, useMemo, useState } from 'react'
import { useDispatchPlanStore } from '../../dispatch-plan-store'
import { cityIdDe, type CiudadId, type Parada } from '../../mock-data'
import { fetchMercadosMapa } from '../../services/planning-markets'
import { aMercadosMapa, type MercadoMapa } from './mercado-mapa'

export interface EstadoMercados {
  mercados: MercadoMapa[]
  /** Hay una petición en vuelo. La pantalla muestra un indicador discreto, no un bloqueo. */
  cargando: boolean
  /** Mensaje listo para mostrar, o `null`. Un fallo acá no rompe el mapa: se queda sin polígonos. */
  error: string | null
}

/**
 * Mercados de las ciudades dadas.
 *
 * Recibe VARIOS `cityId` porque el filtro de Ciudad del planificador es multi-select y el endpoint es
 * de una ciudad por llamada: se pide una por una y se junta el resultado. Con la lista vacía no pide
 * nada — sin ciudad no hay mercados que mostrar.
 *
 * `activo` corta la petición cuando la capa está apagada (el mapa de monitoreo arranca así): pedir
 * datos que nadie va a ver es gasto puro. Al apagarla NO se limpia lo ya cargado, así volver a
 * prenderla es instantáneo.
 */
export function useMercadosMapa(cityIds: number[], activo = true): EstadoMercados {
  const [mercados, setMercados] = useState<MercadoMapa[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Clave PRIMITIVA de las ciudades: `cityIds` llega como array nuevo en cada render del mapa, y usarlo
  // de dependencia dispararía un fetch por render.
  const clave = cityIds.join(',')

  useEffect(() => {
    if (!activo) return
    const ids = clave === '' ? [] : clave.split(',').map(Number)
    if (ids.length === 0) {
      setMercados([])
      setCargando(false)
      setError(null)
      return
    }

    const ctrl = new AbortController()
    setCargando(true)
    setError(null)

    Promise.all(ids.map((id) => fetchMercadosMapa(id, ctrl.signal)))
      .then((respuestas) => {
        setMercados(aMercadosMapa(respuestas.flatMap((r) => r.data)))
        setCargando(false)
      })
      .catch(() => {
        // Cancelado (desmontaje o cambio de ciudad): no es un error del usuario, no se muestra nada.
        if (ctrl.signal.aborted) return
        setMercados([])
        setError('No se pudieron cargar los mercados')
        setCargando(false)
      })

    return () => ctrl.abort()
  }, [clave, activo])

  return { mercados, cargando, error }
}

/**
 * Los `cityId` que aplican al mapa que se está mirando.
 *
 * Manda el filtro de Ciudad del plan de despacho: si el usuario eligió ciudades, esas son. Si no eligió
 * ninguna (el filtro vacío significa "todas"), se DERIVA la ciudad de los pedidos que el mapa está
 * mostrando — así el mapa siempre habla de la ciudad que se ve, sin obligar a pasar por el filtro. Se
 * toma la ciudad con más paradas y no todas: con las cinco a la vez, los polígonos de las provincias
 * quedan a 100 km del cuadro y solo ensucian el encuadre.
 *
 * `fallback` es para las pantallas que no tienen paradas de dónde derivar (el monitoreo tiene entregas,
 * no pedidos). `null` cuando no hay nada: ahí no se pide ni se dibuja.
 */
export function useCityIdsDelMapa(paradas: Parada[], fallback?: CiudadId): number[] {
  const activeCiudades = useDispatchPlanStore((s) => s.activeCiudades)

  return useMemo(() => {
    if (activeCiudades.length > 0) return activeCiudades.map(cityIdDe)

    const conteo = new Map<CiudadId, number>()
    for (const parada of paradas) {
      for (const pedido of parada.pedidos) {
        conteo.set(pedido.ciudad, (conteo.get(pedido.ciudad) ?? 0) + 1)
      }
    }
    const dominante = [...conteo.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback
    return dominante ? [cityIdDe(dominante)] : []
  }, [activeCiudades, paradas, fallback])
}
