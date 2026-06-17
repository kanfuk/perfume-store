# 18 - Deploy en Vercel

## Objetivo

Publicar Pauli Store en Vercel con Supabase ya conectado, sin exponer claves privadas y con URLs publicas limpias para clientes.

## Estado actual del proyecto

Hoy el deploy ya contempla:

- frontend cliente publico
- panel admin en la misma app bajo `/admin`
- Supabase conectado en produccion
- variables de entorno cargadas en Vercel
- dominio limpio para clientes usando subdominio `vercel.app`
- favicon, apple icon y manifest integrados

## Variables de entorno requeridas

En `Project Settings -> Environment Variables` deben existir:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SECRET_KEY
HORAS_EXPIRACION_PEDIDO=72
```

Aplicarlas al menos en:

```text
Production
Preview
```

## Flujo recomendado de despliegue

```text
1. Conectar el repo GitHub a Vercel
2. Confirmar framework Next.js
3. Cargar variables de entorno
4. Hacer deploy
5. Probar home cliente
6. Probar /admin/login
7. Probar creacion de pedido
8. Probar login admin
9. Probar lectura de pedidos en admin
```

## Supabase despues del deploy

Revisar:

```text
Authentication -> URL Configuration -> Site URL
Authentication -> URL Configuration -> Redirect URLs
Authentication -> Attack Protection
```

La URL principal de sitio debe apuntar al dominio publico que uses para clientes.

## Dominios en Vercel

### Recomendacion actual

Si ya tienes un dominio gratuito mas limpio, por ejemplo:

```text
https://pauli-store-clientes.vercel.app
```

ese puede quedar como URL publica principal para clientes.

### Que pasa con el dominio raro generado por Vercel

No es obligatorio borrarlo para que la app funcione.

Se puede:

- dejarlo como dominio tecnico de respaldo
- o eliminarlo despues si todo el flujo funciona bien

No hay que cambiar codigo solo por dejar un dominio mas limpio, salvo cuando una URL quede escrita en configuraciones externas.

## Cuando si hay que actualizar configuracion

Si cambias el dominio principal, revisa:

1. `Supabase -> URL Configuration`
2. enlaces o bookmarks del admin
3. documentacion interna
4. cualquier integracion futura de WhatsApp o correo
5. `Canonical` de `security.txt` si cambia la URL oficial

## Verificaciones minimas post deploy

Cliente:

- carga productos
- agrega items al carrito
- registra pedido
- muestra modal de confirmacion

Admin:

- abre `/admin/login`
- autentica con Supabase
- entra solo si existe en `usuarios_admin`
- ve pendientes y agendados

Seguridad:

- `/.well-known/security.txt` responde
- no hay claves privadas en navegador
- headers de seguridad presentes
- `/favicon.ico?v=99` responde
- `/apple-touch-icon.png?v=99` responde
- `/android-chrome-192x192.png?v=99` responde
- `/site.webmanifest?v=99` responde
- `/admin.webmanifest?v=99` responde

Acceso directo admin en iPhone:

- abrir el panel desde `/admin` o `/admin/login`
- agregar a pantalla de inicio desde esa misma ruta
- si el icono admin abre cliente, borrar el acceso directo anterior y crearlo de nuevo
- la ruta admin usa `start_url: /admin` mediante `public/admin.webmanifest`

## Incidentes comunes

- key copiada con espacios
- `SUPABASE_SECRET_KEY` mal pegada
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` confundida con secret key
- Site URL vieja en Supabase
- no redeploy despues de cambiar variables
