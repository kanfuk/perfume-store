import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), getForOwner: vi.fn(), saveForOwner: vi.fn() }));

vi.mock("@/lib/admin-users-request", async () => {
  const { NextResponse } = await import("next/server");
  return {
    authorizeAdminUsersRequest: mocks.authorize,
    adminUsersJson: (body: unknown, status = 200) => NextResponse.json(body, { status })
  };
});
vi.mock("@/services/adminPaymentAccountService", () => ({
  AdminPaymentAccountServiceError: class AdminPaymentAccountServiceError extends Error { constructor(public code: string) { super(code); } },
  createAdminPaymentAccountService: () => ({ getForOwner: mocks.getForOwner, saveForOwner: mocks.saveForOwner })
}));

import { GET, PUT } from "@/app/api/admin/users/[userId]/payment-account/route";

const context = { params: Promise.resolve({ userId: "admin-profile" }) };
const validAccount = { banco: "BANCOESTADO", bancoOtro: "", tipoCuenta: "CUENTA_VISTA", tipoCuentaOtro: "", titularCuenta: "Admin", rutTitular: "12.345.678-5", numeroCuenta: "123456", correo: "admin@example.cl", active: true };

function request(method: string, body?: unknown) {
  return new Request("https://preview.smellme.cl/api/admin/users/admin-profile/payment-account", { method, headers: { Origin: "https://preview.smellme.cl", "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}

describe("rutas OWNER de cuentas de cobro", () => {
  beforeEach(() => {
    mocks.authorize.mockReset();
    mocks.getForOwner.mockReset();
    mocks.saveForOwner.mockReset();
    mocks.authorize.mockResolvedValue({ admin: { rol: "OWNER" } });
    mocks.getForOwner.mockResolvedValue(null);
    mocks.saveForOwner.mockResolvedValue({ valid: true, data: {} });
  });

  it("solo continúa cuando la autorización OWNER lo permite", async () => {
    mocks.authorize.mockResolvedValueOnce({ response: new Response(null, { status: 403 }) });
    const response = await GET(request("GET"), context);
    expect(response.status).toBe(403);
    expect(mocks.getForOwner).not.toHaveBeenCalled();
  });

  it("OWNER lee y guarda únicamente la cuenta del perfil solicitado", async () => {
    expect((await GET(request("GET"), context)).status).toBe(200);
    expect((await PUT(request("PUT", validAccount), context)).status).toBe(200);
    expect(mocks.getForOwner).toHaveBeenCalledWith("admin-profile");
    expect(mocks.saveForOwner).toHaveBeenCalledWith("admin-profile", validAccount);
  });

  it("rechaza userId y rol inyectados dentro de los datos bancarios", async () => {
    const response = await PUT(request("PUT", { ...validAccount, admin_user_id: "otro", rol: "OWNER" }), context);
    expect(response.status).toBe(400);
    expect(mocks.saveForOwner).not.toHaveBeenCalled();
  });
});
