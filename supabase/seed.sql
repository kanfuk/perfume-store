-- Datos iniciales opcionales para desarrollo en Supabase

delete from productos
where nombre in (
  'Dobladita sola',
  'Pack de once',
  'Pan amasado',
  'Queque de naranja',
  'Queque vainilla'
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
      'Dobladita Napolitana',
      'Queso, tomate en láminas y orégano',
      1400,
      '/images/dobladita-napolitana.png',
      'Napolitana',
      760,
      0,
      0,
      true,
      'dobladita'
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
      '/images/products/dobladita-ave-mayo.png',
      'AVE MAYO',
      950,
      12,
      12,
      true,
      'dobladita'
    ),
    (
      'Dobladita ave pimenton',
      'Dobladita casera rellena con ave y pimenton. Precio pendiente de confirmacion.',
      1000,
      '/images/products/dobladita-ave-pimenton.jpeg',
      'PRECIO PENDIENTE',
      1600,
      1650,
      760,
      false,
      'dobladita'
    ),
    (
      'Quequito marmoleado',
      'Suave bizcocho humedo y esponjoso con sabor vainilla y chocolate.',
      1000,
      '/images/products/quequito-marmoleado.png',
      'QUEQUITO CASERO',
      450,
      0,
      0,
      true,
      'quequito'
    ),
    (
      'Quequito banana bread',
      'Rico bizcocho esponjoso, humedo, con platano y nueces.',
      1000,
      '/images/products/quequito-banana-bread.png',
      'QUEQUITO CASERO',
      470,
      0,
      0,
      true,
      'quequito'
    ),
    (
      'Quequito choco chip sugar free',
      'Bizcocho de vainilla endulzado con alulosa, con chips de chocolate semi amargo.',
      1000,
      '/images/products/quequito-choco-chip-sugar-free.png',
      'SUGAR FREE',
      520,
      0,
      0,
      true,
      'quequito'
    ),
    (
      'Carrot cake con nueces',
      'Porcion casera de carrot cake con nueces.',
      1000,
      '/images/products/carrot-cake-nueces.png',
      'QUEQUITO CASERO',
      490,
      0,
      0,
      true,
      'quequito'
    ),
    (
      'Queque de platano',
      'Queque entero de platano. Precio pendiente de confirmacion.',
      0,
      '/images/products/queque-platano.png',
      'PRECIO PENDIENTE',
      0,
      0,
      0,
      false,
      'queque'
    ),
    (
      'Queque marmoleado',
      'Queque entero marmoleado. Precio pendiente de confirmacion.',
      0,
      '/images/products/queque-marmoleado.png',
      'PRECIO PENDIENTE',
      0,
      0,
      0,
      false,
      'queque'
    ),
    (
      'Pedido personalizado',
      'Producto especial o a pedido definido por Pauli desde admin.',
      0,
      '/images/products/pedido-personalizado.png',
      'A PEDIDO',
      0,
      0,
      0,
      false,
      'personalizado'
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
      'Dobladita Napolitana',
      'Queso, tomate en láminas y orégano',
      1400,
      '/images/dobladita-napolitana.png',
      'Napolitana',
      0,
      0,
      0,
      true,
      'dobladita'
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
      '/images/products/dobladita-ave-mayo.png',
      'AVE MAYO',
      950,
      12,
      12,
      true,
      'dobladita'
    ),
    (
      'Dobladita ave pimenton',
      'Dobladita casera rellena con ave y pimenton. Precio pendiente de confirmacion.',
      1000,
      '/images/products/dobladita-ave-pimenton.jpeg',
      'PRECIO PENDIENTE',
      1600,
      1650,
      0,
      false,
      'dobladita'
    ),
    (
      'Quequito marmoleado',
      'Suave bizcocho humedo y esponjoso con sabor vainilla y chocolate.',
      1000,
      '/images/products/quequito-marmoleado.png',
      'QUEQUITO CASERO',
      450,
      0,
      0,
      true,
      'quequito'
    ),
    (
      'Quequito banana bread',
      'Rico bizcocho esponjoso, humedo, con platano y nueces.',
      1000,
      '/images/products/quequito-banana-bread.png',
      'QUEQUITO CASERO',
      470,
      0,
      0,
      true,
      'quequito'
    ),
    (
      'Quequito choco chip sugar free',
      'Bizcocho de vainilla endulzado con alulosa, con chips de chocolate semi amargo.',
      1000,
      '/images/products/quequito-choco-chip-sugar-free.png',
      'SUGAR FREE',
      520,
      0,
      0,
      true,
      'quequito'
    ),
    (
      'Carrot cake con nueces',
      'Porcion casera de carrot cake con nueces.',
      1000,
      '/images/products/carrot-cake-nueces.png',
      'QUEQUITO CASERO',
      490,
      0,
      0,
      true,
      'quequito'
    ),
    (
      'Queque de platano',
      'Queque entero de platano. Precio pendiente de confirmacion.',
      0,
      '/images/products/queque-platano.png',
      'PRECIO PENDIENTE',
      0,
      0,
      0,
      false,
      'queque'
    ),
    (
      'Queque marmoleado',
      'Queque entero marmoleado. Precio pendiente de confirmacion.',
      0,
      '/images/products/queque-marmoleado.png',
      'PRECIO PENDIENTE',
      0,
      0,
      0,
      false,
      'queque'
    ),
    (
      'Pedido personalizado',
      'Producto especial o a pedido definido por Pauli desde admin.',
      0,
      '/images/products/pedido-personalizado.png',
      'A PEDIDO',
      0,
      0,
      0,
      false,
      'personalizado'
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
