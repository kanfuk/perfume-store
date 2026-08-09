import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/admin-auth";
import type { MetodoDespacho } from "@/lib/constants";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { httpStatusForPerfumeOrderError } from "@/lib/perfumeOrderErrors";
import type { AdminOrderSummary, AdminOrdersAction } from "@/lib/types";
import { buildOrderPaymentConfirmedMessage } from "@/lib/whatsapp/buildOrderPaymentConfirmedMessage";
import { AdminPaymentAccountServiceError } from "@/services/adminPaymentAccountService";
import {
  AdminPaymentMessageServiceError,
  createAdminPaymentMessageService
} from "@/services/adminPaymentMessageService";
import { createPedidoService } from "@/services/pedidoService";
import { logAdminAction, requestAuditId } from "@/lib/admin-audit";

/** Estados donde "Coordinar entrega por WhatsApp" sigue teniendo sentido. */
const ESTADOS_CON_ENTREGA_COORDINABLE = new Set(["PAGADO", "PREPARANDO", "DESPACHADO"]);
const ORDER_ACTION_FIELDS = new Set([
  "action",
  "motivoCancelacion",
  "confirmarPagoPerdido",
  "monto",
  "metodoPago",
  "receiverAdminUserId"
]);

function buildPaymentConfirmedMessageForOrder(pedido: AdminOrderSummary) {
  return buildOrderPaymentConfirmedMessage({
    customerName: pedido.clienteNombre,
    codigo: pedido.codigo,
    total: pedido.total,
    metodoDespacho: pedido.metodoDespacho as MetodoDespacho | undefined,
    region: pedido.clienteRegion,
    comuna: pedido.clienteComuna,
    direccion: pedido.clienteDireccion
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ pedidoId: string }> }
) {
  const admin = await getAuthenticatedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
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
    return NextResponse.json({ error: "El cuerpo JSON no es valido." }, { status: 400 });
  }

  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return NextResponse.json(
      { error: "El cuerpo debe ser un objeto JSON." },
      { status: 400 }
    );
  }

  const unknownFields = Object.keys(rawBody).filter(
    (key) => !ORDER_ACTION_FIELDS.has(key)
  );

  if (unknownFields.length > 0) {
    return NextResponse.json(
      { error: `Campos no permitidos: ${unknownFields.join(", ")}.` },
      { status: 400 }
    );
  }

  try {
    const body = rawBody as {
      action?: AdminOrdersAction;
      motivoCancelacion?: string;
      confirmarPagoPerdido?: boolean;
      monto?: number;
      metodoPago?: string;
      receiverAdminUserId?: string;
    };
    if (
      body.receiverAdminUserId !== undefined &&
      (typeof body.receiverAdminUserId !== "string" || !body.receiverAdminUserId.trim())
    ) {
      return NextResponse.json(
        { error: "La cuenta receptora no es válida." },
        { status: 400 }
      );
    }
    if (
      body.receiverAdminUserId &&
      body.action !== "agendar" &&
      body.action !== "reenviar-transferencia"
    ) {
      return NextResponse.json(
        { error: "La cuenta receptora no corresponde a esta acción." },
        { status: 400 }
      );
    }
    const receiverAdminUserId = body.receiverAdminUserId?.trim();
    const { pedidoId } = await context.params;
    const pedidoService = createPedidoService();
    let whatsapp: { message: string } | undefined;
    let pedidoRespuesta: AdminOrderSummary | undefined;

    switch (body.action) {
      case "agendar": {
        // La identidad autenticada determina la cuenta. El OWNER debe
        // seleccionar explicitamente un ADMIN receptor; para ADMIN no se
        // acepta ninguna identidad bancaria enviada por el navegador.
        const paymentMessageService = createAdminPaymentMessageService();
        const paymentContext = await paymentMessageService.authorize({
          pedidoId,
          admin,
          receiverAdminUserId,
          action: "AGENDAR",
          preserveOriginalSnapshot: false
        });

        await pedidoService.agendarPedido(pedidoId);
        const pedido = await pedidoService.obtenerPedidoAdminPorId(pedidoId);
        pedidoRespuesta = pedido;
        whatsapp = {
          message: await paymentMessageService.recordAndBuild(pedido, paymentContext)
        };
        break;
      }
      case "reenviar-transferencia": {
        // Solo lectura: reabre el mismo mensaje de transferencia de un
        // pedido ya AGENDADO. No transiciona estado, no toca stock/reserva.
        const pedido = await pedidoService.obtenerPedidoAdminPorId(pedidoId);

        if (pedido.estadoPedido !== "AGENDADO") {
          return NextResponse.json(
            { error: "Este pedido no esta agendado." },
            { status: 409 }
          );
        }

        const paymentMessageService = createAdminPaymentMessageService();
        const paymentContext = await paymentMessageService.authorize({
          pedidoId,
          admin,
          receiverAdminUserId,
          action: "REENVIAR_TRANSFERENCIA",
          preserveOriginalSnapshot: true
        });

        pedidoRespuesta = pedido;
        whatsapp = {
          message: await paymentMessageService.recordAndBuild(pedido, paymentContext)
        };
        break;
      }
      case "coordinar-entrega": {
        // Solo lectura: reconstruye el mensaje de coordinacion de entrega de
        // un pedido ya pagado. No muta estado, pago, stock ni reserva.
        const pedido = await pedidoService.obtenerPedidoAdminPorId(pedidoId);

        if (!ESTADOS_CON_ENTREGA_COORDINABLE.has(pedido.estadoPedido)) {
          return NextResponse.json(
            { error: "Este pedido no admite coordinar entrega en su estado actual." },
            { status: 409 }
          );
        }

        pedidoRespuesta = pedido;
        whatsapp = { message: buildPaymentConfirmedMessageForOrder(pedido) };
        break;
      }
      case "cancelar": {
        const motivoCancelacion = body.motivoCancelacion?.trim();

        if (!motivoCancelacion) {
          return NextResponse.json(
            { error: "Debes ingresar un motivo de cancelacion." },
            { status: 400 }
          );
        }

        await pedidoService.cancelarPedido(
          pedidoId,
          motivoCancelacion,
          { confirmarPagoPerdido: body.confirmarPagoPerdido }
        );
        pedidoRespuesta = await pedidoService.obtenerPedidoAdminPorId(pedidoId);
        break;
      }
      case "pagado": {
        await pedidoService.marcarPedidoPagado(pedidoId, body.metodoPago || "TRANSFERENCIA");
        const pedido = await pedidoService.obtenerPedidoAdminPorId(pedidoId);
        pedidoRespuesta = pedido;
        whatsapp = { message: buildPaymentConfirmedMessageForOrder(pedido) };
        break;
      }
      case "preparando":
        await pedidoService.iniciarPreparacionPedido(pedidoId);
        break;
      case "despachado":
        await pedidoService.despacharPedido(pedidoId);
        break;
      case "entregado":
        await pedidoService.entregarPedido(pedidoId);
        break;
      case "abonar":
        await pedidoService.registrarAbonoFiado(
          pedidoId,
          body.monto ?? 0,
          body.metodoPago || "EFECTIVO"
        );
        break;
      case "visto":
        await pedidoService.marcarPedidoVisto(pedidoId);
        break;
      default:
        return NextResponse.json(
          { error: "Accion admin no soportada." },
          { status: 400 }
        );
    }

    if (body.action !== "reenviar-transferencia" && body.action !== "coordinar-entrega") {
      const after = pedidoRespuesta ?? await pedidoService.obtenerPedidoAdminPorId(pedidoId);
      await logAdminAction({ actor: admin, action: body.action === "pagado" ? "PAYMENT_CONFIRMED" : "ORDER_UPDATED", entityType: "order", entityId: pedidoId, requestId: requestAuditId(request), after, metadata: { operation: body.action } });
    }
    return NextResponse.json({ ok: true, pedido: pedidoRespuesta, whatsapp });
  } catch (error) {
    if (error instanceof AdminPaymentAccountServiceError) {
      const adminAccountProblem =
        error.code === "ACCOUNT_REQUIRED" || error.code === "ACCOUNT_INACTIVE";
      return NextResponse.json(
        {
          error: adminAccountProblem
            ? admin.rol === "ADMIN"
              ? "No tienes una cuenta de cobro configurada. Solicita al OWNER que la configure."
              : "La cuenta receptora seleccionada no está activa y completa."
            : "La cuenta receptora debe pertenecer a un ADMIN activo.",
          code: adminAccountProblem ? "PAYMENT_ACCOUNT_REQUIRED" : "PAYMENT_RECEIVER_INVALID"
        },
        { status: adminAccountProblem ? 422 : 403 }
      );
    }

    if (error instanceof AdminPaymentMessageServiceError) {
      const responseByCode = {
        RECEIVER_REQUIRED: {
          error: "Selecciona explícitamente una cuenta receptora.",
          code: "PAYMENT_RECEIVER_REQUIRED",
          status: 422
        },
        RECEIVER_NOT_ALLOWED: {
          error: "Un ADMIN solo puede utilizar su propia cuenta de cobro.",
          code: "PAYMENT_RECEIVER_FORBIDDEN",
          status: 403
        },
        ORIGINAL_RECEIVER_MISMATCH: {
          error: "Este pedido fue comunicado con otra cuenta receptora. Selecciona la cuenta original.",
          code: "PAYMENT_RECEIVER_MISMATCH",
          status: 409
        },
        INVALID_AUDIT: {
          error: "El registro histórico de cobro no es válido.",
          code: "PAYMENT_AUDIT_INVALID",
          status: 500
        },
        AUDIT_FAILED: {
          error: "No fue posible registrar la trazabilidad del mensaje de pago.",
          code: "PAYMENT_AUDIT_FAILED",
          status: 500
        }
      }[error.code];
      return NextResponse.json(
        { error: responseByCode.error, code: responseByCode.code },
        { status: responseByCode.status }
      );
    }

    // Los errores de mark_perfume_order_paid_v1 / cancel_perfume_order_v1 /
    // advance_perfume_order_status_v1 ya llegan aqui traducidos a espanol y
    // sin detalles internos de PostgreSQL (ver
    // repositories/pedidoRepository.ts + lib/perfumeOrderErrors.ts).
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible actualizar el pedido."
      },
      { status: httpStatusForPerfumeOrderError(error) }
    );
  }
}
