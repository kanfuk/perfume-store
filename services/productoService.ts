/**
 * Proyecto: Perfume Store
 * Modulo: Gestion de Productos
 * Descripcion: Servicio encargado de exponer productos activos para el formulario cliente.
 * Buenas practicas: Separacion de responsabilidades y validacion de estados.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

import { Producto } from "@/domain/Producto";
import type { ProductoProps } from "@/domain/Producto";
import { getProductVisualMeta } from "@/lib/product-catalog";
import { getUnifiedProductStock, normalizeStockValue } from "@/lib/stock";
import { TOP_PRODUCTS_LIMIT } from "@/lib/constants";
import { validateImageUrlInput } from "@/lib/image-url";
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
import {
  buildSupplierImportPreview,
  type SupplierImportPreview,
  type SupplierPlanRow,
  type ExistingProductPriceInfo
} from "@/lib/catalog-import/supplier-import.ts";
import {
  validateSalePriceInput,
  roundPriceToStep,
  calculateAutoPrice,
  applyPercentageAdjustment,
  applyFixedAdjustment,
  isValidRoundingStep,
  type RoundingStep
} from "@/lib/pricing";

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
      .filter(
        (product) => product.activo && getUnifiedProductStock(product) > 0 && product.precioVenta > 0
      )
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
          ordenDestacado: product.ordenDestacado ?? undefined,
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
        ordenDestacado: domainProduct.ordenDestacado ?? undefined,
        tipoProducto: domainProduct.tipoProducto,
        utilidadUnitaria: domainProduct.calcularUtilidadUnitaria(),
        modoPrecio: domainProduct.modoPrecio
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

  /**
   * Preview (dry-run) del perfil "CSV de proveedor": no escribe nada.
   * Reutiliza las mismas validaciones de archivo (tamano/extension/binario)
   * que el importador canonico.
   */
  async previsualizarImportacionProveedor(
    buffer: Buffer,
    fileName: string,
    sizeBytes: number,
    markupPercentage: unknown
  ): Promise<SupplierImportPreview> {
    const sizeError = validateFileSize(sizeBytes);
    if (sizeError) return this.blockedSupplierPreview([sizeError]);

    const extensionError = validateFileNameExtension(fileName);
    if (extensionError) return this.blockedSupplierPreview([extensionError]);

    const binaryError = validateBinaryContent(buffer);
    if (binaryError) return this.blockedSupplierPreview([binaryError]);

    const existingProducts = await this.productRepository.buscarTodosProductos();
    const existingBySku = new Map<string, ExistingProductPriceInfo>();
    for (const p of existingProducts) {
      if (p.sku) {
        existingBySku.set(p.sku, {
          modoPrecio: p.modoPrecio === "MANUAL" ? "MANUAL" : "AUTO",
          precioVenta: p.precioVenta
        });
      }
    }

    return buildSupplierImportPreview(buffer, markupPercentage, existingBySku);
  }

  private blockedSupplierPreview(erroresGlobales: string[]): SupplierImportPreview {
    return {
      perfil: "proveedor",
      porcentajeAplicado: 0,
      filasFisicas: 0,
      filasVacias: 0,
      filasUtiles: 0,
      erroresFila: [],
      plan: [],
      resumen: { crear: 0, actualizar: 0, bloqueado: 0 },
      erroresGlobales
    };
  }

  /**
   * Confirma la importacion del perfil "CSV de proveedor": upsert por SKU.
   * En ACTUALIZAR toca UNICAMENTE nombre/marca/contenido/costo/precio de
   * venta -- nunca stock, activo, imagen, Top 12 ni ofertas del producto
   * existente (se preservan intactos). Si el producto existente es MANUAL,
   * el costo se actualiza pero el precio de venta manual se preserva
   * (row.precioVentaFinal ya viene resuelto asi desde buildSupplierImportPlan).
   * En CREAR, el producto nace activo con stock 1 y modo AUTO (Fase 2B.6:
   * debe aparecer de inmediato en el catalogo publico y en stock rapido para
   * revision, sin bloquear la operacion diaria del admin).
   */
  async confirmarImportacionProveedor(plan: SupplierPlanRow[]) {
    let creados = 0;
    let actualizados = 0;

    for (const row of plan) {
      const existing = await this.productRepository.buscarProductoPorSku(row.sku);

      if (existing) {
        await this.productRepository.actualizarProducto(existing.id, {
          nombre: row.nombre,
          marca: row.marca,
          contenido: row.contenido,
          costoUnitario: row.costoUnitario,
          precioVenta: row.precioVentaFinal
        });
        actualizados += 1;
        continue;
      }

      const domainProduct = new Producto({
        id: crypto.randomUUID(),
        sku: row.sku,
        nombre: row.nombre,
        marca: row.marca,
        contenido: row.contenido,
        precioVenta: row.precioVentaFinal,
        costoUnitario: row.costoUnitario,
        stockActual: 1,
        stockAgenda: 1,
        stockReservado: 0,
        stockMinimo: 0,
        activo: true,
        esTop: false,
        esOfertaSemana: false,
        modoPrecio: "AUTO",
        tipoProducto: "simple"
      });

      await this.productRepository.crearProducto({
        id: domainProduct.id,
        sku: domainProduct.sku,
        nombre: domainProduct.nombre,
        marca: domainProduct.marca,
        contenido: domainProduct.contenido,
        descripcion: domainProduct.descripcion,
        precioVenta: domainProduct.precioVenta,
        costoUnitario: domainProduct.costoUnitario,
        stockActual: domainProduct.stockActual,
        stockAgenda: domainProduct.stockAgenda,
        stockReservado: domainProduct.stockReservado,
        stockMinimo: domainProduct.stockMinimo,
        activo: domainProduct.activo,
        esTop: domainProduct.esTop,
        esOfertaSemana: domainProduct.esOfertaSemana,
        modoPrecio: domainProduct.modoPrecio,
        tipoProducto: domainProduct.tipoProducto
      });
      creados += 1;
    }

    return { creados, actualizados };
  }

  /**
   * Edicion rapida - fila individual: fija un precio manual. Toca UNICAMENTE
   * precio_venta y modo_precio; nunca stock, imagen, Top 12 ni ofertas.
   */
  async fijarPrecioManualProducto(id: string, precioVentaRaw: unknown) {
    const validation = validateSalePriceInput(precioVentaRaw);
    if (validation.error !== null) {
      throw new Error(validation.error);
    }

    const current = await this.productRepository.buscarProductoPorId(id);
    if (!current) {
      throw new Error("Producto no encontrado.");
    }

    const domainProduct = new Producto(current);
    domainProduct.fijarPrecioManual(validation.value);

    await this.productRepository.actualizarProducto(id, {
      precioVenta: domainProduct.precioVenta,
      modoPrecio: domainProduct.modoPrecio
    });

    return { id, precioVenta: domainProduct.precioVenta, modoPrecio: domainProduct.modoPrecio };
  }

  /**
   * Edicion rapida - fila individual: "Volver a precio automatico". Recalcula
   * desde costo + recargo indicado y vuelve a modo AUTO. Toca UNICAMENTE
   * precio_venta y modo_precio.
   */
  async volverPrecioAutomaticoProducto(id: string, recargoPorcentajeRaw: unknown) {
    const markup = typeof recargoPorcentajeRaw === "number" ? recargoPorcentajeRaw : Number(recargoPorcentajeRaw);
    if (!Number.isFinite(markup) || markup < 0 || markup > 300) {
      throw new Error("El recargo debe ser un número entre 0 y 300.");
    }

    const current = await this.productRepository.buscarProductoPorId(id);
    if (!current) {
      throw new Error("Producto no encontrado.");
    }

    const domainProduct = new Producto(current);
    domainProduct.recalcularPrecioAutomatico(markup);

    await this.productRepository.actualizarProducto(id, {
      precioVenta: domainProduct.precioVenta,
      modoPrecio: domainProduct.modoPrecio
    });

    return { id, precioVenta: domainProduct.precioVenta, modoPrecio: domainProduct.modoPrecio };
  }

  /**
   * Edicion masiva de precios: dry-run. Nunca escribe. Re-deriva el precio
   * nuevo desde el estado ACTUAL de cada producto (nunca confia en un precio
   * "nuevo" enviado por el navegador).
   */
  async previsualizarAjusteMasivoPrecio(
    productIds: string[],
    operation: BulkPriceOperation
  ): Promise<BulkPricePreview> {
    const operationError = validateBulkOperation(operation);
    if (operationError) {
      return { operation, productos: [], erroresGlobales: [operationError] };
    }

    const productos: BulkPricePreviewRow[] = [];
    const erroresGlobales: string[] = [];

    for (const id of productIds) {
      const current = await this.productRepository.buscarProductoPorId(id);
      if (!current) {
        erroresGlobales.push(`Producto ${id} no encontrado.`);
        continue;
      }

      const precioAnterior = current.precioVenta;
      const precioNuevo = computeBulkNewPrice(current, operation);

      if (precioNuevo === null) {
        erroresGlobales.push(
          `${current.nombre || id}: el resultado del ajuste no es un precio valido (debe ser un entero mayor que 0).`
        );
        continue;
      }

      productos.push({
        id,
        sku: current.sku ?? "",
        nombre: current.nombre,
        precioAnterior,
        precioNuevo,
        diferencia: precioNuevo - precioAnterior
      });
    }

    return { operation, productos, erroresGlobales };
  }

  /**
   * Edicion masiva de precios: confirmacion. Re-deriva el plan igual que el
   * preview (nunca confia en el navegador) y aplica solo precio_venta +
   * modo_precio por producto. "recargo" deja el producto en AUTO; los demas
   * ajustes (porcentaje/monto) marcan MANUAL; "redondeo" preserva el modo
   * actual del producto.
   */
  async confirmarAjusteMasivoPrecio(productIds: string[], operation: BulkPriceOperation) {
    const operationError = validateBulkOperation(operation);
    if (operationError) {
      throw new Error(operationError);
    }

    let actualizados = 0;

    for (const id of productIds) {
      const current = await this.productRepository.buscarProductoPorId(id);
      if (!current) continue;

      const precioNuevo = computeBulkNewPrice(current, operation);
      if (precioNuevo === null) continue;

      const modoPrecio: "AUTO" | "MANUAL" =
        operation.type === "recargo"
          ? "AUTO"
          : operation.type === "redondeo"
            ? current.modoPrecio === "MANUAL"
              ? "MANUAL"
              : "AUTO"
            : "MANUAL";

      await this.productRepository.actualizarProducto(id, {
        precioVenta: precioNuevo,
        modoPrecio
      });
      actualizados += 1;
    }

    return { actualizados };
  }

  /**
   * Stock rapido - fila individual: suma/resta una cantidad entera al stock
   * actual. Nunca permite negativos ni dejar el stock por debajo de lo
   * reservado. Toca UNICAMENTE stock_actual/stock_agenda (nunca activo,
   * precio, imagen ni Top 12).
   */
  async ajustarStockRapido(id: string, deltaRaw: unknown) {
    const delta = typeof deltaRaw === "number" ? deltaRaw : Number(deltaRaw);
    if (!Number.isFinite(delta) || !Number.isInteger(delta) || delta === 0) {
      throw new Error("La cantidad debe ser un número entero distinto de 0.");
    }

    const current = await this.productRepository.buscarProductoPorId(id);
    if (!current) {
      throw new Error("Producto no encontrado.");
    }

    const stockReservado = current.stockReservado ?? 0;
    const nuevoStock = (current.stockActual ?? 0) + delta;

    if (nuevoStock < 0) {
      throw new Error("El stock no puede ser negativo.");
    }
    if (nuevoStock < stockReservado) {
      throw new Error(`El stock no puede quedar por debajo del stock reservado (${stockReservado}).`);
    }

    await this.productRepository.actualizarProducto(id, { stockActual: nuevoStock, stockAgenda: nuevoStock });
    return { id, stockActual: nuevoStock, activo: current.activo ?? true };
  }

  /**
   * Stock rapido - fila individual: fija un valor absoluto de stock (edicion
   * numerica directa). Misma validacion que ajustarStockRapido.
   */
  async establecerStockRapido(id: string, valorRaw: unknown) {
    const valor = typeof valorRaw === "number" ? valorRaw : Number(valorRaw);
    if (!Number.isFinite(valor) || !Number.isInteger(valor) || valor < 0) {
      throw new Error("El stock debe ser un número entero mayor o igual a 0.");
    }

    const current = await this.productRepository.buscarProductoPorId(id);
    if (!current) {
      throw new Error("Producto no encontrado.");
    }

    const stockReservado = current.stockReservado ?? 0;
    if (valor < stockReservado) {
      throw new Error(`El stock no puede quedar por debajo del stock reservado (${stockReservado}).`);
    }

    await this.productRepository.actualizarProducto(id, { stockActual: valor, stockAgenda: valor });
    return { id, stockActual: valor, activo: current.activo ?? true };
  }

  /**
   * Stock rapido - "Agotar": deja el stock disponible en 0 sin bajar del
   * stock reservado (stock_actual = stock_reservado).
   */
  async agotarProductoRapido(id: string) {
    const current = await this.productRepository.buscarProductoPorId(id);
    if (!current) {
      throw new Error("Producto no encontrado.");
    }

    const stockReservado = current.stockReservado ?? 0;
    await this.productRepository.actualizarProducto(id, {
      stockActual: stockReservado,
      stockAgenda: stockReservado
    });
    return { id, stockActual: stockReservado, activo: current.activo ?? true };
  }

  /**
   * Stock rapido - activar/pausar un producto. Reutiliza cambiarEstadoProducto
   * (misma regla: no se puede activar sin stock).
   */
  async cambiarActivoStockRapido(id: string, activo: boolean) {
    await this.cambiarEstadoProducto(id, activo);
    const current = await this.productRepository.buscarProductoPorId(id);
    return { id, activo: current?.activo ?? activo, stockActual: current?.stockActual ?? 0 };
  }

  /**
   * Stock rapido - edicion masiva: dry-run. Nunca escribe. Re-deriva el
   * resultado desde el estado ACTUAL de cada producto.
   */
  async previsualizarAjusteMasivoStock(
    productIds: string[],
    operation: BulkStockOperation
  ): Promise<BulkStockPreview> {
    const operationError = validateBulkStockOperation(operation);
    if (operationError) {
      return { operation, productos: [], erroresGlobales: [operationError] };
    }

    const productos: BulkStockPreviewRow[] = [];
    const erroresGlobales: string[] = [];

    for (const id of productIds) {
      const current = await this.productRepository.buscarProductoPorId(id);
      if (!current) {
        erroresGlobales.push(`Producto ${id} no encontrado.`);
        continue;
      }

      const computed = computeBulkNewStock(current, operation);
      if (!computed) {
        erroresGlobales.push(
          `${current.nombre || id}: la operación dejaría el stock por debajo de lo permitido.`
        );
        continue;
      }

      productos.push({
        id,
        sku: current.sku ?? "",
        nombre: current.nombre,
        stockAnterior: current.stockActual ?? 0,
        stockNuevo: computed.stockNuevo,
        activoAnterior: current.activo ?? true,
        activoNuevo: computed.activoNuevo
      });
    }

    return { operation, productos, erroresGlobales };
  }

  /**
   * Stock rapido - edicion masiva: confirmacion. Re-deriva igual que el
   * preview. Activar/pausar toca UNICAMENTE activo; el resto toca UNICAMENTE
   * stock_actual/stock_agenda.
   */
  async confirmarAjusteMasivoStock(productIds: string[], operation: BulkStockOperation) {
    const operationError = validateBulkStockOperation(operation);
    if (operationError) {
      throw new Error(operationError);
    }

    let actualizados = 0;

    for (const id of productIds) {
      const current = await this.productRepository.buscarProductoPorId(id);
      if (!current) continue;

      const computed = computeBulkNewStock(current, operation);
      if (!computed) continue;

      if (operation.type === "activar" || operation.type === "pausar") {
        await this.productRepository.actualizarProducto(id, { activo: computed.activoNuevo });
      } else {
        await this.productRepository.actualizarProducto(id, {
          stockActual: computed.stockNuevo,
          stockAgenda: computed.stockNuevo
        });
      }
      actualizados += 1;
    }

    return { actualizados };
  }

  /**
   * Top 12 editorial: estado de las 12 posiciones (producto vinculado o null
   * en cada una). Se deriva de es_top/orden_destacado -- no crea tablas nuevas.
   */
  async obtenerEstadoTop12(): Promise<Top12Slot[]> {
    const productos = await this.productRepository.buscarTodosProductos();
    const porRank = new Map<number, ProductoProps>();

    for (const producto of productos) {
      if (producto.esTop && typeof producto.ordenDestacado === "number") {
        porRank.set(producto.ordenDestacado, producto);
      }
    }

    return Array.from({ length: TOP_PRODUCTS_LIMIT }, (_, index) => {
      const rank = index + 1;
      return { rank, producto: porRank.get(rank) ?? null };
    });
  }

  /**
   * Top 12 editorial: vincula un producto a una posicion (1..12). Si otro
   * producto ya ocupaba esa posicion, se le quita es_top/orden_destacado SIN
   * tocar su imageUrl (conserva su propia imagen comercial si la tenia). Si
   * el producto elegido ya estaba en otra posicion, esta escritura reemplaza
   * su propio orden_destacado, liberando automaticamente la posicion previa
   * (un producto solo puede estar en una posicion a la vez).
   */
  async vincularProductoTop12(rankRaw: unknown, productId: string, imageUrl: string) {
    const rank = typeof rankRaw === "number" ? rankRaw : Number(rankRaw);
    if (!Number.isInteger(rank) || rank < 1 || rank > TOP_PRODUCTS_LIMIT) {
      throw new Error(`La posición debe ser un número entero entre 1 y ${TOP_PRODUCTS_LIMIT}.`);
    }
    if (typeof imageUrl !== "string" || !imageUrl.trim()) {
      throw new Error("Falta la imagen del Top 12 para esta posición.");
    }
    if (typeof productId !== "string" || !productId.trim()) {
      throw new Error("Selecciona un producto para vincular.");
    }

    const productoNuevo = await this.productRepository.buscarProductoPorId(productId);
    if (!productoNuevo) {
      throw new Error("Producto no encontrado.");
    }

    const todos = await this.productRepository.buscarTodosProductos();
    const ocupanteActual = todos.find(
      (producto) => producto.id !== productId && producto.esTop && producto.ordenDestacado === rank
    );

    if (ocupanteActual) {
      await this.productRepository.actualizarProducto(ocupanteActual.id, {
        esTop: false,
        ordenDestacado: null
      });
    }

    const actualizado = await this.productRepository.actualizarProducto(productId, {
      esTop: true,
      ordenDestacado: rank,
      imageUrl
    });

    return { rank, producto: actualizado };
  }

  /**
   * Top 12 editorial: libera una posicion (queda sin producto vinculado).
   * No toca imageUrl del producto liberado.
   */
  async desvincularProductoTop12(rankRaw: unknown) {
    const rank = typeof rankRaw === "number" ? rankRaw : Number(rankRaw);
    if (!Number.isInteger(rank) || rank < 1 || rank > TOP_PRODUCTS_LIMIT) {
      throw new Error(`La posición debe ser un número entero entre 1 y ${TOP_PRODUCTS_LIMIT}.`);
    }

    const todos = await this.productRepository.buscarTodosProductos();
    const ocupante = todos.find((producto) => producto.esTop && producto.ordenDestacado === rank);

    if (ocupante) {
      await this.productRepository.actualizarProducto(ocupante.id, {
        esTop: false,
        ordenDestacado: null
      });
    }

    return { rank, producto: null };
  }

  /**
   * Asigna manualmente image_url de un producto (sin subir archivos ni tocar
   * Storage). Valida que sea https:// o una ruta local /images/. Toca
   * UNICAMENTE image_url.
   */
  async asignarImagenProducto(id: string, imageUrlRaw: unknown) {
    const validation = validateImageUrlInput(imageUrlRaw);
    if (validation.error !== null) {
      throw new Error(validation.error);
    }

    const current = await this.productRepository.buscarProductoPorId(id);
    if (!current) {
      throw new Error("Producto no encontrado.");
    }

    await this.productRepository.actualizarProducto(id, { imageUrl: validation.value });
    return { id, imageUrl: validation.value };
  }
}

