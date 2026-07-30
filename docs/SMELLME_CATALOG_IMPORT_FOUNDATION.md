# Fundación de catálogo real, Top 12 e importador seguro — Fase 2B

- Fecha: 2026-07-29
- Rama: `feature/perfume-store-foundation`
- Fase anterior: tag `smellme-modern-ui-v0.7.0` (rediseño Smellme.cl, storefront y admin)
- Alcance: motor de reconciliación de planillas reales, catálogo canónico con SKU determinista, asociación del Top 12 a fotografías reales, catálogo público (Top 12, ofertas, búsqueda/filtros) e importador CSV masivo en el panel admin. **Solo lectura contra Supabase remoto; ninguna escritura se ejecutó.**

## 1. Fuentes localizadas

Todas las fuentes se ubicaron automáticamente en `Descargas` del usuario por nombre, encabezados y fecha reciente (no se pidió al usuario copiar nada). Se copiaron sin mover los originales a `.local-import/` (ignorado por git vía `.git/info/exclude`, nunca por `.gitignore`).

| Rol | Archivo original | Copia local | SHA-256 |
|---|---|---|---|
| Top 12 (fotos) | `WhatsApp Unknown 2026-07-29 at 18.46.30.zip` | `.local-import/top12-original.zip` | `6f4e7916b40feefb90e048fa73f6efd91b7404e91456c0c7fd35fcd967bc3a38` |
| Julio | `Actualizacion de precios Julio- Erick Aguilera.csv` | `.local-import/catalogo-julio-original.csv` | `3b43a5bdbba9f243cc4f768b7f495f469ecb3c0fcacf4b5210605fb588c0c436` |
| Junio | `EXCEL VENTAS PERFUMES JUNIO(Stock) (1).csv` | `.local-import/catalogo-junio-original.csv` | `8ceb0321398c0105b967f6183329a4431860782394b61afa18a816abc1d1ca42` |

Hash del original y de la copia verificados idénticos para las tres fuentes. Detalle completo (sin rutas absolutas ni contenido de las planillas) en `.local-import/source-manifest.json`.

## 2. Encoding y estructura real de las planillas

- **Julio**: Windows-1252, delimitador `;`, columnas `Perfume;Marca;Contenido;Precio Compra`. 109 filas físicas, 8 vacías, **101 filas útiles**. Sin filas inválidas ni duplicadas.
- **Junio**: UTF-8 con BOM, delimitador `;`, columnas `Perfume;Marca;Contenido;Costo Unitario;Precio Venta;...;Ganancia`. 226 filas físicas (119 son relleno de Excel con un `0` residual en la columna Ganancia — detectadas como vacías ignorando columnas no usadas), **107 filas útiles**, de las cuales **1 es inválida** (nombre sin marca ni contenido).

**Hallazgo crítico documentado**: ninguna de las dos planillas trae una columna de stock/existencias. El stock es **desconocido para el 100% del catálogo** y nunca se sustituye por 0 ni se infiere: queda `null`, lo que fuerza `estado_datos` a incluir `FALTA_STOCK` y `activo=false` en todo el catálogo hasta que alguien cargue stock real.

Julio solo trae "Precio Compra" (costo, **no** precio de venta — regla explícita respetada en todo el motor). El precio de venta real solo existe en la columna "Precio Venta" de junio, y está vacío en la mayoría de las filas.

## 3. Motor de reconciliación (`lib/catalog-import/`)

Módulos: `encoding.ts`, `delimiter.ts`, `normalization.ts`, `parser.ts`, `sku.ts`, `reconciliation.ts`, `validation.ts`, `canonical.ts`, `top12.ts`, `admin-import.ts`. Cada uno con pruebas dedicadas en `tests/lib/catalog-import/`.

Clasificación obtenida al reconciliar julio (universo canónico) con junio:

| Clasificación | Cantidad |
|---|---|
| MATCH_EXACTO | 91 |
| SOLO_JULIO | 8 |
| SOLO_JUNIO | 13 |
| AMBIGUO | 4 (2 pares: "Myslf"/"Myself" YSL 100ml, "Borni"/"Born in roma intense" Valentino 100ml) |
| FILA_INVALIDA | 1 |
| DUPLICADO | 0 |

El fuzzy matching (variantes tipográficas, ej. "Myslf" vs "Myself") **solo sugiere candidatos bajo AMBIGUO**; nunca fusiona automáticamente. Los pares AMBIGUO quedan fuera del catálogo canónico, pendientes de confirmación manual (`smellme-ambiguous.csv`).

