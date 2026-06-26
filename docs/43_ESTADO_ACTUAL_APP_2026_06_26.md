# 43 - Estado Actual App 2026-06-26

Este documento resume el estado vigente de **Pauli Store** despues de la pasada de seguridad compatible, Web Push admin y limpieza documental central.

## Estado general

- produccion y `main` alineadas
- cliente publico operativo
- admin operativo con Supabase Auth
- venta directa y pedido personalizado funcionando
- badge admin por dispositivo activo
- Web Push admin base implementado
- seguridad visible endurecida sin tocar logica de negocio

## Cambios vigentes al 2026-06-26

### Seguridad HTTP

- headers de seguridad servidos desde `next.config.ts`
- CSP actualizada en modo compatible
- `connect-src` contempla Supabase, Realtime por `wss` y dominios Vercel
- `worker-src 'self' blob:` habilitado para PWA y `service worker`
- `Permissions-Policy` explicitada con permisos no usados deshabilitados

### Web Push admin

- `service worker` admin registrado desde el layout admin
- suscripciones push guardadas por dispositivo en `admin_push_subscriptions`
- endpoint de prueba disponible en `/api/admin/push/test`
- variables VAPID documentadas y cargadas en Vercel
- envio push al cambiar el contador de pedidos por atender
- payload con compatibilidad declarativa para Safari/iPhone moderno

### Regla del badge

El badge visible y el push usan la misma regla:

- cuentan solo pedidos por atender
- excluyen pedidos vistos
- excluyen pedidos agendados
- excluyen pedidos finalizados
- excluyen pedidos cancelados

### Documentacion depurada

Se actualizaron como fuente de verdad:

- `README.md`
- `docs/00_INDICE_DOCUMENTACION.md`
- `docs/10_SEGURIDAD_HEADERS_RLS.md`
- `docs/18_DEPLOY_VERCEL.md`
- `docs/41_BADGES_PWA_LIMITACIONES.md`
- `docs/42_WEB_PUSH_PWA_ROADMAP.md`

## Riesgos residuales aceptados

- la CSP sigue permitiendo `unsafe-inline` y `unsafe-eval` por compatibilidad con Next.js App Router y PWA
- en iPhone no se promete autorefresh silencioso del badge con la app totalmente cerrada
- el comportamiento final de push cerrado depende de instalacion PWA, permisos y version de iOS

## Validacion local ejecutada

- `npm run lint`
- `npm run typecheck`
- `npm run build`

## Orden recomendado para continuar

1. `README.md`
2. `docs/00_INDICE_DOCUMENTACION.md`
3. `docs/43_ESTADO_ACTUAL_APP_2026_06_26.md`
4. `docs/10_SEGURIDAD_HEADERS_RLS.md`
5. `docs/18_DEPLOY_VERCEL.md`