export type Top12Slot = {
  rank: number;
  producto: ProductoProps | null;
};

export type BulkStockOperation =
  | { type: "sumar"; cantidad: number }
  | { type: "restar"; cantidad: number }
  | { type: "establecer"; valor: number }
  | { type: "activar" }
  | { type: "pausar" };

export type BulkStockPreviewRow = {
  id: string;
  sku: string;
  nombre: string;
  stockAnterior: number;
  stockNuevo: number;
  activoAnterior: boolean;
  activoNuevo: boolean;
};

export type BulkStockPreview = {
  operation: BulkStockOperation;
  productos: BulkStockPreviewRow[];
  erroresGlobales: string[];
};

function validateBulkStockOperation(operation: BulkStockOperation): string | null {
  if (operation.type === "sumar" || operation.type === "restar") {
    if (!Number.isFinite(operation.cantidad) || !Number.isInteger(operation.cantidad) || operation.cantidad <= 0) {
      return "La cantidad debe ser un número entero mayor que 0.";
    }
  }
  if (operation.type === "establecer") {
    if (!Number.isFinite(operation.valor) || !Number.isInteger(operation.valor) || operation.valor < 0) {
      return "El stock debe ser un número entero mayor o igual a 0.";
    }
  }
  return null;
}

function computeBulkNewStock(
  current: { stockActual?: number; stockReservado?: number; activo?: boolean },
  operation: BulkStockOperation
): { stockNuevo: number; activoNuevo: boolean } | null {
  const stockActual = current.stockActual ?? 0;
  const stockReservado = current.stockReservado ?? 0;
  const activoActual = current.activo ?? true;

  if (operation.type === "sumar") {
    return { stockNuevo: stockActual + operation.cantidad, activoNuevo: activoActual };
  }

  if (operation.type === "restar") {
    const nuevo = stockActual - operation.cantidad;
    if (nuevo < 0 || nuevo < stockReservado) return null;
    return { stockNuevo: nuevo, activoNuevo: activoActual };
  }

  if (operation.type === "establecer") {
    if (operation.valor < stockReservado) return null;
    return { stockNuevo: operation.valor, activoNuevo: activoActual };
  }

  if (operation.type === "activar") {
    if (stockActual <= 0) return null;
    return { stockNuevo: stockActual, activoNuevo: true };
  }

  return { stockNuevo: stockActual, activoNuevo: false };
}

