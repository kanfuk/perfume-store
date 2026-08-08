import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  list: vi.fn(),
  invite: vi.fn(),
  resend: vi.fn(),
  setActive: vi.fn(),
  setRole: vi.fn()
}));

vi.mock("@/lib/admin-users-request", async () => {
  const { NextResponse } = await import("next/server");
  return {
    authorizeAdminUsersRequest: mocks.authorize,
    adminUsersJson: (body: unknown, status = 200) => NextResponse.json(body, { status }),
    adminUserErrorResponse: () => NextResponse.json({ error: "Operación rechazada." }, { status: 409 })
  };
});
vi.mock("@/services/adminUserService", () => ({
  createAdminUserService: () => ({
    list: mocks.list,
    invite: mocks.invite,
    resend: mocks.resend,
    setActive: mocks.setActive,
    setRole: mocks.setRole
  })
}));

import { GET, POST } from "@/app/api/admin/users/route";
import { PATCH } from "@/app/api/admin/users/[userId]/route";

function request(method: string, body?: unknown) {
  return new Request("https://preview.smellme.cl/api/admin/users", {
    method,
    headers: { Origin: "https://preview.smellme.cl", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

describe("rutas OWNER de usuarios", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.authorize.mockResolvedValue({ admin: { userId: "owner-auth-id", rol: "OWNER" } });
    mocks.list.mockResolvedValue([]);
    mocks.invite.mockResolvedValue(undefined);
    mocks.resend.mockResolvedValue(undefined);
    mocks.setActive.mockResolvedValue(undefined);
    mocks.setRole.mockResolvedValue(undefined);
  });

  it("lista usuarios para OWNER", async () => {
    const response = await GET(request("GET"));
    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledOnce();
  });

  it("invita sin aceptar contraseña ni campos desconocidos", async () => {
    const response = await POST(request("POST", { name: "Ana", email: " ANA@example.cl ", role: "ADMIN" }));
    expect(response.status).toBe(201);
    expect(mocks.invite).toHaveBeenCalledWith({ name: "Ana", email: "ana@example.cl", role: "ADMIN" }, "https://preview.smellme.cl");

    const invalid = await POST(request("POST", { name: "Ana", email: "ana@example.cl", role: "ADMIN", password: "x" }));
    expect(invalid.status).toBe(400);
    expect(mocks.invite).toHaveBeenCalledTimes(1);
  });

  it("reenvía una invitación pendiente", async () => {
    const response = await PATCH(request("PATCH", { action: "resend" }), { params: Promise.resolve({ userId: "profile-1" }) });
    expect(response.status).toBe(200);
    expect(mocks.resend).toHaveBeenCalledWith("profile-1", "https://preview.smellme.cl");
  });

  it("activa y desactiva pasando la identidad del OWNER al servicio", async () => {
    await PATCH(request("PATCH", { action: "set-active", active: false }), { params: Promise.resolve({ userId: "profile-1" }) });
    await PATCH(request("PATCH", { action: "set-active", active: true }), { params: Promise.resolve({ userId: "profile-1" }) });
    expect(mocks.setActive).toHaveBeenNthCalledWith(1, "profile-1", false, "owner-auth-id");
    expect(mocks.setActive).toHaveBeenNthCalledWith(2, "profile-1", true, "owner-auth-id");
  });

  it("cambia rol solo a OWNER o ADMIN", async () => {
    const valid = await PATCH(request("PATCH", { action: "set-role", role: "OWNER" }), { params: Promise.resolve({ userId: "profile-1" }) });
    const invalid = await PATCH(request("PATCH", { action: "set-role", role: "SUPERADMIN" }), { params: Promise.resolve({ userId: "profile-1" }) });
    expect(valid.status).toBe(200);
    expect(invalid.status).toBe(400);
    expect(mocks.setRole).toHaveBeenCalledWith("profile-1", "OWNER", "owner-auth-id");
  });
});
