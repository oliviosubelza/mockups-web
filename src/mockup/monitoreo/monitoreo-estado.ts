// Vocabulario de estados de una ENTREGA (una parada de una orden de transporte) y su codificación
// visual. Este archivo es la ÚNICA fuente de verdad del encoding: el badge de la lista, el pin del
// mapa y la leyenda leen todos de acá. Si el color del pin y el del badge se definieran por separado,
// se desincronizan a la primera corrección — y el usuario paga el costo de traducir entre lista y mapa.
//
// Los valores SQL (CREATED, ENROUTE, ARRIVED, DELIVERED, FAILED, RETURNED) son una convención del
// FRONTEND: no hay CHECK que los respalde. `delivery_orders.status` es VARCHAR(50) NOT NULL y
// `delivery_order_histories.status` es VARCHAR(100) NOT NULL (UltimaVersion.sql:392 y :482) — ninguna
// de las dos declara dominio. Es un hueco abierto del esquema, el mismo que
// `diagrams/monitoreo/Frontend.md:163` lista como `delivery_result_code` sin dominio: sin catálogo, el
// dominio real de los estados lo fija este archivo y nada impide que el backend escriba otra cosa.

export type EstadoEntrega = 'pendiente' | 'en_camino' | 'en_sitio' | 'entregado' | 'fallido' | 'devuelto'

export interface EstadoEntregaMeta {
  label: string
  /** Valor que viaja en `delivery_orders.status`. Documenta el mapeo UI ↔ BD. */
  sql: 'CREATED' | 'ENROUTE' | 'ARRIVED' | 'DELIVERED' | 'FAILED' | 'RETURNED'
  /**
   * Parada CERRADA: el camión ya no vuelve. Es el canal que se lee SIN distinguir color — el estado se
   * codifica por COLOR + INSIGNIA, y la insignia (`simbolo`: ✓ / ✕ / ↩) aparece solo cuando la parada
   * cerró. El relleno del pin ya NO codifica nada: dentro de una chapa blanca, un círculo hueco se
   * confundía con el fondo. Así el progreso del viaje se lee de un vistazo aunque el usuario no
   * distinga ningún matiz (entre 5% y 8% de los hombres tiene algún daltonismo).
   */
  cerrada: boolean
  /** Color del pin en el mapa. */
  color: string
  /** Clases del badge en la lista y el panel. */
  badge: string
  /** Símbolo dentro del pin. `null` = se muestra el número de secuencia. */
  simbolo: string | null
}

export const ESTADO_ENTREGA: Record<EstadoEntrega, EstadoEntregaMeta> = {
  pendiente: {
    label: 'Pendiente',
    sql: 'CREATED',
    cerrada: false,
    color: '#94a3b8',
    badge: 'border-border bg-muted text-muted-foreground',
    simbolo: null,
  },
  en_camino: {
    label: 'En camino',
    sql: 'ENROUTE',
    cerrada: false,
    color: '#2563eb',
    badge: 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',
    simbolo: null,
  },
  en_sitio: {
    label: 'En el punto',
    sql: 'ARRIVED',
    cerrada: false,
    color: '#2563eb',
    badge: 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',
    simbolo: null,
  },
  entregado: {
    label: 'Entregado',
    sql: 'DELIVERED',
    cerrada: true,
    color: '#16a34a',
    badge: 'border-primary/30 bg-primary/10 text-primary',
    simbolo: '✓',
  },
  fallido: {
    label: 'No entregado',
    sql: 'FAILED',
    cerrada: true,
    color: '#dc2626',
    badge: 'border-destructive/30 bg-destructive/10 text-destructive',
    simbolo: '✕',
  },
  devuelto: {
    label: 'Devuelto',
    sql: 'RETURNED',
    cerrada: true,
    color: '#f59e0b',
    badge: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
    simbolo: '↩',
  },
}

/** Orden de lectura para la leyenda y los conteos (del principio al final del ciclo). */
export const ESTADOS_ENTREGA: EstadoEntrega[] = [
  'pendiente',
  'en_camino',
  'en_sitio',
  'entregado',
  'fallido',
  'devuelto',
]

/** Estado del VIAJE (`trips.status`). Es otro eje: agrupa entregas, no las reemplaza. */
export type EstadoViaje = 'pendiente' | 'en_ruta' | 'finalizado'

// OJO con los `sql` de abajo: `trips.status` es VARCHAR(50) sin CHECK y lo único que hay escrito es un
// ejemplo — `-- Ej: PENDING, LOADING, DISPATCHED` (UltimaVersion.sql:214). O sea que EN_RUTA y
// FINALIZADO no coinciden con ese ejemplo y PENDING sí, pero por casualidad: el dominio de
// `trips.status` todavía no está declarado en ninguna parte. Cuando se defina hay que alinear estos
// valores; cambiarlos ahora sería adivinar.

export const ESTADO_VIAJE: Record<EstadoViaje, { label: string; sql: string; badge: string }> = {
  pendiente: { label: 'Sin salir', sql: 'PENDING', badge: 'border-border bg-muted text-muted-foreground' },
  en_ruta: {
    label: 'En ruta',
    sql: 'EN_RUTA',
    badge: 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  },
  finalizado: { label: 'Finalizado', sql: 'FINALIZADO', badge: 'border-primary/30 bg-primary/10 text-primary' },
}
