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

La implementacion intenta ser compatible con escenarios mas fragiles de Safari/iPhone:

- payload declarativo compatible con Web Push moderno
- `PushManager` se obtiene SIEMPRE desde `ServiceWorkerRegistration.pushManager`
  (ver `lib/pwa/push.ts`), nunca desde `window.pushManager`

## Correccion 2026-08-11 (rama `feature/order-push-notifications`)

Causas concretas encontradas durante la auditoria de esta rama:

1. **`window.pushManager` no es una API estandar.** `lib/pwa/push.ts` preferia
   `window.pushManager` sobre `ServiceWorkerRegistration.pushManager` cuando el
   runtime lo "exponia". Ningun navegador (Safari/iOS incluido) expone
   `PushManager` en `window`; la especificacion solo lo define en
   `ServiceWorkerRegistration.pushManager`. En la practica esa rama nunca se
   activaba (siempre caia al fallback), pero el codigo era enganoso y no
   garantizaba `await navigator.serviceWorker.ready` antes de resolver el
   `pushManager`. Se elimino esa rama: ahora `getPreferredPushManager()` llama
   `registerAdminServiceWorker()` (que ya hace `register` + `await
   navigator.serviceWorker.ready`) y usa siempre `registration.pushManager`.
2. **`sendPendingOrdersPushToAdmins()` no distinguia fallos.** Si todos los
   envios `web-push` fallaban, devolvia `{ sent: 0, skipped: false }` sin
   indicar la causa. Ahora devuelve `{ sent, failed, expired, skipped, reason?
   }`, distinguiendo VAPID ausente, cero suscripciones activas, suscripciones
   expiradas (404/410, desactivadas automaticamente) y envios rechazados.
3. **`/api/admin/push/test` daba falso positivo de QA.** Solo miraba
   `pushResult.skipped`; si `skipped === false` pero `sent === 0` (todos los
   envios fallaron), respondia igual "Notificación de prueba enviada al
   dispositivo actual.". Ahora responde `502` con "No fue posible entregar la
   notificación al servicio push del dispositivo." cuando `sent === 0`, y solo
   afirma que el servicio push aceptó la notificación (nunca que aparecio en
   pantalla) cuando `sent >= 1`.
4. **Sin observabilidad seria.** `notifyPendingOrdersBadgeChange()` en
   `services/pedidoService.ts` envolvia todo en un `try/catch` vacio. Se
   mantiene fail-open (una falla de push nunca bloquea `crearPedido`), pero
   ahora registra `console.warn`/`console.error` estructurado con
   `pedidoId`, `pendingCount`, `sent`, `failed`, `expired`, `reason` -- nunca
   `endpoint`, `p256dh`, `auth` ni datos del cliente -- revisable en Vercel
   Runtime Logs.

## Matriz de diagnostico

| permission | PWA instalada | suscripcion activa | VAPID configurado | resultado esperado |
|---|---|---|---|---|
| default/denied | - | - | - | no se intenta suscribir; `isPushNotificationsSupported()` o el permiso bloquean el flujo antes de llegar al servidor |
| granted | no (solo pestaña) | si | si | Web Push puede llegar mientras el navegador siga vivo; sin garantia de recepcion con la pestana cerrada |
| granted | si (icono, standalone) | si | si | `sent >= 1`: el servicio push acepto el envio; el Service Worker debe ejecutar `setAppBadge`/`showNotification` aunque la PWA este cerrada y la pantalla bloqueada (iOS 16.4+) |
| granted | si | si (pero 404/410 en el envio) | si | `expired >= 1`: la suscripcion se marca `is_active = false`; hay que reactivarla reinstalando/reabriendo la PWA y volviendo a activar notificaciones |
| granted | si | no (nunca se creo o se borro) | si | `skipped: true`, `reason: "NO_ACTIVE_SUBSCRIPTIONS"`; no hay a quien enviarle |
| granted | si | si | no (falta alguna var VAPID) | `skipped: true`, `reason: "VAPID_NOT_CONFIGURED"`; revisar variables en Vercel |
| granted | si | si | si, pero `web-push` rechaza el envio (5xx del push service) | `failed >= 1`, `sent` puede ser `0`; revisar Vercel Runtime Logs para la causa exacta (nunca se loguea el payload de la suscripcion) |

## Lo que aun no se promete

- trabajo silencioso garantizado con la app cerrada en iPhone
- autorefresh continuo del badge sin push visible
- paridad total con una app nativa

## Siguientes endurecimientos recomendados

1. medir en iPhone real distintas versiones de iOS y documentar matriz de soporte
2. evaluar `Content-Security-Policy-Report-Only` para endurecer CSP sin cortar push/PWA
3. endurecer CSP con `nonce` antes de quitar `unsafe-inline` y `unsafe-eval`
4. revisar si algun cambio futuro del contador debe disparar push adicional

## QA recomendado

### iPhone (obligatorio antes de dar por resuelto el Push)

1. instalar Smellme en la pantalla de inicio (Safari > Compartir > Agregar a inicio)
2. abrir Smellme desde el icono (modo standalone, no desde Safari)
3. activar notificaciones desde el panel admin
4. cerrar la PWA por completo (deslizar hacia arriba / quitar de apps recientes)
5. bloquear la pantalla del iPhone
6. generar un pedido nuevo desde otro dispositivo (web publica)
7. debe llegar una notificacion con:
   - Titulo: "Nuevo pedido en Smellme"
   - Cuerpo: "Tienes un nuevo pedido pendiente de revisión."
8. el badge del icono debe incrementarse SIN necesidad de abrir Smellme
9. tocar el aviso debe abrir `/admin/pedidos`

### Desktop

1. permitir notificaciones en el navegador
2. cerrar la pestana/app
3. crear un pedido de prueba
4. confirmar que llega el Web Push

### Nota importante

Los tests unitarios (`npm run test:run`) validan la logica de resultados,
respuestas HTTP y contenido del Service Worker, pero NO prueban entrega real
de Web Push en un dispositivo fisico. Solo la prueba manual con iPhone
bloqueado y PWA cerrada (arriba) confirma que el Push llega de verdad.