**Catálogo canónico resultante: 112 productos** (91 + 8 + 13). Ninguno queda `activo=true` porque **ningún producto tiene stock conocido**:

- Con costo: 108 / Sin costo: 4
- Con precio de venta: 36 / Sin precio de venta: 76
- Con stock: 0 / Sin stock: 112
- Importables (`estado_datos = COMPLETO`): **0**
- Bloqueados: **112**

Esto es el comportamiento correcto y esperado dado que las fuentes reales no traen stock — no es un defecto del motor.

## 4. SKU determinista

Formato `SML-<MARCA>-<NOMBRE>-<CONTENIDO>`, ASCII, mayúsculas, sin tildes ni puntuación, contenido normalizado incluido (`80ML`, `100ML`, ...). Ante colisión de SKU base se agrega sufijo `-2`, `-3` en orden de aparición. Sin timestamps ni UUID. Ejemplo: `SML-CAROLINA-HERRERA-LA-BOMBA-80ML`.

## 5. Top 12: fotografías e imágenes

Las 12 fotografías del ZIP fueron auditadas (960×1280 JPEG, sin duplicados por hash, sin ejecutables, sin path traversal) e **identificadas visualmente una por una** (marca y nombre tal como aparecen impresos en caja/frasco — el texto "TESTER/PROBADOR" visible en varias cajas no se agregó al nombre ni se editó de la imagen). Se optimizaron con Sharp a WebP calidad 86, sin recorte, proporción completa, sin upscale (el máximo real fue 1280px, bajo el límite de 1600px) en `public/images/perfumes/top12/`.

Asociación contra el catálogo canónico (`data/top12-image-map.json`, `lib/catalog-import/top12.ts`):

| Rank | Identificado en la foto | Resultado |
|---|---|---|
| 1 | Jean Paul Gaultier — Le Male Elixir Absolu | **Sin match** (solo existe "Jpg Le Male" genérico en planillas) |
| 2 | Jean Paul Gaultier — Le Beau | **Sin match** (no existe en ninguna planilla) |
| 3 | Carolina Herrera — La Bomba | **Confirmado** → `SML-CAROLINA-HERRERA-LA-BOMBA-80ML` |
| 4 | Carolina Herrera — 212 Men Heroes Forever Young (50ml) | **Sin match** (variante masculina/50ml ausente) |
| 5 | Xerjoff — Naxos | **Sin match** (solo "Erba pura" del mismo sello) |
| 6 | Carolina Herrera — 212 Heroes Forever Young (80ml) | Candidato único no confirmado → "212 heroes forever mujer" (junio, 80ml) |
| 7 | Ralph Lauren — Polo Blue Parfum | **Sin match** |
| 8 | Yves Saint Laurent — MYSLF EDP | Ambiguo → candidatos "Myslf"(julio)/"Myself"(junio), pendientes de conciliar |
| 9 | Creed — Millésime Impérial | **Sin match** (marca Creed ausente de ambas planillas) |
| 10 | Giorgio Armani — Acqua di Giò Profondo Parfum | Candidato único no confirmado → "Aqua di gio Profondo Parfum" (125ml, variación ortográfica) |
| 11 | Dior — Sauvage Parfum | Ambiguo → candidatos "Sauvage EDT" / "Sauvage Elixir" (100ml, distinta concentración) |
| 12 | Lancôme — La Vie Est Belle | Ambiguo → candidatos "rose" (50ml) / "l'extra" (75ml) |

**Solo 1 de 12 quedó confirmado automáticamente** (`es_top=true`, `orden_destacado=3`). Los otros 11 requieren decisión humana antes de activarse como Top 12, tal como exige la regla de no adivinar coincidencias inciertas. Ninguna imagen se descartó: las 12 se optimizaron igual, solo cambia si están o no asociadas a un producto comercial real.

## 6. Top 10 → Top 12

`lib/constants.ts` define `TOP_PRODUCTS_LIMIT = 12`. No existía ningún límite hardcodeado de "Top 10" en código funcional (`es_top`/`orden_destacado` estaban en el contrato pero sin ninguna pantalla construida). El único texto "Top 10" en código vivo (`components/shared/ProductCatalog.tsx`, estado vacío) se actualizó a "Top 12". Las menciones restantes de "Top 10" están únicamente en documentos históricos de fases archivadas (`PERFUME_STORE_FOUNDATION_AUDIT.md`, `PERFUME_STORE_APPLICATION_CONTRACT.md`, `SOURCE_TEMPLATE.md`) y no se reescribieron, por instrucción explícita.

