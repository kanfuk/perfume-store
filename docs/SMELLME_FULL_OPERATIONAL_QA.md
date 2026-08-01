# Smellme.cl — QA operacional integral

Fecha de ejecución: 2026-07-31. Entorno remoto de Preview/Supabase, escenario
aislado `ZZTEST-QA-FULL-FLOW`. No se usaron productos ni clientes reales.

## Configuración bancaria

Se consultó únicamente un resumen booleano autenticado. Banco, tipo de cuenta,
número de cuenta, titular, RUT y correo resultaron completos. Ningún valor se
imprimió, persistió en informes, capturas, URLs o documentación. El endpoint
`GET /api/admin/settings/payment?summary=1` devuelve ahora solo `completa` y
los seis booleanos por categoría.

## Escenario y resultados

Se creó un producto QA con stock 5 y costo/precio sintéticos. El flujo público
creó un pedido `NUEVO`, reservó una unidad, incrementó el badge y quedó visible
en administración. **Atender** lo cambió a `AGENDADO` y generó un contrato de
cobro que contenía, verificado solo por booleanos: banco, tipo de cuenta,
número, titular, RUT, correo, total y código.

**Reenviar datos** reconstruyó exactamente el mismo contrato sin duplicar
pedido ni reserva. **Confirmar pago** dejó pago/pedido en `PAGADO`, liberó la
reserva y descontó stock físico una sola vez; repetir la confirmación no volvió
a descontar. El pedido avanzó por `PREPARANDO`, `DESPACHADO` y `ENTREGADO`, el
mensaje de coordinación incluyó el código y el badge volvió a su base.

Un segundo pedido reservó una unidad y fue cancelado antes del pago. La reserva
se liberó, el stock físico no cambió, una segunda cancelación fue idempotente y
el pedido quedó fuera de pendientes y ventas.

Se registraron dos ventas directas, una en efectivo y otra por transferencia.
La primera se reintentó con la misma `idempotencyKey`: devolvió el mismo pedido
y no descontó stock otra vez. Cada venta apareció una vez. No se registraron
valores bancarios en logs.

El pedido personalizado se vinculó al cliente y producto QA, quedó con origen
`PERSONALIZADO`, apareció en administración y no incrementó el badge de pedidos
públicos nuevos. Se conservó el único cliente QA del escenario.

## Resumen numérico sintético

| Métrica | Resultado |
|---|---:|
| Ventas cobradas incluidas | 3 |
| Pedidos cancelados contados como venta | 0 |
| Total sintético de ventas | $6.000 |
| Costo snapshot sintético | $3.000 |
| Utilidad sintética | $3.000 |
| Despacho | $0 |
| Stock inicial | 5 |
| Stock físico antes de limpieza | 1 |
| Stock reservado antes de limpieza | 0 |
| Stock disponible conciliado | 1 |

Las tres ventas cobradas corresponden a un pedido público y dos ventas
directas. El cancelado y el personalizado `SIN_PAGO` no se contaron como venta
cobrada. Los costos/utilidad provinieron de snapshots de ítems y no se
duplicaron por idempotencia.

## Limpieza

La migración `cleanup_qa_full_flow_v1` acepta exclusivamente IDs exactos,
comprueba SKU/nombre/prefijo del escenario y ejecuta la limpieza en una sola
transacción. No filtra por fecha ni por coincidencias generales.

Resultado final: 5 pedidos, 1 cliente y 1 producto QA eliminados. La
verificación posterior confirmó producto ausente, pedidos ausentes, cliente
ausente, cero objetos QA huérfanos en `product-images` y cero stock reservado
QA. El informe booleano/numérico se guardó en
`.local-work/full-operational-qa.json`, ignorado por Git. El arnés temporal fue
eliminado y no se commitean datos QA.

## Cobertura automatizada añadida

Se cubren clasificación segura, duplicados, ambigüedad, campos incompletos,
contenido contradictorio, QA, imagen existente, score/contradicción, dominio,
SSRF/DNS/redirect, MIME falso, tamaño, idempotencia por URL/hash, no reemplazo,
pausa/reanudación y concurrencia máxima dos. La cobertura existente valida
Atender, Reenviar, WhatsApp, pago, cancelación, venta directa, stock y reportes;
el QA remoto confirmó esos contratos contra Postgres real.

No se desplegó producción, no se hizo merge de `main` y no se mostraron datos
bancarios reales.
