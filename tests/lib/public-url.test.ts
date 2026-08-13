import { describe, expect, it } from "vitest";
import {
  getAdminUrl,
  getStorefrontUrl,
  resolvePublicOrigin
} from "@/lib/public-url";

describe("URL publica estable", () => {
  it("usa el alias estable cuando no hay dominio personalizado configurado", () => {
    expect(resolvePublicOrigin()).toBe("https://smellme-store.vercel.app");
    expect(getStorefrontUrl()).toBe("https://smellme-store.vercel.app/");
    expect(getAdminUrl()).toBe("https://smellme-store.vercel.app/admin");
    expect(getAdminUrl("/admin/pedidos")).toBe(
      "https://smellme-store.vercel.app/admin/pedidos"
    );
    expect(getAdminUrl("pedidos")).toBe(
      "https://smellme-store.vercel.app/admin/pedidos"
    );
    expect(getAdminUrl("//preview.example/admin")).toBe(
      "https://smellme-store.vercel.app/admin/preview.example/admin"
    );
  });

  it.each([
    "https://perfume-store-abc123.vercel.app",
    "https://otra-preview.vercel.app",
    "http://smellme.cl",
    "javascript:alert(1)"
  ])("rechaza Preview, URLs antiguas o inseguras: %s", (candidate) => {
    expect(resolvePublicOrigin(candidate)).toBe("https://smellme-store.vercel.app");
  });

  it("acepta un dominio publico HTTPS cuando este se configura deliberadamente", () => {
    expect(resolvePublicOrigin("https://smellme.cl/otra-ruta")).toBe("https://smellme.cl");
  });
});
