# 02 - Requerimientos funcionales

## RF-01 - Registro de pedido cliente

El sistema permite registrar pedidos desde el formulario publico.

Reglas:

- nombre obligatorio
- telefono obligatorio en flujo publico
- lugar de trabajo obligatorio
- al menos un producto
- cantidad minima 1
- precio tomado desde producto activo
- total calculado automaticamente
- pedido nuevo nace `PENDIENTE`
- pago nuevo nace `SIN_PAGO`

## RF-02 - Visualizar productos activos

El cliente solo ve productos activos con:

- nombre
- descripcion
- precio
- imagen
- badge
- stock visible

## RF-03 - Calculo automatico del total

```text
total = sum(precio_unitario * cantidad)
```

## RF-04 - Confirmacion de pedido cliente

Despues de enviar el formulario, el sistema muestra confirmacion y codigo interno.

## RF-05 - Panel administrador

El admin puede:

- ver pedidos pendientes
- ver pedidos agendados
- ver ventas finalizadas
- ver fiados pendientes
- gestionar productos
- revisar clientes
- revisar reportes

## RF-06 - Gestion de productos

El admin puede:

- crear producto
- editar producto
- activar o desactivar producto
- definir precio
- definir costo
- ajustar stock actual
- ajustar stock agenda

## RF-07 - Estados oficiales de pedido

```text
PENDIENTE
AGENDADO
FINALIZADO
CANCELADO
```

## RF-08 - Estados oficiales de pago

```text
SIN_PAGO
PAGADO
FIADO
```

## RF-09 - Cancelacion automatica de pendientes

Los pedidos pendientes mayores a 72 horas pueden cancelarse automaticamente.

## RF-10 - Reportes basicos

El panel muestra:

- ventas pagadas
- total fiado pendiente
- pedidos pendientes
- pedidos agendados
- productos mas vendidos

## RF-11 - Venta directa desde admin

La ruta `/admin/venta-directa` debe permitir ventas in situ con UX similar al cliente.

Debe incluir:

- catalogo activo con fotos, badges y precio
- carrito con cantidades
- total automatico
- cliente ocasional, existente o nuevo
- cierre como `FINALIZADO / PAGADO`
- cierre como `FINALIZADO / FIADO`

## RF-12 - Pedido personalizado desde admin

Dentro de `/admin/venta-directa` debe existir un modo de pedido personalizado.

Debe permitir:

- cliente
- telefono opcional
- lugar de trabajo opcional
- nombre del producto personalizado
- descripcion
- cantidad
- precio acordado
- costo estimado total opcional
- fecha de entrega opcional
- estado inicial `AGENDADO`, `PAGADO` o `FIADO`

## RF-13 - Catalogo ampliado

El catalogo operativo contempla:

- Dobladita ave mayo
- Dobladita ave pimenton
- Quequito marmoleado
- Quequito banana bread
- Quequito choco chip sugar free
- Carrot cake con nueces
- Queque de platano
- Queque marmoleado
- Pedido personalizado
