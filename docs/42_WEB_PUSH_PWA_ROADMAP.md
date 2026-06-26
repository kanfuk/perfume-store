# 42 - Roadmap robusto para badge PWA y Web Push en iPhone

## Objetivo

Implementar actualizacion confiable del badge del icono y notificaciones push para admin en iPhone, sin depender de polling falso cuando la app esta cerrada o suspendida.

## Estado actual del proyecto

- Hay `manifest` PWA para cliente y admin.
- Hay utilidades de badge:
  - `lib/pwa/notifications.ts`
  - `lib/pwa/updateAppBadge.ts`
- El admin ya refresca pendientes:
  - al abrir
  - cada 60 segundos con la app visible
  - al volver con `visibilitychange`
  - con Realtime opcional sobre `pedidos`
- No existe `service worker` registrado.
- No existe flujo de `PushManager`.
- No existe almacenamiento de suscripciones push.
- No existe endpoint para disparar Web Push desde backend.

## Limitacion tecnica real

En iPhone, una PWA cerrada o en segundo plano no puede depender de `setInterval` o JavaScript del tab para actualizar badge o mostrar notificaciones.

Para que el badge del icono se actualice sin abrir manualmente la app, se necesita:

- PWA instalada desde Safari
- permiso de notificaciones otorgado por el usuario
- `service worker` activo
- suscripcion `PushManager`
- backend que envie Web Push al entrar un pedido nuevo
- soporte de `setAppBadge` o `clearAppBadge` en el contexto disponible

## Arquitectura recomendada

### 1. Frontend admin

Agregar una capa PWA aislada para no contaminar la UI actual:

- `lib/pwa/registerServiceWorker.ts`
- `lib/pwa/push.ts`
- `public/sw.js` o `public/admin-sw.js`

Responsabilidades:

- registrar `service worker` solo en admin y solo en cliente
- pedir permiso de notificaciones solo tras click del usuario
- crear/renovar suscripcion push
- persistir la suscripcion en backend
- sincronizar `badgeEnabled`, `notificationPermission`, `runningAsPwa`

### 2. Base de datos

Crear una tabla nueva solo si se decide implementar push de verdad:

`admin_push_subscriptions`

