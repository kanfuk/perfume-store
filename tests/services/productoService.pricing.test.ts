import { describe, expect, it } from "vitest";
import type { ProductoProps } from "@/domain/Producto";
import type { ProductRepository } from "@/repositories/productRepository";
import { ProductoService } from "@/services/productoService";

class FullProductRepositoryStub implements ProductRepository {
  actualizarProductoCalls: Array<{ id: string; cambios: unknown }> = [];
  private readonly products = new Map<string, ProductoProps>();

  seed(product: ProductoProps) {
    this.products.set(product.id, product);
  }

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
    const id = producto.id ?? "producto-nuevo";
    const record: ProductoProps = { ...producto, id };
    this.products.set(id, record);
    return record;
  }

  async actualizarProducto(id: string, cambios: Partial<Omit<ProductoProps, "id">>) {
    this.actualizarProductoCalls.push({ id, cambios });
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

  async eliminarProducto() {
    // no usado en estos tests
  }
}

function seedProduct(repository: FullProductRepositoryStub, overrides: Partial<ProductoProps> = {}) {
  const product: ProductoProps = {
    id: "prod-1",
    sku: "SML-CAROLINA-HERRERA-LA-BOMBA-80ML",
    nombre: "La Bomba",
    marca: "Carolina Herrera",
    contenido: "80ML",
    precioVenta: 65000,
    costoUnitario: 45000,
    stockActual: 7,
    stockAgenda: 7,
    stockReservado: 2,
    activo: true,
    esTop: true,
    ordenDestacado: 3,
    esOfertaSemana: true,
    precioAnterior: 70000,
    imageUrl: "/images/perfumes/top12/top-03-carolina-herrera-la-bomba.webp",
    modoPrecio: "AUTO",
    tipoProducto: "simple",
    ...overrides
  };
  repository.seed(product);
  return product;
}

describe("ProductoService - edicion individual de precio", () => {
  it("fijarPrecioManualProducto guarda el precio y marca MANUAL, preservando stock/imagen/Top12/ofertas", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository);
    const service = new ProductoService(repository);

    const result = await service.fijarPrecioManualProducto("prod-1", 72000);
    expect(result).toEqual({ id: "prod-1", precioVenta: 72000, modoPrecio: "MANUAL" });

    const updated = await repository.buscarProductoPorId("prod-1");
    expect(updated?.precioVenta).toBe(72000);
    expect(updated?.modoPrecio).toBe("MANUAL");
    expect(updated?.stockActual).toBe(7);
    expect(updated?.stockReservado).toBe(2);
    expect(updated?.imageUrl).toBe("/images/perfumes/top12/top-03-carolina-herrera-la-bomba.webp");
    expect(updated?.esTop).toBe(true);
    expect(updated?.ordenDestacado).toBe(3);
    expect(updated?.esOfertaSemana).toBe(true);
  });

  it("el payload de actualizacion individual solo incluye precioVenta y modoPrecio", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository);
    const service = new ProductoService(repository);

    await service.fijarPrecioManualProducto("prod-1", 72000);

    const cambios = repository.actualizarProductoCalls[0].cambios as Record<string, unknown>;
    expect(Object.keys(cambios).sort()).toEqual(["modoPrecio", "precioVenta"]);
  });

  it("rechaza precio invalido (negativo, cero, NaN o vacio)", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository);
    const service = new ProductoService(repository);

    await expect(service.fijarPrecioManualProducto("prod-1", -100)).rejects.toThrow(/mayor que 0/);
    await expect(service.fijarPrecioManualProducto("prod-1", 0)).rejects.toThrow(/mayor que 0/);
    await expect(service.fijarPrecioManualProducto("prod-1", "no-es-numero")).rejects.toThrow();
    await expect(service.fijarPrecioManualProducto("prod-1", "")).rejects.toThrow(/no puede estar vacío/);

    // Ninguna escritura debe haber ocurrido tras los rechazos.
    expect(repository.actualizarProductoCalls).toHaveLength(0);
  });

  it("volverPrecioAutomaticoProducto recalcula desde costo+recargo y vuelve a AUTO", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { modoPrecio: "MANUAL", precioVenta: 99999 });
    const service = new ProductoService(repository);

    const result = await service.volverPrecioAutomaticoProducto("prod-1", 35);
    expect(result).toEqual({ id: "prod-1", precioVenta: 60750, modoPrecio: "AUTO" }); // 45000 * 1.35

    const updated = await repository.buscarProductoPorId("prod-1");
    expect(updated?.precioVenta).toBe(60750);
    expect(updated?.modoPrecio).toBe("AUTO");
    // Sigue preservando el resto.
    expect(updated?.stockActual).toBe(7);
    expect(updated?.esTop).toBe(true);
  });

  it("rechaza recargo fuera de 0..300 al volver a automatico", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository);
    const service = new ProductoService(repository);

    await expect(service.volverPrecioAutomaticoProducto("prod-1", -5)).rejects.toThrow();
    await expect(service.volverPrecioAutomaticoProducto("prod-1", 301)).rejects.toThrow();
  });
});

