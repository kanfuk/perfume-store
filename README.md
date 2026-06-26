# Pauli Store

Aplicacion web responsive para una tienda casera, con flujo publico de pedidos y panel admin conectado a Supabase.

## Estado actual

Hoy el proyecto ya incluye:

- Next.js + TypeScript + Tailwind CSS
- flujo cliente publico para registrar pedidos
- carrito mobile-first con resumen flotante y hoja inferior
- validacion de celular chileno
- guardado local de clientes frecuentes en el dispositivo
- modal de confirmacion al agendar pedido
- panel admin con login real usando Supabase Auth
- branding visible de Pauli Store en cliente y admin
- venta directa y pedido personalizado desde admin
- seleccion de clientes existentes en venta directa y pedido personalizado
- stock unificado visible en admin, sincronizado con `stock_actual` y `stock_agenda`
- filtros de stock simplificados a `Activos`, `Pausados` y `Todos`
- autopausa de productos cuando el stock llega a `0`
- agrupacion de fiados por cliente con cobro consolidado por WhatsApp
- contador de pedidos por atender ajustado al estado real de atencion admin
- badge PWA/iPhone con activacion por dispositivo y chip compacto en el header admin
- unificacion segura de clientes duplicados y sugerencias para evitar nuevos duplicados
- reportes sin card de `Ticket promedio`
- control adicional contra tabla `usuarios_admin`
- repositorios y servicios con reglas de negocio
- seguridad base en headers, RLS y validaciones servidor
- pruebas automatizadas con Vitest
- favicon pack completo para navegador, iOS y Android

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
- QA funcional en Supabase real para stock unificado y cierres operativos

## Produccion actual

- URL publica: `https://pauli-store-clientes.vercel.app`
- ultimo deploy validado: `2026-06-25`
- estado operativo resumido: [docs/40_ESTADO_ACTUAL_APP_2026_06_25.md](docs/40_ESTADO_ACTUAL_APP_2026_06_25.md)

## Iconografia y manifest

La app ya integra:

- `app/favicon.ico`
- `app/icon.png`
- `app/apple-icon.png`
- `public/favicon.ico`
- `public/icons/apple-touch-icon.png`
- `public/icons/android-chrome-192x192.png`
- `public/icons/android-chrome-512x512.png`
- `public/site.webmanifest`
- `public/admin.webmanifest`
- `public/icons/` con el set vigente del logo de Pauli Store

Verificacion recomendada despues del deploy:

```text
/favicon.ico?v=99
/icons/apple-touch-icon.png?v=99
/icons/android-chrome-192x192.png?v=99
/site.webmanifest?v=99
/admin.webmanifest?v=99
```

Acceso directo admin en iPhone:

- abrir `https://tu-dominio/admin` o `https://tu-dominio/admin/login`
- usar `Compartir -> Agregar a pantalla de inicio`
- si ya existia un acceso directo viejo, eliminarlo y crearlo de nuevo para que tome `start_url: /admin`
- para ver badge en el icono, abrir la PWA instalada y aceptar el permiso con `Activar badge en icono`

Uso rapido del badge:

- si el badge aun no esta activo, el panel muestra una card grande `Badge del icono`
- al activarlo correctamente, esa card desaparece y queda un chip pequeno en el header
- `Probar badge` muestra un `1` momentaneo y luego vuelve al contador real de pendientes
- si iPhone muestra permiso denegado, hay que habilitarlo desde Ajustes y volver a abrir la PWA desde el icono

Clientes y stock:

- pedidos pendientes, dashboard y badge usan la misma logica central de pendientes
- cuando el stock llega a `0`, el producto pasa a `Pausado` automaticamente
- para volver a publicarlo, primero hay que reponer stock y luego activarlo manualmente
- nombres equivalentes como `Paty`, `Yo` o `camila montes` se normalizan para evitar duplicados
- en el formulario publico se sugieren clientes recientes por nombre, telefono o lugar de trabajo

## Mejora Stock movil

- se agregaron `selects`, `datalist` y ajustes rapidos para editar producto, tipo, precio, stock y estado desde celular
- se corrigio el desborde horizontal en la vista Stock y en el modal de producto
- se ajusto el render responsive para iPhone/PWA sin dejar el layout corrido al salir de Stock
- se mantuvo la logica `Activo/Pausado`
- stock `0` sigue pausando el producto automaticamente

Migraciones recientes:

- `20260625232000_add_user_device_badge_settings.sql`
- `20260625235500_merge_duplicate_customers.sql`

## Documentacion clave

- [docs/06_PANEL_ADMINISTRADOR.md](docs/06_PANEL_ADMINISTRADOR.md)
- [docs/10_SEGURIDAD_HEADERS_RLS.md](docs/10_SEGURIDAD_HEADERS_RLS.md)
- [docs/17_SQL_BASE_SUPABASE.md](docs/17_SQL_BASE_SUPABASE.md)
- [docs/18_DEPLOY_VERCEL.md](docs/18_DEPLOY_VERCEL.md)
- [docs/28_CIERRE_MENSUAL_Y_LIMPIEZA_PRELANZAMIENTO.md](docs/28_CIERRE_MENSUAL_Y_LIMPIEZA_PRELANZAMIENTO.md)
- [docs/40_ESTADO_ACTUAL_APP_2026_06_25.md](docs/40_ESTADO_ACTUAL_APP_2026_06_25.md)

## Siguiente fase recomendada

1. validar en Supabase real que `stock_actual = stock_agenda` despues de editar y vender
2. confirmar en produccion la reasociacion de pedidos manuales al cliente correcto cuando se dejan fiados
3. ejecutar limpieza final de datos de prueba antes del lanzamiento
4. validar flujo completo desde celular con Pauli usando datos reales
