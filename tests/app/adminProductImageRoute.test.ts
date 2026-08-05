import { beforeEach, describe, expect, it, vi } from "vitest";

const { isAdminAuthenticated } = vi.hoisted(() => ({
  isAdminAuthenticated: vi.fn(async () => true)
}));
const { validateTrustedOrigin, validateJsonRequest, validateMultipartRequest } = vi.hoisted(() => ({
  validateTrustedOrigin: vi.fn((): Response | null => null),
  validateJsonRequest: vi.fn((): Response | null => null),
  validateMultipartRequest: vi.fn((): Response | null => null)
}));
const { asignarImagenProducto, obtenerProductoAdminPorId } = vi.hoisted(() => ({
  asignarImagenProducto: vi.fn(),
  obtenerProductoAdminPorId: vi.fn()
}));
const { reemplazarImagenProducto, asignarImagenProductoSiAusente, reemplazarImagenProductoSiCoincide, eliminarImagenProducto } = vi.hoisted(() => ({
  reemplazarImagenProducto: vi.fn(),
  asignarImagenProductoSiAusente: vi.fn(),
  reemplazarImagenProductoSiCoincide: vi.fn(),
  eliminarImagenProducto: vi.fn()
}));

vi.mock("@/lib/admin-auth", () => ({ isAdminAuthenticated }));
vi.mock("@/lib/http-security", () => ({
  validateTrustedOrigin,
  validateJsonRequest,
  validateMultipartRequest
}));
vi.mock("@/services/productoService", () => ({
  createProductoService: () => ({ asignarImagenProducto, obtenerProductoAdminPorId })
}));
vi.mock("@/services/productImageService", async () => {
  const actual = await vi.importActual<typeof import("@/services/productImageService")>(
    "@/services/productImageService"
  );
  return {
    ...actual,
    createProductImageService: () => ({
      reemplazarImagenProducto,
      asignarImagenProductoSiAusente,
      reemplazarImagenProductoSiCoincide,
      eliminarImagenProducto
    })
  };
});

import * as ImageRoute from "@/app/api/admin/products/[productId]/image/route";
import { DELETE, PATCH, POST } from "@/app/api/admin/products/[productId]/image/route";
import { ProductImageServiceError } from "@/services/productImageService";

function ctx(productId = "producto-1") {
  return { params: Promise.resolve({ productId }) };
}

function patchRequest(body: unknown, raw = false) {
  return new Request("http://localhost/api/admin/products/producto-1/image", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: raw ? String(body) : JSON.stringify(body)
  });
}

function multipartRequest(formData: FormData) {
  return new Request("http://localhost/api/admin/products/producto-1/image", {
    method: "POST",
    headers: { Origin: "http://localhost" },
    body: formData
  });
}

function deleteRequest() {
  return new Request("http://localhost/api/admin/products/producto-1/image", {
    method: "DELETE",
    headers: { Origin: "http://localhost" }
  });
}

function makeImageFile(content = "not-a-real-image", type = "image/jpeg", name = "foto.jpg") {
  return new File([content], name, { type });
}

const IMAGE_RESULT = {
  storagePath: "products/producto-1/abc.webp",
  displayUrl: "https://storage.example.com/product-images/products/producto-1/abc.webp",
  width: 800,
  height: 600,
  format: "webp" as const,
  size: 12345,
  producto: { id: "producto-1", imageUrl: "https://storage.example.com/product-images/products/producto-1/abc.webp", imageStoragePath: "products/producto-1/abc.webp" },
  persisted: true as const,
  correlationId: "11111111-1111-4111-8111-111111111111"
};

const ADMIN_RECORD = {
  id: "producto-1",
  sku: "SKU-1",
  nombre: "Perfume de prueba",
  marca: "Marca Test",
  contenido: "100ML",
  precioVenta: 20000,
  costoUnitario: 10000,
  imageUrl: IMAGE_RESULT.displayUrl,
  imageStoragePath: IMAGE_RESULT.storagePath,
  badgeLabel: "PERFUME",
  stockActual: 5,
  stockAgenda: 5,
  stockMinimo: 0,
  activo: true,
  esTop: false,
  esOfertaSemana: false,
  tipoProducto: "simple",
  utilidadUnitaria: 10000,
  modoPrecio: "manual"
};

