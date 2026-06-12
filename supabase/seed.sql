-- Datos iniciales opcionales para desarrollo en Supabase

insert into productos (nombre, descripcion, precio_venta, costo_unitario, stock_actual, activo, tipo_producto)
values
  ('Pan amasado', 'Recien horneado, ideal para compartir.', 500, 260, 24, true, 'pan'),
  ('Queque de naranja', 'Suave, casero y con glaseado liviano.', 4500, 2400, 8, true, 'queque'),
  ('Pack de once', 'Seleccion de dulces y panes para reuniones pequenas.', 12000, 7000, 4, true, 'pack')
on conflict do nothing;
