# Devoluciones: respuestas a la revisión de mockups (2026-10-26)

**Sí** = va tu propuesta. **Corrección** = va otra cosa. ⚠ = lo propongo yo, pero lo confirma Ruben
(SCRML-266) o Sales (SCRML-267).

Lo que ordena todo: la épica SCRML-265 termina en la aprobación. Varias diferencias entre el mockup
y el diagrama son atajos de demo del mockup. Donde chocan, valen el diagrama y el DDL. Al final están
listados los cambios para corregirlos en el mockup.

---

## 0. Cómo llega la nota desde Sales

**Por evento SNS (asíncrono)**, como dicen SCRML-267 y SCRML-272 ("Consume el evento de Sales"). El
texto del listado está mal redactado y lo corrijo. El contrato HTTP `POST /api/v1/refunds` del 09-02
queda reemplazado: su cuerpo pasa a ser el `data` del evento. `GET /api/v1/refund-reasons` sigue
igual, porque Sales lo consulta para armar las líneas con nuestros `reasonId`.

Propuesta de evento `refund.registered` para cerrar con Sales:

```json
{
  "eventId": "8f0c5b6e-2d1a-4c3e-9a7b-1f2e3d4c5b6a",
  "eventType": "refund.registered",
  "eventVersion": 1,
  "occurredAt": "2026-10-26T14:05:00-04:00",
  "data": {
    "noteNumber": "4500018",
    "distributorId": 10,
    "employeeId": 501,
    "customerId": 7001,
    "ownerId": 7002,
    "replacementDate": "2026-11-05",
    "justification": "Producto vencido de la última entrega",
    "items": [
      {
        "productId": 9001,
        "quantity": 10,
        "priceUnit": 18.50,
        "reasonId": 1,
        "notes": "Doypacks hinchados",
        "sources": [
          {
            "invoiceNumber": "F-100",
            "invoicedAt": "2026-08-20",
            "quantity": 10,
            "lotType": "S",
            "lot": "24810",
            "dueDate": "2026-09-15"
          }
        ],
        "images": [
          { "key": "refunds/2026/10/4500018/9001-1.jpg" }
        ]
      }
    ]
  }
}
```

Reglas:

- `quantity` (de la línea y de cada source) va siempre en unidad mínima, y `priceUnit` es el precio
  por unidad mínima. No hace falta un campo de unidad (ver 19).
- `noteNumber` es el número de Sales y es único (ver 20).
- `employeeId` es el vendedor. `customerId` es el cliente (punto de venta) y `ownerId` es su
  propietario. ⚠ Si Sales no maneja dos ids distintos, sacamos `owner_id`.
- `lotType` y `lot` van por separado (ver 19).
- Fotos: Sales las sube a su S3 y nos manda la **key**; no copiamos archivos. Guardamos la key en
  `image_url` y la web le pide al backend una URL firmada para mostrarla. No guardamos URLs firmadas:
  vencen y pasan de 255 caracteres. ⚠ Hay que pedirle a Sales/infra permiso de lectura sobre ese
  bucket.

Errores (consumidor SQS suscrito al tópico):

| Caso | Qué hacemos |
|---|---|
| Error de contenido: motivo inexistente o inactivo, sources que no suman la cantidad, falta el lote que el motivo exige, etc. | No persistimos nada y publicamos `refund.registration_rejected` con `noteNumber` y `errors[{field, code, message}]`, para que Sales se lo muestre al vendedor. |
| Error transitorio: base caída, escalera mal configurada | No confirmamos el mensaje. SQS reintenta y, tras N intentos, va a la DLQ con alarma. |
| Duplicado: mismo `noteNumber` (o mismo `eventId`) | Se descarta sin error. |
| Entra bien | Publicamos `refund.received` con nuestro `id`, para que Sales la marque "en aprobación". |

---

## 1. Estados (listado)

**1. Corrección parcial.** El mockup tiene dos columnas: "Estado" (del documento) y "Estado
Workflow" (en qué nivel está). "Estado" no se guarda: se deriva de `refund_orders.status` y de la
instancia vigente.

| Mockup | Cuándo | `refund_orders.status` | Instancia |
|---|---|---|---|
| PROCESANDO | En aprobación, dentro del plazo del nivel | `OPEN` | `IN_APPROVAL` |
| DEVOLUCIÓN DEMORADA | En aprobación, con el plazo del nivel vencido | `OPEN` | `IN_APPROVAL` |
| PROCESADO | Aprobada, total o parcial | `APPROVED` | `APPROVED` |
| CERRADO | **Rechazada** | `REJECTED` | `REJECTED` |
| ANULADA | Anulada | `ANNULLED` | `CANCELLED` |
| DISOCIADO | Nota disociada que espera al vendedor (ver 11) | `OPEN` | `EDITING` |

