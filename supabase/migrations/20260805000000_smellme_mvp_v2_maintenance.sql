-- Smellme MVP V2: mantenimiento conservador, transaccional y solo service_role.
-- No ejecuta limpieza ni reinicio al aplicar la migración.

create table if not exists public.smellme_maintenance_runs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  idempotency_key text not null,
  status text not null default 'RUNNING',
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint smellme_maintenance_runs_action_check check (action in ('QA_CLEANUP', 'CATALOG_RESET', 'STORAGE_ORPHANS')),
  constraint smellme_maintenance_runs_status_check check (status in ('RUNNING', 'COMPLETE')),
  constraint smellme_maintenance_runs_key_unique unique (action, idempotency_key)
);

create table if not exists public.smellme_qa_registry (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint smellme_qa_registry_type_check check (entity_type in ('ORDER', 'CUSTOMER', 'PRODUCT')),
  constraint smellme_qa_registry_entity_unique unique (entity_type, entity_id)
);

alter table public.smellme_maintenance_runs enable row level security;
alter table public.smellme_qa_registry enable row level security;
revoke all on table public.smellme_maintenance_runs from public, anon, authenticated;
revoke all on table public.smellme_qa_registry from public, anon, authenticated;
grant select, insert, update on table public.smellme_maintenance_runs to service_role;
grant select, insert, update, delete on table public.smellme_qa_registry to service_role;

create or replace function public.is_smellme_qa_record_v1(
  p_name text default null,
  p_sku text default null,
  p_email text default null,
  p_idempotency_key text default null,
  p_observation text default null,
  p_storage_path text default null,
  p_registered boolean default false
) returns boolean
language sql
immutable
set search_path = public
as $$
  select
    lower(btrim(coalesce(p_name, ''))) like 'zztest%'
    or lower(btrim(coalesce(p_sku, ''))) like 'zztest%'
    or lower(btrim(coalesce(p_name, ''))) = 'qa smellme full flow'
    or lower(btrim(coalesce(p_email, ''))) ~ '^[^@[:space:]]+@example\.com$'
    or upper(btrim(coalesce(p_idempotency_key, ''))) like 'QA-%'
    or lower(btrim(coalesce(p_observation, ''))) like 'zztest%'
    or lower(btrim(coalesce(p_observation, ''))) like 'qa:%'
    or lower(btrim(coalesce(p_storage_path, ''))) like 'products/qa/%'
    or lower(btrim(coalesce(p_storage_path, ''))) like 'qa/%'
    or coalesce(p_registered, false);
$$;

