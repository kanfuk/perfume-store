# Plan de migración remota — `modo_precio` (AUTO/MANUAL)

- Fecha del plan: 2026-07-29
- Fecha de ejecución real: 2026-07-29 (Fase 2B.5)
- Rama: `feature/perfume-store-foundation`
- Commit que contenía la migración al momento de aplicar: `08495f8ed635cf1dfbd5ddd85c662c0977cda035`
- Commit de limpieza previo (ver sección 11): `3eeaecc364a712f9343eedf973f50c147105d859`
- **Estado: APLICADA Y VERIFICADA.**
- Alcance: aplicar `supabase/migrations/20260729020000_smellme_price_mode.sql` al proyecto Supabase de producción de Smellme.cl.

## 1. Migración exacta a aplicar

Archivo: `supabase/migrations/20260729020000_smellme_price_mode.sql`

```sql
alter table public.productos
  add column if not exists modo_precio text not null default 'AUTO';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'productos_modo_precio_check'
  ) then
    alter table public.productos
    add constraint productos_modo_precio_check
    check (modo_precio in ('AUTO', 'MANUAL'));
  end if;
end $$;

comment on column public.productos.modo_precio is
  'AUTO: precio_venta se recalcula desde costo_unitario + el recargo indicado en cada importacion de proveedor o accion "volver a automatico". MANUAL: precio_venta fue fijado a mano por el admin; las importaciones futuras actualizan solo el costo y preservan este precio.';
```

Auditada como **exclusivamente aditiva**: no elimina ni renombra columnas, no recrea `productos`, no toca stock/precios existentes/pedidos/ventas/RLS/grants/roles/`business_settings`, no agrega triggers. El `ADD CONSTRAINT` está envuelto en un bloque idempotente (`pg_constraint` check) porque Postgres no soporta `ADD CONSTRAINT IF NOT EXISTS` de forma nativa — mismo patrón usado en `20260618001444_setup_remote_workflow.sql`.

## 2. Proyecto Supabase objetivo (sanitizado)

El mismo proyecto Supabase de producción ya vinculado a Smellme.cl en fases previas (ver `docs/PERFUME_STORE_VERCEL_DEPLOYMENT.md` y `docs/PERFUME_STORE_REMOTE_DATABASE_DEPLOYMENT.md`). Este documento **no incluye** `project-ref`, URL ni claves — siguiendo la práctica ya establecida en el repositorio (`package.json` tampoco los hardcodea; `supabase:link` se ejecuta sin argumentos).

Al momento de aplicar: vincular **únicamente desde un workspace temporal fuera de este repositorio** (misma práctica de seguridad usada en la Fase 1D-A), nunca desde el checkout real, y nunca commitear el `project-ref` ni la contraseña de la base de datos.

## 3. Estado previo esperado

- `public.productos` existe, sin la columna `modo_precio` (aplicaría por primera vez).
- Catálogo remoto de productos: **vacío** (confirmado en fases 2B/2B.1/2B.2 vía `/api/products` → `{"products":[]}`), por lo que no hay filas de datos comerciales reales en riesgo.
- `business_settings`, RLS, políticas y grants intactos desde la última fase aplicada.

## 4. Consulta SQL de verificación previa

Ejecutar **antes** de aplicar, para confirmar el estado esperado y que la columna no exista ya:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'productos'
order by ordinal_position;

select count(*) as filas_productos from public.productos;

