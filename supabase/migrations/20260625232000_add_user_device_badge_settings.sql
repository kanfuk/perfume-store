create table if not exists public.user_device_badge_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  device_label text,
  badge_enabled boolean not null default false,
  badge_supported boolean not null default false,
  notification_permission text,
  running_as_pwa boolean,
  last_badge_count integer not null default 0,
  last_sync_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create unique index if not exists user_device_badge_settings_user_device_idx
on public.user_device_badge_settings(user_id, device_id);

drop trigger if exists user_device_badge_settings_set_updated_at on public.user_device_badge_settings;
create trigger user_device_badge_settings_set_updated_at
before update on public.user_device_badge_settings
for each row
execute function set_updated_at();

alter table public.user_device_badge_settings enable row level security;

drop policy if exists "admin_can_manage_own_badge_settings" on public.user_device_badge_settings;
create policy "admin_can_manage_own_badge_settings"
on public.user_device_badge_settings
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

