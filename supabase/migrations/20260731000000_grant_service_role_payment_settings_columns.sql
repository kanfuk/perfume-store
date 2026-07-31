-- Perfume Store
-- Fase 3B.1A: privilegios minimos para la configuracion de transferencias.
--
-- No modifica estructura ni datos. La aplicacion usa la fila singleton
-- existente exclusivamente desde el servidor: lee id + las seis columnas
-- bancarias y actualiza solo esas seis columnas. anon y authenticated no
-- tienen acceso directo; la API administrativa valida la sesion.

begin;

revoke all on table public.business_settings from anon;
revoke all on table public.business_settings from authenticated;

-- La plantilla original habia heredado estos privilegios no utilizados.
-- Se revocan de forma explicita, sin REVOKE ALL sobre service_role.
revoke truncate, references, trigger
on table public.business_settings
from service_role;

grant select (
  id,
  banco,
  tipo_cuenta,
  numero_cuenta,
  titular_cuenta,
  rut_titular,
  correo
) on table public.business_settings to service_role;

grant update (
  banco,
  tipo_cuenta,
  numero_cuenta,
  titular_cuenta,
  rut_titular,
  correo
) on table public.business_settings to service_role;

commit;
