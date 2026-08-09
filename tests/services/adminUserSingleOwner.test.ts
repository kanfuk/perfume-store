import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  profile: null as null | Record<string, unknown>,
  profiles: [] as Array<Record<string, unknown>>,
  inserted: null as null | Record<string, unknown>,
  listUsers: vi.fn(),
  inviteUserByEmail: vi.fn(),
  deleteUser: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    auth: {
      admin: {
        listUsers: mocks.listUsers,
        inviteUserByEmail: mocks.inviteUserByEmail,
        deleteUser: mocks.deleteUser
      }
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: mocks.profile, error: null })
        }),
        order: async () => ({ data: mocks.profiles, error: null })
      }),
      insert: async (value: Record<string, unknown>) => {
        mocks.inserted = value;
        return { error: null };
      },
      update: () => ({ eq: async () => ({ error: null }) })
    })
  })
}));

vi.mock("@/services/adminPaymentAccountService", () => ({
  createAdminPaymentAccountService: () => ({ listSummaries: async () => new Map() })
}));

import { createAdminUserService } from "@/services/adminUserService";

const baseProfile = {
  id: "profile-1",
  auth_user_id: "auth-1",
  email: "admin@example.cl",
  nombre: "Admin",
  rol: "ADMIN",
  activo: true,
  invited_at: null,
  onboarding_completed_at: "2026-08-08T12:00:00.000Z",
  created_at: "2026-08-08T10:00:00.000Z"
};

describe("servicio de OWNER único", () => {
  beforeEach(() => {
    mocks.profile = null;
    mocks.profiles = [];
    mocks.inserted = null;
    mocks.listUsers.mockReset().mockResolvedValue({ data: { users: [] }, error: null });
    mocks.inviteUserByEmail.mockReset().mockResolvedValue({ data: { user: { id: "auth-new" } }, error: null });
    mocks.deleteUser.mockReset().mockResolvedValue({ error: null });
  });

  it("rechaza ADMIN a OWNER antes de intentar una mutación DB", async () => {
    await expect(createAdminUserService().setRole("profile-1", "OWNER", "owner-profile"))
      .rejects.toMatchObject({ code: "SINGLE_OWNER" });
  });

  it("marca primary owner por rol aunque el actor actual sea ADMIN", async () => {
    mocks.profiles = [
      { ...baseProfile, id: "owner-profile", rol: "OWNER" },
      { ...baseProfile, id: "admin-profile", rol: "ADMIN" }
    ];
    const users = await createAdminUserService().list("admin-profile");
    expect(users).toEqual([
      expect.objectContaining({ id: "owner-profile", isPrimaryOwner: true, isCurrentUser: false }),
      expect.objectContaining({ id: "admin-profile", isPrimaryOwner: false, isCurrentUser: true })
    ]);
  });

  it("rechaza degradar el OWNER estructural", async () => {
    mocks.profile = { ...baseProfile, rol: "OWNER" };
    await expect(createAdminUserService().setRole("profile-1", "ADMIN", "owner-profile"))
      .rejects.toMatchObject({ code: "PRIMARY_OWNER_IMMUTABLE" });
  });

  it("rechaza desactivar el OWNER estructural", async () => {
    mocks.profile = { ...baseProfile, rol: "OWNER" };
    await expect(createAdminUserService().setActive("profile-1", false, "owner-profile"))
      .rejects.toMatchObject({ code: "PRIMARY_OWNER_IMMUTABLE" });
  });

  it("fija ADMIN server-side aunque un llamador fuerce role OWNER", async () => {
    await createAdminUserService().invite({
      name: "Nueva Admin",
      email: "new@example.cl",
      role: "OWNER"
    } as never, "https://preview.smellme.cl");
    expect(mocks.inserted).toMatchObject({
      auth_user_id: "auth-new",
      rol: "ADMIN",
      onboarding_completed_at: null
    });
  });
});
