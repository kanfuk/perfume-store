# Familias de perfumes y selector de variantes — Fase 2B.8

- Fecha: 2026-07-30
- Rama: `feature/perfume-store-foundation`
- Fase anterior: Fase 2B.7 (`docs/SMELLME_CATALOG_QUALITY_REVIEW.md`)
- Alcance: mostrar una sola tarjeta pública por perfume cuando existan varias presentaciones (contenido) del mismo producto, con un selector "Elige el tamaño" que cambia cuál variante real se agrega al carrito. **Puramente comercial/visual**: cada presentación sigue siendo un producto independiente en Supabase.
- Fuera de alcance (explícitamente, por instrucción): búsqueda/enriquecimiento de imágenes, "Más vendidos", importación real definitiva, despliegue a producción.

## 1. Familia vs. variante

- **Variante** = una fila real de la tabla `productos`: su propio `id`, `sku`, `contenido`, `costo_unitario`, `precio_venta`, `stock_actual`, `stock_reservado`, `activo`, `modo_precio`, `image_url`, `es_top`/`orden_destacado`.
- **Familia** = agrupación puramente visual de variantes que comparten **marca + nombre comercial normalizados** (el contenido NUNCA forma parte de la clave). Existe solo en memoria, en el servidor/frontend, calculada en cada request — no hay tabla ni columna nueva en Supabase.

## 2. Regla de agrupación (`lib/product-families.ts`)

```ts
buildFamilyKey(marca, nombre) // normalizeMatchKey(marca) + "|" + normalizeMatchKey(nombre)
```

Reutiliza `normalizeMatchKey` de `lib/catalog-import/normalization.ts` (mismo normalizador que ya usa el asistente de calidad). **No usa similitud difusa** — dos productos solo se agrupan si su `nombre` normalizado es **exactamente igual** (sin tildes, sin mayúsculas, espacios unificados). La similitud (Levenshtein/Dice) es una herramienta exclusiva del asistente de revisión (Fase 2B.7) para sugerir candidatos humanos; **nunca** se usa para construir una familia pública.

## 3. Modificadores que impiden agrupar

Como el nombre completo (incluyendo modificadores) forma parte de la clave, familias como estas quedan **siempre separadas**, verificado con pruebas:

```
Aqua di Gio Profondo
Aqua di Gio Profondo Parfum
Aqua di Gio Profondo Eau de Parfum
Aqua di Gio Parfum
```

```
Sauvage EDT   ≠   Sauvage EDP
Sauvage Parfum   ≠   Sauvage Elixir
```

Ningún modificador (EDT, EDP, Eau de Toilette, Eau de Parfum, Parfum, Elixir, Intense, Absolu, Royal, Rose, Homme, Femme, Men, Woman, Pour Homme, Pour Femme, ...) se elimina para calcular la familia: si aparece en `nombre`, es parte de la identidad tal cual quedó en el catálogo.

## 4. Stock, precio y SKU independientes

Cada variante (`ProductVariant`) conserva sus propios campos; `groupProductsIntoFamilies` nunca combina, promedia ni comparte estos valores entre variantes. `disponible = activo && stock_actual > 0`. La variante inicial seleccionada es la disponible de menor contenido (`getDefaultVariant`); si ninguna variante de la familia está disponible, la familia completa se oculta del catálogo público (`getVisibleFamilies`).

**Cambio necesario en `/api/products`** (`ProductoService.obtenerProductosActivos`): antes filtraba producto por producto (activo + stock + precio); ahora una **familia** es visible si **al menos una** de sus variantes es vendible, y en ese caso se exponen **todas** sus variantes (incluidas las agotadas/pausadas), para que el selector pueda mostrarlas como "Sin stock" en vez de ocultarlas por completo. Se agregó el campo `activo` a la respuesta pública (antes no viajaba). El endpoint y su forma (`{ products: ProductRecord[] }`) no cambiaron; solo cambió qué filas del catálogo incluye.

## 5. Selector público (`ProductFamilyCard`)

