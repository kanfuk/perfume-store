import { describe, expect, it } from "vitest";
import { METODO_DESPACHO_DOMICILIO_SEMANAL, METODO_DESPACHO_STARKEN_POR_PAGAR } from "@/lib/constants";
import { buildAdminOrderAlertMessage } from "@/lib/whatsapp/buildAdminOrderAlertMessage";
import { buildOrderConfirmationMessage } from "@/lib/whatsapp/buildOrderConfirmationMessage";
import { buildWhatsAppManualUrl } from "@/lib/whatsapp/buildWhatsAppManualUrl";

describe("buildOrderConfirmationMessage", () => {
  it("incluye codigo, subtotal, despacho y total", () => {
    const message = buildOrderConfirmationMessage({
      customerName: "Rodrigo",
      codigo: "PS-ABC123",
      items: [{ name: "Perfume floral", quantity: 2 }],
      subtotal: 1000,
      costoDespacho: 4000,
      total: 5000,
      metodoDespacho: METODO_DESPACHO_DOMICILIO_SEMANAL,
      direccion: "Calle Falsa 123"
    });

    expect(message).toContain("PS-ABC123");
    expect(message).toContain("Perfume floral");
    expect(message).toContain("Subtotal");
    expect(message).toContain("Despacho a domicilio");
    expect(message).toContain("Total");
    expect(message).toContain("Calle Falsa 123");
  });

  it("muestra 'Por pagar' para Starken cuando el costo de despacho es 0", () => {
    const message = buildOrderConfirmationMessage({
      customerName: "Rodrigo",
      items: [{ name: "Perfume floral", quantity: 1 }],
      subtotal: 500,
      costoDespacho: 0,
      total: 500,
      metodoDespacho: METODO_DESPACHO_STARKEN_POR_PAGAR
    });

    expect(message).toContain("Por pagar");
  });

  it("no contiene referencias a Pauli Store ni a dobladitas", () => {
    const message = buildOrderConfirmationMessage({
      customerName: "Rodrigo",
      items: [{ name: "Perfume floral", quantity: 1 }],
      total: 500
    });

    expect(message.toLowerCase()).not.toContain("pauli");
    expect(message.toLowerCase()).not.toContain("dobladita");
  });
});

describe("buildAdminOrderAlertMessage", () => {
  it("incluye codigo de pedido y costo de despacho o 'Por pagar'", () => {
    const message = buildAdminOrderAlertMessage({
      customerName: "Rodrigo",
      codigo: "PS-XYZ789",
      total: 500,
      metodoDespacho: METODO_DESPACHO_STARKEN_POR_PAGAR,
      costoDespacho: 0,
      items: [{ name: "Perfume floral", quantity: 1 }]
    });

    expect(message).toContain("PS-XYZ789");
    expect(message).toContain("Por pagar");
  });
});

describe("buildWhatsAppManualUrl", () => {
  it("codifica el mensaje con encodeURIComponent y no lo concatena crudo", () => {
    const url = buildWhatsAppManualUrl("56912345678", "Hola & bienvenido");

    expect(url).toBe("https://wa.me/56912345678?text=Hola%20%26%20bienvenido");
  });
});
