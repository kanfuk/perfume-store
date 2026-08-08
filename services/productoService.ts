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
import { buildFamilyKey } from "@/lib/product-families";
import { isProductMetadataComplete } from "@/lib/catalog-completeness";
import { computeCatalogSummary, type CatalogSummary } from "@/lib/catalog-summary";
import { getUnifiedProductStock, normalizeStockValue } from "@/lib/stock";
import { OFFERS_LIMIT, TOP_PRODUCTS_LIMIT } from "@/lib/constants";
import { validateImageUrlInput } from "@/lib/image-url";
import type { AdminProductRecord, ProductRecord } from "@/lib/types";
import type { ProductRepository } from "@/repositories/productRepository";
import { getProductRepository } from "@/repositories/productRepository";
import type { TopProductsRankingRepository } from "@/repositories/topProductsRankingRepository";
import { getTopProductsRankingRepository } from "@/repositories/topProductsRankingRepository";
import {
  DEFAULT_TOP_SALES_WINDOW_DAYS,
  validateTopRankingConfiguration,
  type TopRankingConfiguration
} from "@/lib/top-products-ranking";
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
  parseSupplierCsv,
  validateMarkupPercentage,
  type SupplierImportPreview,
  type SupplierPlanRow,
  type ExistingProductPriceInfo
} from "@/lib/catalog-import/supplier-import.ts";
import {
  runQualityReview,
  applyQualityDecisions,
  type QualityReviewResult,
  type QualityDecision,
  type ApplyDecisionsResult,
  type ExistingProductForReview
} from "@/lib/catalog-import/quality-review.ts";
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

/**
 * Mapeo compartido Producto (dominio) -> AdminProductRecord (forma que
 * consume el admin). Extraido para que `obtenerCatalogoAdmin` y
 * `obtenerProductoAdminPorId` devuelvan EXACTAMENTE la misma forma para el
 * mismo producto -- el cliente puede reemplazar un registro de la lista con
 * el resultado de una consulta individual sin perder ni inventar campos.
 */
