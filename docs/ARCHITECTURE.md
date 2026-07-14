# Arquitectura

## Resumen

Pauli Store es una aplicacion Next.js con App Router y una separacion pragmatica por capas:

- `app/`: rutas UI y endpoints HTTP
- `components/`: vistas cliente y administracion
- `services/`: reglas de negocio y coordinacion de flujos
- `repositories/`: acceso a datos en Supabase
- `lib/`: helpers transversales, validaciones, seguridad, PWA y utilidades
- `domain/`: entidades de negocio
- `supabase/`: schema, seed y migraciones incrementales

## Flujos criticos

- Cliente: catalogo publico, carrito, validacion, creacion de pedido y confirmacion posterior por WhatsApp.
- Admin: login, dashboard, gestion de pedidos, venta directa, stock, costos, pagos, fiados y reportes.
- Push/PWA: registro por dispositivo, badge del icono y pruebas manuales desde el panel admin.

## Decisiones vigentes

- El backend recalcula totales y no confia en montos enviados desde el cliente.
- La lectura/escritura administrativa usa cliente servidor de Supabase con clave privilegiada solo en servidor.
- El frontend mantiene una UX mobile-first, pero la logica comercial sigue concentrada en servicios/repositorios.

## Deuda tecnica principal

- `components/admin/AdminDashboard.tsx` sigue siendo el mayor punto de complejidad y debe dividirse por dominios.
- `components/OrderForm.tsx`, `components/admin/AdminDirectSale.tsx`, `services/pedidoService.ts` y `repositories/pedidoRepository.ts` aun mezclan varias responsabilidades.
