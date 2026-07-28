import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { LocationMirror } from './location-mirror'
import { routerRef } from './router-ref'

/**
 * Puente entre el router y los consumidores imperativos. Se monta UNA vez, dentro del router:
 *
 *  - publica el `navigate` en `routerRef` → `openRoute()` puede navegar desde fuera de React
 *    (stores, comandos, SDK), que es lo que hace el sidebar y los botones de las vistas;
 *  - refleja el pathname en `LocationMirror` para los consumidores no-React.
 *
 * No renderiza nada: es solo cableado.
 */
export function RouterBridge() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => {
    routerRef.set(navigate)
  }, [navigate])

  useEffect(() => {
    LocationMirror.set(pathname)
  }, [pathname])

  return null
}
