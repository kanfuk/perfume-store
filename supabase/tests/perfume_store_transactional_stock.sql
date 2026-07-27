-- Perfume Store
-- Smoke tests SQL reales para la Fase 1C (stock transaccional y RPC de
-- pedidos). Pensado para ejecutarse con psql contra una instancia Supabase
-- LOCAL (nunca remota) que ya tenga aplicadas, en orden:
--   1. supabase/migrations/20260724000000_perfume_store_foundation.sql
--   2. supabase/migrations/20260724010000_perfume_store_transactional_stock.sql
--
-- Ejecucion tipica (ver docs/PERFUME_STORE_TRANSACTIONAL_STOCK.md):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/perfume_store_transactional_stock.sql
--
-- Todo corre dentro de una sola transaccion con ROLLBACK final: no deja
-- datos de prueba en la base. Cada verificacion que debe fallar se atrapa
-- con un bloque DO ... EXCEPTION (equivalente a un savepoint implicito), de
-- forma que un error esperado no aborta el resto del script. Si algo no
-- esperado ocurre, el bloque relanza la excepcion como 'FAIL: ...' y el
-- script se detiene (gracias a ON_ERROR_STOP), dejando claro que fallo.
--
-- Nota de diseno: cada escenario que llama una RPC lo hace DENTRO de un
-- unico bloque "do $$ ... $$", capturando el jsonb de retorno en una
-- variable plpgsql local y comparando ahi mismo. Los valores que un
-- escenario posterior necesita (p.ej. el pedidoId generado) se guardan en
-- una tabla temporal (pg_temp.smoke_state) via las funciones auxiliares
-- pg_temp.smoke_set/smoke_get, en vez de variables de psql (:nombre). Esto
-- es deliberado: psql NO sustituye ":nombre" dentro de un bloque dollar-
-- quoted ($$...$$), asi que una version anterior de este archivo que
-- intentaba referenciar variables de psql directamente dentro de bloques
-- "do $$" fallaba con "syntax error at or near ':'" al ejecutarse contra
-- Postgres real. El patron con tabla temporal evita ese problema por
-- completo y ademas es portable a cualquier cliente SQL, no solo psql.
--
-- No contiene datos reales de clientes, pedidos, productos ni credenciales:
-- los UUID de producto son constantes de prueba fijas y legibles.

\set ON_ERROR_STOP on
\timing off

begin;

\echo '--- Fase 1C smoke tests: inicio ---'

create temp table smoke_state (
  key text primary key,
  value text
) on commit drop;

create or replace function pg_temp.smoke_set(p_key text, p_value text) returns void
language sql
as $$
  insert into smoke_state (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value;
$$;

create or replace function pg_temp.smoke_get(p_key text) returns text
language sql
as $$
  select value from smoke_state where key = p_key;
$$;

-- ============================================================
-- 1. Configuracion generica y productos de prueba.
-- ============================================================

\echo '[1] Configuracion generica de despacho'
do $$
begin
  if not exists (
    select 1 from public.business_settings
    where id = '00000000-0000-0000-0000-000000000001'::uuid
      and costo_despacho_semanal = 4000
  ) then
    raise exception 'FAIL: business_settings.costo_despacho_semanal no quedo en 4000';
  end if;
  raise notice 'OK: business_settings.costo_despacho_semanal = 4000';
end;
$$;

\echo '[2] Insertar productos de prueba (aaaaaaaa=A, bbbbbbbb=B, cccccccc=C inactivo)'
insert into public.productos (
  id, sku, nombre, marca, contenido, descripcion, precio_venta, costo_unitario,
  stock_actual, activo
) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000001', 'TEST-A', 'Perfume Test A', 'Marca Test',
   '50ml', 'Producto de prueba A', 10000, 4000, 5, true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-000000000002', 'TEST-B', 'Perfume Test B', 'Marca Test',
   '100ml', 'Producto de prueba B', 20000, 8000, 3, true),
  ('cccccccc-cccc-cccc-cccc-000000000003', 'TEST-C', 'Perfume Test C (inactivo)', 'Marca Test',
   '30ml', 'Producto de prueba C', 5000, 2000, 10, false);

