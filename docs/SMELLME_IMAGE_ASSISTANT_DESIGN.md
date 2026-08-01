# Smellme.cl — Diseño cerrado: Asistente seguro de imágenes de producto

**Documento de diseño previo a la implementación.** No se escribió código de
búsqueda web, scraping ni descarga automática durante la auditoría. Este
documento fija las guardas mínimas que debe respetar la fase de implementación.

## Objetivo

Reducir el trabajo manual de subir 1 imagen a la vez (Fase 3B.3,
`docs/SMELLME_PRODUCT_IMAGE_UPLOAD.md`) para el grueso del catálogo: hoy
102 de 106 productos no tienen imagen (ver `docs/SMELLME_FINAL_MVP_AUDIT.md`,
sección de datos del catálogo). El asistente no reemplaza el pipeline de
subida ya construido — lo alimenta: encuentra candidatos, un humano
aprueba, y de ahí en adelante usa exactamente el mismo
`processProductImage`/`ProductImageService` de la Fase 3B.3. No hay una
segunda vía de guardado de imágenes.

## Por qué no es solo "scrapear Google Images"

- Legal/ToS: la mayoría de resultados de imagen de un buscador genérico no
  tienen licencia clara para reuso comercial; hotlinkear además rompe si el
  origen cambia la URL o bloquea el hotlink.
- Calidad: fotos de producto de fabricantes/distribuidores autorizados son
  consistentes (fondo, resolución, ángulo); resultados de búsqueda genérica
  mezclan fotos de usuarios, capturas de reseñas, watermarks de terceros.
- Seguridad: permitir que un proceso automático visite URLs arbitrarias
  encontradas en la web es superficie de ataque SSRF real si no se
  restringe agresivamente el destino.

Por eso el diseño exige una lista blanca de dominios configurable, nunca
"buscar en toda la web".

## Entrada

- Catálogo actual (`productos`: nombre, marca, contenido, sku).
- CSV de proveedor ya soportado por `lib/catalog-import/` (mismo parser,
  normalización y detección de SKU que el importador existente —
  `lib/catalog-import/parser.ts`, `normalization.ts`, `sku.ts`; no se
  duplica esa capa).
- Concentración (EDT/EDP/Parfum/Elixir/Intense/...) cuando pueda inferirse
  del nombre — reutiliza el mismo vocabulario que ya distingue familias en
  `lib/product-families.ts` (comentario en `buildFamilyKey`: estos
  modificadores ya forman parte de `nombre`, no de un campo separado).

## Proceso (15 pasos, en orden)

1. **Normalizar marca y nombre** — reutiliza `lib/catalog-import/normalization.ts`
   (`normalizeMatchKey`), no una normalización nueva.
2. **Detectar familia y variante** — reutiliza `buildFamilyKey`/
   `groupProductsIntoFamilies` (`lib/product-families.ts`) tal cual.
3. **Detectar productos sin imagen** — `productos.image_url` vacío
   (`WHERE image_url IS NULL OR image_url = ''`), solo `activo = true`.
4. **Construir consulta de búsqueda** — plantilla determinística, ej.
   `"{marca}" "{nombre}" {contenido} perfume`, sin IA generativa para
   redactar la query (evita resultados impredecibles).
5. **Buscar candidatos** — únicamente contra el "buscador mediante
   proveedor oficialmente soportado" (ver sección Dominios) — nunca un
   scraper de un motor de búsqueda genérico.
6. **Validar dominio fuente** — contra la lista blanca configurable antes
   de considerar el resultado siquiera.
7. **Descargar miniaturas candidatas** — solo la miniatura/preview de baja
   resolución para comparar, no la imagen completa todavía (menos ancho de
   banda, menos superficie de riesgo por candidato descartado).
8. **Comparar texto del resultado** — marca/nombre/contenido del resultado
   del proveedor vs. el producto local (similaridad de texto simple,
   ej. distancia de Levenshtein normalizada + coincidencia exacta de
   marca), no un modelo de lenguaje.
9. **Asignar score** — combinación determinística de: coincidencia de
   marca (peso alto), coincidencia de nombre (peso alto), coincidencia de
   contenido/concentración (peso medio), confiabilidad del dominio (peso
   medio). Todo explicable, sin caja negra.
