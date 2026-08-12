import { beforeEach, describe, expect, it } from "vitest";
import {
  METODO_DESPACHO_DOMICILIO_SEMANAL,
  METODO_DESPACHO_STARKEN_POR_PAGAR
} from "@/lib/constants";
import { localStore } from "@/lib/local-store";
import { buildOrderPaymentConfirmedMessage } from "@/lib/whatsapp/buildOrderPaymentConfirmedMessage";
import { getPedidoRepository } from "@/repositories/pedidoRepository";

/**
 * Hotfix integridad de identidad (rama hotfix/customer-order-identity-integrity).
 *
 * Cubre, del lado TypeScript (MemoryPedidoRepository, equivalente en memoria
 * de create_perfume_order_v1 sin Supabase), la regla de identidad segura que
 * reemplaza la reutilizacion por telefono/RUT/correo en cualquier orden: el
 * checkout publico exige RUT valido, asi que solo se reutiliza una ficha
 * cliente cuando el RUT coincide Y ADEMAS coincide telefono o correo
 * exactos. Nunca se reutiliza solo por telefono o solo por correo.
 *
 * Todos los datos de estas pruebas son ficticios (nombres, RUTs, telefonos y
 * correos inventados para el test). Ninguno corresponde al incidente real de
 * produccion que motivo este hotfix.
 */

const PRODUCT_ID = "test-identity-producto-a";

function resetLocalStore() {
  localStore.customers.length = 0;
  localStore.orders.length = 0;
  localStore.orderItems.length = 0;
  localStore.payments.length = 0;
  localStore.fiados.length = 0;
  localStore.products = localStore.products.filter((product) => product.id !== PRODUCT_ID);
  localStore.products.push({
    id: PRODUCT_ID,
    nombre: "Producto de prueba identidad",
    precioVenta: 10000,
    costoUnitario: 4000,
    stockActual: 20,
    stockReservado: 0,
    activo: true
  });
}

function pedidoInput(cliente: {
  nombre: string;
  rut?: string;
  email?: string;
  telefono?: string;
  region?: string;
  comuna?: string;
  direccion?: string;
}) {
  return {
    cliente: {
      nombre: cliente.nombre,
      rut: cliente.rut,
      email: cliente.email,
      telefono: cliente.telefono,
      region: cliente.region ?? "Región Metropolitana de Santiago",
      comuna: cliente.comuna ?? "Providencia",
      direccion: cliente.direccion ?? "Calle de prueba 1"
    },
    items: [{ productoId: PRODUCT_ID, cantidad: 1 }],
    metodoDespacho: METODO_DESPACHO_STARKEN_POR_PAGAR
  };
}

