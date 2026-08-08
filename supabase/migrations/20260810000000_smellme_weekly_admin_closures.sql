-- Perfume Store (Smellme.cl)
-- Fase 7.6A: cierres semanales administrativos -- tabla nueva, aditiva, mas
-- dos funciones (RPC) para cerrar/reabrir de forma atomica. NO se aplica en
-- esta fase (ver docs/SMELLME_WEEKLY_CLOSURES_DESIGN.md): esta migracion
-- queda preparada en el repositorio, pendiente de revision y aplicacion
-- controlada en la Fase 7.6B-1.
--
-- Reglas seguidas (ver diseno):
--   - solo CREATE TABLE IF NOT EXISTS / CREATE INDEX / CREATE OR REPLACE
--     FUNCTION, ningun DROP/RENAME/TRUNCATE;
--   - sin INSERT/UPDATE/DELETE de datos existentes; no toca pedidos,
--     pedido_items, pagos, fiados, clientes, productos, banlist, Top 15 ni
--     Ofertas;
--   - las metricas se calculan en TypeScript (services/cierreSemanalService.ts,
--     reutilizando resolveOrderItemProfitabilityCost), no en SQL -- estas
--     funciones solo validan el periodo, asignan version y escriben el
--     snapshot de forma atomica;
--   - un indice unico parcial impide mas de un cierre CLOSED activo por
--     periodo, sin importar cuantas solicitudes concurrentes lleguen;
--   - solo service_role puede ejecutar las funciones (SECURITY DEFINER,
--     igual que create_perfume_order_v1/cancel_perfume_order_v1); anon y
--     authenticated no tienen ningun privilegio de escritura.

-- ============================================================
-- Tabla: cierres_semanales
-- ============================================================

create table if not exists public.cierres_semanales (
  id uuid primary key default gen_random_uuid(),
  period_start timestamptz not null,
  period_end_exclusive timestamptz not null,
  version integer not null,
  status text not null,
  orders_count integer not null default 0,
  cancelled_orders_count integer not null default 0,
  pending_orders_count integer not null default 0,
  delivered_orders_count integer not null default 0,
  direct_sales_count integer not null default 0,
  gross_sales numeric not null default 0,
  income_amount numeric not null default 0,
  cost_amount numeric not null default 0,
  -- profit_amount NO tiene CHECK >= 0 a proposito: una semana puede cerrar
  -- con perdida real (costos mayores a ventas reconocidas) y eso no debe
  -- rechazarse como si fuera un dato invalido.
  profit_amount numeric not null default 0,
  outstanding_amount numeric not null default 0,
  snapshot_json jsonb not null default '{}'::jsonb,
  closed_at timestamptz not null default now(),
  -- Identidad del administrador (email/nombre, nunca token/sesion), mismo
  -- patron que operaciones_admin_log.ejecutado_por_*. Nullable: un cierre
  -- nunca debe bloquearse si no puede resolverse la identidad del admin.
  closed_by_email text,
  closed_by_nombre text,
  reopened_at timestamptz,
  reopened_by_email text,
  reopened_by_nombre text,
  reopen_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cierres_semanales_status_check check (status in ('CLOSED', 'REOPENED')),
  constraint cierres_semanales_period_check check (period_start < period_end_exclusive),
  constraint cierres_semanales_version_check check (version > 0),
  constraint cierres_semanales_counts_check check (
    orders_count >= 0
    and cancelled_orders_count >= 0
    and pending_orders_count >= 0
    and delivered_orders_count >= 0
    and direct_sales_count >= 0
  ),
  constraint cierres_semanales_amounts_check check (
    gross_sales >= 0
    and income_amount >= 0
    and cost_amount >= 0
    and outstanding_amount >= 0
  ),
  constraint cierres_semanales_reopen_reason_check check (
    reopen_reason is null
    or (char_length(btrim(reopen_reason)) >= 5 and char_length(reopen_reason) <= 500)
  )
);

-- Como maximo UN cierre CLOSED activo por periodo exacto -- esta es la
-- unica proteccion real contra duplicados (no una validacion de
-- aplicacion). Permite multiples filas REOPENED del mismo periodo
-- (historial completo de versiones).
create unique index if not exists cierres_semanales_periodo_activo_idx
  on public.cierres_semanales (period_start, period_end_exclusive)
  where status = 'CLOSED';

-- Orden natural para el historial: periodo mas reciente primero, version
-- mas reciente primero dentro del mismo periodo.
create index if not exists cierres_semanales_periodo_idx
  on public.cierres_semanales (period_start desc, version desc);

-- ============================================================
-- RLS
-- ============================================================

alter table public.cierres_semanales enable row level security;

create policy "admin_can_read_cierres_semanales"
on public.cierres_semanales
for select
to authenticated
using (public.is_active_admin());

