# Auditoría técnica de la base heredada (Fase 0)

- Fecha de auditoría: 2026-07-23
- Repositorio auditado: `D:\DESARROLLO SOFTWARE\perfume-store`
- Rama auditada: `feature/perfume-store-foundation`
- Repositorio destino: `https://github.com/kanfuk/perfume-store.git`
- Origen del código: Pauli Store (`https://github.com/kanfuk/pauli-store.git`), commit `65fc175`
- Commit de documentación de procedencia: `e57580b`
- Tag de rescate: `perfume-store-baseline-v0.1.0`
- Alcance de esta fase: **solo inspección, análisis y documentación**. No se modificó código, pruebas, migraciones, `package.json` ni variables de entorno. No se ejecutó `npm install` ni ningún comando de Supabase/Vercel.

## Resumen ejecutivo

La base heredada de Pauli Store es un proyecto Next.js (App Router) + TypeScript + Supabase con una separación de capas clara (`domain` / `repositories` / `services` / `app` / `components` / `lib`) y una suite de pruebas que pasa en verde. Es una base técnica sólida para reutilizar como punto de partida de la tienda de perfumes, pero **el dominio, el esquema de datos y buena parte de la UI/admin están modelados específicamente para una repostería casera** (dobladitas, quequitos, "fiado" informal, "lugar de trabajo" como dato del cliente) y no para un catálogo de +100 perfumes con envío pagado, RUT/dirección y transferencia verificada.

Se detectó un hallazgo crítico que debe resolverse **antes** de vincular el nuevo proyecto Supabase: `supabase/schema.sql` ya no contiene las sentencias `CREATE TABLE` originales de las tablas base (`clientes`, `productos`, `pedidos`, `pedido_items`, `pagos`, `fiados`, `usuarios_admin`). Ese archivo fue sobrescrito accidentalmente en el historial de Pauli Store y hoy mezcla contenido de un documento markdown no relacionado con el SQL real. Ver sección 5.2.

Baseline verificado en esta auditoría (mismos resultados que el baseline ya validado):

| Verificación | Resultado |
|---|---|
| `npm run lint` | OK, sin errores ni warnings |
| `npm run typecheck` | OK, sin errores |
| `npm run test:run` | OK, 45/45 pruebas (8 archivos) |
| `npm run build` | OK, build de producción completo (26 rutas) |
| `git status` | Working tree limpio (solo `.vscode/` sin trackear, no se tocó) |

## 1. Verificación de Git

```text
Rama actual:        feature/perfume-store-foundation (up to date con origin)
origin:              https://github.com/kanfuk/perfume-store.git (fetch/push)
pauli-source:        fetch -> https://github.com/kanfuk/pauli-store.git
                     push  -> https://example.invalid/DO-NOT-PUSH (bloqueado intencionalmente)
Tag de rescate:      perfume-store-baseline-v0.1.0 (presente)

Últimos commits:
e57580b docs: record Pauli Store source baseline
65fc175 feat(products): agregar imagen de quequito de limón
e33a22f merge: add secure customer editing
b4aafd9 feat(admin): enable safe customer editing
f7babc1 fix: link promotional footer to Riedmann Apps
```

Todo coincide con el estado confirmado en el brief de esta fase. El push hacia `pauli-source` está correctamente bloqueado (remote apunta a `https://example.invalid/DO-NOT-PUSH`), por lo que no hay riesgo de escribir accidentalmente en el repositorio original.

## 2. Arquitectura heredada

```text
app/            rutas UI (cliente y /admin) y endpoints HTTP (/api)
components/     vistas cliente, admin y UI compartida
services/       reglas de negocio y coordinación de flujos (PedidoService, ProductoService, ...)
repositories/   acceso a datos: cada repositorio tiene una implementación Mock/Memory (local, sin Supabase)
                y una implementación Supabase, seleccionadas en runtime por getXRepository()
lib/            helpers transversales: validadores, stock, seguridad HTTP, teléfono chileno,
                identidad de clientes, PWA/push, WhatsApp, Supabase clients
domain/         entidades de negocio con validación propia (POO clásico, sin framework)
supabase/       schema, seed y migraciones incrementales
```

