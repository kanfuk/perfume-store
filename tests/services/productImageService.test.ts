import { describe, expect, it } from "vitest";
import sharp from "sharp";
import type { ProductoProps } from "@/domain/Producto";
import type { ProductRepository } from "@/repositories/productRepository";
import type { ProductImageRepository } from "@/repositories/productImageRepository";
import { ProductImageService, ProductImageServiceError } from "@/services/productImageService";

async function validImageBuffer(): Promise<Buffer> {
  return sharp({
    create: { width: 300, height: 200, channels: 3, background: { r: 10, g: 20, b: 30 } }
  })
    .jpeg()
    .toBuffer();
}

function baseProduct(overrides: Partial<ProductoProps> = {}): ProductoProps {
  return {
    id: "producto-1",
    nombre: "Perfume de prueba",
    descripcion: "",
    precioVenta: 10000,
    costoUnitario: 0,
    stockActual: 5,
    stockAgenda: 5,
    activo: true,
    tipoProducto: "simple",
    imageUrl: "",
    imageStoragePath: "",
    ...overrides
  };
}

class ProductRepositoryStub implements ProductRepository {
  public producto: ProductoProps | null = baseProduct();
  public actualizarCalls: Array<{ id: string; cambios: Partial<ProductoProps> }> = [];
  public actualizarShouldThrow = false;

  async buscarProductosActivos() {
    return this.producto ? [this.producto] : [];
  }

  async buscarTodosProductos() {
    return this.producto ? [this.producto] : [];
  }

  async buscarProductoPorId(id: string) {
    return this.producto && this.producto.id === id ? this.producto : null;
  }

  async buscarProductoPorSku() {
    return null;
  }

  async crearProducto(producto: Omit<ProductoProps, "id"> & { id?: string }): Promise<ProductoProps> {
    return { ...producto, id: producto.id ?? "nuevo" } as ProductoProps;
  }

  async eliminarProducto() {
    return;
  }

  async actualizarProducto(id: string, cambios: Partial<Omit<ProductoProps, "id">>) {
    this.actualizarCalls.push({ id, cambios });

    if (this.actualizarShouldThrow) {
      throw new Error("Fallo simulado de base de datos.");
    }

    if (this.producto && this.producto.id === id) {
      this.producto = { ...this.producto, ...cambios };
    }

    return this.producto as ProductoProps;
  }

  async ajustarStockAgenda() {
    return this.producto as ProductoProps;
  }
}

class ProductImageRepositoryStub implements ProductImageRepository {
  public calls: Array<{ op: "subir" | "eliminar"; path: string }> = [];
  public subirShouldThrow = false;
  public eliminarShouldThrow = false;

  async subir({ path }: { path: string; buffer: Buffer; contentType: string }) {
    this.calls.push({ op: "subir", path });
    if (this.subirShouldThrow) {
      throw new Error("Fallo simulado de Storage.");
    }
  }

  async eliminar(path: string) {
    this.calls.push({ op: "eliminar", path });
    if (this.eliminarShouldThrow) {
      throw new Error("Fallo simulado al eliminar de Storage.");
    }
  }

  obtenerUrlPublica(path: string) {
    return `https://storage.example.com/product-images/${path}`;
  }
}