10. **Mostrar 1–3 candidatos** — nunca aplica nada sin que un admin lo vea
    primero, salvo el botón explícito de alta confianza (punto 11).
11. **Aprobación manual** — por producto, o en lote solo para alta
    confianza vía "Aprobar todas las coincidencias seguras".
12. **Procesar con el pipeline existente** — al aprobar, la imagen
    COMPLETA (no la miniatura de comparación) se descarga una vez más y
    pasa por `processProductImage` (`lib/product-image-processing.ts`) sin
    ningún cambio: mismas reglas de EXIF/WebP/1600px/calidad 86 que una
    subida manual.
13. **Subir a Storage** — mismo `ProductImageService.reemplazarImagenProducto`
    de la Fase 3B.3, mismo bucket `product-images`, mismo reemplazo
    seguro. El asistente no inventa un segundo mecanismo de guardado.
14. **Guardar origen y fecha** — requiere una columna nueva (ver
    "Cambios de esquema requeridos" más abajo); hoy no existe ningún campo
    de procedencia de imagen.
15. **Evitar duplicados** — antes de re-procesar un producto, verificar que
    no exista ya una entrada de historial con el mismo `sourceUrl` y
    resultado "aprobado" para ese producto (no re-descargar ni re-mostrar
    lo mismo dos veces).

## Niveles de confianza

| Nivel | Criterio | Acción |
|---|---|---|
| **Alta** | Marca exacta + nombre exacto + concentración exacta + contenido compatible + dominio aprobado (no solo "permitido", sino marcado como fuente de alta confiabilidad) | Elegible para "Aprobar todas las coincidencias seguras"; aun así queda un registro auditable de qué se aprobó y cuándo |
| **Media** | Marca y nombre coinciden, pero concentración o presentación es dudosa (ej. el resultado no aclara EDT vs EDP, o el contenido no calza exacto) | Requiere selección individual, nunca aprobación en lote |
| **Baja** | Nombre ambiguo, o el resultado parece ser un tester/flanker/set/fotografía no oficial/fuente sin marca clara de autenticidad | No se carga automáticamente ni se ofrece como candidato principal; como mucho se lista en una sección "descartados" opcional para revisión manual explícita |

## Dominios: lista blanca, no scraping indiscriminado

- **Catálogo de dominios aprobados**: tabla/config explícita
  (ej. `image_assistant_approved_domains`), cada entrada con: dominio,
  nivel de confiabilidad (afecta el score), fecha de aprobación, quién la
  aprobó, y una nota de si el dominio permite reuso de imágenes de
  producto en su ToS/robots.txt (revisión manual al agregar el dominio,
  no automática — este proyecto no debe interpretar legalmente un ToS por
  su cuenta).
- **Lista de exclusión**: dominios explícitamente prohibidos aunque
  aparezcan como candidato (ej. sitios de reseñas con fotos de usuario,
  competidores directos, cualquier dominio que ya haya dado problemas de
  licencia).
- Preferencia explícita por: sitios de fabricantes, distribuidores
  autorizados, y "un buscador mediante proveedor oficialmente soportado"
  (es decir, una API de búsqueda de producto con términos de uso claros,
  no scraping de resultados HTML de un buscador genérico) — a definir cuál
  proveedor concreto en la fase de implementación, no en este diseño.
- **Nunca hotlink**: la URL fuente se guarda solo como metadata/evidencia
  (`sourceUrl`), la imagen que efectivamente se sirve siempre es la copia
  procesada y almacenada en el bucket `product-images` de Smellme, igual
  que cualquier imagen subida a mano.

## Score

Función pura, determinística, con las mismas garantías de testeable-sin-red
que `lib/product-image-processing.ts` ya demuestra para el procesamiento:
entrada = (datos del producto local, metadata del candidato, dominio),
salida = número 0–100 + el nivel (alta/media/baja) + el desglose de por
qué (para que la UI pueda explicarle al admin la razón del score, no solo
mostrar un número).

## Revisión, historial y reintentos

- **Revisión**: cola por producto — "pendiente", "aprobado", "rechazado",
  "aplicado". Un producto puede tener varios candidatos históricos; solo
  uno puede estar "aplicado" a la vez (coincide con que `productos` solo
  tiene una imagen activa).
