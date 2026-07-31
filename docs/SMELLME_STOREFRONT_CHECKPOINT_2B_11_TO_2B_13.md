# Checkpoint storefront — Fases 2B.11 a 2B.13

- Fecha: 2026-07-30
- Rama: `feature/perfume-store-foundation`
- Fase base: 2B.10 (`docs/SMELLME_PUBLIC_SEARCH_FIRST_CATALOG.md`)
- Alcance: cierre consolidado de tres fases de pulido visual/UX del storefront cliente y de protección de metadatos obligatorios en catálogo e importación. No hay cambios de arquitectura, esquema de Supabase, autenticación ni despliegue a producción.

## 1. Fase 2B.11 — pulido inicial

- **Filtro de marcas**: chips ordenados A-Z, "Todas las marcas" siempre primero, recorte a 8 chips visibles + "+N marcas" para expandir sin perder la marca activa.
- **Top 12 en móvil**: grilla de 2 columnas desde el primer breakpoint (antes era 1 columna, causa real del tamaño gigante), imagen `aspect-square` en móvil.
- **Loading overlay** (`components/shared/LoadingOverlay.tsx`, nuevo): overlay centrado de pantalla completa durante acciones masivas de `/admin/stock` — cubre tanto el cálculo del preview como la confirmación, con mensaje contextual por acción ("Activando productos…", "Actualizando stock…").
- **Fallback sin fotografía**: nuevo prop `compact` en `ProductImage.tsx` — miniaturas pequeñas (carrito, filas admin) muestran solo iniciales sobre un fondo degradado, en vez del fallback completo (ícono + nombre + "Imagen próximamente") que no cabía con gracia en esos tamaños.

## 2. Fase 2B.12 — uniformidad y catálogo acotado

- **Tarjetas Top 12 más uniformes**: badge de categoría oculto en móvil, precio y CTA reducidos, selector de tamaño con etiqueta corta ("Tamaño" + `aria-label` completo para accesibilidad).
- **CTA "Elegir" minimal**: se descubrió que la clase compartida `.app-button-primary` fija `min-height: 50px` en CSS global, ganando por orden de cascada sobre cualquier utilidad `min-h-*` de Tailwind — el intento inicial de achicarlo no tenía efecto real. Se resolvió con un botón independiente solo para el Top 12 (píldora, `px-3.5 py-2`, `text-xs`, mismo violeta de marca) sin heredar el alto mínimo. El resto de la app no se tocó.
- **Catálogo dinámico limitado a 5**: sin búsqueda/marca/orden aplicado, el directorio "Encuentra tu perfume" muestra solo 5 familias con el texto *"Mostrando 5 de N perfumes. Usa la búsqueda o los filtros para explorar el resto del catálogo."* En cuanto se activa cualquier filtro, vuelve la paginación normal (25 + "Ver más").
- **Chips de marca en grilla**: de `flex flex-wrap` a `grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4` con alto fijo (`h-9`) por chip, para un bloque encuadrado y prolijo en vez de un wrap orgánico de anchos dispares.

## 3. Fase 2B.13 — metadatos obligatorios y fichas incompletas

### Causa raíz del desalineamiento de tarjetas

Una tarjeta sin marca/contenido no renderizaba esas líneas (en vez de reservar su espacio), quedando más corta. El grid CSS estira las tarjetas de una misma fila a igual altura, pero **no entre filas distintas** — filas con tarjetas "cortas" quedaban con el precio/CTA/disponibilidad en un Y distinto al resto de la página.

**Corrección** (`components/shared/ProductCard.tsx` + nuevo `lib/product-card-metadata.ts`, lógica pura y testeada sin JSX): marca, nombre (altura mínima fija, `line-clamp-2`) y contenido/selector **siempre reservan el mismo espacio**, tengan o no dato. Nunca se muestra `undefined`/`null`/`0ML`/`SIN DATO`: el hueco queda en blanco (`aria-hidden` para lectores de pantalla) pero conserva su altura.

### Regla de publicación

Nuevo módulo compartido `lib/catalog-completeness.ts` (`getMissingCatalogFields`, `isProductMetadataComplete`, `describeMissingCatalogFields`), usado tanto por el servicio público como por el panel admin.

`services/productoService.ts` → `obtenerProductosActivos()`: un producto vendible ahora exige `activo && stock > 0 && precioVenta > 0 && nombre/marca/contenido no vacíos`. Un producto activo pero con ficha incompleta **se excluye del storefront por completo**, incluso si es hermano de una variante completa dentro de la misma familia (nunca aparece ni siquiera como opción deshabilitada). No se pausa, no se le toca el stock, el SKU ni el historial — sigue 100% administrable.

### Fichas incompletas en administración

Badge "Ficha incompleta" (tono ámbar, con detalle "Falta marca y contenido." vía `title`) agregado en:
- `/admin/catalogo` (`CatalogControlCenter.tsx`): badge por fila/tarjeta + chip de filtro + indicador en el resumen.
- `/admin/stock` (`QuickStockPanel.tsx`): badge junto al estado de stock de cada producto.
- `/admin/precios` (`QuickPriceEditPanel.tsx`): badge junto al nombre en la tabla.

