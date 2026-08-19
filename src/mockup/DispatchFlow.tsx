// DEPRECADO — ver el @deprecated de `DispatchFlow` más abajo.
//
// Flujo de despacho: los Steps arriba y, debajo, la vista de la fase activa. Cada fase muestra lo
// que necesita y NADA más — camiones + pedidos = flota y canales en un solo paso, traslados =
// selección, planificación = mapa y paradas, órdenes = una tarjeta por camión.
import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Steps } from '@/components/ui/steps'
import { FASES } from './mock-data'
import type { BoardState, Fase, PlanningTab } from './types'
import { OrdersView } from './views/OrdersView'
import { PlanningView } from './views/PlanningView'
import { TrucksAndOrdersView } from './views/TrucksAndOrdersView'

/**
 * @deprecated El flujo por steps se retiró. La planificación se arma entera sobre el mapa
 * (`planificacion-mapa-editor` → `PlannerView`). Ninguna ruta lo navega: sobrevive solo para los
 * tableros de mockup que se arman con una `fase` explícita (`Mockup.tsx`). No agregar features acá.
 */
export function DispatchFlow({
  state,
  initialFase,
  planningTab = 'mapa',
}: {
  state: BoardState
  initialFase: Fase
  planningTab?: PlanningTab
}) {
  const [fase, setFase] = useState<Fase>(initialFase)

  // Step 2 "Traslados" retirado del wizard: los traslados viven como sub-paso dentro del Step 1.
  // Fases: 0 = camiones + pedidos, 1 = planificación, 2 = órdenes.
  return (
    <div className="flex h-full min-w-0 flex-col gap-4">
      <Card className="shrink-0 px-4 py-2">
        <Steps steps={FASES} current={fase} onStepClick={(i) => setFase(i as Fase)} />
      </Card>

      {fase === 0 && <TrucksAndOrdersView state={state} onNext={() => setFase(1)} />}
      {fase === 1 && (
        <PlanningView state={state} initialTab={planningTab} onNext={() => setFase(2)} />
      )}
      {fase === 2 && <OrdersView state={state} />}
    </div>
  )
}
