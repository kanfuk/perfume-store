-- Smellme 2.0.0-rc.2: reinicio total y explícito de datos operativos.
-- Aplicar esta migración no elimina datos. El borrado requiere invocar la RPC
-- con frase, backup registrado, fingerprint vigente e idempotencia.

alter table public.smellme_maintenance_runs
  drop constraint if exists smellme_maintenance_runs_action_check;
alter table public.smellme_maintenance_runs
  add constraint smellme_maintenance_runs_action_check
  check (action in ('QA_CLEANUP', 'CATALOG_RESET', 'STORAGE_ORPHANS', 'FULL_OPERATIONAL_RESET'));

create table if not exists public.smellme_full_reset_backups (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null,
  preview_fingerprint text not null,
  counts jsonb not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

create table if not exists public.smellme_full_reset_storage_pending (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null,
  storage_path text not null,
  status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint smellme_full_reset_storage_status_check check (status in ('PENDING', 'DELETED')),
  constraint smellme_full_reset_storage_path_unique unique (idempotency_key, storage_path),
  constraint smellme_full_reset_storage_path_safe check (
    storage_path like 'products/%' and position('..' in storage_path) = 0 and position(E'\\' in storage_path) = 0
  )
);

alter table public.smellme_full_reset_backups enable row level security;
alter table public.smellme_full_reset_storage_pending enable row level security;
revoke all on table public.smellme_full_reset_backups from public, anon, authenticated;
revoke all on table public.smellme_full_reset_storage_pending from public, anon, authenticated;
grant select, insert, update on table public.smellme_full_reset_backups to service_role;
grant select, insert, update, delete on table public.smellme_full_reset_storage_pending to service_role;

create or replace function public.preview_smellme_full_operational_reset_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  v_result := jsonb_build_object(
    'products', jsonb_build_object(
      'total', (select count(*) from public.productos),
      'active', (select count(*) from public.productos where activo),
      'inactive', (select count(*) from public.productos where not activo),
      'top12', (select count(*) from public.productos where es_top),
      'offers', (select count(*) from public.productos where es_oferta_semana),
      'stockTotal', coalesce((select sum(stock_actual) from public.productos), 0),
      'reservedTotal', coalesce((select sum(stock_reservado) from public.productos), 0),
      'associatedImages', (select count(*) from public.productos where nullif(btrim(image_storage_path), '') is not null)
    ),
    'orders', jsonb_build_object(
      'total', (select count(*) from public.pedidos),
      'public', (select count(*) from public.pedidos where origen_pedido = 'PUBLICO'),
      'directSales', (select count(*) from public.pedidos where origen_pedido = 'ADMIN_DIRECTO'),
      'custom', (select count(*) from public.pedidos where origen_pedido = 'PERSONALIZADO'),
      'pending', (select count(*) from public.pedidos where estado_pedido in ('NUEVO','AGENDADO','PAGADO','PREPARANDO','DESPACHADO')),
      'cancelled', (select count(*) from public.pedidos where estado_pedido = 'CANCELADO')
    ),
    'details', (select count(*) from public.pedido_items),
    'payments', (select count(*) from public.pagos),
    'customers', (select count(*) from public.clientes),
    'debts', (select count(*) from public.fiados),
    'archives', jsonb_build_object(
      'operations', (select count(*) from public.operaciones_admin_log),
      'customers', (select count(*) from public.archivo_clientes),
      'orders', (select count(*) from public.archivo_pedidos),
      'details', (select count(*) from public.archivo_pedido_items),
      'payments', (select count(*) from public.archivo_pagos),
      'debts', (select count(*) from public.archivo_fiados)
    ),
    'imageAssistantAttempts', (select count(*) from public.product_image_assistant_attempts),
    'qaRegistry', (select count(*) from public.smellme_qa_registry),
    'stockMovements', 0,
    'inventoryAdjustments', 0,
    'imports', 0,
    'importRows', 0,
    'reports', jsonb_build_object(
      'salesCount', (select count(*) from public.pedidos),
      'amountSold', coalesce((select sum(total) from public.pedidos), 0),
      'historicalCost', coalesce((select sum(total_costo) from public.pedido_items), 0),
      'grossProfit', coalesce((select sum(utilidad_bruta) from public.pedido_items), 0),
      'shipments', (select count(*) from public.pedidos where estado_pedido in ('DESPACHADO','ENTREGADO'))
    ),
    'sequence', jsonb_build_object(
      'lastValue', (select last_value from public.perfume_order_code_seq),
      'isCalled', (select is_called from public.perfume_order_code_seq)
    )
  );
  return v_result || jsonb_build_object('fingerprint', md5(v_result::text));
end;
$$;

create or replace function public.prepare_smellme_full_operational_backup_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_preview jsonb := public.preview_smellme_full_operational_reset_v1();
  v_payload jsonb;
  v_fingerprint text;
begin
  v_payload := jsonb_build_object(
    'schemaVersion', 'smellme-full-operational-backup-v1',
    'generatedAt', now(),
    'projectRef', 'nxgkudvrotlaqvvhygem',
    'preview', v_preview,
    'tables', jsonb_build_object(
      'productos', coalesce((select jsonb_agg(to_jsonb(t)) from public.productos t), '[]'::jsonb),
      'pedidos', coalesce((select jsonb_agg(to_jsonb(t)) from public.pedidos t), '[]'::jsonb),
      'pedido_items', coalesce((select jsonb_agg(to_jsonb(t)) from public.pedido_items t), '[]'::jsonb),
      'pagos', coalesce((select jsonb_agg(to_jsonb(t)) from public.pagos t), '[]'::jsonb),
      'fiados', coalesce((select jsonb_agg(to_jsonb(t)) from public.fiados t), '[]'::jsonb),
      'clientes', coalesce((select jsonb_agg(to_jsonb(t)) from public.clientes t), '[]'::jsonb),
      'operaciones_admin_log', coalesce((select jsonb_agg(to_jsonb(t)) from public.operaciones_admin_log t), '[]'::jsonb),
      'archivo_clientes', coalesce((select jsonb_agg(to_jsonb(t)) from public.archivo_clientes t), '[]'::jsonb),
      'archivo_pedidos', coalesce((select jsonb_agg(to_jsonb(t)) from public.archivo_pedidos t), '[]'::jsonb),
      'archivo_pedido_items', coalesce((select jsonb_agg(to_jsonb(t)) from public.archivo_pedido_items t), '[]'::jsonb),
      'archivo_pagos', coalesce((select jsonb_agg(to_jsonb(t)) from public.archivo_pagos t), '[]'::jsonb),
      'archivo_fiados', coalesce((select jsonb_agg(to_jsonb(t)) from public.archivo_fiados t), '[]'::jsonb),
      'product_image_assistant_attempts', coalesce((select jsonb_agg(to_jsonb(t)) from public.product_image_assistant_attempts t), '[]'::jsonb),
      'smellme_qa_registry', coalesce((select jsonb_agg(to_jsonb(t)) from public.smellme_qa_registry t), '[]'::jsonb)
    )
  );
  v_fingerprint := md5(v_payload::text);
  insert into public.smellme_full_reset_backups(id, fingerprint, preview_fingerprint, counts)
  values (v_id, v_fingerprint, v_preview->>'fingerprint', v_preview - 'fingerprint');
  return jsonb_build_object('backupId', v_id, 'fingerprint', v_fingerprint,
    'previewFingerprint', v_preview->>'fingerprint', 'payload', v_payload);
end;
$$;

create or replace function public.reset_smellme_full_operational_data_v1(
  p_confirmation text,
  p_idempotency_key text,
  p_backup_id uuid,
  p_backup_fingerprint text,
  p_expected_fingerprint text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing jsonb;
  v_backup public.smellme_full_reset_backups%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_image_paths jsonb := '[]'::jsonb;
  v_result jsonb;
  v_run_id uuid;
  v_auth_count bigint;
  v_admin_hash text;
  v_business_hash text;
  v_bank_complete boolean;
begin
  if p_confirmation <> 'ELIMINAR TODA LA DATA OPERATIVA' then
    raise exception 'FULLRESET001: frase de confirmación inválida';
  end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{15,127}$' then
    raise exception 'FULLRESET002: clave de idempotencia inválida';
  end if;
  if p_expected_fingerprint is null or p_expected_fingerprint !~ '^[a-f0-9]{32}$'
     or p_backup_fingerprint is null or p_backup_fingerprint !~ '^[a-f0-9]{32}$' then
    raise exception 'FULLRESET003: fingerprint inválido';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('smellme-full-operational-reset', 0));
  select result into v_existing from public.smellme_maintenance_runs
    where action = 'FULL_OPERATIONAL_RESET' and idempotency_key = p_idempotency_key and status = 'COMPLETE';
  if v_existing is not null then return v_existing || jsonb_build_object('replayed', true); end if;

  select * into v_backup from public.smellme_full_reset_backups where id = p_backup_id for update;
  if not found or v_backup.fingerprint <> p_backup_fingerprint or v_backup.consumed_at is not null then
    raise exception 'FULLRESET004: respaldo inexistente, inválido o ya consumido';
  end if;
  if v_backup.created_at < now() - interval '2 hours' then
    raise exception 'FULLRESET005: el respaldo expiró';
  end if;

  v_before := public.preview_smellme_full_operational_reset_v1();
  if v_before->>'fingerprint' <> p_expected_fingerprint
     or v_backup.preview_fingerprint <> p_expected_fingerprint then
    raise exception 'FULLRESET006: los datos cambiaron; genera un preview y respaldo nuevos';
  end if;

  select count(*) into v_auth_count from auth.users;
  select md5(coalesce(jsonb_agg(to_jsonb(u) order by u.id)::text, '[]')) into v_admin_hash from public.usuarios_admin u;
  select md5(coalesce(jsonb_agg(to_jsonb(b) order by b.id)::text, '[]')) into v_business_hash from public.business_settings b;
  select exists(select 1 from public.business_settings where
    nullif(btrim(banco), '') is not null and nullif(btrim(tipo_cuenta), '') is not null and
    nullif(btrim(numero_cuenta), '') is not null and nullif(btrim(titular_cuenta), '') is not null and
    nullif(btrim(rut_titular), '') is not null and nullif(btrim(correo), '') is not null)
  into v_bank_complete;

  insert into public.smellme_maintenance_runs(action, idempotency_key)
  values ('FULL_OPERATIONAL_RESET', p_idempotency_key)
  returning id into v_run_id;

  select coalesce(jsonb_agg(image_storage_path), '[]'::jsonb) into v_image_paths
  from public.productos
  where image_storage_path like 'products/%'
    and position('..' in image_storage_path) = 0
    and position(E'\\' in image_storage_path) = 0;

  insert into public.smellme_full_reset_storage_pending(idempotency_key, storage_path)
  select p_idempotency_key, image_storage_path from public.productos
  where image_storage_path like 'products/%'
    and position('..' in image_storage_path) = 0
    and position(E'\\' in image_storage_path) = 0
  on conflict (idempotency_key, storage_path) do nothing;

  delete from public.fiados;
  delete from public.pagos;
  delete from public.pedido_items;
  delete from public.pedidos;
  delete from public.clientes;
  delete from public.product_image_assistant_attempts;
  delete from public.productos;
  delete from public.archivo_fiados;
  delete from public.archivo_pagos;
  delete from public.archivo_pedido_items;
  delete from public.archivo_pedidos;
  delete from public.archivo_clientes;
  delete from public.operaciones_admin_log;
  delete from public.smellme_qa_registry;

  v_after := public.preview_smellme_full_operational_reset_v1();

  if (v_after#>>'{products,total}')::bigint <> 0 or (v_after#>>'{orders,total}')::bigint <> 0
     or (v_after->>'details')::bigint <> 0 or (v_after->>'payments')::bigint <> 0
     or (v_after->>'customers')::bigint <> 0 or (v_after->>'debts')::bigint <> 0
     or (v_after#>>'{archives,operations}')::bigint <> 0
     or (v_after#>>'{archives,customers}')::bigint <> 0 or (v_after#>>'{archives,orders}')::bigint <> 0
     or (v_after#>>'{archives,details}')::bigint <> 0 or (v_after#>>'{archives,payments}')::bigint <> 0
     or (v_after#>>'{archives,debts}')::bigint <> 0
     or (v_after->>'imageAssistantAttempts')::bigint <> 0 or (v_after->>'qaRegistry')::bigint <> 0 then
    raise exception 'FULLRESET007: quedaron datos operativos; transacción revertida';
  end if;
  if (select count(*) from auth.users) <> v_auth_count
     or (select md5(coalesce(jsonb_agg(to_jsonb(u) order by u.id)::text, '[]')) from public.usuarios_admin u) <> v_admin_hash
     or (select md5(coalesce(jsonb_agg(to_jsonb(b) order by b.id)::text, '[]')) from public.business_settings b) <> v_business_hash then
    raise exception 'FULLRESET008: configuración preservada cambió; transacción revertida';
  end if;

  -- Las secuencias de PostgreSQL no son transaccionales. Se reinicia al final,
  -- después de todas las verificaciones que pueden revertir el borrado.
  perform setval('public.perfume_order_code_seq', 1, false);
  v_after := public.preview_smellme_full_operational_reset_v1();

  v_result := jsonb_build_object(
    'replayed', false, 'resetRunId', v_run_id, 'before', v_before, 'after', v_after,
    'imagePaths', v_image_paths,
    'preserved', jsonb_build_object(
      'adminAuthPreserved', (select count(*) from auth.users) = v_auth_count,
      'adminUserPreserved', (select md5(coalesce(jsonb_agg(to_jsonb(u) order by u.id)::text, '[]')) from public.usuarios_admin u) = v_admin_hash,
      'businessSettingsPreserved', (select md5(coalesce(jsonb_agg(to_jsonb(b) order by b.id)::text, '[]')) from public.business_settings b) = v_business_hash,
      'bankConfigurationComplete', v_bank_complete,
      'whatsappConfigurationPreserved', (select md5(coalesce(jsonb_agg(to_jsonb(b) order by b.id)::text, '[]')) from public.business_settings b) = v_business_hash,
      'brandingPreserved', true
    )
  );
  update public.smellme_maintenance_runs set status = 'COMPLETE', result = v_result, completed_at = now()
    where id = v_run_id;
  update public.smellme_full_reset_backups set consumed_at = now() where id = p_backup_id;
  return v_result;
end;
$$;

revoke all on function public.preview_smellme_full_operational_reset_v1() from public, anon, authenticated;
revoke all on function public.prepare_smellme_full_operational_backup_v1() from public, anon, authenticated;
revoke all on function public.reset_smellme_full_operational_data_v1(text,text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.preview_smellme_full_operational_reset_v1() to service_role;
grant execute on function public.prepare_smellme_full_operational_backup_v1() to service_role;
grant execute on function public.reset_smellme_full_operational_data_v1(text,text,uuid,text,text) to service_role;
