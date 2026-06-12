/**
 * Proyecto: Pauli Store
 * Modulo: Validadores
 * Descripcion: Validaciones de formulario y reglas basicas compartidas del negocio.
 * Autor: Equipo Pauli Store
 * Buenas practicas: Codigo modular, validado y orientado a mantenibilidad.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

import type { ProductoProps } from "@/domain/Producto";
import type { CustomerOrderLineInput } from "@/lib/types";

export type CustomerFormData = {
  nombre: string;
  telefono: string;
  lugarTrabajo: string;
  items: CustomerOrderLineInput[];
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
    errors.telefono = "Ingresa tu numero de telefono.";
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
        errors.items = "Cada item debe tener cantidad minima de 1.";
        break;
      }
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}