create or replace function public.preview_smellme_qa_cleanup_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  with qa_orders as (
    select distinct p.id
    from public.pedidos p
    join public.clientes c on c.id = p.cliente_id
    where public.is_smellme_qa_record_v1(
      c.nombre, null, c.email, p.idempotency_key, p.observacion, null,
      exists (select 1 from public.smellme_qa_registry r where r.entity_type = 'ORDER' and r.entity_id = p.id)
    ) or exists (
      select 1 from public.pedido_items pi join public.productos pr on pr.id = pi.producto_id
      where pi.pedido_id = p.id and public.is_smellme_qa_record_v1(
        pr.nombre, pr.sku, null, null, null, pr.image_storage_path,
        exists (select 1 from public.smellme_qa_registry r where r.entity_type = 'PRODUCT' and r.entity_id = pr.id)
      )
    )
  ),
  qa_customers as (
    select c.id,
      not exists (select 1 from public.pedidos p where p.cliente_id = c.id and not exists (select 1 from qa_orders q where q.id = p.id)) as deletable
    from public.clientes c
    where public.is_smellme_qa_record_v1(
      c.nombre, null, c.email, null, null, null,
      exists (select 1 from public.smellme_qa_registry r where r.entity_type = 'CUSTOMER' and r.entity_id = c.id)
    )
  ),
  qa_products as (
    select p.id, p.image_storage_path,
      p.stock_reservado = 0 and not exists (
        select 1 from public.pedido_items pi
        where pi.producto_id = p.id and not exists (select 1 from qa_orders q where q.id = pi.pedido_id)
      ) as deletable
    from public.productos p
    where public.is_smellme_qa_record_v1(
      p.nombre, p.sku, null, null, null, p.image_storage_path,
      exists (select 1 from public.smellme_qa_registry r where r.entity_type = 'PRODUCT' and r.entity_id = p.id)
    )
  )
  select jsonb_build_object(
    'orders', jsonb_build_object('deletable', (select count(*) from qa_orders)),
    'customers', jsonb_build_object(
      'deletable', (select count(*) from qa_customers where deletable),
      'manualReview', (select count(*) from qa_customers where not deletable)
    ),
    'products', jsonb_build_object(
      'deletable', (select count(*) from qa_products where deletable),
      'manualReview', (select count(*) from qa_products where not deletable)
    ),
    'payments', (select count(*) from public.pagos pa where exists (select 1 from qa_orders q where q.id = pa.pedido_id)),
    'debts', (select count(*) from public.fiados f where exists (select 1 from qa_orders q where q.id = f.pedido_id)),
    'storageFiles', (select count(*) from qa_products where deletable and image_storage_path like 'products/%' and image_storage_path ~* '\.webp$'),
    'sampleOrderIds', coalesce((select jsonb_agg(short_id) from (select left(id::text, 8) || '…' || right(id::text, 4) short_id from qa_orders order by id limit 10) s), '[]'::jsonb),
    'warnings', coalesce((select jsonb_agg(message) from (
      select 'Cliente QA compartido: revisión manual' message from qa_customers where not deletable
      union all
      select 'Producto QA con historial o reserva: revisión manual' message from qa_products where not deletable
    ) w), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.cleanup_smellme_qa_data_v1(p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing jsonb;
  v_orders integer := 0;
  v_customers integer := 0;
  v_products integer := 0;
  v_payments integer := 0;
  v_debts integer := 0;
  v_items integer := 0;
  v_storage_paths jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if p_idempotency_key is null or p_idempotency_key !~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{15,127}$' then
    raise exception 'QA001: clave de idempotencia inválida';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('smellme-qa-cleanup', 0));
  select result into v_existing from public.smellme_maintenance_runs
    where action = 'QA_CLEANUP' and idempotency_key = p_idempotency_key and status = 'COMPLETE';
  if v_existing is not null then return v_existing || jsonb_build_object('replayed', true); end if;

  insert into public.smellme_maintenance_runs(action, idempotency_key)
  values ('QA_CLEANUP', p_idempotency_key) on conflict (action, idempotency_key) do nothing;

  create temporary table tmp_smellme_qa_orders(id uuid primary key) on commit drop;
  insert into tmp_smellme_qa_orders
  select distinct p.id from public.pedidos p join public.clientes c on c.id = p.cliente_id
  where public.is_smellme_qa_record_v1(
    c.nombre, null, c.email, p.idempotency_key, p.observacion, null,
    exists (select 1 from public.smellme_qa_registry r where r.entity_type = 'ORDER' and r.entity_id = p.id)
  ) or exists (
    select 1 from public.pedido_items pi join public.productos pr on pr.id = pi.producto_id
    where pi.pedido_id = p.id and public.is_smellme_qa_record_v1(
      pr.nombre, pr.sku, null, null, null, pr.image_storage_path,
      exists (select 1 from public.smellme_qa_registry r where r.entity_type = 'PRODUCT' and r.entity_id = pr.id)
    )
  );

  create temporary table tmp_smellme_qa_products(id uuid primary key, image_storage_path text) on commit drop;
  insert into tmp_smellme_qa_products
  select p.id, p.image_storage_path from public.productos p
  where public.is_smellme_qa_record_v1(
    p.nombre, p.sku, null, null, null, p.image_storage_path,
    exists (select 1 from public.smellme_qa_registry r where r.entity_type = 'PRODUCT' and r.entity_id = p.id)
  ) and p.stock_reservado = 0 and not exists (
    select 1 from public.pedido_items pi where pi.producto_id = p.id
    and not exists (select 1 from tmp_smellme_qa_orders q where q.id = pi.pedido_id)
  );

  -- Revierte solo el efecto de inventario de los pedidos QA antes de borrarlos.
  with quantities as (
    select pi.producto_id,
      sum(case when p.estado_pedido in ('NUEVO','AGENDADO') then pi.cantidad else 0 end)::integer reserved_qty,
      sum(case when p.estado_pedido in ('PAGADO','PREPARANDO','DESPACHADO','ENTREGADO') then pi.cantidad else 0 end)::integer sold_qty
    from public.pedido_items pi join public.pedidos p on p.id = pi.pedido_id
    join tmp_smellme_qa_orders q on q.id = p.id
    where pi.producto_id is not null group by pi.producto_id
  )
  update public.productos p set
    stock_reservado = greatest(0, p.stock_reservado - q.reserved_qty),
    stock_actual = p.stock_actual + q.sold_qty,
    stock_agenda = p.stock_agenda + q.sold_qty,
    updated_at = now()
  from quantities q where p.id = q.producto_id;

  delete from public.fiados f using tmp_smellme_qa_orders q where f.pedido_id = q.id;
  get diagnostics v_debts = row_count;
  delete from public.pagos pa using tmp_smellme_qa_orders q where pa.pedido_id = q.id;
  get diagnostics v_payments = row_count;
  delete from public.pedido_items pi using tmp_smellme_qa_orders q where pi.pedido_id = q.id;
  get diagnostics v_items = row_count;
  delete from public.pedidos p using tmp_smellme_qa_orders q where p.id = q.id;
  get diagnostics v_orders = row_count;

  delete from public.clientes c where public.is_smellme_qa_record_v1(
    c.nombre, null, c.email, null, null, null,
    exists (select 1 from public.smellme_qa_registry r where r.entity_type = 'CUSTOMER' and r.entity_id = c.id)
  ) and not exists (select 1 from public.pedidos p where p.cliente_id = c.id);
  get diagnostics v_customers = row_count;

  select coalesce(jsonb_agg(image_storage_path), '[]'::jsonb) into v_storage_paths
  from tmp_smellme_qa_products where image_storage_path like 'products/%' and image_storage_path ~* '\.webp$';
  delete from public.productos p using tmp_smellme_qa_products q where p.id = q.id;
  get diagnostics v_products = row_count;

  v_result := jsonb_build_object('replayed', false, 'ordersDeleted', v_orders,
    'customersDeleted', v_customers, 'productsDeleted', v_products, 'itemsDeleted', v_items,
    'paymentsDeleted', v_payments, 'debtsDeleted', v_debts, 'storagePaths', v_storage_paths);
  update public.smellme_maintenance_runs set status = 'COMPLETE', result = v_result, completed_at = now()
    where action = 'QA_CLEANUP' and idempotency_key = p_idempotency_key;
  return v_result;
end;
$$;

create or replace function public.preview_smellme_catalog_reset_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_result jsonb;
begin
  with classified as (
    select pr.id,
      case
        when pr.stock_reservado > 0 or exists (
          select 1 from public.pedido_items pi join public.pedidos p on p.id = pi.pedido_id
          where pi.producto_id = pr.id and p.estado_pedido in ('NUEVO','AGENDADO','PAGADO','PREPARANDO','DESPACHADO')
        ) then 'BLOQUEADO'
        when exists (select 1 from public.pedido_items pi where pi.producto_id = pr.id) then 'ARCHIVABLE'
        else 'ELIMINABLE'
      end classification
    from public.productos pr
  ), fingerprint as (
    select md5(coalesce(string_agg(id::text || ':' || classification, ',' order by id), '')) value from classified
  )
  select jsonb_build_object(
    'eliminable', (select count(*) from classified where classification = 'ELIMINABLE'),
    'archivable', (select count(*) from classified where classification = 'ARCHIVABLE'),
    'blocked', (select count(*) from classified where classification = 'BLOQUEADO'),
    'totalProducts', (select count(*) from classified),
    'historicalOrders', (select count(*) from public.pedidos),
    'historicalItems', (select count(*) from public.pedido_items),
    'fingerprint', (select value from fingerprint),
    'canExecute', not exists (select 1 from classified where classification = 'BLOQUEADO'),
    'message', case when exists (select 1 from classified where classification = 'BLOQUEADO')
      then 'Hay productos con reservas o pedidos abiertos. El reinicio está bloqueado.'
      else 'La vista previa no modifica datos. Descarga y confirma el respaldo antes de continuar.' end
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.reset_smellme_catalog_v1(p_idempotency_key text, p_expected_fingerprint text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_preview jsonb; v_existing jsonb; v_deleted integer := 0; v_archived integer := 0;
  v_paths jsonb := '[]'::jsonb; v_result jsonb;
begin
  if p_idempotency_key is null or p_idempotency_key !~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{15,127}$' then
    raise exception 'RESET001: clave de idempotencia inválida';
  end if;
  if p_expected_fingerprint is null or p_expected_fingerprint !~ '^[a-f0-9]{32}$' then
    raise exception 'RESET002: fingerprint inválido';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('smellme-catalog-reset', 0));
  select result into v_existing from public.smellme_maintenance_runs
    where action = 'CATALOG_RESET' and idempotency_key = p_idempotency_key and status = 'COMPLETE';
  if v_existing is not null then return v_existing || jsonb_build_object('replayed', true); end if;
  v_preview := public.preview_smellme_catalog_reset_v1();
  if (v_preview->>'fingerprint') <> p_expected_fingerprint then raise exception 'RESET003: el catálogo cambió; genera una nueva vista previa'; end if;
  if (v_preview->>'canExecute')::boolean is not true then raise exception 'RESET004: existen productos bloqueados'; end if;
  insert into public.smellme_maintenance_runs(action, idempotency_key) values ('CATALOG_RESET', p_idempotency_key)
    on conflict (action, idempotency_key) do nothing;

  create temporary table tmp_smellme_reset_products(id uuid primary key, classification text, image_storage_path text) on commit drop;
  insert into tmp_smellme_reset_products
  select pr.id,
    case when exists (select 1 from public.pedido_items pi where pi.producto_id = pr.id) then 'ARCHIVABLE' else 'ELIMINABLE' end,
    pr.image_storage_path from public.productos pr;
  select coalesce(jsonb_agg(image_storage_path), '[]'::jsonb) into v_paths from tmp_smellme_reset_products
    where image_storage_path like 'products/%' and image_storage_path ~* '\.webp$';
  update public.productos p set activo = false, es_top = false, es_oferta_semana = false,
    orden_destacado = null, stock_actual = 0, stock_agenda = 0, stock_minimo = 0,
    image_url = null, image_storage_path = null, badge_label = null, updated_at = now()
  from tmp_smellme_reset_products t where p.id = t.id and t.classification = 'ARCHIVABLE';
  get diagnostics v_archived = row_count;
  delete from public.productos p using tmp_smellme_reset_products t where p.id = t.id and t.classification = 'ELIMINABLE';
  get diagnostics v_deleted = row_count;
  v_result := jsonb_build_object('replayed', false, 'productsDeleted', v_deleted,
    'productsArchived', v_archived, 'historicalOrdersPreserved', (select count(*) from public.pedidos),
    'historicalItemsPreserved', (select count(*) from public.pedido_items), 'storagePaths', v_paths);
  update public.smellme_maintenance_runs set status = 'COMPLETE', result = v_result, completed_at = now()
    where action = 'CATALOG_RESET' and idempotency_key = p_idempotency_key;
  return v_result;
end;
$$;

create or replace function public.claim_smellme_storage_cleanup_v1(p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_run public.smellme_maintenance_runs%rowtype;
begin
  if p_idempotency_key is null or p_idempotency_key !~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{15,127}$' then raise exception 'STORAGE001: clave inválida'; end if;
  perform pg_advisory_xact_lock(hashtextextended('smellme-storage-cleanup', 0));
  select * into v_run from public.smellme_maintenance_runs where action = 'STORAGE_ORPHANS' and idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('replayed', true, 'result', v_run.result); end if;
  insert into public.smellme_maintenance_runs(action, idempotency_key) values ('STORAGE_ORPHANS', p_idempotency_key);
  return jsonb_build_object('replayed', false);
end; $$;

create or replace function public.complete_smellme_storage_cleanup_v1(p_idempotency_key text, p_result jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update public.smellme_maintenance_runs set status = 'COMPLETE', result = coalesce(p_result, '{}'::jsonb), completed_at = now()
    where action = 'STORAGE_ORPHANS' and idempotency_key = p_idempotency_key and status = 'RUNNING';
  if not found then raise exception 'STORAGE002: ejecución no encontrada'; end if;
  return p_result;
end; $$;

-- Retiro defensivo del RPC histórico que borraba toda la operación sin clasificar QA.
revoke all on function public.admin_limpiar_datos_prueba(text, text) from service_role;

revoke all on function public.is_smellme_qa_record_v1(text,text,text,text,text,text,boolean) from public, anon, authenticated;
revoke all on function public.preview_smellme_qa_cleanup_v1() from public, anon, authenticated;
revoke all on function public.cleanup_smellme_qa_data_v1(text) from public, anon, authenticated;
revoke all on function public.preview_smellme_catalog_reset_v1() from public, anon, authenticated;
revoke all on function public.reset_smellme_catalog_v1(text,text) from public, anon, authenticated;
revoke all on function public.claim_smellme_storage_cleanup_v1(text) from public, anon, authenticated;
revoke all on function public.complete_smellme_storage_cleanup_v1(text,jsonb) from public, anon, authenticated;
grant execute on function public.is_smellme_qa_record_v1(text,text,text,text,text,text,boolean) to service_role;
grant execute on function public.preview_smellme_qa_cleanup_v1() to service_role;
grant execute on function public.cleanup_smellme_qa_data_v1(text) to service_role;
grant execute on function public.preview_smellme_catalog_reset_v1() to service_role;
grant execute on function public.reset_smellme_catalog_v1(text,text) to service_role;
grant execute on function public.claim_smellme_storage_cleanup_v1(text) to service_role;
grant execute on function public.complete_smellme_storage_cleanup_v1(text,jsonb) to service_role;
