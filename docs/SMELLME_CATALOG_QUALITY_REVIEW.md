# Asistente de calidad, duplicados y normalización del CSV — Fase 2B.7

- Fecha: 2026-07-30
- Rama: `feature/perfume-store-foundation`
- Fase anterior: Fase 2B.6 (importación directa del CSV de proveedor, `docs/SMELLME_CATALOG_IMPORT_FOUNDATION.md`)
- Alcance: un asistente de calidad **obligatorio** entre la vista previa del CSV de proveedor y la confirmación de importación. Detecta normalizaciones seguras, duplicados exactos/probables, variantes por contenido, incoherencias de marca/nombre, coincidencias con el catálogo existente y anomalías de costo. Exige decisión humana explícita para todo lo que sea ambiguo y nunca escribe nada hasta la confirmación final.
- Fuera de alcance (explícitamente, por instrucción): búsqueda o enriquecimiento de imágenes, IA remota, APIs externas, eliminación de productos existentes, migraciones de Supabase, despliegue a producción.

## 1. Flujo

El importador (`components/admin/CatalogImportPanel.tsx`) pasa por pasos explícitos cuando el perfil detectado es **"CSV de proveedor"**:

1. Seleccionar CSV + configurar recargo.
2. **Vista previa** (`action: "preview"`) — sin cambios respecto a la Fase 2B.6.
3. **Revisar inconsistencias** (`action: "quality-review"`) — ejecuta el motor de calidad (solo lectura) y devuelve los hallazgos.
4. El admin resuelve los conflictos bloqueantes en `components/admin/CatalogQualityReview.tsx` (pestañas Pendientes/Duplicados/Variantes/Nombres y marcas/Costos/Resueltos, tarjetas con comparación lado a lado, decisión por hallazgo).
5. **Ver resumen final** (`action: "final-plan"`) — reconstruye el plan final (SKU incluido) en el servidor a partir de las decisiones, sin escribir nada.
6. `components/admin/CatalogImportFinalSummary.tsx` muestra el resumen ("Catálogo listo para importar") con "Ver cambios" expandible.
7. **Confirmar importación** (`action: "confirm"`) — única escritura real.

El perfil **"Catálogo canónico"** (formato técnico `sku,nombre,marca,contenido,...`) **no** pasa por el asistente: ya trae SKU y columnas explícitas, y su flujo de preview/confirm queda igual que en la Fase 2B.6. Esta es una decisión de alcance: el asistente ataca el problema real (el CSV humano y desordenado del proveedor), no el formato técnico interno.

## 2. Modelo de hallazgos (`lib/catalog-import/quality-review.ts`)

Módulo puro, sin dependencias externas ni IA remota. Cada `QualityFinding` tiene: `id` estable y determinista (`"<TIPO>:<filas u otras claves>"`), `type`, `severity`, `rowNumbers`, `existingProductId?`, `explanation` en español, `rows` (snapshot marca/nombre/contenido/costo), `existing?` (snapshot del producto existente involucrado), `original?`/`suggested?`, y `options` (acciones permitidas, en español, nunca mensajes técnicos).

Tipos: `SAFE_NORMALIZATION`, `EXACT_DUPLICATE`, `POSSIBLE_DUPLICATE`, `VARIANT`, `BRAND_INCONSISTENCY`, `NAME_INCONSISTENCY`, `EXISTING_CATALOG_MATCH`, `PRICE_ANOMALY`.

Severidades: `INFO` (nunca bloquea), `WARNING` (visible, se puede ignorar explícitamente con "Omitir advertencia" o quedar sin decisión — no bloquea el `confirm`), `BLOCKER` (impide confirmar hasta tomar una decisión que lo resuelva).

## 3. Normalizaciones seguras

Aplicadas automáticamente y **siempre registradas** para auditoría (`SAFE_NORMALIZATION`, `INFO`):

- Contenido: `"100 ml"` / `"100ml"` / `"100 ML"` / `"100 Ml"` → `"100ML"` (reutiliza `normalizeContenido` ya existente).
- Capitalización por palabra (`normalizeCasingSafe`), preservando siglas conocidas (`EDP`, `EDT`, `VIP`, `NYC`, `MYSLF`, `EDC`) y números (`212`) sin alterarlos.
- El texto original se conserva siempre (`originalMarca`, `originalNombre`, `originalContenido`, `originalCosto`) junto al valor sugerido.
- **Nunca** corrige ortografía comercial: `"My way Necrar"` permanece `"My Way Necrar"` — solo cambia la capitalización, jamás el contenido semántico.
- No se aplica title-case global "a ciegas": es palabra por palabra, con la lista de siglas como excepción explícita.

