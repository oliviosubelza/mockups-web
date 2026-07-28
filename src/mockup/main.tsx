// Entry de la app web. Antes producía solo mockups para importar a Figma; ahora además navega como
// una web normal (URLs reales, deep links, back/forward, F5 que NO te devuelve al inicio).
// No arranca el bootstrap del workbench: sin plugins, sin ext host.
import '@/index.css'
import 'leaflet/dist/leaflet.css'
// PRIMERO que cualquier módulo del workbench: sus stores persistidos leen window.electron al importarse.
import './electron-stub'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { initI18n } from '@/core/i18n'
import { RouterBridge } from '@/core/routing/RouterBridge'
import { setStickySearchParams } from '@/core/routing/sticky-search'
import { Mockup } from './Mockup'
import { ENTRY_ROUTE_PATH, registerMockRoutes } from './routes'
import { seedViewModeFromUrl } from './view-mode-store'

// Sin initI18n, los componentes muestran las claves crudas (ej. "dataTable.perPage") en vez del texto.
await initI18n('es')

// El RouteRegistry es el punto de inyección de la navegación: el AppSidebar (que es el REAL) y el
// resolvedor de ruta activa leen de ahí. Registrar NO navega — la URL decide qué se ve.
registerMockRoutes()

// Knobs GLOBALES de vista: sobreviven un `openRoute()`. Son los parámetros de captura del tablero
// de Figma, no filtros de una pantalla, así que cambiar de ruta no debe perderlos.
setStickySearchParams(['theme', 'board', 'state', 'w', 'h'])

// Los dos toques al history van ANTES de montar el router: hacerlos después lo desincronizaría.
// 1) `?view=web|mockup` fija el modo y se saca de la URL (semilla de un solo uso).
seedViewModeFromUrl()

// 2) `/` no es una ruta registrada → se reescribe al destino de entrada. `replaceState` y no push:
// el back no debe volver a un `/` vacío. Se preserva el querystring (knobs del tablero).
if (window.location.pathname === '/') {
  window.history.replaceState(null, '', `${ENTRY_ROUTE_PATH}${window.location.search}`)
}

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <RouterBridge />
    <Mockup />
  </BrowserRouter>
)
