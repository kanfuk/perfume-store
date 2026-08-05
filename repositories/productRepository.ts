/**
 * Proyecto: Perfume Store
 * Modulo: Repositorio de Productos
 * Descripcion: Acceso a productos activos desde mock local o Supabase.
 * Buenas practicas: Codigo modular, validado y orientado a mantenibilidad.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

import type { ProductoProps } from "@/domain/Producto";
import { isSupabaseConfigured } from "@/lib/env";
import { localStore } from "@/lib/local-store";
import { getUnifiedProductStock } from "@/lib/stock";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ProductRepository {
  buscarProductosActivos(): Promise<ProductoProps[]>;
  buscarTodosProductos(): Promise<ProductoProps[]>;
  buscarProductoPorId(id: string): Promise<ProductoProps | null>;
  buscarProductoPorSku(sku: string): Promise<ProductoProps | null>;
  crearProducto(producto: Omit<ProductoProps, "id"> & { id?: string }): Promise<ProductoProps>;
  eliminarProducto(id: string): Promise<void>;
  actualizarProducto(
    id: string,
    cambios: Partial<Omit<ProductoProps, "id">>
  ): Promise<ProductoProps>;
  /** Escritura condicional: null si apareció una imagen manual concurrentemente. */
  actualizarImagenProductoSiAusente?(
    id: string,
    cambios: { imageUrl: string; imageStoragePath: string }
  ): Promise<ProductoProps | null>;
  /**
   * Fase 7.3A: compare-and-swap para reemplazo autorizado de imagen. Solo
   * actualiza si image_storage_path sigue siendo EXACTAMENTE
   * `expectedImageStoragePath` en el momento de la escritura (comparacion y
   * escritura atomicas en la misma sentencia UPDATE, nunca leer->comparar->
   * escribir por separado). null si el producto no existe o la imagen ya
   * cambio desde que el cliente la observo.
   */
  actualizarImagenProductoSiCoincide?(
    id: string,
    expectedImageStoragePath: string,
    cambios: { imageUrl: string; imageStoragePath: string }
  ): Promise<ProductoProps | null>;
  ajustarStockAgenda(id: string, cantidad: number): Promise<ProductoProps>;
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

  async buscarProductoPorSku(sku: string) {
    if (!sku) return null;
    return localStore.products.find((product) => product.sku === sku) ?? null;
  }

  async crearProducto(producto: Omit<ProductoProps, "id"> & { id?: string }) {
    const record: ProductoProps = {
      ...producto,
      id: producto.id ?? crypto.randomUUID()
    };
    localStore.products.push(record);
    return record;
  }

  async eliminarProducto(id: string) {
    const index = localStore.products.findIndex((product) => product.id === id);

    if (index === -1) {
      throw new Error("Producto no encontrado.");
    }

    localStore.products.splice(index, 1);
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

  async actualizarImagenProductoSiAusente(
    id: string,
    cambios: { imageUrl: string; imageStoragePath: string }
  ) {
    const current = localStore.products.find((product) => product.id === id);
    if (!current || current.imageUrl?.trim() || current.imageStoragePath?.trim()) return null;
    Object.assign(current, cambios);
    return current;
  }

  async actualizarImagenProductoSiCoincide(
    id: string,
    expectedImageStoragePath: string,
    cambios: { imageUrl: string; imageStoragePath: string }
  ) {
    const current = localStore.products.find((product) => product.id === id);
    if (!current || (current.imageStoragePath ?? "") !== expectedImageStoragePath) return null;
    Object.assign(current, cambios);
    return current;
  }

  async ajustarStockAgenda(id: string, cantidad: number) {
    const current = localStore.products.find((product) => product.id === id);

    if (!current) {
      throw new Error("Producto no encontrado.");
    }

    const nuevoStock = getUnifiedProductStock(current) + cantidad;

    if (nuevoStock < 0) {
      throw new Error("Stock insuficiente para esta operación.");
    }

    current.stockActual = nuevoStock;
    current.stockAgenda = nuevoStock;
    current.activo = nuevoStock > 0 ? current.activo : false;
    return current;
  }
}