CERRADO es solo "rechazada"; no tiene que ver con el retiro, que está fuera de la épica. En el
listado no aparece ninguna porque el seed del mockup genera solo casos simples
(`SEED_SIMPLE_RETURN_STATES`), no porque no existan. REVERTIDO, EDITADO, ABIERTO y PROCESO
ELECTRÓNICO quedan fuera de esta épica.

**2. Sí, por el plazo del nivel.** Se marca cuando el nivel en curso pasa de
`started_at + sla_hours`. El reloj arranca cuando la nota llega a ese nivel, no en el alta. Por eso
una nota de 1 día puede estar demorada (nivel 1, 24 h) y una de 6 días no (nivel 2, que no tiene plazo
en el mockup). Se calcula al leer; no se guarda. Los plazos están en la 7 y la 10.

**3.** El mockup cuenta los días corridos desde el alta hasta hoy, sin detenerse nunca. Propuesta:
días corridos desde `created_at` hasta que el flujo termina (`finished_at` de la instancia vigente:
aprobada, rechazada o anulada); mientras está abierta, hasta hoy. Se calcula, no se guarda. Cuando
exista el retiro (otra épica), se extiende hasta el retiro. ⚠ Ruben.

---

## 2. Tipo de devolución

**4. No lo define el aprobador ni se calcula por stock: sale del motivo.** Es
`refund_reasons.process_type`:

| `process_type` | Etiqueta del mockup |
|---|---|
| `REGULAR` | NOTA CRÉDITO/DÉBITO NO FISCAL |
| `REPLACEMENT` | HAY STOCK PARA CAMBIO (reposición, intercambio 10 × 10) |
| `SAP` | Se procesa en SAP; nosotros solo la registramos |

Se congela por línea al crear la nota, copiado del parámetro vigente del motivo junto con
`cost_center`, como dice el diagrama ("refund_reason_params copia process_type y cost_center"). Falta
la columna: hay que agregar `process_type` y `cost_center` a `refund_order_details` en la migración
de ajuste. Como se conoce desde el alta, el listado lo puede mostrar siempre; el "—" del mockup ya no
haría falta.

⚠ ¿Una nota puede mezclar tipos? Propongo que no: Sales arma una nota por tipo y el consumidor lo
valida (si no, `refund.registration_rejected`).

**5. Sí, catálogo cerrado de 3 valores**: `REGULAR`, `REPLACEMENT` y `SAP` (hay un `CHECK` en
`refund_reasons`). El mockup solo muestra dos.

---

## 3. La escalera de aprobación

**6. Sí.** La nota recorre en orden todos los niveles, desde el 1 hasta el que cubre su monto. La
banda que se muestra es la del nivel. Un nivel entra cuando el monto es **mayor** que su `min_amount`
(una nota de Bs 500 exactos pasa solo por el nivel 1). El nivel 1 entra siempre. Al crear la
instancia se materializan los cuatro niveles y los que no aplican quedan `SKIPPED`. Tus ejemplos
están bien: Bs 300 → nivel 1; Bs 6.000 → los cuatro.

**7.** Son los umbrales de la escalera actual (`refund_level_thresholds`: 0 / 500 / 2.000 / 5.000):

| # | Nombre | Rol (código provisional) | Banda | Plazo |
|---|---|---|---|---|
| 1 | Analista de Experiencia al Cliente | `analista_cx` | Bs 0 – 500 | 24 h |
| 2 | Gerencia de Experiencia al Cliente | `gerente_cx` | Bs 500 – 2.000 | ⚠ sin plazo en el mockup; propongo 24 h |
| 3 | Gerente Comercial | `gerente_comercial` | Bs 2.000 – 5.000 | 48 h |
| 4 | Gerente General | `gerente_general` | Bs 5.000 en adelante | 72 h |

Los códigos de rol reales los define el módulo de administración (ver 16). El techo no se guarda: es
el piso del nivel siguiente. Propongo sacar `max_amount` de `refund_approval_levels` y de
`refund_workflow_instance_levels`, porque hoy es `NOT NULL DEFAULT 0` y no puede representar "sin
techo".

**8. Sí.** ANY con una sola firma. `required_approvals` queda fijo en 1 (o se quita) hasta que haga
falta ALL.

