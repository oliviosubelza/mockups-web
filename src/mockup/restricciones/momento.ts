// EL MOMENTO contra el que se evalúa una restricción. Un tipo de tres líneas que existe por una razón
// concreta: sin él, cada pantalla decidía por su cuenta contra qué comparar, y "hoy" no es la respuesta.
//
// La planificación es una actividad de VÍSPERA: se arma hoy el reparto de mañana. Una restricción de
// "los martes no circula el dígito 3" hay que evaluarla contra la fecha OPERATIVA del plan, no contra
// el día en que alguien está sentado frente a la pantalla. Evaluar contra hoy da la respuesta correcta
// solo un día de cada siete, y el error es invisible: el mapa se ve igual, la flota se ve igual, y el
// camión aparece en el retén.
import { fechaDelPlanNuevo } from '../planes-store'

export interface Momento {
  /** Día operativo, ISO `YYYY-MM-DD`. */
  fecha: string
  /**
   * Hora `HH:MM`, opcional.
   *
   * Que sea opcional NO es dejarlo para después: la planificación trabaja con el DÍA entero y no tiene
   * una hora que ofrecer —el camión sale a la mañana y vuelve a la tarde—. La hora aparece más adelante,
   * cuando se evalúa una parada puntual contra su ventana de entrega. Ver `ventanaRigeEn` para qué pasa
   * cuando no está.
   */
  hora?: string
}

/**
 * El momento del plan que se está armando.
 *
 * La fecha sale de `planes-store` y no de `new Date()`: es la MISMA que se va a guardar en
 * `dispatch_plans.plan_date`, y tenerla en un solo lugar es lo que evita que la pantalla evalúe las
 * restricciones de un día y el plan quede grabado con otro.
 */
export function momentoDelPlan(): Momento {
  return { fecha: fechaDelPlanNuevo() }
}
