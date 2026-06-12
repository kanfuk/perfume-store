import { describe, expect, it } from "vitest";
import { Cliente } from "@/domain/Cliente";
import { CuentaFiado } from "@/domain/CuentaFiado";
import { DetallePedido } from "@/domain/DetallePedido";
import { Pedido } from "@/domain/Pedido";
import { Producto } from "@/domain/Producto";
import { Venta } from "@/domain/Venta";
import {
  ESTADO_PAGO_FIADO,
  ESTADO_PAGO_PAGADO,
  ESTADO_PAGO_SIN_PAGO,
  ESTADO_PEDIDO_AGENDADO,
  ESTADO_PEDIDO_CANCELADO,
  ESTADO_PEDIDO_FINALIZADO,
  ESTADO_PEDIDO_PENDIENTE,
  HORAS_EXPIRACION_PEDIDO
} from "@/lib/constants";

function createPedidoBase() {
  const cliente = new Cliente({
    nombre: "Rodrigo",
    telefono: "999999999",
    lugarTrabajo: "Finanzas"
  });

  const producto = new Producto({
    id: "pan-amasado",
    nombre: "Pan amasado",
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
    items: [item]
  });
}

describe("Pedido", () => {
  it("crea pedidos nuevos como pendientes y sin pago", () => {
    const pedido = createPedidoBase();

    expect(pedido.total).toBe(1000);
    expect(pedido.estadoPedido).toBe(ESTADO_PEDIDO_PENDIENTE);
    expect(pedido.estadoPago).toBe(ESTADO_PAGO_SIN_PAGO);
  });

  it("permite agendar un pedido pendiente", () => {
    const pedido = createPedidoBase();

    pedido.agendar(new Date("2026-06-12T10:00:00.000Z"));

    expect(pedido.estadoPedido).toBe(ESTADO_PEDIDO_AGENDADO);
    expect(pedido.fechaAgendado?.toISOString()).toBe(
      "2026-06-12T10:00:00.000Z"
    );
  });

  it("marca pagado un pedido agendado y lo finaliza", () => {
    const pedido = createPedidoBase();
    pedido.agendar(new Date("2026-06-12T10:00:00.000Z"));

    pedido.marcarPagado(new Date("2026-06-12T11:00:00.000Z"));

    expect(pedido.estadoPedido).toBe(ESTADO_PEDIDO_FINALIZADO);
    expect(pedido.estadoPago).toBe(ESTADO_PAGO_PAGADO);
    expect(pedido.fechaCierre?.toISOString()).toBe(
      "2026-06-12T11:00:00.000Z"
    );
  });

  it("marca fiado un pedido agendado y crea una cuenta pendiente", () => {
    const pedido = createPedidoBase();
    pedido.agendar();
    pedido.marcarFiado();

    const cuentaFiado = new CuentaFiado({
      cliente: pedido.cliente,
      pedido
    });

    expect(pedido.estadoPedido).toBe(ESTADO_PEDIDO_FINALIZADO);
    expect(pedido.estadoPago).toBe(ESTADO_PAGO_FIADO);
    expect(cuentaFiado.estaPendiente()).toBe(true);
    expect(cuentaFiado.calcularDeuda()).toBe(1000);
  });

  it("impide pagar pedidos cancelados o pendientes", () => {
    const pedidoPendiente = createPedidoBase();
    expect(() => pedidoPendiente.marcarPagado()).toThrow(
      "Solo se puede marcar pagado un pedido agendado."
    );

    const pedidoCancelado = createPedidoBase();
    pedidoCancelado.cancelar("Cliente no confirma");

    expect(pedidoCancelado.estadoPedido).toBe(ESTADO_PEDIDO_CANCELADO);
    expect(() => pedidoCancelado.marcarPagado()).toThrow(
      "Solo se puede marcar pagado un pedido agendado."
    );
  });

  it("detecta pedidos expirados segun la ventana oficial", () => {
    const pedido = createPedidoBase();
    const fechaPedido = new Date("2026-06-09T08:00:00.000Z");
    const ahora = new Date("2026-06-12T08:00:00.000Z");

    const pedidoAntiguo = new Pedido({
      cliente: pedido.cliente,
      items: pedido.items,
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
