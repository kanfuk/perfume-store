-- Top 15 híbrido, automático y configurable.
-- MANUAL mantiene exactamente el comportamiento productivo existente.
alter table public.business_settings
  add column if not exists top_ranking_mode text not null default 'MANUAL',
  add column if not exists top_sales_window_days integer default 90;

alter table public.business_settings
  drop constraint if exists business_settings_top_ranking_mode_check,
  add constraint business_settings_top_ranking_mode_check
    check (top_ranking_mode in ('MANUAL', 'AUTOMATIC', 'HYBRID')),
  drop constraint if exists business_settings_top_sales_window_days_check,
  add constraint business_settings_top_sales_window_days_check
    check (top_sales_window_days is null or top_sales_window_days between 1 and 3650);

grant select (top_ranking_mode, top_sales_window_days)
on table public.business_settings to service_role;
grant update (top_ranking_mode, top_sales_window_days)
on table public.business_settings to service_role;

create or replace function public.get_effective_top_products_v1(p_limit integer)
returns table (
  rank integer,
  product_id uuid,
  source text,
  units_sold bigint,
  revenue bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with configuration as (
    select top_ranking_mode as mode, top_sales_window_days as window_days
    from public.business_settings
    where id = '00000000-0000-0000-0000-000000000001'::uuid
  ),
  sales as (
    select
      pi.producto_id,
      sum(pi.cantidad)::bigint as units_sold,
      sum(pi.subtotal)::bigint as revenue
    from public.pedido_items pi
    join public.pedidos pe on pe.id = pi.pedido_id
    cross join configuration c
    where pi.producto_id is not null
      and c.mode in ('AUTOMATIC', 'HYBRID')
      and (
        pe.estado_pago = 'PAGADO'
        or (
          pe.estado_pedido = 'ENTREGADO'
          and pe.estado_pago = 'SIN_PAGO'
          and pe.origen_pedido = 'ADMIN_DIRECTO'
          and exists (
            select 1
            from public.fiados f
            where f.pedido_id = pe.id
          )
        )
      )
      and pe.estado_pedido <> 'CANCELADO'
      and (
        c.window_days is null
        or coalesce(pe.fecha_entrega, pe.fecha_pago, pe.fecha_pedido, pe.created_at)
          >= now() - make_interval(days => c.window_days)
      )
    group by pi.producto_id
  ),
  manual_candidates as (
    select distinct on (p.orden_destacado)
      p.orden_destacado::integer as rank,
      p.id as product_id
    from public.productos p
    where p.es_top
      and p.orden_destacado between 1 and p_limit
    order by p.orden_destacado, p.id
  ),
  manual_result as (
    select
      m.rank,
      m.product_id,
      'MANUAL'::text as source,
      coalesce(s.units_sold, 0)::bigint as units_sold,
      coalesce(s.revenue, 0)::bigint as revenue
    from manual_candidates m
    left join sales s on s.producto_id = m.product_id
    cross join configuration c
    where c.mode in ('MANUAL', 'HYBRID')
  ),
  open_ranks as (
    select
      generated.rank::integer as rank,
      row_number() over (order by generated.rank)::bigint as position
    from generate_series(1, p_limit) as generated(rank)
    cross join configuration c
    where c.mode in ('AUTOMATIC', 'HYBRID')
      and (
        c.mode = 'AUTOMATIC'
        or not exists (select 1 from manual_result m where m.rank = generated.rank)
      )
  ),
  automatic_candidates as (
    select
      s.producto_id,
      s.units_sold,
      s.revenue,
      row_number() over (
        order by s.units_sold desc, s.revenue desc, p.nombre asc, p.id asc
      )::bigint as position
    from sales s
    join public.productos p on p.id = s.producto_id
    cross join configuration c
    where c.mode in ('AUTOMATIC', 'HYBRID')
      and s.units_sold > 0
      and p.activo
      and p.stock_actual > 0
      and p.precio_venta > 0
      and nullif(btrim(p.nombre), '') is not null
      and nullif(btrim(p.marca), '') is not null
      and nullif(btrim(p.contenido), '') is not null
      and (
        c.mode = 'AUTOMATIC'
        or not exists (select 1 from manual_result m where m.product_id = p.id)
      )
  ),
  automatic_result as (
    select
      r.rank,
      a.producto_id,
      'AUTOMATIC'::text as source,
      a.units_sold,
      a.revenue
    from automatic_candidates a
    join open_ranks r on r.position = a.position
  )
  select result.rank, result.product_id, result.source, result.units_sold, result.revenue
  from (
    select * from manual_result
    union all
    select * from automatic_result
  ) result
  order by result.rank;
$$;

revoke all on function public.get_effective_top_products_v1(integer)
from public, anon, authenticated;
grant execute on function public.get_effective_top_products_v1(integer)
to service_role;
