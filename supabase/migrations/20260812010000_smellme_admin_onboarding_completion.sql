-- Estado de onboarding administrativo explicito.
-- email_confirmed_at y last_sign_in_at siguen siendo metadatos informativos,
-- pero no determinan si el invitado termino de definir su contrasena.

alter table public.usuarios_admin
  add column if not exists onboarding_completed_at timestamptz;

-- Backfill limitado a perfiles que ya existian antes del flujo de invitacion:
-- la migracion anterior deja invited_at NULL para esos perfiles y siempre lo
-- completa al crear una invitacion nueva. Se exige ademas una identidad Auth
-- vinculada para no habilitar filas huerfanas.
update public.usuarios_admin ua
set onboarding_completed_at = now()
where ua.onboarding_completed_at is null
  and ua.invited_at is null
  and exists (
    select 1
    from auth.users au
    where au.id = ua.auth_user_id
       or lower(au.email) = ua.email
  );

comment on column public.usuarios_admin.onboarding_completed_at is
  'Marca server-side establecida despues de que el propio usuario define su contrasena.';
