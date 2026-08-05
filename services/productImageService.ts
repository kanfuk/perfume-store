/**
 * Proyecto: Perfume Store
 * Modulo: Servicio de imagenes de producto (Fase 3B.3)
 * Descripcion: Coordina procesamiento (lib/product-image-processing.ts),
 * Storage (repositories/productImageRepository.ts) y la fila del producto
 * (repositories/productRepository.ts) con reemplazo seguro: nunca borra la
 * imagen anterior antes de que la nueva quede subida Y la base de datos
 * actualizada. Nunca toca nombre, precio, costo, stock, familia ni Top 12.
 * Seguridad: no incluir claves ni datos sensibles en este archivo.
 */

import {
  buildProductImageStoragePath,
  isManagedProductImageStoragePath
} from "@/lib/product-image-config";
import { ProductImageProcessingError, processProductImage } from "@/lib/product-image-processing";
import { hasValidWebpHeader } from "@/lib/product-image-integrity";
import type { ProductImageRepository } from "@/repositories/productImageRepository";
import { getProductImageRepository } from "@/repositories/productImageRepository";
import type { ProductRepository } from "@/repositories/productRepository";
import { getProductRepository } from "@/repositories/productRepository";
import type { ProductoProps } from "@/domain/Producto";

export type ProductImageResult = {
  storagePath: string;
  displayUrl: string;
  width: number;
  height: number;
  format: "webp";
  size: number;
  /** Producto releido de forma independiente DESPUES de actualizar, no el resultado del propio UPDATE. */
  producto: ProductoProps;
  /** Siempre true al devolver: si la verificacion post-escritura falla, se lanza un error en su lugar. */
  persisted: true;
  /** Identificador de esta subida, para correlacionar con logs server-side (nunca expone hashes ni bytes). */
  correlationId: string;
};

export class ProductImageServiceError extends Error {
  readonly code?: string;
  readonly correlationId?: string;

  constructor(message: string, options?: { code?: string; correlationId?: string }) {
    super(message);
    this.name = "ProductImageServiceError";
    this.code = options?.code;
    this.correlationId = options?.correlationId;
  }
}

