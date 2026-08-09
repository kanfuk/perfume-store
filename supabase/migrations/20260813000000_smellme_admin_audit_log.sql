-- Bitacora administrativa append-only. Solo OWNER puede leerla desde una
-- sesion normal; las escrituras del backend usan service_role.
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_admin_id uuid references public.usuarios_admin(id) on delete set null,
  actor_auth_user_id uuid references auth.users(id) on delete set null,
  actor_role text not null check (actor_role in ('OWNER', 'ADMIN', 'SYSTEM')),
  action text not null check (length(action) between 3 and 80),
  entity_type text not null check (length(entity_type) between 1 and 80),
  entity_id text,
  request_id uuid not null,
  before_snapshot jsonb,
  after_snapshot jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists admin_audit_log_created_at_idx
  on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_actor_action_idx
  on public.admin_audit_log (actor_admin_id, action, created_at desc);
create index if not exists admin_audit_log_entity_idx
  on public.admin_audit_log (entity_type, entity_id, created_at desc);

alter table public.admin_audit_log enable row level security;

drop policy if exists "owner_can_read_admin_audit_log" on public.admin_audit_log;
create policy "owner_can_read_admin_audit_log"
on public.admin_audit_log for select to authenticated
using (
  exists (
    select 1 from public.usuarios_admin ua
    where ua.email = lower(auth.jwt() ->> 'email')
      and ua.rol = 'OWNER'
      and ua.activo = true
      and ua.onboarding_completed_at is not null
  )
);

create or replace function public.prevent_admin_audit_log_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'ADMIN_AUDIT_LOG_APPEND_ONLY';
end;
$$;

drop trigger if exists admin_audit_log_append_only on public.admin_audit_log;
create trigger admin_audit_log_append_only
before update or delete on public.admin_audit_log
for each row execute function public.prevent_admin_audit_log_mutation();

revoke all on table public.admin_audit_log from public, anon, authenticated, service_role;
grant select, insert on table public.admin_audit_log to service_role;
grant select on table public.admin_audit_log to authenticated;

