import { afterEach, describe, expect, it, vi } from "vitest";
import { getDefaultRecheckSeconds, getDependencyErrorBackoffSeconds, getEntitlementConfig } from "@/lib/entitlements/config";

describe("entitlements/config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("retorna null si falta RIEDMANN_APPS_CONTROL_URL", () => {
    vi.stubEnv("RIEDMANN_APPS_CONTROL_URL", "");
    vi.stubEnv("RIEDMANN_APPS_INSTALLATION_TOKEN", "token-de-prueba");
    expect(getEntitlementConfig()).toBeNull();
  });

  it("retorna null si falta RIEDMANN_APPS_INSTALLATION_TOKEN", () => {
    vi.stubEnv("RIEDMANN_APPS_CONTROL_URL", "https://control.riedmannapps.com");
    vi.stubEnv("RIEDMANN_APPS_INSTALLATION_TOKEN", "");
    expect(getEntitlementConfig()).toBeNull();
  });

  it("retorna null si la URL no es HTTPS (seccion 2 del encargo exige HTTPS)", () => {
    vi.stubEnv("RIEDMANN_APPS_CONTROL_URL", "http://control.riedmannapps.com");
    vi.stubEnv("RIEDMANN_APPS_INSTALLATION_TOKEN", "token-de-prueba");
    expect(getEntitlementConfig()).toBeNull();
  });

  it("retorna null si la URL es invalida", () => {
    vi.stubEnv("RIEDMANN_APPS_CONTROL_URL", "no-es-una-url");
    vi.stubEnv("RIEDMANN_APPS_INSTALLATION_TOKEN", "token-de-prueba");
    expect(getEntitlementConfig()).toBeNull();
  });

  it("normaliza espacios en blanco alrededor del valor", () => {
    vi.stubEnv("RIEDMANN_APPS_CONTROL_URL", "  https://control.riedmannapps.com  ");
    vi.stubEnv("RIEDMANN_APPS_INSTALLATION_TOKEN", "  token-de-prueba  ");
    expect(getEntitlementConfig()).toEqual({
      controlUrl: "https://control.riedmannapps.com",
      installationToken: "token-de-prueba",
      timeoutMs: 3000
    });
  });

  it("config valida retorna timeoutMs por defecto de 3 segundos", () => {
    vi.stubEnv("RIEDMANN_APPS_CONTROL_URL", "https://control.riedmannapps.com");
    vi.stubEnv("RIEDMANN_APPS_INSTALLATION_TOKEN", "token-de-prueba");
    expect(getEntitlementConfig()?.timeoutMs).toBe(3000);
  });

  it("expone constantes de recheck/backoff coherentes (backoff mas corto que el default)", () => {
    expect(getDependencyErrorBackoffSeconds()).toBeLessThan(getDefaultRecheckSeconds());
    expect(getDefaultRecheckSeconds()).toBeGreaterThan(0);
    expect(getDependencyErrorBackoffSeconds()).toBeGreaterThan(0);
  });
});
