-- Perfume Store (Smellme.cl)
-- Fase 7.5A: banlist de clientes -- solo columnas nuevas y aditivas sobre
-- public.clientes. NO se aplica en esta fase (ver
-- docs/SMELLME_CUSTOMER_BANLIST_DESIGN.md): esta migracion queda preparada
-- en el repositorio, pendiente de revision y aplicacion controlada en la
-- Fase 7.5B.
--
-- Reglas seguidas (ver diseno):
--   - solo ADD COLUMN IF NOT EXISTS, ningun DROP/RENAME/TRUNCATE;
--   - "bloqueado" en default false: ningun cliente existente queda
--     bloqueado por esta migracion;
--   - sin INSERT/UPDATE/DELETE de datos;
--   - sin nuevos GRANT/REVOKE: los privilegios ya otorgados sobre
--     public.clientes (ver 20260728010000_runtime_table_privileges.sql,
--     "grant select, insert, update on table public.clientes to
--     service_role") ya cubren estas columnas nuevas exactamente igual que
--     cubren el resto de la tabla -- anon y authenticated siguen en cero
--     privilegios sobre TODA la tabla, incluidas estas columnas;
--   - motivo_bloqueo es exclusivamente administrativo: protegido por el
--     mismo mecanismo que ya protege rut/telefono/email/direccion (cero
--     GRANT de tabla para anon/authenticated).

alter table public.clientes
  add column if not exists bloqueado boolean not null default false,
  add column if not exists motivo_bloqueo text,
  add column if not exists bloqueado_en timestamptz,
  add column if not exists desbloqueado_en timestamptz,
  -- Guarda el user.id (uuid, Supabase Auth) del administrador que bloqueo
  -- por ultima vez -- nunca correo ni nombre como clave, nunca un token.
  -- Ver lib/admin-auth.ts getAuthenticatedAdmin().
  add column if not exists bloqueado_por text;

-- El motivo es obligatorio cuando se bloquea (validado tambien en
-- services/adminCustomerService.ts), pero se refuerza aqui como defensa en
-- profundidad: si existe, debe tener entre 5 y 500 caracteres (trim). Un
-- cliente nunca bloqueado o ya desbloqueado puede tener motivo_bloqueo null
-- (se conserva como referencia si existio) o con contenido previo valido.
-- Postgres no soporta "ADD CONSTRAINT IF NOT EXISTS": se usa un bloque DO
-- para que la migracion siga siendo segura de re-ejecutar.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'clientes_motivo_bloqueo_length'
  ) then
    alter table public.clientes
      add constraint clientes_motivo_bloqueo_length
      check (
        motivo_bloqueo is null
        or (char_length(btrim(motivo_bloqueo)) >= 5 and char_length(motivo_bloqueo) <= 500)
      );
  end if;
end $$;

-- Indice parcial para listar/filtrar clientes bloqueados sin escanear toda
-- la tabla (el panel admin agrega un filtro "Bloqueados").
create index if not exists clientes_bloqueado_idx on public.clientes (bloqueado) where bloqueado = true;
