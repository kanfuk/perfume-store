-- Compatibilidad con la protección safeupdate del proyecto remoto.
-- Mantiene DELETE explícito por tabla; no usa TRUNCATE ni relaja políticas.
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

  delete from public.fiados where true;
  delete from public.pagos where true;
  delete from public.pedido_items where true;
  delete from public.pedidos where true;
  delete from public.clientes where true;
  delete from public.product_image_assistant_attempts where true;
  delete from public.productos where true;
  delete from public.archivo_fiados where true;
  delete from public.archivo_pagos where true;
  delete from public.archivo_pedido_items where true;
  delete from public.archivo_pedidos where true;
  delete from public.archivo_clientes where true;
  delete from public.operaciones_admin_log where true;
  delete from public.smellme_qa_registry where true;

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
