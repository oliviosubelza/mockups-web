// Entry aislado para producir mockups en el navegador (y de ahí importarlos a Figma).
// No arranca el bootstrap del workbench: sin plugins, sin ext host.
import '@/index.css'
import 'leaflet/dist/leaflet.css'
// PRIMERO que cualquier módulo del workbench: sus stores persistidos leen window.electron al importarse.
import './electron-stub'
import { createRoot } from 'react-dom/client'
import { initI18n } from '@/core/i18n'
import { Mockup } from './Mockup'
import { registerMockRoutes } from './routes'

// Sin initI18n, los componentes muestran las claves crudas (ej. "dataTable.perPage") en vez del texto.
await initI18n('es')

// El AppSidebar del mockup es el REAL: se alimenta del RouteRegistry. Registramos la navegación
// declarada como dato en `routes.tsx` (mismo patrón que mockup-native) y dejamos abierta la ruta de
// entrada (Planificaciones). El sidebar navega abriendo tabs; el shell pinta la ruta activa.
registerMockRoutes('planificaciones')

createRoot(document.getElementById('root')!).render(<Mockup />)
