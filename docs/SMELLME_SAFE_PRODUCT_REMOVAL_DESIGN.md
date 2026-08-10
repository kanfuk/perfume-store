# Eliminación segura de productos — diseño (V2.2.1)

Rama `feature/smellme-v2-2-1-safe-product-removal`, base `origin/main` @ `6c7b001`.

## PRODUCT_DEPENDENCY_MAP

Auditoría exhaustiva sobre las 26 migraciones de `supabase/migrations/` y el
código de aplicación. Nada de lo siguiente es especulativo: cada fila cita el
archivo real.

| Tabla / servicio | Relación con `productos` | Comportamiento actual | Riesgo si el producto desaparece |
|---|---|---|---|
| `pedido_items.producto_id` | FK `on delete set null` (`20260724000000_perfume_store_foundation.sql:292`) | Guarda snapshot completo (`producto_sku/nombre/marca/contenido/descripcion/image_url/tipo`, `precio_unitario`, `costo_unitario`, `total_costo`, `utilidad_bruta`, `subtotal`) al crear el pedido, vía `create_perfume_order_v1`/`create_direct_sale_v1` | Bajo: el historial visual sobrevive un `DELETE` físico porque nunca hace JOIN a `productos` para mostrarse (confirmado por grep en `repositories/pedidoRepository.ts`). Se pierde `producto_id` (no se puede volver a navegar "ver producto" desde el pedido) |
| `product_image_assistant_attempts.product_id` | FK `on delete cascade` (`20260804000000_safe_image_assistant_history.sql:5`) | Historial del asistente de imágenes por producto | Alto si se hace hard delete de un producto con historial de asistente: se pierde por completo. Mitigado prefiriendo ARCHIVE sobre DELETE cuando hay historial |
| `pedidos.cliente_id` | FK a `clientes`, sin `on delete` (bloquea) | — | No aplica a productos directamente |
| `pagos.pedido_id` | FK a `pedidos`, sin `on delete` | Sin FK directa a productos | El monto pagado no depende de que el producto exista |
| `cierres_semanales` | Sin FK a productos; `snapshot_json` es una fotografía inmutable | RPCs `create_weekly_closure_v1`/`reopen_weekly_closure_v1`, `SECURITY DEFINER`, solo `service_role` | Ninguno: un cierre ya calculado no vuelve a leer `productos` |
| `admin_audit_log` | `entity_id` como texto libre, sin FK | Append-only (`admin_audit_log_append_only` trigger) | Ninguno |
| Top (`productos.es_top`, `orden_destacado`) / `get_effective_top_products_v1` | JOIN a `productos` en el modo automático/híbrido, exige `p.activo` | `20260811000000_top15_hybrid_automatic_configurable.sql` | Ninguno: un producto pausado o archivado (`activo=false`) desaparece automáticamente del Top calculado |
| Ofertas (`productos.es_oferta_semana`) | Columna directa | `app/api/admin/ofertas/route.ts` | Debe limpiarse explícitamente al archivar/eliminar (no ocurre solo) |
| Catálogo público / búsqueda | `productoService.obtenerProductosActivos()` filtra `activo=true` + metadatos completos | `services/productoService.ts:149-205` | Ninguno: un producto archivado (`activo=false` forzado) ya deja de listarse con el mecanismo existente |
| Importador CSV | Matching por SKU (`buscarProductoPorSku`), solo crea/actualiza, **nunca elimina** (test `tests/services/productoService.test.ts:271`) | `services/productoService.ts` (`previsualizarImportacionCsv`/`confirmarImportacionCsv`) | Un producto archivado podría reactivarse **silenciosamente** si el SKU reaparece en un CSV futuro — requiere guardia explícita (sección 16 del encargo) |
| Storage (`product-images`) | `image_storage_path` en `productos`; sin FK, borrado manual vía `productImageService.eliminarImagenProducto` | Limpia DB primero, borra archivo físico best-effort (`.catch(() => {})`) | Bajo si se preserva la imagen en ARCHIVE (decisión de diseño, sección 17 del encargo) |
| `stock_reservado` | Columna directa en `productos`, sin tabla de movimientos separada | No hay tabla de movimientos de stock en el esquema actual | Reserva activa = señal de uso comercial en curso, debe bloquear |

