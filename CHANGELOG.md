# Changelog

## 2.0.0-rc.2 - 2026-08-01

- reinicio total protegido de datos operativos
- catálogo, ventas, pedidos, clientes, stock y reportes de prueba en cero
- limpieza controlada de imágenes y huérfanos bajo `product-images/products/`
- preservación verificada de Auth, administrador, banco, WhatsApp y configuración
- estado inicial listo para la carga comercial real
- reconciliación del carrito, invalidación de caché y validaciones integrales

## 2.0.0-rc.1 - 2026-08-01

- retiro completo del asistente de búsqueda externa de imágenes del runtime MVP
- conservación y prueba del flujo manual de imágenes optimizadas a WebP
- centro `/admin/mantenimiento` protegido con vistas previas y confirmaciones exactas
- clasificación SQL transaccional e idempotente para datos QA y reinicio de catálogo
- respaldo JSON/CSV sin clientes, datos bancarios ni información de pagos
- inventario conservador de huérfanos limitado a `product-images/products/`
- estados públicos diferenciados para catálogo vacío y error de carga
- documentación de seguridad, rollback, QA y trabajo futuro consolidada

## 1.2.0 - 2026-07-13

- endurecimiento de configuracion administrativa de Supabase sin fallback a clave anonima
- conexion del sistema global de confirmaciones y toasts al arbol de la app
- reemplazo de confirmaciones nativas en admin por dialogos accesibles y consistentes
- versionado reproducible en `package.json` sin dependencias declaradas como `latest`
- ajuste de footer y branding con datos de release centralizados
- actualizacion de documentacion operativa para entorno, seguridad, testing, arquitectura y despliegue