select conname
from pg_constraint
where conname = 'productos_modo_precio_check';
```

Resultado esperado: `modo_precio` ausente de la primera consulta; la tercera consulta sin filas (constraint no existe todavía).

## 5. Comando de aplicación previsto (no ejecutado)

Desde el workspace temporal vinculado (fuera de este repositorio):

```bash
npx supabase link --project-ref <project-ref-real, nunca commitear>
npx supabase db push
```

Alternativa (aplicar solo este archivo, sin arrastrar otras migraciones pendientes): copiar el contenido de `20260729020000_smellme_price_mode.sql` al SQL Editor del dashboard de Supabase y ejecutarlo manualmente una sola vez.

## 6. Consulta posterior de confirmación

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'productos'
  and column_name = 'modo_precio';
-- Esperado: data_type=text, is_nullable=NO, column_default='AUTO'::text

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conname = 'productos_modo_precio_check';
-- Esperado: CHECK ((modo_precio = ANY (ARRAY['AUTO'::text, 'MANUAL'::text])))

select modo_precio, count(*)
from public.productos
group by modo_precio;
-- Esperado: todo en 'AUTO' (catalogo remoto vacio o recien importado, sin ediciones manuales aun)
```

## 7. Smoke test de productos (post-aplicación)

- `GET /api/products` → `200`, catálogo (vacío o el que exista) sin error 500.
- `GET /api/admin/products` (con sesión admin) → `200`, cada producto incluye `modoPrecio` (`"AUTO"` por defecto).
- Preview del importador (`/admin/importar-catalogo`, perfil proveedor) → debe seguir funcionando igual (no depende de `modo_precio` para el preview, solo para el confirm de productos ya existentes).

## 8. Verificación de login admin

- `GET /admin/login` → `200`.
- Login real con una cuenta de `usuarios_admin` válida → sesión creada, redirige al panel.
- `GET /admin` autenticado → carga sin error (la migración no toca `usuarios_admin`, RLS ni políticas, por lo que no debería haber impacto, pero se verifica igual antes de dar por cerrado el cambio).

## 9. Verificación de stock y pedidos

- `select stock_actual, stock_reservado, stock_agenda, activo from public.productos limit 20;` → valores idénticos a los previos a la migración (la migración no los toca).
- Un pedido de prueba ya existente (si lo hay) sigue mostrando sus líneas/montos sin cambios en `/admin/pedidos` o `/admin/ventas`.
- Confirmar que `pedido_items` y las RPC transaccionales (`create_perfume_order_v1`) no fueron tocadas por esta migración (no aparecen referenciadas en el archivo SQL).

## 10. Rollback seguro

Si fuera estrictamente necesario revertir:

```sql
alter table public.productos drop constraint if exists productos_modo_precio_check;
alter table public.productos drop column if exists modo_precio;
```

**Advertencia explícita:** eliminar la columna **borra permanentemente** la distinción AUTO/MANUAL de cada producto. Si para ese momento ya se usó la edición de precios en producción (algún producto quedó en `MANUAL`), ese estado se pierde sin posibilidad de recuperación desde la base de datos — el código volvería a tratar todos los productos como si nunca hubiesen tenido un precio fijado a mano.

**Por lo tanto, este rollback NO debe ejecutarse después de uso productivo** sin antes:
1. Exportar `select id, sku, nombre, modo_precio, precio_venta from public.productos where modo_precio = 'MANUAL';` a un respaldo fuera de la base de datos.
2. Confirmar con el negocio que la pérdida de esa distinción es aceptable, o migrar esa información a otro mecanismo antes de eliminar la columna.

Si el objetivo es solo "desactivar" la funcionalidad sin perder datos, preferir dejar la columna intacta (con su default `'AUTO'`) y simplemente no exponer la UI de edición de precios, en vez de ejecutar el rollback destructivo.

## 11. Hallazgo durante la ejecución: migraciones stale de Pauli Store

Antes de poder aplicar `20260729020000` de forma limpia, el primer `db push --linked --dry-run` falló con `LegacyDbPushMissingRemoteError`, exigiendo `--include-all` para insertar 9 archivos de migración de junio (`20260618001444` a `20260626120000`) que preceden cronológicamente a la fundación real de este proyecto (`20260724000000_perfume_store_foundation.sql`).

