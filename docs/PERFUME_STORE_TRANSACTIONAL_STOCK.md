# Stock transaccional y RPC de pedidos — Fase 1C

- Fecha: 2026-07-26
- Rama: `feature/perfume-store-foundation`
- Fase anterior: Fase 1A (fundación SQL), commit `8cb08c0`, documento [`PERFUME_STORE_DATABASE_FOUNDATION.md`](PERFUME_STORE_DATABASE_FOUNDATION.md); Fase 1B (contrato de dominio), commit `fc0091c`, documento [`PERFUME_STORE_APPLICATION_CONTRACT.md`](PERFUME_STORE_APPLICATION_CONTRACT.md)
- Alcance de esta fase: SQL (migración aditiva + espejo en `schema.sql`), integración TypeScript de repositorio/servicio/rutas ya delegando a las RPC, pruebas SQL y TypeScript, documentación. **No se tocó Supabase remoto, Vercel, `.env`, `package-lock.json` ni datos comerciales reales.**

## 1. Objetivo

Eliminar la sobreventa de stock en la creación pública de pedidos y en las transiciones administrativas, reemplazando el mecanismo heredado (inserciones y ajustes de stock hechos por separado desde TypeScript, sin atomicidad real) por 4 funciones SQL `SECURITY DEFINER` que hacen todo el trabajo — validación, cálculo de precios/despacho, reserva/descuento de stock y escritura de pedido — dentro de una sola transacción de Postgres.

## 2. Modelo de stock

- `productos.stock_actual`: unidades físicas existentes en el negocio.
- `productos.stock_reservado`: unidades comprometidas por pedidos `NUEVO`/`AGENDADO` todavía no pagados.
- Disponible para nueva reserva = `stock_actual - stock_reservado`.

Ambas columnas ya existían desde la Fase 1A (sin lógica asociada). Esta fase no agrega columnas nuevas; les da su primer comportamiento real.

## 3. RPC implementadas

Todas viven en `supabase/migrations/20260724010000_perfume_store_transactional_stock.sql` (aditiva, no reemplaza la migración de Fase 1A) y su espejo en `supabase/schema.sql`:

| Función | Rol |
|---|---|
| `next_perfume_order_code()` | Código correlativo `PERF-YYYY-000001`, atómico vía `nextval()` sobre `perfume_order_code_seq` |
| `create_perfume_order_v1(p_cliente, p_items, p_metodo_despacho, p_observacion, p_origen_pedido)` | Crea/reutiliza cliente, crea pedido + items, reserva stock |
| `mark_perfume_order_paid_v1(p_pedido_id, p_metodo_pago)` | Convierte la reserva en descuento físico, registra el pago |
| `cancel_perfume_order_v1(p_pedido_id, p_motivo, p_confirmar_reposicion_pagado)` | Libera reserva (sin pago) o repone stock físico (pagado, con confirmación explícita) |
| `advance_perfume_order_status_v1(p_pedido_id, p_nuevo_estado)` | `PAGADO→PREPARANDO→DESPACHADO→ENTREGADO`, sin efecto en stock |

## 4. Seguridad y permisos

- Las 4 funciones operativas son `SECURITY DEFINER`, con `set search_path = public` fijo y referencias explícitas a `public.tabla`. No usan SQL dinámico ni exponen secretos.
- `next_perfume_order_code()` es `SECURITY DEFINER` (necesita `nextval()` sobre una secuencia sin permisos públicos); las demás también, porque escriben en tablas sin política RLS pública de inserción.
- `EXECUTE` revocado explícitamente de `public`, `anon` y `authenticated`; concedido únicamente a `service_role`. Verificado en el smoke test (sección 15, casos 16/16b/16c): `anon` y `authenticated` reciben `insufficient_privilege`, `service_role` puede ejecutar.
- La aplicación nunca llama estas funciones desde el navegador: siempre desde una ruta de servidor Next.js (`app/api/orders/route.ts`, `app/api/admin/orders/[pedidoId]/route.ts`) usando el cliente Supabase con la clave de servicio.
- Ningún dato comercial real, credencial ni URL con secretos aparece en la migración, el smoke test ni este documento.