Patrón destacable y reutilizable: **cada repositorio (`productRepository`, `pedidoRepository`, `clienteRepository`) decide en runtime si usa una implementación en memoria (`localStore`) o Supabase**, según `isSupabaseConfigured()` (`lib/env.ts`, que revisa `NEXT_PUBLIC_SUPABASE_URL` y la clave pública). Esto permite que `lint`, `typecheck`, `test` y `build` pasen hoy sin ninguna credencial de Supabase configurada — es la razón por la que el baseline puede validarse en esta fase sin conectar nada.

Deuda técnica ya documentada por el propio equipo en `docs/ARCHITECTURE.md` y confirmada por conteo de líneas:

| Archivo | Líneas | Nota |
|---|---|---|
| `components/admin/AdminDashboard.tsx` | 4851 | Mayor punto de complejidad; mezcla dashboard, pedidos, stock, reportes, badges, push |
| `components/admin/AdminDirectSale.tsx` | 1428 | Mezcla formulario, validación y llamadas a servicio |
| `components/OrderForm.tsx` | 1257 | Formulario público de pedido, mezcla UI y lógica |
| `services/pedidoService.ts` | 941 | Concentra creación de pedidos, venta directa, pedido personalizado, fiados, agenda |
| `repositories/pedidoRepository.ts` | 831 | Doble implementación (memoria + Supabase) con fallback por columnas faltantes |

Esto es información útil para el MVP de perfumería: si se reutiliza esta base, `AdminDashboard.tsx` en particular necesitará dividirse antes de agregar Top 10, ofertas semanales, CSV masivo y filtros de catálogo — agregar funcionalidad nueva sobre un archivo de ~4900 líneas es alto riesgo.

## 3. Modelo de dominio actual

Entidades en `domain/` (TypeScript, con validación en el constructor y métodos de transición de estado):

- **`Producto`**: `id, nombre, descripcion, precioVenta, imageUrl, badgeLabel, costoUnitario, stockActual, stockAgenda, activo, tipoProducto`. No tiene marca, categoría, notas olfativas, volumen/ml, ni concepto de "destacado"/Top 10.
- **`Cliente`**: `id, nombre, telefono, lugarTrabajo (obligatorio), createdAt`. **No existe** RUT, correo, región, comuna ni dirección — campos explícitamente requeridos por el negocio de perfumes. `lugarTrabajo` es un campo propio del contexto de venta informal de Pauli (para ubicar la entrega en un lugar de trabajo), sin equivalente directo en el nuevo negocio.
- **`Pedido`**: máquina de estados `PENDIENTE -> AGENDADO -> FINALIZADO` o `CANCELADO`, con `estadoPago` en `SIN_PAGO | PAGADO | FIADO`. No modela reserva de stock con expiración explícita en el dominio (existe `estaExpirado()` basado en `HORAS_EXPIRACION_PEDIDO`), ni tipo de despacho (Starken vs domicilio), ni costo de envío.
- **`DetallePedido`**: línea de pedido con `producto, cantidad, precioUnitario, subtotal`.
- **`Venta`**: resumen de utilidad (`totalVenta - totalCosto`) derivado de un `Pedido` finalizado.
- **`CuentaFiado`**: cuenta por cobrar informal ligada a un pedido "fiado". El concepto de "fiado" (crédito informal, cobro por WhatsApp) es distinto de "transferencia bancaria verificada manualmente" que pide el nuevo negocio; son flujos de pago diferentes aunque ambos son manuales.