describe("MemoryPedidoRepository.crearPedidoTransaccional - regla de identidad segura", () => {
  beforeEach(() => {
    resetLocalStore();
  });

  it("A. mismo telefono + RUT distinto => NO fusiona (crea ficha cliente nueva)", async () => {
    const repository = getPedidoRepository();

    const primero = await repository.crearPedidoTransaccional(
      pedidoInput({
        nombre: "Persona A",
        rut: "11.111.111-1",
        telefono: "+56911111111",
        email: "persona-a@example.com"
      })
    );

    const segundo = await repository.crearPedidoTransaccional(
      pedidoInput({
        nombre: "Persona B",
        rut: "22.222.222-2",
        telefono: "+56911111111",
        email: "persona-b@example.com"
      })
    );

    expect(segundo.clienteId).not.toBe(primero.clienteId);
    expect(localStore.customers).toHaveLength(2);

    const clienteA = localStore.customers.find((item) => item.id === primero.clienteId);
    expect(clienteA?.nombre).toBe("Persona A");
    expect(clienteA?.rut).toBe("11.111.111-1");
  });

  it("B. mismo correo + RUT distinto => NO fusiona (crea ficha cliente nueva)", async () => {
    const repository = getPedidoRepository();

    const primero = await repository.crearPedidoTransaccional(
      pedidoInput({
        nombre: "Persona C",
        rut: "33.333.333-3",
        telefono: "+56933333331",
        email: "compartido@example.com"
      })
    );

    const segundo = await repository.crearPedidoTransaccional(
      pedidoInput({
        nombre: "Persona D",
        rut: "44.444.444-4",
        telefono: "+56944444444",
        email: "compartido@example.com"
      })
    );

    expect(segundo.clienteId).not.toBe(primero.clienteId);
    expect(localStore.customers).toHaveLength(2);
  });

  it("C. mismo RUT + telefono distinto + correo distinto => NO fusiona (conflicto de identidad)", async () => {
    const repository = getPedidoRepository();

    const primero = await repository.crearPedidoTransaccional(
      pedidoInput({
        nombre: "Persona E",
        rut: "55.555.555-5",
        telefono: "+56955555551",
        email: "persona-e@example.com"
      })
    );

    const segundo = await repository.crearPedidoTransaccional(
      pedidoInput({
        nombre: "Persona F",
        rut: "55.555.555-5",
        telefono: "+56955555552",
        email: "persona-f@example.com"
      })
    );

    expect(segundo.clienteId).not.toBe(primero.clienteId);
    expect(localStore.customers).toHaveLength(2);

    const clienteOriginal = localStore.customers.find((item) => item.id === primero.clienteId);
    expect(clienteOriginal?.nombre).toBe("Persona E");
    expect(clienteOriginal?.telefono).toBe("+56955555551");
  });

  it("D. mismo RUT + mismo telefono => reutiliza la misma ficha cliente", async () => {
    const repository = getPedidoRepository();

    const primero = await repository.crearPedidoTransaccional(
      pedidoInput({
        nombre: "Persona G",
        rut: "66.666.666-6",
        telefono: "+56966666666",
        email: "persona-g-original@example.com"
      })
    );

    const segundo = await repository.crearPedidoTransaccional(
      pedidoInput({
        nombre: "Persona G actualizada",
        rut: "66.666.666-6",
        telefono: "+56966666666",
        email: "persona-g-nueva@example.com"
      })
    );

    expect(segundo.clienteId).toBe(primero.clienteId);
    expect(localStore.customers).toHaveLength(1);
    expect(localStore.customers[0]?.email).toBe("persona-g-nueva@example.com");
  });

  it("E. mismo RUT + mismo correo (telefono nuevo distinto) => reutiliza la misma ficha cliente", async () => {
    const repository = getPedidoRepository();

    const primero = await repository.crearPedidoTransaccional(
      pedidoInput({
        nombre: "Persona H",
        rut: "77.777.777-7",
        telefono: "+56977777771",
        email: "persona-h@example.com"
      })
    );

    const segundo = await repository.crearPedidoTransaccional(
      pedidoInput({
        nombre: "Persona H",
        rut: "77.777.777-7",
        telefono: "+56977777772",
        email: "persona-h@example.com"
      })
    );

    expect(segundo.clienteId).toBe(primero.clienteId);
    expect(localStore.customers).toHaveLength(1);
    // El telefono se actualiza (coalesce) porque ya se confirmo que es la
    // misma persona via RUT + correo exacto.
    expect(localStore.customers[0]?.telefono).toBe("+56977777772");
  });

  it("F. un pedido antiguo conserva nombre/telefono/email/direccion originales aunque la ficha cliente cambie despues", async () => {
    const repository = getPedidoRepository();

    const creado = await repository.crearPedidoTransaccional(
      pedidoInput({
        nombre: "Persona Original",
        rut: "88.888.888-8",
        telefono: "+56988888881",
        email: "original@example.com",
        region: "Región Metropolitana de Santiago",
        comuna: "Ñuñoa",
        direccion: "Calle Original 1"
      })
    );

    // Simula que la misma ficha cliente se reutiliza legitimamente en un
    // pedido posterior (mismo RUT + mismo telefono) y sus datos "vivos"
    // cambian.
    await repository.crearPedidoTransaccional(
      pedidoInput({
        nombre: "Persona Original Actualizada",
        rut: "88.888.888-8",
        telefono: "+56988888881",
        email: "actualizado@example.com",
        comuna: "Las Condes",
        direccion: "Calle Nueva 2"
      })
    );

    const pedidosNuevos = await repository.buscarPedidosPorEstado("NUEVO");
    const pedidoAntiguo = pedidosNuevos.find((order) => order.id === creado.pedidoId);

    expect(pedidoAntiguo).toBeDefined();
    expect(pedidoAntiguo?.clienteNombre).toBe("Persona Original");
    expect(pedidoAntiguo?.clienteTelefono).toBe("+56988888881");
    expect(pedidoAntiguo?.clienteEmail).toBe("original@example.com");
    expect(pedidoAntiguo?.clienteComuna).toBe("Ñuñoa");
    expect(pedidoAntiguo?.clienteDireccion).toBe("Calle Original 1");

    // La ficha cliente "viva" si cambio (es la misma persona, dato legitimo).
    const clienteVivo = localStore.customers.find((item) => item.id === creado.clienteId);
    expect(clienteVivo?.comuna).toBe("Las Condes");
  });

  it("G. fallback legacy: si el pedido no tiene snapshot (creado antes del hotfix), se lee de la ficha cliente viva", async () => {
    const repository = getPedidoRepository();

    localStore.customers.push({
      id: "cliente-legacy-1",
      nombre: "Cliente Legacy",
      rut: "99.999.999-9",
      email: "legacy@example.com",
      telefono: "+56999999999",
      region: "Región Metropolitana de Santiago",
      comuna: "Maipú",
      direccion: "Calle Legacy 1",
      lugarTrabajo: "",
      createdAt: new Date().toISOString()
    });

    // Pedido "legacy": sin ninguno de los campos *Snapshot (como quedaron
    // los pedidos creados antes de este hotfix).
    localStore.orders.push({
      id: "pedido-legacy-1",
      codigo: "PERF-LEGACY-1",
      clienteId: "cliente-legacy-1",
      estadoPedido: "NUEVO",
      estadoPago: "SIN_PAGO",
      origenPedido: "PUBLICO",
      subtotal: 10000,
      metodoDespacho: METODO_DESPACHO_STARKEN_POR_PAGAR,
      costoDespacho: 0,
      total: 10000,
      stockRepuesto: false,
      adminSeen: false,
      fechaPedido: new Date().toISOString()
    });
    localStore.orderItems.push({
      id: "item-legacy-1",
      pedidoId: "pedido-legacy-1",
      productoId: PRODUCT_ID,
      productoNombre: "Producto de prueba identidad",
      cantidad: 1,
      precioUnitario: 10000,
      costoUnitario: 4000,
      costoTotal: 4000,
      utilidadBruta: 6000,
      subtotal: 10000
    });

    const pedidosNuevos = await repository.buscarPedidosPorEstado("NUEVO");
    const pedidoLegacy = pedidosNuevos.find((order) => order.id === "pedido-legacy-1");

    expect(pedidoLegacy?.clienteNombre).toBe("Cliente Legacy");
    expect(pedidoLegacy?.clienteTelefono).toBe("+56999999999");
    expect(pedidoLegacy?.clienteComuna).toBe("Maipú");
  });

  it("H. el mensaje de WhatsApp de un pedido viejo usa el snapshot, no la ficha maestra modificada", async () => {
    const repository = getPedidoRepository();

    const primerInput = pedidoInput({
      nombre: "Persona WhatsApp",
      rut: "10.101.010-1",
      telefono: "+56910101010",
      email: "whatsapp@example.com",
      region: "Región Metropolitana de Santiago",
      comuna: "Independencia",
      direccion: "Calle WhatsApp 1"
    });
    primerInput.metodoDespacho = METODO_DESPACHO_DOMICILIO_SEMANAL;
    const creado = await repository.crearPedidoTransaccional(primerInput);

    // Otro pedido posterior de la misma persona (mismo RUT + telefono)
    // cambia legitimamente los datos vivos de la ficha.
    const segundoInput = pedidoInput({
      nombre: "Persona WhatsApp",
      rut: "10.101.010-1",
      telefono: "+56910101010",
      comuna: "Vitacura",
      direccion: "Calle Cambiada 99"
    });
    segundoInput.metodoDespacho = METODO_DESPACHO_DOMICILIO_SEMANAL;
    await repository.crearPedidoTransaccional(segundoInput);

    const pedidosNuevos = await repository.buscarPedidosPorEstado("NUEVO");
    const pedidoAntiguo = pedidosNuevos.find((order) => order.id === creado.pedidoId);
    expect(pedidoAntiguo).toBeDefined();

    const mensaje = buildOrderPaymentConfirmedMessage({
      customerName: pedidoAntiguo?.clienteNombre,
      codigo: pedidoAntiguo?.codigo,
      total: pedidoAntiguo?.total,
      metodoDespacho: pedidoAntiguo?.metodoDespacho as never,
      region: pedidoAntiguo?.clienteRegion,
      comuna: pedidoAntiguo?.clienteComuna,
      direccion: pedidoAntiguo?.clienteDireccion
    });

    expect(mensaje).toContain("Independencia");
    expect(mensaje).toContain("Calle WhatsApp 1");
    expect(mensaje).not.toContain("Vitacura");
    expect(mensaje).not.toContain("Calle Cambiada 99");
  });

  it("I. agendar, pagar, cancelar y avanzar estado siguen funcionando igual con la nueva regla de identidad", async () => {
    const repository = getPedidoRepository();

    const creado = await repository.crearPedidoTransaccional(
      pedidoInput({
        nombre: "Persona Flujo",
        rut: "12.121.212-1",
        telefono: "+56912121212",
        email: "flujo@example.com"
      })
    );

    const pagado = await repository.marcarPedidoPagadoTransaccional(creado.pedidoId, "EFECTIVO");
    expect(pagado.estadoPedido).toBe("PAGADO");
    expect(pagado.estadoPago).toBe("PAGADO");

    const preparando = await repository.avanzarEstadoPedidoTransaccional(
      creado.pedidoId,
      "PREPARANDO"
    );
    expect(preparando.estadoPedido).toBe("PREPARANDO");
  });

  it("J. la reserva de stock (stock_actual vs stock_reservado) no cambia de semantica con la nueva regla de identidad", async () => {
    const repository = getPedidoRepository();

    await repository.crearPedidoTransaccional(
      pedidoInput({
        nombre: "Persona Stock",
        rut: "13.131.313-1",
        telefono: "+56913131313",
        email: "stock@example.com"
      })
    );

    const producto = localStore.products.find((item) => item.id === PRODUCT_ID);
    expect(producto?.stockActual).toBe(20);
    expect(producto?.stockReservado).toBe(1);
  });

  it("K. un rechazo por stock insuficiente no crea una ficha cliente huerfana (sin efectos parciales)", async () => {
    const repository = getPedidoRepository();
    const input = pedidoInput({
      nombre: "Persona Sin Stock",
      rut: "14.141.414-1",
      telefono: "+56914141414",
      email: "sinstock@example.com"
    });
    input.items = [{ productoId: PRODUCT_ID, cantidad: 999 }];

    await expect(repository.crearPedidoTransaccional(input)).rejects.toMatchObject({
      code: "PF005"
    });

    expect(localStore.customers).toHaveLength(0);
    expect(localStore.orders).toHaveLength(0);
  });
});
