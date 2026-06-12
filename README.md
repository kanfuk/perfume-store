# Pauli Store

Aplicacion web responsive para gestionar pedidos, ventas, costos y fiados de una minipyme casera.

## Estado actual

Primera iteracion implementada:

- Base con Next.js, TypeScript y Tailwind CSS.
- Arquitectura inicial `app`, `components`, `domain`, `services`, `repositories` y `lib`.
- Formulario cliente funcional conectado a `services` y `API routes`.
- Clases de dominio para cliente, producto, pedido, detalle, venta y fiado.
- Repositories con fallback local y preparacion para Supabase.
- Validaciones iniciales y recalculo de total en backend.
- Pruebas automatizadas con Vitest.

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

Si `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` no estan configuradas, la app usa repositorios locales para seguir operando en desarrollo.

Para escritura privilegiada en servidor con Supabase, usar:

```bash
SUPABASE_SECRET_KEY=
```

Segun la documentacion oficial de Supabase, la secret key debe usarse solo en servidor y nunca exponerse al navegador.

## Siguiente fase recomendada

1. Crear usuario admin en Supabase Auth y registrarlo en `usuarios_admin`.
2. Registrar pagos, fiados y dashboard con resumen real.
3. Gestionar productos desde admin.
