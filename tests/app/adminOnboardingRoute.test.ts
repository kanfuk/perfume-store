import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ complete: vi.fn() }));

vi.mock("@/services/adminOnboardingService", () => ({
  AdminOnboardingError: class AdminOnboardingError extends Error {
    constructor(public readonly code: string) { super(code); }
  },
  completeAuthenticatedAdminOnboarding: mocks.complete
}));

import { POST } from "@/app/api/admin/complete-onboarding/route";

function request(body: unknown) {
  return new Request("https://preview.smellme.cl/api/admin/complete-onboarding", {
    method: "POST",
    headers: { Origin: "https://preview.smellme.cl", "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("POST /api/admin/complete-onboarding", () => {
  beforeEach(() => {
    mocks.complete.mockReset();
    mocks.complete.mockResolvedValue(undefined);
  });

  it("completa exclusivamente al usuario resuelto por la sesión", async () => {
    const response = await POST(request({}));
    expect(response.status).toBe(200);
    expect(mocks.complete).toHaveBeenCalledWith();
  });

  it("rechaza userId u otros campos enviados por el cliente", async () => {
    const response = await POST(request({ userId: "otro-usuario" }));
    expect(response.status).toBe(400);
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("exige origen confiable", async () => {
    const response = await POST(new Request("https://preview.smellme.cl/api/admin/complete-onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    }));
    expect(response.status).toBe(403);
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});
