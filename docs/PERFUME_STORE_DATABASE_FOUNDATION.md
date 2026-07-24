# Fundación de base de datos — Fase 1A

- Fecha: 2026-07-24
- Rama: `feature/perfume-store-foundation`
- Fase anterior: Fase 0 (auditoría), commit `e92a487`, documento [`PERFUME_STORE_FOUNDATION_AUDIT.md`](PERFUME_STORE_FOUNDATION_AUDIT.md)
- Alcance de esta fase: **solo SQL local y documentación**. No se tocó Supabase remoto, Vercel, `.env`, código TypeScript (React, Next.js, servicios, repositorios, dominio), pruebas ni `package.json`.

## 1. Resumen ejecutivo

Esta fase construye una fundación SQL limpia y ejecutable para el proyecto Supabase nuevo de Perfume Store, reemplazando el `supabase/schema.sql` heredado de Pauli Store que estaba corrupto (mezcla de Markdown y SQL, sin las sentencias `CREATE TABLE` base — ver Fase 0).

Se creó una única migración consolidada, `supabase/migrations/20260724000000_perfume_store_foundation.sql`, pensada para ejecutarse **una sola vez sobre un proyecto Supabase completamente vacío**. `supabase/schema.sql` se reescribió para representar exactamente el mismo estado lógico. Ninguna migración heredada se borró, movió ni renombró; todas quedan marcadas como no ejecutables contra el proyecto nuevo (ver sección 16).

El esquema resultante amplía el modelo de datos de Pauli Store con los campos mínimos que exige un negocio de perfumes (RUT, correo, región, comuna, dirección, marca, contenido/volumen, SKU, destacados, ofertas, método y costo de despacho, configuración comercial de un solo negocio) y **redefine deliberadamente el ciclo de vida del pedido** (nuevos estados NUEVO/AGENDADO/PAGADO/PREPARANDO/DESPACHADO/ENTREGADO/CANCELADO) para reflejar el flujo real de una tienda de perfumes con despacho. Esto introduce una incompatibilidad explícita y documentada con el código TypeScript heredado, que esta fase **no está autorizada a modificar** (ver sección 7).

La reserva de stock transaccional y la reposición idempotente en cancelaciones **no se implementaron como funciones SQL** en esta fase: el riesgo de enviar SQL no validable por ejecución (sin acceso a una base real) era mayor que el beneficio de un contrato sin probar. Se dejaron las columnas estructurales (`stock_reservado`, `stock_repuesto`) y el contrato documentado (sección 12-13), pero la prevención de sobreventa **sigue pendiente**.

## 2. Fuentes revisadas

- `docs/PERFUME_STORE_FOUNDATION_AUDIT.md` (Fase 0)
- `docs/07_MODELO_DATOS.md`
- `git show 72c4e5d:supabase/schema.sql` (schema original de Pauli Store, previo a la corrupción)
- Las 9 migraciones en `supabase/migrations/` (incluida la vacía)
- `supabase/admin-setup.sql`, `supabase/seed.sql`, `supabase/sql/cleanup_test_data.sql`, `supabase/sql/seed_dobladita_napolitana.sql`, `supabase/catalogo-dobladitas.sql`
- `domain/Producto.ts`, `domain/Cliente.ts`, `domain/Pedido.ts`, `domain/DetallePedido.ts`, `domain/Venta.ts`, `domain/CuentaFiado.ts`
- `repositories/productRepository.ts`, `repositories/pedidoRepository.ts`, `repositories/clienteRepository.ts`
- `services/pedidoService.ts`, `services/productoService.ts`, `services/adminMaintenanceService.ts`, `services/adminCustomerService.ts`
- `lib/supabase/config.ts`, `server.ts`, `auth-server.ts`, `browser.ts`
- `lib/stock.ts`, `lib/validators.ts`, `lib/constants.ts`, `lib/admin-auth.ts`, `lib/admin-customers-data.ts`, `lib/customers/identity.ts`, `lib/pwa/sendWebPush.ts`
- Todas las rutas bajo `app/api/**/route.ts` que llaman a Supabase (localizadas con `grep -r '.from("'` sobre `*.ts`)

## 3. Explicación del schema heredado roto

