# 04 - Flujo de negocio y estados

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

## Origenes de pedido

```text
PUBLICO
ADMIN_DIRECTO
PERSONALIZADO
```

## Flujo publico

```text
Cliente registra -> PENDIENTE / SIN_PAGO
Pauli agenda -> AGENDADO / SIN_PAGO
Pauli cobra -> FINALIZADO / PAGADO
Pauli deja fiado -> FINALIZADO / FIADO
```

## Flujo de venta directa

```text
Admin directo -> FINALIZADO / PAGADO
Admin directo -> FINALIZADO / FIADO
```

## Flujo de pedido personalizado

```text
Personalizado -> AGENDADO / SIN_PAGO
Personalizado -> FINALIZADO / PAGADO
Personalizado -> FINALIZADO / FIADO
```

## Transiciones permitidas

```text
PENDIENTE -> AGENDADO
PENDIENTE -> CANCELADO
AGENDADO -> FINALIZADO
AGENDADO -> CANCELADO
FIADO -> PAGADO
```
