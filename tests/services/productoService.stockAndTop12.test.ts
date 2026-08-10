import { describe, expect, it } from "vitest";
import type { ProductoProps } from "@/domain/Producto";
import type { ProductRepository } from "@/repositories/productRepository";
import { ProductoService } from "@/services/productoService";
import { OFFERS_LIMIT, TOP_PRODUCTS_LIMIT } from "@/lib/constants";

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

  async archivarProductoSeguro() {
    return { alreadyArchived: false };
  }

  async eliminarProductoSeguro() {
    return {};
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
    esTop: false,
    esOfertaSemana: false,
    imageUrl: "",
    modoPrecio: "AUTO",
    tipoProducto: "simple",
    ...overrides
  };
  repository.seed(product);
  return product;
}

describe("ProductoService - stock rapido individual", () => {
  it("ajustarStockRapido suma al stock actual y agenda", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository);
    const service = new ProductoService(repository);

    const result = await service.ajustarStockRapido("prod-1", 3);
    expect(result).toEqual({ id: "prod-1", stockActual: 10, activo: true });

    const updated = await repository.buscarProductoPorId("prod-1");
    expect(updated?.stockActual).toBe(10);
    expect(updated?.stockAgenda).toBe(10);
  });

  it("ajustarStockRapido resta y bloquea negativos", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { stockActual: 3, stockReservado: 0 });
    const service = new ProductoService(repository);

    await expect(service.ajustarStockRapido("prod-1", -5)).rejects.toThrow(/no puede ser negativo/);
  });

  it("ajustarStockRapido bloquea dejar el stock por debajo de lo reservado", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { stockActual: 5, stockReservado: 4 });
    const service = new ProductoService(repository);

    await expect(service.ajustarStockRapido("prod-1", -2)).rejects.toThrow(/reservado/);
  });

  it("ajustarStockRapido nunca toca precio, imagen, activo ni Top12", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { esTop: true, ordenDestacado: 3, imageUrl: "/images/foo.webp" });
    const service = new ProductoService(repository);

    await service.ajustarStockRapido("prod-1", 1);

    const cambios = repository.actualizarProductoCalls[0].cambios as Record<string, unknown>;
    expect(Object.keys(cambios).sort()).toEqual(["stockActual", "stockAgenda"]);
  });

  it("establecerStockRapido fija un valor absoluto valido", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository);
    const service = new ProductoService(repository);

    const result = await service.establecerStockRapido("prod-1", 20);
    expect(result.stockActual).toBe(20);
  });

  it("establecerStockRapido rechaza valores negativos, no enteros o por debajo de lo reservado", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { stockReservado: 3 });
    const service = new ProductoService(repository);

    await expect(service.establecerStockRapido("prod-1", -1)).rejects.toThrow();
    await expect(service.establecerStockRapido("prod-1", 1.5)).rejects.toThrow();
    await expect(service.establecerStockRapido("prod-1", 2)).rejects.toThrow(/reservado/);
  });

  it("agotarProductoRapido deja el stock igual al reservado", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { stockActual: 9, stockReservado: 2 });
    const service = new ProductoService(repository);

    const result = await service.agotarProductoRapido("prod-1");
    expect(result.stockActual).toBe(2);
  });

  it("cambiarActivoStockRapido activa y pausa reutilizando la regla de stock minimo", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { activo: false, stockActual: 5 });
    const service = new ProductoService(repository);

    const activado = await service.cambiarActivoStockRapido("prod-1", true);
    expect(activado.activo).toBe(true);

    const pausado = await service.cambiarActivoStockRapido("prod-1", false);
    expect(pausado.activo).toBe(false);
  });

  it("cambiarActivoStockRapido rechaza activar sin stock", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { activo: false, stockActual: 0, stockReservado: 0 });
    const service = new ProductoService(repository);

    await expect(service.cambiarActivoStockRapido("prod-1", true)).rejects.toThrow(/stock/i);
  });
});

