-- Pauli Store
-- Migracion idempotente para alinear venta directa, pedido personalizado
-- y catalogo oficial vigente.

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_name = 'pedidos' and column_name = 'origen_pedido'
  ) then
    alter table pedidos add column origen_pedido text default 'PUBLICO';
  end if;
end $$;

update pedidos
set origen_pedido = 'PUBLICO'
where origen_pedido is null;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_name = 'pedido_items' and column_name = 'producto_nombre'
  ) then
    alter table pedido_items add column producto_nombre text;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_name = 'pedido_items' and column_name = 'producto_descripcion'
  ) then
    alter table pedido_items add column producto_descripcion text;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_name = 'pedido_items' and column_name = 'producto_image_url'
  ) then
    alter table pedido_items add column producto_image_url text;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_name = 'pedido_items' and column_name = 'producto_tipo'
  ) then
    alter table pedido_items add column producto_tipo text;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'pedido_items'
      and column_name = 'producto_id'
      and is_nullable = 'NO'
  ) then
    alter table pedido_items alter column producto_id drop not null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pedidos_origen_pedido_check'
  ) then
    alter table pedidos
    add constraint pedidos_origen_pedido_check
    check (origen_pedido in ('PUBLICO', 'ADMIN_DIRECTO', 'PERSONALIZADO'));
  end if;
end $$;

update pedido_items pi
set
  producto_nombre = coalesce(pi.producto_nombre, p.nombre),
  producto_descripcion = coalesce(pi.producto_descripcion, p.descripcion),
  producto_image_url = coalesce(pi.producto_image_url, p.image_url),
  producto_tipo = coalesce(pi.producto_tipo, p.tipo_producto)
from productos p
where pi.producto_id = p.id;

delete from productos
where nombre in (
  'Dobladita sola',
  'Pack de once',
  'Pan amasado',
  'Queque de naranja',
  'Queque vainilla',
  'Quequito marmoleado',
  'Quequito banana bread',
  'Quequito choco chip sugar free',
  'Quequito carrot cake nueces'
);

update productos
set
  descripcion = seed.descripcion,
  precio_venta = seed.precio_venta,
  image_url = seed.image_url,
  badge_label = seed.badge_label,
  costo_unitario = seed.costo_unitario,
  stock_actual = seed.stock_actual,
  stock_agenda = seed.stock_agenda,
  activo = seed.activo,
  tipo_producto = seed.tipo_producto
from (
  values
    (
      'Dobladita solo queso',
      'Dobladita casera recien horneada, rellena solo con queso.',
      1000,
      '/images/products/dobladita-solo-queso.jpeg',
      'DOBLADITA QUESO',
      580,
      18,
      18,
      true,
      'dobladita'
    ),
    (
      'Dobladita jamon de pavo acaramelado/queso',
      'Dobladita casera con jamon de pavo acaramelado y queso.',
      1300,
      '/images/products/dobladita-jamon-pavo-queso.jpeg',
      'JAMON PAVO / QUESO',
      760,
      14,
      14,
      true,
      'dobladita premium'
    ),
    (
      'Dobladita huevo',
      'Dobladita casera rellena con huevo, ideal para desayuno.',
      1500,
      '/images/products/dobladita-huevo.jpeg',
      'DOBLADITA HUEVO',
      840,
      10,
      10,
      true,
      'desayuno'
    ),
    (
      'Dobladita ave mayo',
      'Dobladita casera con ave mayo cremosa, perfecta para media manana.',
      1500,
      '/images/products/dobladita-reserva-ave-mayo.png',
      'AVE MAYO',
      880,
      12,
      12,
      true,
      'dobladita'
    )
) as seed (
  nombre,
  descripcion,
  precio_venta,
  image_url,
  badge_label,
  costo_unitario,
  stock_actual,
  stock_agenda,
  activo,
  tipo_producto
)
where productos.nombre = seed.nombre;

insert into productos (
  nombre,
  descripcion,
  precio_venta,
  image_url,
  badge_label,
  costo_unitario,
  stock_actual,
  stock_agenda,
  activo,
  tipo_producto
)
select
  seed.nombre,
  seed.descripcion,
  seed.precio_venta,
  seed.image_url,
  seed.badge_label,
  seed.costo_unitario,
  seed.stock_actual,
  seed.stock_agenda,
  seed.activo,
  seed.tipo_producto
from (
  values
    (
      'Dobladita solo queso',
      'Dobladita casera recien horneada, rellena solo con queso.',
      1000,
      '/images/products/dobladita-solo-queso.jpeg',
      'DOBLADITA QUESO',
      580,
      18,
      18,
      true,
      'dobladita'
    ),
    (
      'Dobladita jamon de pavo acaramelado/queso',
      'Dobladita casera con jamon de pavo acaramelado y queso.',
      1300,
      '/images/products/dobladita-jamon-pavo-queso.jpeg',
      'JAMON PAVO / QUESO',
      760,
      14,
      14,
      true,
      'dobladita premium'
    ),
    (
      'Dobladita huevo',
      'Dobladita casera rellena con huevo, ideal para desayuno.',
      1500,
      '/images/products/dobladita-huevo.jpeg',
      'DOBLADITA HUEVO',
      840,
      10,
      10,
      true,
      'desayuno'
    ),
    (
      'Dobladita ave mayo',
      'Dobladita casera con ave mayo cremosa, perfecta para media manana.',
      1500,
      '/images/products/dobladita-reserva-ave-mayo.png',
      'AVE MAYO',
      880,
      12,
      12,
      true,
      'dobladita'
    )
) as seed (
  nombre,
  descripcion,
  precio_venta,
  image_url,
  badge_label,
  costo_unitario,
  stock_actual,
  stock_agenda,
  activo,
  tipo_producto
)
where not exists (
  select 1
  from productos
  where productos.nombre = seed.nombre
);
