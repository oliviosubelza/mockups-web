// Ayuda de atajos de teclado.
//
// Existe porque un atajo que no se puede descubrir no sirve: quien no lo sabe nunca lo va a probar, y
// quien lo supo alguna vez lo olvida. Se llega desde el menú de configuración del mapa o con `?`.
//
// La lista NO está escrita acá: sale de `ATAJOS`, la misma tabla que alimenta al manejador de teclas.
// Duplicarla garantizaría que algún día la ayuda mienta.
import { Keyboard } from 'lucide-react'
import { Kbd } from '@/components/ui/kbd'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ATAJOS, etiquetaTeclas, type Atajo } from './planner-atajos'

/** Orden de los grupos: el mismo del flujo de trabajo — elegir herramienta, mirar, marcar, ejecutar. */
const GRUPOS: Atajo['grupo'][] = ['Herramientas', 'Vista', 'Selección', 'Plan']

export function AtajosDialog({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      {/* `z-[1300]`: por encima de la escalera del mapa, igual que la ficha del punto. */}
      <DialogContent className="z-[1300] sm:max-w-lg" overlayClassName="z-[1300]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Keyboard className="size-4" />
            Atajos de teclado
          </DialogTitle>
          <DialogDescription>
            Las teclas no actúan mientras estés escribiendo en un buscador o un filtro.
          </DialogDescription>
        </DialogHeader>

        {/* Dos columnas: son 15 atajos y en una sola el diálogo pasaría el alto de la ventana. */}
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {GRUPOS.map((grupo) => (
            <section key={grupo} className="space-y-1">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {grupo}
              </h3>
              {ATAJOS.filter((a) => a.grupo === grupo).map((atajo) => (
                <div key={atajo.teclas} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="min-w-0 text-muted-foreground">{atajo.descripcion}</span>
                  <Kbd className="shrink-0">{etiquetaTeclas(atajo)}</Kbd>
                </div>
              ))}
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
