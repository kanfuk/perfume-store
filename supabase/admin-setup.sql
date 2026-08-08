-- Bootstrap excepcional del primer OWNER. Después, usar /admin/usuarios.

insert into usuarios_admin (email, nombre, rol, activo, onboarding_completed_at)
values ('owner@smellme.cl', 'Smellme Owner', 'OWNER', true, now())
on conflict (email) do update
set
  nombre = excluded.nombre,
  rol = excluded.rol,
  activo = excluded.activo,
  onboarding_completed_at = coalesce(usuarios_admin.onboarding_completed_at, now()),
  updated_at = now();
