import { describe, expect, it } from "vitest";
import { parseEntitlementCheckResponse } from "@/lib/entitlements/schema";
import { MOCK_ENTITLEMENT_RESPONSES } from "@/lib/entitlements/mock";

describe("entitlements/schema - parseEntitlementCheckResponse", () => {
  it("acepta los 5 estados autoritativos validos del contrato", () => {
    for (const fixture of Object.values(MOCK_ENTITLEMENT_RESPONSES)) {
      expect(parseEntitlementCheckResponse(fixture)).toEqual(fixture);
    }
  });

  it("acepta suspensionScope ausente/undefined como null (ALLOW no siempre lo trae)", () => {
    const withoutField: Record<string, unknown> = { ...MOCK_ENTITLEMENT_RESPONSES.ACTIVE };
    delete withoutField.suspensionScope;
    const result = parseEntitlementCheckResponse(withoutField);
    expect(result?.suspensionScope).toBeNull();
  });

  it("rechaza payload que no es un objeto", () => {
    expect(parseEntitlementCheckResponse(null)).toBeNull();
    expect(parseEntitlementCheckResponse(undefined)).toBeNull();
    expect(parseEntitlementCheckResponse("ALLOW")).toBeNull();
    expect(parseEntitlementCheckResponse(42)).toBeNull();
    expect(parseEntitlementCheckResponse([])).toBeNull();
  });

  it("rechaza decision desconocida o ausente", () => {
    expect(parseEntitlementCheckResponse({ ...MOCK_ENTITLEMENT_RESPONSES.ACTIVE, decision: "MAYBE" })).toBeNull();
    const rest: Record<string, unknown> = { ...MOCK_ENTITLEMENT_RESPONSES.ACTIVE };
    delete rest.decision;
    expect(parseEntitlementCheckResponse(rest)).toBeNull();
  });

  it("rechaza status desconocido", () => {
    expect(parseEntitlementCheckResponse({ ...MOCK_ENTITLEMENT_RESPONSES.ACTIVE, status: "TRIAL" })).toBeNull();
  });

  it("rechaza scope distinto de ADMIN", () => {
    expect(parseEntitlementCheckResponse({ ...MOCK_ENTITLEMENT_RESPONSES.ACTIVE, scope: "WRITE" })).toBeNull();
  });

  it("rechaza suspensionScope invalido (no es uno de los 3 valores permitidos)", () => {
    expect(
      parseEntitlementCheckResponse({ ...MOCK_ENTITLEMENT_RESPONSES.SUSPENDED, suspensionScope: "EVERYTHING" })
    ).toBeNull();
  });

  it("parsea WRITE_BLOCK y FULL_APP como suspensionScope validos (seccion 28: el cliente debe poder parsearlos)", () => {
    expect(
      parseEntitlementCheckResponse({ ...MOCK_ENTITLEMENT_RESPONSES.SUSPENDED, suspensionScope: "WRITE_BLOCK" })
        ?.suspensionScope
    ).toBe("WRITE_BLOCK");
    expect(
      parseEntitlementCheckResponse({ ...MOCK_ENTITLEMENT_RESPONSES.SUSPENDED, suspensionScope: "FULL_APP" })
        ?.suspensionScope
    ).toBe("FULL_APP");
  });

  it("rechaza checkedAt que no es una fecha valida", () => {
    expect(parseEntitlementCheckResponse({ ...MOCK_ENTITLEMENT_RESPONSES.ACTIVE, checkedAt: "no-es-fecha" })).toBeNull();
    expect(parseEntitlementCheckResponse({ ...MOCK_ENTITLEMENT_RESPONSES.ACTIVE, checkedAt: "" })).toBeNull();
  });

  it("rechaza recheckAfterSeconds no numerico, cero o negativo", () => {
    expect(parseEntitlementCheckResponse({ ...MOCK_ENTITLEMENT_RESPONSES.ACTIVE, recheckAfterSeconds: "60" })).toBeNull();
    expect(parseEntitlementCheckResponse({ ...MOCK_ENTITLEMENT_RESPONSES.ACTIVE, recheckAfterSeconds: 0 })).toBeNull();
    expect(parseEntitlementCheckResponse({ ...MOCK_ENTITLEMENT_RESPONSES.ACTIVE, recheckAfterSeconds: -5 })).toBeNull();
    expect(
      parseEntitlementCheckResponse({ ...MOCK_ENTITLEMENT_RESPONSES.ACTIVE, recheckAfterSeconds: Number.NaN })
    ).toBeNull();
  });

  it("rechaza notice mal formado (campo faltante) sin caer con excepcion", () => {
    expect(
      parseEntitlementCheckResponse({
        ...MOCK_ENTITLEMENT_RESPONSES.GRACE_PERIOD,
        notice: { severity: "warning", code: "GRACE_PERIOD", title: "Falta message" }
      })
    ).toBeNull();
  });

  it("rechaza notice que no es null ni objeto", () => {
    expect(parseEntitlementCheckResponse({ ...MOCK_ENTITLEMENT_RESPONSES.ACTIVE, notice: "texto" })).toBeNull();
  });

  it("rechaza payload sin la clave notice (debe estar presente aunque sea null)", () => {
    const withoutNotice: Record<string, unknown> = { ...MOCK_ENTITLEMENT_RESPONSES.ACTIVE };
    delete withoutNotice.notice;
    expect(parseEntitlementCheckResponse(withoutNotice)).toBeNull();
  });

  it("nunca lanza excepcion ante entradas adversariales (objetos circulares, getters que lanzan)", () => {
    const circular: Record<string, unknown> = { decision: "ALLOW" };
    circular.self = circular;
    expect(() => parseEntitlementCheckResponse(circular)).not.toThrow();
    expect(parseEntitlementCheckResponse(circular)).toBeNull();
  });
});
