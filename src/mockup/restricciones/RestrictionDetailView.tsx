import { useState } from 'react'
import { ArrowLeft, CalendarClock, Pencil, Power, ShieldAlert, Trash2, Truck } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useRouteParams } from '@/core/routing/active-route'
import { DISTRIBUIDORAS } from '../mock-data'
import { navigateTo } from '../routes'
import {
  DAYS_OF_WEEK,
  RESTRICTION_EFFECT_META,
  RESTRICTION_SEVERITY_META,
  RESTRICTION_TYPE_META,
  formatAuditDate,
  firstNumericBlockLastDigit,
  restrictionMatchesMoment,
  type PlanningRestrictionSchedule,
  type PlanningRestrictionVehicleRule,
} from './domain'
import { RestrictionMap } from './RestrictionMap'
import { usePlanningRestrictionsStore } from './store'

function scheduleText(row: PlanningRestrictionSchedule): string {
  const parts: string[] = []
  if (row.validFrom || row.validTo) parts.push(`${row.validFrom ?? 'sin inicio'} → ${row.validTo ?? 'sin fin'}`)
  if (row.dayOfWeek !== null) parts.push(DAYS_OF_WEEK.find((day) => day.value === row.dayOfWeek)?.label ?? '')
  if (row.startTime || row.endTime) parts.push(`${row.startTime ?? '00:00'} → ${row.endTime ?? '24:00'}`)
  return parts.filter(Boolean).join(' · ') || 'Todos los días y horas'
}

function vehicleRuleText(row: PlanningRestrictionVehicleRule): string {
  const parts: string[] = []
  if (row.plateLastDigit !== null) parts.push(`primer bloque numérico termina en ${row.plateLastDigit}`)
  if (row.minCapacityWeightKg !== null) parts.push(`capacidad ≥ ${row.minCapacityWeightKg.toLocaleString('es-BO')} kg`)
  if (row.truckType) parts.push(`tipo ${row.truckType}`)
  if (row.plate) parts.push(`placa ${row.plate}`)
  return parts.join(' Y ') || 'Cualquier vehículo'
}

export function RestrictionDetailView() {
  const { restrictionId } = useRouteParams()
  const id = Number(restrictionId)
  const restriction = usePlanningRestrictionsStore((state) =>
    state.restrictions.find((candidate) => candidate.id === id),
  )
  const setRestrictionActive = usePlanningRestrictionsStore((state) => state.setRestrictionActive)
  const softDeleteRestriction = usePlanningRestrictionsStore((state) => state.softDeleteRestriction)
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (!restriction || restriction.deletedAt !== null) {
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

  const activeSchedules = restriction.schedules.filter((row) => row.deletedAt === null)
  const activeRules = restriction.vehicleRules.filter((row) => row.deletedAt === null)
  const now = new Date()
  const currentDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const appliesNow = restrictionMatchesMoment(restriction, { date: currentDate, time: currentTime })
  const distributor = DISTRIBUIDORAS.find((item) => item.id === restriction.distributorId)

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 pb-8">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigateTo('restricciones')}>
          <ArrowLeft size={14} className="mr-1.5" />
          Catálogo
        </Button>
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold tracking-tight">{restriction.name}</h2>
          <p className="text-sm text-muted-foreground">ID {restriction.id} · {distributor?.nombre ?? restriction.distributorId}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setRestrictionActive(restriction.id, !restriction.isActive)
              toast.success(restriction.isActive ? 'Restricción desactivada' : 'Restricción activada')
            }}
          >
            <Power size={13} className="mr-1.5" />
            {restriction.isActive ? 'Desactivar' : 'Activar'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateTo('restriccion-editar', { restrictionId: String(restriction.id) })}
          >
            <Pencil size={13} className="mr-1.5" />
            Editar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 size={13} className="mr-1.5" />
            Eliminar
          </Button>
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminar «{restriction.name}»</AlertDialogTitle>
                <AlertDialogDescription>
                  La baja será lógica e incluirá sus horarios y reglas vehiculares activas.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    softDeleteRestriction(restriction.id)
                    toast.success('Restricción eliminada')
                    navigateTo('restricciones')
                  }}
                >
                  Eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{RESTRICTION_TYPE_META[restriction.restrictionType].label}</Badge>
              <Badge variant="outline">{RESTRICTION_EFFECT_META[restriction.effect].label}</Badge>
              <Badge
                variant="outline"
                className={cn(
                  restriction.severity === 'BLOCKING'
                    ? 'border-destructive/30 bg-destructive/10 text-destructive'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
                )}
              >
                {RESTRICTION_SEVERITY_META[restriction.severity].label}
              </Badge>
              <Badge variant={restriction.isActive ? 'default' : 'secondary'}>
                {restriction.isActive ? 'Activa' : 'Inactiva'}
              </Badge>
            </div>
            <CardTitle className="pt-2">Alcance declarado</CardTitle>
            <CardDescription>{restriction.description || 'Sin descripción adicional.'}</CardDescription>
          </CardHeader>
          <CardContent>
            <RestrictionMap
              restrictionType={restriction.restrictionType}
              geometry={restriction.geometryGeoJson}
              readOnly
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2"><CalendarClock size={18} /><CardTitle>Vigencia</CardTitle></div>
              <CardDescription>
                {appliesNow ? 'Coincide con el momento actual.' : 'No coincide con el momento actual.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {activeSchedules.length === 0 ? (
                <p className="rounded-md bg-muted p-3">Permanente: no tiene filas horarias.</p>
              ) : activeSchedules.map((row) => (
                <p key={row.id} className="rounded-md border p-3">{scheduleText(row)}</p>
              ))}
              <p className="text-xs text-muted-foreground">AND dentro de cada fila; OR entre filas.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2"><Truck size={18} /><CardTitle>Vehículos</CardTitle></div>
              <CardDescription>
                La placa usa el último dígito del primer bloque numérico, por ejemplo 1234-ABC → {firstNumericBlockLastDigit('1234-ABC')}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {activeRules.length === 0 ? (
                <p className="rounded-md bg-muted p-3">Toda la flota: no tiene reglas vehiculares.</p>
              ) : activeRules.map((row) => (
                <p key={row.id} className="rounded-md border p-3">{vehicleRuleText(row)}</p>
              ))}
              <p className="text-xs text-muted-foreground">AND dentro de cada regla; OR entre reglas.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2"><ShieldAlert size={18} /><CardTitle>Auditoría local</CardTitle></div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">Creación</span><span className="text-right">{restriction.createdBy}<br />{formatAuditDate(restriction.createdAt)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">Actualización</span><span className="text-right">{restriction.updatedBy}<br />{formatAuditDate(restriction.updatedAt)}</span></div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
