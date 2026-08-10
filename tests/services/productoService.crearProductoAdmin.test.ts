import { describe, expect, it } from "vitest";
import sharp from "sharp";
import type { ProductoProps } from "@/domain/Producto";
import type { ProductRepository } from "@/repositories/productRepository";
import type { ProductImageRepository } from "@/repositories/productImageRepository";
import { ProductoService } from "@/services/productoService";
import { ProductImageService } from "@/services/productImageService";

/**
 * Fase B: flujo real "Agregar perfume" -> crear producto -> obtener su id ->
 * subir imagen con el pipeline unico (no un segundo procesador) -> releer
 * el producto. Usa las MISMAS clases de servicio que usa la app (no solo
 * helpers puros), con un repositorio en memoria (no la base productiva).
 */

class InMemoryProductRepository implements ProductRepository {
  private readonly products = new Map<string, ProductoProps>();

  async buscarProductosActivos() {
    return Array.from(this.products.values()).filter((p) => p.activo !== false);
  }

  async buscarTodosProductos() {
    return Array.from(this.products.values());
  }

  async buscarProductoPorId(id: string) {
    return this.products.get(id) ?? null;
  }

  async buscarProductoPorSku(sku: string) {
    return Array.from(this.products.values()).find((p) => p.sku === sku) ?? null;
  }

  async crearProducto(producto: Omit<ProductoProps, "id"> & { id?: string }) {
    if (producto.sku && Array.from(this.products.values()).some((p) => p.sku === producto.sku)) {
      throw new Error("Ya existe un producto con ese SKU. Usa uno distinto.");
    }
    const id = producto.id ?? crypto.randomUUID();
    const record = { ...producto, id } as ProductoProps;
    this.products.set(id, record);
    return record;
  }

  async actualizarProducto(id: string, cambios: Partial<Omit<ProductoProps, "id">>) {
    const current = this.products.get(id);
    if (!current) throw new Error("Producto no encontrado.");
    const updated = { ...current, ...cambios };
    this.products.set(id, updated);
    return updated;
  }

  async ajustarStockAgenda(id: string, cantidad: number) {
    const current = this.products.get(id);
    if (!current) throw new Error("Producto no encontrado.");
    const nuevoStock = (current.stockActual ?? 0) + cantidad;
    const updated = { ...current, stockActual: nuevoStock, stockAgenda: nuevoStock };
    this.products.set(id, updated);
    return updated;
  }

  async eliminarProducto(id: string) {
    this.products.delete(id);
  }

  async archivarProductoSeguro() {
    return { alreadyArchived: false };
  }

  async eliminarProductoSeguro() {
    return {};
  }
}

class InMemoryProductImageRepository implements ProductImageRepository {
  public files = new Map<string, Buffer>();
  public subirShouldThrow = false;

  async subir({ path, buffer }: { path: string; buffer: Buffer; contentType: string }) {
    if (this.subirShouldThrow) throw new Error("Fallo simulado de Storage.");
    this.files.set(path, buffer);
  }

  async descargar(path: string) {
    const stored = this.files.get(path);
    if (!stored) throw new Error("No encontrado.");
    return stored;
  }

  async eliminar(path: string) {
    this.files.delete(path);
  }

  obtenerUrlPublica(path: string) {
    return `https://storage.example.com/product-images/${path}`;
  }
}

async function jpgBuffer(): Promise<Buffer> {
  return sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 200, g: 30, b: 30 } } })
    .jpeg()
    .toBuffer();
}

async function pngBuffer(): Promise<Buffer> {
  return sharp({ create: { width: 300, height: 300, channels: 4, background: { r: 30, g: 30, b: 200, alpha: 0.8 } } })
    .png()
    .toBuffer();
}

function buildServices() {
  const productRepository = new InMemoryProductRepository();
  const productImageRepository = new InMemoryProductImageRepository();
  const productoService = new ProductoService(productRepository);
  const productImageService = new ProductImageService(productRepository, productImageRepository);
  return { productRepository, productImageRepository, productoService, productImageService };
}

