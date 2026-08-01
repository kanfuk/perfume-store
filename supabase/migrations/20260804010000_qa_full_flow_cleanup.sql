-- Limpieza transaccional y estrictamente acotada para el escenario
-- ZZTEST-QA-FULL-FLOW. Requiere IDs exactos y valida los prefijos antes de
-- borrar; nunca opera por fecha ni por un filtro general.
create or replace function public.cleanup_qa_full_flow_v1(
  p_product_id uuid,
  p_order_ids uuid[],
  p_customer_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orders integer := 0;
  v_customers integer := 0;
  v_products integer := 0;
begin
  if not exists (
    select 1 from public.productos
    where id = p_product_id and sku = 'ZZTEST-QA-FULL-FLOW'
  ) then
    raise exception 'QA001: producto de QA no válido';
  end if;

  if exists (
    select 1
    from public.pedidos p
    where p.id = any(coalesce(p_order_ids, array[]::uuid[]))
      and coalesce(p.observacion, '') not like 'ZZTEST-QA-FULL-FLOW%'
      and not exists (
        select 1 from public.pedido_items pi
        where pi.pedido_id = p.id and pi.producto_id = p_product_id
      )
  ) then
    raise exception 'QA002: la lista contiene un pedido ajeno al escenario';
  end if;

  if exists (
    select 1 from public.clientes c
    where c.id = any(coalesce(p_customer_ids, array[]::uuid[]))
      and c.nombre not like 'QA Smellme Full Flow%'
  ) then
    raise exception 'QA003: la lista contiene un cliente ajeno al escenario';
  end if;

  delete from public.fiados where pedido_id = any(coalesce(p_order_ids, array[]::uuid[]));
  delete from public.pagos where pedido_id = any(coalesce(p_order_ids, array[]::uuid[]));
  delete from public.pedido_items where pedido_id = any(coalesce(p_order_ids, array[]::uuid[]));
  delete from public.pedidos where id = any(coalesce(p_order_ids, array[]::uuid[]));
  get diagnostics v_orders = row_count;

  delete from public.clientes c
  where c.id = any(coalesce(p_customer_ids, array[]::uuid[]))
    and c.nombre like 'QA Smellme Full Flow%'
    and not exists (select 1 from public.pedidos p where p.cliente_id = c.id);
  get diagnostics v_customers = row_count;

  delete from public.productos p
  where p.id = p_product_id
    and p.sku = 'ZZTEST-QA-FULL-FLOW'
    and not exists (select 1 from public.pedido_items pi where pi.producto_id = p.id);
  get diagnostics v_products = row_count;

  return jsonb_build_object(
    'ordersDeleted', v_orders,
    'customersDeleted', v_customers,
    'productsDeleted', v_products
  );
end;
$$;

revoke all on function public.cleanup_qa_full_flow_v1(uuid, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.cleanup_qa_full_flow_v1(uuid, uuid[], uuid[]) to service_role;
