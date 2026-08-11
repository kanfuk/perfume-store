import { afterEach, describe, expect, it } from "vitest";
import {
  getCachedEntitlement,
  isCacheEntryFresh,
  resetEntitlementCacheForTests,
  setCachedEntitlement
} from "@/lib/entitlements/cache";
import { MOCK_ENTITLEMENT_RESPONSES } from "@/lib/entitlements/mock";

describe("entitlements/cache", () => {
  afterEach(() => {
    resetEntitlementCacheForTests();
  });

  it("no hay entrada cacheada al inicio", () => {
    expect(getCachedEntitlement()).toBeNull();
  });

  it("guarda y recupera una entrada autoritativa", () => {
    setCachedEntitlement({ response: MOCK_ENTITLEMENT_RESPONSES.ACTIVE, source: "authoritative", recheckAfterSeconds: 60 });
    const entry = getCachedEntitlement();
    expect(entry?.source).toBe("authoritative");
    expect(entry?.response).toEqual(MOCK_ENTITLEMENT_RESPONSES.ACTIVE);
  });

  it("isCacheEntryFresh es true mientras no haya pasado recheckAfterSeconds", () => {
    const now = 1_000_000;
    setCachedEntitlement({ response: MOCK_ENTITLEMENT_RESPONSES.ACTIVE, source: "authoritative", recheckAfterSeconds: 60 }, now);
    const entry = getCachedEntitlement()!;
    expect(isCacheEntryFresh(entry, now)).toBe(true);
    expect(isCacheEntryFresh(entry, now + 59_000)).toBe(true);
  });

  it("isCacheEntryFresh es false exactamente al cumplirse recheckAfterSeconds (TTL, seccion 12)", () => {
    const now = 1_000_000;
    setCachedEntitlement({ response: MOCK_ENTITLEMENT_RESPONSES.ACTIVE, source: "authoritative", recheckAfterSeconds: 60 }, now);
    const entry = getCachedEntitlement()!;
    expect(isCacheEntryFresh(entry, now + 60_000)).toBe(false);
    expect(isCacheEntryFresh(entry, now + 120_000)).toBe(false);
  });

  it("setCachedEntitlement sobreescribe la entrada anterior (una sola entrada por scope ADMIN)", () => {
    setCachedEntitlement({ response: MOCK_ENTITLEMENT_RESPONSES.ACTIVE, source: "authoritative", recheckAfterSeconds: 60 });
    setCachedEntitlement({ response: MOCK_ENTITLEMENT_RESPONSES.SUSPENDED, source: "authoritative", recheckAfterSeconds: 60 });
    expect(getCachedEntitlement()?.response).toEqual(MOCK_ENTITLEMENT_RESPONSES.SUSPENDED);
  });

  it("nunca guarda el installation token dentro de la entrada cacheada", () => {
    setCachedEntitlement({ response: MOCK_ENTITLEMENT_RESPONSES.ACTIVE, source: "authoritative", recheckAfterSeconds: 60 });
    const serialized = JSON.stringify(getCachedEntitlement());
    expect(serialized).not.toMatch(/token/i);
    expect(serialized).not.toMatch(/bearer/i);
    expect(serialized).not.toMatch(/authorization/i);
  });

  it("resetEntitlementCacheForTests limpia el estado entre pruebas", () => {
    setCachedEntitlement({ response: MOCK_ENTITLEMENT_RESPONSES.ACTIVE, source: "authoritative", recheckAfterSeconds: 60 });
    resetEntitlementCacheForTests();
    expect(getCachedEntitlement()).toBeNull();
  });
});
