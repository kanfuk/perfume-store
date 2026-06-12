# 04 - Flujo de negocio y estados

## Flujo principal

```text
1. Pauli comparte link por WhatsApp.
2. Cliente completa formulario.
3. Sistema registra pedido como PENDIENTE y SIN_PAGO.
4. Pauli revisa el panel admin.
5. Pauli agenda o cancela el pedido.
6. Si agenda, el pedido queda AGENDADO.
7. Al resolver el pago, Pauli marca PAGADO o FIADO.
8. Al marcar PAGADO o FIADO, el pedido pasa a FINALIZADO.
9. Si el pedido queda PENDIENTE más de 72 horas, se cancela automáticamente.
```

## Estados oficiales del pedido

```text
PENDIENTE
AGENDADO
FINALIZADO
CANCELADO
```

## Estados oficiales del pago

```text
SIN_PAGO
PAGADO
FIADO
```

## Tabla de significado

| Estado pedido | Significado |
|---|---|
| PENDIENTE | Cliente registró solicitud, pero Pauli no confirma aún. |
| AGENDADO | Pauli aceptó el pedido y lo producirá/entregará. |
| FINALIZADO | Pedido cerrado como pagado o fiado. |
| CANCELADO | Pedido que no se realizará. |

| Estado pago | Significado |
|---|---|
| SIN_PAGO | No hay pago registrado. |
| PAGADO | Cliente pagó. |
| FIADO | Cliente recibió, pero queda debiendo. |

## Transiciones permitidas

```text
PENDIENTE -> AGENDADO
PENDIENTE -> CANCELADO
AGENDADO -> FINALIZADO
AGENDADO -> CANCELADO
FIADO -> PAGADO
```

## Transiciones prohibidas

```text
CANCELADO -> AGENDADO
CANCELADO -> FINALIZADO
FINALIZADO -> PENDIENTE
FINALIZADO -> AGENDADO
PENDIENTE -> PAGADO
PENDIENTE -> FIADO
```

## Regla al marcar pagado

Solo si el pedido está `AGENDADO`:

```text
estado_pago = PAGADO
estado_pedido = FINALIZADO
fecha_cierre = ahora
```

## Regla al marcar fiado

Solo si el pedido está `AGENDADO`:

```text
estado_pago = FIADO
estado_pedido = FINALIZADO
fecha_cierre = ahora
```

## Regla de cancelación automática

Parámetro:

```text
HORAS_EXPIRACION_PEDIDO = 72
```

Condición:

```text
estado_pedido = PENDIENTE
created_at <= ahora - 72 horas
```

Acción:

```text
estado_pedido = CANCELADO
motivo_cancelacion = "Cancelado automáticamente por falta de confirmación"
fecha_cancelacion = ahora
```

## Diagrama simple

```text
[Cliente registra]
        ↓
[PENDIENTE / SIN_PAGO]
        ↓
 ┌─────────────┬─────────────┐
 │             │             │
[AGENDAR]   [CANCELAR]
 │             │
 ↓             ↓
[AGENDADO] [CANCELADO]
 │
 ┌─────────────┬─────────────┐
 │             │
[PAGADO]    [FIADO]
 │             │
 ↓             ↓
[FINALIZADO/PAGADO] [FINALIZADO/FIADO]
```
