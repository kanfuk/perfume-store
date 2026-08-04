# Matriz de acciones del importador CSV (Fase D)

Cobertura verificada del contrato completo **CSV → preview → finding →
decisión → final-plan → confirmación → resultado**, para el perfil
"proveedor" (el único con asistente de calidad; el perfil "canónico" se
documenta aparte, al final). Motor: `lib/catalog-import/quality-review.ts`.
Orquestación: `services/productoService.ts`
(`revisarCalidadImportacionProveedor` → `construirPlanConDecisiones` →
`confirmarImportacionProveedor`). Ruta: `app/api/admin/products/import/route.ts`.
UI: `components/admin/CatalogQualityReview.tsx` + `CatalogImportPanel.tsx`.

Todas las pruebas end-to-end usan un repositorio en memoria real (no la base
productiva) y ejercen las capas reales (parser → normalización → matching →
quality-review → decisiones → confirmación), no solo helpers aislados.

## Tabla

| Tipo de hallazgo | Causa | Severidad | Opciones ofrecidas | final-plan | confirm | Resultado esperado | Prueba (extremo a extremo) |
|---|---|---|---|---|---|---|---|
| `MISSING_NAME` | Fila sin nombre de perfume | BLOCKER | `EDIT_NAME`, `EXCLUDE_FIRST` | Sin decisión → `unresolvedBlockers`. Con `EDIT_NAME` → usa el nombre editado. Con `EXCLUDE_FIRST` → fila fuera del plan. | Usa exactamente el plan revisado | Producto creado con el nombre editado, o fila ausente si se excluyó | `productoService.qualityReview.test.ts` → "MISSING_NAME + EDIT_NAME" (nuevo) |
| `MISSING_BRAND` | Fila sin marca | BLOCKER | `SET_BRAND_MANUAL`, `EXCLUDE_FIRST` | Con `SET_BRAND_MANUAL` → usa la marca escrita | Igual | Producto creado con la marca escrita | `productoService.qualityReview.test.ts` → "MISSING_BRAND + SET_BRAND_MANUAL" (nuevo) |
| `MISSING_CONTENT` | Fila sin contenido/formato | BLOCKER | `EDIT_CONTENT`, `EXCLUDE_FIRST` | Con `EDIT_CONTENT` → usa el contenido normalizado editado | Igual | Producto creado con el contenido corregido | `productoService.qualityReview.test.ts` → "MISSING_CONTENT + EDIT_CONTENT" (nuevo) |
| `INVALID_CONTENT` | Contenido no coincide con un volumen estándar (ej. "set", "estuche") | WARNING (nunca bloquea) | `ACCEPT_SPECIAL_FORMAT`, `EDIT_CONTENT`, `IGNORE_WARNING` | Nunca bloquea `final-plan`; con `EDIT_CONTENT` corrige el valor | Igual | Fila se importa igual (formato especial aceptado o corregido) | `quality-review.test.ts` (lib) |
| `SAFE_NORMALIZATION` | Espacios/capitalización/formato de contenido corregidos automáticamente | INFO | Ninguna (`options: []`, se aplica sola) | Siempre aplicada, no requiere decisión | Usa el valor ya normalizado | Fila se importa con el valor normalizado, nunca bloquea | `quality-review.test.ts` (lib) |
| `EXACT_DUPLICATE` | Dos filas con misma marca+nombre+contenido | BLOCKER | `KEEP_FIRST`, `KEEP_SECOND`, `EXCLUDE_FIRST`, `EXCLUDE_SECOND`, `KEEP_SEPARATE` | Sin decisión → bloqueada. `KEEP_SEPARATE` sin nombres finales distintos → **vuelve a bloquear** (revalidado tras aplicar) | — | Sobrevive solo una fila (o ambas, con nombres distintos si `KEEP_SEPARATE` con edición) | `productoService.qualityReview.test.ts` → "flujo completo" (`KEEP_SECOND`) y "EXCLUDE_FIRST" (nuevo); `admin-catalog-import-ui.test.ts` → reapertura de `KEEP_SEPARATE` sin resolver |
| `VARIANT` | Mismo perfume en distintos contenidos | INFO | Ninguna (nunca bloquea) | Cada fila se importa por separado, SKU propio | — | Ambas filas creadas, sin fusionar | `quality-review.test.ts` (lib); `productoService.qualityReview.test.ts` → "revisarCalidadImportacionProveedor es de solo lectura" |
| `POSSIBLE_DUPLICATE` | Nombres muy parecidos, misma marca/contenido | BLOCKER (similitud ≥95% sin ser solo diferencia de concentración) o WARNING | `UNIFY_UNDER_FIRST`, `UNIFY_UNDER_SECOND`, `SET_CANONICAL_NAME`, `KEEP_SEPARATE`, `EXCLUDE_FIRST`, `EXCLUDE_SECOND`, `IGNORE_WARNING` | Unificar exige indicar `costFromRow`; sin eso → bloqueada con error explícito | — | Una fila sobreviviente con nombre/costo elegido, o ambas si se mantienen separadas | `productoService.qualityReview.test.ts` → "construirPlanConDecisiones... regenera el SKU" (`UNIFY_UNDER_FIRST`) |
| `NAME_INCONSISTENCY` | Nombres parecidos con similitud media (incl. typos de descriptor) | WARNING (nunca bloquea) | `USE_SUGGESTED_NAME`, `EDIT_NAME`, `KEEP_SEPARATE`, `IGNORE_WARNING` | Nunca bloquea | — | Fila(s) usan el nombre sugerido/editado o quedan como están | `quality-review.test.ts` (lib) |
| `BRAND_INCONSISTENCY` | Dos formas de escribir la misma marca en el archivo | WARNING (nunca bloquea) | `USE_SUGGESTED_BRAND`, `USE_ALTERNATE_BRAND`, `SET_BRAND_MANUAL`, `KEEP_SEPARATE` | Con `applyToAllInFile` → aplica a todas las filas con esa variante, no solo la del hallazgo | — | Todas las filas coincidentes terminan con la misma marca | `productoService.qualityReview.test.ts` → "BRAND_INCONSISTENCY + USE_SUGGESTED_BRAND con applyToAllInFile" (nuevo) |
| `EXISTING_CATALOG_MATCH` | La fila coincide (exacta o por similitud) con un producto ya en catálogo | WARNING (nunca bloquea) | `UPDATE_EXISTING`, `CREATE_SEPARATE`, `EDIT_NAME`, `EXCLUDE_FIRST` | `UPDATE_EXISTING` liga `targetProductId`; sin decisión, sigue como `CREAR` normal (advertencia informativa) | Con `UPDATE_EXISTING` → `action: ACTUALIZAR`, mismo SKU | Actualiza el producto existente preservando stock/activo/imagen/Top12 | `productoService.qualityReview.test.ts` → "EXISTING_CATALOG_MATCH + decision UPDATE_EXISTING preserva stock/activo/imagen/Top12" |
| `PRICE_ANOMALY` (costo inválido) | Costo ≤ 0 o no numérico | BLOCKER | `EDIT_COST`, `EXCLUDE_FIRST` | Sin decisión → bloqueada | — | Producto creado con el costo corregido | `productoService.qualityReview.test.ts` → "PRICE_ANOMALY (BLOCKER...) + EDIT_COST" (nuevo) |
| `PRICE_ANOMALY` (variación ≥20% o volumen) | Costo nuevo difiere mucho del existente, o presentación menor más cara que una mayor | WARNING (nunca bloquea) | `ACCEPT_NEW_COST`, `KEEP_EXISTING_COST`, `EDIT_COST`, `EXCLUDE_FIRST`, `IGNORE_WARNING` | Nunca bloquea | — | Usa el costo aceptado/editado/conservado según la decisión | `quality-review.test.ts` (lib) |

