# DataTable — Skeleton de carga por fila y por celda

El `DataTable` soporta tres niveles de skeleton de carga:

| Prop | Alcance | Cuándo usarlo |
| --- | --- | --- |
| `isLoading` | Tabla completa | Carga inicial: reemplaza todo el cuerpo por filas skeleton. |
| `isRowLoading` | Una fila entera | Una fila se está guardando/actualizando; el resto de la tabla sigue usable. |
| `isCellLoading` | Una celda puntual (fila + columna) | Solo una columna de una fila carga (ej. asignar chofer), dejando el resto visible. |

Regla de combinación: una celda se pinta como skeleton si **`isRowLoading(row)` es `true` O `isCellLoading(row, columnId)` es `true`**. Podés usar una, otra, o las dos a la vez.

El estilo es el mismo que el skeleton global (`<Skeleton className="h-3 w-full" />`), pero acotado a la fila/celda y **sin recargar el resto de la tabla**.

---

## Firma de las props

```ts
interface DataTableProps<T extends object> {
  // ...
  /** Skeleton de la tabla completa (carga inicial). */
  isLoading?: boolean
  /** Skeleton por FILA: todas las celdas de esa fila se pintan como skeleton. */
  isRowLoading?: (row: T) => boolean
  /** Skeleton por CELDA: esa celda puntual (fila + columna) se pinta como skeleton. */
  isCellLoading?: (row: T, columnId: string) => boolean
}
```

> El `columnId` es el `id` que definís en `defineColumns` (ej. `'chofer'`, `'estado'`, `'acciones'`).

---

## Ejemplo 1 — Skeleton por fila entera

Marcás qué filas están "cargando" con tu propio estado (un `Set` de ids) y `isRowLoading` decide fila por fila. Todas las celdas de esa fila —incluidas las columnas especiales (checkbox / acciones)— se muestran como skeleton, lo que además evita interactuar con una fila que se está actualizando.

```tsx
import { useState } from 'react'
import { DataTable, defineColumns } from '@/components/data-table'

function OrdenesView() {
  // Ids de las filas que están guardándose.
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())

  const marcarCargando = (id: string) =>
    setSavingIds((prev) => new Set(prev).add(id))

  const desmarcar = (id: string) =>
    setSavingIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })

  const guardarFila = async (orden: Orden) => {
    marcarCargando(orden.id)
    try {
      await api.guardar(orden)
    } finally {
      desmarcar(orden.id)
    }
  }

  return (
    <DataTable
      tableId="ordenes"
      columns={columns}
      data={data}
      getRowId={(row) => row.id}
      isRowLoading={(orden) => savingIds.has(orden.id)}
    />
  )
}
```

---

## Ejemplo 2 — Skeleton por celda

Igual que arriba, pero además chequeás el `columnId`: así solo carga la columna que corresponde y el resto de la fila queda visible. Ideal para el caso de asignar chofer: mientras se resuelve, solo la celda `chofer` de esa fila muestra el skeleton.

```tsx
import { useState } from 'react'
import { DataTable } from '@/components/data-table'

function OrdenesTransporteView() {
  // Ids de las órdenes a las que se les está asignando el chofer.
  const [assigningIds, setAssigningIds] = useState<Set<string>>(new Set())

  const asignarChofer = async (orden: OrdenTransporte, chofer: string) => {
    setAssigningIds((prev) => new Set(prev).add(orden.id))
    try {
      await api.asignarChofer(orden.id, chofer)
    } finally {
      setAssigningIds((prev) => {
        const next = new Set(prev)
        next.delete(orden.id)
        return next
      })
    }
  }

  return (
    <DataTable
      tableId="ordenes-transporte"
      columns={columns}
      data={data}
      getRowId={(row) => row.id}
      // Solo la celda 'chofer' de las filas que se están asignando.
      isCellLoading={(orden, columnId) =>
        columnId === 'chofer' && assigningIds.has(orden.id)
      }
    />
  )
}
```

---

## Ejemplo 3 — Varias columnas por fila

`isCellLoading` puede cubrir más de una columna a la vez: devolvé `true` para cada `columnId` que quieras dejar en skeleton.

```tsx
<DataTable
  // Al recalcular una ruta cargan carga + estado, pero el código y el camión siguen visibles.
  isCellLoading={(orden, columnId) =>
    recalculandoIds.has(orden.id) && (columnId === 'carga' || columnId === 'estado')
  }
/>
```

---

## Notas

- Las tres props conviven. Si `isLoading` es `true` (carga inicial), tiene prioridad y se muestra el skeleton de tabla completa; `isRowLoading` / `isCellLoading` aplican una vez que hay datos.
- `isRowLoading` e `isCellLoading` son funciones puras del `row` (y del `columnId`): no guardan estado propio. El estado de "qué está cargando" lo maneja el consumidor (típicamente un `Set` de ids), lo que las hace determinísticas y fáciles de testear.
- Ambas se evalúan en cada render por cada celda visible: mantené la lógica barata (un lookup en un `Set` es lo ideal).
