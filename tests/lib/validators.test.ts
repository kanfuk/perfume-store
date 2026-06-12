import { describe, expect, it } from "vitest";
import { mockProducts } from "@/lib/mocks/products";
import { validateCustomerOrderForm } from "@/lib/validators";

describe("validateCustomerOrderForm", () => {
  it("valida un formulario correcto", () => {
    const result = validateCustomerOrderForm(
      {
        nombre: "Rodrigo",
        telefono: "999999999",
        lugarTrabajo: "Finanzas",
        productoId: "pan-amasado",
        cantidad: 2
      },
      mockProducts
    );

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it("rechaza campos obligatorios vacios", () => {
    const result = validateCustomerOrderForm(
      {
        nombre: "",
        telefono: "",
        lugarTrabajo: "",
        productoId: "",
        cantidad: 0
      },
      mockProducts
    );

    expect(result.isValid).toBe(false);
    expect(result.errors.nombre).toBe("Ingresa tu nombre.");
    expect(result.errors.telefono).toBe("Ingresa tu numero de telefono.");
    expect(result.errors.lugarTrabajo).toBe("Ingresa tu lugar de trabajo.");
    expect(result.errors.productoId).toBe("Selecciona un producto.");
    expect(result.errors.cantidad).toBe("La cantidad debe ser al menos 1.");
  });

  it("rechaza productos inactivos", () => {
    const result = validateCustomerOrderForm(
      {
        nombre: "Rodrigo",
        telefono: "999999999",
        lugarTrabajo: "Finanzas",
        productoId: "producto-inactivo",
        cantidad: 1
      },
      [
        ...mockProducts,
        {
          id: "producto-inactivo",
          nombre: "Producto inactivo",
          precioVenta: 500,
          activo: false
        }
      ]
    );

    expect(result.isValid).toBe(false);
    expect(result.errors.productoId).toBe("Selecciona un producto activo.");
  });
});