`lib/stock.ts` ya centraliza reglas de stock unificado (`stockActual`/`stockAgenda`) con auto-pausa en 0 y una función `canSellWithoutBreakingStock` que es la base directa para "prevención de sobreventa". Es reutilizable casi tal cual para reserva de stock de perfumes.

## 4. Persistencia y esquema de base de datos

### 4.1 Tablas documentadas en el código y en `docs/07_MODELO_DATOS.md`

`clientes`, `productos`, `pedidos`, `pedido_items`, `pagos`, `fiados`, y (agregadas después de ese doc, visibles solo en `supabase/schema.sql` y migraciones) `usuarios_admin`, `operaciones_admin_log`, `archivo_clientes`, `archivo_pedidos`, `archivo_pedido_items`, `archivo_pagos`, `archivo_fiados`, `user_device_badge_settings`, `admin_push_subscriptions`.

### 4.2 Hallazgo crítico: `supabase/schema.sql` no contiene las tablas base

**Estado actual:** `supabase/schema.sql` tiene 1055 líneas. Las líneas 1 a ~393 son el texto de un documento markdown no relacionado ("PAULI STORE - CORREGIR MENSAJE DE WHATSAPP CON LINK DE LA APP"), y el archivo continúa luego con fragmentos de SQL (constraints, triggers, políticas RLS, funciones de cierre mensual) que **asumen que las tablas ya existen**, pero **no incluyen ninguna sentencia `create table` para `clientes`, `productos`, `pedidos`, `pedido_items`, `pagos`, `fiados` ni `usuarios_admin`**, ni el `create extension if not exists pgcrypto;` inicial.

**Confirmación con historial de Git:**

- El commit inicial `72c4e5d` ("Initial Pauli Store implementation") tenía un `supabase/schema.sql` correcto de 218 líneas, con las 7 sentencias `create table` completas, constraints, triggers `set_updated_at` y políticas RLS iniciales.
- El commit `2b3ce249` ("Implementa pasada final de pedidos, costos y admin", 2026-06-24) sobrescribió el inicio del archivo con el contenido del documento de WhatsApp, destruyendo las sentencias `create table` originales. El resto del archivo (constraints, triggers, políticas, y adiciones posteriores como las tablas de archivo/push) se mantuvo y se siguió extendiendo sobre esa base ya corrupta.
- El problema **no fue introducido por la copia a `perfume-store`**: ya estaba presente en Pauli Store desde ese commit y se heredó tal cual (`git log --follow` lo confirma).

**Impacto:** hoy no existe en el repositorio un `schema.sql` ejecutable de punta a punta contra una base nueva. Si se ejecutara tal cual en un proyecto Supabase vacío, fallaría de inmediato (los `alter table clientes ...` y las políticas RLS referencian tablas inexistentes), y las primeras ~393 líneas ni siquiera son SQL válido.

**Mitigación disponible:** la definición original de las 7 tablas base sigue recuperable:

1. Vía Git: `git show 72c4e5d:supabase/schema.sql` devuelve el schema original completo y correcto (sin las columnas agregadas después, como `image_url`, `badge_label`, `stock_agenda`, `origen_pedido`, `admin_seen`, etc.).
2. Vía documentación: `docs/07_MODELO_DATOS.md` documenta manualmente las columnas de `clientes`, `productos`, `pedidos`, `pedido_items`, `pagos` y `fiados` **incluyendo las columnas agregadas después** (aunque tampoco cubre `usuarios_admin` ni las tablas de push/badge/archivo, que solo existen como código SQL disperso en `schema.sql` y en las migraciones).
3. Vía migraciones incrementales (sección 4.3): varias migraciones hacen `alter table` asumiendo columnas ya creadas, lo que permite inferir el esquema completo cruzando todas las fuentes.

