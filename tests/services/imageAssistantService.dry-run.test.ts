import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImageSearchProvider } from "@/lib/image-assistant/source-provider";
import { ImageAssistantService } from "@/services/imageAssistantService";

const env = {
  key: process.env.BRAVE_SEARCH_API_KEY,
  signing: process.env.IMAGE_ASSISTANT_SIGNING_SECRET,
  domains: process.env.IMAGE_ASSISTANT_ALLOWED_DOMAINS,
  search: process.env.IMAGE_ASSISTANT_SEARCH_ENABLED,
  batch: process.env.IMAGE_ASSISTANT_BATCH_ENABLED
};

afterEach(() => {
  const restore = (key: string, value: string | undefined) => value === undefined ? delete process.env[key] : process.env[key] = value;
  restore("BRAVE_SEARCH_API_KEY", env.key);
  restore("IMAGE_ASSISTANT_SIGNING_SECRET", env.signing);
  restore("IMAGE_ASSISTANT_ALLOWED_DOMAINS", env.domains);
  restore("IMAGE_ASSISTANT_SEARCH_ENABLED", env.search);
  restore("IMAGE_ASSISTANT_BATCH_ENABLED", env.batch);
});

describe("image assistant dry-run", () => {
  it("busca y clasifica sin escribir Storage, productos ni intentos", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-key";
    process.env.IMAGE_ASSISTANT_SIGNING_SECRET = "test-signing";
    process.env.IMAGE_ASSISTANT_ALLOWED_DOMAINS = "brand.example,images.brand.example";
    process.env.IMAGE_ASSISTANT_SEARCH_ENABLED = "true";
    const productRepository = {
      buscarTodosProductos: vi.fn().mockResolvedValue([{
        id: "p1", sku: "BRAND-PRODUCT-100ML", nombre: "Product EDP", marca: "Brand", contenido: "100ML",
        activo: true, imageUrl: "", imageStoragePath: "", esTop: false, precioVenta: 1000
      }])
    };
    const assignImage = vi.fn();
    const productImageService = { asignarImagenProductoSiAusente: assignImage };
    const attempts = { start: vi.fn(), markApplied: vi.fn(), markError: vi.fn(), isHashAlreadyApplied: vi.fn() };
    const provider: ImageSearchProvider = {
      isConfigured: () => true,
      healthCheck: () => ({ configured: true }),
      normalizeResult: () => null,
      searchImages: vi.fn().mockResolvedValue([{
        sourcePageUrl: "https://brand.example/product",
        imageUrl: "https://images.brand.example/product.jpg",
        title: "Brand Product EDP 100ML bottle",
        sourceDomain: "brand.example",
        width: 900,
        height: 900
      }])
    };
    const service = new ImageAssistantService(
      productRepository as never,
      productImageService as never,
      attempts as never,
      provider
    );
    const csv = Buffer.from("Perfume;Marca;Contenido;Precio Compra\nProduct EDP;Brand;100ML;1000");
    const result = await service.dryRun(csv);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toEqual(expect.objectContaining({ candidateCount: 1, domain: "brand.example" }));
    expect(assignImage).not.toHaveBeenCalled();
    expect(attempts.start).not.toHaveBeenCalled();
    expect(attempts.markApplied).not.toHaveBeenCalled();
    expect(productRepository.buscarTodosProductos).toHaveBeenCalledOnce();
  });

  it("bloquea dry-run cuando el feature gate está apagado", async () => {
    process.env.IMAGE_ASSISTANT_SEARCH_ENABLED = "false";
    const service = new ImageAssistantService({} as never, {} as never, {} as never);
    await expect(service.dryRun(Buffer.from("x"))).rejects.toThrow("requiere proveedor");
  });

  it("bloquea procesamiento cuando batch está deshabilitado", async () => {
    process.env.IMAGE_ASSISTANT_BATCH_ENABLED = "false";
    const service = new ImageAssistantService({} as never, {} as never, {} as never);
    await expect(service.process("p1", Buffer.from("x"), {} as never)).rejects.toThrow("carga automática");
  });
});
