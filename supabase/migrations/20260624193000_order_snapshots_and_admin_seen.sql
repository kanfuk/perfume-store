alter table if exists public.pedidos
  add column if not exists admin_seen boolean not null default false,
  add column if not exists admin_seen_at timestamptz null;

alter table if exists public.pedido_items
  add column if not exists costo_unitario integer not null default 0,
  add column if not exists total_costo integer not null default 0,
  add column if not exists utilidad_bruta integer not null default 0;
