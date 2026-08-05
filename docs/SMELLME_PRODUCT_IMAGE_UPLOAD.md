# Smellme.cl — Subida y procesamiento de imágenes de producto (Fase 3B.3)

Rama de trabajo: `feature/product-image-upload`. Base: `c75b324`.

## Auditoría previa

Antes de esta fase, "Asignar imagen" en `/admin/catalogo/productos`
(`components/admin/CatalogControlCenter.tsx`, `ImageCellEditor` heredado)
era pegar una URL a mano: el servidor solo validaba que fuera `https://` o
`/images/...` (`lib/image-url.ts`) y la guardaba tal cual en
`productos.image_url`. Nunca se descargaba, decodificaba ni procesaba nada.
Una vez asignada, la fila de escritorio solo mostraba el texto "Sí" sin
miniatura ni forma de reemplazarla; en mobile el editor ni siquiera se
mostraba si ya había imagen. No existía ningún bucket de Supabase Storage
en todo el proyecto (cero referencias en código y en `supabase/schema.sql`)
ni ninguna prueba automatizada para ese endpoint.

## Estándar Top 12 encontrado

El único precedente real de "cómo se ve una foto de producto" son las 12
imágenes curadas en `public/images/perfumes/top12/*.webp`, producidas
offline por `scripts/catalog/optimize-top12-images.mjs` con `sharp`:
autorotación EXIF (`.rotate()`), redimensión solo si el lado mayor supera
1600px (`fit: "inside"`, `withoutEnlargement: true`, proporción siempre
preservada, sin recorte, sin canvas ni fondo añadido), conversión final a
WebP calidad 86. El "contain" visual lo aporta el contenedor CSS
(`components/ProductImage.tsx`, `next/image` con `fill` dentro de
`aspect-square`, `object-contain` en la grilla admin de Top 12), no el
archivo. Esta fase adopta exactamente esos mismos parámetros para toda
imagen subida por el admin, en vez de inventar un estándar nuevo.

## Formato y dimensiones finales

- Formato de salida: **WebP**, calidad **86**.
- Máximo **1600px** en el lado más largo; nunca agranda (`withoutEnlargement`).
- Proporción siempre preservada; nunca recorta ni deforma.
- Transparencia preservada si el PNG de origen tiene alfa (WebP la soporta).
- Metadatos (EXIF, etc.) removidos por omisión: `sharp` no adjunta EXIF a
  la salida WebP salvo que se llame `.withMetadata()` explícitamente, y no
  se llama.

Ver `lib/product-image-processing.ts` (`processProductImage`) y
`lib/product-image-config.ts` (`PRODUCT_IMAGE_CONFIG`, único lugar con
estos números).

## Bucket y storage path

Bucket nuevo `product-images` (no existía ninguno antes de esta fase),
creado en `supabase/migrations/20260803000000_perfume_store_product_images_storage.sql`:
público de **solo lectura** (el catálogo público necesita mostrar las
fotos sin sesión), con `insert`/`update`/`delete` acotados a `service_role`
vía políticas RLS sobre `storage.objects`. El navegador nunca sube ni
borra directo a Storage: siempre pasa por la API administrativa.

Convención de ruta: `products/{productId}/{uuid}.webp` — sin datos
personales, sin nombre comercial como identificador, colisión
prácticamente imposible (UUID nuevo en cada subida), permite reemplazos
seguros sin pisar el archivo anterior. Solo se guarda el archivo ya
procesado; nunca el original.

## Validación de entrada

MIME aceptados: `image/jpeg`, `image/png`, `image/webp`. Tamaño máximo de
entrada: 10 MiB (sin precedente previo en el proyecto para imágenes; el
único límite de archivo existente era 2 MiB para CSV de catálogo, no
reutilizable directamente). El resultado final queda muy por debajo.

La validación real es la decodificación con `sharp` (`failOn: "error"`):
si el archivo está corrupto, el MIME declarado no coincide con el
contenido real, o el formato decodificado no está en la lista blanca
(`jpeg`/`png`/`webp`), se rechaza. No se agregó ninguna dependencia nueva
de "magic bytes": `sharp` ya decodifica de verdad como parte del propio
procesamiento.

**HEIC/HEIF** (común en fotos de iPhone): no soportado. El proyecto no
tenía procesamiento HEIC confiable y agregar una dependencia pesada solo
para eso no se justificaba. Se detecta por firma de caja `ftyp` con marca
`heic`/`heix`/`hevc`/`heim`/`heis`/`hevm`/`hevs`/`mif1` (sin decodificar) y
se muestra: *"Este formato no es compatible. Convierte la imagen a JPG,
PNG o WebP."*

SVG y GIF: `sharp` sí puede decodificarlos, pero como su `format` decodificado
no está en la lista blanca, se rechazan igual que cualquier otro formato no
soportado.

## Reemplazo seguro y rollback

Orden exacto (`services/productImageService.ts`,
`reemplazarImagenProducto`):

1. Verificar que el producto existe.
2. Procesar el archivo (`processProductImage`) — si falla, no se sube nada.
3. Subir el archivo nuevo a Storage con un path nuevo (UUID).
4. Si la subida falla: la imagen anterior queda intacta, nada más ocurre.
5. Actualizar `productos.image_url`/`image_storage_path` con el archivo
   nuevo.
