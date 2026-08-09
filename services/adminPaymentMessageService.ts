import type { AuthenticatedAdmin } from "@/lib/admin-auth";
import {
  buildAdminPaymentAccountSnapshot,
  isAdminPaymentAccountSnapshot,
  type AdminPaymentAccountSnapshot
} from "@/lib/admin-payment-accounts";
import type { AdminOrderSummary } from "@/lib/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildOrderPaymentRequestMessage } from "@/lib/whatsapp/buildOrderPaymentRequestMessage";
import { getUsableAdminPaymentAccount } from "@/services/adminPaymentAccountService";

export type PaymentMessageAction = "AGENDAR" | "REENVIAR_TRANSFERENCIA";

type OriginalAudit = {
  receiver_admin_user_id: string;
  payment_account_id: string;
  bank_snapshot: unknown;
};

export type AuthorizedPaymentMessageContext = {
  operatorAdminUserId: string;
  receiverAdminUserId: string;
  paymentAccountId: string;
  snapshot: AdminPaymentAccountSnapshot;
  action: PaymentMessageAction;
};

export type AdminPaymentMessageServiceCode =
  | "RECEIVER_REQUIRED"
  | "RECEIVER_NOT_ALLOWED"
  | "ORIGINAL_RECEIVER_MISMATCH"
  | "INVALID_AUDIT"
  | "AUDIT_FAILED";

export class AdminPaymentMessageServiceError extends Error {
  constructor(public readonly code: AdminPaymentMessageServiceCode) {
    super(code);
  }
}

async function getOriginalAudit(pedidoId: string): Promise<OriginalAudit | null> {
  const client = createSupabaseServerClient();
  const { data, error } = await client
    .from("admin_payment_message_audits")
    .select("receiver_admin_user_id, payment_account_id, bank_snapshot")
    .eq("pedido_id", pedidoId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new AdminPaymentMessageServiceError("AUDIT_FAILED");
  return data as OriginalAudit | null;
}

export function createAdminPaymentMessageService() {
  return {
    async authorize(input: {
      pedidoId: string;
      admin: AuthenticatedAdmin;
      receiverAdminUserId?: string;
      action: PaymentMessageAction;
      preserveOriginalSnapshot: boolean;
    }): Promise<AuthorizedPaymentMessageContext> {
      let receiverAdminUserId: string;

      if (input.admin.rol === "OWNER") {
        if (!input.receiverAdminUserId) {
          throw new AdminPaymentMessageServiceError("RECEIVER_REQUIRED");
        }
        receiverAdminUserId = input.receiverAdminUserId;
      } else {
        if (input.receiverAdminUserId) {
          throw new AdminPaymentMessageServiceError("RECEIVER_NOT_ALLOWED");
        }
        receiverAdminUserId = input.admin.profileId;
      }

      const account = await getUsableAdminPaymentAccount(receiverAdminUserId);
      let snapshot = buildAdminPaymentAccountSnapshot(account);

      if (input.preserveOriginalSnapshot) {
        const original = await getOriginalAudit(input.pedidoId);
        if (original) {
          if (
            original.receiver_admin_user_id !== receiverAdminUserId ||
            original.payment_account_id !== account.id
          ) {
            throw new AdminPaymentMessageServiceError("ORIGINAL_RECEIVER_MISMATCH");
          }
          if (!isAdminPaymentAccountSnapshot(original.bank_snapshot)) {
            throw new AdminPaymentMessageServiceError("INVALID_AUDIT");
          }
          snapshot = original.bank_snapshot;
        }
      }

      return {
        operatorAdminUserId: input.admin.profileId,
        receiverAdminUserId,
        paymentAccountId: account.id,
        snapshot,
        action: input.action
      };
    },

    async recordAndBuild(
      pedido: AdminOrderSummary,
      context: AuthorizedPaymentMessageContext
    ): Promise<string> {
      const client = createSupabaseServerClient();
      const { error } = await client.from("admin_payment_message_audits").insert({
        pedido_id: pedido.id,
        operator_admin_user_id: context.operatorAdminUserId,
        receiver_admin_user_id: context.receiverAdminUserId,
        payment_account_id: context.paymentAccountId,
        action: context.action,
        bank_snapshot: context.snapshot
      });
      if (error) throw new AdminPaymentMessageServiceError("AUDIT_FAILED");

      return buildOrderPaymentRequestMessage({
        customerName: pedido.clienteNombre,
        codigo: pedido.codigo,
        items: pedido.items.map((item) => ({
          name: item.productoNombre,
          quantity: item.cantidad
        })),
        subtotal: pedido.total - (pedido.costoDespacho ?? 0),
        costoDespacho: pedido.costoDespacho,
        total: pedido.total,
        bankData: context.snapshot
      });
    }
  };
}
