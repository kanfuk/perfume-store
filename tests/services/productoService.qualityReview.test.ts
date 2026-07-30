import { describe, expect, it } from "vitest";
import type { ProductoProps } from "@/domain/Producto";
import type { ProductRepository } from "@/repositories/productRepository";
import { ProductoService } from "@/services/productoService";
import type { QualityDecision } from "@/lib/catalog-import/quality-review.ts";

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
}

const HEADER = "Perfume;Marca;Contenido;Precio Compra";
function supplierCsv(...rows: string[]): Buffer {
  return Buffer.from([HEADER, ...rows].join("\n"), "utf8");
}

function seedExistingProduct(repository: FullProductRepositoryStub, overrides: Partial<ProductoProps> = {}) {
  repository.seed({
    id: "existente-1",
    sku: "SML-CAROLINA-HERRERA-LA-BOMBA-80ML",
    nombre: "La Bomba",
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
    tipoProducto: "simple",
    ...overrides
  });
}

describe("ProductoService - asistente de calidad (Fase 2B.7)", () => {
  it("revisarCalidadImportacionProveedor es de solo lectura: no escribe nada", async () => {
    const repository = new FullProductRepositoryStub();
    seedExistingProduct(repository);
    const service = new ProductoService(repository);

    const buffer = supplierCsv(
      "Lady million;Paco Rabanne;30ml;25000",
      "Lady million;Paco Rabanne;50ml;35000"
    );
    const review = await service.revisarCalidadImportacionProveedor(buffer);

    expect(review.summary.filasUtiles).toBe(2);
    expect(review.findings.some((f) => f.type === "VARIANT")).toBe(true);
    expect(repository.crearProductoCalls).toHaveLength(0);
    expect(repository.actualizarProductoCalls).toHaveLength(0);
  });

  it("detecta EXISTING_CATALOG_MATCH cuando la identidad coincide con un SKU historico distinto", async () => {
    const repository = new FullProductRepositoryStub();
    seedExistingProduct(repository, { sku: "SML-VIEJO-HISTORICO" });
    const service = new ProductoService(repository);

    const buffer = supplierCsv("La Bomba;Carolina Herrera;80ML;58000");
    const review = await service.revisarCalidadImportacionProveedor(buffer);

    const finding = review.findings.find((f) => f.type === "EXISTING_CATALOG_MATCH");
    expect(finding).toBeDefined();
    expect(finding?.existingProductId).toBe("existente-1");
  });

  it("construirPlanConDecisiones es de solo lectura y regenera el SKU final tras aplicar decisiones", async () => {
    const repository = new FullProductRepositoryStub();
    const service = new ProductoService(repository);

    const buffer = supplierCsv(
      "Versace Brigth crystal;Versace;50ML;42000",
      "Bright Crystal EDT;Versace;50ML;36000"
    );
    const review = await service.revisarCalidadImportacionProveedor(buffer);
    const finding = review.findings.find((f) => f.type === "POSSIBLE_DUPLICATE")!;
    const decisions: QualityDecision[] = [
      { findingId: finding.id, optionId: "UNIFY_UNDER_FIRST", costFromRow: finding.rowNumbers[1] }
    ];

    const { applied } = await service.construirPlanConDecisiones(buffer, 35, decisions);

    expect(applied.plan).toHaveLength(1);
    expect(applied.plan[0].costoUnitario).toBe(36000);
    expect(repository.crearProductoCalls).toHaveLength(0);
    expect(repository.actualizarProductoCalls).toHaveLength(0);
  });

  it("flujo completo: revisar -> aplicar decisiones -> confirmar escribe el plan final resuelto", async () => {
    const repository = new FullProductRepositoryStub();
    const service = new ProductoService(repository);

    const buffer = supplierCsv(
      "La Bomba;Carolina Herrera;80ML;58000",
      "La Bomba;Carolina Herrera;80ML;62000"
    );
    const review = await service.revisarCalidadImportacionProveedor(buffer);
    const duplicate = review.findings.find((f) => f.type === "EXACT_DUPLICATE")!;
    const decisions: QualityDecision[] = [{ findingId: duplicate.id, optionId: "KEEP_SECOND" }];

    const { applied } = await service.construirPlanConDecisiones(buffer, 35, decisions);
    expect(applied.unresolvedBlockers).toHaveLength(0);
    expect(applied.plan).toHaveLength(1);
    expect(applied.plan[0].costoUnitario).toBe(62000);

    const finalPlan = applied.plan.map((row) => ({ ...row, rowNumber: row.rowNumbers[0] }));
    const result = await service.confirmarImportacionProveedor(finalPlan);
    expect(result.creados).toBe(1);

    const created = await repository.buscarProductoPorSku(applied.plan[0].sku);
    expect(created?.costoUnitario).toBe(62000);
  });

  it("EXISTING_CATALOG_MATCH + decision UPDATE_EXISTING preserva stock/activo/imagen/Top12 del producto existente", async () => {
    const repository = new FullProductRepositoryStub();
    seedExistingProduct(repository, { sku: "SML-VIEJO-HISTORICO" });
    const service = new ProductoService(repository);

    const buffer = supplierCsv("La Bomba;Carolina Herrera;80ML;50000");
    const review = await service.revisarCalidadImportacionProveedor(buffer);
    const finding = review.findings.find((f) => f.type === "EXISTING_CATALOG_MATCH")!;
    const decisions: QualityDecision[] = [
      { findingId: finding.id, optionId: "UPDATE_EXISTING", targetProductId: "existente-1" }
    ];

    const { applied } = await service.construirPlanConDecisiones(buffer, 35, decisions);
    expect(applied.plan[0].sku).toBe("SML-VIEJO-HISTORICO");
    expect(applied.plan[0].action).toBe("ACTUALIZAR");

    const finalPlan = applied.plan.map((row) => ({ ...row, rowNumber: row.rowNumbers[0] }));
    await service.confirmarImportacionProveedor(finalPlan);

    const updated = await repository.buscarProductoPorId("existente-1");
    expect(updated?.costoUnitario).toBe(50000);
    expect(updated?.stockActual).toBe(7); // preservado
    expect(updated?.esTop).toBe(true); // preservado
    expect(updated?.imageUrl).toBe("/images/perfumes/top12/top-03-carolina-herrera-la-bomba.webp"); // preservado
  });

  it("obtenerProductosParaRevisionCalidad omite productos sin SKU", async () => {
    const repository = new FullProductRepositoryStub();
    seedExistingProduct(repository);
    repository.seed({
      id: "sin-sku",
      nombre: "Producto sin sku",
      precioVenta: 1000
    } as ProductoProps);
    const service = new ProductoService(repository);

    const productos = await service.obtenerProductosParaRevisionCalidad();
    expect(productos).toHaveLength(1);
    expect(productos[0].productId).toBe("existente-1");
  });
});
