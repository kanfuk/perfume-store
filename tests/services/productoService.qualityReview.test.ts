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

  it("al resolver un duplicado conserva el Precio Venta CSV de la fila autorizada", async () => {
    const repository = new FullProductRepositoryStub();
    const service = new ProductoService(repository);
    const buffer = Buffer.from(
      [
        "Perfume;Marca;Contenido;Costo Unitario;Precio Venta",
        "One Million EDT;Paco Rabanne;50 ml;22000;42990",
        "One million edt;Paco Rabanne;50 ml;20000;40990"
      ].join("\n"),
      "utf8"
    );
    const review = await service.revisarCalidadImportacionProveedor(buffer);
    const duplicate = review.findings.find((finding) => finding.type === "EXACT_DUPLICATE")!;

    const { applied } = await service.construirPlanConDecisiones(buffer, 35, [
      { findingId: duplicate.id, optionId: "KEEP_SECOND" }
    ]);

    expect(applied.plan).toHaveLength(1);
    expect(applied.plan[0]).toMatchObject({
      rowNumbers: [3],
      costoUnitario: 20000,
      precioVentaCsv: 40990,
      precioVentaFinal: 40990,
      modoPrecio: "MANUAL"
    });
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

  it(
    "EXCLUDE_FIRST: una fila excluida no termina creada (Fase D, matriz de acciones CSV -- " +
      "cubre el contrato completo CSV -> preview -> finding -> decision -> final-plan -> confirmacion)",
    async () => {
      const repository = new FullProductRepositoryStub();
      const service = new ProductoService(repository);

      const buffer = supplierCsv(
        "La Bomba;Carolina Herrera;80ML;58000",
        "La Bomba;Carolina Herrera;80ML;62000"
      );
      const review = await service.revisarCalidadImportacionProveedor(buffer);
      const duplicate = review.findings.find((f) => f.type === "EXACT_DUPLICATE")!;
      const decisions: QualityDecision[] = [{ findingId: duplicate.id, optionId: "EXCLUDE_SECOND" }];

      const { applied } = await service.construirPlanConDecisiones(buffer, 35, decisions);
      expect(applied.plan).toHaveLength(1);
      expect(applied.plan[0].costoUnitario).toBe(58000); // sobrevive la primera fila (58000), no la excluida (62000)

      const finalPlan = applied.plan.map((row) => ({ ...row, rowNumber: row.rowNumbers[0] }));
      const result = await service.confirmarImportacionProveedor(finalPlan);
      expect(result.creados).toBe(1);

      const allProducts = await repository.buscarTodosProductos();
      expect(allProducts).toHaveLength(1);
      expect(allProducts[0].costoUnitario).toBe(58000);
    }
  );

  it("MISSING_NAME + EDIT_NAME: la fila creada usa el nombre editado, no queda bloqueada", async () => {
    const repository = new FullProductRepositoryStub();
    const service = new ProductoService(repository);

    const buffer = supplierCsv(";Paco Rabanne;50ML;30000");
    const review = await service.revisarCalidadImportacionProveedor(buffer);
    const finding = review.findings.find((f) => f.type === "MISSING_NAME")!;
    expect(finding.severity).toBe("BLOCKER");

    const decisions: QualityDecision[] = [
      { findingId: finding.id, optionId: "EDIT_NAME", textValue: "Invictus" }
    ];
    const { applied } = await service.construirPlanConDecisiones(buffer, 35, decisions);
    expect(applied.unresolvedBlockers).toHaveLength(0);
    expect(applied.plan[0].nombre).toBe("Invictus");

    const finalPlan = applied.plan.map((row) => ({ ...row, rowNumber: row.rowNumbers[0] }));
    await service.confirmarImportacionProveedor(finalPlan);
    const created = await repository.buscarProductoPorSku(applied.plan[0].sku);
    expect(created?.nombre).toBe("Invictus");
  });

  it("MISSING_BRAND + SET_BRAND_MANUAL: la fila creada usa la marca escrita a mano", async () => {
    const repository = new FullProductRepositoryStub();
    const service = new ProductoService(repository);

    const buffer = supplierCsv("1 Million;;100ML;28000");
    const review = await service.revisarCalidadImportacionProveedor(buffer);
    const finding = review.findings.find((f) => f.type === "MISSING_BRAND")!;

    const decisions: QualityDecision[] = [
      { findingId: finding.id, optionId: "SET_BRAND_MANUAL", textValue: "Paco Rabanne" }
    ];
    const { applied } = await service.construirPlanConDecisiones(buffer, 35, decisions);
    expect(applied.unresolvedBlockers).toHaveLength(0);
    expect(applied.plan[0].marca).toBe("Paco Rabanne");

    const finalPlan = applied.plan.map((row) => ({ ...row, rowNumber: row.rowNumbers[0] }));
    await service.confirmarImportacionProveedor(finalPlan);
    const created = await repository.buscarProductoPorSku(applied.plan[0].sku);
    expect(created?.marca).toBe("Paco Rabanne");
  });

  it("MISSING_CONTENT + EDIT_CONTENT: la fila creada usa el contenido corregido, no queda bloqueada", async () => {
    const repository = new FullProductRepositoryStub();
    const service = new ProductoService(repository);

    const buffer = supplierCsv("1 Million;Paco Rabanne;;28000");
    const review = await service.revisarCalidadImportacionProveedor(buffer);
    const finding = review.findings.find((f) => f.type === "MISSING_CONTENT")!;
    expect(finding.severity).toBe("BLOCKER");

    const decisions: QualityDecision[] = [
      { findingId: finding.id, optionId: "EDIT_CONTENT", textValue: "100ML" }
    ];
    const { applied } = await service.construirPlanConDecisiones(buffer, 35, decisions);
    expect(applied.unresolvedBlockers).toHaveLength(0);
    expect(applied.plan[0].contenido).toBe("100ML");

    const finalPlan = applied.plan.map((row) => ({ ...row, rowNumber: row.rowNumbers[0] }));
    await service.confirmarImportacionProveedor(finalPlan);
    const created = await repository.buscarProductoPorSku(applied.plan[0].sku);
    expect(created?.contenido).toBe("100ML");
  });

  it("PRICE_ANOMALY (BLOCKER, costo invalido) + EDIT_COST: usa el costo corregido, no queda bloqueada", async () => {
    const repository = new FullProductRepositoryStub();
    const service = new ProductoService(repository);

    const buffer = supplierCsv("Sauvage;Dior;100ML;0");
    const review = await service.revisarCalidadImportacionProveedor(buffer);
    const finding = review.findings.find((f) => f.type === "PRICE_ANOMALY" && f.severity === "BLOCKER")!;

    const decisions: QualityDecision[] = [
      { findingId: finding.id, optionId: "EDIT_COST", numberValue: 40000 }
    ];
    const { applied } = await service.construirPlanConDecisiones(buffer, 35, decisions);
    expect(applied.unresolvedBlockers).toHaveLength(0);
    expect(applied.plan[0].costoUnitario).toBe(40000);
  });

  it(
    "BRAND_INCONSISTENCY + USE_SUGGESTED_BRAND con applyToAllInFile: unifica la marca " +
      "en todas las filas con la misma variante detectada, no solo en la fila del hallazgo",
    async () => {
      const repository = new FullProductRepositoryStub();
      const service = new ProductoService(repository);

      const buffer = supplierCsv(
        "Black Opium;Yves Saint Laurent;30ML;20000",
        "Libre;Ives Saint Laurent;50ML;25000"
      );
      const review = await service.revisarCalidadImportacionProveedor(buffer);
      const finding = review.findings.find((f) => f.type === "BRAND_INCONSISTENCY")!;
      expect(finding.rowNumbers).toHaveLength(2);

      const decisions: QualityDecision[] = [
        {
          findingId: finding.id,
          optionId: "USE_SUGGESTED_BRAND",
          applyToAllInFile: true
        }
      ];
      const { applied } = await service.construirPlanConDecisiones(buffer, 35, decisions);
      expect(applied.unresolvedBlockers).toHaveLength(0);
      const brands = new Set(applied.plan.map((row) => row.marca));
      expect(brands.size).toBe(1); // ambas filas terminan con la misma marca
    }
  );

  it("hallazgo BLOCKER sin decision: unresolvedBlockers no queda vacio, y el plan queda vacio (no crea nada a medias)", async () => {
    const repository = new FullProductRepositoryStub();
    const service = new ProductoService(repository);

    const buffer = supplierCsv(";Paco Rabanne;50ML;30000");
    const { applied } = await service.construirPlanConDecisiones(buffer, 35, []);

    expect(applied.unresolvedBlockers.length).toBeGreaterThan(0);
    expect(applied.plan).toHaveLength(0);
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
