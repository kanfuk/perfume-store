import { describe, expect, it } from "vitest";
import type { ProductoProps } from "@/domain/Producto";
import type { ProductRepository } from "@/repositories/productRepository";
import { ProductoService } from "@/services/productoService";

/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Cobertura A8: edicion segura de nombre de producto. Confirma que
 * renombrar SOLO toca nombre/nombreBloqueado (nunca id, sku, stock,
 * stockReservado, costo, precio, Top, Ofertas ni crea un producto
 * duplicado), que la validacion de entrada rechaza nombres invalidos, y que
 * la proteccion CSV (nombreBloqueado) respeta la decision humana explicita
 * (overrideNombreSkus) igual que reactivarSkus para productos archivados.
 * Ver docs/SMELLME_SAFE_PRODUCT_RENAME_DESIGN.md.
 */

class InMemoryProductRepository implements ProductRepository {
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

function baseProduct(overrides: Partial<ProductoProps> = {}): ProductoProps {
  return {
    id: "producto-1",
    sku: "SML-SAVAUGE-100ML",
    nombre: "Savauge",
    marca: "Dior",
    contenido: "100ML",
    descripcion: "",
    precioVenta: 65000,
    precioAnterior: 70000,
    costoUnitario: 40000,
    stockActual: 5,
    stockAgenda: 5,
    stockReservado: 2,
    stockMinimo: 1,
    activo: true,
    esTop: true,
    ordenDestacado: 3,
    esOfertaSemana: true,
    tipoProducto: "simple",
    ...overrides
  };
}

describe("ProductoService.renombrarProductoAdmin - identidad e integridad", () => {
  it("cambia el nombre y mantiene id, sku y el resto de campos comerciales intactos", async () => {
    const repository = new InMemoryProductRepository();
    repository.seed(baseProduct());
    const service = new ProductoService(repository);

    const result = await service.renombrarProductoAdmin("producto-1", "Sauvage");

    expect(result.id).toBe("producto-1");
    expect(result.sku).toBe("SML-SAVAUGE-100ML");
    expect(result.nombre).toBe("Sauvage");
    expect(result.stockActual).toBe(5);
    expect(result.stockReservado).toBe(2);
    expect(result.costoUnitario).toBe(40000);
    expect(result.precioVenta).toBe(65000);
    expect(result.precioAnterior).toBe(70000);
    expect(result.esTop).toBe(true);
    expect(result.ordenDestacado).toBe(3);
    expect(result.esOfertaSemana).toBe(true);
  });

  it("marca nombreBloqueado = true tras renombrar, para proteger el nombre frente a CSV", async () => {
    const repository = new InMemoryProductRepository();
    repository.seed(baseProduct());
    const service = new ProductoService(repository);

    const result = await service.renombrarProductoAdmin("producto-1", "Sauvage");

    expect(result.nombreBloqueado).toBe(true);
  });

  it("no crea un producto nuevo: el catalogo sigue teniendo exactamente 1 producto", async () => {
    const repository = new InMemoryProductRepository();
    repository.seed(baseProduct());
    const service = new ProductoService(repository);

    await service.renombrarProductoAdmin("producto-1", "Sauvage");

    const all = await repository.buscarTodosProductos();
    expect(all).toHaveLength(1);
  });

  it("no cambia el SKU aunque el nuevo nombre difiera mucho del original", async () => {
    const repository = new InMemoryProductRepository();
    repository.seed(baseProduct());
    const service = new ProductoService(repository);

    const result = await service.renombrarProductoAdmin("producto-1", "Nombre completamente distinto");

    expect(result.sku).toBe("SML-SAVAUGE-100ML");
  });

  it("funciona igual sobre un producto archivado, sin reactivarlo", async () => {
    const repository = new InMemoryProductRepository();
    repository.seed(baseProduct({ activo: false, archivedAt: new Date("2026-01-01"), archivedReason: "sin ventas" }));
    const service = new ProductoService(repository);

    const result = await service.renombrarProductoAdmin("producto-1", "Sauvage");

    expect(result.nombre).toBe("Sauvage");
    expect(result.archivedAt).not.toBeNull();
    expect(result.activo).toBe(false);
  });

  it("rechaza un id inexistente sin crear ni modificar nada", async () => {
    const repository = new InMemoryProductRepository();
    repository.seed(baseProduct());
    const service = new ProductoService(repository);

    await expect(service.renombrarProductoAdmin("no-existe", "Sauvage")).rejects.toThrow("Producto no encontrado.");
    expect(await repository.buscarTodosProductos()).toHaveLength(1);
  });

  it("rechaza un nombre vacio", async () => {
    const repository = new InMemoryProductRepository();
    repository.seed(baseProduct());
    const service = new ProductoService(repository);

    await expect(service.renombrarProductoAdmin("producto-1", "")).rejects.toThrow("El nombre no puede estar vacío.");
  });

  it("rechaza un nombre compuesto solo de espacios en blanco", async () => {
    const repository = new InMemoryProductRepository();
    repository.seed(baseProduct());
    const service = new ProductoService(repository);

    await expect(service.renombrarProductoAdmin("producto-1", "     ")).rejects.toThrow(
      "El nombre no puede estar vacío."
    );
  });

  it("rechaza un nombre igual al actual (mismo texto, con espacios extra recortados)", async () => {
    const repository = new InMemoryProductRepository();
    repository.seed(baseProduct());
    const service = new ProductoService(repository);

    await expect(service.renombrarProductoAdmin("producto-1", "  Savauge  ")).rejects.toThrow(
      "El nombre ingresado es igual al actual."
    );
  });

  it("rechaza un nombre que supera la longitud maxima permitida", async () => {
    const repository = new InMemoryProductRepository();
    repository.seed(baseProduct());
    const service = new ProductoService(repository);

    await expect(service.renombrarProductoAdmin("producto-1", "A".repeat(151))).rejects.toThrow(
      "El nombre no puede superar los 150 caracteres."
    );
  });

  it("rechaza un nombre con caracteres de control", async () => {
    const repository = new InMemoryProductRepository();
    repository.seed(baseProduct());
    const service = new ProductoService(repository);

    await expect(service.renombrarProductoAdmin("producto-1", "Sauvage")).rejects.toThrow(
      "El nombre contiene caracteres no válidos."
    );
  });

  it("no bloquea el rename por nombre duplicado con otro producto distinto", async () => {
    const repository = new InMemoryProductRepository();
    repository.seed(baseProduct({ id: "producto-1", sku: "SML-A" }));
    repository.seed(baseProduct({ id: "producto-2", sku: "SML-B", nombre: "Sauvage" }));
    const service = new ProductoService(repository);

    const result = await service.renombrarProductoAdmin("producto-1", "Sauvage");

    expect(result.nombre).toBe("Sauvage");
    const other = await repository.buscarProductoPorId("producto-2");
    expect(other?.nombre).toBe("Sauvage");
  });

  it("recorta espacios al inicio/fin del nuevo nombre antes de guardarlo", async () => {
    const repository = new InMemoryProductRepository();
    repository.seed(baseProduct());
    const service = new ProductoService(repository);

    const result = await service.renombrarProductoAdmin("producto-1", "  Sauvage  ");

    expect(result.nombre).toBe("Sauvage");
  });
});

const CSV_HEADER =
  "sku,nombre,marca,contenido,costo_unitario,precio_venta,stock,activo,es_top,orden_destacado,es_oferta_semana,precio_anterior,image_url";

function csvBuffer(...rows: string[]): Buffer {
  return Buffer.from([CSV_HEADER, ...rows].join("\n"), "utf8");
}

describe("Proteccion CSV de nombre bloqueado (confirmarImportacionCsv)", () => {
  it("previsualizarImportacionCsv reporta nameConflicts cuando el CSV trae un nombre distinto al bloqueado", async () => {
    const repository = new InMemoryProductRepository();
    repository.seed(baseProduct({ nombre: "Sauvage", nombreBloqueado: true }));
    const service = new ProductoService(repository);

    const buffer = csvBuffer("SML-SAVAUGE-100ML,Savauge,Dior,100ML,40000,65000,5,true,false,,false,,");
    const preview = await service.previsualizarImportacionCsv(buffer, "catalogo.csv", buffer.length);

    expect(preview.nameConflicts).toEqual(["SML-SAVAUGE-100ML"]);
  });

  it("confirmarImportacionCsv NO sobrescribe un nombre bloqueado sin override explicito, pero si actualiza el resto de campos", async () => {
    const repository = new InMemoryProductRepository();
    repository.seed(baseProduct({ nombre: "Sauvage", nombreBloqueado: true }));
    const service = new ProductoService(repository);

    const preview = await service.previsualizarImportacionCsv(
      csvBuffer("SML-SAVAUGE-100ML,Savauge,Dior,100ML,41000,66000,6,true,false,,false,,"),
      "catalogo.csv",
      200
    );
    const result = await service.confirmarImportacionCsv(preview.filasValidas);

    expect(result.nombresProtegidos).toBe(1);
    expect(result.nombresReemplazados).toEqual([]);
    const updated = await repository.buscarProductoPorId("producto-1");
    expect(updated?.nombre).toBe("Sauvage"); // nombre protegido, no se toco
    expect(updated?.costoUnitario).toBe(41000); // el resto de campos si se actualiza
    expect(updated?.precioVenta).toBe(66000);
    expect(updated?.stockActual).toBe(6);
  });

  it("confirmarImportacionCsv SI reemplaza el nombre bloqueado cuando el SKU viene en overrideNombreSkus", async () => {
    const repository = new InMemoryProductRepository();
    repository.seed(baseProduct({ nombre: "Sauvage", nombreBloqueado: true }));
    const service = new ProductoService(repository);

    const preview = await service.previsualizarImportacionCsv(
      csvBuffer("SML-SAVAUGE-100ML,Sauvage Intense,Dior,100ML,40000,65000,5,true,false,,false,,"),
      "catalogo.csv",
      200
    );
    const result = await service.confirmarImportacionCsv(preview.filasValidas, [], ["SML-SAVAUGE-100ML"]);

    expect(result.nombresReemplazados).toEqual(["producto-1"]);
    const updated = await repository.buscarProductoPorId("producto-1");
    expect(updated?.nombre).toBe("Sauvage Intense");
    expect(updated?.nombreBloqueado).toBe(false); // la proteccion se libera al usarse
  });

  it("confirmarImportacionCsv actualiza libremente el nombre de un producto SIN nombreBloqueado", async () => {
    const repository = new InMemoryProductRepository();
    repository.seed(baseProduct({ nombre: "Savauge", nombreBloqueado: false }));
    const service = new ProductoService(repository);

    const preview = await service.previsualizarImportacionCsv(
      csvBuffer("SML-SAVAUGE-100ML,Sauvage,Dior,100ML,40000,65000,5,true,false,,false,,"),
      "catalogo.csv",
      200
    );
    expect(preview.nameConflicts ?? []).toEqual([]);

    const result = await service.confirmarImportacionCsv(preview.filasValidas);
    expect(result.nombresProtegidos).toBe(0);
    const updated = await repository.buscarProductoPorId("producto-1");
    expect(updated?.nombre).toBe("Sauvage");
  });
});
