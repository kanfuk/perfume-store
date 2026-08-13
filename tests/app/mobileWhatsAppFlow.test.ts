import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync("components/admin/AdminDashboard.tsx", "utf8");
const floating = readFileSync("components/shared/WhatsAppFloatingButton.tsx", "utf8");

describe("flujo móvil seguro de WhatsApp", () => {
  it("no abre WhatsApp automáticamente después de await", () => {
    expect(dashboard).not.toMatch(/window\.open|about:blank|location\.replace|location\.assign/);
    expect(dashboard).not.toMatch(/setTimeout\([^)]*WhatsApp/i);
    expect(dashboard).toContain("createWhatsAppActionState");
    expect(dashboard).toContain("Enviar confirmación por WhatsApp");
  });

  it("expone CTA, copia, volver y cierre tras el éxito", () => {
    expect(dashboard).toContain("Pago confirmado correctamente");
    expect(dashboard).toContain("Abrir WhatsApp");
    expect(dashboard).toContain("Copiar mensaje");
    expect(dashboard).toContain("Volver al pedido");
    expect(dashboard).toContain(">Cerrar</button>");
  });

  it("termina loading, evita doble acción y restaura scroll", () => {
    expect(dashboard).toContain("orderActionsInFlightRef.current.has(actionKey)");
    expect(dashboard).toContain("finally");
    expect(dashboard).toContain("orderActionsInFlightRef.current.delete(actionKey)");
    expect(dashboard).toContain("document.body.style.overflow = originalOverflow");
  });

  it("usa bottom sheet responsive con safe area y touch targets", () => {
    expect(dashboard).toContain("sm:items-center");
    expect(dashboard).toContain("max-h-[calc(100dvh-24px)]");
    expect(dashboard).toContain("safe-area-inset-bottom");
    expect(dashboard).toContain("min-h-11");
  });

  it("comparte el home publico estable sin origen Preview ni pestaña auxiliar", () => {
    expect(floating).toContain("getStorefrontUrl");
    expect(floating).not.toContain("window.location.origin");
    expect(floating).toContain("buildStorefrontShareMessage");
    expect(floating).toContain("Compartir mi tiendita");
    expect(floating).not.toContain("target=\"_blank\"");
    expect(floating).not.toMatch(/https:\/\/[^"']*vercel\.app/);
  });
});
