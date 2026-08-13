import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildAdminInviteRedirectUrl } from "@/lib/admin-users";

const serviceSource = readFileSync("services/adminUserService.ts", "utf8");

describe("redirect implicit de invitaciones admin", () => {
  it("invite apunta directamente a /admin/set-password", () => {
    expect(buildAdminInviteRedirectUrl("https://perfume-store-preview.vercel.app")).toBe(
      "https://smellme-store.vercel.app/admin/set-password"
    );
  });

  it("invite y resend usan el redirect directo, nunca /auth/callback", () => {
    expect(serviceSource.match(/buildAdminInviteRedirectUrl\(redirectOrigin\)/g)).toHaveLength(2);
    expect(serviceSource).not.toContain('new URL("/auth/callback"');
    expect(serviceSource).not.toContain('searchParams.set("next"');
  });
});
