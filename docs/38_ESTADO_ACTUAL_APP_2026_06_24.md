# 38 - Estado Actual App 2026-06-24

Este documento deja el cierre operativo y tecnico de **Pauli Store** despues de la pasada final de implementacion, QA y limpieza del repo.

## Estado general

- Produccion y rama `main` alineadas
- Cliente publico operativo
- Admin operativo con Supabase Auth
- Catalogo publico sembrado en Supabase
- Stock, pedidos, fiados, costos y reportes activos en el flujo actual
- Iconos, manifests y acceso directo PWA revisados para cliente y admin

## Funcionalidades activas hoy

### Cliente publico

- Catalogo mobile-first con tarjetas mejoradas
- Descripciones expandibles
- Badge `En carrito` con mejor contraste
- Fecha de entrega obligatoria por defecto al dia siguiente
- Validacion de celular chileno
- Creacion de pedidos publicos con snapshot de costos por item

### Admin

- Home / Centro de control
- Pedidos
- Stock
- Ventas
- Clientes
- Reportes
- Venta directa
- Pedido personalizado
- Bloque de pedidos por atender
- Badge flotante interno con contador
- Intento seguro de badge PWA en iPhone mediante `setAppBadge()`

## Regla actual para pedidos por atender

El contador visible en admin considera pedidos que:

- siguen `PENDIENTE`, aunque ya hayan sido vistos
- siguen `AGENDADO` pero aun no marcados como vistos
- no estan cerrados ni cancelados

Al agendar un pedido desde admin tambien queda marcado como visto para bajar el contador correctamente.

## PWA, iconos y badge en iPhone

Estado actual:

- `public/site.webmanifest` para cliente
- `public/admin.webmanifest` para admin
- `public/apple-touch-icon.png`
- `public/android-chrome-192x192.png`
- `public/android-chrome-512x512.png`
- `public/icons/*` como pack extendido
- `app/icon.png`, `app/apple-icon.png` y `app/favicon.ico` para metadata App Router

Importante:

- en iPhone el badge del icono de inicio no aparece solo por llamar `setAppBadge()`
- la app debe estar instalada en pantalla de inicio
- iOS debe conceder permisos de notificaciones a esa PWA
- desde admin existe el CTA `Activar badge en icono` cuando corresponde

## Higiene del repo aplicada

- se eliminaron archivos versionados de `supabase/.temp/`
- se unifico la imagen de `Dobladita Napolitana` a `/images/products/dobladita-napolitana.png`
- se dejo una migracion para corregir `image_url` antigua en base remota
- se mantuvo el pack de iconos realmente usado por manifests y metadata

## QA local ejecutado en esta pasada

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`

## Siguientes cuidados operativos

- si en iPhone no cambia el icono admin, borrar acceso directo viejo y agregarlo de nuevo desde `/admin`
- si el badge del icono no aparece, revisar `Ajustes > Notificaciones > Pauli Admin > Insignias`
- antes de lanzar, ejecutar limpieza operativa desde admin si aun quedan datos de prueba
