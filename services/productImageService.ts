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
import type { ProductImageRepository } from "@/repositories/productImageRepository";
import { getProductImageRepository } from "@/repositories/productImageRepository";
import type { ProductRepository } from "@/repositories/productRepository";
import { getProductRepository } from "@/repositories/productRepository";

export type ProductImageResult = {
  storagePath: string;
  displayUrl: string;
  width: number;
  height: number;
  format: "webp";
  size: number;
};

export class ProductImageServiceError extends Error {}

export class ProductImageService {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly productImageRepository: ProductImageRepository
  ) {}

  async reemplazarImagenProducto(productId: string, fileBuffer: Buffer): Promise<ProductImageResult> {
    const producto = await this.productRepository.buscarProductoPorId(productId);

    if (!producto) {
      throw new ProductImageServiceError("No se encontró el producto.");
    }

    let processed;

    try {
      processed = await processProductImage(fileBuffer);
    } catch (error) {
      if (error instanceof ProductImageProcessingError) {
        throw new ProductImageServiceError(error.message);
      }
      throw new ProductImageServiceError("No fue posible procesar la imagen.");
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
        "No fue posible guardar la imagen. La imagen anterior se mantuvo."
      );
    }

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
        "No fue posible guardar la imagen. La imagen anterior se mantuvo."
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
      size: processed.size
    };
  }

  async asignarImagenProductoSiAusente(productId: string, fileBuffer: Buffer): Promise<ProductImageResult> {
    const producto = await this.productRepository.buscarProductoPorId(productId);
    if (!producto) throw new ProductImageServiceError("No se encontró el producto.");
    if (producto.imageUrl?.trim() || producto.imageStoragePath?.trim()) {
      throw new ProductImageServiceError("El producto ya tiene una imagen y no será reemplazada automáticamente.");
    }

    let processed;
    try {
      processed = await processProductImage(fileBuffer);
    } catch (error) {
      if (error instanceof ProductImageProcessingError) throw new ProductImageServiceError(error.message);
      throw new ProductImageServiceError("No fue posible procesar la imagen.");
    }
    const path = buildProductImageStoragePath(productId, crypto.randomUUID());
    try {
      await this.productImageRepository.subir({ path, buffer: processed.buffer, contentType: "image/webp" });
    } catch {
      throw new ProductImageServiceError("No fue posible guardar la imagen. La imagen anterior se mantuvo.");
    }
    const displayUrl = this.productImageRepository.obtenerUrlPublica(path);
    try {
      const updated = this.productRepository.actualizarImagenProductoSiAusente
        ? await this.productRepository.actualizarImagenProductoSiAusente(productId, { imageUrl: displayUrl, imageStoragePath: path })
        : await this.productRepository.actualizarProducto(productId, { imageUrl: displayUrl, imageStoragePath: path });
      if (!updated) {
        throw new ProductImageServiceError("El producto ya tiene una imagen y no será reemplazada automáticamente.");
      }
    } catch (error) {
      await this.productImageRepository.eliminar(path).catch(() => {});
      if (error instanceof ProductImageServiceError) throw error;
      throw new ProductImageServiceError("No fue posible guardar la imagen. La imagen anterior se mantuvo.");
    }
    return { storagePath: path, displayUrl, width: processed.width, height: processed.height, format: processed.format, size: processed.size };
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
