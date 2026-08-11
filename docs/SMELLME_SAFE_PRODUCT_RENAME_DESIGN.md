# Edición segura de nombre de productos — diseño

## A1. Auditoría de identidad de producto (antes de implementar)

Verificado en el código real (no asumido):

- **Identidad primaria**: `productos.id` (uuid). Todas las relaciones
  comerciales usan `id`, nunca `nombre`:
  - `pedido_items.producto_id -> productos.id` (`ON DELETE SET NULL`,
    migración `20260724000000`).
  - Stock (`stock_actual`, `stock_reservado`, `stock_agenda`,
    `stock_minimo`) vive como columnas de la fila `productos` identificada
    por `id`.
  - Top (`es_top`, `orden_destacado`) y Ofertas (`es_oferta_semana`) son
    columnas de esa misma fila.
  - Imágenes (`image_url`, `image_storage_path`) idem.
  - `product_image_assistant_attempts.product_id -> productos.id`.
- **Identidad secundaria estable**: `sku` — usada por el importador CSV
  (`buscarProductoPorSku`) para hacer *upsert* (`services/productoService.ts`,
  `confirmarImportacionCsv`/`confirmarImportacionProveedor`). El SKU
  **nunca** se deriva del nombre en tiempo de ejecución — es un campo
  independiente, escrito una sola vez al crear el producto (CSV o alta
  manual) y nunca recalculado.
- **`nombre` NO es identidad**: no aparece en ninguna FK, ninguna cláusula
  `WHERE` de matching comercial, ni en la clave primaria de ninguna tabla.
  Confirmado por grep exhaustivo sobre `repositories/`, `services/`,
  `supabase/migrations/`.

**Conclusión**: renombrar un producto (`UPDATE productos SET nombre = ...
WHERE id = ...`) no puede romper ninguna relación existente — ni pedidos,
ni stock, ni Top, ni Ofertas, ni imágenes — porque ninguna de esas
relaciones depende del valor de `nombre`.

### Snapshot histórico (pedido_items)

`pedido_items` guarda una copia completa e independiente del producto en
el momento de la venta: `producto_sku`, `producto_nombre`, `producto_marca`,
`producto_contenido`, `producto_descripcion`, `producto_image_url`,
`producto_tipo`, más `precio_unitario`, `costo_unitario`, `total_costo`,
`utilidad_bruta`, `subtotal` — poblada una sola vez por las RPC
transaccionales (`create_perfume_order_v1`, `create_direct_sale_v1`) al
crear el pedido. **Nunca se recalcula ni se vuelve a leer de `productos`**
para mostrar un pedido histórico (confirmado: `pedidoRepository.ts` no hace
join a `productos` en las consultas de listado de pedidos). Por lo tanto:

- Renombrar un producto **no reescribe** ningún pedido histórico — el
  snapshot (`producto_nombre`) queda exactamente como estaba al momento de
  la venta, automáticamente, sin ningún código adicional.
- Pedidos **nuevos** (creados después del rename) usan el nombre corregido
  porque las RPC leen `productos.nombre` en el momento de crear el pedido.
- Reportes de rentabilidad (`resolveOrderItemProfitabilityCost`) y cierres
  semanales (`CierreSemanalService.calcularSnapshot`) leen el costo/nombre
  desde el snapshot de `pedido_items`, nunca desde `productos` — un rename
  no altera ningún cierre ya calculado ni ninguna cifra histórica.

**No se requiere ningún UPDATE masivo ni migración de datos históricos.**

## A3. SKU nunca cambia automáticamente

El servicio de rename (`ProductoService.renombrarProductoAdmin`) solo
escribe dos columnas: `nombre` y `nombre_bloqueado`. Nunca toca `sku`, `id`,
`stock_actual`, `stock_reservado`, `stock_agenda`, `costo_unitario`,
`precio_venta`, `image_url`, `es_top`, `orden_destacado`,
`es_oferta_semana`, `archived_at`. Verificado por tests dedicados (ver
sección A8).

## A4. Protección contra CSV — `nombre_bloqueado`

**Modelo elegido**: una columna boolean (`productos.nombre_bloqueado`,
default `false`), migración incremental de una sola línea (`ALTER TABLE ...
ADD COLUMN IF NOT EXISTS`), sin backfill, sin tocar filas existentes. Es el
mismo patrón ya usado para `archived_at`/`archived_reason`
(`20260814000000_smellme_safe_product_removal.sql`).

**Comportamiento**:

- Toda edición manual de nombre desde Admin establece `nombre_bloqueado =
  true` automáticamente (no requiere un toggle aparte — mantiene la UI
  simple).
- El importador CSV (ambos perfiles, canónico y proveedor) **omite
  únicamente el campo `nombre`** de una fila cuyo producto existente tenga
  `nombre_bloqueado = true` y cuyo SKU no esté en la lista explícita
  `overrideNombreSkus` — el resto de los campos (precio, costo, stock,
  Top, Ofertas) se siguen actualizando normalmente desde el CSV. El
  preview (`previsualizarImportacionCsv`/`previsualizarImportacionProveedor`)
  reporta el conflicto en `nameConflicts: string[]` (mismo patrón ya
  implementado para `archivedConflicts`).
- Si el admin decide explícitamente reemplazar la corrección manual
  (`overrideNombreSkus` incluye el SKU), el CSV aplica su nombre y
  `nombre_bloqueado` vuelve a `false` — la protección se "gasta" en esa
  decisión explícita, tal como ya ocurre con `reactivarSkus` para
  productos archivados.

**Por qué no una solución sin migración**: no existe ningún campo existente
que pueda representar "este nombre fue corregido a mano" — es estado nuevo
que no se puede derivar de datos ya presentes. La migración es mínima,
aditiva, backward-compatible, y no se aplica al Supabase remoto
automáticamente (solo local, para Preview, pendiente de decisión del
OWNER — ver reporte final).

## Consideración de familias (marca+nombre) — documentada, no implementada

El catálogo público/Top15 agrupa variantes (distintos `contenido`) de un
mismo perfume por clave `marca+nombre` (`lib/product-families.ts`,
`buildFamilyKey`). Si un perfume tiene varias presentaciones (30ML/80ML)
como filas independientes con el mismo `nombre`, renombrar **solo una**
variante cambiaría su clave de familia y la separaría visualmente de sus
hermanas en Top15/catálogo público. El encargo de esta fase pide
explícitamente un rename **por producto** (mismo `id`, mismo `sku`), no
"por familia" — implementar un rename que actualice todas las variantes
hermanas automáticamente sería un cambio de alcance no solicitado. Se
documenta el riesgo aquí y se mitiga con una nota informativa en el modal
de edición cuando el producto tiene otras presentaciones, para que el
admin decida si debe repetir la corrección en cada una.

## A6. Auditoría

Nuevo evento `PRODUCT_NAME_UPDATED` en `admin_audit_log`
(`lib/admin-audit.ts`), reutilizando `logAdminAction` existente —
`before`/`after` (snapshot completo del producto) más `metadata: {
productId, oldName, newName }`. Ningún secreto.
