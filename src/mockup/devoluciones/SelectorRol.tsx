// Quién sos mientras mirás devoluciones.
//
// El módulo entero está construido sobre el rol: el vendedor REGISTRA la devolución y ve solo las
// suyas (`seesOwnDocumentsOnly`), y supervisor, gerente y administrador son los que pueden FIRMARLA
// (`canApproveReturns`). Sin poder cambiar de rol la pantalla arranca como administrador y las mitades
// interesantes del flujo —la bandeja de aprobación con algo adentro, el alta desde el punto de venta—
// no se pueden ver. O sea que esto no es un extra de demo: sin el selector, medio módulo es inalcanzable.
//
// POR QUÉ VIVE ACÁ Y NO EN EL SHELL. En el proyecto de Ventas el cambio de usuario cuelga del menú de
// la cuenta, que es una barra que este mockup no tiene. Meterlo en el sidebar sería anunciarle a las
// otras veinte pantallas un concepto —"con qué rol estoy mirando"— que ninguna usa y que no cambiaría
// nada de lo que muestran. Queda pegado a las pantallas que sí dependen de él.
//
// Se copió solo la parte que hace algo. El menú original traía Perfil, Preferencias y Cerrar sesión:
// tres ítems que acá no llevan a ningún lado y que compiten con el único que sí importa.
import { Check, UsersRound } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { ROLE_LABELS, USERS, initialsOf, useCurrentUser, useSessionStore } from './stores/session-store'

export function SelectorRol() {
  const usuario = useCurrentUser()
  const setUserId = useSessionStore((s) => s.setUserId)

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-b border-border bg-muted/20 px-4 py-1.5">
      <span className="text-[11px] text-muted-foreground">Viendo devoluciones como</span>
      <DropdownMenu>
        {/* `render` y no `asChild`: el kit de este repo es Base UI. */}
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="h-7 gap-2 pl-1.5" />}>
          <Avatar className="size-5">
            <AvatarFallback className="text-[9px]">{initialsOf(usuario.name)}</AvatarFallback>
          </Avatar>
          <span className="text-xs font-medium">{usuario.name}</span>
          <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary">
            {ROLE_LABELS[usuario.role]}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {/* El `DropdownMenuGroup` NO es decorativo: `DropdownMenuLabel` es un `Menu.GroupLabel` de
              Base UI y explota en runtime si no encuentra un `Menu.Group` arriba. En Radix —de donde
              vino este menú— la etiqueta era independiente y podía ir suelta dentro del contenido. */}
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <UsersRound className="size-3" /> Cambiar rol
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {USERS.map((u) => (
              <DropdownMenuItem
                key={u.id}
                onClick={() => setUserId(u.id)}
                className={cn('gap-2', u.id === usuario.id && 'bg-accent/60')}
              >
                <Avatar className="size-6">
                  <AvatarFallback className="text-[10px]">{initialsOf(u.name)}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">{u.name}</span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {ROLE_LABELS[u.role]}
                  </span>
                </div>
                {u.id === usuario.id && <Check className="size-4 text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
