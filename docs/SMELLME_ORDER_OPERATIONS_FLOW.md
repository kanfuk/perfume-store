# Smellme.cl — Flujo operativo de pedidos (Fases 3B.1 y 3B.1A)

Rama de trabajo: `feature/order-operations-flow`. Base: `1bc434a`.

## Estados y acciones visibles

| Estado | Acciones |
|---|---|
| `NUEVO` | Atender y solicitar transferencia; Confirmar pago deshabilitado; Cancelar pedido |
| `AGENDADO` | Reenviar datos de pago; Confirmar pago; Cancelar pedido |
| `PAGADO` | Coordinar entrega por WhatsApp; Pago confirmado deshabilitado |
| `CANCELADO` | Sin acciones operativas |

Los estados persistidos siguen siendo `NUEVO`, `AGENDADO`, `PAGADO`,
`PREPARANDO`, `DESPACHADO`, `ENTREGADO` y `CANCELADO`. No se agregó ningún
estado ni se modificó el esquema de pedidos.

## Atender y solicitar transferencia

`PATCH /api/admin/orders/[pedidoId]`, con `action: "agendar"`, ejecuta este
orden:

1. autentica al administrador y valida origen/JSON;
2. carga `business_settings` en el servidor;
3. valida los seis campos bancarios persistidos;
4. si falta o es inválido algún campo, responde `422`,
   `code: "CONFIG_INCOMPLETA"` y entrega el enlace
   `/admin/configuracion?seccion=transferencia`;
5. sólo con configuración válida carga y valida el pedido;
6. cambia `NUEVO -> AGENDADO`, manteniendo `SIN_PAGO`;
7. vuelve a leer el snapshot persistido;
8. construye en servidor el mensaje de WhatsApp.

La configuración incompleta no ejecuta el servicio de pedidos: estado,
pago, stock físico y reserva quedan intactos. Atender no registra una venta
ni contiene una resta manual de stock.

## Reenviar datos de pago

`action: "reenviar-transferencia"` exige un pedido `AGENDADO`, vuelve a
cargar y validar la configuración persistida y reconstruye el mensaje.
Es una operación de lectura: no cambia estado, pago, stock ni reserva y
puede repetirse.

## Confirmar pago

`action: "pagado"` conserva `mark_perfume_order_paid_v1`. La RPC realiza en
una sola transacción la validación, el registro del pago, el consumo de la
reserva y el descuento de stock físico.

`PedidoService.marcarPedidoPagado` conserva la idempotencia de aplicación:
ante `PF010`/`PF012` comprueba si el pedido ya está `PAGADO` y convierte sólo
ese doble envío en no-op. No se reescribió la RPC y no hay registro de venta
o descuento duplicado.

## Coordinar entrega

`action: "coordinar-entrega"` acepta `PAGADO`, `PREPARANDO` o `DESPACHADO`.
Lee el pedido persistido y genera el mensaje adaptado a Starken por pagar o
despacho semanal. No muta estado, pago, stock o reserva y puede repetirse.

## Cancelar

`action: "cancelar"` exige un motivo no vacío y conserva
`cancel_perfume_order_v1`. Para pedidos sin pago la RPC libera la reserva
exactamente una vez; `PF011` se trata como doble envío idempotente. Una
cancelación pagada requiere confirmación explícita de reposición y no se
expone como acción simple en esta interfaz.

## WhatsApp y pop-ups

El cliente abre una ventana placeholder durante el gesto del usuario, antes
de esperar la API. Al recibir el mensaje servidor navega esa misma ventana
a WhatsApp. Si la API falla, la ventana se cierra. Si el navegador la
bloquea, la interfaz ofrece el mensaje para copiar y el enlace “Abrir
WhatsApp manualmente”.

Los mensajes usan montos, líneas, despacho y dirección del snapshot
persistido. Los datos bancarios se cargan en el servidor. El navegador no
envía banco, cuenta, total, precios ni stock. Los helpers omiten campos
opcionales vacíos y nunca imprimen `undefined`/`null`.

## Invariantes transaccionales

- crear el pedido reserva stock mediante `create_perfume_order_v1`;
- atender y reenviar no modifican stock;
- sólo `mark_perfume_order_paid_v1` consume reserva y stock físico;
- sólo `cancel_perfume_order_v1` libera o repone;
- `pedidos.stock_repuesto` evita una segunda liberación/reposición;
- no existe resta manual de stock en el flujo TypeScript.

## Seguridad

La ruta exige sesión administrativa, origen confiable y JSON válido.
Rechaza claves desconocidas, incluido cualquier banco, total o stock
enviado por el cliente. Los mensajes se generan dentro de la ruta con datos
persistidos. Las APIs públicas de productos y pedidos no consultan
`business_settings`.

Venta directa y fotografías no forman parte de estas fases.