## Reapertura de bloqueadores (contrato transversal, todos los tipos BLOCKER)

- Un `unresolvedBlockers` devuelto por el servidor en `final-plan`/`confirm`
  hace que **solo** la decisión de ese hallazgo se borre (las demás
  decisiones válidas se conservan) y el hallazgo vuelve a "Pendientes" en
  `CatalogQualityReview` (reutilizado, sin segundo sistema de revisión). El
  mensaje identifica el producto (nombre de fila o número) y la razón
  (`finding.explanation`). Cubierto en `tests/lib/admin-catalog-import-ui.test.ts`
  (11 casos: reapertura simple, varios blockers, decisiones ajenas
  preservadas, nueva confirmación posible tras corregir).
- Sin decisión alguna, `construirPlanConDecisiones` devuelve `plan: []` (no
  crea nada a medias) — `productoService.qualityReview.test.ts` → "hallazgo
  BLOCKER sin decision".

## Perfil "canónico" (CSV técnico, sin asistente de calidad)

No usa `quality-review.ts` ni tiene hallazgos/decisiones: valida columnas y
reglas de negocio (`lib/catalog-import/admin-import.ts`) y separa filas en
`plan` (crear/actualizar) o `erroresFila` (motivo mostrado, fila excluida
automáticamente del `confirm`). No hay "acción" que ejecutar por fila —el
admin corrige el CSV y vuelve a subirlo. Cubierto en
`tests/lib/catalog-import/admin-import.test.ts` y
`tests/app/adminProductsImportRoute.test.ts`.

## Acciones que NO pueden ejecutarse todavía (declaración explícita)

Ninguna. Las 12 combinaciones tipo-de-hallazgo × severidad tienen opciones
reales respaldadas por lógica de servidor probada (unitaria y/o de extremo a
extremo). La única brecha identificada durante esta auditoría —hallazgos
`unresolvedBlockers` devueltos por el servidor quedando "resueltos" en el
estado local del cliente— ya estaba corregida antes de esta fase (ver
`components/admin/CatalogImportPanel.tsx`, `handleUnresolvedBlockers`) y
ahora tiene 11 pruebas dedicadas.
