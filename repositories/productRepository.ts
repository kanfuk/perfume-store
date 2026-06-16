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
  buscarTodosProductos(): Promise<ProductoProps[]>;
  buscarProductoPorId(id: string): Promise<ProductoProps | null>;
  crearProducto(producto: Omit<ProductoProps, "id"> & { id?: string }): Promise<ProductoProps>;
  actualizarProducto(
    id: string,
    cambios: Partial<Omit<ProductoProps, "id">>
  ): Promise<ProductoProps>;
}

class MockProductRepository implements ProductRepository {
  async buscarProductosActivos() {
    return localStore.products.filter((product) => product.activo !== false);
  }

  async buscarTodosProductos() {
    return [...localStore.products].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  async buscarProductoPorId(id: string) {
    return localStore.products.find((product) => product.id === id) ?? null;
  }

  async crearProducto(producto: Omit<ProductoProps, "id"> & { id?: string }) {
    const record: ProductoProps = {
      ...producto,
      id: producto.id ?? crypto.randomUUID()
    };
    localStore.products.push(record);
    return record;
  }

  async actualizarProducto(
    id: string,
    cambios: Partial<Omit<ProductoProps, "id">>
  ) {
    const current = localStore.products.find((product) => product.id === id);

    if (!current) {
      throw new Error("Producto no encontrado.");
    }

    Object.assign(current, cambios);
    return current;
  }
}

class SupabaseProductRepository implements ProductRepository {
  async buscarProductosActivos() {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("productos")
      .select("*")
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

  async buscarTodosProductos() {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("productos")
      .select("*")
      .order("nombre", { ascending: true });

    if (error) {
      throw new Error(`No fue posible obtener el catalogo. ${error.message}`);
    }

    return data.map(mapSupabaseProduct);
  }

  async buscarProductoPorId(id: string) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("productos")
      .select("*")
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

  async crearProducto(producto: Omit<ProductoProps, "id"> & { id?: string }) {
    const supabase = createSupabaseServerClient();
    const payload = {
      id: producto.id,
      nombre: producto.nombre,
      descripcion: producto.descripcion ?? "",
      precio_venta: producto.precioVenta,
      image_url: producto.imageUrl,
      badge_label: producto.badgeLabel,
      costo_unitario: producto.costoUnitario ?? 0,
      stock_actual: producto.stockActual ?? 0,
      stock_agenda: producto.stockAgenda ?? producto.stockActual ?? 0,
      activo: producto.activo ?? true,
      tipo_producto: producto.tipoProducto ?? "simple"
    };
    let response = await supabase.from("productos").insert(payload).select("*").single();

    if (hasMissingProductsColumnError(response.error)) {
      const fallbackPayload = omitExtendedProductColumns(payload);
      response = await supabase.from("productos").insert(fallbackPayload).select("*").single();
    }

    if (response.error || !response.data) {
      throw new Error(
        `No fue posible crear el producto. ${response.error?.message ?? ""}`.trim()
      );
    }

    return mapSupabaseProduct(response.data);
  }

  async actualizarProducto(
    id: string,
    cambios: Partial<Omit<ProductoProps, "id">>
  ) {
    const supabase = createSupabaseServerClient();
    const payload: Record<string, unknown> = {};

    if (cambios.nombre !== undefined) payload.nombre = cambios.nombre;
    if (cambios.descripcion !== undefined) payload.descripcion = cambios.descripcion;
    if (cambios.precioVenta !== undefined) payload.precio_venta = cambios.precioVenta;
    if (cambios.imageUrl !== undefined) payload.image_url = cambios.imageUrl;
    if (cambios.badgeLabel !== undefined) payload.badge_label = cambios.badgeLabel;
    if (cambios.costoUnitario !== undefined)
      payload.costo_unitario = cambios.costoUnitario;
    if (cambios.stockActual !== undefined) payload.stock_actual = cambios.stockActual;
    if (cambios.stockAgenda !== undefined) payload.stock_agenda = cambios.stockAgenda;
    if (cambios.activo !== undefined) payload.activo = cambios.activo;
    if (cambios.tipoProducto !== undefined)
      payload.tipo_producto = cambios.tipoProducto;

    let response = await supabase
      .from("productos")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();

    if (hasMissingProductsColumnError(response.error)) {
      response = await supabase
        .from("productos")
        .update(omitExtendedProductColumns(payload))
        .eq("id", id)
        .select("*")
        .single();
    }

    if (response.error || !response.data) {
      throw new Error(
        `No fue posible actualizar el producto. ${response.error?.message ?? ""}`.trim()
      );
    }

    return mapSupabaseProduct(response.data);
  }
}

function mapSupabaseProduct(data: {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio_venta: number;
  image_url?: string | null;
  badge_label?: string | null;
  costo_unitario: number | null;
  stock_actual: number | null;
  stock_agenda: number | null;
  activo: boolean | null;
  tipo_producto: string | null;
}): ProductoProps {
  return {
    id: data.id,
    nombre: data.nombre,
    descripcion: data.descripcion ?? "",
    precioVenta: data.precio_venta,
    imageUrl: data.image_url ?? "",
    badgeLabel: data.badge_label ?? "",
    costoUnitario: data.costo_unitario ?? 0,
    stockActual: data.stock_actual ?? 0,
    stockAgenda: data.stock_agenda ?? data.stock_actual ?? 0,
    activo: data.activo ?? true,
    tipoProducto: data.tipo_producto ?? "simple"
  };
}

function hasMissingProductsColumnError(error: { message?: string; code?: string } | null) {
  if (!error) {
    return false;
  }

  return (
    error.code === "PGRST204" ||
    error.message?.includes("badge_label") === true ||
    error.message?.includes("image_url") === true
  );
}

function omitExtendedProductColumns(payload: Record<string, unknown>) {
  const fallbackPayload = { ...payload };
  delete fallbackPayload.image_url;
  delete fallbackPayload.badge_label;
  return fallbackPayload;
}

export function getProductRepository(): ProductRepository {
  if (isSupabaseConfigured()) {
    return new SupabaseProductRepository();
  }

  return new MockProductRepository();
}
