import { describe, expect, it, vi } from "vitest";
import type { ProductoProps } from "@/domain/Producto";
import type { ProductRepository } from "@/repositories/productRepository";
import type { TopProductsRankingRepository } from "@/repositories/topProductsRankingRepository";
import { ProductoService } from "@/services/productoService";

class ProductRepositoryStub implements ProductRepository {
  constructor(public products: ProductoProps[]) {}

  async buscarProductosActivos() {
    return this.products.filter((product) => product.activo !== false);
  }
  async buscarTodosProductos() {
    return this.products;
  }
  async buscarProductoPorId(id: string) {
    return this.products.find((product) => product.id === id) ?? null;
  }
  async buscarProductoPorSku(sku: string) {
    return this.products.find((product) => product.sku === sku) ?? null;
  }
  async crearProducto(producto: Omit<ProductoProps, "id"> & { id?: string }) {
    const created = { ...producto, id: producto.id ?? crypto.randomUUID() } as ProductoProps;
    this.products.push(created);
    return created;
  }
  async eliminarProducto(id: string) {
    this.products = this.products.filter((product) => product.id !== id);
  }
  async actualizarProducto(id: string, changes: Partial<Omit<ProductoProps, "id">>) {
    const product = await this.buscarProductoPorId(id);
    if (!product) throw new Error("Producto no encontrado.");
    Object.assign(product, changes);
    return product;
  }
  async ajustarStockAgenda(id: string, cantidad: number) {
    const product = await this.buscarProductoPorId(id);
    if (!product) throw new Error("Producto no encontrado.");
    product.stockActual = (product.stockActual ?? 0) + cantidad;
    product.stockAgenda = product.stockActual;
    return product;
  }
}

function product(id: string, overrides: Partial<ProductoProps> = {}): ProductoProps {
  return {
    id,
    nombre: `Perfume ${id}`,
    marca: "Marca",
    contenido: "100 ml",
    precioVenta: 10000,
    costoUnitario: 5000,
    stockActual: 5,
    activo: true,
    ...overrides
  };
}

function topRepository(
  ranking: Awaited<ReturnType<TopProductsRankingRepository["obtenerRankingEfectivo"]>>
): TopProductsRankingRepository {
  return {
    obtenerConfiguracion: vi.fn(async () => ({ mode: "AUTOMATIC" as const, salesWindowDays: 30 })),
    guardarConfiguracion: vi.fn(async (configuration) => configuration),
    obtenerRankingEfectivo: vi.fn(async () => ranking)
  };
}

describe("ProductoService con ranking efectivo", () => {
  it("la API pública reemplaza flags manuales por el ranking efectivo", async () => {
    const repository = new ProductRepositoryStub([
      product("manual", { esTop: true, ordenDestacado: 1 }),
      product("sales")
    ]);
    const service = new ProductoService(
      repository,
      topRepository([
        { rank: 1, productId: "sales", source: "AUTOMATIC", unitsSold: 8, revenue: 80000 }
      ])
    );

    const publicProducts = await service.obtenerProductosActivos();
    expect(publicProducts.find((entry) => entry.id === "manual")?.esTop).toBe(false);
    expect(publicProducts.find((entry) => entry.id === "sales")).toMatchObject({
      esTop: true,
      ordenDestacado: 1
    });
  });

  it("el estado administrativo incluye origen y métricas del ranking", async () => {
    const repository = new ProductRepositoryStub([product("sales")]);
    const service = new ProductoService(
      repository,
      topRepository([
        { rank: 3, productId: "sales", source: "AUTOMATIC", unitsSold: 4, revenue: 50000 }
      ])
    );

    const slots = await service.obtenerEstadoTop12();
    expect(slots[2]).toMatchObject({
      rank: 3,
      source: "AUTOMATIC",
      unitsSold: 4,
      revenue: 50000,
      producto: { id: "sales" }
    });
  });

  it("el resumen de catálogo cuenta posiciones efectivas, no flags históricos", async () => {
    const repository = new ProductRepositoryStub([
      product("manual", { esTop: true, ordenDestacado: 1 }),
      product("sales")
    ]);
    const service = new ProductoService(
      repository,
      topRepository([
        { rank: 1, productId: "sales", source: "AUTOMATIC", unitsSold: 8, revenue: 80000 }
      ])
    );

    const summary = await service.obtenerResumenCatalogo();
    expect(summary.top12Asignados).toBe(1);
    expect(summary.top12Pendientes).toBe(14);
  });
});
