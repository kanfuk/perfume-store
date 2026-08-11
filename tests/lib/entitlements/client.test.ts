import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkAdminEntitlement } from "@/lib/entitlements/client";
import { MOCK_ENTITLEMENT_RESPONSES } from "@/lib/entitlements/mock";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("entitlements/client - checkAdminEntitlement", () => {
  beforeEach(() => {
    vi.stubEnv("RIEDMANN_APPS_CONTROL_URL", "https://control.riedmannapps.com");
    vi.stubEnv("RIEDMANN_APPS_INSTALLATION_TOKEN", "installation-token-de-prueba");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("kind=not-configured si falta la config, y NUNCA intenta fetch", async () => {
    vi.unstubAllEnvs();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await checkAdminEntitlement();

    expect(result).toEqual({ kind: "not-configured" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("200 + body valido -> kind=success con el response parseado", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, MOCK_ENTITLEMENT_RESPONSES.ACTIVE)));

    const result = await checkAdminEntitlement();

    expect(result).toEqual({ kind: "success", response: MOCK_ENTITLEMENT_RESPONSES.ACTIVE });
  });

  it("envia Authorization Bearer + Content-Type json + body {scope, appVersion} al endpoint correcto", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(200, MOCK_ENTITLEMENT_RESPONSES.ACTIVE));
    vi.stubGlobal("fetch", fetchSpy);

    await checkAdminEntitlement();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://control.riedmannapps.com/api/v1/entitlements/check");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer installation-token-de-prueba");
    expect(headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body as string);
    expect(body.scope).toBe("ADMIN");
    expect(Object.keys(body).sort()).toEqual(["appVersion", "scope"]);
  });

  it("401 -> kind=unauthorized (fail closed, no es dependency-error)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));
    expect(await checkAdminEntitlement()).toEqual({ kind: "unauthorized" });
  });

  it("429 -> dependency-error http-error, nunca DENY", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 429 })));
    expect(await checkAdminEntitlement()).toEqual({ kind: "dependency-error", reason: "http-error", httpStatus: 429 });
  });

  it.each([500, 502, 503, 504])("%i -> dependency-error http-error", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status })));
    expect(await checkAdminEntitlement()).toEqual({ kind: "dependency-error", reason: "http-error", httpStatus: status });
  });

  it("200 con JSON invalido -> dependency-error malformed-response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no es json {{{", { status: 200 }))
    );
    expect(await checkAdminEntitlement()).toEqual({
      kind: "dependency-error",
      reason: "malformed-response",
      httpStatus: 200
    });
  });

  it("200 con JSON valido pero que no cumple el contrato -> dependency-error malformed-response (nunca DENY)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, { decision: "MAYBE" })));
    expect(await checkAdminEntitlement()).toEqual({
      kind: "dependency-error",
      reason: "malformed-response",
      httpStatus: 200
    });
  });

  it("200 con body absurdamente grande -> dependency-error malformed-response (limite defensivo)", async () => {
    const hugeBody = "x".repeat(50_000);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(hugeBody, { status: 200 })));
    expect(await checkAdminEntitlement()).toEqual({
      kind: "dependency-error",
      reason: "malformed-response",
      httpStatus: 200
    });
  });

  it("error de red (fetch rechaza) -> dependency-error reason=network", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("getaddrinfo ENOTFOUND control.riedmannapps.com");
      })
    );
    expect(await checkAdminEntitlement()).toEqual({ kind: "dependency-error", reason: "network" });
  });

  it("timeout (excede timeoutMs) -> dependency-error reason=timeout, sin dejar el request colgado", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              const abortError = new Error("This operation was aborted");
              abortError.name = "AbortError";
              reject(abortError);
            });
          })
      )
    );

    const pending = checkAdminEntitlement();
    await vi.advanceTimersByTimeAsync(3000);
    const result = await pending;

    expect(result).toEqual({ kind: "dependency-error", reason: "timeout" });
  });
});
