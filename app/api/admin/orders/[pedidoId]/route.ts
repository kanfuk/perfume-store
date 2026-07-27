import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { httpStatusForPerfumeOrderError } from "@/lib/perfumeOrderErrors";
import type { AdminOrdersAction } from "@/lib/types";
import { createPedidoService } from "@/services/pedidoService";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ pedidoId: string }> }
) {
  if (!(await isAdminAuthenticated())) {
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

  try {
    const body = (await request.json()) as {
      action?: AdminOrdersAction;
      motivoCancelacion?: string;
      confirmarPagoPerdido?: boolean;
      monto?: number;
      metodoPago?: string;
    };
    const { pedidoId } = await context.params;
    const pedidoService = createPedidoService();

    switch (body.action) {
      case "agendar":
        await pedidoService.agendarPedido(pedidoId);
        break;
      case "cancelar":
        await pedidoService.cancelarPedido(
          pedidoId,
          body.motivoCancelacion || "Cancelado por administrador",
          { confirmarPagoPerdido: body.confirmarPagoPerdido }
        );
        break;
      case "pagado":
        await pedidoService.marcarPedidoPagado(pedidoId, body.metodoPago || "TRANSFERENCIA");
        break;
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

    return NextResponse.json({ ok: true });
  } catch (error) {
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
