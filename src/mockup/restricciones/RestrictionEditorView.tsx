import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, CalendarClock, CirclePlus, Map, Save, Trash2, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useRouteParams } from '@/core/routing/active-route'
import { CAMIONES, DISTRIBUIDORAS } from '../mock-data'
import { navigateTo } from '../routes'
import {
  DAYS_OF_WEEK,
  EFFECTS_BY_TYPE,
  RESTRICTION_EFFECT_META,
  RESTRICTION_SEVERITIES,
  RESTRICTION_SEVERITY_META,
  RESTRICTION_TYPE_META,
  RESTRICTION_TYPES,
  emptyGeometry,
  emptyRestrictionDraft,
  emptyScheduleDraft,
  emptyVehicleRuleDraft,
  restrictionToDraft,
  vehicleRuleMatchesTruck,
  type PlanningRestrictionDraft,
  type RestrictionScheduleDraft,
  type RestrictionType,
  type RestrictionVehicleRuleDraft,
  type ValidationIssue,
} from './domain'
import { RestrictionMap } from './RestrictionMap'
import { usePlanningRestrictionsStore } from './store'

const selectClassName =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50'

function blankDraft(): PlanningRestrictionDraft {
  return emptyRestrictionDraft(DISTRIBUIDORAS[0]?.id ?? 0)
}

function FieldIssues({ issues, field }: { issues: ValidationIssue[]; field: string }) {
  const messages = issues.filter((issue) => issue.field === field).map((issue) => issue.message)
  if (messages.length === 0) return null
  return <p className="text-xs text-destructive">{messages.join(' ')}</p>
}

function parseOptionalNumber(value: string): number | null {
  return value === '' ? null : Number(value)
}

