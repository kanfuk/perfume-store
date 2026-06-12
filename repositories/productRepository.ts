/**
 * Proyecto: Pauli Store
 * Modulo: Repositorio de Productos
 * Descripcion: Acceso a productos activos desde mock local o Supabase.
 * Autor: Equipo Pauli Store
 * Buenas practicas: Codigo modular, validado y orientado a mantenibilidad.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

import type { ProductoProps } from "@/domain/Producto";
import { isSupabaseConfigured } from "@/lib/env";
import { localStore } from "@/lib/local-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ProductRepository {
  buscarProductosActivos(): Promise<ProductoProps[]>;
  buscarProductoPorId(id: string): Promise<ProductoProps | null>;
}

class MockProductRepository implements ProductRepository {
  async buscarProductosActivos() {
    return localStore.products.filter((product) => product.activo !== false);
  }

  async buscarProductoPorId(id: string) {
    return localStore.products.find((product) => product.id === id) ?? null;
  }
}

class SupabaseProductRepository implements ProductRepository {
  async buscarProductosActivos() {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("productos")
      .select(
        "id, nombre, descripcion, precio_venta, costo_unitario, stock_actual, activo, tipo_producto"
      )
      .eq("activo", true)
      .order("nombre", { ascending: true });

    if (error) {
      throw new Error(
        `No fue posible obtener productos activos. ${error.message}${
          error.details ? ` Detalle: ${error.details}` : ""
        }${error.hint ? ` Hint: ${error.hint}` : ""}`
      );
    }

    return data.map(mapSupabaseProduct);
  }

  async buscarProductoPorId(id: string) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("productos")
      .select(
        "id, nombre, descripcion, precio_venta, costo_unitario, stock_actual, activo, tipo_producto"
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error(
        `No fue posible obtener el producto solicitado. ${error.message}${
          error.details ? ` Detalle: ${error.details}` : ""
        }${error.hint ? ` Hint: ${error.hint}` : ""}`
      );
    }

    return data ? mapSupabaseProduct(data) : null;
  }
}

function mapSupabaseProduct(data: {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio_venta: number;
  costo_unitario: number | null;
  stock_actual: number | null;
  activo: boolean | null;
  tipo_producto: string | null;
}): ProductoProps {
  return {
    id: data.id,
    nombre: data.nombre,
    descripcion: data.descripcion ?? "",
    precioVenta: data.precio_venta,
    costoUnitario: data.costo_unitario ?? 0,
    stockActual: data.stock_actual ?? 0,
    activo: data.activo ?? true,
    tipoProducto: data.tipo_producto ?? "simple"
  };
}

export function getProductRepository(): ProductRepository {
  if (isSupabaseConfigured()) {
    return new SupabaseProductRepository();
  }

  return new MockProductRepository();
}
