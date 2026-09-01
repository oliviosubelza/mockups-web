25 Detalle del viaje (snapshot + SSE)
Endpoint.
Tipo: (HTTP) GET /monitoring/orders/{transportOrderId}

Obtener TODO lo de una salida en una sola respuesta: el recorrido planificado, las paradas con su estado y su evidencia, y la última posición conocida del camión. Es la pantalla de mapa (M3 de Monitoreo.drawio, /monitoreo/seguimiento/:ordenId).

Por qué la sección es la 25. El documento técnico oficial ocupa las secciones 1-19, 21 y 22, y GinoDiagramas.drawio agrega la 23. El monitoreo ya se quedó con la 19 (listado, que el doc oficial llama "Obtener ordenes Despachadas", p. 96) y con la 24 (ping del camión). La 25 es la siguiente libre; la 20 se deja para el doc oficial, que es el único hueco que le queda entre su 19 y su 21.

El recurso es la ORDEN, la clave del tracking es la RUTA. Esa asimetría es de v0.0.3 y no un descuido: la URL lleva el transportOrderId porque es el documento que el planificador abrió desde el listado, mientras que la posición se guarda por routeId porque es lo que físicamente se mueve (ver 19 C. putItem(TRAZA) 19.5). El puente cuesta cero consultas extra: transport_order.route_id (../../UltimaVersion.sql:286) viene en la misma fila que este flujo necesita leer igual para armar la cabecera.

Numeración de los pasos
El diagrama M3 tiene las secciones M3.1 / M3.2 / M3.3 pero todavía no tiene los números de paso, así que esta tabla es la que hay que estampar en el .drawio para que las dos cosas se puedan cruzar. Convención del archivo: se numeran las llamadas, no los retornos; los sub-pasos llevan sufijo de letra.