Campos sugeridos:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null`
- `device_id text not null`
- `endpoint text not null`
- `p256dh text not null`
- `auth text not null`
- `device_label text null`
- `running_as_pwa boolean default false`
- `notification_permission text null`
- `is_active boolean default true`
- `last_seen_at timestamptz null`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Indices sugeridos:

- unique `(user_id, device_id, endpoint)`
- index por `is_active`

No mezclar esta tabla con `user_device_badge_settings`. Esa tabla sirve para preferencias de badge; push necesita credenciales de suscripcion.

### 3. Backend Vercel

Agregar endpoints separados:

- `POST /api/admin/push-subscriptions`
  - guarda o reactiva suscripcion
- `DELETE /api/admin/push-subscriptions`
  - desactiva suscripcion
- `POST /api/admin/push/test`
  - envia push de prueba al dispositivo actual

Agregar una utilidad server-only:

- `lib/pwa/sendWebPush.ts`

Responsabilidades:

- leer claves VAPID desde variables de entorno
- construir payload corto
- enviar a suscripciones activas
- desactivar suscripciones invalidas al recibir `404` o `410`

### 4. Disparador de push

El lugar mas seguro para disparar push es backend, inmediatamente despues de crear un pedido pendiente.

Punto sugerido:

- `services/pedidoService.ts`
  - despues de `crearPedido(...)`

Flujo:

1. se crea el pedido
2. se confirma que cuenta como pendiente para admin
3. se consulta el total pendiente actual
4. se envian pushes a suscripciones activas
5. el payload lleva:
   - titulo
   - cuerpo
   - `pendingCount`
   - `pedidoId`
   - `url` destino, por ejemplo `/admin/pedidos`

No disparar push desde frontend cliente.

## Service Worker recomendado

Archivo sugerido:

- `public/admin-sw.js`

Eventos a manejar:

- `install`
- `activate`
- `push`
- `notificationclick`

Comportamiento en `push`:

1. parsear payload JSON
2. mostrar notificacion
3. intentar actualizar badge si el runtime lo soporta
4. si el payload trae `pendingCount`, usar ese valor
5. si no trae `pendingCount`, dejar badge generico `1`

Comportamiento en `notificationclick`:

- cerrar notificacion
- abrir o enfocar `/admin/pedidos`

## Variables de entorno recomendadas

Agregar en Vercel:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

Reglas:

- nunca exponer `VAPID_PRIVATE_KEY` en frontend
- `VAPID_PUBLIC_KEY` si puede ir al cliente
- usar `VAPID_SUBJECT` tipo `mailto:correo@dominio.com`

## Libreria recomendada

Usar una libreria liviana y estandar para backend:

- `web-push`

Motivo:

- madura
- pequena
- compatible con Vercel serverless
- evita implementar el protocolo manualmente

No agregar dependencias PWA pesadas si no son necesarias.

## Fases recomendadas de implementacion

### Fase 1

Objetivo: dejar base segura sin cambiar reglas de negocio.

- registrar `service worker`
- crear helper de registro
- agregar CTA `Activar notificaciones`
- pedir permiso tras click
- crear endpoint para guardar suscripcion
- guardar suscripcion en Supabase

### Fase 2

Objetivo: push de prueba.

- endpoint `push/test`
- boton `Enviar prueba`
- validar:
  - permiso
  - recepcion
  - click abre admin

### Fase 3

Objetivo: push automatico al crear pedido pendiente.

- integrar emision en backend al cerrar `crearPedido`
- incluir `pendingCount` real
- actualizar badge desde service worker

### Fase 4

Objetivo: endurecimiento y operacion.

- desactivar suscripciones invalidas
- registrar `last_seen_at`
- logs server-side minimos
- reintento prudente sin loops
- QA en iPhone real

## Reglas de conteo de badge

Mantener la regla actual del proyecto:

- contar solo pedidos que requieren accion admin
- hoy la app usa `getPendingAdminOrdersCount(data.pendientes)`

Recomendacion:

- no redefinir badge dentro del service worker
- calcular el `pendingCount` en backend con la misma regla existente
- enviar ese valor listo en el payload push

## Riesgos a evitar

- pedir permisos al cargar la pagina
- registrar `service worker` duplicado
- enviar push desde frontend
- hardcodear claves VAPID
- depender de polling para app cerrada en iPhone
- mezclar logica de badge con logica de negocio de pedidos
- asumir que `activo/inactivo` de producto equivale a soporte de push o badge

## Checklist tecnico

### Antes de empezar

- confirmar dominio productivo final en Vercel
- confirmar cuenta Safari/iPhone para pruebas
- confirmar variables de entorno VAPID

### Desarrollo

- crear `service worker`
- registrar SW solo en admin
- agregar tabla de suscripciones
- crear endpoint guardar/eliminar
- crear endpoint de prueba
- integrar envio automatico

### QA

- Safari iPhone con PWA instalada
- permiso de notificaciones aceptado
- push de prueba recibido
- click abre admin
- pedido nuevo dispara push
- badge del icono cambia si el runtime lo soporta
- si no soporta badge, la notificacion igual funciona

## Recomendacion final

La forma mas robusta de implementarlo despues es:

1. mantener el refresh actual con app abierta
2. sumar `service worker` + `PushManager`
3. guardar suscripciones en Supabase
4. enviar Web Push desde backend Vercel al crear pedido pendiente
5. usar `pendingCount` calculado server-side para sincronizar badge

Ese camino es el que mejor respeta iPhone, Vercel y Supabase gratis sin inventar comportamiento que iOS no garantiza.