Ejemplo real: `"Carolina herrera"` → `"Carolina Herrera"` (capitalización, INFO, registrado en el resumen). Nota de diseño: una diferencia de **capitalización** entre dos filas se resuelve aquí, automáticamente. Una diferencia real de **escritura/alias** (letras distintas, ej. "Yves"/"Ives") no se toca aquí — pasa a `BRAND_INCONSISTENCY` (sección 6) porque requiere criterio humano.

## 4. Duplicado exacto

Identidad = marca + nombre + contenido normalizados (`buildReconciliationKey`, ya existente). El costo **no** forma parte de la identidad. Dos filas con la misma identidad ⇒ `EXACT_DUPLICATE`, siempre `BLOCKER`.

Acciones: `Conservar fila A` / `Conservar fila B` / `Excluir fila A` / `Excluir fila B` / `Mantener separadas` (exige un nombre final distinto para la segunda fila — si tras aplicar la decisión la identidad sigue siendo igual, el conflicto **vuelve a quedar sin resolver** con un error explícito). Nunca se promedia el costo ni se elige automáticamente el mayor o el menor: si los costos difieren, ambos se muestran y la decisión de cuál conservar es implícita en cuál fila se conserva.

Limitación conocida: los hallazgos de duplicado exacto están optimizados para pares (dos filas). Un grupo de tres o más filas idénticas requiere resolver el conflicto en más de una vuelta de revisión.

## 5. Posible duplicado y variantes

**Similitud de texto** (`nameSimilarity`, en `quality-review.ts`): promedio de un coeficiente de Dice sobre bigramas de caracteres y una similitud basada en distancia de Levenshtein normalizada. Sin dependencias externas.

**Identidad vs. candidato**: la identidad (duplicado exacto / variante) usa el nombre completo, incluyendo palabras como EDT/EDP/Parfum/Elixir/Intense/Homme/Femme — estas **nunca** se quitan para decidir si dos filas son "el mismo producto". Para *sugerir candidatos* de posible duplicado se usa una clave secundaria (`buildCandidateNameKey`) que sí quita la marca repetida y descriptores de concentración conocidos — únicamente para encontrar pares a comparar, nunca para fusionar ni para el nombre final.

- Mismo nombre y marca, **distinto contenido** ⇒ `VARIANT` (`INFO`), nunca bloquea, nunca se fusiona. Caso obligatorio verificado: **Lady Million 30/50/80ML → 3 variantes, 0 duplicados**, cada una con su propio SKU, costo y stock.
- Misma marca y contenido, nombres muy parecidos (umbral alto) ⇒ `POSSIBLE_DUPLICATE`. Caso obligatorio verificado: **"Versace Brigth crystal" (50ML, $42.000) vs "Bright Crystal EDT" (50ML, $36.000)** → posible duplicado con comparación lado a lado.
- Misma marca y contenido, similitud media ⇒ `NAME_INCONSISTENCY` (`WARNING`).
- **Regla de seguridad explícita**: si la única diferencia entre dos nombres son descriptores de concentración/formulación (EDT/EDP/Parfum/Elixir/Intense/...), la severidad **nunca** sube a `BLOCKER` automáticamente, aunque la similitud sea altísima — puede ser una variante de concentración legítima. Verificado con la familia obligatoria **Aqua di Gio Profondo** (Parfum / Eau de Parfum / sin sufijo / "Aqua di gio parfum", 125ML, Giorgio Armani): las 4 filas se agrupan para comparación, se muestran lado a lado, y **se conservan separadas por defecto** — nunca se fusionan automáticamente.

Unificar (`Unificar bajo el primero` / `Unificar bajo el segundo` / `Escribir nombre canónico`) exige **elegir explícitamente** qué costo conservar (`costFromRow`); nunca se promedia. Ambas filas de origen quedan registradas en el resumen final (`rowNumbers` del plan final incluye ambos números de fila cuando hay unificación).

Typos de descriptores conocidos (ej. `"parfm"` ~ `"parfum"`, `"toilete"` ~ `"toilette"`) se detectan por distancia de edición contra un vocabulario local cerrado (el mismo usado para descriptores de concentración) — **no** es un diccionario remoto ni comercial. La UI dice "posible inconsistencia", nunca "nombre incorrecto".

**Limitación documentada honestamente**: errores tipográficos en nombres propios sin ninguna fila "hermana" en el mismo archivo (marca+contenido) para comparar — por ejemplo `"My way Necrar"` (debería ser "Nectar") o `"Dylan Bluen Pour Homme"` (debería ser "Blue") — **no se detectan automáticamente** en esta fase, porque hacerlo exigiría un diccionario comercial externo, lo cual está explícitamente fuera de alcance ("no fingir certeza"). Quedan sujetos a revisión manual del operador. `"Borni in roma intense"` sí se detecta porque el mismo archivo trae `"Born in roma EDT"` (misma marca/contenido) como candidato de comparación.