## 5. Correlativo de pedido

`next_perfume_order_code()` usa `nextval()` sobre `perfume_order_code_seq`, atómico en Postgres sin importar la concurrencia (no se usa `COUNT(*) + 1`, que sí sería vulnerable a condiciones de carrera). El contador es global y no se reinicia por año; el año en el código (`PERF-2026-000123`) es solo una etiqueta legible, no una partición real del contador.

## 6. Creación del pedido (`create_perfume_order_v1`)

Flujo dentro de una sola transacción:

1. Valida `metodo_despacho`, nombre de cliente, lista de items no vacía y cantidades enteras ≥ 1.
2. Agrupa líneas duplicadas del mismo producto en una tabla temporal.
3. Bloquea los productos afectados en **orden determinista por `id`** (`for update`, `order by p.id`) para reducir el riesgo de deadlock frente a otra transacción concurrente que reserve un subconjunto solapado de productos.
4. Por cada producto: valida `activo`, valida `stock_actual - stock_reservado >= cantidad`, toma `precio_venta` real del catálogo (nunca un valor enviado por quien llama).
5. Calcula `subtotal` desde los precios reales. Costo de despacho: `STARKEN_POR_PAGAR` siempre 0; `DOMICILIO_SEMANAL` toma `business_settings.costo_despacho_semanal` (falla con `PF008` si no está configurado).
6. Reutiliza cliente existente por teléfono → RUT → correo (mismo orden que `clienteRepository.ts`); si no hay coincidencia, crea uno nuevo.
7. Genera el código, inserta el pedido en `NUEVO`/`SIN_PAGO`, inserta los snapshots en `pedido_items`, incrementa `stock_reservado` (no toca `stock_actual`).
8. Devuelve `pedidoId`, `codigo`, `subtotal`, `costoDespacho`, `total` e items — todo recalculado en el servidor. Cualquier fallo revierte la transacción completa.

La firma no acepta precio, subtotal, costo de despacho, total, estado de pedido ni estado de pago desde quien llama: no existe una vía para enviar esos valores desde el navegador.

## 7. Pago (`mark_perfume_order_paid_v1`)

Bloquea el pedido y sus productos, exige `estado_pedido` en (`NUEVO`, `AGENDADO`) y `estado_pago = SIN_PAGO`. Revalida que la reserva siga siendo íntegra (`stock_reservado >= cantidad` por línea) antes de tocar nada. Reduce `stock_actual` y `stock_reservado` en la misma cantidad por línea (nunca deja valores negativos, porque la revalidación previa lo impide), deja el pedido en `PAGADO`/`PAGADO`, registra `fecha_pago` e inserta el registro en `pagos`. Pagar dos veces el mismo pedido falla (`PF012`, ya no está en `NUEVO`/`AGENDADO`).

## 8. Cancelación no pagada

`cancel_perfume_order_v1` sobre un pedido `SIN_PAGO`: libera `stock_reservado` (con `greatest(0, ...)` como cinturón de seguridad) y no toca `stock_actual`. Requiere un motivo no vacío.

## 9. Cancelación pagada

Requiere `p_confirmar_reposicion_pagado = true` explícito (si no, `PF013`). Al confirmar, incrementa `stock_actual` (repone física) y no toca `stock_reservado`. El registro de pago no se borra: `estado_pago` permanece `PAGADO` aunque el pedido pase a `CANCELADO` (el dinero ya fue recibido; solo se documenta que el pedido no se concretó).

## 10. Idempotencia

