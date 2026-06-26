# 41 - Badges PWA y limitaciones reales

## Estado vigente

Desde 2026-06-26 el admin ya cuenta con:

- refresco del contador al abrir, cada 60 segundos y al volver visible
- refresco inmediato mientras la app esta abierta si Supabase Realtime responde
- badge por dispositivo usando `navigator.setAppBadge()` y `navigator.clearAppBadge()` cuando el runtime lo soporta
- `service worker` admin dedicado
- Web Push con suscripciones guardadas en Supabase
- boton `Probar notificacion` desde el panel admin
- envio de push al cambiar el contador de pedidos por atender

## Regla real del contador

El badge usa la misma regla que la UI del admin:

- cuenta solo pedidos que requieren atencion
- no cuenta pedidos `AGENDADO`
- no cuenta pedidos `FINALIZADO`
- no cuenta pedidos `CANCELADO`
- no cuenta pedidos con `admin_seen = true`

## Lo que si funciona

- con la app admin abierta, el contador y la UI se resincronizan
- con permisos correctos, el push de prueba llega al dispositivo suscrito
- al tocar la notificacion, la app abre o enfoca `/admin/pedidos`
- en navegadores compatibles el badge puede actualizarse durante el evento push

## Lo que no se debe asumir

- una PWA en iPhone no puede depender de polling o timers en segundo plano como una app nativa
- cerrar la app o dejarla suspendida puede impedir cualquier supuesto "autorefresh" silencioso
- iPhone no garantiza trabajo en segundo plano continuo para web apps
- si no hay PWA instalada desde pantalla de inicio, el comportamiento de push y badge no es confiable

## Requisitos para la mejor experiencia en iPhone

- abrir `/admin` desde Safari
- agregar a pantalla de inicio
- abrir siempre el admin desde ese icono
- aceptar notificaciones
- mantener activa la opcion `Insignias` en Ajustes
- volver a crear el acceso directo si existia uno viejo antes de cambios de manifest o push

## Riesgo residual aceptado

Aunque ya existe base robusta de Web Push, el comportamiento con app cerrada en iPhone sigue dependiendo de:

- version de iOS
- permisos efectivos del dispositivo
- estado de instalacion PWA
- soporte real de Web Push y badge del runtime

Por eso la estrategia vigente es:

1. mantener el refresh con app abierta
2. sumar push visible al cambiar el contador
3. aceptar que el "silent refresh" de badge con la app cerrada no es un objetivo realista en PWA iPhone
