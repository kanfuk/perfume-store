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
  public buscarProductoPorIdCalls = 0;
  /**
   * Si esta definido, reemplaza el resultado de la lectura de VERIFICACION
   * (la segunda llamada en adelante a buscarProductoPorId dentro de
   * reemplazarImagenProducto: la primera es la lectura inicial, antes de
   * subir nada). Simula una relectura que no ve el cambio recien escrito
   * (replica desactualizada, cache, etc.).
   */
  public verificacionOverride: ProductoProps | null | "throw" | undefined = undefined;

  async buscarProductosActivos() {
    return this.producto ? [this.producto] : [];
  }

  async buscarTodosProductos() {
    return this.producto ? [this.producto] : [];
  }

  async buscarProductoPorId(id: string) {
    this.buscarProductoPorIdCalls += 1;
    if (this.buscarProductoPorIdCalls > 1 && this.verificacionOverride !== undefined) {
      if (this.verificacionOverride === "throw") {
        throw new Error("Fallo simulado de lectura de verificacion.");
      }
      return this.verificacionOverride;
    }
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
  public calls: Array<{ op: "subir" | "descargar" | "eliminar"; path: string }> = [];
  public subirShouldThrow = false;
  public eliminarShouldThrow = false;
  /** Si esta definido, es lo que descargar() devuelve en vez de los bytes recien subidos (simula corrupcion en Storage). */
  public descargarOverride: Buffer | "throw" | undefined = undefined;
  private readonly files = new Map<string, Buffer>();

  async subir({ path, buffer }: { path: string; buffer: Buffer; contentType: string }) {
    this.calls.push({ op: "subir", path });
    if (this.subirShouldThrow) {
      throw new Error("Fallo simulado de Storage.");
    }
    this.files.set(path, buffer);
  }

  async descargar(path: string) {
    this.calls.push({ op: "descargar", path });
    if (this.descargarOverride === "throw") {
      throw new Error("Fallo simulado de descarga de Storage.");
    }
    if (this.descargarOverride !== undefined) {
      return this.descargarOverride;
    }
    const stored = this.files.get(path);
    if (!stored) {
      throw new Error("No encontrado.");
    }
    return stored;
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

  it(
    "verificacion de integridad binaria: si el objeto descargado de vuelta no coincide byte a byte " +
      "con lo que proceso Sharp (simula corrupcion en Storage), se borra el archivo nuevo, " +
      "NO se actualiza la DB y se conserva la imagen anterior",
    async () => {
      const productRepository = new ProductRepositoryStub();
      productRepository.producto = baseProduct({
        imageUrl: "https://storage.example.com/product-images/products/producto-1/old.webp",
        imageStoragePath: "products/producto-1/old.webp"
      });
      const productImageRepository = new ProductImageRepositoryStub();
      // Simula el patron real observado: un byte invalido de UTF-8 quedo
      // reemplazado por U+FFFD (EF BF BD) en algun punto del transporte.
      productImageRepository.descargarOverride = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0xef, 0xbf, 0xbd, 0xef, 0xbf, 0xbd, 0x01, 0x00, 0x57, 0x45, 0x42, 0x50
      ]);
      const service = new ProductImageService(productRepository, productImageRepository);

      await expect(
        service.reemplazarImagenProducto("producto-1", await validImageBuffer())
      ).rejects.toMatchObject({
        message: "La imagen se subió pero quedó corrupta en el almacenamiento. Intenta nuevamente."
      });

      expect(productRepository.actualizarCalls).toHaveLength(0);
      const uploadedPath = productImageRepository.calls.find((c) => c.op === "subir")?.path;
      const deletedPaths = productImageRepository.calls.filter((c) => c.op === "eliminar").map((c) => c.path);
      expect(deletedPaths).toEqual([uploadedPath]);
      expect(deletedPaths).not.toContain("products/producto-1/old.webp");
      expect(productRepository.producto?.imageStoragePath).toBe("products/producto-1/old.webp");
    }
  );

  it(
    "verificacion de integridad binaria: una cabecera RIFF/WEBP invalida se rechaza, sin actualizar la DB",
    async () => {
      const productRepository = new ProductRepositoryStub();
      const productImageRepository = new ProductImageRepositoryStub();
      const uploadBuffer = await validImageBuffer();
      // Bytes en cero: cabecera RIFF/WEBP invalida, sin importar el largo.
      productImageRepository.descargarOverride = Buffer.alloc(4096, 0);
      const service = new ProductImageService(productRepository, productImageRepository);

      await expect(
        service.reemplazarImagenProducto("producto-1", uploadBuffer)
      ).rejects.toMatchObject({
        message: "La imagen se subió pero quedó corrupta en el almacenamiento. Intenta nuevamente."
      });
      expect(productRepository.actualizarCalls).toHaveLength(0);
    }
  );

  it(
    "verificacion de integridad binaria: si la descarga de verificacion falla, se borra el archivo " +
      "nuevo y NO se actualiza la DB (nunca se informa exito sin haber podido comparar bytes)",
    async () => {
      const productRepository = new ProductRepositoryStub();
      const productImageRepository = new ProductImageRepositoryStub();
      productImageRepository.descargarOverride = "throw";
      const service = new ProductImageService(productRepository, productImageRepository);

      await expect(
        service.reemplazarImagenProducto("producto-1", await validImageBuffer())
      ).rejects.toMatchObject({
        message: "La imagen se subió pero no se pudo leer de vuelta para verificarla. Intenta nuevamente."
      });

      expect(productRepository.actualizarCalls).toHaveLength(0);
      const uploadedPath = productImageRepository.calls.find((c) => c.op === "subir")?.path;
      expect(productImageRepository.calls.filter((c) => c.op === "eliminar").map((c) => c.path)).toEqual([
        uploadedPath
      ]);
    }
  );

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

  it(
    "verificacion post-escritura: si la relectura no ve el cambio (replica desactualizada / cache), " +
      "NO se informa exito -- se limpia el archivo nuevo, se conserva el anterior y se lanza un error real",
    async () => {
      const productRepository = new ProductRepositoryStub();
      productRepository.producto = baseProduct({
        imageUrl: "https://storage.example.com/product-images/products/producto-1/old.webp",
        imageStoragePath: "products/producto-1/old.webp"
      });
      // La relectura de verificacion "ve" la version vieja, como si el UPDATE
      // no hubiera propagado a tiempo para la siguiente consulta.
      productRepository.verificacionOverride = baseProduct({
        imageUrl: "https://storage.example.com/product-images/products/producto-1/old.webp",
        imageStoragePath: "products/producto-1/old.webp"
      });
      const productImageRepository = new ProductImageRepositoryStub();
      const service = new ProductImageService(productRepository, productImageRepository);

      await expect(
        service.reemplazarImagenProducto("producto-1", await validImageBuffer())
      ).rejects.toMatchObject({
        message: "La imagen se subió pero no se pudo confirmar que quedó guardada. Intenta nuevamente."
      });

      const uploadedPath = productImageRepository.calls.find((c) => c.op === "subir")?.path;
      const deletedPaths = productImageRepository.calls.filter((c) => c.op === "eliminar").map((c) => c.path);
      expect(deletedPaths).toEqual([uploadedPath]); // se borra el archivo NUEVO, no el anterior
      expect(deletedPaths).not.toContain("products/producto-1/old.webp");
    }
  );

  it("verificacion post-escritura: si la relectura devuelve null, se trata como fallo (no informa exito)", async () => {
    const productRepository = new ProductRepositoryStub();
    productRepository.verificacionOverride = null;
    const productImageRepository = new ProductImageRepositoryStub();
    const service = new ProductImageService(productRepository, productImageRepository);

    await expect(
      service.reemplazarImagenProducto("producto-1", await validImageBuffer())
    ).rejects.toMatchObject({
      message: "La imagen se subió pero no se pudo confirmar que quedó guardada. Intenta nuevamente."
    });
    const uploadedPath = productImageRepository.calls.find((c) => c.op === "subir")?.path;
    expect(productImageRepository.calls.filter((c) => c.op === "eliminar").map((c) => c.path)).toEqual([
      uploadedPath
    ]);
  });

  it("verificacion post-escritura: si la relectura falla (excepcion), se trata como fallo (no informa exito)", async () => {
    const productRepository = new ProductRepositoryStub();
    productRepository.verificacionOverride = "throw";
    const productImageRepository = new ProductImageRepositoryStub();
    const service = new ProductImageService(productRepository, productImageRepository);

    await expect(
      service.reemplazarImagenProducto("producto-1", await validImageBuffer())
    ).rejects.toMatchObject({
      message: "La imagen se subió pero no se pudo confirmar que quedó guardada. Intenta nuevamente."
    });
  });

  it("la respuesta incluye el producto verificado completo y persisted:true (contrato exigido)", async () => {
    const productRepository = new ProductRepositoryStub();
    const productImageRepository = new ProductImageRepositoryStub();
    const service = new ProductImageService(productRepository, productImageRepository);

    const result = await service.reemplazarImagenProducto("producto-1", await validImageBuffer());

    expect(result.persisted).toBe(true);
    expect(result.producto.id).toBe("producto-1");
    expect(result.producto.imageStoragePath).toBe(result.storagePath);
    expect(result.producto.imageUrl).toBe(result.displayUrl);
  });

  it(
    "la imagen persiste tras una lectura posterior independiente (simula recargar la pagina): " +
      "una consulta buscarProductoPorId hecha DESPUES de que reemplazarImagenProducto ya termino " +
      "devuelve la URL y el storagePath nuevos, no los que tenia el objeto antes de la subida",
    async () => {
      const productRepository = new ProductRepositoryStub();
      productRepository.producto = baseProduct({
        imageUrl: "https://storage.example.com/product-images/products/producto-1/old.webp",
        imageStoragePath: "products/producto-1/old.webp"
      });
      const productImageRepository = new ProductImageRepositoryStub();
      const service = new ProductImageService(productRepository, productImageRepository);

      const result = await service.reemplazarImagenProducto("producto-1", await validImageBuffer());

      // "Recarga": una consulta nueva e independiente, no el mismo objeto en memoria.
      const reloaded = await productRepository.buscarProductoPorId("producto-1");

      expect(reloaded?.imageUrl).toBe(result.displayUrl);
      expect(reloaded?.imageStoragePath).toBe(result.storagePath);
      expect(reloaded?.imageStoragePath).not.toBe("products/producto-1/old.webp");
    }
  );

  it("el campo image_url tambien se actualiza (sigue formando parte del contrato junto a image_storage_path)", async () => {
    const productRepository = new ProductRepositoryStub();
    const productImageRepository = new ProductImageRepositoryStub();
    const service = new ProductImageService(productRepository, productImageRepository);

    const result = await service.reemplazarImagenProducto("producto-1", await validImageBuffer());

    expect(productRepository.actualizarCalls[0].cambios.imageUrl).toBe(result.displayUrl);
    expect(productRepository.producto?.imageUrl).toBe(result.displayUrl);
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

describe("ProductImageService.asignarImagenProductoSiAusente", () => {
  it("no sobreescribe una imagen existente automáticamente", async () => {
    const productRepository = new ProductRepositoryStub();
    productRepository.producto = baseProduct({ imageUrl: "https://storage.example/existing.webp" });
    const productImageRepository = new ProductImageRepositoryStub();
    const service = new ProductImageService(productRepository, productImageRepository);
    await expect(service.asignarImagenProductoSiAusente("producto-1", await validImageBuffer())).rejects.toMatchObject({ message: "El producto ya tiene una imagen y no será reemplazada automáticamente." });
    expect(productImageRepository.calls).toHaveLength(0);
  });

  it("borra la subida nueva si aparece una imagen concurrente antes de actualizar DB", async () => {
    const baseRepository = new ProductRepositoryStub();
    const productRepository = Object.assign(baseRepository, {
      actualizarImagenProductoSiAusente: async () => null
    });
    const productImageRepository = new ProductImageRepositoryStub();
    const service = new ProductImageService(productRepository, productImageRepository);
    await expect(service.asignarImagenProductoSiAusente("producto-1", await validImageBuffer())).rejects.toMatchObject({ message: "El producto ya tiene una imagen y no será reemplazada automáticamente." });
    expect(productImageRepository.calls.map((call) => call.op)).toEqual(["subir", "descargar", "eliminar"]);
  });
});
