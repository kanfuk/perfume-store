import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("MVP V2 sin asistente externo de imágenes", () => {
  it("no expone rutas, pantalla ni servicio del asistente", () => {
    expect(existsSync("app/admin/catalogo/imagenes/page.tsx")).toBe(false);
    expect(existsSync("app/api/admin/image-assistant/analyze/route.ts")).toBe(false);
    expect(existsSync("app/api/admin/image-assistant/health/route.ts")).toBe(false);
    expect(existsSync("services/imageAssistantService.ts")).toBe(false);
    expect(existsSync("components/admin/ImageAssistantPanel.tsx")).toBe(false);
  });

  it("no declara secretos ni feature flags del proveedor retirado", () => {
    const envExample = readFileSync(".env.example", "utf8");
    expect(envExample).not.toMatch(/BRAVE_SEARCH|IMAGE_ASSISTANT/);
  });

  it("retira la limpieza amplia histórica del runtime", () => {
    expect(readFileSync("app/api/admin/maintenance/route.ts", "utf8")).not.toContain("clear-test-data");
    expect(readFileSync("services/adminMaintenanceService.ts", "utf8")).not.toContain("admin_limpiar_datos_prueba");
  });

  it("conserva el flujo manual de imágenes", () => {
    expect(existsSync("supabase/migrations/20260804000000_safe_image_assistant_history.sql")).toBe(true);
    expect(existsSync("app/api/admin/products/[productId]/image/route.ts")).toBe(true);
    expect(existsSync("services/productImageService.ts")).toBe(true);
    expect(existsSync("lib/product-image-processing.ts")).toBe(true);
  });
});