describe("ProductoService - stock rapido masivo", () => {
  it("previsualizarAjusteMasivoStock es un dry-run: no escribe nada", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository);
    const service = new ProductoService(repository);

    await service.previsualizarAjusteMasivoStock(["prod-1"], { type: "sumar", cantidad: 1 });
    expect(repository.actualizarProductoCalls).toHaveLength(0);
  });

  it("sumar: incrementa el stock de todos los seleccionados", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { id: "prod-1", sku: "SML-A", stockActual: 5 });
    seedProduct(repository, { id: "prod-2", sku: "SML-B", stockActual: 1 });
    const service = new ProductoService(repository);

    const result = await service.confirmarAjusteMasivoStock(["prod-1", "prod-2"], {
      type: "sumar",
      cantidad: 1
    });
    expect(result.actualizados).toBe(2);
    expect((await repository.buscarProductoPorId("prod-1"))?.stockActual).toBe(6);
    expect((await repository.buscarProductoPorId("prod-2"))?.stockActual).toBe(2);
  });

  it("restar: bloquea productos que quedarian bajo lo reservado (reporta el bloqueo por fila, sigue con el resto)", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { id: "prod-1", sku: "SML-A", stockActual: 1, stockReservado: 1 });
    seedProduct(repository, { id: "prod-2", sku: "SML-B", stockActual: 5, stockReservado: 0 });
    const service = new ProductoService(repository);

    const preview = await service.previsualizarAjusteMasivoStock(["prod-1", "prod-2"], {
      type: "restar",
      cantidad: 1
    });
    expect(preview.totalSeleccionados).toBe(2);
    expect(preview.productos).toHaveLength(2); // ambos aparecen, con su status
    expect(preview.productos.find((p) => p.id === "prod-1")?.status).toBe("BLOQUEADO");
    expect(preview.productos.find((p) => p.id === "prod-1")?.motivo).toMatch(/reservado/i);
    expect(preview.productos.find((p) => p.id === "prod-2")?.status).toBe("CAMBIA");

    const result = await service.confirmarAjusteMasivoStock(["prod-1", "prod-2"], {
      type: "restar",
      cantidad: 1
    });
    expect(result.actualizados).toBe(1);
    expect(result.bloqueados).toBe(1);
    expect(result.total).toBe(2);
    expect((await repository.buscarProductoPorId("prod-1"))?.stockActual).toBe(1);
    expect((await repository.buscarProductoPorId("prod-2"))?.stockActual).toBe(4);
  });

  it("establecer: fija un valor absoluto para todos los seleccionados", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { id: "prod-1", sku: "SML-A" });
    seedProduct(repository, { id: "prod-2", sku: "SML-B" });
    const service = new ProductoService(repository);

    await service.confirmarAjusteMasivoStock(["prod-1", "prod-2"], { type: "establecer", valor: 15 });
    expect((await repository.buscarProductoPorId("prod-1"))?.stockActual).toBe(15);
    expect((await repository.buscarProductoPorId("prod-2"))?.stockActual).toBe(15);
  });

  it("activar/pausar: toca UNICAMENTE activo, nunca el stock", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { activo: true, stockActual: 5 });
    const service = new ProductoService(repository);

    await service.confirmarAjusteMasivoStock(["prod-1"], { type: "pausar" });

    const cambios = repository.actualizarProductoCalls[0].cambios as Record<string, unknown>;
    expect(Object.keys(cambios)).toEqual(["activo"]);
    expect((await repository.buscarProductoPorId("prod-1"))?.activo).toBe(false);
    expect((await repository.buscarProductoPorId("prod-1"))?.stockActual).toBe(5);
  });

  it("activar masivo (Fase 2B.9) NUNCA se bloquea por falta de stock: queda activo igual", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { activo: false, stockActual: 0 });
    const service = new ProductoService(repository);

    const preview = await service.previsualizarAjusteMasivoStock(["prod-1"], { type: "activar" });
    expect(preview.productos).toHaveLength(1);
    expect(preview.productos[0].status).toBe("CAMBIA");
    expect(preview.productos[0].activoNuevo).toBe(true);
    expect(preview.productos[0].stockNuevo).toBe(0); // el stock nunca se toca

    const result = await service.confirmarAjusteMasivoStock(["prod-1"], { type: "activar" });
    expect(result.actualizados).toBe(1);
    expect((await repository.buscarProductoPorId("prod-1"))?.activo).toBe(true);
    expect((await repository.buscarProductoPorId("prod-1"))?.stockActual).toBe(0);
  });

  it("activar masivo: un producto ya activo queda como 'sin cambios'", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { activo: true, stockActual: 5 });
    const service = new ProductoService(repository);

    const preview = await service.previsualizarAjusteMasivoStock(["prod-1"], { type: "activar" });
    expect(preview.productos[0].status).toBe("SIN_CAMBIOS");

    const result = await service.confirmarAjusteMasivoStock(["prod-1"], { type: "activar" });
    expect(result.actualizados).toBe(0);
    expect(result.sinCambios).toBe(1);
  });

  it("pausar masivo: un producto ya pausado queda como 'sin cambios'", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { activo: false, stockActual: 5 });
    const service = new ProductoService(repository);

    const result = await service.confirmarAjusteMasivoStock(["prod-1"], { type: "pausar" });
    expect(result.actualizados).toBe(0);
    expect(result.sinCambios).toBe(1);
  });

  it("disponibleUno: deja stock_actual = stock_reservado + 1 (caso reserva 0 -> total 1)", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { stockActual: 5, stockReservado: 0 });
    const service = new ProductoService(repository);

    const result = await service.confirmarAjusteMasivoStock(["prod-1"], { type: "disponibleUno" });
    expect(result.actualizados).toBe(1);
    const updated = await repository.buscarProductoPorId("prod-1");
    expect(updated?.stockActual).toBe(1);
    expect(updated?.stockAgenda).toBe(1);
  });

  it("disponibleUno: caso reserva 2 -> total 3", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { stockActual: 10, stockReservado: 2 });
    const service = new ProductoService(repository);

    const result = await service.confirmarAjusteMasivoStock(["prod-1"], { type: "disponibleUno" });
    expect(result.actualizados).toBe(1);
    expect((await repository.buscarProductoPorId("prod-1"))?.stockActual).toBe(3);
  });

  it("disponibleUno: nunca modifica activo/precio/imagen/Top12", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { stockActual: 10, stockReservado: 0, esTop: true, ordenDestacado: 5, imageUrl: "/foto.webp" });
    const service = new ProductoService(repository);

    await service.confirmarAjusteMasivoStock(["prod-1"], { type: "disponibleUno" });
    const cambios = repository.actualizarProductoCalls[0].cambios as Record<string, unknown>;
    expect(Object.keys(cambios).sort()).toEqual(["stockActual", "stockAgenda"]);
  });

  it("agotar (masivo): deja el total exactamente en lo reservado, nunca debajo", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { stockActual: 10, stockReservado: 3 });
    const service = new ProductoService(repository);

    const result = await service.confirmarAjusteMasivoStock(["prod-1"], { type: "agotar" });
    expect(result.actualizados).toBe(1);
    const updated = await repository.buscarProductoPorId("prod-1");
    expect(updated?.stockActual).toBe(3);
    expect(updated?.stockActual).toBeGreaterThanOrEqual(updated?.stockReservado ?? 0);
  });

  it("agotar: si ya esta en el reservado, queda 'sin cambios'", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { stockActual: 3, stockReservado: 3 });
    const service = new ProductoService(repository);

    const result = await service.confirmarAjusteMasivoStock(["prod-1"], { type: "agotar" });
    expect(result.sinCambios).toBe(1);
    expect(result.actualizados).toBe(0);
  });

  it("producto no encontrado (eliminado entre preview y confirm) cuenta como bloqueado, nunca lanza", async () => {
    const repository = new FullProductRepositoryStub();
    const service = new ProductoService(repository);

    const preview = await service.previsualizarAjusteMasivoStock(["no-existe"], { type: "activar" });
    expect(preview.productos[0].status).toBe("BLOQUEADO");
    expect(preview.productos[0].motivo).toMatch(/no encontrado/i);

    const result = await service.confirmarAjusteMasivoStock(["no-existe"], { type: "activar" });
    expect(result.bloqueados).toBe(1);
    expect(result.actualizados).toBe(0);
  });

  it("rechaza cantidad invalida en el preview", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository);
    const service = new ProductoService(repository);

    const preview = await service.previsualizarAjusteMasivoStock(["prod-1"], { type: "sumar", cantidad: -1 });
    expect(preview.erroresGlobales[0]).toMatch(/entero mayor que 0/);
  });
});

