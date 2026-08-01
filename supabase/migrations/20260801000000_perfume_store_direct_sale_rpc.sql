-- Perfume Store
-- Fase 3B.2: venta directa transaccional con idempotencia.
--
-- Motivo: PedidoService.crearVentaDirecta (services/pedidoService.ts) usaba
-- un flujo heredado no transaccional -- upsert de cliente, insert de
-- pedido/items, y descuento de stock como llamadas independientes sin
-- rollback, con ajustarStockAgenda haciendo lectura-luego-escritura sin
-- bloqueo de fila. Dos solicitudes concurrentes (doble clic, reintento de
-- red) podian perder un decremento de stock, y no existia ninguna clave de
-- idempotencia que evitara registrar la misma venta dos veces. Esta
-- migracion agrega una columna de idempotencia y una nueva RPC atomica
-- (create_direct_sale_v1), modelada sobre create_perfume_order_v1 (ver
-- 20260726000000_perfume_store_create_order_no_temp_tables.sql), que hace
-- todo dentro de una sola transaccion con bloqueo determinista de filas.
--
-- No modifica ni reemplaza create_perfume_order_v1, mark_perfume_order_paid_v1,
-- cancel_perfume_order_v1 ni advance_perfume_order_status_v1: son aditivos.
-- No contiene datos reales de clientes, pedidos, productos ni credenciales.

alter table public.pedidos add column if not exists idempotency_key text;

comment on column public.pedidos.idempotency_key is
  'Clave de idempotencia generada por el cliente (UI de venta directa). Si una solicitud repite la misma clave (doble clic, reintento de red), create_direct_sale_v1 devuelve el resultado ya persistido en vez de registrar la venta otra vez.';

create unique index if not exists pedidos_idempotency_key_unique_idx
  on public.pedidos (idempotency_key)
  where idempotency_key is not null;

-- ============================================================
-- RPC: create_direct_sale_v1
--
-- Registra una venta directa (presencial/telefonica) en una sola
-- transaccion: resuelve o crea cliente, valida disponibilidad real de cada
-- producto (activo + stock disponible = stock_actual - stock_reservado,
-- igual criterio de disponibilidad que create_perfume_order_v1), descuenta
-- stock_actual/stock_agenda de una vez (sin reserva: la venta es
-- inmediata, no hay despacho), registra el pedido como ENTREGADO, y crea el
-- pago (venta pagada) o el registro de fiado (venta pendiente) segun
-- corresponda. Nunca confia en precio, subtotal ni total enviados por quien
-- llama: se recalculan aqui desde productos.
--
-- Idempotencia: si p_idempotency_key coincide con un pedido ya registrado,
-- devuelve el mismo resultado sin volver a escribir nada (replay seguro
-- ante reintento de red o doble clic).
--
-- p_cliente: jsonb con nombre, rut, email, telefono, lugar_trabajo
--            (opcionales; "Cliente ocasional" / "Venta directa" si faltan).
-- p_items:   jsonb array de { "producto_id": uuid, "cantidad": integer }.
-- p_forma_pago: 'EFECTIVO' o 'TRANSFERENCIA'.
-- p_es_fiado: true deja la venta ENTREGADO/SIN_PAGO y crea un registro en
--             fiados; false la deja ENTREGADO/PAGADO y crea el pago.
-- ============================================================

