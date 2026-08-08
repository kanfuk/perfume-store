-- Cuentas de cobro operativas por ADMIN y trazabilidad inmutable de los
-- mensajes de transferencia. La cuenta global de business_settings se
-- conserva por compatibilidad, pero deja de ser fuente para estos mensajes.

create table if not exists public.admin_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null unique references public.usuarios_admin(id) on delete restrict,
  banco text not null,
  banco_otro text,
  tipo_cuenta text not null,
  tipo_cuenta_otro text,
  titular text not null,
  rut_titular text not null,
  numero_cuenta text not null,
  correo text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_payment_accounts_banco_check
    check (length(btrim(banco)) between 1 and 80),
  constraint admin_payment_accounts_banco_otro_check
    check (
      (banco = 'OTRO_BANCO' and banco_otro is not null and length(btrim(banco_otro)) between 1 and 80)
      or (banco <> 'OTRO_BANCO' and banco_otro is null)
    ),
  constraint admin_payment_accounts_tipo_cuenta_check
    check (length(btrim(tipo_cuenta)) between 1 and 40),
  constraint admin_payment_accounts_tipo_cuenta_otro_check
    check (
      (tipo_cuenta = 'OTRA' and tipo_cuenta_otro is not null and length(btrim(tipo_cuenta_otro)) between 1 and 40)
      or (tipo_cuenta <> 'OTRA' and tipo_cuenta_otro is null)
    ),
  constraint admin_payment_accounts_titular_check
    check (length(btrim(titular)) between 1 and 120),
  constraint admin_payment_accounts_rut_check
    check (length(btrim(rut_titular)) between 8 and 12),
  constraint admin_payment_accounts_numero_check
    check (length(btrim(numero_cuenta)) between 1 and 30),
  constraint admin_payment_accounts_correo_check
    check (length(btrim(correo)) between 3 and 254)
);

create or replace function public.enforce_admin_payment_account_profile_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1
    from public.usuarios_admin
    where id = new.admin_user_id
      and rol = 'ADMIN'
  ) then
    raise exception using errcode = 'P0001', message = 'ADMIN_PAYMENT_ACCOUNT_REQUIRES_ADMIN';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_admin_payment_account_profile_v1()
  from public, anon, authenticated;

drop trigger if exists admin_payment_accounts_require_admin on public.admin_payment_accounts;
create trigger admin_payment_accounts_require_admin
before insert or update of admin_user_id on public.admin_payment_accounts
for each row execute function public.enforce_admin_payment_account_profile_v1();

drop trigger if exists admin_payment_accounts_set_updated_at on public.admin_payment_accounts;
create trigger admin_payment_accounts_set_updated_at
before update on public.admin_payment_accounts
for each row execute function public.set_updated_at();

create table if not exists public.admin_payment_message_audits (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete restrict,
  operator_admin_user_id uuid not null references public.usuarios_admin(id) on delete restrict,
  receiver_admin_user_id uuid not null references public.usuarios_admin(id) on delete restrict,
  payment_account_id uuid not null references public.admin_payment_accounts(id) on delete restrict,
  action text not null,
  bank_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  constraint admin_payment_message_audits_action_check
    check (action in ('AGENDAR', 'REENVIAR_TRANSFERENCIA')),
  constraint admin_payment_message_audits_snapshot_check
    check (jsonb_typeof(bank_snapshot) = 'object')
);

create index if not exists admin_payment_message_audits_pedido_idx
  on public.admin_payment_message_audits (pedido_id, created_at, id);
create index if not exists admin_payment_message_audits_operator_idx
  on public.admin_payment_message_audits (operator_admin_user_id, created_at desc);
create index if not exists admin_payment_message_audits_receiver_idx
  on public.admin_payment_message_audits (receiver_admin_user_id, created_at desc);

create or replace function public.prevent_admin_payment_message_audit_change_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode = 'P0001', message = 'ADMIN_PAYMENT_AUDIT_IMMUTABLE';
end;
$$;

revoke all on function public.prevent_admin_payment_message_audit_change_v1()
  from public, anon, authenticated;

drop trigger if exists admin_payment_message_audits_immutable on public.admin_payment_message_audits;
create trigger admin_payment_message_audits_immutable
before update or delete on public.admin_payment_message_audits
for each row execute function public.prevent_admin_payment_message_audit_change_v1();

alter table public.admin_payment_accounts enable row level security;
alter table public.admin_payment_message_audits enable row level security;

revoke all on table public.admin_payment_accounts from public, anon, authenticated;
revoke all on table public.admin_payment_message_audits from public, anon, authenticated;
revoke delete, truncate, references, trigger on table public.admin_payment_accounts from service_role;
revoke update, delete, truncate, references, trigger on table public.admin_payment_message_audits from service_role;
grant select, insert, update on table public.admin_payment_accounts to service_role;
grant select, insert on table public.admin_payment_message_audits to service_role;

comment on table public.admin_payment_accounts is
  'Cuenta de transferencia 1:1 de un perfil operativo ADMIN. Sin credenciales bancarias.';
comment on table public.admin_payment_message_audits is
  'Bitacora inmutable de cada mensaje de cobro generado, con operador, receptor y snapshot bancario.';
comment on column public.admin_payment_message_audits.bank_snapshot is
  'Datos de transferencia exactos comunicados al cliente; cambios posteriores de cuenta no alteran este historico.';
