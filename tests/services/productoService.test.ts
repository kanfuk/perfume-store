import { describe, expect, it } from "vitest";
import type { ProductRepository } from "@/repositories/productRepository";
import { ProductoService } from "@/services/productoService";

class ProductRepositoryStub implements ProductRepository {
  eliminarProductoCalls: string[] = [];

  private readonly products = new Map<
    string,
    {
      id: string;
      sku?: string;
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

  async buscarProductoPorSku(sku: string) {
    return Array.from(this.products.values()).find((product) => product.sku === sku) ?? null;
  }

  async crearProducto(producto: {
    id?: string;
    sku?: string;
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
      sku: producto.sku,
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
    this.eliminarProductoCalls.push(id);
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

const CSV_HEADER =
  "sku,nombre,marca,contenido,costo_unitario,precio_venta,stock,activo,es_top,orden_destacado,es_oferta_semana,precio_anterior,image_url";

function csvBuffer(...rows: string[]): Buffer {
  return Buffer.from([CSV_HEADER, ...rows].join("\n"), "utf8");
}

describe("ProductoService - importacion CSV masiva", () => {
  it("previsualizarImportacionCsv es un dry-run: no crea ni modifica productos", async () => {
    const repository = new ProductRepositoryStub();
    const service = new ProductoService(repository);
    const before = await repository.buscarTodosProductos();

    const buffer = csvBuffer("SML-NUEVO,La Bomba,Carolina Herrera,80ML,45000,65000,5,true,false,,false,,");
    const preview = await service.previsualizarImportacionCsv(buffer, "catalogo.csv", buffer.length);

    expect(preview.resumen).toEqual({ crear: 1, actualizar: 0, bloqueado: 0 });

    const after = await repository.buscarTodosProductos();
    expect(after).toEqual(before);
  });

  it("previsualizarImportacionCsv rechaza archivos que exceden el tamaño maximo", async () => {
    const repository = new ProductRepositoryStub();
    const service = new ProductoService(repository);
    const buffer = csvBuffer("SML-1,La Bomba,Carolina Herrera,80ML,,,,,,,,,");

    const preview = await service.previsualizarImportacionCsv(buffer, "catalogo.csv", 3 * 1024 * 1024);
    expect(preview.erroresGlobales[0]).toMatch(/tamaño máximo/);
  });

  it("confirmarImportacionCsv crea un producto nuevo por SKU (CREAR)", async () => {
    const repository = new ProductRepositoryStub();
    const service = new ProductoService(repository);

    const preview = await service.previsualizarImportacionCsv(
      csvBuffer("SML-NUEVO,La Bomba,Carolina Herrera,80ML,45000,65000,5,true,false,,false,,"),
      "catalogo.csv",
      100
    );
    const result = await service.confirmarImportacionCsv(preview.filasValidas);

    expect(result).toEqual({ creados: 1, actualizados: 0 });
    const created = await repository.buscarProductoPorSku("SML-NUEVO");
    expect(created?.nombre).toBe("La Bomba");
  });

  it("confirmarImportacionCsv actualiza por SKU cuando el producto ya existe (upsert, nunca duplica)", async () => {
    const repository = new ProductRepositoryStub();
    await repository.crearProducto({
      id: "existente-1",
      sku: "SML-EXISTENTE",
      nombre: "Nombre viejo",
      precioVenta: 1000,
      activo: false
    });
    const service = new ProductoService(repository);

    const preview = await service.previsualizarImportacionCsv(
      csvBuffer("SML-EXISTENTE,Nombre nuevo,Carolina Herrera,80ML,45000,70000,8,true,false,,false,,"),
      "catalogo.csv",
      100
    );
    const result = await service.confirmarImportacionCsv(preview.filasValidas);

    expect(result).toEqual({ creados: 0, actualizados: 1 });
    const updated = await repository.buscarProductoPorId("existente-1");
    expect(updated?.nombre).toBe("Nombre nuevo");
    expect(updated?.precioVenta).toBe(70000);

    const allProducts = await repository.buscarTodosProductos();
    expect(allProducts.filter((p) => p.sku === "SML-EXISTENTE")).toHaveLength(1);
  });

  it("confirmarImportacionCsv nunca elimina productos ausentes del archivo", async () => {
    const repository = new ProductRepositoryStub();
    const service = new ProductoService(repository);
    const beforeCount = (await repository.buscarTodosProductos()).length;

    const preview = await service.previsualizarImportacionCsv(
      csvBuffer("SML-OTRO,Otro perfume,Otra Marca,50ML,,,,,,,,,"),
      "catalogo.csv",
      100
    );
    await service.confirmarImportacionCsv(preview.filasValidas);

    expect(repository.eliminarProductoCalls).toHaveLength(0);
    const afterCount = (await repository.buscarTodosProductos()).length;
    expect(afterCount).toBe(beforeCount + 1);
    // El producto preexistente ("producto-1") sigue intacto: no fue tocado ni eliminado.
    expect(await repository.buscarProductoPorId("producto-1")).not.toBeNull();
  });

  it("productos bloqueados/incompletos (activo=false tras la importacion) no se exponen publicamente", async () => {
    const repository = new ProductRepositoryStub();
    const service = new ProductoService(repository);

    // Fila sin precio ni stock -> queda inactiva (bloqueada), como exige el import canonico.
    const preview = await service.previsualizarImportacionCsv(
      csvBuffer("SML-BLOQUEADO,Producto incompleto,Marca,50ML,,,,,,,,,"),
      "catalogo.csv",
      100
    );
    await service.confirmarImportacionCsv(preview.filasValidas);

    const activos = await service.obtenerProductosActivos();
    expect(activos.some((p) => p.nombre === "Producto incompleto")).toBe(false);
  });
});
