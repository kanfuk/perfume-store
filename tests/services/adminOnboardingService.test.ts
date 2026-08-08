import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  select: vi.fn(),
  selectEq: vi.fn(),
  selectMaybeSingle: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
  updateSelect: vi.fn(),
  updateMaybeSingle: vi.fn()
}));

vi.mock("@/lib/supabase/auth-server", () => ({
  createSupabaseAuthServerClient: async () => ({ auth: { getUser: mocks.getUser } })
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    from: () => ({ select: mocks.select, update: mocks.update })
  })
}));

import { completeAuthenticatedAdminOnboarding } from "@/services/adminOnboardingService";

describe("completeAuthenticatedAdminOnboarding", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "session-user", email: "admin@example.cl" } },
      error: null
    });
    mocks.select.mockReturnValue({ eq: mocks.selectEq });
    mocks.selectEq.mockReturnValue({ maybeSingle: mocks.selectMaybeSingle });
    mocks.selectMaybeSingle.mockResolvedValue({
      data: { id: "profile-1", onboarding_completed_at: null },
      error: null
    });
    mocks.update.mockReturnValue({ eq: mocks.updateEq });
    mocks.updateEq.mockReturnValue({ select: mocks.updateSelect });
    mocks.updateSelect.mockReturnValue({ maybeSingle: mocks.updateMaybeSingle });
    mocks.updateMaybeSingle.mockResolvedValue({ data: { id: "profile-1" }, error: null });
  });

  it("usa el auth_user_id de la sesión y actualiza solo onboarding_completed_at", async () => {
    await completeAuthenticatedAdminOnboarding();
    expect(mocks.selectEq).toHaveBeenCalledWith("auth_user_id", "session-user");
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update.mock.calls[0]?.[0]).toEqual({
      onboarding_completed_at: expect.any(String)
    });
    expect(mocks.updateEq).toHaveBeenCalledWith("id", "profile-1");
  });

  it("es idempotente para un usuario que ya completó onboarding", async () => {
    mocks.selectMaybeSingle.mockResolvedValue({
      data: { id: "profile-1", onboarding_completed_at: "2026-08-08T12:00:00.000Z" },
      error: null
    });
    await completeAuthenticatedAdminOnboarding();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