**9.** No tenemos una tabla de empleados por rol, ni la vamos a tener: quién tiene cada rol lo sabe el
módulo de administración (SCRML-278). El nivel guarda solo `role_code`. Para "Asignados": si
administración expone "usuarios con el rol X", lo consultamos al mostrar el detalle; si no, en esta
épica mostramos el nombre del rol y, una vez decidido, quién firmó (sale de `refund_workflow_actions`).

**10. Sí, plazo en horas por nivel.** Hay que activar `sla_hours`, hoy comentada en
`refund_approval_levels`, y copiarla a `refund_workflow_instance_levels` al materializar, como el
resto del snapshot. `NULL` significa sin plazo. Son horas corridas, no hábiles. ⚠ Ruben confirma los
valores.

---

## 4. Aprobar ítems y rechazar

**11. Vale el diagrama.**

- Solo el nivel 1 del primer intento elige ítems (`decision_mode = ITEM_SELECTION`). Los niveles 2 a
  4 aprueban o rechazan la nota entera. Los checkboxes en el nivel 2 son un atajo de demo del mockup,
  que deja decidir a cualquier aprobador en cualquier nota en curso; lo corrijo.
- Los ítems no tildados **no se rechazan: pasan a una nota disociada** (`document_type =
  DISSOCIATED`, mismo `note_number`, `split_sequence = 1`, `source_refund_order_id` apuntando a la
  original, y cada línea con su `source_detail_id`). La original sigue solo con lo tildado. La
  disociada queda en `EDITING` esperando que el vendedor la corrija en Sales, y se le avisa a Sales
  con `refund.dissociated` (ver 21). El texto "El resto queda rechazado" está mal; lo corrijo.
- Si se tilda todo, no hay disociada. Aprobar con nada tildado no se permite: para eso está Rechazar.
- ⚠ ¿El reenvío desde Sales de la disociada corregida entra en esta épica? Propongo que no: la
  disociada se crea y se notifica, y el reenvío queda para después.

**12. Rechazar termina la nota.**

- El nivel, la instancia y la nota pasan a `REJECTED` (CERRADO). Usamos `on_reject = TERMINATE` en
  los cuatro niveles; `RETURN_PREVIOUS` no se usa por ahora.
- El motivo es obligatorio (`refund_workflow_actions.reason`); el comentario es opcional.
- No vuelve sola al nivel 1. Volver a empezar es otra acción, **Reactivar**: la hace un aprobador
  sobre una nota CERRADA, con motivo y al menos una foto de la autorización firmada
  (`refund_workflow_action_images`). Crea una instancia nueva con `attempt + 1` que arranca en el
  nivel 1, conserva la selección de ítems ya hecha y tiene todos los niveles en `DOCUMENT_DECISION`.
  Eso es lo que el diagrama dibuja como "Rechazo → Nueva instancia → Nivel 1". La tarjeta del
  diagrama que dice que el nivel 1 rehace la selección quedó desactualizada.
- ⚠ SCRML-277 marca el rechazo "a confirmar". Propongo: Rechazar entra en esta épica; Reactivar va
  después.

**13. Sí.** Después de la selección del nivel 1, el `total` de la original pasa a ser la suma de sus
líneas `ACTIVE` (lo tildado) y la escalera se vuelve a evaluar con ese monto. Si queda dentro de la
banda del nivel en curso, la nota se aprueba ahí y los niveles de arriba quedan `SKIPPED`. Nunca baja
de nivel. La acción guarda `amount_before` y `amount_after`. Ejemplo: se piden Bs 6.204,50 y el
nivel 1 deja Bs 1.800; la nota sube al nivel 2 (500 – 2.000) y termina ahí.

**14. Solo tildar o destildar.** La selección es binaria (`refund_order_detail_decisions.decision =
SELECTED | DISSOCIATED`) y la cantidad no cambia. Bajar una cantidad solo lo hace el vendedor cuando
corrige (`quantity <= source_quantity`). El mockup ya funciona así: muestra un checkbox, no un campo
de cantidad.

**15. No.** "Correcciones" cuenta las correcciones del vendedor (máximo 1: "1 de 1 usada"). Los
rechazos y las reactivaciones se ven en el historial. Como la corrección del vendedor no entra en esta
épica, el campo se puede ocultar por ahora.

---

## 5. Permisos

