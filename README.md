# Pauli Store

Aplicacion web responsive para una tienda casera, con flujo publico de pedidos y panel admin conectado a Supabase.

## Estado actual

Hoy el proyecto ya incluye:

- Next.js + TypeScript + Tailwind CSS
- flujo cliente publico para registrar pedidos
- carrito simple e interfaz mobile-first
- validacion de celular chileno
- guardado local de clientes frecuentes en el dispositivo
- modal de confirmacion al agendar pedido
- panel admin con login real usando Supabase Auth
- control adicional contra tabla `usuarios_admin`
- repositorios y servicios con reglas de negocio
- seguridad base en headers, RLS y validaciones servidor
- pruebas automatizadas con Vitest

## Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- Supabase
- Vitest

## Scripts

```bash
npm install
npm run dev
```

Scripts disponibles:

```bash
npm run build
npm run lint
npm run typecheck
npm run test:run
```

## Variables de entorno

Revisar `.env.example`.

Variables principales:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SECRET_KEY=
HORAS_EXPIRACION_PEDIDO=72
```

Notas:

- `SUPABASE_SECRET_KEY` es solo servidor.
- si faltan variables publicas, la app puede caer en modo local segun repositorio usado
- despues de cambiar variables en Vercel hay que redeployar

## Seguridad actual

Implementado:

- headers HTTP defensivos
- `security.txt`
- RLS habilitado en tablas principales
- insercion publica restringida a lo minimo necesario
- formulario admin declarado como `POST`
- recalculo de totales en backend
- cliente sin permisos para cambiar estados de negocio

Pendiente para una fase posterior:

- CSP con nonce por request
- automatizacion WhatsApp
- pulido final del panel admin para uso diario desde celular

## Documentacion clave

- [docs/06_PANEL_ADMINISTRADOR.md](docs/06_PANEL_ADMINISTRADOR.md)
- [docs/10_SEGURIDAD_HEADERS_RLS.md](docs/10_SEGURIDAD_HEADERS_RLS.md)
- [docs/17_SQL_BASE_SUPABASE.md](docs/17_SQL_BASE_SUPABASE.md)
- [docs/18_DEPLOY_VERCEL.md](docs/18_DEPLOY_VERCEL.md)

## Siguiente fase recomendada

1. cerrar UX del panel admin
2. separar mejor stock, cobros y reportes
3. preparar confirmacion automatica por WhatsApp
4. validar flujo completo desde celular con Pauli
