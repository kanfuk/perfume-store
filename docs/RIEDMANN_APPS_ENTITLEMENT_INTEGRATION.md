# Integración con Riedmann Apps Control — Entitlement API (Fase 7A)

Rama `feature/riedmannapps-entitlement`, base `origin/main` @ `f80af26`
(Smellme.cl v2.2.1). Este documento es la referencia técnica completa de la
integración; no contiene secretos, tokens ni URLs reales.

## 1. Alcance de esta fase

Perfume Store consulta a **Riedmann Apps Control** (`POST
/api/v1/entitlements/check`, scope `ADMIN`) para decidir si el panel
`/admin` debe estar disponible. Alcance real: **ADMIN_ONLY**. El storefront
público (home, catálogo, búsqueda, carrito, pedido) **nunca** se ve afectado
por esta integración — estructuralmente: ningún archivo fuera de
`app/admin/` importa `lib/entitlements/` (verificado por test,
`tests/app/adminEntitlementGate.test.ts`).

No se creó ninguna migration de Supabase. No se comparte base de datos con
Riedmann Apps Control. No se movió ningún dato de Perfume Store hacia
Control.

## 2. Arquitectura

```
Browser
   │  (nunca conoce token, URL de Control, ni secrets)
   ▼
Perfume Store — SERVER (app/admin/layout.tsx)
   │  getAuthenticatedAdmin() ya resolvió que hay un admin autenticado
   ▼
lib/entitlements  (getAdminEntitlement)
   │  cache hit? → responde sin red
   │  cache miss/expirado → HTTPS POST
   ▼
Riedmann Apps Control — POST /api/v1/entitlements/check
```

El browser nunca habla con Control directamente. El `installation token` y
la URL de Control solo existen en variables de entorno server-only, leídas
exclusivamente por `lib/entitlements/config.ts` (nunca desde
`query`/`body`/`header`/`cookie` — protección SSRF, ver sección 9).

## 3. Estructura de módulos (`lib/entitlements/`)

| Archivo | Responsabilidad |
|---|---|
| `schema.ts` | Tipos + validador runtime manual del contrato (sin Zod, ver sección 4) |
| `config.ts` | Lectura de env vars server-only, validación de URL HTTPS |
| `client.ts` | Único punto que hace `fetch()` a Control (timeout, sin retries) |
| `mock.ts` | Fixtures de los 5 estados + modo mock por env var (dev/test) |
| `cache.ts` | Cache server-side en memoria, process-local |
| `policy.ts` | Motor de decisión: fail-open/fail-closed/stale, combina client+cache |
| `logging.ts` | Logging sanitizado (nunca token/Authorization) |
| `index.ts` | Único export público: `getAdminEntitlement()` |

Todos importan `server-only` (paquete oficial de Next.js/React): si algún
Client Component llegara a importar cualquiera de estos archivos, el build
falla explícitamente. Verificado por test
(`tests/lib/entitlements/security.test.ts`).

**Punto de entrada único**: solo `app/admin/layout.tsx` llama a
`getAdminEntitlement()`. Ninguna página ni route handler individual repite
el chequeo (sección 18 del encargo) — es el mismo patrón ya usado por
`app/admin/catalogo/layout.tsx` para el guard de Auth, aplicado aquí al
guard de entitlement en el layout raíz de `/admin`.

## 4. Por qué sin Zod

El repo no tenía ninguna dependencia de validación de schema (Zod/Yup/Ajv)
antes de esta fase. Se prefirió un validador manual (`parseEntitlementCheckResponse`,
`lib/entitlements/schema.ts`) — explícito, auditable, sin dependencia nueva —
para un contrato pequeño y estable (8 campos, sin anidamiento profundo). Es
"equivalente robusto" al espíritu de Zod: rechaza cualquier desviación del
contrato (campo faltante, tipo incorrecto, enum desconocido) devolviendo
`null`, nunca lanza, nunca confía parcialmente en un payload.

## 5. Variables de entorno

```
RIEDMANN_APPS_CONTROL_URL=
RIEDMANN_APPS_INSTALLATION_TOKEN=
RIEDMANN_APPS_MOCK_STATUS=      # solo dev/test, ver sección 8
```

Ninguna usa el prefijo `NEXT_PUBLIC_` (verificado por test). `.env.example`
ya las documenta con placeholders vacíos. Sigue el mismo patrón que
`lib/supabase/config.ts`: getters que `trim()` y retornan `undefined`/`null`
si falta o es inválida, nunca lanzan — el **llamador** decide la política.