`pedidos.stock_repuesto` (columna de Fase 1A, sin uso hasta ahora) se marca `true` en la primera cancelación exitosa (pagada o no) y evita liberar o reponer stock dos veces. Un segundo intento de cancelar el mismo pedido falla primero por `estado_pedido = CANCELADO` (`PF011`), antes de llegar a tocar stock.

## 11. Transiciones

`advance_perfume_order_status_v1` solo permite `PAGADO→PREPARANDO`, `PREPARANDO→DESPACHADO`, `DESPACHADO→ENTREGADO`; cualquier otra combinación falla con `PF012`. Registra `fecha_preparacion`/`fecha_despacho`/`fecha_entrega` según corresponda. No modifica stock en ningún caso.

## 12. Integración TypeScript

- `repositories/pedidoRepository.ts`: `SupabasePedidoRepository` llama las 4 RPC vía `supabase.rpc(...)` sin insertar pedido/items manualmente ni ajustar stock producto por producto para este flujo. `MemoryPedidoRepository` replica la misma lógica de forma síncrona sobre `localStore` para desarrollo sin Supabase (documentado como *no* protección real contra concurrencia — ver sección 16).
- `services/pedidoService.ts` (`crearPedido`, `marcarPedidoPagado`, `cancelarPedido`, `iniciarPreparacionPedido`, `despacharPedido`, `entregarPedido`): delega todo el cálculo y la escritura de stock a las RPC; solo hace validación de formato/UX antes (RUT, correo, teléfono chileno, método de despacho) y una segunda escritura de metadata admin (`admin_seen`) después.
- `app/api/orders/route.ts` y `app/api/admin/orders/[pedidoId]/route.ts`: rutas de servidor que exponen estas operaciones; el body del cliente nunca fija `estadoPedido`/`estadoPago`, y `cancelarPedido` con un pedido pagado exige `confirmarPagoPerdido: true` explícito en el body admin.
- `crearVentaDirecta` y `crearPedidoPersonalizado` (venta en persona / pedido a medida) quedan fuera de esta fase con el mecanismo heredado; si uno de esos pedidos llega a `marcarPedidoPagado`, la RPC lo rechaza con `PF015` (reserva inválida) en vez de corromper stock.

## 13. Errores

`lib/perfumeOrderErrors.ts` traduce los `SQLSTATE` `PFxxx` (producto inexistente `PF002`, inactivo `PF003`, cantidad inválida `PF004`, stock insuficiente `PF005`, método de despacho inválido `PF006`, pedido inexistente `PF009`, ya pagado `PF010`, ya cancelado `PF011`, transición/estado inválido `PF012`, cancelación pagada sin confirmar `PF013`, configuración de despacho ausente `PF008`, reserva inválida `PF015`) a mensajes en español. Solo confía en el mensaje de Postgres cuando el código es uno de estos conocidos **y** viene acompañado de mensaje; cualquier otro error (constraint genérico, error de conexión, código desconocido) se convierte en un mensaje genérico sin exponer SQL, nombres de relación ni detalles internos. `httpStatusForPerfumeOrderError` mapea a 404 (`PF009`), 409 (`PF005`, `PF010`, `PF011`, `PF013`) o 400 por defecto.

## 14. Pruebas TypeScript

- `tests/lib/perfumeOrderErrors.test.ts`: confía en mensajes `PFxxx` conocidos, nunca expone detalles de Postgres para códigos desconocidos, maneja error nulo/vacío/de conexión, mapea status HTTP.
- `tests/repositories/pedidoRepositoryTransaccional.test.ts`: cubre el equivalente en memoria de las 4 RPC (Starken costo 0, domicilio semanal costo único, líneas duplicadas agregadas, stock insuficiente rechazado incluyendo el caso de reserva ya comprometida por otro pedido, producto inactivo/inexistente rechazado, marcar pagado convierte reserva en descuento físico y rechaza el doble pago, cancelar sin pago libera solo la reserva, cancelar pagado exige confirmación y repone solo `stock_actual`, doble cancelación rechazada, transiciones completas y transición inválida rechazada).
- `tests/services/pedidoService.test.ts` y `tests/services/adminPedidoService.test.ts`: confirman que el servicio llama a las RPC transaccionales (no inserta pedido/items manualmente, no ajusta stock producto por producto, un precio malicioso enviado por el cliente es ignorado, Starken recibe costo 0 y domicilio semanal recibe su costo directamente desde el resultado de la RPC) y que pagar/cancelar/avanzar estado usan sus respectivas RPC.
- Ejecutadas con `npm run test:run`: **101 pruebas, 13 archivos, todas en verde.**

