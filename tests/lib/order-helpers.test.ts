import { describe, expect, it } from "vitest";
import { calcularTotalPedido, normalizarProductoParaCarrito, removeUnavailableCartItems, validarCantidad } from "@/lib/order-helpers.ts";
import type { ProductRecord } from "@/lib/types";

function product(overrides: Partial<ProductRecord> & { id: string; nombre: string }): ProductRecord {
  return {
    marca: "Marca",
    contenido: "50ML",
    precioVenta: 10000,
    ...overrides
  };
}

describe("order-helpers - normalizarProductoParaCarrito", () => {
  it("resuelve nombre/contenido/precio en vivo desde el producto actual (no los congela en el item)", () => {
    const products = [product({ id: "p1", nombre: "La Bomba", contenido: "80ML", precioVenta: 65000 })];
    const [line] = normalizarProductoParaCarrito([{ productoId: "p1", cantidad: 2 }], products);

    expect(line.product?.nombre).toBe("La Bomba");
    expect(line.product?.contenido).toBe("80ML");
    expect(line.subtotal).toBe(130000);
  });

  it("caso obligatorio: dos variantes de la misma familia (mismo nombre, distinto contenido) coexisten como lineas separadas", () => {
    const products = [
      product({ id: "lm30", nombre: "Lady Million", marca: "Paco Rabanne", contenido: "30ML", precioVenta: 33750 }),
      product({ id: "lm80", nombre: "Lady Million", marca: "Paco Rabanne", contenido: "80ML", precioVenta: 67500 })
    ];
    const lines = normalizarProductoParaCarrito(
      [
        { productoId: "lm30", cantidad: 1 },
        { productoId: "lm80", cantidad: 1 }
      ],
      products
    );

    expect(lines).toHaveLength(2); // nunca se fusionan en una sola linea
    expect(lines.map((l) => l.product?.contenido).sort()).toEqual(["30ML", "80ML"]);
    expect(lines.map((l) => l.productoId).sort()).toEqual(["lm30", "lm80"]);
  });

  it("producto no encontrado (ej. eliminado) produce subtotal 0 sin lanzar", () => {
    const [line] = normalizarProductoParaCarrito([{ productoId: "inexistente", cantidad: 3 }], []);
    expect(line.product).toBeUndefined();
    expect(line.subtotal).toBe(0);
  });
});

describe("order-helpers - calcularTotalPedido", () => {
  it("suma los subtotales de todas las lineas", () => {
    expect(calcularTotalPedido([{ subtotal: 1000 }, { subtotal: 2000 }])).toBe(3000);
  });

  it("array vacio suma 0", () => {
    expect(calcularTotalPedido([])).toBe(0);
  });
});

describe("order-helpers - validarCantidad", () => {
  it("acepta enteros positivos", () => {
    expect(validarCantidad(1)).toBe(true);
    expect(validarCantidad(5)).toBe(true);
  });

  it("rechaza cero, negativos y no enteros", () => {
    expect(validarCantidad(0)).toBe(false);
    expect(validarCantidad(-1)).toBe(false);
    expect(validarCantidad(1.5)).toBe(false);
  });
});

describe("order-helpers - reconciliación del carrito", () => {
  it("retira productos obsoletos después de vaciar o actualizar el catálogo", () => {
    expect(removeUnavailableCartItems(
      [{ productoId: "retirado", cantidad: 2 }, { productoId: "vigente", cantidad: 1 }],
      [{ id: "vigente" }]
    )).toEqual({ items: [{ productoId: "vigente", cantidad: 1 }], removed: true });
  });
});
