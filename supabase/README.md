# Supabase setup

## 1. Crear el esquema

En el SQL Editor de Supabase, ejecutar:

1. `supabase/schema.sql`
2. `supabase/seed.sql` si quieres productos iniciales

## 2. Variables necesarias para la app

Desde `Project Settings -> API` copia:

- `Project URL` -> `NEXT_PUBLIC_SUPABASE_URL`
- `anon public key` -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Solo más adelante, si realmente hace falta lógica privilegiada en servidor:

- `service_role key` -> `SUPABASE_SERVICE_ROLE_KEY`
- `secret key` -> `SUPABASE_SECRET_KEY`

## 3. Siguiente integración

Cuando esas variables existan en `.env.local`, la app deja de usar repositorios locales y pasa a usar Supabase automáticamente.

La clave recomendada hoy por Supabase para servidor es la `secret key`. La `service_role` legacy sigue siendo compatible, pero ya no es la opcion preferida.

## 4. Admin Auth real

1. Crear un usuario en `Authentication -> Users` con email y password.
2. Ejecutar `supabase/admin-setup.sql` ajustando el email al mismo usuario.
3. Ese email debe existir en `usuarios_admin` y estar `activo = true`.

## 5. Trabajo desde terminal

El proyecto ya puede trabajar con CLI usando `npx supabase`.

Scripts utiles desde `package.json`:

- `npm run supabase:login`
- `npm run supabase:link`
- `npm run supabase:push -- --linked`
- `npm run supabase:pull`
- `npm run supabase:status`

Para cambios nuevos de base, preferir migraciones en `supabase/migrations/`.
