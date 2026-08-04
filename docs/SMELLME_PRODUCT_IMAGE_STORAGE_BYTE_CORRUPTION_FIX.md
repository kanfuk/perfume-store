# Fix: imágenes de producto corruptas en Supabase Storage tras subir en Vercel

## Síntoma

Después de subir una imagen nueva desde `/admin/catalogo/productos`, el
producto quedaba mostrando el fallback en vez de la foto real. Al recargar
la página, seguía cayendo al fallback — no era un problema de caché del
navegador ni de la verificación de visibilidad del lado cliente.

## Diagnóstico

El endpoint administrativo (`app/api/admin/products/[productId]/image/route.ts`)
recibe el archivo por `multipart/form-data`, lo procesa con Sharp
(`lib/product-image-processing.ts`) a WebP, y lo sube a Supabase Storage vía
`repositories/productImageRepository.ts`. Ejecutado localmente contra el
mismo proyecto Supabase, el pipeline completo conservaba los bytes en cada
etapa sin excepción. El mismo código, ejecutado dentro del runtime real de
Vercel (donde corre producción/Preview), no los conservaba.

## Evidencia

Se instrumentó temporalmente el pipeline (hash y validación de cabecera por
etapa, sin exponer bytes ni imprimir nada al cliente) y se agregó un
endpoint de diagnóstico autenticado que sube la misma imagen de prueba con
cuatro representaciones binarias distintas a una ruta temporal, descarga
cada una y compara. Resultado dentro del runtime real de Vercel:

- Entregar el `Buffer` de Node tal cual a `supabase.storage.upload()`
  alteraba el tamaño y el contenido del objeto guardado.
- Entregar `Uint8Array.from(buffer)`, `ArrayBuffer` o `Blob` en su lugar
  conservaba el archivo exactamente igual (mismo tamaño, mismo contenido).

Una subida real desde el navegador, antes de la corrección, reproducía el
mismo síntoma con el código de error `INVALID_STORAGE_WEBP`: la verificación
post-subida (ver más abajo) detectaba la cabecera RIFF/WEBP inválida y
bloqueaba el guardado en vez de reportar éxito con un archivo corrupto.

## Corrección aplicada

`repositories/productImageRepository.ts`, único archivo modificado para la
corrección: justo antes de subir a Storage,

```ts
const uploadBytes = Uint8Array.from(buffer);
```

y se sube `uploadBytes` en vez del `Buffer` original. La interfaz del
repositorio sigue recibiendo `Buffer` — la conversión es un detalle interno
de la implementación Supabase, no un cambio de contrato. No se usa
`buffer.buffer` directamente: un `Buffer` de Node puede tener un
`byteOffset` distinto de cero y compartir un `ArrayBuffer` más grande (pool
interno de Node), así que `buffer.buffer` podría exponer memoria ajena o el
tamaño equivocado. `Uint8Array.from(buffer)` copia los bytes lógicos uno a
uno, nunca reinterpreta la memoria subyacente.

## Medidas defensivas (ya existían, se conservaron)

Antes de actualizar la base de datos, `services/productImageService.ts`:

1. Valida que la salida de Sharp tenga cabecera RIFF/WEBP válida.
2. Sube el archivo procesado.
3. Descarga inmediatamente el mismo objeto recién subido.
4. Compara bytes exactos (tamaño y contenido) contra lo procesado, y valida
   de nuevo la cabecera RIFF/WEBP del objeto descargado.
5. Si algo no coincide: borra el objeto nuevo, nunca toca
   `image_url`/`image_storage_path`, conserva la imagen anterior y devuelve
   un error con `code` (`INVALID_SHARP_WEBP`, `STORAGE_ROUNDTRIP_MISMATCH`,
   `INVALID_STORAGE_WEBP`, etc.) y un `correlationId` — sin exponer hashes,
   rutas de Storage ni detalles internos al cliente.

`app/api/product-images/[...path]/route.ts` (ruta same-origin) sigue
rechazando servir cualquier objeto cuya cabecera RIFF/WEBP no sea válida
(`404` con `Cache-Control: no-store`), en vez de servir bytes corruptos con
`Content-Type: image/webp`.

## QA

Confirmado con una subida real autenticada en un Preview de Vercel: la
imagen se procesó y guardó, no apareció `INVALID_STORAGE_WEBP`, persistió
después de recargar la página de administración, siguió visible al volver a
la lista de productos, apareció correctamente en el catálogo público y en
el flujo de reserva/carrito del cliente, y no volvió a caer al fallback.

## Endpoint y trazabilidad de diagnóstico

El endpoint temporal de diagnóstico (`/api/admin/diagnostics/image-runtime-probe`)
y el helper de trazabilidad server-side (`lib/product-image-trace.ts`,
hashes y cabeceras por etapa en logs) se retiraron por completo una vez
confirmada la causa y la corrección. No quedan en el código ni en el build.

## Pendientes conocidos

- Los objetos de Storage correspondientes a productos de prueba usados
  antes de esta corrección (subidos con el código anterior, con bytes
  alterados) siguen corruptos. No se migraron ni repararon automáticamente
  — deben recibir una imagen nueva o eliminarse como limpieza de datos de
  QA, fuera del alcance de este fix.
- Esta corrección vive en la rama `fix/critical-issues-q3-2026`. Fusionar a
  `main` y desplegar a producción requieren autorización posterior.