describe("ProductoService - Top 12 editorial", () => {
  it(`obtenerEstadoTop12 devuelve ${TOP_PRODUCTS_LIMIT} posiciones, vacias si nadie esta vinculado`, async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository);
    const service = new ProductoService(repository);

    const estado = await service.obtenerEstadoTop12();
    expect(estado).toHaveLength(TOP_PRODUCTS_LIMIT);
    expect(estado.every((slot) => slot.producto === null)).toBe(true);
    expect(estado.map((slot) => slot.rank)).toEqual(
      Array.from({ length: TOP_PRODUCTS_LIMIT }, (_, i) => i + 1)
    );
  });

  it("vincularProductoTop12 asigna es_top y orden_destacado sin tocar la imagen del producto", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { imageUrl: "/images/mi-propia-foto.webp" });
    const service = new ProductoService(repository);

    const result = await service.vincularProductoTop12(3, "prod-1");
    expect(result.rank).toBe(3);

    const updated = await repository.buscarProductoPorId("prod-1");
    expect(updated?.esTop).toBe(true);
    expect(updated?.ordenDestacado).toBe(3);
    expect(updated?.imageUrl).toBe("/images/mi-propia-foto.webp");
  });

  it("vincular una posicion 1-12 nunca sobrescribe la imagen del producto con una foto historica curada", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { imageUrl: undefined });
    const service = new ProductoService(repository);

    await service.vincularProductoTop12(1, "prod-1");

    const updated = await repository.buscarProductoPorId("prod-1");
    expect(updated?.imageUrl).toBeUndefined();
  });

  it("reemplazar una posicion libera al producto anterior sin borrar su propia imagen", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, {
      id: "prod-1",
      sku: "SML-A",
      esTop: true,
      ordenDestacado: 3,
      imageUrl: "/images/mi-propia-foto.webp"
    });
    seedProduct(repository, { id: "prod-2", sku: "SML-B", nombre: "212 Vip", imageUrl: "/images/otra-foto.webp" });
    const service = new ProductoService(repository);

    await service.vincularProductoTop12(3, "prod-2");

    const anterior = await repository.buscarProductoPorId("prod-1");
    expect(anterior?.esTop).toBe(false);
    expect(anterior?.ordenDestacado).toBeNull();
    expect(anterior?.imageUrl).toBe("/images/mi-propia-foto.webp");

    const nuevo = await repository.buscarProductoPorId("prod-2");
    expect(nuevo?.esTop).toBe(true);
    expect(nuevo?.ordenDestacado).toBe(3);
    expect(nuevo?.imageUrl).toBe("/images/otra-foto.webp");
  });

  it("un producto vinculado a otra posicion libera automaticamente la anterior al moverse y conserva su imagen", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, {
      id: "prod-1",
      sku: "SML-A",
      esTop: true,
      ordenDestacado: 5,
      imageUrl: "/images/mi-propia-foto.webp"
    });
    const service = new ProductoService(repository);

    await service.vincularProductoTop12(8, "prod-1");

    const estado = await service.obtenerEstadoTop12();
    expect(estado.find((slot) => slot.rank === 5)?.producto).toBeNull();
    expect(estado.find((slot) => slot.rank === 8)?.producto?.id).toBe("prod-1");
    expect(estado.find((slot) => slot.rank === 8)?.producto?.imageUrl).toBe("/images/mi-propia-foto.webp");
  });

  it(`rechaza posiciones fuera de 1..${TOP_PRODUCTS_LIMIT} o no enteras`, async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository);
    const service = new ProductoService(repository);

    await expect(service.vincularProductoTop12(0, "prod-1")).rejects.toThrow();
    await expect(service.vincularProductoTop12(TOP_PRODUCTS_LIMIT + 1, "prod-1")).rejects.toThrow();
    await expect(service.vincularProductoTop12(2.5, "prod-1")).rejects.toThrow();
  });

  it("rechaza vincular un producto inexistente", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository);
    const service = new ProductoService(repository);

    await expect(service.vincularProductoTop12(1, "no-existe")).rejects.toThrow(/no encontrado/);
  });

  it("desvincularProductoTop12 libera la posicion sin tocar la imagen", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { esTop: true, ordenDestacado: 4, imageUrl: "/images/foto.webp" });
    const service = new ProductoService(repository);

    await service.desvincularProductoTop12(4);

    const updated = await repository.buscarProductoPorId("prod-1");
    expect(updated?.esTop).toBe(false);
    expect(updated?.ordenDestacado).toBeNull();
    expect(updated?.imageUrl).toBe("/images/foto.webp");
  });

  it("desvincularProductoTop12 en una posicion vacia no hace nada", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository);
    const service = new ProductoService(repository);

    await service.desvincularProductoTop12(9);
    expect(repository.actualizarProductoCalls).toHaveLength(0);
  });
});

