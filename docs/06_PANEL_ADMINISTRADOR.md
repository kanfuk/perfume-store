# 06 - Panel administrador

## Objetivo

Permitir que Pauli y el administrador gestionen pedidos, productos, ventas y fiados desde celular o computador.

## Reglas generales

- El panel requiere login.
- Solo usuarios admin pueden entrar.
- Las acciones deben ser rápidas.
- El panel debe funcionar bien desde celular.

## Secciones principales

```text
Dashboard
Pedidos pendientes
Pedidos agendados
Fiados
Productos
Ventas
Reportes
Configuración
```

## Dashboard

Tarjetas sugeridas:

```text
Pedidos pendientes
Pedidos agendados
Ventas pagadas del día
Total fiado
Productos activos
Producción sugerida
```

## Pedidos pendientes

Mostrar:

```text
Cliente
Teléfono
Lugar de trabajo
Producto
Cantidad
Total
Fecha
Acciones
```

Acciones:

```text
Agendar
Cancelar
```

## Pedidos agendados

Mostrar:

```text
Cliente
Producto
Cantidad
Total
Fecha agendada
Acciones
```

Acciones:

```text
Marcar pagado
Marcar fiado
Cancelar
```

## Fiados

Mostrar:

```text
Cliente
Teléfono
Lugar de trabajo
Producto
Monto adeudado
Fecha
Acción: Marcar como pagado
```

## Productos

Acciones:

```text
Crear producto
Editar producto
Activar producto
Desactivar producto
Definir precio de venta
Definir costo unitario
Definir stock referencial
```

## Ventas

Mostrar:

```text
Ventas pagadas del día
Ventas pagadas de la semana
Ventas pagadas del mes
Costo estimado
Utilidad estimada
```

## Producción sugerida

Basarse principalmente en pedidos `AGENDADOS`.

Ejemplo:

```text
Pan amasado: 20 unidades
Queque: 8 unidades
Pack especial: 5 unidades
```

## Botones importantes

Para pedido pendiente:

```text
[Agendar] [Cancelar]
```

Para pedido agendado:

```text
[Marcar pagado] [Marcar fiado] [Cancelar]
```

Para fiado:

```text
[Marcar como pagado]
```
