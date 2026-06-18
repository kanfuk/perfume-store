# 28 - Venta directa, pedido personalizado, productos y limpieza

## 1. Estado actual del proyecto

Pauli Store ya cuenta con flujo cliente publico, panel admin modular, venta directa y pedido personalizado en una misma experiencia.

## 2. Nueva seccion Venta directa

Ruta nueva:

- `/admin/venta-directa`

Incluye:

- venta de catalogo
- resumen de carrito
- registro rapido `PAGADO` o `FIADO`

## 3. Flujo de venta in situ

- seleccionar productos activos
- ajustar cantidades
- indicar cliente opcional
- marcar pago o fiado
- guardar como `FINALIZADO`

Origen:

- `ADMIN_DIRECTO`

## 4. Pedido personalizado

Se implemento como segundo modo dentro de la misma ruta.

Permite:

- cliente
- producto libre
- descripcion
- cantidad
- precio acordado
- costo estimado opcional
- fecha de entrega opcional
- estado inicial `AGENDADO`, `PAGADO` o `FIADO`

Origen:

- `PERSONALIZADO`

## 5. Productos agregados

- Dobladita ave mayo
- Dobladita ave pimenton
- Quequito marmoleado
- Quequito banana bread
- Quequito choco chip sugar free
- Carrot cake con nueces
- Queque de platano
- Queque marmoleado
- Pedido personalizado

## 6. Productos desactivados

No se eliminaron productos historicos desde codigo.

## 7. Fotos agregadas

- `public/images/products/dobladita-ave-mayo.png`
- `public/images/products/dobladita-ave-pimenton.jpeg`
- `public/images/products/quequito-marmoleado.png`
- `public/images/products/quequito-banana-bread.png`
- `public/images/products/quequito-choco-chip-sugar-free.png`
- `public/images/products/carrot-cake-nueces.png`
- `public/images/products/queque-platano.png`
- `public/images/products/queque-marmoleado.png`
- `public/images/products/pedido-personalizado.png`

## 8. Cambios de base de datos si aplica

Se extendio `supabase/schema.sql` para soportar:

- `pedidos.origen_pedido`
- `pedido_items.producto_id` nullable
- snapshot de producto personalizado en `pedido_items`

## 9. Cambios de UX cliente

- extraccion de componentes compartidos de catalogo, carrito y cantidad

## 10. Cambios de UX admin

- acceso visible a Venta directa
- modo catalogo y personalizado en una sola pantalla
- coherencia visual con el cliente

## 11. Correcciones de scroll

- nueva vista sin tablas frias
- uso de `min-w-0`, `max-w-full` y safe-area

## 12. Limpieza de codigo

Se extrajeron:

- `components/shared/ProductCard.tsx`
- `components/shared/ProductCatalog.tsx`
- `components/shared/CartSummary.tsx`
- `components/shared/QuantitySelector.tsx`
- `lib/order-helpers.ts`

## 13. Archivos eliminados o mantenidos

Se conservaron docs historicos y no se borraron productos con historial.

## 14. QA realizado

Comandos ejecutados:

```bash
npm run typecheck
npm run lint
npm run build
```

## 15. Pendientes futuros

- aplicar SQL nuevo en la base productiva si aun no esta migrada
- validar venta directa y pedido personalizado con datos reales en telefono fisico
- definir si se desea descontar stock automaticamente al cerrar ventas