## 15. Pruebas SQL reales

`supabase/tests/perfume_store_transactional_stock.sql`, ejecutado con `psql -v ON_ERROR_STOP=1` dentro de una sola transacción con `ROLLBACK` final (no deja datos de prueba). Usa una tabla temporal (`pg_temp.smoke_state`) y funciones auxiliares (`smoke_set`/`smoke_get`) para pasar valores entre bloques `do $$ ... $$`, en vez de variables `:nombre` de `psql` (que no se sustituyen dentro de bloques `$$...$$` y producían `syntax error at or near ":"` en un intento anterior).

Verifica, en orden: configuración genérica de despacho, productos de prueba, pedido Starken (despacho 0, subtotal/total desde catálogo real, stock reservado sin tocar `stock_actual`), pedido domicilio semanal (despacho 4000 una sola vez), líneas duplicadas agregadas en una sola línea, producto inactivo rechazado (`PF003`), stock insuficiente rechazado (`PF005`), un segundo pedido que compite por stock ya reservado también rechazado (`PF005`), marcar pagado (reduce `stock_actual` y `stock_reservado`, dos estados en `PAGADO`), cancelar pedido no pagado (libera reserva, no toca stock físico), segunda cancelación rechazada (`PF011`) sin alterar stock, cancelar pagado sin confirmar rechazado (`PF013`), cancelar pagado confirmando repone stock una sola vez, repetir esa cancelación no repone dos veces, transiciones completas `PAGADO→PREPARANDO→DESPACHADO→ENTREGADO` con fechas registradas y stock intacto, transición inválida sobre `ENTREGADO` rechazada (`PF012`), cancelación de `ENTREGADO` por el flujo común rechazada (`PF012`), permisos (`anon`/`authenticated` sin acceso, `service_role` con acceso), snapshot de producto conservado en `pedido_items`, formato y unicidad del código de pedido.

**Resultado: 18 escenarios numerados, todas las verificaciones en `OK`, `ROLLBACK` final ejecutado sin dejar datos.**

## 16. Prueba de concurrencia

Ejecutada con **dos procesos `psql` independientes** contra el mismo Postgres local (no `Promise.all`, no mocks, no una sola transacción, no delays simulando lógica de negocio):

- Se insertó un producto de prueba con `stock_actual = 1`, `stock_reservado = 0`.
- **Sesión A**: abre una transacción explícita, ejecuta `select ... for update` sobre la fila del producto (adquiere el lock), duerme 3 segundos (para garantizar que B ya esté bloqueada intentando el mismo lock) y luego llama `create_perfume_order_v1` pidiendo 1 unidad; hace `commit`.
- **Sesión B**: lanzada ~1 segundo después de A, en un proceso `psql` totalmente separado, llama `create_perfume_order_v1` pidiendo la misma unidad. Su `for update` interno (dentro de la función) queda bloqueado esperando la fila que A ya tiene tomada.
- Al hacer A `commit`, el lock de B se libera; B relee la fila ya actualizada (con la reserva de A aplicada) y su propia validación de stock la rechaza.

Resultado real observado:

```
SESSION A: ... create_perfume_order_v1 -> exito, codigo PERF-2026-000007
SESSION B: ERROR: Stock insuficiente para Perfume Concurrencia. (PF005)
```

