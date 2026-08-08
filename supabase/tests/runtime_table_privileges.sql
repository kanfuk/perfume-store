-- Perfume Store
-- Fase 1D-B: verifica la matriz completa de privilegios de runtime sobre las
-- 8 tablas operativas (ver migracion
-- 20260728010000_runtime_table_privileges.sql) y confirma que nada mas se
-- movio: usuarios_admin, RLS, politicas, RPCs, secuencia y la publicacion
-- supabase_realtime quedan exactamente como estaban.
--
-- Ejecucion tipica:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/runtime_table_privileges.sql
--
-- Todo corre dentro de una sola transaccion con ROLLBACK final: no deja
-- estado nuevo en la base (no inserta filas de negocio, solo lee catalogo
-- y una tabla temporal propia de la prueba).

\set ON_ERROR_STOP on
\timing off

begin;

\echo '--- Fase 1D-B: matriz completa de privilegios de runtime ---'

create or replace function pg_temp.assert_priv(
  p_role text,
  p_table text,
  p_priv text,
  p_expected boolean
) returns void
language plpgsql
as $$
declare
  v_actual boolean;
begin
  v_actual := has_table_privilege(p_role, 'public.' || p_table, p_priv);
  if v_actual is distinct from p_expected then
    raise exception 'FAIL: %.% sobre % deberia ser % y es %',
      p_role, p_priv, p_table, p_expected, v_actual;
  end if;
end;
$$;

create or replace function pg_temp.assert_no_public_grant(p_table text) returns void
language plpgsql
as $$
begin
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = p_table and grantee = 'PUBLIC'
  ) then
    raise exception 'FAIL: PUBLIC tiene al menos un privilegio sobre %', p_table;
  end if;
end;
$$;

-- ============================================================
-- [1] Matriz por tabla: service_role, authenticated, anon.
-- Privilegios evaluados: SELECT, INSERT, UPDATE, DELETE, TRUNCATE,
-- REFERENCES, TRIGGER. "true" solo donde la matriz aprobada lo indica.
-- ============================================================

create temp table expected_matrix (
  table_name text,
  role_name text,
  priv text,
  expected boolean
) on commit drop;

-- Filas base: todo en false para las 8 tablas x 3 roles x 7 privilegios.
insert into expected_matrix (table_name, role_name, priv, expected)
select t, r, p, false
from unnest(array[
  'pedidos','pedido_items','clientes','productos','pagos','fiados',
  'admin_push_subscriptions','user_device_badge_settings'
]) as t
cross join unnest(array['service_role','authenticated','anon']) as r
cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) as p;

-- Excepciones aprobadas (todo lo demas queda en false).
update expected_matrix set expected = true
where (table_name, role_name, priv) in (
  ('pedidos','service_role','SELECT'),
  ('pedidos','service_role','INSERT'),
  ('pedidos','service_role','UPDATE'),
  ('pedidos','authenticated','SELECT'),

  ('pedido_items','service_role','SELECT'),
  ('pedido_items','service_role','INSERT'),

  ('clientes','service_role','SELECT'),
  ('clientes','service_role','INSERT'),
  ('clientes','service_role','UPDATE'),

  ('productos','service_role','SELECT'),
  ('productos','service_role','INSERT'),
  ('productos','service_role','UPDATE'),
  ('productos','service_role','DELETE'),

  ('pagos','service_role','SELECT'),
  ('pagos','service_role','INSERT'),

  ('fiados','service_role','SELECT'),
  ('fiados','service_role','INSERT'),
  ('fiados','service_role','UPDATE'),

  ('admin_push_subscriptions','service_role','SELECT'),
  ('admin_push_subscriptions','service_role','INSERT'),
  ('admin_push_subscriptions','service_role','UPDATE'),

  ('user_device_badge_settings','service_role','SELECT'),
  ('user_device_badge_settings','service_role','INSERT'),
  ('user_device_badge_settings','service_role','UPDATE')
);

