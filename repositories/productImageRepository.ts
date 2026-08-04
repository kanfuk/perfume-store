/**
 * Proyecto: Perfume Store
 * Modulo: Repositorio de imagenes de producto (Fase 3B.3)
 * Descripcion: Unica capa que habla con Supabase Storage (bucket
 * product-images, ver supabase/migrations/20260803000000_*.sql). No sabe
 * nada de productos ni de la tabla productos -- eso vive en
 * services/productImageService.ts.
 * Seguridad: no incluir claves ni datos sensibles en este archivo.
 */

import { PRODUCT_IMAGE_CONFIG } from "@/lib/product-image-config";
import { isSupabaseConfigured } from "@/lib/env";
import { localStore } from "@/lib/local-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ProductImageRepository {
  subir(args: { path: string; buffer: Buffer; contentType: string }): Promise<void>;
  /** Descarga el objeto recien subido para verificacion byte a byte (ver reemplazarImagenProducto). */
  descargar(path: string): Promise<Buffer>;
  eliminar(path: string): Promise<void>;
  obtenerUrlPublica(path: string): string;
}

class MemoryProductImageRepository implements ProductImageRepository {
  async subir({ path, buffer }: { path: string; buffer: Buffer; contentType: string }): Promise<void> {
    localStore.productImageStorage.set(path, Buffer.from(buffer));
  }

  async descargar(path: string): Promise<Buffer> {
    const stored = localStore.productImageStorage.get(path);
    if (!stored) {
      throw new Error("No fue posible leer la imagen recien subida.");
    }
    return Buffer.from(stored);
  }

  async eliminar(path: string): Promise<void> {
    localStore.productImageStorage.delete(path);
  }

  obtenerUrlPublica(path: string): string {
    return `/mock-storage/${PRODUCT_IMAGE_CONFIG.bucket}/${path}`;
  }
}

class SupabaseProductImageRepository implements ProductImageRepository {
  async subir({ path, buffer, contentType }: { path: string; buffer: Buffer; contentType: string }): Promise<void> {
    // Confirmado con evidencia real (subida de prueba + verificacion post-upload
    // en Vercel): entregar el Node Buffer TAL CUAL a supabase-js `.upload()`
    // altera tamano y contenido del objeto guardado dentro del runtime
    // desplegado. Uint8Array.from(buffer) copia los bytes reales (no la vista ni
    // el ArrayBuffer subyacente de Buffer, que puede tener byteOffset != 0 y
    // compartir el pool interno de Node) y se conserva identico. Es una copia
    // binaria defensiva especifica para esta subida -- nunca convertir a string.
    const uploadBytes = Uint8Array.from(buffer);

    const supabase = createSupabaseServerClient();
    const { error } = await supabase.storage
      .from(PRODUCT_IMAGE_CONFIG.bucket)
      .upload(path, uploadBytes, { contentType, cacheControl: "31536000", upsert: false });

    if (error) {
      throw new Error("No fue posible guardar la imagen.");
    }
  }

  async descargar(path: string): Promise<Buffer> {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.storage.from(PRODUCT_IMAGE_CONFIG.bucket).download(path);

    if (error || !data) {
      throw new Error("No fue posible leer la imagen recien subida.");
    }

    return Buffer.from(await data.arrayBuffer());
  }

  async eliminar(path: string): Promise<void> {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.storage.from(PRODUCT_IMAGE_CONFIG.bucket).remove([path]);

    if (error) {
      throw new Error("No fue posible eliminar la imagen anterior.");
    }
  }

  obtenerUrlPublica(path: string): string {
    const supabase = createSupabaseServerClient();
    return supabase.storage.from(PRODUCT_IMAGE_CONFIG.bucket).getPublicUrl(path).data.publicUrl;
  }
}

export function getProductImageRepository(): ProductImageRepository {
  if (isSupabaseConfigured()) {
    return new SupabaseProductImageRepository();
  }

  return new MemoryProductImageRepository();
}