Resumen de la Fase 0 (detalle completo en `PERFUME_STORE_FOUNDATION_AUDIT.md`, sección 4.2): el commit inicial de Pauli Store (`72c4e5d`) tenía un `supabase/schema.sql` correcto con las 7 sentencias `create table` base. El commit `2b3ce249` ("Implementa pasada final de pedidos, costos y admin") sobrescribió el inicio del archivo con el contenido de un documento Markdown no relacionado (una guía para corregir un mensaje de WhatsApp), destruyendo esas sentencias. El resto del archivo (constraints, triggers, políticas RLS, funciones agregadas después) se mantuvo y se siguió extendiendo sobre esa base ya corrupta durante el resto del historial de Pauli Store. El problema **no fue introducido por la copia a `perfume-store`**; ya existía en el origen.

Esta fase reemplaza `supabase/schema.sql` por completo (no es un merge del contenido corrupto).

## 4. Fuente canónica elegida

**La fuente canónica es la migración consolidada**: `supabase/migrations/20260724000000_perfume_store_foundation.sql`.

`supabase/schema.sql` es su espejo lógico exacto (mismo contenido SQL, distinto comentario de cabecera). Cualquier cambio futuro al esquema debe:

1. Escribirse como una nueva migración incremental en `supabase/migrations/` con timestamp posterior.
2. Reflejarse también en `supabase/schema.sql` para que ambos archivos representen siempre el mismo estado lógico final.

No se debe volver a editar la migración `20260724000000` una vez aplicada a un proyecto real (las migraciones de Supabase son append-only por convención); si algo en ella resulta incorrecto antes de aplicarla, corregirla directamente es aceptable mientras siga sin ejecutarse contra ningún proyecto remoto.

## 5. Tablas creadas

| Tabla | Rol |
|---|---|
| `usuarios_admin` | Lista blanca de administradores autorizados (autorización, no autenticación) |
| `clientes` | Datos de clientes, ampliados para perfumería |
| `productos` | Catálogo, ampliado para perfumería |
| `business_settings` | Configuración comercial de un solo negocio (fila única) |
| `pedidos` | Pedido con nuevo ciclo de vida orientado a despacho |
| `pedido_items` | Líneas de pedido con snapshot del producto |
| `pagos` | Registro manual de pagos/transferencias |
| `fiados` | Crédito informal heredado (legado temporal) |
| `operaciones_admin_log` | Bitácora de cierre mensual / limpieza pre-lanzamiento |
| `archivo_clientes`, `archivo_pedidos`, `archivo_pedido_items`, `archivo_pagos`, `archivo_fiados` | Archivo histórico usado por las funciones de mantenimiento |
| `user_device_badge_settings` | Preferencias de badge PWA por dispositivo admin |
| `admin_push_subscriptions` | Suscripciones Web Push admin |

Todas se crean con `create table if not exists`, en orden seguro de dependencias (sin referencias circulares), sobre una base vacía.

## 6. Campos nuevos para perfumes

- **`clientes`**: `rut`, `email`, `region`, `comuna`, `direccion`, `referencia_direccion` (todos nullable a nivel de base, para no bloquear una futura migración de clientes históricos sin esos datos). `lugar_trabajo` se conserva, ahora nullable, documentada como columna legado vía `comment on column`.
- **`productos`**: `sku` (único cuando no es nulo), `marca`, `contenido`, `precio_anterior`, `stock_reservado`, `stock_minimo`, `es_top`, `es_oferta_semana`, `orden_destacado`, `image_storage_path`.
- **`pedidos`**: `codigo` (correlativo legible único), `subtotal`, `metodo_despacho`, `costo_despacho`, `stock_repuesto`, `fecha_pago`, `fecha_preparacion`, `fecha_despacho`.
- **`business_settings`**: tabla completa, nueva.

## 7. Compatibilidad con el código heredado

Se buscó compatibilidad razonable **donde no entraba en conflicto** con los requisitos explícitos del negocio de perfumes:

**Compatible sin cambios** (mismos nombres de tabla/columna que usa el código heredado hoy):

