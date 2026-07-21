// Fase 0 — Camiones + Pedidos: selección de flota y de pedidos elegibles en UNA sola pantalla.
// Reemplaza los antiguos pasos separados de Camiones (TrucksView) y Canales (ChannelsView); la
// selección vive en dispatch-plan-store y queda disponible para el resto del wizard. La barra de
// cobertura va ARRIBA del split de paneles (mismo layout que Planificación: mapa | tabla).
//
// EXPERIMENTO: el panel derecho tiene un sub-paso interno. Con "Continuar a Traslados" NO se salta
// de fase: se reemplaza la tabla de Pedidos por la de Traslados/Devoluciones (misma pantalla, flota
// a la izquierda intacta). El segundo "Continuar" ya avanza a Planificación. La fase 1
// (TransfersView) sigue existiendo aparte para comparar ambas variantes.
import { useState } from 'react'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { CoverageSummaryBar } from '../CoverageSummaryBar'
import { FleetCapacityPanel } from '../FleetCapacityPanel'
import { OrderSelectionPanel } from '../OrderSelectionPanel'
import { TransfersSelectionPanel } from '../TransfersSelectionPanel'
import type { BoardState } from '../types'

type SubPaso = 'pedidos' | 'traslados'

export function TrucksAndOrdersView({ state, onNext }: { state: BoardState; onNext: () => void }) {
  const [subPaso, setSubPaso] = useState<SubPaso>('pedidos')

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <CoverageSummaryBar
        ctaLabel={subPaso === 'pedidos' ? 'Continuar a Traslados' : 'Continuar a planificación'}
        onNext={subPaso === 'pedidos' ? () => setSubPaso('traslados') : onNext}
        onBack={subPaso === 'traslados' ? () => setSubPaso('pedidos') : undefined}
      />

      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1 rounded-md border">
        <ResizablePanel defaultSize="45" minSize="30">
          <FleetCapacityPanel state={state} />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="55" minSize="30">
          {subPaso === 'pedidos' ? (
            <OrderSelectionPanel state={state} />
          ) : (
            <TransfersSelectionPanel state={state} />
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
