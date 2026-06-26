import { describe, expect, it } from "vitest";
import { mockProducts } from "@/lib/mocks/products";
import {
  validateAdminDirectSaleForm,
  validateCustomerOrderForm,
  validateCustomOrderForm
} from "@/lib/validators";

const activeProductId = mockProducts[0]?.id ?? "dobladita-solo-queso";

describe("validateCustomerOrderForm", () => {
  it("valida un formulario correcto", () => {
    const result = validateCustomerOrderForm(
      {
        nombre: "Rodrigo",
        telefono: "999999999",
        lugarTrabajo: "Finanzas",
        fechaEntrega: "2026-06-13",
        items: [{ productoId: activeProductId, cantidad: 2 }]
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
        fechaEntrega: "",
        items: []
      },
      mockProducts
    );

    expect(result.isValid).toBe(false);
    expect(result.errors.nombre).toBe("Ingresa tu nombre.");
    expect(result.errors.telefono).toBe("Ingresa tu número de teléfono.");
    expect(result.errors.lugarTrabajo).toBe("Ingresa tu lugar de trabajo.");
    expect(result.errors.items).toBe("Agrega al menos un producto al pedido.");
  });

  it("rechaza productos inactivos", () => {
    const result = validateCustomerOrderForm(
      {
        nombre: "Rodrigo",
        telefono: "999999999",
        lugarTrabajo: "Finanzas",
        fechaEntrega: "2026-06-13",
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
        fechaEntrega: "2026-06-13",
        items: [{ productoId: activeProductId, cantidad: 1 }]
      },
      mockProducts
    );

    expect(result.isValid).toBe(false);
    expect(result.errors.telefono).toBe(
      "Ingresa un celular chileno válido. Ejemplo: +56 9 1234 5678."
    );
  });

  it("acepta celular chileno con codigo pais", () => {
    const result = validateCustomerOrderForm(
      {
        nombre: "Rodrigo",
        telefono: "+56 9 1234 5678",
        lugarTrabajo: "Finanzas",
        fechaEntrega: "2026-06-13",
        items: [{ productoId: activeProductId, cantidad: 1 }]
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
        fechaEntrega: "2026-06-13",
        items: [{ productoId: activeProductId, cantidad: 1 }]
      },
      mockProducts
    );

    expect(result.isValid).toBe(false);
    expect(result.errors.telefono).toBe(
      "Ingresa un celular chileno válido. Ejemplo: +56 9 1234 5678."
    );
  });
});

describe("validateAdminDirectSaleForm", () => {
  it("permite vender productos inactivos si existen en el catálogo interno", () => {
    const result = validateAdminDirectSaleForm(
      {
        items: [{ productoId: "producto-inactivo", cantidad: 2 }],
        estadoPago: "PAGADO",
        clienteModo: "ocasional"
      },
      [
        {
          id: "producto-inactivo",
          nombre: "Producto inactivo",
          precioVenta: 1500,
          stockActual: 0,
          stockAgenda: 0,
          activo: false
        }
      ]
    );

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it("sigue bloqueando si el stock controlado no alcanza", () => {
    const result = validateAdminDirectSaleForm(
      {
        items: [{ productoId: activeProductId, cantidad: 99 }],
        estadoPago: "PAGADO",
        clienteModo: "ocasional"
      },
      mockProducts
    );

    expect(result.isValid).toBe(false);
    expect(result.errors.items).toContain("solo tiene");
  });
});

describe("validateCustomOrderForm", () => {
  it("permite vincular un producto inactivo sin stock controlado", () => {
    const result = validateCustomOrderForm(
      {
        nombre: "Paola",
        nombreProducto: "Pedido especial",
        productoBaseId: "producto-inactivo",
        cantidad: 4,
        precioAcordado: 5000,
        estadoInicial: "PAGADO"
      },
      [
        {
          id: "producto-inactivo",
          nombre: "Producto inactivo",
          precioVenta: 5000,
          stockActual: 0,
          stockAgenda: 0,
          activo: false
        }
      ]
    );

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual({});
  });
});
