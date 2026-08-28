// Recorridos por calles de las rutas del plan: pide el ruteo, cachea y expone estado de carga.
//
// Misma frontera que `use-mercados-mapa`: el componente que dibuja no sabe de fetch y este hook no sabe
// de Leaflet. Acá adentro vive lo único que el ruteo agrega de complejidad —cuándo pedir, cuándo NO
// volver a pedir, y qué mostrar mientras no llegó— que es justo lo que no puede vivir dentro de un
// `useMemo` del mapa.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchRutaPorCalles } from '../services/routing-osrm'
import type { LatLngTuple } from './geo/polyline'

/** Un recorrido a rutear: la ruta a la que pertenece y sus puntos EN ORDEN de visita. */
export interface TramoARutear {
  id: string
  puntos: LatLngTuple[]
}

export interface EstadoRutasCalles {
  /**
   * Recorrido por calles POR ID DE RUTA. Una ruta aparece acá solo cuando su recorrido ACTUAL ya está
   * ruteado: si le acabás de mover una parada, sale del mapa hasta que llegue el nuevo trazo. Es a
   * propósito —ver la nota de la firma— y el llamador cae al trazo recto mientras tanto.
   */
  porRuta: Map<string, LatLngTuple[]>
  /**
   * Falta geometría por resolver: hay tramos sin respuesta todavía. Es más amplio que "hay una petición
   * en vuelo" a propósito — vale desde el render en que aparece un tramo nuevo, antes de que el efecto
   * alcance a pedirlo. Quien dibuja lo usa para NO trazar una ruta que todavía no tiene su forma final.
   */
  cargando: boolean
  /**
   * Ids de los tramos que se pidieron y NO se pudieron rutear. Quien dibuja los tiene con trazo recto y
   * tiene que decirlo: ver la nota de `fallidos` en el hook.
   */
  fallidos: string[]
  /** Vuelve a pedir solo los fallidos. Lo que ya está ruteado no se vuelve a pedir. */
  reintentar: () => void
}

/**
 * Identidad del RECORRIDO, no de la ruta.
 *
 * Es la pieza central del hook y vale explicar por qué no basta con el id de la ruta. El recorrido de
 * "Ruta 3" cambia cada vez que se le suma, se le saca o se le reordena una parada, y cada una de esas
 * versiones es un ruteo distinto. Cacheando por id, mover una parada dejaría el trazo viejo pegado en
 * el mapa —el camino que el camión hacía ANTES— y nadie se enteraría de que no corresponde.
 *
 * Con la firma armada desde las coordenadas, un recorrido que ya se ruteó se dibuja al instante (volver
 * a un reparto anterior no vuelve a pedir nada) y uno que cambió simplemente todavía no está.
 */
const firmaDe = (tramo: TramoARutear) =>
  `${tramo.id}#${tramo.puntos.map(([lat, lng]) => `${lat.toFixed(4)},${lng.toFixed(4)}`).join(';')}`

/**
 * Tope del caché. Cada arrastre de parada crea una firma nueva, así que en una sesión larga de
 * reordenamiento esto crece sin techo. Al pasarse se vacía entero en vez de desalojar el más viejo: un
 * LRU acá sería precisión que nadie va a notar —lo único que cuesta un caché vacío es volver a pedir— y
 * a cambio habría que mantener el orden de uso de cada entrada.
 */
const TOPE_CACHE = 60

/**
 * Cuántos ruteos van a la vez.
 *
 * BAJÓ DE TRES A DOS, y es un cambio contra la medición, no contra la intuición. Cuando esto se escribió
 * un ruteo tardaba ~0,7 s y tres en paralelo era "educado". Medido de nuevo en agosto de 2026 contra el
 * demo público: una ruta de 22 paradas tarda **3,6 s sola y ~7,3 s cuando van tres juntas**. O sea que
 * el paralelismo no estaba ganando tiempo, estaba repartiendo el mismo cuello de botella en tres — y
 * empujando cada pedido contra el corte de la espera.
 *
 * Dos es el compromiso: sigue solapando la latencia de red y deja a cada pedido con margen de sobra
 * antes del timeout. Que el mapa tarde más en completarse NO es el problema que este hook resuelve —
 * mientras espera no dibuja nada incorrecto—; el problema es que un pedido se corte, porque ahí la
 * recta se queda para siempre.
 */
