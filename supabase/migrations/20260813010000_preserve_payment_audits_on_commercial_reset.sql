-- Los mensajes de cobro son historia estructural y sobreviven a una limpieza
-- comercial. Si su pedido se elimina, solo se desprende la FK; el registro
-- sigue siendo inmutable y conserva operador, receptor, cuenta y snapshot.
alter table public.admin_payment_message_audits
  alter column pedido_id drop not null;

alter table public.admin_payment_message_audits
  drop constraint if exists admin_payment_message_audits_pedido_id_fkey;

alter table public.admin_payment_message_audits
  add constraint admin_payment_message_audits_pedido_id_fkey
  foreign key (pedido_id) references public.pedidos(id) on delete set null;

create or replace function public.prevent_admin_payment_message_audit_change_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Única transición permitida: la propia FK desprende un pedido eliminado.
  -- Ningún rol runtime tiene UPDATE sobre esta tabla, por lo que esto no abre
  -- una vía de edición desde la aplicación.
  if tg_op = 'UPDATE'
     and old.pedido_id is not null
     and new.pedido_id is null
     and old.id = new.id
     and old.operator_admin_user_id = new.operator_admin_user_id
     and old.receiver_admin_user_id = new.receiver_admin_user_id
     and old.payment_account_id = new.payment_account_id
     and old.action = new.action
     and old.bank_snapshot = new.bank_snapshot
     and old.created_at = new.created_at then
    return new;
  end if;

  raise exception using errcode = 'P0001', message = 'ADMIN_PAYMENT_AUDIT_IMMUTABLE';
end;
$$;

revoke all on function public.prevent_admin_payment_message_audit_change_v1()
  from public, anon, authenticated;