describe("ProductoService - Ofertas de la semana (Fase 7.4)", () => {
  it("activarOfertaSemana marca es_oferta_semana y guarda precio_anterior opcional", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { precioVenta: 50000 });
    const service = new ProductoService(repository);

    const result = await service.activarOfertaSemana("prod-1", 65000);
    expect(result.producto?.esOfertaSemana).toBe(true);
    expect(result.producto?.precioAnterior).toBe(65000);

    const updated = await repository.buscarProductoPorId("prod-1");
    expect(updated?.esOfertaSemana).toBe(true);
    expect(updated?.precioAnterior).toBe(65000);
  });

  it("activarOfertaSemana sin precioAnterior no inventa ni toca ese campo", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { precioAnterior: undefined });
    const service = new ProductoService(repository);

    await service.activarOfertaSemana("prod-1");

    const updated = await repository.buscarProductoPorId("prod-1");
    expect(updated?.esOfertaSemana).toBe(true);
    expect(updated?.precioAnterior).toBeUndefined();
  });

  it(`rechaza activar una oferta ${OFFERS_LIMIT + 1} cuando ya hay ${OFFERS_LIMIT} activas`, async () => {
    const repository = new FullProductRepositoryStub();
    for (let i = 1; i <= OFFERS_LIMIT; i += 1) {
      seedProduct(repository, { id: `oferta-${i}`, sku: `SML-OFERTA-${i}`, esOfertaSemana: true });
    }
    seedProduct(repository, { id: "candidato", sku: "SML-CANDIDATO" });
    const service = new ProductoService(repository);

    await expect(service.activarOfertaSemana("candidato")).rejects.toThrow(
      new RegExp(`${OFFERS_LIMIT}`)
    );
  });

  it("permite editar el precio anterior de un producto que ya esta en oferta sin contarlo dos veces contra el limite", async () => {
    const repository = new FullProductRepositoryStub();
    for (let i = 1; i <= OFFERS_LIMIT; i += 1) {
      seedProduct(repository, { id: `oferta-${i}`, sku: `SML-OFERTA-${i}`, esOfertaSemana: true });
    }
    const service = new ProductoService(repository);

    await expect(service.activarOfertaSemana("oferta-1", 99000)).resolves.toBeTruthy();
    const updated = await repository.buscarProductoPorId("oferta-1");
    expect(updated?.precioAnterior).toBe(99000);
  });

  it("rechaza precioAnterior invalido (<=0 o no numerico)", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository);
    const service = new ProductoService(repository);

    await expect(service.activarOfertaSemana("prod-1", 0)).rejects.toThrow(/precio anterior/i);
    await expect(service.activarOfertaSemana("prod-1", -10)).rejects.toThrow(/precio anterior/i);
    await expect(service.activarOfertaSemana("prod-1", Number.NaN)).rejects.toThrow(/precio anterior/i);
  });

  it("rechaza activar un producto inexistente", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository);
    const service = new ProductoService(repository);

    await expect(service.activarOfertaSemana("no-existe")).rejects.toThrow(/no encontrado/);
  });

  it("rechaza activar una oferta NUEVA sobre un producto pausado (Fase 7.4A, seccion 6A)", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { activo: false });
    const service = new ProductoService(repository);

    await expect(service.activarOfertaSemana("prod-1")).rejects.toThrow(/pausado/i);

    const updated = await repository.buscarProductoPorId("prod-1");
    expect(updated?.esOfertaSemana).toBe(false);
  });

  it("un producto que YA esta en oferta y luego se pausa puede seguir editando su precioAnterior (idempotente, no vuelve a validar activo)", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { activo: false, esOfertaSemana: true });
    const service = new ProductoService(repository);

    await expect(service.activarOfertaSemana("prod-1", 99000)).resolves.toBeTruthy();
    const updated = await repository.buscarProductoPorId("prod-1");
    expect(updated?.esOfertaSemana).toBe(true);
    expect(updated?.precioAnterior).toBe(99000);
  });

  it("acepta guardar precioAnterior igual o menor al precio actual (la vitrina publica lo oculta, no el servicio)", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { precioVenta: 65000 });
    const service = new ProductoService(repository);

    await expect(service.activarOfertaSemana("prod-1", 65000)).resolves.toBeTruthy();
    expect((await repository.buscarProductoPorId("prod-1"))?.precioAnterior).toBe(65000);

    await expect(service.activarOfertaSemana("prod-1", 50000)).resolves.toBeTruthy();
    expect((await repository.buscarProductoPorId("prod-1"))?.precioAnterior).toBe(50000);
  });

  it("desactivarOfertaSemana quita es_oferta_semana y limpia precioAnterior (Fase 7.4A, politica A)", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { esOfertaSemana: true, precioAnterior: 80000 });
    const service = new ProductoService(repository);

    await service.desactivarOfertaSemana("prod-1");

    const updated = await repository.buscarProductoPorId("prod-1");
    expect(updated?.esOfertaSemana).toBe(false);
    expect(updated?.precioAnterior).toBeNull();
  });

  it("desactivarOfertaSemana es idempotente sobre un producto que ya estaba fuera de oferta", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { esOfertaSemana: false, precioAnterior: 80000 });
    const service = new ProductoService(repository);

    await expect(service.desactivarOfertaSemana("prod-1")).resolves.toBeTruthy();
    const updated = await repository.buscarProductoPorId("prod-1");
    expect(updated?.esOfertaSemana).toBe(false);
    expect(updated?.precioAnterior).toBeNull();
  });

  it("desactivarOfertaSemana no modifica precio actual, costo, stock ni Top 15", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, {
      esOfertaSemana: true,
      precioAnterior: 80000,
      precioVenta: 65000,
      costoUnitario: 45000,
      stockActual: 7,
      esTop: true,
      ordenDestacado: 4
    });
    const service = new ProductoService(repository);

    await service.desactivarOfertaSemana("prod-1");

    const updated = await repository.buscarProductoPorId("prod-1");
    expect(updated?.precioVenta).toBe(65000);
    expect(updated?.costoUnitario).toBe(45000);
    expect(updated?.stockActual).toBe(7);
    expect(updated?.esTop).toBe(true);
    expect(updated?.ordenDestacado).toBe(4);
  });

  it("rechaza desactivar un producto inexistente", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository);
    const service = new ProductoService(repository);

    await expect(service.desactivarOfertaSemana("no-existe")).rejects.toThrow(/no encontrado/);
  });

  it("quitar una oferta libera cupo para agregar otra", async () => {
    const repository = new FullProductRepositoryStub();
    for (let i = 1; i <= OFFERS_LIMIT; i += 1) {
      seedProduct(repository, { id: `oferta-${i}`, sku: `SML-OFERTA-${i}`, esOfertaSemana: true });
    }
    seedProduct(repository, { id: "candidato", sku: "SML-CANDIDATO" });
    const service = new ProductoService(repository);

    await service.desactivarOfertaSemana("oferta-1");
    await expect(service.activarOfertaSemana("candidato")).resolves.toBeTruthy();
  });
});