Paso	Etiqueta en el diagrama	Lifeline destino
25.1	GET /monitoring/orders/{transportOrderId}	Gateway Controller
25.2	getOrderDetail(transportOrderId)	Monitoring Controller
25.3	getOrderDetail(transportOrderId)	Monitoring Service
25.4	findOrderWithRoute(transportOrderId)	Transport Order DB — falta la lifeline
25.5	findSelectedRoute(routeId)	Route DB
25.5a	join trucks ON routes.truck_id	Truck DB — falta la lifeline
25.6	findRouteDeliveryPoints(routeId)	Route Delivery Point DB
25.7	findDispatchPoints(dispatchDeliveryPointIds)	Dispatch Delivery Point DB
25.7a	findCandidateOrders(dispatchDeliveryPointIds)	Candidate Order DB — falta la lifeline
25.8	getDeliveryPoints(deliveryPointIds)	01 DeliveryPoint (servicio externo) — falta la lifeline
25.9	findDeliveriesByOrder(transportOrderId)	Delivery Order DB
25.9a	findItemsByDeliveryIds(deliveryOrderIds)	Delivery Order Item DB — falta la lifeline
25.9b	findIncidentsByDeliveryIds(deliveryOrderIds)	Delivery Incident DB — falta la lifeline
25.9c	findPodsByDeliveryIds(deliveryOrderIds)	Proof Of Delivery DB — falta la lifeline
25.9d	findHistoriesByDeliveryIds(deliveryOrderIds)	Delivery Order History DB — falta la lifeline
25.10	query(PK=ROUTE#{routeId})	Truck Tracking (DynamoDB)
25.11	buildDetail(...)	auto-llamada del Service
25.12	GET /monitoring/orders/{transportOrderId}/stream	Gateway Controller
25.13	openDetailStream(transportOrderId)	Monitoring Controller
25.14	subscribe(ROUTE#{routeId} + ORDER#{transportOrderId})	SSE Hub
25.15	event: tracking	Frontend
25.16	event: delivery_started	Frontend
25.17	event: delivery_closed	Frontend
25.18	patchByRouteId / patchByDeliveryOrderId	Frontend (auto-llamada)
25.19	GET /monitoring/orders/{transportOrderId} (se RE-PIDE el snapshot)	Gateway Controller
Nueve pasos de esta lista no están dibujados, y los nueve son consultas reales: 25.4 (resolver la orden y su ruta), 25.5a (la placa contra trucks), 25.7a (los pedidos de cada parada), 25.8 (las coordenadas, que es la dependencia que sostiene el mapa entero) y los cuatro 25.9a-d (ítems, incidencias, comprobantes e historial). En el diagrama de hoy esos cuatro viajan implícitos en el paso 25.9 contra Delivery Order DB, lo que contradice la regla de "una lifeline por tabla" — y es justamente lo que hacía imposible ver de dónde sale el comprobante. Acá cada uno es un paso con su DTO y su JSON.

¿Dónde está el endpoint de los comprobantes? No hay: vienen todos acá
Las cuatro pestañas del panel de detalle —Historial, Incidencias, Comprobante, Pedido— y la quinta —Cobro— no hacen ninguna llamada propia. Todo llega dentro de este único snapshot, anidado en paradas[]: al hacer click en una parada el frontend no pide nada, solo muestra lo que ya tiene.

Y es una decisión, no una comodidad. La alternativa —un GET /monitoring/deliveries/{id}/proof y compañía, uno por pestaña— serían cuatro endpoints más para traer unos pocos KB que ya se leyeron: una salida tiene 4-20 paradas, y el snapshot completo pesa menos que una foto del comprobante. Peor: con carga diferida, el planificador que abre cinco paradas seguidas para comparar dispara veinte requests, y la pantalla que existe para vigilar se llena de spinners.

Lo que sí queda por resolver es el otro lado: cuando el stream cierra una parada en vivo, el evento no trae la evidencia (ver 25.16-25.17). Ahí sí haría falta re-pedir algo, y es la única razón defendible para un endpoint por parada.

Códigos HTTP
Los mismos del listado más uno que allá no existe:

Código	Cuándo
200	El detalle completo, y el stream al quedar la conexión abierta
400	transportOrderId no numérico
404	La orden no existe. Acá sí corresponde, y es la diferencia con el listado: el listado es una colección acotada por distribuidora (una flota vacía es 200 con data: []), esto es un recurso identificado por su id — pedir una orden que no está no es "una lista vacía", es un id que no resuelve
500	Falla de Postgres, de DynamoDB o del servicio de puntos de entrega
Una orden que existe pero no tiene route_id es un 200, no un 404: es una orden despachada sin ruta asignada. La respuesta trae la cabecera, las paradas y recorrido: [] con tracking: null.

No hay paginación de paradas, por lo mismo que en el listado: una salida tiene 4-20 paradas y paginarlas obligaría al stream a saber en qué página está el cliente.

Especificación de DTOs y funciones
Request Principal (GET /monitoring/orders/{transportOrderId})
Parámetros de entrada: path param.

Atributo	Tipo	Oblig.	Descripción / Restricción
transportOrderId	number	Sí	transport_order.id (:282). Va en el PATH y no en query porque identifica el recurso
No lleva distributorId. Podría discutirse por seguridad —hoy cualquiera con el id ve la orden— pero como dato sería redundante: la orden ya trae su distributor_id (:284, NOT NULL).

A. getOrderDetail(transportOrderId) 25.2 y 25.3
El Gateway recibe el GET (25.1) y lo delega al Monitoring Controller (25.2), que valida el path param y llama al Monitoring Service (25.3). El Service orquesta: seis lecturas a Postgres, una llamada al servicio externo de puntos de entrega, una Query a DynamoDB y el armado (25.11), en ese orden.

Parámetro de entrada: transportOrderId (number).
Parámetro de salida: monitoringOrderDetailDto (25.11).
B. findOrderWithRoute(transportOrderId) 25.4
Función responsable de traer la orden y el puntero a su salida: es la que resuelve el route_id con el que se consultan Dynamo (25.10) y la ruta (25.5). Una sola consulta, no dos: la cabecera de la pantalla necesita esa fila igual.

Este paso no existía en v0.0.2 y es el precio del cambio de modelo. Allá el id de la URL ya era la clave de partición de la traza, así que no había nada que resolver antes de ir a Dynamo. Con el viaje en routes vuelve la traducción — la misma que tenía v0.0.1 con trip_id, y por el mismo motivo.

Parámetro de entrada: transportOrderId (number).
Parámetro de salida: orderHeaderDto.
Tabla de atributos de orderHeaderDto

Atributo	Tipo TypeScript	Validación	Oblig.	Descripción / Restricción
transportOrderId	number	@IsInt()	Sí	transport_order.id (:282)
code	string	@IsString()	Sí	Código visible. SIN ORIGEN EN EL ESQUEMA — ver Huecos abiertos (1)
distributorId	number	@IsInt()	Sí	transport_order.distributor_id (:284)
routeId	number | null	@IsInt() @IsOptional()	No	transport_order.route_id (:286). Es la clave del tracking: sin él no hay Query a Dynamo ni suscripción al stream
orderStatus	string	@IsString()	Sí	transport_order.status (:287) — estado del documento
assignedWeightKg	number	@IsNumber()	Sí	transport_order.assigned_weight_kg (:289)
assignedVolumeM3	number	@IsNumber()	Sí	transport_order.assigned_volume_m3 (:290)
Ejemplo JSON (retorno de 25.4)

{
  "transportOrderId": 4471,
  "code": "OT-2026-004471",
  "distributorId": 1,
  "routeId": 512,
  "orderStatus": "DISPATCHED",
  "assignedWeightKg": 3480.50,
  "assignedVolumeM3": 14.20
}
C. findSelectedRoute(routeId) 25.5 y join trucks 25.5a
Función responsable de traer la salida y su recorrido: en v0.0.3 las dos cosas viven en la misma fila de routes. Antes este paso solo traía la polilínea.

Trae la ruta seleccionada: WHERE id = $1 AND is_selected = true. El filtro es redundante en el camino feliz —route_id apunta a una fila concreta— pero nada en el esquema impide que apunte a una candidata descartada, y una candidata no tiene salida real (ver Huecos abiertos (10)).

La placa sale de trucks.plate (:56) por routes.truck_id, dentro de la misma consulta (25.5a): routes JOIN trucks ON routes.truck_id = trucks.id. En el diagrama es un paso aparte porque la placa no vive en routes y la convención es una lifeline por tabla; no es un round trip extra.

Parámetro de entrada: routeId (number).
Parámetro de salida: routeDetailDto.
Tabla de atributos de routeDetailDto

Atributo	Tipo TypeScript	Validación	Oblig.	Descripción / Restricción
routeId	number	@IsInt()	Sí	routes.id (:229)
distributorId	number	@IsInt()	Sí	routes.distributor_id (migrada de trips.distributor_id, :209). La columna no existe hoy — hueco (9)
encodePolyline	string | null	@IsString() @IsOptional()	No	routes.encode_polyline (:244). La geometría del trayecto, sin identidad de parada
licensePlate	string	@IsString()	Sí	trucks.plate (:56) vía routes.truck_id, resuelta en 25.5a
nameDriverEmployee	string	@IsString()	Sí	routes.name_driver_employee (migrada de :211)
driverEmployeeId	number | null	@IsInt() @IsOptional()	No	routes.driver_employee_id (migrada de :210). Es el employeeId que audita cada ping
transportStatus	string	@IsString()	Sí	Estado de la salida (routes.transport_status, heredado de trips.status, :214)
departureDate	string | null	@IsISO8601() @IsOptional()	No	routes.departure_date (migrada de :215)
completedDate	string | null	@IsISO8601() @IsOptional()	No	routes.completed_date (migrada de :216)
etaTotalDistanceM	number | null	@IsNumber() @IsOptional()	No	routes.eta_total_distance_m (:238)
etaTotalTimeS	number | null	@IsNumber() @IsOptional()	No	routes.eta_total_time_s (:239)
El color con el que se pinta el recorrido no está acá y no está en ninguna tabla: sale de la UI del planificador. Es el hueco (11) de Frontend.md, y se nota justo en esta pantalla — es lo único que ata visualmente al mismo camión entre planificación y monitoreo.

Ejemplo JSON (retorno de 25.5 + 25.5a)

{
  "routeId": 512,
  "distributorId": 1,
  "encodePolyline": "}_o~F~ps|U_ulLnnqC_mqNvxq`@",
  "licensePlate": "3456-ABC",
  "nameDriverEmployee": "Carlos Mamani",
  "driverEmployeeId": 456,
  "transportStatus": "EN_RUTA",
  "departureDate": "2026-07-16T08:00:00.000Z",
  "completedDate": null,
  "etaTotalDistanceM": 48250.00,
  "etaTotalTimeS": 9600.00
}
D. findRouteDeliveryPoints(routeId) 25.6
Función responsable del orden de visita. route_delivery_points.sequence (:262) es el número que se dibuja en cada pin, el que ordena el panel de paradas y el que define el corte de "hecho vs pendiente". Sin este paso hay paradas pero no hay recorrido.

Parámetro de entrada: routeId (number).
Parámetro de salida: routeStopDto[].
Tabla de atributos de routeStopDto

Atributo	Tipo TypeScript	Validación	Oblig.	Descripción / Restricción
routeDeliveryPointId	number	@IsInt()	Sí	route_delivery_points.id (:259)
dispatchDeliveryPointId	number	@IsInt()	Sí	:261, NOT NULL con FK. Es el pivote con la parada planificada
sequence	number	@IsInt()	Sí	:262, NOT NULL. El número del pin
estimatedDistanceM	number | null	@IsNumber() @IsOptional()	No	:264 — metros HACIA este punto, no acumulados
estimatedTravelS	number | null	@IsNumber() @IsOptional()	No	:265 — segundos de viaje hacia este punto
estimatedTotalCost	number | null	@IsNumber() @IsOptional()	No	:269
isActive	boolean	@IsBoolean()	Sí	:267. Una parada desactivada del plan no se dibuja
Ejemplo JSON (retorno de 25.6)

[
  {
    "routeDeliveryPointId": 88301,
    "dispatchDeliveryPointId": 4021,
    "sequence": 1,
    "estimatedDistanceM": 5400.00,
    "estimatedTravelS": 780.00,
    "estimatedTotalCost": 42.50,
    "isActive": true
  },
  {
    "routeDeliveryPointId": 88302,
    "dispatchDeliveryPointId": 4022,
    "sequence": 2,
    "estimatedDistanceM": 3120.00,
    "estimatedTravelS": 540.00,
    "estimatedTotalCost": 24.10,
    "isActive": true
  },
  { "...": "..." }
]
E. findDispatchPoints(dispatchDeliveryPointIds) 25.7
Función responsable de la parada planificada: quién es el cliente, en qué ventana recibe y cuánto pesa lo que le toca (dispatch_delivery_points, :131-160). Se llama una vez con el arreglo de ids que devolvió 25.6, no una vez por parada: con 20 paradas serían 20 consultas para traer 20 filas de la misma tabla.

Parámetro de entrada: dispatchDeliveryPointIds (number[]).
Parámetro de salida: dispatchPointDto[].
Tabla de atributos de dispatchPointDto

Atributo	Tipo TypeScript	Validación	Oblig.	Descripción / Restricción
dispatchDeliveryPointId	number	@IsInt()	Sí	dispatch_delivery_points.id (:132)
deliveryPointId	number	@IsInt()	Sí	:135, NOT NULL sin FK: apunta al maestro EXTERNO. Es la clave con la que 25.8 pide las coordenadas
customerName	string	@IsString()	Sí	:138 — desnormalizado del maestro
deliveryWindowStart	string	@IsString()	Sí	:144, tipo TIME → HH:mm
deliveryWindowEnd	string	@IsString()	Sí	:145, tipo TIME → HH:mm
totalWeightKg	number	@IsNumber()	Sí	:146. Es una SUMA de los pedidos de la parada
totalVolumeM3	number	@IsNumber()	Sí	:147. Ídem
No trae latitude ni longitude, y no es un olvido de este documento: la tabla no las tiene. Es el paso 25.8.

Ejemplo JSON (retorno de 25.7)

[
  {
    "dispatchDeliveryPointId": 4021,
    "deliveryPointId": 45,
    "customerName": "Casa La Ramada",
    "deliveryWindowStart": "08:00",
    "deliveryWindowEnd": "12:00",
    "totalWeightKg": 620.40,
    "totalVolumeM3": 2.30
  },
  { "...": "..." }
]
F. findCandidateOrders(dispatchDeliveryPointIds) 25.7a
Función responsable de los pedidos que cada parada agrupa — la pestaña Pedido del panel, mitad de arriba. Es el paso que responde la pregunta que más se confunde del modelo: la parada no es un pedido, agrupa N. El camión frena una vez y baja los tres pedidos de ese cliente.

Se llama con el mismo arreglo de ids que 25.7 y se agrupa por dispatch_delivery_point_id (:178).

Parámetro de entrada: dispatchDeliveryPointIds (number[]).
Parámetro de salida: pedidoDto[], indexado por parada.
Tabla de atributos de pedidoDto

Atributo	Tipo TypeScript	Validación	Oblig.	Descripción / Restricción
candidateOrderId	number	@IsInt()	Sí	candidate_orders.id (:177)
dispatchDeliveryPointId	number	@IsInt()	Sí	:178. La parada a la que pertenece
salesOrderId	string	@IsString()	Sí	:179, NOT NULL — el número con el que Ventas lo conoce
documentId	string	@IsString()	Sí	:180, NOT NULL — el documento SAP
totalWeightKg	number	@IsNumber()	Sí	:185
totalVolumeM3	number	@IsNumber()	Sí	:186
typeMovement	string | null	@IsString() @IsOptional()	No	:188. Distingue venta de devolución o traslado
total	number	@IsNumber()	Sí	Monto en Bs. NO ES UNA COLUMNA: candidate_orders (:176-203) guarda peso y volumen y ningún monto. Viene del pedido de SAP
formaPago	string	@IsString()	Sí	Contado / Crédito / Transferencia. Tampoco es columna: viene del pedido de SAP. Es lo que decide qué se cobra en el punto (ver cobroDto)
Las dos últimas filas son la razón por la que la pestaña Cobro está marcada como propuesta: los dos únicos datos con los que se puede construir un cobro entran por SAP y no por nuestro esquema.

Ejemplo JSON (retorno de 25.7a)

[
  {
    "candidateOrderId": 7781,
    "dispatchDeliveryPointId": 4021,
    "salesOrderId": "SO-88213",
    "documentId": "1000026565",
    "totalWeightKg": 320.40,
    "totalVolumeM3": 1.10,
    "typeMovement": "VENTA",
    "total": 1592.67,
    "formaPago": "Contado"
  },
  {
    "candidateOrderId": 7782,
    "dispatchDeliveryPointId": 4021,
    "salesOrderId": "SO-88240",
    "documentId": "1000026571",
    "totalWeightKg": 300.00,
    "totalVolumeM3": 1.20,
    "typeMovement": "VENTA",
    "total": 980.00,
    "formaPago": "Crédito"
  },
  { "...": "..." }
]
G. 01 DeliveryPoint (servicio externo) 25.8
Este paso es el que hace posible el mapa, y es el único del módulo que sale del microservicio. dispatch_delivery_points no tiene latitude ni longitude (:131-160): el puntero es delivery_point_id (:135), un BIGINT sin FK porque el maestro es externo. Sin esta llamada no hay pines, ni encuadre, ni trazo que cortar.

Es una sola llamada por lote, con los deliveryPointId de todas las paradas de la orden — no una por pin. El contrato es el del snapshot 01 DeliveryPoint documentado al principio de este documento.

Ejemplo JSON (entrada de 25.8)

{
  "deliveryPointId": [45, 46, 51, 78],
  "ownerId": 4,
  "customerId": null
}
Ejemplo JSON (retorno de 25.8)

[
  {
    "deliveryPointId": 45,
    "ownerId": 4,
    "ownerName": "Cliente padre 1",
    "customerId": 78,
    "customerName": "Cliente hijo 2",
    "latitud": -17.786510,
    "longitud": -63.174220
  },
  { "...": "..." }
]
Las claves latitud / longitud van en español y sin normalizar a propósito: son las del servicio externo tal como están especificadas en Servicios Externos de los Snapshots. Renombrarlas acá haría creer que el contrato es nuestro. El DTO de salida de la pantalla sí las expone como latitude / longitude, y la traducción ocurre en 25.11.

Qué pasa si falla: es la decisión que hay que tomar antes de implementar. Sin coordenadas la pantalla no puede dibujar el mapa, pero sí puede dibujar el panel de paradas, los estados y toda la evidencia. Las dos salidas defendibles son degradar (mapa vacío con aviso, lista completa) o 500. Este documento no la resuelve; la declara.

H. findDeliveriesByOrder(transportOrderId) 25.9
Función responsable de las entregas: delivery_orders (:381-406) es el cruce de la orden con cada parada, y es lo que el chofer ejecuta. Una fila por parada de esta orden.

Parámetro de entrada: transportOrderId (number).
Parámetro de salida: deliveryRowDto[].
Tabla de atributos de deliveryRowDto

Atributo	Tipo TypeScript	Validación	Oblig.	Descripción / Restricción
deliveryOrderId	number	@IsInt()	Sí	delivery_orders.id (:382). Es la clave con la que el cliente parchea los eventos de entrega
dispatchDeliveryPointId	number	@IsInt()	Sí	El pivote con la parada planificada
status	string	@IsString()	Sí	:392 — estado de la entrega
arrivedAt	string | null	@IsISO8601() @IsOptional()	No	:395 — cuándo marcó la llegada
deliveredAt	string | null	@IsISO8601() @IsOptional()	No	:396 — cuándo cerró
arrivalLatitude	number | null	@IsLatitude() @IsOptional()	No	:393. Dónde marcó la llegada, no dónde está el camión ni dónde está el cliente
arrivalLongitude	number | null	@IsLongitude() @IsOptional()	No	:394
receiverName	string | null	@IsString() @IsOptional()	No	receiver_name. Duplicado con proof_of_deliveries.receiver_name — hueco (3) de Frontend.md
deliveryResultCode	string | null	@IsString() @IsOptional()	No	:391, -- POR DEFINIR. El motivo, solo cuando no se entregó
Ejemplo JSON (retorno de 25.9)

[
  {
    "deliveryOrderId": 90112,
    "dispatchDeliveryPointId": 4021,
    "status": "DELIVERED",
    "arrivedAt": "2026-07-16T08:25:00.000Z",
    "deliveredAt": "2026-07-16T08:34:00.000Z",
    "arrivalLatitude": -17.786498,
    "arrivalLongitude": -63.174241,
    "receiverName": "La Ramada",
    "deliveryResultCode": null
  },
  {
    "deliveryOrderId": 90113,
    "dispatchDeliveryPointId": 4022,
    "status": "FAILED",
    "arrivedAt": "2026-07-16T09:02:00.000Z",
    "deliveredAt": "2026-07-16T09:11:00.000Z",
    "arrivalLatitude": -17.771002,
    "arrivalLongitude": -63.160877,
    "receiverName": null,
    "deliveryResultCode": "CLIENTE_AUSENTE"
  },
  { "...": "..." }
]
I. findItemsByDeliveryIds(deliveryOrderIds) 25.9a
Función responsable de los productos consolidados de cada parada — la pestaña Pedido, mitad de abajo. Se llama una vez con el arreglo de deliveryOrderId, no una por parada: son 20 consultas contra una.

Es el consolidado POR PRODUCTO, no por pedido: si el cliente pidió el mismo aceite en dos pedidos distintos, el chofer baja una sola cantidad. Por eso la pestaña muestra primero los pedidos (25.7a) y después esto — si mostrara solo productos, se perdería de vista que la parada junta tres documentos.

Parámetro de entrada: deliveryOrderIds (number[]).
Parámetro de salida: itemDto[], indexado por deliveryOrderId.
Tabla de atributos de itemDto

Atributo	Tipo TypeScript	Validación	Oblig.	Descripción / Restricción
deliveryOrderItemId	number	@IsInt()	Sí	delivery_order_items.id (:412)
deliveryOrderId	number	@IsInt()	Sí	La entrega a la que pertenece
productId	number	@IsInt()	Sí	:414. El nombre y la unidad los resuelve el snapshot Product, no una tabla local
plannedQty	number	@IsNumber()	Sí	Lo que el plan asignó
loadedQty	number	@IsNumber()	Sí	Lo que subió al camión. loaded < planned es un faltante de carga
deliveredQty	number	@IsNumber()	Sí	Lo que bajó
returnedQty	number	@IsNumber()	Sí	Lo que volvió. En una parada cerrada, delivered + returned tiene que dar loaded
itemStatus	string | null	@IsString() @IsOptional()	No	Estado por línea
No hay columna de desvío. delivery_order_items no tiene el equivalente de truck_inventories.variance_qty (:362): el faltante se deduce restando planned - loaded, y si alguna vez hay que auditarlo hace falta la columna.

Ejemplo JSON (retorno de 25.9a)

[
  {
    "deliveryOrderItemId": 55201,
    "deliveryOrderId": 90112,
    "productId": 78,
    "plannedQty": 24,
    "loadedQty": 24,
    "deliveredQty": 24,
    "returnedQty": 0,
    "itemStatus": "DELIVERED"
  },
  {
    "deliveryOrderItemId": 55202,
    "deliveryOrderId": 90112,
    "productId": 91,
    "plannedQty": 12,
    "loadedQty": 10,
    "deliveredQty": 10,
    "returnedQty": 0,
    "itemStatus": "DELIVERED"
  },
  { "...": "..." }
]
J. findIncidentsByDeliveryIds(deliveryOrderIds) 25.9b
Función responsable de las incidencias — la pestaña Incidencias. Una llamada con el arreglo de ids. Lo normal es que devuelva vacío: una incidencia es la excepción, y una parada que falló casi siempre tiene una.

Parámetro de entrada: deliveryOrderIds (number[]).
Parámetro de salida: incidenciaDto[], indexado por deliveryOrderId.
Tabla de atributos de incidenciaDto

Atributo	Tipo TypeScript	Validación	Oblig.	Descripción / Restricción
incidentId	number	@IsInt()	Sí	delivery_incidents.id (:458)
deliveryOrderId	number	@IsInt()	Sí	:459, NOT NULL con FK. Solo cuelga de una ENTREGA: no hay incidencias de la salida (camión averiado, calle cortada) — hueco (2) de Frontend.md
incidentCode	string | null	@IsString() @IsOptional()	No	:460, -- POR DEFINIR
incidentType	string	@IsString()	Sí	:461
severity	string	@IsString()	Sí	:462, -- POR DEFINIR. Sin catálogo el panel las cuenta pero no las puede clasificar, que es lo que decide a quién llamar primero
description	string | null	@IsString() @IsOptional()	No	:463
photoUrl	string | null	@IsString() @IsOptional()	No	:464, TEXT. La foto es la prueba: sin ella "producto dañado" es la palabra del chofer contra la del cliente
requiresReturn	boolean	@IsBoolean()	Sí	:465
resolutionStatus	string | null	@IsString() @IsOptional()	No	:466. Hoy la pantalla no lo muestra
resolvedAt	string | null	@IsISO8601() @IsOptional()	No	:467
createdAt	string	@IsISO8601()	Sí	:471
Ejemplo JSON (retorno de 25.9b)

[
  {
    "incidentId": 3301,
    "deliveryOrderId": 90113,
    "incidentCode": null,
    "incidentType": "Producto dañado",
    "severity": "alta",
    "description": "Producto dañado reportado por el chofer en el punto.",
    "photoUrl": "https://cdn.example/incidents/3301.jpg",
    "requiresReturn": true,
    "resolutionStatus": null,
    "resolvedAt": null,
    "createdAt": "2026-07-16T09:08:00.000Z"
  },
  { "...": "..." }
]
K. findPodsByDeliveryIds(deliveryOrderIds) 25.9c
Función responsable del comprobante — la pestaña Comprobante. Una llamada con el arreglo de ids. Solo la entrega efectiva deja comprobante: un "no entregado" no tiene firma ni receptor, así que este paso devuelve menos filas que entregas y eso es correcto.

Parámetro de entrada: deliveryOrderIds (number[]).
Parámetro de salida: comprobanteDto[], indexado por deliveryOrderId (0 o 1 por entrega).
Tabla de atributos de comprobanteDto

Atributo	Tipo TypeScript	Validación	Oblig.	Descripción / Restricción
podId	number	@IsInt()	Sí	proof_of_deliveries.id (:432)
deliveryOrderId	number	@IsInt()	Sí	:433, NOT NULL con FK
receiverName	string	@IsString()	Sí	:434
receiverDocument	string | null	@IsString() @IsOptional()	No	:435
signatureUrl	string | null	@IsString() @IsOptional()	No	:436, TEXT: la URL, no el archivo. null = cerró sin firma
photoUrl	string | null	@IsString() @IsOptional()	No	:437, TEXT. null = cerró sin foto, que es un caso real y el panel lo dice
gpsLat	number | null	@IsLatitude() @IsOptional()	No	:438. Dónde se capturó la firma — puede no ser la coordenada del maestro: el chofer firma en la puerta
gpsLon	number | null	@IsLongitude() @IsOptional()	No	:439
podStatus	string | null	@IsString() @IsOptional()	No	:440, -- POR DEFINIR
podResultCode	string | null	@IsString() @IsOptional()	No	:441, -- POR DEFINIR
deviceId	number | null	@IsInt() @IsOptional()	No	:442. Un BIGINT que no apunta a ninguna tabla — hueco (4) de Frontend.md
capturedAt	string	@IsISO8601()	Sí	:443 — reloj del dispositivo
uploadedAt	string | null	@IsISO8601() @IsOptional()	No	:444 — reloj del servidor. Se separan cuando el celular subió sin cobertura: es el mismo par que trackedAt/receivedAt del ping
notes	string | null	@IsString() @IsOptional()	No	:445
La evidencia se devuelve para MOSTRARSE, no para anunciarse. El panel no dice "hay foto": abre la foto y la firma. Un comprobante que no se puede abrir no sirve para lo único que se le pide, que es contestarle al cliente que dice que no recibió la mercadería. Las dos URLs son el contrato; que en el mock la firma se genere como SVG y las fotos salgan del maestro de puntos (mock-fotos.ts) es implementación, no contrato.

Ejemplo JSON (retorno de 25.9c)

[
  {
    "podId": 12044,
    "deliveryOrderId": 90112,
    "receiverName": "La Ramada",
    "receiverDocument": "6721394",
    "signatureUrl": "https://cdn.example/pod/12044-sign.svg",
    "photoUrl": "https://cdn.example/pod/12044.jpg",
    "gpsLat": -17.786492,
    "gpsLon": -63.174233,
    "podStatus": null,
    "podResultCode": null,
    "deviceId": 9041,
    "capturedAt": "2026-07-16T08:34:00.000Z",
    "uploadedAt": "2026-07-16T08:36:12.000Z",
    "notes": null
  },
  { "...": "..." }
]
L. findHistoriesByDeliveryIds(deliveryOrderIds) 25.9d
Función responsable del timeline de cada entrega — la pestaña Historial. Una llamada con el arreglo de ids, ordenada por created_at.

Es la bitácora de la ENTREGA, no de la salida: el ciclo de vida del viaje (departure_date → completed_date) no tiene bitácora en v0.0.3, porque vive en routes y esa tabla no tiene tabla de histories. Es el hueco (12).

Parámetro de entrada: deliveryOrderIds (number[]).
Parámetro de salida: eventoDto[], indexado por deliveryOrderId.
Tabla de atributos de eventoDto

Atributo	Tipo TypeScript	Validación	Oblig.	Descripción / Restricción
historyId	number	@IsInt()	Sí	delivery_order_histories.id (:480)
deliveryOrderId	number	@IsInt()	Sí	:481, NOT NULL con FK
status	string	@IsString()	Sí	:482, NOT NULL
reason	string | null	@IsString() @IsOptional()	No	:483. El motivo del cierre cuando no se entregó
createdAt	string	@IsISO8601()	Sí	:487
createdBy	string | null	@IsString() @IsOptional()	No	:485. Sin autor modelado: VARCHAR libre, sin FK, y el mock no lo llena — hueco (10) de Frontend.md. Una bitácora sin autor no sirve para lo único que se le pide: "quién cerró esta entrega así"
Ejemplo JSON (retorno de 25.9d)

[
  {
    "historyId": 77010,
    "deliveryOrderId": 90112,
    "status": "PENDING",
    "reason": null,
    "createdAt": "2026-07-16T08:00:00.000Z",
    "createdBy": null
  },
  {
    "historyId": 77014,
    "deliveryOrderId": 90112,
    "status": "ARRIVED",
    "reason": null,
    "createdAt": "2026-07-16T08:25:00.000Z",
    "createdBy": null
  },
  {
    "historyId": 77019,
    "deliveryOrderId": 90112,
    "status": "DELIVERED",
    "reason": null,
    "createdAt": "2026-07-16T08:34:00.000Z",
    "createdBy": null
  },
  { "...": "..." }
]
M. query(PK=ROUTE#{routeId}) 25.10
Función responsable de la última posición conocida de la salida. Es la Query de la TRAZA, no la del ítem ACTUAL:

Query  TableName = truck_tracking
       KeyConditionExpression = "pk = :pk"
       ExpressionAttributeValues = { ":pk": "ROUTE#512" }
       ScanIndexForward = false
       Limit = 1
Por qué la traza y no el ítem ACTUAL, si el ACTUAL es exactamente "la última posición": porque esta pantalla también quiere el recorrido real (Query PK sin Limit, o SK BETWEEN dos horas), y el ACTUAL no lo tiene — se pisa en cada ping. Con una sola partición se responden las dos preguntas. El ítem ACTUAL existe para la otra pantalla, la que necesita 40 camiones en una Query (18.10).

Con routeId = null este paso no se ejecuta: no hay partición que consultar.

Parámetro de entrada: routeId (number).
Parámetro de salida: trackingSnapshotDto (o null).
Ejemplo JSON (ítem crudo de la TRAZA que devuelve Dynamo)

{
  "pk": "ROUTE#512",
  "sk": "TS#2026-07-16T08:24:39.000Z",
  "latitude": -17.783412,
  "longitude": -63.181245,
  "battery": 74,
  "employeeId": 456,
  "receivedAt": "2026-07-16T08:24:40.180Z",
  "expiresAt": 1786782279
}
Ejemplo JSON (trackingSnapshotDto, ya resuelto para la pantalla)

{
  "routeId": 512,
  "latitude": -17.783412,
  "longitude": -63.181245,
  "battery": 74,
  "trackedAt": "2026-07-16T08:24:39.000Z",
  "receivedAt": "2026-07-16T08:24:40.180Z"
}
pk y sk no se exponen: el DTO lleva routeId ya des-compuesto y trackedAt sacado del prefijo TS# de la sk. Filtrarlas acá evita que el frontend aprenda a parsear claves de Dynamo. expiresAt y employeeId tampoco viajan: el TTL es interno y el chofer ya está en la cabecera.

N. buildDetail(...) 25.11
Función responsable de armar la respuesta: cruza las paradas del plan (25.6) con la parada planificada (25.7), sus pedidos (25.7a), sus coordenadas (25.8) y su entrega con las cuatro hijas (25.9 a 25.9d), las ordena por sequence y agrega la cabecera, el progreso y el tracking.

Tres cosas se DERIVAN acá y no salen de ninguna consulta, y conviene tenerlas juntas porque son las que alguien va a buscar en el esquema sin encontrarlas:

Derivado	Cómo se calcula	Por qué no se guarda
progress	Conteo de status sobre las entregas de 25.9	Guardarlo sería un contador que se desincroniza con la primera entrega que cierre
outOfWindow (por parada)	deliveredAt fuera de deliveryWindowStart/End	Ídem: es una comparación de dos datos que ya viajan
cobro	De formaPago y total de los pedidos (25.7a): contado y transferencia se cobran en el punto, el crédito no	NO EXISTE LA TABLA. No hay paso en la secuencia porque no hay nada que consultar — ver cobroDto
El corte de "hecho vs pendiente" del mapa y del riel del panel también se deriva: es la última entrega cerrada por sequence.

Parámetro de salida: monitoringOrderDetailDto, que el Controller devuelve tal cual.
Tabla de atributos de monitoringOrderDetailDto

Atributo	Tipo TypeScript	Validación	Oblig.	Descripción / Restricción
order	orderHeaderDto	@ValidateNested()	Sí	Cabecera del paso 25.4
route	routeDetailDto | null	@ValidateNested() @IsOptional()	No	La salida del paso 25.5. null si la orden no tiene ruta
progress	progressDto	@ValidateNested()	Sí	Derivado. Es el mismo DTO del listado (18.8); se recalcula acá porque esta pantalla es deep-linkeable y puede abrirse sin pasar por el listado
tracking	trackingSnapshotDto | null	@ValidateNested() @IsOptional()	No	Paso 25.10. null si no salió, ya volvió, o no tiene ruta
paradas	paradaDetalleDto[]	@ValidateNested({ each: true })	Sí	Las paradas en orden de visita
Sub-DTO: paradaDetalleDto — es el cruce de todo lo anterior. Una por parada.

Atributo	Tipo TypeScript	Oblig.	Origen (paso)
deliveryOrderId	number	Sí	25.9. La clave con la que el cliente parchea los eventos de entrega
dispatchDeliveryPointId	number	Sí	25.6 / 25.7
deliveryPointId	number	Sí	25.7 — puntero al maestro externo
sequence	number	Sí	25.6
customerName	string	Sí	25.7
latitude / longitude	number	Sí	25.8 (servicio externo), renombradas desde latitud/longitud
deliveryWindowStart / deliveryWindowEnd	string	Sí	25.7
totalWeightKg / totalVolumeM3	number	Sí	25.7
estimatedDistanceM / estimatedTravelS	number | null	No	25.6
status	string	Sí	25.9
arrivedAt / deliveredAt	string | null	No	25.9
arrivalLatitude / arrivalLongitude	number | null	No	25.9
receiverName	string | null	No	25.9
deliveryResultCode	string | null	No	25.9
outOfWindow	boolean	Sí	Derivado en 25.11
pedidos	pedidoDto[]	Sí	25.7a
items	itemDto[]	Sí	25.9a
incidencias	incidenciaDto[]	Sí	25.9b. Vacío es lo normal
comprobante	comprobanteDto | null	No	25.9c. null si no se entregó
historial	eventoDto[]	Sí	25.9d
cobro	cobroDto	Sí	Derivado en 25.11 — sin tabla
Sub-DTO: cobroDto — ⚠️ SIN RESPALDO EN EL ESQUEMA

Se especifica porque la pantalla lo muestra, y se marca así porque no hay ninguna tabla de cobros. No tiene paso en la secuencia: no hay nada que consultar.

Atributo	Tipo	Origen
montoTotal	number	Suma de pedidos[].total (25.7a) — del pedido de SAP, no de una columna
montoCobrable	number	Derivado: suma de los pedidos con formaPago distinta de Crédito. Regla del negocio, no del esquema
montoCobrado	number	NO EXISTE
estado	string	NO EXISTE — cobrado / parcial / pendiente / no_corresponde
moneda	string	BOB. Constante hoy: no hay columna de moneda en ninguna parte
recibo	string | null	NO EXISTE (receipt_number)
cobradoAt	string | null	NO EXISTE (collected_at)
Para que esto sea implementable hace falta una tabla por entrega —delivery_payments (delivery_order_id, method, amount, currency, receipt_number, collected_by, collected_at)— y decidir si el monto se desnormaliza en candidate_orders al armar el plan o se resuelve por servicio contra SAP. Mientras no exista, el cobroDto es una propuesta, y la pantalla lo dice en pantalla.

Ejemplo JSON (Response completa, dos paradas de las N)

Una parada entregada con su comprobante y su cobro, y una fallida con su incidencia y sin comprobante:

{
  "success": true,
  "code": 200,
  "data": {
    "order": {
      "transportOrderId": 4471,
      "code": "OT-2026-004471",
      "distributorId": 1,
      "routeId": 512,
      "orderStatus": "DISPATCHED",
      "assignedWeightKg": 3480.50,
      "assignedVolumeM3": 14.20
    },
    "route": {
      "routeId": 512,
      "distributorId": 1,
      "encodePolyline": "}_o~F~ps|U_ulLnnqC_mqNvxq`@",
      "licensePlate": "3456-ABC",
      "nameDriverEmployee": "Carlos Mamani",
      "driverEmployeeId": 456,
      "transportStatus": "EN_RUTA",
      "departureDate": "2026-07-16T08:00:00.000Z",
      "completedDate": null,
      "etaTotalDistanceM": 48250.00,
      "etaTotalTimeS": 9600.00
    },
    "progress": {
      "total": 6,
      "delivered": 1,
      "failed": 1,
      "returned": 0,
      "pending": 4,
      "progressPct": 33,
      "incidents": 1,
      "outOfWindow": 0
    },
    "tracking": {
      "routeId": 512,
      "latitude": -17.783412,
      "longitude": -63.181245,
      "battery": 74,
      "trackedAt": "2026-07-16T08:24:39.000Z",
      "receivedAt": "2026-07-16T08:24:40.180Z"
    },
    "paradas": [
      {
        "deliveryOrderId": 90112,
        "dispatchDeliveryPointId": 4021,
        "deliveryPointId": 45,
        "sequence": 1,
        "customerName": "Casa La Ramada",
        "latitude": -17.786510,
        "longitude": -63.174220,
        "deliveryWindowStart": "08:00",
        "deliveryWindowEnd": "12:00",
        "totalWeightKg": 620.40,
        "totalVolumeM3": 2.30,
        "estimatedDistanceM": 5400.00,
        "estimatedTravelS": 780.00,
        "status": "DELIVERED",
        "arrivedAt": "2026-07-16T08:25:00.000Z",
        "deliveredAt": "2026-07-16T08:34:00.000Z",
        "arrivalLatitude": -17.786498,
        "arrivalLongitude": -63.174241,
        "receiverName": "La Ramada",
        "deliveryResultCode": null,
        "outOfWindow": false,
        "pedidos": [
          {
            "candidateOrderId": 7781,
            "dispatchDeliveryPointId": 4021,
            "salesOrderId": "SO-88213",
            "documentId": "1000026565",
            "totalWeightKg": 320.40,
            "totalVolumeM3": 1.10,
            "typeMovement": "VENTA",
            "total": 1592.67,
            "formaPago": "Contado"
          },
          { "...": "..." }
        ],
        "items": [
          {
            "deliveryOrderItemId": 55201,
            "deliveryOrderId": 90112,
            "productId": 78,
            "plannedQty": 24,
            "loadedQty": 24,
            "deliveredQty": 24,
            "returnedQty": 0,
            "itemStatus": "DELIVERED"
          },
          { "...": "..." }
        ],
        "incidencias": [],
        "comprobante": {
          "podId": 12044,
          "deliveryOrderId": 90112,
          "receiverName": "La Ramada",
          "receiverDocument": "6721394",
          "signatureUrl": "https://cdn.example/pod/12044-sign.svg",
          "photoUrl": "https://cdn.example/pod/12044.jpg",
          "gpsLat": -17.786492,
          "gpsLon": -63.174233,
          "podStatus": null,
          "podResultCode": null,
          "deviceId": 9041,
          "capturedAt": "2026-07-16T08:34:00.000Z",
          "uploadedAt": "2026-07-16T08:36:12.000Z",
          "notes": null
        },
        "historial": [
          {
            "historyId": 77010,
            "deliveryOrderId": 90112,
            "status": "PENDING",
            "reason": null,
            "createdAt": "2026-07-16T08:00:00.000Z",
            "createdBy": null
          },
          {
            "historyId": 77019,
            "deliveryOrderId": 90112,
            "status": "DELIVERED",
            "reason": null,
            "createdAt": "2026-07-16T08:34:00.000Z",
            "createdBy": null
          }
        ],
        "cobro": {
          "montoTotal": 1592.67,
          "montoCobrable": 1592.67,
          "montoCobrado": 1592.67,
          "estado": "cobrado",
          "moneda": "BOB",
          "recibo": "REC-418302",
          "cobradoAt": "2026-07-16T08:34:00.000Z"
        }
      },
      {
        "deliveryOrderId": 90113,
        "dispatchDeliveryPointId": 4022,
        "deliveryPointId": 46,
        "sequence": 2,
        "customerName": "Mercado Los Pozos",
        "latitude": -17.771002,
        "longitude": -63.160877,
        "deliveryWindowStart": "08:00",
        "deliveryWindowEnd": "13:00",
        "totalWeightKg": 410.00,
        "totalVolumeM3": 1.80,
        "estimatedDistanceM": 3120.00,
        "estimatedTravelS": 540.00,
        "status": "FAILED",
        "arrivedAt": "2026-07-16T09:02:00.000Z",
        "deliveredAt": "2026-07-16T09:11:00.000Z",
        "arrivalLatitude": -17.771002,
        "arrivalLongitude": -63.160877,
        "receiverName": null,
        "deliveryResultCode": "CLIENTE_AUSENTE",
        "outOfWindow": false,
        "pedidos": [
          {
            "candidateOrderId": 7790,
            "dispatchDeliveryPointId": 4022,
            "salesOrderId": "SO-88301",
            "documentId": "1000026588",
            "totalWeightKg": 410.00,
            "totalVolumeM3": 1.80,
            "typeMovement": "VENTA",
            "total": 2240.00,
            "formaPago": "Contado"
          }
        ],
        "items": [
          {
            "deliveryOrderItemId": 55240,
            "deliveryOrderId": 90113,
            "productId": 78,
            "plannedQty": 18,
            "loadedQty": 18,
            "deliveredQty": 0,
            "returnedQty": 18,
            "itemStatus": "RETURNED"
          }
        ],
        "incidencias": [
          {
            "incidentId": 3301,
            "deliveryOrderId": 90113,
            "incidentCode": null,
            "incidentType": "Rechazo del cliente",
            "severity": "alta",
            "description": "Local cerrado, nadie recibe.",
            "photoUrl": "https://cdn.example/incidents/3301.jpg",
            "requiresReturn": true,
            "resolutionStatus": null,
            "resolvedAt": null,
            "createdAt": "2026-07-16T09:08:00.000Z"
          }
        ],
        "comprobante": null,
        "historial": [
          {
            "historyId": 77031,
            "deliveryOrderId": 90113,
            "status": "ARRIVED",
            "reason": null,
            "createdAt": "2026-07-16T09:02:00.000Z",
            "createdBy": null
          },
          {
            "historyId": 77035,
            "deliveryOrderId": 90113,
            "status": "FAILED",
            "reason": "CLIENTE_AUSENTE",
            "createdAt": "2026-07-16T09:11:00.000Z",
            "createdBy": null
          }
        ],
        "cobro": {
          "montoTotal": 2240.00,
          "montoCobrable": 2240.00,
          "montoCobrado": 0,
          "estado": "pendiente",
          "moneda": "BOB",
          "recibo": null,
          "cobradoAt": null
        }
      },
      { "...": "..." }
    ]
  }
}
Ejemplo JSON (404, la orden no existe)

{
  "success": false,
  "code": 404,
  "message": "La orden de transporte 999999 no existe."
}
25.12-25.19 Stream del detalle (SSE)
Endpoint.
Tipo: (HTTP) GET /monitoring/orders/{transportOrderId}/stream

Mantener la pantalla al día enviando solo lo que cambió. Mismo patrón que el listado —snapshot una vez, deltas por SSE— y misma envoltura de cable (cabeceras, id:/event:/data:, heartbeat cada ~15 s): está en 18.16-18.19, no se repite.

La diferencia con el listado es la granularidad: acá el tracking va ping por ping, sin agrupar, porque cada posición mueve el pin. Agrupar a 30 s en esta pantalla dejaría el camión a saltos.

La suscripción tiene DOS scopes 25.14
Es la consecuencia más incómoda de v0.0.3 y conviene tenerla escrita:

subscribe(ROUTE#{routeId})              → tracking
subscribe(ORDER#{transportOrderId})     → delivery_started · delivery_closed
Una sola conexión, dos scopes, porque los eventos son hechos de dos entidades distintas: la posición es del CAMIÓN (la ruta) y la entrega es de la ORDEN. Colapsarlos en uno obligaría a que el publisher tradujera de ruta a órdenes consultando Postgres en el camino de cada ping (19.7), o a que el ping se publicara N veces.

Con routeId = null se abre igual, solo con el scope de la orden: una orden sin ruta puede recibir eventos de entrega, no de posición.

Eventos de este stream
| Evento | Cadencia | Clave del payload | Payload |

|---|---|---|---| | tracking | Ping por ping | routeId | trackingSnapshotDto | | delivery_started | Al instante | deliveryOrderId | Llegada al punto (arrived_at) | | delivery_closed | Al instante | deliveryOrderId | Cierre de la entrega (delivered_at) |

Este stream NO lleva order_progress, y es deliberado: acá están las entregas una por una, así que el contador se calcula en el cliente. El listado sí lo recibe porque muestra el contador y no las paradas. Los dos vocabularios son distintos a propósito — la tabla canónica está en src/mockup/monitoreo/use-flota-viva.ts.

Ejemplo JSON (evento tracking 25.15)

{
  "routeId": 512,
  "latitude": -17.783412,
  "longitude": -63.181245,
  "battery": 74,
  "trackedAt": "2026-07-16T08:24:39.000Z",
  "receivedAt": "2026-07-16T08:24:40.180Z"
}
Ejemplo JSON (evento delivery_started 25.16)

{
  "deliveryOrderId": 90114,
  "status": "ARRIVED",
  "arrivedAt": "2026-07-16T09:40:00.000Z",
  "arrivalLatitude": -17.759881,
  "arrivalLongitude": -63.142004
}
Ejemplo JSON (evento delivery_closed 25.17)

{
  "deliveryOrderId": 90114,
  "status": "DELIVERED",
  "deliveredAt": "2026-07-16T09:52:00.000Z",
  "deliveryResultCode": null,
  "receiverName": "Distribuidora El Cruce"
}
Ejemplo del cable (lo que ve el navegador)

id: 1784201079000-512
event: tracking
data: {"routeId":512,"latitude":-17.783412,"longitude":-63.181245,"battery":74,"trackedAt":"2026-07-16T08:24:39.000Z","receivedAt":"2026-07-16T08:24:40.180Z"}

id: 1784201520000-90114
event: delivery_closed
data: {"deliveryOrderId":90114,"status":"DELIVERED","deliveredAt":"2026-07-16T09:52:00.000Z","deliveryResultCode":null,"receiverName":"Distribuidora El Cruce"}

: heartbeat

Lo que delivery_closed NO trae, y hay que decidir: ni el comprobante (proof_of_deliveries) ni las incidencias que se cargaron al cerrar, ni las cantidades finales de los ítems. Hoy el panel de esa parada se queda con la cabecera actualizada y sin evidencia hasta que se re-pida el snapshot (25.19). Las dos salidas son mandar el POD y las incidencias en el evento —engorda un evento que se emite igual sin nadie mirando— o exponer un GET por parada, que es el único caso en que un endpoint por pestaña se justifica. Este documento no lo resuelve.

Parcheo por id 25.18
El cliente necesita dos índices, y es la misma asimetría de la suscripción:

tracking → por routeId. Mueve el pin y la cabecera (batería, última señal).
delivery_started / delivery_closed → por deliveryOrderId. Toca una tarjeta del panel y un pin del mapa.
El merge es por entidad e inmutable ({ ...prev, [id]: { ... } }). No es purismo: reconstruir la colección re-renderiza las 20 paradas en cada ping.

Reconexión 25.19
Igual que el listado: se re-pide el snapshot, no se reproduce con Last-Event-ID. Y acá pesa más el argumento, porque el snapshot de esta pantalla es lo único que trae la evidencia (ver arriba): reproducir eventos dejaría las paradas cerradas durante el corte sin comprobante.

Lo que esta pantalla NO pide
Se lista para acotar el contrato:

El listado. Es deep-linkeable: se entra por URL sin pasar por /monitoreo, así que recalcula su propio progress (25.11) en vez de heredarlo.
truck_inventories. El conteo a ciegas de la carga es otro flujo (secciones 18 y 21-23 del doc oficial).
Employee. El chofer viaja desnormalizado en routes.name_driver_employee. El teléfono no existe en ninguna tabla, y es justo esta pantalla la que tiene el botón natural para llamarlo — hueco (5).
Derivados
Qué devuelve la API ya calculado y qué calcula el cliente. La regla: se guarda el instante, se deriva el minuto. Un derivado guardado no se puede des-derivar —de un "hace 37 min" no se recupera a qué hora fijó el GPS— y además queda clavado mientras el reloj sigue.

Dato	Quién lo calcula	Cómo
progress (progreso, paradas, incidencias)	API (18.8)	Agregación sobre delivery_orders.status y delivery_incidents. Va en el servidor para no transportar 800 entregas y producir 40 números
pending, progressPct, outOfWindow	API (18.8)	Derivados de los conteos, dentro del mismo progressDto
trackedAt, latitude, longitude, battery	API — crudos	Se devuelve el ítem tal como está en DynamoDB
ultimaSenalMin ("hace X min")	Cliente	now() - trackedAt. No se guarda ni se devuelve. La API devuelve trackedAt crudo justamente para que el número envejezca solo
Umbral "sin señal" (15 min)	Cliente	Una sola constante compartida por la tabla y el mapa, para que no discrepen sobre qué camión está caído. Son 60-90 pings consecutivos perdidos: dos órdenes de magnitud arriba de un túnel
Posición como par [lat, lng]	Cliente	El ítem guarda los dos números por separado, como el contrato; la tupla se arma en el borde de la vista
Interpolación del pin entre pings	Cliente	Fluidez del mapa y frecuencia del ping son problemas distintos
Frescura de la pantalla ("En vivo" / "Actualizado hace X")	Cliente	Es del stream, no del camión: dice "la conexión se murió y estás mirando datos congelados", mientras "última señal" dice "a este camión se le cayó el GPS"
Definidos y NO implementados. El cálculo está especificado, no hay código que lo haga y ninguna pantalla lo muestra. Se listan para que la tabla siga sirviendo como especificación y no se lea como si todo estuviera hecho:

Dato	Cómo saldría	Por qué todavía no
Velocidad	Dos puntos consecutivos de la TRAZA	La traza ya existe y alcanza para calcularla, pero ninguna pantalla tiene dónde ponerla. Es la razón por la que speed se sacó del payload (../../UltimaVersion.sql:538)
Orientación del camión	Dirección del segmento de la polilínea	El pin es un círculo con un ícono, no una flecha. Con el recorrido aproximado por rectas, la orientación sería la de la recta y no la de la calle
"En camino a X"	Primera entrega no cerrada por route_delivery_points.sequence (:262)	El estado existe por entrega, pero nadie compone el texto "en camino a tal cliente"
"Fuera de ruta"	arrived_at (:395) en orden distinto al sequence planificado	Nada compara el orden real de llegada contra el planificado
