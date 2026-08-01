# Smellme 2.0.0-rc.2 — reinicio operacional total

## Autorización y alcance

El 2026-08-01 se ejecutó el reinicio total autorizado sobre el proyecto Supabase
`nxgkudvrotlaqvvhygem`. Toda la información comercial existente correspondía a pruebas. Se
eliminaron catálogo, pedidos, detalles, clientes, pagos, fiados, archivos comerciales,
historial técnico del asistente retirado y registros QA. No se eliminaron Auth, administrador,
`usuarios_admin`, `business_settings`, datos bancarios, WhatsApp, branding, migraciones,
estructura, bucket ni proyectos Supabase/Vercel.

## Evidencia agregada

Antes: 2 productos inactivos, 2 pedidos públicos cancelados, 2 detalles, 2 clientes, 0 pagos,
0 fiados, stock/reservas en 0 y 0 objetos bajo `product-images/products/`. Los reportes
derivaban 2 ventas, monto 145750, costo histórico 105000 y utilidad 36750. No se registran
datos personales en este documento.

Después: productos, activos, inactivos, Top 12, ofertas, pedidos por todos sus orígenes,
detalles, clientes, pagos, fiados, stock, reservas, movimientos, ajustes, importaciones,
archivos comerciales, imágenes, objetos y huérfanos quedaron en 0. Ventas, monto, costo,
utilidad, despachos, pendientes y cancelados también quedaron en 0.

El respaldo privado `data/private-output/pre-full-reset-backup.json` quedó fuera de Git:
8.642 bytes, 14 tablas y 8 registros. No contiene Auth, secretos, tokens, variables de entorno
ni configuración bancaria. Su contenido no se publica ni se sube a Storage.

## Contrato técnico

- `20260806000000_smellme_full_operational_reset.sql` instala preview, preparación de backup,
  reset transaccional, auditoría y cola reintentable de Storage.
- `20260806010000_smellme_full_operational_reset_safeupdate.sql` conserva los `DELETE`
  explícitos y agrega `WHERE true` para cumplir la protección remota `safeupdate`; no relaja
  roles ni políticas.
- La RPC exige service role, frase literal, checkbox en UI, backup vigente, fingerprint,
  idempotencia y advisory lock. No acepta IDs ni paths del navegador.
- Una primera invocación fue rechazada por `safeupdate` antes del primer borrado. La transacción
  se revirtió y el fingerprint permaneció idéntico. Tras la corrección, se ejecutó una vez y
  la segunda llamada con la misma clave devolvió replay idempotente.
- La secuencia `perfume_order_code_seq` quedó en valor 1 con `is_called = false`.
- Storage se limitó al bucket `product-images`, prefijo `products/`; quedaron 0 objetos.

## Preservación y estado inicial

La verificación transaccional devolvió verdaderos los indicadores de Auth, administrador,
business settings, configuración bancaria completa, WhatsApp y branding. El storefront usa
el estado vacío amigable, el carrito elimina referencias obsoletas y las APIs invalidan paths
y tags de catálogo. El panel conserva importador, creación manual y carga WebP para los nuevos
productos reales.

## Procedimiento futuro

Entrar a `/admin/mantenimiento`, generar el preview total, descargar el backup técnico, marcar
la aceptación, escribir `ELIMINAR TODA LA DATA OPERATIVA` y confirmar el diálogo accesible. Si
los datos cambian, el fingerprint obliga a repetir preview y backup. Ante fallo de Storage, los
paths seguros quedan en `smellme_full_reset_storage_pending` para reintento; nunca se deben
aceptar paths suministrados por el cliente.
