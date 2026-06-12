# 02 - Requerimientos funcionales

## RF-01 - Registro de pedido cliente

El sistema debe permitir que un cliente registre un pedido desde un formulario público.

### Campos

```text
nombre_cliente
telefono_cliente
lugar_trabajo
producto
cantidad
precio_unitario
total
```

### Reglas

- Nombre obligatorio.
- Teléfono obligatorio recomendado.
- Lugar de trabajo obligatorio.
- Producto obligatorio.
- Cantidad mínima: 1.
- Precio unitario obtenido desde producto activo.
- Total calculado automáticamente.
- Pedido nuevo nace como `PENDIENTE`.
- Pago nuevo nace como `SIN_PAGO`.

---

## RF-02 - Visualizar productos activos

El formulario debe mostrar solo productos activos.

Cada producto debe mostrar:

```text
nombre
descripcion
precio_venta
imagen_opcional
```

---

## RF-03 - Cálculo automático del total

El sistema debe calcular:

```text
total = precio_unitario * cantidad
```

El total debe mostrarse antes de enviar el pedido.

---

## RF-04 - Confirmación de pedido registrado

Después de enviar el formulario, mostrar:

```text
Pedido registrado correctamente.
Tu pedido quedó pendiente de confirmación.
Pauli revisará disponibilidad y, si corresponde, lo dejará agendado.
```

---

## RF-05 - Panel administrador

El administrador debe poder:

- Ver pedidos pendientes.
- Ver pedidos agendados.
- Agendar pedidos.
- Cancelar pedidos.
- Marcar pedidos como pagados.
- Marcar pedidos como fiados.
- Ver pedidos finalizados.
- Ver pedidos cancelados.
- Ver fiados pendientes.
- Marcar fiado como pagado.
- Ver resumen de ventas.
- Gestionar productos.

---

## RF-06 - Gestión de productos

El administrador debe poder:

- Crear producto.
- Editar producto.
- Activar producto.
- Desactivar producto.
- Definir precio de venta.
- Definir costo unitario.
- Definir stock referencial.

---

## RF-07 - Gestión de estados de pedido

Estados oficiales:

```text
PENDIENTE
AGENDADO
FINALIZADO
CANCELADO
```

El sistema no debe crear otros estados sin autorización.

---

## RF-08 - Gestión de estados de pago

Estados oficiales:

```text
SIN_PAGO
PAGADO
FIADO
```

El sistema no debe crear otros estados sin autorización.

---

## RF-09 - Cancelación automática de pendientes

El sistema debe cancelar pedidos pendientes con más de 72 horas sin agendar.

Nombre sugerido de función:

```text
cancelarPedidosPendientesExpirados()
```

---

## RF-10 - Reportes básicos

El panel debe mostrar:

- Ventas pagadas del día.
- Ventas pagadas de la semana.
- Total fiado pendiente.
- Pedidos pendientes.
- Pedidos agendados.
- Productos más vendidos.
- Producción sugerida basada en pedidos agendados.
