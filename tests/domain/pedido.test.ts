import { describe, expect, it } from "vitest";
import { Cliente } from "@/domain/Cliente";
import { DetallePedido } from "@/domain/DetallePedido";
import { Pedido } from "@/domain/Pedido";
import { Producto } from "@/domain/Producto";
import { Venta } from "@/domain/Venta";
import {
  DOMICILIO_SEMANAL_COSTO_FALLBACK,
  ESTADO_PAGO_CANCELADO,
  ESTADO_PAGO_PAGADO,
  ESTADO_PAGO_SIN_PAGO,
  ESTADO_PEDIDO_AGENDADO,
  ESTADO_PEDIDO_CANCELADO,
  ESTADO_PEDIDO_NUEVO,
  ESTADO_PEDIDO_PAGADO,
  HORAS_EXPIRACION_PEDIDO,
  METODO_DESPACHO_DOMICILIO_SEMANAL,
  METODO_DESPACHO_STARKEN_POR_PAGAR
} from "@/lib/constants";

function createPedidoBase() {
  const cliente = new Cliente({
    nombre: "Rodrigo",
    telefono: "999999999",
    rut: "11.111.111-1",
    email: "rodrigo@example.com",
    region: "Región Metropolitana de Santiago",
    comuna: "Providencia",
    direccion: "Calle Falsa 123"
  });

  const producto = new Producto({
    id: "perfume-1",
    nombre: "Perfume floral",
    precioVenta: 500,
    costoUnitario: 250,
    activo: true
  });

  const item = new DetallePedido({
    producto,
    cantidad: 2
  });

  return new Pedido({
    cliente,
    items: [item],
    metodoDespacho: METODO_DESPACHO_STARKEN_POR_PAGAR
  });
}

describe("Pedido", () => {
  it("crea pedidos nuevos como NUEVO y sin pago, con despacho Starken en 0", () => {
    const pedido = createPedidoBase();

    expect(pedido.subtotal).toBe(1000);
    expect(pedido.costoDespacho).toBe(0);
    expect(pedido.total).toBe(1000);
    expect(pedido.estadoPedido).toBe(ESTADO_PEDIDO_NUEVO);
    expect(pedido.estadoPago).toBe(ESTADO_PAGO_SIN_PAGO);
  });

  it("suma el costo de despacho a domicilio semanal una sola vez", () => {
    const cliente = new Cliente({ nombre: "Claudia", telefono: "988888888" });
    const producto = new Producto({
      id: "perfume-2",
      nombre: "Perfume amaderado",
      precioVenta: 1000,
      activo: true
    });
    const items = [
      new DetallePedido({ producto, cantidad: 3 })
    ];

    const pedido = new Pedido({
      cliente,
      items,
      metodoDespacho: METODO_DESPACHO_DOMICILIO_SEMANAL
    });

    expect(pedido.subtotal).toBe(3000);
    expect(pedido.costoDespacho).toBe(DOMICILIO_SEMANAL_COSTO_FALLBACK);
    expect(pedido.total).toBe(3000 + DOMICILIO_SEMANAL_COSTO_FALLBACK);
  });

  it("permite agendar un pedido nuevo", () => {
    const pedido = createPedidoBase();

    pedido.agendar(new Date("2026-06-12T10:00:00.000Z"));

    expect(pedido.estadoPedido).toBe(ESTADO_PEDIDO_AGENDADO);
    expect(pedido.fechaAgendado?.toISOString()).toBe("2026-06-12T10:00:00.000Z");
  });

  it("marca pagado un pedido agendado sin saltar directo a entregado", () => {
    const pedido = createPedidoBase();
    pedido.agendar(new Date("2026-06-12T10:00:00.000Z"));

    pedido.marcarPagado(new Date("2026-06-12T11:00:00.000Z"));

    expect(pedido.estadoPedido).toBe(ESTADO_PEDIDO_PAGADO);
    expect(pedido.estadoPago).toBe(ESTADO_PAGO_PAGADO);
    expect(pedido.fechaPago?.toISOString()).toBe("2026-06-12T11:00:00.000Z");
  });

  it("recorre el flujo completo PAGADO -> PREPARANDO -> DESPACHADO -> ENTREGADO", () => {
    const pedido = createPedidoBase();
    pedido.agendar();
    pedido.marcarPagado();

    pedido.iniciarPreparacion(new Date("2026-06-13T09:00:00.000Z"));
    expect(pedido.estadoPedido).toBe("PREPARANDO");

    pedido.despachar(new Date("2026-06-14T09:00:00.000Z"));
    expect(pedido.estadoPedido).toBe("DESPACHADO");

    pedido.entregar(new Date("2026-06-15T09:00:00.000Z"));
    expect(pedido.estadoPedido).toBe("ENTREGADO");
    expect(pedido.fechaEntrega?.toISOString()).toBe("2026-06-15T09:00:00.000Z");
  });

  it("impide pagar pedidos cancelados o recien creados (sin pasar por agendado)", () => {
    const pedidoNuevo = createPedidoBase();
    expect(() => pedidoNuevo.marcarPagado()).toThrow(
      "Transicion invalida desde NUEVO hacia PAGADO."
    );

    const pedidoCancelado = createPedidoBase();
    pedidoCancelado.cancelar("Cliente no confirma");

    expect(pedidoCancelado.estadoPedido).toBe(ESTADO_PEDIDO_CANCELADO);
    expect(() => pedidoCancelado.marcarPagado()).toThrow(
      "Transicion invalida desde CANCELADO hacia PAGADO."
    );
  });

  it("cancelar un pedido sin pago tambien deja el pago en CANCELADO", () => {
    const pedido = createPedidoBase();
    pedido.cancelar("Sin stock");

    expect(pedido.estadoPedido).toBe(ESTADO_PEDIDO_CANCELADO);
    expect(pedido.estadoPago).toBe(ESTADO_PAGO_CANCELADO);
  });

  it("no permite cancelar un pedido pagado sin confirmar explicitamente la perdida de pago", () => {
    const pedido = createPedidoBase();
    pedido.agendar();
    pedido.marcarPagado();

    expect(() => pedido.cancelar("Cliente se arrepintio")).toThrow(
      "Este pedido ya fue pagado. Confirma explicitamente para cancelarlo."
    );

    pedido.cancelar("Cliente se arrepintio", { confirmarPagoPerdido: true });
    expect(pedido.estadoPedido).toBe(ESTADO_PEDIDO_CANCELADO);
    // El pago ya realizado no se borra silenciosamente.
    expect(pedido.estadoPago).toBe(ESTADO_PAGO_PAGADO);
  });

  it("detecta pedidos expirados segun la ventana oficial (solo en estado NUEVO)", () => {
    const pedido = createPedidoBase();
    const fechaPedido = new Date("2026-06-09T08:00:00.000Z");
    const ahora = new Date("2026-06-12T08:00:00.000Z");

    const pedidoAntiguo = new Pedido({
      cliente: pedido.cliente,
      items: pedido.items,
      metodoDespacho: METODO_DESPACHO_STARKEN_POR_PAGAR,
      fechaPedido
    });

    expect(pedidoAntiguo.estaExpirado(HORAS_EXPIRACION_PEDIDO, ahora)).toBe(true);
  });

  it("calcula utilidad de venta", () => {
    const pedido = createPedidoBase();
    pedido.agendar();
    pedido.marcarPagado();

    const venta = new Venta({ pedido });

    expect(venta.totalVenta).toBe(1000);
    expect(venta.totalCosto).toBe(500);
    expect(venta.utilidad).toBe(500);
  });
});
