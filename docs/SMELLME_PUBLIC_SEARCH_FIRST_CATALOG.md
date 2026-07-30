# Catálogo público search-first — Fase 2B.10

- Fecha: 2026-07-30
- Rama: `feature/perfume-store-foundation`
- Fase anterior: Fase 2B.9 (`docs/SMELLME_BULK_STOCK_ACTIONS.md`), Fase 2B.8 (`docs/SMELLME_PRODUCT_FAMILIES_AND_VARIANTS.md`)
- Alcance: (A) checkbox maestro siempre visible en `/admin/stock` (ver `docs/SMELLME_BULK_STOCK_ACTIONS.md`, sección 12); (B) rediseño de la página pública en dos zonas: Top 12 visual (única galería con fotos) + directorio compacto y buscable "Encuentra tu perfume" para el resto del catálogo (100+ productos internos).
- Fuera de alcance (explícitamente): búsqueda/enriquecimiento automático de imágenes, migraciones de Supabase, unificación administrativa Catálogo/Stock/Precios/Top12/Imágenes, despliegue a producción.

## 1. Por qué dos zonas

Con 100+ productos internos y bastantes menos familias comerciales, mostrar cada familia como tarjeta grande con imagen implica renderizar decenas de fallbacks genéricos (la mayoría del catálogo todavía no tiene fotografía real, solo el Top 12 editorial la tiene). Esta fase separa:

- **Top 12 visual** (`TopProductsSection.tsx`, sin cambios de esta fase): la única sección con tarjetas grandes y fotografía, máximo 12 familias.
- **"Encuentra tu perfume"** (`CatalogExplorer.tsx`, rediseñado): directorio compacto, sin fotos, search-first, para el resto (y también encuentra las del Top 12 — ver sección 6).

## 2. Directorio compacto sin fotos

Nuevos componentes, usados exclusivamente por el directorio completo:

- `components/shared/CompactFamilyRow.tsx`: una fila/tarjeta por familia — marca, nombre, selector de tamaño (si hay 2+ variantes), precio, disponibilidad, botón Agregar. **Nunca** renderiza `<img>`, `ProductImage` ni ningún fallback visual grande.
- `components/shared/CompactFamilyCatalog.tsx`: lista de `CompactFamilyRow`, con chip discreto "Top 12" opcional por familia.

`ProductFamilyCard.tsx` (con imagen) y `FamilyCatalog.tsx` (grilla densa de tarjetas con imagen, ahora eliminado) quedan reservados exclusivamente para el Top 12; el directorio completo no vuelve a importarlos.

## 3. Buscador protagonista (`CatalogExplorer.tsx`)

- Título: "Encuentra tu perfume". Descripción: "Busca por nombre, marca o tamaño."
- Primer elemento interactivo de la sección: input grande (`py-3.5`, ícono de lupa), placeholder "Busca tu perfume o marca", con botón "Limpiar búsqueda" (ícono X) dentro del propio input cuando hay texto — limpia solo la búsqueda, conserva marca/orden.
- Reutiliza `filterAndSortFamilies` de `lib/product-families.ts` (sin cambios en su lógica de búsqueda, ya cubría nombre/marca/contenido de cualquier variante, sin distinguir tildes/mayúsculas, sin usar SKU en la interfaz pública — ver Fase 2B.8, sección 6).
- Contador: mientras hay texto de búsqueda, `"{n} perfume(s) encontrado(s)"`; sin búsqueda, `"{n} perfume(s)"`. Siempre cuenta **familias**, nunca filas de producto.

## 4. Filtros mínimos

- Marca: chip "Todas las marcas" + un chip por marca (`getAvailableFamilyBrands`, ya existente). Filtra por familia, no por variante.
- Orden: `<select>` con Recomendados / Nombre A-Z / Menor precio / Mayor precio (`FamilySortOption`, sin cambios).
- No se agregó ningún filtro adicional (categoría, rango de precio, etc.) para no saturar la pantalla, como pide la fase. La navegación por marca en acordeón (sección 13 del encargo) se dejó fuera **a propósito**: el comportamiento recomendado por el propio encargo ("sin búsqueda: A-Z; con marca: esa marca; con búsqueda: lista plana") ya queda cubierto por el filtro de marca + búsqueda existentes, y el encargo aclara explícitamente que el acordeón "no es obligatorio... si perjudica la búsqueda".

## 5. Variantes: pausadas vs. sin stock (corrección real de comportamiento)

Antes de esta fase (Fase 2B.8), una variante pausada (`activo=false`) de una familia visible se mostraba en el selector igual que una agotada: deshabilitada, con texto "Sin stock". Esto contradice la idea de que "una pausa administrativa significa que esa variante no se ofrece" — pausar no es lo mismo que agotarse.

Nueva función pura `getSelectableVariants(family)` en `lib/product-families.ts`:

```ts
export function getSelectableVariants(family: ProductFamily): ProductVariant[] {
  return family.variants.filter((v) => v.activo);
}
```

- **Variante pausada** (`activo=false`): excluida por completo de `getSelectableVariants` → nunca aparece en el selector público, se pause una sola variante o toda la familia.
- **Variante activa sin stock** (`activo=true`, `stockActual<=0`): SÍ aparece en `getSelectableVariants`, pero deshabilitada con "Sin stock" (mismo comportamiento visual de antes, ahora correcto solo para este caso).
- **Familia completamente pausada o agotada** (ninguna variante `disponible = activo && stock>0`): sigue oculta del catálogo público (`getVisibleFamilies`, sin cambios en su regla — ya era correcta porque `disponible` ya excluía las pausadas).
- `getDefaultVariant`, `getFamilyMinPrice`/`getFamilyMaxPrice` y `getFamilySearchHaystack` se actualizaron para operar sobre `getSelectableVariants(family)` en vez de `family.variants`: el precio mostrado, la variante preseleccionada y el texto buscable nunca consideran una variante pausada (una familia no puede "encontrarse por tamaño" a través de una variante que no se ofrece).
- `ProductFamilyCard.tsx` (Top 12) se actualizó para usar `getSelectableVariants` en su selector — mismo comportamiento correcto también en la galería visual.