describe("ProductoService - edicion de costo unitario (actualizarCostoProducto)", () => {
  it("actualiza costo y recalcula precio con la misma formula (costo * (1 + recargo/100)), queda en AUTO", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { modoPrecio: "MANUAL", precioVenta: 99999 });
    const service = new ProductoService(repository);

    const result = await service.actualizarCostoProducto("prod-1", 50000, 35);
    expect(result).toEqual({ id: "prod-1", costoUnitario: 50000, precioVenta: 67500, modoPrecio: "AUTO" });

    const updated = await repository.buscarProductoPorId("prod-1");
    expect(updated?.costoUnitario).toBe(50000);
    expect(updated?.precioVenta).toBe(67500);
    expect(updated?.modoPrecio).toBe("AUTO");
  });

  it("acepta costo cero", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository);
    const service = new ProductoService(repository);

    const result = await service.actualizarCostoProducto("prod-1", 0, 35);
    expect(result).toEqual({ id: "prod-1", costoUnitario: 0, precioVenta: 0, modoPrecio: "AUTO" });
  });

  it("acepta costo decimal (se redondea el precio resultante, nunca el costo guardado)", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository);
    const service = new ProductoService(repository);

    const result = await service.actualizarCostoProducto("prod-1", 1234.5, 10);
    expect(result.costoUnitario).toBe(1234.5);
    expect(result.precioVenta).toBe(Math.round(1234.5 * 1.1));
  });

  it("preserva stock, imagen, Top12 y ofertas -- el payload de escritura solo incluye costo/precio/modo", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository);
    const service = new ProductoService(repository);

    await service.actualizarCostoProducto("prod-1", 50000, 35);

    const cambios = repository.actualizarProductoCalls[0].cambios as Record<string, unknown>;
    expect(Object.keys(cambios).sort()).toEqual(["costoUnitario", "modoPrecio", "precioVenta"]);

    const updated = await repository.buscarProductoPorId("prod-1");
    expect(updated?.stockActual).toBe(7);
    expect(updated?.imageUrl).toBe("/images/perfumes/top12/top-03-carolina-herrera-la-bomba.webp");
    expect(updated?.esTop).toBe(true);
    expect(updated?.esOfertaSemana).toBe(true);
  });

  it("rechaza costo invalido (negativo, NaN o no numerico)", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository);
    const service = new ProductoService(repository);

    await expect(service.actualizarCostoProducto("prod-1", -1, 35)).rejects.toThrow(/no puede ser negativo/);
    await expect(service.actualizarCostoProducto("prod-1", NaN, 35)).rejects.toThrow(/número válido/);
    await expect(service.actualizarCostoProducto("prod-1", "no-es-numero", 35)).rejects.toThrow();

    expect(repository.actualizarProductoCalls).toHaveLength(0);
  });

  it("rechaza recargo fuera de 0..300 y no escribe nada", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository);
    const service = new ProductoService(repository);

    await expect(service.actualizarCostoProducto("prod-1", 50000, -5)).rejects.toThrow();
    await expect(service.actualizarCostoProducto("prod-1", 50000, 301)).rejects.toThrow();
    expect(repository.actualizarProductoCalls).toHaveLength(0);
  });

  it("rechaza producto inexistente", async () => {
    const repository = new FullProductRepositoryStub();
    const service = new ProductoService(repository);

    await expect(service.actualizarCostoProducto("no-existe", 50000, 35)).rejects.toThrow(/no encontrado/);
  });

  it("usa la MISMA formula que el importador de proveedor y la creacion manual (sin duplicar logica)", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository);
    const service = new ProductoService(repository);

    const { calculateSalePrice } = await import("@/lib/catalog-import/supplier-import.ts");
    const result = await service.actualizarCostoProducto("prod-1", 38000, 42);
    expect(result.precioVenta).toBe(calculateSalePrice(38000, 42));
  });
});