- Nombres de tabla: `clientes`, `productos`, `pedidos`, `pedido_items`, `pagos`, `fiados`, `usuarios_admin`, `admin_push_subscriptions`, `user_device_badge_settings`.
- `productos.stock_agenda` se agregó como columna de compatibilidad explícita (no está en la lista mínima del negocio de perfumes) porque `repositories/productRepository.ts` la lee y escribe junto a `stock_actual` como "stock unificado" en cada `crearProducto`, `actualizarProducto` y `ajustarStockAgenda`. Sin ella, esas operaciones fallarían con `PGRST204` (columna inexistente) contra Supabase.
- `productos.image_url`, `badge_label`, `tipo_producto` se conservan tal cual las usa `lib/product-catalog.ts` y los repositorios.
- `pedidos.admin_seen` / `admin_seen_at` se conservan (badge de pedidos nuevos en el dashboard admin, `lib/admin/getPendingAdminOrders.ts`).
- `pedidos.origen_pedido` conserva los mismos 3 valores que ya usa `lib/constants.ts` (`PUBLICO`, `ADMIN_DIRECTO`, `PERSONALIZADO`).
- `pedido_items.producto_tipo`, `costo_unitario`, `total_costo`, `utilidad_bruta` se agregaron por compatibilidad (no están en la lista mínima del negocio de perfumes) porque `repositories/pedidoRepository.ts` los lee/escribe activamente para reportes de utilidad.
- `pagos.estado_pago` se dejó como `text not null` **sin** `CHECK`, a propósito, porque el código heredado (`registrarAbonoFiado`) todavía puede escribir `'FIADO'` ahí.
- `fiados` se creó completa (no se eliminó), porque `services/pedidoService.ts` y `repositories/pedidoRepository.ts` la usan activamente (`marcarPedidoFiado`, `registrarAbonoFiado`, `upsertFiado`, `buscarFiadosPorPedidoIds`).
- `operaciones_admin_log` y las tablas `archivo_*` se crearon porque `services/adminMaintenanceService.ts` invoca por RPC `admin_cerrar_mes_operativo` y `admin_limpiar_datos_prueba`, que dependen de ellas.

**Incompatible a propósito, documentado explícitamente** (ver secciones 8-9):

- `pedidos.estado_pedido` ya **no acepta** `'PENDIENTE'` ni `'FINALIZADO'` (constantes `ESTADO_PEDIDO_PENDIENTE`/`ESTADO_PEDIDO_FINALIZADO` en `lib/constants.ts`). El código heredado que crea o transiciona pedidos (`PedidoService.crearPedido`, `crearVentaDirecta`, `crearPedidoPersonalizado`, `agendarPedido`, `marcarPedidoPagado`, `cancelarPedido`, etc.) escribirá valores que violan el nuevo `CHECK` y **fallará** si se conecta tal cual contra este esquema.
- `pedidos.estado_pago` ya no acepta `'FIADO'` (solo `SIN_PAGO`, `PAGADO`, `CANCELADO`). `marcarPedidoFiado` fallará al intentar dejar un pedido en estado `FIADO`.
- `pedidos.cliente_id`, `subtotal`, `metodo_despacho`, `total` son `not null`; el código heredado nunca envía `subtotal` ni `metodo_despacho` al crear un pedido (esos conceptos no existen en el dominio actual), por lo que cualquier `insert` hecho por el repositorio heredado tal cual fallará por columnas `not null` sin valor.
- `pedido_items.producto_id` ahora es `nullable` con `on delete set null` (antes era `not null` sin acción de borrado). Esto es una mejora deliberada pedida explícitamente por esta fase ("producto_id debe poder quedar nulo si el producto se elimina posteriormente"), pero cambia el comportamiento: eliminar un producto referenciado por `pedido_items` ya no lanza un error `23503`. El código de `repositories/productRepository.ts` (`eliminarProducto`) tiene una rama que capturaba ese código de error para mostrar un mensaje amigable ("ya tiene pedidos asociados"); con este esquema esa rama queda inalcanzable (no rompe nada, simplemente no se activará).

**Conclusión de esta sección**: esta migración es la **base de datos objetivo** para Perfume Store, no un parche incremental sobre el dominio TypeScript actual. Conectar el código heredado tal cual contra este esquema **romperá la creación y transición de pedidos**. Reconciliar la capa TypeScript (dominio, constantes, servicios, repositorios, formularios) con este nuevo ciclo de vida es trabajo explícito de una fase posterior que esta fase no está autorizada a tocar.

