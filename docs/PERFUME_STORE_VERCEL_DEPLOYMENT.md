# Despliegue Vercel — Fase 1D-C/D/E

- Fecha: 2026-07-28
- Rama: `feature/perfume-store-foundation`
- Commit desplegado: `d17f2ed06df57627b3a6b779d3fb0ffa2edd37bc`
- Fase anterior: [`PERFUME_STORE_ADMIN_AUTH_FOUNDATION.md`](PERFUME_STORE_ADMIN_AUTH_FOUNDATION.md) (Fase 1D-B)

## 1. Proyecto Vercel

- **Proyecto**: `perfume-store`
- **Equipo**: `kanfuk-s-projects`
- Proyecto nuevo y aislado — no reutiliza `pauli-store` (verificado antes de crearlo).
- Framework: Next.js (autodetectado). Root Directory: raíz del repositorio. Build Command: `npm run build`. Install Command: `npm install`.
- `.vercel/` permanece ignorado por Git; la vinculación local no generó ningún commit.

## 2. Variables de entorno configuradas (solo nombres)

### Preview
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`, `HORAS_EXPIRACION_PEDIDO`, `WHATSAPP_MODE`, `WHATSAPP_PROVIDER`.

### Production
Los mismos seis nombres, configurados por separado en el scope Production (Vercel no comparte automáticamente variables entre scopes).

No se configuró `SUPABASE_SERVICE_ROLE_KEY` en ningún scope (se usa exclusivamente `SUPABASE_SECRET_KEY`, la clave recomendada actual). Variables opcionales (VAPID, WhatsApp API, número de WhatsApp) **no configuradas todavía** — no son necesarias para este alcance; notificaciones push y WhatsApp automático quedan inactivos de forma segura.

## 3. Deployments

| Rol | ID | URL | Estado |
|---|---|---|---|
| **Preview válido** | `dpl_s8nZPxubQwJ1GZviNRgiDkUbcYFb` | `https://perfume-store-9cs56tmrb-kanfuk-s-projects.vercel.app` | `Ready` |
| **Producción válida** | `dpl_F4TRzwZntswRBCLvaTxX6zrTiSGB` | `https://perfume-store-mmf4ykcru-kanfuk-s-projects.vercel.app` | `Ready` |
| ~~Deployment inicial roto~~ | ~~`dpl_HC2R5reGQzHBFMbVeR8ADfPhyZAZ`~~ | ~~`https://perfume-store-no9akc4a5-kanfuk-s-projects.vercel.app`~~ | **Eliminado** |

**Nota sobre el deployment roto**: el primer `npx vercel` (sin `--prod`) quedó asignado automáticamente a `target: production` por ser el primer deployment del proyecto (comportamiento propio de Vercel, no una flag usada). Como las variables en ese momento solo existían en scope Preview, ese deployment quedó sin configuración de Supabase (`/api/products` servía el catálogo mock, `/admin/login` devolvía `500`). Nunca tuvo alias productivo asignado de forma definitiva y se eliminó una vez confirmado que el nuevo deployment productivo funcionaba correctamente.

## 4. Alias estable de producción

```
https://perfume-store-mu-smoky.vercel.app
```

También resuelven al mismo deployment: `perfume-store-kanfuk-s-projects.vercel.app` y `perfume-store-kanfuk-cell-kanfuk-s-projects.vercel.app` (alias por usuario). Sin dominio personalizado configurado todavía.

## 5. Supabase Auth — URL Configuration

**Site URL**: `https://perfume-store-mu-smoky.vercel.app`

**Redirect URLs activas (coexisten local + Preview + Production)**:
```
http://localhost:3000/auth/callback
http://localhost:3000/admin/set-password
https://perfume-store-9cs56tmrb-kanfuk-s-projects.vercel.app/auth/callback
https://perfume-store-9cs56tmrb-kanfuk-s-projects.vercel.app/admin/set-password
https://perfume-store-mu-smoky.vercel.app/auth/callback
https://perfume-store-mu-smoky.vercel.app/admin/set-password
```

Configuradas manualmente en el Dashboard de Supabase (no por SQL ni CLI).

## 6. Validaciones HTTP

Contra el alias estable de producción (`https://perfume-store-mu-smoky.vercel.app`):

| Ruta | Resultado |
|---|---|
| `GET /` | `200` |
| `GET /admin/login` | `200` — formulario real |
| `GET /admin` (sin sesión) | `307` — redirige a login |
| `GET /api/products` | `200`, `{"products":[]}` — catálogo remoto real, todavía vacío |
| `GET /.well-known/security.txt` | `200` |

Sin `500`, sin stack traces, sin claves expuestas. Headers de seguridad (CSP, HSTS, `X-Frame-Options: DENY`) presentes.

## 7. Validación manual (usuario)

El usuario confirmó manualmente, contra `https://perfume-store-mu-smoky.vercel.app`: login administrativo, autorización correcta, dashboard completo y navegación administrativa funcional — todo end-to-end contra el Supabase remoto real, desde internet.

## 8. Pendientes conocidos

- **Dominio personalizado**: no configurado; se usa el alias `.vercel.app` generado por Vercel.
- **Realtime**: sigue sin activar (`ALTER PUBLICATION` pendiente, ver `PERFUME_STORE_ADMIN_AUTH_FOUNDATION.md`); el panel usa polling como respaldo.
- **Importación de catálogo real (CSV)**: pendiente.
- **Branding**: sin cambios en esta fase.
- **Variables opcionales** (VAPID, WhatsApp API): no configuradas; push y WhatsApp automático inactivos.
- **`business_settings`**: sigue con el valor genérico de la migración de fundación.
