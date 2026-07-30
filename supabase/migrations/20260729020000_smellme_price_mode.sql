-- ============================================================
-- Smellme.cl - Modo de precio (AUTO/MANUAL) por producto
-- Fase 2B.3-16: edicion rapida de precios.
-- No se aplica contra Supabase remoto en esta fase (solo se agrega el
-- archivo de migracion). No inserta datos comerciales reales.
-- ============================================================

alter table public.productos
  add column if not exists modo_precio text not null default 'AUTO';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'productos_modo_precio_check'
  ) then
    alter table public.productos
    add constraint productos_modo_precio_check
    check (modo_precio in ('AUTO', 'MANUAL'));
  end if;
end $$;

comment on column public.productos.modo_precio is
  'AUTO: precio_venta se recalcula desde costo_unitario + el recargo indicado en cada importacion de proveedor o accion "volver a automatico". MANUAL: precio_venta fue fijado a mano por el admin; las importaciones futuras actualizan solo el costo y preservan este precio.';
