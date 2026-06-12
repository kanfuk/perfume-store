# 11 - QA y plan de pruebas

## Objetivo

Aplicar revisión QA por módulo para evitar fallos de lógica, estados inválidos, errores visuales y problemas de seguridad.

## Checklist QA general

| Criterio | Estado | Evidencia |
|---|---|---|
| Compila sin errores | Pendiente | Ejecutar build |
| TypeScript sin errores | Pendiente | Revisar consola |
| Cumple requerimiento | Pendiente | Comparar con docs |
| Valida campos obligatorios | Pendiente | Prueba manual |
| Maneja casos borde | Pendiente | Cantidad 0, campos vacíos |
| Respeta estados oficiales | Pendiente | Probar transiciones |
| No duplica lógica | Pendiente | Revisar services |
| No mezcla UI con negocio | Pendiente | Revisar componentes |
| Es responsive | Pendiente | Probar móvil |
| Seguridad básica aplicada | Pendiente | Revisar admin/RLS/env |

## QA formulario cliente

Probar:

```text
Nombre vacío
Teléfono vacío
Lugar vacío
Producto no seleccionado
Cantidad 0
Cantidad negativa
Cantidad alta
Producto inactivo
Pedido correcto
Total correcto
Vista móvil
Vista escritorio
```

## QA panel admin

Probar:

```text
Ver pedidos pendientes
Agendar pedido
Cancelar pedido
Marcar pagado
Marcar fiado
Marcar fiado como pagado
Intentar pagar pedido cancelado
Intentar fiar pedido pendiente
Revisar ventas del día
Revisar total fiado
```

## QA de estados

| Caso | Resultado esperado |
|---|---|
| PENDIENTE -> AGENDADO | Válido |
| PENDIENTE -> CANCELADO | Válido |
| AGENDADO -> FINALIZADO/PAGADO | Válido |
| AGENDADO -> FINALIZADO/FIADO | Válido |
| CANCELADO -> PAGADO | Inválido |
| FINALIZADO -> PENDIENTE | Inválido |
| PENDIENTE -> PAGADO | Inválido |

## Prueba 1 - Pedido básico

Entrada:

```text
Nombre: Rodrigo
Teléfono: 999999999
Lugar: Finanzas
Producto: Pan amasado
Cantidad: 2
Precio: 500
```

Resultado esperado:

```text
Total: 1000
estado_pedido: PENDIENTE
estado_pago: SIN_PAGO
```

## Prueba 2 - Agendar pedido

Inicial:

```text
PENDIENTE / SIN_PAGO
```

Acción:

```text
Agendar
```

Esperado:

```text
AGENDADO / SIN_PAGO
fecha_agendado registrada
```

## Prueba 3 - Marcar pagado

Inicial:

```text
AGENDADO / SIN_PAGO
```

Acción:

```text
Marcar pagado
```

Esperado:

```text
FINALIZADO / PAGADO
fecha_cierre registrada
```

## Prueba 4 - Marcar fiado

Inicial:

```text
AGENDADO / SIN_PAGO
```

Acción:

```text
Marcar fiado
```

Esperado:

```text
FINALIZADO / FIADO
registro en fiados
```

## Prueba 5 - Cancelación automática

Inicial:

```text
PENDIENTE
created_at hace más de 72 horas
```

Acción:

```text
cancelarPedidosPendientesExpirados()
```

Esperado:

```text
CANCELADO
motivo_cancelacion = Cancelado automáticamente por falta de confirmación
```
