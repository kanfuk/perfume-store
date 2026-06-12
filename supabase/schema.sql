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
  costo_unitario integer not null default 0,
  stock_actual integer default 0,
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
  total integer not null,
  observacion text,
  motivo_cancelacion text,
  fecha_pedido timestamp with time zone default now(),
  fecha_agendado timestamp with time zone,
  fecha_cierre timestamp with time zone,
  fecha_cancelacion timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists pedido_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos(id),
  producto_id uuid not null references productos(id),
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
    check (precio_venta >= 0 and costo_unitario >= 0);
  end if;
end $$;

create or replace function set_updated_at()
returns trigger
language plpgsql
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

-- Politicas iniciales minimas para MVP.
drop policy if exists "public_can_read_active_products" on productos;
create policy "public_can_read_active_products"
on productos
for select
using (activo = true);

drop policy if exists "public_can_insert_clientes" on clientes;
create policy "public_can_insert_clientes"
on clientes
for insert
with check (true);

drop policy if exists "public_can_insert_pedidos" on pedidos;
create policy "public_can_insert_pedidos"
on pedidos
for insert
with check (
  estado_pedido = 'PENDIENTE'
  and estado_pago = 'SIN_PAGO'
  and total >= 0
);

drop policy if exists "public_can_insert_pedido_items" on pedido_items;
create policy "public_can_insert_pedido_items"
on pedido_items
for insert
with check (
  cantidad >= 1
  and subtotal >= 0
);

-- Las politicas admin autenticadas se afinan cuando integremos Supabase Auth.
