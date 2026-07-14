# Seguridad

## Variables y credenciales

- Las variables privadas deben vivir solo en entorno servidor.
- `NEXT_PUBLIC_*` queda reservado para datos publicos.
- La clave administrativa de Supabase no debe tener fallback hacia la clave anonima.

Variables que requieren rotacion manual si se exponen fuera de entorno seguro:

- `SUPABASE_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VAPID_PRIVATE_KEY`
- `WHATSAPP_API_TOKEN`

## Supabase

- El acceso auth server usa la publishable key.
- El acceso administrativo usa `SUPABASE_SECRET_KEY` o `SUPABASE_SERVICE_ROLE_KEY`.
- Si falta la clave privilegiada, el servidor falla de forma explicita.

## Controles vigentes

- validaciones de formularios y normalizacion de telefonos
- recalculo backend de pedidos y ventas
- headers HTTP defensivos y `security.txt`
- RLS y tabla `usuarios_admin` para control administrativo

## Pendientes

- revisar politicas RLS tabla por tabla en Supabase real
- confirmar permisos anon/public en entorno remoto
- evaluar rate limiting mas fino para endpoints publicos
- revisar rotacion efectiva de credenciales historicas fuera de este repo
