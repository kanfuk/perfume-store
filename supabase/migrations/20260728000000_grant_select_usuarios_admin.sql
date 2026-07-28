-- Perfume Store
-- Fase 1D-B: corrige un permiso de tabla faltante en public.usuarios_admin.
--
-- Motivo: la migracion 20260724000000_perfume_store_foundation.sql crea la
-- tabla, habilita RLS y define politicas, pero nunca otorga el GRANT de
-- tabla base que Postgres exige antes de evaluar RLS. Sin ese GRANT,
-- CUALQUIER rol (incluido service_role, que ignora RLS pero sigue
-- necesitando el grant de tabla) recibe "permission denied for table
-- usuarios_admin" (SQLSTATE 42501) al intentar un SELECT, sin importar si
-- la fila le corresponderia o no bajo RLS. Esto rompe getAuthenticatedAdmin()
-- en lib/admin-auth.ts, que consulta esta tabla con el cliente service_role
-- para resolver el login del panel admin: el error se capturaba en
-- silencio (if (error || !data) return null) y el usuario terminaba
-- siempre de vuelta en /admin/login.
--
-- Verificado por consulta directa contra el proyecto remoto (PostgREST) con
-- las claves anon y service_role: ambas devolvieron 42501 al leer esta
-- tabla, confirmando que el grant faltaba para todos los roles no
-- superusuario, no solo para service_role.
--
-- Alcance deliberadamente minimo: solo SELECT, solo para los dos roles que
-- realmente necesitan leer esta tabla hoy.
--   - service_role: usado por getAuthenticatedAdmin() (lib/supabase/server.ts).
--   - authenticated: necesario para que la politica RLS
--     "admin_can_read_own_profile" (creada en la migracion de foundation)
--     y is_active_admin() -- que es SECURITY INVOKER, no DEFINER, por lo
--     que ejecuta con los privilegios del rol que la invoca -- puedan
--     evaluar la fila del admin autenticado.
-- anon no recibe ningun privilegio: no tiene motivo para leer esta tabla.
-- Se revoca tambien de PUBLIC (el pseudo-rol del que todo rol hereda por
-- defecto) para que ningun rol futuro reciba acceso implicito a esta tabla
-- sin un GRANT explicito.
--
-- Ademas: la plantilla de Supabase otorga por defecto REFERENCES, TRIGGER y
-- TRUNCATE sobre toda tabla de public a anon/authenticated/service_role
-- (confirmado con information_schema.role_table_grants en una instancia
-- local limpia: identico en usuarios_admin y en productos, y ya documentado
-- para service_role en docs/PERFUME_STORE_REMOTE_DATABASE_DEPLOYMENT.md,
-- seccion 9). Para esta tabla puntual -- lista blanca de administradores,
-- sin ningun caso de uso legitimo para truncarla o referenciarla desde
-- authenticated/service_role -- se revocan tambien esos tres privilegios de
-- plantilla, dejando el acceso en el minimo estricto: unicamente SELECT.
--
-- No se modifica RLS, la politica admin_can_read_own_profile, la funcion
-- is_active_admin(), ni ninguna fila de datos.

revoke all on table public.usuarios_admin from public;
revoke all on table public.usuarios_admin from anon;
revoke references, trigger, truncate on table public.usuarios_admin from authenticated;
revoke references, trigger, truncate on table public.usuarios_admin from service_role;
grant select on table public.usuarios_admin to authenticated;
grant select on table public.usuarios_admin to service_role;
