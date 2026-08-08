-- Bootstrap excepcional del primer OWNER. Después, usar /admin/usuarios.

insert into usuarios_admin (email, nombre, rol, activo)
values ('owner@smellme.cl', 'Smellme Owner', 'OWNER', true)
on conflict (email) do update
set
  nombre = excluded.nombre,
  rol = excluded.rol,
  activo = excluded.activo,
  updated_at = now();
