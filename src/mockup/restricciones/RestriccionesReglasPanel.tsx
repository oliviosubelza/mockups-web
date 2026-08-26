// TODO LO QUE NO ES GEOMETRÍA de la restricción que se está editando: a quién le aplica, qué efecto tiene,
// cuándo rige y a qué camiones.
//
// ═══ POR QUÉ VIVE EN EL PANEL IZQUIERDO Y NO EN UN FORMULARIO APARTE ═══
//
// El editor viejo era una página de cuatro `Card` apiladas —identidad, geometría, horarios, flota— con el
// mapa metido en la tercera, de 390 px de alto y con el resto del formulario scrolleando por encima y por
// debajo. Eso rompía las dos cosas al mismo tiempo: no se podía dibujar (el mapa era una ventanita sin
// contexto, sin las otras restricciones ni las zonas de reparto a la vista) y no se podía revisar (para
// ver los horarios había que scrollear hasta perder de vista lo dibujado).
//
// Acá el mapa es la pantalla y esto es un panel que flota encima, en el MISMO lugar donde estaba el
// listado. Es un reemplazo y no un panel nuevo, y esa es la decisión:
//   · mientras EXPLORÁS, la izquierda contesta "¿qué restricciones hay?" (`RestriccionesListaPanel`);
//   · mientras EDITÁS, contesta "¿qué dice esta?" — y el listado no hace falta, porque en ese modo no se
//     puede elegir otra. En zonas ese panel simplemente se deshabilita; acá había algo mejor que poner.
// Así no hay un tercer borde ocupado, el mapa no pierde más ancho del que ya perdía, y el ancho del panel
// sigue siendo el mismo número que la cámara usa como padding.
//
// LO QUE NO ESTÁ ACÁ: el nombre y el tipo. Están arriba, en la barra, junto a Guardar. Es la división de
// zonas y es por naturaleza: arriba va la IDENTIDAD y la decisión de confirmar, acá el CONTENIDO. El tipo
// además manda sobre el mapa (define si se dibuja un anillo, una línea o nada), así que tiene que estar
// donde se lo ve sin abrir un panel.
import { CalendarClock, CirclePlus, Info, Sliders, Trash2, Truck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { CAMIONES, DISTRIBUIDORAS } from '../mock-data'
import {
  DAYS_OF_WEEK,
  EFFECTS_BY_TYPE,
  RESTRICTION_EFFECT_META,
  RESTRICTION_SEVERITIES,
  RESTRICTION_SEVERITY_META,
  emptyScheduleDraft,
  emptyVehicleRuleDraft,
  vehicleRuleMatchesTruck,
  type PlanningRestrictionDraft,
  type RestrictionScheduleDraft,
  type RestrictionVehicleRuleDraft,
  type ValidationIssue,
} from './domain'

/** Valor de un `Select` que representa "sin elegir". Cadena vacía no sirve: Base UI la trata como
 *  ausencia de valor y el trigger se queda mostrando el placeholder del render anterior. */
const CUALQUIERA = '__cualquiera__'

function Seccion({
  icono: Icono,
  titulo,
  accion,
  children,
}: {
  icono: typeof Sliders
  titulo: string
  accion?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="border-b border-border last:border-b-0">
      {/* `sticky`: el panel scrollea y las tres secciones son largas. Sin esto, al mirar la cuarta fila de
          horarios ya no se sabe si se está en horarios o en flota. */}
      <div className="sticky top-0 z-10 flex h-8 items-center gap-1.5 border-b border-border bg-card/95 px-2.5 backdrop-blur-sm">
        <Icono size={12} className="shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {titulo}
        </span>
        {accion}
      </div>
      <div className="space-y-2.5 p-2.5">{children}</div>
    </section>
  )
}

function Campo({
  etiqueta,
  children,
  issues,
  field,
}: {
  etiqueta: string
  children: React.ReactNode
  issues?: ValidationIssue[]
  field?: string
}) {
  const mensajes = field ? (issues ?? []).filter((i) => i.field === field).map((i) => i.message) : []
  return (
    <div className="min-w-0 space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{etiqueta}</Label>
      {children}
      {mensajes.length > 0 && <p className="text-[10px] text-destructive">{mensajes.join(' ')}</p>}
    </div>
  )
}

/** Los problemas de una fila entera (no de un campo suyo), que es donde caen las reglas cruzadas. */
function IssuesDeFila({ issues, field }: { issues: ValidationIssue[]; field: string }) {
  const mensajes = issues.filter((i) => i.field === field).map((i) => i.message)
  if (mensajes.length === 0) return null
  return <p className="pt-1 text-[10px] text-destructive">{mensajes.join(' ')}</p>
}

const numeroOpcional = (valor: string): number | null => (valor === '' ? null : Number(valor))

/** Cuántas placas se muestran antes de resumir el resto en «+N más». Ver la nota del preview de flota. */
const MAX_PLACAS = 12

export function RestriccionesReglasPanel({
  draft,
  onDraft,
  issues,
}: {
  draft: PlanningRestrictionDraft
  onDraft: (siguiente: PlanningRestrictionDraft) => void
  issues: ValidationIssue[]
}) {
  const set = (parcial: Partial<PlanningRestrictionDraft>) => onDraft({ ...draft, ...parcial })

  const setHorario = (indice: number, cambio: Partial<RestrictionScheduleDraft>) =>
    set({ schedules: draft.schedules.map((fila, i) => (i === indice ? { ...fila, ...cambio } : fila)) })
  const setRegla = (indice: number, cambio: Partial<RestrictionVehicleRuleDraft>) =>
    set({ vehicleRules: draft.vehicleRules.map((fila, i) => (i === indice ? { ...fila, ...cambio } : fila)) })

  // --- preview de flota -----------------------------------------------------------------------
  // La flota del mock es de una sola distribuidora, así que para cualquier otra no se simula nada en vez
  // de mostrar un resultado que no significaría nada. Y con una regla VACÍA tampoco: una regla sin ningún
  // campo matchea todo, y el contador diría "toda la flota" justo cuando la fila está a medio llenar.
  //
  // Sin NINGUNA regla no se calcula nada: ese caso lo contesta la línea del estado vacío de la sección
  // ("aplica a toda la flota"), y el preview ni se dibuja. Ver la nota larga más abajo.
  const reglaVacia = draft.vehicleRules.some(
    (r) =>
      r.plateLastDigit === null &&
      r.minCapacityWeightKg === null &&
      !r.truckType?.trim() &&
      !r.plate?.trim(),
  )
  const previewDisponible = draft.distributorId === DISTRIBUIDORAS[0]?.id
  const alcanzados =
    !previewDisponible || reglaVacia
      ? []
      : CAMIONES.filter((camion) =>
          draft.vehicleRules.some((regla) =>
            vehicleRuleMatchesTruck(regla, {
              plate: camion.placa,
              capacityWeightKg: camion.capacidadPeso * 1000,
              truckType: camion.tipo,
            }),
          ),
        )
  /** El contador tiene sentido: hay flota que representar y ninguna fila a medio llenar. */
  const puedeContar = previewDisponible && !reglaVacia

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <Seccion icono={Sliders} titulo="Definición">
        <Campo etiqueta="Distribuidora" issues={issues} field="distributorId">
          <Select
            value={String(draft.distributorId)}
            onValueChange={(v) => set({ distributorId: Number(v) })}
          >
            <SelectTrigger className="h-7 w-full text-xs">
              {/* Base UI muestra el VALOR CRUDO si no se le da un render explícito: sin esto el trigger
                  decía «501», el id de la distribuidora. Mismo criterio que `MockupShell` y
                  `ParadaDetalle`, que ya se habían chocado con esto. */}
              <SelectValue>
                {(valor) =>
                  DISTRIBUIDORAS.find((d) => String(d.id) === String(valor))?.nombre ?? String(valor)
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {DISTRIBUIDORAS.map((d) => (
                <SelectItem key={d.id} value={String(d.id)}>
                  {d.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>

        <div className="grid grid-cols-2 gap-2">
          {/* Los efectos posibles los decide el TIPO (`EFFECTS_BY_TYPE`), y el tipo se elige en la barra
              de arriba. Una vía cerrada solo puede ser "sin tránsito": ofrecer los tres y rechazarlo al
              guardar sería hacer elegir para después decir que no. */}
          <Campo etiqueta="Efecto" issues={issues} field="effect">
            <Select
              value={draft.effect}
              onValueChange={(v) => set({ effect: v as typeof draft.effect })}
              disabled={EFFECTS_BY_TYPE[draft.restrictionType].length === 1}
            >
              <SelectTrigger className="h-7 w-full text-xs">
                <SelectValue>
                  {(valor) => RESTRICTION_EFFECT_META[valor as typeof draft.effect]?.label ?? String(valor)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {EFFECTS_BY_TYPE[draft.restrictionType].map((efecto) => (
                  <SelectItem key={efecto} value={efecto}>
                    {RESTRICTION_EFFECT_META[efecto].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <Campo etiqueta="Severidad">
            <Select
              value={draft.severity}
              onValueChange={(v) => set({ severity: v as typeof draft.severity })}
            >
              <SelectTrigger className="h-7 w-full text-xs">
                <SelectValue>
                  {(valor) =>
                    RESTRICTION_SEVERITY_META[valor as typeof draft.severity]?.label ?? String(valor)
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {RESTRICTION_SEVERITIES.map((severidad) => (
                  <SelectItem key={severidad} value={severidad}>
                    {RESTRICTION_SEVERITY_META[severidad].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
        </div>

        <Campo etiqueta="Descripción" issues={issues} field="description">
          <Textarea
            rows={2}
            maxLength={100}
            value={draft.description ?? ''}
            onChange={(e) => set({ description: e.target.value || null })}
            placeholder="Resolución, contexto o referencia…"
            className="min-h-0 resize-none text-xs"
          />
        </Campo>

        <label className="flex items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(e) => set({ isActive: e.target.checked })}
            className="size-3.5 rounded border-input accent-primary"
          />
          Activa al guardar
        </label>
      </Seccion>

      <Seccion
        icono={CalendarClock}
        titulo="Horarios"
        accion={
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-[11px]"
            onClick={() => set({ schedules: [...draft.schedules, emptyScheduleDraft()] })}
          >
            <CirclePlus size={11} />
            Agregar
          </Button>
        }
      >
        {/* SIN FILAS = PERMANENTE, y se dice con palabras. Un panel vacío se lee como "falta cargar
            algo", y acá el vacío es una decisión válida y la más común. */}
        {draft.schedules.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-2 py-2 text-[11px] text-muted-foreground">
            Sin filas: la restricción rige de forma permanente.
          </p>
        ) : (
          <>
            <p className="flex items-start gap-1.5 text-[10px] leading-snug text-muted-foreground">
              <Info size={10} className="mt-0.5 shrink-0" />
              Los campos de una fila se combinan con Y; las filas, entre sí, con O. Si la hora final es
              menor que la inicial, el intervalo cruza medianoche y cuenta para el día de inicio.
            </p>
            {draft.schedules.map((fila, i) => (
              <div key={fila.id ?? `horario-${i}`} className="rounded-md border border-border bg-muted/20 p-2">
                <div className="flex items-center justify-between pb-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Franja {i + 1}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 text-muted-foreground hover:text-destructive"
                    aria-label={`Eliminar horario ${i + 1}`}
                    onClick={() => set({ schedules: draft.schedules.filter((_, j) => j !== i) })}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Campo etiqueta="Desde" issues={issues} field={`schedules[${i}].validFrom`}>
                    <Input
                      type="date"
                      value={fila.validFrom ?? ''}
                      onChange={(e) => setHorario(i, { validFrom: e.target.value || null })}
                      className="h-7 text-xs"
                    />
                  </Campo>
                  <Campo etiqueta="Hasta" issues={issues} field={`schedules[${i}].validTo`}>
                    <Input
                      type="date"
                      value={fila.validTo ?? ''}
                      onChange={(e) => setHorario(i, { validTo: e.target.value || null })}
                      className="h-7 text-xs"
                    />
                  </Campo>
                  <Campo etiqueta="Día" issues={issues} field={`schedules[${i}].dayOfWeek`}>
                    <Select
                      value={fila.dayOfWeek === null ? CUALQUIERA : String(fila.dayOfWeek)}
                      onValueChange={(v) =>
                        setHorario(i, { dayOfWeek: v === CUALQUIERA ? null : Number(v) })
                      }
                    >
                      <SelectTrigger className="h-7 w-full text-xs">
                        <SelectValue>
                          {(valor) =>
                            valor === CUALQUIERA
                              ? 'Todos'
                              : (DAYS_OF_WEEK.find((d) => String(d.value) === String(valor))?.label ??
                                String(valor))
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={CUALQUIERA}>Todos</SelectItem>
                        {DAYS_OF_WEEK.map((dia) => (
                          <SelectItem key={dia.value} value={String(dia.value)}>
                            {dia.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Campo>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Campo etiqueta="Ini." issues={issues} field={`schedules[${i}].startTime`}>
                      <Input
                        type="time"
                        value={fila.startTime ?? ''}
                        onChange={(e) => setHorario(i, { startTime: e.target.value || null })}
                        className="h-7 px-1.5 text-xs"
                      />
                    </Campo>
                    <Campo etiqueta="Fin" issues={issues} field={`schedules[${i}].endTime`}>
                      <Input
                        type="time"
                        value={fila.endTime ?? ''}
                        onChange={(e) => setHorario(i, { endTime: e.target.value || null })}
                        className="h-7 px-1.5 text-xs"
                      />
                    </Campo>
                  </div>
                </div>
                <IssuesDeFila issues={issues} field={`schedules[${i}]`} />
              </div>
            ))}
          </>
        )}
        <IssuesDeFila issues={issues} field="schedules" />
      </Seccion>

      <Seccion
        icono={Truck}
        titulo="Flota alcanzada"
        accion={
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-[11px]"
            onClick={() => set({ vehicleRules: [...draft.vehicleRules, emptyVehicleRuleDraft()] })}
          >
            <CirclePlus size={11} />
            Agregar
          </Button>
        }
      >
        {draft.vehicleRules.length === 0 ? (
          // EL NÚMERO VA ACÁ, no en un preview aparte. Sin reglas la respuesta ya está dada —toda la
          // flota— y el único dato que agrega algo es cuántos camiones son.
          <p className="rounded-md border border-dashed border-border px-2 py-2 text-[11px] text-muted-foreground">
            Sin reglas: aplica a toda la flota{previewDisponible ? ` (${CAMIONES.length} camiones)` : ''}.
          </p>
        ) : (
          <>
            <p className="flex items-start gap-1.5 text-[10px] leading-snug text-muted-foreground">
              <Info size={10} className="mt-0.5 shrink-0" />
              Los campos de una regla se combinan con Y; las reglas, entre sí, con O.
            </p>
            {draft.vehicleRules.map((fila, i) => (
              <div key={fila.id ?? `regla-${i}`} className="rounded-md border border-border bg-muted/20 p-2">
                <div className="flex items-center justify-between pb-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Regla {i + 1}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 text-muted-foreground hover:text-destructive"
                    aria-label={`Eliminar regla vehicular ${i + 1}`}
                    onClick={() => set({ vehicleRules: draft.vehicleRules.filter((_, j) => j !== i) })}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Campo etiqueta="Últ. dígito" issues={issues} field={`vehicleRules[${i}].plateLastDigit`}>
                    <Select
                      value={fila.plateLastDigit === null ? CUALQUIERA : String(fila.plateLastDigit)}
                      onValueChange={(v) =>
                        setRegla(i, { plateLastDigit: v === CUALQUIERA ? null : Number(v) })
                      }
                    >
                      <SelectTrigger className="h-7 w-full text-xs">
                        <SelectValue>
                          {(valor) => (valor === CUALQUIERA ? 'Cualquiera' : String(valor))}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={CUALQUIERA}>Cualquiera</SelectItem>
                        {Array.from({ length: 10 }, (_, digito) => (
                          <SelectItem key={digito} value={String(digito)}>
                            {digito}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Campo>
                  <Campo
                    etiqueta="Capac. mín. (kg)"
                    issues={issues}
                    field={`vehicleRules[${i}].minCapacityWeightKg`}
                  >
                    <Input
                      type="number"
                      min={0}
                      value={fila.minCapacityWeightKg ?? ''}
                      onChange={(e) => setRegla(i, { minCapacityWeightKg: numeroOpcional(e.target.value) })}
                      className="h-7 text-xs"
                    />
                  </Campo>
                  <Campo etiqueta="Tipo de camión" issues={issues} field={`vehicleRules[${i}].truckType`}>
                    <Input
                      value={fila.truckType ?? ''}
                      maxLength={50}
                      onChange={(e) => setRegla(i, { truckType: e.target.value || null })}
                      placeholder="FRIGORÍFICO"
                      className="h-7 text-xs"
                    />
                  </Campo>
                  <Campo etiqueta="Placa exacta" issues={issues} field={`vehicleRules[${i}].plate`}>
                    <Input
                      value={fila.plate ?? ''}
                      maxLength={20}
                      onChange={(e) => setRegla(i, { plate: e.target.value || null })}
                      placeholder="1234-ABC"
                      className="h-7 text-xs"
                    />
                  </Campo>
                </div>
                <IssuesDeFila issues={issues} field={`vehicleRules[${i}]`} />
              </div>
            ))}
          </>
        )}
        <IssuesDeFila issues={issues} field="vehicleRules" />

        {/* EL PREVIEW SOLO EXISTE CUANDO HAY REGLAS QUE ACOTEN.
            Antes se dibujaba siempre, y sin reglas mostraba «54 de 54» y las 54 placas en un párrafo
            corrido: media pantalla de texto gris para repetir lo que la línea de arriba ya decía en seis
            palabras. Un preview que no descarta nada no es un preview, es ruido.

            Con reglas puestas sí hace falta, y es lo único bueno que tenía el editor viejo: una regla como
            «último dígito 3 y capacidad mínima 8.000 kg» no se puede leer y saber a cuántos camiones
            agarra, y sin esto había que guardar, mirar el detalle y volver a entrar a corregir.

            LAS PLACAS VAN COMO CHIPS Y TOPEADAS. En un párrafo separado por comas son una mancha que no se
            puede recorrer; en chips monoespaciados se escanea. Y se cortan en `MAX_PLACAS`: el dato que
            decide algo es el CONTADOR, y las placas son la comprobación de que la regla agarró lo que
            pensabas (¿están los frigoríficos?) — para eso alcanzan doce ejemplos. */}
        {draft.vehicleRules.length > 0 && (
          <div className="rounded-md border border-border bg-muted/20 p-2 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="font-medium">Camiones alcanzados</span>
              {puedeContar && (
                <Badge
                  variant={alcanzados.length === 0 ? 'destructive' : 'outline'}
                  className="h-4 px-1 text-[10px] tabular-nums"
                >
                  {alcanzados.length} de {CAMIONES.length}
                </Badge>
              )}
            </div>

            {!previewDisponible ? (
              <p className="mt-1 leading-snug text-muted-foreground">
                La flota del mock solo representa a {DISTRIBUIDORAS[0]?.nombre}; no se simula el resultado
                para otra distribuidora.
              </p>
            ) : reglaVacia ? (
              <p className="mt-1 leading-snug text-muted-foreground">
                Completá o eliminá la regla vacía para calcular el alcance.
              </p>
            ) : alcanzados.length === 0 ? (
              <p className="mt-1 leading-snug text-destructive">
                Ningún camión de demostración coincide: revisá si la regla es más estrecha de lo que
                querías.
              </p>
            ) : alcanzados.length === CAMIONES.length ? (
              // Una regla que agarra TODA la flota es un hallazgo, no un resultado: casi siempre significa
              // que el campo cargado no acota nada (una capacidad mínima de 0, por ejemplo). Se dice con
              // palabras en vez de escupir las 54 placas.
              <p className="mt-1 leading-snug text-amber-600 dark:text-amber-500">
                Estas reglas no acotan la flota: alcanzan a los {CAMIONES.length} camiones.
              </p>
            ) : (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {alcanzados.slice(0, MAX_PLACAS).map((camion) => (
                  <span
                    key={camion.placa}
                    className="rounded border border-border bg-card px-1 py-px font-mono text-[10px] text-foreground"
                  >
                    {camion.placa}
                  </span>
                ))}
                {alcanzados.length > MAX_PLACAS && (
                  <span className="px-1 py-px text-[10px] text-muted-foreground">
                    +{alcanzados.length - MAX_PLACAS} más
                  </span>
                )}
              </div>
            )}

            <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
              Informativo: no cambia la selección de flota ni la optimización.
            </p>
          </div>
        )}
      </Seccion>
    </div>
  )
}
