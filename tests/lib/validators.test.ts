import { describe, expect, it } from "vitest";
import { mockProducts } from "@/lib/mocks/products";
import { METODO_DESPACHO_STARKEN_POR_PAGAR } from "@/lib/constants";
import {
  ADMIN_PASSWORD_MIN_LENGTH,
  isValidEmail,
  normalizeEmail,
  validateAdminDirectSaleForm,
  validateAdminNewPassword,
  validateCustomerOrderForm,
  validateCustomOrderForm
} from "@/lib/validators";

const activeProductId = mockProducts[0]?.id ?? "perfume-floral-100";

function baseCustomerForm(
  overrides: Partial<Parameters<typeof validateCustomerOrderForm>[0]> = {}
): Parameters<typeof validateCustomerOrderForm>[0] {
  return {
    nombre: "Rodrigo Riedmann",
    rut: "11.111.111-1",
    email: "rodrigo@example.com",
    telefono: "999999999",
    region: "Metropolitana",
    comuna: "Providencia",
    direccion: "Calle Falsa 123",
    metodoDespacho: METODO_DESPACHO_STARKEN_POR_PAGAR,
    items: [{ productoId: activeProductId, cantidad: 2 }],
    ...overrides
  };
}

describe("isValidEmail", () => {
  it("acepta correos con formato valido", () => {
    expect(isValidEmail("persona@dominio.cl")).toBe(true);
  });

  it("rechaza correos sin arroba o dominio", () => {
    expect(isValidEmail("persona-sin-arroba")).toBe(false);
    expect(isValidEmail("persona@sindominio")).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("recorta espacios y convierte a minusculas", () => {
    expect(normalizeEmail("  Admin@Ejemplo.COM  ")).toBe("admin@ejemplo.com");
  });

  it("no altera un correo ya normalizado", () => {
    expect(normalizeEmail("admin@ejemplo.com")).toBe("admin@ejemplo.com");
  });
});

describe("validateAdminNewPassword", () => {
  it("rechaza contraseñas mas cortas que el minimo", () => {
    const result = validateAdminNewPassword("1234567", "1234567");

    expect(result).toBe(
      `La contraseña debe tener al menos ${ADMIN_PASSWORD_MIN_LENGTH} caracteres.`
    );
  });

  it("rechaza contraseñas que no coinciden", () => {
    const result = validateAdminNewPassword("contraseña-larga", "otra-contraseña");

    expect(result).toBe("Las contraseñas no coinciden.");
  });

  it("acepta una contraseña valida y coincidente", () => {
    const result = validateAdminNewPassword("contraseña-larga", "contraseña-larga");

    expect(result).toBeNull();
  });
});

describe("validateCustomerOrderForm", () => {
  it("valida un formulario correcto", () => {
    const result = validateCustomerOrderForm(baseCustomerForm(), mockProducts);

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it("rechaza campos obligatorios vacios", () => {
    const result = validateCustomerOrderForm(
      baseCustomerForm({
        nombre: "",
        rut: "",
        email: "",
        telefono: "",
        region: "",
        comuna: "",
        direccion: "",
        items: []
      }),
      mockProducts
    );

    expect(result.isValid).toBe(false);
    expect(result.errors.nombre).toBe("Ingresa tu nombre completo.");
    expect(result.errors.rut).toBe("Ingresa tu RUT.");
    expect(result.errors.email).toBe("Ingresa tu correo electrónico.");
    expect(result.errors.telefono).toBe("Ingresa tu número de teléfono.");
    expect(result.errors.region).toBe("Selecciona tu región.");
    expect(result.errors.comuna).toBe("Selecciona tu comuna.");
    expect(result.errors.direccion).toBe("Ingresa tu dirección de despacho.");
    expect(result.errors.items).toBe("Agrega al menos un producto al pedido.");
  });

  it("rechaza un RUT chileno invalido", () => {
    const result = validateCustomerOrderForm(
      baseCustomerForm({ rut: "11.111.111-9" }),
      mockProducts
    );

    expect(result.isValid).toBe(false);
    expect(result.errors.rut).toBe("Ingresa un RUT chileno válido. Ejemplo: 12.345.678-5.");
  });

  it("acepta un RUT chileno valido con o sin puntos", () => {
    const result = validateCustomerOrderForm(
      baseCustomerForm({ rut: "111111111" }),
      mockProducts
    );

    expect(result.isValid).toBe(true);
  });

  it("rechaza un correo invalido", () => {
    const result = validateCustomerOrderForm(
      baseCustomerForm({ email: "no-es-un-correo" }),
      mockProducts
    );

    expect(result.isValid).toBe(false);
    expect(result.errors.email).toBe("Ingresa un correo electrónico válido.");
  });

  it("rechaza productos inactivos", () => {
    const result = validateCustomerOrderForm(
      baseCustomerForm({ items: [{ productoId: "producto-inactivo", cantidad: 1 }] }),
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
      baseCustomerForm({ telefono: "1234" }),
      mockProducts
    );

    expect(result.isValid).toBe(false);
    expect(result.errors.telefono).toBe(
      "Ingresa un celular chileno válido. Ejemplo: +56 9 1234 5678."
    );
  });

  it("acepta celular chileno con codigo pais", () => {
    const result = validateCustomerOrderForm(
      baseCustomerForm({ telefono: "+56 9 1234 5678" }),
      mockProducts
    );

    expect(result.isValid).toBe(true);
  });

  it("rechaza numeros que no son celular chileno", () => {
    const result = validateCustomerOrderForm(
      baseCustomerForm({ telefono: "+56 2 2345 6789" }),
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

  it("rechaza estados iniciales que ya no existen (PENDIENTE/FIADO heredados de Pauli)", () => {
    const result = validateCustomOrderForm(
      {
        nombre: "Paola",
        nombreProducto: "Pedido especial",
        cantidad: 1,
        precioAcordado: 1000,
        // @ts-expect-error -- valor heredado de Pauli Store, ya no valido
        estadoInicial: "PENDIENTE"
      },
      []
    );

    expect(result.isValid).toBe(false);
    expect(result.errors.estadoInicial).toBe("Selecciona el estado inicial del pedido.");
  });
});