function mapProductoToAdminRecord(domainProduct: Producto): AdminProductRecord {
  const visual = getProductVisualMeta(domainProduct);

  return {
    id: domainProduct.id,
    sku: domainProduct.sku,
    nombre: domainProduct.nombre,
    marca: domainProduct.marca,
    contenido: domainProduct.contenido,
    descripcion: domainProduct.descripcion,
    precioVenta: domainProduct.precioVenta,
    precioAnterior: domainProduct.precioAnterior ?? undefined,
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
}

export class ProductoService {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly topProductsRankingRepository?: TopProductsRankingRepository
  ) {}

  /**
   * Catalogo publico (Fase 2B.8, familias de producto): ya NO filtra
   * producto por producto. Una FAMILIA (marca+nombre) es visible si al
   * menos una de sus variantes es vendible (activa, con stock, precio y
   * metadatos completos); si lo es, se exponen TODAS sus variantes VENDIBLES
   * o con metadatos completos (incluidas las agotadas o pausadas) para que
   * el selector de tamano pueda mostrarlas como "Sin stock" en vez de
   * ocultarlas. Un producto sin familia visible (el o todos sus hermanos
   * bloqueados) sigue sin aparecer, igual que antes.
   *
   * Fase 2B.13: un producto activo pero con ficha incompleta (falta nombre,
   * marca, contenido o precio valido) NUNCA se publica, ni siquiera como
   * variante deshabilitada de una familia visible por otro hermano completo
   * -- mostrarlo requeriria inventar los datos faltantes. Sigue existiendo
   * y siendo administrable normalmente (services/productoService.ts no lo
   * pausa, no le toca el stock ni el historial); solo se excluye del
   * storefront hasta que se corrija (ver lib/catalog-completeness.ts).
   */
  async obtenerProductosActivos() {
    const [products, effectiveRanking] = await Promise.all([
      this.productRepository.buscarTodosProductos(),
      this.topProductsRankingRepository?.obtenerRankingEfectivo() ?? Promise.resolve(null)
    ]);
    const domainProducts = products.map((product) => new Producto(product));
    const effectiveRankingByProductId = effectiveRanking
      ? new Map(effectiveRanking.map((entry) => [entry.productId, entry]))
      : null;

    const esVendible = (product: Producto) =>
      product.activo &&
      getUnifiedProductStock(product) > 0 &&
      product.precioVenta > 0 &&
      isProductMetadataComplete(product);

    const familiasVisibles = new Set(
      domainProducts.filter(esVendible).map((product) => buildFamilyKey(product.marca, product.nombre))
    );

    return domainProducts
      .filter((product) => familiasVisibles.has(buildFamilyKey(product.marca, product.nombre)))
      .filter((product) => isProductMetadataComplete(product))
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
          activo: product.activo,
          stockActual: getUnifiedProductStock(product),
          stockAgenda: getUnifiedProductStock(product),
          stockReservado: product.stockReservado,
          stockMinimo: product.stockMinimo,
          esTop: effectiveRankingByProductId
            ? effectiveRankingByProductId.has(product.id)
            : product.esTop,
          esOfertaSemana: product.esOfertaSemana,
          ordenDestacado:
            effectiveRankingByProductId?.get(product.id)?.rank ??
            (effectiveRankingByProductId ? undefined : product.ordenDestacado ?? undefined),
          tipoProducto: product.tipoProducto
        };
      });
  }

  async obtenerCatalogoAdmin(): Promise<AdminProductRecord[]> {
    const products = await this.productRepository.buscarTodosProductos();
    return products.map((product) => mapProductoToAdminRecord(new Producto(product)));
  }

  /**
   * Version de un solo producto de `obtenerCatalogoAdmin`, con el MISMO
   * mapeo (misma forma AdminProductRecord). La usa el endpoint de imagen
   * para devolver al cliente el producto completo y actualizado tras
   * subir/reemplazar/eliminar una imagen, en vez de que el cliente
   * reconstruya el registro a mano con solo 2 campos.
   */
  async obtenerProductoAdminPorId(id: string): Promise<AdminProductRecord | null> {
    const product = await this.productRepository.buscarProductoPorId(id);
    if (!product) return null;
    return mapProductoToAdminRecord(new Producto(product));
  }

  /**
   * Catalogo liviano para el buscador de venta directa (Fase 3B.2,
   * /admin/venta-directa): solo productos activos, sin costoUnitario,
   * utilidadUnitaria, imagen ni descripcion -- el navegador no necesita ni
   * debe recibir esos campos para vender rapido. Se agrupa por familia en
   * el cliente con lib/product-families.ts a partir de esta misma forma
   * (ProductRecord).
   */
  async obtenerCatalogoVentaDirecta(): Promise<ProductRecord[]> {
    const products = await this.productRepository.buscarTodosProductos();

    return products
      .map((product) => new Producto(product))
      .filter((product) => product.activo)
      .map((product) => ({
        id: product.id,
        sku: product.sku,
        nombre: product.nombre,
        marca: product.marca,
        contenido: product.contenido,
        precioVenta: product.precioVenta,
        stockActual: getUnifiedProductStock(product),
        stockAgenda: getUnifiedProductStock(product),
        stockReservado: product.stockReservado,
        activo: product.activo,
        esTop: product.esTop,
        ordenDestacado: product.ordenDestacado ?? undefined
      }));
  }

  /**
   * Resumen liviano para "Gestion de catalogo" (Fase 3A, /admin/catalogo):
   * solo conteos, nunca listas de productos ni datos individuales. Reutiliza
   * el mismo repositorio que `obtenerCatalogoAdmin`, pero no serializa cada
   * producto -- evita que el resumen tenga que descargar el catalogo
   * completo solo para contar.
   */
  async obtenerResumenCatalogo(): Promise<CatalogSummary> {
    const [products, effectiveRanking] = await Promise.all([
      this.productRepository.buscarTodosProductos(),
      this.topProductsRankingRepository?.obtenerRankingEfectivo() ?? Promise.resolve(null)
    ]);
    const domainProducts = products.map((product) => new Producto(product));
    const effectiveTopIds = effectiveRanking
      ? new Set(effectiveRanking.map((entry) => entry.productId))
      : null;

    return computeCatalogSummary(
      domainProducts.map((product) => ({
        nombre: product.nombre,
        marca: product.marca,
        contenido: product.contenido,
        precioVenta: product.precioVenta,
        activo: product.activo,
        stockActual: getUnifiedProductStock(product),
        modoPrecio: product.modoPrecio,
        esTop: effectiveTopIds ? effectiveTopIds.has(product.id) : product.esTop,
        esOfertaSemana: product.esOfertaSemana
      }))
    );
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

    const creado = await this.productRepository.crearProducto({
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

    // Se devuelve el producto creado (con su id real) para que el llamador
    // (formulario manual "Agregar perfume") pueda subir la imagen despues,
    // ya que el pipeline de imagenes exige un productId existente.
    return creado;
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

  /**
   * Lista completa del catalogo existente en el formato que necesita el
   * asistente de calidad (Fase 2B.7) para cotejar filas del CSV contra
   * productos ya existentes. Solo lectura.
   */
  async obtenerProductosParaRevisionCalidad(): Promise<ExistingProductForReview[]> {
    const productos = await this.productRepository.buscarTodosProductos();
    return productos
      .filter((p) => Boolean(p.sku))
      .map((p) => ({
        productId: p.id,
        sku: p.sku as string,
        marca: p.marca ?? "",
        nombre: p.nombre,
        contenido: p.contenido ?? "",
        costoUnitario: p.costoUnitario ?? 0,
        precioVenta: p.precioVenta,
        modoPrecio: p.modoPrecio === "MANUAL" ? "MANUAL" : "AUTO"
      }));
  }

  /**
   * Asistente de calidad (Fase 2B.7): analiza el CSV de proveedor ya
   * validado por `previsualizarImportacionProveedor` y ejecuta el motor de
   * calidad (lib/catalog-import/quality-review.ts). Solo lectura: no escribe
   * nada, no llama servicios externos.
   */
  async revisarCalidadImportacionProveedor(buffer: Buffer): Promise<QualityReviewResult> {
    const parsed = parseSupplierCsv(buffer);
    const existingProducts = await this.obtenerProductosParaRevisionCalidad();
    return runQualityReview(parsed.rows, existingProducts, {
      filasFisicas: parsed.filasFisicas,
      filasVacias: parsed.filasVacias
    });
  }

  /**
   * Aplica las decisiones humanas del asistente de calidad y devuelve el
   * plan final (SKU regenerado). NO escribe nada: el llamador decide si
   * confirma con `confirmarImportacionProveedor`.
   */
  async construirPlanConDecisiones(
    buffer: Buffer,
    markupPercentage: number,
    decisions: QualityDecision[]
  ): Promise<{ review: QualityReviewResult; applied: ApplyDecisionsResult }> {
    const parsed = parseSupplierCsv(buffer);
    const existingProducts = await this.obtenerProductosParaRevisionCalidad();
    const review = runQualityReview(parsed.rows, existingProducts, {
      filasFisicas: parsed.filasFisicas,
      filasVacias: parsed.filasVacias
    });
    const applied = applyQualityDecisions(parsed.rows, review.findings, decisions, existingProducts, markupPercentage);
    return { review, applied };
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
   * Edicion rapida - fila individual: actualiza el costo unitario y
   * recalcula el precio de venta desde ese costo + el recargo indicado
   * (misma formula unica que el importador y la creacion manual). Vuelve a
   * modo AUTO -- reemplaza cualquier precio manual fijado antes. Toca
   * UNICAMENTE costo_unitario, precio_venta y modo_precio.
   */
  async actualizarCostoProducto(id: string, costoUnitarioRaw: unknown, recargoPorcentajeRaw: unknown) {
    const costo = typeof costoUnitarioRaw === "number" ? costoUnitarioRaw : Number(costoUnitarioRaw);
    if (!Number.isFinite(costo)) {
      throw new Error("El costo debe ser un número válido.");
    }
    if (costo < 0) {
      throw new Error("El costo no puede ser negativo.");
    }

    const markupValidation = validateMarkupPercentage(recargoPorcentajeRaw);
    if (markupValidation.error !== null) {
      throw new Error(markupValidation.error);
    }

    const current = await this.productRepository.buscarProductoPorId(id);
    if (!current) {
      throw new Error("Producto no encontrado.");
    }

    const domainProduct = new Producto(current);
    domainProduct.actualizarCosto(costo);
    domainProduct.recalcularPrecioAutomatico(markupValidation.value);

    await this.productRepository.actualizarProducto(id, {
      costoUnitario: domainProduct.costoUnitario,
      precioVenta: domainProduct.precioVenta,
      modoPrecio: domainProduct.modoPrecio
    });

    return {
      id,
      costoUnitario: domainProduct.costoUnitario,
      precioVenta: domainProduct.precioVenta,
      modoPrecio: domainProduct.modoPrecio
    };
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
   * Stock rapido - edicion masiva (Fase 2B.9): dry-run. Nunca escribe.
   * Re-deriva el resultado desde el estado ACTUAL de cada producto y
   * clasifica cada uno en CAMBIA/SIN_CAMBIOS/BLOQUEADO -- un bloqueo nunca
   * queda oculto dentro de un mensaje generico, cada fila trae su propio
   * motivo cuando corresponde.
   */
  async previsualizarAjusteMasivoStock(
    productIds: string[],
    operation: BulkStockOperation
  ): Promise<BulkStockPreview> {
    const operationError = validateBulkStockOperation(operation);
    if (operationError) {
      return { operation, totalSeleccionados: productIds.length, productos: [], erroresGlobales: [operationError] };
    }

    const productos: BulkStockPreviewRow[] = [];

    for (const id of productIds) {
      const current = await this.productRepository.buscarProductoPorId(id);
      if (!current) {
        productos.push({
          id,
          sku: "",
          nombre: id,
          stockAnterior: 0,
          stockNuevo: 0,
          activoAnterior: false,
          activoNuevo: false,
          status: "BLOQUEADO",
          motivo: "Producto no encontrado (pudo haber sido eliminado)."
        });
        continue;
      }

      const computed = computeBulkStockResult(current, operation);
      const stockAnterior = current.stockActual ?? 0;
      const activoAnterior = current.activo ?? true;

      productos.push({
        id,
        sku: current.sku ?? "",
        nombre: current.nombre,
        stockAnterior,
        stockNuevo: computed.status === "BLOQUEADO" ? stockAnterior : computed.stockNuevo,
        activoAnterior,
        activoNuevo: computed.status === "BLOQUEADO" ? activoAnterior : computed.activoNuevo,
        status: computed.status,
        motivo: computed.status === "BLOQUEADO" ? computed.motivo : undefined
      });
    }

    return { operation, totalSeleccionados: productIds.length, productos, erroresGlobales: [] };
  }

  /**
   * Stock rapido - edicion masiva: confirmacion. Re-deriva igual que el
   * preview (nunca confia en el navegador). Activar/pausar toca UNICAMENTE
   * activo; el resto toca UNICAMENTE stock_actual/stock_agenda. Se procesa
   * producto por producto -- no hay una transaccion de base de datos real
   * que envuelva todas las escrituras (ver limitacion documentada en
   * docs/SMELLME_BULK_STOCK_ACTIONS.md) -- y se reporta el resultado
   * detallado (modificados/sin cambios/bloqueados), nunca solo un conteo
   * agregado que oculte fallos parciales.
   */
  async confirmarAjusteMasivoStock(productIds: string[], operation: BulkStockOperation): Promise<BulkStockConfirmResult> {
    const operationError = validateBulkStockOperation(operation);
    if (operationError) {
      throw new Error(operationError);
    }

    let actualizados = 0;
    let sinCambios = 0;
    let bloqueados = 0;

    for (const id of productIds) {
      const current = await this.productRepository.buscarProductoPorId(id);
      if (!current) {
        bloqueados += 1;
        continue;
      }

      const computed = computeBulkStockResult(current, operation);
      if (computed.status === "BLOQUEADO") {
        bloqueados += 1;
        continue;
      }
      if (computed.status === "SIN_CAMBIOS") {
        sinCambios += 1;
        continue;
      }

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

    return { actualizados, sinCambios, bloqueados, total: productIds.length };
  }

  /**
   * Estado efectivo de las TOP_PRODUCTS_LIMIT posiciones. Con el repositorio
   * de ranking usa el modo configurado (manual, automático o híbrido); las
   * instancias unitarias antiguas sin esa dependencia conservan exactamente
   * la derivación histórica desde es_top/orden_destacado.
   */
  async obtenerEstadoTop12(): Promise<Top12Slot[]> {
    const [productos, ranking] = await Promise.all([
      this.productRepository.buscarTodosProductos(),
      this.topProductsRankingRepository?.obtenerRankingEfectivo() ?? Promise.resolve(null)
    ]);
    if (ranking) {
      const porId = new Map(productos.map((producto) => [producto.id, producto]));
      const porRank = new Map(ranking.map((entry) => [entry.rank, entry]));

      return Array.from({ length: TOP_PRODUCTS_LIMIT }, (_, index) => {
        const rank = index + 1;
        const entry = porRank.get(rank);
        return {
          rank,
          producto: entry ? porId.get(entry.productId) ?? null : null,
          source: entry?.source ?? null,
          unitsSold: entry?.unitsSold ?? 0,
          revenue: entry?.revenue ?? 0
        };
      });
    }

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

  async obtenerConfiguracionTopProductos(): Promise<TopRankingConfiguration> {
    if (!this.topProductsRankingRepository) {
      return { mode: "MANUAL", salesWindowDays: DEFAULT_TOP_SALES_WINDOW_DAYS };
    }
    return this.topProductsRankingRepository.obtenerConfiguracion();
  }

  async guardarConfiguracionTopProductos(input: {
    mode?: unknown;
    salesWindowDays?: unknown;
  }): Promise<TopRankingConfiguration> {
    if (!this.topProductsRankingRepository) {
      throw new Error("El repositorio de configuración del Top 15 no está disponible.");
    }
    const configuration = validateTopRankingConfiguration(input);
    return this.topProductsRankingRepository.guardarConfiguracion(configuration);
  }

  /**
   * Top 15 editorial (posiciones 1..TOP_PRODUCTS_LIMIT; "Top12" en nombres
   * internos por herencia de la Fase 3B, el contrato no depende del numero
   * 12): vincula un producto a una posicion. Si otro producto ya ocupaba esa
   * posicion, se le quita es_top/orden_destacado SIN tocar su imageUrl
   * (conserva su propia imagen comercial si la tenia). Si el producto
   * elegido ya estaba en otra posicion, esta escritura reemplaza su propio
   * orden_destacado, liberando automaticamente la posicion previa (un
   * producto solo puede estar en una posicion a la vez).
   *
   * La imagen pertenece siempre al producto, nunca a la posicion (Fase
   * 7.4): este metodo jamas escribe imageUrl. El puesto vinculado muestra la
   * fotografia real del producto (o el fallback neutral si no tiene) sin
   * importar el rank -- ver data/top12-image-map.json para el detalle de por
   * que ese mapa de fotografias curadas por posicion quedo sin consumo
   * automatico.
   */
  async vincularProductoTop12(rankRaw: unknown, productId: string) {
    const rank = typeof rankRaw === "number" ? rankRaw : Number(rankRaw);
    if (!Number.isInteger(rank) || rank < 1 || rank > TOP_PRODUCTS_LIMIT) {
      throw new Error(`La posición debe ser un número entero entre 1 y ${TOP_PRODUCTS_LIMIT}.`);
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
      ordenDestacado: rank
    });

    return { rank, producto: actualizado };
  }

  /**
   * Top 15 editorial: libera una posicion (queda sin producto vinculado).
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
   * Ofertas de la semana (Fase 7.4): activa es_oferta_semana en un producto,
   * validando el maximo OFFERS_LIMIT. `precioAnterior` es opcional -- nunca
   * se calcula ni se inventa aqui, solo se persiste el valor que ingresa el
   * admin (debe ser mayor que 0). No toca ningun otro campo del producto.
   *
   * Reactivar un producto que ya esta en oferta es idempotente: no vuelve a
   * validar el maximo (no se cuenta dos veces a si mismo) y solo actualiza
   * precioAnterior si se envio uno nuevo.
   *
   * Un producto pausado no puede iniciar una oferta nueva (Fase 7.4A,
   * seccion 6A) -- si ya estaba en oferta y luego se pausa desde otra
   * pantalla, esta llamada NO lo bloquea (solo el admin lo ve como
   * inconsistencia en el panel; el catalogo publico ya lo excluye por estar
   * pausado, ver obtenerProductosActivos).
   *
   * ATOMICIDAD (Fase 7.4A): el conteo de ofertas activas y la escritura son
   * dos operaciones separadas (leer, luego escribir), no una transaccion ni
   * un UPDATE condicionado por conteo. Bajo carga administrativa concurrente
   * esto puede superar OFFERS_LIMIT (demostrado en
   * tests/services/productoService.ofertasConcurrency.test.ts). No se creo
   * una funcion SQL/RPC/trigger para esto en esta fase -- ver
   * docs/SMELLME_OFFERS_ATOMICITY_PROPOSAL.md para el analisis y la
   * propuesta pendiente. Riesgo aceptado por ahora: es una pantalla admin de
   * uso interno, de bajo trafico, sin concurrencia real esperada.
   */
  async activarOfertaSemana(productIdRaw: unknown, precioAnteriorRaw?: unknown) {
    if (typeof productIdRaw !== "string" || !productIdRaw.trim()) {
      throw new Error("Selecciona un producto para agregar a las ofertas.");
    }
    const productId = productIdRaw;

    let precioAnterior: number | undefined;
    if (precioAnteriorRaw !== undefined && precioAnteriorRaw !== null && precioAnteriorRaw !== "") {
      const parsed = typeof precioAnteriorRaw === "number" ? precioAnteriorRaw : Number(precioAnteriorRaw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("El precio anterior debe ser un número mayor que 0.");
      }
      precioAnterior = parsed;
    }

    const producto = await this.productRepository.buscarProductoPorId(productId);
    if (!producto) {
      throw new Error("Producto no encontrado.");
    }

    if (!producto.esOfertaSemana) {
      if (producto.activo === false) {
        throw new Error("No se puede agregar a Ofertas de la semana un producto pausado.");
      }

      const todos = await this.productRepository.buscarTodosProductos();
      const activas = todos.filter((item) => item.esOfertaSemana).length;
      if (activas >= OFFERS_LIMIT) {
        throw new Error(
          `Ya hay ${OFFERS_LIMIT} productos en Ofertas de la semana. Quita uno antes de agregar otro.`
        );
      }
    }

    const actualizado = await this.productRepository.actualizarProducto(productId, {
      esOfertaSemana: true,
      ...(precioAnterior !== undefined ? { precioAnterior } : {})
    });

    return { producto: actualizado };
  }

  /**
   * Ofertas de la semana: quita es_oferta_semana de un producto y limpia
   * precioAnterior (Fase 7.4A, seccion 5, politica A: evita que un precio
   * tachado obsoleto reaparezca en otra pantalla -- ver
   * lib/product-card-metadata.ts hasVisiblePreviousPrice). Operacion
   * idempotente: sobre un producto que ya esta fuera de oferta solo asegura
   * que precioAnterior quede en null.
   */
  async desactivarOfertaSemana(productIdRaw: unknown) {
    if (typeof productIdRaw !== "string" || !productIdRaw.trim()) {
      throw new Error("Selecciona un producto para quitar de las ofertas.");
    }
    const productId = productIdRaw;

    const producto = await this.productRepository.buscarProductoPorId(productId);
    if (!producto) {
      throw new Error("Producto no encontrado.");
    }

    const actualizado = await this.productRepository.actualizarProducto(productId, {
      esOfertaSemana: false,
      precioAnterior: null
    });

    return { producto: actualizado };
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
  source?: "MANUAL" | "AUTOMATIC" | null;
  unitsSold?: number;
  revenue?: number;
};

export type BulkStockOperation =
  | { type: "sumar"; cantidad: number }
  | { type: "restar"; cantidad: number }
  | { type: "establecer"; valor: number }
  | { type: "activar" }
  | { type: "pausar" }
  | { type: "disponibleUno" }
  | { type: "agotar" };

/** Lista blanca de tipos de operacion masiva de stock; usada por la ruta API para rechazar acciones desconocidas. */
export const BULK_STOCK_OPERATION_TYPES = [
  "sumar",
  "restar",
  "establecer",
  "activar",
  "pausar",
  "disponibleUno",
  "agotar"
] as const;

export type BulkStockRowStatus = "CAMBIA" | "SIN_CAMBIOS" | "BLOQUEADO";

export type BulkStockPreviewRow = {
  id: string;
  sku: string;
  nombre: string;
  stockAnterior: number;
  stockNuevo: number;
  activoAnterior: boolean;
  activoNuevo: boolean;
  status: BulkStockRowStatus;
  /** Presente solo cuando status === "BLOQUEADO". */
  motivo?: string;
};

export type BulkStockPreview = {
  operation: BulkStockOperation;
  totalSeleccionados: number;
  productos: BulkStockPreviewRow[];
  erroresGlobales: string[];
};

export type BulkStockConfirmResult = {
  actualizados: number;
  sinCambios: number;
  bloqueados: number;
  total: number;
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

type BulkStockComputed =
  | { status: "CAMBIA"; stockNuevo: number; activoNuevo: boolean }
  | { status: "SIN_CAMBIOS"; stockNuevo: number; activoNuevo: boolean }
  | { status: "BLOQUEADO"; motivo: string };

/**
 * Calcula el resultado de una operacion masiva sobre UN producto, sin
 * escribir nada. Nunca deja el stock total por debajo del reservado.
 * "activar"/"pausar" (Fase 2B.9) NUNCA se bloquean por falta de stock: un
 * producto activo sin stock simplemente no aparece en el catalogo publico
 * (la familia solo se oculta si NINGUNA variante tiene stock, Fase 2B.8),
 * asi que activar en masa no debe exigir que cada producto ya tenga stock.
 * "disponibleUno"/"agotar" siempre derivan del stock reservado, por lo que
 * nunca pueden violar la regla de no bajar del reservado.
 */
function computeBulkStockResult(
  current: { stockActual?: number; stockReservado?: number; activo?: boolean },
  operation: BulkStockOperation
): BulkStockComputed {
  const stockActual = current.stockActual ?? 0;
  const stockReservado = current.stockReservado ?? 0;
  const activoActual = current.activo ?? true;

  if (operation.type === "sumar") {
    return { status: "CAMBIA", stockNuevo: stockActual + operation.cantidad, activoNuevo: activoActual };
  }

  if (operation.type === "restar") {
    const nuevo = stockActual - operation.cantidad;
    if (nuevo < 0 || nuevo < stockReservado) {
      return {
        status: "BLOQUEADO",
        motivo: `Restar dejaría el stock (${nuevo}) por debajo del reservado (${stockReservado}).`
      };
    }
    return { status: "CAMBIA", stockNuevo: nuevo, activoNuevo: activoActual };
  }

  if (operation.type === "establecer") {
    if (operation.valor < stockReservado) {
      return {
        status: "BLOQUEADO",
        motivo: `El valor (${operation.valor}) es menor que el stock reservado (${stockReservado}).`
      };
    }
    if (operation.valor === stockActual) {
      return { status: "SIN_CAMBIOS", stockNuevo: stockActual, activoNuevo: activoActual };
    }
    return { status: "CAMBIA", stockNuevo: operation.valor, activoNuevo: activoActual };
  }

  if (operation.type === "disponibleUno") {
    const nuevo = stockReservado + 1;
    if (nuevo === stockActual) return { status: "SIN_CAMBIOS", stockNuevo: stockActual, activoNuevo: activoActual };
    return { status: "CAMBIA", stockNuevo: nuevo, activoNuevo: activoActual };
  }

  if (operation.type === "agotar") {
    const nuevo = stockReservado;
    if (nuevo === stockActual) return { status: "SIN_CAMBIOS", stockNuevo: stockActual, activoNuevo: activoActual };
    return { status: "CAMBIA", stockNuevo: nuevo, activoNuevo: activoActual };
  }

  if (operation.type === "activar") {
    if (activoActual) return { status: "SIN_CAMBIOS", stockNuevo: stockActual, activoNuevo: true };
    return { status: "CAMBIA", stockNuevo: stockActual, activoNuevo: true };
  }

  // pausar
  if (!activoActual) return { status: "SIN_CAMBIOS", stockNuevo: stockActual, activoNuevo: false };
  return { status: "CAMBIA", stockNuevo: stockActual, activoNuevo: false };
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
  return new ProductoService(
    getProductRepository(),
    getTopProductsRankingRepository()
  );
}
