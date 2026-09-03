# Devoluciones: registro de decisiones 2026-09-02

Este registro fija las decisiones de contrato y aplicación que no se derivan por sí solas del DDL.
Rige únicamente para los dos endpoints de esta fotografía; cualquier cambio requiere una nueva
decisión y la actualización coordinada de contratos y diagramas.

## Fuente fijada

| Dato | Valor |
|---|---|
| Archivo | [`db_script.sql`](../../../db_script.sql) |
| Bloque | [`db_script.sql:L915-L1172`](../../../db_script.sql#L915-L1172) |
| Fecha | `2026-09-02` |
| Base `HEAD` | `dd4b92db5509efd2b3800235a665fad90139cf27` |
| SHA-256 completo | `2c62523505a864bc84c44db70d5f195f74a9b1b99f626399efcce1f41437f185` |

## Decisiones vigentes

### D-001

**Alcance HTTP.** La fotografía define únicamente `GET /api/v1/refund-reasons` y
`POST /api/v1/refunds`. Los endpoints de documentos anteriores son históricos y no forman parte de
este contrato.

### D-002

**Catálogo de motivos.** El GET devuelve `id`, `name`, `description` y `lotRequirement`, ordenados
por `name` e `id`, solo para motivos activos y no borrados. `name` y `description` deben ser textos
no vacíos de hasta 150 y 300 caracteres, respectivamente.

### D-003

**Frontera de confianza con Sales.** Sales es la fuente confiable de elegibilidad comercial,
existencia del producto, correspondencia entre cliente y factura, precio y cantidad devolvible.
Refunds no consulta esos datos: valida la forma del request, el motivo local, la distribución de
cantidades, las fuentes, las imágenes y las reglas de lote.

### D-004

**Semántica de lote.** `REQUIRED` exige lote no vacío en cada source; `OPTIONAL` permite omitirlo;
`HIDDEN` prohíbe enviar la propiedad `lot` y exige `invoiceNumber`. Una infracción produce `422`.

### D-005

**Límites de creación.** El POST admite entre 1 y 50 items y entre 1 y 50 sources por item. Los IDs
deben ser enteros positivos representables por `BIGINT`; los decimales deben ser representables por
`DECIMAL(12,2)`. Factura y lote admiten hasta 50 caracteres y la URL hasta 255. Una infracción de
valor, precisión, escala, cantidad o longitud produce `422`.

### D-006

**Configuración determinista.** La creación lee una sola fotografía `REPEATABLE READ` de niveles
activos y no borrados. Debe encontrar exactamente un `workflow_version_id`, al menos un nivel y
órdenes únicas y consecutivas desde 1, con `min_amount >= 0`. Si la configuración no cumple estas
condiciones, responde `503` sin persistir la devolución.

### D-007

**Unidad atómica.** La aplicación confirma la transacción solo después de comprobar que se
escribieron la cabecera, todas sus líneas, fuentes e imágenes, una instancia, todos los niveles
esperados, la acción `CREATED` y el puntero de instancia vigente. `BEGIN`/`COMMIT` aporta atomicidad;
las comprobaciones de cardinalidad de la aplicación aportan completitud.

### D-008

**Idempotencia y numeración.** El contrato no define idempotency key ni el algoritmo de
`noteNumber`, y el DDL no declara unicidad de negocio. Un reintento puede crear otra nota. Ambos
mecanismos permanecen `PENDIENTE` y el cliente no debe interpretar un timeout como prueba de fallo.

### D-009

**Snapshot de runtime.** Los niveles del intento copian `level_order`, `name` como `level_name`,
`role_code`, `min_amount` y `max_amount`. No conservan `workflow_version_id`, `approval_policy`,
`required_approvals` ni `on_reject`; `decision_mode` proviene del runtime, no del snapshot de
configuración. La representación del último nivel sin techo permanece `PENDIENTE`.

## Navegación

- [README de la fotografía](./README.md)
- [Contratos HTTP](./ContratosHttp.md)
- [Documentación técnica](./DocumentacionTecnica.md)
- [Diagramas](../../../diagrams/devoluciones/db-script-2026-09-02/README.md)
