import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthenticatedAdmin, isAdminAuthenticated } from "@/lib/admin-auth";
import { logAdminAction, requestAuditId } from "@/lib/admin-audit";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { createProductoService } from "@/services/productoService";
import { parseCsvLines, detectEncoding, decodeBuffer, detectDelimiter } from "@/lib/catalog-import/index.ts";
import { detectImportProfile } from "@/lib/catalog-import/supplier-import.ts";
import type { QualityDecision, QualityFinding } from "@/lib/catalog-import/quality-review.ts";

const MAX_BASE64_LENGTH = 3 * 1024 * 1024; // ~2.2 MiB de archivo original

type ImportProfileParam = "auto" | "proveedor" | "canonico";
type ImportAction = "preview" | "quality-review" | "final-plan" | "confirm";

type ImportRequestBody = {
  action?: ImportAction;
  fileName?: string;
  fileBase64?: string;
  profile?: ImportProfileParam;
  markupPercentage?: number;
  previewHash?: string;
  reviewHash?: string;
  decisions?: QualityDecision[];
  /**
   * V2.2.1: SKUs de productos ARCHIVADOS que el admin decidio explicitamente
   * reactivar durante esta confirmacion (ver seccion 16 del encargo). Sin
   * esto, un SKU archivado que reaparece en el CSV se omite por completo.
   */
  reactivarSkus?: string[];
  /**
   * A6: SKUs con nombre protegido (`nombreBloqueado`) que el admin decidio
   * explicitamente reemplazar por el nombre del CSV en esta confirmacion.
   * Sin esto, un SKU con nombre bloqueado conserva su nombre actual aunque
   * el CSV traiga uno distinto (ver docs/SMELLME_SAFE_PRODUCT_RENAME_DESIGN.md).
   */
  overrideNombreSkus?: string[];
};

function computePreviewHash(buffer: Buffer, profile: string, markupPercentage: unknown): string {
  const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
  const percentagePart = markupPercentage === undefined || markupPercentage === null ? "" : String(markupPercentage);
  return crypto.createHash("sha256").update(`${fileHash}:${profile}:${percentagePart}`).digest("hex");
}

/**
 * Huella del conjunto de hallazgos que el usuario revisó. Ata las decisiones
 * recibidas en `confirm` a la MISMA revision (mismos hallazgos, mismo
 * previewHash) que se le mostro al admin en `quality-review`. Si el archivo,
 * el recargo o los hallazgos cambiaron entre medio, la huella no coincide y
 * se exige una vista previa/revision nueva (409).
 */