Ninguna fuente por sí sola es hoy un "source of truth" completo y ejecutable. Reconstruir un `schema.sql` limpio (uniendo el original de `72c4e5d`, las columnas agregadas por las migraciones, y las tablas nuevas de `usuarios_admin`/push/badge/archivo) es trabajo pendiente para antes de vincular el proyecto Supabase nuevo — no se realizó en esta fase porque implicaría modificar un archivo fuera del alcance permitido (`docs/PERFUME_STORE_FOUNDATION_AUDIT.md` es el único archivo autorizado).

### 4.3 Migraciones incrementales (`supabase/migrations/`)

9 archivos, todos con `alter table` / `create table` idempotentes (`if not exists`, `do $$ ... end $$`). Ninguna migración crea las tablas base: todas asumen que ya existen (consistente con que originalmente se creaban desde `schema.sql`). Una migración está vacía (`20260618002120_nombre-del-cambio.sql`, 0 líneas), aparentemente un placeholder sin contenido.

Las migraciones documentan bien la evolución real del negocio de Pauli: `origen_pedido` (público/admin directo/personalizado), `admin_seen`/`admin_seen_at` (badge de pedidos nuevos), `merge_duplicate_customers` (unificación de clientes duplicados — lógica de negocio ya no trivial, ver `lib/customers/identity.ts`), badges PWA y push admin.

### 4.4 RLS (Row Level Security)

Las políticas visibles en `schema.sql` (a partir de la línea 456, después del contenido corrupto) siguen un patrón consistente y razonable:

- Lectura pública solo de `productos` con `activo = true`.
- Inserción pública solo en `pedidos` (forzando `estado_pedido = 'PENDIENTE'`, `estado_pago = 'SIN_PAGO'`, `total >= 0`) y en `pedido_items` (`cantidad >= 1`, `subtotal >= 0`).
- **No hay política pública de inserción para `clientes`** (comentario explícito en el código: los inserts de clientes se hacen desde el servidor con `service role`/clave privilegiada, no desde el cliente).
- Todo lo administrativo (`productos` completo, `clientes` en lectura, `pedidos` completo, `pagos`, `fiados`, tablas de archivo, badge/push) requiere `authenticated` + existencia en `usuarios_admin` con `activo = true`.
- Las funciones `admin_cerrar_mes_operativo` y `admin_limpiar_datos_prueba` son `security definer`, archivan datos en tablas `archivo_*` y luego **borran** `fiados`, `pagos`, `pedido_items`, `pedidos`, `clientes`. Son funciones destructivas por diseño (cierre mensual / limpieza pre-lanzamiento), correctamente protegidas por RLS de solo lectura en `operaciones_admin_log` y las tablas `archivo_*`, pero conviene tenerlas presentes como algo que **no se debe invocar** contra el proyecto Supabase nuevo sin entender bien su alcance.

Como ya señala `docs/SECURITY.md`, queda pendiente (no se hizo en esta fase, es trabajo de una fase posterior) revisar tabla por tabla estas políticas contra el proyecto Supabase real de `perfume-store` una vez reconstruido el schema.

## 5. Seguridad

