import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("components/admin/AdminSetPasswordForm.tsx", "utf8");

describe("set-password completa onboarding", () => {
  it("marca onboarding después de updateUser y antes de signOut", () => {
    const updatePassword = source.indexOf("supabase.auth.updateUser({ password })");
    const completeOnboarding = source.indexOf("/api/admin/complete-onboarding");
    const signOut = source.indexOf("supabase.auth.signOut()");
    expect(updatePassword).toBeGreaterThan(-1);
    expect(completeOnboarding).toBeGreaterThan(updatePassword);
    expect(signOut).toBeGreaterThan(completeOnboarding);
  });

  it("no envía userId desde el navegador", () => {
    expect(source).not.toMatch(/userId/);
    expect(source).toContain("body: JSON.stringify({})");
  });
});
