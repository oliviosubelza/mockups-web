import { useNavigate } from "react-router";
import { Eye, MoreHorizontal } from "lucide-react";
import type { Return } from "../../../types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/* ---------------------------------------------------------------------------
 * Comentado a pedido: "Corregir", "Revisar y decidir" y "Rechazar" salieron del
 * menú de la fila para todos los roles. Nada se borró — se restaura quitando
 * los comentarios de este archivo (imports, `BlockableItem`, el estado de la
 * decisión y los tres items del menú).
 *
 * La cola de aprobaciones (`/devoluciones/aprobaciones`) sigue siendo la vía
 * para decidir; lo que ya no existe es la entrada a `/devoluciones/:id/editar`,
 * así que esa pantalla queda sin puerta hasta que esto vuelva.
 *
import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { decisionBlockedReason, editBlockedReason } from "../../../services/returns-service";
import { pendingLevelOf } from "../../../lib/return-workflow";
import { useRejectReturn } from "../../../hooks/use-returns";
import { canApproveReturns, useCurrentUser } from "../../../stores/session-store";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "../../../lib/utils";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ReturnDecisionDialog } from "./return-decision-dialog";

 * A menu item that may be blocked, with the reason on hover.
 *
 * A disabled control swallows pointer events, so the tooltip listens on a
 * wrapper and the item stops intercepting — the same shape the orders menu
 * uses. Without it the tooltip would never fire, which is exactly when the user
 * most needs it.
 *
function BlockableItem({
  reason,
  destructive,
  onSelect,
  children,
}: {
  reason: string | null;
  destructive?: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  const item = (
    <DropdownMenuItem
      disabled={!!reason}
      className={cn(
        !!reason && "pointer-events-none",
        destructive && "text-destructive focus:text-destructive",
      )}
      onClick={onSelect}
    >
      {children}
    </DropdownMenuItem>
  );

  if (!reason) return item;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="block">
          {item}
        </span>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-56">
        {reason}
      </TooltipContent>
    </Tooltip>
  );
}
 * ------------------------------------------------------------------------- */

/**
 * The row's actions, behind one button.
 *
 * One item, for now. Rejecting used to live here rather than only on the detail
 * page, and for a good reason: refusing a whole claim needs no per-item work,
 * and making an approver open every return to turn it down turns ten decisions
 * into thirty navigations. That argument still holds — it is why the code above
 * is commented and not deleted.
 *
 * The reasons those items carried came from the service, the same functions
 * that would reject the call, so the menu could never offer a decision the API
 * would refuse. Whatever comes back here should keep that.
 */
export function ReturnActions({ ret }: { ret: Return }) {
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      {/* `render` y no `asChild`: el kit de este repo es Base UI, no Radix. */}
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={`Acciones de la devolución ${ret.id}`}
          />
        }
      >
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => navigate(`/devoluciones/${ret.id}`)}>
          <Eye /> Ver
        </DropdownMenuItem>

        {/* Comentado a pedido — ver el bloque al inicio del archivo.
        <BlockableItem
          reason={editBlocked}
          onSelect={() => navigate(`/devoluciones/${ret.id}/editar`)}
        >
          <Pencil /> Corregir
        </BlockableItem>

        {canDecideHere && (
          <>
            <DropdownMenuSeparator />
            <BlockableItem
              reason={decisionBlocked}
              onSelect={() => navigate(`/devoluciones/${ret.id}/aprobar`)}
            >
              <Check /> Revisar y decidir
            </BlockableItem>
            <BlockableItem
              reason={decisionBlocked}
              destructive
              onSelect={() => setDecision("rechazado")}
            >
              <X /> Rechazar
            </BlockableItem>
          </>
        )}
        */}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
