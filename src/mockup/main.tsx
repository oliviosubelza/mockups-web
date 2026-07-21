// Entry aislado para producir mockups en el navegador (y de ahí importarlos a Figma).
// No arranca el bootstrap del workbench: sin plugins, sin ext host.
import '@/index.css'
import 'leaflet/dist/leaflet.css'
// PRIMERO que cualquier módulo del workbench: sus stores persistidos leen window.electron al importarse.
import './electron-stub'
import { createRoot } from 'react-dom/client'
import {
  ClipboardCheck,
  Home,
  LayoutDashboard,
  MapPin,
  Package,
  Route as RouteIcon,
  Store,
  Truck,
} from 'lucide-react'
import { initI18n } from '@/core/i18n'
import { RouteRegistry } from '@/core/routing/route-registry'
import { useTabStore } from '@/core/tabs'
import { Mockup } from './Mockup'

// Sin initI18n, los componentes muestran las claves crudas (ej. "dataTable.perPage") en vez del texto.
await initI18n('es')

// El AppSidebar del mockup es el REAL: se alimenta del RouteRegistry, que en la app llenan los
// plugins al registrarse. Acá no hay plugins, así que le damos de comer rutas falsas — mismo
// árbol (secciones colapsables + items sueltos) que tendrá el producto.
RouteRegistry.register([
  { id: 'inicio', path: '/', label: 'Inicio', icon: Home, element: null, order: 0 },
  // { id: 'camiones', path: '/camiones', label: 'Camiones', icon: Truck, element: null, order: 1, group: 'Distribución' },
  // { id: 'canales', path: '/canales', label: 'Canales', icon: Store, element: null, order: 2, group: 'Distribución' },
  // { id: 'planificacion', path: '/planificacion', label: 'Planificación', icon: RouteIcon, element: null, order: 3, group: 'Distribución' },
  // { id: 'ordenes', path: '/ordenes', label: 'Órdenes de despacho', icon: ClipboardCheck, element: null, order: 4, group: 'Distribución' },
  { id: 'planificacion', path: '/planificacion', label: 'Planificación', icon: Truck, element: null, order: 1, separatorBefore: false },

  // { id: 'seguimiento', path: '/seguimiento', label: 'Seguimiento', icon: MapPin, element: null, order: 5, separatorBefore: true },
  // { id: 'inventario', path: '/inventario', label: 'Inventario', icon: Package, element: null, order: 6 },
])

// El resaltado del sidebar sigue al TAB enfocado (no al pathname), así que abrimos uno: sin esto
// ningún item se ve activo y el mockup miente sobre cómo se ve navegando.
useTabStore.setState({
  tabs: [
    {
      id: 'tab-camiones',
      routeId: 'camiones',
      path: '/camiones',
      title: 'Camiones',
      isPinned: false,
      isClosable: true,
      openedAt: Date.now(),
    },
  ],
  activeTabId: 'tab-camiones',
})

createRoot(document.getElementById('root')!).render(<Mockup />)
