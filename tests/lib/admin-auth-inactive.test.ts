import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  eq: vi.fn(),
  not: vi.fn(),
  select: vi.fn()
}));

vi.mock("@/lib/supabase/auth-server", () => ({
  createSupabaseAuthServerClient: async () => ({ auth: { getUser: mocks.getUser } })
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => {
    const query = {
      select: mocks.select,
      eq: mocks.eq,
      not: mocks.not,
      maybeSingle: mocks.maybeSingle
    };
    mocks.select.mockReturnValue(query);
    mocks.eq.mockReturnValue(query);
    mocks.not.mockReturnValue(query);
    return { from: () => query };
  }
}));

import { getAuthenticatedAdmin } from "@/lib/admin-auth";

describe("autorización de usuario administrativo inactivo", () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.maybeSingle.mockReset();
    mocks.eq.mockReset();
    mocks.not.mockReset();
    mocks.select.mockReset();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "auth-1", email: "ADMIN@EXAMPLE.CL" } } });
  });

  it("rechaza al usuario cuando no existe una fila activa", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await getAuthenticatedAdmin()).toBeNull();
  });

  it("acepta la fila activa y normaliza el correo consultado", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { email: "admin@example.cl", nombre: "Ana", rol: "OWNER", activo: true, onboarding_completed_at: "2026-08-08T12:00:00.000Z" }, error: null });
    expect(await getAuthenticatedAdmin()).toEqual({ userId: "auth-1", email: "admin@example.cl", nombre: "Ana", rol: "OWNER" });
    expect(mocks.not).toHaveBeenCalledWith("onboarding_completed_at", "is", null);
  });

  it("rechaza un ADMIN activo mientras onboarding siga pendiente", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await getAuthenticatedAdmin()).toBeNull();
    expect(mocks.not).toHaveBeenCalledWith("onboarding_completed_at", "is", null);
  });
});
