-- Datos iniciales opcionales para desarrollo en Supabase

update productos
set activo = false
where nombre in ('Pan amasado', 'Queque de naranja', 'Pack de once');

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
    ),
    (
      'Quequito marmoleado',
      'Suave bizcocho humedo y esponjoso con sabor vainilla y chocolate.',
      1000,
      '/images/products/queque-casero-marmoleado.png',
      'QUEQUITO CASERO',
      450,
      8,
      8,
      true,
      'quequito'
    ),
    (
      'Quequito banana bread',
      'Rico bizcocho esponjoso, humedo, con platano y nueces.',
      1000,
      '/images/products/queque-casero-banana.png',
      'QUEQUITO CASERO',
      470,
      8,
      8,
      true,
      'quequito'
    ),
    (
      'Quequito choco chip sugar free',
      'Bizcocho de vainilla endulzado con alulosa, con chips de chocolate semi amargo.',
      1000,
      '/images/products/queque-casero-chocochips-sf.png',
      'SUGAR FREE',
      520,
      8,
      8,
      true,
      'quequito'
    ),
    (
      'Quequito carrot cake nueces',
      'Bizcocho casero de zanahoria con nueces, suave y especiado.',
      1000,
      '/images/products/carrot-cake-nueces.png',
      'QUEQUITO CASERO',
      490,
      8,
      8,
      true,
      'quequito'
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
    ),
    (
      'Quequito marmoleado',
      'Suave bizcocho humedo y esponjoso con sabor vainilla y chocolate.',
      1000,
      '/images/products/queque-casero-marmoleado.png',
      'QUEQUITO CASERO',
      450,
      8,
      8,
      true,
      'quequito'
    ),
    (
      'Quequito banana bread',
      'Rico bizcocho esponjoso, humedo, con platano y nueces.',
      1000,
      '/images/products/queque-casero-banana.png',
      'QUEQUITO CASERO',
      470,
      8,
      8,
      true,
      'quequito'
    ),
    (
      'Quequito choco chip sugar free',
      'Bizcocho de vainilla endulzado con alulosa, con chips de chocolate semi amargo.',
      1000,
      '/images/products/queque-casero-chocochips-sf.png',
      'SUGAR FREE',
      520,
      8,
      8,
      true,
      'quequito'
    ),
    (
      'Quequito carrot cake nueces',
      'Bizcocho casero de zanahoria con nueces, suave y especiado.',
      1000,
      '/images/products/carrot-cake-nueces.png',
      'QUEQUITO CASERO',
      490,
      8,
      8,
      true,
      'quequito'
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
