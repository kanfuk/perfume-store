# Smellme MVP V2 — mantenimiento seguro

## Alcance

`/admin/mantenimiento` requiere una sesión admin activa. Abrir la pantalla no escribe datos.
Las vistas previas y descargas usan `Cache-Control: private, no-store`; las mutaciones además
exigen origen confiable, JSON, campos exactos, rate limit, frase literal e idempotencia.

## Datos QA

La autoridad final vive en `cleanup_smellme_qa_data_v1`. La API no recibe IDs. La función
recalcula candidatos dentro de una transacción y solo reconoce evidencia explícita:

- nombre o SKU con prefijo `ZZTEST`;
- email de harness bajo `example.com`;
- nombre documentado `QA Smellme Full Flow`;
- idempotencia con prefijo `QA-` u observación `ZZTEST`/`QA:`;
- ruta QA explícita o registro previo en `smellme_qa_registry`.

Fecha, estado, origen de venta o monto pequeño no son evidencia. Los clientes con pedidos
ajenos y los productos con historial ajeno o reservas pasan a revisión manual. Antes de
borrar pedidos QA, la función revierte sus reservas o unidades vendidas para no alterar el
inventario real. La frase es `ELIMINAR DATOS DE PRUEBA`.

## Respaldo y reinicio

El respaldo JSON/CSV exporta únicamente catálogo: ficha, precios, costos, stock, flags e
imágenes. Excluye clientes, teléfonos, emails, direcciones, pagos y datos bancarios.

La vista previa clasifica cada producto:

- `ELIMINABLE`: sin referencias históricas;
- `ARCHIVABLE`: con snapshots históricos y sin operación abierta;
- `BLOQUEADO`: con reserva o pedido no finalizado.

Un bloqueado aborta todo el reinicio. El fingerprint impide ejecutar sobre un catálogo que
cambió desde la vista previa. Los archivables se pausan y conservan; los eliminables se
retiran. Pedidos e items históricos no se modifican. Frase: `REINICIAR CATALOGO SMELLME`.

## Storage

El análisis recorre solo el bucket `product-images`, prefijo `products/`. Una ruta es huérfana
si existe en Storage, termina en `.webp`, es administrada por la app y no aparece en
`productos.image_storage_path`. Las rutas `products/qa/` se excluyen de esta operación y se
tratan únicamente mediante la limpieza QA. El servidor recalcula dos veces y nunca acepta
paths del navegador. Frase: `ELIMINAR ARCHIVOS HUERFANOS`.

## Rollback

No existe rollback automático para una operación confirmada. Para catálogo se restaura desde
el respaldo descargado; los snapshots de pedidos permanecen disponibles. Si Storage falla
después de una transacción, la API informa revisión manual y no intenta borrar rutas externas.
La migración crea funciones pero no ejecuta QA cleanup, reset ni borrado de archivos.
