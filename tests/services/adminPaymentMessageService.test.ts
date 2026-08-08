import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUsableAccount: vi.fn(),
  originalAudit: null as null | Record<string, unknown>,
  inserts: [] as Array<Record<string, unknown>>
}));

vi.mock("@/services/adminPaymentAccountService", async () => {
  const actual = await vi.importActual<typeof import("@/services/adminPaymentAccountService")>(
    "@/services/adminPaymentAccountService"
  );
  return { ...actual, getUsableAdminPaymentAccount: mocks.getUsableAccount };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({ data: mocks.originalAudit, error: null }),
        insert: async (value: Record<string, unknown>) => {
          mocks.inserts.push(value);
          return { error: null };
        }
      };
      return query;
    }
  })
}));

import { createAdminPaymentMessageService } from "@/services/adminPaymentMessageService";
import { AdminPaymentAccountServiceError } from "@/services/adminPaymentAccountService";

function account(adminUserId: string, suffix: string) {
  return {
    id: `account-${suffix}`,
    adminUserId,
    banco: "BANCOESTADO",
    bancoOtro: null,
    tipoCuenta: "CUENTA_VISTA",
    tipoCuentaOtro: null,
    titular: `Admin ${suffix}`,
    rutTitular: "12.345.678-5",
    numeroCuenta: `0000${suffix}`,
    correo: `${suffix}@example.cl`,
    active: true
  };
}

const adminA = { userId: "auth-a", profileId: "admin-a", email: "a@example.cl", nombre: "A", rol: "ADMIN" as const };
const adminB = { userId: "auth-b", profileId: "admin-b", email: "b@example.cl", nombre: "B", rol: "ADMIN" as const };
const owner = { userId: "auth-owner", profileId: "owner", email: "owner@example.cl", nombre: "Owner", rol: "OWNER" as const };

describe("resolución autorizada del mensaje de pago", () => {
  beforeEach(() => {
    mocks.originalAudit = null;
    mocks.inserts.length = 0;
    mocks.getUsableAccount.mockReset();
    mocks.getUsableAccount.mockImplementation(async (profileId: string) =>
      profileId === "admin-a" ? account("admin-a", "1111") : account("admin-b", "2222")
    );
  });

  it("ADMIN A usa A y ADMIN B usa B", async () => {
    const service = createAdminPaymentMessageService();
    const contextA = await service.authorize({ pedidoId: "p-1", admin: adminA, action: "AGENDAR", preserveOriginalSnapshot: false });
    const contextB = await service.authorize({ pedidoId: "p-2", admin: adminB, action: "AGENDAR", preserveOriginalSnapshot: false });
    expect(contextA.snapshot.accountNumber).toBe("00001111");
    expect(contextB.snapshot.accountNumber).toBe("00002222");
    expect(mocks.getUsableAccount).toHaveBeenNthCalledWith(1, "admin-a");
    expect(mocks.getUsableAccount).toHaveBeenNthCalledWith(2, "admin-b");
  });

  it("ADMIN no puede elegir ni obtener la cuenta de otro", async () => {
    await expect(createAdminPaymentMessageService().authorize({
      pedidoId: "p-1",
      admin: adminA,
      receiverAdminUserId: "admin-b",
      action: "AGENDAR",
      preserveOriginalSnapshot: false
    })).rejects.toMatchObject({ code: "RECEIVER_NOT_ALLOWED" });
    expect(mocks.getUsableAccount).not.toHaveBeenCalled();
  });

  it("OWNER no requiere cuenta propia y debe elegir receptor", async () => {
    const service = createAdminPaymentMessageService();
    await expect(service.authorize({ pedidoId: "p-1", admin: owner, action: "AGENDAR", preserveOriginalSnapshot: false })).rejects.toMatchObject({ code: "RECEIVER_REQUIRED" });
    const selected = await service.authorize({ pedidoId: "p-1", admin: owner, receiverAdminUserId: "admin-b", action: "AGENDAR", preserveOriginalSnapshot: false });
    expect(selected.receiverAdminUserId).toBe("admin-b");
    expect(mocks.getUsableAccount).toHaveBeenCalledWith("admin-b");
  });

  it("una cuenta inactiva no es utilizable", async () => {
    mocks.getUsableAccount.mockRejectedValueOnce(
      new AdminPaymentAccountServiceError("ACCOUNT_INACTIVE")
    );
    await expect(createAdminPaymentMessageService().authorize({
      pedidoId: "p-1",
      admin: adminA,
      action: "AGENDAR",
      preserveOriginalSnapshot: false
    })).rejects.toMatchObject({ code: "ACCOUNT_INACTIVE" });
  });

  it("un cambio posterior no altera el snapshot histórico del reenvío", async () => {
    mocks.originalAudit = {
      receiver_admin_user_id: "admin-a",
      payment_account_id: "account-1111",
      bank_snapshot: {
        accountHolder: "Titular histórico",
        rut: "12.345.678-5",
        bank: "Banco histórico",
        accountType: "Cuenta histórica",
        accountNumber: "99990000",
        email: "historico@example.cl"
      }
    };
    const context = await createAdminPaymentMessageService().authorize({ pedidoId: "p-1", admin: adminA, action: "REENVIAR_TRANSFERENCIA", preserveOriginalSnapshot: true });
    expect(context.snapshot.accountNumber).toBe("99990000");
  });

  it("impide a ADMIN A reenviar el snapshot de B", async () => {
    mocks.originalAudit = {
      receiver_admin_user_id: "admin-b",
      payment_account_id: "account-2222",
      bank_snapshot: {
        accountHolder: "B", rut: "12.345.678-5", bank: "Banco", accountType: "Vista", accountNumber: "2222", email: "b@example.cl"
      }
    };
    await expect(createAdminPaymentMessageService().authorize({ pedidoId: "p-1", admin: adminA, action: "REENVIAR_TRANSFERENCIA", preserveOriginalSnapshot: true })).rejects.toMatchObject({ code: "ORIGINAL_RECEIVER_MISMATCH" });
  });

  it("registra operador, receptor, cuenta, fecha DB y snapshot al generar", async () => {
    const service = createAdminPaymentMessageService();
    const context = await service.authorize({ pedidoId: "p-1", admin: adminA, action: "AGENDAR", preserveOriginalSnapshot: false });
    const message = await service.recordAndBuild({
      id: "p-1", codigo: "PS-1", clienteNombre: "Cliente", items: [], total: 10000, costoDespacho: 0
    } as never, context);
    expect(mocks.inserts[0]).toMatchObject({
      pedido_id: "p-1",
      operator_admin_user_id: "admin-a",
      receiver_admin_user_id: "admin-a",
      payment_account_id: "account-1111",
      bank_snapshot: expect.objectContaining({ accountNumber: "00001111" })
    });
    expect(message).toContain("00001111");
  });
});