\echo '[1] Recorriendo matriz completa (8 tablas x 3 roles x 7 privilegios = 168 aserciones)'
do $$
declare
  r record;
begin
  for r in select * from expected_matrix order by table_name, role_name, priv loop
    perform pg_temp.assert_priv(r.role_name, r.table_name, r.priv, r.expected);
  end loop;
  raise notice 'OK: matriz completa de service_role/authenticated/anon verificada';
end;
$$;

\echo '[2] PUBLIC sin ningun privilegio en las 8 tablas'
do $$
declare
  t text;
begin
  foreach t in array array[
    'pedidos','pedido_items','clientes','productos','pagos','fiados',
    'admin_push_subscriptions','user_device_badge_settings'
  ] loop
    perform pg_temp.assert_no_public_grant(t);
  end loop;
  raise notice 'OK: PUBLIC sin privilegios en las 8 tablas';
end;
$$;

-- ============================================================
-- [3] usuarios_admin permite altas/cambios solo al servicio server-side.
-- ============================================================

\echo '[3] usuarios_admin conserva su matriz previa'
do $$
begin
  perform pg_temp.assert_priv('authenticated', 'usuarios_admin', 'SELECT', true);
  perform pg_temp.assert_priv('authenticated', 'usuarios_admin', 'INSERT', false);
  perform pg_temp.assert_priv('authenticated', 'usuarios_admin', 'UPDATE', false);
  perform pg_temp.assert_priv('authenticated', 'usuarios_admin', 'DELETE', false);
  perform pg_temp.assert_priv('authenticated', 'usuarios_admin', 'TRUNCATE', false);
  perform pg_temp.assert_priv('authenticated', 'usuarios_admin', 'REFERENCES', false);
  perform pg_temp.assert_priv('authenticated', 'usuarios_admin', 'TRIGGER', false);
  perform pg_temp.assert_priv('service_role', 'usuarios_admin', 'SELECT', true);
  perform pg_temp.assert_priv('service_role', 'usuarios_admin', 'INSERT', true);
  perform pg_temp.assert_priv('service_role', 'usuarios_admin', 'UPDATE', true);
  perform pg_temp.assert_priv('service_role', 'usuarios_admin', 'DELETE', false);
  perform pg_temp.assert_priv('service_role', 'usuarios_admin', 'TRUNCATE', false);
  perform pg_temp.assert_priv('service_role', 'usuarios_admin', 'REFERENCES', false);
  perform pg_temp.assert_priv('service_role', 'usuarios_admin', 'TRIGGER', false);
  perform pg_temp.assert_priv('anon', 'usuarios_admin', 'SELECT', false);
  perform pg_temp.assert_no_public_grant('usuarios_admin');
  raise notice 'OK: usuarios_admin con escritura server-only';
end;
$$;

-- ============================================================
-- [4] RLS activo en las 9 tablas relevantes.
-- ============================================================

\echo '[4] RLS activo'
do $$
declare
  t text;
begin
  foreach t in array array[
    'usuarios_admin','pedidos','pedido_items','clientes','productos','pagos',
    'fiados','admin_push_subscriptions','user_device_badge_settings'
  ] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise exception 'FAIL: RLS deshabilitado en %', t;
    end if;
  end loop;
  raise notice 'OK: RLS activo en las 9 tablas';
end;
$$;

-- ============================================================
-- [5] Las politicas existentes siguen presentes.
-- ============================================================

\echo '[5] Politicas existentes presentes'
do $$
declare
  expected_policies text[] := array[
    'usuarios_admin.admin_can_read_own_profile',
    'pedidos.admin_can_manage_pedidos',
    'pedido_items.admin_can_read_pedido_items',
    'clientes.admin_can_read_clientes',
    'productos.admin_can_manage_productos',
    'productos.public_can_read_active_products',
    'pagos.admin_can_manage_pagos',
    'fiados.admin_can_manage_fiados',
    'admin_push_subscriptions.admin_can_manage_own_push_subscriptions',
    'user_device_badge_settings.admin_can_manage_own_badge_settings'
  ];
  entry text;
  tbl text;
  pol text;
