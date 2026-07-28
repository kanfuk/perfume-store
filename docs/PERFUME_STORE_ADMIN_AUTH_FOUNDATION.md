# Fundación de autenticación y autorización administrativa — Fase 1D-B

- Fecha: 2026-07-28
- Rama: `feature/perfume-store-foundation`
- Fase anterior: [`PERFUME_STORE_REMOTE_DATABASE_DEPLOYMENT.md`](PERFUME_STORE_REMOTE_DATABASE_DEPLOYMENT.md) (Fase 1D-A)
- Alcance: primer administrador autorizado, flujo de recuperación/definición de contraseña, y corrección de los `GRANT` de tabla que bloqueaban el login y el dashboard admin contra el Supabase remoto nuevo.

## 1. Administrador inicial

Existe exactamente un registro en `public.usuarios_admin`, con `rol = ADMIN` y `activo = true`. No se muestra el correo completo ni el UUID en este documento ni en ningún otro artefacto del repositorio. La fila se creó manualmente en el Dashboard de Supabase (Fase 1D-B, sub-fase previa a este cierre); esta fase **no** insertó, editó ni borró filas de `usuarios_admin`.

## 2. Modelo de autorización

- **Autenticación**: Supabase Auth (GoTrue) resuelve quién está identificado (`auth.users`, gestionado por Supabase, no por esta app).
- **Autorización**: `public.usuarios_admin` es la lista blanca — decide quién, además de estar autenticado, puede operar el panel. `getAuthenticatedAdmin()` / `isAdminAuthenticated()` (`lib/admin-auth.ts`) hacen ambos pasos: `auth.getUser()` con el cliente de sesión, y luego un `SELECT` sobre `usuarios_admin` con el cliente `service_role`.
- La función SQL `public.is_active_admin()` (`SECURITY INVOKER`, no `DEFINER`) evalúa `email = auth.email() and activo = true` y es la que usan las políticas RLS del resto de las tablas para el rol `authenticated`.

## 3. Flujo de recuperación / definición de contraseña

1. Admin hace clic en "Crear o recuperar contraseña" en `/admin/login` (`components/admin/AdminLoginForm.tsx`) → `lib/admin/passwordRecovery.ts` → `supabase.auth.resetPasswordForEmail(email, { redirectTo })`. El mensaje mostrado es siempre el mismo exista o no el correo (no revela si una cuenta existe).
2. Supabase envía el correo con un enlace a `/auth/callback?code=...`.
3. `app/auth/callback/route.ts` intercambia el código por una sesión (`exchangeCodeForSession`) y redirige a `/admin/set-password` en cualquier caso (código válido o no; la página siguiente decide qué mostrar).
4. `/admin/set-password` (`components/admin/AdminSetPasswordForm.tsx`) verifica la sesión (`onAuthStateChange` / `getSession()`); si no hay sesión válida, muestra "enlace inválido o expirado". Si la hay, permite definir contraseña (`validateAdminNewPassword`, mínimo 8 caracteres) vía `supabase.auth.updateUser({ password })`, cierra la sesión y redirige a `/admin/login`.

### URLs locales

- Login: `http://localhost:3000/admin/login`
- Callback de auth: `http://localhost:3000/auth/callback`
- Definir contraseña: `http://localhost:3000/admin/set-password`

`proxy.ts` mantiene `/admin/login` y `/admin/set-password` como únicas rutas públicas bajo `/admin`; el resto exige sesión.

## 4. Causa raíz de los grants faltantes (diagnóstico y corrección)

La migración `20260724000000_perfume_store_foundation.sql` ("clean foundation") creó las 15 tablas del proyecto habilitando RLS y políticas, pero **nunca ejecutó el `GRANT` de tabla base** que Postgres exige antes de evaluar RLS. Sin ese `GRANT`, cualquier rol —incluido `service_role`, que ignora RLS pero no el privilegio de tabla— recibía `permission denied` (`SQLSTATE 42501`) al intentar leer o escribir, sin importar la política. El error se manifestó primero como un login que siempre volvía a `/admin/login` (la excepción real se descartaba en un `catch` genérico), y después como `"No fue posible obtener los pedidos."` al cargar el dashboard.

Se corrigió con dos migraciones aditivas, mínimas, sin tocar RLS ni las políticas existentes:

- **`20260728000000_grant_select_usuarios_admin.sql`**: `SELECT` para `authenticated` y `service_role` sobre `usuarios_admin`; `anon` y `PUBLIC` sin ningún privilegio (tampoco `TRUNCATE`/`REFERENCES`/`TRIGGER` de plantilla).
- **`20260728010000_runtime_table_privileges.sql`**: matriz mínima para las 8 tablas operativas que el código realmente consulta (ver tabla abajo). Cada tabla: `revoke all` de los 4 roles primero, después `grant` exacto — nunca `GRANT ALL`.

