update productos
set activo = false
where nombre in ('Pan amasado', 'Queque de naranja', 'Pack de once');

insert into productos (
  nombre,
  descripcion,
  precio_venta,
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
      840,
      10,
      10,
      true,
      'desayuno'
    )
) as seed (
  nombre,
  descripcion,
  precio_venta,
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