type SupabaseProductRow = {
  id: string;
  sku: string | null;
  nombre: string;
  marca: string | null;
  contenido: string | null;
  descripcion: string | null;
  precio_venta: number;
  precio_anterior: number | null;
  image_url?: string | null;
  image_storage_path?: string | null;
  badge_label?: string | null;
  costo_unitario: number | null;
  stock_actual: number | null;
  stock_agenda: number | null;
  stock_reservado: number | null;
  stock_minimo: number | null;
  activo: boolean | null;
  es_top: boolean | null;
  es_oferta_semana: boolean | null;
  orden_destacado: number | null;
  tipo_producto: string | null;
  modo_precio?: string | null;
};

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

  async buscarProductoPorSku(sku: string) {
    if (!sku) return null;
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("productos")
      .select("*")
      .eq("sku", sku)
      .maybeSingle();

    if (error) {
      throw new Error(
        `No fue posible obtener el producto por SKU. ${error.message}${
          error.details ? ` Detalle: ${error.details}` : ""
        }${error.hint ? ` Hint: ${error.hint}` : ""}`
      );
    }

    return data ? mapSupabaseProduct(data) : null;
  }

  async crearProducto(producto: Omit<ProductoProps, "id"> & { id?: string }) {
    const supabase = createSupabaseServerClient();
    const payload = buildProductPayload(producto);
    const response = await supabase.from("productos").insert(payload).select("*").single();

    if (response.error || !response.data) {
      if (response.error?.code === "23505") {
        throw new Error("Ya existe un producto con ese SKU. Usa uno distinto.");
      }
      throw new Error(
        `No fue posible crear el producto. ${response.error?.message ?? ""}`.trim()
      );
    }

    return mapSupabaseProduct(response.data);
  }

  async eliminarProducto(id: string) {
    const supabase = createSupabaseServerClient();
    const response = await supabase.from("productos").delete().eq("id", id);

    if (response.error) {
      if (response.error.code === "23503") {
        throw new Error(
          "Este producto ya tiene pedidos asociados. Para conservar historial, dejalo pausado en vez de eliminarlo."
        );
      }

      throw new Error(
        `No fue posible eliminar el producto. ${response.error.message}`.trim()
      );
    }
  }

  async actualizarProducto(
    id: string,
    cambios: Partial<Omit<ProductoProps, "id">>
  ) {
    const supabase = createSupabaseServerClient();
    const payload: Record<string, unknown> = {};

    if (cambios.sku !== undefined) payload.sku = cambios.sku || null;
    if (cambios.nombre !== undefined) payload.nombre = cambios.nombre;
    if (cambios.marca !== undefined) payload.marca = cambios.marca;
    if (cambios.contenido !== undefined) payload.contenido = cambios.contenido;
    if (cambios.descripcion !== undefined) payload.descripcion = cambios.descripcion;
    if (cambios.precioVenta !== undefined) payload.precio_venta = cambios.precioVenta;
    if (cambios.precioAnterior !== undefined)
      payload.precio_anterior = cambios.precioAnterior ?? null;
    if (cambios.imageUrl !== undefined) payload.image_url = cambios.imageUrl;
    if (cambios.imageStoragePath !== undefined)
      payload.image_storage_path = cambios.imageStoragePath;
    if (cambios.badgeLabel !== undefined) payload.badge_label = cambios.badgeLabel;
    if (cambios.costoUnitario !== undefined)
      payload.costo_unitario = cambios.costoUnitario;
    if (cambios.stockActual !== undefined) payload.stock_actual = cambios.stockActual;
    if (cambios.stockAgenda !== undefined) payload.stock_agenda = cambios.stockAgenda;
    if (cambios.stockReservado !== undefined)
      payload.stock_reservado = cambios.stockReservado;
    if (cambios.stockMinimo !== undefined) payload.stock_minimo = cambios.stockMinimo;
    if (cambios.activo !== undefined) payload.activo = cambios.activo;
    if (cambios.esTop !== undefined) payload.es_top = cambios.esTop;
    if (cambios.esOfertaSemana !== undefined)
      payload.es_oferta_semana = cambios.esOfertaSemana;
    if (cambios.ordenDestacado !== undefined)
      payload.orden_destacado = cambios.ordenDestacado ?? null;
    if (cambios.tipoProducto !== undefined)
      payload.tipo_producto = cambios.tipoProducto;
    if (cambios.modoPrecio !== undefined) payload.modo_precio = cambios.modoPrecio;

    const response = await supabase
      .from("productos")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();

    if (response.error || !response.data) {
      throw new Error(
        `No fue posible actualizar el producto. ${response.error?.message ?? ""}`.trim()
      );
    }

    return mapSupabaseProduct(response.data);
  }

  async actualizarImagenProductoSiAusente(
    id: string,
    cambios: { imageUrl: string; imageStoragePath: string }
  ) {
    const response = await createSupabaseServerClient()
      .from("productos")
      .update({ image_url: cambios.imageUrl, image_storage_path: cambios.imageStoragePath })
      .eq("id", id)
      .or(
        "and(image_url.is.null,image_storage_path.is.null),and(image_url.is.null,image_storage_path.eq.),and(image_url.eq.,image_storage_path.is.null),and(image_url.eq.,image_storage_path.eq.)"
      )
      .select("*")
      .maybeSingle();
    if (response.error) {
      throw new Error(`No fue posible asignar la imagen de forma segura. ${response.error.message}`);
    }
    return response.data ? mapSupabaseProduct(response.data) : null;
  }

  async actualizarImagenProductoSiCoincide(
    id: string,
    expectedImageStoragePath: string,
    cambios: { imageUrl: string; imageStoragePath: string }
  ) {
    const response = await createSupabaseServerClient()
      .from("productos")
      .update({ image_url: cambios.imageUrl, image_storage_path: cambios.imageStoragePath })
      .eq("id", id)
      .eq("image_storage_path", expectedImageStoragePath)
      .select("*")
      .maybeSingle();
    if (response.error) {
      throw new Error(`No fue posible reemplazar la imagen de forma segura. ${response.error.message}`);
    }
    return response.data ? mapSupabaseProduct(response.data) : null;
  }

  async ajustarStockAgenda(id: string, cantidad: number) {
    const product = await this.buscarProductoPorId(id);

    if (!product) {
      throw new Error("Producto no encontrado.");
    }

    const nuevoStock = getUnifiedProductStock(product) + cantidad;

    if (nuevoStock < 0) {
      throw new Error("Stock insuficiente para esta operación.");
    }

    return this.actualizarProducto(id, {
      stockActual: nuevoStock,
      stockAgenda: nuevoStock,
      activo: nuevoStock > 0 ? product.activo : false
    });
  }
}

