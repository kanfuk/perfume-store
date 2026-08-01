import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SafeImageCandidate } from "@/lib/image-assistant/types";
import {
  BraveImageSearchProvider,
  getImageAssistantHealth,
  getSafeImageAllowedDomains,
  isSafeImageSearchConfigured,
  resolveAllowedDomainConfigs,
  signSafeImageCandidate,
  verifySafeImageCandidate
} from "@/lib/image-assistant/source-provider";

const ENV_KEYS = [
  "BRAVE_SEARCH_API_KEY",
  "IMAGE_ASSISTANT_SIGNING_SECRET",
  "IMAGE_ASSISTANT_ALLOWED_DOMAINS",
  "IMAGE_ASSISTANT_SEARCH_ENABLED",
  "IMAGE_ASSISTANT_BATCH_ENABLED"
] as const;
const original = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

beforeEach(() => {
  process.env.BRAVE_SEARCH_API_KEY = "test-only-key";
  process.env.IMAGE_ASSISTANT_SIGNING_SECRET = "test-only-signing";
  process.env.IMAGE_ASSISTANT_ALLOWED_DOMAINS = "brand.example,images.brand.example";
  process.env.IMAGE_ASSISTANT_SEARCH_ENABLED = "true";
  process.env.IMAGE_ASSISTANT_BATCH_ENABLED = "false";
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const key of ENV_KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

const candidate: SafeImageCandidate = {
  sourceUrl: "https://images.brand.example/product.jpg",
  sourceDomain: "images.brand.example",
  authority: "OFFICIAL_BRAND",
  brand: "Brand",
  name: "Product EDP",
  concentration: "edp",
  content: "100ML",
  imageRole: "PRODUCT"
};

function braveResponse(status = 200) {
  return new Response(JSON.stringify({ results: [{
    title: "Brand Product EDP 100ML bottle",
    url: "https://brand.example/products/product",
    properties: { url: "https://images.brand.example/product.jpg", width: 900, height: 900 },
    thumbnail: { src: "https://thumb.search.example/product.jpg" }
  }] }), { status, headers: { "Content-Type": "application/json" } });
}

describe("Brave image source provider", () => {
  it("no infiere el gate desde la API key", () => {
    process.env.IMAGE_ASSISTANT_SEARCH_ENABLED = "false";
    expect(isSafeImageSearchConfigured()).toBe(false);
    expect(new BraveImageSearchProvider().isConfigured()).toBe(true);
  });

  it("devuelve health check con sólo booleanos y sin secretos", () => {
    const health = getImageAssistantHealth();
    expect(Object.keys(health)).toEqual([
      "providerConfigured", "signingSecretConfigured", "allowedDomainsConfigured", "searchEnabled", "batchEnabled"
    ]);
    expect(Object.values(health).every((value) => typeof value === "boolean")).toBe(true);
    expect(JSON.stringify(health)).not.toContain("test-only-key");
  });

  it("rechaza wildcard y dominio deshabilitado", () => {
    expect(resolveAllowedDomainConfigs("*.brand.example,brand.example")).toHaveLength(1);
    expect(resolveAllowedDomainConfigs("brand.example", [{
      domain: "brand.example", type: "OFFICIAL_BRAND", enabled: false, notes: "Pendiente"
    }])[0].enabled).toBe(false);
  });

  it("normaliza sólo dominios exactos", () => {
    process.env.IMAGE_ASSISTANT_ALLOWED_DOMAINS = " IMAGES.BRAND.EXAMPLE.,cdn.brand.example ";
    expect([...getSafeImageAllowedDomains()]).toEqual(["images.brand.example", "cdn.brand.example"]);
  });

  it("normaliza Brave y mantiene sourcePageUrl distinta de imageUrl", async () => {
    const fetcher = vi.fn().mockResolvedValue(braveResponse());
    const results = await new BraveImageSearchProvider(fetcher).searchImages("Brand Product", { limit: 3 });
    expect(results).toEqual([expect.objectContaining({
      sourcePageUrl: "https://brand.example/products/product",
      imageUrl: "https://images.brand.example/product.jpg",
      thumbnailUrl: "https://thumb.search.example/product.jpg",
      sourceDomain: "brand.example", width: 900, height: 900
    })]);
    const [requestUrl, requestInit] = fetcher.mock.calls[0];
    expect(String(requestUrl)).toContain("api.search.brave.com/res/v1/images/search");
    expect(JSON.stringify(requestInit)).not.toContain("BRAVE_SEARCH_API_KEY");
  });

  it.each([401, 403])("sanitiza %s sin reintentar", async (status) => {
    const fetcher = vi.fn().mockResolvedValue(braveResponse(status));
    await expect(new BraveImageSearchProvider(fetcher).searchImages("Brand Product")).rejects.toThrow("autenticación");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([429, 500, 503])("reintenta una sola vez para %s", async (status) => {
    const fetcher = vi.fn().mockResolvedValue(braveResponse(status));
    await expect(new BraveImageSearchProvider(fetcher).searchImages("Brand Product")).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("aborta por timeout y reintenta sólo una vez", async () => {
    const fetcher = vi.fn((_url: URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    await expect(new BraveImageSearchProvider(fetcher as typeof fetch).searchImages("Brand Product", { timeoutMs: 1 }))
      .rejects.toThrow("tiempo de espera");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("firma y detecta alteraciones sin exponer el secreto", () => {
    const signed = { ...candidate, token: signSafeImageCandidate(candidate) };
    expect(verifySafeImageCandidate(signed)).toBe(true);
    expect(verifySafeImageCandidate({ ...signed, content: "50ML" })).toBe(false);
  });
});
