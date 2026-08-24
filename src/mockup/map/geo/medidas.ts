// CUÁNTO MIDE un polígono de zona: su superficie y el largo de su contorno.
//
// QUÉ PROBLEMA RESUELVE. El editor de zonas dejaba dibujar a ciegas: se ponían vértices sobre las calles
// y el único número en pantalla era la holgura con la vecina. "¿Esta zona es más grande que la de al
// lado?" y "¿esto son diez manzanas o media ciudad?" solo se podían contestar comparando siluetas a ojo,
// y a ojo el zoom miente — el mismo polígono parece un barrio o un departamento según cuánto acerques.
// Con el área a la vista, el tamaño deja de depender de la escala a la que estés mirando.
//
// LA PROYECCIÓN SALE DE `holgura.ts` Y NO SE REIMPLEMENTA ACÁ, aunque sean cuatro líneas. Ese módulo ya
// decidió cómo se pasa de grados a metros en este proyecto (equirrectangular local, anclada a una
// latitud de referencia, ~0,3 % de error a escala de ciudad) y por qué el cálculo va en metros y no en
// grados ni en píxeles. Una segunda conversión acá haría que el área y la holgura hablaran de dos mapas
// apenas distintos: el borde podría cumplir el mínimo según un módulo y no según el otro, y esa clase de
// desacuerdo no se descubre nunca porque los dos números se ven razonables.
//
// TAMPOCO SE AGREGA TURF. Es ~90 kB para dos fórmulas de diez líneas, y traería su propio criterio de
// proyección —geodésico sobre el elipsoide— que da un número distinto del que usa la validación. Precisión
// que no cambia ninguna decisión, a cambio de la incoherencia que el párrafo de arriba viene a evitar.
import { M_POR_GRADO_LAT, metrosPorGradoLng } from './holgura'
import type { LatLngTuple } from './polyline'

interface Plano {
  x: number
  y: number
}

/**
 * El anillo en metros, anclado a su latitud MEDIA y no a la del primer vértice.
 *
 * La media es lo correcto para una figura cerrada: el error de la proyección crece con la distancia a la
 * latitud de referencia, así que anclarla a un extremo lo reparte todo hacia el otro lado en vez de
 * repartirlo a los dos. A escala de zona la diferencia es despreciable; la elección igual es gratis.
 */
function proyectar(anillo: LatLngTuple[]): Plano[] {
  const latRef = anillo.reduce((suma, [lat]) => suma + lat, 0) / anillo.length
  const kLng = metrosPorGradoLng(latRef)
  return anillo.map(([lat, lng]) => ({ x: lng * kLng, y: lat * M_POR_GRADO_LAT }))
}

/**
 * Superficie encerrada por el anillo, en km².
 *
 * Fórmula del cordón (shoelace) sobre las coordenadas ya proyectadas, en VALOR ABSOLUTO: el signo del
 * cordón dice si el anillo está dibujado en sentido horario o antihorario, y acá eso no significa nada.
 * El editor deja poner los vértices en cualquiera de los dos sentidos —se dibuja siguiendo las calles, no
 * respetando una convención— así que sin el `abs` la mitad de las zonas mostrarían el área en negativo.
 *
 * El anillo se toma CERRADO aunque venga abierto (que es como lo guarda `poligonoALatLng`): el módulo se
 * encarga de unir el último vértice con el primero. Menos de tres vértices no encierran nada, y devolver
 * 0 en vez de `null` es lo que hace que el HUD pueda mostrar el número desde el primer click sin un caso
 * especial por cada consumidor.
 */
export function areaKm2(anillo: LatLngTuple[]): number {
  if (anillo.length < 3) return 0
  const p = proyectar(anillo)
  let doble = 0
  for (let i = 0; i < p.length; i++) {
    const a = p[i]
    const b = p[(i + 1) % p.length]
    doble += a.x * b.y - b.x * a.y
  }
  return Math.abs(doble) / 2 / 1_000_000
}

/**
 * Largo del contorno, en metros.
 *
 * Con tres vértices o más se mide CERRADO —incluyendo el lado que une el último con el primero—, que es
 * el mismo criterio con el que `evaluarContorno` valida un trazo todavía en curso: lo que se muestra
 * mientras dibujás es la forma que se guardaría si apretaras Guardar ahora, no la polilínea abierta.
 * Medir el trazo abierto haría que el número pegara un salto al cerrar el polígono, justo cuando ya no
 * se lo está mirando.
 *
 * Con exactamente dos vértices no hay anillo que cerrar y el segmento se cuenta UNA vez: cerrarlo lo
 * contaría dos y el primer tramo dibujado aparecería midiendo el doble de lo que mide.
 */
export function perimetroM(anillo: LatLngTuple[]): number {
  if (anillo.length < 2) return 0
  const p = proyectar(anillo)
  const cerrado = p.length >= 3
  const hasta = cerrado ? p.length : p.length - 1
  let total = 0
  for (let i = 0; i < hasta; i++) {
    const a = p[i]
    const b = p[(i + 1) % p.length]
    total += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return total
}

/**
 * Superficie para leer de un vistazo. Coma decimal (es-BO) y la unidad que corresponda.
 *
 * Recibe km² —lo que devuelve `areaKm2`— y decide sola si los muestra en m². El corte está en 0,01 km²
 * (una hectárea) porque debajo de ahí los km² se convierten en ceros: una manzana son ~0,01 km², y media
 * manzana redondeada a dos decimales daría "0,00 km²", que es exactamente el momento en que el número
 * deja de informar. Un cuadrado de 50 m de lado se lee mucho mejor como "2.500 m²".
 *
 * Dos decimales y no tres: el tercero son 1.000 m² de precisión sobre una zona de reparto, y ninguna
 * decisión de esta pantalla se juega ahí. Es el mismo criterio que `formatearMetros` en `holgura.ts`
 * —decimales donde se decide algo, ninguno donde solo hacen ruido—, y por eso el perímetro no tiene su
 * propio formateador acá: se muestra con esa función, que ya resuelve el salto de metros a kilómetros.
 */
export function formatearArea(km2: number): string {
  if (km2 < 0.01) return `${Math.round(km2 * 1_000_000).toLocaleString('es-BO')} m²`
  return `${km2.toFixed(2).replace('.', ',')} km²`
}