describe("ProductoService - visibilidad publica del catalogo", () => {
  it("obtenerProductosActivos excluye productos (sin familia visible) sin stock o sin precio, aunque esten activos", async () => {
    const repository = new FullProductRepositoryStub();
    // Cada uno es su propia familia (nombre distinto): sin variantes hermanas
    // vendibles, deben quedar completamente excluidos del catalogo publico.
    seedProduct(repository, { id: "prod-1", sku: "SML-A", nombre: "Producto A", activo: true, stockActual: 5, precioVenta: 10000 });
    seedProduct(repository, { id: "prod-2", sku: "SML-B", nombre: "Producto B", activo: true, stockActual: 0, precioVenta: 10000 });
    seedProduct(repository, { id: "prod-3", sku: "SML-C", nombre: "Producto C", activo: true, stockActual: 5, precioVenta: 0 });
    seedProduct(repository, { id: "prod-4", sku: "SML-D", nombre: "Producto D", activo: false, stockActual: 5, precioVenta: 10000 });
    const service = new ProductoService(repository);

    const activos = await service.obtenerProductosActivos();
    expect(activos.map((p) => p.id)).toEqual(["prod-1"]);
  });

  it("familia con al menos una variante vendible expone TODAS sus variantes (incluida la agotada) para el selector", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, {
      id: "lm-30",
      sku: "SML-PACO-RABANNE-LADY-MILLION-30ML",
      nombre: "Lady Million",
      marca: "Paco Rabanne",
      contenido: "30ML",
      activo: true,
      stockActual: 3,
      precioVenta: 33750
    });
    seedProduct(repository, {
      id: "lm-80",
      sku: "SML-PACO-RABANNE-LADY-MILLION-80ML",
      nombre: "Lady Million",
      marca: "Paco Rabanne",
      contenido: "80ML",
      activo: true,
      stockActual: 0, // agotada, pero es hermana de una variante vendible
      precioVenta: 67500
    });
    const service = new ProductoService(repository);

    const activos = await service.obtenerProductosActivos();
    expect(activos.map((p) => p.id).sort()).toEqual(["lm-30", "lm-80"]);
    expect(activos.find((p) => p.id === "lm-80")?.stockActual).toBe(0);
  });

  it("familia sin NINGUNA variante vendible queda completamente excluida", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { id: "x-30", nombre: "X", contenido: "30ML", stockActual: 0 });
    seedProduct(repository, { id: "x-50", nombre: "X", contenido: "50ML", activo: false });
    const service = new ProductoService(repository);

    const activos = await service.obtenerProductosActivos();
    expect(activos).toHaveLength(0);
  });

  // Fase 2B.13: un producto activo, con stock y precio, pero con ficha
  // incompleta (falta marca o contenido) NUNCA se publica -- aunque antes
  // esas dos condiciones bastaban para considerarlo "vendible".
  it("producto completo (activo, con stock, marca, contenido y precio) SI se publica", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, {
      id: "completo",
      nombre: "Bright Crystal",
      marca: "Versace",
      contenido: "90ML",
      activo: true,
      stockActual: 5,
      precioVenta: 55000
    });
    const service = new ProductoService(repository);

    const activos = await service.obtenerProductosActivos();
    expect(activos.map((p) => p.id)).toEqual(["completo"]);
  });

  it("producto sin marca NO se publica, aunque este activo, con stock y precio validos", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, {
      id: "sin-marca",
      nombre: "212 Forever Young Hombre",
      marca: "",
      contenido: "100ML",
      activo: true,
      stockActual: 5,
      precioVenta: 45000
    });
    const service = new ProductoService(repository);

    const activos = await service.obtenerProductosActivos();
    expect(activos).toHaveLength(0);
  });

  it("producto sin contenido NO se publica, aunque este activo, con stock y precio validos", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, {
      id: "sin-contenido",
      nombre: "212 Forever Young Hombre",
      marca: "Carolina Herrera",
      contenido: "",
      activo: true,
      stockActual: 5,
      precioVenta: 45000
    });
    const service = new ProductoService(repository);

    const activos = await service.obtenerProductosActivos();
    expect(activos).toHaveLength(0);
  });

  it("un producto incompleto no arrastra a sus hermanos: la familia sigue visible por la variante completa", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, {
      id: "lm-30-incompleto",
      nombre: "Lady Million",
      marca: "", // incompleta
      contenido: "30ML",
      activo: true,
      stockActual: 3,
      precioVenta: 33750
    });
    seedProduct(repository, {
      id: "lm-80-completo",
      nombre: "Lady Million",
      marca: "Paco Rabanne",
      contenido: "80ML",
      activo: true,
      stockActual: 2,
      precioVenta: 67500
    });
    const service = new ProductoService(repository);

    const activos = await service.obtenerProductosActivos();
    // Solo la variante completa se publica; la incompleta nunca aparece,
    // ni siquiera como opcion deshabilitada del selector.
    expect(activos.map((p) => p.id)).toEqual(["lm-80-completo"]);
  });

  it("un producto incompleto permanece disponible en el catalogo administrativo (nunca se oculta, pausa ni se le toca el stock)", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, {
      id: "sin-marca",
      nombre: "212 Forever Young Hombre",
      marca: "",
      contenido: "",
      activo: true,
      stockActual: 5,
      precioVenta: 45000
    });
    const service = new ProductoService(repository);

    const activos = await service.obtenerProductosActivos();
    expect(activos).toHaveLength(0);

    const admin = await service.obtenerCatalogoAdmin();
    const incompleto = admin.find((p) => p.id === "sin-marca");
    expect(incompleto).toBeDefined();
    expect(incompleto?.activo).toBe(true);
    expect(incompleto?.stockActual).toBe(5);
  });
});