export type BulkPriceOperation =
  | { type: "recargo"; porcentaje: number }
  | { type: "ajuste-porcentaje"; porcentaje: number }
  | { type: "ajuste-monto"; monto: number }
  | { type: "redondeo"; paso: RoundingStep };

export type BulkPricePreviewRow = {
  id: string;
  sku: string;
  nombre: string;
  precioAnterior: number;
  precioNuevo: number;
  diferencia: number;
};

export type BulkPricePreview = {
  operation: BulkPriceOperation;
  productos: BulkPricePreviewRow[];
  erroresGlobales: string[];
};

function validateBulkOperation(operation: BulkPriceOperation): string | null {
  if (operation.type === "recargo" || operation.type === "ajuste-porcentaje") {
    if (!Number.isFinite(operation.porcentaje)) return "El porcentaje debe ser un número válido.";
    if (operation.type === "recargo" && (operation.porcentaje < 0 || operation.porcentaje > 300)) {
      return "El recargo debe estar entre 0 y 300%.";
    }
  }
  if (operation.type === "ajuste-monto" && !Number.isFinite(operation.monto)) {
    return "El monto debe ser un número válido.";
  }
  if (operation.type === "redondeo" && !isValidRoundingStep(operation.paso)) {
    return "El paso de redondeo debe ser 100, 500 o 1000.";
  }
  return null;
}

function computeBulkNewPrice(
  current: { precioVenta: number; costoUnitario?: number },
  operation: BulkPriceOperation
): number | null {
  let precioNuevo: number;

  if (operation.type === "recargo") {
    precioNuevo = calculateAutoPrice(current.costoUnitario ?? 0, operation.porcentaje);
  } else if (operation.type === "ajuste-porcentaje") {
    precioNuevo = applyPercentageAdjustment(current.precioVenta, operation.porcentaje);
  } else if (operation.type === "ajuste-monto") {
    precioNuevo = applyFixedAdjustment(current.precioVenta, operation.monto);
  } else {
    precioNuevo = roundPriceToStep(current.precioVenta, operation.paso);
  }

  if (!Number.isFinite(precioNuevo) || !Number.isInteger(precioNuevo) || precioNuevo <= 0) {
    return null;
  }

  return precioNuevo;
}

export function createProductoService() {
  return new ProductoService(getProductRepository());
}
