import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

describe("fetchWithTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("devuelve la respuesta y limpia el timeout", async () => {
    const clearTimeout = vi.fn(globalThis.clearTimeout);
    vi.stubGlobal("window", { setTimeout: globalThis.setTimeout, clearTimeout });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    expect((await fetchWithTimeout("/api/test", {}, 100)).status).toBe(200);
    expect(clearTimeout).toHaveBeenCalledOnce();
  });

  it("aborta una solicitud que supera el límite", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout });
    vi.stubGlobal("fetch", vi.fn((_input: unknown, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    })));
    const request = fetchWithTimeout("/api/test", {}, 100);
    const rejection = expect(request).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(101);
    await rejection;
  });
});