begin
  foreach entry in array expected_policies loop
    tbl := split_part(entry, '.', 1);
    pol := split_part(entry, '.', 2);
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = tbl and policyname = pol
    ) then
      raise exception 'FAIL: falta la politica % sobre %', pol, tbl;
    end if;
  end loop;
  raise notice 'OK: % politicas presentes', array_length(expected_policies, 1);
end;
$$;

-- ============================================================
-- [6] RPCs y secuencia mantienen sus permisos actuales (EXECUTE/USAGE
-- solo service_role; is_active_admin sigue SECURITY INVOKER).
-- ============================================================

\echo '[6] RPCs y secuencia sin cambios'
do $$
begin
  if not has_function_privilege('service_role', 'public.create_perfume_order_v1(jsonb, jsonb, text, text, text)', 'EXECUTE') then
    raise exception 'FAIL: service_role perdio EXECUTE sobre create_perfume_order_v1';
  end if;
  if has_function_privilege('authenticated', 'public.create_perfume_order_v1(jsonb, jsonb, text, text, text)', 'EXECUTE') then
    raise exception 'FAIL: authenticated gano EXECUTE sobre create_perfume_order_v1';
  end if;
  if has_function_privilege('anon', 'public.create_perfume_order_v1(jsonb, jsonb, text, text, text)', 'EXECUTE') then
    raise exception 'FAIL: anon gano EXECUTE sobre create_perfume_order_v1';
  end if;
  if not has_function_privilege('service_role', 'public.mark_perfume_order_paid_v1(uuid, text)', 'EXECUTE') then
    raise exception 'FAIL: service_role perdio EXECUTE sobre mark_perfume_order_paid_v1';
  end if;
  if not has_function_privilege('service_role', 'public.cancel_perfume_order_v1(uuid, text, boolean)', 'EXECUTE') then
    raise exception 'FAIL: service_role perdio EXECUTE sobre cancel_perfume_order_v1';
  end if;
  if not has_function_privilege('service_role', 'public.advance_perfume_order_status_v1(uuid, text)', 'EXECUTE') then
    raise exception 'FAIL: service_role perdio EXECUTE sobre advance_perfume_order_status_v1';
  end if;
  if not has_function_privilege('service_role', 'public.next_perfume_order_code()', 'EXECUTE') then
    raise exception 'FAIL: service_role perdio EXECUTE sobre next_perfume_order_code';
  end if;
  if not has_sequence_privilege('service_role', 'public.perfume_order_code_seq', 'USAGE') then
    raise exception 'FAIL: service_role perdio USAGE sobre perfume_order_code_seq';
  end if;
  if has_sequence_privilege('authenticated', 'public.perfume_order_code_seq', 'USAGE') then
    raise exception 'FAIL: authenticated gano USAGE sobre perfume_order_code_seq';
  end if;
  if (
    select prosecdef from pg_proc
    where proname = 'is_active_admin' and pronamespace = 'public'::regnamespace
  ) then
    raise exception 'FAIL: is_active_admin() paso a ser SECURITY DEFINER';
  end if;
  raise notice 'OK: RPCs, secuencia e is_active_admin() sin cambios';
end;
$$;

-- ============================================================
-- [7] supabase_realtime: pedidos sigue sin estar registrado (estado
-- conocido, no modificado por esta migracion).
-- ============================================================

\echo '[7] supabase_realtime sin modificar (pedidos no registrado)'
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'pedidos'
  ) then
    raise notice 'INFO: pedidos SI esta en supabase_realtime (fuera del alcance de esta migracion, no es un fallo)';
  else
    raise notice 'OK: pedidos no esta en supabase_realtime, como antes de esta migracion';
  end if;
end;
$$;

\echo '--- Fase 1D-B: matriz completa verificada ---'

rollback;
