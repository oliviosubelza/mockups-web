// El perfil de la top bar: quién sos y con qué rol estás mirando la app.
//
// Antes esto era una barra propia del módulo de devoluciones (`SelectorRol`), pegada arriba de sus
// tres pantallas. Estaba ahí porque era el único módulo que leía el rol, y meterlo en el shell le
// hubiera anunciado a las otras veinte pantallas un concepto que ninguna usaba.
//
// Ya no: el rol decide qué ve y qué puede firmar cada uno, y una barra que aparece y desaparece
// según en qué pantalla estás es un control que el usuario no sabe dónde buscar. El lugar donde
// cualquiera busca "con qué usuario estoy" es el avatar de arriba a la derecha, así que ahí está —
// y de paso el módulo deja de pagar 40 px de alto que le robaba a su propia vista.
import { Check, LogOut, Settings, UsersRound } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import { ROLE_LABELS, USERS, initialsOf, useCurrentUser, useSessionStore } from './session-store'

export function PerfilMenu() {
  const usuario = useCurrentUser()
  const setUserId = useSessionStore((s) => s.setUserId)

  return (
    <DropdownMenu>
      {/* `render` y no `asChild`: el kit de este repo es Base UI. */}
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="Perfil y rol"
            className="flex cursor-pointer items-center gap-2 rounded-full pl-0.5 pr-2 py-0.5 transition-colors hover:bg-accent"
          />
        }
      >
        <Avatar className="h-7 w-7">
          <AvatarFallback className="bg-primary text-[10px] text-primary-foreground">
            {initialsOf(usuario.name)}
          </AvatarFallback>
        </Avatar>
        {/* El ROL viaja al lado del avatar y no solo dentro del menú: es el dato que cambia lo que la
            pantalla de abajo muestra, así que tiene que estar a la vista sin abrir nada. Se esconde
            en pantallas angostas, donde el avatar solo ya alcanza para encontrar el menú. */}
        <span className="hidden text-[11px] font-medium leading-none text-muted-foreground sm:inline">
          {ROLE_LABELS[usuario.role]}
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuGroup>
          {/* El `DropdownMenuGroup` NO es decorativo: `DropdownMenuLabel` es un `Menu.GroupLabel` de
              Base UI y explota en runtime si no encuentra un `Menu.Group` arriba. */}
          <DropdownMenuLabel className="flex items-center gap-2 py-2 font-normal">
            <Avatar className="size-8">
              <AvatarFallback className="text-[11px]">{initialsOf(usuario.name)}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium text-foreground">{usuario.name}</span>
              <span className="truncate text-[11px] text-muted-foreground">{usuario.email}</span>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <UsersRound className="size-3" /> Cambiar rol
          </DropdownMenuLabel>
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
                <span className="truncate text-[11px] text-muted-foreground">{ROLE_LABELS[u.role]}</span>
              </div>
              {u.id === usuario.id && <Check className="size-4 text-primary" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        {/* Los dos ítems que un menú de cuenta siempre tiene. Acá no llevan a ningún lado todavía:
            quedan deshabilitados en vez de mentir con un click que no hace nada. */}
        <DropdownMenuGroup>
          <DropdownMenuItem disabled className="gap-2">
            <Settings className="size-4" /> Preferencias
          </DropdownMenuItem>
          <DropdownMenuItem disabled className="gap-2">
            <LogOut className="size-4" /> Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