-- ============================================================
-- Grants de tabla (mismo patron que clientes/pedidos: anon y authenticated
-- sin privilegios de tabla; la lectura real de la aplicacion siempre pasa
-- por el servidor con service_role, que ignora RLS).
-- ============================================================

revoke all on table public.cierres_semanales from public;
revoke all on table public.cierres_semanales from anon;
revoke all on table public.cierres_semanales from authenticated;
revoke all on table public.cierres_semanales from service_role;

grant select, insert, update on table public.cierres_semanales to service_role;

-- ============================================================
-- RPC: create_weekly_closure_v1
-- Codigos de error (ver lib/weeklyClosureErrors.ts para el mapeo a espanol):
--   WC001 duplicado (indice unico parcial, conflicto real de concurrencia)
--   WC005 periodo invalido
-- ============================================================

create or replace function public.create_weekly_closure_v1(
  p_period_start timestamptz,
  p_period_end_exclusive timestamptz,
  p_metrics jsonb,
  p_admin_email text default null,
  p_admin_nombre text default null
)
returns public.cierres_semanales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version integer;
  v_row public.cierres_semanales;
begin
  if p_period_start >= p_period_end_exclusive then
    raise exception 'El periodo del cierre no es valido.' using errcode = 'WC005';
  end if;

  select coalesce(max(version), 0) + 1
    into v_version
    from public.cierres_semanales
    where period_start = p_period_start
      and period_end_exclusive = p_period_end_exclusive;

  begin
    insert into public.cierres_semanales (
      period_start, period_end_exclusive, version, status,
      orders_count, cancelled_orders_count, pending_orders_count, delivered_orders_count,
      direct_sales_count, gross_sales, income_amount, cost_amount, profit_amount, outstanding_amount,
      snapshot_json, closed_by_email, closed_by_nombre
    ) values (
      p_period_start, p_period_end_exclusive, v_version, 'CLOSED',
      coalesce((p_metrics->>'ordersCount')::integer, 0),
      coalesce((p_metrics->>'cancelledOrdersCount')::integer, 0),
      coalesce((p_metrics->>'pendingOrdersCount')::integer, 0),
      coalesce((p_metrics->>'deliveredOrdersCount')::integer, 0),
      coalesce((p_metrics->>'directSalesCount')::integer, 0),
      coalesce((p_metrics->>'grossSales')::numeric, 0),
      coalesce((p_metrics->>'incomeAmount')::numeric, 0),
      coalesce((p_metrics->>'costAmount')::numeric, 0),
      coalesce((p_metrics->>'profitAmount')::numeric, 0),
      coalesce((p_metrics->>'outstandingAmount')::numeric, 0),
      coalesce(p_metrics, '{}'::jsonb),
      p_admin_email, p_admin_nombre
    )
    returning * into v_row;
  exception
    when unique_violation then
      raise exception 'Ya existe un cierre activo para este periodo.' using errcode = 'WC001';
  end;

  return v_row;
end;
$$;

revoke all on function public.create_weekly_closure_v1(timestamptz, timestamptz, jsonb, text, text) from public;
revoke all on function public.create_weekly_closure_v1(timestamptz, timestamptz, jsonb, text, text) from anon;
revoke all on function public.create_weekly_closure_v1(timestamptz, timestamptz, jsonb, text, text) from authenticated;
grant execute on function public.create_weekly_closure_v1(timestamptz, timestamptz, jsonb, text, text) to service_role;

-- ============================================================
-- RPC: reopen_weekly_closure_v1
-- Codigos de error:
--   WC002 cierre no encontrado
--   WC003 ya estaba reabierto (conflicto explicito, no idempotente)
--   WC004 motivo invalido (menos de 5 o mas de 500 caracteres)
-- ============================================================

create or replace function public.reopen_weekly_closure_v1(
  p_closure_id uuid,
  p_reason text,
  p_admin_email text default null,
  p_admin_nombre text default null
)
returns public.cierres_semanales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.cierres_semanales;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'El motivo de reapertura debe tener entre 5 y 500 caracteres.' using errcode = 'WC004';
  end if;

  select * into v_row from public.cierres_semanales where id = p_closure_id for update;

  if not found then
    raise exception 'Cierre no encontrado.' using errcode = 'WC002';
  end if;

  if v_row.status = 'REOPENED' then
    raise exception 'Este cierre ya fue reabierto.' using errcode = 'WC003';
  end if;

  update public.cierres_semanales
    set status = 'REOPENED',
        reopened_at = now(),
        reopened_by_email = p_admin_email,
        reopened_by_nombre = p_admin_nombre,
        reopen_reason = v_reason,
        updated_at = now()
    where id = p_closure_id
    returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.reopen_weekly_closure_v1(uuid, text, text, text) from public;
revoke all on function public.reopen_weekly_closure_v1(uuid, text, text, text) from anon;
revoke all on function public.reopen_weekly_closure_v1(uuid, text, text, text) from authenticated;
grant execute on function public.reopen_weekly_closure_v1(uuid, text, text, text) to service_role;