## 8. Estados de pedido

`pedidos.estado_pedido` (`CHECK`): `NUEVO`, `AGENDADO`, `PAGADO`, `PREPARANDO`, `DESPACHADO`, `ENTREGADO`, `CANCELADO`. Valor por defecto: `NUEVO`.

No existe transición de estado forzada a nivel de base de datos (a diferencia de `domain/Pedido.ts`, que sí valida transiciones en TypeScript). Esta migración no reimplementa esa máquina de estados en SQL; queda como responsabilidad de la capa de aplicación en una fase futura.

## 9. Estados de pago

`pedidos.estado_pago` (`CHECK`): `SIN_PAGO`, `PAGADO`, `CANCELADO`. Valor por defecto: `SIN_PAGO`. No incluye `FIADO` (ver sección 7).

## 10. Métodos de despacho

`pedidos.metodo_despacho` (`CHECK`, `not null`, sin default): `STARKEN_POR_PAGAR`, `DOMICILIO_SEMANAL`.

- `costo_despacho integer not null default 0`, con `CHECK (costo_despacho >= 0)`. Starken por pagar puede usar `0` (el despacho lo paga el destinatario al recibir, fuera del flujo de la app).
- El monto de **$4.000** del despacho semanal a domicilio **no está codificado** en ninguna parte del esquema. Vive en `business_settings.costo_despacho_semanal`, configurable, tal como pide la fase.

## 11. Configuración comercial

`business_settings` es una tabla de una sola fila (patrón singleton): `id` tiene un `default` fijo (`00000000-0000-0000-0000-000000000001`) y un `CHECK` que impide insertar cualquier otro `id`. La migración inserta esa única fila con todos los campos en `NULL`/`0` (sin datos comerciales reales) mediante `insert ... on conflict (id) do nothing`, para que la fila ya exista y la aplicación solo necesite hacer `update` en el futuro.

Columnas: `nombre_comercial`, `telefono_whatsapp`, `correo`, `banco`, `tipo_cuenta`, `numero_cuenta`, `titular_cuenta`, `rut_titular`, `costo_despacho_semanal`, `texto_despacho_semanal`, `umbral_stock_bajo`, `color_primario`, `color_acento`.

No se otorga ninguna política pública de lectura sobre esta tabla (contiene datos bancarios) — ver sección 14.

## 12. Estrategia actual o pendiente de reserva de stock

**No implementada en esta fase.** `productos.stock_reservado` existe como columna estructural (`integer not null default 0`, con `CHECK (stock_reservado >= 0 and stock_reservado <= stock_actual)`), pero **ninguna función ni trigger la mantiene**. El código actual tampoco la usa (sigue leyendo/escribiendo solo `stock_actual`/`stock_agenda`).

Motivo de no implementar la función transaccional pedida (bloqueo de filas, recálculo de precios en servidor, creación atómica de cliente+pedido+items+descuento de stock): no hay forma de validar por ejecución que una función `plpgsql` de esa complejidad sea correcta sin una base Postgres real disponible en esta fase (no hay conexión remota autorizada, y no se detectó una instancia Postgres local). Enviar una función sin poder probarla habría sido peor que no enviarla: el riesgo de un bug silencioso en la única barrera anti-sobreventa es alto.

**Contrato documentado para una fase futura** (no es SQL, es la especificación esperada de la función/RPC):

```text
Entrada (JSON normalizado en servidor, nunca confiado desde el navegador):
  cliente: { nombre, rut?, email?, telefono?, region?, comuna?, direccion?, referencia_direccion? }
  items: [{ producto_id, cantidad }]
  metodo_despacho: 'STARKEN_POR_PAGAR' | 'DOMICILIO_SEMANAL'

Pasos que debe garantizar, dentro de una sola transacción:
  1. Bloquear (SELECT ... FOR UPDATE) las filas de productos involucradas.
  2. Releer precio_venta y activo directamente desde la base (nunca del cliente).
  3. Rechazar si algun producto no esta activo.
  4. Rechazar si la cantidad pedida excede stock_actual - stock_reservado.
  5. Calcular subtotal y total en el servidor (SQL), incluido costo_despacho
     segun metodo_despacho (Starken = 0 o segun tarifa; domicilio semanal =
     business_settings.costo_despacho_semanal).
  6. Reutilizar cliente existente segun una estrategia de identidad definida
     explicitamente (no ambigua) o crear uno nuevo.
  7. Crear pedido y pedido_items con snapshot del producto.
  8. Incrementar stock_reservado (o descontar stock_actual, segun la
     estrategia que se adopte) dentro de la misma transaccion.
  9. Fallar la transaccion completa si cualquier linea no tiene stock
     suficiente (todo o nada, sin dejar pedidos parciales).

Salida esperada: id de pedido, codigo, total, estado_pedido inicial.
```