describe("ProductImageService.reemplazarImagenProducto", () => {
  it("sube una imagen nueva y actualiza la DB cuando el producto no tenia imagen", async () => {
    const productRepository = new ProductRepositoryStub();
    const productImageRepository = new ProductImageRepositoryStub();
    const service = new ProductImageService(productRepository, productImageRepository);

    const result = await service.reemplazarImagenProducto("producto-1", await validImageBuffer());

    expect(result.storagePath).toMatch(/^products\/producto-1\//);
    expect(result.displayUrl).toContain(result.storagePath);
    expect(productImageRepository.calls.filter((c) => c.op === "subir")).toHaveLength(1);
    expect(productImageRepository.calls.filter((c) => c.op === "eliminar")).toHaveLength(0);
    expect(productRepository.actualizarCalls).toHaveLength(1);
    expect(productRepository.actualizarCalls[0].cambios.imageStoragePath).toBe(result.storagePath);
  });

  it("en un reemplazo, sube la nueva y actualiza la DB ANTES de borrar la anterior (orden verificado)", async () => {
    const productRepository = new ProductRepositoryStub();
    productRepository.producto = baseProduct({
      imageUrl: "https://storage.example.com/product-images/products/producto-1/old.webp",
      imageStoragePath: "products/producto-1/old.webp"
    });
    const productImageRepository = new ProductImageRepositoryStub();
    const service = new ProductImageService(productRepository, productImageRepository);

    const result = await service.reemplazarImagenProducto("producto-1", await validImageBuffer());

    // Orden: subir nuevo -> (DB actualizada, verificado por separado) -> eliminar anterior.
    const ops = productImageRepository.calls.map((c) => c.op);
    expect(ops[0]).toBe("subir");
    expect(ops[ops.length - 1]).toBe("eliminar");
    expect(productImageRepository.calls.find((c) => c.op === "eliminar")?.path).toBe(
      "products/producto-1/old.webp"
    );
    expect(productRepository.actualizarCalls[0].cambios.imageStoragePath).toBe(result.storagePath);
  });

  it("conserva la imagen anterior si falla la subida del archivo nuevo", async () => {
    const productRepository = new ProductRepositoryStub();
    productRepository.producto = baseProduct({
      imageUrl: "https://storage.example.com/product-images/products/producto-1/old.webp",
      imageStoragePath: "products/producto-1/old.webp"
    });
    const productImageRepository = new ProductImageRepositoryStub();
    productImageRepository.subirShouldThrow = true;
    const service = new ProductImageService(productRepository, productImageRepository);

    await expect(
      service.reemplazarImagenProducto("producto-1", await validImageBuffer())
    ).rejects.toMatchObject({
      message: "No fue posible guardar la imagen. La imagen anterior se mantuvo."
    });

    expect(productRepository.actualizarCalls).toHaveLength(0);
    expect(productImageRepository.calls.filter((c) => c.op === "eliminar")).toHaveLength(0);
    expect(productRepository.producto?.imageStoragePath).toBe("products/producto-1/old.webp");
  });

  it("elimina el archivo nuevo huerfano si falla la actualizacion de la DB, y conserva la anterior", async () => {
    const productRepository = new ProductRepositoryStub();
    productRepository.producto = baseProduct({
      imageUrl: "https://storage.example.com/product-images/products/producto-1/old.webp",
      imageStoragePath: "products/producto-1/old.webp"
    });
    productRepository.actualizarShouldThrow = true;
    const productImageRepository = new ProductImageRepositoryStub();
    const service = new ProductImageService(productRepository, productImageRepository);

    await expect(
      service.reemplazarImagenProducto("producto-1", await validImageBuffer())
    ).rejects.toMatchObject({
      message: "No fue posible guardar la imagen. La imagen anterior se mantuvo."
    });

    const uploadedPath = productImageRepository.calls.find((c) => c.op === "subir")?.path;
    const deletedPaths = productImageRepository.calls
      .filter((c) => c.op === "eliminar")
      .map((c) => c.path);

    expect(deletedPaths).toEqual([uploadedPath]);
    expect(deletedPaths).not.toContain("products/producto-1/old.webp");
    expect(productRepository.producto?.imageStoragePath).toBe("products/producto-1/old.webp");
  });

  it("rechaza si el producto no existe, sin subir nada", async () => {
    const productRepository = new ProductRepositoryStub();
    productRepository.producto = null;
    const productImageRepository = new ProductImageRepositoryStub();
    const service = new ProductImageService(productRepository, productImageRepository);

    await expect(
      service.reemplazarImagenProducto("no-existe", await validImageBuffer())
    ).rejects.toMatchObject({ message: "No se encontró el producto." });

    expect(productImageRepository.calls).toHaveLength(0);
  });

  it("propaga el mensaje de processProductImage cuando el archivo es invalido", async () => {
    const productRepository = new ProductRepositoryStub();
    const productImageRepository = new ProductImageRepositoryStub();
    const service = new ProductImageService(productRepository, productImageRepository);

    await expect(
      service.reemplazarImagenProducto("producto-1", Buffer.alloc(0))
    ).rejects.toBeInstanceOf(ProductImageServiceError);
    expect(productImageRepository.calls).toHaveLength(0);
  });

  it("no falla si el archivo anterior ya no existe en Storage al intentar borrarlo (no revierte la imagen nueva)", async () => {
    const productRepository = new ProductRepositoryStub();
    productRepository.producto = baseProduct({
      imageUrl: "https://storage.example.com/product-images/products/producto-1/old.webp",
      imageStoragePath: "products/producto-1/old.webp"
    });
    const productImageRepository = new ProductImageRepositoryStub();
    productImageRepository.eliminarShouldThrow = true;
    const service = new ProductImageService(productRepository, productImageRepository);

    const result = await service.reemplazarImagenProducto("producto-1", await validImageBuffer());

    expect(result.storagePath).toMatch(/^products\/producto-1\//);
    expect(productRepository.producto?.imageStoragePath).toBe(result.storagePath);
  });
});

describe("ProductImageService.eliminarImagenProducto", () => {
  it("limpia image_url e image_storage_path y borra el archivo administrado de Storage", async () => {
    const productRepository = new ProductRepositoryStub();
    productRepository.producto = baseProduct({
      imageUrl: "https://storage.example.com/product-images/products/producto-1/foto.webp",
      imageStoragePath: "products/producto-1/foto.webp"
    });
    const productImageRepository = new ProductImageRepositoryStub();
    const service = new ProductImageService(productRepository, productImageRepository);

    await service.eliminarImagenProducto("producto-1");

    expect(productRepository.producto?.imageUrl).toBe("");
    expect(productRepository.producto?.imageStoragePath).toBe("");
    expect(productImageRepository.calls).toEqual([
      { op: "eliminar", path: "products/producto-1/foto.webp" }
    ]);
  });

  it("nunca intenta borrar una URL externa historica de Storage", async () => {
    const productRepository = new ProductRepositoryStub();
    productRepository.producto = baseProduct({
      imageUrl: "https://cdn.externo.com/foto-vieja.jpg",
      imageStoragePath: ""
    });
    const productImageRepository = new ProductImageRepositoryStub();
    const service = new ProductImageService(productRepository, productImageRepository);

    await service.eliminarImagenProducto("producto-1");

    expect(productRepository.producto?.imageUrl).toBe("");
    expect(productImageRepository.calls).toHaveLength(0);
  });

  it("es idempotente: eliminar dos veces no falla la segunda vez", async () => {
    const productRepository = new ProductRepositoryStub();
    productRepository.producto = baseProduct({
      imageUrl: "https://storage.example.com/product-images/products/producto-1/foto.webp",
      imageStoragePath: "products/producto-1/foto.webp"
    });
    const productImageRepository = new ProductImageRepositoryStub();
    const service = new ProductImageService(productRepository, productImageRepository);

    await service.eliminarImagenProducto("producto-1");
    await expect(service.eliminarImagenProducto("producto-1")).resolves.toBeUndefined();

    expect(productImageRepository.calls.filter((c) => c.op === "eliminar")).toHaveLength(1);
  });

  it("no modifica es_top, orden_destacado ni ningun otro campo del producto", async () => {
    const productRepository = new ProductRepositoryStub();
    productRepository.producto = baseProduct({
      imageUrl: "https://storage.example.com/product-images/products/producto-1/foto.webp",
      imageStoragePath: "products/producto-1/foto.webp",
      esTop: true,
      ordenDestacado: 3,
      precioVenta: 15000,
      stockActual: 7
    });
    const productImageRepository = new ProductImageRepositoryStub();
    const service = new ProductImageService(productRepository, productImageRepository);

    await service.eliminarImagenProducto("producto-1");

    expect(productRepository.actualizarCalls[0].cambios).toEqual({
      imageUrl: "",
      imageStoragePath: ""
    });
    expect(productRepository.producto?.esTop).toBe(true);
    expect(productRepository.producto?.ordenDestacado).toBe(3);
    expect(productRepository.producto?.precioVenta).toBe(15000);
    expect(productRepository.producto?.stockActual).toBe(7);
  });

  it("rechaza si el producto no existe", async () => {
    const productRepository = new ProductRepositoryStub();
    productRepository.producto = null;
    const productImageRepository = new ProductImageRepositoryStub();
    const service = new ProductImageService(productRepository, productImageRepository);

    await expect(service.eliminarImagenProducto("no-existe")).rejects.toMatchObject({
      message: "No se encontró el producto."
    });
  });
});
