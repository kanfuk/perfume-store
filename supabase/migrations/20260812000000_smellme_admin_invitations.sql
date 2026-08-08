-- Registro administrativo exclusivamente por invitacion.
-- Auth conserva credenciales; public.usuarios_admin conserva autorizacion.

alter table public.usuarios_admin
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists invited_at timestamptz;

update public.usuarios_admin
set email = lower(btrim(email))
where email <> lower(btrim(email));

update public.usuarios_admin ua
set auth_user_id = au.id
from auth.users au
where ua.auth_user_id is null
  and lower(au.email) = ua.email;

-- El administrador operativo existente pasa a ser OWNER solo cuando aun no
-- existe ningun OWNER activo. No crea usuarios ni modifica Auth.
update public.usuarios_admin
set rol = 'OWNER'
where id = (
  select id
  from public.usuarios_admin
  where activo = true
  order by created_at, id
  limit 1
)
and not exists (
  select 1
  from public.usuarios_admin
  where activo = true and rol = 'OWNER'
);

create unique index if not exists usuarios_admin_auth_user_id_unique_idx
  on public.usuarios_admin (auth_user_id)
  where auth_user_id is not null;

create unique index if not exists usuarios_admin_email_normalized_unique_idx
  on public.usuarios_admin (lower(email));

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'usuarios_admin_rol_check'
      and conrelid = 'public.usuarios_admin'::regclass
  ) then
    alter table public.usuarios_admin
      add constraint usuarios_admin_rol_check check (rol in ('OWNER', 'ADMIN'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'usuarios_admin_email_normalized_check'
      and conrelid = 'public.usuarios_admin'::regclass
  ) then
    alter table public.usuarios_admin
      add constraint usuarios_admin_email_normalized_check
      check (email = lower(btrim(email)) and length(email) between 3 and 254);
  end if;
end;
$$;

create or replace function public.prevent_last_active_owner_change_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if old.activo = true and old.rol = 'OWNER'
     and (
       tg_op = 'DELETE'
       or new.activo = false
       or new.rol <> 'OWNER'
     )
     and (
       select count(*)
       from public.usuarios_admin
       where activo = true and rol = 'OWNER'
     ) <= 1
  then
    raise exception using
      errcode = 'P0001',
      message = 'ADMIN_LAST_OWNER';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_last_active_owner_change_v1() from public, anon, authenticated;

drop trigger if exists usuarios_admin_protect_last_owner on public.usuarios_admin;
create trigger usuarios_admin_protect_last_owner
before update or delete on public.usuarios_admin
for each row execute function public.prevent_last_active_owner_change_v1();

create or replace function public.is_active_admin()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios_admin
    where usuarios_admin.email = lower(auth.email())
      and usuarios_admin.activo = true
  );
$$;

revoke all on table public.usuarios_admin from public, anon;
revoke insert, update, delete, truncate, references, trigger on table public.usuarios_admin from authenticated;
revoke delete, truncate, references, trigger on table public.usuarios_admin from service_role;
grant select on table public.usuarios_admin to authenticated;
grant select, insert, update on table public.usuarios_admin to service_role;

comment on column public.usuarios_admin.auth_user_id is
  'Vinculo server-only con Supabase Auth; no contiene credenciales.';
comment on column public.usuarios_admin.invited_at is
  'Fecha del ultimo envio de invitacion confirmado por Supabase Auth.';
