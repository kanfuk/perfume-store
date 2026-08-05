# Smellme Store — Roadmap restante (checkpoint persistente)

Última actualización: 2026-08-05, rama `feature/customer-banlist`
(base: `main` @ `0f782f4fa4ffcb89c5f8b560e76ffb183348dd10`, merge productivo de
la Fase 7.4/7.4A: "merge: integrate top 15 and weekly offers control").

Este documento preserva el roadmap acordado para las fases 7.4 a 7.9.

- **Fase 7.4 y 7.4A**: implementadas, mergeadas a `main` y desplegadas en
  producción (`https://perfume-store-mu-smoky.vercel.app`,
  deployment `dpl_5PmEDSWpY855nwcRpCgr5N7CasQL`).
- **Fase 7.5A**: implementada de forma local en `feature/customer-banlist`
  (código, migración preparada sin aplicar, pruebas, documentación). Rama
  publicada, **sin mergear, sin Preview, sin despliegue**.
- **Fase 7.5B en adelante**: pendientes, sin implementación.

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

## Fase 7.5A — Banlist de clientes: implementación local (esta rama)

- **Modelo**: ampliación aditiva de `public.clientes` (`bloqueado`,
  `motivo_bloqueo`, `bloqueado_en`, `desbloqueado_en`, `bloqueado_por`) —
  ver `docs/SMELLME_CUSTOMER_BANLIST_DESIGN.md` para la alternativa
  descartada (tabla separada) y el detalle completo.
- **Migración preparada, NO aplicada**:
  `supabase/migrations/20260807000000_smellme_customer_banlist.sql`.
- **Contrato de bloqueo/desbloqueo**: `domain/Cliente.ts`
  (`bloquear()`/`desbloquear()`), `repositories/clienteRepository.ts`
  (`buscarClientePorId`, `actualizarEstadoBloqueo` — escritura parcial,
  nunca toca datos personales — y `buscarClienteBloqueadoPorIdentidad`,
  coincidencia exacta por teléfono→RUT→correo, nunca fuzzy),
  `services/adminCustomerService.ts` (`bloquearCliente`/`desbloquearCliente`,
  motivo obligatorio 5-500 caracteres, idempotentes). Al desbloquear se
  limpia el estado (`bloqueado = false`) pero se conserva `motivo_bloqueo`/
  `bloqueado_en` como referencia administrativa.
- **Rechazo del pedido público**: `services/pedidoService.ts` consulta la
  banlist **antes** de invocar `create_perfume_order_v1` (no hay ninguna
  escritura previa en el flujo actual). Mensaje público genérico
  ("No pudimos procesar tu pedido..."), código interno `CUSTOMER_BLOCKED`,
  nunca se revela la banlist, el motivo ni el identificador que coincidió.
  **Riesgo de atomicidad residual documentado, no resuelto**: la RPC no se
  modificó, por lo que existe una ventana de carrera teórica (bloqueo
  simultáneo al envío del pedido) — ver
  `docs/SMELLME_CUSTOMER_BANLIST_DESIGN.md`, sección de atomicidad.
- **API admin**: `PATCH /api/admin/customers/[customerId]` extendido con
  `action: "block"|"unblock"` (sin romper el contrato de edición existente).
- **UI**: integrada dentro de `/admin/clientes` (`AdminDashboard.tsx`) — sin
  panel paralelo: badge "Bloqueado", filtro "Bloqueados", modal de bloqueo
  con motivo obligatorio y contador de caracteres, confirmación para
  desbloquear.
- **Pruebas**: 1273 → 1346 (dominio, repositorio, servicio, ruta admin,
  `PedidoService.crearPedido`, migración por inspección estática, UI por
  inspección de código).
- **No se tocó** en esta fase: Top 15, Ofertas de la semana (su riesgo de
  atomicidad documentado en `docs/SMELLME_OFFERS_ATOMICITY_PROPOSAL.md` se
  mantiene sin resolver, a propósito), cierres semanales, stock, costos,
  fórmula de precios, importador CSV, Auth, RLS, CSP.

## Fase 7.5B — Banlist de clientes: revisión y despliegue controlado (pendiente)

- Revisión final de la migración `20260807000000_smellme_customer_banlist.sql`.
- Aplicación controlada de la migración en Supabase remoto.
- Preview de Vercel con QA autenticado real (bloquear/desbloquear un
  cliente de prueba, verificar rechazo real del pedido público).
- Merge a `main` y despliegue productivo.

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

**Nota de alcance**: la rama `feature/top15-offers-editorial-control`
(Fase 7.4/7.4A) ya fue mergeada a `main` y desplegada en producción. La
rama `feature/customer-banlist` (Fase 7.5A) implementa únicamente la
banlist de clientes de forma local: no se tocó Top 15, Ofertas, cierres
semanales, costos, fórmula de precios, stock ni el importador CSV. No se
importó catálogo real ni se subieron imágenes reales. No se ejecutó
ninguna migración de base de datos ni se desplegó Preview o producción
para esta fase.