describe("app/api/admin/products/[productId]/image (Fase 3B.3)", () => {
  it(
    "declara runtime Node.js explicito (usa Buffer/Sharp/Supabase Storage, incompatibles con Edge) " +
      "y dynamic force-dynamic (depende de la sesion admin y del cuerpo de cada peticion)",
    () => {
      expect(ImageRoute.runtime).toBe("nodejs");
      expect(ImageRoute.dynamic).toBe("force-dynamic");
    }
  );

  beforeEach(() => {
    isAdminAuthenticated.mockClear();
    isAdminAuthenticated.mockResolvedValue(true);
    validateTrustedOrigin.mockClear();
    validateTrustedOrigin.mockReturnValue(null);
    validateJsonRequest.mockClear();
    validateJsonRequest.mockReturnValue(null);
    validateMultipartRequest.mockClear();
    validateMultipartRequest.mockReturnValue(null);
    asignarImagenProducto.mockReset();
    asignarImagenProducto.mockResolvedValue({ id: "producto-1", imageUrl: "https://ejemplo.com/a.jpg" });
    reemplazarImagenProducto.mockReset();
    reemplazarImagenProducto.mockResolvedValue(IMAGE_RESULT);
    asignarImagenProductoSiAusente.mockReset();
    asignarImagenProductoSiAusente.mockResolvedValue(IMAGE_RESULT);
    reemplazarImagenProductoSiCoincide.mockReset();
    reemplazarImagenProductoSiCoincide.mockResolvedValue(IMAGE_RESULT);
    eliminarImagenProducto.mockReset();
    eliminarImagenProducto.mockResolvedValue(undefined);
    obtenerProductoAdminPorId.mockReset();
    obtenerProductoAdminPorId.mockResolvedValue(ADMIN_RECORD);
  });

  describe("PATCH (URL avanzada, sin cambios de contrato)", () => {
    it("401 sin sesion", async () => {
      isAdminAuthenticated.mockResolvedValueOnce(false);
      const response = await PATCH(patchRequest({ imageUrl: "https://ejemplo.com/a.jpg" }), ctx());
      expect(response.status).toBe(401);
      expect(asignarImagenProducto).not.toHaveBeenCalled();
    });

    it("200 con sesion valida", async () => {
      const response = await PATCH(patchRequest({ imageUrl: "https://ejemplo.com/a.jpg" }), ctx());
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
    });
  });

  describe("POST (subir/reemplazar)", () => {
    it("401 sin sesion, sin llamar al servicio", async () => {
      isAdminAuthenticated.mockResolvedValueOnce(false);
      const formData = new FormData();
      formData.append("file", makeImageFile());
      const response = await POST(multipartRequest(formData), ctx());
      expect(response.status).toBe(401);
      expect(asignarImagenProductoSiAusente).not.toHaveBeenCalled();
    });

    it("403 con origen invalido", async () => {
      const originResponse = new Response(JSON.stringify({ error: "Origen no permitido." }), {
        status: 403
      });
      validateTrustedOrigin.mockReturnValueOnce(originResponse);
      const formData = new FormData();
      formData.append("file", makeImageFile());
      const response = await POST(multipartRequest(formData), ctx());
      expect(response.status).toBe(403);
      expect(asignarImagenProductoSiAusente).not.toHaveBeenCalled();
    });

    it("415 con content-type invalido (no multipart)", async () => {
      const invalidResponse = new Response(JSON.stringify({ error: "Formato no soportado." }), {
        status: 415
      });
      validateMultipartRequest.mockReturnValueOnce(invalidResponse);
      const formData = new FormData();
      formData.append("file", makeImageFile());
      const response = await POST(multipartRequest(formData), ctx());
      expect(response.status).toBe(415);
      expect(asignarImagenProductoSiAusente).not.toHaveBeenCalled();
    });

    it("400 si el form-data no trae el campo file", async () => {
      const formData = new FormData();
      formData.append("otraCosa", "valor");
      const response = await POST(multipartRequest(formData), ctx());
      expect(response.status).toBe(400);
      expect(asignarImagenProductoSiAusente).not.toHaveBeenCalled();
    });

    it("400 con claves desconocidas en el form-data", async () => {
      const formData = new FormData();
      formData.append("file", makeImageFile());
      formData.append("bucket", "otro-bucket");
      const response = await POST(multipartRequest(formData), ctx());
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toMatch(/Campos no permitidos/);
      expect(asignarImagenProductoSiAusente).not.toHaveBeenCalled();
    });

    it("413 si el archivo supera el tamano maximo", async () => {
      const bigFile = new File([new Uint8Array(11 * 1024 * 1024)], "grande.jpg", {
        type: "image/jpeg"
      });
      const formData = new FormData();
      formData.append("file", bigFile);
      const response = await POST(multipartRequest(formData), ctx());
      expect(response.status).toBe(413);
      expect(asignarImagenProductoSiAusente).not.toHaveBeenCalled();
    });

    it("400 con un MIME declarado fuera de la lista blanca", async () => {
      const formData = new FormData();
      formData.append("file", makeImageFile("<svg></svg>", "image/svg+xml", "a.svg"));
      const response = await POST(multipartRequest(formData), ctx());
      expect(response.status).toBe(400);
      expect(asignarImagenProductoSiAusente).not.toHaveBeenCalled();
    });

    it("404 si el producto no existe", async () => {
      asignarImagenProductoSiAusente.mockRejectedValueOnce(
        new ProductImageServiceError("No se encontró el producto.")
      );
      const formData = new FormData();
      formData.append("file", makeImageFile());
      const response = await POST(multipartRequest(formData), ctx());
      expect(response.status).toBe(404);
    });

    it("400 con un error de procesamiento saneado (sin detalle de Supabase)", async () => {
      asignarImagenProductoSiAusente.mockRejectedValueOnce(new Error("raw supabase storage error XYZ"));
      const formData = new FormData();
      formData.append("file", makeImageFile());
      const response = await POST(multipartRequest(formData), ctx());
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).not.toMatch(/supabase/i);
    });

    it("201 con respuesta correcta y Cache-Control no-store", async () => {
      const formData = new FormData();
      formData.append("file", makeImageFile());
      const response = await POST(multipartRequest(formData), ctx());
      expect(response.status).toBe(201);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      const body = await response.json();
      expect(body).toEqual({
        ok: true,
        persisted: true,
        product: ADMIN_RECORD,
        imageStoragePath: IMAGE_RESULT.storagePath,
        imageUrl: IMAGE_RESULT.displayUrl,
        correlationId: IMAGE_RESULT.correlationId,
        image: IMAGE_RESULT
      });
      expect(asignarImagenProductoSiAusente).toHaveBeenCalledWith(
        "producto-1",
        expect.any(Buffer),
        expect.any(String)
      );
    });

    it("la respuesta de exito incluye el correlationId de la subida (para correlacionar con logs server-side)", async () => {
      const formData = new FormData();
      formData.append("file", makeImageFile());
      const response = await POST(multipartRequest(formData), ctx());
      const body = await response.json();
      expect(body.correlationId).toBe(IMAGE_RESULT.correlationId);
    });

    it("la respuesta de error incluye un correlationId (aunque el servicio no haya generado uno propio)", async () => {
      asignarImagenProductoSiAusente.mockRejectedValueOnce(
        new ProductImageServiceError("No se encontró el producto.")
      );
      const formData = new FormData();
      formData.append("file", makeImageFile());
      const response = await POST(multipartRequest(formData), ctx());
      const body = await response.json();
      expect(typeof body.correlationId).toBe("string");
      expect(body.correlationId.length).toBeGreaterThan(0);
    });

    it("la respuesta de error propaga el code del servicio cuando esta presente (ej. STORAGE_ROUNDTRIP_MISMATCH)", async () => {
      asignarImagenProductoSiAusente.mockRejectedValueOnce(
        new ProductImageServiceError("La imagen se subió pero quedó corrupta en el almacenamiento. Intenta nuevamente.", {
          code: "STORAGE_ROUNDTRIP_MISMATCH",
          correlationId: "22222222-2222-4222-8222-222222222222"
        })
      );
      const formData = new FormData();
      formData.append("file", makeImageFile());
      const response = await POST(multipartRequest(formData), ctx());
      const body = await response.json();
      expect(body.code).toBe("STORAGE_ROUNDTRIP_MISMATCH");
      expect(body.correlationId).toBe("22222222-2222-4222-8222-222222222222");
    });

    it(
      "contrato exigido: la respuesta trae ok, persisted, product (releido de forma independiente vía " +
        "obtenerProductoAdminPorId, misma forma que la lista del catalogo admin), imageStoragePath e imageUrl",
      async () => {
        const formData = new FormData();
        formData.append("file", makeImageFile());
        const response = await POST(multipartRequest(formData), ctx());
        const body = await response.json();

        expect(body.ok).toBe(true);
        expect(body.persisted).toBe(true);
        expect(body.imageStoragePath).toBe(IMAGE_RESULT.storagePath);
        expect(body.imageUrl).toBe(IMAGE_RESULT.displayUrl);
        expect(body.product).toEqual(ADMIN_RECORD);
        expect(body.product.imageStoragePath).toBe(body.imageStoragePath);
        expect(body.product.imageUrl).toBe(body.imageUrl);
        expect(obtenerProductoAdminPorId).toHaveBeenCalledWith("producto-1");
      }
    );

    describe("Fase 7.3A: autorizacion atomica de reemplazo", () => {
      const VALID_EXPECTED_PATH = "products/producto-1/existing-abc.webp";

      it("upload normal (sin replaceExisting) usa la asignacion segura, nunca el reemplazo condicionado", async () => {
        const formData = new FormData();
        formData.append("file", makeImageFile());
        const response = await POST(multipartRequest(formData), ctx());
        expect(response.status).toBe(201);
        expect(asignarImagenProductoSiAusente).toHaveBeenCalledTimes(1);
        expect(reemplazarImagenProductoSiCoincide).not.toHaveBeenCalled();
      });

      it("upload normal no puede reemplazar: si el servicio reporta IMAGE_ALREADY_EXISTS, responde 409 con ese code", async () => {
        asignarImagenProductoSiAusente.mockRejectedValueOnce(
          new ProductImageServiceError("El producto ya tiene una imagen y no será reemplazada automáticamente.", {
            code: "IMAGE_ALREADY_EXISTS"
          })
        );
        const formData = new FormData();
        formData.append("file", makeImageFile());
        const response = await POST(multipartRequest(formData), ctx());
        expect(response.status).toBe(409);
        const body = await response.json();
        expect(body.code).toBe("IMAGE_ALREADY_EXISTS");
        expect(body.error).not.toMatch(/stack|sql/i);
      });

      it("replaceExisting=\"true\" con expectedImageStoragePath valido usa el reemplazo condicionado", async () => {
        const formData = new FormData();
        formData.append("file", makeImageFile());
        formData.append("replaceExisting", "true");
        formData.append("expectedImageStoragePath", VALID_EXPECTED_PATH);
        const response = await POST(multipartRequest(formData), ctx());
        expect(response.status).toBe(201);
        expect(reemplazarImagenProductoSiCoincide).toHaveBeenCalledWith(
          "producto-1",
          VALID_EXPECTED_PATH,
          expect.any(Buffer),
          expect.any(String)
        );
        expect(asignarImagenProductoSiAusente).not.toHaveBeenCalled();
      });

      it("replaceExisting con valor distinto de \"true\"/\"false\" es invalido (400)", async () => {
        const formData = new FormData();
        formData.append("file", makeImageFile());
        formData.append("replaceExisting", "yes");
        formData.append("expectedImageStoragePath", VALID_EXPECTED_PATH);
        const response = await POST(multipartRequest(formData), ctx());
        expect(response.status).toBe(400);
        expect(reemplazarImagenProductoSiCoincide).not.toHaveBeenCalled();
        expect(asignarImagenProductoSiAusente).not.toHaveBeenCalled();
      });

      it("replaceExisting=\"false\" explicito se comporta como asignacion segura (no reemplazo)", async () => {
        const formData = new FormData();
        formData.append("file", makeImageFile());
        formData.append("replaceExisting", "false");
        const response = await POST(multipartRequest(formData), ctx());
        expect(response.status).toBe(201);
        expect(asignarImagenProductoSiAusente).toHaveBeenCalledTimes(1);
        expect(reemplazarImagenProductoSiCoincide).not.toHaveBeenCalled();
      });

      it("replace sin expectedImageStoragePath: 400 EXPECTED_IMAGE_PATH_REQUIRED, sin llamar al servicio", async () => {
        const formData = new FormData();
        formData.append("file", makeImageFile());
        formData.append("replaceExisting", "true");
        const response = await POST(multipartRequest(formData), ctx());
        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.code).toBe("EXPECTED_IMAGE_PATH_REQUIRED");
        expect(reemplazarImagenProductoSiCoincide).not.toHaveBeenCalled();
        expect(asignarImagenProductoSiAusente).not.toHaveBeenCalled();
      });

      it("replace con expectedImageStoragePath vacio: 400, sin llamar al servicio", async () => {
        const formData = new FormData();
        formData.append("file", makeImageFile());
        formData.append("replaceExisting", "true");
        formData.append("expectedImageStoragePath", "   ");
        const response = await POST(multipartRequest(formData), ctx());
        expect(response.status).toBe(400);
        expect(reemplazarImagenProductoSiCoincide).not.toHaveBeenCalled();
      });

      it("replace con expectedImageStoragePath de forma invalida (fuera del patron de Storage): 400", async () => {
        const formData = new FormData();
        formData.append("file", makeImageFile());
        formData.append("replaceExisting", "true");
        formData.append("expectedImageStoragePath", "../etc/passwd");
        const response = await POST(multipartRequest(formData), ctx());
        expect(response.status).toBe(400);
        expect(reemplazarImagenProductoSiCoincide).not.toHaveBeenCalled();
      });

      it("replace con expectedImageStoragePath de OTRO producto: 400, sin llamar al servicio", async () => {
        const formData = new FormData();
        formData.append("file", makeImageFile());
        formData.append("replaceExisting", "true");
        formData.append("expectedImageStoragePath", "products/otro-producto/abc.webp");
        const response = await POST(multipartRequest(formData), ctx());
        expect(response.status).toBe(400);
        expect(reemplazarImagenProductoSiCoincide).not.toHaveBeenCalled();
      });

      it("expectedImageStoragePath sin replaceExisting: se ignora de forma segura (asignacion segura, sin error)", async () => {
        const formData = new FormData();
        formData.append("file", makeImageFile());
        formData.append("expectedImageStoragePath", VALID_EXPECTED_PATH);
        const response = await POST(multipartRequest(formData), ctx());
        expect(response.status).toBe(201);
        expect(asignarImagenProductoSiAusente).toHaveBeenCalledTimes(1);
        expect(reemplazarImagenProductoSiCoincide).not.toHaveBeenCalled();
      });

      it("conflicto IMAGE_ALREADY_EXISTS responde 409 con ese code y mensaje seguro", async () => {
        asignarImagenProductoSiAusente.mockRejectedValueOnce(
          new ProductImageServiceError("El producto ya tiene una imagen y no será reemplazada automáticamente.", {
            code: "IMAGE_ALREADY_EXISTS",
            correlationId: "33333333-3333-4333-8333-333333333333"
          })
        );
        const formData = new FormData();
        formData.append("file", makeImageFile());
        const response = await POST(multipartRequest(formData), ctx());
        expect(response.status).toBe(409);
        const body = await response.json();
        expect(body).toMatchObject({
          code: "IMAGE_ALREADY_EXISTS",
          correlationId: "33333333-3333-4333-8333-333333333333"
        });
      });

      it("conflicto IMAGE_CHANGED_SINCE_PREVIEW responde 409 con ese code y mensaje seguro", async () => {
        reemplazarImagenProductoSiCoincide.mockRejectedValueOnce(
          new ProductImageServiceError(
            "La imagen del producto cambió desde que abriste el Preview. Actualiza la página antes de reemplazarla.",
            { code: "IMAGE_CHANGED_SINCE_PREVIEW" }
          )
        );
        const formData = new FormData();
        formData.append("file", makeImageFile());
        formData.append("replaceExisting", "true");
        formData.append("expectedImageStoragePath", VALID_EXPECTED_PATH);
        const response = await POST(multipartRequest(formData), ctx());
        expect(response.status).toBe(409);
        const body = await response.json();
        expect(body.code).toBe("IMAGE_CHANGED_SINCE_PREVIEW");
        expect(body.error).not.toMatch(/stack|sql/i);
      });

      it("rechaza mas de un archivo bajo el campo file", async () => {
        const formData = new FormData();
        formData.append("file", makeImageFile());
        formData.append("file", makeImageFile(undefined, undefined, "otra.jpg"));
        const response = await POST(multipartRequest(formData), ctx());
        expect(response.status).toBe(400);
        expect(asignarImagenProductoSiAusente).not.toHaveBeenCalled();
      });

      it("rechaza replaceExisting duplicado en el form-data", async () => {
        const formData = new FormData();
        formData.append("file", makeImageFile());
        formData.append("replaceExisting", "true");
        formData.append("replaceExisting", "true");
        formData.append("expectedImageStoragePath", VALID_EXPECTED_PATH);
        const response = await POST(multipartRequest(formData), ctx());
        expect(response.status).toBe(400);
      });

      it("respuesta exitosa conserva el contrato actual tambien en modo reemplazo", async () => {
        const formData = new FormData();
        formData.append("file", makeImageFile());
        formData.append("replaceExisting", "true");
        formData.append("expectedImageStoragePath", VALID_EXPECTED_PATH);
        const response = await POST(multipartRequest(formData), ctx());
        const body = await response.json();
        expect(body).toEqual({
          ok: true,
          persisted: true,
          product: ADMIN_RECORD,
          imageStoragePath: IMAGE_RESULT.storagePath,
          imageUrl: IMAGE_RESULT.displayUrl,
          correlationId: IMAGE_RESULT.correlationId,
          image: IMAGE_RESULT
        });
      });
    });
  });

  describe("DELETE (eliminar, idempotente)", () => {
    it("401 sin sesion", async () => {
      isAdminAuthenticated.mockResolvedValueOnce(false);
      const response = await DELETE(deleteRequest(), ctx());
      expect(response.status).toBe(401);
      expect(eliminarImagenProducto).not.toHaveBeenCalled();
    });

    it("200 ok en el primer llamado y en un segundo llamado (idempotente)", async () => {
      const first = await DELETE(deleteRequest(), ctx());
      const second = await DELETE(deleteRequest(), ctx());
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(eliminarImagenProducto).toHaveBeenCalledTimes(2);
    });

    it("200 incluye el producto releido (sin imagen) para que el cliente reemplace el registro local completo", async () => {
      const sinImagen = { ...ADMIN_RECORD, imageUrl: "", imageStoragePath: "" };
      obtenerProductoAdminPorId.mockResolvedValueOnce(sinImagen);
      const response = await DELETE(deleteRequest(), ctx());
      const body = await response.json();
      expect(body).toEqual({
        ok: true,
        persisted: true,
        product: sinImagen,
        imageStoragePath: "",
        imageUrl: ""
      });
    });

    it("404 si el producto no existe", async () => {
      eliminarImagenProducto.mockRejectedValueOnce(
        new ProductImageServiceError("No se encontró el producto.")
      );
      const response = await DELETE(deleteRequest(), ctx());
      expect(response.status).toBe(404);
    });
  });
});
