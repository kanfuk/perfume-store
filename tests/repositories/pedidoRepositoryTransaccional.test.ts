import { beforeEach, describe, expect, it } from "vitest";
import {
  METODO_DESPACHO_DOMICILIO_SEMANAL,
  METODO_DESPACHO_STARKEN_POR_PAGAR
} from "@/lib/constants";
import { localStore } from "@/lib/local-store";
import { PerfumeOrderError } from "@/lib/perfumeOrderErrors";
import { getPedidoRepository } from "@/repositories/pedidoRepository";

/**
 * Cubre, del lado TypeScript, el equivalente en memoria (sin Supabase) de
 * las RPC de la Fase 1C: create_perfume_order_v1, mark_perfume_order_paid_v1,
 * cancel_perfume_order_v1 y advance_perfume_order_status_v1. Esto valida el
 * modelo de reserva (stock_actual vs stock_reservado) para desarrollo local
 * sin Postgres. La proteccion real contra sobreventa CONCURRENTE solo la
 * valida supabase/tests/perfume_store_transactional_stock.sql contra
 * PostgreSQL real: este archivo corre en un runtime de un solo hilo y no
 * prueba concurrencia.
 */

const PRODUCT_A_ID = "test-pedido-repo-producto-a";
const PRODUCT_B_ID = "test-pedido-repo-producto-b";
const PRODUCT_INACTIVE_ID = "test-pedido-repo-producto-inactivo";

function resetLocalStore() {
  localStore.customers.length = 0;
  localStore.orders.length = 0;
  localStore.orderItems.length = 0;
  localStore.payments.length = 0;
  localStore.fiados.length = 0;
  localStore.products = localStore.products.filter(
    (product) =>
      product.id !== PRODUCT_A_ID &&
      product.id !== PRODUCT_B_ID &&
      product.id !== PRODUCT_INACTIVE_ID
  );
  localStore.products.push(
    {
      id: PRODUCT_A_ID,
      nombre: "Producto A de prueba",
      precioVenta: 10000,
      costoUnitario: 4000,
      stockActual: 5,
      stockReservado: 0,
      activo: true
    },
    {
      id: PRODUCT_B_ID,
      nombre: "Producto B de prueba",
      precioVenta: 20000,
      costoUnitario: 9000,
      stockActual: 3,
      stockReservado: 0,
      activo: true
    },
    {
      id: PRODUCT_INACTIVE_ID,
      nombre: "Producto inactivo de prueba",
      precioVenta: 5000,
      costoUnitario: 1000,
      stockActual: 10,
      stockReservado: 0,
      activo: false
    }
  );
}

function baseCliente() {
  return {
    nombre: "Cliente de prueba",
    rut: "11.111.111-1",
    email: "cliente@example.com",
    telefono: "+56912345678",
    region: "Región Metropolitana de Santiago",
    comuna: "Providencia",
    direccion: "Calle Falsa 123"
  };
}

function findProduct(id: string) {
  const product = localStore.products.find((item) => item.id === id);

  if (!product) {
    throw new Error(`Producto de prueba ${id} no encontrado.`);
  }

  return product;
}

