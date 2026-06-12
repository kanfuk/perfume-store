# 10 - Seguridad, headers y RLS

## Objetivo

Aplicar seguridad básica y correcta para una app web pequeña, evitando errores comunes.

## Reglas generales

1. No guardar claves reales en el código.
2. Usar `.env.local` para variables sensibles.
3. Crear `.env.example` sin datos reales.
4. No exponer `SUPABASE_SERVICE_ROLE_KEY` en frontend.
5. Usar Supabase Auth para panel admin.
6. Activar Row Level Security en tablas sensibles.
7. Validar datos antes de guardar.
8. Recalcular precios en lógica de negocio.
9. No confiar en total enviado por el cliente.
10. Proteger rutas `/admin`.

## Variables de entorno

Archivo `.env.example`:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
HORAS_EXPIRACION_PEDIDO=72
```

Regla:

```text
SUPABASE_SERVICE_ROLE_KEY nunca debe usarse en componentes cliente.
```

## Headers recomendados

Configurar en Next.js:

```text
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Security-Policy: definir de forma prudente según recursos usados
```

## RLS en Supabase

Activar Row Level Security en:

```text
clientes
productos
pedidos
pedido_items
pagos
fiados
usuarios_admin
```

## Políticas generales

### Cliente público

Puede:

```text
insertar clientes
insertar pedidos
insertar pedido_items
leer productos activos
```

No puede:

```text
leer todos los pedidos
modificar pedidos
ver ventas
ver fiados
ver panel admin
```

### Admin autenticado

Puede:

```text
leer pedidos
actualizar estados
crear productos
editar productos
ver ventas
ver fiados
marcar fiados como pagados
```

## Validaciones de seguridad

- Cantidad debe ser >= 1.
- Producto debe existir y estar activo.
- Precio se obtiene desde la base, no desde el cliente.
- Total se recalcula antes de guardar.
- Estado debe pertenecer a constantes oficiales.
- Usuario no autenticado no entra a `/admin`.

## Riesgos a evitar

- Exponer claves privadas.
- Permitir que el cliente escriba precio.
- Permitir estados inválidos.
- Permitir pagar pedidos cancelados.
- Permitir ver pedidos de todos desde una ruta pública.
- Crear endpoints sin validación.
