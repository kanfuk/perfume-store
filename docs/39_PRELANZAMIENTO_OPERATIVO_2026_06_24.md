# 39 - Prelanzamiento Operativo 2026-06-24

Este documento resume la pasada final de cierre operativo hecha sobre produccion, Supabase y estructura del repo.

## Alcance de esta pasada

- limpieza final de iconos y assets
- verificacion de manifests, favicon y rutas publicas
- chequeo remoto de produccion
- chequeo remoto de datos en Supabase
- revision rapida de seguridad visible
- poda documental para dejar claro que archivos siguen vigentes

## Verificaciones realizadas

### Produccion web

Se verifico respuesta `200` en:

- `/`
- `/admin/login`
- `/api/products`
- `/.well-known/security.txt`
- `/site.webmanifest`
- `/admin.webmanifest`
- `/favicon.ico`
- `/icons/apple-touch-icon.png`
- `/icons/android-chrome-192x192.png`

### Flujo admin sin sesion

- `/admin` redirige correctamente a `/admin/login`
- `/api/admin/orders` responde `401 No autorizado` sin sesion

### Seguridad visible

Se confirmaron headers activos en produccion:

- `Content-Security-Policy`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy`
- `Strict-Transport-Security`
- `Permissions-Policy`

### Supabase remoto

Se verifico:

- sin productos con la ruta vieja `/images/dobladita-napolitana.png`
- sin descuadres entre `stock_actual` y `stock_agenda`
- sin pedidos pendientes ni agendados al momento del chequeo

## Hallazgos importantes

### 1. Catalogo publico remoto hoy muestra solo 1 producto activo

Estado observado en Supabase al `2026-06-24`:

- solo `Carrot Cake con Nueces` esta `activo = true`
- el resto del catalogo publico aparece pausado

Impacto:

- `https://pauli-store-clientes.vercel.app/api/products` devuelve solo 1 producto
- esto puede ser una decision operativa real o un desajuste de configuracion del catalogo

Recomendacion:

- revisar desde admin que productos deben quedar visibles antes de considerar cerrado el lanzamiento

### 2. Warning manual de Supabase Auth

Sigue pendiente una advertencia del Advisor:

- `Leaked Password Protection Disabled`

Impacto:

- no rompe la app ni el login actual
- pero conviene activarlo para bloquear passwords filtradas

Recomendacion:

- activar el switch en el dashboard de Supabase Auth

## Limpieza aplicada despues del chequeo

- se elimino `admin@paulistore.local` de `usuarios_admin`
- se elimino `admin@paulistore.local` de Supabase Auth
- se elimino la tabla backup `productos_backup_textos_20260623`
- se cerraron permisos RPC de mantenimiento a `anon` y `authenticated`

## Activos vigentes para mantenimiento

Si se retoma el proyecto despues, leer primero:

1. `README.md`
2. `docs/38_ESTADO_ACTUAL_APP_2026_06_24.md`
3. `docs/39_PRELANZAMIENTO_OPERATIVO_2026_06_24.md`
4. `docs/18_DEPLOY_VERCEL.md`

## Limite de esta pasada

No fue posible validar desde un iPhone fisico real ni hacer taps manuales en pantalla de inicio desde este entorno. El badge PWA y el flujo tactil final deben confirmarse en dispositivo real.
