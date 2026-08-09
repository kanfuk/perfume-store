-- Smellme opera con una única cuenta OWNER histórica e inmutable.
-- No crea ni elimina perfiles/Auth: solo normaliza roles OWNER duplicados.

begin;

lock table public.usuarios_admin in share row exclusive mode;

-- La protección anterior permitía degradar un OWNER cuando existía otro.
-- Se retira dentro de esta misma transacción antes de reconciliar duplicados.
drop trigger if exists usuarios_admin_protect_last_owner on public.usuarios_admin;

do $$
declare
  primary_owner_id uuid;
begin
  select id
  into primary_owner_id
  from public.usuarios_admin
  where rol = 'OWNER'
  order by created_at asc, id asc
  limit 1;

  if primary_owner_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'ADMIN_PRIMARY_OWNER_REQUIRED';
  end if;

  -- Solo cambia el rol de los OWNER adicionales. Auth, onboarding, activo,
  -- nombre, email, timestamps y relaciones permanecen intactos.
  update public.usuarios_admin
  set rol = 'ADMIN'
  where rol = 'OWNER'
    and id <> primary_owner_id;
end;
$$;

create unique index if not exists usuarios_admin_single_owner_idx
  on public.usuarios_admin (rol)
  where rol = 'OWNER';

alter table public.usuarios_admin
  drop constraint if exists usuarios_admin_owner_must_be_active_check;

alter table public.usuarios_admin
  add constraint usuarios_admin_owner_must_be_active_check
  check (rol <> 'OWNER' or activo = true);

create or replace function public.prevent_primary_owner_change_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if old.rol = 'OWNER'
     and (
       tg_op = 'DELETE'
       or new.rol <> 'OWNER'
       or new.activo is distinct from true
     )
  then
    raise exception using
      errcode = 'P0001',
      message = 'ADMIN_PRIMARY_OWNER_IMMUTABLE';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_primary_owner_change_v1()
  from public, anon, authenticated;

create trigger usuarios_admin_protect_primary_owner
before update or delete on public.usuarios_admin
for each row execute function public.prevent_primary_owner_change_v1();

comment on index public.usuarios_admin_single_owner_idx is
  'Invariant Smellme: como máximo una fila puede tener rol OWNER.';

comment on function public.prevent_primary_owner_change_v1() is
  'Impide eliminar, degradar o desactivar la única cuenta OWNER histórica.';

commit;
