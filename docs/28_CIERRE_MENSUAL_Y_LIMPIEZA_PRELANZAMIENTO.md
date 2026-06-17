# 28 - Cierre mensual y limpieza pre-lanzamiento

## Objetivo

Agregar en admin una forma segura de:

- cerrar la operacion del mes y partir el siguiente periodo con el panel limpio
- borrar la data simulada antes del lanzamiento publico

Siempre se conservan:

- productos
- stock actual
- stock de agenda

## Acciones disponibles

### 1. Cierre de mes

Disponible desde el panel admin, vista `Reportes`.

Hace lo siguiente:

- valida que no existan pedidos `PENDIENTE` ni `AGENDADO`
- genera un log de operacion
- archiva clientes, pedidos, pedido_items, pagos y fiados
- limpia las tablas operativas para comenzar el siguiente ciclo

No toca:

- productos
- precios
- estado de productos
- stock

## 2. Limpieza de datos de prueba

Disponible desde el panel admin, vista `Reportes`.

Pensada para el momento previo al lanzamiento.

Hace lo siguiente:

- elimina clientes, pedidos, pedido_items, pagos y fiados operativos
- registra una operacion administrativa en el log

No toca:

- productos
- imagenes
- stock
- configuracion del catalogo

## Modelo tecnico

Se agregan tablas nuevas:

- `operaciones_admin_log`
- `archivo_clientes`
- `archivo_pedidos`
- `archivo_pedido_items`
- `archivo_pagos`
- `archivo_fiados`

Se agregan funciones SQL:

- `admin_cerrar_mes_operativo`
- `admin_limpiar_datos_prueba`

Estas funciones viven en `supabase/schema.sql` y se ejecutan desde el backend del proyecto.

## Reglas de seguridad

- el cierre mensual no corre si quedan pedidos pendientes o agendados
- eliminar productos sigue siendo una accion separada
- si un producto ya tiene historial, conviene pausarlo antes que borrarlo
- las operaciones de mantenimiento requieren admin autenticado

## UX admin

En `Reportes` aparece un bloque nuevo:

- `Cerrar mes`
- `Limpiar prueba`

Ambos botones piden confirmacion antes de ejecutar.

## QA recomendado

### Cierre de mes

```text
Probar con pedidos finalizados y cancelados solamente
Confirmar que el cierre responde OK
Confirmar que productos y stock siguen visibles
Confirmar que pedidos, pagos, fiados y clientes desaparecen del panel operativo
Confirmar que si existe un pedido pendiente o agendado, el cierre se bloquea
```

### Limpieza pre-lanzamiento

```text
Generar data de prueba
Ejecutar limpieza
Confirmar que el panel operativo queda vacio
Confirmar que productos y stock no cambian
```

## Nota importante de despliegue

Para que la funcionalidad opere en Supabase real, se debe aplicar el `supabase/schema.sql` actualizado.

Si la base aun no tiene las funciones nuevas, el backend mostrara un mensaje indicando que falta ejecutar el schema actualizado.
