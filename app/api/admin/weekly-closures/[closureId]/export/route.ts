/**
 * Proyecto: Perfume Store
 * Modulo: API de Cierres Semanales (Fase 7.6A)
 * Descripcion: Exportacion CSV de un cierre semanal puntual. El motivo de
 * reapertura completo NUNCA se incluye en el archivo (solo un indicador
 * booleano) -- ver lib/weekly-closures/csv.ts.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

import { isAdminAuthenticated } from "@/lib/admin-auth";
import { WeeklyClosureError, httpStatusForWeeklyClosureError } from "@/lib/weeklyClosureErrors";
import { createCierreSemanalService } from "@/services/cierreSemanalService";

type RouteContext = {
  params: Promise<{ closureId: string }>;
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0"
};

export async function GET(_request: Request, context: RouteContext) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "No autorizado." }, { status: 401, headers: NO_STORE_HEADERS });
  }

  try {
    const { closureId } = await context.params;
    const service = createCierreSemanalService();
    const { filename, content } = await service.exportarCsv(closureId);

    return new Response(content, {
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    if (error instanceof WeeklyClosureError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: httpStatusForWeeklyClosureError(error), headers: NO_STORE_HEADERS }
      );
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "No fue posible exportar el cierre semanal." },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
}
