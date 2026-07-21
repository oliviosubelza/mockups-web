/** Estados de carga que un tablero puede retratar (los que no se pueden producir clickeando). */
export type BoardState = 'default' | 'loading' | 'error' | 'empty'

/** Fase del flujo de despacho: 0 = camiones + pedidos (incluye traslados como sub-paso), 1 =
 *  planificación, 2 = órdenes. El antiguo Step 2 "Traslados" se retiró del wizard. */
export type Fase = 0 | 1 | 2

/** Las dos caras de la fase de planificación: el plan (split mapa + lista) y las corridas. */
export type PlanningTab = 'mapa' | 'corridas'

/** Las dos caras de la fase de transferencias: entre agencias vs devoluciones por cliente. */
export type TransferTab = 'transferencias' | 'devoluciones'

/** Una vista del mockup: o la lista de planes (entrada), o una fase del flujo. */
export type Vista = 'planes' | 'flujo'
