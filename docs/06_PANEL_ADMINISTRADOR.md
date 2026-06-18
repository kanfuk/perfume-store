# 06 - Panel administrador

## Objetivo

Permitir que Pauli administre pedidos, ventas, stock y clientes sin enredarse desde celular o escritorio.

## Modulos actuales

- `/admin`
- `/admin/pedidos`
- `/admin/stock`
- `/admin/ventas`
- `/admin/reportes`
- `/admin/clientes`
- `/admin/venta-directa`

## Venta directa

La nueva vista `/admin/venta-directa` incorpora:

- modo `Venta de catalogo`
- modo `Pedido personalizado`
- tarjetas de producto coherentes con el cliente
- carrito y total compartidos
- registro rapido pagado o fiado

## UX admin esperada

- mobile-first
- sin tablas frias para vender in situ
- botones grandes
- filtros simples
- texto corto
- acceso rapido a acciones importantes

## Ajustes finales aplicados

- botonera superior simplificada
- `Venta directa` ya no queda duplicada arriba
- vistas internas con encabezado propio
- boton minimal de regreso a Inicio en mobile para vistas internas
- `Limpiar datos de prueba` se retiro de la interfaz de Ventas
- `Cierre de mes` se mantiene disponible