Nunca se presenta como error técnico; siempre orientado a acción (qué falta, no un stack trace).

### Corrección guiada en el importador de proveedor

`lib/catalog-import/quality-review.ts`: nuevos tipos de hallazgo `MISSING_NAME`/`MISSING_BRAND`/`MISSING_CONTENT` (severidad `BLOCKER`) e `INVALID_CONTENT` (severidad `WARNING`, para contenido no vacío pero no reconocido como volumen estándar — "SET"/"ESTUCHE"/"TESTER"/"PACK" nunca se convierten silenciosamente a un número de ML). El costo faltante o inválido ya estaba cubierto por el hallazgo `PRICE_ANOMALY` existente (BLOCKER cuando costo ≤ 0); no se creó un tipo duplicado.

**Cambio de raíz en `lib/catalog-import/supplier-import.ts`**: `parseSupplierCsv` ya no rechaza de forma silenciosa las filas con nombre/marca/contenido vacío o costo inválido antes de que lleguen a la revisión guiada (antes, el admin solo veía un mensaje de error genérico y debía corregir el CSV externamente). Ahora esas filas entran al asistente de calidad como hallazgos bloqueantes, editables en pantalla (`components/admin/CatalogQualityReview.tsx`, nueva pestaña "Datos incompletos" + input "Editar contenido").

`components/admin/CatalogImportFinalSummary.tsx`: nueva sección "Productos corregidos durante la revisión" con antes/después por campo (`Marca: vacía → Carolina Herrera`), además de los conteos de productos completos, corregidos y excluidos.

### Preservación de identidad (SKU, stock, imagen, Top 12, historial)

Sin cambios de comportamiento respecto a fases anteriores — verificado con pruebas nuevas: corregir la marca/contenido de una fila que coincide con un producto existente por SKU lo clasifica `ACTUALIZAR` (nunca `CREAR`), preserva el SKU histórico (nunca se regenera), y nunca produce un SKU duplicado en el plan final. El servicio de confirmación (`confirmarImportacionProveedor`) sigue tocando únicamente nombre/marca/contenido/costo/precio; stock, `activo`, imagen, Top 12, ofertas y modo de precio manual se conservan intactos (sin cambios en esta fase).

## 4. Pruebas

540 pruebas totales (498 previas + 42 nuevas de esta fase):
- `tests/lib/product-card-metadata.test.ts` (6): tarjeta con/sin marca/contenido, forma estable del resultado.
- `tests/lib/catalog-completeness.test.ts` (11): campos faltantes individuales y combinados, texto orientado a acción.
- `tests/lib/catalog-import/quality-review.test.ts` (+19): `MISSING_NAME`/`MISSING_BRAND`/`MISSING_CONTENT` como BLOCKER, `INVALID_CONTENT` como WARNING que nunca bloquea, edición válida resuelve el bloqueo, exclusión también lo resuelve, sugerencias de marca nunca se aplican sin decisión explícita, actualización de existente preserva SKU, corrección nunca duplica.
- `tests/services/productoService.stockAndTop12.test.ts` (+6): producto completo se publica, sin marca no se publica, sin contenido no se publica, incompleto no arrastra a sus hermanos, incompleto permanece en el catálogo administrativo.
- `tests/lib/catalog-import/supplier-import.test.ts` (actualizado): las 4 pruebas que antes verificaban rechazo temprano ahora verifican que la fila pasa con el campo vacío/costo en 0 (comportamiento nuevo, documentado explícitamente en el propio test).

## 5. Limitaciones conocidas

- **Sin entorno de render de componentes** (`environment: "node"`, sin `jsdom`/`@testing-library`): la lógica estructural/de validación se extrajo a módulos puros y se probó ahí; el layout visual (alineación pixel a pixel, alturas de grilla) se verificó por inspección de código y por Preview real, no con un test de render.
- **Preview temprano del importador** (`buildSupplierImportPreview`, paso informativo antes de la revisión guiada): una fila con marca/contenido vacío puede mostrar un SKU con marcador de posición (`SML-SINMARCA-...`) en ese paso puramente informativo; el bloqueo real ocurre en la revisión guiada y en la confirmación, que es donde nunca se permite avanzar con datos incompletos.
- **"Nombre probablemente incompleto"** (mencionado como WARNING posible en fases anteriores): no se implementó por ser un criterio subjetivo sin una heurística clara y de bajo riesgo de falsos positivos; queda fuera de alcance.

## 6. Pendiente explícitamente fuera de este checkpoint

- **Fotografías automáticas**: no se buscó, generó ni asignó ninguna imagen nueva en ninguna de las tres fases.
- **Centro administrativo unificado**: la unificación de Catálogo/Stock/Precios/Top12/Imágenes en un solo panel sigue sin abordarse; es el objetivo de la próxima rama (`feature/admin-control-center-polish`).