describe("ProductoService - asignacion manual de imagen", () => {
  it("acepta una URL https", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository);
    const service = new ProductoService(repository);

    const result = await service.asignarImagenProducto("prod-1", "https://cdn.example.com/foto.webp");
    expect(result.imageUrl).toBe("https://cdn.example.com/foto.webp");

    const cambios = repository.actualizarProductoCalls[0].cambios as Record<string, unknown>;
    expect(Object.keys(cambios)).toEqual(["imageUrl"]);
  });

  it("acepta una ruta local /images/", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository);
    const service = new ProductoService(repository);

    const result = await service.asignarImagenProducto("prod-1", "/images/perfumes/mi-foto.webp");
    expect(result.imageUrl).toBe("/images/perfumes/mi-foto.webp");
  });

  it("rechaza protocolos distintos de https y rutas fuera de /images/", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository);
    const service = new ProductoService(repository);

    await expect(service.asignarImagenProducto("prod-1", "http://inseguro.com/x.webp")).rejects.toThrow();
    await expect(service.asignarImagenProducto("prod-1", "javascript:alert(1)")).rejects.toThrow();
    await expect(service.asignarImagenProducto("prod-1", "/otra-carpeta/x.webp")).rejects.toThrow();
    await expect(service.asignarImagenProducto("prod-1", "")).rejects.toThrow();
  });
});