const CONCURRENCIA = 2

/**
 * Recorridos por calles de los tramos dados.
 *
 * `activo` en `false` no pide nada: el trazo se puede apagar desde Capas y antes de optimizar no hay
 * recorridos. Al apagarlo NO se limpia el caché, así volver a prenderlo es instantáneo.
 *
 * PIDE DE A TRES, no las seis de golpe ni una por vez. Empezó estrictamente en serie por no maltratar a
 * un servidor público, y el costo fue peor que el problema: cada ruteo tarda ~0,7 s, así que seis rutas
 * tardaban hasta nueve segundos y durante todo ese rato la mitad del mapa mostraba trazos RECTOS. Eso no
 * se lee como "todavía está cargando", se lee como "esto falló" — y así se reportó.
 *
 * Tres en paralelo baja la espera a ~2 s y sigue siendo educado. Pero la velocidad no es lo que cierra el
 * problema: lo cierra que el mapa NO DIBUJE una ruta hasta tener su forma definitiva (ver `dibujables` en
 * PlannerMapa) y que el spinner de Capas diga que falta algo. Atenuar la recta mientras esperaba fue un
 * intento intermedio y era peor: seguía mostrando una forma incorrecta, y encima animaba dos veces.
 */
export function useRutasPorCalles(tramos: TramoARutear[], activo = true): EstadoRutasCalles {
  const cache = useRef(new Map<string, LatLngTuple[]>())
  // Contador de versión: el caché vive en un ref (no queremos re-render por escribirlo) pero la lista
  // derivada sí tiene que recalcularse cuando entra un recorrido nuevo.
  const [version, setVersion] = useState(0)
  /**
   * Contador de REINTENTOS, y está separado de `version` por una razón concreta: `version` NO es
   * dependencia del efecto (si lo fuera, cada respuesta que entra al caché lo volvería a disparar).
   * Reintentar tiene que volver a correr el efecto, así que necesita su propia dependencia.
   */
  const [intento, setIntento] = useState(0)

  const firmas = useMemo(() => tramos.map(firmaDe), [tramos])
  // Clave PRIMITIVA: `tramos` llega como array nuevo en cada render del mapa (zoom, selección, hover) y
  // usarlo de dependencia dispararía un ruteo por render.
  const clave = firmas.join('|')

  // Los tramos que el efecto necesita, por ref: la dependencia real es `clave`, y listar `tramos`
  // volvería a atar el efecto a la identidad del array.
  const actuales = useRef<TramoARutear[]>(tramos)
  actuales.current = tramos

  useEffect(() => {
    if (!activo) return
    const pendientes = actuales.current.filter((t) => !cache.current.has(firmaDe(t)))
    if (pendientes.length === 0) return

    const ctrl = new AbortController()
    let vivo = true

    void (async () => {
      for (let i = 0; i < pendientes.length; i += CONCURRENCIA) {
        if (!vivo) return
        const grupo = pendientes.slice(i, i + CONCURRENCIA)
        try {
          const resueltos = await Promise.all(
            grupo.map((tramo) => fetchRutaPorCalles(tramo.puntos, ctrl.signal)),
          )
          if (!vivo) return
          if (cache.current.size > TOPE_CACHE) cache.current.clear()
          // `null` (no se pudo rutear) se cachea COMO recorrido vacío, y eso es deliberado: sin
          // registrarlo, cada render volvería a pedir el mismo tramo que ya falló y el mapa quedaría
          // martillando el servidor. Vacío significa "ya preguntamos, no hay": el llamador no lo
          // encuentra en `porRuta` y sigue con el trazo recto.
          grupo.forEach((tramo, j) => cache.current.set(firmaDe(tramo), resueltos[j]?.path ?? []))
          setVersion((v) => v + 1)
        } catch {
          // Cancelado (desmontaje o cambio de recorrido): no se cachea nada — la próxima vez que estos
          // tramos hagan falta, se vuelven a pedir.
          return
        }
      }
    })()

    return () => {
      vivo = false
      ctrl.abort()
    }
  }, [clave, activo, intento])

  /**
   * `cargando` se DERIVA del caché en el render, no vive en un `useState`.
   *
   * Con un estado había un hueco de un frame que se veía: `optimizado` pasa a true y el mapa se pinta
   * ANTES de que el efecto corra el `setCargando(true)`, así que en ese primer cuadro no había geometría
   * ruteada y tampoco constaba que estuviera en camino — o sea, se dibujaban las rectas y arrancaba su
   * animación de trazado, justo lo que el filtro del mapa venía a evitar. Derivado, "falta ruteo" es
   * verdadero desde el mismo render en que aparece un tramo nuevo.
   *
   * Un tramo que NO se pudo rutear no cuenta como pendiente: su fallo quedó registrado en el caché como
   * recorrido vacío, así que `has` es verdadero y el mapa sabe que puede dejar de esperarlo.
   */
  const cargando = useMemo(
    () => activo && firmas.some((f) => !cache.current.has(f)),
    // Igual que `porRuta`: `version` está acá porque el caché es un ref y mutarlo no re-renderiza.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clave, activo, version],
  )

  const porRuta = useMemo(() => {
    const out = new Map<string, LatLngTuple[]>()
    tramos.forEach((tramo, i) => {
      const path = cache.current.get(firmas[i])
      // Los vacíos NO entran: son el "ya preguntamos y no hay" del caché, y meterlos dejaría al mapa
      // dibujando una polilínea sin vértices en vez de cayendo al trazo recto.
      if (path && path.length >= 2) out.set(tramo.id, path)
    })
    return out
    // `version` está en las dependencias justamente porque el caché es un ref y mutarlo no re-renderiza.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, version])

  /**
   * Los tramos que YA se preguntaron y no se pudieron rutear: en el caché quedaron como recorrido vacío.
   *
   * ES LO QUE FALTABA. El fallo estaba manejado —el mapa cae al trazo recto y el plan se sigue leyendo—
   * pero era INVISIBLE: una recta dibujada por un servidor caído se ve exactamente igual que un
   * recorrido bueno, y quien mira la pantalla no tiene forma de saber que lo que está viendo no es el
   * camino que el camión va a hacer. Un fallback silencioso no es un fallback, es un dato falso.
   */
  const fallidos = useMemo(() => {
    const out: string[] = []
    tramos.forEach((tramo, i) => {
      const path = cache.current.get(firmas[i])
      if (path && path.length < 2) out.push(tramo.id)
    })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, version])

  /**
   * Vuelve a pedir SOLO lo que falló.
   *
   * Borra del caché las firmas fallidas —que es lo que las hacía "ya preguntamos, no hay"— y empuja
   * `intento`, que es lo que vuelve a disparar el efecto. Lo que sí se ruteó no se toca: reintentar
   * después de un corte de red no tiene por qué costar de nuevo las rutas que sí salieron.
   */
  const reintentar = useCallback(() => {
    let hubo = false
    for (const [firma, path] of cache.current) {
      if (path.length >= 2) continue
      cache.current.delete(firma)
      hubo = true
    }
    if (!hubo) return
    setIntento((n) => n + 1)
    setVersion((v) => v + 1)
  }, [])

  return { porRuta, cargando, fallidos, reintentar }
}
