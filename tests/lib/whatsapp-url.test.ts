import { describe, expect, it } from "vitest";
import { createWhatsAppActionState } from "@/lib/whatsapp/action";
import {
  buildStorefrontShareMessage,
  buildWhatsAppRecipientUrl,
  buildWhatsAppShareUrl,
  isValidWhatsAppUrl,
  normalizeWhatsAppPhone,
  resolveStorefrontRoot
} from "@/lib/whatsapp/url";

describe("URLs WhatsApp centralizadas", () => {
  it.each([
    ["9 1234-5678", "56912345678"],
    ["+56 9 1234 5678", "56912345678"],
    ["09-1234-5678", "56912345678"]
  ])("normaliza teléfono chileno %s", (input, expected) => {
    expect(normalizeWhatsAppPhone(input)).toBe(expected);
  });

  it.each(["", "123", "+56 2 1234 5678", "teléfono"])("rechaza teléfono inválido %s", (phone) => {
    expect(normalizeWhatsAppPhone(phone)).toBeNull();
    expect(buildWhatsAppRecipientUrl(phone, "Hola")).toBeNull();
  });

  it("codifica acentos, saltos, símbolos, URL y emoji exactamente una vez", () => {
    const message = "¡Hola! 👋\nCatálogo: https://tienda.test/?a=1&b=dos";
    const url = buildWhatsAppRecipientUrl("+56 9 1234-5678", message);
    expect(url).toBeTruthy();
    expect(new URL(url!).searchParams.get("text")).toBe(message);
    expect(url).toContain("%C2%A1Hola!");
    expect(url).not.toContain("%25C2%25A1");
    expect(isValidWhatsAppUrl(url)).toBe(true);
  });

  it("construye share sin destinatario", () => {
    const url = buildWhatsAppShareUrl("Hola 👋");
    expect(url).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(new URL(url!).pathname).toBe("/");
  });

  it.each([
    ["https://smellme-store.vercel.app/admin/pedidos?token=no", "https://smellme-store.vercel.app/"],
    ["https://smellme.cl/configuracion", "https://smellme.cl/"]
  ])("resuelve el home publico sin rutas administrativas", (origin, root) => {
    expect(resolveStorefrontRoot(origin)).toBe(root);
    const message = buildStorefrontShareMessage("Conoce mi tiendita 👋", origin);
    expect(message).toContain(root);
    expect(message).not.toMatch(/\/admin|token=/);
  });

  it("rechaza orígenes y URLs no confiables", () => {
    expect(resolveStorefrontRoot("javascript:alert(1)")).toBeNull();
    expect(isValidWhatsAppUrl("https://example.com/?text=x")).toBe(false);
    expect(isValidWhatsAppUrl("https://wa.me/56912345678")).toBe(false);
  });
});

describe("estado posterior a una acción", () => {
  it("prepara CTA sólo con respuesta exitosa y teléfono válido", () => {
    const state = createWhatsAppActionState({ message: "Pago confirmado", phone: "+56 9 1234 5678", orderId: "order-1", action: "pagado" });
    expect(state).toMatchObject({ reason: "ready", orderId: "order-1", action: "pagado" });
    expect(isValidWhatsAppUrl(state?.url)).toBe(true);
  });

  it("mantiene copiar mensaje aunque el teléfono sea inválido", () => {
    expect(createWhatsAppActionState({ message: "Datos listos", phone: "inválido", orderId: "order-1", action: "reenviar-transferencia" }))
      .toMatchObject({ reason: "invalid-phone", url: undefined });
    expect(createWhatsAppActionState({ message: "", phone: "+56 9 1234 5678", orderId: "order-1", action: "pagado" })).toBeNull();
  });
});
