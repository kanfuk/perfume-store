-- Perfume Store
-- Fase 1D-A: reemplaza create_perfume_order_v1 para eliminar las tablas
-- temporales, sin cambiar firma, respuesta JSON, codigos PF, seguridad,
-- permisos ni logica transaccional.
--
-- Motivo: al ejecutar "supabase db lint --linked --fail-on error" contra el
-- Supabase remoto nuevo (base vacia, sin datos), el analizador estatico de
-- PL/pgSQL marco un error en esta funcion:
--   relation "tmp_perfume_order_qty" does not exist (sqlState 42P01)
-- El patron "create temporary table if not exists ... ; truncate table ...;"
-- introducido en 20260724010000_perfume_store_transactional_stock.sql (para
-- permitir llamar la funcion mas de una vez dentro de la misma transaccion,
-- ver ese archivo) funciona correctamente en ejecucion real -- fue validado
-- de forma exhaustiva en Fase 1C: 18/18 escenarios del smoke test SQL
-- (incluyendo llamadas repetidas dentro de una misma transaccion) y la
-- prueba de concurrencia con dos conexiones independientes, todos en verde.
-- Sin embargo, el analizador estatico de "supabase db lint" no puede probar
-- en todas sus rutas de analisis que la tabla temporal ya existe antes del
-- primer INSERT, y lo reporta como error aunque no lo sea en tiempo de
-- ejecucion. Para no depender de esa limitacion del linter (y para evitar
-- tablas temporales en general, que son mas dificiles de auditar
-- estaticamente), esta migracion reescribe la funcion sin usarlas.
--
-- Reemplazo de las tablas temporales:
--   - tmp_perfume_order_qty  -> dos arrays PL/pgSQL (v_producto_ids uuid[],
--     v_cantidades integer[]), construidos una sola vez a partir de la
--     agregacion de lineas duplicadas, y usados para el "for update"
--     deterministico por id (misma logica de bloqueo que antes, sin join a
--     una relacion creada dinamicamente).
--   - tmp_perfume_order_lines -> un valor jsonb acumulado en una variable
--     PL/pgSQL (v_lines_json), releido despues con jsonb_to_recordset(...)
--     para el INSERT en pedido_items, el UPDATE de stock_reservado y la
--     construccion de la respuesta. jsonb_to_recordset es una funcion
--     (no una relacion persistente ni SQL dinamico): el linter no la marca.
--
-- Esta migracion NO modifica las dos migraciones ya aplicadas (ni local ni
-- remotamente): 20260724000000_perfume_store_foundation.sql y
-- 20260724010000_perfume_store_transactional_stock.sql quedan intactas. Es
-- puramente aditiva: solo hace CREATE OR REPLACE FUNCTION sobre la misma
-- firma ya existente (create_perfume_order_v1(jsonb, jsonb, text, text,
-- text)), y vuelve a fijar los mismos permisos por seguridad explicita
-- (CREATE OR REPLACE FUNCTION preserva los permisos existentes sobre el
-- mismo oid, pero reafirmarlos aqui documenta la intencion y protege ante
-- cualquier cambio manual accidental de permisos).
--
-- No contiene datos reales de clientes, pedidos, productos ni credenciales.

