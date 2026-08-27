// El puente entre el módulo de devoluciones y el registro de rutas de este mockup.
//
// Lo único que las páginas necesitan y el shell no les da es el proveedor de queries. Por eso cada
// una se envuelve, en vez de tocar el root de la app — el resto del mockup no usa queries y no tiene
// por qué enterarse de que existen.
//
// El cliente es UNO solo a nivel de módulo y no uno por pantalla: la invalidación que dispara aprobar
// una devolución tiene que despertar al listado que quedó atrás, y con un cliente por pantalla cada
// una hablaría sola.
//
// EL ROL YA NO SE ELIGE ACÁ. Antes había una barra propia arriba de cada pantalla (`SelectorRol`);
// ahora vive en el perfil de la top bar del shell (`src/mockup/PerfilMenu.tsx`), que es donde
// cualquiera busca "con qué usuario estoy".
//
// TAMPOCO SE DA DE ALTA ACÁ. Las devoluciones las crea Ventas contra nuestro servicio
// (`returnsService.create`); de este lado empieza el workflow de aprobación o rechazo. Por eso el
// módulo son dos pantallas —la bandeja y la decisión— y no cinco.
import type { ComponentType } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { QueryClientProvider } from './lib/query-lite'
import { queryClient } from './lib/query-client'
import { ReturnsPage } from './features/returns/pages/returns-page'
import { ReturnViewPage } from './features/returns/pages/return-view-page'

function conContexto(Pagina: ComponentType): ComponentType {
  return function PantallaDeDevoluciones() {
    return (
      <QueryClientProvider client={queryClient}>
        {/* El `TooltipProvider` es seguro de más: las acciones bloqueadas cuelgan su motivo de un
            tooltip, y en el kit del que vino el módulo ese proveedor era obligatorio. Acá el resto
            de la app no monta ninguno, así que envolver el módulo cuesta una línea y cierra la duda. */}
        <TooltipProvider>
          <Pagina />
        </TooltipProvider>
      </QueryClientProvider>
    )
  }
}

export const DevolucionesListaScreen = conContexto(ReturnsPage)
/** Detalle y decisión (aprobar/rechazar) son la MISMA pantalla: ver ítems y decidir es un solo paso. */
export const DevolucionDetalleScreen = conContexto(ReturnViewPage)