## 6. Incoherencias de marca

Se agrupan las marcas normalizadas distintas presentes en el archivo y se comparan por similitud de texto (Levenshtein normalizado). Caso obligatorio verificado: **"Yves Saint Lauren" / "Ives Saint Lauren"** → `BRAND_INCONSISTENCY` (`WARNING`) con sugerencia editable (la variante más frecuente en el archivo). Acciones: usar la sugerida, usar la otra variante detectada, escribir una manualmente, o mantener como está — con casilla opcional "aplicar a todas las filas coincidentes del archivo actual" (afecta únicamente esta importación; no se persiste como regla, no hay migración de Supabase para alias en esta fase).

## 7. Cotejo con el catálogo existente

Orden de cotejo por fila:

1. **SKU exacto** contra el catálogo existente → ruta normal de `ACTUALIZAR`, sin generar ningún hallazgo (es el caso esperado en cada importación recurrente).
2. **Identidad exacta** (marca+nombre+contenido normalizados) pero con un SKU histórico distinto → `EXISTING_CATALOG_MATCH` (`WARNING`), pidiendo confirmación explícita ("¿Es el mismo producto?").
3. **Candidato similar** (misma marca y contenido, nombre parecido vía la clave de candidato) → mismo tipo de hallazgo, nunca se selecciona automáticamente.

Acciones: `Actualizar este producto existente` (usa el `id`/SKU del producto existente elegido — nunca crea un duplicado), `Crear como producto separado`, `Editar nombre/contenido`, `Excluir de esta importación`. Verificado con pruebas: cuando se elige "Actualizar este producto existente", el plan final preserva **stock, estado activo, imagen y Top 12** (la escritura real la sigue haciendo `ProductoService.confirmarImportacionProveedor`, que ya solo toca nombre/marca/contenido/costo/precio — sin cambios en esta fase). No se implementa fusión de dos productos ya existentes en Supabase ni limpieza de duplicados remotos ya presentes (fuera de alcance).

## 8. Advertencias de costo

`PRICE_ANOMALY`:

- Variación de costo **≥20%** contra un producto existente ⇒ `WARNING`, mostrando costo anterior/nuevo/diferencia en pesos/diferencia porcentual. Acciones: aceptar costo nuevo, mantener costo existente, editar costo, excluir fila, ignorar advertencia.
- Costo inválido o ≤0 ⇒ `BLOCKER` (defensivo: en la práctica `parseSupplierCsv` ya rechaza estas filas antes de llegar al asistente, pero el motor lo revalida igual si se le da una fila directamente).
- Variante de menor contenido más cara que una de mayor contenido del mismo producto ⇒ advertencia comercial (`WARNING`, nunca bloqueante — puede ser correcto).

Nunca se promedia ni se elige automáticamente el valor menor o mayor.

## 9. SKU final y seguridad del plan

El SKU se genera **después** de aplicar todas las decisiones (`applyQualityDecisions`), nunca antes — el SKU mostrado en la vista previa inicial es explícitamente "provisional" en la UI. El servidor:

- Recibe únicamente `decisions[]` (un array pequeño y auditable: `findingId`, `optionId`, y campos opcionales `textValue`/`numberValue`/`costFromRow`/`targetProductId`/`applyToAllInFile`), **nunca** filas finales, nombres, marcas, costos o SKU precomputados por el navegador.
- Recalcula desde cero: parsea el archivo otra vez, vuelve a ejecutar el motor de calidad, y aplica las decisiones recibidas sobre ese resultado fresco.
- `previewHash` (ya existente desde la Fase 2B.6): ata la revisión al archivo + perfil + recargo exactos.
- `reviewHash` (nuevo): ata las decisiones al conjunto de hallazgos que el admin realmente vio (hash de `previewHash` + esqueleto ordenado de `{id, type, severity}` de cada hallazgo). Si el archivo cambia, el recargo cambia, o los hallazgos recalculados difieren, el hash no coincide → **HTTP 409** "El archivo o la revisión cambió. Genera una nueva vista previa antes de importar."
- Antes de escribir, se valida además: cada `decision.findingId` debe existir entre los hallazgos recalculados (si no, 409); cada `targetProductId` de una decisión `UPDATE_EXISTING` debe seguir existiendo en el catálogo (si no, 409); no deben quedar `BLOCKER` sin resolver ni SKU finales duplicados (si algo falla aquí, 400 con el detalle).
- Preview, quality-review y final-plan son **0 escrituras**. Solo `action: "confirm"` escribe, en una única operación explícita, reutilizando el bloqueo de doble envío ya existente en el panel.

## 10. Resultado contra el CSV real (Fase 2B.7, solo lectura)

