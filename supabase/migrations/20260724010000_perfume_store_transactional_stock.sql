-- Perfume Store
-- Fase 1C: stock transaccional (stock_actual / stock_reservado) y RPC de pedidos.
--
-- Requiere haberse aplicado antes:
--   20260724000000_perfume_store_foundation.sql
--
-- No modifica ni reemplaza esa migracion; es aditiva. No crea tablas nuevas
-- ni columnas nuevas: productos.stock_reservado y pedidos.stock_repuesto ya
-- existian (sin logica asociada) desde la Fase 1A. Esta migracion agrega:
--   - una secuencia + funcion para el codigo correlativo de pedido;
--   - 4 funciones RPC transaccionales (create/mark_paid/cancel/advance);
--   - una actualizacion idempotente del valor generico de
--     business_settings.costo_despacho_semanal (sin datos comerciales reales).
--
-- Modelo de stock (ver docs/PERFUME_STORE_TRANSACTIONAL_STOCK.md):
--   stock_actual    = unidades fisicas disponibles en el negocio.
--   stock_reservado = unidades comprometidas por pedidos todavia no pagados.
--   disponible para nueva reserva = stock_actual - stock_reservado.
--
-- Todas las funciones operativas son SECURITY DEFINER, con search_path fijo,
-- y solo ejecutables por service_role (revocadas de public/anon/authenticated).
-- La aplicacion nunca las llama desde el navegador: siempre a traves de una
-- ruta de servidor Next.js que usa el cliente Supabase con clave privilegiada.
--
-- No contiene datos reales de clientes, pedidos, productos ni credenciales.

-- ============================================================
-- Codigo correlativo de pedido (PERF-YYYY-000001)
-- Seguro frente a concurrencia: nextval() sobre una secuencia es atomico en
-- Postgres. No se usa COUNT(*) + 1. El contador es global (no se reinicia
-- por anio); el anio en el codigo es solo una etiqueta legible.
-- ============================================================

create sequence if not exists public.perfume_order_code_seq;

create or replace function public.next_perfume_order_code()
returns text
language sql
volatile
set search_path = public
as $$
  select 'PERF-' || to_char(now(), 'YYYY') || '-' ||
    lpad(nextval('public.perfume_order_code_seq')::text, 6, '0');
$$;

revoke all on function public.next_perfume_order_code() from public;
revoke all on function public.next_perfume_order_code() from anon;
revoke all on function public.next_perfume_order_code() from authenticated;
grant execute on function public.next_perfume_order_code() to service_role;

revoke all on sequence public.perfume_order_code_seq from public;
revoke all on sequence public.perfume_order_code_seq from anon;
revoke all on sequence public.perfume_order_code_seq from authenticated;
grant usage on sequence public.perfume_order_code_seq to service_role;

-- ============================================================
-- Configuracion generica inicial de business_settings.
-- Solo si el valor sigue en su default de fundacion (0): no pisa un valor
-- ya configurado manualmente. Sin datos bancarios ni de contacto reales.
-- ============================================================

update public.business_settings
set
  costo_despacho_semanal = 4000,
  texto_despacho_semanal = coalesce(
    nullif(texto_despacho_semanal, ''),
    'Despacho semanal a domicilio. El dia se coordina por WhatsApp.'
  )
where id = '00000000-0000-0000-0000-000000000001'::uuid
  and costo_despacho_semanal = 0;

