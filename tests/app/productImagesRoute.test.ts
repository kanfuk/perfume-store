import { beforeEach, describe, expect, it, vi } from "vitest";

const { isSupabaseConfigured } = vi.hoisted(() => ({
  isSupabaseConfigured: vi.fn(() => true)
}));
const { download } = vi.hoisted(() => ({ download: vi.fn() }));
const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(() => ({
    storage: { from: () => ({ download }) }
  }))
}));

vi.mock("@/lib/env", () => ({ isSupabaseConfigured }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));

import { GET, HEAD } from "@/app/api/product-images/[...path]/route";

/**
 * QA manual confirmo que servir la URL publica de Supabase directamente al
 * navegador (aun con `unoptimized`) seguia fallando: el navegador seguia
 * dependiendo de una carga cruzada contra Supabase Storage/Cloudflare. Esta
 * ruta es la unica forma same-origin de servir el bucket administrado --
 * descarga el objeto en el SERVIDOR (credencial nunca expuesta al cliente) y
 * devuelve sus bytes reales, sin redirect.
 */
function ctx(segments: string[]) {
  return { params: Promise.resolve({ path: segments }) };
}

const REQUEST = new Request("http://localhost/api/product-images/x");
const VALID_SEGMENTS = ["products", "producto-1", "uuid-abc.webp"];

function fakeBlob(bytes: number[]) {
  return { arrayBuffer: async () => new Uint8Array(bytes).buffer };
}

/** Cabecera RIFF/WEBP minima valida (12 bytes) mas relleno arbitrario, para pruebas de exito. */
function validWebpBytes(...extra: number[]) {
  return [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, ...extra];
}

