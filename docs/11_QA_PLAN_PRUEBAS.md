# 11 - QA y plan de pruebas

## Comandos tecnicos

```bash
npm run typecheck
npm run lint
npm run build
```

## Rutas a revisar

```text
/
/#hacer-pedido
/admin
/admin/pedidos
/admin/stock
/admin/ventas
/admin/reportes
/admin/clientes
/admin/venta-directa
```

## Cliente

- ver catalogo
- confirmar fotos de todos los productos activos
- agregar producto
- cambiar cantidad
- registrar pedido
- confirmar `PENDIENTE / SIN_PAGO`
- confirmar sin scroll horizontal

## Admin general

- login
- navegar modulos
- confirmar que ya no aparece navbar inferior admin
- volver a Inicio desde vistas internas
- validar boton minimal de Inicio en mobile
- validar boton flotante de WhatsApp y apertura del mensaje
- revisar filtros y cards en 360px, 375px, 390px y 430px

## Scroll interno admin

- abrir `/admin/stock`
- crear y editar producto
- bajar hasta `Guardar producto`
- validar que footer y safe-area no tapen botones
- abrir acciones de pedido y confirmar que el modal no se corta
- confirmar que no queda espacio blanco enorme al final del admin

## Venta directa

- registrar venta pagada
- registrar venta fiada
- validar `FINALIZADO / PAGADO`
- validar `FINALIZADO / FIADO`
- validar aparicion en ventas y reportes
- confirmar mismas fotos que cliente

## Pedido personalizado

- registrar `AGENDADO / SIN_PAGO`
- registrar `FINALIZADO / PAGADO`
- registrar `FINALIZADO / FIADO`
- validar aparicion en pedidos, ventas, fiados y reportes
- confirmar que se llega al final del formulario en mobile
