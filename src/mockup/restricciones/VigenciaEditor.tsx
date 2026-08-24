// Editor de la lista de ventanas de vigencia. La UI del eje temporal de `vigencia.ts`.
//
// ES REUSABLE A PROPÓSITO y no un pedazo de la pantalla de zonas: las tres restricciones de la
// planificación —zonas restringidas, vías cerradas y placas de circulación— se responden la misma
// pregunta ("¿cuándo rige esto?") y comparten el tipo. Si cada pantalla dibujara su propio formulario,
// la primera divergencia sería semántica y no cosmética: alcanza con que una ofrezca "días" y otra no
// para que dos restricciones idénticas se evalúen distinto. Por eso las props son las mínimas —la lista
// y cómo devolverla— y no entra nada de la entidad que la contiene.
//
// AVISAR, NO BLOQUEAR. Una ventana imposible (fin antes que inicio) se marca en ámbar y no deshabilita
// nada. El componente vive dentro de pantallas que guardan MUCHO más que la vigencia —una zona es
// además un polígono de ochenta vértices que costó dibujar—, y trabar ese guardado por una fila mal
// cargada convierte un error de tipeo en la pérdida del trabajo entero. La ventana rota no rige nunca,
// que es un resultado inofensivo y visible: `describirVentana` la sigue describiendo.
//
// ENTRA EN 380 px, que es el ancho del popover que lo hospeda. De ahí que los días sean siete chips de
// dos letras y no un multi-select, que las horas y las fechas vayan en dos renglones de a dos campos, y
// que no haya etiquetas arriba de cada input: el resumen de abajo (`describirVentana`) dice en una
// frase qué quedó cargado, y es más corto de leer que cuatro rótulos.
import { AlertTriangle, CalendarClock, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  DIAS_SEMANA,
  describirVentana,
  motivoVentanaImposible,
  ventanaVacia,
  type DiaSemana,
  type VentanaVigencia,
} from './vigencia'

/** `''` es lo que devuelve un `<input>` vacío y `null` es "sin límite" en el modelo. Traducirlo acá y no
 *  en cada `onChange` evita que un campo borrado quede guardado como cadena vacía, que no es `null` para
 *  `vigenteEn` pero se le parece lo suficiente como para que el bug tarde en aparecer. */
function oNull(valor: string): string | null {
  return valor === '' ? null : valor
}