## 6. Top 12 también encontrable en el buscador

El Top 12 y el directorio completo son dos **presentaciones** de las mismas familias, no catálogos separados: `OrderForm.tsx` calcula `topFamilyKeys` (mismas claves que usa `TopProductsSection`, vía `getTopFamilies`) y se la pasa a `CatalogExplorer` como `top12Keys`. Una familia del Top 12 aparece en los resultados del buscador con el chip discreto "Top 12" (sin repetir su fotografía — `CompactFamilyRow` nunca carga imágenes).

## 7. Paginación por familias

`CatalogExplorer` pagina sobre el array de familias ya filtrado/ordenado (`PAGE_SIZE = 25`, antes 24): carga inicial 25 familias compactas, botón "Ver N más" (indica cuántas faltan, nunca más de `PAGE_SIZE`). Cambiar búsqueda, marca u orden reinicia la paginación a 25; el carrito (`quantities`) es independiente del filtro/paginación — no se pierde ninguna cantidad ya agregada al cambiar de filtro o cargar más.

## 8. Estados vacíos

- **Catálogo completo vacío** (`families.length === 0`, ninguna familia vendible en absoluto): "No hay perfumes disponibles por ahora." — sin renderizar el buscador ni ningún fallback de imagen.
- **Sin resultados de búsqueda/filtro** (`filtered.length === 0` con `families.length > 0`): título "No encontramos ese perfume", texto "Prueba con otra marca, una parte del nombre o el tamaño." y botón "Limpiar búsqueda" (limpia búsqueda + marca + orden, para maximizar la chance de encontrar algo).
- **Top 12 sin configurar**: sin cambios (placeholder ya existente en `TopProductsSection.tsx`, fuera de esta fase); no bloquea el directorio completo, que se renderiza igual.

## 9. Carrito

Sin cambios de contrato: el carrito sigue indexado por `productId` real (`form.items` en `OrderForm.tsx`), y `/api/orders` no se tocó. Dos variantes de la misma familia (ej. `Lady Million · 30ML` y `Lady Million · 80ML`) siguen como líneas separadas — `CompactFamilyRow` agrega/incrementa/decrementa usando el `productId` de la variante seleccionada en su propio selector, igual que `ProductFamilyCard`.

## 10. Base de datos

No se modificó el esquema de Supabase, no se crearon tablas ni migraciones. La familia se sigue derivando en memoria (marca normalizada + nombre normalizado), igual que en la Fase 2B.8. La unificación administrativa de Catálogo/Stock/Precios/Top12/Imágenes en un solo panel **no** se abordó — queda documentada como trabajo futuro fuera de alcance, tal como indica el encargo de esta fase.

## 11. Imágenes

No se buscó, descargó, subió ni asignó ninguna imagen nueva. El Top 12 sigue usando exactamente las fotografías locales ya existentes. El directorio compacto no muestra imagen ni monograma de marca (el encargo lo permite como opcional; se omitió para mantener la fila lo más liviana y rápida posible con 100+ familias).

## 12. Pruebas

- `tests/lib/product-families.test.ts`: nuevo bloque `getSelectableVariants` — variante pausada excluida del selector, variante activa sin stock incluida pero deshabilitada, `getDefaultVariant` nunca preselecciona una pausada, `getFamilyMinPrice`/`getFamilyMaxPrice` ignoran pausadas, `getFamilySearchHaystack` no expone contenido/SKU de variantes pausadas, familia 100% pausada/agotada oculta.
- `tests/lib/bulk-selection.test.ts`: nuevo bloque `getMasterCheckboxState` — unchecked/indeterminate/checked, catálogo de 101 productos, limpiar vuelve a unchecked, cambiar de filtro no altera el estado "checked" de la selección total.

## 13. Limitaciones conocidas

- **Sin entorno de pruebas de componentes React** (`environment: "node"`, sin `jsdom`/`@testing-library`, igual que fases anteriores): la lógica nueva se extrajo a funciones puras (`getSelectableVariants`, `getMasterCheckboxState`); el comportamiento visual de `CompactFamilyRow.tsx`, `CompactFamilyCatalog.tsx`, `CatalogExplorer.tsx` y el checkbox maestro de `QuickStockPanel.tsx` se verificó por inspección de código, typecheck y build, no con un test de render.
- **QA visual interactiva en navegador (390/768/1440) no se realizó de forma automatizada**: no hay herramienta de navegador (Playwright/Chromium) disponible en este entorno Windows. Se verificó en su lugar, contra un servidor de desarrollo real ya activo: `GET /` → 200, `GET /admin/login` → 200, `GET /admin/stock` sin sesión → 307 a `/admin/login`, `GET /api/products` → 200 con datos reales, `POST /api/admin/products/bulk-stock` sin sesión → 401, `POST /api/orders` con payload inválido → 400 (nunca 500). No se ejecutó ninguna acción masiva ni se completó ningún pedido real contra los datos remotos durante esta validación.
- La organización adicional por marca con contador y botón "Ver" (encargo, sección 13) se dejó fuera: los chips de marca + búsqueda ya cubren el comportamiento recomendado, y el encargo la marca como opcional.
