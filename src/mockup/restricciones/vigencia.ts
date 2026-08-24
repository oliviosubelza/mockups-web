// CUÁNDO rige una restricción. Es el eje temporal, y vive aparte a propósito: lo comparten los tres
// tipos de restricción de la planificación —zonas restringidas, vías cerradas y placas de circulación—
// que por lo demás no se parecen en nada.
//
// POR QUÉ UNA LISTA DE VENTANAS Y NO COLUMNAS. La tentación es meterle a cada restricción un `desde`,
// un `hasta` y un par de horas. Con eso no entra el caso más común de todos: "lunes y martes de 7 a 9,
// y sábados de 8 a 12" son TRES reglas distintas sobre la misma restricción. Con columnas hay que
// inventar `horario2`, `horario3`, y ahí se termina. Con una lista, la respuesta es tres filas.
//
// LAS TRES REGLAS DE COMBINACIÓN, que son toda la semántica del módulo:
//   1. SIN VENTANAS = PERMANENTE. Una restricción sin nada cargado rige siempre. Es el default y es el
//      correcto: alguien que crea un centro histórico cerrado y no toca la vigencia quiere que esté
//      cerrado, no que no rija nunca.
//   2. DENTRO de una ventana, los ejes se combinan con Y. `{ dias: [1], horaInicio: '07:00' }` es
//      "los lunes, de 7 en adelante", no "los lunes O de 7 en adelante".
//   3. ENTRE ventanas, O. Alcanza con que UNA rija para que la restricción rija.
//
// Cada eje que se deja vacío NO estrecha: sin días es todos los días, sin horas son las 24 h, sin
// fechas es para siempre. Así una ventana vacía equivale a "permanente" y no hay dos formas de decir
// lo mismo con resultados distintos.
import type { Momento } from './momento'

/** Día de la semana, con la convención de `Date.getDay()`: 0 = domingo … 6 = sábado. */
export type DiaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6

export const DIAS_SEMANA: { valor: DiaSemana; corto: string; label: string }[] = [
  { valor: 1, corto: 'Lu', label: 'Lunes' },
  { valor: 2, corto: 'Ma', label: 'Martes' },
  { valor: 3, corto: 'Mi', label: 'Miércoles' },
  { valor: 4, corto: 'Ju', label: 'Jueves' },
  { valor: 5, corto: 'Vi', label: 'Viernes' },
  { valor: 6, corto: 'Sá', label: 'Sábado' },
  // El domingo va ÚLTIMO aunque `getDay()` lo numere 0: la semana laboral empieza el lunes y una lista
  // que arranca en domingo se lee mal en una pantalla de logística. El orden de esta constante es el de
  // la UI; el número sigue siendo el de `Date`.
  { valor: 0, corto: 'Do', label: 'Domingo' },
]

/**
 * Una ventana de vigencia. Todos los ejes son opcionales y cada uno que se completa ESTRECHA.
 *
 * Las fechas van en ISO `YYYY-MM-DD` y las horas en `HH:MM`, las dos como texto. No es pereza: en ese
 * formato la comparación lexicográfica y la cronológica son la misma, así que alcanza con `<=` y no
 * hace falta construir un `Date` —que arrastraría zona horaria y convertiría "el martes" en "el lunes
 * a las 21" según dónde esté corriendo el navegador—.
 */
export interface VentanaVigencia {
  id: string
  /** Primer día en que rige, inclusive. `null` = sin inicio. */
  desde: string | null
  /** Último día en que rige, inclusive. `null` = sin fin. */
  hasta: string | null
  /** Días de la semana en que rige. Vacío = todos. */
  dias: DiaSemana[]
  /** Comienzo de la franja horaria, `HH:MM`. `null` = desde las 00:00. */
  horaInicio: string | null
  /** Fin de la franja horaria, `HH:MM`, EXCLUSIVO. `null` = hasta las 24:00. */
  horaFin: string | null
}

export function ventanaVacia(id: string): VentanaVigencia {
  return { id, desde: null, hasta: null, dias: [], horaInicio: null, horaFin: null }
}

/**
 * Día de la semana de una fecha ISO, SIN pasar por `new Date(iso)`.
 *
 * `new Date('2026-08-25')` parsea como UTC medianoche, así que en cualquier huso al oeste de Greenwich
 * —el nuestro, UTC-4— devuelve el día ANTERIOR en hora local. Una restricción de martes evaluada así
 * se aplicaría los lunes, y el bug no se ve hasta que alguien se queda sin camiones el día equivocado.
 * Con los componentes separados el `Date` se construye en hora local y el día es el que dice el texto.
 */
export function diaSemanaDe(fechaIso: string): DiaSemana {
  const [y, m, d] = fechaIso.split('-').map(Number)
  return new Date(y, m - 1, d).getDay() as DiaSemana
}

/** ¿La franja envuelve la medianoche? `22:00 → 06:00` sí; `07:00 → 19:00` no. */
function envuelveMedianoche(inicio: string, fin: string): boolean {
  return inicio > fin
}

/**
 * ¿La hora cae dentro de la franja? Inicio inclusivo, fin exclusivo.
 *
 * EL CASO QUE SE OLVIDA SIEMPRE es la franja que cruza la medianoche (una restricción nocturna de 22 a
 * 6). Con una comparación ingenua `inicio <= h && h < fin` esa ventana no rige NUNCA, porque no hay
 * hora que sea a la vez mayor que 22:00 y menor que 06:00. Se detecta por `inicio > fin` y ahí la
 * condición se da vuelta: rige desde el inicio hasta la medianoche, O desde la medianoche hasta el fin.
 *
 * Cuando envuelve, `dias` se refiere al día en que la franja EMPIEZA. Una restricción de "sábados de
 * 22 a 6" rige el sábado a las 23 y el domingo a la 1 — y así es como la gente la describe.
 */
