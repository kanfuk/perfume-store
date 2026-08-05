import { describe, expect, it } from "vitest";
import type { ProductoProps } from "@/domain/Producto";
import type { ProductRepository } from "@/repositories/productRepository";
import { ProductoService } from "@/services/productoService";
import { OFFERS_LIMIT } from "@/lib/constants";

/**
 * Fase 7.4A, seccion 3: prueba de concurrencia para activarOfertaSemana.
 * No hay proteccion atomica en base de datos (ver
 * docs/SMELLME_OFFERS_ATOMICITY_PROPOSAL.md) -- este archivo documenta con
 * evidencia ejecutable el escenario de carrera exacto, en vez de afirmarlo
 * solo en un comentario. El stub no tiene ningun await interno en sus
 * metodos (identico al usado en productoService.stockAndTop12.test.ts), asi
 * que el intercalado de microtasks entre las dos llamadas concurrentes
 * reproduce de forma deterministica el mismo patron "leer conteo, luego
 * escribir" que ocurriria contra Supabase bajo trafico simultaneo real.
 */
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
    sku: "SML-BASE",
    nombre: "La Bomba",
    marca: "Carolina Herrera",
    contenido: "80ML",
    precioVenta: 65000,
    costoUnitario: 45000,
    stockActual: 7,
    stockAgenda: 7,
    stockReservado: 2,
    activo: true,
    esTop: false,
    esOfertaSemana: false,
    imageUrl: "",
    modoPrecio: "AUTO",
    tipoProducto: "simple",
    ...overrides
  };
  repository.seed(product);
}

describe("ProductoService - Ofertas de la semana: concurrencia (Fase 7.4A, sin atomicidad real)", () => {
  it(
    `con ${OFFERS_LIMIT} ofertas activas, dos activaciones simultaneas para productos distintos ` +
      "PUEDEN AMBAS pasar la validacion de maximo y terminar en OFFERS_LIMIT + 1 activas " +
      "(demuestra que la validacion actual NO es atomica)",
    async () => {
      const repository = new FullProductRepositoryStub();
      for (let i = 1; i <= OFFERS_LIMIT - 1; i += 1) {
        seedProduct(repository, { id: `oferta-${i}`, sku: `SML-OFERTA-${i}`, esOfertaSemana: true });
      }
      seedProduct(repository, { id: "candidato-a", sku: "SML-A" });
      seedProduct(repository, { id: "candidato-b", sku: "SML-B" });
      const service = new ProductoService(repository);

      const results = await Promise.allSettled([
        service.activarOfertaSemana("candidato-a"),
        service.activarOfertaSemana("candidato-b")
      ]);

      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const todos = await repository.buscarTodosProductos();
      const activasFinal = todos.filter((p) => p.esOfertaSemana).length;

      // Esto NO es el comportamiento deseado: es la evidencia del riesgo
      // documentado en docs/SMELLME_OFFERS_ATOMICITY_PROPOSAL.md. Sin una
      // funcion SQL/RPC/constraint (fuera de alcance de esta fase), dos
      // solicitudes casi simultaneas pueden ambas leer el mismo conteo
      // (OFFERS_LIMIT - 1) antes de que la otra escriba.
      expect(succeeded).toBe(2);
      expect(activasFinal).toBe(OFFERS_LIMIT + 1);
    }
  );

  it("sin concurrencia (llamadas secuenciales) el maximo SI se respeta -- el problema es la carrera, no la validacion", async () => {
    const repository = new FullProductRepositoryStub();
    for (let i = 1; i <= OFFERS_LIMIT; i += 1) {
      seedProduct(repository, { id: `oferta-${i}`, sku: `SML-OFERTA-${i}`, esOfertaSemana: true });
    }
    seedProduct(repository, { id: "candidato-a", sku: "SML-A" });
    const service = new ProductoService(repository);

    await expect(service.activarOfertaSemana("candidato-a")).rejects.toThrow(new RegExp(String(OFFERS_LIMIT)));

    const todos = await repository.buscarTodosProductos();
    expect(todos.filter((p) => p.esOfertaSemana).length).toBe(OFFERS_LIMIT);
  });

  it("no hay estado parcial: una activacion fallida no deja al producto con esOfertaSemana a medio escribir", async () => {
    const repository = new FullProductRepositoryStub();
    for (let i = 1; i <= OFFERS_LIMIT; i += 1) {
      seedProduct(repository, { id: `oferta-${i}`, sku: `SML-OFERTA-${i}`, esOfertaSemana: true });
    }
    seedProduct(repository, { id: "candidato-a", sku: "SML-A" });
    const service = new ProductoService(repository);

    await expect(service.activarOfertaSemana("candidato-a")).rejects.toThrow();

    const producto = await repository.buscarProductoPorId("candidato-a");
    expect(producto?.esOfertaSemana).toBe(false);
  });
});
