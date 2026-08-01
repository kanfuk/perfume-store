# Smellme.cl v2.0.0

Aplicacion web responsive para una tienda de perfumes, testers y fragancias exclusivas, con flujo publico de pedidos y panel admin conectado a Supabase.

Versión actual: `2.0.0`

## Estado actual

Hoy el proyecto ya incluye:

- flujos móviles de WhatsApp separados de las mutaciones y sin pestañas preliminares
- botón “Compartir mi tiendita” con enlace dinámico al home del entorno actual
- estado inicial comercial vacío, listo para cargar el catálogo real
- reinicio total protegido que conserva Auth, administración y configuración
- centro privado de mantenimiento con vistas previas, respaldo e idempotencia
- clasificación conservadora de QA, reinicio de catálogo y huérfanos de Storage
- carga manual de imágenes WebP; la búsqueda externa quedó fuera del MVP V2
- dependencias productivas corregidas: Next.js 16.2.12, Sharp 0.35.3 y PostCSS 8.5.25
- `npm audit --production` sin vulnerabilidades conocidas al cierre de la versión

- Next.js + TypeScript + Tailwind CSS
- flujo cliente publico para registrar pedidos
- carrito mobile-first con resumen flotante y hoja inferior
- validacion de celular chileno
- guardado local de clientes frecuentes en el dispositivo
- modal de confirmacion al agendar pedido
- panel admin con login real usando Supabase Auth
- branding visible de Smellme.cl en cliente y admin
- CTA corporativo de Riedmann Apps enlazado a `https://riedmannapps.com`
- venta directa y pedido personalizado desde admin
- seleccion de clientes existentes en venta directa y pedido personalizado
- edicion segura de clientes desde `/admin/clientes`
- stock unificado visible en admin, sincronizado con `stock_actual` y `stock_agenda`
- filtros de stock simplificados a `Activos`, `Pausados` y `Todos`
- autopausa de productos cuando el stock llega a `0`
- agrupacion de fiados por cliente con cobro consolidado por WhatsApp
- contador de pedidos por atender ajustado al estado real de atencion admin
- badge PWA/iPhone con activacion por dispositivo y chip compacto en el header admin
- Web Push admin con `service worker`, suscripciones por dispositivo y prueba manual desde el panel
- agendamiento admin robustecido para que WhatsApp no congele la app y deje fallback manual
- unificacion segura de clientes duplicados y sugerencias para evitar nuevos duplicados
- reportes sin card de `Ticket promedio`
- control adicional contra tabla `usuarios_admin`
- repositorios y servicios con reglas de negocio
- seguridad base en headers, CSP compatible, RLS y validaciones servidor
- pruebas automatizadas con Vitest
- favicon pack completo para navegador, iOS y Android

## Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- Supabase
- Vitest

## Scripts

```bash
npm install
npm run dev
```

Scripts disponibles:

```bash
npm run build
npm run lint
npm run typecheck
npm run test:run
```

## Variables de entorno

Revisar `.env.example`.

Variables principales:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_SECRET_KEY=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
HORAS_EXPIRACION_PEDIDO=72
```

Notas:

- `SUPABASE_SECRET_KEY` es solo servidor.
- `SUPABASE_SERVICE_ROLE_KEY` y `VAPID_PRIVATE_KEY` son solo servidor.
- si faltan variables publicas, la app puede caer en modo local segun repositorio usado
- despues de cambiar variables en Vercel hay que redeployar

## Seguridad actual

Implementado:

- headers HTTP defensivos
- CSP compatible con Next.js App Router, Supabase realtime y PWA admin
- `security.txt`
- RLS habilitado en tablas principales
- insercion publica restringida a lo minimo necesario
- formulario admin declarado como `POST`
- recalculo de totales en backend
- cliente sin permisos para cambiar estados de negocio

Pendiente para una fase posterior:

- CSP con nonce por request
- automatizacion WhatsApp
- QA funcional mas amplia en iPhone/PWA para badge y push con app cerrada
- rate limit mas fino en endpoints publicos

## Produccion actual

- URL publica: `https://perfume-store-mu-smoky.vercel.app`
- ver detalle de despliegue: [docs/PERFUME_STORE_VERCEL_DEPLOYMENT.md](docs/PERFUME_STORE_VERCEL_DEPLOYMENT.md)

## Iconografia y manifest

La app ya integra:

- `app/favicon.ico`
- `app/icon.png`
- `app/apple-icon.png`
- `public/favicon.ico`
- `public/icons/apple-touch-icon.png`
- `public/icons/android-chrome-192x192.png`
- `public/icons/android-chrome-512x512.png`
- `public/site.webmanifest`
- `public/admin.webmanifest`
- `public/icons/` con el set vigente del logo de Smellme.cl

