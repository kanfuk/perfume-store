# Environment

## Variables requeridas

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_SECRET_KEY=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
HORAS_EXPIRACION_PEDIDO=72
WHATSAPP_MODE=manual
WHATSAPP_PROVIDER=manual
WHATSAPP_API_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
NEXT_PUBLIC_RIEDMANNS_WHATSAPP_NUMBER=
```

## Reglas

- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` son publicas.
- `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY` y `WHATSAPP_API_TOKEN` son privadas.
- No versionar archivos `.env*`, salvo `.env.example`.

## Rotacion

Si alguna variable privada sale del entorno seguro:

1. Crear nueva credencial en el proveedor correspondiente.
2. Actualizar variables en Vercel y entornos locales necesarios.
3. Invalidar la credencial anterior.
4. Ejecutar una validacion completa de login, pedidos y notificaciones.
