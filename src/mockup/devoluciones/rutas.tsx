// El puente entre el módulo de devoluciones —copiado de `mockups_sales`— y el registro de rutas de
// este mockup.
//
// Las páginas llegaron intactas: usan `useNavigate`/`useParams` de react-router y sus hooks de datos,
// que son los mismos de allá. Lo único que les falta acá es el contexto que en el otro proyecto vivía
// en el `main.tsx`: el proveedor de queries. Por eso cada página se envuelve, en vez de tocar el root
// de esta app — el resto del mockup no usa queries y no tiene por qué enterarse de que existen.
//
// El cliente es UNO solo a nivel de módulo y no uno por pantalla: la invalidación que dispara aprobar
// una devolución tiene que despertar al listado que quedó atrás, y con un cliente por pantalla cada
// una hablaría sola.
import type { ComponentType } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SelectorRol } from './SelectorRol'
import { QueryClientProvider } from './lib/query-lite'
import { queryClient } from './lib/query-client'
import { ReturnsPage } from './features/returns/pages/returns-page'
import { ReturnFormPage } from './features/returns/pages/return-form-page'
import { ReturnViewPage } from './features/returns/pages/return-view-page'
import { ApprovalsPage } from './features/returns/pages/approvals-page'
import { ReturnApprovalPage } from './features/returns/pages/return-approval-page'

/**
 * Todo lo que las páginas esperaban del `main.tsx` de Ventas y este mockup no les da: el proveedor de
 * queries y el rol con el que se está mirando.
 *
 * El selector va ARRIBA de la página y no adentro para que las seis pantallas lo tengan sin tocar
 * ninguna: el rol decide qué muestra cada una, así que cambiarlo tiene que poder hacerse desde
 * cualquiera y sin volver al listado.
 */
function conContexto(Pagina: ComponentType): ComponentType {
  return function PantallaDeDevoluciones() {
    return (
      <QueryClientProvider client={queryClient}>
        {/* El `TooltipProvider` es seguro de más: la escalera de niveles cuelga sus nombres de
            tooltips, y en el kit del que vino el módulo ese proveedor era obligatorio. Acá el resto de
            la app no monta ninguno, así que envolver el módulo cuesta una línea y cierra la duda. */}
        <TooltipProvider>
          <div className="flex min-h-0 flex-1 flex-col">
            <SelectorRol />
            <div className="min-h-0 flex-1 overflow-auto">
              <Pagina />
            </div>
          </div>
        </TooltipProvider>
      </QueryClientProvider>
    )
  }
}

export const DevolucionesListaScreen = conContexto(ReturnsPage)
export const DevolucionesAprobacionesScreen = conContexto(ApprovalsPage)
/** Alta y edición son la MISMA página: distingue por el `:id` del path, como en el original. */
export const DevolucionFormScreen = conContexto(ReturnFormPage)
export const DevolucionDetalleScreen = conContexto(ReturnViewPage)
export const DevolucionAprobarScreen = conContexto(ReturnApprovalPage)
