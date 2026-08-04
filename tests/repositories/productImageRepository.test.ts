import { beforeEach, describe, expect, it, vi } from "vitest";

const { isSupabaseConfigured } = vi.hoisted(() => ({
  isSupabaseConfigured: vi.fn(() => true)
}));
const { upload, download, remove } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- firma de supabase-js .upload(), solo para tipar mock.calls en las pruebas.
  upload: vi.fn() as any,
  download: vi.fn(),
  remove: vi.fn(async () => ({ data: null, error: null }))
}));
const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(() => ({
    storage: { from: () => ({ upload, download, remove, getPublicUrl: () => ({ data: { publicUrl: "" } }) }) }
  }))
}));

vi.mock("@/lib/env", () => ({ isSupabaseConfigured }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));

import { getProductImageRepository } from "@/repositories/productImageRepository";

/**
 * Evidencia real (runtime probe contra Vercel, ver services/productImageService.ts):
 * entregar un Node Buffer TAL CUAL a supabase-js `.upload()` alteraba tamano y
 * SHA-256 del objeto guardado dentro del runtime real de Vercel; un Uint8Array
 * (o ArrayBuffer/Blob) con la misma copia de bytes se conservaba identico. Estas
 * pruebas fijan el contrato: el repositorio SIEMPRE convierte con
 * Uint8Array.from(buffer) antes de subir, nunca reutiliza buffer.buffer.
 */
describe("SupabaseProductImageRepository.subir", () => {
  beforeEach(() => {
    isSupabaseConfigured.mockReturnValue(true);
    upload.mockClear();
    upload.mockResolvedValue({ data: { path: "ok" }, error: null });
    download.mockReset();
    remove.mockClear();
  });

  it("convierte el Buffer a Uint8Array antes de llamar a storage.upload (no reutiliza el Buffer original)", async () => {
    const repo = getProductImageRepository();
    const buffer = Buffer.from([1, 2, 3, 4, 5]);

    await repo.subir({ path: "products/p1/x.webp", buffer, contentType: "image/webp" });

    expect(upload).toHaveBeenCalledTimes(1);
    const [, payload] = upload.mock.calls[0];
    expect(payload).toBeInstanceOf(Uint8Array);
    expect(payload).not.toBeInstanceOf(Buffer);
    expect(payload).not.toBe(buffer);
  });

  it("el Uint8Array enviado tiene exactamente el mismo byteLength y contenido que el Buffer original", async () => {
    const repo = getProductImageRepository();
    const original = [10, 20, 30, 255, 0, 128, 64];
    const buffer = Buffer.from(original);

    await repo.subir({ path: "products/p1/x.webp", buffer, contentType: "image/webp" });

    const [, payload] = upload.mock.calls[0] as [string, Uint8Array];
    expect(payload.byteLength).toBe(buffer.length);
    expect(Array.from(payload)).toEqual(original);
  });

  it(
    "un Buffer creado con subarray (byteOffset != 0, comparte un ArrayBuffer mas grande) " +
      "no arrastra bytes ajenos al convertir con Uint8Array.from",
    async () => {
      const repo = getProductImageRepository();
      const backing = Buffer.alloc(100, 0xaa);
      const sliced = backing.subarray(20, 40);
      sliced.fill(0x42);

      await repo.subir({ path: "products/p1/x.webp", buffer: sliced, contentType: "image/webp" });

      const [, payload] = upload.mock.calls[0] as [string, Uint8Array];
      expect(payload.byteLength).toBe(20);
      expect(Array.from(payload)).toEqual(new Array(20).fill(0x42));
      // Ninguno de los 80 bytes 0xAA del backing buffer debe aparecer en el payload.
      expect(Array.from(payload).some((b) => b === 0xaa)).toBe(false);
    }
  );

  it("nunca usa buffer.buffer directamente (el ArrayBuffer subyacente completo del pool de Node)", async () => {
    const repo = getProductImageRepository();
    // Un Buffer chico creado con Buffer.from(array) puede compartir el pool
    // interno de Node (ArrayBuffer mucho mas grande que el propio buffer).
    const buffer = Buffer.from([7, 8, 9]);

    await repo.subir({ path: "products/p1/x.webp", buffer, contentType: "image/webp" });

    const [, payload] = upload.mock.calls[0] as [string, Uint8Array];
    expect(payload.byteLength).toBe(3);
    expect(payload.buffer.byteLength).not.toBeGreaterThan(buffer.buffer.byteLength);
  });

  it("sube con cacheControl de un año y respeta el contentType/upsert solicitados", async () => {
    const repo = getProductImageRepository();
    await repo.subir({ path: "products/p1/x.webp", buffer: Buffer.from([1]), contentType: "image/webp" });

    const [, , options] = upload.mock.calls[0];
    expect(options).toMatchObject({ contentType: "image/webp", cacheControl: "31536000", upsert: false });
  });
});

describe("SupabaseProductImageRepository.descargar", () => {
  beforeEach(() => {
    isSupabaseConfigured.mockReturnValue(true);
    download.mockReset();
  });

  it("devuelve un Buffer con los mismos bytes que entrega Storage", async () => {
    const bytes = [1, 2, 3, 4];
    download.mockResolvedValueOnce({
      data: { arrayBuffer: async () => new Uint8Array(bytes).buffer },
      error: null
    });

    const repo = getProductImageRepository();
    const result = await repo.descargar("products/p1/x.webp");

    expect(result).toBeInstanceOf(Buffer);
    expect(Array.from(result)).toEqual(bytes);
  });

  it("lanza si Storage devuelve error", async () => {
    download.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
    const repo = getProductImageRepository();
    await expect(repo.descargar("products/p1/x.webp")).rejects.toThrow();
  });
});

describe("Uint8Array.from sobre un Buffer.subarray (documenta por que la conversion es segura)", () => {
  it("copia solo los bytes logicos del slice, no el ArrayBuffer subyacente completo", () => {
    const backing = Buffer.alloc(100);
    const sliced = backing.subarray(20, 40);
    const uploadBytes = Uint8Array.from(sliced);

    expect(uploadBytes.byteLength).toBe(20);
    expect(uploadBytes.buffer.byteLength).toBe(20); // ArrayBuffer propio, no el de 100 bytes del backing
  });
});
