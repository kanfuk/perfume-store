-- Smellme / Perfume Store
-- Hotfix: integridad de identidad del comprador en pedidos publicos.
--
-- INCIDENTE CONFIRMADO EN PRODUCCION (auditado, sin PII en este archivo):
-- dos pedidos publicos consecutivos de dos personas DISTINTAS que
-- compartian el mismo numero de telefono terminaron con el mismo
-- cliente_id: create_perfume_order_v1 reutilizaba la fila clientes
-- buscando primero por telefono (luego RUT, luego correo) y SOBREESCRIBIA
-- esa fila con los datos del segundo pedido. El primer pedido paso a
-- "verse" como la segunda persona porque pedidos.cliente_id apunta a una
-- fila viva que cambio despues de crear el pedido.
--
-- Esta migracion es puramente ADITIVA:
--   1. Agrega columnas *_snapshot a public.pedidos con la identidad del
--      comprador en el momento exacto en que se creo el pedido. cliente_id
--      NO se toca ni se elimina: sigue siendo la relacion con la ficha
--      maestra (usada por ejemplo para banlist, edicion de ficha, etc).
--      El snapshot es la fuente de verdad para MOSTRAR quien hizo el
--      pedido; cliente_id sigue siendo la fuente de verdad para saber a
--      que ficha de cliente esta asociado hoy.
--   2. Backfill de esas columnas para pedidos YA EXISTENTES desde su
--      cliente_id actual, solo como baseline legacy (dynamic SQL sobre el
--      estado real de la base al aplicar la migracion; no hay ningun dato
--      de cliente real hardcodeado en este archivo).
--   3. Reescribe create_perfume_order_v1 (misma firma, mismos codigos PF,
--      misma seguridad/permisos) para que:
--      a. escriba los snapshots del comprador en la misma transaccion en
--         que crea el pedido;
--      b. deje de reutilizar un cliente publico SOLO porque coincide
--         telefono o SOLO porque coincide correo. El checkout publico
--         exige RUT valido: solo se reutiliza una ficha cliente cuando el
--         RUT coincide Y ADEMAS coincide telefono o correo exactos. Si el
--         RUT coincide pero ni telefono ni correo coinciden, se trata como
--         conflicto de identidad y se crea una ficha cliente nueva (mejor
--         duplicar una ficha que mezclar a dos personas distintas).
--
-- El caso corrupto real (dos compradoras distintas fusionadas en la misma
-- ficha cliente) NO se repara aqui: se repara con un SQL privado,
-- parametrizado, ejecutado a mano y por separado, fuera del historial de
-- migraciones versionado (ver informe de la rama
-- hotfix/customer-order-identity-integrity). Esta migracion no inserta,
-- actualiza ni referencia ningun dato real de clientes.
--
-- No se ejecuta contra Supabase remoto como parte de este cambio; queda
-- preparada para aplicarse cuando se autorice explicitamente.

-- ============================================================
-- 1. Columnas snapshot (aditivas, nullable, tipos compatibles con
--    public.clientes). NULL para pedidos ya existentes hasta el backfill
--    de mas abajo; tambien queda NULL para cualquier pedido creado antes
--    de esta migracion cuyo backfill no se pudo completar (fallback
--    legacy en el codigo de aplicacion: si el snapshot es NULL, se sigue
--    leyendo de la ficha viva).
-- ============================================================

alter table public.pedidos
  add column if not exists cliente_nombre_snapshot text,
  add column if not exists cliente_rut_snapshot text,
  add column if not exists cliente_email_snapshot text,
  add column if not exists cliente_telefono_snapshot text,
  add column if not exists cliente_region_snapshot text,
  add column if not exists cliente_comuna_snapshot text,
  add column if not exists cliente_direccion_snapshot text,
  add column if not exists cliente_referencia_direccion_snapshot text;

comment on column public.pedidos.cliente_nombre_snapshot is
  'Identidad del comprador congelada en el momento de crear el pedido. Fuente de verdad para mostrar el pedido historicamente; cliente_id sigue siendo la relacion con la ficha maestra (puede cambiar de datos despues sin alterar este snapshot).';
comment on column public.pedidos.cliente_rut_snapshot is
  'Ver cliente_nombre_snapshot. NULL en pedidos legacy sin backfill posible; el codigo de aplicacion hace fallback a clientes.rut solo en ese caso.';
comment on column public.pedidos.cliente_email_snapshot is 'Ver cliente_nombre_snapshot.';
comment on column public.pedidos.cliente_telefono_snapshot is 'Ver cliente_nombre_snapshot.';
comment on column public.pedidos.cliente_region_snapshot is 'Ver cliente_nombre_snapshot.';
comment on column public.pedidos.cliente_comuna_snapshot is 'Ver cliente_nombre_snapshot.';
comment on column public.pedidos.cliente_direccion_snapshot is 'Ver cliente_nombre_snapshot.';
comment on column public.pedidos.cliente_referencia_direccion_snapshot is 'Ver cliente_nombre_snapshot.';