Hasta que esta función exista y esté probada contra una base real, **no hay protección atómica contra sobreventa** en este esquema — solo el `CHECK` declarativo de que `stock_actual >= 0`, que no evita condiciones de carrera entre dos compras simultáneas.

## 13. Estrategia de cancelación y reposición

**Tampoco implementada como función en esta fase**, por el mismo motivo que la sección 12. `pedidos.stock_repuesto boolean not null default false` existe como bandera de idempotencia estructural para que, cuando se escriba esa función, pueda garantizar "reponer stock exactamente una vez por pedido cancelado" sin necesitar otro cambio de esquema.

Contrato esperado (misma lógica que hoy hace `services/pedidoService.ts` en TypeScript vía `restoreLinkedCatalogStock`, pero como función SQL transaccional):

```text
1. Verificar que el pedido no este ya en estado CANCELADO.
2. Verificar stock_repuesto = false (si ya es true, no hacer nada: idempotente).
3. Cambiar estado_pedido a CANCELADO, registrar fecha_cancelacion y motivo_cancelacion.
4. Por cada pedido_item con producto_id no nulo, devolver su cantidad a
   stock_actual (o a stock_reservado, segun la estrategia adoptada en la
   seccion 12) del producto correspondiente.
5. Marcar stock_repuesto = true.
6. Todo dentro de una sola transaccion.
```

## 14. RLS y políticas

RLS está habilitado en **todas** las tablas de esta migración. Se creó una función auxiliar `public.is_active_admin()` (`stable`, `security invoker`) para no repetir el mismo `exists (select ... from usuarios_admin ...)` en cada política.

| Tabla | Público (anon) | Autenticado sin fila en `usuarios_admin` | Admin activo |
|---|---|---|---|
| `productos` | `SELECT` solo `activo = true` | igual que público | `ALL` |
| `clientes` | sin acceso | sin acceso | `SELECT` únicamente |
| `pedidos` | sin acceso | sin acceso | `ALL` |
| `pedido_items` | sin acceso | sin acceso | `SELECT` únicamente |
| `pagos` | sin acceso | sin acceso | `ALL` |
| `fiados` | sin acceso | sin acceso | `ALL` |
| `usuarios_admin` | sin acceso | sin acceso | `SELECT` de su propia fila únicamente |
| `business_settings` | sin acceso | sin acceso | `ALL` |
| `operaciones_admin_log`, `archivo_*` | sin acceso | sin acceso | `SELECT` únicamente (las escrituras las hacen las funciones `SECURITY DEFINER`) |
| `user_device_badge_settings`, `admin_push_subscriptions` | sin acceso | sin acceso | `ALL`, solo sus propias filas (`user_id = auth.uid()`) |

Decisiones explícitas pedidas por esta fase, cumplidas:

- **No** se creó ninguna política pública de `INSERT` para `clientes` ni `pedidos` (ni con `WITH CHECK true` ni restringida). La creación pública de pedidos queda pendiente de una ruta de servidor segura o una RPC `SECURITY DEFINER` validada — hoy, de hecho, el código ya crea pedidos exclusivamente vía el cliente servidor (clave privilegiada), que ignora RLS, así que esto no rompe el flujo actual.
- `clientes` solo tiene política de `SELECT` para admin (igual que en el esquema original de Pauli Store); no hay política de escritura vía RLS porque las escrituras siempre pasan por el cliente servidor.
- `business_settings` no tiene ninguna política pública, ni siquiera de lectura parcial, porque contiene datos bancarios (petición explícita de esta fase: "No permitir públicamente: ... leer configuraciones bancarias"). Una futura pantalla pública de checkout que necesite mostrar el costo de despacho o los datos de la cuenta bancaria para la transferencia deberá obtenerlos a través de una ruta de servidor curada, no leyendo la tabla directamente con la llave anónima.

