# 37 - Estado Actual App 2026-06-23

Este documento resume como quedo **Pauli Store** hoy para retomar trabajo sin reconstruir contexto desde cero.

## Estado general

- Produccion activa en `https://pauli-store-clientes.vercel.app`
- Cliente publico operativo
- Admin operativo con login por Supabase Auth
- Branding visible en cliente y admin
- App orientada a uso mobile-first

## Superficies activas

### Cliente publico

- Hero con identidad visible de Pauli Store
- Catalogo con tarjetas de producto
- Carrito mobile con barra flotante y hoja inferior
- Clientes frecuentes guardados localmente
- Flujo guiado para pedir y confirmar

### Panel admin

- Centro de control
- Pedidos
- Stock
- Ventas
- Clientes
- Reportes
- Venta directa
- Pedido personalizado

## Cambios importantes ya implementados

### Branding y UX

- Logo visible en cliente, login admin y cabeceras admin
- Tipografia mas expresiva
- Mejor jerarquia visual en hero, catalogo y resumen
- Mejor experiencia de pedido en movil

### Textos y ortografia

- Correccion de acentos, `ñ` y copys visibles
- Normalizacion de textos de cliente, admin y WhatsApp

### Stock unificado visible

Regla vigente:

- El admin ve solo un campo `Stock`
- La base mantiene `stock_actual` y `stock_agenda`
- Al crear, editar o descontar stock, ambos quedan sincronizados

Fuente de lectura actual:

```ts
stock_actual ?? stock_agenda ?? 0
```

## Reglas operativas de stock hoy

- El catalogo publico muestra una sola disponibilidad
- El admin no muestra `Stock hoy` ni `Stock agenda` como campos separados
- Pedido publico descuenta stock sincronizado
- Venta directa descuenta stock sincronizado
- Pedido personalizado con producto base descuenta stock sincronizado
- Pedido personalizado sin producto base no toca stock

## Archivos clave para stock unificado

- `lib/stock.ts`
- `repositories/productRepository.ts`
- `services/productoService.ts`
- `services/pedidoService.ts`
- `app/api/admin/products/route.ts`
- `app/api/admin/products/[productId]/route.ts`
- `components/admin/AdminDashboard.tsx`

## Validaciones locales ya pasadas

- `npm run typecheck`
- `npm run lint`
- `npm run build`

## Verificaciones recomendadas en Supabase real

```sql
SELECT
  nombre,
  stock_actual,
  stock_agenda,
  CASE
    WHEN stock_actual = stock_agenda THEN 'OK'
    ELSE 'DESCUADRADO'
  END AS revision
FROM productos
WHERE activo = true
ORDER BY nombre;
```

Objetivo:

- todos los productos activos deben quedar en `OK`

## Notas operativas

- `supabase/.temp/gotrue-version` es ruido temporal del CLI
- `docs.zip` no forma parte del codigo de la app
- para nuevas iteraciones, este documento debe leerse antes de seguir trabajando
