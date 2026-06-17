-- Pauli Store
-- Esquema inicial para Supabase PostgreSQL

create extension if not exists pgcrypto;

create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  lugar_trabajo text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  precio_venta integer not null,
  image_url text,
  badge_label text,
  costo_unitario integer not null default 0,
  stock_actual integer default 0,
  stock_agenda integer default 0,
  activo boolean default true,
  tipo_producto text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists pedidos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id),
  estado_pedido text not null default 'PENDIENTE',
  estado_pago text not null default 'SIN_PAGO',
  origen_pedido text default 'PUBLICO',
  total integer not null,
  observacion text,
  motivo_cancelacion text,
  fecha_pedido timestamp with time zone default now(),
  fecha_entrega date,
  fecha_agendado timestamp with time zone,
  fecha_cierre timestamp with time zone,
  fecha_cancelacion timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists pedido_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos(id),
  producto_id uuid references productos(id),
  producto_nombre text,
  producto_descripcion text,
  producto_image_url text,
  producto_tipo text,
  cantidad integer not null,
  precio_unitario integer not null,
  subtotal integer not null,
  created_at timestamp with time zone default now()
);

create table if not exists pagos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos(id),
  monto integer not null,
  metodo_pago text,
  estado_pago text not null,
  fecha_pago timestamp with time zone default now(),
  created_at timestamp with time zone default now()
);