Estado final del producto tras ambos intentos: `stock_actual = 1` (sin cambios, ninguna orden fue pagada), `stock_reservado = 1` (solo la reserva de A, la ganadora). Solo un pedido quedó registrado para ese producto (`PERF-2026-000007`). Los datos de esta prueba se eliminaron manualmente al finalizar (no corrió dentro de un `ROLLBACK`, porque necesitaba un commit real de A para forzar el bloqueo de B).

## 17. Resultados obtenidos

- Migraciones `20260724000000_perfume_store_foundation.sql` y `20260724010000_perfume_store_transactional_stock.sql` aplicadas desde cero, en orden, sobre Postgres local real (Supabase CLI, `npx supabase start`), dos veces (una antes del fix de la sección 19, otra después) sin errores.
- Smoke test SQL: 18/18 escenarios en `OK`.
- Concurrencia real: validada con dos conexiones independientes, un solo pedido ganador, stock final correcto.
- Suite TypeScript: 101/101 pruebas en verde (`npm run test:run`).
- `npm run lint`: sin errores. `npm run typecheck`: sin errores. `npm run build`: compilación exitosa (Next.js 16, Turbopack).
- Supabase remoto: no se usó `supabase link`, no se ejecutó SQL remoto, no se usó ningún `project-ref`. Contenedores locales detenidos y removidos al finalizar (`docker ps --filter "name=supabase-1c-local"` sin resultados).

## 18. Limitaciones

- `MemoryPedidoRepository` (modo sin Supabase, usado en desarrollo local y en `tests/repositories/pedidoRepositoryTransaccional.test.ts`) replica la lógica de reserva de forma síncrona sobre un array en memoria de un solo hilo. Eso es equivalente a atómico *para ese caso de uso*, pero no es la protección real contra sobreventa concurrente — esa solo la da la RPC de Postgres, validada en la sección 16.
- `crearVentaDirecta` y `crearPedidoPersonalizado` (flujos administrativos) siguen fuera de esta fase, con el mecanismo heredado de escritura de stock independiente. No se tocaron porque están fuera del alcance autorizado.
- El contador de `next_perfume_order_code()` es global, no particionado por año: si el negocio necesita reiniciar la numeración cada año calendario, eso requeriría un cambio adicional no incluido aquí.
- Esta fase no configura Vercel ni vincula un proyecto Supabase remoto: ambos siguen pendientes.

## 19. Hotfix aplicado antes de esta fase

Antes de ejecutar cualquier migración, se corrigió un bug en `supabase/migrations/20260724000000_perfume_store_foundation.sql` y su espejo `schema.sql`: `is_active_admin()` estaba definida antes de crear la tabla `usuarios_admin`. Al ser `language sql` (no `plpgsql`), Postgres valida el cuerpo de la función contra el catálogo en el momento del `CREATE FUNCTION`, no en la primera llamada; sobre una base realmente vacía la migración fallaba con `relation "usuarios_admin" does not exist`. Único cambio: mover la definición de la función a después del `create table` de `usuarios_admin`, con un comentario explicando por qué. No se modificó el modelo de datos, la lógica de seguridad ni ninguna política.

## 20. Bug encontrado y corregido durante esta fase

Durante el primer intento de smoke test se detectaron dos problemas reales (no de infraestructura):

