-- ============================================================
-- Seed idempotente: Dobladita Napolitana - Pauli Store
-- Agrega o actualiza solo este producto sin alterar stock existente
-- de otros productos.
-- ============================================================

UPDATE productos
SET
  descripcion = 'Queso, tomate en láminas y orégano',
  precio_venta = 1400,
  image_url = '/images/dobladita-napolitana.png',
  badge_label = 'Napolitana',
  activo = true,
  tipo_producto = 'dobladita',
  updated_at = NOW()
WHERE nombre = 'Dobladita Napolitana';

INSERT INTO productos (
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
SELECT
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
WHERE NOT EXISTS (
  SELECT 1
  FROM productos
  WHERE nombre = 'Dobladita Napolitana'
);
