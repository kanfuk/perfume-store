-- Cierra la brecha entre la autorizacion de Next.js y las politicas RLS.
-- Una invitacion implicit crea una sesion Auth valida antes de que el usuario
-- termine /admin/set-password; mientras onboarding_completed_at siga NULL no
-- debe poder operar directamente mediante la Data API de Supabase.

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
      and usuarios_admin.onboarding_completed_at is not null
  );
$$;

comment on function public.is_active_admin() is
  'Autoriza RLS solo a perfiles activos que completaron explicitamente su onboarding.';