-- ============================================================
-- 2. Backfill legacy: SOLO baseline para pedidos que todavia no tienen
--    snapshot (cliente_nombre_snapshot is null), tomando el estado ACTUAL
--    de la ficha cliente asociada. Es una aproximacion aceptada a
--    proposito: para pedidos historicos ya no existe otra fuente de la
--    identidad original si la ficha fue editada despues. El caso corrupto
--    real conocido se repara aparte, NO con este backfill generico (este
--    backfill dejaria al pedido mas antiguo de las dos compradoras con
--    los datos de la mas reciente, que es exactamente el bug que se esta
--    corrigiendo).
-- ============================================================

update public.pedidos p
set
  cliente_nombre_snapshot = c.nombre,
  cliente_rut_snapshot = c.rut,
  cliente_email_snapshot = c.email,
  cliente_telefono_snapshot = c.telefono,
  cliente_region_snapshot = c.region,
  cliente_comuna_snapshot = c.comuna,
  cliente_direccion_snapshot = c.direccion,
  cliente_referencia_direccion_snapshot = c.referencia_direccion
from public.clientes c
where p.cliente_id = c.id
  and p.cliente_nombre_snapshot is null;

-- ============================================================
-- 3. create_perfume_order_v1: misma firma
--    (jsonb, jsonb, text, text, text), mismo comportamiento de stock,
--    mismos codigos de error PF00x, misma respuesta JSON. Unicos cambios:
--    escritura de snapshots + regla de identidad segura al reutilizar
--    cliente.
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
  -- indice (sin tablas temporales, ver 20260726000000).
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
  -- solapado de productos.
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

  -- ==========================================================
  -- REGLA DE IDENTIDAD SEGURA (hotfix identidad, ver cabecera del
  -- archivo). El checkout publico exige RUT valido, asi que:
  --   - NUNCA se reutiliza un cliente solo porque coincide el telefono;
  --   - NUNCA se reutiliza un cliente solo porque coincide el correo;
  --   - solo se reutiliza cuando el RUT coincide Y ADEMAS coincide
  --     telefono o correo exactos (en ese orden de preferencia);
  --   - si el RUT coincide pero ni telefono ni correo coinciden, es un
  --     conflicto de identidad (ver ejemplo real: dos personas distintas
  --     que comparten telefono): se crea una ficha cliente nueva en vez
  --     de mezclar. Duplicar una ficha es preferible a mezclar personas.
  --   - nunca se elige arbitrariamente (sin criterio) entre candidatos
  --     del mismo RUT que no coinciden en telefono ni correo.
  -- ==========================================================

  if v_rut is not null then
    if v_telefono is not null then
      select id into v_cliente_id
      from public.clientes
      where rut = v_rut and telefono = v_telefono
      order by created_at asc
      limit 1;
    end if;

    if v_cliente_id is null and v_email is not null then
      select id into v_cliente_id
      from public.clientes
      where rut = v_rut and email = v_email
      order by created_at asc
      limit 1;
    end if;

    -- Si llega aqui con v_cliente_id todavia null habiendo RUT: existe (o
    -- no) el RUT, pero ni telefono ni correo coincidieron con ningun
    -- candidato de ese RUT. Se cae deliberadamente al bloque de creacion
    -- de mas abajo (nunca se reutiliza "el primero que aparezca").
  end if;

  if v_cliente_id is null then
    insert into public.clientes (nombre, rut, email, telefono, region, comuna, direccion, referencia_direccion)
    values (v_nombre, v_rut, v_email, v_telefono, v_region, v_comuna, v_direccion, v_referencia)
    returning id into v_cliente_id;
  else
    update public.clientes
    set
      nombre = v_nombre,
      email = coalesce(v_email, email),
      telefono = coalesce(v_telefono, telefono),
      region = coalesce(v_region, region),
      comuna = coalesce(v_comuna, comuna),
      direccion = coalesce(v_direccion, direccion),
      referencia_direccion = coalesce(v_referencia, referencia_direccion)
    where id = v_cliente_id;
  end if;

  v_codigo := public.next_perfume_order_code();

  -- Snapshot historico: se escribe con los valores de ESTE pedido
  -- (v_nombre/v_rut/...), nunca con lo que termine quedando en la fila
  -- clientes despues (que puede cambiar en pedidos futuros de otra
  -- persona que reutilice o edite esa misma ficha).
  insert into public.pedidos (
    codigo, cliente_id, estado_pedido, estado_pago, origen_pedido,
    subtotal, metodo_despacho, costo_despacho, total, observacion,
    cliente_nombre_snapshot, cliente_rut_snapshot, cliente_email_snapshot,
    cliente_telefono_snapshot, cliente_region_snapshot, cliente_comuna_snapshot,
    cliente_direccion_snapshot, cliente_referencia_direccion_snapshot
  ) values (
    v_codigo, v_cliente_id, 'NUEVO', 'SIN_PAGO', coalesce(p_origen_pedido, 'PUBLICO'),
    v_subtotal, p_metodo_despacho, v_costo_despacho, v_total, nullif(btrim(coalesce(p_observacion, '')), ''),
    v_nombre, v_rut, v_email, v_telefono, v_region, v_comuna, v_direccion, v_referencia
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