**16.** No alcanza con `X-Actor` solo, porque es un header que cualquiera puede mandar, y no vamos a
tener una lista local de empleados. SCRML-278 dice que se usa el sistema de permisos del módulo de
administración. Propuesta: el JWT de la sesión web trae los roles o permisos y el backend lo valida.
De ahí salen `actor_employee_code` y `actor_role_code` para la bitácora. ⚠ Confirmar con quien lleva
administración cuál es el claim exacto y cómo se le asignan los roles a Experiencia al Cliente.

**17. Sí.** Solo decide quien tiene el `role_code` del nivel en curso; los demás ven la nota en solo
lectura. Que el Analista vea los botones en una nota del nivel 2 es el mismo atajo de demo de la 11 y
lo corrijo. En el backend: `403` si el rol no corresponde al nivel en curso y `409` si la nota ya no
está en ese nivel.

---

## 6. Datos que se muestran

**18. Se dejan fuera** el sector y el monto promedio mensual: no son datos de la nota, no los tenemos
y no se los pedimos a Sales en el evento. Mostramos lo que hay en nuestra copia de Customers
(teléfono, NIT, dirección, tipo de dueño). Canal de venta y tipo de cliente se muestran solo si están
en esa copia. Lo saco del mockup.

**19. Una sola cantidad, en unidad mínima.** Sales manda `quantity` en unidad mínima y las cajas las
calculamos con `products_ref.equivalence_box_unit` (10 doypack = 1 caja). Así se cumple
`importe = precio × unidades mínimas`. El código SAP sale de `products_ref.sku`.

El prefijo S o L es el **tipo de numeración del lote**, del catálogo del sistema actual (`SC`, `LP`,
`IMP`, `S`, `L`, `F`), que ya usamos en `refund_reason_param_lots.lot_type`. Sales lo manda aparte
(`lotType`) y agregamos `lot_type` a `refund_order_detail_sources`. ⚠ Qué planta o línea representa
cada letra lo sabe Calidad; para nosotros es un código.

**20.** El 4500018 del mockup es un id de prueba del seed. Propuesta: `note_number` es el número de
la nota en Sales, y es único. Sí, sirve para no registrar dos veces la misma nota:
`UNIQUE (note_number, split_sequence)` (la disociada comparte número, con split 1), y además
descartamos los `eventId` repetidos. Esto reemplaza la D-008, donde el número lo generábamos
nosotros. ⚠ Sales confirma que su número es único.

---

## 7. Qué pasa después de aprobar

**21. Sí.** Publicamos estos eventos para Sales:

| Evento | Contenido |
|---|---|
| `refund.approved` | `noteNumber`, ítems aprobados (`productId`, `quantity`, `priceUnit`, `processType`), `totalApproved`, fecha y aprobador final. |
| `refund.rejected` | `noteNumber`, nivel que rechazó y motivo. |
| `refund.dissociated` | `noteNumber`, `splitSequence` de la disociada y los ítems que pasaron a ella. |

A estos se suman `refund.received` y `refund.registration_rejected`, de la 0.

**22. No entra.** La épica termina en "aprobada" (SCRML-265: "hasta su aprobación"). El retiro
físico lo toma planificación en otra épica, consumiendo `refund.approved`. Por eso, por ahora, el
Tiempo logístico cuenta hasta la aprobación (ver 3).

---

## Cambios que salen de estas respuestas

Migración de ajuste:

- `refund_order_details`: agregar `process_type` y `cost_center`, congelados del motivo.
- `refund_order_detail_sources`: agregar `lot_type`.
- `refund_approval_levels`: activar `sla_hours`; quitar `max_amount`.
- `refund_workflow_instance_levels`: agregar `sla_hours`; quitar `max_amount`.
- `refund_orders`: `UNIQUE (note_number, split_sequence)`.
- `on_reject = 'TERMINATE'` en los cuatro niveles del seed.

Mockup:

- Texto del listado: "El alta la registra Ventas contra nuestro servicio" pasa a decir que llega por
  evento desde Ventas.
- "Tildá los productos que se aprueban. El resto queda rechazado." pasa a "El resto pasa a una nota
  disociada".
- Quitar el atajo que deja decidir a cualquier aprobador en cualquier nivel (`isEvaluating` en
  `return-view-page.tsx`).
- Quitar sector y monto promedio mensual del panel Cliente.

Pendientes de confirmar (⚠): 0 (permiso sobre el bucket de fotos y `owner_id`), 3, 4 (mezcla de
tipos), 7 y 10 (plazos), 11 (reenvío de la disociada), 12 (Reactivar), 16 (claim del JWT),
19 (significado de las letras) y 20 (unicidad del número en Sales).