create or replace function public.create_perfume_order_v1(
  p_cliente jsonb,
  p_items jsonb,
  p_metodo_despacho text,
  p_observacion text default null,
  p_origen_pedido text default 'PUBLICO'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text := btrim(coalesce(p_cliente->>'nombre', ''));
  v_rut text := nullif(btrim(coalesce(p_cliente->>'rut', '')), '');
  v_email text := nullif(btrim(coalesce(p_cliente->>'email', '')), '');
  v_telefono text := nullif(btrim(coalesce(p_cliente->>'telefono', '')), '');
  v_region text := nullif(btrim(coalesce(p_cliente->>'region', '')), '');
  v_comuna text := nullif(btrim(coalesce(p_cliente->>'comuna', '')), '');
  v_direccion text := nullif(btrim(coalesce(p_cliente->>'direccion', '')), '');
  v_referencia text := nullif(btrim(coalesce(p_cliente->>'referencia_direccion', '')), '');
  v_cliente_id uuid;
  v_producto_ids uuid[];
  v_cantidades integer[];
  v_idx integer;
  v_qty integer;
  v_producto_row record;
  v_pedido_id uuid;
  v_codigo text;
  v_subtotal integer := 0;
  v_costo_despacho integer := 0;
  v_total integer := 0;
  v_items_count integer := 0;
  v_matched_count integer := 0;
  v_lines_json jsonb := '[]'::jsonb;
  v_items_json jsonb := '[]'::jsonb;
begin
  if p_metodo_despacho not in ('STARKEN_POR_PAGAR', 'DOMICILIO_SEMANAL') then
    raise exception 'Metodo de despacho invalido.' using errcode = 'PF006';
  end if;

  if v_nombre = '' then
    raise exception 'El nombre del cliente es obligatorio.' using errcode = 'PF007';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido debe tener al menos un item.' using errcode = 'PF001';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as elem
    where elem->>'producto_id' is null
       or coalesce((elem->>'cantidad')::int, 0) < 1
  ) then
    raise exception 'Cada item debe tener producto y cantidad minima de 1.' using errcode = 'PF004';
  end if;

  -- Agrega lineas duplicadas del mismo producto en dos arrays alineados por
  -- indice (mismo ORDER BY en ambos array_agg sobre el mismo conjunto
  -- agrupado por producto_id, que es unico por fila): reemplaza a
  -- tmp_perfume_order_qty sin crear ninguna relacion.
  select array_agg(producto_id order by producto_id), array_agg(cantidad order by producto_id)
  into v_producto_ids, v_cantidades
  from (
    select (elem->>'producto_id')::uuid as producto_id, sum((elem->>'cantidad')::int) as cantidad
    from jsonb_array_elements(p_items) as elem
    group by (elem->>'producto_id')::uuid
  ) agg;

  v_items_count := coalesce(array_length(v_producto_ids, 1), 0);

  select count(*) into v_matched_count
  from public.productos p
  where p.id = any(v_producto_ids);

  if v_matched_count <> v_items_count then
    raise exception 'Uno o mas productos del pedido no existen.' using errcode = 'PF002';
  end if;

  -- Bloqueo determinista en orden de id para reducir riesgo de deadlock
  -- frente a otra transaccion concurrente que reserve un subconjunto
  -- solapado de productos. Mismo orden y misma clausula FOR UPDATE que la
  -- version anterior; unico cambio es que el filtro es "id = any(array)" en
  -- vez de un join a una tabla temporal.
  for v_producto_row in
    select p.*
    from public.productos p
    where p.id = any(v_producto_ids)
    order by p.id
    for update
  loop
    v_idx := array_position(v_producto_ids, v_producto_row.id);
    v_qty := v_cantidades[v_idx];

    if v_producto_row.activo is not true then
      raise exception 'El producto % no esta disponible.', v_producto_row.nombre
        using errcode = 'PF003';
    end if;

    if (v_producto_row.stock_actual - v_producto_row.stock_reservado) < v_qty then
      raise exception 'Stock insuficiente para %.', v_producto_row.nombre
        using errcode = 'PF005';
    end if;

    v_subtotal := v_subtotal + (v_producto_row.precio_venta * v_qty);

    -- Acumula el snapshot de esta linea en un valor jsonb (reemplaza a
    -- tmp_perfume_order_lines). Se relee mas abajo con jsonb_to_recordset.
    v_lines_json := v_lines_json || jsonb_build_array(jsonb_build_object(
      'producto_id', v_producto_row.id,
      'cantidad', v_qty,
      'sku', v_producto_row.sku,
      'nombre', v_producto_row.nombre,
      'marca', v_producto_row.marca,
      'contenido', v_producto_row.contenido,
      'descripcion', v_producto_row.descripcion,
      'image_url', v_producto_row.image_url,
      'tipo_producto', v_producto_row.tipo_producto,
      'precio_unitario', v_producto_row.precio_venta,
      'costo_unitario', v_producto_row.costo_unitario
    ));
  end loop;

  if p_metodo_despacho = 'STARKEN_POR_PAGAR' then
    v_costo_despacho := 0;
  else
    select costo_despacho_semanal into v_costo_despacho
    from public.business_settings
    where id = '00000000-0000-0000-0000-000000000001'::uuid;

    if v_costo_despacho is null then
      raise exception 'Falta configuracion de despacho del negocio.' using errcode = 'PF008';
    end if;
  end if;

  v_total := v_subtotal + v_costo_despacho;

  -- Cliente: reutiliza por telefono, luego RUT, luego correo (mismo orden
  -- de confianza que repositories/clienteRepository.ts). El nombre nunca
  -- es suficiente por si solo.
  if v_telefono is not null then
    select id into v_cliente_id from public.clientes where telefono = v_telefono limit 1;
  end if;

  if v_cliente_id is null and v_rut is not null then
    select id into v_cliente_id from public.clientes where rut = v_rut limit 1;
  end if;

  if v_cliente_id is null and v_email is not null then
    select id into v_cliente_id from public.clientes where email = v_email limit 1;
  end if;

  if v_cliente_id is null then
    insert into public.clientes (nombre, rut, email, telefono, region, comuna, direccion, referencia_direccion)
    values (v_nombre, v_rut, v_email, v_telefono, v_region, v_comuna, v_direccion, v_referencia)
    returning id into v_cliente_id;
  else
    update public.clientes
    set
      nombre = v_nombre,
      rut = coalesce(v_rut, rut),
      email = coalesce(v_email, email),
      telefono = coalesce(v_telefono, telefono),
      region = coalesce(v_region, region),
      comuna = coalesce(v_comuna, comuna),
      direccion = coalesce(v_direccion, direccion),
      referencia_direccion = coalesce(v_referencia, referencia_direccion)
    where id = v_cliente_id;
  end if;

  v_codigo := public.next_perfume_order_code();

  insert into public.pedidos (
    codigo, cliente_id, estado_pedido, estado_pago, origen_pedido,
    subtotal, metodo_despacho, costo_despacho, total, observacion
  ) values (
    v_codigo, v_cliente_id, 'NUEVO', 'SIN_PAGO', coalesce(p_origen_pedido, 'PUBLICO'),
    v_subtotal, p_metodo_despacho, v_costo_despacho, v_total, nullif(btrim(coalesce(p_observacion, '')), '')
  )
  returning id into v_pedido_id;

  insert into public.pedido_items (
    pedido_id, producto_id, producto_sku, producto_nombre, producto_marca,
    producto_contenido, producto_descripcion, producto_image_url, producto_tipo,
    cantidad, precio_unitario, costo_unitario, total_costo, utilidad_bruta, subtotal
  )
  select
    v_pedido_id, l.producto_id, l.sku, l.nombre, l.marca, l.contenido, l.descripcion,
    l.image_url, l.tipo_producto, l.cantidad, l.precio_unitario, l.costo_unitario,
    l.costo_unitario * l.cantidad,
    (l.precio_unitario - l.costo_unitario) * l.cantidad,
    l.precio_unitario * l.cantidad
  from jsonb_to_recordset(v_lines_json) as l(
    producto_id uuid, cantidad integer, sku text, nombre text, marca text,
    contenido text, descripcion text, image_url text, tipo_producto text,
    precio_unitario integer, costo_unitario integer
  );

  update public.productos p
  set stock_reservado = p.stock_reservado + l.cantidad
  from jsonb_to_recordset(v_lines_json) as l(
    producto_id uuid, cantidad integer, sku text, nombre text, marca text,
    contenido text, descripcion text, image_url text, tipo_producto text,
    precio_unitario integer, costo_unitario integer
  )
  where p.id = l.producto_id;

  select jsonb_agg(
    jsonb_build_object(
      'productoId', l.producto_id,
      'nombre', l.nombre,
      'cantidad', l.cantidad,
      'precioUnitario', l.precio_unitario,
      'costoUnitario', l.costo_unitario,
      'costoTotal', l.costo_unitario * l.cantidad,
      'utilidadBruta', (l.precio_unitario - l.costo_unitario) * l.cantidad,
      'subtotal', l.precio_unitario * l.cantidad
    )
  ) into v_items_json
  from jsonb_to_recordset(v_lines_json) as l(
    producto_id uuid, cantidad integer, sku text, nombre text, marca text,
    contenido text, descripcion text, image_url text, tipo_producto text,
    precio_unitario integer, costo_unitario integer
  );

  return jsonb_build_object(
    'pedidoId', v_pedido_id,
    'codigo', v_codigo,
    'clienteId', v_cliente_id,
    'subtotal', v_subtotal,
    'costoDespacho', v_costo_despacho,
    'total', v_total,
    'estadoPedido', 'NUEVO',
    'estadoPago', 'SIN_PAGO',
    'metodoDespacho', p_metodo_despacho,
    'origenPedido', coalesce(p_origen_pedido, 'PUBLICO'),
    'items', coalesce(v_items_json, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.create_perfume_order_v1(jsonb, jsonb, text, text, text) from public;
revoke all on function public.create_perfume_order_v1(jsonb, jsonb, text, text, text) from anon;
revoke all on function public.create_perfume_order_v1(jsonb, jsonb, text, text, text) from authenticated;
grant execute on function public.create_perfume_order_v1(jsonb, jsonb, text, text, text) to service_role;
