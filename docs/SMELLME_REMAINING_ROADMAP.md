# Smellme Store — Roadmap restante (checkpoint persistente)

Última actualización: 2026-08-05, rama `feature/top15-offers-editorial-control`
(base: `main` @ `3603a132613e60efcdd5e5f86e9e0764ecd4580e`).

Este documento preserva el roadmap acordado para las fases 7.4 a 7.9. Solo
la Fase 7.4 se implementa en esta rama; las fases 7.5 a 7.9 quedan
documentadas como pendientes, sin implementación.

## Fase 7.4 — Control editorial real de Top 15, Ofertas de la semana e
imágenes asociadas al producto (esta rama)

- **Edición Top 15**: `components/admin/Top12AdminPanel.tsx` +
  `app/api/admin/top12/route.ts` + `services/productoService.ts`
  (`vincularProductoTop12`/`desvincularProductoTop12`). Máximo exacto de 15
  posiciones, contador "X de 15 seleccionados", búsqueda por nombre/marca/SKU,
  confirmación explícita antes de reemplazar una posición ya asignada por un
  producto distinto.
- **Eliminación de la dependencia de imágenes predeterminadas**: hasta esta
  fase, vincular un producto a las posiciones 1-12 del Top 15 sobrescribía su
  `image_url` real con una fotografía curada fija por posición
  (`data/top12-image-map.json`), incluso si esa fotografía correspondía a un
  perfume distinto al vinculado. Se corrigió: la imagen ahora es siempre un
  atributo del producto, nunca de la posición. `data/top12-image-map.json` y
  `public/images/perfumes/top12/*.webp` se conservan en el repositorio como
  archivos históricos (no se borraron, por prudencia), pero ya no se leen ni
  se escriben automáticamente en ningún flujo — ver
  `docs/SMELLME_PRODUCT_IMAGE_UPLOAD.md` para el detalle actualizado.
- **Preview administrativo del Top 15**: reutiliza exactamente
  `TopProductsSection` (el mismo componente de la portada pública) contra
  `/api/products` (el mismo endpoint público), sin reimplementar el filtro de
  "vendible" (activo + stock + precio + ficha completa).
- **Ofertas de la semana**: ya existían los campos `es_oferta_semana` y
  `precio_anterior` en el producto y el render público
  (`components/shared/OffersSection.tsx`), pero no existía una pantalla admin
  para activarlas/desactivarlas ni un máximo validado en servidor. Se agregó:
  - `OFFERS_LIMIT = 10` en `lib/constants.ts` (única fuente del límite).
  - `services/productoService.ts`: `activarOfertaSemana` / `desactivarOfertaSemana`
    (mismo patrón no-batch que `vincularProductoTop12`/`desvincularProductoTop12`),
    con validación de máximo en servidor.
  - `app/api/admin/ofertas/route.ts`: un solo endpoint POST con acciones
    `activar`/`desactivar`, un producto a la vez (nunca batch).
  - `components/admin/OfertasAdminPanel.tsx` en `/admin/catalogo/ofertas`:
    contador "X de 10", búsqueda, precio anterior opcional (nunca se calcula
    ni se inventa), Preview reutilizando `OffersSection` contra `/api/products`.
  - **Vigencia de la oferta**: no existe infraestructura de fechas de inicio/fin
    ni de texto editorial de vigencia para ofertas en el esquema actual
    (`productos` no tiene columnas de fecha de oferta). Crear esa
    infraestructura requeriría una migración de base de datos. Siguiendo la
    instrucción de la fase ("si parece necesaria una migración, detenerse:
    no ejecutarla ni prepararla"), esto **no se implementó** y queda
    documentado aquí como pendiente explícito para una fase futura.
- **Imágenes por nombre de perfume del CSV**: el motor de coincidencias
  (`lib/product-image-bulk-matching.ts`) ya soportaba matching determinista
  por SKU, nombre exacto, marca+nombre y marca+nombre+contenido, con
  resolución manual ante ambigüedad — no se modificó (arquitectura, cola,
  concurrencia máxima de 2 y endpoint individual intactos). Se actualizó
  únicamente el texto de `components/admin/BulkProductImagePanel.tsx` para
  explicar el flujo operativo real (nombrar el archivo igual al nombre del
  perfume del CSV) y aclarar que el SKU es opcional, nunca obligatorio.
  - **Limitación conocida documentada (no corregida en esta fase)**:
    `normalizeBulkImageIdentity` normaliza mayúsculas/minúsculas y unifica
    espacios/guiones/guiones bajos, pero **no** normaliza tildes (a
    diferencia de `normalizeProductKey` en `lib/product-catalog.ts`, que sí
    las unifica vía NFD). Un archivo `"Acquá Di Gio.jpg"` no coincidirá por
    nombre con un producto `"Acqua Di Gio"` si difieren solo en un acento.
    No se modificó el motor de matching porque está fuera del alcance
    autorizado de esta fase ("no cambiar la arquitectura del importador").
    Queda documentado como mejora candidata para una fase futura.

## Fase 7.5 — Banlist de clientes (pendiente, no implementada)

- Bloqueo y desbloqueo de clientes.
- Motivo interno del bloqueo (visible solo en admin).
- Validación server-side (un cliente bloqueado no puede generar pedidos).
- Historial conservado (quién bloqueó, cuándo, por qué, y el desbloqueo si
  ocurre).

## Fase 7.6 — Cierres semanales administrativos (pendiente, no implementada)

- Resumen de ventas de la semana.
- Costos y utilidad del período.
- Pedidos, cancelaciones y pendientes del período.
- Historial de cierres anteriores.
- Exportación del cierre.
- Cierre no destructivo (no borra ni recalcula datos históricos).
- Impedir cierres duplicados sobre el mismo período.
- Reapertura explícita y auditada (quién reabrió, cuándo, por qué).

## Fase 7.7 — Flujo de pedidos (pendiente, no implementada)

- Estados del pedido.
- Notificación por WhatsApp.
- Despacho.
- Integración con stock y cancelación de pedidos.

## Fase 7.8 — Catálogo real (pendiente, no implementada)

- Importación del catálogo real de productos (CSV real del proveedor).
- Carga de imágenes reales de cada perfume.
- Curaduría real del Top 15 con productos e imágenes reales.
- Curaduría real de Ofertas de la semana.

## Fase 7.9 — QA final, documentación, tag y release (pendiente, no implementada)

- QA final integral sobre datos reales.
- Documentación de cierre de proyecto.
- Creación de tag de versión.
- Release formal.

---

**Nota de alcance**: esta rama (`feature/top15-offers-editorial-control`)
implementa únicamente la Fase 7.4. No se tocó autenticación, RLS, CSP,
pedidos, clientes, banlist, cierres semanales, costos, fórmula de precios ni
stock. No se importó catálogo real ni se subieron imágenes reales. No se
ejecutaron migraciones de base de datos.