**Hallazgo crítico:** `repositories/productRepository.ts:254-269` captura el
código de error Postgres `23503` (foreign_key_violation) asumiendo que existe
una FK `RESTRICT` desde `pedido_items` hacia `productos`. Esa FK es en
realidad `ON DELETE SET NULL`, por lo que ese catch **nunca se dispara**: hoy
es posible borrar físicamente un producto con historial de ventas sin ningún
error. La única función objetivo (Fase 4 del encargo) es reemplazar por
completo esta ruta con clasificación explícita a nivel de aplicación/RPC.

**Precedente de diseño reutilizado:** `reset_smellme_catalog_v1` /
`preview_smellme_catalog_reset_v1`
(`supabase/migrations/20260805000000_smellme_mvp_v2_maintenance.sql:227-312`)
ya implementa la clasificación `BLOQUEADO / ARCHIVABLE / ELIMINABLE` para un
reset masivo del catálogo completo. Este diseño adapta exactamente esa misma
clasificación a un solo producto, con dos añadidos que el reset masivo no
necesitaba: bloqueo por semana contable abierta, y preservación de la imagen
al archivar (el reset masivo sí limpia imágenes porque borra el catálogo
entero).

## Decisión de diseño: columna nueva para distinguir PAUSADO de ARCHIVADO

`productos.activo=false` ya significa "pausado" en el modelo actual (toggle
existente en `PATCH .../route.ts` modo `"toggle"` → `cambiarEstadoProducto`).
Reutilizar solo `activo` para archivar haría indistinguibles ambos estados en
el catálogo admin, violando el requisito explícito de la Fase 4. Se agregan
dos columnas mínimas:

```sql
alter table public.productos
  add column archived_at timestamptz,
  add column archived_reason text;
```

- `archived_at is null` → nunca fue retirado del catálogo (activo o pausado
  manualmente, sin distinción adicional necesaria).
- `archived_at is not null` → `ARCHIVADO`. Se fuerza `activo=false` en la
  misma transacción, así que el catálogo público y el Top automático quedan
  cubiertos sin tocar su lógica existente.

No se agrega una tabla de movimientos de stock ni un `catalog_status` enum
separado: serían estructuras adicionales sin consumidor hoy, contra la
instrucción explícita de no agregar columnas innecesarias.

## Clasificación de elegibilidad (equivalente a `reset_smellme_catalog_v1`, por producto)

Implementada en TypeScript (`services/productRemovalService.ts`), no en SQL,
porque depende del contrato de fecha contable (`lib/sales-accounting-date.ts`)
y de los límites de semana en `America/Santiago`
(`lib/weekly-closures/period.ts`), ambos ya resueltos en TypeScript sin
librerías externas — reimplementarlos en PL/pgSQL duplicaría lógica de
timezone/DST ya validada por `docs/SMELLME_WEEKLY_CLOSURES_DESIGN.md`.

1. **`PRODUCT_HAS_ACTIVE_ORDERS`** (bloqueado): existe algún `pedido_items`
   del producto cuyo pedido está en `NUEVO | AGENDADO | PAGADO | PREPARANDO |
   DESPACHADO`, o `stock_reservado > 0`. Mismo criterio que `BLOQUEADO` en el
   precedente de reset.
2. **`PRODUCT_HAS_OPEN_WEEK_SALES`** (bloqueado): entre los pedidos
   `ENTREGADO` que contienen el producto (venta real, no cancelada), alguno
   tiene fecha contable (`fechaPago ?? fechaPedido`, igual que
   `getSalesAccountingDate`) cuya semana calendario (lunes 00:00 → lunes
   siguiente 00:00, `America/Santiago`,
   `getWeekPeriodBoundariesForMonday`) **no** tiene un cierre `CLOSED` exacto
   en `cierres_semanales`.
