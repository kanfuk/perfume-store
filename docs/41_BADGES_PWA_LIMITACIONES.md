## Badges pendientes y PWA

- Con la app admin abierta, el contador se refresca al entrar, cada 60 segundos y cuando la pestana vuelve a estar visible.
- Si Supabase Realtime esta disponible en el navegador autenticado, los cambios en `pedidos` disparan un refresco inmediato mientras la app sigue abierta.
- El badge del icono solo se actualiza si el navegador soporta `navigator.setAppBadge` o `navigator.clearAppBadge`.
- En iPhone con la app totalmente cerrada no hay actualizacion confiable solo con polling.
- Para actualizar el icono con la app cerrada en iPhone se necesita PWA instalada + permiso de notificaciones + service worker + Web Push.
- Este proyecto hoy no agrega Web Push ni service worker nuevos para no arriesgar el deploy actual en Vercel/Supabase gratis.
