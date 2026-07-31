import { describe, expect, it } from "vitest";
import {
  METODO_DESPACHO_DOMICILIO_SEMANAL,
  METODO_DESPACHO_STARKEN_POR_PAGAR
} from "@/lib/constants";
import { buildOrderPaymentConfirmedMessage } from "@/lib/whatsapp/buildOrderPaymentConfirmedMessage";

describe("buildOrderPaymentConfirmedMessage", () => {
  it("incluye el total pagado y el bloque completo de coordinacion de entrega", () => {
    const message = buildOrderPaymentConfirmedMessage({
      customerName: "Rodrigo",
      codigo: "PS-ABC123",
      total: 49000,
      metodoDespacho: METODO_DESPACHO_DOMICILIO_SEMANAL,
      region: "Metropolitana",
      comuna: "Providencia",
      direccion: "Calle Falsa 123",
      referenciaDireccion: "Depto 4B"
    });

    expect(message).toContain("PS-ABC123");
    expect(message).toContain("Total pagado");
    expect(message).toContain("$49.000");
    expect(message).toContain("Despacho a domicilio");
    expect(message).toContain("Metropolitana");
    expect(message).toContain("Providencia");
    expect(message).toContain("Calle Falsa 123");
    expect(message).toContain("Depto 4B");
  });

  it("omite las lineas de direccion cuando no hay datos (nunca inventa una direccion)", () => {
    const message = buildOrderPaymentConfirmedMessage({
      customerName: "Rodrigo",
      total: 15000
    });

    expect(message).not.toContain("Region:");
    expect(message).not.toContain("Comuna:");
    expect(message).not.toContain("Direccion:");
    expect(message).not.toContain("Referencia:");
  });

  it("agrega la nota de pago en sucursal para Starken por pagar", () => {
    const message = buildOrderPaymentConfirmedMessage({
      total: 15000,
      metodoDespacho: METODO_DESPACHO_STARKEN_POR_PAGAR
    });

    expect(message).toContain("sucursal Starken");
  });

  it("no agrega la nota de Starken para despacho a domicilio semanal", () => {
    const message = buildOrderPaymentConfirmedMessage({
      total: 15000,
      metodoDespacho: METODO_DESPACHO_DOMICILIO_SEMANAL
    });

    expect(message).not.toContain("sucursal Starken");
  });

  it("nunca muestra 'undefined' o 'null' aunque falten campos opcionales", () => {
    const message = buildOrderPaymentConfirmedMessage({});

    expect(message.toLowerCase()).not.toContain("undefined");
    expect(message.toLowerCase()).not.toContain("null");
  });
});
