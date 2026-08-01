import crypto from "node:crypto";
import type { ProductoProps } from "@/domain/Producto";
import { runQualityReview } from "@/lib/catalog-import/quality-review";
import { parseSupplierCsv } from "@/lib/catalog-import/supplier-import";
import { analyzeImageAssistantCatalog, attachSafeCandidates, scoreSafeImageCandidate } from "@/lib/image-assistant/classification";
import { downloadSafeImage, SafeImageDownloadError } from "@/lib/image-assistant/safe-download";
import {
  BraveImageSearchProvider,
  getImageAssistantHealth,
  getSafeImageAllowedDomains,
  isSafeImageSearchConfigured,
  searchSafeImageCandidates,
  verifySafeImageCandidate
} from "@/lib/image-assistant/source-provider";
import type { ImageSearchProvider } from "@/lib/image-assistant/source-provider";
import type { ImageAssistantAnalysis, ImageAssistantDryRunEntry, ImageAssistantItem, SafeImageCandidate } from "@/lib/image-assistant/types";
import { getImageAssistantAttemptRepository, type ImageAssistantAttemptRepository } from "@/repositories/imageAssistantAttemptRepository";
import { getProductRepository, type ProductRepository } from "@/repositories/productRepository";
import { createProductImageService, ProductImageService } from "@/services/productImageService";
import { processProductImage } from "@/lib/product-image-processing";

export function normalizeSourceUrl(sourceUrl: string): string {
  const url = new URL(sourceUrl);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  const sorted = [...url.searchParams.entries()].sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv));
  url.search = "";
  for (const [key, value] of sorted) url.searchParams.append(key, value);
  return url.toString();
}

function toExistingReviewProduct(product: ProductoProps) {
  return {
    productId: product.id,
    sku: product.sku ?? "",
    marca: product.marca ?? "",
    nombre: product.nombre,
    contenido: product.contenido ?? "",
    costoUnitario: product.costoUnitario ?? 0,
    precioVenta: product.precioVenta,
    modoPrecio: product.modoPrecio === "MANUAL" ? "MANUAL" as const : "AUTO" as const
  };
}

export class ImageAssistantService {
  constructor(
    private readonly productRepository: ProductRepository = getProductRepository(),
    private readonly productImageService: ProductImageService = createProductImageService(),
    private readonly attemptRepository: ImageAssistantAttemptRepository = getImageAssistantAttemptRepository(),
    private readonly searchProvider: ImageSearchProvider = new BraveImageSearchProvider()
  ) {}

  async analyze(buffer: Buffer): Promise<ImageAssistantAnalysis> {
    const parsed = parseSupplierCsv(buffer);
    if (parsed.globalErrors.length > 0) throw new Error(parsed.globalErrors.join(" "));
    const products = await this.productRepository.buscarTodosProductos();
    const review = runQualityReview(
      parsed.rows,
      products.filter((product) => Boolean(product.sku)).map(toExistingReviewProduct),
      { filasFisicas: parsed.filasFisicas, filasVacias: parsed.filasVacias }
    );
    return analyzeImageAssistantCatalog({
      products,
      supplierRows: parsed.rows,
      findings: review.findings,
      searchAvailable: isSafeImageSearchConfigured()
    });
  }

  async search(productId: string, buffer: Buffer): Promise<ImageAssistantItem> {
    const analysis = await this.analyze(buffer);
    const item = analysis.items.find((candidate) => candidate.productId === productId);
    if (!item) throw new Error("No se encontró el producto en el análisis actual.");
    if (!isSafeImageSearchConfigured()) throw new Error("La búsqueda de imágenes no está configurada o habilitada.");
    if (item.status !== "SIN_FUENTE_SEGURA" && item.status !== "PROVEEDOR_NO_CONFIGURADO") return item;
    const candidates = await searchSafeImageCandidates(item, this.searchProvider);
    return attachSafeCandidates(item, candidates, getSafeImageAllowedDomains());
  }