- Si la familia tiene 1 sola variante: se muestra el contenido como texto simple (igual que antes), sin selector.
- Si tiene 2+: `<select>` con `label` accesible `"Elige el tamaño de <nombre>"`, opciones `"<contenido> — <precio>"` (+ `"(Sin stock)"` si no disponible, y `disabled`). Al cambiar: precio, precio anterior, disponibilidad, límite de cantidad y el `productId` que se agregará al carrito se actualizan juntos, porque todos derivan del mismo estado `selectedId`. Un párrafo `aria-live="polite"` (visualmente oculto) anuncia el cambio de precio/disponibilidad. La selección nunca cambia sola mientras el usuario interactúa (estado local de React, reiniciado solo si la familia completa cambia de identidad).
- El botón "Agregar" siempre agrega el `productId` de la variante seleccionada — nunca un id de familia (no existe tal cosa).

`ProductCard.tsx` ganó una prop opcional `sizeSelector` (reemplaza la línea estática de contenido cuando se provee); se mantiene 100% retrocompatible para sus otros usos.

**`ProductCatalog.tsx` se mantiene intacto a propósito**: también lo usa el selector de productos de venta directa en `AdminDirectSale.tsx`, que debe seguir mostrando cada producto/SKU individual con su stock exacto (un admin vendiendo manualmente necesita elegir la fila real, no una abstracción de familia). Se creó `FamilyCatalog.tsx` como componente nuevo y separado para el catálogo público.

## 6. Búsqueda, filtros, orden y paginación

Nuevo módulo (no se tocó `lib/catalog-search.ts`, compartido con el admin): `filterAndSortFamilies`, `getAvailableFamilyBrands` en `lib/product-families.ts`.

- Búsqueda: encuentra una familia por nombre, marca, o **contenido/SKU de cualquiera de sus variantes** (buscar `"80ML"` puede mostrar una familia por su variante de 80ML).
- Orden por precio: usa el precio **mínimo/máximo disponible** de la familia (`getFamilyMinPrice`/`getFamilyMaxPrice`), nunca el precio de una variante fija.
- Orden A-Z: nombre de la familia. Recomendados: preserva el orden recibido.
- Contador: `{n} perfume(s)` — cuenta familias, no filas de producto.
- Paginación (`CatalogExplorer`, `PAGE_SIZE = 24`): pagina sobre el array de familias ya filtrado/ordenado, no sobre variantes.

## 7. Top 12

`getTopFamilies(families, limit)`: agrupa por familia y, si dos variantes de la misma familia están vinculadas a posiciones distintas (`es_top` + `orden_destacado`), **colapsa en una sola entrada pública** usando la mejor posición (número menor) como ranking mostrado; esa variante específica queda preseleccionada en el selector (conservando su propia imagen Top 12, ya que `image_url` de esa fila es exactamente la imagen que el admin vinculó a esa posición). El admin sigue viendo y editando cada producto como variante independiente en `/admin/top12`; no se modificaron posiciones existentes ni el panel admin de Top 12.

## 8. Imagen de la familia

Orden de resolución (`resolveFamilyImage`, usado solo como *fallback* cuando la variante seleccionada no trae su propia imagen): (1) imagen Top 12 de la variante inicialmente seleccionada — ya viene incluida porque esa es la variante por defecto; (2) primera `image_url` entre variantes disponibles; (3) primera `image_url` entre cualquier variante; (4) `undefined`, delegando en el fallback visual ya existente de `ProductImage` (gradiente placeholder). No se descargó, buscó ni asignó ninguna imagen nueva.

## 9. Catálogo administrativo

`/admin/catalogo` (`CatalogControlCenter.tsx`) agrupa visualmente con `groupByFamilyKey` (helper genérico y reutilizable de `lib/product-families.ts`, usado también por el resumen final del asistente de calidad): una familia con 2+ variantes se muestra como un encabezado plegable ("N presentaciones", expandir/contraer); con 1 sola variante se muestra igual que antes (fila/tarjeta directa, sin encabezado). Los datos siguen siendo los mismos `AdminProductRecord[]` de `/api/admin/products`; la agrupación solo decide cómo se pintan. `/admin/stock` y `/admin/precios` **no se tocaron**: siguen editando cada variante individualmente por fila plana, como indica la fase.

