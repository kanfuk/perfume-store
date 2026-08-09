import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthenticatedAdmin, checkRateLimit } = vi.hoisted(() => ({
  getAuthenticatedAdmin: vi.fn(),
  checkRateLimit: vi.fn(() => ({ allowed: true }))
}));

vi.mock("@/lib/admin-auth", () => ({
  getAuthenticatedAdmin,
  isOwnerAdmin: (admin: { rol?: string } | null) => admin?.rol === "OWNER"
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit, getRequestIp: () => "127.0.0.1" }));

import { authorizeAdminUsersRequest } from "@/lib/admin-users-request";

describe("autorización server-side del módulo usuarios", () => {
  beforeEach(() => {
    getAuthenticatedAdmin.mockReset();
    checkRateLimit.mockClear();
  });

  it("rechaza una sesión inexistente", async () => {
    getAuthenticatedAdmin.mockResolvedValue(null);
    const result = await authorizeAdminUsersRequest(new Request("https://smellme.cl/api/admin/users"));
    expect(result.response?.status).toBe(401);
  });

  it("impide a ADMIN listar e invitar", async () => {
    getAuthenticatedAdmin.mockResolvedValue({ userId: "admin-1", rol: "ADMIN" });
    const read = await authorizeAdminUsersRequest(new Request("https://smellme.cl/api/admin/users"));
    const write = await authorizeAdminUsersRequest(new Request("https://smellme.cl/api/admin/users", {
      method: "POST", headers: { Origin: "https://smellme.cl", "Content-Type": "application/json" }
    }), true);
    expect(read.response?.status).toBe(403);
    expect(write.response?.status).toBe(403);
  });

  it("permite al OWNER y exige origen en mutaciones", async () => {
    getAuthenticatedAdmin.mockResolvedValue({ userId: "owner-1", rol: "OWNER" });
    const missingOrigin = await authorizeAdminUsersRequest(new Request("https://smellme.cl/api/admin/users", {
      method: "POST", headers: { "Content-Type": "application/json" }
    }), true);
    expect(missingOrigin.response?.status).toBe(403);

    const valid = await authorizeAdminUsersRequest(new Request("https://smellme.cl/api/admin/users", {
      method: "POST", headers: { Origin: "https://smellme.cl", "Content-Type": "application/json" }
    }), true);
    expect(valid.admin?.userId).toBe("owner-1");
    expect(valid.response).toBeUndefined();
  });
});