  async process(productId: string, buffer: Buffer, candidate: SafeImageCandidate) {
    const health = getImageAssistantHealth();
    if (!health.batchEnabled) {
      throw new Error("La carga automática de imágenes está deshabilitada.");
    }
    const analysis = await this.analyze(buffer);
    if (!analysis.reconciliationApproved) {
      throw new Error("La reconciliación todavía no tiene aprobación manual para cargas.");
    }
    if (!analysis.batchAllowedByAuditReconciliation) {
      throw new Error("El lote está detenido: la conciliación de revisión difiere en más de cinco productos.");
    }
    const item = analysis.items.find((entry) => entry.productId === productId);
    if (!item || !["SIN_FUENTE_SEGURA", "PROVEEDOR_NO_CONFIGURADO"].includes(item.status)) {
      throw new Error("El producto ya no cumple los criterios de identidad segura.");
    }
    if (!verifySafeImageCandidate(candidate)) {
      throw new Error("El candidato de imagen no tiene una firma válida.");
    }
    const allowedDomains = getSafeImageAllowedDomains();
    const scored = scoreSafeImageCandidate(item, candidate, allowedDomains);
    if (scored.score < 95 || scored.contradiction) {
      throw new Error("El candidato ya no alcanza el criterio AUTO_SEGURO.");
    }

    const normalizedSourceUrl = normalizeSourceUrl(candidate.sourceUrl);
    await this.attemptRepository.start({
      productId,
      sourceUrl: candidate.sourceUrl,
      normalizedSourceUrl,
      sourceDomain: candidate.sourceDomain,
      score: scored.score,
      reasons: scored.reasons
    });
    try {
      const downloaded = await downloadSafeImage(candidate.sourceUrl, allowedDomains);
      if (await this.attemptRepository.isHashAlreadyApplied(downloaded.sha256, productId)) {
        throw new Error("La misma imagen ya fue aplicada a otro producto.");
      }
      const image = await this.productImageService.asignarImagenProductoSiAusente(productId, downloaded.buffer);
      await this.attemptRepository.markApplied(normalizedSourceUrl, productId, downloaded.sha256);
      return {
        image,
        source: {
          domain: downloaded.sourceDomain,
          url: downloaded.finalUrl,
          date: new Date().toISOString(),
          score: scored.score,
          reasons: scored.reasons,
          sha256: downloaded.sha256
        }
      };
    } catch (error) {
      const code = error instanceof SafeImageDownloadError ? error.code : "PROCESSING_FAILED";
      await this.attemptRepository.markError(normalizedSourceUrl, productId, code).catch(() => {});
      throw error;
    }
  }

  async preview(productId: string, buffer: Buffer, candidate: SafeImageCandidate) {
    if (!isSafeImageSearchConfigured()) {
      throw new Error("La búsqueda de imágenes no está configurada o habilitada.");
    }
    const analysis = await this.analyze(buffer);
    const item = analysis.items.find((entry) => entry.productId === productId);
    if (!item || !["SIN_FUENTE_SEGURA", "PROVEEDOR_NO_CONFIGURADO"].includes(item.status) || !verifySafeImageCandidate(candidate)) {
      throw new Error("El candidato no es válido para vista previa.");
    }
    const allowedDomains = getSafeImageAllowedDomains();
    const scored = scoreSafeImageCandidate(item, candidate, allowedDomains);
    if (scored.score < 95 || scored.contradiction) throw new Error("El candidato no es seguro.");
    const downloaded = await downloadSafeImage(candidate.sourceUrl, allowedDomains);
    return processProductImage(downloaded.buffer);
  }

  async dryRun(buffer: Buffer): Promise<{ analysis: ImageAssistantAnalysis; entries: ImageAssistantDryRunEntry[] }> {
    if (!isSafeImageSearchConfigured()) {
      throw new Error("El dry-run requiere proveedor, firma, allowlist y búsqueda habilitados.");
    }
    const analysis = await this.analyze(buffer);
    const allowedDomains = getSafeImageAllowedDomains();
    const searchable = analysis.items.filter((item) => item.status === "PROVEEDOR_NO_CONFIGURADO" || item.status === "SIN_FUENTE_SEGURA");
    const entries: ImageAssistantDryRunEntry[] = [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < searchable.length) {
        const item = searchable[cursor++];
        const candidates = await searchSafeImageCandidates(item, this.searchProvider);
        const scored = candidates.map((candidate) => ({ candidate, ...scoreSafeImageCandidate(item, candidate, allowedDomains) }));
        const ranked = scored.sort((left, right) => right.score - left.score);
        const top = ranked[0];
        const recommended = ranked.find((result) => !result.contradiction);
        const classified = attachSafeCandidates(item, candidates, allowedDomains);
        entries.push({
          productId: item.productId,
          status: classified.status,
          score: top?.score,
          domain: top?.candidate.sourceDomain,
          reasons: classified.reasons,
          contradictions: scored.some((result) => result.contradiction),
          candidateCount: candidates.length,
          recommendedCandidate: recommended ? {
            sourcePageUrl: recommended.candidate.sourcePageUrl,
            sourceUrl: recommended.candidate.sourceUrl,
            sourceDomain: recommended.candidate.sourceDomain,
            score: recommended.score
          } : undefined
        });
      }
    };
    await Promise.all([worker(), worker()]);
    return { analysis, entries };
  }
}

export function createImageAssistantService() {
  return new ImageAssistantService();
}

export function computeCsvFingerprint(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
