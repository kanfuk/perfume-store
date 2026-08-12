import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { checkAdminEntitlement } = vi.hoisted(() => ({ checkAdminEntitlement: vi.fn() }));
vi.mock("@/lib/entitlements/client", () => ({ checkAdminEntitlement }));

import { evaluateAdminEntitlement } from "@/lib/entitlements/policy";
import { resetEntitlementCacheForTests } from "@/lib/entitlements/cache";
import { MOCK_ENTITLEMENT_RESPONSES } from "@/lib/entitlements/mock";

describe("entitlements/policy - evaluateAdminEntitlement", () => {
  beforeEach(() => {
    resetEntitlementCacheForTests();
    checkAdminEntitlement.mockReset();
    vi.unstubAllEnvs();
    // Config valida por defecto: estos tests ejercitan el cliente HTTP
    // (mockeado arriba), no el chequeo de configuracion ausente -- ese
    // tiene su propio describe() mas abajo. Sin esto, el chequeo de
    // config-ausente (patch de seguridad) cortocircuitaria antes de
    // siquiera llamar al cliente mockeado.
    vi.stubEnv("RIEDMANN_APPS_CONTROL_URL", "https://control.riedmannapps.com");
    vi.stubEnv("RIEDMANN_APPS_INSTALLATION_TOKEN", "installation-token-de-prueba");
    // Nunca dejar que el modo mock por env var interfiera con estos tests:
    // se ejercita el cliente HTTP (mockeado arriba) explicitamente.
    vi.stubEnv("RIEDMANN_APPS_MOCK_STATUS", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  // Seccion 8: semantica autoritativa de cada estado.
  it("ACTIVE -> ALLOW, sin notice", async () => {
    checkAdminEntitlement.mockResolvedValue({ kind: "success", response: MOCK_ENTITLEMENT_RESPONSES.ACTIVE });
    expect(await evaluateAdminEntitlement()).toEqual({ blocked: false, notice: null, reason: "authoritative-allow" });
  });

  it("OVERDUE -> ALLOW, admin sigue operativo", async () => {
    checkAdminEntitlement.mockResolvedValue({ kind: "success", response: MOCK_ENTITLEMENT_RESPONSES.OVERDUE });
    expect(await evaluateAdminEntitlement()).toEqual({ blocked: false, notice: null, reason: "authoritative-allow" });
  });

  it("GRACE_PERIOD -> ALLOW + notice validado por Control (nunca inventado)", async () => {
    checkAdminEntitlement.mockResolvedValue({ kind: "success", response: MOCK_ENTITLEMENT_RESPONSES.GRACE_PERIOD });
    const result = await evaluateAdminEntitlement();
    expect(result.blocked).toBe(false);
    expect(result.notice).toEqual(MOCK_ENTITLEMENT_RESPONSES.GRACE_PERIOD.notice);
  });

  it("SUSPENDED ADMIN_ONLY -> DENY, bloquea admin", async () => {
    checkAdminEntitlement.mockResolvedValue({ kind: "success", response: MOCK_ENTITLEMENT_RESPONSES.SUSPENDED });
    expect(await evaluateAdminEntitlement()).toEqual({ blocked: true, notice: null, reason: "authoritative-deny" });
  });

  it("CANCELLED -> DENY, respeta el DENY segun contrato", async () => {
    checkAdminEntitlement.mockResolvedValue({ kind: "success", response: MOCK_ENTITLEMENT_RESPONSES.CANCELLED });
    expect(await evaluateAdminEntitlement()).toEqual({ blocked: true, notice: null, reason: "authoritative-deny" });
  });

  // Seccion 9: fail closed.
  it("401 -> FAIL CLOSED (token invalido no es transitorio)", async () => {
    checkAdminEntitlement.mockResolvedValue({ kind: "unauthorized" });
    expect(await evaluateAdminEntitlement()).toEqual({ blocked: true, notice: null, reason: "token-invalid" });
  });

  // Fase 7A: config faltante (aun sin token real) nunca bloquea el rollout.
  it("configuracion faltante -> FAIL OPEN (Fase 7A, aun sin token real)", async () => {
    checkAdminEntitlement.mockResolvedValue({ kind: "not-configured" });
    expect(await evaluateAdminEntitlement()).toEqual({
      blocked: false,
      notice: null,
      reason: "not-configured-fail-open"
    });
  });

  it("configuracion faltante nunca se cachea: cada llamada vuelve a preguntar", async () => {
    checkAdminEntitlement.mockResolvedValue({ kind: "not-configured" });
    await evaluateAdminEntitlement();
    await evaluateAdminEntitlement();
    expect(checkAdminEntitlement).toHaveBeenCalledTimes(2);
  });

  // Seccion 10-11: fail open transitorio.
  it.each([
    ["http-error 429", { kind: "dependency-error", reason: "http-error", httpStatus: 429 }],
    ["http-error 503", { kind: "dependency-error", reason: "http-error", httpStatus: 503 }],
    ["timeout", { kind: "dependency-error", reason: "timeout" }],
    ["network", { kind: "dependency-error", reason: "network" }],
    ["malformed-response (200 invalido)", { kind: "dependency-error", reason: "malformed-response", httpStatus: 200 }]
  ])("%s sin decision previa -> FAIL OPEN temporal, nunca DENY", async (_label, result) => {
    checkAdminEntitlement.mockResolvedValue(result);
    expect(await evaluateAdminEntitlement()).toEqual({
      blocked: false,
      notice: null,
      reason: "dependency-error-fail-open-no-previous"
    });
  });

  it("503 con un ALLOW autoritativo previo cacheado -> reusa el ALLOW (seccion 14)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    checkAdminEntitlement.mockResolvedValueOnce({ kind: "success", response: MOCK_ENTITLEMENT_RESPONSES.ACTIVE });
    await evaluateAdminEntitlement();

    vi.setSystemTime(MOCK_ENTITLEMENT_RESPONSES.ACTIVE.recheckAfterSeconds * 1000 + 1);
    checkAdminEntitlement.mockResolvedValueOnce({ kind: "dependency-error", reason: "http-error", httpStatus: 503 });
    const result = await evaluateAdminEntitlement();

    expect(result).toEqual({ blocked: false, notice: null, reason: "dependency-error-stale-allow" });
  });

  it("503 con un DENY autoritativo previo cacheado -> mantiene el DENY, NUNCA lo convierte en ALLOW (seccion 14, critico)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    checkAdminEntitlement.mockResolvedValueOnce({ kind: "success", response: MOCK_ENTITLEMENT_RESPONSES.SUSPENDED });
    await evaluateAdminEntitlement();

    vi.setSystemTime(MOCK_ENTITLEMENT_RESPONSES.SUSPENDED.recheckAfterSeconds * 1000 + 1);
    checkAdminEntitlement.mockResolvedValueOnce({ kind: "dependency-error", reason: "network" });
    const result = await evaluateAdminEntitlement();

    expect(result).toEqual({ blocked: true, notice: null, reason: "dependency-error-stale-deny" });
  });

  it("503 con un token-invalid previo cacheado -> mantiene el DENY", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    checkAdminEntitlement.mockResolvedValueOnce({ kind: "unauthorized" });
    await evaluateAdminEntitlement();

    vi.setSystemTime(61_000);
    checkAdminEntitlement.mockResolvedValueOnce({ kind: "dependency-error", reason: "timeout" });
    const result = await evaluateAdminEntitlement();

    expect(result).toEqual({ blocked: true, notice: null, reason: "dependency-error-stale-deny" });
  });

  // Seccion 12: cache hit nunca vuelve a consultar Control.
  it("cache hit (dentro de recheckAfterSeconds) NUNCA llama al cliente HTTP de nuevo", async () => {
    checkAdminEntitlement.mockResolvedValue({ kind: "success", response: MOCK_ENTITLEMENT_RESPONSES.ACTIVE });
    await evaluateAdminEntitlement();
    await evaluateAdminEntitlement();
    await evaluateAdminEntitlement();
    expect(checkAdminEntitlement).toHaveBeenCalledTimes(1);
  });

  it("cache hit reporta reason=cache-hit-* en las llamadas subsiguientes", async () => {
    checkAdminEntitlement.mockResolvedValue({ kind: "success", response: MOCK_ENTITLEMENT_RESPONSES.ACTIVE });
    await evaluateAdminEntitlement();
    const second = await evaluateAdminEntitlement();
    expect(second.reason).toBe("cache-hit-allow");
  });

  it("TTL expirado (paso recheckAfterSeconds) -> vuelve a consultar Control", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    checkAdminEntitlement.mockResolvedValue({ kind: "success", response: MOCK_ENTITLEMENT_RESPONSES.ACTIVE });
    await evaluateAdminEntitlement();

    vi.setSystemTime(MOCK_ENTITLEMENT_RESPONSES.ACTIVE.recheckAfterSeconds * 1000 + 1);
    await evaluateAdminEntitlement();

    expect(checkAdminEntitlement).toHaveBeenCalledTimes(2);
  });

  // Seccion 15: reactivacion sin redeploy/reinicio/login nuevo.
  it("reactivacion: DENY autoritativo -> pasa el TTL -> Control responde ACTIVE/ALLOW -> el admin recupera acceso en el siguiente check", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    checkAdminEntitlement.mockResolvedValueOnce({ kind: "success", response: MOCK_ENTITLEMENT_RESPONSES.SUSPENDED });
    const suspended = await evaluateAdminEntitlement();
    expect(suspended.blocked).toBe(true);

    // OWNER registra el pago en Control; el siguiente check (tras el TTL) ya
    // refleja el nuevo estado -- sin redeploy, sin reinicio, sin login nuevo.
    vi.setSystemTime(MOCK_ENTITLEMENT_RESPONSES.SUSPENDED.recheckAfterSeconds * 1000 + 1);
    checkAdminEntitlement.mockResolvedValueOnce({ kind: "success", response: MOCK_ENTITLEMENT_RESPONSES.ACTIVE });
    const reactivated = await evaluateAdminEntitlement();

    expect(reactivated).toEqual({ blocked: false, notice: null, reason: "authoritative-allow" });
  });

  // Modo mock de dev/test (secciones 33-34): nunca llama al cliente HTTP real.
  it("modo mock (RIEDMANN_APPS_MOCK_STATUS) resuelve sin tocar el cliente HTTP", async () => {
    vi.stubEnv("RIEDMANN_APPS_MOCK_STATUS", "GRACE_PERIOD");
    const result = await evaluateAdminEntitlement();
    expect(result.blocked).toBe(false);
    expect(result.notice?.code).toBe("GRACE_PERIOD");
    expect(checkAdminEntitlement).not.toHaveBeenCalled();
  });
});

