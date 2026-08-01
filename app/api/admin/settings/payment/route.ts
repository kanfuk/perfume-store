import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/admin-auth";
import type { BusinessPaymentSettingsFormInput } from "@/lib/businessPaymentSettings";
import { getBusinessPaymentSettingsCompleteness } from "@/lib/businessPaymentSettings";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { createBusinessSettingsService } from "@/services/businessSettingsService";

const PAYMENT_SETTINGS_FIELDS = new Set([
  "banco",
  "bancoOtro",
  "tipoCuenta",
  "tipoCuentaOtro",
  "titularCuenta",
  "rutTitular",
  "numeroCuenta",
  "correo"
]);

function noStoreJson(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "no-store" }
  });
}

/**
 * Configuracion de pago del negocio (business_settings). Solo admin
 * autenticado: nunca disponible sin sesion, nunca en un endpoint publico.
 * GET devuelve los datos completos para edicion (Cache-Control: no-store).
 */
export async function GET(request?: Request) {
  const admin = await getAuthenticatedAdmin();

  if (!admin) {
    return noStoreJson({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const service = createBusinessSettingsService();
    const { settings, completa } = await service.obtenerEstadoConfiguracionPago();

    if (request && new URL(request.url).searchParams.get("summary") === "1") {
      return noStoreJson({ completa, ...getBusinessPaymentSettingsCompleteness(settings) });
    }

    return noStoreJson({ settings, completa });
  } catch (error) {
    return noStoreJson(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible cargar la configuracion de pago."
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const admin = await getAuthenticatedAdmin();

  if (!admin) {
    return noStoreJson({ error: "No autorizado." }, { status: 401 });
  }

  const trustedOriginError = validateTrustedOrigin(request);

  if (trustedOriginError) {
    return trustedOriginError;
  }

  const jsonRequestError = validateJsonRequest(request);

  if (jsonRequestError) {
    return jsonRequestError;
  }

  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return noStoreJson({ error: "El cuerpo JSON no es valido." }, { status: 400 });
  }

  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return noStoreJson({ error: "El cuerpo debe ser un objeto JSON." }, { status: 400 });
  }

  const unknownFields = Object.keys(rawBody).filter(
    (key) => !PAYMENT_SETTINGS_FIELDS.has(key)
  );

  if (unknownFields.length > 0) {
    return noStoreJson(
      { error: `Campos no permitidos: ${unknownFields.join(", ")}.` },
      { status: 400 }
    );
  }

  try {
    const body = rawBody as Partial<BusinessPaymentSettingsFormInput>;

    // Lista blanca estricta: solo estos 8 campos se leen del body. Ninguna
    // otra clave de business_settings (costo_despacho_semanal, colores,
    // etc.) puede modificarse desde este endpoint.
    const input: BusinessPaymentSettingsFormInput = {
      banco: typeof body.banco === "string" ? body.banco : "",
      bancoOtro: typeof body.bancoOtro === "string" ? body.bancoOtro : "",
      tipoCuenta: typeof body.tipoCuenta === "string" ? body.tipoCuenta : "",
      tipoCuentaOtro: typeof body.tipoCuentaOtro === "string" ? body.tipoCuentaOtro : "",
      titularCuenta: typeof body.titularCuenta === "string" ? body.titularCuenta : "",
      rutTitular: typeof body.rutTitular === "string" ? body.rutTitular : "",
      numeroCuenta: typeof body.numeroCuenta === "string" ? body.numeroCuenta : "",
      correo: typeof body.correo === "string" ? body.correo : ""
    };

    const service = createBusinessSettingsService();
    const result = await service.guardarConfiguracionPago(input);

    if (!result.valid) {
      return noStoreJson({ errors: result.errors }, { status: 400 });
    }

    return noStoreJson({ settings: result.data, completa: true });
  } catch (error) {
    return noStoreJson(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible guardar la configuracion de pago."
      },
      { status: 500 }
    );
  }
}
