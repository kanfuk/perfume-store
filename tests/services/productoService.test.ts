import { describe, expect, it } from "vitest";
import type { ProductRepository } from "@/repositories/productRepository";
import { ProductoService } from "@/services/productoService";

class ProductRepositoryStub implements ProductRepository {
  private readonly products = new Map<
    string,
    {
      id: string;
      nombre: string;
      descripcion: string;
      precioVenta: number;
      costoUnitario: number;
      stockActual: number;
      stockAgenda: number;
      activo: boolean;
      tipoProducto: string;
    }
  >();

  constructor() {
    this.products.set("producto-1", {
      id: "producto-1",
      nombre: "Pan amasado",
      descripcion: "",
      precioVenta: 1000,
      costoUnitario: 250,
      stockActual: 3,
      stockAgenda: 3,
      activo: true,
      tipoProducto: "simple"
    });
  }

  async buscarProductosActivos() {
    return Array.from(this.products.values()).filter((product) => product.activo);
  }

  async buscarTodosProductos() {
    return Array.from(this.products.values());
  }

  async buscarProductoPorId(id: string) {
    return this.products.get(id) ?? null;
  }

  async crearProducto(producto: {
    id?: string;
    nombre: string;
    descripcion?: string;
    precioVenta: number;
    imageUrl?: string;
    badgeLabel?: string;
    costoUnitario?: number;
    stockActual?: number;
    stockAgenda?: number;
    activo?: boolean;
    tipoProducto?: string;
  }) {
    const id = producto.id ?? "producto-nuevo";
    this.products.set(id, {
      id,
      nombre: producto.nombre,
      descripcion: producto.descripcion ?? "",
      precioVenta: producto.precioVenta,
      costoUnitario: producto.costoUnitario ?? 0,
      stockActual: producto.stockActual ?? 0,
      stockAgenda: producto.stockAgenda ?? producto.stockActual ?? 0,
      activo: producto.activo ?? true,
      tipoProducto: producto.tipoProducto ?? "simple"
    });

    return this.products.get(id)!;
  }

  async actualizarProducto(
    id: string,
    cambios: {
      nombre?: string;
      descripcion?: string;
      precioVenta?: number;
      imageUrl?: string;
      badgeLabel?: string;
      costoUnitario?: number;
      stockActual?: number;
      stockAgenda?: number;
      activo?: boolean;
      tipoProducto?: string;
    }
  ) {
    const current = this.products.get(id);

    if (!current) {
      throw new Error("Producto no encontrado.");
    }

    const updated = {
      ...current,
      ...cambios,
      descripcion: cambios.descripcion ?? current.descripcion,
      costoUnitario: cambios.costoUnitario ?? current.costoUnitario,
      stockActual: cambios.stockActual ?? current.stockActual,
      stockAgenda: cambios.stockAgenda ?? current.stockAgenda,
      activo: cambios.activo ?? current.activo,
      tipoProducto: cambios.tipoProducto ?? current.tipoProducto
    };

    this.products.set(id, updated);
    return updated;
  }

  async ajustarStockAgenda(id: string, cantidad: number) {
    const current = this.products.get(id);

    if (!current) {
      throw new Error("Producto no encontrado.");
    }

    const nextStock = current.stockAgenda + cantidad;
    const updated = {
      ...current,
      stockActual: nextStock,
      stockAgenda: nextStock,
      activo: nextStock > 0 ? current.activo : false
    };

    this.products.set(id, updated);
    return updated;
  }

  async eliminarProducto(id: string) {
    this.products.delete(id);
  }
}

describe("ProductoService admin rules", () => {
  it("crea productos sin stock como pausados", async () => {
    const repository = new ProductRepositoryStub();
    const service = new ProductoService(repository);

    await service.crearProductoAdmin({
      nombre: "Producto sin stock",
      precioVenta: 2000,
      stockActual: 0,
      activo: true
    });

    const created = (await repository.buscarTodosProductos()).find(
      (product) => product.nombre === "Producto sin stock"
    );
    expect(created?.activo).toBe(false);
  });

  it("pausa productos al dejarlos con stock 0 desde admin", async () => {
    const repository = new ProductRepositoryStub();
    const service = new ProductoService(repository);

    await service.actualizarProductoAdmin("producto-1", {
      nombre: "Pan amasado",
      precioVenta: 1000,
      stockActual: 0,
      activo: true
    });

    const updated = await repository.buscarProductoPorId("producto-1");
    expect(updated?.activo).toBe(false);
    expect(updated?.stockActual).toBe(0);
  });

  it("bloquea reactivar un producto sin stock", async () => {
    const repository = new ProductRepositoryStub();
    const service = new ProductoService(repository);

    await service.actualizarProductoAdmin("producto-1", {
      nombre: "Pan amasado",
      precioVenta: 1000,
      stockActual: 0,
      activo: false
    });

    await expect(service.cambiarEstadoProducto("producto-1", true)).rejects.toThrow(
      "Repone stock antes de volver a activar este producto."
    );
  });
});
