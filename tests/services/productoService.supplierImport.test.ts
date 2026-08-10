import { describe, expect, it } from "vitest";
import type { ProductoProps } from "@/domain/Producto";
import type { ProductRepository } from "@/repositories/productRepository";
import { ProductoService } from "@/services/productoService";

/**
 * Stub de repositorio que preserva TODOS los campos de ProductoProps
 * (a diferencia del stub minimalista de productoService.test.ts), necesario
 * para verificar que la importacion de proveedor nunca toca stock, activo,
 * imagen, Top 12 u ofertas de un producto ya existente.
 */
class FullProductRepositoryStub implements ProductRepository {
  crearProductoCalls: unknown[] = [];
  actualizarProductoCalls: Array<{ id: string; cambios: unknown }> = [];
  eliminarProductoCalls: string[] = [];

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
    this.crearProductoCalls.push(producto);
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

  async eliminarProducto(id: string) {
    this.eliminarProductoCalls.push(id);
    this.products.delete(id);
  }

  async archivarProductoSeguro() {
    return { alreadyArchived: false };
  }

  async eliminarProductoSeguro() {
    return {};
  }
}

const HEADER = "Perfume;Marca;Contenido;Precio Compra";
function supplierCsv(...rows: string[]): Buffer {
  return Buffer.from([HEADER, ...rows].join("\n"), "utf8");
}

const EXISTING_SKU = "SML-CAROLINA-HERRERA-LA-BOMBA-80ML";

function seedExistingProduct(repository: FullProductRepositoryStub) {
  repository.seed({
    id: "existente-1",
    sku: EXISTING_SKU,
    nombre: "La Bomba (nombre viejo)",
    marca: "Carolina Herrera",
    contenido: "80ML",
    descripcion: "",
    precioVenta: 65000,
    costoUnitario: 45000,
    stockActual: 7,
    stockAgenda: 7,
    stockReservado: 2,
    stockMinimo: 1,
    activo: true,
    esTop: true,
    ordenDestacado: 3,
    esOfertaSemana: true,
    precioAnterior: 70000,
    imageUrl: "/images/perfumes/top12/top-03-carolina-herrera-la-bomba.webp",
    badgeLabel: "TOP 12",
    tipoProducto: "simple"
  });
}

