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
import {
  canSellWithoutBreakingStock,
  getAvailableProductStock
} from "@/lib/stock";
import type {
  AdminDirectSaleRequest,
  CustomOrderRequest,
  CustomerOrderLineInput
} from "@/lib/types";

export type CustomerFormData = {
  nombre: string;
  telefono: string;
  lugarTrabajo: string;
  fechaEntrega: string;
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

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.fechaEntrega)) {
    errors.fechaEntrega = "Selecciona una fecha de entrega válida.";
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

      const stockDisponible = getAvailableProductStock(producto);

      if (item.cantidad > stockDisponible) {
        errors.items = `El producto ${producto.nombre} solo tiene ${stockDisponible} disponible(s).`;
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

      if (!producto) {
        errors.items = "Todos los items deben usar productos existentes.";
        break;
      }

      if (!Number.isInteger(item.cantidad) || item.cantidad < 1) {
        errors.items = "Cada item debe tener cantidad mínima de 1.";
        break;
      }

      const stockDisponible = getAvailableProductStock(producto);

      if (!canSellWithoutBreakingStock(producto, item.cantidad)) {
        errors.items = `El producto ${producto.nombre} solo tiene ${stockDisponible} disponible(s).`;
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

export function validateCustomOrderForm(
  data: CustomOrderRequest,
  products: ProductoProps[] = []
) {
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

  if (!["PENDIENTE", "AGENDADO", "PAGADO", "FIADO"].includes(data.estadoInicial)) {
    errors.estadoInicial = "Selecciona el estado inicial del pedido.";
  }

  if (data.estadoInicial === "FIADO" && !data.nombre.trim()) {
    errors.nombre = "Para registrar fiado, indica al menos el nombre del cliente.";
  }

  if (data.productoBaseId) {
    const producto = products.find((product) => product.id === data.productoBaseId);

    if (!producto) {
      errors.productoBaseId = "Selecciona un producto base válido.";
    } else if (!canSellWithoutBreakingStock(producto, data.cantidad)) {
      errors.productoBaseId = `El producto ${producto.nombre} solo tiene ${getAvailableProductStock(producto)} disponible(s).`;
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}
