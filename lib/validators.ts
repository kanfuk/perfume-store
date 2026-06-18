/**
 * Proyecto: Pauli Store
 * Módulo: Validadores
 * Descripción: Validaciones de formulario y reglas básicas compartidas del negocio.
 * Autor: Equipo Pauli Store
 * Buenas prácticas: Código modular, validado y orientado a mantenibilidad.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

import type { ProductoProps } from "@/domain/Producto";
import { isValidChileanMobilePhone } from "@/lib/chile-phone";
import type {
  AdminDirectSaleRequest,
  CustomOrderRequest,
  CustomerOrderLineInput
} from "@/lib/types";

export type CustomerFormData = {
  nombre: string;
  telefono: string;
  lugarTrabajo: string;
  items: CustomerOrderLineInput[];
  contactoOculto?: string;
};

type CustomerFormErrors = Partial<Record<keyof CustomerFormData, string>>;

export function validateCustomerOrderForm(
  data: CustomerFormData,
  products: ProductoProps[]
) {
  const errors: CustomerFormErrors = {};

  if (!data.nombre.trim()) {
    errors.nombre = "Ingresa tu nombre.";
  }

  if (!data.telefono.trim()) {
    errors.telefono = "Ingresa tu número de teléfono.";
  } else if (!isValidChileanMobilePhone(data.telefono)) {
    errors.telefono = "Ingresa un celular chileno válido. Ejemplo: +56 9 1234 5678.";
  }

  if (!data.lugarTrabajo.trim()) {
    errors.lugarTrabajo = "Ingresa tu lugar de trabajo.";
  }

  if (!Array.isArray(data.items) || data.items.length === 0) {
    errors.items = "Agrega al menos un producto al pedido.";
  } else {
    for (const item of data.items) {
      const producto = products.find((product) => product.id === item.productoId);

      if (!item.productoId) {
        errors.items = "Todos los items deben tener un producto.";
        break;
      }

      if (!producto || producto.activo === false) {
        errors.items = "Todos los items deben usar productos activos.";
        break;
      }

      if (!Number.isInteger(item.cantidad) || item.cantidad < 1) {
        errors.items = "Cada item debe tener cantidad mínima de 1.";
        break;
      }

      if (
        typeof producto.stockActual === "number" &&
        producto.stockActual >= 0 &&
        item.cantidad > producto.stockActual
      ) {
        errors.items = `El producto ${producto.nombre} solo tiene ${producto.stockActual} disponible(s).`;
        break;
      }
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

export function validateAdminDirectSaleForm(
  data: AdminDirectSaleRequest,
  products: ProductoProps[]
) {
  const errors: Record<string, string> = {};

  if (!Array.isArray(data.items) || data.items.length === 0) {
    errors.items = "Agrega al menos un producto para registrar la venta.";
  } else {
    for (const item of data.items) {
      const producto = products.find((product) => product.id === item.productoId);

      if (!producto || producto.activo === false) {
        errors.items = "Todos los items deben usar productos activos.";
        break;
      }

      if (!Number.isInteger(item.cantidad) || item.cantidad < 1) {
        errors.items = "Cada item debe tener cantidad mínima de 1.";
        break;
      }

      if (
        typeof producto.stockActual === "number" &&
        item.cantidad > producto.stockActual
      ) {
        errors.items = `El producto ${producto.nombre} solo tiene ${producto.stockActual} disponible(s).`;
        break;
      }
    }
  }

  if (data.estadoPago !== "PAGADO" && data.estadoPago !== "FIADO") {
    errors.estadoPago = "Selecciona si la venta quedó pagada o fiada.";
  }

  if (data.estadoPago === "FIADO" && !data.nombre?.trim()) {
    errors.nombre = "Para dejar fiado, registra al menos el nombre del cliente.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

export function validateCustomOrderForm(data: CustomOrderRequest) {
  const errors: Record<string, string> = {};

  if (!data.nombre.trim()) {
    errors.nombre = "Ingresa el nombre del cliente.";
  }

  if (!data.nombreProducto.trim()) {
    errors.nombreProducto = "El nombre del producto personalizado es obligatorio.";
  }

  if (!Number.isInteger(data.cantidad) || data.cantidad < 1) {
    errors.cantidad = "La cantidad debe ser al menos 1.";
  }

  if (!Number.isFinite(data.precioAcordado) || data.precioAcordado <= 0) {
    errors.precioAcordado = "Ingresa un precio acordado mayor a 0.";
  }

  if (
    data.costoEstimadoTotal !== undefined &&
    (!Number.isFinite(data.costoEstimadoTotal) || data.costoEstimadoTotal < 0)
  ) {
    errors.costoEstimadoTotal = "El costo estimado no puede ser negativo.";
  }

  if (!["AGENDADO", "PAGADO", "FIADO"].includes(data.estadoInicial)) {
    errors.estadoInicial = "Selecciona el estado inicial del pedido.";
  }

  if (data.estadoInicial === "FIADO" && !data.nombre.trim()) {
    errors.nombre = "Para registrar fiado, indica al menos el nombre del cliente.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}
