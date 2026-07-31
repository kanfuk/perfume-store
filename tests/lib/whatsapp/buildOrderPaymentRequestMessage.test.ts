import { describe, expect, it } from "vitest";
import { buildOrderPaymentRequestMessage } from "@/lib/whatsapp/buildOrderPaymentRequestMessage";

const bankData = {
  accountHolder: "Smellme SpA",
  rut: "76.123.456-7",
  bank: "Banco Estado",
  accountType: "Cuenta Vista",
  accountNumber: "12345678",
  email: "pagos@smellme.cl"
};

describe("buildOrderPaymentRequestMessage", () => {
  it("incluye el detalle completo del pedido, subtotal, despacho, total y datos bancarios", () => {
    const message = buildOrderPaymentRequestMessage({
      customerName: "Rodrigo",
      codigo: "PS-ABC123",
      items: [
        { name: "Perfume floral", quantity: 2 },
        { name: "Perfume amaderado", quantity: 1 }
      ],
      subtotal: 45000,
      costoDespacho: 4000,
      total: 49000,
      bankData
    });

    expect(message).toContain("PS-ABC123");
    expect(message).toContain("2 x Perfume floral");
    expect(message).toContain("1 x Perfume amaderado");
    expect(message).toContain("Subtotal");
    expect(message).toContain("Despacho");
    expect(message).toContain("Total");
    expect(message).toContain("Smellme SpA");
    expect(message).toContain("76.123.456-7");
    expect(message).toContain("Banco Estado");
    expect(message).toContain("Cuenta Vista");
    expect(message).toContain("12345678");
    expect(message).toContain("pagos@smellme.cl");
  });

  it("usa el total persistido del pedido, no recalcula nada", () => {
    const message = buildOrderPaymentRequestMessage({
      customerName: "Rodrigo",
      items: [{ name: "Perfume floral", quantity: 3 }],
      subtotal: 999999,
      total: 999999,
      bankData
    });

    expect(message).toContain("$999.999");
  });

  it("formatea montos en pesos chilenos", () => {
    const message = buildOrderPaymentRequestMessage({
      items: [{ name: "Perfume floral", quantity: 1 }],
      subtotal: 15000,
      total: 15000,
      bankData
    });

    expect(message).toMatch(/\$\s?15\.000/);
  });

  it("omite la linea de despacho cuando el costo es 0", () => {
    const message = buildOrderPaymentRequestMessage({
      items: [{ name: "Perfume floral", quantity: 1 }],
      subtotal: 15000,
      costoDespacho: 0,
      total: 15000,
      bankData
    });

    expect(message).not.toContain("Despacho:");
  });

  it("nunca muestra 'undefined' o 'null' aunque falten campos opcionales", () => {
    const message = buildOrderPaymentRequestMessage({
      items: [],
      bankData
    });

    expect(message.toLowerCase()).not.toContain("undefined");
    expect(message.toLowerCase()).not.toContain("null");
  });

  it("omite lineas bancarias vacias en vez de mostrar campos en blanco", () => {
    const message = buildOrderPaymentRequestMessage({
      items: [{ name: "Perfume floral", quantity: 1 }],
      total: 15000,
      bankData: {
        accountHolder: "Smellme SpA",
        rut: "",
        bank: "Banco Estado",
        accountType: "",
        accountNumber: "12345678",
        email: ""
      }
    });

    expect(message).toContain("Titular: Smellme SpA");
    expect(message).toContain("Banco: Banco Estado");
    expect(message).toContain("N° de cuenta: 12345678");
    expect(message).not.toContain("RUT:");
    expect(message).not.toContain("Tipo de cuenta:");
    expect(message).not.toContain("Correo:");
  });

  it("saluda con el nombre del cliente cuando esta presente y de forma generica si no", () => {
    const withName = buildOrderPaymentRequestMessage({
      customerName: "Rodrigo",
      items: [],
      bankData
    });
    const withoutName = buildOrderPaymentRequestMessage({
      items: [],
      bankData
    });

    expect(withName).toContain("Hola Rodrigo");
    expect(withoutName.startsWith("Hola")).toBe(true);
    expect(withoutName).not.toContain("Hola undefined");
  });
});