3. **`ARCHIVE`**: no bloqueado, y existe al menos un `pedido_items` para el
   producto en cualquier estado (incluye pedidos cancelados — mismo criterio
   que `ARCHIVABLE` en el precedente de reset, preserva el registro de lo que
   se intentó vender aunque no se haya concretado).
4. **`HARD_DELETE`**: no bloqueado y sin ningún `pedido_items` asociado.

La mutación real (archivar o eliminar) se ejecuta en una función PL/pgSQL con
`select ... for update` sobre la fila del producto, que **vuelve a verificar**
`PRODUCT_HAS_ACTIVE_ORDERS`/existencia de historial en el momento exacto de
escribir — así se cierra la ventana de concurrencia (admin A abre el popup,
admin B genera una venta, admin A confirma) sin depender de que el
`eligibility` previo siga siendo válido.

## Hard delete (`hard_delete_product_v1`)

Solo si, revalidado dentro de la transacción: sin ningún `pedido_items`
histórico y `stock_reservado = 0`. Borra la fila de `productos` (cascada
automática sobre `product_image_assistant_attempts`, ya `ON DELETE CASCADE`);
retorna el `image_storage_path` para que la capa de aplicación borre el
archivo físico en Storage (mismo patrón best-effort que
`productImageService.eliminarImagenProducto`). Se excluye de Top/Ofertas por
construcción (la fila ya no existe).

## Archive (`archive_product_v1`)

Solo si, revalidado dentro de la transacción: no hay pedidos activos ni stock
reservado. Establece `activo=false, archived_at=now(), archived_reason=...,
es_top=false, es_oferta_semana=false, orden_destacado=null, stock_actual=0,
stock_agenda=0`. **No** limpia `image_url`/`image_storage_path` (a diferencia
del reset masivo): la imagen de un producto con historial se preserva porque
sigue siendo parte de la experiencia histórica de ese pedido, y su Storage
object no es huérfano hasta que el producto se elimine físicamente (lo cual
ya no es posible una vez archivado con historia).

## Reactivación

Un producto archivado puede reactivarse por dos vías, ambas auditadas como
`PRODUCT_REACTIVATED`:

- Manualmente, reutilizando el toggle existente `cambiarEstadoProducto(id,
  true)`: si el producto estaba archivado, limpia `archived_at`/
  `archived_reason` en la misma operación (exige stock > 0, igual que hoy
  exige para cualquier reactivación).
- Vía CSV (sección 16 del encargo): ver más abajo.

## Reimportación CSV de un producto archivado

El importador matchea por SKU y hoy nunca reactiva ni elimina. Se agrega una
guardia explícita: si el SKU del CSV coincide con un producto cuyo
`archivedAt` no es null, el preview lo marca con `accion: "archived_conflict"`
en vez de `"actualizar"`, y el paso de confirmación **no aplica ningún cambio**
a ese producto salvo que la request incluya su id en una lista explícita
`reactivarSkus` decidida por el admin. Si se reactiva, se registra
`PRODUCT_REACTIVATED`; si no, el producto permanece archivado sin
modificaciones (no se crea un producto duplicado con otro SKU).

## Auditoría

Nuevas acciones en `ADMIN_AUDIT_ACTIONS`: `PRODUCT_DELETED`,
`PRODUCT_ARCHIVED`, `PRODUCT_REACTIVATED`. La columna `admin_audit_log.action`
solo tiene un `check (length(action) between 3 and 80)` (sin enum en SQL), así
que no se necesita migración adicional para estos valores, solo actualizar la
constante en `lib/admin-audit.ts`. `PRODUCT_DELETE_BLOCKED` no se registra en
el bloqueo por elegibilidad (ruido de simples consultas), siguiendo la
guía explícita del encargo de no llenar el log con eso.

## Permisos

El servidor ya exige `getAuthenticatedAdmin()` (admin activo autenticado) en
ambos endpoints existentes; no hay hoy ninguna ruta de producto que distinga
OWNER de ADMIN. Se mantiene ese mismo nivel (cualquier admin activo) para
elegibilidad, archive y hard delete — no se introduce una restricción nueva
que el negocio no pidió explícitamente, consistente con la instrucción de no
imponer restricciones arbitrarias.