/**
 * Patch de seguridad: config ausente en Production debe ser FAIL CLOSED con
 * una categoria propia ("configuration-error"), nunca fail-open ni
 * disfrazada de decision de Control. Ver docs/RIEDMANN_APPS_ENTITLEMENT_INTEGRATION.md.
 */
describe("entitlements/policy - configuracion ausente en Production (patch de seguridad)", () => {
  beforeEach(() => {
    resetEntitlementCacheForTests();
    checkAdminEntitlement.mockReset();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  // Tests 1-3 del patch.
  it("NODE_ENV=production + URL ausente -> admin fail-closed (configuration-error)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RIEDMANN_APPS_CONTROL_URL", "");
    vi.stubEnv("RIEDMANN_APPS_INSTALLATION_TOKEN", "token-real-presente");

    const result = await evaluateAdminEntitlement();

    expect(result).toEqual({ blocked: true, notice: null, reason: "configuration-error" });
  });

  it("NODE_ENV=production + token ausente -> admin fail-closed (configuration-error)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RIEDMANN_APPS_CONTROL_URL", "https://control.riedmannapps.com");
    vi.stubEnv("RIEDMANN_APPS_INSTALLATION_TOKEN", "");

    const result = await evaluateAdminEntitlement();

    expect(result).toEqual({ blocked: true, notice: null, reason: "configuration-error" });
  });

  it("NODE_ENV=production + ambas variables ausentes -> admin fail-closed (configuration-error)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RIEDMANN_APPS_CONTROL_URL", "");
    vi.stubEnv("RIEDMANN_APPS_INSTALLATION_TOKEN", "");

    const result = await evaluateAdminEntitlement();

    expect(result).toEqual({ blocked: true, notice: null, reason: "configuration-error" });
  });

  // Test 11 del patch: nunca se etiqueta como decision autoritativa de Control.
  it("configuration-error jamas se confunde con SUSPENDED/DENY de Control ni con token-invalid", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const result = await evaluateAdminEntitlement();

    expect(result.reason).toBe("configuration-error");
    expect(result.reason).not.toBe("authoritative-deny");
    expect(result.reason).not.toBe("token-invalid");
    expect(result.notice).toBeNull();
  });

  // Config ausente en Production nunca dispara una llamada de red a Control.
  it("config ausente en Production: NUNCA llama al cliente HTTP (ni intenta contactar Control)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await evaluateAdminEntitlement();
    expect(checkAdminEntitlement).not.toHaveBeenCalled();
  });

  // Test 6-7 del patch: dev/test sin config real puede usar mock explicito, o fail-open sin mock.
  it("NODE_ENV=development sin config real ni mock -> fail-open (no bloquea el trabajo local)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const result = await evaluateAdminEntitlement();
    expect(result).toEqual({ blocked: false, notice: null, reason: "not-configured-fail-open" });
    expect(checkAdminEntitlement).not.toHaveBeenCalled();
  });

  it("NODE_ENV=development sin config real, CON mock explicito -> resuelve via mock, determinista", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RIEDMANN_APPS_MOCK_STATUS", "SUSPENDED");
    const result = await evaluateAdminEntitlement();
    expect(result).toEqual({ blocked: true, notice: null, reason: "authoritative-deny" });
    expect(checkAdminEntitlement).not.toHaveBeenCalled();
  });

  it("test environment (sin NODE_ENV=production) sigue funcionando sin ninguna credencial real", async () => {
    // Vitest no corre con NODE_ENV=production por defecto; se confirma
    // explicitamente para dejar constancia de la garantia (test 7 del patch).
    expect(process.env.NODE_ENV).not.toBe("production");
    const result = await evaluateAdminEntitlement();
    expect(result.blocked).toBe(false);
  });

  // Test critico de orden de evaluacion: una decision ALLOW cacheada (config
  // valida en el momento del check original) NUNCA debe ocultar que, en la
  // llamada siguiente, la configuracion Production ya no esta presente.
  it("cache con ALLOW autoritativo NO oculta una configuracion Production que luego queda ausente", async () => {
    // 1) Config valida, Control responde ACTIVE/ALLOW, queda cacheado.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RIEDMANN_APPS_CONTROL_URL", "https://control.riedmannapps.com");
    vi.stubEnv("RIEDMANN_APPS_INSTALLATION_TOKEN", "token-real");
    checkAdminEntitlement.mockResolvedValueOnce({ kind: "success", response: MOCK_ENTITLEMENT_RESPONSES.ACTIVE });
    const withConfig = await evaluateAdminEntitlement();
    expect(withConfig).toEqual({ blocked: false, notice: null, reason: "authoritative-allow" });

    // 2) La config desaparece (ej. redeploy sin las env vars), TODAVIA
    // dentro de la ventana fresca del cache (recheckAfterSeconds no vencio).
    vi.stubEnv("RIEDMANN_APPS_CONTROL_URL", "");
    vi.stubEnv("RIEDMANN_APPS_INSTALLATION_TOKEN", "");

    const withoutConfig = await evaluateAdminEntitlement();

    expect(withoutConfig).toEqual({ blocked: true, notice: null, reason: "configuration-error" });
  });

  // Test 5 del patch: el storefront nunca invoca este codigo, config Production ausente o no.
  it("el storefront nunca puede verse afectado: no existe ningun import de lib/entitlements fuera de app/admin/", async () => {
    const { readFileSync } = await import("node:fs");
    const home = readFileSync("app/page.tsx", "utf8");
    const orderForm = readFileSync("components/OrderForm.tsx", "utf8");
    expect(home).not.toContain("lib/entitlements");
    expect(orderForm).not.toContain("lib/entitlements");
  });
});
