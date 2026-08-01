# Smellme.cl — Venta directa ultrarrápida (Fase 3B.2)

Rama de trabajo: `feature/direct-sale-fast-flow`. Base: `55788da` (cierre de
3B.1 + 3B.1A).

## Objetivo

`/admin/venta-directa` es una herramienta operativa para registrar una venta
presencial, telefónica o al paso en segundos. No es un segundo catálogo
visual: no muestra imágenes, descripciones, chips comerciales ni tarjetas.
El modo "Pedidos personalizados" (tortas, preparaciones a pedido) que antes
compartía esta pantalla se movió a `/admin/pedidos-personalizados`, sin
cambios de lógica.

## Flujo

Buscar producto → seleccionar presentación → cantidad → agregar al resumen
→ repetir → datos de la venta (cliente opcional, forma de pago, observación)
→ Confirmar venta → resumen exitoso. El total y el carrito son solo para
mostrar en pantalla; el servidor siempre recalcula precio y total desde
`productos`.

## Búsqueda y familias/variantes

El buscador reutiliza `lib/product-families.ts` (ya existente, sin cambios):

- `groupProductsIntoFamilies` agrupa por marca+nombre (nunca por contenido).
- `filterAndSortFamilies({ query })` busca por nombre, marca, contenido y
  SKU de cualquier variante, normalizando tildes y mayúsculas.
- `getSelectableVariants` excluye por completo las variantes pausadas
  (`activo=false`); una variante activa sin stock se incluye pero queda
  marcada `disponible=false` ("Sin stock" deshabilitada).
- `getDefaultVariant` autoselecciona si la familia tiene una sola
  presentación; si tiene varias, se muestra un `<select>`.

El catálogo se trae una sola vez desde `GET /api/admin/products/search`
(activos únicamente, sin `costoUnitario`, `imageUrl` ni `descripcion`) y el
filtrado ocurre en el navegador con debounce (~300ms). No se monta el
catálogo público de tarjetas ni se descargan imágenes.

## Cantidades y carrito

`lib/direct-sale-cart.ts` (lógica pura, sin JSX, probada sin jsdom):
`addLine` incrementa una línea existente en vez de duplicarla y nunca supera
el stock de la variante; `updateQuantity` clampa entre 1 y el stock (valores
≤0 quitan la línea, igual que "Quitar"); `computeTotal`/`computeTotalUnits`
son solo para la UI.

## Forma de pago

Select con `EFECTIVO` y `TRANSFERENCIA` — los dos valores que ya usaba el
código (`pagos.metodo_pago` es texto libre en el esquema, sin catálogo
formal). Solo se pide cuando la venta queda "Pagado"; si queda "Fiado" no es
relevante porque no se registra pago, solo un fiado pendiente.

## Seguridad

`POST /api/admin/direct-sales` exige sesión admin, origen confiable, JSON
válido y rechaza cualquier clave desconocida (incluido cualquier precio,
subtotal, total o stock que el navegador intente enviar). El servidor nunca
confía en el cliente para precio ni disponibilidad.

## Transacción e idempotencia

`crearVentaDirecta` delega por completo en una RPC atómica nueva,
`create_direct_sale_v1` (migración
`supabase/migrations/20260801000000_perfume_store_direct_sale_rpc.sql`),
modelada sobre `create_perfume_order_v1`. Reemplaza el mecanismo heredado
(upsert de cliente + insert de pedido/items + ajuste de stock como llamadas
independientes sin rollback, que además dejaba vender productos inactivos).

Dentro de una sola transacción: bloquea las filas de producto (`for update`
en orden determinístico), exige `activo=true` y
`stock_actual - stock_reservado >= cantidad`, resuelve/crea cliente,
registra el pedido (`ENTREGADO`), los items, descuenta `stock_actual` y
`stock_agenda`, y registra el pago o el fiado. Todo o nada.

Idempotencia: `pedidos.idempotency_key` (columna nueva, índice único
parcial). El cliente genera una clave (`crypto.randomUUID()`) por intento de
venta; si la misma clave llega dos veces (doble clic, reintento de red), la
RPC devuelve el resultado ya persistido sin volver a descontar stock ni
crear un segundo pedido.

## Stock

Nunca negativo: el chequeo de disponibilidad ocurre dentro del mismo bloqueo
de fila que el descuento. Una venta directa no puede consumir stock ya
reservado por un pedido público `NUEVO`/`AGENDADO` pendiente
(`stock_actual - stock_reservado`, mismo criterio que
`create_perfume_order_v1`).

## Errores

Los mensajes de la RPC ya vienen en español y sin detalle interno de
Postgres (reutiliza `lib/perfumeOrderErrors.ts`: `PF001` sin items,
`PF002` producto inexistente, `PF003` producto no disponible/pausado,
`PF005` stock insuficiente, `PF006` forma de pago inválida). La UI los
muestra tal cual, nunca expone la excepción cruda de Supabase.

## Rendimiento

Sin imágenes, sin montar `ProductCatalog`/`CartSummary` (componentes del
catálogo público), un solo fetch inicial del catálogo liviano, debounce en
la búsqueda.

## Responsive

390px: buscador y botones a ancho completo, lista compacta, sin scroll
horizontal, sin tarjetas. 768px: formulario en una columna equilibrada.
1440px: buscador/carrito en dos columnas (`lg:grid-cols-[1.2fr_0.8fr]`), sin
ocupar el ancho completo innecesariamente.

## Fuera de alcance

- Pedidos personalizados: página separada (`/admin/pedidos-personalizados`,
  `components/admin/AdminCustomOrder.tsx`), lógica intacta.
- Fotografías de producto: no comenzadas.
- POS complejo (múltiples cajas, turnos, impresión de boleta): no
  implementado.
- Aplicar la migración `20260801000000_...` al proyecto Supabase remoto:
  pendiente de una decisión y ejecución explícitas y separadas de este
  checkpoint. Hasta entonces, el flujo autenticado real de venta directa no
  funciona contra producción/Preview (los smoke tests de esta fase son solo
  de rutas sin sesión).