`RIEDMANN_APPS_CONTROL_URL` debe ser HTTPS; una URL `http://` se rechaza
(protección contra downgrade).

## 6. Contrato de la API

**Request** (`lib/entitlements/client.ts`):
```
POST {RIEDMANN_APPS_CONTROL_URL}/api/v1/entitlements/check
Authorization: Bearer <installation-token>
Content-Type: application/json

{ "scope": "ADMIN", "appVersion": "2.2.1" }
```
No se envía `application_id`, `client_id`, `subscription_id`,
`billing_cycle_id`, email de admin ni datos de pago — la identidad de
Perfume Store proviene exclusivamente del token.

**Response** validado runtime contra el contrato exacto (ver `schema.ts`):
`decision` (ALLOW|DENY), `status` (ACTIVE|OVERDUE|GRACE_PERIOD|SUSPENDED|CANCELLED),
`scope` ("ADMIN"), `suspensionScope` (ADMIN_ONLY|WRITE_BLOCK|FULL_APP|null),
`checkedAt` (ISO), `recheckAfterSeconds` (number > 0), `notice` (objeto o `null`).

Límite defensivo: cuerpos de respuesta mayores a 8 KB se tratan como
malformados (el contrato es pequeño; sin sobre-ingeniería).

## 7. Semántica de decisión (Fase 7A)

| Respuesta | Resultado |
|---|---|
| 200 ACTIVE/OVERDUE/GRACE_PERIOD + ALLOW | Admin disponible |
| 200 SUSPENDED/CANCELLED + DENY | Admin bloqueado |
| 401 (token inválido/revocado) | **FAIL CLOSED** — admin bloqueado |
| 429/5xx/timeout/red/200 malformado | **FAIL OPEN transitorio** |
| Config faltante en Production | **FAIL CLOSED** (`configuration-error`, ver sección 8) |
| Config faltante en dev/test | FAIL OPEN (no bloquea trabajo local, ver sección 8) |

