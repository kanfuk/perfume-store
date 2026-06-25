drop table if exists public.productos_backup_textos_20260623;

drop policy if exists "admin_can_read_clientes" on public.clientes;
create policy "admin_can_read_clientes"
on public.clientes
for select
to authenticated
using (
  exists (
    select 1
    from public.usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
);

drop policy if exists "admin_can_manage_pagos" on public.pagos;
create policy "admin_can_manage_pagos"
on public.pagos
for all
to authenticated
using (
  exists (
    select 1
    from public.usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
)
with check (
  exists (
    select 1
    from public.usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
);

drop policy if exists "admin_can_manage_fiados" on public.fiados;
create policy "admin_can_manage_fiados"
on public.fiados
for all
to authenticated
using (
  exists (
    select 1
    from public.usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
)
with check (
  exists (
    select 1
    from public.usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
);

drop policy if exists "admin_can_read_own_profile" on public.usuarios_admin;
create policy "admin_can_read_own_profile"
on public.usuarios_admin
for select
to authenticated
using (email = auth.email() and activo = true);

revoke all on function public.admin_cerrar_mes_operativo(text, text) from public;
revoke all on function public.admin_cerrar_mes_operativo(text, text) from anon;
revoke all on function public.admin_cerrar_mes_operativo(text, text) from authenticated;
grant execute on function public.admin_cerrar_mes_operativo(text, text) to service_role;

revoke all on function public.admin_limpiar_datos_prueba(text, text) from public;
revoke all on function public.admin_limpiar_datos_prueba(text, text) from anon;
revoke all on function public.admin_limpiar_datos_prueba(text, text) from authenticated;
grant execute on function public.admin_limpiar_datos_prueba(text, text) to service_role;

delete from public.usuarios_admin
where email = 'admin@paulistore.local';
