# 10 - Seguridad, headers y RLS

## Objetivo

Dejar el MVP expuesto en internet con una base de seguridad razonable para una tienda real:

- formulario publico simple para clientes
- panel admin protegido con login real
- validaciones en servidor
- politicas RLS coherentes en Supabase
- headers HTTP defensivos en Vercel

## Estado actual aplicado

### Aplicado en codigo

- variables sensibles fuera del frontend
- `SUPABASE_SECRET_KEY` solo en servidor
- login admin con Supabase Auth
- verificacion adicional contra tabla `usuarios_admin`
- recalculo de total en backend
- cliente no puede definir estados de pedidos ni precios finales
- rutas admin separadas de rutas publicas
- headers de seguridad en `next.config.ts`
- `/.well-known/security.txt` publicado
- formularios sensibles declarados con `method="post"`

### Aplicado en base de datos

- RLS habilitado en `clientes`, `productos`, `pedidos`, `pedido_items`, `pagos`, `fiados`, `usuarios_admin`
- politica publica solo para leer productos activos
- politica publica solo para insertar `pedidos` y `pedido_items`
- insercion de `clientes` cerrada al publico; se resuelve desde servidor
- politicas admin para lectura y gestion autenticada en tablas internas
- trigger `set_updated_at()` con `search_path` fijo
- limpieza de funcion antigua `public.rls_auto_enable()`

## Variables de entorno

Archivo `.env.example` esperado:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SECRET_KEY=
HORAS_EXPIRACION_PEDIDO=72
```

Reglas:

- `SUPABASE_SECRET_KEY` nunca va al navegador.
- `NEXT_PUBLIC_*` si pueden vivir en cliente.
- Vercel debe tener las mismas variables en `Production` y `Preview`.

## Headers configurados

Actualmente la app publica:

```text
Content-Security-Policy
Strict-Transport-Security
X-Frame-Options
X-Content-Type-Options
Referrer-Policy
Cross-Origin-Opener-Policy
Cross-Origin-Resource-Policy
X-DNS-Prefetch-Control
X-Permitted-Cross-Domain-Policies
Origin-Agent-Cluster
Permissions-Policy
```

## Resultado de auditorias externas

Se revisaron los reportes de PentestTools sobre:

- sitio cliente
- login admin

### Hallazgos corregidos

1. `Password Submitted in URL`

Corregido declarando `method="post"` en el formulario de acceso admin.

2. `security.txt missing`

Corregido publicando:

```text
/.well-known/security.txt
```

3. `Function Search Path Mutable`

Corregido en `set_updated_at()` fijando:

```sql
set search_path = public
```

4. `RLS Policy Always True` y funcion `rls_auto_enable()`

Se dejo el esquema preparado para eliminar esa apertura antigua y reemplazarla por politicas explicitas.

### Hallazgos que no son criticos o no conviene forzar ahora

1. `Server software and technology found`

Es informativo. El scanner detecta Next.js, React, Vercel y componentes normales del stack. No representa una vulnerabilidad explotable por si sola.

2. `Unsafe security header: Content-Security-Policy`

El punto real es que el CSP actual incluye:

```text
script-src 'self' 'unsafe-inline'
```

Eso no es ideal, pero en Next.js App Router sobre Vercel quitarlo sin una estrategia de nonce por request puede romper hidratacion, navegacion y scripts internos del framework.

Decision actual:

- mantenemos un CSP defensivo en el resto de directivas
- aceptamos temporalmente `unsafe-inline` solo en `script-src`
- dejamos esta observacion como riesgo residual controlado hasta implementar CSP con nonce

## Politicas RLS esperadas

### Publico

Puede:

- leer productos activos
- crear pedidos pendientes
- crear items de pedido

No puede:

- leer pedidos completos
- cambiar estados
- tocar pagos
- tocar fiados
- tocar usuarios admin
- insertar clientes directo en tabla

### Admin autenticado

Puede:

- leer clientes
- gestionar productos
- leer y actualizar pedidos
- gestionar pagos y fiados
- leer su perfil admin activo

## Validaciones de seguridad del negocio

- cantidad >= 1
- telefono chileno valido
- producto debe existir y estar activo
- el precio se toma desde base o repositorio servidor
- el total se recalcula en backend
- estados solo pueden transitar por reglas conocidas
- el cliente no puede marcar pagado, fiado ni cancelado
- se usa campo oculto tipo honeypot para bots basicos

## Ajustes manuales en Supabase que siguen vigentes

Hay cosas que el codigo no puede activar por si solo y deben quedar revisadas en dashboard:

1. `Authentication -> Attack Protection -> Prevent use of leaked passwords`
2. `Authentication -> URL Configuration`
3. usuarios admin reales creados en Auth y reflejados en `usuarios_admin`
4. volver a ejecutar `supabase/schema.sql` cuando se actualicen politicas RLS

## Riesgo residual aceptado

Antes de cierre final del proyecto, aun quedan tareas de seguridad deseables:

- CSP con nonce por request
- rate limit mas fino en endpoints publicos
- captcha opcional si aparece spam real
- auditoria puntual a panel admin final
- integracion de logs de seguridad operativos