create table if not exists fiados (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos(id),
  cliente_id uuid not null references clientes(id),
  monto_pendiente integer not null,
  estado text not null default 'FIADO',
  fecha_fiado timestamp with time zone default now(),
  fecha_pago_fiado timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists usuarios_admin (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  nombre text,
  rol text not null default 'ADMIN',
  activo boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_name = 'pedidos' and column_name = 'origen_pedido'
  ) then
    alter table pedidos add column origen_pedido text default 'PUBLICO';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_name = 'productos' and column_name = 'image_url'
  ) then
    alter table productos add column image_url text;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_name = 'productos' and column_name = 'badge_label'
  ) then
    alter table productos add column badge_label text;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_name = 'productos' and column_name = 'stock_agenda'
  ) then
    alter table productos add column stock_agenda integer default 0;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_name = 'pedidos' and column_name = 'fecha_entrega'
  ) then
    alter table pedidos add column fecha_entrega date;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_name = 'pedido_items' and column_name = 'producto_nombre'
  ) then
    alter table pedido_items add column producto_nombre text;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_name = 'pedido_items' and column_name = 'producto_descripcion'
  ) then
    alter table pedido_items add column producto_descripcion text;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_name = 'pedido_items' and column_name = 'producto_image_url'
  ) then
    alter table pedido_items add column producto_image_url text;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_name = 'pedido_items' and column_name = 'producto_tipo'
  ) then
    alter table pedido_items add column producto_tipo text;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pedidos_estado_pedido_check'
  ) then
    alter table pedidos
    add constraint pedidos_estado_pedido_check
    check (estado_pedido in ('PENDIENTE', 'AGENDADO', 'FINALIZADO', 'CANCELADO'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pedidos_estado_pago_check'
  ) then
    alter table pedidos
    add constraint pedidos_estado_pago_check
    check (estado_pago in ('SIN_PAGO', 'PAGADO', 'FIADO'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pedidos_origen_pedido_check'
  ) then
    alter table pedidos
    add constraint pedidos_origen_pedido_check
    check (origen_pedido in ('PUBLICO', 'ADMIN_DIRECTO', 'PERSONALIZADO'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pedido_items_cantidad_check'
  ) then
    alter table pedido_items
    add constraint pedido_items_cantidad_check
    check (cantidad >= 1);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'productos_precio_check'
  ) then
    alter table productos
    add constraint productos_precio_check
    check (precio_venta >= 0 and costo_unitario >= 0 and stock_actual >= 0 and stock_agenda >= 0);
  end if;
end $$;

create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clientes_set_updated_at on clientes;
create trigger clientes_set_updated_at
before update on clientes
for each row
execute function set_updated_at();

drop trigger if exists productos_set_updated_at on productos;
create trigger productos_set_updated_at
before update on productos
for each row
execute function set_updated_at();

drop trigger if exists pedidos_set_updated_at on pedidos;
create trigger pedidos_set_updated_at
before update on pedidos
for each row
execute function set_updated_at();

drop trigger if exists fiados_set_updated_at on fiados;
create trigger fiados_set_updated_at
before update on fiados
for each row
execute function set_updated_at();

drop trigger if exists usuarios_admin_set_updated_at on usuarios_admin;
create trigger usuarios_admin_set_updated_at
before update on usuarios_admin
for each row
execute function set_updated_at();

alter table clientes enable row level security;
alter table productos enable row level security;
alter table pedidos enable row level security;
alter table pedido_items enable row level security;
alter table pagos enable row level security;
alter table fiados enable row level security;
alter table usuarios_admin enable row level security;

drop function if exists public.rls_auto_enable();

-- Politicas iniciales minimas para MVP.
drop policy if exists "public_can_read_active_products" on productos;
create policy "public_can_read_active_products"
on productos
for select
using (activo = true);

drop policy if exists "admin_can_manage_productos" on productos;
create policy "admin_can_manage_productos"
on productos
for all
to authenticated
using (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
)
with check (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
);

drop policy if exists "public_can_insert_clientes" on clientes;
-- Los inserts de clientes se hacen desde el servidor con service role.
-- No dejamos una politica publica abierta para evitar inserciones directas.

drop policy if exists "admin_can_read_clientes" on clientes;
create policy "admin_can_read_clientes"
on clientes
for select
to authenticated
using (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
);

drop policy if exists "public_can_insert_pedidos" on pedidos;
create policy "public_can_insert_pedidos"
on pedidos
for insert
with check (
  estado_pedido = 'PENDIENTE'
  and estado_pago = 'SIN_PAGO'
  and total >= 0
);

drop policy if exists "admin_can_manage_pedidos" on pedidos;
create policy "admin_can_manage_pedidos"
on pedidos
for all
to authenticated
using (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
)
with check (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
);

drop policy if exists "public_can_insert_pedido_items" on pedido_items;
create policy "public_can_insert_pedido_items"
on pedido_items
for insert
with check (
  cantidad >= 1
  and subtotal >= 0
);

drop policy if exists "admin_can_read_pedido_items" on pedido_items;
create policy "admin_can_read_pedido_items"
on pedido_items
for select
to authenticated
using (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
);

drop policy if exists "admin_can_manage_pagos" on pagos;
create policy "admin_can_manage_pagos"
on pagos
for all
to authenticated
using (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
)
with check (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
);

drop policy if exists "admin_can_manage_fiados" on fiados;
create policy "admin_can_manage_fiados"
on fiados
for all
to authenticated
using (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
)
with check (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
);

drop policy if exists "admin_can_read_own_profile" on usuarios_admin;
create policy "admin_can_read_own_profile"
on usuarios_admin
for select
to authenticated
using (email = auth.email() and activo = true);

create table if not exists operaciones_admin_log (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  periodo text not null,
  ejecutado_por_email text not null,
  ejecutado_por_nombre text,
  resumen jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default now()
);

create table if not exists archivo_clientes (
  id uuid primary key default gen_random_uuid(),
  operacion_id uuid not null references operaciones_admin_log(id),
  original_cliente_id uuid,
  payload jsonb not null,
  created_at timestamp with time zone default now()
);

create table if not exists archivo_pedidos (
  id uuid primary key default gen_random_uuid(),
  operacion_id uuid not null references operaciones_admin_log(id),
  original_pedido_id uuid,
  payload jsonb not null,
  created_at timestamp with time zone default now()
);

create table if not exists archivo_pedido_items (
  id uuid primary key default gen_random_uuid(),
  operacion_id uuid not null references operaciones_admin_log(id),
  original_pedido_item_id uuid,
  payload jsonb not null,
  created_at timestamp with time zone default now()
);

create table if not exists archivo_pagos (
  id uuid primary key default gen_random_uuid(),
  operacion_id uuid not null references operaciones_admin_log(id),
  original_pago_id uuid,
  payload jsonb not null,
  created_at timestamp with time zone default now()
);

create table if not exists archivo_fiados (
  id uuid primary key default gen_random_uuid(),
  operacion_id uuid not null references operaciones_admin_log(id),
  original_fiado_id uuid,
  payload jsonb not null,
  created_at timestamp with time zone default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'operaciones_admin_log_tipo_check'
  ) then
    alter table operaciones_admin_log
    add constraint operaciones_admin_log_tipo_check
    check (tipo in ('CIERRE_MENSUAL', 'LIMPIEZA_PRELANZAMIENTO'));
  end if;
end $$;

create or replace function admin_cerrar_mes_operativo(
  p_admin_email text,
  p_admin_nombre text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operacion_id uuid := gen_random_uuid();
  v_periodo text := to_char(timezone('America/Santiago', now()), 'YYYY-MM');
  v_pedidos integer := 0;
  v_clientes integer := 0;
  v_items integer := 0;
  v_pagos integer := 0;
  v_fiados integer := 0;
  v_total_ventas integer := 0;
  v_pendientes integer := 0;
  v_agendados integer := 0;
  v_resumen jsonb;
begin
  select count(*) into v_pendientes
  from pedidos
  where estado_pedido = 'PENDIENTE';

  select count(*) into v_agendados
  from pedidos
  where estado_pedido = 'AGENDADO';

  if v_pendientes > 0 or v_agendados > 0 then
    raise exception 'No se puede cerrar el mes mientras existan pedidos pendientes o agendados.';
  end if;

  select count(*), coalesce(sum(total), 0)
  into v_pedidos, v_total_ventas
  from pedidos;

  select count(*) into v_clientes from clientes;
  select count(*) into v_items from pedido_items;
  select count(*) into v_pagos from pagos;
  select count(*) into v_fiados from fiados;

  if v_pedidos = 0 and v_clientes = 0 and v_items = 0 and v_pagos = 0 and v_fiados = 0 then
    raise exception 'No hay data operativa para cerrar.';
  end if;

  v_resumen := jsonb_build_object(
    'pedidos', v_pedidos,
    'clientes', v_clientes,
    'items', v_items,
    'pagos', v_pagos,
    'fiados', v_fiados,
    'totalVentas', v_total_ventas
  );

  insert into operaciones_admin_log (
    id,
    tipo,
    periodo,
    ejecutado_por_email,
    ejecutado_por_nombre,
    resumen
  ) values (
    v_operacion_id,
    'CIERRE_MENSUAL',
    v_periodo,
    p_admin_email,
    p_admin_nombre,
    v_resumen
  );

  insert into archivo_clientes (operacion_id, original_cliente_id, payload)
  select v_operacion_id, c.id, to_jsonb(c)
  from clientes c;

  insert into archivo_pedidos (operacion_id, original_pedido_id, payload)
  select v_operacion_id, p.id, to_jsonb(p)
  from pedidos p;

  insert into archivo_pedido_items (operacion_id, original_pedido_item_id, payload)
  select v_operacion_id, pi.id, to_jsonb(pi)
  from pedido_items pi;

  insert into archivo_pagos (operacion_id, original_pago_id, payload)
  select v_operacion_id, pa.id, to_jsonb(pa)
  from pagos pa;

  insert into archivo_fiados (operacion_id, original_fiado_id, payload)
  select v_operacion_id, f.id, to_jsonb(f)
  from fiados f;

  delete from fiados;
  delete from pagos;
  delete from pedido_items;
  delete from pedidos;
  delete from clientes;

  return jsonb_build_object(
    'operationId', v_operacion_id,
    'tipo', 'CIERRE_MENSUAL',
    'periodo', v_periodo,
    'resumen', v_resumen,
    'message', 'Cierre mensual completado. La operacion quedo archivada y el panel operativo quedo limpio.'
  );
end;
$$;

create or replace function admin_limpiar_datos_prueba(
  p_admin_email text,
  p_admin_nombre text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operacion_id uuid := gen_random_uuid();
  v_periodo text := to_char(timezone('America/Santiago', now()), 'YYYY-MM');
  v_pedidos integer := 0;
  v_clientes integer := 0;
  v_items integer := 0;
  v_pagos integer := 0;
  v_fiados integer := 0;
  v_total_ventas integer := 0;
  v_resumen jsonb;
begin
  select count(*), coalesce(sum(total), 0)
  into v_pedidos, v_total_ventas
  from pedidos;

  select count(*) into v_clientes from clientes;
  select count(*) into v_items from pedido_items;
  select count(*) into v_pagos from pagos;
  select count(*) into v_fiados from fiados;

  if v_pedidos = 0 and v_clientes = 0 and v_items = 0 and v_pagos = 0 and v_fiados = 0 then
    raise exception 'No hay data operativa para limpiar.';
  end if;

  v_resumen := jsonb_build_object(
    'pedidos', v_pedidos,
    'clientes', v_clientes,
    'items', v_items,
    'pagos', v_pagos,
    'fiados', v_fiados,
    'totalVentas', v_total_ventas
  );

  insert into operaciones_admin_log (
    id,
    tipo,
    periodo,
    ejecutado_por_email,
    ejecutado_por_nombre,
    resumen
  ) values (
    v_operacion_id,
    'LIMPIEZA_PRELANZAMIENTO',
    v_periodo,
    p_admin_email,
    p_admin_nombre,
    v_resumen
  );

  delete from fiados;
  delete from pagos;
  delete from pedido_items;
  delete from pedidos;
  delete from clientes;

  return jsonb_build_object(
    'operationId', v_operacion_id,
    'tipo', 'LIMPIEZA_PRELANZAMIENTO',
    'periodo', v_periodo,
    'resumen', v_resumen,
    'message', 'Limpieza de datos de prueba completada. Productos y stock se conservaron.'
  );
end;
$$;

alter table operaciones_admin_log enable row level security;
alter table archivo_clientes enable row level security;
alter table archivo_pedidos enable row level security;
alter table archivo_pedido_items enable row level security;
alter table archivo_pagos enable row level security;
alter table archivo_fiados enable row level security;

drop policy if exists "admin_can_read_operaciones_admin_log" on operaciones_admin_log;
create policy "admin_can_read_operaciones_admin_log"
on operaciones_admin_log
for select
to authenticated
using (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
);

drop policy if exists "admin_can_read_archivo_clientes" on archivo_clientes;
create policy "admin_can_read_archivo_clientes"
on archivo_clientes
for select
to authenticated
using (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
);

drop policy if exists "admin_can_read_archivo_pedidos" on archivo_pedidos;
create policy "admin_can_read_archivo_pedidos"
on archivo_pedidos
for select
to authenticated
using (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
);

drop policy if exists "admin_can_read_archivo_pedido_items" on archivo_pedido_items;
create policy "admin_can_read_archivo_pedido_items"
on archivo_pedido_items
for select
to authenticated
using (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
);

drop policy if exists "admin_can_read_archivo_pagos" on archivo_pagos;
create policy "admin_can_read_archivo_pagos"
on archivo_pagos
for select
to authenticated
using (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
);

drop policy if exists "admin_can_read_archivo_fiados" on archivo_fiados;
create policy "admin_can_read_archivo_fiados"
on archivo_fiados
for select
to authenticated
using (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
);