describe("MemoryPedidoRepository (equivalente en memoria de las RPC transaccionales)", () => {
  beforeEach(() => {
    resetLocalStore();
  });

  it("Starken siempre cuesta 0 y reserva stock sin tocar stock_actual", async () => {
    const repository = getPedidoRepository();

    const result = await repository.crearPedidoTransaccional({
      cliente: baseCliente(),
      items: [{ productoId: PRODUCT_A_ID, cantidad: 2 }],
      metodoDespacho: METODO_DESPACHO_STARKEN_POR_PAGAR
    });

    expect(result.costoDespacho).toBe(0);
    expect(result.total).toBe(result.subtotal);
    expect(result.estadoPedido).toBe("NUEVO");
    expect(result.estadoPago).toBe("SIN_PAGO");

    const productA = findProduct(PRODUCT_A_ID);
    expect(productA.stockActual).toBe(5);
    expect(productA.stockReservado).toBe(2);
  });

  it("domicilio semanal suma el costo de despacho una sola vez, no por producto", async () => {
    const repository = getPedidoRepository();

    const result = await repository.crearPedidoTransaccional({
      cliente: baseCliente(),
      items: [
        { productoId: PRODUCT_A_ID, cantidad: 1 },
        { productoId: PRODUCT_B_ID, cantidad: 1 }
      ],
      metodoDespacho: METODO_DESPACHO_DOMICILIO_SEMANAL
    });

    expect(result.subtotal).toBe(30000);
    expect(result.costoDespacho).toBe(4000);
    expect(result.total).toBe(34000);
  });

  it("agrega cantidades duplicadas del mismo producto en una sola reserva", async () => {
    const repository = getPedidoRepository();

    const result = await repository.crearPedidoTransaccional({
      cliente: baseCliente(),
      items: [
        { productoId: PRODUCT_A_ID, cantidad: 1 },
        { productoId: PRODUCT_A_ID, cantidad: 2 }
      ],
      metodoDespacho: METODO_DESPACHO_STARKEN_POR_PAGAR
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.cantidad).toBe(3);
    expect(findProduct(PRODUCT_A_ID).stockReservado).toBe(3);
  });

  it("rechaza cantidades que superan el disponible (stock_actual - stock_reservado) con PF005", async () => {
    const repository = getPedidoRepository();

    await expect(
      repository.crearPedidoTransaccional({
        cliente: baseCliente(),
        items: [{ productoId: PRODUCT_A_ID, cantidad: 6 }],
        metodoDespacho: METODO_DESPACHO_STARKEN_POR_PAGAR
      })
    ).rejects.toMatchObject({ code: "PF005" });
  });

  it("una segunda reserva sobre el mismo producto respeta lo ya reservado por la primera", async () => {
    const repository = getPedidoRepository();

    await repository.crearPedidoTransaccional({
      cliente: baseCliente(),
      items: [{ productoId: PRODUCT_A_ID, cantidad: 4 }],
      metodoDespacho: METODO_DESPACHO_STARKEN_POR_PAGAR
    });

    // Quedan 5 - 4 = 1 disponible; pedir 2 debe fallar aunque stock_actual siga en 5.
    await expect(
      repository.crearPedidoTransaccional({
        cliente: baseCliente(),
        items: [{ productoId: PRODUCT_A_ID, cantidad: 2 }],
        metodoDespacho: METODO_DESPACHO_STARKEN_POR_PAGAR
      })
    ).rejects.toMatchObject({ code: "PF005" });

    expect(findProduct(PRODUCT_A_ID).stockActual).toBe(5);
    expect(findProduct(PRODUCT_A_ID).stockReservado).toBe(4);
  });

  it("rechaza un producto inactivo con PF003", async () => {
    const repository = getPedidoRepository();

    await expect(
      repository.crearPedidoTransaccional({
        cliente: baseCliente(),
        items: [{ productoId: PRODUCT_INACTIVE_ID, cantidad: 1 }],
        metodoDespacho: METODO_DESPACHO_STARKEN_POR_PAGAR
      })
    ).rejects.toMatchObject({ code: "PF003" });
  });

  it("rechaza un producto inexistente con PF002", async () => {
    const repository = getPedidoRepository();

    await expect(
      repository.crearPedidoTransaccional({
        cliente: baseCliente(),
        items: [{ productoId: "producto-que-no-existe", cantidad: 1 }],
        metodoDespacho: METODO_DESPACHO_STARKEN_POR_PAGAR
      })
    ).rejects.toMatchObject({ code: "PF002" });
  });

  it("mark_perfume_order_paid: convierte la reserva en descuento fisico (stock_actual y stock_reservado bajan juntos)", async () => {
    const repository = getPedidoRepository();
    const creado = await repository.crearPedidoTransaccional({
      cliente: baseCliente(),
      items: [{ productoId: PRODUCT_A_ID, cantidad: 2 }],
      metodoDespacho: METODO_DESPACHO_STARKEN_POR_PAGAR
    });

    const pagado = await repository.marcarPedidoPagadoTransaccional(
      creado.pedidoId,
      "TRANSFERENCIA"
    );

    expect(pagado.estadoPedido).toBe("PAGADO");
    expect(pagado.estadoPago).toBe("PAGADO");

    const productA = findProduct(PRODUCT_A_ID);
    expect(productA.stockActual).toBe(3);
    expect(productA.stockReservado).toBe(0);
  });

  it("rechaza marcar pagado dos veces: el pedido ya no esta en NUEVO/AGENDADO (PF012)", async () => {
    const repository = getPedidoRepository();
    const creado = await repository.crearPedidoTransaccional({
      cliente: baseCliente(),
      items: [{ productoId: PRODUCT_A_ID, cantidad: 1 }],
      metodoDespacho: METODO_DESPACHO_STARKEN_POR_PAGAR
    });

    await repository.marcarPedidoPagadoTransaccional(creado.pedidoId, "EFECTIVO");

    await expect(
      repository.marcarPedidoPagadoTransaccional(creado.pedidoId, "EFECTIVO")
    ).rejects.toMatchObject({ code: "PF012" });
  });

  it("cancel (pedido sin pago): libera solo stock_reservado, stock_actual queda intacto", async () => {
    const repository = getPedidoRepository();
    const creado = await repository.crearPedidoTransaccional({
      cliente: baseCliente(),
      items: [{ productoId: PRODUCT_A_ID, cantidad: 2 }],
      metodoDespacho: METODO_DESPACHO_STARKEN_POR_PAGAR
    });

    const cancelado = await repository.cancelarPedidoTransaccional(
      creado.pedidoId,
      "Cliente se arrepintio",
      false
    );

    expect(cancelado.estadoPedido).toBe("CANCELADO");
    expect(cancelado.estadoPago).toBe("CANCELADO");

    const productA = findProduct(PRODUCT_A_ID);
    expect(productA.stockActual).toBe(5);
    expect(productA.stockReservado).toBe(0);
  });

  it("cancel (pedido pagado) exige confirmarReposicionPagado=true y repone solo stock_actual", async () => {
    const repository = getPedidoRepository();
    const creado = await repository.crearPedidoTransaccional({
      cliente: baseCliente(),
      items: [{ productoId: PRODUCT_A_ID, cantidad: 2 }],
      metodoDespacho: METODO_DESPACHO_STARKEN_POR_PAGAR
    });
    await repository.marcarPedidoPagadoTransaccional(creado.pedidoId, "EFECTIVO");

    await expect(
      repository.cancelarPedidoTransaccional(creado.pedidoId, "Pedido con error", false)
    ).rejects.toMatchObject({ code: "PF013" });

    // Sin confirmacion, ni stock_actual ni stock_reservado deben cambiar.
    expect(findProduct(PRODUCT_A_ID).stockActual).toBe(3);
    expect(findProduct(PRODUCT_A_ID).stockReservado).toBe(0);

    const cancelado = await repository.cancelarPedidoTransaccional(
      creado.pedidoId,
      "Pedido con error",
      true
    );

    expect(cancelado.estadoPedido).toBe("CANCELADO");
    // El dinero ya fue recibido: estadoPago se mantiene en PAGADO, no pasa a
    // CANCELADO (solo el pedido se cancela; el registro de pago persiste).
    expect(cancelado.estadoPago).toBe("PAGADO");
    const productA = findProduct(PRODUCT_A_ID);
    expect(productA.stockActual).toBe(5);
    expect(productA.stockReservado).toBe(0);
  });

  it("no permite cancelar dos veces el mismo pedido (PF011), evitando doble reposicion", async () => {
    const repository = getPedidoRepository();
    const creado = await repository.crearPedidoTransaccional({
      cliente: baseCliente(),
      items: [{ productoId: PRODUCT_A_ID, cantidad: 1 }],
      metodoDespacho: METODO_DESPACHO_STARKEN_POR_PAGAR
    });

    await repository.cancelarPedidoTransaccional(creado.pedidoId, "Motivo", false);

    await expect(
      repository.cancelarPedidoTransaccional(creado.pedidoId, "Motivo", false)
    ).rejects.toMatchObject({ code: "PF011" });

    expect(findProduct(PRODUCT_A_ID).stockActual).toBe(5);
  });

  it("advance_perfume_order_status: PAGADO -> PREPARANDO -> DESPACHADO -> ENTREGADO, sin tocar stock", async () => {
    const repository = getPedidoRepository();
    const creado = await repository.crearPedidoTransaccional({
      cliente: baseCliente(),
      items: [{ productoId: PRODUCT_A_ID, cantidad: 1 }],
      metodoDespacho: METODO_DESPACHO_STARKEN_POR_PAGAR
    });
    await repository.marcarPedidoPagadoTransaccional(creado.pedidoId, "EFECTIVO");

    const preparando = await repository.avanzarEstadoPedidoTransaccional(
      creado.pedidoId,
      "PREPARANDO"
    );
    expect(preparando.estadoPedido).toBe("PREPARANDO");

    const despachado = await repository.avanzarEstadoPedidoTransaccional(
      creado.pedidoId,
      "DESPACHADO"
    );
    expect(despachado.estadoPedido).toBe("DESPACHADO");

    const entregado = await repository.avanzarEstadoPedidoTransaccional(
      creado.pedidoId,
      "ENTREGADO"
    );
    expect(entregado.estadoPedido).toBe("ENTREGADO");

    const productA = findProduct(PRODUCT_A_ID);
    expect(productA.stockActual).toBe(4);
    expect(productA.stockReservado).toBe(0);
  });

  it("rechaza una transicion de estado invalida (saltarse PREPARANDO) con PF012", async () => {
    const repository = getPedidoRepository();
    const creado = await repository.crearPedidoTransaccional({
      cliente: baseCliente(),
      items: [{ productoId: PRODUCT_A_ID, cantidad: 1 }],
      metodoDespacho: METODO_DESPACHO_STARKEN_POR_PAGAR
    });
    await repository.marcarPedidoPagadoTransaccional(creado.pedidoId, "EFECTIVO");

    await expect(
      repository.avanzarEstadoPedidoTransaccional(creado.pedidoId, "DESPACHADO")
    ).rejects.toMatchObject({ code: "PF012" });
  });

  it("los errores de la reserva son instancias de PerfumeOrderError con mensaje en espanol", async () => {
    const repository = getPedidoRepository();

    try {
      await repository.crearPedidoTransaccional({
        cliente: baseCliente(),
        items: [{ productoId: PRODUCT_A_ID, cantidad: 999 }],
        metodoDespacho: METODO_DESPACHO_STARKEN_POR_PAGAR
      });
      expect.unreachable("Debia lanzar PerfumeOrderError");
    } catch (error) {
      expect(error).toBeInstanceOf(PerfumeOrderError);
      expect((error as PerfumeOrderError).message).toMatch(/stock insuficiente/i);
    }
  });
});

describe("MemoryPedidoRepository.crearVentaDirectaTransaccional (equivalente en memoria de create_direct_sale_v1, Fase 3B.2)", () => {
  beforeEach(() => {
    resetLocalStore();
  });

  it("registra una venta con un item, descuenta stock_actual de inmediato y registra el pago", async () => {
    const repository = getPedidoRepository();

    const result = await repository.crearVentaDirectaTransaccional({
      cliente: { nombre: "Cliente mostrador" },
      items: [{ productoId: PRODUCT_A_ID, cantidad: 2 }],
      formaPago: "EFECTIVO",
      esFiado: false,
      idempotencyKey: "venta-un-item"
    });

    expect(result.estadoPedido).toBe("ENTREGADO");
    expect(result.estadoPago).toBe("PAGADO");
    expect(result.total).toBe(20000);
    expect(result.origenPedido).toBe("ADMIN_DIRECTO");

    const productA = findProduct(PRODUCT_A_ID);
    expect(productA.stockActual).toBe(3);
    expect(productA.stockReservado).toBe(0);

    const pago = localStore.payments.find((item) => item.pedidoId === result.pedidoId);
    expect(pago?.monto).toBe(20000);
    expect(pago?.metodoPago).toBe("EFECTIVO");
  });

  it("registra una venta con varios productos en una sola operacion", async () => {
    const repository = getPedidoRepository();

    const result = await repository.crearVentaDirectaTransaccional({
      cliente: {},
      items: [
        { productoId: PRODUCT_A_ID, cantidad: 1 },
        { productoId: PRODUCT_B_ID, cantidad: 1 }
      ],
      formaPago: "TRANSFERENCIA",
      esFiado: false,
      idempotencyKey: "venta-multi-producto"
    });

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(30000);
    expect(findProduct(PRODUCT_A_ID).stockActual).toBe(4);
    expect(findProduct(PRODUCT_B_ID).stockActual).toBe(2);
  });

  it("rechaza un producto inactivo (pausado) con PF003", async () => {
    const repository = getPedidoRepository();

    await expect(
      repository.crearVentaDirectaTransaccional({
        cliente: {},
        items: [{ productoId: PRODUCT_INACTIVE_ID, cantidad: 1 }],
        formaPago: "EFECTIVO",
        esFiado: false,
        idempotencyKey: "venta-producto-inactivo"
      })
    ).rejects.toMatchObject({ code: "PF003" });

    expect(findProduct(PRODUCT_INACTIVE_ID).stockActual).toBe(10);
  });

  it("rechaza cantidades que superan el stock disponible con PF005", async () => {
    const repository = getPedidoRepository();

    await expect(
      repository.crearVentaDirectaTransaccional({
        cliente: {},
        items: [{ productoId: PRODUCT_A_ID, cantidad: 6 }],
        formaPago: "EFECTIVO",
        esFiado: false,
        idempotencyKey: "venta-stock-insuficiente"
      })
    ).rejects.toMatchObject({ code: "PF005" });

    expect(findProduct(PRODUCT_A_ID).stockActual).toBe(5);
  });

  it("rechaza una forma de pago invalida con PF006", async () => {
    const repository = getPedidoRepository();

    await expect(
      repository.crearVentaDirectaTransaccional({
        cliente: {},
        items: [{ productoId: PRODUCT_A_ID, cantidad: 1 }],
        // @ts-expect-error forzando un valor fuera de la union para probar el rechazo
        formaPago: "BITCOIN",
        esFiado: false,
        idempotencyKey: "venta-forma-pago-invalida"
      })
    ).rejects.toMatchObject({ code: "PF006" });
  });

  it("una venta fiada queda ENTREGADO/SIN_PAGO y registra un fiado pendiente, no un pago", async () => {
    const repository = getPedidoRepository();

    const result = await repository.crearVentaDirectaTransaccional({
      cliente: { nombre: "Cliente fiado" },
      items: [{ productoId: PRODUCT_A_ID, cantidad: 1 }],
      formaPago: "EFECTIVO",
      esFiado: true,
      idempotencyKey: "venta-fiada"
    });

    expect(result.estadoPedido).toBe("ENTREGADO");
    expect(result.estadoPago).toBe("SIN_PAGO");

    const fiado = localStore.fiados.find((item) => item.pedidoId === result.pedidoId);
    expect(fiado?.montoPendiente).toBe(10000);
    expect(fiado?.estado).toBe("PENDIENTE");

    const pago = localStore.payments.find((item) => item.pedidoId === result.pedidoId);
    expect(pago).toBeUndefined();
  });

  it("un reintento con la misma idempotencyKey no descuenta stock ni registra una segunda venta", async () => {
    const repository = getPedidoRepository();
    const request = {
      cliente: { nombre: "Cliente doble clic" },
      items: [{ productoId: PRODUCT_A_ID, cantidad: 2 }],
      formaPago: "EFECTIVO" as const,
      esFiado: false,
      idempotencyKey: "venta-doble-clic"
    };

    const first = await repository.crearVentaDirectaTransaccional(request);
    const second = await repository.crearVentaDirectaTransaccional(request);

    expect(second).toEqual(first);
    expect(
      localStore.orders.filter((order) => order.idempotencyKey === "venta-doble-clic")
    ).toHaveLength(1);
    expect(findProduct(PRODUCT_A_ID).stockActual).toBe(3);

    const payments = localStore.payments.filter((item) => item.pedidoId === first.pedidoId);
    expect(payments).toHaveLength(1);
  });
});