function horaEnFranja(hora: string, inicio: string | null, fin: string | null): boolean {
  if (!inicio && !fin) return true
  const desde = inicio ?? '00:00'
  const hasta = fin ?? '24:00'
  return envuelveMedianoche(desde, hasta) ? hora >= desde || hora < hasta : hora >= desde && hora < hasta
}

/**
 * ¿Esta ventana rige en ese momento?
 *
 * SIN HORA EN EL MOMENTO, una ventana con franja horaria SÍ cuenta, con que coincida el día. Es la
 * respuesta conservadora y es la que necesita la planificación: el plan es "del martes", no "del martes
 * a las 14:30", y una restricción que rige los martes de 7 a 19 le afecta el día entero de trabajo.
 * Contestar que no rige escondería la restricción justo en el único momento en que se puede evitar.
 */
export function ventanaRigeEn(v: VentanaVigencia, momento: Momento): boolean {
  if (v.desde && momento.fecha < v.desde) return false
  if (v.hasta && momento.fecha > v.hasta) return false
  if (v.dias.length > 0 && !v.dias.includes(diaSemanaDe(momento.fecha))) return false
  if (momento.hora === undefined) return true
  return horaEnFranja(momento.hora, v.horaInicio, v.horaFin)
}

/** ¿La restricción rige en ese momento? Sin ventanas = permanente. Entre ventanas, O. */
export function vigenteEn(ventanas: VentanaVigencia[], momento: Momento): boolean {
  if (ventanas.length === 0) return true
  return ventanas.some((v) => ventanaRigeEn(v, momento))
}

/** Una ventana que no puede regir nunca. Se avisa al editar; no se bloquea el guardado de la pantalla
 *  entera por una fila mal cargada, que es la forma más rápida de dejar a alguien sin salida. */
export function motivoVentanaImposible(v: VentanaVigencia): string | null {
  if (v.desde && v.hasta && v.hasta < v.desde) return 'La fecha de fin es anterior a la de inicio'
  // Franja de duración cero. No se chequea `inicio > fin` porque eso es la franja nocturna, que es
  // válida y frecuente — ver `envuelveMedianoche`.
  if (v.horaInicio && v.horaFin && v.horaInicio === v.horaFin) return 'La franja horaria empieza y termina a la misma hora'
  return null
}

// ── Descripción legible ────────────────────────────────────────────────────────────────────────
// Una restricción que no se puede leer de un vistazo no se audita, y una regla de circulación mal
// cargada no se descubre hasta que hay un camión parado. Por eso el texto se arma acá y no en cada
// pantalla: la lista, el detalle y el aviso del planificador tienen que decir exactamente lo mismo.

function diaCorto(d: DiaSemana): string {
  return DIAS_SEMANA.find((x) => x.valor === d)?.corto ?? '?'
}

/** `[1,2,3,4,5]` → `Lu a Vi`. Solo colapsa si los días son consecutivos EN EL ORDEN DE LA UI (lunes
 *  primero), que es como se leen: "Lu a Vi" es una frase, "Do, Lu, Ma" son tres días sueltos. */
function describirDias(dias: DiaSemana[]): string {
  if (dias.length === 0) return ''
  const orden = DIAS_SEMANA.map((d) => d.valor)
  const idx = dias.map((d) => orden.indexOf(d)).sort((a, b) => a - b)
  const consecutivos = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1)
  if (dias.length === 7) return 'Todos los días'
  if (consecutivos && dias.length > 2) return `${diaCorto(orden[idx[0]])} a ${diaCorto(orden[idx[idx.length - 1]])}`
  return idx.map((i) => diaCorto(orden[i])).join(', ')
}

function describirFechas(desde: string | null, hasta: string | null): string {
  const legible = (iso: string) => {
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y.slice(2)}`
  }
  if (desde && hasta) return `del ${legible(desde)} al ${legible(hasta)}`
  if (desde) return `desde el ${legible(desde)}`
  if (hasta) return `hasta el ${legible(hasta)}`
  return ''
}

function describirHoras(inicio: string | null, fin: string | null): string {
  if (inicio && fin) return `${inicio}–${fin}`
  if (inicio) return `desde las ${inicio}`
  if (fin) return `hasta las ${fin}`
  return ''
}

export function describirVentana(v: VentanaVigencia): string {
  const partes = [describirDias(v.dias), describirHoras(v.horaInicio, v.horaFin), describirFechas(v.desde, v.hasta)]
  const texto = partes.filter(Boolean).join(' · ')
  return texto || 'Siempre'
}

/** Resumen de toda la vigencia, para una fila de listado. */
export function describirVigencia(ventanas: VentanaVigencia[]): string {
  if (ventanas.length === 0) return 'Permanente'
  if (ventanas.length === 1) return describirVentana(ventanas[0])
  // Con tres o más ventanas la frase entera no entra en una fila y enumerarlas no ayuda: lo que hace
  // falta ahí es entrar al detalle. El conteo dice que hay más para ver.
  if (ventanas.length === 2) return ventanas.map(describirVentana).join(' + ')
  return `${ventanas.length} franjas`
}
