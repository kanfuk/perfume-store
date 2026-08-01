import { afterEach, describe, expect, it } from "vitest";
import type { SafeImageCandidate } from "@/lib/image-assistant/types";
import { getSafeImageAllowedDomains, isSafeImageSearchConfigured, signSafeImageCandidate, verifySafeImageCandidate } from "@/lib/image-assistant/source-provider";

const original = {
  endpoint: process.env.SAFE_IMAGE_SEARCH_ENDPOINT,
  apiKey: process.env.SAFE_IMAGE_SEARCH_API_KEY,
  signing: process.env.SAFE_IMAGE_CANDIDATE_SIGNING_SECRET,
  domains: process.env.SAFE_IMAGE_ALLOWED_DOMAINS
};
afterEach(() => {
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  restore("SAFE_IMAGE_SEARCH_ENDPOINT", original.endpoint);
  restore("SAFE_IMAGE_SEARCH_API_KEY", original.apiKey);
  restore("SAFE_IMAGE_CANDIDATE_SIGNING_SECRET", original.signing);
  restore("SAFE_IMAGE_ALLOWED_DOMAINS", original.domains);
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

describe("safe image source provider", () => {
  it("exige proveedor, credencial, firma y allowlist a la vez", () => {
    delete process.env.SAFE_IMAGE_SEARCH_ENDPOINT;
    expect(isSafeImageSearchConfigured()).toBe(false);
    process.env.SAFE_IMAGE_SEARCH_ENDPOINT = "https://provider.example/search";
    process.env.SAFE_IMAGE_SEARCH_API_KEY = "test-api-key";
    process.env.SAFE_IMAGE_CANDIDATE_SIGNING_SECRET = "test-signing-secret";
    process.env.SAFE_IMAGE_ALLOWED_DOMAINS = "images.brand.example";
    expect(isSafeImageSearchConfigured()).toBe(true);
  });
  it("normaliza dominios exactos sin habilitar sufijos implícitos", () => {
    process.env.SAFE_IMAGE_ALLOWED_DOMAINS = " IMAGES.BRAND.EXAMPLE.,cdn.brand.example ";
    expect([...getSafeImageAllowedDomains()]).toEqual(["images.brand.example", "cdn.brand.example"]);
  });
  it("firma y valida el candidato sin exponer el secreto", () => {
    process.env.SAFE_IMAGE_CANDIDATE_SIGNING_SECRET = "test-signing-secret";
    const signed = { ...candidate, token: signSafeImageCandidate(candidate) };
    expect(verifySafeImageCandidate(signed)).toBe(true);
  });
  it("invalida la firma si el navegador altera URL o metadata", () => {
    process.env.SAFE_IMAGE_CANDIDATE_SIGNING_SECRET = "test-signing-secret";
    const signed = { ...candidate, token: signSafeImageCandidate(candidate) };
    expect(verifySafeImageCandidate({ ...signed, content: "50ML" })).toBe(false);
    expect(verifySafeImageCandidate({ ...signed, sourceUrl: "https://images.brand.example/other.jpg" })).toBe(false);
  });
});
