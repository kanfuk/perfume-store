create table if not exists public.admin_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  device_label text,
  notification_permission text,
  running_as_pwa boolean,
  is_active boolean not null default true,
  last_seen_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create unique index if not exists admin_push_subscriptions_user_device_endpoint_idx
on public.admin_push_subscriptions(user_id, device_id, endpoint);

create index if not exists admin_push_subscriptions_is_active_idx
on public.admin_push_subscriptions(is_active);

drop trigger if exists admin_push_subscriptions_set_updated_at on public.admin_push_subscriptions;
create trigger admin_push_subscriptions_set_updated_at
before update on public.admin_push_subscriptions
for each row
execute function set_updated_at();

alter table public.admin_push_subscriptions enable row level security;

drop policy if exists "admin_can_manage_own_push_subscriptions" on public.admin_push_subscriptions;
create policy "admin_can_manage_own_push_subscriptions"
on public.admin_push_subscriptions
for all
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
);
