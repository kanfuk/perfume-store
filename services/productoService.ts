/**
 * Proyecto: Perfume Store
 * Modulo: Gestion de Productos
 * Descripcion: Servicio encargado de exponer productos activos para el formulario cliente.
 * Buenas practicas: Separacion de responsabilidades y validacion de estados.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

import { Producto } from "@/domain/Producto";
import { getProductVisualMeta } from "@/lib/product-catalog";
import { getUnifiedProductStock, normalizeStockValue } from "@/lib/stock";
import type { AdminProductRecord } from "@/lib/types";
import type { ProductRepository } from "@/repositories/productRepository";
import { getProductRepository } from "@/repositories/productRepository";
import {
  buildAdminImportPreview,
  validateFileSize,
  validateFileNameExtension,
  validateBinaryContent,
  type AdminImportPreview,
  type AdminImportRow
} from "@/lib/catalog-import/admin-import.ts";

export type ProductoAdminInput = {
  sku?: string;
  nombre: string;
  marca?: string;
  contenido?: string;
  descripcion?: string;
  precioVenta: number;
  precioAnterior?: number;
  imageUrl?: string;
  imageStoragePath?: string;
  badgeLabel?: string;
  costoUnitario?: number;
  stockActual?: number;
  stockAgenda?: number;
  stockMinimo?: number;
  activo?: boolean;
  esTop?: boolean;
  esOfertaSemana?: boolean;
  ordenDestacado?: number;
  tipoProducto?: string;
};

export class ProductoService {
  constructor(private readonly productRepository: ProductRepository) {}

  async obtenerProductosActivos() {
    const products = await this.productRepository.buscarProductosActivos();

    return products
      .map((product) => new Producto(product))
      .filter((product) => product.activo)
      .map((product) => {
        const visual = getProductVisualMeta(product);

        return {
          id: product.id,
          sku: product.sku,
          nombre: product.nombre,
          marca: product.marca,
          contenido: product.contenido,
          descripcion: product.descripcion,
          precioVenta: product.precioVenta,
          precioAnterior: product.precioAnterior,
          imageUrl: product.imageUrl || visual.imageUrl,
          badgeLabel:
            product.badgeLabel ||
            visual.badgeLabel ||
            product.tipoProducto ||
            "PERFUME",
          stockActual: getUnifiedProductStock(product),
          stockAgenda: getUnifiedProductStock(product),
          stockReservado: product.stockReservado,
          stockMinimo: product.stockMinimo,
          esTop: product.esTop,
          esOfertaSemana: product.esOfertaSemana,
          ordenDestacado: product.ordenDestacado,
          tipoProducto: product.tipoProducto
        };
      });
  }

  async obtenerCatalogoAdmin(): Promise<AdminProductRecord[]> {
    const products = await this.productRepository.buscarTodosProductos();

    return products.map((product) => {
      const domainProduct = new Producto(product);
      const visual = getProductVisualMeta(domainProduct);

      return {
        id: domainProduct.id,
        sku: domainProduct.sku,
        nombre: domainProduct.nombre,
        marca: domainProduct.marca,
        contenido: domainProduct.contenido,
        descripcion: domainProduct.descripcion,
        precioVenta: domainProduct.precioVenta,
        precioAnterior: domainProduct.precioAnterior,
        imageUrl: domainProduct.imageUrl || visual.imageUrl,
        imageStoragePath: domainProduct.imageStoragePath,
        badgeLabel:
          domainProduct.badgeLabel ||
          visual.badgeLabel ||
          domainProduct.tipoProducto ||
          "PERFUME",
        costoUnitario: domainProduct.costoUnitario,
        stockActual: getUnifiedProductStock(domainProduct),
        stockAgenda: getUnifiedProductStock(domainProduct),
        stockReservado: domainProduct.stockReservado,
        stockMinimo: domainProduct.stockMinimo,
        activo: domainProduct.activo,
        esTop: domainProduct.esTop,
        esOfertaSemana: domainProduct.esOfertaSemana,
        ordenDestacado: domainProduct.ordenDestacado,
        tipoProducto: domainProduct.tipoProducto,
        utilidadUnitaria: domainProduct.calcularUtilidadUnitaria()
      };
    });
  }

  async crearProductoAdmin(input: ProductoAdminInput) {
    const stock = normalizeStockValue(input.stockActual ?? input.stockAgenda ?? 0);
    const product = new Producto({
      id: crypto.randomUUID(),
      sku: input.sku,
      nombre: input.nombre,
      marca: input.marca,
      contenido: input.contenido,
      descripcion: input.descripcion,
      precioVenta: input.precioVenta,
      precioAnterior: input.precioAnterior,
      imageUrl: input.imageUrl,
      imageStoragePath: input.imageStoragePath,
      badgeLabel: input.badgeLabel,
      costoUnitario: input.costoUnitario ?? 0,
      stockActual: stock,
      stockAgenda: stock,
      stockMinimo: input.stockMinimo ?? 0,
      activo: stock > 0 ? input.activo ?? true : false,
      esTop: input.esTop ?? false,
      esOfertaSemana: input.esOfertaSemana ?? false,
      ordenDestacado: input.ordenDestacado,
      tipoProducto: input.tipoProducto ?? "simple"
    });

    await this.productRepository.crearProducto({
      id: product.id,
      sku: product.sku,
      nombre: product.nombre,
      marca: product.marca,
      contenido: product.contenido,
      descripcion: product.descripcion,
      precioVenta: product.precioVenta,
      precioAnterior: product.precioAnterior,
      imageUrl: product.imageUrl,
      imageStoragePath: product.imageStoragePath,
      badgeLabel: product.badgeLabel,
      costoUnitario: product.costoUnitario,
      stockActual: product.stockActual,
      stockAgenda: product.stockAgenda,
      stockMinimo: product.stockMinimo,
      activo: product.activo,
      esTop: product.esTop,
      esOfertaSemana: product.esOfertaSemana,
      ordenDestacado: product.ordenDestacado,
      tipoProducto: product.tipoProducto
    });
  }

  async actualizarProductoAdmin(id: string, input: ProductoAdminInput) {
    const current = await this.productRepository.buscarProductoPorId(id);

    if (!current) {
      throw new Error("Producto no encontrado.");
    }

    const stock = normalizeStockValue(
      input.stockActual ?? input.stockAgenda ?? current.stockActual
    );
    const domainProduct = new Producto({
      ...current,
      sku: input.sku,
      nombre: input.nombre,
      marca: input.marca,
      contenido: input.contenido,
      descripcion: input.descripcion,
      precioVenta: input.precioVenta,
      precioAnterior: input.precioAnterior,
      imageUrl: input.imageUrl,
      imageStoragePath: input.imageStoragePath,
      badgeLabel: input.badgeLabel,
      costoUnitario: input.costoUnitario ?? 0,
      stockActual: stock,
      stockAgenda: stock,
      stockMinimo: input.stockMinimo ?? current.stockMinimo ?? 0,
      activo: stock > 0 ? input.activo ?? true : false,
      esTop: input.esTop ?? current.esTop ?? false,
      esOfertaSemana: input.esOfertaSemana ?? current.esOfertaSemana ?? false,
      ordenDestacado: input.ordenDestacado,
      tipoProducto: input.tipoProducto ?? "simple"
    });

    await this.productRepository.actualizarProducto(id, {
      sku: domainProduct.sku,
      nombre: domainProduct.nombre,
      marca: domainProduct.marca,
      contenido: domainProduct.contenido,
      descripcion: domainProduct.descripcion,
      precioVenta: domainProduct.precioVenta,
      precioAnterior: domainProduct.precioAnterior,
      imageUrl: domainProduct.imageUrl,
      imageStoragePath: domainProduct.imageStoragePath,
      badgeLabel: domainProduct.badgeLabel,
      costoUnitario: domainProduct.costoUnitario,
      stockActual: domainProduct.stockActual,
      stockAgenda: domainProduct.stockAgenda,
      stockMinimo: domainProduct.stockMinimo,
      activo: domainProduct.activo,
      esTop: domainProduct.esTop,
      esOfertaSemana: domainProduct.esOfertaSemana,
      ordenDestacado: domainProduct.ordenDestacado,
      tipoProducto: domainProduct.tipoProducto
    });
  }

  async cambiarEstadoProducto(id: string, activo: boolean) {
    const current = await this.productRepository.buscarProductoPorId(id);

    if (!current) {
      throw new Error("Producto no encontrado.");
    }

    const domainProduct = new Producto(current);
    if (activo && getUnifiedProductStock(domainProduct) <= 0) {
      throw new Error("Repone stock antes de volver a activar este producto.");
    }

    if (activo) {
      domainProduct.activar();
    } else {
      domainProduct.desactivar();
    }

    await this.productRepository.actualizarProducto(id, { activo: domainProduct.activo });
  }

  async eliminarProductoAdmin(id: string) {
    const current = await this.productRepository.buscarProductoPorId(id);

    if (!current) {
      throw new Error("Producto no encontrado.");
    }

    await this.productRepository.eliminarProducto(id);
  }

  /**
   * Genera un preview (dry-run) del CSV de importacion masiva: no escribe
   * nada. Devuelve filas validas/bloqueadas y el plan crear/actualizar.
   */
  async previsualizarImportacionCsv(
    buffer: Buffer,
    fileName: string,
    sizeBytes: number
  ): Promise<AdminImportPreview> {
    const sizeError = validateFileSize(sizeBytes);
    if (sizeError) {
      return {
        totalFilas: 0,
        filasValidas: [],
        erroresFila: [],
        plan: [],
        resumen: { crear: 0, actualizar: 0, bloqueado: 0 },
        erroresGlobales: [sizeError]
      };
    }

    const extensionError = validateFileNameExtension(fileName);
    if (extensionError) {
      return {
        totalFilas: 0,
        filasValidas: [],
        erroresFila: [],
        plan: [],
        resumen: { crear: 0, actualizar: 0, bloqueado: 0 },
        erroresGlobales: [extensionError]
      };
    }

    const binaryError = validateBinaryContent(buffer);
    if (binaryError) {
      return {
        totalFilas: 0,
        filasValidas: [],
        erroresFila: [],
        plan: [],
        resumen: { crear: 0, actualizar: 0, bloqueado: 0 },
        erroresGlobales: [binaryError]
      };
    }

    const existingProducts = await this.productRepository.buscarTodosProductos();
    const existingSkus = new Set(existingProducts.map((p) => p.sku).filter(Boolean) as string[]);

    return buildAdminImportPreview(buffer, existingSkus);
  }

  /**
   * Ejecuta el upsert por SKU de las filas ya validadas (crear/actualizar).
   * NUNCA elimina productos ausentes del archivo. Requiere confirmacion
   * explicita desde el llamador (no se invoca automaticamente tras preview).
   */
  async confirmarImportacionCsv(rows: AdminImportRow[]) {
    let creados = 0;
    let actualizados = 0;

    for (const row of rows) {
      const existing = await this.productRepository.buscarProductoPorSku(row.sku);
      const stock = normalizeStockValue(row.stock ?? 0);
      const payload = {
        sku: row.sku,
        nombre: row.nombre,
        marca: row.marca,
        contenido: row.contenido,
        precioVenta: row.precioVenta ?? 0,
        precioAnterior: row.precioAnterior ?? undefined,
        imageUrl: row.imageUrl || undefined,
        costoUnitario: row.costoUnitario ?? 0,
        stockActual: stock,
        stockAgenda: stock,
        activo: row.activo,
        esTop: row.esTop,
        esOfertaSemana: row.esOfertaSemana,
        ordenDestacado: row.ordenDestacado ?? undefined,
        tipoProducto: "simple"
      };

      if (existing) {
        await this.productRepository.actualizarProducto(existing.id, payload);
        actualizados += 1;
      } else {
        const domainProduct = new Producto({ id: crypto.randomUUID(), ...payload });
        await this.productRepository.crearProducto({
          id: domainProduct.id,
          sku: domainProduct.sku,
          nombre: domainProduct.nombre,
          marca: domainProduct.marca,
          contenido: domainProduct.contenido,
          descripcion: domainProduct.descripcion,
          precioVenta: domainProduct.precioVenta,
          precioAnterior: domainProduct.precioAnterior,
          imageUrl: domainProduct.imageUrl,
          costoUnitario: domainProduct.costoUnitario,
          stockActual: domainProduct.stockActual,
          stockAgenda: domainProduct.stockAgenda,
          activo: domainProduct.activo,
          esTop: domainProduct.esTop,
          esOfertaSemana: domainProduct.esOfertaSemana,
          ordenDestacado: domainProduct.ordenDestacado,
          tipoProducto: domainProduct.tipoProducto
        });
        creados += 1;
      }
    }

    return { creados, actualizados };
  }
}

export function createProductoService() {
  return new ProductoService(getProductRepository());
}