export class ProductImageService {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly productImageRepository: ProductImageRepository
  ) {}

  /**
   * Verificacion binaria post-subida: descarga inmediatamente el objeto que
   * se acaba de subir y confirma que sus bytes son EXACTAMENTE los mismos
   * que produjo Sharp (mismo tamano, mismo contenido byte a byte) y que la
   * cabecera RIFF/WEBP sigue siendo valida. Si algo no coincide, el objeto
   * recien subido se borra y se lanza un error -- la DB nunca llega a
   * actualizarse con una ruta que apunta a un archivo corrupto o distinto
   * del que se proceso.
   */
  private async verificarIntegridadSubida(
    path: string,
    expected: Buffer,
    correlationId: string
  ): Promise<void> {
    let downloaded: Buffer;

    try {
      downloaded = await this.productImageRepository.descargar(path);
    } catch {
      await this.productImageRepository.eliminar(path).catch(() => {});
      throw new ProductImageServiceError(
        "La imagen se subió pero no se pudo leer de vuelta para verificarla. Intenta nuevamente.",
        { code: "STORAGE_DOWNLOAD_FAILED", correlationId }
      );
    }

    if (!hasValidWebpHeader(downloaded)) {
      await this.productImageRepository.eliminar(path).catch(() => {});
      throw new ProductImageServiceError(
        "La imagen se subió pero quedó corrupta en el almacenamiento. Intenta nuevamente.",
        { code: "INVALID_STORAGE_WEBP", correlationId }
      );
    }

    const bytesCoinciden = downloaded.length === expected.length && downloaded.equals(expected);

    if (!bytesCoinciden) {
      await this.productImageRepository.eliminar(path).catch(() => {});
      throw new ProductImageServiceError(
        "La imagen se subió pero quedó corrupta en el almacenamiento. Intenta nuevamente.",
        { code: "STORAGE_ROUNDTRIP_MISMATCH", correlationId }
      );
    }
  }

  /**
   * Fase 7.3A: procesa (Sharp) y sube un archivo nuevo, verificando su
   * integridad post-upload -- pasos compartidos por asignarImagenProductoSiAusente
   * y reemplazarImagenProductoSiCoincide (ambos rutas "sin imagen previa
   * confirmada"/"reemplazo condicionado"). reemplazarImagenProducto (la
   * ruta historica, ya no invocada por defecto desde la API) conserva su
   * propia copia inline sin tocar, para no arriesgar su cobertura existente.
   */
  private async procesarYSubirImagenNueva(
    fileBuffer: Buffer,
    productId: string,
    correlationId: string
  ): Promise<{ path: string; displayUrl: string; processed: Awaited<ReturnType<typeof processProductImage>> }> {
    let processed;
    try {
      processed = await processProductImage(fileBuffer);
    } catch (error) {
      if (error instanceof ProductImageProcessingError) {
        throw new ProductImageServiceError(error.message, { code: error.code, correlationId });
      }
      throw new ProductImageServiceError("No fue posible procesar la imagen.", { correlationId });
    }

    if (!hasValidWebpHeader(processed.buffer)) {
      throw new ProductImageServiceError(
        "No fue posible procesar la imagen: la salida no tiene un formato WebP válido.",
        { code: "INVALID_SHARP_WEBP", correlationId }
      );
    }

    const path = buildProductImageStoragePath(productId, crypto.randomUUID());

    try {
      await this.productImageRepository.subir({
        path,
        buffer: processed.buffer,
        contentType: "image/webp"
      });
    } catch {
      throw new ProductImageServiceError(
        "No fue posible guardar la imagen. La imagen anterior se mantuvo.",
        { code: "STORAGE_UPLOAD_FAILED", correlationId }
      );
    }

    await this.verificarIntegridadSubida(path, processed.buffer, correlationId);

    const displayUrl = this.productImageRepository.obtenerUrlPublica(path);

    return { path, displayUrl, processed };
  }

  async reemplazarImagenProducto(
    productId: string,
    fileBuffer: Buffer,
    correlationId: string = crypto.randomUUID()
  ): Promise<ProductImageResult> {
    const producto = await this.productRepository.buscarProductoPorId(productId);

    if (!producto) {
      throw new ProductImageServiceError("No se encontró el producto.", { correlationId });
    }

    let processed;

    try {
      processed = await processProductImage(fileBuffer);
    } catch (error) {
      if (error instanceof ProductImageProcessingError) {
        throw new ProductImageServiceError(error.message, { code: error.code, correlationId });
      }
      throw new ProductImageServiceError("No fue posible procesar la imagen.", { correlationId });
    }

    if (!hasValidWebpHeader(processed.buffer)) {
      throw new ProductImageServiceError(
        "No fue posible procesar la imagen: la salida no tiene un formato WebP válido.",
        { code: "INVALID_SHARP_WEBP", correlationId }
      );
    }

    const path = buildProductImageStoragePath(productId, crypto.randomUUID());

    try {
      await this.productImageRepository.subir({
        path,
        buffer: processed.buffer,
        contentType: "image/webp"
      });
    } catch {
      throw new ProductImageServiceError(
        "No fue posible guardar la imagen. La imagen anterior se mantuvo.",
        { code: "STORAGE_UPLOAD_FAILED", correlationId }
      );
    }

    await this.verificarIntegridadSubida(path, processed.buffer, correlationId);

    const displayUrl = this.productImageRepository.obtenerUrlPublica(path);
    const previousPath = producto.imageStoragePath;

    try {
      await this.productRepository.actualizarProducto(productId, {
        imageUrl: displayUrl,
        imageStoragePath: path
      });
    } catch {
      // La subida ya ocurrio pero la DB no se pudo actualizar: limpiar el
      // archivo nuevo huerfano y conservar la imagen anterior intacta.
      await this.productImageRepository.eliminar(path).catch(() => {});
      throw new ProductImageServiceError(
        "No fue posible guardar la imagen. La imagen anterior se mantuvo.",
        { code: "DB_UPDATE_FAILED", correlationId }
      );
    }

    // Verificacion post-escritura: antes de reportar exito, releer el
    // producto de forma INDEPENDIENTE (no el resultado del propio UPDATE) y
    // confirmar que la ruta persistida es exactamente la que se acaba de
    // subir. Nunca se informa "imagen guardada" solo porque Sharp/Storage/DB
    // no lanzaron una excepcion -- se prueba que el mismo camino de lectura
    // que usa el resto de la app (buscarProductoPorId) ya ve el cambio.
    let verificado: ProductoProps | null;
    try {
      verificado = await this.productRepository.buscarProductoPorId(productId);
    } catch {
      verificado = null;
    }

    if (!verificado || verificado.imageStoragePath !== path || verificado.imageUrl !== displayUrl) {
      await this.productImageRepository.eliminar(path).catch(() => {});
      throw new ProductImageServiceError(
        "La imagen se subió pero no se pudo confirmar que quedó guardada. Intenta nuevamente.",
        { code: "DB_VERIFICATION_MISMATCH", correlationId }
      );
    }

    if (isManagedProductImageStoragePath(previousPath) && previousPath !== path) {
      // La imagen nueva ya quedo correctamente asociada al producto: un
      // fallo al borrar la anterior no debe revertirla ni mostrarse como
      // error al usuario, solo queda un huerfano para limpieza posterior.
      await this.productImageRepository.eliminar(previousPath).catch(() => {});
    }

    return {
      storagePath: path,
      displayUrl,
      width: processed.width,
      height: processed.height,
      format: processed.format,
      size: processed.size,
      producto: verificado,
      persisted: true,
      correlationId
    };
  }

  /**
   * Fase 7.3A: comportamiento POR DEFECTO de la API (sin replaceExisting).
   * Nunca sobrescribe una imagen existente -- ni por una lectura previa
   * obsoleta ni por una carrera con otra subida concurrente. La condicion
   * real la impone `actualizarImagenProductoSiAusente` del repositorio
   * (compare-and-swap: solo escribe si image_url/image_storage_path siguen
   * vacios en la MISMA sentencia UPDATE), nunca un chequeo leer->comparar->
   * escribir hecho aqui.
   */
  async asignarImagenProductoSiAusente(
    productId: string,
    fileBuffer: Buffer,
    correlationId: string = crypto.randomUUID()
  ): Promise<ProductImageResult> {
    const producto = await this.productRepository.buscarProductoPorId(productId);
    if (!producto) throw new ProductImageServiceError("No se encontró el producto.", { correlationId });
    if (producto.imageUrl?.trim() || producto.imageStoragePath?.trim()) {
      throw new ProductImageServiceError(
        "El producto ya tiene una imagen y no será reemplazada automáticamente.",
        { code: "IMAGE_ALREADY_EXISTS", correlationId }
      );
    }

    const { path, displayUrl, processed } = await this.procesarYSubirImagenNueva(fileBuffer, productId, correlationId);

    if (!this.productRepository.actualizarImagenProductoSiAusente) {
      await this.productImageRepository.eliminar(path).catch(() => {});
      throw new ProductImageServiceError(
        "No fue posible guardar la imagen. La imagen anterior se mantuvo.",
        { code: "ATOMIC_UPDATE_UNSUPPORTED", correlationId }
      );
    }

    let updated: ProductoProps | null;
    try {
      updated = await this.productRepository.actualizarImagenProductoSiAusente(productId, {
        imageUrl: displayUrl,
        imageStoragePath: path
      });
      if (!updated) {
        throw new ProductImageServiceError(
          "El producto ya tiene una imagen y no será reemplazada automáticamente.",
          { code: "IMAGE_ALREADY_EXISTS", correlationId }
        );
      }
    } catch (error) {
      await this.productImageRepository.eliminar(path).catch(() => {});
      if (error instanceof ProductImageServiceError) throw error;
      throw new ProductImageServiceError(
        "No fue posible guardar la imagen. La imagen anterior se mantuvo.",
        { code: "DB_UPDATE_FAILED", correlationId }
      );
    }

    // Verificacion post-escritura (seccion 7 del encargo): releer de forma
    // INDEPENDIENTE antes de reportar exito, igual que reemplazarImagenProducto.
    let verificado: ProductoProps | null;
    try {
      verificado = await this.productRepository.buscarProductoPorId(productId);
    } catch {
      verificado = null;
    }

    if (!verificado || verificado.imageStoragePath !== path || verificado.imageUrl !== displayUrl) {
      await this.productImageRepository.eliminar(path).catch(() => {});
      throw new ProductImageServiceError(
        "La imagen se subió pero no se pudo confirmar que quedó guardada. Intenta nuevamente.",
        { code: "DB_VERIFICATION_MISMATCH", correlationId }
      );
    }

    return {
      storagePath: path,
      displayUrl,
      width: processed.width,
      height: processed.height,
      format: processed.format,
      size: processed.size,
      producto: verificado,
      correlationId,
      persisted: true
    };
  }

  /**
   * Fase 7.3A: reemplazo explicito autorizado. Requiere
   * `expectedImageStoragePath` (la imagen observada por el cliente durante
   * el Preview) y solo reemplaza si esa ruta SIGUE siendo la actual en el
   * momento exacto de la escritura (compare-and-swap real en el
   * repositorio). Si la imagen cambio desde el Preview, no escribe nada,
   * borra el archivo nuevo y responde conflicto -- la imagen anterior
   * jamas se borra hasta confirmar que la nueva quedo persistida y
   * verificada.
   */
  async reemplazarImagenProductoSiCoincide(
    productId: string,
    expectedImageStoragePath: string,
    fileBuffer: Buffer,
    correlationId: string = crypto.randomUUID()
  ): Promise<ProductImageResult> {
    if (!expectedImageStoragePath?.trim()) {
      throw new ProductImageServiceError(
        "Falta la imagen actual esperada para autorizar el reemplazo.",
        { code: "EXPECTED_IMAGE_PATH_REQUIRED", correlationId }
      );
    }

    const producto = await this.productRepository.buscarProductoPorId(productId);
    if (!producto) throw new ProductImageServiceError("No se encontró el producto.", { correlationId });

    const { path, displayUrl, processed } = await this.procesarYSubirImagenNueva(fileBuffer, productId, correlationId);

    if (!this.productRepository.actualizarImagenProductoSiCoincide) {
      await this.productImageRepository.eliminar(path).catch(() => {});
      throw new ProductImageServiceError(
        "No fue posible guardar la imagen. La imagen anterior se mantuvo.",
        { code: "ATOMIC_UPDATE_UNSUPPORTED", correlationId }
      );
    }

    let updated: ProductoProps | null;
    try {
      updated = await this.productRepository.actualizarImagenProductoSiCoincide(productId, expectedImageStoragePath, {
        imageUrl: displayUrl,
        imageStoragePath: path
      });
    } catch {
      await this.productImageRepository.eliminar(path).catch(() => {});
      throw new ProductImageServiceError(
        "No fue posible guardar la imagen. La imagen anterior se mantuvo.",
        { code: "DB_UPDATE_FAILED", correlationId }
      );
    }

    if (!updated) {
      await this.productImageRepository.eliminar(path).catch(() => {});
      throw new ProductImageServiceError(
        "La imagen del producto cambió desde que abriste el Preview. Actualiza la página antes de reemplazarla.",
        { code: "IMAGE_CHANGED_SINCE_PREVIEW", correlationId }
      );
    }

    let verificado: ProductoProps | null;
    try {
      verificado = await this.productRepository.buscarProductoPorId(productId);
    } catch {
      verificado = null;
    }

    if (!verificado || verificado.imageStoragePath !== path || verificado.imageUrl !== displayUrl) {
      await this.productImageRepository.eliminar(path).catch(() => {});
      throw new ProductImageServiceError(
        "La imagen se subió pero no se pudo confirmar que quedó guardada. Intenta nuevamente.",
        { code: "DB_VERIFICATION_MISMATCH", correlationId }
      );
    }

    // Solo ahora, con la imagen nueva confirmada y verificada, se borra la
    // anterior -- nunca antes (seccion 7/8 del encargo).
    if (isManagedProductImageStoragePath(expectedImageStoragePath) && expectedImageStoragePath !== path) {
      await this.productImageRepository.eliminar(expectedImageStoragePath).catch(() => {});
    }

    return {
      storagePath: path,
      displayUrl,
      width: processed.width,
      height: processed.height,
      format: processed.format,
      size: processed.size,
      producto: verificado,
      persisted: true,
      correlationId
    };
  }

  async eliminarImagenProducto(productId: string): Promise<void> {
    const producto = await this.productRepository.buscarProductoPorId(productId);

    if (!producto) {
      throw new ProductImageServiceError("No se encontró el producto.");
    }

    const currentPath = producto.imageStoragePath;

    await this.productRepository.actualizarProducto(productId, {
      imageUrl: "",
      imageStoragePath: ""
    });

    if (isManagedProductImageStoragePath(currentPath)) {
      await this.productImageRepository.eliminar(currentPath).catch(() => {});
    }
  }
}

export function createProductImageService(): ProductImageService {
  return new ProductImageService(getProductRepository(), getProductImageRepository());
}