6. Si la actualización de la DB falla: se borra el archivo nuevo (huérfano)
   y la imagen anterior sigue intacta — nunca queda un producto sin
   ninguna imagen por un fallo de DB.
7. Solo después de que la DB confirma el cambio, se intenta borrar el
   archivo anterior (si pertenece al bucket administrado).
8. Si ese borrado falla: no se revierte la imagen nueva (ya quedó
   correctamente asociada al producto) — queda un archivo huérfano en
   Storage para limpieza posterior, sin mostrar error técnico al usuario.

Nunca se borra la imagen anterior antes de confirmar que la nueva quedó
subida y persistida.

## Eliminación

`eliminarImagenProducto`: limpia `image_url`/`image_storage_path` en la
DB; solo intenta borrar el objeto de Storage si el `image_storage_path`
pertenece al bucket administrado (empieza con `products/`) —
**nunca borra una URL externa histórica** pegada a mano antes de esta
fase. Idempotente: llamarlo dos veces no falla la segunda vez. No modifica
`es_top`, `orden_destacado`, precio, costo, stock, familia, marca,
contenido ni SKU.

## URL avanzada (compatibilidad)

`PATCH /api/admin/products/[productId]/image` se mantiene sin cambios de
contrato (mismo body `{ imageUrl }`, misma validación
`lib/image-url.ts`). En la UI queda como "Opciones avanzadas" secundaria
(colapsada por defecto), nunca junto a Subir/Reemplazar como acción
principal.

## Seguridad

`POST`/`DELETE` en `app/api/admin/products/[productId]/image/route.ts`
exigen sesión admin y origen confiable, igual que el resto de la API
administrativa. `POST` exige `multipart/form-data`, rechaza claves
desconocidas en el form-data (solo se acepta el campo `file`), valida
tamaño y MIME antes de procesar. El cliente nunca decide bucket, storage
path, nombre final ni dimensiones — todo lo calcula el servidor. Las
respuestas de escritura llevan `Cache-Control: no-store`. Los errores se
traducen a mensajes en español sin exponer detalle de Supabase ni stack.

## Catálogo y Top 12

`productos.image_url` es el mismo campo que ya usaba el catálogo público y
Top 12. Por eso, si un producto que ya forma parte de Top 12 recibe una foto
nueva desde esta pantalla, la grilla de Top 12 la reflejará automáticamente
(mismo campo compartido). Esta fase no modifica `es_top` ni `orden_destacado`
en ningún momento.

**Actualizado en Fase 7.4:** `vincularProductoTop12` ya **no** sobrescribe
`image_url` con la foto curada del rank (`data/top12-image-map.json`). Ese
mapa quedó documentado como archivo histórico sin consumo automático — ver
`docs/SMELLME_REMAINING_ROADMAP.md`. La imagen mostrada en cada puesto del
Top 15 es siempre la imagen real del producto vinculado.

## Responsive

390px: botón "Subir imagen"/"Reemplazar"/"Eliminar" con altura mínima
44px, miniatura contenida en un cuadro pequeño fijo, sin scroll
horizontal, selector de archivo compatible con galería del teléfono
(`accept="image/jpeg,image/png,image/webp"` sin restricción de cámara).
768px/1440px: la celda de imagen no agranda las filas de la tabla;
miniaturas pequeñas y legibles.

## QA autenticado

Realizado contra el proyecto Supabase remoto real con un producto de
prueba claramente identificable (prefijo `ZZTEST`, nunca un producto real
de Top 12): subida de una fixture generada para QA, verificación de
transformación/Storage/DB/catálogo, reemplazo por una segunda fixture con
confirmación de que la primera se borró de Storage después del éxito,
eliminación con confirmación del estado "Sin imagen", y pausa del producto
de prueba al cierre. Ningún producto ni imagen real de Smellme fue tocado.

Se repitió además contra el Preview desplegado en Vercel (no solo contra
`localhost`): era el único punto que no se podía verificar con certeza en
local, porque `sharp` es un binario nativo y el runtime serverless de
Vercel (Linux) es distinto del entorno de desarrollo. La subida en el
Preview devolvió `201` con el WebP procesado correctamente, confirmando
que `sharp` funciona dentro de la función serverless real, no solo durante
el build.

## Limitaciones y fuera de alcance

- No reprocesa imágenes ya existentes: solo nuevas cargas o reemplazos.
- No migra URLs externas históricas al bucket nuevo.
- No hay carga masiva ni edición de fondo/marcas de agua.
- No usa IA (ni para eliminar fondo, ni para generar/mejorar imágenes).
- Un fallo al borrar el archivo anterior tras un reemplazo exitoso deja un
  huérfano en Storage; no hay job de limpieza automática todavía (fuera de
  alcance de esta fase).
- Los objetos públicos del bucket se sirven con `Cache-Control: max-age=3600`
  (comportamiento por defecto de Supabase Storage, no configurado por esta
  fase). Confirmado en QA: el objeto se borra realmente de Storage de
  inmediato (verificado listando el bucket con `service_role`, la fuente de
  verdad), pero la URL pública de una imagen reemplazada o eliminada puede
  seguir devolviendo la versión cacheada hasta por una hora en el navegador
  o CDN del cliente que ya la había cargado. No afecta la integridad de los
  datos, solo la frescura visual en ese caso puntual.
