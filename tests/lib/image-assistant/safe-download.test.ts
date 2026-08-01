import { describe, expect, it } from "vitest";
import { PRODUCT_IMAGE_CONFIG } from "@/lib/product-image-config";
import {
  SafeImageDownloadError,
  isPublicIpAddress,
  parseAndValidateSourceUrl,
  resolveRedirectLocation,
  resolveSafeSourceUrl,
  validateImageEnvelope
} from "@/lib/image-assistant/safe-download";

const allowed = new Set(["images.brand.example"]);

describe("safe image download guards", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.2", "169.254.169.254", "::1", "fd00::1", "fe80::1"])("rechaza IP privada/local %s", (ip) => expect(isPublicIpAddress(ip)).toBe(false));
  it("acepta una IP pública", () => expect(isPublicIpAddress("8.8.8.8")).toBe(true));
  it.each(["http://images.brand.example/a.jpg", "https://localhost/a.jpg", "https://127.0.0.1/a.jpg", "https://user:pass@images.brand.example/a.jpg", "https://images.brand.example:8443/a.jpg", "https://images.brand.example.attacker.test/a.jpg"])("rechaza URL insegura %s", (url) => expect(() => parseAndValidateSourceUrl(url, allowed)).toThrow(SafeImageDownloadError));
  it("valida todos los resultados DNS, no solo el primero", async () => {
    await expect(resolveSafeSourceUrl("https://images.brand.example/a.jpg", allowed, async () => [{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.1", family: 4 }])).rejects.toMatchObject({ code: "UNSAFE_DNS" });
  });
  it("rechaza redirect fuera de allowlist", () => expect(() => resolveRedirectLocation(new URL("https://images.brand.example/a"), "https://evil.example/a", allowed)).toThrow(SafeImageDownloadError));
  it("rechaza URLs privadas firmadas por querystring", () => expect(() => parseAndValidateSourceUrl("https://images.brand.example/a.jpg?token=secret", allowed)).toThrow(SafeImageDownloadError));
  it("acepta redirect relativo dentro del mismo dominio", () => expect(resolveRedirectLocation(new URL("https://images.brand.example/a"), "/b", allowed).toString()).toBe("https://images.brand.example/b"));
  it("rechaza MIME falso aunque la extensión parezca imagen", () => expect(() => validateImageEnvelope(Buffer.from("not an image"), "image/jpeg")).toThrowError(expect.objectContaining({ code: "INVALID_MAGIC_BYTES" })));
  it("rechaza Content-Type no permitido", () => expect(() => validateImageEnvelope(Buffer.from("<svg/>"), "image/svg+xml")).toThrowError(expect.objectContaining({ code: "INVALID_MIME" })));
  it("rechaza tamaño declarado mayor a 10 MiB antes de decodificar", () => expect(() => validateImageEnvelope(Buffer.from([0xff, 0xd8, 0xff]), "image/jpeg", PRODUCT_IMAGE_CONFIG.maxInputBytes + 1)).toThrowError(expect.objectContaining({ code: "TOO_LARGE" })));
  it("acepta magic bytes JPEG coherentes", () => expect(validateImageEnvelope(Buffer.from([0xff, 0xd8, 0xff, 0x00]), "image/jpeg")).toBe("image/jpeg"));
});