function computeReviewHash(previewHash: string, findings: QualityFinding[]): string {
  const skeleton = findings
    .map((f) => ({ id: f.id, type: f.type, severity: f.severity }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return crypto.createHash("sha256").update(`${previewHash}:${JSON.stringify(skeleton)}`).digest("hex");
}

function resolveProfile(buffer: Buffer, requested: ImportProfileParam | undefined): "proveedor" | "canonico" | null {
  if (requested === "proveedor" || requested === "canonico") return requested;

  const encoding = detectEncoding(buffer);
  const text = decodeBuffer(buffer, encoding);
  const delimiter = detectDelimiter(text);
  const matrix = parseCsvLines(text, delimiter);
  if (matrix.length === 0) return null;

  return detectImportProfile(matrix[0]);
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const admin = await getAuthenticatedAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const trustedOriginError = validateTrustedOrigin(request);
  if (trustedOriginError) return trustedOriginError;

  const jsonRequestError = validateJsonRequest(request);
  if (jsonRequestError) return jsonRequestError;

  try {
    const body = (await request.json()) as ImportRequestBody;
    const action: ImportAction =
      body.action === "confirm"
        ? "confirm"
        : body.action === "final-plan"
          ? "final-plan"
          : body.action === "quality-review"
            ? "quality-review"
            : "preview";
    const fileName = typeof body.fileName === "string" ? body.fileName : "";
    const fileBase64 = typeof body.fileBase64 === "string" ? body.fileBase64 : "";
    const requestedProfile: ImportProfileParam | undefined =
      body.profile === "proveedor" || body.profile === "canonico" ? body.profile : "auto";
    const markupPercentage = body.markupPercentage;
    const reactivarSkus = Array.isArray(body.reactivarSkus)
      ? body.reactivarSkus.filter((sku): sku is string => typeof sku === "string")
      : [];
    const overrideNombreSkus = Array.isArray(body.overrideNombreSkus)
      ? body.overrideNombreSkus.filter((sku): sku is string => typeof sku === "string")
      : [];

    if (!fileName || !fileBase64) {
      return NextResponse.json({ error: "Falta el archivo a importar." }, { status: 400 });
    }

    if (fileBase64.length > MAX_BASE64_LENGTH) {
      return NextResponse.json({ error: "El archivo supera el tamaño máximo permitido." }, { status: 413 });
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(fileBase64, "base64");
    } catch {
      return NextResponse.json({ error: "El archivo no pudo ser leído." }, { status: 400 });
    }

    const profile = resolveProfile(buffer, requestedProfile === "auto" ? undefined : requestedProfile);

    if (!profile) {
      return NextResponse.json(
        {
          error:
            "No se pudo detectar un perfil de importación válido para este archivo. Selecciona manualmente 'CSV de proveedor' o 'Catálogo canónico'."
        },
        { status: 400 }
      );
    }

    const productoService = createProductoService();

    if (profile === "proveedor") {
      const requestedMarkup = markupPercentage ?? 35;
      const previewHash = computePreviewHash(buffer, "proveedor", requestedMarkup);

      if (action === "preview") {
        const preview = await productoService.previsualizarImportacionProveedor(
          buffer,
          fileName,
          buffer.length,
          requestedMarkup
        );
        return NextResponse.json({ perfil: "proveedor", previewHash, preview });
      }

      // Tanto "quality-review" como "confirm" exigen que el archivo/recargo
      // sigan siendo los mismos que en la vista previa mostrada al admin.
      if (body.previewHash !== previewHash) {
        return NextResponse.json(
          {
            error:
              "El archivo o el porcentaje de recargo cambiaron respecto a la vista previa. Genera una vista previa nueva antes de continuar."
          },
          { status: 409 }
        );
      }

      const review = await productoService.revisarCalidadImportacionProveedor(buffer);
      const reviewHash = computeReviewHash(previewHash, review.findings);

      if (action === "quality-review") {
        return NextResponse.json({
          perfil: "proveedor",
          previewHash,
          reviewHash,
          findings: review.findings,
          summary: review.summary
        });
      }

      // action === "final-plan" | "confirm": revalidar TODO desde cero. Nunca
      // se confia en filas excluidas, nombres, marcas, costos, cotejos o SKU
      // finales enviados por el navegador; solo se aceptan `decisions`
      // (auditable) y se reconstruye el plan completo en el servidor.
      if (body.reviewHash !== reviewHash) {
        return NextResponse.json(
          {
            error: "El archivo o la revisión cambió. Genera una nueva vista previa antes de importar."
          },
          { status: 409 }
        );
      }

      const decisions = Array.isArray(body.decisions) ? body.decisions : [];
      const findingIds = new Set(review.findings.map((f) => f.id));
      const decisionWithUnknownFinding = decisions.find((d) => !findingIds.has(d.findingId));
      if (decisionWithUnknownFinding) {
        return NextResponse.json(
          { error: "El archivo o la revisión cambió. Genera una nueva vista previa antes de importar." },
          { status: 409 }
        );
      }

      const existingProducts = await productoService.obtenerProductosParaRevisionCalidad();
      const existingIds = new Set(existingProducts.map((p) => p.productId));
      const decisionWithMissingProduct = decisions.find(
        (d) => d.optionId === "UPDATE_EXISTING" && d.targetProductId && !existingIds.has(d.targetProductId)
      );
      if (decisionWithMissingProduct) {
        return NextResponse.json(
          {
            error: "El producto existente seleccionado ya no existe. Genera una nueva vista previa antes de importar."
          },
          { status: 409 }
        );
      }

      const markup = typeof requestedMarkup === "number" ? requestedMarkup : Number(requestedMarkup);
      const { applied } = await productoService.construirPlanConDecisiones(buffer, markup, decisions);

      if (applied.unresolvedBlockers.length > 0 || applied.errors.length > 0) {
        return NextResponse.json(
          {
            error: "No se puede confirmar: hay conflictos bloqueantes sin resolver en la revisión de calidad.",
            unresolvedBlockers: applied.unresolvedBlockers,
            detalles: applied.errors
          },
          { status: 400 }
        );
      }

      if (applied.plan.length === 0) {
        return NextResponse.json({ error: "No hay filas válidas para importar." }, { status: 400 });
      }

      if (action === "final-plan") {
        return NextResponse.json({ perfil: "proveedor", previewHash, reviewHash, plan: applied.plan });
      }

      const finalPlan = applied.plan.map((row) => ({
        rowNumber: row.rowNumbers[0],
        sku: row.sku,
        nombre: row.nombre,
        marca: row.marca,
        contenido: row.contenido,
        costoUnitario: row.costoUnitario,
        precioVentaCsv: row.precioVentaCsv,
        precioVentaSugerido: row.precioVentaSugerido,
        precioVentaFinal: row.precioVentaFinal,
        modoPrecio: row.modoPrecio,
        action: row.action
      }));

      const result = await productoService.confirmarImportacionProveedor(finalPlan, reactivarSkus, overrideNombreSkus);
      await logAdminAction({ actor: admin, action: "CATALOG_IMPORT", entityType: "catalog", requestId: requestAuditId(request), after: { profile: "proveedor", ...result }, metadata: { fileName, rows: finalPlan.length } });
      for (const productId of result.reactivados ?? []) {
        await logAdminAction({ actor: admin, action: "PRODUCT_REACTIVATED", entityType: "product", entityId: productId, requestId: requestAuditId(request), metadata: { via: "catalog-import", profile: "proveedor" } });
      }
      for (const productId of result.nombresReemplazados ?? []) {
        await logAdminAction({ actor: admin, action: "PRODUCT_NAME_UPDATED", entityType: "product", entityId: productId, requestId: requestAuditId(request), metadata: { via: "catalog-import", profile: "proveedor" } });
      }
      return NextResponse.json({ ok: true, ...result, perfil: "proveedor", plan: applied.plan });
    }

    // perfil canonico (sin asistente de calidad: formato tecnico ya validado por columnas)
    const preview = await productoService.previsualizarImportacionCsv(buffer, fileName, buffer.length);
    const previewHash = computePreviewHash(buffer, "canonico", "");

    if (action === "preview") {
      return NextResponse.json({ perfil: "canonico", previewHash, preview });
    }

    if (body.previewHash !== previewHash) {
      return NextResponse.json(
        {
          error: "El archivo cambió respecto a la vista previa. Genera una vista previa nueva antes de confirmar."
        },
        { status: 409 }
      );
    }

    if (preview.erroresGlobales.length > 0) {
      return NextResponse.json(
        { error: "No se puede confirmar: hay errores globales pendientes.", preview },
        { status: 400 }
      );
    }

    if (preview.filasValidas.length === 0) {
      return NextResponse.json({ error: "No hay filas válidas para importar.", preview }, { status: 400 });
    }

    const result = await productoService.confirmarImportacionCsv(preview.filasValidas, reactivarSkus, overrideNombreSkus);
    await logAdminAction({ actor: admin, action: "CATALOG_IMPORT", entityType: "catalog", requestId: requestAuditId(request), after: { profile: "canonico", ...result }, metadata: { fileName, rows: preview.filasValidas.length } });
    for (const productId of result.reactivados ?? []) {
      await logAdminAction({ actor: admin, action: "PRODUCT_REACTIVATED", entityType: "product", entityId: productId, requestId: requestAuditId(request), metadata: { via: "catalog-import", profile: "canonico" } });
    }
    for (const productId of result.nombresReemplazados ?? []) {
      await logAdminAction({ actor: admin, action: "PRODUCT_NAME_UPDATED", entityType: "product", entityId: productId, requestId: requestAuditId(request), metadata: { via: "catalog-import", profile: "canonico" } });
    }
    return NextResponse.json({ ok: true, ...result, perfil: "canonico", preview });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible procesar la importación."
      },
      { status: 400 }
    );
  }
}
