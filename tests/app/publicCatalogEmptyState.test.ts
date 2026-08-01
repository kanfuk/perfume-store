import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("estados públicos del catálogo", () => {
  const orderForm = readFileSync("components/OrderForm.tsx", "utf8");

  it("diferencia catálogo vacío de error de carga", () => {
    expect(orderForm).toContain("Estamos actualizando nuestro catálogo. Vuelve pronto para descubrir las fragancias disponibles.");
    expect(orderForm).toContain("No pudimos cargar el catálogo. Intenta nuevamente.");
  });
});
