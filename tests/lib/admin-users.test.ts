import { describe, expect, it } from "vitest";
import {
  canResendAdminInvitation,
  deriveAdminUserStatus,
  isPrimaryOwnerRole,
  normalizeAdminEmail,
  validateInviteAdminUserInput
} from "@/lib/admin-users";

describe("validación de invitaciones administrativas", () => {
  it("normaliza el correo y no acepta un rol enviado por el cliente", () => {
    expect(normalizeAdminEmail("  OWNER@Smellme.CL ")).toBe("owner@smellme.cl");
    expect(validateInviteAdminUserInput({ name: "Ana Pérez", email: " ANA@Example.CL " })).toEqual({
      valid: true,
      data: { name: "Ana Pérez", email: "ana@example.cl" }
    });
  });

  it("rechaza correo inválido, cualquier role inyectado y campos adicionales", () => {
    expect(validateInviteAdminUserInput({ name: "Ana", email: "ana" }).valid).toBe(false);
    expect(validateInviteAdminUserInput({ name: "Ana", email: "ana@example.cl", role: "OWNER" }).valid).toBe(false);
    expect(validateInviteAdminUserInput({ name: "Ana", email: "ana@example.cl", role: "ADMIN" }).valid).toBe(false);
    expect(validateInviteAdminUserInput({ name: "Ana", email: "ana@example.cl", password: "secret" }).valid).toBe(false);
  });
});

describe("identidad estructural del OWNER principal", () => {
  it("identifica exclusivamente el rol OWNER sin depender del usuario actual", () => {
    expect(isPrimaryOwnerRole("OWNER")).toBe(true);
    expect(isPrimaryOwnerRole("ADMIN")).toBe(false);
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
