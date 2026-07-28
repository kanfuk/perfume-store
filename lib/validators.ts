/**
 * Proyecto: Perfume Store
 * Módulo: Validadores
 * Descripción: Validaciones de formulario y reglas básicas compartidas del negocio.
 * Buenas prácticas: Código modular, validado y orientado a mantenibilidad.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

import type { ProductoProps } from "@/domain/Producto";
import { isValidChileanMobilePhone } from "@/lib/chile-phone";
import { isMetodoDespacho, type MetodoDespacho } from "@/lib/constants";
import { isValidChileanRut } from "@/lib/rut";
import {
  canSellWithoutBreakingStock,
  getAvailableProductStock
} from "@/lib/stock";
import type {
  AdminDirectSaleRequest,
  CustomOrderRequest,
  CustomerOrderLineInput
} from "@/lib/types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOMBRE_MIN_LENGTH = 3;
const NOMBRE_MAX_LENGTH = 120;
const DIRECCION_MAX_LENGTH = 200;

export function isValidEmail(value: string) {
  return EMAIL_PATTERN.test(value.trim());
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export const ADMIN_PASSWORD_MIN_LENGTH = 8;

export function validateAdminNewPassword(password: string, confirmPassword: string) {
  if (password.length < ADMIN_PASSWORD_MIN_LENGTH) {
    return `La contraseña debe tener al menos ${ADMIN_PASSWORD_MIN_LENGTH} caracteres.`;
  }

  if (password !== confirmPassword) {
    return "Las contraseñas no coinciden.";
  }

  return null;
}

export type CustomerFormData = {
  nombre: string;
  rut: string;
  email: string;
  telefono: string;
  region: string;
  comuna: string;
  direccion: string;
  referenciaDireccion?: string;
  metodoDespacho: MetodoDespacho;
  observacion?: string;
  items: CustomerOrderLineInput[];
  contactoOculto?: string;
};

type CustomerFormErrors = Partial<Record<keyof CustomerFormData, string>>;

export function validateCustomerOrderForm(
  data: CustomerFormData,
  products: ProductoProps[]
) {
  const errors: CustomerFormErrors = {};
  const nombre = data.nombre.trim();

  if (!nombre) {
    errors.nombre = "Ingresa tu nombre completo.";
  } else if (nombre.length < NOMBRE_MIN_LENGTH) {
    errors.nombre = "Ingresa tu nombre completo.";
  } else if (nombre.length > NOMBRE_MAX_LENGTH) {
    errors.nombre = "El nombre es demasiado largo.";
  }

  if (!data.rut.trim()) {
    errors.rut = "Ingresa tu RUT.";
  } else if (!isValidChileanRut(data.rut)) {
    errors.rut = "Ingresa un RUT chileno válido. Ejemplo: 12.345.678-5.";
  }

  if (!data.email.trim()) {
    errors.email = "Ingresa tu correo electrónico.";
  } else if (!isValidEmail(data.email)) {
    errors.email = "Ingresa un correo electrónico válido.";
  }

  if (!data.telefono.trim()) {
    errors.telefono = "Ingresa tu número de teléfono.";
  } else if (!isValidChileanMobilePhone(data.telefono)) {
    errors.telefono = "Ingresa un celular chileno válido. Ejemplo: +56 9 1234 5678.";
  }

  if (!data.region.trim()) {
    errors.region = "Selecciona tu región.";
  }

  if (!data.comuna.trim()) {
    errors.comuna = "Selecciona tu comuna.";
  }

  if (!data.direccion.trim()) {
    errors.direccion = "Ingresa tu dirección de despacho.";
  } else if (data.direccion.trim().length > DIRECCION_MAX_LENGTH) {
    errors.direccion = "La dirección es demasiado larga.";
  }

  if (!data.metodoDespacho || !isMetodoDespacho(data.metodoDespacho)) {
    errors.metodoDespacho = "Selecciona un método de despacho.";
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

  if (!["NUEVO", "AGENDADO", "PAGADO"].includes(data.estadoInicial)) {
    errors.estadoInicial = "Selecciona el estado inicial del pedido.";
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
