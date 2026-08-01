# Smellme.cl — Asistente seguro de imágenes

Fecha de validación: 2026-07-31. Rama: `feature/image-source-reconciliation`.

## Estado seguro

`/admin/catalogo/imagenes` mantiene el análisis visible, pero separa configuración, búsqueda y carga con gates explícitos. No se infiere ningún permiso desde la existencia de una API key.

Estados definitivos: `AUTO_SEGURO`, `REQUIERE_REVISION`, `YA_TIENE_IMAGEN`, `SIN_FUENTE_SEGURA`, `PROVEEDOR_NO_CONFIGURADO`, `EXCLUIDO_QA` y `ERROR`. Si la búsqueda no está operativa, una identidad conciliada queda como `PROVEEDOR_NO_CONFIGURADO`. Como no existe un estado adicional “pendiente” en el contrato cerrado, ese mismo estado conservador se mantiene con razón `BUSQUEDA_PENDIENTE` cuando el proveedor ya está listo pero el dry-run aún no se ejecuta. `SIN_FUENTE_SEGURA` sólo se asigna después de una búsqueda real sin candidato seguro.

El corte auditado tiene 106 productos: 39 en revisión, 4 con imagen y 2 QA. Los otros 61 quedan como `PROVEEDOR_NO_CONFIGURADO` en la configuración segura por defecto. La explicación caso por caso está en [SMELLME_IMAGE_REVIEW_RECONCILIATION.md](./SMELLME_IMAGE_REVIEW_RECONCILIATION.md).

## Proveedor Brave

`ImageSearchProvider` desacopla `isConfigured`, `searchImages`, `normalizeResult` y `healthCheck`. El primer adaptador es `BraveImageSearchProvider`, que usa por servidor `GET https://api.search.brave.com/res/v1/images/search` con `X-Subscription-Token`.

Las consultas combinan marca, nombre, concentración, contenido y términos de producto; agregan `site:dominio` sólo para dominios aprobados. Se conservan únicamente página fuente, URL original de imagen, thumbnail, título, dominio y dimensiones. El adaptador limita resultados, usa `AbortController`, timeout, máximo un reintento para timeout/429/5xx y errores sanitizados. No registra headers, claves ni el payload completo.

## Configuración y gates

Variables exclusivamente de servidor:

```dotenv
BRAVE_SEARCH_API_KEY=
IMAGE_ASSISTANT_SIGNING_SECRET=
IMAGE_ASSISTANT_ALLOWED_DOMAINS=
IMAGE_ASSISTANT_SEARCH_ENABLED=false
IMAGE_ASSISTANT_BATCH_ENABLED=false
```

- `SEARCH_ENABLED=false`: análisis disponible; búsqueda bloqueada.
- Búsqueda habilitada y batch deshabilitado: dry-run y revisión de candidatos disponibles; canary/lote bloqueados.
- `BATCH_ENABLED=true`: sigue sujeto a reconciliación aprobada y confirmación manual.

El health check autenticado devuelve sólo cinco booleanos: proveedor, firma, allowlist, búsqueda y batch. Nunca devuelve valores.

## Allowlist y descarga

`config/image-source-domains.ts` no confía en dominios por defecto. La allowlist de servidor acepta hosts exactos separados por coma, rechaza wildcards y respeta entradas versionadas deshabilitadas. No habilita subdominios implícitos.

El pipeline existente valida HTTPS, DNS público, redirects, tamaño, MIME, magic bytes y decodificación antes de cualquier uso. Mantiene protección SSRF, firma HMAC, SHA-256, escritura condicional e imposibilidad de reemplazar una imagen existente.

## Dry-run

El dry-run sólo analiza y busca con concurrencia máxima de dos. Excluye imágenes existentes, QA y revisión. No descarga imágenes completas, no llama Storage, no modifica DB y no activa batch. Su salida contiene estado, score, dominio, razones, contradicciones, cantidad de candidatos y candidato recomendado, en JSON y CSV. `data/private-output/` está ignorado por Git.

En este cierre no había configuración operativa completa disponible para ejecutar búsquedas reales. Por ello: dry-run de búsqueda no ejecutado, candidatos reales 0, imágenes descargadas 0, imágenes subidas 0 y productos modificados 0.

## Operación manual pendiente

Configurar las cinco variables en `.env.local` y en Vercel Project Settings → Environment Variables, aprobar dominios y mantener `IMAGE_ASSISTANT_BATCH_ENABLED=false`. Después se puede ejecutar el dry-run, revisar resultados y decidir en una fase posterior si se aprueba un canary. Esta fase no despliega producción.
