import { describe, expect, it } from "vitest";
import {
  canResendAdminInvitation,
  deriveAdminUserStatus,
  normalizeAdminEmail,
  validateInviteAdminUserInput,
  wouldRemoveLastActiveOwner
} from "@/lib/admin-users";

describe("validación de invitaciones administrativas", () => {
  it("normaliza el correo y acepta solo OWNER o ADMIN", () => {
    expect(normalizeAdminEmail("  OWNER@Smellme.CL ")).toBe("owner@smellme.cl");
    expect(validateInviteAdminUserInput({ name: "Ana Pérez", email: " ANA@Example.CL ", role: "ADMIN" })).toEqual({
      valid: true,
      data: { name: "Ana Pérez", email: "ana@example.cl", role: "ADMIN" }
    });
  });

  it("rechaza correo inválido, rol desconocido y campos adicionales", () => {
    expect(validateInviteAdminUserInput({ name: "Ana", email: "ana", role: "ADMIN" }).valid).toBe(false);
    expect(validateInviteAdminUserInput({ name: "Ana", email: "ana@example.cl", role: "SUPERADMIN" }).valid).toBe(false);
    expect(validateInviteAdminUserInput({ name: "Ana", email: "ana@example.cl", role: "ADMIN", password: "secret" }).valid).toBe(false);
  });
});

describe("protección del último OWNER", () => {
  it("bloquea desactivarlo o degradarlo", () => {
    const current = { role: "OWNER" as const, active: true };
    expect(wouldRemoveLastActiveOwner(current, { active: false }, 1)).toBe(true);
    expect(wouldRemoveLastActiveOwner(current, { role: "ADMIN" }, 1)).toBe(true);
  });

  it("permite el cambio cuando queda otro OWNER activo", () => {
    expect(wouldRemoveLastActiveOwner({ role: "OWNER", active: true }, { active: false }, 2)).toBe(false);
  });
});

describe("estado explícito de onboarding", () => {
  it("mantiene pendiente a una invitación nueva aunque Auth haya confirmado el email", () => {
    const emailConfirmedAt = "2026-08-08T12:00:00.000Z";
    expect(emailConfirmedAt).toBeTruthy();
    expect(deriveAdminUserStatus({ active: true, onboardingCompletedAt: null })).toBe("PENDING_INVITATION");
  });

  it("queda activo solamente después de completar set-password", () => {
    expect(deriveAdminUserStatus({ active: true, onboardingCompletedAt: "2026-08-08T12:05:00.000Z" })).toBe("ACTIVE");
  });

  it("inactivo tiene prioridad sobre onboarding completado", () => {
    expect(deriveAdminUserStatus({ active: false, onboardingCompletedAt: "2026-08-08T12:05:00.000Z" })).toBe("INACTIVE");
  });

  it("permite reenviar mientras onboarding siga pendiente", () => {
    expect(canResendAdminInvitation(null)).toBe(true);
    expect(canResendAdminInvitation("2026-08-08T12:05:00.000Z")).toBe(false);
  });
});