-- ============================================================
-- RPC 1: create_perfume_order_v1
--
-- Crea cliente (o reutiliza uno existente), pedido e items dentro de una
-- sola transaccion, y reserva stock (incrementa stock_reservado). No toca
-- stock_actual. Nunca confia en precio, subtotal, costo de despacho, total,
-- estado de pedido ni estado de pago enviados por quien llama: todo se
-- calcula aqui a partir de datos de la base.
--
-- p_cliente: jsonb con nombre, rut, email, telefono, region, comuna,
--            direccion, referencia_direccion (ya normalizados en TypeScript).
-- p_items:   jsonb array de { "producto_id": uuid, "cantidad": integer }.
-- ============================================================

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
  v_producto_row record;
  v_pedido_id uuid;
  v_codigo text;
  v_subtotal integer := 0;
  v_costo_despacho integer := 0;
  v_total integer := 0;
  v_items_count integer := 0;
  v_matched_count integer := 0;
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

  -- Agrega lineas duplicadas del mismo producto.
  -- "if not exists" + limpieza explicita (en vez de solo "on commit drop"):
  -- ON COMMIT DROP libera la tabla recien al terminar la transaccion de
  -- quien llama, no al terminar esta funcion. Si esta RPC se invoca mas de
  -- una vez dentro de la misma transaccion (por ejemplo, un pooler en modo
  -- sesion, o varias llamadas explicitas agrupadas), la segunda llamada
  -- encontraria la tabla temporal ya creada por la primera y fallaria con
  -- "relation already exists". Reutilizar la tabla y vaciarla al inicio es
  -- seguro porque es "temporary" (aislada por sesion) y de un solo uso por
  -- llamada.
  create temporary table if not exists tmp_perfume_order_qty (
    producto_id uuid primary key,
    cantidad integer not null
  ) on commit drop;
  truncate table tmp_perfume_order_qty;

  insert into tmp_perfume_order_qty (producto_id, cantidad)
  select (elem->>'producto_id')::uuid, sum((elem->>'cantidad')::int)
  from jsonb_array_elements(p_items) as elem
  group by (elem->>'producto_id')::uuid;

  select count(*) into v_items_count from tmp_perfume_order_qty;

  select count(*) into v_matched_count
  from public.productos p
  join tmp_perfume_order_qty q on q.producto_id = p.id;

  if v_matched_count <> v_items_count then
    raise exception 'Uno o mas productos del pedido no existen.' using errcode = 'PF002';
  end if;

  create temporary table if not exists tmp_perfume_order_lines (
    producto_id uuid,
    cantidad integer,
    sku text,
    nombre text,
    marca text,
    contenido text,
    descripcion text,
    image_url text,
    tipo_producto text,
    precio_unitario integer,
    costo_unitario integer
  ) on commit drop;
  truncate table tmp_perfume_order_lines;

  -- Bloqueo determinista en orden de id para reducir riesgo de deadlock
  -- frente a otra transaccion concurrente que reserve un subconjunto
  -- solapado de productos.
  for v_producto_row in
    select p.*, q.cantidad as qty
    from public.productos p
    join tmp_perfume_order_qty q on q.producto_id = p.id
    order by p.id
    for update
  loop
    if v_producto_row.activo is not true then
      raise exception 'El producto % no esta disponible.', v_producto_row.nombre
        using errcode = 'PF003';
    end if;

    if (v_producto_row.stock_actual - v_producto_row.stock_reservado) < v_producto_row.qty then
      raise exception 'Stock insuficiente para %.', v_producto_row.nombre
        using errcode = 'PF005';
    end if;

    insert into tmp_perfume_order_lines (
      producto_id, cantidad, sku, nombre, marca, contenido, descripcion,
      image_url, tipo_producto, precio_unitario, costo_unitario
    ) values (
      v_producto_row.id, v_producto_row.qty, v_producto_row.sku, v_producto_row.nombre,
      v_producto_row.marca, v_producto_row.contenido, v_producto_row.descripcion,
      v_producto_row.image_url, v_producto_row.tipo_producto, v_producto_row.precio_venta,
      v_producto_row.costo_unitario
    );

    v_subtotal := v_subtotal + (v_producto_row.precio_venta * v_producto_row.qty);
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
  from tmp_perfume_order_lines l;

  update public.productos p
  set stock_reservado = p.stock_reservado + l.cantidad
  from tmp_perfume_order_lines l
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
  from tmp_perfume_order_lines l;

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

-- ============================================================
-- RPC 2: mark_perfume_order_paid_v1
--
-- Convierte la reserva en salida fisica: reduce stock_actual y
-- stock_reservado en la misma cantidad por cada linea. Solo aplica sobre
-- pedidos NUEVO o AGENDADO con estado_pago SIN_PAGO. Falla claramente
-- (no es idempotente) si ya estaba pagado.
-- ============================================================