function buildProductPayload(producto: Omit<ProductoProps, "id"> & { id?: string }) {
  return {
    id: producto.id,
    sku: producto.sku || null,
    nombre: producto.nombre,
    marca: producto.marca || null,
    contenido: producto.contenido || null,
    descripcion: producto.descripcion ?? "",
    precio_venta: producto.precioVenta,
    precio_anterior: producto.precioAnterior ?? null,
    image_url: producto.imageUrl,
    image_storage_path: producto.imageStoragePath || null,
    badge_label: producto.badgeLabel,
    costo_unitario: producto.costoUnitario ?? 0,
    stock_actual: producto.stockActual ?? 0,
    stock_agenda: producto.stockAgenda ?? producto.stockActual ?? 0,
    stock_reservado: producto.stockReservado ?? 0,
    stock_minimo: producto.stockMinimo ?? 0,
    activo: producto.activo ?? true,
    es_top: producto.esTop ?? false,
    es_oferta_semana: producto.esOfertaSemana ?? false,
    orden_destacado: producto.ordenDestacado ?? null,
    tipo_producto: producto.tipoProducto ?? "simple",
    modo_precio: producto.modoPrecio ?? "AUTO"
  };
}

function mapSupabaseProduct(data: SupabaseProductRow): ProductoProps {
  return {
    id: data.id,
    sku: data.sku ?? "",
    nombre: data.nombre,
    marca: data.marca ?? "",
    contenido: data.contenido ?? "",
    descripcion: data.descripcion ?? "",
    precioVenta: data.precio_venta,
    precioAnterior: data.precio_anterior ?? undefined,
    imageUrl: data.image_url ?? "",
    imageStoragePath: data.image_storage_path ?? "",
    badgeLabel: data.badge_label ?? "",
    costoUnitario: data.costo_unitario ?? 0,
    stockActual: data.stock_actual ?? data.stock_agenda ?? 0,
    stockAgenda: data.stock_actual ?? data.stock_agenda ?? 0,
    stockReservado: data.stock_reservado ?? 0,
    stockMinimo: data.stock_minimo ?? 0,
    activo: data.activo ?? true,
    esTop: data.es_top ?? false,
    esOfertaSemana: data.es_oferta_semana ?? false,
    ordenDestacado: data.orden_destacado ?? undefined,
    tipoProducto: data.tipo_producto ?? "simple",
    modoPrecio: data.modo_precio === "MANUAL" ? "MANUAL" : "AUTO"
  };
}

export function getProductRepository(): ProductRepository {
  if (isSupabaseConfigured()) {
    return new SupabaseProductRepository();
  }

  return new MockProductRepository();
}
