import { describe, expect, it, vi } from "vitest";
import { requestAdminPasswordRecovery } from "@/lib/admin/passwordRecovery";
import { feedbackMessages } from "@/lib/ui/feedback-messages";

const REDIRECT_TO = "http://localhost:3000/admin/set-password";

describe("requestAdminPasswordRecovery", () => {
  it("rechaza un correo vacio sin llamar a Supabase", async () => {
    const resetPasswordForEmail = vi.fn();

    const result = await requestAdminPasswordRecovery(
      "",
      { resetPasswordForEmail },
      REDIRECT_TO
    );

    expect(result).toEqual({
      requestAccepted: false,
      message: feedbackMessages.adminPasswordRecoveryInvalidEmail
    });
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("rechaza un correo con formato invalido sin llamar a Supabase", async () => {
    const resetPasswordForEmail = vi.fn();

    const result = await requestAdminPasswordRecovery(
      "correo-sin-arroba",
      { resetPasswordForEmail },
      REDIRECT_TO
    );

    expect(result.requestAccepted).toBe(false);
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("normaliza el correo (trim + minusculas) antes de llamar a Supabase", async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ data: {}, error: null });

    await requestAdminPasswordRecovery(
      "  Admin@Ejemplo.COM  ",
      { resetPasswordForEmail },
      REDIRECT_TO
    );

    expect(resetPasswordForEmail).toHaveBeenCalledWith("admin@ejemplo.com", {
      redirectTo: REDIRECT_TO
    });
  });

  it("respuesta exitosa: requestAccepted=true y mensaje publico generico", async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ data: {}, error: null });

    const result = await requestAdminPasswordRecovery(
      "admin@ejemplo.com",
      { resetPasswordForEmail },
      REDIRECT_TO
    );

    expect(result).toEqual({
      requestAccepted: true,
      message: feedbackMessages.adminPasswordRecoveryRequested
    });
  });

  it("respuesta con error de Supabase: requestAccepted=false pero mismo mensaje publico, sin exponer el error", async () => {
    const resetPasswordForEmail = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "correo no existe", code: "user_not_found" } });

    const result = await requestAdminPasswordRecovery(
      "admin@ejemplo.com",
      { resetPasswordForEmail },
      REDIRECT_TO
    );

    expect(result.requestAccepted).toBe(false);
    expect(result.message).toBe(feedbackMessages.adminPasswordRecoveryRequested);
    expect(result.message).not.toContain("correo no existe");
    expect(result.message).not.toContain("user_not_found");
  });

  it("excepcion (red/config/rate limit): requestAccepted=false pero mismo mensaje publico", async () => {
    const resetPasswordForEmail = vi.fn().mockRejectedValue(new Error("network down"));

    const result = await requestAdminPasswordRecovery(
      "admin@ejemplo.com",
      { resetPasswordForEmail },
      REDIRECT_TO
    );

    expect(result.requestAccepted).toBe(false);
    expect(result.message).toBe(feedbackMessages.adminPasswordRecoveryRequested);
  });

  it("el mensaje publico es identico en todos los escenarios de solicitud valida (exito, error, excepcion)", async () => {
    const successAuth = { resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: null }) };
    const errorAuth = {
      resetPasswordForEmail: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } })
    };
    const throwingAuth = { resetPasswordForEmail: vi.fn().mockRejectedValue(new Error("boom")) };

    const [successResult, errorResult, exceptionResult] = await Promise.all([
      requestAdminPasswordRecovery("admin@ejemplo.com", successAuth, REDIRECT_TO),
      requestAdminPasswordRecovery("admin@ejemplo.com", errorAuth, REDIRECT_TO),
      requestAdminPasswordRecovery("admin@ejemplo.com", throwingAuth, REDIRECT_TO)
    ]);

    expect(successResult.message).toBe(errorResult.message);
    expect(errorResult.message).toBe(exceptionResult.message);

    expect(successResult.requestAccepted).toBe(true);
    expect(errorResult.requestAccepted).toBe(false);
    expect(exceptionResult.requestAccepted).toBe(false);
  });
});