-- ============================================================
-- 3. Pedido Starken: despacho 0, subtotal/total correctos, stock_reservado
--    incrementado, stock_actual sin cambios. El precio se toma siempre de
--    productos.precio_venta: la firma de create_perfume_order_v1 no acepta
--    ningun campo de precio desde quien llama, asi que no existe una via
--    para "enviar un precio malicioso" (punto 5 del enunciado): el
--    subtotal resultante solo puede venir del catalogo real, lo cual se
--    verifica aqui mismo.
-- ============================================================

\echo '[3] Pedido Starken (despacho 0)'
do $$
declare
  v_result jsonb;
begin
  select public.create_perfume_order_v1(
    jsonb_build_object(
      'nombre', 'Cliente Prueba Uno',
      'rut', '11.111.111-1',
      'email', 'prueba.uno@example.invalid',
      'telefono', '+56911111111',
      'region', 'Metropolitana',
      'comuna', 'Providencia',
      'direccion', 'Calle Falsa 123'
    ),
    jsonb_build_array(
      jsonb_build_object('producto_id', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001', 'cantidad', 2)
    ),
    'STARKEN_POR_PAGAR'
  ) into v_result;

  perform pg_temp.smoke_set('pedido_starken_id', v_result->>'pedidoId');
  perform pg_temp.smoke_set('pedido_starken_codigo', v_result->>'codigo');

  if (v_result->>'costoDespacho')::int <> 0 then
    raise exception 'FAIL: Starken deberia costar 0, costo %', v_result->>'costoDespacho';
  end if;
  if (v_result->>'subtotal')::int <> 20000 then
    raise exception 'FAIL: subtotal esperado 20000 (precio real de catalogo), obtenido %', v_result->>'subtotal';
  end if;
  if (v_result->>'total')::int <> 20000 then
    raise exception 'FAIL: total esperado 20000, obtenido %', v_result->>'total';
  end if;
  if not exists (
    select 1 from public.productos
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001'
      and stock_actual = 5 and stock_reservado = 2
  ) then
    raise exception 'FAIL: producto A deberia tener stock_actual=5, stock_reservado=2 tras el pedido Starken';
  end if;
  raise notice 'OK: pedido Starken con precio real de catalogo, despacho 0, stock reservado correctamente';
end;
$$;

-- ============================================================
-- 4. Pedido domicilio semanal: despacho 4000 una sola vez.
-- ============================================================

\echo '[4] Pedido domicilio semanal (despacho 4000 una sola vez)'
do $$
declare
  v_result jsonb;
begin
  select public.create_perfume_order_v1(
    jsonb_build_object('nombre', 'Cliente Prueba Dos', 'telefono', '+56922222222'),
    jsonb_build_array(
      jsonb_build_object('producto_id', 'bbbbbbbb-bbbb-bbbb-bbbb-000000000002', 'cantidad', 1)
    ),
    'DOMICILIO_SEMANAL'
  ) into v_result;

  perform pg_temp.smoke_set('pedido_domicilio_id', v_result->>'pedidoId');

  if (v_result->>'costoDespacho')::int <> 4000 then
    raise exception 'FAIL: domicilio semanal deberia costar 4000, costo %', v_result->>'costoDespacho';
  end if;
  if (v_result->>'subtotal')::int <> 20000 then
    raise exception 'FAIL: subtotal esperado 20000, obtenido %', v_result->>'subtotal';
  end if;
  if (v_result->>'total')::int <> 24000 then
    raise exception 'FAIL: total esperado 24000 (subtotal + despacho unico), obtenido %', v_result->>'total';
  end if;
  raise notice 'OK: pedido domicilio semanal con despacho 4000 sumado una sola vez';
end;
$$;

-- ============================================================
-- 6. Dos lineas duplicadas del mismo producto: deben agregarse en una
--    sola linea de pedido_items con la cantidad sumada.
-- ============================================================

\echo '[5] Lineas duplicadas del mismo producto se agregan correctamente'
do $$
declare
  v_result jsonb;
  v_pedido_id uuid;
  v_line_count integer;
  v_cantidad integer;
begin
  select public.create_perfume_order_v1(
    jsonb_build_object('nombre', 'Cliente Prueba Tres', 'telefono', '+56933333333'),
    jsonb_build_array(
      jsonb_build_object('producto_id', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001', 'cantidad', 1),
      jsonb_build_object('producto_id', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001', 'cantidad', 1)
    ),
    'STARKEN_POR_PAGAR'
  ) into v_result;

  v_pedido_id := (v_result->>'pedidoId')::uuid;

  select count(*), max(cantidad) into v_line_count, v_cantidad
  from public.pedido_items
  where pedido_id = v_pedido_id;

  if v_line_count <> 1 or v_cantidad <> 2 then
    raise exception 'FAIL: se esperaba 1 linea con cantidad 2, se obtuvieron % lineas, cantidad %', v_line_count, v_cantidad;
  end if;

  if not exists (
    select 1 from public.productos
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001'
      and stock_actual = 5 and stock_reservado = 4
  ) then
    raise exception 'FAIL: producto A deberia tener stock_reservado=4 tras agregar la linea duplicada (2 + 2)';
  end if;

  raise notice 'OK: lineas duplicadas agregadas en una sola linea de pedido_items';
end;
$$;

-- ============================================================
-- 7. Producto inactivo debe fallar.
-- ============================================================

\echo '[6] Producto inactivo debe fallar (PF003)'
do $$
begin
  perform public.create_perfume_order_v1(
    jsonb_build_object('nombre', 'Cliente Prueba Cuatro'),
    jsonb_build_array(
      jsonb_build_object('producto_id', 'cccccccc-cccc-cccc-cccc-000000000003', 'cantidad', 1)
    ),
    'STARKEN_POR_PAGAR'
  );
  raise exception 'FAIL: se esperaba PF003 (producto inactivo) y la funcion tuvo exito';
exception
  when sqlstate 'PF003' then
    raise notice 'OK: producto inactivo rechazado (PF003)';
  when others then
    raise exception 'FAIL: se esperaba PF003, se obtuvo % (%)', sqlstate, sqlerrm;
end;
$$;

-- ============================================================
-- 8. Stock insuficiente debe fallar.
-- ============================================================

\echo '[7] Stock insuficiente debe fallar (PF005)'
do $$
begin
  perform public.create_perfume_order_v1(
    jsonb_build_object('nombre', 'Cliente Prueba Cinco'),
    jsonb_build_array(
      jsonb_build_object('producto_id', 'bbbbbbbb-bbbb-bbbb-bbbb-000000000002', 'cantidad', 5)
    ),
    'STARKEN_POR_PAGAR'
  );
  raise exception 'FAIL: se esperaba PF005 (stock insuficiente) y la funcion tuvo exito';
exception
  when sqlstate 'PF005' then
    raise notice 'OK: stock insuficiente rechazado (PF005)';
  when others then
    raise exception 'FAIL: se esperaba PF005, se obtuvo % (%)', sqlstate, sqlerrm;
end;
$$;

-- ============================================================
-- 9. Un segundo pedido que exceda el stock disponible ya reservado por
--    otro pedido tambien debe fallar. Producto A: stock_actual=5,
--    stock_reservado=4 (steps 3 y 5) => disponible=1. Pedir 2 debe fallar.
-- ============================================================

\echo '[8] Segundo pedido que excede stock ya reservado debe fallar (PF005)'
do $$
begin
  perform public.create_perfume_order_v1(
    jsonb_build_object('nombre', 'Cliente Prueba Seis'),
    jsonb_build_array(
      jsonb_build_object('producto_id', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001', 'cantidad', 2)
    ),
    'STARKEN_POR_PAGAR'
  );
  raise exception 'FAIL: se esperaba PF005 (excede stock ya reservado) y la funcion tuvo exito';
exception
  when sqlstate 'PF005' then
    raise notice 'OK: pedido que compite por stock ya reservado fue rechazado (PF005)';
  when others then
    raise exception 'FAIL: se esperaba PF005, se obtuvo % (%)', sqlstate, sqlerrm;
end;
$$;

-- ============================================================
-- 10. Marcar pagado: reduce stock_actual y stock_reservado en la misma
--     cantidad, estado PAGADO/PAGADO, fecha_pago registrada.
-- ============================================================

\echo '[9] Marcar pagado reduce stock_actual y stock_reservado'
do $$
declare
  v_result jsonb;
  v_pedido_id uuid := pg_temp.smoke_get('pedido_starken_id')::uuid;
  v_fecha_pago timestamptz;
  v_pago_count integer;
begin
  select public.mark_perfume_order_paid_v1(v_pedido_id) into v_result;

  if (v_result->>'estadoPedido') <> 'PAGADO' or (v_result->>'estadoPago') <> 'PAGADO' then
    raise exception 'FAIL: estado esperado PAGADO/PAGADO, obtenido %/%',
      v_result->>'estadoPedido', v_result->>'estadoPago';
  end if;

  select fecha_pago into v_fecha_pago from public.pedidos where id = v_pedido_id;
  if v_fecha_pago is null then
    raise exception 'FAIL: fecha_pago no quedo registrada';
  end if;

  select count(*) into v_pago_count from public.pagos where pedido_id = v_pedido_id;
  if v_pago_count <> 1 then
    raise exception 'FAIL: se esperaba 1 registro en pagos, hay %', v_pago_count;
  end if;

  -- El pedido Starken original reservo 2 unidades de A (paso 3). Tras
  -- pagar, esas 2 se descuentan de stock_actual y stock_reservado.
  -- stock_actual: 5 -> 3. stock_reservado: 4 -> 2 (quedan las 2 del
  -- pedido con lineas duplicadas del paso 6, que sigue SIN_PAGO).
  if not exists (
    select 1 from public.productos
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001'
      and stock_actual = 3 and stock_reservado = 2
  ) then
    raise exception 'FAIL: producto A deberia tener stock_actual=3, stock_reservado=2 tras marcar pagado';
  end if;

  raise notice 'OK: marcar pagado convirtio la reserva en salida fisica correctamente';
end;
$$;

-- ============================================================
-- 11. Cancelar pedido no pagado: libera stock_reservado, stock_actual
--     no cambia.
-- ============================================================

\echo '[10] Cancelar pedido no pagado libera la reserva'
do $$
declare
  v_result jsonb;
  v_pedido_id uuid := pg_temp.smoke_get('pedido_domicilio_id')::uuid;
begin
  select public.cancel_perfume_order_v1(v_pedido_id, 'Cliente desistio', false) into v_result;

  if (v_result->>'estadoPago') <> 'CANCELADO' then
    raise exception 'FAIL: estado_pago esperado CANCELADO, obtenido %', v_result->>'estadoPago';
  end if;

  if not exists (
    select 1 from public.productos
    where id = 'bbbbbbbb-bbbb-bbbb-bbbb-000000000002'
      and stock_actual = 3 and stock_reservado = 0
  ) then
    raise exception 'FAIL: producto B deberia tener stock_actual=3 (sin cambios), stock_reservado=0 (liberado)';
  end if;

  raise notice 'OK: cancelacion de pedido sin pago libero la reserva sin tocar stock_actual';
end;
$$;

-- ============================================================
-- 12. Cancelar dos veces el mismo pedido: la segunda debe fallar y no
--     debe alterar el stock otra vez.
-- ============================================================

\echo '[11] Cancelar dos veces el mismo pedido debe fallar en la segunda'
do $$
declare
  v_pedido_id uuid := pg_temp.smoke_get('pedido_domicilio_id')::uuid;
begin
  perform public.cancel_perfume_order_v1(v_pedido_id, 'Segundo intento', false);
  raise exception 'FAIL: se esperaba PF011 (ya cancelado) y la funcion tuvo exito';
exception
  when sqlstate 'PF011' then
    raise notice 'OK: segunda cancelacion rechazada (PF011)';
  when others then
    raise exception 'FAIL: se esperaba PF011, se obtuvo % (%)', sqlstate, sqlerrm;
end;
$$;

do $$
begin
  if not exists (
    select 1 from public.productos
    where id = 'bbbbbbbb-bbbb-bbbb-bbbb-000000000002'
      and stock_actual = 3 and stock_reservado = 0
  ) then
    raise exception 'FAIL: el stock de producto B cambio tras el segundo intento de cancelacion';
  end if;
  raise notice 'OK: stock de producto B no se altero en el segundo intento';
end;
$$;

-- ============================================================
-- 13. Cancelar pedido pagado sin confirmar reposicion: debe fallar.
-- ============================================================

\echo '[12] Cancelar pedido pagado sin confirmar debe fallar (PF013)'
do $$
declare
  v_pedido_id uuid := pg_temp.smoke_get('pedido_starken_id')::uuid;
begin
  perform public.cancel_perfume_order_v1(v_pedido_id, 'Cliente se arrepintio', false);
  raise exception 'FAIL: se esperaba PF013 (falta confirmar reposicion) y la funcion tuvo exito';
exception
  when sqlstate 'PF013' then
    raise notice 'OK: cancelacion de pedido pagado sin confirmar fue rechazada (PF013)';
  when others then
    raise exception 'FAIL: se esperaba PF013, se obtuvo % (%)', sqlstate, sqlerrm;
end;
$$;

-- ============================================================
-- 14. Cancelar pedido pagado confirmando: repone stock_actual una sola
--     vez.
-- ============================================================

\echo '[13] Cancelar pedido pagado confirmando repone stock_actual una vez'
do $$
declare
  v_result jsonb;
  v_pedido_id uuid := pg_temp.smoke_get('pedido_starken_id')::uuid;
begin
  select public.cancel_perfume_order_v1(v_pedido_id, 'Cliente se arrepintio', true) into v_result;

  if (v_result->>'estadoPago') <> 'PAGADO' then
    raise exception 'FAIL: estado_pago deberia conservarse como PAGADO tras cancelar (el pago no se borra), obtenido %',
      v_result->>'estadoPago';
  end if;

  -- El pedido Starken pagado tenia 2 unidades de A. Antes de esta
  -- cancelacion: stock_actual=3, stock_reservado=2 (paso 9). Al reponer:
  -- stock_actual 3 -> 5. stock_reservado no se toca (sigue en 2, del
  -- pedido con lineas duplicadas del paso 6).
  if not exists (
    select 1 from public.productos
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001'
      and stock_actual = 5 and stock_reservado = 2
  ) then
    raise exception 'FAIL: producto A deberia tener stock_actual=5, stock_reservado=2 tras reponer el pedido pagado';
  end if;

  raise notice 'OK: cancelacion de pedido pagado confirmada repuso stock_actual correctamente';
end;
$$;

\echo '[13b] Repetir cancelacion pagada (ya CANCELADO) no repone stock una segunda vez'
do $$
declare
  v_pedido_id uuid := pg_temp.smoke_get('pedido_starken_id')::uuid;
begin
  perform public.cancel_perfume_order_v1(v_pedido_id, 'Tercer intento', true);
  raise exception 'FAIL: se esperaba PF011 (ya cancelado) y la funcion tuvo exito';
exception
  when sqlstate 'PF011' then
    raise notice 'OK: repetir la cancelacion de un pedido ya cancelado fue rechazado (PF011)';
  when others then
    raise exception 'FAIL: se esperaba PF011, se obtuvo % (%)', sqlstate, sqlerrm;
end;
$$;

do $$
begin
  if not exists (
    select 1 from public.productos
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001'
      and stock_actual = 5 and stock_reservado = 2
  ) then
    raise exception 'FAIL: el stock de producto A cambio tras el intento repetido de cancelacion pagada (doble reposicion)';
  end if;
  raise notice 'OK: no hubo doble reposicion de stock';
end;
$$;

-- ============================================================
-- 15. Transiciones PAGADO -> PREPARANDO -> DESPACHADO -> ENTREGADO. No
--     deben alterar stock.
-- ============================================================

\echo '[14] Nuevo pedido para probar transiciones PAGADO->PREPARANDO->DESPACHADO->ENTREGADO'
do $$
declare
  v_result jsonb;
begin
  select public.create_perfume_order_v1(
    jsonb_build_object('nombre', 'Cliente Prueba Siete'),
    jsonb_build_array(
      jsonb_build_object('producto_id', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001', 'cantidad', 1)
    ),
    'STARKEN_POR_PAGAR'
  ) into v_result;

  perform pg_temp.smoke_set('pedido_flujo_id', v_result->>'pedidoId');
  raise notice 'OK: pedido de prueba para transiciones creado (%)', v_result->>'pedidoId';
end;
$$;

do $$
declare
  v_result jsonb;
  v_pedido_id uuid := pg_temp.smoke_get('pedido_flujo_id')::uuid;
begin
  select public.mark_perfume_order_paid_v1(v_pedido_id) into v_result;

  if (v_result->>'estadoPedido') <> 'PAGADO' then
    raise exception 'FAIL: no se pudo dejar el pedido de prueba en PAGADO';
  end if;
  -- A: stock_actual 5->4, stock_reservado 3->2. El "3" de partida es la
  -- reserva de 2 unidades que sigue vigente desde el pedido con lineas
  -- duplicadas del paso [5] (nunca se paga ni se cancela en este script)
  -- mas la unidad que este pedido de prueba reservo en el paso [14].
  if not exists (
    select 1 from public.productos
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001'
      and stock_actual = 4 and stock_reservado = 2
  ) then
    raise exception 'FAIL: stock de producto A inesperado antes de probar las transiciones';
  end if;
end;
$$;

do $$
declare
  v_pedido_id uuid := pg_temp.smoke_get('pedido_flujo_id')::uuid;
  v_preparando jsonb;
  v_despachado jsonb;
  v_entregado jsonb;
  v_fecha_prep timestamptz;
  v_fecha_desp timestamptz;
  v_fecha_ent timestamptz;
begin
  select public.advance_perfume_order_status_v1(v_pedido_id, 'PREPARANDO') into v_preparando;
  select public.advance_perfume_order_status_v1(v_pedido_id, 'DESPACHADO') into v_despachado;
  select public.advance_perfume_order_status_v1(v_pedido_id, 'ENTREGADO') into v_entregado;

  if (v_preparando->>'estadoPedido') <> 'PREPARANDO'
     or (v_despachado->>'estadoPedido') <> 'DESPACHADO'
     or (v_entregado->>'estadoPedido') <> 'ENTREGADO' then
    raise exception 'FAIL: la secuencia de transiciones no llego a ENTREGADO (%/%/%)',
      v_preparando->>'estadoPedido', v_despachado->>'estadoPedido', v_entregado->>'estadoPedido';
  end if;

  select fecha_preparacion, fecha_despacho, fecha_entrega
  into v_fecha_prep, v_fecha_desp, v_fecha_ent
  from public.pedidos where id = v_pedido_id;

  if v_fecha_prep is null or v_fecha_desp is null or v_fecha_ent is null then
    raise exception 'FAIL: alguna fecha de la secuencia de transiciones quedo sin registrar';
  end if;

  -- El stock no debe haber cambiado por las transiciones (mismo valor que
  -- antes de este bloque: ver comentario del bloque anterior).
  if not exists (
    select 1 from public.productos
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001'
      and stock_actual = 4 and stock_reservado = 2
  ) then
    raise exception 'FAIL: las transiciones PREPARANDO/DESPACHADO/ENTREGADO no deben alterar stock';
  end if;

  raise notice 'OK: transiciones PAGADO->PREPARANDO->DESPACHADO->ENTREGADO completas, fechas registradas, stock intacto';
end;
$$;

-- ============================================================
-- 16. Transicion invalida debe fallar (pedido ya ENTREGADO).
-- ============================================================

\echo '[15] Transicion invalida sobre pedido ENTREGADO debe fallar (PF012)'
do $$
declare
  v_pedido_id uuid := pg_temp.smoke_get('pedido_flujo_id')::uuid;
begin
  perform public.advance_perfume_order_status_v1(v_pedido_id, 'PREPARANDO');
  raise exception 'FAIL: se esperaba PF012 (transicion invalida) y la funcion tuvo exito';
exception
  when sqlstate 'PF012' then
    raise notice 'OK: transicion invalida sobre pedido ENTREGADO rechazada (PF012)';
  when others then
    raise exception 'FAIL: se esperaba PF012, se obtuvo % (%)', sqlstate, sqlerrm;
end;
$$;

\echo '[15b] Cancelar un pedido ENTREGADO por el flujo comun debe fallar (PF012)'
do $$
declare
  v_pedido_id uuid := pg_temp.smoke_get('pedido_flujo_id')::uuid;
begin
  perform public.cancel_perfume_order_v1(v_pedido_id, 'Intento de devolucion', true);
  raise exception 'FAIL: se esperaba PF012 (entregado no se cancela por este flujo) y la funcion tuvo exito';
exception
  when sqlstate 'PF012' then
    raise notice 'OK: cancelacion de pedido ENTREGADO rechazada por el flujo comun (PF012)';
  when others then
    raise exception 'FAIL: se esperaba PF012, se obtuvo % (%)', sqlstate, sqlerrm;
end;
$$;

-- ============================================================
-- 17. Permisos: anon y authenticated no pueden ejecutar las RPC;
--     service_role si puede.
-- ============================================================

\echo '[16] Permisos: anon no puede ejecutar create_perfume_order_v1'
set role anon;
do $$
begin
  perform public.create_perfume_order_v1('{}'::jsonb, '[]'::jsonb, 'STARKEN_POR_PAGAR');
  raise exception 'FAIL: anon pudo ejecutar create_perfume_order_v1';
exception
  when insufficient_privilege then
    raise notice 'OK: anon no puede ejecutar create_perfume_order_v1';
  when others then
    raise exception 'FAIL: se esperaba insufficient_privilege para anon, se obtuvo % (%)', sqlstate, sqlerrm;
end;
$$;
reset role;

\echo '[16b] Permisos: authenticated no puede ejecutar create_perfume_order_v1'
set role authenticated;
do $$
begin
  perform public.create_perfume_order_v1('{}'::jsonb, '[]'::jsonb, 'STARKEN_POR_PAGAR');
  raise exception 'FAIL: authenticated pudo ejecutar create_perfume_order_v1';
exception
  when insufficient_privilege then
    raise notice 'OK: authenticated no puede ejecutar create_perfume_order_v1';
  when others then
    raise exception 'FAIL: se esperaba insufficient_privilege para authenticated, se obtuvo % (%)', sqlstate, sqlerrm;
end;
$$;
reset role;

\echo '[16c] Permisos: service_role si puede ejecutar las RPC'
set role service_role;
do $$
declare
  v_codigo text;
begin
  select public.next_perfume_order_code() into v_codigo;
  if v_codigo is null then
    raise exception 'FAIL: service_role no pudo ejecutar next_perfume_order_code';
  end if;
  raise notice 'OK: service_role puede ejecutar las funciones (codigo de prueba: %)', v_codigo;
end;
$$;
reset role;

-- ============================================================
-- 18. Snapshots: nombre, marca, contenido y precio se conservan en
--     pedido_items independientemente del estado actual del pedido.
-- ============================================================

\echo '[17] Snapshot de producto conservado en pedido_items'
do $$
declare
  v_pedido_id uuid := pg_temp.smoke_get('pedido_starken_id')::uuid;
  v_nombre text;
  v_marca text;
  v_contenido text;
  v_precio integer;
begin
  select producto_nombre, producto_marca, producto_contenido, precio_unitario
  into v_nombre, v_marca, v_contenido, v_precio
  from public.pedido_items
  where pedido_id = v_pedido_id
  limit 1;

  if v_nombre <> 'Perfume Test A' or v_marca <> 'Marca Test' or v_contenido <> '50ml' or v_precio <> 10000 then
    raise exception 'FAIL: snapshot incorrecto (nombre=%, marca=%, contenido=%, precio=%)',
      v_nombre, v_marca, v_contenido, v_precio;
  end if;

  raise notice 'OK: snapshot de producto conservado correctamente en pedido_items';
end;
$$;

-- ============================================================
-- 19. Codigo: formato PERF-YYYY-000001 y unicidad.
-- ============================================================

\echo '[18] Formato y unicidad del codigo de pedido'
do $$
declare
  v_codigo text := pg_temp.smoke_get('pedido_starken_codigo');
begin
  if v_codigo !~ '^PERF-[0-9]{4}-[0-9]{6}$' then
    raise exception 'FAIL: codigo con formato inesperado: %', v_codigo;
  end if;
  raise notice 'OK: formato de codigo correcto (%)', v_codigo;
end;
$$;

do $$
declare
  v_total integer;
  v_distintos integer;
begin
  select count(*), count(distinct codigo) into v_total, v_distintos
  from public.pedidos
  where cliente_id in (select id from public.clientes where telefono like '+5691%' or telefono like '+5692%' or telefono like '+5693%');

  if v_total = 0 or v_total <> v_distintos then
    raise exception 'FAIL: se esperaban codigos unicos entre los % pedidos de prueba (% distintos)', v_total, v_distintos;
  end if;

  raise notice 'OK: % pedidos de prueba, todos con codigo unico', v_total;
end;
$$;

\echo '--- Fase 1C smoke tests: todas las verificaciones pasaron ---'

rollback;

\echo '--- ROLLBACK final ejecutado: no queda ningun dato de prueba en la base ---'
