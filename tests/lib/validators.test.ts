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
        items: [{ productoId: "pan-amasado", cantidad: 2 }]
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
        items: []
      },
      mockProducts
    );

    expect(result.isValid).toBe(false);
    expect(result.errors.nombre).toBe("Ingresa tu nombre.");
    expect(result.errors.telefono).toBe("Ingresa tu numero de telefono.");
    expect(result.errors.lugarTrabajo).toBe("Ingresa tu lugar de trabajo.");
    expect(result.errors.items).toBe("Agrega al menos un producto al pedido.");
  });

  it("rechaza productos inactivos", () => {
    const result = validateCustomerOrderForm(
      {
        nombre: "Rodrigo",
        telefono: "999999999",
        lugarTrabajo: "Finanzas",
        items: [{ productoId: "producto-inactivo", cantidad: 1 }]
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
    expect(result.errors.items).toBe("Todos los items deben usar productos activos.");
  });

  it("rechaza telefonos demasiado cortos", () => {
    const result = validateCustomerOrderForm(
      {
        nombre: "Rodrigo",
        telefono: "1234",
        lugarTrabajo: "Finanzas",
        items: [{ productoId: "pan-amasado", cantidad: 1 }]
      },
      mockProducts
    );

    expect(result.isValid).toBe(false);
    expect(result.errors.telefono).toBe(
      "Ingresa un celular chileno valido. Ejemplo: +56 9 1234 5678."
    );
  });

  it("acepta celular chileno con codigo pais", () => {
    const result = validateCustomerOrderForm(
      {
        nombre: "Rodrigo",
        telefono: "+56 9 1234 5678",
        lugarTrabajo: "Finanzas",
        items: [{ productoId: "pan-amasado", cantidad: 1 }]
      },
      mockProducts
    );

    expect(result.isValid).toBe(true);
  });

  it("rechaza numeros que no son celular chileno", () => {
    const result = validateCustomerOrderForm(
      {
        nombre: "Rodrigo",
        telefono: "+56 2 2345 6789",
        lugarTrabajo: "Finanzas",
        items: [{ productoId: "pan-amasado", cantidad: 1 }]
      },
      mockProducts
    );

    expect(result.isValid).toBe(false);
    expect(result.errors.telefono).toBe(
      "Ingresa un celular chileno valido. Ejemplo: +56 9 1234 5678."
    );
  });
});