## 15. Funciones `SECURITY DEFINER`

Dos funciones, ambas heredadas de Pauli Store y adaptadas al nuevo esquema:

- `public.admin_cerrar_mes_operativo(p_admin_email text, p_admin_nombre text default null)`
- `public.admin_limpiar_datos_prueba(p_admin_email text, p_admin_nombre text default null)`

Ambas:

- Declaran `set search_path = public` (mitiga secuestro de `search_path`).
- Están bloqueadas con `revoke all ... from public/anon/authenticated` y `grant execute ... to service_role`. Solo pueden ejecutarse con la clave de servidor, que es exactamente cómo las invoca `services/adminMaintenanceService.ts` (`supabase.rpc(...)` con el cliente servidor).
- `admin_cerrar_mes_operativo` se adaptó al nuevo ciclo de vida: en vez de bloquear el cierre si hay pedidos en `PENDIENTE` o `AGENDADO` (valores que ya no existen), ahora bloquea si hay cualquier pedido **fuera** de `ENTREGADO`/`CANCELADO` (es decir, cualquier estado "abierto" del nuevo flujo).
- Ninguna de las dos crea, otorga ni depende de roles nuevos fuera de los estándar de Supabase (`anon`, `authenticated`, `service_role`).

No se creó ninguna función `SECURITY DEFINER` nueva para la reserva de stock (ver sección 12): no existe ese riesgo de seguridad porque la función simplemente no se escribió.

## 16. Clasificación de migraciones heredadas

Ninguna se borró, movió ni renombró. Ninguna debe ejecutarse contra el proyecto Supabase nuevo; todas asumen tablas que la migración `20260724000000` ya crea con una definición distinta (superset con constraints y estados nuevos).

| Archivo | Finalidad original | Dependencias | Clasificación | Tratamiento |
|---|---|---|---|---|
| `20260618001444_setup_remote_workflow.sql` | Agregar `origen_pedido`, columnas snapshot en `pedido_items`, reemplazar catálogo por productos de Pauli | Tablas base de Pauli ya creadas | Absorbida por la consolidada (conceptualmente) | No ejecutar. `origen_pedido` y las columnas snapshot ya están en la migración nueva; los `insert`/`delete` de productos son datos reales de Pauli, fuera de alcance |
| `20260618002120_nombre-del-cambio.sql` | — | — | Vacía o inválida | No ejecutar (0 bytes, sin contenido) |
| `20260624193000_order_snapshots_and_admin_seen.sql` | Agregar `admin_seen`, `admin_seen_at`, `costo_unitario`/`total_costo`/`utilidad_bruta` en `pedido_items` | Tablas base de Pauli | Absorbida por la consolidada | No ejecutar. Todas esas columnas ya están en `pedidos`/`pedido_items` de la migración nueva |
| `20260624194500_seed_public_catalog.sql` | Insertar/actualizar catálogo de dobladitas | `productos` | Fuera del MVP de perfumes (datos reales de Pauli) | No ejecutar |
| `20260624201000_cleanup_duplicate_assets.sql` | Corregir una ruta de imagen duplicada de un producto de Pauli | `productos` | Fuera del MVP de perfumes | No ejecutar |
| `20260625003000_harden_maintenance_and_cleanup_admin.sql` | Endurecer políticas RLS de `clientes`/`pagos`/`fiados`/`usuarios_admin`, revocar/otorgar permisos de las funciones de mantenimiento, borrar un admin de prueba, borrar una tabla de respaldo temporal | Tablas y funciones de Pauli | Absorbida por la consolidada | No ejecutar. El endurecimiento de RLS y el `revoke/grant` de las funciones ya están aplicados desde el origen en la migración nueva |
| `20260625232000_add_user_device_badge_settings.sql` | Crear `user_device_badge_settings` completa con RLS | — | Absorbida por la consolidada | No ejecutar. Tabla ya incluida con la misma estructura |
| `20260625235500_merge_duplicate_customers.sql` | Fusionar clientes duplicados reales de Pauli por nombre (`"paty"`, `"Patricia Diaz"`, `"Loreto Looez"`, etc.) | `clientes`, `pedidos`, `fiados` | Fuera del MVP de perfumes (datos reales de personas) | No ejecutar. Contiene nombres de clientes reales de Pauli Store; no debe reproducirse. Las funciones que crea las borra ella misma al final (no deja residuo de esquema) |
| `20260626120000_add_admin_push_subscriptions.sql` | Crear `admin_push_subscriptions` completa con RLS | — | Absorbida por la consolidada | No ejecutar. Tabla ya incluida con la misma estructura |