- **Headers HTTP** (`next.config.ts`): CSP, HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Cross-Origin-Opener-Policy`, `Permissions-Policy` restrictivo. La CSP todavía usa `'unsafe-inline' 'unsafe-eval'` en `script-src` (ya señalado como pendiente en el propio README: "endurecer CSP con nonce... antes de quitar unsafe-inline y unsafe-eval").
- **Middleware/proxy** (`proxy.ts`): refresca la sesión de Supabase Auth en rutas `/admin/:path*` y `/api/admin/:path*` (excepto `/admin/login`). Si Supabase no está configurado, deja pasar la request sin auth — coherente con el modo local/mock, pero implica que **hoy no hay protección real de `/admin/*` sin Supabase conectado** (algo esperable en Fase 0, ya que no se debe conectar Supabase todavía).
- **Auth admin** (`lib/admin-auth.ts`): valida sesión de Supabase Auth y además exige que el email exista en `usuarios_admin` con `activo = true` — doble control (autenticación + lista blanca), consistente con la RLS.
- **Validación de origen** (`lib/http-security.ts`): compara `Origin`/`Referer` contra el origin de la request en endpoints sensibles, y valida `Content-Type: application/json`. Es una defensa razonable tipo anti-CSRF para una API sin tokens CSRF dedicados.
- **Rate limiting** (`lib/rate-limit.ts`): implementación en memoria (`Map` de buckets por clave), simple y **no distribuida** — se resetea si el proceso se reinicia y no funciona entre múltiples instancias serverless. Suficiente para el volumen actual de Pauli Store, pero es una limitación real a tener en cuenta si Vercel escala a múltiples instancias; ya está listado como pendiente en `README.md`.
- **Backend recalcula totales**: confirmado en `PedidoService` — el total del pedido se calcula siempre desde `DetallePedido.subtotal` en el servidor, nunca se confía en un total enviado por el cliente.

### 5.1 Variables de entorno (solo nombres, sin valores — no se leyeron valores reales)

De `.env.example`:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_SECRET_KEY
NEXT_PUBLIC_VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT
HORAS_EXPIRACION_PEDIDO
WHATSAPP_MODE
WHATSAPP_PROVIDER
WHATSAPP_API_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_BUSINESS_ACCOUNT_ID
NEXT_PUBLIC_RIEDMANNS_WHATSAPP_NUMBER
```

No se abrió ni se inspeccionó ningún `.env`/`.env.local` real; solo se leyó `.env.example`, que no contiene valores. `package.json` referencia además `supabase:link --project-ref uqqdkbguhhzdmjjvrawc`: **ese project-ref pertenece al proyecto Supabase de Pauli Store**, no al nuevo `perfume-store`. Si en una fase posterior se ejecuta `npm run supabase:link` sin editar ese script primero, se enlazaría por error al proyecto equivocado. Queda como nota para cuando se aborde la vinculación real (fuera del alcance de esta fase).

## 6. Documentación heredada (`docs/`)

45 archivos en `docs/`. Incluye documentación de referencia reutilizable (`ARCHITECTURE.md`, `SECURITY.md`, `ENVIRONMENT.md`, `TESTING.md`, `DEPLOYMENT.md`, `07_MODELO_DATOS.md`, `10_SEGURIDAD_HEADERS_RLS.md`) y un volumen considerable de reportes de estado fechados y prompts puntuales para Codex ya cerrados (`26_...` a `43_...`, `PROMPT_CODEX_INTEGRAR_ICONOS.md`), específicos del ciclo de vida de Pauli Store (dobladitas, badges PWA, WhatsApp auto-agenda). Son útiles como referencia histórica de decisiones, pero no deberían tratarse como documentación vigente del nuevo proyecto sin curarlos.

## 7. Evaluación de reutilización frente a los requerimientos de la tienda de perfumes

| Requerimiento del MVP de perfumería | Estado en la base heredada |
|---|---|
| Catálogo +100 productos, buscador, filtros, carga paginada | Repositorio de productos y servicio existen, pero sin buscador, filtros ni paginación — hoy se listan todos los productos activos de una vez. Base reutilizable, funcionalidad de descubrimiento a construir. |
| Top 10 / ofertas de la semana | No existe el concepto en `Producto` ni en el schema (no hay campo tipo `destacado`, `en_oferta`, ranking). A diseñar desde cero. |
| Carrito con varios productos | `DetallePedido[]` y el flujo de `OrderForm.tsx` ya soportan carritos multi-ítem. Reutilizable. |
| Nombre completo, RUT, correo, teléfono, región, comuna, dirección | `Cliente` solo tiene `nombre`, `telefono`, `lugarTrabajo`. Faltan RUT, correo, región, comuna, dirección. Requiere extender entidad, validadores y schema. |
| Starken por pagar / despacho semanal a domicilio $4.000 | No existe modelo de método de despacho ni costo de envío en `Pedido`. A diseñar desde cero (nuevo campo de tipo de entrega + costo). |
| Transferencia bancaria verificada manualmente | Existe un patrón análogo con `estadoPago` y verificación manual por admin (`marcarPedidoPagado`), reutilizable como base de flujo, pero el estado actual (`SIN_PAGO/PAGADO/FIADO`) está pensado para "fiado" informal, no para "transferencia pendiente de verificación". Requiere ajuste de estados. |
| Atención por WhatsApp | Módulo `lib/whatsapp/*` maduro (builders de mensajes, deep links, providers manual/API). Altamente reutilizable. |
| Reserva de stock / prevención de sobreventa | `lib/stock.ts` (`getAvailableProductStock`, `canSellWithoutBreakingStock`, auto-pausa en 0) ya implementa esta lógica de forma genérica. Reutilizable casi tal cual. |
| Carga masiva desde CSV | No existe ningún importador CSV en el código actual. A construir desde cero. |
| Edición rápida de precios y stock | Existe en `/admin/stock` y `ProductoService` (`actualizarProductoAdmin`, `cambiarEstadoProducto`). Patrón reutilizable, UI a adaptar. |
| Dirección visual "lujo contemporáneo" (carbón/dorado/marfil) | Branding actual (`components/RiedmannsBranding.tsx`, `public/brand/pauli-store-logo-*`, paleta en `tailwind.config.ts`) es 100% de Pauli Store. Todo el theming/branding se reemplaza; la estructura de componentes (`ProductCard`, `ProductCatalog`, `CartSummary`) es reutilizable como esqueleto. |

## 8. Riesgos y bloqueadores identificados para próximas fases

1. **Bloqueador de datos:** `supabase/schema.sql` no es ejecutable hoy (sección 4.2). Antes de `supabase link`/`db push` contra el proyecto `perfume-store`, hace falta reconstruir un schema base válido.
2. **Riesgo de vinculación cruzada:** `package.json` tiene `supabase:link` apuntando al `project-ref` de Pauli Store (`uqqdkbguhhzdmjjvrawc`). Debe actualizarse antes de vincular, en una fase donde sí se autorice tocar `package.json`.
3. **Modelo de cliente insuficiente:** faltan RUT, correo, región, comuna y dirección — campos obligatorios del nuevo negocio, no opcionales.
4. **Sin concepto de envío/despacho** en el dominio `Pedido` ni en el schema.
5. **Deuda de tamaño de archivo:** `AdminDashboard.tsx` (4851 líneas) concentra demasiada lógica para extenderlo de forma segura con Top 10, ofertas, CSV masivo y filtros sin antes dividirlo por dominios, como ya recomienda `docs/ARCHITECTURE.md`.
6. **CSP con `unsafe-inline`/`unsafe-eval`** todavía activa; pendiente ya reconocido por el propio equipo de Pauli Store.
7. **Rate limiting en memoria**, no apto para múltiples instancias serverless si el tráfico crece.
8. **Volumen de documentación histórica** (45 archivos, muchos fechados y específicos de Pauli Store) que puede confundir a quien retome el proyecto si no se distingue de la documentación vigente.

## 9. Conclusión

La base heredada es una buena cimentación técnica (capas limpias, dominio validado, pruebas verdes, seguridad razonable) pero **no** un catálogo de datos ni un dominio de negocio listo para perfumería: fue construido para una repostería casera con lógica de "fiado" y "lugar de trabajo" en vez de RUT/dirección/envío pagado. El hallazgo más importante de esta auditoría es que el archivo de esquema SQL heredado está incompleto/corrupto desde antes de la copia a este repositorio, lo cual debe resolverse explícitamente — no asumirse resuelto — antes de vincular el nuevo proyecto Supabase en una fase posterior.

Ningún archivo de código, configuración, prueba o migración fue modificado durante esta auditoría. El único archivo creado es este documento.