describe("GET/HEAD /api/product-images/[...path]", () => {
  beforeEach(() => {
    isSupabaseConfigured.mockReset();
    isSupabaseConfigured.mockReturnValue(true);
    createSupabaseServerClient.mockClear();
    download.mockReset();
  });

  describe("GET", () => {
    it("200 con los bytes reales del objeto y headers correctos para un path administrado valido", async () => {
      const bytes = validWebpBytes(1, 2, 3, 4);
      download.mockResolvedValueOnce({ data: fakeBlob(bytes), error: null });
      const response = await GET(REQUEST, ctx(VALID_SEGMENTS));

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("image/webp");
      expect(response.headers.get("Content-Length")).toBe(String(bytes.length));
      expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");

      const body = new Uint8Array(await response.arrayBuffer());
      expect(Array.from(body)).toEqual(bytes);
    });

    it("404 con Cache-Control: no-store si el objeto almacenado no tiene cabecera RIFF/WEBP valida (corrupto)", async () => {
      // Bytes de reemplazo UTF-8 (EF BF BD) donde deberia ir la cabecera RIFF/WEBP -- mismo patron detectado en Storage.
      download.mockResolvedValueOnce({
        data: fakeBlob([0x52, 0x49, 0x46, 0x46, 0xef, 0xbf, 0xbd, 0xef, 0xbf, 0xbd, 0x01, 0x00]),
        error: null
      });
      const response = await GET(REQUEST, ctx(VALID_SEGMENTS));
      expect(response.status).toBe(404);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("Content-Type")).not.toBe("image/webp");
    });

    it("404 si el objeto es demasiado corto para tener cabecera RIFF/WEBP", async () => {
      download.mockResolvedValueOnce({ data: fakeBlob([1, 2, 3]), error: null });
      const response = await GET(REQUEST, ctx(VALID_SEGMENTS));
      expect(response.status).toBe(404);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    });

    it("descarga del bucket product-images con el path exacto reconstruido de los segmentos", async () => {
      download.mockResolvedValueOnce({ data: fakeBlob(validWebpBytes()), error: null });
      await GET(REQUEST, ctx(VALID_SEGMENTS));
      expect(download).toHaveBeenCalledWith("products/producto-1/uuid-abc.webp");
    });

    it("nunca redirige (sin Location, nunca 3xx)", async () => {
      download.mockResolvedValueOnce({ data: fakeBlob(validWebpBytes(1)), error: null });
      const response = await GET(REQUEST, ctx(VALID_SEGMENTS));
      expect(response.headers.get("Location")).toBeNull();
      expect(response.status).toBeLessThan(300);
    });

    it("400 con path vacio (sin segmentos)", async () => {
      const response = await GET(REQUEST, ctx([]));
      expect(response.status).toBe(400);
      expect(download).not.toHaveBeenCalled();
    });

    it("400 con traversal (..)", async () => {
      const response = await GET(REQUEST, ctx(["products", "..", "uuid.webp"]));
      expect(response.status).toBe(400);
      expect(download).not.toHaveBeenCalled();
    });

    it("400 con backslash", async () => {
      const response = await GET(REQUEST, ctx(["products", "a\\b", "uuid.webp"]));
      expect(response.status).toBe(400);
      expect(download).not.toHaveBeenCalled();
    });

    it("400 con un bucket/prefijo distinto de products", async () => {
      const response = await GET(REQUEST, ctx(["otro-bucket", "producto-1", "uuid.webp"]));
      expect(response.status).toBe(400);
      expect(download).not.toHaveBeenCalled();
    });

    it("400 con extension no admitida", async () => {
      const response = await GET(REQUEST, ctx(["products", "producto-1", "uuid.png"]));
      expect(response.status).toBe(400);
      expect(download).not.toHaveBeenCalled();
    });

    it("404 si el objeto no existe en Storage", async () => {
      download.mockResolvedValueOnce({ data: null, error: { message: "Object not found" } });
      const response = await GET(REQUEST, ctx(VALID_SEGMENTS));
      expect(response.status).toBe(404);
    });

    it("404 si Supabase no esta configurado (sin credenciales), sin intentar crear el cliente", async () => {
      isSupabaseConfigured.mockReturnValue(false);
      const response = await GET(REQUEST, ctx(VALID_SEGMENTS));
      expect(response.status).toBe(404);
      expect(createSupabaseServerClient).not.toHaveBeenCalled();
    });

    it("500 generico ante un error inesperado, sin exponer detalles de Supabase", async () => {
      download.mockRejectedValueOnce(new Error("raw supabase secret leak XYZ-123"));
      const response = await GET(REQUEST, ctx(VALID_SEGMENTS));
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).not.toMatch(/supabase/i);
      expect(body.error).not.toMatch(/XYZ-123/);
    });
  });

  describe("HEAD", () => {
    it("200 con los mismos headers que GET pero sin cuerpo", async () => {
      download.mockResolvedValueOnce({ data: fakeBlob(validWebpBytes(9, 9)), error: null });
      const response = await HEAD(REQUEST, ctx(VALID_SEGMENTS));
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("image/webp");
      expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
      const body = await response.arrayBuffer();
      expect(body.byteLength).toBe(0);
    });

    it("400 con path invalido", async () => {
      const response = await HEAD(REQUEST, ctx(["..", "x", "y.webp"]));
      expect(response.status).toBe(400);
    });

    it("404 si no existe", async () => {
      download.mockResolvedValueOnce({ data: null, error: { message: "nope" } });
      const response = await HEAD(REQUEST, ctx(VALID_SEGMENTS));
      expect(response.status).toBe(404);
    });

    it("404 con Cache-Control: no-store si el objeto almacenado esta corrupto", async () => {
      download.mockResolvedValueOnce({ data: fakeBlob([0xef, 0xbf, 0xbd]), error: null });
      const response = await HEAD(REQUEST, ctx(VALID_SEGMENTS));
      expect(response.status).toBe(404);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    });
  });

  describe("metodos no permitidos", () => {
    it("el modulo solo exporta GET y HEAD (Next.js responde 405 automaticamente para el resto)", async () => {
      const routeModule = await import("@/app/api/product-images/[...path]/route");
      expect(typeof routeModule.GET).toBe("function");
      expect(typeof routeModule.HEAD).toBe("function");
      expect((routeModule as Record<string, unknown>).POST).toBeUndefined();
      expect((routeModule as Record<string, unknown>).PUT).toBeUndefined();
      expect((routeModule as Record<string, unknown>).DELETE).toBeUndefined();
      expect((routeModule as Record<string, unknown>).PATCH).toBeUndefined();
    });
  });
});
