-- Perfume Store
-- Fase 1D-B: matriz completa de privilegios de runtime para las 8 tablas
-- operativas que el codigo de la aplicacion realmente toca (auditoria
-- exhaustiva de repositories/**, services/**, app/api/** y los componentes
-- que usan el cliente browser).
--
-- Mismo defecto que ya corregimos en usuarios_admin (migracion
-- 20260728000000_grant_select_usuarios_admin.sql): la migracion
-- 20260724000000_perfume_store_foundation.sql creo estas 15 tablas sin
-- otorgar ningun GRANT de tabla base a ningun rol. Solo quedaron los
-- privilegios de plantilla de Supabase (REFERENCES/TRIGGER/TRUNCATE).
--
-- Alcance: unicamente las 8 tablas con codigo real que las consulta.
-- business_settings, operaciones_admin_log y los 5 archivo_* NUNCA se
-- consultan desde TypeScript (solo dentro de funciones SECURITY DEFINER,
-- que no necesitan grants de tabla para el rol que las invoca) -- no se
-- tocan.
--
-- Patron por tabla: revoke all de PUBLIC/anon/authenticated/service_role
-- primero (reinicia a cero, incluyendo TRUNCATE/REFERENCES/TRIGGER de
-- plantilla), despues grant unicamente lo exacto que el codigo usa. Nunca
-- GRANT ALL. postgres (owner) no se toca.
--
-- Fuente de cada permiso (ver auditoria completa en la conversacion de
-- Fase 1D-B):
--   pedidos: SELECT/INSERT/UPDATE por service_role (repositories/
--     pedidoRepository.ts: buscarPedidosPorEstado, insertarPedido,
--     actualizarEstadoPedido, actualizarClientePedido). SELECT por
--     authenticated UNICAMENTE por el canal Realtime postgres_changes que
--     components/admin/AdminDashboard.tsx abre con el cliente browser
--     (sesion real del admin, no service_role).
--   pedido_items: SELECT (embebido en buscarPedidosPorEstado) e INSERT
--     (insertarPedidoItem) por service_role.
--   clientes: SELECT/INSERT/UPDATE por service_role (clienteRepository.ts,
--     lib/admin-customers-data.ts).
--   productos: SELECT/INSERT/UPDATE/DELETE por service_role
--     (productRepository.ts) -- incluye el catalogo publico, que se sirve
--     siempre desde una ruta de servidor, nunca con el cliente anon.
--   pagos: SELECT/INSERT por service_role (buscarPagosPorPedidoIds,
--     insertarPago). Nunca se actualiza ni se borra un pago.
--   fiados: SELECT/INSERT/UPDATE por service_role (buscarFiadosPorPedidoIds,
--     upsertFiado).
--   admin_push_subscriptions: SELECT/INSERT/UPDATE por service_role
--     (lib/pwa/sendWebPush.ts, app/api/admin/push-subscriptions,
--     app/api/admin/push/test). El "DELETE" del endpoint es en realidad un
--     UPDATE (is_active = false).
--   user_device_badge_settings: SELECT/INSERT/UPDATE por service_role
--     (app/api/admin/badge-settings).
--
-- authenticated y anon quedan en cero en las 7 tablas restantes: ningun
-- codigo real las consulta con esos roles, aunque existan politicas RLS
-- escritas "to authenticated" (esas politicas son necesarias para cuando
-- ese rol SI consulta -- pedidos via Realtime -- pero no implican otorgar
-- el grant de tabla a todo el resto solo porque la politica existe).
--
-- No se toca: RLS, politicas existentes, funciones RPC, la secuencia
-- perfume_order_code_seq, la publicacion supabase_realtime, usuarios_admin,
-- business_settings, operaciones_admin_log, archivo_*.

-- ============================================================
-- pedidos
-- ============================================================
revoke all on table public.pedidos from public;
revoke all on table public.pedidos from anon;
revoke all on table public.pedidos from authenticated;
revoke all on table public.pedidos from service_role;

grant select, insert, update on table public.pedidos to service_role;
grant select on table public.pedidos to authenticated;

-- ============================================================
-- pedido_items
-- ============================================================
revoke all on table public.pedido_items from public;
revoke all on table public.pedido_items from anon;
revoke all on table public.pedido_items from authenticated;
revoke all on table public.pedido_items from service_role;

grant select, insert on table public.pedido_items to service_role;

-- ============================================================
-- clientes
-- ============================================================
revoke all on table public.clientes from public;
revoke all on table public.clientes from anon;
revoke all on table public.clientes from authenticated;
revoke all on table public.clientes from service_role;

grant select, insert, update on table public.clientes to service_role;

-- ============================================================
-- productos
-- ============================================================
revoke all on table public.productos from public;
revoke all on table public.productos from anon;
revoke all on table public.productos from authenticated;
revoke all on table public.productos from service_role;

grant select, insert, update, delete on table public.productos to service_role;

-- ============================================================
-- pagos
-- ============================================================
revoke all on table public.pagos from public;
revoke all on table public.pagos from anon;
revoke all on table public.pagos from authenticated;
revoke all on table public.pagos from service_role;

grant select, insert on table public.pagos to service_role;

-- ============================================================
-- fiados
-- ============================================================
revoke all on table public.fiados from public;
revoke all on table public.fiados from anon;
revoke all on table public.fiados from authenticated;
revoke all on table public.fiados from service_role;

grant select, insert, update on table public.fiados to service_role;

-- ============================================================
-- admin_push_subscriptions
-- ============================================================
revoke all on table public.admin_push_subscriptions from public;
revoke all on table public.admin_push_subscriptions from anon;
revoke all on table public.admin_push_subscriptions from authenticated;
revoke all on table public.admin_push_subscriptions from service_role;

grant select, insert, update on table public.admin_push_subscriptions to service_role;

-- ============================================================
-- user_device_badge_settings
-- ============================================================
revoke all on table public.user_device_badge_settings from public;
revoke all on table public.user_device_badge_settings from anon;
revoke all on table public.user_device_badge_settings from authenticated;
revoke all on table public.user_device_badge_settings from service_role;

grant select, insert, update on table public.user_device_badge_settings to service_role;
