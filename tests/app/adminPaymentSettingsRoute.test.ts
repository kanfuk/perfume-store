import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const { getAuthenticatedAdmin, validateTrustedOrigin, validateJsonRequest } =
  vi.hoisted(() => ({
    getAuthenticatedAdmin: vi.fn(),
    validateTrustedOrigin: vi.fn(),
    validateJsonRequest: vi.fn()
  }));

const { obtenerEstadoConfiguracionPago, guardarConfiguracionPago } = vi.hoisted(
  () => ({
    obtenerEstadoConfiguracionPago: vi.fn(),
    guardarConfiguracionPago: vi.fn()
  })
);

vi.mock("@/lib/admin-auth", () => ({ getAuthenticatedAdmin }));
vi.mock("@/lib/admin-audit", () => ({ logAdminAction: vi.fn(), requestAuditId: () => "11111111-1111-4111-8111-111111111111" }));
vi.mock("@/lib/http-security", () => ({
  validateTrustedOrigin,
  validateJsonRequest
}));
vi.mock("@/services/businessSettingsService", () => ({
  createBusinessSettingsService: () => ({
    obtenerEstadoConfiguracionPago,
    guardarConfiguracionPago
  })
}));

import {
  GET,
  PUT
} from "@/app/api/admin/settings/payment/route";

const settings = {
  banco: "BANCOESTADO",
  tipoCuenta: "CUENTA_VISTA",
  titularCuenta: "Smellme SpA",
  rutTitular: "12345678-5",
  numeroCuenta: "001234",
  correo: "pagos@smellme.cl"
};

function putRequest(body: unknown, raw = false) {
  return new Request("http://localhost/api/admin/settings/payment", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost"
    },
    body: raw ? String(body) : JSON.stringify(body)
  });
}

describe("GET/PUT /api/admin/settings/payment", () => {
  beforeEach(() => {
    getAuthenticatedAdmin.mockReset();
    getAuthenticatedAdmin.mockResolvedValue({ userId: "admin-1" });
    validateTrustedOrigin.mockReset();
    validateTrustedOrigin.mockReturnValue(null);
    validateJsonRequest.mockReset();
    validateJsonRequest.mockReturnValue(null);
    obtenerEstadoConfiguracionPago.mockReset();
    obtenerEstadoConfiguracionPago.mockResolvedValue({
      settings,
      completa: true
    });
    guardarConfiguracionPago.mockReset();
    guardarConfiguracionPago.mockResolvedValue({
      valid: true,
      data: settings
    });
  });

  it("GET sin sesion devuelve 401 y no consulta settings", async () => {
    getAuthenticatedAdmin.mockResolvedValueOnce(null);
    const response = await GET(
      new Request("http://localhost/api/admin/settings/payment")
    );
    expect(response.status).toBe(401);
    expect(obtenerEstadoConfiguracionPago).not.toHaveBeenCalled();
  });

  it("GET autenticado devuelve la configuracion editable sin cache", async () => {
    const response = await GET(
      new Request("http://localhost/api/admin/settings/payment")
    );
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(payload.settings.numeroCuenta).toBe("001234");
  });

  it("GET summary no expone campos bancarios", async () => {
    const response = await GET(
      new Request("http://localhost/api/admin/settings/payment?summary=1")
    );
    const payload = await response.json();
    expect(payload).toEqual({
      completa: true,
      bancoCompleto: true,
      tipoCuentaCompleto: true,
      numeroCuentaCompleto: true,
      titularCompleto: true,
      rutCompleto: true,
      correoCompleto: true
    });
    expect(JSON.stringify(payload)).not.toContain("001234");
  });

  it("PUT sin sesion devuelve 401", async () => {
    getAuthenticatedAdmin.mockResolvedValueOnce(null);
    const response = await PUT(putRequest(settings));
    expect(response.status).toBe(401);
    expect(guardarConfiguracionPago).not.toHaveBeenCalled();
  });

  it("PUT rechaza origen no confiable", async () => {
    validateTrustedOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "Origen no permitido." }, { status: 403 })
    );
    const response = await PUT(putRequest(settings));
    expect(response.status).toBe(403);
    expect(guardarConfiguracionPago).not.toHaveBeenCalled();
  });

  it("PUT rechaza JSON invalido", async () => {
    const response = await PUT(putRequest("{", true));
    expect(response.status).toBe(400);
    expect(guardarConfiguracionPago).not.toHaveBeenCalled();
  });

  it("PUT rechaza claves desconocidas", async () => {
    const response = await PUT(
      putRequest({ ...settings, costoDespachoSemanal: 1 })
    );
    const payload = await response.json();
    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/Campos no permitidos/);
    expect(guardarConfiguracionPago).not.toHaveBeenCalled();
  });

  it("PUT persiste solo la forma permitida", async () => {
    const response = await PUT(
      putRequest({
        banco: "BANCOESTADO",
        tipoCuenta: "CUENTA_VISTA",
        titularCuenta: "Smellme SpA",
        rutTitular: "12.345.678-5",
        numeroCuenta: "001234",
        correo: "PAGOS@SMELLME.CL"
      })
    );
    expect(response.status).toBe(200);
    expect(guardarConfiguracionPago).toHaveBeenCalledWith({
      banco: "BANCOESTADO",
      bancoOtro: "",
      tipoCuenta: "CUENTA_VISTA",
      tipoCuentaOtro: "",
      titularCuenta: "Smellme SpA",
      rutTitular: "12.345.678-5",
      numeroCuenta: "001234",
      correo: "PAGOS@SMELLME.CL"
    });
  });

  it("PUT devuelve errores de validacion del servicio", async () => {
    guardarConfiguracionPago.mockResolvedValueOnce({
      valid: false,
      errors: { rutTitular: "Ingresa un RUT chileno valido." }
    });
    const response = await PUT(putRequest(settings));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      errors: { rutTitular: "Ingresa un RUT chileno valido." }
    });
  });
});
