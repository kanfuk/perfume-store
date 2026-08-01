# Smellme 2.0.0-rc.1 — auditoría de release

## Base y alcance

- Rama base auditada: `feature/image-source-reconciliation` en `955781dc2eeef64341ef946265fdd7be896cd133`.
- Rama de entrega: `feature/mvp-v2-cleanup-and-release`.
- `main` permanece fuera de alcance y no se despliega a producción.
- Una sola migración nueva: `20260805000000_smellme_mvp_v2_maintenance.sql`.

## Integridad histórica

`pedido_items.producto_id` es nullable y usa `ON DELETE SET NULL`. Cada item conserva snapshots
de SKU, nombre, marca, contenido, descripción, imagen, tipo, precio, costo, utilidad y subtotal.
Los listados y reportes construyen sus valores desde estos snapshots; una referencia viva al
producto no es obligatoria. `pedidos.cliente_id` sí es obligatorio, por lo que la limpieza QA
solo elimina clientes después de comprobar que ya no tienen pedidos ajenos.

No existe tabla `reservas`: las reservas viven en `productos.stock_reservado` y estados de
pedido. Por eso el reset bloquea productos con reserva o pedidos abiertos. El cierre mensual
histórico permanece separado; su antiguo borrado amplio de prelanazamiento perdió permiso de
`service_role` y ya no está expuesto por la API.

## Imágenes

El proveedor de búsqueda, sus variables, UI, APIs y pruebas de runtime fueron retirados. La
migración histórica de intentos se conserva por inmutabilidad. La subida manual sigue validando
JPEG/PNG/WebP, genera WebP y opera únicamente en `product-images/products/{productId}/`.

## Estado de validación

Validación ejecutada el 2026-08-01:

- lint y typecheck limpios;
- 762 pruebas verdes, incluida la regresión de snapshots históricos sin producto vivo;
- build de producción local exitoso, con 52 rutas;
- dry-run remoto con una migración, sin seeds ni roles; migración aplicada y reconciliada;
- preview QA remoto: 1 pedido, 1 item, 1 pago y 2 productos, todos con evidencia explícita;
- limpieza QA: esos candidatos fueron retirados; 0 clientes, 0 fiados y 0 archivos afectados;
- preview QA posterior en cero y sin advertencias;
- reporte remoto posterior: 2 pedidos y 2 snapshots históricos conservados;
- respaldo JSON/CSV generado en memoria (sin persistirlo en el repositorio);
- reset posterior: 102 eliminables, 1 archivable y 1 bloqueado; ejecución deshabilitada;
- Storage: 0 objetos, 0 referencias, 0 huérfanos; limpieza no ejecutada.

`supabase db lint --linked` reporta dos hallazgos estáticos porque `plpgsql_check` resuelve los
`INSERT` antes de reconocer las tablas temporales creadas en esas mismas RPC. Las funciones se
ejecutaron correctamente en Postgres remoto; no es un error de relación durante runtime.

`npm audit --production` informa tres familias conocidas de severidad alta: Next.js 16.2.9,
PostCSS transitivo y Sharp/libvips. No se ejecutó `audit fix`, no se cambiaron dependencias y las
actualizaciones sugeridas quedan fuera de esta release candidate.

Esta release no autoriza ejecutar el reinicio real ni desplegar producción.
