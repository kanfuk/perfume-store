-- Edicion segura de nombre de producto (Fase: rename seguro).
-- Ver docs/SMELLME_SAFE_PRODUCT_RENAME_DESIGN.md.
--
-- Columna unica, aditiva, sin backfill: al agregar una columna boolean NOT
-- NULL con un valor por defecto constante, Postgres 11+ la resuelve como
-- metadata (sin reescribir la tabla), por lo que es segura incluso sobre
-- una tabla con productos existentes. No se toca ninguna fila existente,
-- no hay UPDATE masivo, no hay reset, no hay perdida de datos.
--
-- Semantica: nombre_bloqueado=true significa que el nombre actual del
-- producto fue corregido manualmente desde Admin y debe preservarse frente
-- a reimportaciones de CSV, salvo que el admin decida explicitamente
-- reemplazarlo (ver reactivarSkus/overrideNombreSkus en
-- services/productoService.ts).

alter table public.productos
  add column if not exists nombre_bloqueado boolean not null default false;
