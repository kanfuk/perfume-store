## Badges pendientes y PWA

- Con la app admin abierta, el contador se refresca al entrar, cada 60 segundos y cuando la pestana vuelve a estar visible.
- Si Supabase Realtime esta disponible en el navegador autenticado, los cambios en `pedidos` disparan un refresco inmediato mientras la app sigue abierta.
- El badge del icono solo se actualiza si el navegador soporta `navigator.setAppBadge` o `navigator.clearAppBadge`.
- Hoy la app tiene manifest PWA y Badging API progresiva, pero todavia no registra Service Worker ni flujo completo de Web Push.
- En iPhone con la app totalmente cerrada no hay actualizacion confiable solo con polling.
- Para actualizar el icono con la app cerrada en iPhone se necesita PWA instalada + permiso de notificaciones + service worker + Web Push.
- Este proyecto hoy no agrega Web Push ni service worker nuevos para no arriesgar el deploy actual en Vercel/Supabase gratis.
- Regla aplicada hoy para ventas internas sin campo `controla_stock`: si el producto tiene stock configurado mayor a 0, se trata como stock controlado y descuenta; si tiene stock 0, la venta se permite sin descuento automatico.
