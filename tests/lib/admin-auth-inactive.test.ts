import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), maybeSingle: vi.fn() }));

vi.mock("@/lib/supabase/auth-server", () => ({
  createSupabaseAuthServerClient: async () => ({ auth: { getUser: mocks.getUser } })
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) })
      })
    })
  })
}));

import { getAuthenticatedAdmin } from "@/lib/admin-auth";

describe("autorización de usuario administrativo inactivo", () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.maybeSingle.mockReset();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "auth-1", email: "ADMIN@EXAMPLE.CL" } } });
  });

  it("rechaza al usuario cuando no existe una fila activa", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await getAuthenticatedAdmin()).toBeNull();
  });

  it("acepta la fila activa y normaliza el correo consultado", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { email: "admin@example.cl", nombre: "Ana", rol: "OWNER", activo: true }, error: null });
    expect(await getAuthenticatedAdmin()).toEqual({ userId: "auth-1", email: "admin@example.cl", nombre: "Ana", rol: "OWNER" });
  });
});
