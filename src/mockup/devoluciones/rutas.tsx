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
import { RefundReasonsPage } from './features/refund-reasons/pages/refund-reasons-page'
import { RefundReasonFormPage } from './features/refund-reasons/pages/refund-reason-form-page'
import { RefundMotiveParamsPage } from './features/refund-motive-params/pages/refund-motive-params-page'
import { RefundMotiveParamFormPage } from './features/refund-motive-params/pages/refund-motive-param-form-page'

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

// DATO MAESTRO del módulo: el catálogo de MOTIVOS (`refund_reasons`). No es parte del workflow de una
// devolución —se configura una vez y lo usan todas—, pero vive acá porque la tabla es del módulo y el
// catálogo sembrado sale de las constantes que ya usa el formulario del vendedor.
//
// Pasan por `conContexto` como las otras dos aunque no usen el kit de queries (leen un store de
// zustand): un solo lugar donde se envuelven las pantallas del módulo vale más que la línea que se
// ahorra, y el día que el catálogo pase a un servicio no hay que acordarse de esto.
export const MotivosDevolucionScreen = conContexto(RefundReasonsPage)
/** Alta y edición son la MISMA pantalla: el `id` del path decide el modo. */
export const MotivoDevolucionFormScreen = conContexto(RefundReasonFormPage)

// EL OTRO DATO MAESTRO: los PARÁMETROS de cada motivo. El motivo dice QUÉ es una devolución; el
// parámetro dice desde cuándo, hasta cuándo y sobre qué se puede usar. Son dos pantallas y no una
// porque son dos preguntas: el catálogo se define una vez, y sobre un mismo motivo se dan de alta
// muchas ventanas de vigencia.
export const ParametrosMotivoDevolucionScreen = conContexto(RefundMotiveParamsPage)
/** Alta y edición son la MISMA pantalla, como en motivos: el `id` del path decide el modo. */
export const ParametroMotivoDevolucionFormScreen = conContexto(RefundMotiveParamFormPage)