## 7. Catálogo público

Nuevos componentes en `components/shared/`: `TopProductsSection.tsx` (ranking 1–12, imagen `object-contain`, insignia de posición), `OffersSection.tsx` (solo `es_oferta_semana`, precio anterior tachado solo si existe realmente), `CatalogExplorer.tsx` (búsqueda por nombre/marca/SKU, filtro por marca, orden por nombre/precio, paginación por bloques de 12). Lógica de búsqueda extraída a `lib/catalog-search.ts` (testeable sin DOM). Integrados en `components/OrderForm.tsx`. El público nunca ve productos inactivos, sin precio o sin stock — la API ya filtraba por `activo=true`, y `activo` exige stock y precio por construcción del dominio.

## 8. Importador CSV masivo (admin)

No existía ningún importador previo (confirmado por auditoría del código). Se construyó desde cero:

- `lib/catalog-import/admin-import.ts`: parseo del CSV canónico (`sku,nombre,marca,contenido,costo_unitario,precio_venta,stock,activo,es_top,orden_destacado,es_oferta_semana,precio_anterior,image_url`), validación (SKU único, stock/precio no negativos, activo exige precio y stock, máximo 12 destacados, posiciones 1–12 únicas).
- `services/productoService.ts`: `previsualizarImportacionCsv` (dry-run puro, nunca escribe) y `confirmarImportacionCsv` (upsert por SKU vía `buscarProductoPorSku`, nuevo método de repositorio; **nunca elimina** productos ausentes del archivo).
- `app/api/admin/products/import/route.ts`: requiere `isAdminAuthenticated()`, origen confiable, límite de tamaño (2 MiB), acciones `preview`/`confirm` separadas (confirmación explícita, nunca automática tras el preview).
- `app/admin/importar-catalogo/page.tsx` + `components/admin/CatalogImportPanel.tsx`: selector de archivo, vista previa con resumen crear/actualizar/bloqueado y tabla de errores por fila, botón de confirmación deshabilitado si hay errores globales.

## 9. Seguridad

- ZIP validado antes de extraer: sin path traversal, sin ejecutables, sin duplicados.
- CSV: detección de encoding/delimitador, sin asumir UTF-8 ciego; contenido binario disfrazado de CSV rechazado.
- Importador: auth admin + origen confiable + límite de tamaño + validación de extensión, errores públicos sin detalles internos.
- `.local-import/` y `.local-work/` excluidos vía `.git/info/exclude` (no se tocó `.gitignore`).

## 10. Dry-run y estado de Supabase

Solo lectura. No se insertó, actualizó ni eliminó ningún registro remoto, no se creó Storage, no se subieron imágenes al remoto, no se ejecutaron migraciones. El script `scripts/catalog/build-smellme-catalog.mjs` genera todos los reportes en `.local-work/output/` (no versionado) y `data/top12-image-map.json` (sí versionado, sin rutas absolutas). Ejecutado dos veces de forma independiente: **salida byte-idéntica** (mismos hashes SHA-256), confirmando determinismo.

## 11. Datos faltantes y bloqueos (no inventados)

- **Stock**: desconocido para los 112 productos canónicos. Ninguno se activa hasta que se cargue stock real.
- **Precio de venta**: falta en 76 de 112 (julio no tiene esa columna; junio la deja vacía en la mayoría de filas).
- **Top 12**: 11 de 12 fotos sin asociación automática confirmada (1 confirmada, 2 candidato único, 3 ambiguas, 6 sin ningún dato en planillas). No se inventaron nombres, marcas, precios ni variantes para completarlas.

## 12. Rollback

Todo lo generado en esta fase vive en el árbol de trabajo sin commit. Para revertir: `git checkout -- .` (o `git clean` para archivos nuevos no rastreados) descarta todos los cambios de código; `.local-import/` y `.local-work/` se pueden borrar libremente (nunca llegaron a git). No hay nada que revertir en Supabase porque no se escribió nada.

## 13. Pasos pendientes (decisión humana requerida)

1. Confirmar o descartar los 2 pares AMBIGUO de reconciliación (Myslf/Myself, Borni/Born in roma intense).
2. Decidir las 11 asociaciones Top 12 no confirmadas (1 confirmada de 12).
3. Cargar stock real para activar productos (ninguno puede activarse sin esto).
4. Completar precio de venta para los 76 productos que no lo traen.
5. Ejecutar la importación real (`confirm`) contra Supabase cuando el admin decida — no se ejecutó en esta fase.