describe("ProductoService - edicion masiva de precio", () => {
  it("previsualizarAjusteMasivoPrecio es un dry-run: no escribe nada", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository);
    const service = new ProductoService(repository);

    await service.previsualizarAjusteMasivoPrecio(["prod-1"], { type: "ajuste-porcentaje", porcentaje: 10 });

    expect(repository.actualizarProductoCalls).toHaveLength(0);
  });

  it("recargo: recalcula desde costo y deja el producto en AUTO", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { modoPrecio: "MANUAL" });
    const service = new ProductoService(repository);

    const preview = await service.previsualizarAjusteMasivoPrecio(["prod-1"], { type: "recargo", porcentaje: 35 });
    expect(preview.productos[0].precioNuevo).toBe(60750); // 45000 * 1.35

    await service.confirmarAjusteMasivoPrecio(["prod-1"], { type: "recargo", porcentaje: 35 });
    const updated = await repository.buscarProductoPorId("prod-1");
    expect(updated?.precioVenta).toBe(60750);
    expect(updated?.modoPrecio).toBe("AUTO");
  });

  it("ajuste por porcentaje: aplica sobre el precio actual y marca MANUAL", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository); // precioVenta 65000
    const service = new ProductoService(repository);

    await service.confirmarAjusteMasivoPrecio(["prod-1"], { type: "ajuste-porcentaje", porcentaje: 10 });
    const updated = await repository.buscarProductoPorId("prod-1");
    expect(updated?.precioVenta).toBe(71500); // 65000 * 1.10
    expect(updated?.modoPrecio).toBe("MANUAL");
  });

  it("ajuste por monto fijo: suma/resta un monto y marca MANUAL", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository);
    const service = new ProductoService(repository);

    await service.confirmarAjusteMasivoPrecio(["prod-1"], { type: "ajuste-monto", monto: -5000 });
    const updated = await repository.buscarProductoPorId("prod-1");
    expect(updated?.precioVenta).toBe(60000);
    expect(updated?.modoPrecio).toBe("MANUAL");
  });

  it("redondeo: redondea al paso indicado y preserva el modo previo", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { precioVenta: 60749, modoPrecio: "MANUAL" });
    const service = new ProductoService(repository);

    await service.confirmarAjusteMasivoPrecio(["prod-1"], { type: "redondeo", paso: 100 });
    const updated = await repository.buscarProductoPorId("prod-1");
    expect(updated?.precioVenta).toBe(60700);
    expect(updated?.modoPrecio).toBe("MANUAL"); // el redondeo no cambia el modo
  });

  it("edicion masiva nunca toca stock, imagen, Top12 ni ofertas", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository);
    const service = new ProductoService(repository);

    await service.confirmarAjusteMasivoPrecio(["prod-1"], { type: "ajuste-porcentaje", porcentaje: 20 });

    const cambios = repository.actualizarProductoCalls[0].cambios as Record<string, unknown>;
    expect(Object.keys(cambios).sort()).toEqual(["modoPrecio", "precioVenta"]);

    const updated = await repository.buscarProductoPorId("prod-1");
    expect(updated?.stockActual).toBe(7);
    expect(updated?.imageUrl).toBe("/images/perfumes/top12/top-03-carolina-herrera-la-bomba.webp");
    expect(updated?.esTop).toBe(true);
    expect(updated?.esOfertaSemana).toBe(true);
  });

  it("rechaza porcentaje de recargo invalido (fuera de 0..300) en el preview", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository);
    const service = new ProductoService(repository);

    const preview = await service.previsualizarAjusteMasivoPrecio(["prod-1"], { type: "recargo", porcentaje: 400 });
    expect(preview.erroresGlobales[0]).toMatch(/entre 0 y 300/);
    expect(preview.productos).toHaveLength(0);
  });

  it("rechaza paso de redondeo invalido", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository);
    const service = new ProductoService(repository);

    // @ts-expect-error paso invalido a proposito para probar la validacion server-side
    const preview = await service.previsualizarAjusteMasivoPrecio(["prod-1"], { type: "redondeo", paso: 250 });
    expect(preview.erroresGlobales[0]).toMatch(/100, 500 o 1000/);
  });

  it("aplica a multiples productos seleccionados y reporta cuantos se actualizaron", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { id: "prod-1", sku: "SML-A" });
    seedProduct(repository, { id: "prod-2", sku: "SML-B", nombre: "212 Vip", precioVenta: 40000 });
    const service = new ProductoService(repository);

    const result = await service.confirmarAjusteMasivoPrecio(["prod-1", "prod-2"], {
      type: "ajuste-porcentaje",
      porcentaje: 10
    });

    expect(result.actualizados).toBe(2);
    expect((await repository.buscarProductoPorId("prod-2"))?.precioVenta).toBe(44000);
  });
});