Validado localmente contra `.local-import/catalogo-julio-original.csv` (no se agregó al repositorio; el motor se probó vía un script temporal descartado tras la validación). Resultado:

| Métrica | Valor |
|---|---|
| Filas físicas | 109 |
| Filas vacías | 8 |
| Filas útiles | 101 |
| Normalizaciones seguras | 101 |
| Variantes detectadas (filas) | 15 (7 grupos) |
| Posibles duplicados | 11 |
| Coincidencias con catálogo existente | 0 (sin catálogo remoto cargado en la validación local) |
| Incoherencias de nombre/marca | 16 |
| Advertencias de costo | 1 |
| Conflictos bloqueantes | 0 |

Casos obligatorios confirmados: Lady Million (30/50/80ML) → 3 variantes, 0 duplicados; "Versace Brigth crystal" vs "Bright Crystal EDT" → posible duplicado con comparación; "Yves Saint Lauren" vs "Ives Saint Lauren" → incoherencia de marca con sugerencia editable; "Carolina Herrera" vs "Carolina herrera" → normalización segura; familia "Aqua di Gio Profondo" → agrupada, nunca fusionada; "Myslf Eau de parfm" → inconsistencia de nombre detectada (typo de descriptor). Con 0 decisiones adicionales, el motor produce un plan final de **101 filas con 101 SKU únicos**, sin errores.

## 11. Pruebas

Suite completa: **419 pruebas** (369 previas + 50 nuevas), `npm run test:run` en verde. Nuevas:

- `tests/lib/catalog-import/quality-review.test.ts` (36): normalización segura, duplicado exacto (mismo costo, costo distinto, `KEEP_SEPARATE` con y sin renombre), posible duplicado (caso Versace obligatorio, unificación con costo explícito, nombre canónico, familia Aqua di Gio, EDT/EDP/Elixir nunca fuerzan bloqueo), variantes (Lady Million obligatorio, SKU distinto por variante), marcas (Yves/Ives obligatorio, aplicar a todas), catálogo existente (SKU exacto no genera hallazgo, SKU histórico distinto sí, candidato similar no se autoselecciona, precio MANUAL se preserva), costos (variación ≥20%, aceptar/mantener/ignorar, nunca promedio), utilidades de similitud.
- `tests/services/productoService.qualityReview.test.ts` (6): solo lectura en `revisarCalidadImportacionProveedor`/`construirPlanConDecisiones`, flujo completo revisar→decidir→confirmar, preservación de stock/activo/imagen/Top 12 al vincular un producto existente.
- `tests/app/adminProductsImportRoute.test.ts` (+7 sobre las 12 previas): acción `quality-review`, acción `final-plan` (no escribe), 409 por `previewHash`/`reviewHash` inválido, 409 por `decision.findingId` desconocido, 409 por producto existente ya inexistente, 400 por `BLOCKER` sin resolver, 401 en `quality-review` sin sesión.

## 12. Limitaciones conocidas

- El asistente de calidad solo cubre el perfil **"CSV de proveedor"**; el perfil "Catálogo canónico" no lo atraviesa (decisión de alcance, documentada en la sección 1).
- `EXACT_DUPLICATE` está optimizado para pares; grupos de 3+ filas idénticas requieren más de una vuelta de revisión.
- Errores tipográficos en nombres propios sin fila "hermana" para comparar en el mismo archivo no se detectan (sección 5) — no hay diccionario comercial, por diseño.
- No hay reglas persistentes de alias de marca entre importaciones (cada "aplicar a todas" es local a la importación actual); no se crea ninguna migración de Supabase para esto en esta fase.
- No se implementa fusión de dos productos ya existentes en Supabase, ni limpieza de duplicados históricos ya presentes en el catálogo remoto.
- Búsqueda o enriquecimiento de imágenes: **fuera de alcance**, no se tocó nada relacionado en esta fase.

## 13. Ejemplos sanitizados (sin datos comerciales completos)

```
Fila 27: "Versace Brigth crystal" · Versace · 50ML · $42.000
Fila 45: "Bright Crystal EDT"      · Versace · 50ML · $36.000
→ POSSIBLE_DUPLICATE (WARNING): mismo contenido y marca, nombres muy parecidos.

Fila 5: "Lady million" · Paco Rabanne · 30ML
Fila 6: "Lady million" · Paco Rabanne · 50ML
Fila 7: "Lady million" · Paco Rabanne · 80ML
→ VARIANT (INFO) × 1 hallazgo, 3 filas: se importan por separado.

Fila 22: "Yves Saint Lauren"
Fila 98: "Ives Saint Lauren"
→ BRAND_INCONSISTENCY (WARNING): sugerencia editable "Yves Saint Lauren".
```