## 10. Carrito y pedidos

El carrito (`form.items` en `OrderForm.tsx`) ya operaba por `productId` real (`{ productoId, cantidad }`), así que dos variantes de la misma familia **ya podían coexistir** como líneas separadas sin ningún cambio estructural — verificado con pruebas nuevas en `lib/order-helpers.ts`. El único ajuste real fue visual: `CartSummary.tsx` ahora muestra el contenido junto al nombre (`Lady Million · 80ML`) — antes solo mostraba el nombre, lo cual habría hecho indistinguibles dos líneas de la misma familia. El servidor sigue revalidando todo contra el `productoId` real vía la RPC transaccional (`create_perfume_order_v1`, sin cambios); nunca confía en precio/stock/contenido enviados por el navegador.

## 11. Asistente de calidad (Fase 2B.7)

Las variantes se siguen clasificando como `VARIANT`/`INFO` (sin cambios en `lib/catalog-import/quality-review.ts`: no se tocó su motor). Se agregó únicamente al **resumen final** (`CatalogImportFinalSummary.tsx`) una sección "Variantes agrupadas" que, reutilizando `groupByFamilyKey` sobre el plan final, muestra:

```
Lady Million
3 presentaciones: 30ML, 50ML, 80ML
Se crearán 3 productos internos y una sola tarjeta en el catálogo público.
```

Esto es puramente informativo: no cambia la clasificación de las filas del plan ni fusiona nada antes de enviarlo a confirmar.

## 12. Limitaciones conocidas

- **Sin entorno de pruebas de componentes React** (`vitest.config.ts` usa `environment: "node"`, sin `jsdom`/`@testing-library`) — igual que en la Fase 2B.7, toda la lógica de agrupación/selección/disponibilidad se extrajo a módulos puros 100% testeables (`lib/product-families.ts`, `lib/order-helpers.ts`); el comportamiento de los componentes React (`ProductFamilyCard`, `CatalogExplorer`, `TopProductsSection`) se verificó por inspección de código y por typecheck/build, no con un test de render.
- **QA visual interactiva en navegador (390/768/1440) no se realizó**: el catálogo remoto (Supabase real, configurado en `.env.local`) está vacío hoy ("no existe todavía una importación real definitiva", como indica el estado conocido de esta fase), y no hay herramienta de navegador disponible en este entorno. Se verificó en su lugar: `npm run build` exitoso, `GET /api/products` responde `200 {"products":[]}` sin error 500, y toda la lógica de familias/selector/disponibilidad/Top12 con 30+ pruebas unitarias dedicadas.
- `OffersSection.tsx` (ofertas de la semana) y `ProductCatalog.tsx`/`AdminDirectSale.tsx` (venta directa admin) se dejaron **intencionalmente sin agrupar por familia** — la fase solo pide agrupar el catálogo público completo y el Top 12; ofertas y venta directa admin operan mejor por producto/SKU exacto (una oferta es una fila específica; una venta directa debe elegir el SKU exacto con su stock real).
- La agrupación visual del catálogo admin (`CatalogControlCenter`) siempre agrupa cuando hay 2+ variantes (no es un toggle); `/admin/stock` y `/admin/precios` se dejaron sin agrupar, como permite explícitamente la fase.

## 13. Ejemplos sanitizados

```
Familia: Lady Million · Paco Rabanne
Variantes: 30ML ($33.750) · 50ML ($47.250) · 80ML ($67.500, sin stock)
→ 1 tarjeta pública, selector con 3 opciones, "80ML" deshabilitada.

Familia A: Sauvage EDT · Dior
Familia B: Sauvage EDP · Dior
→ 2 tarjetas públicas distintas (nunca se agrupan).

Top 12: Lady Million 30ML en posición 7, Lady Million 80ML en posición 3.
→ 1 sola tarjeta Top 12, badge "#3", variante 80ML preseleccionada.
```