Ambas migraciones ya están aplicadas contra el proyecto remoto `perfume-store` (ver sección 6). **No ejecutar de nuevo**: `supabase migration list --linked` las muestra alineadas local/remoto.

## 5. Matriz mínima de privilegios operativos

Auditoría exhaustiva de `repositories/**`, `services/**`, `app/api/**` y los componentes que usan el cliente browser. `service_role` es el único rol que usa la app para acceso directo a datos (`createSupabaseServerClient()`); `authenticated` solo se usa desde el navegador para el canal Realtime de pedidos en `AdminDashboard.tsx`.

| Tabla | service_role | authenticated | anon / PUBLIC |
|---|---|---|---|
| `usuarios_admin` | SELECT | SELECT | ninguno |
| `pedidos` | SELECT, INSERT, UPDATE | SELECT (solo por Realtime) | ninguno |
| `pedido_items` | SELECT, INSERT | ninguno | ninguno |
| `clientes` | SELECT, INSERT, UPDATE | ninguno | ninguno |
| `productos` | SELECT, INSERT, UPDATE, DELETE | ninguno | ninguno |
| `pagos` | SELECT, INSERT | ninguno | ninguno |
| `fiados` | SELECT, INSERT, UPDATE | ninguno | ninguno |
| `admin_push_subscriptions` | SELECT, INSERT, UPDATE | ninguno | ninguno |
| `user_device_badge_settings` | SELECT, INSERT, UPDATE | ninguno | ninguno |

Sin `TRUNCATE`/`REFERENCES`/`TRIGGER` para ningún rol de runtime en ninguna tabla. `business_settings`, `operaciones_admin_log` y los 5 `archivo_*` **no se tocaron**: ningún código TypeScript los consulta directamente (solo funciones `SECURITY DEFINER`, que no necesitan grants de tabla para el rol que las invoca). Las RPC transaccionales (`create_perfume_order_v1`, `mark_perfume_order_paid_v1`, `cancel_perfume_order_v1`, `advance_perfume_order_status_v1`, `admin_cerrar_mes_operativo`, `admin_limpiar_datos_prueba`, `next_perfume_order_code`) y la secuencia `perfume_order_code_seq` ya tenían sus permisos correctos desde migraciones anteriores; no se modificaron.

Pruebas versionadas: `supabase/tests/usuarios_admin_grants.sql` y `supabase/tests/runtime_table_privileges.sql` (matriz completa, RLS, políticas, RPCs/secuencia, `supabase_realtime` sin modificar).

## 6. Migraciones remotas aplicadas

Proyecto: `perfume-store` (ref sanitizado: `nxgkudvrotlaqvvhygem`, ver Fase 1D-A). Historial real aplicado contra este proyecto (las migraciones anteriores a `20260724000000` son artefactos heredados de Pauli Store, nunca aplicados aquí):

| # | Migración |
|---|---|
| 1 | `20260724000000_perfume_store_foundation.sql` |
| 2 | `20260724010000_perfume_store_transactional_stock.sql` |
| 3 | `20260726000000_perfume_store_create_order_no_temp_tables.sql` |
| 4 | `20260728000000_grant_select_usuarios_admin.sql` |
| 5 | `20260728010000_runtime_table_privileges.sql` |

`supabase migration list --linked` confirma las 5 alineadas. `supabase db lint --linked --fail-on error`: sin errores.

## 7. Validación manual

El usuario confirmó manualmente, contra el proyecto remoto real: login administrativo, acceso a `/admin`, dashboard, pedidos, stock, clientes, ventas y navegación general del panel — todo funcionando.

## 8. Pendientes conocidos (fuera de alcance de esta fase)

- **Realtime**: `AdminDashboard.tsx` abre un canal `postgres_changes` sobre `public.pedidos`, pero la tabla no está registrada en la publicación `supabase_realtime` (`ALTER PUBLICATION` nunca se ejecutó). No rompe nada — el componente ya hace *polling* como respaldo — pero el canal no entrega eventos en tiempo real hasta que se agregue explícitamente en una fase futura.
- **Vercel**: variables de entorno y dominio de producción todavía no configurados.
- **Importación de catálogo real (CSV)**: pendiente.
- **`business_settings`**: sigue con el valor genérico de la migración de fundación (sin datos bancarios ni de contacto reales).