create or replace function public.create_direct_sale_v1(
  p_cliente jsonb,
  p_items jsonb,
  p_forma_pago text,
  p_es_fiado boolean default false,
  p_observacion text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_existing_pedido_id uuid;
  v_existing jsonb;
  v_nombre text := nullif(btrim(coalesce(p_cliente->>'nombre', '')), '');
  v_rut text := nullif(btrim(coalesce(p_cliente->>'rut', '')), '');
  v_email text := nullif(btrim(coalesce(p_cliente->>'email', '')), '');
  v_telefono text := nullif(btrim(coalesce(p_cliente->>'telefono', '')), '');
  v_lugar_trabajo text := nullif(btrim(coalesce(p_cliente->>'lugar_trabajo', '')), '');
  v_cliente_id uuid;
  v_producto_ids uuid[];
  v_cantidades integer[];
  v_idx integer;
  v_qty integer;
  v_producto_row record;
  v_pedido_id uuid;
  v_codigo text;
  v_subtotal integer := 0;
  v_total integer := 0;
  v_items_count integer := 0;
  v_matched_count integer := 0;
  v_lines_json jsonb := '[]'::jsonb;
  v_items_json jsonb := '[]'::jsonb;
  v_estado_pago text;
begin
  if v_key is not null then
    select id into v_existing_pedido_id
    from public.pedidos
    where idempotency_key = v_key
    limit 1;

    if v_existing_pedido_id is not null then
      select jsonb_build_object(
        'pedidoId', p.id,
        'codigo', p.codigo,
        'clienteId', p.cliente_id,
        'subtotal', p.subtotal,
        'costoDespacho', p.costo_despacho,
        'total', p.total,
        'estadoPedido', p.estado_pedido,
        'estadoPago', p.estado_pago,
        'metodoDespacho', p.metodo_despacho,
        'origenPedido', p.origen_pedido,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'productoId', pi.producto_id,
            'nombre', pi.producto_nombre,
            'cantidad', pi.cantidad,
            'precioUnitario', pi.precio_unitario,
            'costoUnitario', pi.costo_unitario,
            'costoTotal', pi.total_costo,
            'utilidadBruta', pi.utilidad_bruta,
            'subtotal', pi.subtotal
          ))
          from public.pedido_items pi
          where pi.pedido_id = p.id
        ), '[]'::jsonb)
      )
      into v_existing
      from public.pedidos p
      where p.id = v_existing_pedido_id;

      return v_existing;
    end if;
  end if;

  if p_forma_pago not in ('EFECTIVO', 'TRANSFERENCIA') then
    raise exception 'Forma de pago invalida.' using errcode = 'PF006';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta debe tener al menos un item.' using errcode = 'PF001';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as elem
    where elem->>'producto_id' is null
       or coalesce((elem->>'cantidad')::int, 0) < 1
  ) then
    raise exception 'Cada item debe tener producto y cantidad minima de 1.' using errcode = 'PF004';
  end if;

  -- Agrega lineas duplicadas del mismo producto (mismo patron que
  -- create_perfume_order_v1: dos arrays alineados por indice, sin tablas
  -- temporales).
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
    raise exception 'Uno o mas productos de la venta no existen.' using errcode = 'PF002';
  end if;

  -- Bloqueo determinista en orden de id (misma tecnica anti-deadlock que
  -- create_perfume_order_v1 frente a otra transaccion concurrente sobre un
  -- subconjunto solapado de productos).
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

    -- Disponible = stock_actual - stock_reservado, igual que
    -- create_perfume_order_v1: una venta directa no puede consumir stock ya
    -- comprometido por un pedido publico NUEVO/AGENDADO pendiente.
    if (v_producto_row.stock_actual - v_producto_row.stock_reservado) < v_qty then
      raise exception 'Stock insuficiente para %.', v_producto_row.nombre
        using errcode = 'PF005';
    end if;

    v_subtotal := v_subtotal + (v_producto_row.precio_venta * v_qty);

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

  v_total := v_subtotal;

  -- Cliente: reutiliza por telefono, luego RUT, luego correo (mismo orden
  -- de confianza que create_perfume_order_v1 y repositories/clienteRepository.ts).
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
    insert into public.clientes (nombre, rut, email, telefono, lugar_trabajo)
    values (
      coalesce(v_nombre, 'Cliente ocasional'),
      v_rut, v_email, v_telefono,
      coalesce(v_lugar_trabajo, 'Venta directa')
    )
    returning id into v_cliente_id;
  else
    update public.clientes
    set
      nombre = coalesce(v_nombre, nombre),
      rut = coalesce(v_rut, rut),
      email = coalesce(v_email, email),
      telefono = coalesce(v_telefono, telefono),
      lugar_trabajo = coalesce(v_lugar_trabajo, lugar_trabajo)
    where id = v_cliente_id;
  end if;

  v_estado_pago := case when p_es_fiado then 'SIN_PAGO' else 'PAGADO' end;
  v_codigo := public.next_perfume_order_code();

  -- Venta en persona: se entrega en el acto, sin despacho real (mismo
  -- placeholder METODO_DESPACHO_SIN_ENVIO que usaba el flujo heredado en
  -- services/pedidoService.ts: STARKEN_POR_PAGAR con costo 0).
  insert into public.pedidos (
    codigo, cliente_id, estado_pedido, estado_pago, origen_pedido,
    subtotal, metodo_despacho, costo_despacho, total, observacion,
    fecha_pago, fecha_despacho, fecha_entrega, idempotency_key
  ) values (
    v_codigo, v_cliente_id, 'ENTREGADO', v_estado_pago, 'ADMIN_DIRECTO',
    v_subtotal, 'STARKEN_POR_PAGAR', 0, v_total,
    nullif(btrim(coalesce(p_observacion, '')), ''),
    case when p_es_fiado then null else now() end, now(), now(), v_key
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

  -- Descuento inmediato y definitivo (no hay reserva previa que consumir):
  -- stock_actual y stock_agenda bajan juntos, igual que el resto del
  -- codigo heredado los mantiene sincronizados.
  update public.productos p
  set
    stock_actual = p.stock_actual - l.cantidad,
    stock_agenda = p.stock_agenda - l.cantidad
  from jsonb_to_recordset(v_lines_json) as l(
    producto_id uuid, cantidad integer, sku text, nombre text, marca text,
    contenido text, descripcion text, image_url text, tipo_producto text,
    precio_unitario integer, costo_unitario integer
  )
  where p.id = l.producto_id;

  if p_es_fiado then
    insert into public.fiados (pedido_id, cliente_id, monto_pendiente, estado, fecha_fiado)
    values (v_pedido_id, v_cliente_id, v_total, 'PENDIENTE', now());
  else
    insert into public.pagos (pedido_id, monto, metodo_pago, estado_pago, fecha_pago)
    values (v_pedido_id, v_total, p_forma_pago, 'PAGADO', now());
  end if;

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
    'costoDespacho', 0,
    'total', v_total,
    'estadoPedido', 'ENTREGADO',
    'estadoPago', v_estado_pago,
    'metodoDespacho', 'STARKEN_POR_PAGAR',
    'origenPedido', 'ADMIN_DIRECTO',
    'items', coalesce(v_items_json, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.create_direct_sale_v1(jsonb, jsonb, text, boolean, text, text) from public;
revoke all on function public.create_direct_sale_v1(jsonb, jsonb, text, boolean, text, text) from anon;
revoke all on function public.create_direct_sale_v1(jsonb, jsonb, text, boolean, text, text) from authenticated;
grant execute on function public.create_direct_sale_v1(jsonb, jsonb, text, boolean, text, text) to service_role;