Verificacion recomendada despues del deploy:

```text
/favicon.ico?v=99
/icons/apple-touch-icon.png?v=99
/icons/android-chrome-192x192.png?v=99
/site.webmanifest?v=99
/admin.webmanifest?v=99
```

Acceso directo admin en iPhone:

- abrir `https://tu-dominio/admin` o `https://tu-dominio/admin/login`
- usar `Compartir -> Agregar a pantalla de inicio`
- si ya existia un acceso directo viejo, eliminarlo y crearlo de nuevo para que tome `start_url: /admin`
- para ver badge en el icono, abrir la PWA instalada y aceptar el permiso con `Activar badge en este iPhone`
- para push cerrado en iPhone, la PWA debe estar instalada y con notificaciones permitidas

Uso rapido del badge:

- si el badge aun no esta activo, el panel muestra una card grande `Badge del icono`
- al activarlo correctamente, esa card desaparece y queda un chip pequeno en el header
- `Probar badge` muestra un `1` momentaneo y luego vuelve al contador real de pendientes
- si iPhone muestra permiso denegado, hay que habilitarlo desde Ajustes y volver a abrir la PWA desde el icono

Clientes y stock:

- pedidos pendientes, dashboard y badge usan la misma logica central de pendientes
- `/admin/clientes` permite editar nombre, telefono y unidad del cliente real por `id`
- la edicion de clientes bloquea colisiones evidentes por telefono o identidad repetida
- cuando el stock llega a `0`, el producto pasa a `Pausado` automaticamente
- para volver a publicarlo, primero hay que reponer stock y luego activarlo manualmente
- nombres equivalentes como `Paty`, `Yo` o `camila montes` se normalizan para evitar duplicados
- en el formulario publico se sugieren clientes recientes por nombre, telefono o lugar de trabajo

## Mejora Stock movil

- se agregaron `selects`, `datalist` y ajustes rapidos para editar producto, tipo, precio, stock y estado desde celular
- se corrigio el desborde horizontal en la vista Stock y en el modal de producto
- se ajusto el render responsive para iPhone/PWA sin dejar el layout corrido al salir de Stock
- se mantuvo la logica `Activo/Pausado`
- stock `0` sigue pausando el producto automaticamente

Migraciones recientes:

- `20260625232000_add_user_device_badge_settings.sql`
- `20260625235500_merge_duplicate_customers.sql`
- `20260626120000_add_admin_push_subscriptions.sql`

## Documentacion clave

- [docs/06_PANEL_ADMINISTRADOR.md](docs/06_PANEL_ADMINISTRADOR.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/SECURITY.md](docs/SECURITY.md)
- [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md)
- [docs/TESTING.md](docs/TESTING.md)
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- [docs/10_SEGURIDAD_HEADERS_RLS.md](docs/10_SEGURIDAD_HEADERS_RLS.md)
- [docs/17_SQL_BASE_SUPABASE.md](docs/17_SQL_BASE_SUPABASE.md)
- [docs/18_DEPLOY_VERCEL.md](docs/18_DEPLOY_VERCEL.md)
- [docs/SMELLME_MVP_V2_MAINTENANCE.md](docs/SMELLME_MVP_V2_MAINTENANCE.md)
- [docs/SMELLME_MVP_V2_RELEASE_AUDIT.md](docs/SMELLME_MVP_V2_RELEASE_AUDIT.md)
- [docs/SMELLME_V2_RELEASE.md](docs/SMELLME_V2_RELEASE.md)
- [docs/SMELLME_V2_PRODUCTION_CHECKLIST.md](docs/SMELLME_V2_PRODUCTION_CHECKLIST.md)
- [docs/41_BADGES_PWA_LIMITACIONES.md](docs/41_BADGES_PWA_LIMITACIONES.md)
- [docs/43_ESTADO_ACTUAL_APP_2026_06_26.md](docs/43_ESTADO_ACTUAL_APP_2026_06_26.md)

## Operación posterior al release

1. cargar el catálogo comercial real desde el panel administrador
2. comprobar precio, costo, stock, Top 12, ofertas e imágenes antes de activar productos
3. mantener los respaldos y resets dentro del centro protegido de mantenimiento
4. realizar cuando sea posible una validación física móvil complementaria; no fue parte de la aceptación de 2.0.0
5. evaluar CSP con `nonce` o `report-only` en una fase posterior