- **Historial**: cada intento (búsqueda, candidato mostrado, decisión del
  admin, resultado de la subida) queda registrado con fecha — sirve tanto
  para evitar duplicados (paso 15) como para auditar de dónde salió cada
  imagen del catálogo, algo que hoy no existe para ninguna imagen
  (tampoco para las subidas manualmente en 3B.3, que no registran
  "quién" ni "cuándo" más allá de lo que ya guarda Postgres en
  `updated_at`).
- **Reintentos**: si la descarga de la imagen completa (paso 12) falla
  después de aprobar un candidato, se reintenta un número limitado de
  veces (ej. 3, con backoff) antes de marcar el intento como fallido y
  pedir revisión manual — nunca reintentos indefinidos.
- **Límites**: máximo de candidatos procesados por corrida (evita que una
  corrida intente resolver los 102 productos sin imagen de una sola vez
  sin supervisión), límite de solicitudes por dominio por minuto (buen
  ciudadano con el proveedor de búsqueda y con los dominios fuente), y un
  límite de tamaño de descarga por candidato antes incluso de decodificar
  nada (igual que `PRODUCT_IMAGE_CONFIG.maxInputBytes` en 3B.3, reutilizado
  tal cual para el paso 12).

## Cache

Cachear resultados de búsqueda por (marca, nombre, contenido) normalizados
durante un período corto (ej. 24-48h) para no repetir la misma consulta al
proveedor de búsqueda si el admin corre el asistente varias veces sobre el
mismo lote sin aprobar nada todavía. No cachear las imágenes descargadas
más allá de lo necesario para la comparación del paso 7-8 — no acumular un
segundo almacén de binarios paralelo al bucket de Storage.

## Protección SSRF

Este es el punto de mayor riesgo nuevo (nada parecido existe hoy en el
código: 3B.3 solo procesa un `Buffer` que el propio admin subió desde su
navegador, nunca hace un `fetch` a una URL elegida por un tercero). Reglas
obligatorias antes de implementar:

- Resolver el dominio de cada URL candidata contra la lista blanca ANTES
  de hacer cualquier request (comparación de string, no solo "contiene").
  Que no sea posible pasar `https://dominio-aprobado.com.attacker.com/...`.
- Rechazar cualquier URL cuyo host resuelva a una IP privada/loopback/
  link-local (`127.0.0.1`, `10.x`, `172.16-31.x`, `192.168.x`, `169.254.x`,
  `::1`, etc.) — validar la IP resuelta, no solo el string del host, para
  evitar DNS rebinding.
- Solo `https://`, nunca `http://`, `file://`, `ftp://` ni ningún otro
  esquema.
- Timeout corto y límite de tamaño de descarga estrictos por request.
- Nunca seguir redirects a un dominio fuera de la lista blanca (o no
  seguir redirects en absoluto y tratar un 3xx como candidato inválido).
- Ejecutar la descarga desde un contexto de red tan restringido como sea
  posible (esto es una decisión de infraestructura para la fase de
  implementación, no de este documento — pero debe evaluarse entonces).

## Validación de MIME y tamaño

Reutiliza exactamente `PRODUCT_IMAGE_CONFIG` (`lib/product-image-config.ts`)
y `processProductImage` (`lib/product-image-processing.ts`) del pipeline ya
construido en 3B.3 — mismo límite de 10 MiB de entrada, mismos MIME
aceptados (`jpeg`/`png`/`webp`), mismo rechazo de SVG/GIF/HEIC, misma
decodificación real con `sharp` como prueba de firma. El asistente no
redefine ninguna de estas reglas: solo decide QUÉ buffer llega a esa
función, la función en sí no cambia.

## robots.txt / condiciones de uso

Antes de agregar un dominio a la lista blanca, revisión manual humana de
sus condiciones de uso para reutilización de imágenes de producto con
fines comerciales — este proyecto no debe intentar "interpretar"
automáticamente un `robots.txt` o un ToS como permiso legal. `robots.txt`
en todo caso solo gobierna crawlers automatizados, no sustituye una
revisión de licencia; se documenta la decisión (dominio, fecha, quién
revisó, nota) en el catálogo de dominios aprobados mismo.

## Rollback

