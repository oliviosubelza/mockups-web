// Componente de Panel Lateral Deslizante (Slide-Over Drawer al 75%) para el Mapa de Ruta
// Despliega el circuito logístico de derecha a izquierda con animación suave y Split-View.

import React from 'react'
import { Navigation, X } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RutaOrdenTransporteMapaView } from './RutaOrdenTransporteMapaView'
import type { OrdenTransporteHistorial, ParadaHistorial } from '../historial-orders-data'

interface RutaOrdenTransporteMapaDrawerProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  orden: OrdenTransporteHistorial
  initialSelectedStopId?: string | null
  onSelectStopAndSwitchTab?: (stop: ParadaHistorial) => void
}

export function RutaOrdenTransporteMapaDrawer({
  isOpen,
  onOpenChange,
  orden,
  initialSelectedStopId,
  onSelectStopAndSwitchTab,
}: RutaOrdenTransporteMapaDrawerProps) {
  const handleStopSelect = (stop: ParadaHistorial) => {
    if (onSelectStopAndSwitchTab) {
      onSelectStopAndSwitchTab(stop)
      onOpenChange(false)
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full sm:w-[85vw] md:w-[80vw] lg:w-[75vw] xl:w-[75vw] max-w-none sm:max-w-none lg:max-w-none fixed inset-y-0 right-0 h-full p-0 flex flex-col bg-background border-l border-border shadow-2xl z-[100] overflow-hidden"
      >
        {/* ── CABECERA DEL PANEL DESLIZANTE (DRAWER HEADER) ── */}
        <div className="px-5 py-3.5 border-b border-border bg-card/95 backdrop-blur-md flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20 shrink-0">
              <Navigation size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <SheetTitle className="text-sm font-bold text-foreground">
                  Recorrido y Circuito de Ruta — {orden.codeFormatted}
                </SheetTitle>
                <Badge variant="outline" className="text-[10px] font-mono bg-background">
                  {orden.truck.plate} ({orden.truck.truckType})
                </Badge>
                <Badge
                  variant={orden.status === 'COMPLETED' ? 'default' : 'secondary'}
                  className={orden.status === 'COMPLETED' ? 'bg-emerald-600 text-white h-4 text-[10px] px-1.5' : 'h-4 text-[10px] px-1.5'}
                >
                  {orden.statusLabel}
                </Badge>
              </div>
              <SheetDescription className="text-xs text-muted-foreground truncate">
                Chofer: <b className="text-foreground">{orden.driver.name}</b> · {orden.kpis.completedStops} de {orden.kpis.totalStops} paradas atendidas · {orden.totalKm} km recorridos
              </SheetDescription>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <SheetClose asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
                title="Cerrar panel de mapa (ESC)"
              >
                <X size={16} />
                <span className="sr-only">Cerrar</span>
              </Button>
            </SheetClose>
          </div>
        </div>

        {/* ── CUERPO DEL PANEL: VISTA COMPLETA DE MAPA Y TELEMETRÍA ── */}
        <div className="flex-1 overflow-y-auto p-4 bg-muted/10 min-h-0">
          <RutaOrdenTransporteMapaView
            orden={orden}
            initialSelectedStopId={initialSelectedStopId}
            onSelectStopAndSwitchTab={handleStopSelect}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}

