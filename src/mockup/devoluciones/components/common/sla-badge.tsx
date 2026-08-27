// Cuánto le queda al escritorio que tiene el documento, o hace cuánto se le pasó.
//
// Es lo único que sobrevivió de `workflow-progress.tsx`, que dibujaba una fila de tarjetas —una por
// nivel— arriba del detalle. Esas tarjetas repetían lo que la franja de datos y el histórico ya
// dicen, y ocupaban media pantalla para hacerlo. El plazo, en cambio, no está en ningún otro lado y
// es el único dato del workflow que cambia solo con el reloj: por eso queda, y queda como badge —un
// valor en una celda— en vez de como widget.
import { AlertTriangle, Clock } from "lucide-react";
import type { WorkflowInstanceLevel } from "../../types";
import { hoursToDeadline, isOverdue } from "../../lib/workflow";
import { cn } from "../../lib/utils";

/**
 * Redondeado a horas mientras falte más de una, y a minutos cuando ya no.
 *
 * "Vence en 0 h" es la única forma de decir "se está por vencer" que se lee como "no hay apuro".
 */
function plazoLabel(hours: number): string {
  const late = hours < 0;
  const abs = Math.abs(hours);
  if (abs < 1) {
    const min = Math.max(1, Math.round(abs * 60));
    return late ? `Vencida hace ${min} min` : `Vence en ${min} min`;
  }
  const h = Math.round(abs);
  return late ? `Vencida hace ${h} h` : `Vence en ${h} h`;
}

export function SlaBadge({
  level,
  className,
}: {
  level: WorkflowInstanceLevel;
  className?: string;
}) {
  const hours = hoursToDeadline(level);
  // Sin `slaHours` el nivel no tiene plazo: el guion dice "no aplica" sin fingir un número.
  if (hours === null) return <span className="text-muted-foreground">—</span>;
  const late = isOverdue(level);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-px text-[10px] font-medium leading-4",
        late
          ? "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400"
          : "border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      {late ? <AlertTriangle className="h-2.5 w-2.5" /> : <Clock className="h-2.5 w-2.5" />}
      {plazoLabel(hours)}
    </span>
  );
}