Mismo mecanismo de reemplazo seguro de 3B.3
(`services/productImageService.ts`, `reemplazarImagenProducto`): subir
primero, actualizar la fila del producto, borrar la imagen anterior solo
al final. El asistente no necesita un rollback distinto — la aprobación de
un candidato termina siendo, para el resto del sistema, exactamente una
"subida" más.

## Cambios de esquema requeridos (para cuando se implemente, no ahora)

- Una tabla nueva de historial/cola (ej. `product_image_candidates`):
  producto, dominio fuente, `sourceUrl`, score, nivel, estado
  (pendiente/aprobado/rechazado/aplicado), fecha, quién decidió.
- Un catálogo de dominios aprobados/excluidos (tabla o config versionada
  en código — a decidir en la fase de implementación según qué tan seguido
  cambie).
- Opcionalmente, una columna en `productos` (o mejor, solo en la tabla de
  historial para no ensuciar `productos`) que registre el origen de la
  imagen actualmente activa (`manual` vs `image-assistant` + referencia al
  registro de historial).

Ninguno de estos cambios se crea en esta fase — quedan documentados aquí
para que la fase de implementación no tenga que re-descubrirlos.

## Pruebas (para cuando se implemente)

- Normalización/matching de texto: casos sintéticos, sin red.
- Score: función pura, tabla de casos (marca exacta/parcial, contenido
  compatible/incompatible, dominio alta/baja confiabilidad) → nivel
  esperado.
- Guardas SSRF: URLs con IP privada, con redirect fuera de dominio, con
  esquema no-https — todas deben rechazarse antes de cualquier `fetch`
  real (mockeado en tests, nunca red real).
- Deduplicación: mismo producto + mismo `sourceUrl` ya aprobado no debe
  volver a ofrecerse como candidato.
- Integración con el pipeline existente: una vez aprobado un candidato, el
  resto del flujo (descarga completa → `processProductImage` → Storage →
  DB) debe ser indistinguible, en las pruebas, de una subida manual ya
  cubierta por las pruebas de 3B.3 (`tests/lib/productImageProcessing.test.ts`,
  `tests/services/productImageService.test.ts`) — no se duplican esas
  pruebas, solo se confirma que el asistente llega a llamar las mismas
  funciones con los mismos contratos.

## Explícitamente fuera de alcance (de este diseño y de cualquier
implementación futura de esta fase)

- Eliminación de fondo, generación o edición de imágenes con IA.
- Scraping de buscadores genéricos de imágenes.
- Carga masiva sin revisión humana (incluso "alta confianza" queda
  registrada y es reversible, nunca es una caja negra silenciosa).
- Modificar fondos, agregar marcas de agua, o alterar el producto
  fotografiado de cualquier forma más allá de lo que ya hace
  `processProductImage` (recorte por proporción, conversión de formato).

## Criterio cerrado de clasificación y ejecución

Cada producto se clasifica, sin hardcodear el tamaño del conjunto observado,
en exactamente uno de estos estados: `AUTO_SEGURO`, `REQUIERE_REVISION`,
`YA_TIENE_IMAGEN`, `SIN_FUENTE_SEGURA`, `EXCLUIDO_QA` o `ERROR`.

`AUTO_SEGURO` exige producto activo y completo, SKU, coincidencia única y
exacta con el CSV, ausencia de imagen y de cualquier señal de auditoría,
fuente única aprobada y score mínimo 95/100. El score se desglosa en marca
exacta (25), nombre exacto (30), concentración exacta (20), contenido exacto
(10), fuente oficial o expresamente aprobada (10) e imagen inequívoca (5).
Una contradicción invalida el resultado aunque el total numérico alcance 95.

El lote se ejecuta desde el cliente administrativo, con un máximo de dos
productos simultáneos y una solicitud autenticada por producto. Debe poder
pausarse y reanudarse sin repetir completados. La idempotencia usa `productId`,
URL fuente normalizada, SHA-256 y estado final; una imagen existente nunca se
reemplaza automáticamente.

Antes de procesar el catálogo completo se exige dry-run y un canary visual de
cinco `AUTO_SEGURO`. Si uno falla, se detiene el lote y se revierte solo ese
producto. El asistente no inventa stock, precio, contenido, concentración ni
fuentes, y no modifica campos del producto distintos de los dos campos de
imagen mediante el pipeline seguro ya existente.