Auditoría de esos 9 archivos confirmó que son **residuos de Pauli Store** (el proyecto anterior del que se bootstrapeó este repositorio), nunca aplicados a `perfume-store` y peligrosos de aplicar ahora:
- 2 insertaban productos de repostería ("Dobladita", "Quequito", "Queque") directamente en `productos`, varios con `activo = true` (quedarían visibles en el storefront público de Smellme.cl).
- 1 ejecutaba una fusión de clientes con nombres reales de Pauli Store hardcodeados, lo que habría creado clientes falsos en `clientes`.
- 1 recreaba 4 políticas RLS, re-otorgaba grants sobre funciones admin, y ejecutaba `DELETE FROM usuarios_admin WHERE email='admin@paulistore.local'`.
- Los 5 restantes eran redundantes con la fundación (mismas tablas/columnas ya creadas allí) o específicos de repostería.

**Resolución:** se eliminaron los 9 archivos del repositorio real (commit `3eeaecc364a712f9343eedf973f50c147105d859`, `chore(supabase): remove stale Pauli Store migration files`, pusheado a `origin/feature/perfume-store-foundation` antes de tocar Supabase) y del workspace temporal. Ningún archivo legítimo se perdió: todo lo que esos 9 archivos también creaban ya está consolidado en `20260724000000_perfume_store_foundation.sql` y `supabase/schema.sql`, que no se modificaron.

Tras la limpieza, el dry-run mostró **exclusivamente**:

```json
{"upToDate":false,"dryRun":true,"migrations":["20260729020000_smellme_price_mode.sql"],"seeds":[],"roles":[],"message":"Finished supabase db push."}
```

## 12. Resultado del `db push` real

```json
{"upToDate":false,"dryRun":false,"migrations":["20260729020000_smellme_price_mode.sql"],"seeds":[],"roles":[],"message":"Finished supabase db push."}
```

Aplicada una sola vez, sin errores.

## 13. Verificación posterior (ejecutada)

- **Columna:** `modo_precio | text | is_nullable=NO | column_default='AUTO'::text` ✅
- **Constraint:** `productos_modo_precio_check` → `CHECK ((modo_precio = ANY (ARRAY['AUTO'::text, 'MANUAL'::text])))` ✅
- **Comentario:** presente, explica AUTO y MANUAL tal como se redactó en la migración ✅
- **Conteos de control (antes → después, idénticos):** `productos: 0→0`, `pedidos: 0→0`, `pedido_items: 0→0`, `clientes: 0→0` — catálogo remoto sigue vacío, sin efectos secundarios ✅
- **Distribución `modo_precio`:** 0 filas (no hay productos aún; no aplica error) ✅
- **Historial de migraciones (`migration list --linked`):** las 6 migraciones (5 de la fundación + `20260729020000`) muestran `local == remote`; `20260729020000` aparece una sola vez ✅
- **`db lint --linked`:** `No schema errors found` ✅

## 14. Smoke test administrativo (solo lectura, ejecutado)

- `GET /` → 200
- `GET /admin/login` → 200
- `GET /api/products` → 200, `{"products":[]}` (la consulta `select("*")` sobre `productos`, que ahora incluye `modo_precio`, no falla)
- `GET /admin` sin sesión → 307 a `/admin/login` (comportamiento sin cambios)
- Login autenticado real y carga del dashboard admin: **no verificado en este smoke test** (sin credenciales admin disponibles en este entorno de ejecución; no se creó ninguna cuenta para no tocar Auth). Recomendado como verificación manual pendiente.

## 15. Confirmación de ausencia de efectos secundarios

- Ningún producto fue creado, importado ni activado.
- Ningún cliente fue creado ni modificado.
- `usuarios_admin`, RLS, políticas y grants: sin cambios (la única migración aplicada no los toca).
- `business_settings`: sin cambios (no referenciado por la migración).
- Rollback: **no ejecutado.**

## Explícitamente NO ejecutado contra producción en esta fase

- `supabase migration repair`
- `supabase db reset` / `seed`
- `supabase db diff`
- SQL manual adicional fuera de la migración auditada
- Cambios en Auth o Storage
- Importación de CSV real
- Escritura o activación de productos
- `npx vercel --prod`
- Merge a `main` o creación de tag