No hay ninguna migración clasificada como "revisar posteriormente" ni "aplicable después de fundación": todo lo estructuralmente reutilizable ya se incorporó a la migración consolidada; todo lo que queda son datos reales de Pauli Store, fuera de alcance por instrucción explícita.

**Nota fuera de las migraciones versionadas**: `supabase/admin-setup.sql`, `supabase/seed.sql` (antes de neutralizarlo en esta fase), `supabase/catalogo-dobladitas.sql`, `supabase/sql/cleanup_test_data.sql` y `supabase/sql/seed_dobladita_napolitana.sql` también contienen datos o referencias específicas de Pauli Store (nombre de admin, catálogo de dobladitas). No estaban en la lista de archivos permitidos para esta fase (excepto `seed.sql`) y **no se modificaron**; quedan señalados aquí para curarlos en una fase posterior.

## 17. Datos que no fueron copiados

No se copió, en ningún archivo de esta fase:

- Clientes reales (nombres, teléfonos, direcciones) de Pauli Store.
- Pedidos reales.
- Catálogo de productos real (dobladitas, quequitos) — `supabase/seed.sql` quedó neutralizado.
- UUIDs productivos existentes en el proyecto Supabase de Pauli Store.
- Claves, tokens, `project-ref` ni URLs privadas.
- Datos bancarios reales.
- Ningún archivo CSV de productos.

El único identificador "fijo" introducido es el UUID sentinel `00000000-0000-0000-0000-000000000001` usado como clave primaria singleton de `business_settings`; es una constante de diseño (patrón singleton-table), no un dato productivo de Pauli.

## 18. Limitaciones y riesgos pendientes

1. **Reserva de stock no implementada** (sección 12): sin ella, existe una ventana de sobreventa ante compras concurrentes.
2. **Reposición de stock en cancelación no implementada** (sección 13).
3. **Incompatibilidad deliberada con el dominio TypeScript actual** (sección 7): conectar el código heredado tal cual contra este esquema romperá la creación/transición de pedidos. Esto es intencional para esta fase, pero es un riesgo real si alguien conecta Supabase antes de actualizar la capa TypeScript.
4. **`pagos.estado_pago` sin `CHECK`**: se dejó deliberadamente permisivo por compatibilidad con `'FIADO'`; no hay validación de integridad a nivel de base para ese campo todavía.
5. **`lib/customers/identity.ts`** sigue teniendo nombres de clientes de Pauli Store (`"Paty"`, `"Patricia Diaz"`, `"Loreto Lopez"`, `"Camila Montes"`, `"Pauli"`) hardcodeados en la normalización de identidad de clientes. No se tocó (fuera de alcance: es código TypeScript), pero debe limpiarse antes de operar con clientes reales de Perfume Store.
6. **`package.json`** todavía tiene `supabase:link --project-ref uqqdkbguhhzdmjjvrawc`, que es el `project-ref` de Pauli Store (hallazgo ya señalado en la Fase 0). No se modificó (`package.json` no está en los archivos permitidos de esta fase).
7. **Archivos SQL sueltos con datos de Pauli** fuera de alcance de esta fase (sección 16, nota final) siguen en el repositorio sin neutralizar.
8. No se ejecutó el SQL contra ninguna base real (ni local ni remota): la validación fue exclusivamente estática (lectura, revisión de sintaxis y de orden de dependencias). Un error de sintaxis sutil no detectable a simple vista seguiría siendo posible hasta la primera ejecución real.

## 19. Orden correcto para vincular Supabase posteriormente (no ejecutado en esta fase)

