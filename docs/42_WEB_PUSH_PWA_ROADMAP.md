# 42 - Web Push PWA admin: estado implementado y siguientes pasos

## Objetivo original

Implementar una base robusta para badge del icono y Web Push admin en iPhone, evitando depender de polling falso cuando la app esta cerrada o suspendida.

## Estado implementado al 2026-06-26

Ya existe en el proyecto:

- `public/admin-sw.js`
- `lib/pwa/registerServiceWorker.ts`
- `lib/pwa/push.ts`
- `lib/pwa/sendWebPush.ts`
- `components/admin/AdminPwaInitializer.tsx`
- `app/api/admin/push-subscriptions/route.ts`
- `app/api/admin/push/test/route.ts`
- tabla `admin_push_subscriptions`
- variables VAPID en Vercel

## Flujo vigente

1. el admin abre la PWA desde el icono
2. activa badge y notificaciones desde el panel
3. la app registra `service worker`
4. se crea o reactiva una suscripcion push por dispositivo
5. la suscripcion queda guardada en Supabase
6. cuando cambia el contador de pedidos por atender, backend envia Web Push
7. el `service worker` muestra notificacion y actualiza badge cuando el runtime lo permite

## Cobertura ya aplicada

### Frontend admin

- registro de `service worker` aislado al admin
- deteccion de soporte de push
- suscripcion por dispositivo
- prueba manual de push
- CTA de activacion desde el dashboard

### Backend

- guardado y baja de suscripciones activas
- envio con `web-push`
- desactivacion automatica de suscripciones invalidas `404/410`
- payload con `pendingCount` real y destino `/admin/pedidos`

### Regla de conteo

La emision usa la misma logica del badge visible:

- solo pedidos que requieren accion admin
- no pedidos ya vistos
- no pedidos agendados
- no pedidos finalizados o cancelados

## Ajuste extra aplicado para iPhone

La implementacion ya intenta ser compatible con escenarios mas fragiles de Safari/iPhone:

- payload declarativo compatible con Web Push moderno
- preferencia por `window.pushManager` cuando el runtime lo expone
- fallback via `service worker` para navegadores clasicos

## Lo que aun no se promete

- trabajo silencioso garantizado con la app cerrada en iPhone
- autorefresh continuo del badge sin push visible
- paridad total con una app nativa

## Siguientes endurecimientos recomendados

1. medir en iPhone real distintas versiones de iOS y documentar matriz de soporte
2. agregar logging operacional minimo para errores de suscripcion y envio push
3. evaluar `Content-Security-Policy-Report-Only` para endurecer CSP sin cortar push/PWA
4. endurecer CSP con `nonce` antes de quitar `unsafe-inline` y `unsafe-eval`
5. revisar si algun cambio futuro del contador debe disparar push adicional

## QA recomendado

- reinstalar el acceso directo admin en iPhone cuando cambie manifest o push
- probar `Probar notificacion` con la app cerrada
- crear pedido nuevo desde la web publica y confirmar push visible
- marcar pedido como visto y confirmar resincronizacion del badge
- revisar que `/admin/pedidos` abra desde el click de la notificacion
