-- Perfume Store
-- Fase 1D-B: verifica que el grant de tabla de public.usuarios_admin quedo
-- exactamente como se penso, sin ampliar de mas ni dejar nada afuera.
-- Pensado para ejecutarse con psql contra una instancia Supabase LOCAL
-- (nunca remota) que ya tenga aplicadas, en orden, todas las migraciones de
-- supabase/migrations/ hasta 20260728000000_grant_select_usuarios_admin.sql.
--
-- Ejecucion tipica:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/usuarios_admin_grants.sql
--
-- Todo corre dentro de una sola transaccion con ROLLBACK final: no deja
-- estado nuevo en la base (no inserta filas, solo lee catalogo).

\set ON_ERROR_STOP on
\timing off

begin;

\echo '--- Fase 1D-B: verificacion de grants sobre usuarios_admin ---'

create or replace function pg_temp.assert_priv(
  p_role text,
  p_priv text,
  p_expected boolean
) returns void
language plpgsql
as $$
declare
  v_actual boolean;
begin
  v_actual := has_table_privilege(p_role, 'public.usuarios_admin', p_priv);
  if v_actual is distinct from p_expected then
    raise exception 'FAIL: %.% deberia ser % y es %',
      p_role, p_priv, p_expected, v_actual;
  end if;
  raise notice 'OK: %.% = %', p_role, p_priv, v_actual;
end;
$$;

\echo '[1] authenticated: SELECT=true, escritura=false'
do $$
begin
  perform pg_temp.assert_priv('authenticated', 'SELECT', true);
  perform pg_temp.assert_priv('authenticated', 'INSERT', false);
  perform pg_temp.assert_priv('authenticated', 'UPDATE', false);
  perform pg_temp.assert_priv('authenticated', 'DELETE', false);
  perform pg_temp.assert_priv('authenticated', 'TRUNCATE', false);
  perform pg_temp.assert_priv('authenticated', 'REFERENCES', false);
  perform pg_temp.assert_priv('authenticated', 'TRIGGER', false);
end;
$$;

\echo '[2] service_role: SELECT/INSERT/UPDATE=true; DELETE=false'
do $$
begin
  perform pg_temp.assert_priv('service_role', 'SELECT', true);
  perform pg_temp.assert_priv('service_role', 'INSERT', true);
  perform pg_temp.assert_priv('service_role', 'UPDATE', true);
  perform pg_temp.assert_priv('service_role', 'DELETE', false);
  perform pg_temp.assert_priv('service_role', 'TRUNCATE', false);
  perform pg_temp.assert_priv('service_role', 'REFERENCES', false);
  perform pg_temp.assert_priv('service_role', 'TRIGGER', false);
end;
$$;

\echo '[3] anon: todos los privilegios en false'
do $$
begin
  perform pg_temp.assert_priv('anon', 'SELECT', false);
  perform pg_temp.assert_priv('anon', 'INSERT', false);
  perform pg_temp.assert_priv('anon', 'UPDATE', false);
  perform pg_temp.assert_priv('anon', 'DELETE', false);
  perform pg_temp.assert_priv('anon', 'TRUNCATE', false);
  perform pg_temp.assert_priv('anon', 'REFERENCES', false);
  perform pg_temp.assert_priv('anon', 'TRIGGER', false);
end;
$$;

\echo '[4] PUBLIC: ningun privilegio explicito sobre usuarios_admin'
do $$
begin
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'usuarios_admin'
      and grantee = 'PUBLIC'
  ) then
    raise exception 'FAIL: PUBLIC tiene al menos un privilegio sobre usuarios_admin';
  end if;
  raise notice 'OK: PUBLIC no tiene ningun privilegio sobre usuarios_admin';
end;
$$;

\echo '[5] RLS sigue activo en usuarios_admin'
do $$
begin
  if not (
    select relrowsecurity from pg_class where oid = 'public.usuarios_admin'::regclass
  ) then
    raise exception 'FAIL: RLS quedo deshabilitado en usuarios_admin';
  end if;
  raise notice 'OK: RLS activo';
end;
$$;

\echo '[6] la politica admin_can_read_own_profile sigue existiendo'
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'usuarios_admin'
      and policyname = 'admin_can_read_own_profile'
  ) then
    raise exception 'FAIL: falta la politica admin_can_read_own_profile';
  end if;
  raise notice 'OK: politica admin_can_read_own_profile presente';
end;
$$;

\echo '[7] is_active_admin() sigue siendo SECURITY INVOKER'
do $$
begin
  if (
    select prosecdef from pg_proc
    where proname = 'is_active_admin' and pronamespace = 'public'::regnamespace
  ) then
    raise exception 'FAIL: is_active_admin() paso a ser SECURITY DEFINER';
  end if;
  raise notice 'OK: is_active_admin() sigue siendo SECURITY INVOKER';
end;
$$;

\echo '--- Fase 1D-B: todas las verificaciones OK ---'

rollback;
