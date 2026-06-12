-- Reemplaza el correo por el mismo que crearas en Supabase Auth.

insert into usuarios_admin (email, nombre, rol, activo)
values ('admin@paulistore.com', 'Pauli Admin', 'ADMIN', true)
on conflict (email) do update
set
  nombre = excluded.nombre,
  rol = excluded.rol,
  activo = excluded.activo,
  updated_at = now();