1. Revisar y aprobar humanamente este documento y el SQL resultante.
2. Decidir explícitamente qué hacer con la incompatibilidad de estados de pedido (sección 7): actualizar el dominio TypeScript para el nuevo ciclo de vida, o crear una capa de compatibilidad. Esta decisión es humana y de producto, no técnica.
3. Corregir `package.json` (`supabase:link`) para apuntar al `project-ref` real de `perfume-store`, en una fase que autorice tocar `package.json`.
4. `npx supabase login` (fuera de esta fase).
5. `npx supabase link --project-ref <project-ref-de-perfume-store>` contra el proyecto Supabase nuevo, vacío.
6. Ejecutar `supabase/schema.sql` (o `npx supabase db push` usando la migración consolidada) **una sola vez**, contra ese proyecto vacío.
7. Verificar en el SQL Editor de Supabase que las 15 tablas, los triggers, las políticas RLS y las 2 funciones `SECURITY DEFINER` quedaron creados como se documenta aquí.
8. Crear el primer usuario admin en Supabase Auth y ejecutar `supabase/admin-setup.sql` (ajustando el email; ese archivo sigue fuera de esta fase, revisar que no tenga datos de Pauli antes de usarlo).
9. Configurar variables de entorno del proyecto nuevo (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY`) en un entorno seguro, fuera de este repositorio.
10. Solo después de todo lo anterior, abordar en una fase separada la reconciliación del dominio TypeScript con el nuevo ciclo de vida de pedidos y la implementación probada de la reserva de stock.

## 20. Checklist manual previo a ejecutar la migración

- [ ] Confirmar que el proyecto Supabase de destino es realmente `perfume-store` y no el de Pauli Store (doble-chequear el `project-ref`).
- [ ] Confirmar que el proyecto está vacío (sin tablas propias) antes de ejecutar `schema.sql`/la migración.
- [ ] Leer completa la sección 7 de este documento con quien vaya a tocar el código TypeScript después, para que la incompatibilidad de estados no sea una sorpresa.
- [ ] Decidir la estrategia de reserva de stock (sección 12) antes de abrir el sitio al público; hasta entonces, no anunciar el catálogo como "stock garantizado".
- [ ] Revisar `supabase/admin-setup.sql` y reemplazar el email de ejemplo por el del admin real antes de ejecutarlo.
- [ ] Verificar que no se vaya a ejecutar ninguna migración de `supabase/migrations/` anterior a `20260724000000` contra el proyecto nuevo.
- [ ] Tener un respaldo o snapshot del proyecto Supabase nuevo antes de la primera ejecución (buena práctica general, aunque el proyecto esté vacío).

## 21. Decisiones humanas pendientes

1. ¿Se actualiza el dominio TypeScript (`domain/Pedido.ts`, `lib/constants.ts`, `services/pedidoService.ts`, repositorios) para adoptar el nuevo ciclo de vida de pedidos, o se diseña una capa de compatibilidad temporal? Esto determina si el código actual puede usarse como punto de partida real del MVP o si el flujo de pedidos se reescribe.
2. ¿Se conserva el módulo de `fiados` (crédito informal) como funcionalidad real de Perfume Store, o se elimina en una fase futura ahora que el pago principal es transferencia verificada manualmente?
3. ¿Qué estrategia de identidad de cliente se usará para evitar duplicados (equivalente a `lib/customers/identity.ts`, pero sin los nombres hardcodeados de clientes de Pauli)?
4. ¿Se implementará la reserva de stock como función `SECURITY DEFINER` con bloqueo de filas (como se documentó en la sección 12), o se prefiere una cola/worker fuera de Postgres?
5. ¿`STARKEN_POR_PAGAR` necesita algún costo de referencia informativo en `business_settings`, o siempre es efectivamente 0 para la tienda (el destinatario paga directo a Starken)?
6. ¿Quién y cuándo corrige `package.json` (`supabase:link` apuntando al proyecto de Pauli) antes de vincular el proyecto nuevo?
7. ¿Se necesita una política pública curada (vista o ruta de servidor) para exponer `costo_despacho_semanal`, `texto_despacho_semanal` y los datos bancarios de `business_settings` en el checkout público, dado que la tabla completa no es públicamente legible?