describe("ProductoService - importacion de proveedor (preservacion de campos)", () => {
  it("previsualizarImportacionProveedor es un dry-run: no crea ni modifica nada", async () => {
    const repository = new FullProductRepositoryStub();
    seedExistingProduct(repository);
    const service = new ProductoService(repository);

    await service.previsualizarImportacionProveedor(
      supplierCsv("La Bomba;Carolina Herrera;80ML;50000"),
      "proveedor.csv",
      200,
      35
    );

    expect(repository.crearProductoCalls).toHaveLength(0);
    expect(repository.actualizarProductoCalls).toHaveLength(0);
  });

  it("producto existente: actualiza costo y precio, preserva stock/activo/imagen/Top12/ofertas", async () => {
    const repository = new FullProductRepositoryStub();
    seedExistingProduct(repository);
    const service = new ProductoService(repository);

    const preview = await service.previsualizarImportacionProveedor(
      supplierCsv("La Bomba;Carolina Herrera;80ML;50000"),
      "proveedor.csv",
      200,
      35
    );
    expect(preview.plan[0].action).toBe("ACTUALIZAR");

    await service.confirmarImportacionProveedor(preview.plan);

    const updated = await repository.buscarProductoPorId("existente-1");
    expect(updated?.costoUnitario).toBe(50000);
    expect(updated?.precioVenta).toBe(67500); // 50000 * 1.35
    expect(updated?.nombre).toBe("La Bomba");

    // Preservado intacto: nunca tocado por la importacion de proveedor.
    expect(updated?.stockActual).toBe(7);
    expect(updated?.stockReservado).toBe(2);
    expect(updated?.activo).toBe(true);
    expect(updated?.imageUrl).toBe("/images/perfumes/top12/top-03-carolina-herrera-la-bomba.webp");
    expect(updated?.esTop).toBe(true);
    expect(updated?.ordenDestacado).toBe(3);
    expect(updated?.esOfertaSemana).toBe(true);
    expect(updated?.precioAnterior).toBe(70000);
  });

  it("producto existente en modo MANUAL: la importacion actualiza el costo pero preserva el precio manual", async () => {
    const repository = new FullProductRepositoryStub();
    seedExistingProduct(repository);
    await repository.actualizarProducto("existente-1", { precioVenta: 72000, modoPrecio: "MANUAL" });
    const service = new ProductoService(repository);

    const preview = await service.previsualizarImportacionProveedor(
      supplierCsv("La Bomba;Carolina Herrera;80ML;50000"),
      "proveedor.csv",
      200,
      35
    );

    expect(preview.plan[0].modoPrecio).toBe("MANUAL");
    expect(preview.plan[0].precioVentaFinal).toBe(72000); // preservado, nunca sobrescrito
    expect(preview.plan[0].precioVentaSugerido).toBe(67500); // solo referencia (50000 * 1.35)

    await service.confirmarImportacionProveedor(preview.plan);

    const updated = await repository.buscarProductoPorId("existente-1");
    expect(updated?.costoUnitario).toBe(50000); // el costo SI se actualiza
    expect(updated?.precioVenta).toBe(72000); // el precio manual queda intacto
  });

  it("el payload de actualizacion solo incluye nombre/marca/contenido/costo/precio (nunca stock/activo/imagen/top12)", async () => {
    const repository = new FullProductRepositoryStub();
    seedExistingProduct(repository);
    const service = new ProductoService(repository);

    const preview = await service.previsualizarImportacionProveedor(
      supplierCsv("La Bomba;Carolina Herrera;80ML;50000"),
      "proveedor.csv",
      200,
      35
    );
    await service.confirmarImportacionProveedor(preview.plan);

    const cambios = repository.actualizarProductoCalls[0].cambios as Record<string, unknown>;
    expect(Object.keys(cambios).sort()).toEqual(
      ["nombre", "marca", "contenido", "costoUnitario", "precioVenta", "modoPrecio"].sort()
    );
  });

  it("producto nuevo: se crea activo con stock 1 y aparece de inmediato en el catalogo publico", async () => {
    const repository = new FullProductRepositoryStub();
    const service = new ProductoService(repository);

    const preview = await service.previsualizarImportacionProveedor(
      supplierCsv("Producto nuevo;Marca Nueva;100ML;40000"),
      "proveedor.csv",
      200,
      35
    );
    expect(preview.plan[0].action).toBe("CREAR");

    await service.confirmarImportacionProveedor(preview.plan);

    const created = await repository.buscarProductoPorSku(preview.plan[0].sku);
    expect(created).not.toBeNull();
    expect(created?.stockActual).toBe(1);
    expect(created?.stockAgenda).toBe(1);
    expect(created?.stockReservado).toBe(0);
    expect(created?.stockMinimo).toBe(0);
    expect(created?.activo).toBe(true);
    expect(created?.esTop).toBe(false);
    expect(created?.ordenDestacado).toBeUndefined();
    expect(created?.esOfertaSemana).toBe(false);
    expect(created?.modoPrecio).toBe("AUTO");
    expect(created?.precioVenta).toBe(54000); // 40000 * 1.35
  });

  it("producto nuevo con Precio Venta CSV se crea MANUAL y no aplica markup", async () => {
    const repository = new FullProductRepositoryStub();
    const service = new ProductoService(repository);
    const buffer = Buffer.from(
      "Perfume;Marca;Contenido;Costo Unitario;Precio Venta\nProducto cliente;Marca Nueva;100ML;40000;$49.990",
      "utf8"
    );

    const preview = await service.previsualizarImportacionProveedor(buffer, "proveedor.csv", 200, 35);
    await service.confirmarImportacionProveedor(preview.plan);

    const created = await repository.buscarProductoPorSku(preview.plan[0].sku);
    expect(created?.precioVenta).toBe(49990);
    expect(created?.modoPrecio).toBe("MANUAL");
  });

  it("nunca elimina productos ausentes del archivo", async () => {
    const repository = new FullProductRepositoryStub();
    seedExistingProduct(repository);
    const service = new ProductoService(repository);
    const beforeCount = (await repository.buscarTodosProductos()).length;

    const preview = await service.previsualizarImportacionProveedor(
      supplierCsv("Otro perfume;Otra Marca;50ML;30000"),
      "proveedor.csv",
      200,
      35
    );
    await service.confirmarImportacionProveedor(preview.plan);

    expect(repository.eliminarProductoCalls).toHaveLength(0);
    expect(await repository.buscarProductoPorId("existente-1")).not.toBeNull();
    expect((await repository.buscarTodosProductos()).length).toBe(beforeCount + 1);
  });

  it("no duplica productos: dos importaciones sucesivas del mismo proveedor actualizan, no crean de nuevo", async () => {
    const repository = new FullProductRepositoryStub();
    const service = new ProductoService(repository);

    const preview1 = await service.previsualizarImportacionProveedor(
      supplierCsv("La Bomba;Carolina Herrera;80ML;58000"),
      "proveedor.csv",
      200,
      35
    );
    await service.confirmarImportacionProveedor(preview1.plan);

    const preview2 = await service.previsualizarImportacionProveedor(
      supplierCsv("La Bomba;Carolina Herrera;80ML;60000"),
      "proveedor.csv",
      200,
      35
    );
    expect(preview2.plan[0].action).toBe("ACTUALIZAR");

    await service.confirmarImportacionProveedor(preview2.plan);

    const all = await repository.buscarTodosProductos();
    expect(all.filter((p) => p.sku === EXISTING_SKU)).toHaveLength(1);
    expect(all.find((p) => p.sku === EXISTING_SKU)?.costoUnitario).toBe(60000);
  });
});
