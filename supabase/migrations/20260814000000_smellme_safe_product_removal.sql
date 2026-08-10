-- Eliminacion segura de productos (V2.2.1). Ver docs/SMELLME_SAFE_PRODUCT_REMOVAL_DESIGN.md.
-- archived_at distingue ARCHIVADO (retirado del catalogo, con historia) de
-- simplemente PAUSADO (activo=false manual, sin historia que preservar).

alter table public.productos
  add column if not exists archived_at timestamptz,
  add column if not exists archived_reason text;

create index if not exists productos_archived_at_idx
  on public.productos (archived_at) where archived_at is not null;

-- Revalida y ejecuta el archivado de un solo producto dentro de una
-- transaccion con bloqueo de fila, para cerrar la ventana de concurrencia
-- entre la vista previa de elegibilidad (calculada en TypeScript) y la
-- confirmacion del admin. No toca imagen ni Storage: se preserva a
-- proposito para productos con historia (ver diseno, seccion Imagenes).
create or replace function public.archive_product_v1(p_product_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_product public.productos%rowtype; v_has_active boolean;
begin
  select * into v_product from public.productos where id = p_product_id for update;
  if not found then
    raise exception 'Producto no encontrado.' using errcode = 'RM001';
  end if;

  if v_product.archived_at is not null then
    return jsonb_build_object('alreadyArchived', true, 'productId', v_product.id, 'archivedAt', v_product.archived_at);
  end if;

  select
    v_product.stock_reservado > 0 or exists (
      select 1 from public.pedido_items pi join public.pedidos p on p.id = pi.pedido_id
      where pi.producto_id = v_product.id
        and p.estado_pedido in ('NUEVO', 'AGENDADO', 'PAGADO', 'PREPARANDO', 'DESPACHADO')
    )
  into v_has_active;

  if v_has_active then
    raise exception 'PRODUCT_HAS_ACTIVE_ORDERS' using errcode = 'RM002';
  end if;

  update public.productos set
    activo = false,
    archived_at = now(),
    archived_reason = p_reason,
    es_top = false,
    es_oferta_semana = false,
    orden_destacado = null,
    stock_actual = 0,
    stock_agenda = 0,
    updated_at = now()
  where id = v_product.id;

  return jsonb_build_object('alreadyArchived', false, 'productId', v_product.id, 'archivedAt', now());
end;
$$;

-- Revalida y ejecuta el borrado fisico de un solo producto. Solo puede
-- tener exito si, en el instante exacto de la escritura, el producto no
-- tiene NINGUN pedido_items asociado (en cualquier estado) ni stock
-- reservado. product_image_assistant_attempts se limpia por su propio
-- ON DELETE CASCADE (20260804000000_safe_image_assistant_history.sql).
create or replace function public.hard_delete_product_v1(p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_product public.productos%rowtype; v_has_history boolean;
begin
  select * into v_product from public.productos where id = p_product_id for update;
  if not found then
    raise exception 'Producto no encontrado.' using errcode = 'RM001';
  end if;

  select exists (select 1 from public.pedido_items pi where pi.producto_id = v_product.id) into v_has_history;
  if v_has_history then
    raise exception 'PRODUCT_HAS_HISTORY' using errcode = 'RM003';
  end if;

  if v_product.stock_reservado > 0 then
    raise exception 'PRODUCT_HAS_ACTIVE_ORDERS' using errcode = 'RM002';
  end if;

  delete from public.productos where id = v_product.id;

  return jsonb_build_object('productId', v_product.id, 'imageStoragePath', v_product.image_storage_path);
end;
$$;

revoke all on function public.archive_product_v1(uuid, text) from public, anon, authenticated;
revoke all on function public.hard_delete_product_v1(uuid) from public, anon, authenticated;
grant execute on function public.archive_product_v1(uuid, text) to service_role;
grant execute on function public.hard_delete_product_v1(uuid) to service_role;
