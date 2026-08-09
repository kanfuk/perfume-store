import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("PWA Smellme y avisos de pedidos", () => {
  const dashboard = readFileSync("components/admin/AdminDashboard.tsx", "utf8");
  const feedback = readFileSync("components/ui/AppFeedbackProvider.tsx", "utf8");
  const push = readFileSync("lib/pwa/sendWebPush.ts", "utf8");
  const worker = readFileSync("public/admin-sw.js", "utf8");

  it("deduplica el toast por id de pedido y conserva CTA a su detalle", () => {
    expect(dashboard).toContain("dedupeKey: `new-order:${order.id}`");
    expect(dashboard).toContain('message: "Nuevo pedido recibido"');
    expect(dashboard).toContain('actionLabel: "Ver pedido"');
    expect(feedback).toContain("seenDedupeKeysRef.current.has(dedupeKey)");
  });

  it("el push usa copy privado y abre pedidos sin exponer datos del cliente", () => {
    for (const source of [push, worker]) {
      expect(source).toContain("Nuevo pedido en Smellme");
      expect(source).toContain("Tienes un nuevo pedido pendiente de revisión.");
      expect(source).not.toMatch(/clienteNombre|telefono|direccion|precio/i);
    }
    expect(worker).toContain('"/admin/pedidos"');
    expect(worker).toContain('self.addEventListener("notificationclick"');
  });

  it("ambos manifests declaran nombre, slogan, colores e iconos maskable", () => {
    for (const file of ["public/site.webmanifest", "public/admin.webmanifest"]) {
      const manifest = JSON.parse(readFileSync(file, "utf8")) as { name: string; description: string; theme_color: string; background_color: string; icons: Array<{ purpose?: string; sizes: string }> };
      expect(manifest.name).toBe("Smellme");
      expect(manifest.description).toBe("Atrae sin decir una palabra.");
      expect(manifest.theme_color).toBe("#0b0b0b");
      expect(manifest.background_color).toBe("#0b0b0b");
      expect(manifest.icons).toEqual(expect.arrayContaining([
        expect.objectContaining({ purpose: "maskable", sizes: "192x192" }),
        expect.objectContaining({ purpose: "maskable", sizes: "512x512" })
      ]));
    }
  });
});