export function RestrictionEditorView() {
  const { restrictionId } = useRouteParams()
  const parsedId = restrictionId === undefined ? null : Number(restrictionId)
  const existing = usePlanningRestrictionsStore((state) =>
    parsedId === null ? undefined : state.restrictions.find((restriction) => restriction.id === parsedId),
  )
  const createRestriction = usePlanningRestrictionsStore((state) => state.createRestriction)
  const replaceRestriction = usePlanningRestrictionsStore((state) => state.replaceRestriction)
  const [draft, setDraft] = useState<PlanningRestrictionDraft>(() =>
    existing && existing.deletedAt === null ? restrictionToDraft(existing) : blankDraft(),
  )
  const [issues, setIssues] = useState<ValidationIssue[]>([])
  const isEditing = parsedId !== null
  const hasEmptyVehicleRule = draft.vehicleRules.some(
    (rule) =>
      rule.plateLastDigit === null &&
      rule.minCapacityWeightKg === null &&
      !rule.truckType?.trim() &&
      !rule.plate?.trim(),
  )
  const previewAvailable = draft.distributorId === DISTRIBUIDORAS[0]?.id
  const affectedTrucks = !previewAvailable || hasEmptyVehicleRule
    ? []
    : draft.vehicleRules.length === 0
      ? CAMIONES
      : CAMIONES.filter((truck) =>
          draft.vehicleRules.some((rule) =>
            vehicleRuleMatchesTruck(rule, {
              plate: truck.placa,
              capacityWeightKg: truck.capacidadPeso * 1000,
              truckType: truck.tipo,
            }),
          ),
        )

  useEffect(() => {
    setDraft(existing && existing.deletedAt === null ? restrictionToDraft(existing) : blankDraft())
    setIssues([])
  }, [existing])

  if (isEditing && (!existing || existing.deletedAt !== null)) {
    return (
      <Card className="mx-auto w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Restricción no disponible</CardTitle>
          <CardDescription>El registro no existe o fue eliminado lógicamente.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => navigateTo('restricciones')}>
            <ArrowLeft size={14} className="mr-1.5" />
            Volver al catálogo
          </Button>
        </CardContent>
      </Card>
    )
  }

  const updateSchedule = (index: number, update: Partial<RestrictionScheduleDraft>) => {
    setDraft((current) => ({
      ...current,
      schedules: current.schedules.map((row, rowIndex) => (rowIndex === index ? { ...row, ...update } : row)),
    }))
  }

  const updateVehicleRule = (index: number, update: Partial<RestrictionVehicleRuleDraft>) => {
    setDraft((current) => ({
      ...current,
      vehicleRules: current.vehicleRules.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...update } : row,
      ),
    }))
  }

  const changeType = (restrictionType: RestrictionType) => {
    setDraft((current) => ({
      ...current,
      restrictionType,
      effect: EFFECTS_BY_TYPE[restrictionType][0],
      geometryGeoJson: emptyGeometry(restrictionType),
    }))
    setIssues([])
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const result = isEditing && parsedId !== null
      ? replaceRestriction(parsedId, draft)
      : createRestriction(draft)
    if (!result.ok) {
      setIssues(result.issues)
      toast.error('Revise los campos marcados antes de publicar')
      return
    }
    toast.success(isEditing ? 'Restricción actualizada' : 'Restricción creada')
    navigateTo('restriccion-detalle', { restrictionId: String(result.restriction.id) })
  }

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-6xl space-y-4 pb-8">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => navigateTo('restricciones')}>
          <ArrowLeft size={14} className="mr-1.5" />
          Catálogo
        </Button>
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {isEditing ? `Editar ${existing?.name}` : 'Nueva restricción'}
          </h2>
          <p className="text-sm text-muted-foreground">La publicación valida y reemplaza el agregado completo.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isEditing && <Badge variant="outline">ID {parsedId}</Badge>}
          <Button type="submit">
            <Save size={14} className="mr-1.5" />
            Publicar
          </Button>
        </div>
      </div>

      {issues.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>No se publicó ningún cambio</AlertTitle>
          <AlertDescription>
            Hay {issues.length} validación{issues.length === 1 ? '' : 'es'} pendiente{issues.length === 1 ? '' : 's'}.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Identidad y efecto</CardTitle>
          <CardDescription>El tipo define la geometría admitida y queda bloqueado después del alta.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="restriction-name">Nombre</Label>
            <Input
              id="restriction-name"
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="Ej. Cierre Av. Cañoto"
            />
            <FieldIssues issues={issues} field="name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="restriction-distributor">Distribuidora</Label>
            <select
              id="restriction-distributor"
              className={selectClassName}
              value={draft.distributorId}
              onChange={(event) =>
                setDraft((current) => ({ ...current, distributorId: Number(event.target.value) }))
              }
            >
              {DISTRIBUIDORAS.map((distributor) => (
                <option key={distributor.id} value={distributor.id}>{distributor.nombre}</option>
              ))}
            </select>
            <FieldIssues issues={issues} field="distributorId" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="restriction-type">Tipo</Label>
            <select
              id="restriction-type"
              className={selectClassName}
              value={draft.restrictionType}
              disabled={isEditing}
              onChange={(event) => changeType(event.target.value as RestrictionType)}
            >
              {RESTRICTION_TYPES.map((type) => (
                <option key={type} value={type}>{RESTRICTION_TYPE_META[type].label}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {RESTRICTION_TYPE_META[draft.restrictionType].description}
            </p>
            <FieldIssues issues={issues} field="restrictionType" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="restriction-effect">Efecto</Label>
              <select
                id="restriction-effect"
                className={selectClassName}
                value={draft.effect}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, effect: event.target.value as typeof current.effect }))
                }
              >
                {EFFECTS_BY_TYPE[draft.restrictionType].map((effect) => (
                  <option key={effect} value={effect}>{RESTRICTION_EFFECT_META[effect].label}</option>
                ))}
              </select>
              <FieldIssues issues={issues} field="effect" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="restriction-severity">Severidad</Label>
              <select
                id="restriction-severity"
                className={selectClassName}
                value={draft.severity}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, severity: event.target.value as typeof current.severity }))
                }
              >
                {RESTRICTION_SEVERITIES.map((severity) => (
                  <option key={severity} value={severity}>{RESTRICTION_SEVERITY_META[severity].label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="restriction-description">Descripción</Label>
            <Textarea
              id="restriction-description"
              rows={3}
              maxLength={100}
              value={draft.description ?? ''}
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value || null }))
              }
              placeholder="Contexto operativo, resolución o referencia…"
            />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium md:col-span-2">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))}
              className="size-4 rounded border-input accent-primary"
            />
            Activa al publicar
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Map size={18} />
            <CardTitle>Geometría</CardTitle>
          </div>
          <CardDescription>
            {RESTRICTION_TYPE_META[draft.restrictionType].geometry}. La captura ocurre en el mapa y se almacena como GeoJSON.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <RestrictionMap
            restrictionType={draft.restrictionType}
            geometry={draft.geometryGeoJson}
            onChange={(geometryGeoJson) => setDraft((current) => ({ ...current, geometryGeoJson }))}
          />
          <FieldIssues issues={issues} field="geometryGeoJson" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CalendarClock size={18} />
            <CardTitle>Horarios</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => setDraft((current) => ({
                ...current,
                schedules: [...current.schedules, emptyScheduleDraft()],
              }))}
            >
              <CirclePlus size={13} className="mr-1.5" />
              Agregar horario
            </Button>
          </div>
          <CardDescription>
            Sin filas significa vigencia permanente. Los campos de una fila se combinan con AND; las filas, con OR.
            Si la hora final es menor que la inicial, el intervalo cruza medianoche y se atribuye al día de inicio.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {draft.schedules.length === 0 && (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Vigencia permanente.</div>
          )}
          {draft.schedules.map((row, index) => (
            <div key={row.id ?? `schedule-${index}`} className="rounded-lg border bg-muted/20 p-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-1.5">
                  <Label>Desde</Label>
                  <Input
                    type="date"
                    value={row.validFrom ?? ''}
                    onChange={(event) => updateSchedule(index, { validFrom: event.target.value || null })}
                  />
                  <FieldIssues issues={issues} field={`schedules[${index}].validFrom`} />
                </div>
                <div className="space-y-1.5">
                  <Label>Hasta</Label>
                  <Input
                    type="date"
                    value={row.validTo ?? ''}
                    onChange={(event) => updateSchedule(index, { validTo: event.target.value || null })}
                  />
                  <FieldIssues issues={issues} field={`schedules[${index}].validTo`} />
                </div>
                <div className="space-y-1.5">
                  <Label>Día de inicio</Label>
                  <select
                    className={selectClassName}
                    value={row.dayOfWeek ?? ''}
                    onChange={(event) => updateSchedule(index, { dayOfWeek: parseOptionalNumber(event.target.value) })}
                  >
                    <option value="">Todos</option>
                    {DAYS_OF_WEEK.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Hora inicial</Label>
                  <Input
                    type="time"
                    value={row.startTime ?? ''}
                    onChange={(event) => updateSchedule(index, { startTime: event.target.value || null })}
                  />
                  <FieldIssues issues={issues} field={`schedules[${index}].startTime`} />
                </div>
                <div className="space-y-1.5">
                  <Label>Hora final</Label>
                  <div className="flex gap-2">
                    <Input
                      type="time"
                      value={row.endTime ?? ''}
                      onChange={(event) => updateSchedule(index, { endTime: event.target.value || null })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Eliminar horario ${index + 1}`}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          schedules: current.schedules.filter((_, rowIndex) => rowIndex !== index),
                        }))
                      }
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                  <FieldIssues issues={issues} field={`schedules[${index}].endTime`} />
                </div>
              </div>
              <FieldIssues issues={issues} field={`schedules[${index}]`} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Truck size={18} />
            <CardTitle>Reglas vehiculares</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  vehicleRules: [...current.vehicleRules, emptyVehicleRuleDraft()],
                }))
              }
            >
              <CirclePlus size={13} className="mr-1.5" />
              Agregar regla
            </Button>
          </div>
          <CardDescription>
            Sin filas aplica a toda la flota. Los campos de una regla se combinan con AND; las reglas, con OR.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {draft.vehicleRules.length === 0 && (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Toda la flota.</div>
          )}
          {draft.vehicleRules.map((row, index) => (
            <div key={row.id ?? `vehicle-rule-${index}`} className="rounded-lg border bg-muted/20 p-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label>Último dígito</Label>
                  <select
                    className={selectClassName}
                    value={row.plateLastDigit ?? ''}
                    onChange={(event) =>
                      updateVehicleRule(index, { plateLastDigit: parseOptionalNumber(event.target.value) })
                    }
                  >
                    <option value="">Cualquiera</option>
                    {Array.from({ length: 10 }, (_, digit) => (
                      <option key={digit} value={digit}>{digit}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Capacidad mínima (kg)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={row.minCapacityWeightKg ?? ''}
                    onChange={(event) =>
                      updateVehicleRule(index, { minCapacityWeightKg: parseOptionalNumber(event.target.value) })
                    }
                  />
                  <FieldIssues issues={issues} field={`vehicleRules[${index}].minCapacityWeightKg`} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo de camión</Label>
                  <Input
                    value={row.truckType ?? ''}
                    maxLength={50}
                    onChange={(event) => updateVehicleRule(index, { truckType: event.target.value || null })}
                    placeholder="Ej. FRIGORÍFICO"
                  />
                  <FieldIssues issues={issues} field={`vehicleRules[${index}].truckType`} />
                </div>
                <div className="space-y-1.5">
                  <Label>Placa exacta</Label>
                  <div className="flex gap-2">
                    <Input
                      value={row.plate ?? ''}
                      maxLength={20}
                      onChange={(event) => updateVehicleRule(index, { plate: event.target.value || null })}
                      placeholder="1234-ABC"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Eliminar regla vehicular ${index + 1}`}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          vehicleRules: current.vehicleRules.filter((_, rowIndex) => rowIndex !== index),
                        }))
                      }
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                  <FieldIssues issues={issues} field={`vehicleRules[${index}].plate`} />
                </div>
              </div>
              <FieldIssues issues={issues} field={`vehicleRules[${index}]`} />
            </div>
          ))}

          <div className="rounded-lg border bg-muted/20 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Preview de flota</span>
              {previewAvailable && !hasEmptyVehicleRule && (
                <Badge variant="outline">
                  {affectedTrucks.length} de {CAMIONES.length} camiones
                </Badge>
              )}
            </div>
            {!previewAvailable ? (
              <p className="mt-1 text-muted-foreground">
                La flota local solo representa a {DISTRIBUIDORAS[0]?.nombre}; no se simulan resultados para otra distribuidora.
              </p>
            ) : hasEmptyVehicleRule ? (
              <p className="mt-1 text-muted-foreground">Complete o elimine la fila vacía para calcular el preview.</p>
            ) : (
              <p className="mt-1 text-muted-foreground">
                {affectedTrucks.length > 0
                  ? affectedTrucks.map((truck) => truck.placa).join(', ')
                  : 'Ningún camión de demostración coincide.'}
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Resultado informativo; no cambia la selección de flota ni la optimización.
            </p>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
