// El `Select` del kit de este repo, con el popup corregido para este módulo.
//
// EL SÍNTOMA: la lista de "Motivo de devolución" —veintipico de opciones— se abría como una columna
// altísima que tapaba el diálogo entero y encima cortaba los textos a la mitad.
//
// LA CAUSA son dos defaults de Base UI que Radix, de donde vino el módulo, no tiene:
//
//   1. `alignItemWithTrigger` viene en `true`. Es el comportamiento de un `<select>` nativo de macOS:
//      el popup se corre para que la opción YA ELEGIDA quede justo encima del trigger. Con dos o tres
//      opciones se ve bien; con veinticinco, el popup tiene que crecer hacia arriba y hacia abajo hasta
//      cubrir la pantalla. Con `false` se ancla debajo del campo, como cualquier desplegable.
//   2. El popup mide `w-(--anchor-width)`, o sea exactamente el ancho del trigger. El campo del motivo
//      es angosto y los motivos son frases largas ("VENCIMIENTO POR BAJA ROTACIÓN"), así que todas
//      llegaban cortadas. Acá el ancho del trigger pasa a ser el MÍNIMO y el popup puede ensancharse.
//
// Se corrige una vez, acá, y no en cada `<SelectContent>`: son seis en el módulo y la próxima que
// alguien agregue heredaría el problema de nuevo.
import type { ComponentProps } from 'react'
import { SelectContent as SelectContentBase } from '@/components/ui/select'

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
} from '@/components/ui/select'

export function SelectContent({ className, ...props }: ComponentProps<typeof SelectContentBase>) {
  return (
    <SelectContentBase
      alignItemWithTrigger={false}
      className={['max-h-72 w-auto min-w-(--anchor-width) max-w-[min(28rem,90vw)]', className]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  )
}