create or replace function public.mark_perfume_order_paid_v1(
  p_pedido_id uuid,
  p_metodo_pago text default 'TRANSFERENCIA'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido record;
  v_item record;
  v_stock_reservado integer;
begin
  select * into v_pedido from public.pedidos where id = p_pedido_id for update;

  if not found then
    raise exception 'Pedido no encontrado.' using errcode = 'PF009';
  end if;

  if v_pedido.estado_pedido not in ('NUEVO', 'AGENDADO') then
    raise exception 'Este pedido no admite marcar pagado en su estado actual.' using errcode = 'PF012';
  end if;

  if v_pedido.estado_pago <> 'SIN_PAGO' then
    raise exception 'Este pedido ya fue pagado.' using errcode = 'PF010';
  end if;

  for v_item in
    select pi.producto_id, pi.cantidad
    from public.pedido_items pi
    where pi.pedido_id = p_pedido_id
      and pi.producto_id is not null
    order by pi.producto_id
  loop
    select stock_reservado into v_stock_reservado
    from public.productos
    where id = v_item.producto_id
    for update;

    if not found then
      raise exception 'Uno de los productos del pedido ya no existe.' using errcode = 'PF002';
    end if;

    if v_stock_reservado < v_item.cantidad then
      raise exception 'La reserva de stock de este pedido ya no es valida.' using errcode = 'PF015';
    end if;

    update public.productos
    set
      stock_actual = stock_actual - v_item.cantidad,
      stock_reservado = stock_reservado - v_item.cantidad
    where id = v_item.producto_id;
  end loop;

  update public.pedidos
  set estado_pedido = 'PAGADO', estado_pago = 'PAGADO', fecha_pago = now()
  where id = p_pedido_id;

  insert into public.pagos (pedido_id, monto, metodo_pago, estado_pago, fecha_pago)
  values (p_pedido_id, v_pedido.total, coalesce(p_metodo_pago, 'TRANSFERENCIA'), 'PAGADO', now());

  return jsonb_build_object(
    'pedidoId', p_pedido_id,
    'estadoPedido', 'PAGADO',
    'estadoPago', 'PAGADO'
  );
end;
$$;

revoke all on function public.mark_perfume_order_paid_v1(uuid, text) from public;
revoke all on function public.mark_perfume_order_paid_v1(uuid, text) from anon;
revoke all on function public.mark_perfume_order_paid_v1(uuid, text) from authenticated;
grant execute on function public.mark_perfume_order_paid_v1(uuid, text) to service_role;

-- ============================================================
-- RPC 3: cancel_perfume_order_v1
--
-- SIN_PAGO: libera stock_reservado (stock_actual no cambia).
-- PAGADO: exige confirmar_reposicion_pagado = true; repone stock_actual.
-- stock_repuesto impide liberar o reponer dos veces. ENTREGADO y CANCELADO
-- se rechazan (una devolucion sobre un pedido entregado es otro modulo).
-- ============================================================

create or replace function public.cancel_perfume_order_v1(
  p_pedido_id uuid,
  p_motivo text,
  p_confirmar_reposicion_pagado boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido record;
  v_item record;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_estado_pago_final text;
begin
  if v_motivo = '' then
    raise exception 'Debes indicar un motivo de cancelacion.' using errcode = 'PF004';
  end if;

  select * into v_pedido from public.pedidos where id = p_pedido_id for update;

  if not found then
    raise exception 'Pedido no encontrado.' using errcode = 'PF009';
  end if;

  if v_pedido.estado_pedido = 'CANCELADO' then
    raise exception 'Este pedido ya fue cancelado.' using errcode = 'PF011';
  end if;

  if v_pedido.estado_pedido = 'ENTREGADO' then
    raise exception 'Un pedido entregado no se puede cancelar por este flujo.' using errcode = 'PF012';
  end if;

  if v_pedido.estado_pago = 'PAGADO' then
    if not p_confirmar_reposicion_pagado then
      raise exception 'Este pedido ya fue pagado. Confirma explicitamente para cancelarlo.'
        using errcode = 'PF013';
    end if;

    if not v_pedido.stock_repuesto then
      for v_item in
        select pi.producto_id, pi.cantidad
        from public.pedido_items pi
        where pi.pedido_id = p_pedido_id
          and pi.producto_id is not null
        order by pi.producto_id
      loop
        update public.productos
        set stock_actual = stock_actual + v_item.cantidad
        where id = v_item.producto_id;
      end loop;
    end if;

    v_estado_pago_final := v_pedido.estado_pago;
  else
    if not v_pedido.stock_repuesto then
      for v_item in
        select pi.producto_id, pi.cantidad
        from public.pedido_items pi
        where pi.pedido_id = p_pedido_id
          and pi.producto_id is not null
        order by pi.producto_id
      loop
        update public.productos
        set stock_reservado = greatest(0, stock_reservado - v_item.cantidad)
        where id = v_item.producto_id;
      end loop;
    end if;

    v_estado_pago_final := 'CANCELADO';
  end if;

  update public.pedidos
  set
    estado_pedido = 'CANCELADO',
    estado_pago = v_estado_pago_final,
    fecha_cancelacion = now(),
    motivo_cancelacion = v_motivo,
    stock_repuesto = true
  where id = p_pedido_id;

  return jsonb_build_object(
    'pedidoId', p_pedido_id,
    'estadoPedido', 'CANCELADO',
    'estadoPago', v_estado_pago_final
  );
end;
$$;

revoke all on function public.cancel_perfume_order_v1(uuid, text, boolean) from public;
revoke all on function public.cancel_perfume_order_v1(uuid, text, boolean) from anon;
revoke all on function public.cancel_perfume_order_v1(uuid, text, boolean) from authenticated;
grant execute on function public.cancel_perfume_order_v1(uuid, text, boolean) to service_role;

-- ============================================================
-- RPC 4: advance_perfume_order_status_v1
--
-- Solo PAGADO->PREPARANDO->DESPACHADO->ENTREGADO. No toca stock.
-- ============================================================

create or replace function public.advance_perfume_order_status_v1(
  p_pedido_id uuid,
  p_nuevo_estado text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido record;
begin
  if p_nuevo_estado not in ('PREPARANDO', 'DESPACHADO', 'ENTREGADO') then
    raise exception 'Esta funcion no admite esa transicion.' using errcode = 'PF012';
  end if;

  select * into v_pedido from public.pedidos where id = p_pedido_id for update;

  if not found then
    raise exception 'Pedido no encontrado.' using errcode = 'PF009';
  end if;

  if not (
    (v_pedido.estado_pedido = 'PAGADO' and p_nuevo_estado = 'PREPARANDO') or
    (v_pedido.estado_pedido = 'PREPARANDO' and p_nuevo_estado = 'DESPACHADO') or
    (v_pedido.estado_pedido = 'DESPACHADO' and p_nuevo_estado = 'ENTREGADO')
  ) then
    raise exception 'Transicion invalida desde % hacia %.', v_pedido.estado_pedido, p_nuevo_estado
      using errcode = 'PF012';
  end if;

  if p_nuevo_estado = 'PREPARANDO' then
    update public.pedidos set estado_pedido = 'PREPARANDO', fecha_preparacion = now()
    where id = p_pedido_id;
  elsif p_nuevo_estado = 'DESPACHADO' then
    update public.pedidos set estado_pedido = 'DESPACHADO', fecha_despacho = now()
    where id = p_pedido_id;
  else
    update public.pedidos set estado_pedido = 'ENTREGADO', fecha_entrega = now()
    where id = p_pedido_id;
  end if;

  return jsonb_build_object('pedidoId', p_pedido_id, 'estadoPedido', p_nuevo_estado);
end;
$$;

revoke all on function public.advance_perfume_order_status_v1(uuid, text) from public;
revoke all on function public.advance_perfume_order_status_v1(uuid, text) from anon;
revoke all on function public.advance_perfume_order_status_v1(uuid, text) from authenticated;
grant execute on function public.advance_perfume_order_status_v1(uuid, text) to service_role;
