# 17 - SQL base sugerido para Supabase

> Este archivo es una guía inicial. Codex puede transformarlo en migraciones o scripts SQL reales.

## Estados sugeridos

Usar texto controlado por la aplicación:

```text
PENDIENTE
AGENDADO
FINALIZADO
CANCELADO
SIN_PAGO
PAGADO
FIADO
```

## Tablas base

```sql
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
  cliente_id uuid references clientes(id),
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
  pedido_id uuid references pedidos(id),
  producto_id uuid references productos(id),
  cantidad integer not null,
  precio_unitario integer not null,
  subtotal integer not null,
  created_at timestamp with time zone default now()
);

create table if not exists pagos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid references pedidos(id),
  monto integer not null,
  metodo_pago text,
  estado_pago text not null,
  fecha_pago timestamp with time zone default now(),
  created_at timestamp with time zone default now()
);

create table if not exists fiados (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid references pedidos(id),
  cliente_id uuid references clientes(id),
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
```

## Constraints sugeridas

```sql
alter table pedidos
add constraint pedidos_estado_pedido_check
check (estado_pedido in ('PENDIENTE', 'AGENDADO', 'FINALIZADO', 'CANCELADO'));

alter table pedidos
add constraint pedidos_estado_pago_check
check (estado_pago in ('SIN_PAGO', 'PAGADO', 'FIADO'));

alter table pedido_items
add constraint pedido_items_cantidad_check
check (cantidad >= 1);

alter table productos
add constraint productos_precio_check
check (precio_venta >= 0 and costo_unitario >= 0);
```

## RLS

Activar RLS antes de producción.

```sql
alter table clientes enable row level security;
alter table productos enable row level security;
alter table pedidos enable row level security;
alter table pedido_items enable row level security;
alter table pagos enable row level security;
alter table fiados enable row level security;
alter table usuarios_admin enable row level security;
```

Las políticas específicas deben definirse según autenticación final.
