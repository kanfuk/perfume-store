# Diagnóstico: tamaño visual inconsistente del producto en Top 15/catálogo

## Problema reportado

Con el marco de imagen ya uniforme (`ProductImageFrame`: mismo aspect-ratio,
mismo fondo, mismo padding en todas las tarjetas de una sección), el OWNER
reportó que las fotos seguían viéndose de "distinto porte" entre productos,
tanto en desktop como en mobile.

## Hipótesis 1 (descartada con datos reales): margen de fondo recortable

Primer intento: `sharp().trim()` (recorte determinista de margen de fondo
casi uniforme alrededor del producto, servido de forma opt-in vía
`?fit=trim` en el proxy same-origin `/api/product-images/[...path]`).

**Verificación con 6 fotos reales del catálogo** (bypass de cache explícito,
bytes descargados directamente y comparados con `sharp`, sin medir el DOM):

| Producto | Original (w×h) | Bytes original | Trim (w×h) | Bytes trim | ¿Cambió? |
|---|---|---|---|---|---|
| Sauvage Elixir | 1275×1233 | 89 284 | 1275×1233 | 89 284 | No |
| Le Male Elixir | 1254×1254 | 162 034 | 1254×1254 | 162 034 | No |
| Le beau Le parfum | 1122×1402 | 161 908 | 1122×1402 | 161 908 | No |
| Invictus Vitory Elixir | 960×1280 | 111 094 | 960×1280 | 111 094 | No |
| La Bomba | 1315×1196 | 182 434 | 1315×1196 | 182 434 | No |
| La Vie Est Belle EDP | 1307×1203 | 142 190 | 1307×1203 | 142 190 | No |

**Resultado: `bytesIdentical = true` y `dimensionsChanged = false` en las
6 fotos, sin excepción.**

### SHARP TRIM IS INEFFECTIVE FOR THESE PHOTOGRAPHIC BACKGROUNDS

Inspección visual directa de las 6 fotos originales confirma la causa: son
fotos de estudio/lifestyle con fondo elaborado (mármol, destellos dorados,
viñetas) que ocupa el cuadro **completo**, sin ningún margen de color plano
en los bordes. `sharp().trim()` necesita una región de color casi uniforme
tocando el borde para poder recortarla; aquí no existe tal región, así que
el algoritmo no tiene nada que quitar. La implementación se revirtió por
completo (commit de revert en `fix/catalog-image-visual-scale`): no queda
código muerto, no queda proxy con procesamiento server-side sin beneficio.

## Causa real: geometría, no margen

Cada foto trae su propia relación de aspecto (ancho/alto), pero el marco es
fijo: `aspect-square` (1:1) en mobile, `aspect-[3/4]` (0.75) en desktop.
`object-fit: contain` dentro de un marco fijo deja franjas vacías
(letterbox) en el eje que no coincide con esa relación — y la severidad de
esa franja varía mucho de una foto a otra:

| Producto | Relación foto | Fill mobile (1:1) | Fill desktop (3:4) |
|---|---|---|---|
| Sauvage Elixir | 1.03 | ~97% | ~73% |
| Le Male Elixir | 1.00 | 100% | ~75% |
| Le beau Le parfum | 0.80 | ~80% | ~94% |
| Invictus Vitory Elixir | 0.75 | ~75% | 100% |
| La Bomba | 1.10 | ~91% | ~68% |
| La Vie Est Belle EDP | 1.09 | ~92% | ~69% |

Esta variación (68%–100% según producto y viewport) es la causa real y
medible de "distinto porte visual" — no hay margen de fondo que recortar,
hay una relación de aspecto que no coincide con el marco.

## Solución adoptada: `visualScale` por producto

`lib/product-image-visual-scale.ts`: tabla estática en código (no en
Supabase) que aplica un zoom uniforme (`transform: scale()`, nunca
`stretch`) por `productId`, acotado a un máximo de 1.35 como red de
seguridad. El marco (`overflow: hidden`) recorta solo el sobrante que ya
queda fuera de la tarjeta; el objeto en Storage nunca se toca. Sin entrada
en la tabla, el valor es 1 (sin cambios) — no afecta al resto del catálogo.

Como es un único valor por producto (no por viewport), se calibró como un
compromiso moderado entre el desajuste de mobile y de desktop para cada
foto, priorizando nunca superar el tope de seguridad. Es una decisión
manual, documentada y editable — no heurística automática ni IA.

## Por qué se descartó la variante automática (aspect-ratio dinámico)

Se evaluó calcular el zoom en el navegador a partir de `naturalWidth`/
`naturalHeight` reales vs. la relación del marco (sin tabla manual,
cubriendo los 150 productos automáticamente). Se prefirió la tabla estática
porque: (1) es lo que pidió explícitamente el encargo ("mapa frontend
basado en productId/SKU"), (2) es más simple de razonar y probar sin
`ResizeObserver`/medición en runtime, y (3) evita reintroducir una capa de
cálculo dinámico justo después de comprobar que una solución "automática"
(el trim) no entregó el beneficio esperado.

## Resultado en Preview y pivote final: `visualScale` también se revirtió

El OWNER revisó el Preview con `visualScale` y reportó que las fotos
quedaban peor: "encajadas" dentro de un bloque visible más chico -- el
padding + fondo neutro + el propio `ProductImageFrame` (aunque resolvía la
inconsistencia de tamaño relativo entre fotos) sacrificaba la sensación de
"foto hero" que tenía el catálogo antes de toda esta serie de cambios.

Se revirtió `ProductImageFrame` y `lib/product-image-visual-scale.ts` por
completo (eliminados, no dejados como código muerto) y se adoptó en su
lugar el mismo tratamiento que ya usaba la sección Ofertas: `object-cover`
a pantalla completa del bloque multimedia (`aspect-[4/3]`), sin padding, sin
caja secundaria, imagen pegada al borde superior de la card, badges
superpuestos directamente sobre la foto. Este es ahora el único tratamiento
de imagen en `ProductCard`, usado por Top 15, catálogo completo y Ofertas
por igual.

`object-position`: se probó `top` vs `center` recortando fotos reales
(`Le beau Le parfum`, vertical, `Sauvage Elixir`, casi cuadrada) al ratio
4:3 objetivo. `top` cortaba la base/reflejo de las botellas más verticales;
`center` conserva frasco + estuche completos en todas las fotos probadas.
Se usó `object-center`, no `object-top`.
