# Smellme 2.0.0 — auditoría de release

## Base y alcance

- Rama base auditada: `feature/image-source-reconciliation` en `955781dc2eeef64341ef946265fdd7be896cd133`.
- Rama de entrega: `feature/mvp-v2-cleanup-and-release`.
- Rama de cierre: `fix/full-operational-data-reset`.
- Hasta el cierre de 2.0.0-rc.3, `main` permaneció fuera de alcance y producción intacta.
- Migraciones de cierre: `20260806000000_smellme_full_operational_reset.sql` y corrección
  compatible con `safeupdate` `20260806010000_smellme_full_operational_reset_safeupdate.sql`.

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

## Cierre 2.0.0-rc.2

La autorización de Fase 5.1 permitió retirar toda la data comercial de prueba. El backup privado
quedó fuera de Git (8.642 bytes, 14 tablas, 8 registros). El preview previo registró 2 productos,
2 pedidos, 2 detalles y 2 clientes. Después del reset, todos los conteos operativos, Storage y
reportes quedaron en cero. La secuencia comercial quedó en 1/no llamada y las comprobaciones de
Auth, administrador, business settings, banco, WhatsApp y branding devolvieron verdadero.

La primera llamada quedó íntegramente revertida por `safeupdate`; la migración correctiva mantuvo
los borrados explícitos con cláusula y la ejecución posterior fue exitosa. La repetición con la
misma clave confirmó idempotencia. Se mantienen 788 pruebas verdes, lint, typecheck y build de 55
páginas. El lint DB conserva sólo los dos diagnósticos históricos de tablas temporales y no agrega
hallazgos. `npm audit --production` mantiene tres familias altas conocidas: Next.js, PostCSS y
Sharp/libvips; no se actualizaron dependencias ni se ejecutó `audit fix`.

No se mergea `main`, no se crea tag y no se despliega producción.

## Cierre móvil 2.0.0-rc.3

La rama `fix/mobile-whatsapp-final-qa` elimina el popup `about:blank`, separa mutaciones y
navegación externa, centraliza las URLs y agrega el home dinámico a “Compartir mi tiendita”. El
flujo posterior ofrece CTA, copia con fallback, regreso y cierre con restauración de scroll.

Se validaron ocho viewports con emulación iPhone, Android, tablet y Chromium sin overflow,
excepciones, errores de consola, respuestas 500 ni pantallas blancas. La integración remota QA
cubrió transiciones, orígenes, pagos, fiado, idempotencia, catálogo e imagen. El reset final dejó
la data operacional y Storage en cero; Auth y configuración permanecen preservados. No se realizó
una prueba en teléfono físico. La aceptación se basó en automatización, integración, emulación
iPhone/Safari y Android/Chrome y revisión visual del Preview. El cierre automatizado completa 812
pruebas verdes, lint, typecheck y build local exitosos.

## Release estable 2.0.0

La Fase 6 autorizó la integración final, el tag y producción. La rama `release/v2.0.0` parte del
commit móvil `d69263ff6bdfa90bc564d245c0c0e3493675affe`. El release actualiza Next.js de 16.2.9 a
16.2.12, Sharp de 0.34.5 a 0.35.3 y PostCSS de 8.5.15/8.4.31 anidado a 8.5.25. Los overrides
de PostCSS y Sharp son acotados y necesarios porque Next 16.2.12 todavía declara las versiones
vulnerables anidadas; pruebas, tipos y build verifican su compatibilidad.

`npm audit --production` queda en cero. La regresión específica conserva procesamiento
JPEG/PNG/WebP, EXIF, transparencia, máximo de 1600 px, reemplazo, eliminación y rollback. El flujo
WhatsApp conserva CTA explícito, copia, loading en `finally` y home dinámico, sin popups temporales.

Antes del release, Supabase `nxgkudvrotlaqvvhygem` mantiene toda la data operacional, reportes,
registros QA e imágenes en cero y la secuencia comercial en 1/no llamada. Auth, administrador,
business settings, banco, WhatsApp y branding permanecen preservados. Fase 6 no agrega migraciones,
seeds ni datos comerciales.