describe("Flujo Agregar perfume: crear -> obtener id -> subir imagen -> releer", () => {
  it("crea un producto SIN imagen (imagen es opcional)", async () => {
    const { productoService, productRepository } = buildServices();

    const created = await productoService.crearProductoAdmin({
      sku: "SML-TEST-SIN-IMAGEN-100ML",
      nombre: "Perfume sin imagen",
      marca: "Marca Test",
      contenido: "100ML",
      precioVenta: 54000,
      costoUnitario: 40000,
      stockActual: 1,
      stockAgenda: 1,
      stockMinimo: 0,
      activo: true
    });

    expect(created.id).toBeTruthy();
    expect(created.imageUrl ?? "").toBe("");

    const reread = await productRepository.buscarProductoPorId(created.id);
    expect(reread?.nombre).toBe("Perfume sin imagen");
  });

  it("producto creado manualmente no lleva badgeLabel (retirado del formulario)", async () => {
    const { productoService } = buildServices();
    const created = await productoService.crearProductoAdmin({
      sku: "SML-TEST-SIN-BADGE-100ML",
      nombre: "Perfume sin badge",
      marca: "Marca Test",
      contenido: "100ML",
      precioVenta: 54000,
      costoUnitario: 40000,
      stockActual: 1,
      activo: true
    });
    expect(created.badgeLabel ?? "").toBe("");
  });

  it("crea el producto, sube un JPG y la imagen persiste tras una lectura posterior independiente", async () => {
    const { productoService, productImageService, productRepository } = buildServices();

    const created = await productoService.crearProductoAdmin({
      sku: "SML-TEST-JPG-100ML",
      nombre: "Perfume con JPG",
      marca: "Marca Test",
      contenido: "100ML",
      precioVenta: 54000,
      costoUnitario: 40000,
      stockActual: 1,
      activo: true
    });

    const imageResult = await productImageService.reemplazarImagenProducto(created.id, await jpgBuffer());
    expect(imageResult.persisted).toBe(true);
    expect(imageResult.format).toBe("webp");

    // "Recargar": lectura independiente, no el mismo objeto en memoria.
    const reloaded = await productRepository.buscarProductoPorId(created.id);
    expect(reloaded?.imageUrl).toBe(imageResult.displayUrl);
    expect(reloaded?.imageStoragePath).toBe(imageResult.storagePath);
  });

  it("crea el producto, sube un PNG y la imagen persiste tras una lectura posterior independiente", async () => {
    const { productoService, productImageService, productRepository } = buildServices();

    const created = await productoService.crearProductoAdmin({
      sku: "SML-TEST-PNG-100ML",
      nombre: "Perfume con PNG",
      marca: "Marca Test",
      contenido: "100ML",
      precioVenta: 54000,
      costoUnitario: 40000,
      stockActual: 1,
      activo: true
    });

    const imageResult = await productImageService.reemplazarImagenProducto(created.id, await pngBuffer());
    const reloaded = await productRepository.buscarProductoPorId(created.id);
    expect(reloaded?.imageUrl).toBe(imageResult.displayUrl);
    expect(reloaded?.imageStoragePath).toBe(imageResult.storagePath);
  });

  it(
    "si la imagen falla DESPUES de crear el producto, el producto NO se borra (se puede reintentar solo la imagen)",
    async () => {
      const { productoService, productImageService, productImageRepository, productRepository } = buildServices();

      const created = await productoService.crearProductoAdmin({
        sku: "SML-TEST-RETRY-100ML",
        nombre: "Perfume con reintento",
        marca: "Marca Test",
        contenido: "100ML",
        precioVenta: 54000,
        costoUnitario: 40000,
        stockActual: 1,
        activo: true
      });

      productImageRepository.subirShouldThrow = true;
      await expect(productImageService.reemplazarImagenProducto(created.id, await jpgBuffer())).rejects.toThrow();

      // El producto sigue existiendo, sin imagen (no se borro por el fallo).
      const stillThere = await productRepository.buscarProductoPorId(created.id);
      expect(stillThere).not.toBeNull();
      expect(stillThere?.imageUrl ?? "").toBe("");

      // Reintentar SOLO la imagen (mismo productId, sin crear un duplicado).
      productImageRepository.subirShouldThrow = false;
      const retryResult = await productImageService.reemplazarImagenProducto(created.id, await jpgBuffer());
      expect(retryResult.persisted).toBe(true);
      const reread = await productRepository.buscarProductoPorId(created.id);
      expect(reread?.imageUrl).toBe(retryResult.displayUrl);

      const allProducts = await productRepository.buscarTodosProductos();
      expect(allProducts).toHaveLength(1); // nunca se duplico el producto
    }
  );

  it(
    "tras subir una imagen, una consulta admin posterior (obtenerCatalogoAdmin y " +
      "obtenerProductoAdminPorId, la misma consulta que usa el endpoint) devuelve la MISMA imagen",
    async () => {
      const { productoService, productImageService } = buildServices();

      const created = await productoService.crearProductoAdmin({
        sku: "SML-TEST-ADMIN-GET-100ML",
        nombre: "Perfume con GET admin",
        marca: "Marca Test",
        contenido: "100ML",
        precioVenta: 54000,
        costoUnitario: 40000,
        stockActual: 1,
        activo: true
      });

      const imageResult = await productImageService.reemplazarImagenProducto(created.id, await jpgBuffer());

      const single = await productoService.obtenerProductoAdminPorId(created.id);
      expect(single?.imageUrl).toBe(imageResult.displayUrl);
      expect(single?.imageStoragePath).toBe(imageResult.storagePath);

      const catalogAdmin = await productoService.obtenerCatalogoAdmin();
      const enLista = catalogAdmin.find((p) => p.id === created.id);
      expect(enLista?.imageUrl).toBe(imageResult.displayUrl);
      expect(enLista?.imageStoragePath).toBe(imageResult.storagePath);

      // Ambas consultas devuelven exactamente la misma forma para el mismo producto.
      expect(enLista).toEqual(single);
    }
  );

  it(
    "tras subir una imagen a un producto vendible, el catalogo publico (obtenerProductosActivos) " +
      "tambien muestra la nueva imagen",
    async () => {
      const { productoService, productImageService } = buildServices();

      const created = await productoService.crearProductoAdmin({
        sku: "SML-TEST-PUBLICO-GET-100ML",
        nombre: "Perfume vendible",
        marca: "Marca Test",
        contenido: "100ML",
        descripcion: "Descripcion valida",
        precioVenta: 54000,
        costoUnitario: 40000,
        stockActual: 3,
        activo: true
      });

      const imageResult = await productImageService.reemplazarImagenProducto(created.id, await jpgBuffer());

      const publico = await productoService.obtenerProductosActivos();
      const enPublico = publico.find((p) => p.id === created.id);
      expect(enPublico).toBeDefined();
      expect(enPublico?.imageUrl).toBe(imageResult.displayUrl);
    }
  );

  it("obtenerProductoAdminPorId devuelve null para un id que no existe (no lanza, no inventa un producto)", async () => {
    const { productoService } = buildServices();
    const result = await productoService.obtenerProductoAdminPorId("no-existe");
    expect(result).toBeNull();
  });

  it("SKU duplicado es rechazado (no crea un segundo producto silenciosamente)", async () => {
    const { productoService } = buildServices();
    await productoService.crearProductoAdmin({
      sku: "SML-TEST-DUP-100ML",
      nombre: "Perfume original",
      marca: "Marca Test",
      contenido: "100ML",
      precioVenta: 54000,
      costoUnitario: 40000,
      stockActual: 1,
      activo: true
    });

    await expect(
      productoService.crearProductoAdmin({
        sku: "SML-TEST-DUP-100ML",
        nombre: "Perfume duplicado",
        marca: "Marca Test",
        contenido: "100ML",
        precioVenta: 54000,
        costoUnitario: 40000,
        stockActual: 1,
        activo: true
      })
    ).rejects.toThrow();
  });
});