describe("ProductoService - obtenerResumenCatalogo (Fase 3A, resumen de Gestion de catalogo)", () => {
  it("cuenta correctamente sobre un catalogo mixto (activos/pausados/sin stock/incompletos/AUTO-MANUAL/Top12)", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository, { id: "p1", sku: "SML-A", activo: true, stockActual: 5, modoPrecio: "AUTO", esTop: true, ordenDestacado: 1, esOfertaSemana: true });
    seedProduct(repository, { id: "p2", sku: "SML-B", nombre: "Otro", activo: false, stockActual: 3, modoPrecio: "MANUAL" });
    seedProduct(repository, { id: "p3", sku: "SML-C", nombre: "Otro2", activo: true, stockActual: 0, modoPrecio: "AUTO" });
    seedProduct(repository, { id: "p4", sku: "SML-D", nombre: "Otro3", marca: "", activo: true, stockActual: 5 }); // incompleto: sin marca
    const service = new ProductoService(repository);

    const summary = await service.obtenerResumenCatalogo();

    expect(summary.total).toBe(4);
    expect(summary.activos).toBe(3);
    expect(summary.pausados).toBe(1);
    expect(summary.disponibles).toBe(2); // p1 y p4 (activos con stock); p3 activo sin stock no cuenta
    expect(summary.sinStock).toBe(1); // p3
    expect(summary.incompletos).toBe(1); // p4
    expect(summary.preciosManual).toBe(1); // p2
    expect(summary.preciosAuto).toBe(3);
    expect(summary.top12Asignados).toBe(1); // p1
    expect(summary.top12Pendientes).toBe(TOP_PRODUCTS_LIMIT - 1);
    expect(summary.ofertasAsignadas).toBe(1); // p1
    expect(summary.ofertasPendientes).toBe(OFFERS_LIMIT - 1);
  });

  it("nunca retorna una lista de productos (solo conteos numericos)", async () => {
    const repository = new FullProductRepositoryStub();
    seedProduct(repository);
    const service = new ProductoService(repository);

    const summary = await service.obtenerResumenCatalogo();
    expect(Array.isArray(summary)).toBe(false);
    expect((summary as unknown as { products?: unknown }).products).toBeUndefined();
    for (const value of Object.values(summary)) {
      expect(typeof value).toBe("number");
    }
  });
});