Perfume Store nunca recalcula billing: `decision` es el único campo
accionable para bloquear/permitir; `status`/`notice` son solo para UX
(banner de GRACE_PERIOD). Un `suspensionScope` distinto de `ADMIN_ONLY`
(`WRITE_BLOCK`/`FULL_APP`) se **parsea** correctamente pero, en Fase 7A,
**cualquier `DENY` del scope ADMIN bloquea igual el panel admin** — la
distinción entre esos tres valores solo importaría para decidir si además
se bloquea el storefront, algo explícitamente fuera de alcance de esta fase
(sección 28 del encargo: "no bloquear públicamente la tienda... sin diseño
de producto aprobado").

## 8. Config faltante — comportamiento distinto en dev/test vs. Production

**Fase 7A no crea un installation token real** (instrucción explícita del
encargo), pero el comportamiento ante config ausente **depende del
entorno de ejecución** (`NODE_ENV`, mismo criterio que usa Next.js/Vercel:
`production` en cualquier `next build`, incluidos los deploys de Preview):

- **Desarrollo/test (`NODE_ENV !== "production"`)**: **FAIL OPEN**. No
  bloquear el trabajo local ni los tests por no tener credenciales reales.
  Modo mock explícito disponible (`lib/entitlements/mock.ts`):
  `RIEDMANN_APPS_MOCK_STATUS=ACTIVE|OVERDUE|GRACE_PERIOD|SUSPENDED|CANCELLED`,
  gateado a `NODE_ENV !== "production"` como defensa en profundidad — nunca
  se activa en producción aunque la variable quede puesta por error.
- **Producción (`NODE_ENV === "production"`)**: **FAIL CLOSED**. Olvidar de
  provisionar `RIEDMANN_APPS_CONTROL_URL`/`RIEDMANN_APPS_INSTALLATION_TOKEN`
  en Vercel **nunca** debe traducirse en "control comercial bypassed" — el
  panel admin queda bloqueado hasta que se complete el provisioning. Esto es
  una corrección deliberada sobre el diseño original de esta fase (que
  fail-abría también en Production por temor a bloquear el primer deploy);
  el patch de seguridad prioriza no dejar el entitlement como una
  protección vestigial en producción sobre la comodidad de un rollout sin
  fricción.

**Categoría interna dedicada**: `configuration-error` — **nunca** se
etiqueta como `token-invalid` ni como una decisión autoritativa de Control
(`authoritative-deny`/`SUSPENDED`). Esto importa porque la UI
(`SuspendedAdminScreen`, variante `configuration-error`) muestra un mensaje
de *problema de configuración del servicio*, deliberadamente distinto del
mensaje de *suspensión comercial* — nunca se le atribuye a Control (ni se
inventa) una decisión que Control jamás tomó, porque nunca se le llegó a
consultar.

**Orden de evaluación (crítico)**: `evaluateAdminEntitlement()` revisa la
validez de la configuración **en cada llamada, antes de leer el cache**.
Una decisión `ALLOW` cacheada de un check anterior (config válida en ese
momento) **nunca** puede ocultar que, en la llamada siguiente, la
configuración de Production ya no está presente (ej. variables de entorno
removidas sin un redeploy completo). Verificado por test explícito
(`tests/lib/entitlements/policy.test.ts`, "cache con ALLOW autoritativo NO
oculta...").

**Nunca se confunde con un outage de Control**: `configuration-error` es
un problema de *configuración de Perfume Store* (nunca se llegó a
contactar a Control), mientras que 429/5xx/timeout/red son fallas de
*disponibilidad de Control* con integración ya configurada correctamente.
Solo esta segunda categoría es fail-open transitorio (sección 10).

| Escenario | Config configurada | Resultado |
|---|---|---|
| Falta URL o token, `NODE_ENV=production` | No | **FAIL CLOSED** (`configuration-error`) |
| Falta URL o token, `NODE_ENV≠production` | No | FAIL OPEN (`not-configured-fail-open`) o mock explícito |
| 401 (token inválido/revocado) | Sí | **FAIL CLOSED** (`token-invalid`) |
| 429/5xx/timeout/red/200 malformado | Sí | FAIL OPEN transitorio |
| 200 + body válido | Sí | Decisión autoritativa de Control |

La UX de `configuration-error` **nunca** muestra el nombre exacto de la
variable faltante, el token, la URL interna, ni ningún detalle técnico —
copy fijo: *"Acceso administrativo temporalmente no disponible" / "Existe
un problema de configuración del servicio. Contacta al administrador del
sistema."* El storefront público sigue completamente operativo (no
depende de esta configuración en ningún punto).

## 9. SSRF

`getEntitlementConfig()` no acepta ningún parámetro; lee exclusivamente
`process.env`. No existe ningún endpoint/route en `app/api/` que reenvíe una
URL arbitraria a Control (sin proxy genérico). Verificado por test.

## 10. Cache server-side

Cache **process-local, en memoria** (`lib/entitlements/cache.ts`), una
entrada por scope (`ADMIN`). Usa `recheckAfterSeconds` provisto por Control
como TTL. Nunca usa `localStorage`/`sessionStorage`/`IndexedDB` (son del
browser; esto es server-only). Nunca guarda el `installation token` dentro
de la entrada cacheada (verificado por test).

**Limitación documentada explícitamente** (sección 13 del encargo): si el
runtime de Vercel es serverless/edge, este cache:
- puede perderse entre cold starts;
- **no es distribuido** entre instancias concurrentes;
- **no garantiza coherencia** entre múltiples instancias (dos lambdas
  pueden tener decisiones cacheadas distintas por unos segundos).

No se finge una garantía que no existe. La interfaz (`getCachedEntitlement`/
`setCachedEntitlement`, keyed por scope) está deliberadamente separada de
`policy.ts` para poder reemplazar este `Map` en memoria por un cache
distribuido (Redis/Upstash/Vercel KV) más adelante sin tocar la lógica de
decisión.

### Política de decisiones "stale" (ver `lib/entitlements/policy.ts`)

Ante un fallo transitorio (429/5xx/timeout/red/200 malformado):

1. Si existe una decisión autoritativa cacheada (de cualquier antigüedad,
   siempre que exista): **se reusa tal cual**. Un `ALLOW` real se mantiene
   `ALLOW`; un `DENY` real **se mantiene `DENY`** — un `DENY` autoritativo
   nunca se convierte en `ALLOW` solo porque Control está temporalmente
   inalcanzable (evita que un bloqueo real quede sin efecto por una caída de
   red del lado de Control).
2. Si no existe ninguna decisión previa útil: **fail-open temporal**
   (permitir admin), cacheado brevemente (30s) para no reintentar Control en
   cada request mientras dura la falla (evita retry storms, sección 17).

Nunca se interpreta un `503`/timeout como `SUSPENDED`/`DENY` (verificado por
test, `dependency-error` jamás produce un `blocked:true` nuevo).

## 11. Reactivación (sin redeploy)

1. Control responde `SUSPENDED`/`DENY` → admin bloqueado, decisión cacheada.
2. OWNER registra el pago en Control.
3. Control pasa a `ACTIVE`/`ALLOW`.
4. Una vez vencido el TTL (`recheckAfterSeconds`) del cache local, el
   siguiente request a `/admin` dispara un check fresco.
5. El admin recupera acceso **sin redeploy, sin reinicio, sin cambio de
   env, sin login nuevo** — porque el TTL siempre fuerza una revalidación
   real independientemente de si la última decisión cacheada era `ALLOW` o
   `DENY` (no existe una regla especial que "castigue" más tiempo a un
   `DENY" cacheado).

Cubierto por test (`tests/lib/entitlements/policy.test.ts`, caso
"reactivacion").

## 12. Timeout y retries

Timeout centralizado en `lib/entitlements/config.ts`: **3000ms**, vía
`AbortController`. Sin reintentos (0 retries): para requests interactivos,
la opción más simple es no reintentar — evita retry storms (sección 17) sin
justificación clara para agregar 1 retry en esta fase.

## 13. UX por estado

- **ACTIVE**: admin normal, sin banner, sin ruido visual.
- **OVERDUE**: admin operativo, sin bloqueo, sin banner (salvo que Control
  envíe un `notice` explícito — nunca se inventa uno).
- **GRACE_PERIOD**: admin operativo + banner discreto
  (`components/admin/EntitlementNotice.tsx`) con el `notice` validado que
  envía Control, renderizado como **texto plano** (nunca `innerHTML`/
  `dangerouslySetInnerHTML`). No depende solo del color (icono + texto).
- **SUSPENDED/CANCELLED (DENY) o token inválido (401)**: pantalla
  profesional (`components/admin/SuspendedAdminScreen.tsx`, variante
  `"suspended"`) con copy fijo. **Nunca** muestra monto de deuda,
  referencias de pago, IDs de cliente/suscripción, tokens ni email del
  OWNER. No cierra sesión, no toca cookies ni Supabase Auth — el admin
  recupera acceso automáticamente en el siguiente check exitoso (sección
  11).
- **Config ausente en Production** (`configuration-error`): mismo
  componente, variante `"configuration-error"` — copy distinto y
  deliberadamente genérico ("Acceso administrativo temporalmente no
  disponible" / "Existe un problema de configuración del servicio.
  Contacta al administrador del sistema."), para no hacer pasar un
  problema de configuración de Perfume Store por una suspensión comercial
  de Control. Nunca expone el nombre de la variable de entorno faltante.

## 14. Interacción con Auth existente

El entitlement **nunca reemplaza** la autorización propia de Perfume Store.
Flujo: `Supabase Auth válido → rol admin válido (getAuthenticatedAdmin) →
entitlement check → ALLOW/DENY`. El gate en `app/admin/layout.tsx` solo
invoca `getAdminEntitlement()` **si ya hay un admin autenticado**; un
visitante sin sesión (incluida la propia página `/admin/login`) nunca
dispara una llamada a Control.

## 15. Logging

Sin logger centralizado preexistente en el repo (auditado explícitamente
antes de esta fase). `lib/entitlements/logging.ts` es un `console.info`
sanitizado: solo campos seguros (`decision`, `reason` interno, `latencyMs`).
Nunca recibe el header `Authorization`, el token, ni el body crudo de
Control — verificado por test con un token real inyectado deliberadamente
en un objeto adversarial.

## 16. Provisioning futuro (fuera de alcance de Fase 7A)

- Crear el installation token real en Riedmann Apps Control y configurarlo
  en Vercel (`RIEDMANN_APPS_CONTROL_URL`, `RIEDMANN_APPS_INSTALLATION_TOKEN`)
  — explícitamente **no** se hizo en esta fase.
- Decidir si `WRITE_BLOCK`/`FULL_APP` deben afectar al storefront público
  (requiere diseño de producto aprobado, sección 28).
- Evaluar cache distribuido (Redis/Upstash/Vercel KV) si la coherencia
  entre instancias serverless se vuelve un problema real en producción.
- E2E real contra un navegador: el repo no tiene infraestructura Playwright
  hoy: se cubrió el mismo flujo mediante tests de integración que invocan el
  Server Component real de `app/admin/layout.tsx` (sin renderer DOM, dado que
  el repo tampoco tiene `@testing-library/react`).

## 17. QA técnico (resumen, ver reporte final para el detalle completo)

`npm run lint`, `npm run typecheck`, `npm run test:run`, `npm run build`,
`git diff --check`, `npm audit --audit-level=high` — ejecutados y
reportados en el cierre de esta fase.
