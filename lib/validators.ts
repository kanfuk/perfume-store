/**
 * Proyecto: Pauli Store
 * Modulo: Validadores
 * Descripcion: Validaciones de formulario y reglas basicas compartidas del negocio.
 * Autor: Equipo Pauli Store
 * Buenas practicas: Codigo modular, validado y orientado a mantenibilidad.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

import type { ProductoProps } from "@/domain/Producto";

export type CustomerFormData = {
  nombre: string;
  telefono: string;
  lugarTrabajo: string;
  productoId: string;
  cantidad: number;
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

  if (!data.productoId) {
    errors.productoId = "Selecciona un producto.";
  } else {
    const producto = products.find((item) => item.id === data.productoId);

    if (!producto || producto.activo === false) {
      errors.productoId = "Selecciona un producto activo.";
    }
  }

  if (!Number.isInteger(data.cantidad) || data.cantidad < 1) {
    errors.cantidad = "La cantidad debe ser al menos 1.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}