export function VigenciaEditor({
  ventanas,
  onChange,
}: {
  ventanas: VentanaVigencia[]
  onChange: (v: VentanaVigencia[]) => void
}) {
  const editar = (id: string, cambio: Partial<VentanaVigencia>) =>
    onChange(ventanas.map((v) => (v.id === id ? { ...v, ...cambio } : v)))

  const quitar = (id: string) => onChange(ventanas.filter((v) => v.id !== id))

  const agregar = () => onChange([...ventanas, ventanaVacia(crypto.randomUUID())])

  /** Los días se alternan de a uno. Quitar el último NO deja la ventana sin días válidos: vacío es
   *  "todos", que es el default del modelo — ver la regla 1 de `vigencia.ts`. */
  const alternarDia = (v: VentanaVigencia, dia: DiaSemana) =>
    editar(v.id, {
      dias: v.dias.includes(dia) ? v.dias.filter((d) => d !== dia) : [...v.dias, dia],
    })

  return (
    <div className="flex flex-col gap-2">
      {ventanas.length === 0 ? (
        // EL VACÍO ES UN ESTADO, NO UN FORMULARIO SIN LLENAR, y por eso se afirma en vez de invitar.
        // "Sin ventanas" significa PERMANENTE (regla 1 de `vigencia.ts`) y es el caso correcto para la
        // enorme mayoría: un centro histórico cerrado está cerrado. Un placeholder gris diciendo "no hay
        // franjas cargadas" haría leer como pendiente lo que ya está bien, y empujaría a inventar una
        // franja de 00:00 a 24:00 todos los días —que es lo mismo escrito de la forma más frágil—.
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <CalendarClock size={13} className="shrink-0 text-muted-foreground" />
            Rige siempre
          </p>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            Sin franjas cargadas la restricción es permanente. Agregá una solo si rige nada más algunos
            días, en cierto horario o entre dos fechas.
          </p>
        </div>
      ) : (
        ventanas.map((v, i) => {
          const imposible = motivoVentanaImposible(v)
          return (
            <div key={v.id} className="rounded-lg border border-border bg-muted/20 p-2">
              <div className="mb-1.5 flex items-center gap-1">
                {/* El número de franja es lo único que las distingue mientras están vacías, y con tres
                    cargadas hace falta para saber cuál se está por borrar. */}
                <span className="text-[11px] font-semibold text-muted-foreground">Franja {i + 1}</span>
                <span className="flex-1" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-5 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => quitar(v.id)}
                  title="Quitar esta franja"
                >
                  <X size={12} />
                </Button>
              </div>

              {/* Los siete días en un renglón, en el orden de `DIAS_SEMANA` —lunes primero, domingo
                  último—. Es el orden de la semana laboral, no el de `Date.getDay()`, y respetarlo acá
                  es lo que hace que "Lu a Vi" se seleccione arrastrando la vista de izquierda a derecha
                  en vez de saltar el domingo del medio. */}
              <div className="flex gap-0.5">
                {DIAS_SEMANA.map(({ valor, corto, label }) => {
                  const activo = v.dias.includes(valor)
                  return (
                    <button
                      key={valor}
                      type="button"
                      onClick={() => alternarDia(v, valor)}
                      title={label}
                      aria-pressed={activo}
                      className={cn(
                        'h-6 flex-1 rounded-md border text-[11px] font-medium transition-colors',
                        activo
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {corto}
                    </button>
                  )
                })}
              </div>

              {/* Horas y fechas, cada par en su renglón. Inputs nativos (`time`, `date`) y no un date
                  picker propio: el nativo ya trae el teclado numérico, el formato del sistema y la
                  navegación con flechas, y lo que se carga acá son cuatro valores sueltos, no un rango
                  que haya que elegir mirando un calendario. */}
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <Input
                  type="time"
                  value={v.horaInicio ?? ''}
                  onChange={(e) => editar(v.id, { horaInicio: oNull(e.target.value) })}
                  className="h-7 px-1.5 text-xs"
                  title="Hora en que empieza a regir. Vacío = desde las 00:00"
                />
                <Input
                  type="time"
                  value={v.horaFin ?? ''}
                  onChange={(e) => editar(v.id, { horaFin: oNull(e.target.value) })}
                  className="h-7 px-1.5 text-xs"
                  title="Hora en que deja de regir. Vacío = hasta las 24:00"
                />
                <Input
                  type="date"
                  value={v.desde ?? ''}
                  onChange={(e) => editar(v.id, { desde: oNull(e.target.value) })}
                  className="h-7 px-1.5 text-xs"
                  title="Primer día en que rige. Vacío = sin fecha de inicio"
                />
                <Input
                  type="date"
                  value={v.hasta ?? ''}
                  onChange={(e) => editar(v.id, { hasta: oNull(e.target.value) })}
                  className="h-7 px-1.5 text-xs"
                  title="Último día en que rige. Vacío = sin fecha de fin"
                />
              </div>

              {/* El resumen sale de `describirVentana` y no de concatenar los campos acá: es el MISMO
                  texto que después se lee en la lista de zonas y en la barra de acciones, y armarlo dos
                  veces garantiza que un día digan cosas distintas de la misma ventana. Sirve además de
                  confirmación inmediata: una franja de 22:00 a 06:00 se lee como nocturna y no como un
                  error de carga. */}
              <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                {describirVentana(v)}
              </p>

              {imposible && (
                // ÁMBAR Y NO ROJO, y sin deshabilitar nada. El rojo es el color con el que esta pantalla
                // dice "no podés guardar" (los conflictos de bordes de las zonas), y esto no impide
                // guardar: la ventana simplemente no va a regir nunca. Usar el mismo rojo entrenaría a
                // buscar un botón bloqueado que no existe.
                <p className="mt-1 flex items-start gap-1 text-[11px] leading-snug text-amber-600 dark:text-amber-500">
                  <AlertTriangle size={12} className="mt-px shrink-0" />
                  <span>{imposible}: esta franja no va a regir nunca.</span>
                </p>
              )}
            </div>
          )
        })
      )}

      {/* El botón queda ABAJO y siempre visible, incluso con el vacío arriba: es la única acción del
          componente y moverlo de lugar según haya o no franjas obligaría a buscarlo dos veces. */}
      <Button variant="outline" size="sm" className="h-7 w-full gap-1.5 text-xs" onClick={agregar}>
        <Plus size={13} />
        Agregar franja
      </Button>
    </div>
  )
}
