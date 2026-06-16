# 17 - SQL base sugerido para Supabase

> Este archivo representa el esquema objetivo del MVP. La fuente ejecutable principal sigue siendo `supabase/schema.sql`.

## Estados oficiales

```text
PENDIENTE
AGENDADO
FINALIZADO
CANCELADO
SIN_PAGO
PAGADO
FIADO
```

## Tablas principales

- `clientes`
- `productos`
- `pedidos`
- `pedido_items`
- `pagos`
- `fiados`
- `usuarios_admin`

## Puntos importantes del esquema actual

- `productos` incluye `stock_actual` y `stock_agenda`
- `pedidos` incluye `fecha_entrega`
- `usuarios_admin` controla acceso adicional al panel
- `set_updated_at()` fija `search_path = public`
- RLS esta habilitado en tablas principales

## Politica de acceso esperada

Publico:

- leer productos activos
- crear pedidos
- crear items de pedido

Admin autenticado:

- leer clientes
- gestionar productos
- gestionar pedidos
- gestionar pagos
- gestionar fiados
- leer su propio perfil admin

## Notas operativas

- los inserts de `clientes` se hacen desde servidor
- el cliente no toca estados de pedido ni pago
- si Supabase Advisor sigue mostrando politicas antiguas, volver a correr `supabase/schema.sql`
