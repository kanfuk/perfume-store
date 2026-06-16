import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { createPedidoService } from "@/services/pedidoService";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ pedidoId: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      action?: "agendar" | "cancelar" | "pagado" | "fiado" | "abonar";
      fechaEntrega?: string;
      motivoCancelacion?: string;
      monto?: number;
      metodoPago?: string;
    };
    const { pedidoId } = await context.params;
    const pedidoService = createPedidoService();

    switch (body.action) {
      case "agendar":
        await pedidoService.agendarPedido(pedidoId, body.fechaEntrega ?? "");
        break;
      case "cancelar":
        await pedidoService.cancelarPedido(
          pedidoId,
          body.motivoCancelacion || "Cancelado por administrador"
        );
        break;
      case "pagado":
        await pedidoService.marcarPedidoPagado(pedidoId);
        break;
      case "fiado":
        await pedidoService.marcarPedidoFiado(pedidoId);
        break;
      case "abonar":
        await pedidoService.registrarAbonoFiado(
          pedidoId,
          body.monto ?? 0,
          body.metodoPago || "EFECTIVO"
        );
        break;
      default:
        return NextResponse.json(
          { error: "Accion admin no soportada." },
          { status: 400 }
        );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible actualizar el pedido."
      },
      { status: 400 }
    );
  }
}