1. **Tablas temporales con `on commit drop` en `create_perfume_order_v1`.** `ON COMMIT DROP` libera la tabla temporal recién al terminar la transacción de quien llama, no al terminar la función. Si la RPC se invoca más de una vez dentro de la misma transacción explícita (exactamente lo que hace el smoke test, y lo que podría ocurrir con un pooler en modo sesión), la segunda llamada encontraba la tabla ya creada por la primera y fallaba con `relation "tmp_perfume_order_qty" already exists`. Corregido cambiando a `create temporary table if not exists ...` seguido de `truncate table ...` al inicio de cada llamada, en `20260724010000_perfume_store_transactional_stock.sql` y su espejo en `schema.sql`.
2. **Aserción incorrecta en el propio smoke test** (paso 14): el cálculo esperado de `stock_reservado` para el producto A no consideraba que la reserva de 2 unidades del pedido con líneas duplicadas del paso 5 nunca se paga ni se cancela en el script, y sigue vigente. Se corrigieron los valores esperados en `supabase/tests/perfume_store_transactional_stock.sql` (de `stock_reservado = 1` a `stock_reservado = 2` en los dos bloques afectados). La lógica de las RPC era correcta; el error estaba en el dato esperado por la prueba.

Tras ambas correcciones, se reinició la base de datos desde cero, se reaplicaron las dos migraciones y el smoke test completo pasó sin errores.

## 21. Archivos modificados o creados en esta fase

Modificados:
- `supabase/migrations/20260724000000_perfume_store_foundation.sql` (hotfix, sección 19)
- `supabase/schema.sql` (mismo hotfix + espejo completo de la nueva migración)
- `repositories/pedidoRepository.ts`
- `services/pedidoService.ts`
- `app/api/orders/route.ts`
- `app/api/admin/orders/[pedidoId]/route.ts`
- `lib/constants.ts`
- `tests/services/pedidoService.test.ts`
- `tests/services/adminPedidoService.test.ts`

Nuevos:
- `supabase/migrations/20260724010000_perfume_store_transactional_stock.sql`
- `supabase/tests/perfume_store_transactional_stock.sql`
- `lib/perfumeOrderErrors.ts`
- `tests/lib/perfumeOrderErrors.test.ts`
- `tests/repositories/pedidoRepositoryTransaccional.test.ts`
- `docs/PERFUME_STORE_TRANSACTIONAL_STOCK.md` (este documento)

## 22. Orden futuro de despliegue

1. Vincular el proyecto Supabase remoto nuevo (`supabase link`) — todavía no se ha hecho.
2. Aplicar `supabase db push` (o ejecutar ambas migraciones manualmente) contra ese proyecto remoto, en el mismo orden: `20260724000000_perfume_store_foundation.sql` primero, luego `20260724010000_perfume_store_transactional_stock.sql`.
3. Configurar Vercel (variables de entorno de Supabase, dominio) — todavía no se ha hecho.
4. Configurar `business_settings` con los datos comerciales reales (costo de despacho, textos) antes de recibir pedidos reales — la migración solo aplica un valor genérico de `costo_despacho_semanal = 4000` si detecta el default de fundación (`0`).
5. Repetir el smoke test de esta fase contra el proyecto remoto recién creado, antes de exponerlo a tráfico real, para confirmar que el comportamiento observado en local se sostiene.

## 23. Checklist antes de vincular Supabase remoto

- [ ] Confirmar que no existe ningún dato de producción en el proyecto remoto nuevo (proyecto recién creado, vacío).
- [ ] Aplicar `20260724000000_perfume_store_foundation.sql` y verificar que no haya errores.
- [ ] Aplicar `20260724010000_perfume_store_transactional_stock.sql` y verificar que no haya errores.
- [ ] Ejecutar `supabase/tests/perfume_store_transactional_stock.sql` contra el proyecto remoto (con una conexión de solo prueba, nunca con datos reales) y confirmar que los 18 escenarios pasan.
- [ ] Confirmar permisos: `anon`/`authenticated` sin acceso a las 4 RPC, `service_role` con acceso.
- [ ] Configurar `business_settings` con los valores reales del negocio (no el valor genérico de la migración).
- [ ] Configurar las variables de entorno de Supabase en Vercel (URL, claves) sin exponer la clave de servicio al cliente.
- [ ] Repetir `npm run lint`, `npm run typecheck`, `npm run test:run` y `npm run build` contra el estado final de la rama antes de desplegar.
